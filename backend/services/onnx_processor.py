import logging
from pathlib import Path

import numpy as np
import onnxruntime as ort

logger = logging.getLogger(__name__)


class OnnxProcessor:
    """ONNX Runtime model processor for voice conversion inference."""

    def __init__(self, model_path: str) -> None:
        self._model_path = Path(model_path)
        if not self._model_path.exists():
            raise FileNotFoundError(f"ONNX model not found: {model_path}")

        providers = self._select_providers()
        logger.info("Loading ONNX model: %s (providers: %s)", self._model_path.name, providers)

        self._session = ort.InferenceSession(str(self._model_path), providers=providers)
        self._input_details = self._session.get_inputs()
        self._output_details = self._session.get_outputs()

        logger.info(
            "ONNX model loaded — inputs: %s, outputs: %s",
            [(inp.name, inp.shape, inp.type) for inp in self._input_details],
            [(out.name, out.shape, out.type) for out in self._output_details],
        )

    @staticmethod
    def _select_providers() -> list[str]:
        """Auto-detect CUDA availability and return the best provider list."""
        available = ort.get_available_providers()
        if "CUDAExecutionProvider" in available:
            logger.info("CUDA execution provider available — using GPU acceleration")
            return ["CUDAExecutionProvider", "CPUExecutionProvider"]
        logger.info("CUDA not available — falling back to CPU execution provider")
        return ["CPUExecutionProvider"]

    def process(self, audio: np.ndarray, pitch_shift: float = 0.0) -> np.ndarray:
        """Run inference on an audio chunk.

        Args:
            audio: Float32 PCM samples, shape (num_samples,) or (1, num_samples).
            pitch_shift: Semitones to shift pitch (passed to model if it accepts it).

        Returns:
            Processed float32 PCM samples as a 1-D array.
        """
        if self._session is None:
            raise RuntimeError("ONNX session is not loaded")

        # Build the feed dict dynamically based on model input specs
        feed: dict[str, np.ndarray] = {}
        for inp in self._input_details:
            if "audio" in inp.name.lower() or inp == self._input_details[0]:
                # Reshape audio to match expected input shape
                shaped = self._reshape_for_input(audio, inp)
                feed[inp.name] = shaped.astype(np.float32)
            elif "pitch" in inp.name.lower() or "f0" in inp.name.lower():
                feed[inp.name] = np.array([pitch_shift], dtype=np.float32)
            elif "length" in inp.name.lower() or "len" in inp.name.lower():
                feed[inp.name] = np.array([len(audio)], dtype=np.int64)

        # If the model expects a single input, just pass the audio
        if len(feed) == 0:
            inp = self._input_details[0]
            shaped = self._reshape_for_input(audio, inp)
            feed[inp.name] = shaped.astype(np.float32)

        output_names = [out.name for out in self._output_details]
        results = self._session.run(output_names, feed)

        # Return the first output flattened to 1-D
        return results[0].flatten().astype(np.float32)

    @staticmethod
    def _reshape_for_input(audio: np.ndarray, inp_detail: ort.NodeArg) -> np.ndarray:
        """Reshape audio array to match the model's expected input shape."""
        shape = inp_detail.shape
        if shape is None:
            # No shape constraint — pass as (1, N)
            return audio.reshape(1, -1)

        ndim = len(shape)
        if ndim == 1:
            return audio.flatten()
        elif ndim == 2:
            return audio.reshape(1, -1)
        elif ndim == 3:
            return audio.reshape(1, 1, -1)
        else:
            return audio.reshape(1, -1)

    def unload(self) -> None:
        """Release the ONNX session and free resources."""
        if self._session is not None:
            logger.info("Unloading ONNX model: %s", self._model_path.name)
            del self._session
            self._session = None

    @property
    def loaded(self) -> bool:
        return self._session is not None
