import asyncio
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.audio_processor import audio_to_bytes, bytes_to_audio

logger = logging.getLogger(__name__)

router = APIRouter()

# How often to send latency status messages (seconds)
STATUS_INTERVAL = 2.0


@router.websocket("/ws/audio")
async def audio_websocket(websocket: WebSocket) -> None:
    """Real-time audio processing WebSocket endpoint.

    Protocol:
        1. Client connects, server accepts.
        2. Client sends a JSON config message: {"sample_rate": int, "chunk_size": int}.
        3. Client sends binary frames (audio) or JSON frames (settings updates).
        4. Server processes binary frames through the active model and sends
           back binary responses.
        5. Server periodically sends JSON status messages with latency info.
    """
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
        "f0_method": "pm",
        "index_rate": None,
        "filter_radius": None,
        "rms_mix_rate": None,
        "protect": None,
        "configured": False,
        "last_status_time": time.monotonic(),
        "latency_ms": 0.0,
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
                now = time.monotonic()
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
        model_manager.release_stream(conn_state["stream_id"])


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

    sample_rate = int(config.get("sample_rate", conn_state["sample_rate"]))
    chunk_size = int(config.get("chunk_size", conn_state["chunk_size"]))

    if not (8000 <= sample_rate <= 192000):
        await websocket.close(code=1003, reason="sample_rate must be 8000–192000")
        return None
    if not (128 <= chunk_size <= 65536):
        await websocket.close(code=1003, reason="chunk_size must be 128–65536")
        return None

    conn_state["sample_rate"] = sample_rate
    conn_state["chunk_size"] = chunk_size
    conn_state["configured"] = True

    # Apply any extra settings included in the config
    if "pitch_shift" in config:
        conn_state["pitch_shift"] = float(config["pitch_shift"])
    if "f0_method" in config:
        conn_state["f0_method"] = str(config["f0_method"])
    if "index_rate" in config:
        conn_state["index_rate"] = float(config["index_rate"])
    if "filter_radius" in config:
        conn_state["filter_radius"] = int(config["filter_radius"])
    if "rms_mix_rate" in config:
        conn_state["rms_mix_rate"] = float(config["rms_mix_rate"])
    if "protect" in config:
        conn_state["protect"] = float(config["protect"])

    return config


async def _handle_binary_frame(
    websocket: WebSocket,
    data: bytes,
    model_manager,
    conn_state: dict,
) -> None:
    """Parse a binary audio frame, process it, and send back the result."""
    t_start = time.monotonic()

    try:
        audio, seq_num, _reserved = bytes_to_audio(data)
    except ValueError as exc:
        logger.warning("Invalid audio frame: %s", exc)
        return

    try:
        settings = {
            "stream_id": conn_state["stream_id"],
            "pitch_shift": conn_state["pitch_shift"],
            "f0_method": conn_state["f0_method"],
            "sample_rate": conn_state["sample_rate"],
            "index_rate": conn_state["index_rate"],
            "filter_radius": conn_state["filter_radius"],
            "rms_mix_rate": conn_state["rms_mix_rate"],
            "protect": conn_state["protect"],
        }
        processed = await asyncio.to_thread(
            model_manager.process_audio, audio, settings
        )
    except RuntimeError as exc:
        # No active model — send back the original audio as pass-through
        logger.debug("Pass-through (no active model): %s", exc)
        processed = audio

    response_bytes = audio_to_bytes(processed, seq_num)
    await websocket.send_bytes(response_bytes)

    elapsed_ms = (time.monotonic() - t_start) * 1000.0
    conn_state["latency_ms"] = elapsed_ms


def _handle_json_message(text: str, conn_state: dict) -> None:
    """Handle a JSON settings update from the client."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON message: %s", text[:200])
        return

    if "pitch_shift" in data:
        conn_state["pitch_shift"] = float(data["pitch_shift"])
        logger.debug("Updated pitch_shift: %.2f", conn_state["pitch_shift"])

    if "f0_method" in data:
        conn_state["f0_method"] = str(data["f0_method"])
        logger.debug("Updated f0_method: %s", conn_state["f0_method"])

    if "index_rate" in data:
        conn_state["index_rate"] = float(data["index_rate"])

    if "filter_radius" in data:
        conn_state["filter_radius"] = int(data["filter_radius"])

    if "rms_mix_rate" in data:
        conn_state["rms_mix_rate"] = float(data["rms_mix_rate"])

    if "protect" in data:
        conn_state["protect"] = float(data["protect"])

    if "sample_rate" in data:
        conn_state["sample_rate"] = int(data["sample_rate"])

    if "chunk_size" in data:
        conn_state["chunk_size"] = int(data["chunk_size"])


async def _send_status(websocket: WebSocket, model_manager, conn_state: dict) -> None:
    """Send a JSON status message to the client."""
    active = model_manager.get_active_model()
    status = {
        "type": "status",
        "latency_ms": round(conn_state["latency_ms"], 2),
        "active_model": active["name"] if active else None,
    }
    try:
        await websocket.send_json(status)
    except Exception:
        pass
