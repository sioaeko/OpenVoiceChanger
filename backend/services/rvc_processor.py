import importlib
import logging
import os
import threading
from contextlib import nullcontext
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from backend.config import DEFAULT_F0_METHOD, settings
from backend.services.audio_processor import resample as resample_audio
from backend.services.f0_adapter import F0Adapter
from backend.services.f0_registry import F0_METHOD_BY_ID, normalize_f0_method
from backend.services.hubert_checkpoint import load_hubert_checkpoint

logger = logging.getLogger(__name__)

RVC_INSTALL_HINT = (
    "RVC runtime is missing. Install backend dependencies and then run "
    "`pip install --no-deps git+https://github.com/RVC-Project/"
    "Retrieval-based-Voice-Conversion`."
)

UNSAFE_CHECKPOINT_HINT = (
    "This checkpoint cannot be loaded in PyTorch's safe (weights-only) mode, "
    "which means unpickling it would run code embedded in the file. "
    "Only .pth files from a source you trust should ever be loaded that way. "
    "If you trust this one, restart the backend with "
    "OVC_RVC_ALLOW_UNSAFE_CHECKPOINTS=true to permit it."
)


def _numpy_safe_globals() -> list:
    """Data-only numpy symbols some RVC checkpoints need to unpickle.

    These reconstruct arrays, scalars and dtypes; none of them can execute
    caller-supplied code, so allowing them keeps weights-only loading safe
    while covering checkpoints that stored numpy values alongside tensors.
    """
    candidates = [
        ("numpy", "ndarray"),
        ("numpy", "dtype"),
        # numpy moved these to a private package in 2.0; try both spellings.
        ("numpy.core.multiarray", "_reconstruct"),
        ("numpy.core.multiarray", "scalar"),
        ("numpy._core.multiarray", "_reconstruct"),
        ("numpy._core.multiarray", "scalar"),
    ]

    resolved = []
    for module_name, attr in candidates:
        try:
            module = importlib.import_module(module_name)
            resolved.append(getattr(module, attr))
        except (ImportError, AttributeError):
            continue

    # numpy >= 1.25 pickles a scalar's dtype as a concrete class from
    # numpy.dtypes (Int64DType, Float32DType, ...) rather than numpy.dtype
    # itself, so the base class alone is not enough to unpickle np.int64(40000).
    try:
        dtypes_module = importlib.import_module("numpy.dtypes")
    except ImportError:
        return resolved

    for name in dir(dtypes_module):
        if name.startswith("_") or not name.endswith("DType"):
            continue
        attr = getattr(dtypes_module, name, None)
        if isinstance(attr, type):
            resolved.append(attr)

    return resolved


@dataclass(slots=True)
class _RuntimeConfig:
    device: str
    is_half: bool
    x_pad: int
    x_query: int
    x_center: int
    x_max: int


@dataclass(slots=True)
class _StreamState:
    audio_16k: np.ndarray


class RvcProcessor:
    """Real RVC inference processor backed by the official RVC runtime."""

    def __init__(self, model_path: str, index_path: str | None = None) -> None:
        self._model_path = Path(model_path)
        self._index_path = Path(index_path) if index_path else None
        self._hubert_path = Path(settings.HUBERT_PATH)
        self._rmvpe_root = Path(settings.RMVPE_ROOT)
        self._lock = threading.Lock()
        self._stream_states: dict[str, _StreamState] = {}
        self._context_samples_16k = max(
            0, int(round(settings.RVC_STREAM_CONTEXT_SECONDS * 16000))
        )
        self._index_rate = float(settings.RVC_INDEX_RATE)
        self._filter_radius = int(settings.RVC_FILTER_RADIUS)
        self._rms_mix_rate = float(settings.RVC_RMS_MIX_RATE)
        self._protect = float(settings.RVC_PROTECT)
        self._call_counter = 0

        self._net_g: Any = None
        self._hubert_model: Any = None
        self._pipeline: Any = None
        self._pipeline_module: Any = None
        self._torch: Any = None
        self._target_sample_rate = 0
        self._speaker_count = 0
        self._speaker_id = 0
        self._if_f0 = 1
        self._version = "v1"

        if not self._model_path.exists():
            raise FileNotFoundError(f"RVC model not found: {model_path}")
        if self._index_path and not self._index_path.exists():
            logger.warning("Index file not found: %s — proceeding without index", self._index_path)
            self._index_path = None
        if not self._hubert_path.exists():
            raise FileNotFoundError(
                f"HuBERT model not found: {self._hubert_path}. "
                "Set OVC_HUBERT_PATH to a valid hubert_base.pt file."
            )

        self._runtime = self._select_runtime_config()
        if self._rmvpe_root.exists():
            os.environ["rmvpe_root"] = str(self._rmvpe_root)

        self._load_model()
        self._load_hubert_model()

        logger.info(
            "RVC model loaded: %s (device=%s, target_sr=%d, speakers=%d, index=%s)",
            self._model_path.name,
            self._runtime.device,
            self._target_sample_rate,
            self._speaker_count,
            self._index_path.name if self._index_path else "none",
        )

    @staticmethod
    def _runtime_modules() -> tuple[Any, Any, Any]:
        try:
            import rvc.modules.vc.pipeline as rvc_pipeline_module
            from fairseq import checkpoint_utils
            from rvc.lib.infer_pack.models import (
                SynthesizerTrnMs256NSFsid,
                SynthesizerTrnMs256NSFsid_nono,
                SynthesizerTrnMs768NSFsid,
                SynthesizerTrnMs768NSFsid_nono,
            )
        except ImportError as exc:
            raise RuntimeError(f"{RVC_INSTALL_HINT} Import error: {exc}") from exc

        synthesizers = {
            ("v1", 1): SynthesizerTrnMs256NSFsid,
            ("v1", 0): SynthesizerTrnMs256NSFsid_nono,
            ("v2", 1): SynthesizerTrnMs768NSFsid,
            ("v2", 0): SynthesizerTrnMs768NSFsid_nono,
        }
        return checkpoint_utils, rvc_pipeline_module, synthesizers

    @staticmethod
    def _select_runtime_config() -> _RuntimeConfig:
        try:
            import torch
        except ImportError as exc:
            raise RuntimeError("PyTorch is required for RVC inference") from exc

        device = "cpu"
        is_half = False
        gpu_mem: int | None = None

        if hasattr(torch, "xpu") and torch.xpu.is_available():
            device = "xpu:0"
            is_half = True
        elif torch.cuda.is_available():
            device = "cuda:0"
            is_half = True
            gpu_name = torch.cuda.get_device_name(0)
            if (
                ("16" in gpu_name and "V100" not in gpu_name.upper())
                or "P40" in gpu_name.upper()
                or "P10" in gpu_name.upper()
                or "1060" in gpu_name
                or "1070" in gpu_name
                or "1080" in gpu_name
            ):
                is_half = False
            gpu_mem = int(
                torch.cuda.get_device_properties(0).total_memory / 1024 / 1024 / 1024 + 0.4
            )
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"

        if gpu_mem is not None and gpu_mem <= 4:
            x_pad, x_query, x_center, x_max = 1, 5, 30, 32
        elif is_half:
            x_pad, x_query, x_center, x_max = 3, 10, 60, 65
        else:
            x_pad, x_query, x_center, x_max = 1, 6, 38, 41

        return _RuntimeConfig(
            device=device,
            is_half=is_half,
            x_pad=x_pad,
            x_query=x_query,
            x_center=x_center,
            x_max=x_max,
        )

    def _load_checkpoint(self, torch) -> dict:
        """Load an RVC checkpoint, preferring PyTorch's safe weights-only mode.

        A .pth checkpoint is a Python pickle, so the legacy
        ``weights_only=False`` path executes whatever the file's author put in
        it — for a model anyone can upload through the web UI, that is remote
        code execution. Safe mode is tried first (extended with data-only numpy
        symbols); falling back to unpickling requires the operator to opt in
        per-deployment, and says loudly in the log when it happens.
        """
        path = str(self._model_path)

        try:
            safe_globals = getattr(torch.serialization, "safe_globals", None)
            extra_globals = _numpy_safe_globals()
            if safe_globals is not None and extra_globals:
                with safe_globals(extra_globals):
                    return torch.load(path, map_location="cpu", weights_only=True)
            return torch.load(path, map_location="cpu", weights_only=True)
        except Exception as safe_exc:
            if not settings.RVC_ALLOW_UNSAFE_CHECKPOINTS:
                logger.error(
                    "Refusing to unpickle %s: safe load failed (%s)",
                    self._model_path.name,
                    safe_exc,
                )
                raise RuntimeError(
                    f"{self._model_path.name} could not be loaded safely. "
                    f"{UNSAFE_CHECKPOINT_HINT}"
                ) from safe_exc

            logger.warning(
                "OVC_RVC_ALLOW_UNSAFE_CHECKPOINTS is set — unpickling %s with "
                "weights_only=False. Code embedded in this file will run with the "
                "backend's privileges. Safe load failed with: %s",
                self._model_path.name,
                safe_exc,
            )
            return torch.load(path, map_location="cpu", weights_only=False)

    def _load_model(self) -> None:
        try:
            import torch
        except ImportError as exc:
            raise RuntimeError("PyTorch is required for RVC inference") from exc

        checkpoint_utils, pipeline_module, synthesizers = self._runtime_modules()
        checkpoint = self._load_checkpoint(torch)

        if not isinstance(checkpoint, dict) or "config" not in checkpoint or "weight" not in checkpoint:
            raise RuntimeError(
                f"{self._model_path.name} is not a valid RVC checkpoint. "
                "Expected a dict containing 'config' and 'weight'."
            )
        if "emb_g.weight" not in checkpoint["weight"]:
            raise RuntimeError(
                f"{self._model_path.name} is missing emb_g.weight and cannot be used as an RVC model."
            )

        self._torch = torch
        self._pipeline_module = pipeline_module
        self._target_sample_rate = int(checkpoint["config"][-1])
        self._speaker_count = int(checkpoint["weight"]["emb_g.weight"].shape[0])
        checkpoint["config"][-3] = self._speaker_count
        self._if_f0 = int(checkpoint.get("f0", 1))
        self._version = str(checkpoint.get("version", "v1"))

        synthesizer_class = synthesizers.get((self._version, self._if_f0))
        if synthesizer_class is None:
            raise RuntimeError(
                f"Unsupported RVC checkpoint variant version={self._version!r}, f0={self._if_f0}"
            )

        net_g = synthesizer_class(*checkpoint["config"], is_half=self._runtime.is_half)
        del net_g.enc_q

        load_result = net_g.load_state_dict(checkpoint["weight"], strict=False)
        if load_result.missing_keys or load_result.unexpected_keys:
            logger.info(
                "Loaded %s with %d missing and %d unexpected keys",
                self._model_path.name,
                len(load_result.missing_keys),
                len(load_result.unexpected_keys),
            )

        net_g = net_g.eval().to(self._runtime.device)
        self._net_g = net_g.half() if self._runtime.is_half else net_g.float()
        self._pipeline = pipeline_module.Pipeline(self._target_sample_rate, self._runtime)
        self._f0_adapter = F0Adapter(self._pipeline, self._runtime)

    def _load_hubert_model(self) -> None:
        checkpoint_utils, _, _ = self._runtime_modules()
        try:
            from fairseq.data.dictionary import Dictionary
        except ImportError as exc:
            raise RuntimeError(f"{RVC_INSTALL_HINT} Import error: {exc}") from exc

        safe_globals = getattr(self._torch.serialization, "safe_globals", None)
        if safe_globals is not None:
            with safe_globals([Dictionary]):
                models, _, _ = checkpoint_utils.load_model_ensemble_and_task(
                    [str(self._hubert_path)],
                    suffix="",
                    state=load_hubert_checkpoint(self._torch, self._hubert_path),
                )
        else:
            self._torch.serialization.add_safe_globals([Dictionary])
            models, _, _ = checkpoint_utils.load_model_ensemble_and_task(
                [str(self._hubert_path)],
                suffix="",
                state=load_hubert_checkpoint(self._torch, self._hubert_path),
            )
        hubert_model = models[0].to(self._runtime.device)
        self._hubert_model = hubert_model.half() if self._runtime.is_half else hubert_model.float()
        self._hubert_model = self._hubert_model.eval()

    @staticmethod
    def _normalize_f0_method(f0_method: str, *, realtime: bool = True) -> str:
        method = normalize_f0_method(f0_method or DEFAULT_F0_METHOD)
        if realtime and not F0_METHOD_BY_ID[method].realtime:
            raise ValueError(f"{F0_METHOD_BY_ID[method].label} is available for file conversion only")
        return method

    def _get_stream_state(self, stream_id: str) -> _StreamState:
        state = self._stream_states.get(stream_id)
        if state is None:
            state = _StreamState(audio_16k=np.zeros(0, dtype=np.float32))
            self._stream_states[stream_id] = state
        return state

    @staticmethod
    def _tail_to_length(audio: np.ndarray, target_length: int) -> np.ndarray:
        """Align a streaming chunk to the end of the window.

        In streaming mode inference runs over a rolling context window whose
        newest samples correspond to the chunk just received, so the useful
        audio is at the *tail* and any shortfall is padded in front.
        """
        if target_length <= 0:
            return np.zeros(0, dtype=np.float32)
        if len(audio) > target_length:
            return audio[-target_length:].astype(np.float32, copy=False)
        if len(audio) < target_length:
            pad = np.zeros(target_length - len(audio), dtype=np.float32)
            return np.concatenate([pad, audio.astype(np.float32, copy=False)])
        return audio.astype(np.float32, copy=False)

    @staticmethod
    def _head_to_length(audio: np.ndarray, target_length: int) -> np.ndarray:
        """Align a whole-file render to the start of the input.

        Offline inference covers the entire file from sample zero, so the
        rendered audio must stay anchored to the beginning. Length drift from
        resampling is absorbed at the end — front-padding here would push the
        whole recording later in time.
        """
        if target_length <= 0:
            return np.zeros(0, dtype=np.float32)
        if len(audio) > target_length:
            return audio[:target_length].astype(np.float32, copy=False)
        if len(audio) < target_length:
            pad = np.zeros(target_length - len(audio), dtype=np.float32)
            return np.concatenate([audio.astype(np.float32, copy=False), pad])
        return audio.astype(np.float32, copy=False)

    def process(
        self,
        audio: np.ndarray,
        pitch_shift: float = 0.0,
        f0_method: str = DEFAULT_F0_METHOD,
        sample_rate: int = 40000,
        stream_id: str | int | None = None,
        index_rate: float | None = None,
        filter_radius: int | None = None,
        rms_mix_rate: float | None = None,
        protect: float | None = None,
        crepe_hop_length: int | None = None,
        use_stream_context: bool = True,
    ) -> np.ndarray:
        """Run real RVC inference over ``audio``.

        Two distinct modes:

        * ``use_stream_context=True`` (realtime): ``audio`` is one live chunk.
          It is appended to this stream's rolling 16 kHz tail context, the
          window is trimmed to ``RVC_STREAM_CONTEXT_SECONDS``, and inference
          runs over that window. The result is tail-aligned to the chunk.
        * ``use_stream_context=False`` (offline whole-file render): ``audio`` is
          an entire file. It is resampled to 16 kHz and handed to the RVC
          pipeline **in full** — the pipeline splits long input itself using
          the x_pad/x_query/x_center/x_max budget from ``_select_runtime_config``.
          No per-stream state is read or written, and the result is head-aligned
          so the render starts where the source starts.

        Passing a whole file through the streaming path would truncate it to the
        context window, which is why the mode is explicit rather than inferred.
        """
        if not self.loaded:
            raise RuntimeError("RVC model is not loaded")
        if audio.size == 0:
            return audio.astype(np.float32, copy=False)
        if sample_rate <= 0:
            raise ValueError(f"Invalid sample rate: {sample_rate}")

        method = self._normalize_f0_method(f0_method, realtime=use_stream_context)
        stream_key = str(stream_id) if stream_id is not None else "__default__"
        resolved_index_rate = self._index_rate if index_rate is None else float(np.clip(index_rate, 0.0, 1.0))
        resolved_filter_radius = self._filter_radius if filter_radius is None else max(0, int(filter_radius))
        resolved_rms_mix_rate = self._rms_mix_rate if rms_mix_rate is None else float(np.clip(rms_mix_rate, 0.0, 1.0))
        resolved_protect = self._protect if protect is None else float(np.clip(protect, 0.0, 0.5))

        with self._lock:
            chunk_16k = resample_audio(audio.astype(np.float32), sample_rate, 16000)

            if use_stream_context and self._context_samples_16k > 0:
                state = self._get_stream_state(stream_key)
                state.audio_16k = np.concatenate([state.audio_16k, chunk_16k]).astype(np.float32)
                if len(state.audio_16k) > self._context_samples_16k:
                    state.audio_16k = state.audio_16k[-self._context_samples_16k :]
                audio_for_inference = state.audio_16k
            else:
                # Offline renders (and a zero-length context) infer over exactly
                # what the caller supplied — for a file, that is all of it.
                audio_for_inference = chunk_16k

            resample_sr = sample_rate if sample_rate >= 16000 else 0
            times = {"npy": 0.0, "f0": 0.0, "infer": 0.0}
            input_audio_key = f"stream-{stream_key}-{self._call_counter}"
            self._call_counter += 1

            adapter = getattr(self, "_f0_adapter", None)
            adapter_mode = adapter.mode(
                realtime=use_stream_context,
                crepe_hop_length=crepe_hop_length,
            ) if adapter else nullcontext()
            try:
                with adapter_mode:
                    output_i16 = self._pipeline.pipeline(
                        self._hubert_model,
                        self._net_g,
                        self._speaker_id,
                        audio_for_inference,
                        input_audio_key,
                        times,
                        pitch_shift,
                        method,
                        str(self._index_path) if self._index_path else None,
                        resolved_index_rate if self._index_path else 0.0,
                        self._if_f0,
                        resolved_filter_radius,
                        self._target_sample_rate,
                        resample_sr,
                        resolved_rms_mix_rate,
                        self._version,
                        resolved_protect,
                    )
            except Exception as exc:
                raise RuntimeError(f"RVC inference failed: {exc}") from exc
            finally:
                if method == "harvest":
                    self._pipeline_module.input_audio_path2wav.pop(input_audio_key, None)
                    self._pipeline_module.cache_harvest_f0.cache_clear()

            output = output_i16.astype(np.float32) / 32768.0
            if resample_sr == 0 and self._target_sample_rate != sample_rate:
                output = resample_audio(output, self._target_sample_rate, sample_rate)

            if use_stream_context:
                output = self._tail_to_length(output, len(audio))
            else:
                output = self._head_to_length(output, len(audio))
            return np.clip(output, -1.0, 1.0).astype(np.float32, copy=False)

    def release_stream(self, stream_id: str | int | None) -> None:
        """Release cached context for one audio stream."""
        if stream_id is None:
            return
        with self._lock:
            self._stream_states.pop(str(stream_id), None)

    def warm_up(self, sample_rate: int = 40000, chunk_size: int = 4096) -> None:
        """Run one silent inference so the first live chunk does not pay setup cost."""
        try:
            self.process(
                np.zeros(chunk_size, dtype=np.float32),
                pitch_shift=0.0,
                f0_method="pm",
                sample_rate=sample_rate,
                stream_id="__warmup__",
            )
        finally:
            self.release_stream("__warmup__")

    def unload(self) -> None:
        """Release model resources and clear device caches."""
        with self._lock:
            self._stream_states.clear()
            self._hubert_model = None
            self._net_g = None
            self._pipeline = None
            adapter = getattr(self, "_f0_adapter", None)
            if adapter is not None:
                adapter.close()
            self._f0_adapter = None

            if self._torch is None:
                return
            if self._torch.cuda.is_available():
                self._torch.cuda.empty_cache()

    def describe(self) -> dict:
        """Return checkpoint metadata for API consumers."""
        return {
            "engine": "rvc",
            "version": self._version,
            "target_sample_rate": self._target_sample_rate,
            "f0": bool(self._if_f0),
            "f0_methods": [method for method, info in getattr(
                getattr(self, "_f0_adapter", None), "capabilities", {}
            ).items() if info.get("available")],
            "speakers": self._speaker_count,
            "index": self._index_path.name if self._index_path else None,
            "device": self._runtime.device,
            "half_precision": self._runtime.is_half,
        }

    @property
    def loaded(self) -> bool:
        return (
            self._hubert_model is not None
            and self._net_g is not None
            and self._pipeline is not None
        )
