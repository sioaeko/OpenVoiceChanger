"""Additional F0 estimators wired into the official RVC pipeline contract."""

from contextlib import contextmanager
import inspect
import math
from pathlib import Path
import types
from typing import Any

import numpy as np
from scipy import signal

from backend.config import settings
from backend.services.f0_registry import F0_METHOD_BY_ID, capability_map, normalize_f0_method

F0_MIN = 50.0
F0_MAX = 1100.0
NATIVE_METHODS = frozenset({"pm", "harvest", "crepe", "rmvpe"})
CUSTOM_METHODS = frozenset(F0_METHOD_BY_ID) - NATIVE_METHODS
CREPE_CENTS_PER_BIN = 20.0
CREPE_CENTS_OFFSET = 1997.3794084376191


def _fit_f0(values: Any, length: int) -> np.ndarray:
    values = np.nan_to_num(np.asarray(values, dtype=np.float32).reshape(-1), nan=0.0, posinf=0.0, neginf=0.0)
    if length <= 0:
        return np.zeros(0, dtype=np.float32)
    if len(values) >= length:
        return values[:length]
    before = (length - len(values)) // 2
    return np.pad(values, (before, length - len(values) - before))


def _pitch_pair(f0: Any, length: int, semitones: float) -> tuple[np.ndarray, np.ndarray]:
    pitchf = _fit_f0(f0, length)
    pitchf *= float(2 ** (float(semitones) / 12.0))
    pitchf = np.clip(pitchf, 0.0, F0_MAX * 4).astype(np.float32, copy=False)
    mel_min = 1127.0 * math.log(1.0 + F0_MIN / 700.0)
    mel_max = 1127.0 * math.log(1.0 + F0_MAX / 700.0)
    mel = 1127.0 * np.log1p(pitchf / 700.0)
    voiced = mel > 0
    mel[voiced] = (mel[voiced] - mel_min) * 254.0 / (mel_max - mel_min) + 1.0
    return np.rint(np.clip(mel, 1.0, 255.0)).astype(np.int32), pitchf


class F0Adapter:
    """Patch one loaded RVC Pipeline instance without modifying its package."""

    def __init__(self, pipeline, runtime, *, capabilities=None):
        self.pipeline = pipeline
        self.runtime = runtime
        self.original = pipeline.get_f0
        self.signature = inspect.signature(self.original)
        required = {"x", "p_len", "f0_up_key", "f0_method", "filter_radius"}
        if not required.issubset(self.signature.parameters):
            raise RuntimeError("The installed RVC get_f0 API is incompatible with OpenVoiceChanger")
        self.capabilities = capabilities or capability_map()
        self.realtime = True
        self.crepe_hop_length = int(np.clip(settings.CREPE_HOP_LENGTH, 64, 512))
        self._fcpe = None
        self._onnx_sessions: dict[str, Any] = {}
        pipeline.get_f0 = types.MethodType(self._dispatch, pipeline)

    @contextmanager
    def mode(self, *, realtime: bool, crepe_hop_length: int | None = None):
        previous = self.realtime, self.crepe_hop_length
        self.realtime = bool(realtime)
        if crepe_hop_length is not None:
            self.crepe_hop_length = int(np.clip(crepe_hop_length, 64, 512))
        try:
            yield
        finally:
            self.realtime, self.crepe_hop_length = previous

    def close(self):
        self._fcpe = None
        self._onnx_sessions.clear()

    def _ensure_available(self, method: str):
        info = self.capabilities.get(method)
        if info is None:
            raise ValueError(f"Unsupported F0 method: {method}")
        if self.realtime and not info["realtime"]:
            raise ValueError(f"{info['label']} is available for file conversion only")
        if not info["available"]:
            raise RuntimeError(f"{info['label']} is unavailable: {info['reason']}")

    def _dispatch(self, _pipeline, *args, **kwargs):
        bound = self.signature.bind(*args, **kwargs)
        bound.apply_defaults()
        values = bound.arguments
        method = normalize_f0_method(values["f0_method"])
        self._ensure_available(method)
        if method in NATIVE_METHODS:
            values["f0_method"] = method
            return self.original(**values)

        f0 = self._estimate(method, np.asarray(values["x"], dtype=np.float32),
                            int(values["p_len"]), int(values["filter_radius"]))
        pair = _pitch_pair(f0, int(values["p_len"]), float(values["f0_up_key"]))
        inp_f0 = values.get("inp_f0")
        return self._apply_external_curve(pair, inp_f0)

    def _native_hz(self, method: str, values: dict) -> np.ndarray:
        native = dict(values)
        native["f0_method"] = method
        native["f0_up_key"] = 0
        _coarse, f0 = self.original(**native)
        return _fit_f0(f0, int(values["p_len"]))

    def _estimate(self, method: str, audio: np.ndarray, p_len: int, filter_radius: int) -> np.ndarray:
        if method == "dio":
            return self._dio_hz(audio, p_len, filter_radius)
        if method in {"crepe-tiny", "mangio-crepe", "mangio-crepe-tiny"}:
            return self._torchcrepe_hz(audio, p_len, method)
        if method == "fcpe":
            return self._fcpe_hz(audio, p_len)
        if method == "rmvpe-onnx":
            return self._rmvpe_onnx_hz(audio, p_len)
        if method in {"crepe-onnx-full", "crepe-onnx-tiny"}:
            return self._crepe_onnx_hz(audio, p_len, method)
        if F0_METHOD_BY_ID[method].components:
            return self._hybrid_hz(method, audio, p_len, filter_radius)
        raise ValueError(f"Unsupported F0 method: {method}")

    def _dio_hz(self, audio: np.ndarray, p_len: int, filter_radius: int) -> np.ndarray:
        import pyworld

        source = audio.astype(np.float64, copy=False)
        rough, times = pyworld.dio(source, 16000, f0_floor=F0_MIN, f0_ceil=F0_MAX,
                                   channels_in_octave=2, frame_period=10.0)
        f0 = pyworld.stonemask(source, rough, times, 16000)
        if filter_radius > 2 and len(f0) >= 3:
            f0 = signal.medfilt(f0, 3)
        return _fit_f0(f0, p_len)

    def _torchcrepe_hz(self, audio: np.ndarray, p_len: int, method: str) -> np.ndarray:
        import torch
        import torchcrepe

        mangio = method.startswith("mangio-")
        tiny = method.endswith("tiny")
        source = audio.copy()
        if mangio:
            scale = float(np.quantile(np.abs(source), 0.999)) if source.size else 0.0
            if scale > 1e-7:
                source /= scale
        hop = self.crepe_hop_length if mangio else int(getattr(self.pipeline, "window", 160))
        tensor = torch.from_numpy(source).unsqueeze(0).float()
        with torch.no_grad():
            f0, periodicity = torchcrepe.predict(
                tensor, 16000, hop, F0_MIN, F0_MAX, "tiny" if tiny else "full",
                batch_size=512, device=self.runtime.device, return_periodicity=True,
            )
            periodicity = torchcrepe.filter.median(periodicity, 3)
            f0 = torchcrepe.filter.mean(f0, 3)
            f0[periodicity < 0.1] = 0
        values = f0[0].detach().float().cpu().numpy()
        if hop != 160 and len(values) > 1:
            values = np.interp(np.arange(p_len) * 160.0,
                               np.arange(len(values)) * float(hop), values,
                               left=0.0, right=0.0)
        return _fit_f0(values, p_len)

    def _fcpe_hz(self, audio: np.ndarray, p_len: int) -> np.ndarray:
        import torch
        import torchfcpe

        if self._fcpe is None:
            self._fcpe = torchfcpe.spawn_bundled_infer_model(device=self.runtime.device)
        tensor = torch.from_numpy(audio).unsqueeze(0).float().to(self.runtime.device)
        options = {
            "sr": 16000,
            "decoder_mode": "local_argmax",
            "threshold": 0.006,
            "f0_min": F0_MIN,
            "f0_max": F0_MAX,
            "interp_uv": False,
            "output_interp_target_length": p_len,
        }
        signature = inspect.signature(self._fcpe.infer)
        if not any(item.kind == inspect.Parameter.VAR_KEYWORD for item in signature.parameters.values()):
            options = {key: value for key, value in options.items() if key in signature.parameters}
        with torch.no_grad():
            f0 = self._fcpe.infer(tensor, **options)
        if hasattr(f0, "detach"):
            f0 = f0.detach().float().cpu().numpy()
        return _fit_f0(f0, p_len)

    def _onnx_session(self, method: str, path: str):
        if method not in self._onnx_sessions:
            import onnxruntime

            available = onnxruntime.get_available_providers()
            preferred = ["CUDAExecutionProvider", "DmlExecutionProvider", "CoreMLExecutionProvider",
                         "OpenVINOExecutionProvider", "CPUExecutionProvider"]
            providers = [provider for provider in preferred if provider in available] or available
            options = onnxruntime.SessionOptions()
            options.log_severity_level = 3
            self._onnx_sessions[method] = onnxruntime.InferenceSession(
                str(path), sess_options=options, providers=providers
            )
        return self._onnx_sessions[method]

    def _rmvpe_onnx_hz(self, audio: np.ndarray, p_len: int) -> np.ndarray:
        session = self._onnx_session("rmvpe-onnx", settings.RMVPE_ONNX_PATH)
        inputs = {item.name: item for item in session.get_inputs()}
        waveform = next((name for name in inputs if "wave" in name.lower()), next(iter(inputs), None))
        if waveform is None:
            raise RuntimeError("RMVPE ONNX model has no input")
        feed = {waveform: audio[None].astype(np.float32)}
        threshold = next((name for name in inputs if "threshold" in name.lower()), None)
        if threshold:
            feed[threshold] = np.array([0.3], dtype=np.float32)
        outputs = session.run(None, feed)
        if not outputs:
            raise RuntimeError("RMVPE ONNX model returned no pitch output")
        return _fit_f0(outputs[0], p_len)

    def _crepe_onnx_hz(self, audio: np.ndarray, p_len: int, method: str) -> np.ndarray:
        path = settings.CREPE_ONNX_TINY_PATH if method.endswith("tiny") else settings.CREPE_ONNX_FULL_PATH
        session = self._onnx_session(method, path)
        padded = np.pad(audio.astype(np.float32), (512, 512))
        total = 1 + len(audio) // 160
        predictions = []
        for first in range(0, total, 256):
            indices = first * 160 + np.arange(min(256, total - first))[:, None] * 160 + np.arange(1024)[None, :]
            frames = np.ascontiguousarray(padded[indices], dtype=np.float32)
            input_name = session.get_inputs()[0].name
            output = np.asarray(session.run(None, {input_name: frames})[0])
            output = np.squeeze(output)
            if output.ndim == 1:
                output = output[None]
            if output.shape[-1] != 360 and output.shape[0] == 360:
                output = output.T
            if output.shape[-1] != 360:
                raise RuntimeError(f"Crepe ONNX output must have 360 bins, got {output.shape}")
            predictions.append(output.astype(np.float32, copy=False))
        return _fit_f0(self._decode_crepe(np.concatenate(predictions)), p_len)

    @staticmethod
    def _decode_crepe(scores: np.ndarray) -> np.ndarray:
        cents = CREPE_CENTS_OFFSET + CREPE_CENTS_PER_BIN * np.arange(360, dtype=np.float32)
        frequencies = 10.0 * np.power(2.0, cents / 1200.0)
        valid = (frequencies >= F0_MIN) & (frequencies <= F0_MAX)
        masked = scores.copy()
        masked[:, ~valid] = -np.inf
        centers = np.argmax(masked, axis=1)
        result = np.zeros(len(masked), dtype=np.float32)
        for index, center in enumerate(centers):
            start, end = max(0, center - 4), min(360, center + 5)
            weights = np.maximum(masked[index, start:end], 0.0)
            if masked[index, center] < 0.1 or not np.isfinite(weights).all():
                continue
            denominator = float(weights.sum())
            estimated_cents = float(cents[center] if denominator <= 1e-12
                                    else np.dot(weights, cents[start:end]) / denominator)
            result[index] = 10.0 * 2.0 ** (estimated_cents / 1200.0)
        return result

    def _hybrid_hz(self, method: str, audio: np.ndarray, p_len: int, filter_radius: int) -> np.ndarray:
        tracks = []
        for component in F0_METHOD_BY_ID[method].components:
            if component in NATIVE_METHODS:
                values = {
                    "x": audio, "p_len": p_len, "f0_up_key": 0,
                    "f0_method": component, "filter_radius": filter_radius,
                }
                for name, parameter in self.signature.parameters.items():
                    if name not in values:
                        values[name] = parameter.default if parameter.default is not inspect.Parameter.empty else None
                tracks.append(self._native_hz(component, values))
            else:
                tracks.append(self._estimate(component, audio, p_len, filter_radius))
        stack = np.stack([np.where(track > 0, track, np.nan) for track in tracks])
        with np.errstate(all="ignore"):
            result = np.nanmedian(stack, axis=0)
        return np.nan_to_num(result, nan=0.0).astype(np.float32)

    def _apply_external_curve(self, pair, inp_f0):
        if inp_f0 is None:
            return pair
        coarse, pitchf = pair
        curve = np.asarray(inp_f0, dtype=np.float32)
        if curve.ndim != 2 or curve.shape[1] < 2 or not len(curve):
            return pair
        frame_rate = 16000 // int(getattr(self.pipeline, "window", 160))
        count = int(round((curve[:, 0].max() - curve[:, 0].min()) * frame_rate + 1))
        replacement = np.interp(np.arange(max(0, count)), curve[:, 0] * frame_rate, curve[:, 1])
        start = int(getattr(self.pipeline, "x_pad", 0) * frame_rate)
        end = min(len(pitchf), start + len(replacement))
        if end > start:
            pitchf[start:end] = replacement[:end - start]
            coarse, pitchf = _pitch_pair(pitchf, len(pitchf), 0)
        return coarse, pitchf
