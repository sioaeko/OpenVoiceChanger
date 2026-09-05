"""Silence Saver behavior and telemetry for the realtime model path."""

import asyncio

import numpy as np

from backend.config import DEFAULT_F0_METHOD
from backend.routers.websocket import (
    DEFAULT_SILENCE_THRESHOLD_DB,
    _apply_settings,
    _get_chain,
    _process_frame_sync,
    _send_status,
)


SAMPLE_RATE = 40000
CHUNK_SIZE = 1024


class FakeModelManager:
    def __init__(self, active=True):
        self.active = active
        self.calls = 0
        self.released = []

    def get_active_model(self):
        return {"name": "voice.pth", "type": "rvc"} if self.active else None

    def process_audio(self, audio, settings):
        self.calls += 1
        if not self.active:
            raise RuntimeError("No model is currently active")
        return -audio

    def release_stream(self, stream_id):
        self.released.append(stream_id)


class FakeStatusWebSocket:
    def __init__(self):
        self.messages = []

    async def send_json(self, payload):
        self.messages.append(payload)


def make_state(**overrides):
    state = {
        "stream_id": "silence-test",
        "sample_rate": SAMPLE_RATE,
        "chunk_size": CHUNK_SIZE,
        "pitch_shift": 0.0,
        "formant_shift": 0.0,
        "f0_method": DEFAULT_F0_METHOD,
        "index_rate": None,
        "filter_radius": None,
        "rms_mix_rate": None,
        "protect": None,
        "effects": {},
        "bypass": False,
        "silence_saver": True,
        "silence_threshold_db": DEFAULT_SILENCE_THRESHOLD_DB,
        "silence_ms": 0.0,
        "inference_sleeping": False,
        "sleep_stream_released": False,
        "status_model_eligible_frames": 0,
        "status_model_inference_frames": 0,
        "chain": None,
        "latency_ms": 12.0,
        "model_ms": 8.0,
        "dsp_ms": 2.0,
        "mode": "rvc",
    }
    state.update(overrides)
    _get_chain(state)
    return state


def test_sustained_silence_skips_model_after_hold_and_releases_context_once():
    manager = FakeModelManager()
    state = make_state()
    quiet = np.zeros(CHUNK_SIZE, dtype=np.float32)

    for _ in range(7):
        _process_frame_sync(quiet, manager, state)

    assert manager.calls == 7
    assert state["inference_sleeping"] is False

    output, mode, model_ms, _ = _process_frame_sync(quiet, manager, state)
    np.testing.assert_array_equal(output, quiet)
    assert mode == "rvc"
    assert model_ms == 0.0
    assert manager.calls == 7
    assert manager.released == ["silence-test"]
    assert state["inference_sleeping"] is True

    _process_frame_sync(quiet, manager, state)
    assert manager.calls == 7
    assert manager.released == ["silence-test"]


def test_voice_resumes_model_inference_on_the_first_loud_chunk():
    manager = FakeModelManager()
    state = make_state(silence_ms=200.0, inference_sleeping=True, sleep_stream_released=True)
    loud = np.full(CHUNK_SIZE, 0.1, dtype=np.float32)

    output, mode, _, _ = _process_frame_sync(loud, manager, state)

    np.testing.assert_allclose(output, -loud, atol=1e-6)
    assert mode == "rvc"
    assert manager.calls == 1
    assert state["silence_ms"] == 0.0
    assert state["inference_sleeping"] is False
    assert state["sleep_stream_released"] is False


def test_disabled_saver_never_skips_quiet_model_frames():
    manager = FakeModelManager()
    state = make_state(silence_saver=False)
    quiet = np.zeros(CHUNK_SIZE, dtype=np.float32)

    for _ in range(12):
        _process_frame_sync(quiet, manager, state)

    assert manager.calls == 12
    assert manager.released == []
    assert state["inference_sleeping"] is False


def test_no_active_model_keeps_the_existing_dsp_path():
    manager = FakeModelManager(active=False)
    state = make_state(pitch_shift=12.0)
    tone = np.sin(np.arange(CHUNK_SIZE, dtype=np.float32) * 0.1).astype(np.float32)

    output, mode, _, _ = _process_frame_sync(tone, manager, state)

    assert mode == "dsp"
    assert manager.calls == 0
    assert manager.released == []
    assert state["inference_sleeping"] is False
    assert not np.array_equal(output, tone)


def test_settings_are_bounded_and_disabling_resets_sleep_state():
    state = make_state(silence_ms=200.0, inference_sleeping=True, sleep_stream_released=True)

    _apply_settings({"silence_threshold_db": -60, "silence_saver": False}, state)
    assert state["silence_threshold_db"] == -60.0
    assert state["silence_saver"] is False
    assert state["silence_ms"] == 0.0
    assert state["inference_sleeping"] is False

    _apply_settings({"silence_threshold_db": -120, "silence_saver": "false"}, state)
    assert state["silence_threshold_db"] == -60.0
    assert state["silence_saver"] is False


def test_status_reports_sleep_and_interval_inference_duty():
    manager = FakeModelManager()
    websocket = FakeStatusWebSocket()
    state = make_state(
        inference_sleeping=True,
        status_model_eligible_frames=10,
        status_model_inference_frames=4,
    )

    asyncio.run(_send_status(websocket, manager, state))

    status = websocket.messages[0]
    assert status["silence_saver"] is True
    assert status["silence_threshold_db"] == DEFAULT_SILENCE_THRESHOLD_DB
    assert status["inference_sleeping"] is True
    assert status["inference_duty_percent"] == 40.0
    assert state["status_model_eligible_frames"] == 0
    assert state["status_model_inference_frames"] == 0
