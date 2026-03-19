import logging

from fastapi import APIRouter, HTTPException, Request, UploadFile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/models", tags=["models"])


def _get_manager(request: Request):
    """Retrieve the ModelManager instance from app state."""
    manager = getattr(request.app.state, "model_manager", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Model manager not initialized")
    return manager


@router.get("/")
async def list_models(request: Request) -> list[dict]:
    """List all available models with metadata."""
    manager = _get_manager(request)
    return manager.list_models()


@router.post("/upload")
async def upload_model(request: Request, file: UploadFile) -> dict:
    """Upload a new model file (.onnx or .pth)."""
    manager = _get_manager(request)

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    try:
        meta = await manager.upload_model(file.filename, file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Upload failed: %s", exc)
        raise HTTPException(status_code=500, detail="Upload failed")

    return meta


@router.delete("/{name}")
async def delete_model(request: Request, name: str) -> dict:
    """Delete a model by name."""
    manager = _get_manager(request)

    try:
        manager.delete_model(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Model not found: {name}")
    except Exception as exc:
        logger.error("Delete failed: %s", exc)
        raise HTTPException(status_code=500, detail="Delete failed")

    return {"status": "deleted", "name": name}


@router.post("/{name}/activate")
async def activate_model(request: Request, name: str) -> dict:
    """Activate a model for voice conversion."""
    manager = _get_manager(request)

    try:
        result = manager.activate_model(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Model not found: {name}")
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return result


@router.post("/deactivate")
async def deactivate_model(request: Request) -> dict:
    """Deactivate the currently active model."""
    manager = _get_manager(request)
    manager.deactivate_model()
    return {"status": "deactivated"}


@router.get("/active")
async def get_active_model(request: Request) -> dict:
    """Get info about the currently active model."""
    manager = _get_manager(request)
    active = manager.get_active_model()
    if active is None:
        return {"active": False}
    return active
