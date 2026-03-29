import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.routers import models, websocket
from backend.services.model_manager import ModelManager

_onnx_available = False
_torch_available = False
_onnxruntime = None
_torch = None
try:
    import onnxruntime as _onnxruntime
    _onnx_available = True
except ImportError:
    pass
try:
    import torch as _torch
    _torch_available = True
except ImportError:
    pass

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _get_onnx_runtime_info() -> dict:
    providers: list[str] = []
    if _onnx_available and _onnxruntime is not None:
        try:
            providers = list(_onnxruntime.get_available_providers())
        except Exception:
            logger.exception("Failed to inspect ONNX Runtime providers")

    active_provider = None
    selected_providers: list[str] = []
    gpu_enabled = False
    if "CUDAExecutionProvider" in providers:
        active_provider = "CUDAExecutionProvider"
        selected_providers = ["CUDAExecutionProvider"]
        if "CPUExecutionProvider" in providers:
            selected_providers.append("CPUExecutionProvider")
        gpu_enabled = True
    elif "CPUExecutionProvider" in providers:
        active_provider = "CPUExecutionProvider"
        selected_providers = ["CPUExecutionProvider"]
    elif providers:
        active_provider = providers[0]
        selected_providers = [providers[0]]

    return {
        "available": _onnx_available,
        "activeProvider": active_provider,
        "selectedProviders": selected_providers,
        "availableProviders": providers,
        "gpuEnabled": gpu_enabled,
    }


def _get_torch_runtime_info() -> dict:
    info = {
        "available": _torch_available,
        "device": "unavailable",
        "gpuName": None,
        "cudaAvailable": False,
        "cudaVersion": None,
    }

    if not _torch_available or _torch is None:
        return info

    try:
        if hasattr(_torch, "xpu") and _torch.xpu.is_available():
            info["device"] = "xpu:0"
            get_device_name = getattr(_torch.xpu, "get_device_name", None)
            if callable(get_device_name):
                info["gpuName"] = get_device_name(0)
            else:
                info["gpuName"] = "Intel XPU"
        elif _torch.cuda.is_available():
            info["device"] = "cuda:0"
            info["gpuName"] = _torch.cuda.get_device_name(0)
            info["cudaAvailable"] = True
            info["cudaVersion"] = _torch.version.cuda
        elif hasattr(_torch.backends, "mps") and _torch.backends.mps.is_available():
            info["device"] = "mps"
            info["gpuName"] = "Apple GPU"
        else:
            info["device"] = "cpu"
            info["gpuName"] = "CPU only"
    except Exception:
        logger.exception("Failed to inspect PyTorch runtime")

    return info


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize resources on startup, clean up on shutdown."""
    # Startup
    logger.info("Starting OpenVoiceChanger backend")
    logger.info("Models directory: %s", settings.MODELS_DIR)

    logger.info("ONNX Runtime: %s", "available" if _onnx_available else "NOT AVAILABLE — .onnx models won't work")
    logger.info("PyTorch: %s", "available" if _torch_available else "NOT AVAILABLE — .pth/RVC models won't work")

    manager = ModelManager(settings.MODELS_DIR)
    app.state.model_manager = manager

    logger.info("Backend ready — listening on %s:%d", settings.HOST, settings.PORT)
    yield

    # Shutdown
    logger.info("Shutting down — deactivating active model")
    manager.deactivate_model()
    logger.info("Shutdown complete")


app = FastAPI(
    title="OpenVoiceChanger",
    description="Real-time voice changer API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/config")
async def get_config():
    return {
        "sample_rate": settings.SAMPLE_RATE,
        "chunk_size": settings.CHUNK_SIZE,
        "onnx_available": _onnx_available,
        "torch_available": _torch_available,
        "runtime": {
            "onnx": _get_onnx_runtime_info(),
            "torch": _get_torch_runtime_info(),
        },
    }


# Include API routers
app.include_router(models.router)
app.include_router(websocket.router)

# Mount frontend static files if the dist directory exists
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
    logger.info("Serving frontend from %s", frontend_dist)
else:
    logger.info("Frontend dist directory not found at %s — skipping static mount", frontend_dist)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        log_level=settings.LOG_LEVEL.lower(),
        reload=False,
    )
