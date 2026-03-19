import logging
import os
import re
import threading
from pathlib import Path

import numpy as np
from fastapi import UploadFile

from backend.services.onnx_processor import OnnxProcessor
from backend.services.rvc_processor import RvcProcessor

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".onnx", ".pth"}
MODEL_TYPE_MAP = {
    ".onnx": "onnx",
    ".pth": "rvc",
}
MAX_MODEL_SIZE = 4 * 1024 * 1024 * 1024  # 4 GB


def _sanitize_filename(name: str) -> str:
    """Sanitize a filename: keep alphanumeric, hyphens, underscores, and dots."""
    name = os.path.basename(name)
    name = re.sub(r"[^\w.\-]", "_", name)
    # Collapse multiple underscores
    name = re.sub(r"_+", "_", name).strip("_")
    if not name:
        raise ValueError("Filename is empty after sanitization")
    return name


class ModelManager:
    """Manages voice conversion models: loading, unloading, and inference routing.

    Thread-safe via an internal lock around model activation/deactivation.
    """

    def __init__(self, models_dir: str) -> None:
        self._models_dir = Path(models_dir)
        self._models_dir.mkdir(parents=True, exist_ok=True)

        self._lock = threading.Lock()
        self._active_model_name: str | None = None
        self._active_processor: OnnxProcessor | RvcProcessor | None = None

        # Scan existing models
        self._known_models: dict[str, dict] = {}
        self._scan_models()

    def _scan_models(self) -> None:
        """Scan the models directory and register all valid model files."""
        for path in self._models_dir.iterdir():
            if path.is_file() and path.suffix in ALLOWED_EXTENSIONS:
                self._register_model(path)
        logger.info("Scanned %d model(s) in %s", len(self._known_models), self._models_dir)

    def _register_model(self, path: Path) -> dict:
        """Register a model file and return its metadata."""
        meta = {
            "name": path.name,
            "type": MODEL_TYPE_MAP.get(path.suffix, "unknown"),
            "size_bytes": path.stat().st_size,
            "path": str(path),
            "active": False,
        }
        self._known_models[path.name] = meta
        return meta

    def list_models(self) -> list[dict]:
        """Return metadata for all known models."""
        with self._lock:
            active = self._active_model_name
        models = []
        for name, meta in self._known_models.items():
            entry = {**meta, "active": name == active}
            models.append(entry)
        return models

    async def upload_model(self, name: str, file: UploadFile) -> dict:
        """Save an uploaded model file and register it.

        Args:
            name: Desired model filename.
            file: The uploaded file (multipart).

        Returns:
            Model metadata dict.

        Raises:
            ValueError: If the file extension is not supported.
        """
        safe_name = _sanitize_filename(name)
        ext = Path(safe_name).suffix.lower()

        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
            )

        dest = self._models_dir / safe_name

        # Stream to disk in chunks to handle large files
        chunk_size = 1024 * 1024  # 1 MB
        total_written = 0
        with open(dest, "wb") as f:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total_written += len(chunk)
                if total_written > MAX_MODEL_SIZE:
                    f.close()
                    dest.unlink(missing_ok=True)
                    raise ValueError(
                        f"File exceeds maximum size ({MAX_MODEL_SIZE // (1024**3)} GB)"
                    )
                f.write(chunk)

        meta = self._register_model(dest)
        logger.info("Uploaded model: %s (%d bytes)", safe_name, meta["size_bytes"])
        return meta

    def delete_model(self, name: str) -> None:
        """Delete a model file and unload it if active.

        Raises:
            FileNotFoundError: If the model is not known.
        """
        if name not in self._known_models:
            raise FileNotFoundError(f"Model not found: {name}")

        with self._lock:
            if self._active_model_name == name:
                self._deactivate_locked()

        model_path = Path(self._known_models[name]["path"])
        if model_path.exists():
            model_path.unlink()

        del self._known_models[name]
        logger.info("Deleted model: %s", name)

    def activate_model(self, name: str) -> dict:
        """Activate a model for inference.

        Args:
            name: The registered model name.

        Returns:
            Status dict with model info.

        Raises:
            FileNotFoundError: If the model is not known.
            RuntimeError: If the model fails to load.
        """
        if name not in self._known_models:
            raise FileNotFoundError(f"Model not found: {name}")

        meta = self._known_models[name]

        with self._lock:
            # Deactivate current model first
            if self._active_processor is not None:
                self._deactivate_locked()

            model_path = meta["path"]
            model_type = meta["type"]

            try:
                if model_type == "onnx":
                    processor = OnnxProcessor(model_path)
                elif model_type == "rvc":
                    # Look for a matching .index file
                    index_path = self._find_index_file(name)
                    processor = RvcProcessor(model_path, index_path)
                else:
                    raise ValueError(f"Unknown model type: {model_type}")
            except Exception as exc:
                logger.error("Failed to load model %s: %s", name, exc)
                raise RuntimeError(f"Failed to load model: {exc}") from exc

            self._active_model_name = name
            self._active_processor = processor

        logger.info("Activated model: %s (type: %s)", name, model_type)
        return {
            "name": name,
            "type": model_type,
            "status": "active",
        }

    def _find_index_file(self, model_name: str) -> str | None:
        """Look for a .index file matching the model name."""
        stem = Path(model_name).stem
        for ext in (".index",):
            candidate = self._models_dir / f"{stem}{ext}"
            if candidate.exists():
                return str(candidate)
        return None

    def deactivate_model(self) -> None:
        """Deactivate and unload the current model."""
        with self._lock:
            self._deactivate_locked()

    def _deactivate_locked(self) -> None:
        """Internal deactivation — must be called while holding self._lock."""
        if self._active_processor is not None:
            logger.info("Deactivating model: %s", self._active_model_name)
            self._active_processor.unload()
            self._active_processor = None
            self._active_model_name = None

    def get_active_model(self) -> dict | None:
        """Return info about the currently active model, or None."""
        with self._lock:
            name = self._active_model_name
        if name is None:
            return None
        meta = self._known_models.get(name)
        if meta is None:
            return None
        return {
            **meta,
            "active": True,
        }

    def process_audio(self, audio: np.ndarray, settings: dict) -> np.ndarray:
        """Route audio through the active processor.

        Args:
            audio: Float32 PCM samples.
            settings: Dict with processing parameters (pitch_shift, f0_method, etc.).

        Returns:
            Processed audio samples.

        Raises:
            RuntimeError: If no model is active.
        """
        with self._lock:
            processor = self._active_processor
        if processor is None:
            raise RuntimeError("No model is currently active")

        pitch_shift = settings.get("pitch_shift", 0.0)

        if isinstance(processor, RvcProcessor):
            f0_method = settings.get("f0_method", "dio")
            return processor.process(audio, pitch_shift=pitch_shift, f0_method=f0_method)
        else:
            return processor.process(audio, pitch_shift=pitch_shift)

    @property
    def active_model_name(self) -> str | None:
        return self._active_model_name

    @property
    def active_processor(self) -> OnnxProcessor | RvcProcessor | None:
        return self._active_processor
