from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.routers.updates import _guard
from backend.services.update_release import UpdateError

router = APIRouter(prefix="/api/runtime-setup", tags=["runtime-setup"])


class InstallRequest(BaseModel):
    profile: Literal["windows-cpu-v1"]
    model_config = {"extra": "forbid"}


class CancelRequest(BaseModel):
    job_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    model_config = {"extra": "forbid"}


@router.get("")
async def status(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return request.app.state.runtime_setup.snapshot()


@router.post("/install", status_code=202)
async def install(payload: InstallRequest, request: Request):
    _guard(request, action="runtime-setup")
    try:
        return await request.app.state.runtime_setup.install()
    except UpdateError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/cancel", status_code=202)
async def cancel(payload: CancelRequest, request: Request):
    _guard(request, action="runtime-setup")
    try:
        return request.app.state.runtime_setup.cancel(payload.job_id)
    except UpdateError as exc:
        raise HTTPException(409, str(exc)) from exc
