"""Offline whole-file rendering must not run through the streaming context.

Before this was split out, `_render` handed the entire decoded file to
`RvcProcessor.process`, which trimmed it to `RVC_STREAM_CONTEXT_SECONDS`
(0.14 s) of tail context and then front-padded the 0.14 s result back up to the
original length. A three-minute file came back as ~three minutes of silence
with a fragment at the very end.
"""

import threading

import numpy as np
import pytest

from backend.config import settings
from backend.services.rvc_processor import RvcProcessor

SAMPLE_RATE = 48000


class FakePipeline:
    """Records what the RVC pipeline was actually asked to infer over."""

    def __init__(self, target_sample_rate=40000):
        self.seen_lengths = []
        self.seen_args = []
        self._target_sample_rate = target_sample_rate

    # Trailing positional layout after (hubert, net_g, sid, audio, key, times):
    #   0 pitch, 1 method, 2 index_path, 3 index_rate, 4 if_f0,
    #   5 filter_radius, 6 target_sr, 7 resample_sr, 8 rms_mix_rate,
    #   9 version, 10 protect
    RESAMPLE_SR = 7

    def pipeline(self, _hubert, _net_g, _sid, audio_16k, _key, _times, *args):
        self.seen_lengths.append(len(audio_16k))
        self.seen_args.append(args)
        # The real pipeline resamples its output to resample_sr.
        resample_sr = args[self.RESAMPLE_SR] or self._target_sample_rate
        out_len = max(1, int(round(len(audio_16k) * resample_sr / 16000)))
        # A constant non-silent signal makes "did the audio survive" measurable.
        return np.full(out_len, 8000, dtype=np.int16)


def make_processor(pipeline=None, context_seconds=None):
    """An RvcProcessor wired to a fake pipeline — no torch, no checkpoint."""
    seconds = settings.RVC_STREAM_CONTEXT_SECONDS if context_seconds is None else context_seconds

    p = object.__new__(RvcProcessor)
    p._lock = threading.Lock()
    p._stream_states = {}
    p._context_samples_16k = max(0, int(round(seconds * 16000)))
    p._index_rate = 0.75
    p._filter_radius = 3
    p._rms_mix_rate = 0.25
    p._protect = 0.33
    p._call_counter = 0
    p._pipeline = pipeline or FakePipeline()
    p._pipeline_module = type("M", (), {"input_audio_path2wav": {}})()
    p._hubert_model = object()
    p._net_g = object()
    p._index_path = None
    p._speaker_id = 0
    p._if_f0 = 1
    p._version = "v2"
    p._target_sample_rate = 40000
    p._fcpe_supported = False
    from pathlib import Path

    p._rmvpe_root = Path("models/assets/rmvpe")
    return p


@pytest.fixture
def tone():
    t = np.arange(10 * SAMPLE_RATE, dtype=np.float32) / SAMPLE_RATE
    return (0.5 * np.sin(2 * np.pi * 220.0 * t)).astype(np.float32)


class TestOfflineFullFileInference:
    def test_the_whole_file_reaches_the_pipeline(self, tone):
        """Regression: inference used to see only 0.14 s of a 10 s file."""
        pipe = FakePipeline()
        processor = make_processor(pipe)

        processor.process(tone, sample_rate=SAMPLE_RATE, use_stream_context=False)

        expected_16k = int(round(len(tone) * 16000 / SAMPLE_RATE))
        assert pipe.seen_lengths == [expected_16k]
        # Guards against silently reverting to the context window.
        assert pipe.seen_lengths[0] > processor._context_samples_16k * 10

    def test_output_length_matches_the_input(self, tone):
        out = make_processor().process(tone, sample_rate=SAMPLE_RATE, use_stream_context=False)
        assert len(out) == len(tone)
        assert out.dtype == np.float32

    def test_output_is_anchored_to_the_start_not_padded_in_front(self, tone):
        """Regression: the render used to begin with ~9.86 s of silence."""
        out = make_processor().process(tone, sample_rate=SAMPLE_RATE, use_stream_context=False)

        head = out[: len(out) // 10]
        first_90 = out[: int(len(out) * 0.9)]
        assert np.sqrt(np.mean(head**2)) > 0.01, "render must start where the source starts"
        assert np.sqrt(np.mean(first_90**2)) > 0.01
        assert np.count_nonzero(out) > len(out) * 0.9

    def test_short_output_pads_at_the_end(self):
        class ShortPipeline(FakePipeline):
            def pipeline(self, *args, **kwargs):
                super().pipeline(*args, **kwargs)
                return np.full(1000, 8000, dtype=np.int16)

        audio = np.ones(4000, dtype=np.float32)
        out = make_processor(ShortPipeline()).process(
            audio, sample_rate=SAMPLE_RATE, use_stream_context=False
        )

        assert len(out) == 4000
        assert out[0] != 0.0, "leading audio must be preserved"
        assert out[-1] == 0.0, "the shortfall belongs at the end"

    def test_offline_leaves_no_per_stream_state_behind(self, tone):
        processor = make_processor()
        processor.process(
            tone, sample_rate=SAMPLE_RATE, stream_id="__convert__", use_stream_context=False
        )
        assert processor._stream_states == {}

    def test_repeated_renders_do_not_accumulate_context(self, tone):
        pipe = FakePipeline()
        processor = make_processor(pipe)

        for _ in range(3):
            processor.process(
                tone, sample_rate=SAMPLE_RATE, stream_id="__convert__", use_stream_context=False
            )

        assert len(set(pipe.seen_lengths)) == 1, "each render must be independent"


class TestStreamingPathUnchanged:
    def test_streaming_window_is_capped_by_the_context_setting(self):
        pipe = FakePipeline()
        processor = make_processor(pipe)
        chunk = np.ones(4096, dtype=np.float32)
        chunk_16k = int(round(len(chunk) * 16000 / SAMPLE_RATE))

        # The window starts as just the chunk and grows until it hits the cap.
        for _ in range(6):
            processor.process(chunk, sample_rate=SAMPLE_RATE, stream_id="s1")

        assert pipe.seen_lengths[0] == chunk_16k
        assert max(pipe.seen_lengths) == processor._context_samples_16k
        assert all(n <= processor._context_samples_16k for n in pipe.seen_lengths)

    def test_streaming_accumulates_context_across_chunks(self):
        pipe = FakePipeline()
        processor = make_processor(pipe, context_seconds=1.0)
        chunk = np.ones(4096, dtype=np.float32)

        processor.process(chunk, sample_rate=SAMPLE_RATE, stream_id="s1")
        first = pipe.seen_lengths[0]
        processor.process(chunk, sample_rate=SAMPLE_RATE, stream_id="s1")
        second = pipe.seen_lengths[1]

        assert second > first, "the window must grow until it reaches the cap"

    def test_streaming_output_stays_chunk_aligned(self):
        chunk = np.ones(4096, dtype=np.float32)
        out = make_processor().process(chunk, sample_rate=SAMPLE_RATE, stream_id="s1")
        assert len(out) == len(chunk)

    def test_streaming_keeps_state_per_stream(self):
        processor = make_processor()
        chunk = np.ones(4096, dtype=np.float32)

        processor.process(chunk, sample_rate=SAMPLE_RATE, stream_id="a")
        processor.process(chunk, sample_rate=SAMPLE_RATE, stream_id="b")

        assert set(processor._stream_states) == {"a", "b"}
        processor.release_stream("a")
        assert set(processor._stream_states) == {"b"}

    def test_streaming_defaults_to_true(self):
        """Existing callers that omit the flag keep the realtime behaviour."""
        pipe = FakePipeline()
        processor = make_processor(pipe)
        long_input = np.ones(10 * SAMPLE_RATE, dtype=np.float32)

        processor.process(long_input, sample_rate=SAMPLE_RATE, stream_id="s")

        # Without the flag a long buffer is still clipped to the context window.
        assert pipe.seen_lengths[0] == processor._context_samples_16k
        assert processor._stream_states, "streaming mode keeps per-stream state"


class TestLengthAlignmentHelpers:
    def test_tail_alignment_pads_in_front(self):
        out = RvcProcessor._tail_to_length(np.array([1, 2], dtype=np.float32), 4)
        np.testing.assert_array_equal(out, [0, 0, 1, 2])

    def test_tail_alignment_keeps_the_end(self):
        out = RvcProcessor._tail_to_length(np.array([1, 2, 3, 4], dtype=np.float32), 2)
        np.testing.assert_array_equal(out, [3, 4])

    def test_head_alignment_pads_at_the_end(self):
        out = RvcProcessor._head_to_length(np.array([1, 2], dtype=np.float32), 4)
        np.testing.assert_array_equal(out, [1, 2, 0, 0])

    def test_head_alignment_keeps_the_start(self):
        out = RvcProcessor._head_to_length(np.array([1, 2, 3, 4], dtype=np.float32), 2)
        np.testing.assert_array_equal(out, [1, 2])

    @pytest.mark.parametrize("fn", [RvcProcessor._tail_to_length, RvcProcessor._head_to_length])
    def test_exact_length_and_empty_target(self, fn):
        exact = np.array([1, 2, 3], dtype=np.float32)
        np.testing.assert_array_equal(fn(exact, 3), exact)
        assert len(fn(exact, 0)) == 0


class RecordingManager:
    """Captures the settings dict `_render` builds for the model."""

    def __init__(self):
        self.settings = None
        self.released = []

    def get_active_model(self):
        return {"name": "fake.pth", "type": "rvc"}

    def process_audio(self, audio, settings):
        self.settings = dict(settings)
        return audio

    def release_stream(self, stream_id):
        self.released.append(stream_id)


class TestRenderWiring:
    """convert._render must ask for an offline render and forward every knob."""

    def _render(self, **kwargs):
        from backend.routers.convert import _render

        manager = RecordingManager()
        audio = np.ones(2048, dtype=np.float32)
        params = {
            "pitch_shift": 2.0,
            "formant_shift": 0.0,
            "f0_method": "pm",
            "effects": {},
        }
        params.update(kwargs)
        _render(audio, SAMPLE_RATE, manager, True, **params)
        return manager

    def test_render_requests_the_offline_path(self):
        manager = self._render()
        assert manager.settings["use_stream_context"] is False

    def test_render_forwards_the_advanced_controls(self):
        manager = self._render(
            index_rate=0.4, filter_radius=5, rms_mix_rate=0.8, protect=0.2
        )
        assert manager.settings["index_rate"] == pytest.approx(0.4)
        assert manager.settings["filter_radius"] == 5
        assert manager.settings["rms_mix_rate"] == pytest.approx(0.8)
        assert manager.settings["protect"] == pytest.approx(0.2)

    def test_omitted_controls_stay_none_for_server_defaults(self):
        manager = self._render()
        for field in ("index_rate", "filter_radius", "rms_mix_rate", "protect"):
            assert manager.settings[field] is None

    def test_render_still_releases_the_convert_stream(self):
        manager = self._render()
        assert manager.released == ["__convert__"]

    def test_render_keeps_passing_pitch_and_f0(self):
        manager = self._render(pitch_shift=3.5, f0_method="rmvpe")
        assert manager.settings["pitch_shift"] == pytest.approx(3.5)
        assert manager.settings["f0_method"] == "rmvpe"
        assert manager.settings["sample_rate"] == SAMPLE_RATE


class TestConvertEndpointForm:
    """The multipart form must carry the advanced controls into _render."""

    def test_form_parameters_exist_with_none_defaults(self):
        import inspect

        from backend.routers.convert import convert_file

        params = inspect.signature(convert_file).parameters
        for field in ("index_rate", "filter_radius", "rms_mix_rate", "protect"):
            assert field in params, f"{field} is not accepted by the convert endpoint"
            assert params[field].default.default is None

    def test_render_signature_accepts_them(self):
        import inspect

        from backend.routers.convert import _render

        params = inspect.signature(_render).parameters
        for field in ("index_rate", "filter_radius", "rms_mix_rate", "protect"):
            assert field in params


class TestAdvancedSettingsReachThePipeline:
    """index_rate / filter_radius / rms_mix_rate / protect must not be dropped."""

    # Positional layout of RvcProcessor's pipeline() call after the first six
    # fixed arguments: pitch, method, index_path, index_rate, if_f0,
    # filter_radius, target_sr, resample_sr, rms_mix_rate, version, protect.
    INDEX_RATE = 3
    FILTER_RADIUS = 5
    RMS_MIX_RATE = 8
    PROTECT = 10

    def test_explicit_values_are_forwarded(self):
        pipe = FakePipeline()
        processor = make_processor(pipe)
        processor._index_path = "voice.index"

        processor.process(
            np.ones(4096, dtype=np.float32),
            sample_rate=SAMPLE_RATE,
            index_rate=0.4,
            filter_radius=5,
            rms_mix_rate=0.8,
            protect=0.2,
            use_stream_context=False,
        )

        args = pipe.seen_args[0]
        assert args[self.INDEX_RATE] == pytest.approx(0.4)
        assert args[self.FILTER_RADIUS] == 5
        assert args[self.RMS_MIX_RATE] == pytest.approx(0.8)
        assert args[self.PROTECT] == pytest.approx(0.2)

    def test_none_falls_back_to_configured_defaults(self):
        pipe = FakePipeline()
        processor = make_processor(pipe)
        processor._index_path = "voice.index"

        processor.process(
            np.ones(4096, dtype=np.float32), sample_rate=SAMPLE_RATE, use_stream_context=False
        )

        args = pipe.seen_args[0]
        assert args[self.INDEX_RATE] == pytest.approx(processor._index_rate)
        assert args[self.FILTER_RADIUS] == processor._filter_radius
        assert args[self.RMS_MIX_RATE] == pytest.approx(processor._rms_mix_rate)
        assert args[self.PROTECT] == pytest.approx(processor._protect)

    def test_values_are_clamped(self):
        pipe = FakePipeline()
        processor = make_processor(pipe)
        processor._index_path = "voice.index"

        processor.process(
            np.ones(4096, dtype=np.float32),
            sample_rate=SAMPLE_RATE,
            index_rate=5.0,
            filter_radius=-2,
            protect=9.0,
            use_stream_context=False,
        )

        args = pipe.seen_args[0]
        assert args[self.INDEX_RATE] == pytest.approx(1.0)
        assert args[self.FILTER_RADIUS] == 0
        assert args[self.PROTECT] == pytest.approx(0.5)
