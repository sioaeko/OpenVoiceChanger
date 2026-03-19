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
try:
    import onnxruntime
    _onnx_available = True
except ImportError:
    pass
try:
    import torch
    _torch_available = True
except ImportError:
    pass

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


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
