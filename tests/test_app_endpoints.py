"""End-to-end checks over the real ASGI app: CORS, the WebSocket handshake
guard, and the config the frontend bootstraps from."""

import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.config import DEFAULT_F0_METHOD
from backend.main import app


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    """A client whose lifespan uses throwaway model/preset storage."""
    from backend.config import settings

    tmp = tmp_path_factory.mktemp("ovc")
    original = (settings.MODELS_DIR, settings.PRESETS_PATH)
    settings.MODELS_DIR = str(tmp / "models")
    settings.PRESETS_PATH = str(tmp / "presets.json")
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        settings.MODELS_DIR, settings.PRESETS_PATH = original


class TestHealthAndConfig:
    def test_health(self, client):
        assert client.get("/health").json() == {"status": "ok"}

    def test_config_advertises_the_suggested_stream_defaults(self, client):
        body = client.get("/api/config").json()
        assert body["sample_rate"] > 0
        assert body["chunk_size"] > 0
        assert body["silence_saver"] is True
        assert -80 <= body["silence_threshold_db"] <= -20
        assert "runtime" in body


class TestCors:
    def test_allows_a_configured_origin(self, client):
        response = client.get("/health", headers={"Origin": "http://localhost:5173"})
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_does_not_echo_an_unlisted_origin(self, client):
        response = client.get("/health", headers={"Origin": "https://evil.example"})
        assert response.headers.get("access-control-allow-origin") is None

    def test_no_wildcard_is_ever_returned(self, client):
        response = client.get("/health", headers={"Origin": "http://localhost:5173"})
        assert response.headers.get("access-control-allow-origin") != "*"

    def test_preflight_from_an_unlisted_origin_is_not_approved(self, client):
        response = client.options(
            "/api/models/",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.headers.get("access-control-allow-origin") is None


class TestWebSocketOriginGuard:
    def test_accepts_a_connection_with_no_origin_header(self, client):
        # Non-browser clients (and this test client) send no Origin.
        with client.websocket_connect("/ws/audio") as ws:
            ws.send_text('{"sample_rate": 48000, "chunk_size": 4096}')

    def test_accepts_a_configured_origin(self, client):
        with client.websocket_connect(
            "/ws/audio", headers={"Origin": "http://localhost:5173"}
        ) as ws:
            ws.send_text('{"sample_rate": 48000, "chunk_size": 4096}')

    @pytest.mark.parametrize(
        "origin",
        ["https://evil.example", "http://evil.example:8000", "null"],
    )
    def test_rejects_a_cross_site_origin(self, client, origin):
        # Browsers do not apply the same-origin policy to WebSockets, so this
        # guard is what stops a hostile page opening the user's audio stream.
        from starlette.websockets import WebSocketDisconnect

        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/audio", headers={"Origin": origin}) as ws:
                ws.send_text('{"sample_rate": 48000, "chunk_size": 4096}')
                ws.receive()


class TestBypassOverTheWire:
    """The bypass flag survives the real JSON settings -> binary frame path."""

    @staticmethod
    def _frame(samples, seq=0):
        import struct

        return struct.pack("<II", seq, 0) + samples.astype(np.float32).tobytes()

    @staticmethod
    def _decode(payload):
        return np.frombuffer(payload[8:], dtype=np.float32)

    def test_bypass_returns_the_input_while_conversion_alters_it(self, client):
        tone = (0.4 * np.sin(2 * np.pi * 220.0 * np.arange(2048) / 48000)).astype(np.float32)

        with client.websocket_connect("/ws/audio") as ws:
            # No model is active, so pitch runs through the DSP shifter.
            ws.send_text(json.dumps({
                "sample_rate": 48000,
                "chunk_size": 2048,
                "pitch_shift": 7.0,
            }))

            ws.send_bytes(self._frame(tone, seq=1))
            converted = self._decode(ws.receive()["bytes"])
            assert not np.array_equal(converted, tone), "DSP pitch shift should alter the signal"

            ws.send_text(json.dumps({"type": "settings", "bypass": True}))
            ws.send_bytes(self._frame(tone, seq=2))
            bypassed = self._decode(ws.receive()["bytes"])
            np.testing.assert_array_equal(bypassed, tone)

            # ...and turning it back off restores conversion on the same stream.
            ws.send_text(json.dumps({"type": "settings", "bypass": False}))
            ws.send_bytes(self._frame(tone, seq=3))
            reconverted = self._decode(ws.receive()["bytes"])
            assert not np.array_equal(reconverted, tone)

    def test_effects_are_skipped_while_bypassed(self, client):
        tone = np.full(2048, 0.2, dtype=np.float32)

        with client.websocket_connect("/ws/audio") as ws:
            ws.send_text(json.dumps({
                "sample_rate": 48000,
                "chunk_size": 2048,
                "bypass": True,
                "effects": {"gain": {"enabled": True, "db": 12.0}},
            }))

            ws.send_bytes(self._frame(tone))
            np.testing.assert_array_equal(self._decode(ws.receive()["bytes"]), tone)

    def test_a_client_that_never_sends_bypass_is_unaffected(self, client):
        """Backward compatibility with clients predating this release."""
        tone = np.full(1024, 0.2, dtype=np.float32)

        with client.websocket_connect("/ws/audio") as ws:
            ws.send_text(json.dumps({"sample_rate": 48000, "chunk_size": 1024}))
            ws.send_text(json.dumps({
                "type": "settings",
                "effects": {"gain": {"enabled": True, "db": 6.0}},
            }))
            ws.send_bytes(self._frame(tone))

            out = self._decode(ws.receive()["bytes"])
            # Gain is applied, i.e. the stream converted normally.
            assert np.max(np.abs(out)) > 0.3

    def test_client_reported_sample_rate_is_honoured(self, client):
        """The browser's actual AudioContext rate drives server-side processing."""
        with client.websocket_connect("/ws/audio") as ws:
            ws.send_text(json.dumps({"sample_rate": 48000, "chunk_size": 1024}))
            ws.send_bytes(self._frame(np.zeros(1024, dtype=np.float32)))
            assert "bytes" in ws.receive()

            # A rate change mid-stream (reconnect, device switch) is accepted.
            ws.send_text(json.dumps({"type": "settings", "sample_rate": 44100}))
            ws.send_bytes(self._frame(np.zeros(1024, dtype=np.float32), seq=2))
            assert "bytes" in ws.receive()

    @pytest.mark.parametrize("sample_rate", [7999, 192001])
    def test_out_of_range_sample_rates_are_rejected(self, client, sample_rate):
        # Rejected after the handshake, so the client sees a close frame with
        # 1003 rather than a failed connect (unlike the origin guard, which
        # refuses before accepting).
        with client.websocket_connect("/ws/audio") as ws:
            ws.send_text(json.dumps({"sample_rate": sample_rate, "chunk_size": 1024}))
            message = ws.receive()

        assert message["type"] == "websocket.close"
        assert message["code"] == 1003

    @pytest.mark.parametrize("chunk_size", [127, 65537])
    def test_out_of_range_chunk_sizes_are_rejected(self, client, chunk_size):
        with client.websocket_connect("/ws/audio") as ws:
            ws.send_text(json.dumps({"sample_rate": 48000, "chunk_size": chunk_size}))
            message = ws.receive()

        assert message["type"] == "websocket.close"
        assert message["code"] == 1003


class TestConvertDefaults:
    def test_offline_converter_shares_the_live_f0_default(self):
        """Live and offline paths must not disagree on the default method."""
        import inspect

        from backend.routers.convert import convert_file

        default = inspect.signature(convert_file).parameters["f0_method"].default
        assert default.default == DEFAULT_F0_METHOD

    def test_websocket_connection_state_uses_the_same_default(self):
        import inspect

        from backend.routers import websocket as ws_module

        source = inspect.getsource(ws_module.audio_websocket)
        assert '"f0_method": DEFAULT_F0_METHOD' in source

    def test_model_manager_falls_back_to_the_same_default(self):
        import inspect

        from backend.services.model_manager import ModelManager

        source = inspect.getsource(ModelManager.process_audio)
        assert 'settings.get("f0_method", DEFAULT_F0_METHOD)' in source
