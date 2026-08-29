"""Bypass semantics for the realtime audio path.

Bypass must be a *full* conversion bypass, distinct from clearing the effect
rack: no noise gate, no model, no pitch, no formant, no effects — while the
transport keeps running so the client still hears itself.
"""

import asyncio
import json

import numpy as np
import pytest

from backend.config import DEFAULT_F0_METHOD
from backend.routers.websocket import (
    _apply_settings,
    _get_chain,
    _handle_json_message,
    _process_frame_sync,
    _receive_config,
)
from backend.services.dsp_effects import EffectsChain

SAMPLE_RATE = 40000


class FakeModelManager:
    """Stands in for a loaded model: inverts the signal so its effect is obvious."""

    def __init__(self, active=True):
        self.active = active
        self.calls = 0

    def process_audio(self, audio, settings):
        self.calls += 1
        if not self.active:
            raise RuntimeError("No model is currently active")
        return -audio

    def get_active_model(self):
        return {"name": "fake.pth", "type": "rvc"} if self.active else None


def make_state(**overrides):
    state = {
        "stream_id": "test",
        "sample_rate": SAMPLE_RATE,
        "chunk_size": 4096,
        "pitch_shift": 0.0,
        "formant_shift": 0.0,
        "f0_method": DEFAULT_F0_METHOD,
        "index_rate": None,
        "filter_radius": None,
        "rms_mix_rate": None,
        "protect": None,
        "effects": {},
        "bypass": False,
        "chain": None,
    }
    state.update(overrides)
    _get_chain(state)
    return state


@pytest.fixture
def audio():
    t = np.arange(1024, dtype=np.float32) / SAMPLE_RATE
    return (0.4 * np.sin(2 * np.pi * 220.0 * t)).astype(np.float32)


LOUD_EFFECTS = {
    "gate": {"enabled": True, "threshold": -10.0},
    "distortion": {"enabled": True, "drive": 0.9},
    "reverb": {"enabled": True, "size": 0.9, "mix": 0.9},
    "gain": {"enabled": True, "db": 12.0},
}


class TestBypassSemantics:
    def test_returns_the_input_untouched(self, audio):
        state = make_state(bypass=True)
        out, mode, model_ms, dsp_ms = _process_frame_sync(audio, FakeModelManager(), state)

        np.testing.assert_array_equal(out, audio)
        assert mode == "bypass"
        assert model_ms == 0.0
        assert dsp_ms == 0.0

    def test_skips_the_model_entirely(self, audio):
        manager = FakeModelManager()
        state = make_state(bypass=True)

        out, _, _, _ = _process_frame_sync(audio, manager, state)

        assert manager.calls == 0
        np.testing.assert_array_equal(out, audio)

    def test_skips_pitch_formant_and_the_whole_effect_rack(self, audio):
        # Every conversion knob turned up: bypass must still return raw input.
        state = make_state(
            bypass=True,
            pitch_shift=7.0,
            formant_shift=5.0,
            effects=dict(LOUD_EFFECTS),
        )

        out, mode, _, _ = _process_frame_sync(audio, FakeModelManager(active=False), state)

        np.testing.assert_array_equal(out, audio)
        assert mode == "bypass"

    def test_is_not_the_same_as_an_empty_effect_rack(self, audio):
        """Clearing effects still runs the model; bypass does not."""
        manager = FakeModelManager()
        cleared = make_state(bypass=False, effects={})

        converted, mode, _, _ = _process_frame_sync(audio, manager, cleared)

        assert manager.calls == 1
        assert mode == "rvc"
        np.testing.assert_allclose(converted, -audio, atol=1e-6)
        assert not np.array_equal(converted, audio)

    def test_toggling_bypass_off_restores_conversion(self, audio):
        manager = FakeModelManager()
        state = make_state(bypass=True)

        first, _, _, _ = _process_frame_sync(audio, manager, state)
        np.testing.assert_array_equal(first, audio)
        assert manager.calls == 0

        state["bypass"] = False
        second, mode, _, _ = _process_frame_sync(audio, manager, state)

        assert manager.calls == 1
        assert mode == "rvc"
        np.testing.assert_allclose(second, -audio, atol=1e-6)

    def test_preserves_dtype_and_length(self, audio):
        out, _, _, _ = _process_frame_sync(audio, FakeModelManager(), make_state(bypass=True))
        assert out.dtype == np.float32
        assert len(out) == len(audio)

    def test_bypass_without_a_model_is_still_raw_input(self, audio):
        # In DSP mode the pitch shifter would normally run; bypass skips it.
        state = make_state(bypass=True, pitch_shift=12.0)
        out, mode, _, _ = _process_frame_sync(audio, FakeModelManager(active=False), state)
        np.testing.assert_array_equal(out, audio)
        assert mode == "bypass"

    def test_dsp_mode_without_bypass_does_shift_pitch(self, audio):
        state = make_state(bypass=False, pitch_shift=12.0)
        out, mode, _, _ = _process_frame_sync(audio, FakeModelManager(active=False), state)
        assert mode == "dsp"
        assert not np.array_equal(out, audio)


class TestApplySettings:
    def test_parses_the_bypass_flag(self):
        state = make_state()

        _apply_settings({"bypass": True}, state)
        assert state["bypass"] is True

        _apply_settings({"bypass": False}, state)
        assert state["bypass"] is False

    def test_bypass_is_off_unless_requested(self):
        assert make_state()["bypass"] is False

    def test_omitting_bypass_leaves_it_unchanged(self):
        """Backward compatibility: an older client never sends the field."""
        state = make_state(bypass=True)
        _apply_settings({"pitch_shift": 3.0}, state)
        assert state["bypass"] is True
        assert state["pitch_shift"] == 3.0

    def test_coerces_truthy_payloads(self):
        state = make_state()
        _apply_settings({"bypass": 1}, state)
        assert state["bypass"] is True

    def test_filter_radius_travels_over_the_existing_protocol(self):
        state = make_state()
        _apply_settings({"filter_radius": 5}, state)
        assert state["filter_radius"] == 5

    def test_filter_radius_null_is_ignored(self):
        state = make_state(filter_radius=3)
        _apply_settings({"filter_radius": None}, state)
        assert state["filter_radius"] == 3

    def test_invalid_values_do_not_corrupt_state(self):
        state = make_state(pitch_shift=2.0)
        _apply_settings({"pitch_shift": "not-a-number"}, state)
        assert state["pitch_shift"] == 2.0


class TestChainRebuild:
    def test_chain_is_rebuilt_when_the_client_reports_a_different_rate(self):
        """The browser's real AudioContext rate drives the DSP chain."""
        state = make_state()
        first = state["chain"]
        assert isinstance(first, EffectsChain)
        assert first.sr == SAMPLE_RATE

        state["sample_rate"] = 48000
        second = _get_chain(state)

        assert second is not first
        assert second.sr == 48000

    def test_chain_is_reused_for_an_unchanged_rate(self):
        state = make_state()
        assert _get_chain(state) is state["chain"]


class FakeConfigWebSocket:
    def __init__(self, payload):
        self.payload = payload
        self.closed = None

    async def receive_text(self):
        return self.payload

    async def close(self, code, reason):
        self.closed = (code, reason)


class TestTransportSettings:
    def test_live_updates_accept_only_values_inside_protocol_bounds(self):
        state = make_state()

        _handle_json_message(
            json.dumps({"sample_rate": 48000, "chunk_size": 2048}),
            state,
        )
        assert state["sample_rate"] == 48000
        assert state["chunk_size"] == 2048

        _handle_json_message(
            json.dumps({"sample_rate": 1, "chunk_size": 1000000}),
            state,
        )
        assert state["sample_rate"] == 48000
        assert state["chunk_size"] == 2048

    def test_live_updates_ignore_non_numeric_and_non_object_payloads(self):
        state = make_state()

        _handle_json_message('{"sample_rate": "nope"}', state)
        _handle_json_message('[48000, 2048]', state)

        assert state["sample_rate"] == SAMPLE_RATE
        assert state["chunk_size"] == 4096

    def test_initial_config_rejects_invalid_types_without_crashing(self):
        state = make_state()
        websocket = FakeConfigWebSocket('{"sample_rate": "nope"}')

        result = asyncio.run(_receive_config(websocket, state))

        assert result is None
        assert websocket.closed == (1003, "sample_rate must be 8000–192000")

    def test_initial_config_must_be_an_object(self):
        state = make_state()
        websocket = FakeConfigWebSocket('[48000, 4096]')

        result = asyncio.run(_receive_config(websocket, state))

        assert result is None
        assert websocket.closed == (1003, "Config must be a JSON object")
