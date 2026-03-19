import logging
from pathlib import Path

import numpy as np
from scipy.signal import resample

logger = logging.getLogger(__name__)


class RvcProcessor:
    """RVC v2 voice conversion processor.

    Currently uses a realistic stub that applies basic pitch shifting via
    resampling.  The full implementation requires loading the RVC model
    architecture (HuBERT feature extraction, pitch estimation, and the
    synthesis network).
    """

    def __init__(self, model_path: str, index_path: str | None = None) -> None:
        self._model_path = Path(model_path)
        self._index_path = Path(index_path) if index_path else None

        if not self._model_path.exists():
            raise FileNotFoundError(f"RVC model not found: {model_path}")
        if self._index_path and not self._index_path.exists():
            logger.warning("Index file not found: %s — proceeding without index", self._index_path)
            self._index_path = None

        self._device = self._select_device()
        self._model = self._load_model()
        logger.info(
            "RVC model loaded: %s (device: %s, index: %s)",
            self._model_path.name,
            self._device,
            self._index_path.name if self._index_path else "none",
        )

    @staticmethod
    def _select_device() -> str:
        """Auto-detect CUDA availability."""
        try:
            import torch

            if torch.cuda.is_available():
                logger.info("CUDA available — using GPU for RVC inference")
                return "cuda"
        except ImportError:
            logger.warning("PyTorch not available — falling back to CPU stub")
        return "cpu"

    def _load_model(self) -> object:
        """Load the RVC model weights.

        TODO: Full implementation needs:
          1. Load HuBERT content encoder (e.g. hubert_base.pt) for feature
             extraction from input audio.
          2. Load the RVC SynthesizerTrn model from the .pth checkpoint,
             which contains the speaker embedding, pitch predictor, and
             waveform synthesizer.
          3. Optionally load the FAISS index (.index file) for retrieval-
             based speaker similarity enhancement.
          4. Initialize pitch extraction (CREPE, DIO, Harvest, RMVPE)
             depending on user preference.

        For now we return a sentinel so that `loaded` returns True.
        """
        try:
            import torch

            checkpoint = torch.load(
                str(self._model_path), map_location=self._device, weights_only=False
            )
            logger.info(
                "Checkpoint keys: %s",
                list(checkpoint.keys()) if isinstance(checkpoint, dict) else type(checkpoint),
            )
            return checkpoint
        except Exception as exc:
            logger.warning("Could not load .pth as torch checkpoint: %s — using stub", exc)
            return {"stub": True}

    def process(
        self,
        audio: np.ndarray,
        pitch_shift: float = 0.0,
        f0_method: str = "dio",
    ) -> np.ndarray:
        """Run RVC inference on an audio chunk.

        TODO: Full RVC v2 pipeline implementation:
          1. Extract HuBERT features from the input audio.
          2. Estimate F0 (fundamental frequency) using the chosen method
             (dio / harvest / crepe / rmvpe).
          3. Apply pitch_shift (in semitones) to the F0 contour.
          4. Optionally query the FAISS index for nearest speaker features.
          5. Feed features + F0 into SynthesizerTrn to produce the converted
             waveform.
          6. Post-process (trim silence, normalize volume).

        Current stub: applies pitch shifting via resampling, which changes
        both pitch and speed — a rough approximation for testing the pipeline.

        Args:
            audio: Float32 PCM samples, shape (num_samples,).
            pitch_shift: Semitones to shift. Positive = higher pitch.
            f0_method: Pitch estimation method (unused in stub).

        Returns:
            Processed float32 PCM samples, same length as input.
        """
        if self._model is None:
            raise RuntimeError("RVC model is not loaded")

        if audio.size == 0:
            return audio

        output = audio.copy().astype(np.float32)

        # Apply basic pitch shifting via resampling as a placeholder
        if pitch_shift != 0.0:
            # Shift ratio: 2^(semitones/12)
            ratio = 2.0 ** (pitch_shift / 12.0)
            # Stretch to change pitch: resample to shorter/longer, then
            # resample back to original length
            stretched_len = max(1, int(len(output) / ratio))
            stretched = resample(output, stretched_len).astype(np.float32)
            # Resample back to original length to maintain duration
            output = resample(stretched, len(audio)).astype(np.float32)

        # Normalize to prevent clipping
        peak = np.max(np.abs(output))
        if peak > 1.0:
            output /= peak

        return output

    def unload(self) -> None:
        """Release model resources and clear CUDA cache."""
        if self._model is not None:
            logger.info("Unloading RVC model: %s", self._model_path.name)
            self._model = None

            try:
                import torch

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    logger.info("CUDA cache cleared")
            except ImportError:
                pass

    @property
    def loaded(self) -> bool:
        return self._model is not None
