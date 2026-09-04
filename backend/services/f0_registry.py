"""Canonical F0 method metadata and cheap runtime capability detection."""

from dataclasses import asdict, dataclass
import importlib.util
from pathlib import Path

from backend.config import settings


@dataclass(frozen=True, slots=True)
class F0Method:
    id: str
    label: str
    description: str
    section: str
    realtime: bool = True
    offline: bool = True
    dependency: str | None = None
    asset_setting: str | None = None
    components: tuple[str, ...] = ()


F0_METHODS = (
    F0Method("pm", "PM", "Lowest latency CPU tracking", "Classic", dependency="parselmouth"),
    F0Method("harvest", "Harvest", "Stable CPU tracking", "Classic", dependency="pyworld"),
    F0Method("dio", "DIO", "Lightweight CPU tracking", "Classic", dependency="pyworld"),
    F0Method("crepe", "Crepe Full", "Accurate neural tracking", "Neural", dependency="torchcrepe"),
    F0Method("crepe-tiny", "Crepe Tiny", "Lower-load neural tracking", "Neural", dependency="torchcrepe"),
    F0Method("mangio-crepe", "Mangio-Crepe", "Crepe with adjustable hop length", "Neural", dependency="torchcrepe"),
    F0Method("mangio-crepe-tiny", "Mangio-Crepe Tiny", "Light Crepe with adjustable hop", "Neural", dependency="torchcrepe"),
    F0Method("rmvpe", "RMVPE", "Recommended all-round neural tracking", "Neural", asset_setting="RMVPE_ROOT"),
    F0Method("fcpe", "FCPE", "Fast neural tracking", "Neural", dependency="torchfcpe"),
    F0Method("rmvpe-onnx", "RMVPE ONNX", "Portable ONNX inference", "ONNX", dependency="onnxruntime", asset_setting="RMVPE_ONNX_PATH"),
    F0Method("crepe-onnx-full", "Crepe ONNX Full", "Full ONNX Crepe model", "ONNX", dependency="onnxruntime", asset_setting="CREPE_ONNX_FULL_PATH"),
    F0Method("crepe-onnx-tiny", "Crepe ONNX Tiny", "Lower-load ONNX Crepe model", "ONNX", dependency="onnxruntime", asset_setting="CREPE_ONNX_TINY_PATH"),
    F0Method("hybrid[crepe+rmvpe]", "Hybrid: Crepe + RMVPE", "Median of two estimators", "Hybrid", realtime=False, components=("crepe", "rmvpe")),
    F0Method("hybrid[crepe+fcpe]", "Hybrid: Crepe + FCPE", "Median of two estimators", "Hybrid", realtime=False, components=("crepe", "fcpe")),
    F0Method("hybrid[rmvpe+fcpe]", "Hybrid: RMVPE + FCPE", "Median of two estimators", "Hybrid", realtime=False, components=("rmvpe", "fcpe")),
    F0Method("hybrid[crepe+rmvpe+fcpe]", "Hybrid: Crepe + RMVPE + FCPE", "Median of three estimators", "Hybrid", realtime=False, components=("crepe", "rmvpe", "fcpe")),
)
F0_METHOD_BY_ID = {method.id: method for method in F0_METHODS}
F0_METHOD_IDS = frozenset(F0_METHOD_BY_ID)

ALIASES = {
    "crepe_tiny": "crepe-tiny",
    "mangio_crepe": "mangio-crepe",
    "mangio_crepe_tiny": "mangio-crepe-tiny",
    "rmvpe_onnx": "rmvpe-onnx",
    "crepe_onnx_full": "crepe-onnx-full",
    "crepe_onnx_tiny": "crepe-onnx-tiny",
}

# The official runtime imports these modules at pipeline import time, regardless
# of the method selected. Report that prerequisite honestly before listing a
# detector as usable.
BASE_RUNTIME_MODULES = (
    ("rvc", "RVC runtime"),
    ("fairseq", "fairseq"),
    ("faiss", "faiss-cpu"),
    ("librosa", "librosa"),
    ("parselmouth", "praat-parselmouth"),
    ("pyworld", "pyworld"),
    ("torchcrepe", "torchcrepe"),
)


def normalize_f0_method(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("F0 method must be a string")
    method = ALIASES.get(value.strip().lower(), value.strip().lower())
    if method not in F0_METHOD_IDS:
        raise ValueError(f"Unsupported F0 method: {value}")
    return method


def _module_available(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ModuleNotFoundError, ValueError):
        return False


def _asset_path(setting_name: str) -> Path:
    path = Path(str(getattr(settings, setting_name)))
    return path / "rmvpe.pt" if setting_name == "RMVPE_ROOT" else path


def f0_capabilities() -> list[dict]:
    missing_base = next((label for module, label in BASE_RUNTIME_MODULES if not _module_available(module)), None)
    availability: dict[str, tuple[bool, str | None]] = {}

    for method in F0_METHODS:
        reason = None
        if missing_base:
            reason = f"Missing {missing_base}"
        elif method.dependency and not _module_available(method.dependency):
            reason = f"Missing {method.dependency}"
        elif method.asset_setting and not _asset_path(method.asset_setting).is_file():
            reason = f"Missing {_asset_path(method.asset_setting).as_posix()}"
        availability[method.id] = (reason is None, reason)

    for method in F0_METHODS:
        if not method.components or missing_base:
            continue
        missing = [F0_METHOD_BY_ID[item].label for item in method.components if not availability[item][0]]
        availability[method.id] = (not missing, f"Requires {', '.join(missing)}" if missing else None)

    result = []
    for method in F0_METHODS:
        available, reason = availability[method.id]
        result.append({
            **asdict(method),
            "components": list(method.components),
            "available": available,
            "reason": reason,
        })
    return result


def capability_map() -> dict[str, dict]:
    return {item["id"]: item for item in f0_capabilities()}
