import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/presets", tags=["presets"])


class PresetPayload(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    emoji: str = Field(default="⭐", max_length=4)
    settings: dict


def _get_store(request: Request):
    store = getattr(request.app.state, "preset_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="Preset store not initialized")
    return store


@router.get("/")
async def list_presets(request: Request) -> dict:
    """List built-in and user presets."""
    store = _get_store(request)
    return {"builtin": store.list_builtin(), "user": store.list_user()}


@router.post("/")
async def save_preset(request: Request, payload: PresetPayload) -> dict:
    """Save (or overwrite) a user preset."""
    store = _get_store(request)
    try:
        return store.save(payload.name, payload.settings, payload.emoji)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Failed to save preset")
        raise HTTPException(status_code=500, detail="Failed to save preset")


@router.delete("/{preset_id}")
async def delete_preset(request: Request, preset_id: str) -> dict:
    """Delete a user preset by id."""
    store = _get_store(request)
    try:
        store.delete(preset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Preset not found: {preset_id}")
    return {"status": "deleted", "id": preset_id}
