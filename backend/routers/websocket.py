import asyncio
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.config import DEFAULT_F0_METHOD, settings
from backend.security import is_origin_allowed
from backend.services.audio_processor import audio_to_bytes, bytes_to_audio
from backend.services.dsp_effects import EffectsChain

logger = logging.getLogger(__name__)

router = APIRouter()

# How often to send latency status messages (seconds)
STATUS_INTERVAL = 1.0
MIN_SAMPLE_RATE = 8000
MAX_SAMPLE_RATE = 192000
MIN_CHUNK_SIZE = 128
MAX_CHUNK_SIZE = 65536


def _bounded_int(value, minimum: int, maximum: int) -> int | None:
    """Return an integer inside the protocol range, or ``None`` if invalid."""
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return parsed if minimum <= parsed <= maximum else None


@router.websocket("/ws/audio")
async def audio_websocket(websocket: WebSocket) -> None:
    """Real-time audio processing WebSocket endpoint.

    Protocol:
        1. Client connects, server accepts.
        2. Client sends a JSON config message: {"sample_rate": int, "chunk_size": int, ...}.
        3. Client sends binary frames (audio) or JSON frames (settings updates).
        4. Server processes binary frames through the active model (or the DSP
           passthrough chain when no model is loaded) plus the effect rack, and
           sends back binary responses. The response header's second uint32
           carries the server processing time in hundredths of a millisecond.
        5. Server periodically sends JSON status messages with a timing breakdown.

    Cross-site WebSocket hijacking is blocked before the handshake completes:
    browsers do not apply the same-origin policy to WebSocket connections, so
    the Origin header is validated here the same way CORS validates it for HTTP.
    """
    origin = websocket.headers.get("origin")
    if not is_origin_allowed(
        origin,
        websocket.headers.get("host"),
        settings.CORS_ORIGINS,
        settings.ALLOW_ANY_ORIGIN,
    ):
        logger.warning("Rejected WebSocket handshake from origin %r", origin)
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    await websocket.accept()
    client_id = id(websocket)
    logger.info("WebSocket connected: %s", client_id)

    model_manager = getattr(websocket.app.state, "model_manager", None)
    if model_manager is None:
        await websocket.close(code=1011, reason="Model manager not available")
        return

    # Connection-local state
    conn_state: dict = {
        "stream_id": str(client_id),
        "sample_rate": 40000,
        "chunk_size": 4096,
        "pitch_shift": 0.0,
        "formant_shift": 0.0,
        "f0_method": DEFAULT_F0_METHOD,
        "index_rate": None,
        "filter_radius": None,
        "rms_mix_rate": None,
        "protect": None,
        "effects": {},
        # Full conversion bypass for A/B monitoring: routing stays live, the
        # signal returns untouched. Distinct from clearing the effect rack.
        "bypass": False,
        "chain": None,
        "configured": False,
        "last_status_time": time.perf_counter(),
        "latency_ms": 0.0,
        "model_ms": 0.0,
        "dsp_ms": 0.0,
        "mode": "dsp",
    }

    try:
        # Wait for initial JSON config message
        config = await _receive_config(websocket, conn_state)
        if config is None:
            return

        logger.info("WebSocket %s configured: sr=%d, chunk=%d",
                     client_id, conn_state["sample_rate"], conn_state["chunk_size"])

        # Main message loop
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"]:
                await _handle_binary_frame(websocket, message["bytes"], model_manager, conn_state)

                # Send periodic status updates
                now = time.perf_counter()
                if now - conn_state["last_status_time"] >= STATUS_INTERVAL:
                    await _send_status(websocket, model_manager, conn_state)
                    conn_state["last_status_time"] = now

            elif "text" in message and message["text"]:
                _handle_json_message(message["text"], conn_state)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", client_id)
    except RuntimeError as exc:
        if "disconnect" in str(exc).lower():
            logger.info("WebSocket disconnected: %s", client_id)
        else:
            logger.error("WebSocket error (%s): %s", client_id, exc)
    except Exception as exc:
        logger.error("WebSocket error (%s): %s", client_id, exc, exc_info=True)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except Exception:
            pass
    finally:
        await asyncio.to_thread(model_manager.release_stream, conn_state["stream_id"])


def _get_chain(conn_state: dict) -> EffectsChain:
    """Return the connection's DSP chain, (re)building it on sample-rate change."""
    chain = conn_state.get("chain")
    sample_rate = int(conn_state["sample_rate"])
    if chain is None or chain.sr != sample_rate:
        chain = EffectsChain(sample_rate)
        conn_state["chain"] = chain
    return chain


async def _receive_config(websocket: WebSocket, conn_state: dict) -> dict | None:
    """Wait for and parse the initial JSON configuration message."""
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
    except asyncio.TimeoutError:
        logger.warning("WebSocket config timeout — closing")
        await websocket.close(code=1008, reason="Config timeout")
        return None
    except Exception:
        return None

    try:
        config = json.loads(raw)
    except json.JSONDecodeError:
        await websocket.close(code=1003, reason="Invalid JSON config")
        return None

    if not isinstance(config, dict):
        await websocket.close(code=1003, reason="Config must be a JSON object")
        return None

    sample_rate = _bounded_int(
        config.get("sample_rate", conn_state["sample_rate"]),
        MIN_SAMPLE_RATE,
        MAX_SAMPLE_RATE,
    )
    chunk_size = _bounded_int(
        config.get("chunk_size", conn_state["chunk_size"]),
        MIN_CHUNK_SIZE,
        MAX_CHUNK_SIZE,
    )

    if sample_rate is None:
        await websocket.close(code=1003, reason="sample_rate must be 8000–192000")
        return None
    if chunk_size is None:
        await websocket.close(code=1003, reason="chunk_size must be 128–65536")
        return None

    conn_state["sample_rate"] = sample_rate
    conn_state["chunk_size"] = chunk_size
    conn_state["configured"] = True

    # Apply any extra settings included in the config
    _apply_settings(config, conn_state)

    return config


def _apply_settings(data: dict, conn_state: dict) -> None:
    """Merge a settings payload (config or live update) into connection state."""
    try:
        if "pitch_shift" in data:
            conn_state["pitch_shift"] = float(data["pitch_shift"])
        if "formant_shift" in data:
            conn_state["formant_shift"] = float(data["formant_shift"])
        if "f0_method" in data:
            conn_state["f0_method"] = str(data["f0_method"])
        if "index_rate" in data and data["index_rate"] is not None:
            conn_state["index_rate"] = float(data["index_rate"])
        if "filter_radius" in data and data["filter_radius"] is not None:
            conn_state["filter_radius"] = int(data["filter_radius"])
        if "rms_mix_rate" in data and data["rms_mix_rate"] is not None:
            conn_state["rms_mix_rate"] = float(data["rms_mix_rate"])
        if "protect" in data and data["protect"] is not None:
            conn_state["protect"] = float(data["protect"])
        if "effects" in data and isinstance(data["effects"], dict):
            conn_state["effects"] = data["effects"]
        if "bypass" in data:
            conn_state["bypass"] = bool(data["bypass"])
    except (TypeError, ValueError) as exc:
        logger.warning("Ignoring invalid settings values: %s", exc)


def _process_frame_sync(audio, model_manager, conn_state: dict) -> tuple:
    """Full processing path for one chunk. Runs inside a worker thread.

    When ``bypass`` is set the chunk is returned exactly as received: no noise
    gate, no model inference, no pitch or formant shift, no effect rack. The
    caller still sends it back over the same WebSocket, so the microphone,
    transport and output routing keep running and only the conversion is
    removed — that is what makes it a true A/B against the converted signal.

    Per-stream state (the RVC context window, the effect delay lines) is left
    untouched rather than reset, so switching back resumes from the same place;
    the stale history can produce a brief artifact on the first chunk after
    un-bypassing, which is preferable to discarding the stream's context.
    """
    if conn_state.get("bypass"):
        return audio, "bypass", 0.0, 0.0

    chain = conn_state["chain"]
    effects = conn_state["effects"]
    pitch_shift = conn_state["pitch_shift"]

    t0 = time.perf_counter()
    processed = chain.pre_process(audio, effects)

    model_ms = 0.0
    mode = "dsp"
    t_model = time.perf_counter()
    try:
        processed = model_manager.process_audio(
            processed,
            {
                "stream_id": conn_state["stream_id"],
                "pitch_shift": pitch_shift,
                "f0_method": conn_state["f0_method"],
                "sample_rate": conn_state["sample_rate"],
                "index_rate": conn_state["index_rate"],
                "filter_radius": conn_state["filter_radius"],
                "rms_mix_rate": conn_state["rms_mix_rate"],
                "protect": conn_state["protect"],
            },
        )
        model_ms = (time.perf_counter() - t_model) * 1000.0
        active = model_manager.get_active_model()
        mode = (active or {}).get("type", "model")
    except RuntimeError:
        # No active model — DSP passthrough handles pitch instead.
        processed = chain.apply_pitch(processed, pitch_shift)

    processed = chain.post_process(processed, effects, conn_state["formant_shift"])

    total_ms = (time.perf_counter() - t0) * 1000.0
    return processed, mode, model_ms, max(total_ms - model_ms, 0.0)


async def _handle_binary_frame(
    websocket: WebSocket,
    data: bytes,
    model_manager,
    conn_state: dict,
) -> None:
    """Parse a binary audio frame, process it, and send back the result."""
    t_start = time.perf_counter()

    try:
        audio, seq_num, _reserved = bytes_to_audio(data)
    except ValueError as exc:
        logger.warning("Invalid audio frame: %s", exc)
        return

    _get_chain(conn_state)
    processed, mode, model_ms, dsp_ms = await asyncio.to_thread(
        _process_frame_sync, audio, model_manager, conn_state
    )

    elapsed_ms = (time.perf_counter() - t_start) * 1000.0
    conn_state["latency_ms"] = elapsed_ms
    conn_state["model_ms"] = model_ms
    conn_state["dsp_ms"] = dsp_ms
    conn_state["mode"] = mode

    # Reserved header field carries server time in hundredths of a millisecond.
    server_time = min(int(elapsed_ms * 100), 0xFFFFFFFF)
    response_bytes = audio_to_bytes(processed, seq_num, reserved=server_time)
    await websocket.send_bytes(response_bytes)


def _handle_json_message(text: str, conn_state: dict) -> None:
    """Handle a JSON settings update from the client."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON message: %s", text[:200])
        return

    if not isinstance(data, dict):
        logger.warning("Ignoring non-object settings message")
        return

    _apply_settings(data, conn_state)

    transport_fields = {
        "sample_rate": (MIN_SAMPLE_RATE, MAX_SAMPLE_RATE),
        "chunk_size": (MIN_CHUNK_SIZE, MAX_CHUNK_SIZE),
    }
    for key, (minimum, maximum) in transport_fields.items():
        if key not in data:
            continue
        value = _bounded_int(data[key], minimum, maximum)
        if value is None:
            logger.warning(
                "Ignoring invalid %s update %r (expected %d–%d)",
                key,
                data[key],
                minimum,
                maximum,
            )
            continue
        conn_state[key] = value


async def _send_status(websocket: WebSocket, model_manager, conn_state: dict) -> None:
    """Send a JSON status message with a processing-time breakdown."""
    # Model activation owns a threading.Lock while checkpoints load and warm
    # up. Reading status in a worker keeps that lock wait off the event loop.
    active = await asyncio.to_thread(model_manager.get_active_model)
    bypassed = bool(conn_state.get("bypass"))
    if bypassed:
        mode = "bypass"
    else:
        mode = conn_state["mode"] if active else "dsp"
    status = {
        "type": "status",
        "latency_ms": round(conn_state["latency_ms"], 2),
        "model_ms": round(conn_state["model_ms"], 2),
        "dsp_ms": round(conn_state["dsp_ms"], 2),
        "mode": mode,
        "bypass": bypassed,
        "active_model": active["name"] if active else None,
        # Nothing is applied while bypassed, so report what is actually running
        # rather than what the rack is configured to do.
        "effects_active": 0
        if bypassed
        else EffectsChain.count_active(
            conn_state["effects"], conn_state["formant_shift"]
        ),
    }
    try:
        await websocket.send_json(status)
    except Exception:
        pass
