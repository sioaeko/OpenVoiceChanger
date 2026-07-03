"""Offline file conversion: run an uploaded audio file through the active
model and/or the DSP effect chain and return a rendered WAV."""

import asyncio
import io
import json
import logging
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from backend.config import settings
from backend.services.dsp_effects import EffectsChain

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/convert", tags=["convert"])

MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB


def _load_audio(data: bytes, filename: str) -> tuple[np.ndarray, int]:
    """Decode an uploaded audio file to mono float32 at its native rate."""
    import soundfile as sf

    try:
        audio, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
        audio = audio.mean(axis=1).astype(np.float32)
        return audio, int(sr)
    except Exception:
        pass

    # Fall back to librosa (handles mp3 and other codecs via audioread).
    try:
        import librosa

        audio, sr = librosa.load(io.BytesIO(data), sr=None, mono=True)
        return audio.astype(np.float32), int(sr)
    except Exception as exc:
        raise ValueError(f"Could not decode audio file '{filename}': {exc}") from exc


def _encode_wav(audio: np.ndarray, sample_rate: int) -> bytes:
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, np.clip(audio, -1.0, 1.0), sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _render(
    audio: np.ndarray,
    sample_rate: int,
    model_manager,
    use_model: bool,
    pitch_shift: float,
    formant_shift: float,
    f0_method: str,
    effects: dict,
) -> np.ndarray:
    chain = EffectsChain(sample_rate)
    processed = chain.pre_process(audio, effects)

    model_applied = False
    if use_model and model_manager.get_active_model() is not None:
        try:
            processed = model_manager.process_audio(
                processed,
                {
                    "stream_id": "__convert__",
                    "pitch_shift": pitch_shift,
                    "f0_method": f0_method,
                    "sample_rate": sample_rate,
                },
            )
            model_applied = True
        finally:
            model_manager.release_stream("__convert__")

    if not model_applied and abs(pitch_shift) > 1e-3:
        processed = chain.apply_pitch(processed, pitch_shift)

    return chain.post_process(processed, effects, formant_shift)


@router.post("/")
async def convert_file(
    request: Request,
    file: UploadFile,
    pitch_shift: float = Form(0.0),
    formant_shift: float = Form(0.0),
    f0_method: str = Form("rmvpe"),
    effects: str = Form("{}"),
    use_model: bool = Form(True),
) -> Response:
    """Convert an uploaded audio file and return the rendered WAV."""
    model_manager = getattr(request.app.state, "model_manager", None)
    if model_manager is None:
        raise HTTPException(status_code=503, detail="Model manager not initialized")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 200 MB)")
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")

    try:
        effects_dict = json.loads(effects) if effects else {}
        if not isinstance(effects_dict, dict):
            effects_dict = {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid effects JSON")

    try:
        audio, sample_rate = await asyncio.to_thread(_load_audio, data, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    max_samples = settings.MAX_CONVERT_SECONDS * sample_rate
    if len(audio) > max_samples:
        raise HTTPException(
            status_code=413,
            detail=f"Audio too long (max {settings.MAX_CONVERT_SECONDS // 60} minutes)",
        )
    if len(audio) == 0:
        raise HTTPException(status_code=400, detail="Audio file contains no samples")

    try:
        rendered = await asyncio.to_thread(
            _render,
            audio,
            sample_rate,
            model_manager,
            use_model,
            float(np.clip(pitch_shift, -24.0, 24.0)),
            float(np.clip(formant_shift, -24.0, 24.0)),
            str(f0_method),
            effects_dict,
        )
        wav_bytes = await asyncio.to_thread(_encode_wav, rendered, sample_rate)
    except Exception as exc:
        logger.exception("File conversion failed")
        raise HTTPException(status_code=500, detail=f"Conversion failed: {exc}")

    out_name = f"{Path(file.filename).stem}_converted.wav"
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": f'attachment; filename="{out_name}"'},
    )
