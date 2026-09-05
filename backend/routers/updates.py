import ipaddress
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.config import settings
from backend.security import is_origin_allowed
from backend.services.update_release import UpdateError

router = APIRouter(prefix="/api/updates", tags=["updates"])


def _loopback(host: str | None) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host or "").is_loopback
    except ValueError:
        return False


def _guard(request: Request, action="update"):
    try:
        host = request.headers.get("host", "")
        parsed_host = urlsplit(f"http://{host}")
        origin = request.headers.get("origin", "")
        parsed_origin = urlsplit(origin)
        parsed_host.port
        parsed_origin.port
        allowed = (
            request.client and _loopback(request.client.host)
            and _loopback(parsed_host.hostname) and not parsed_host.username
            and parsed_origin.scheme in {"http", "https"}
            and _loopback(parsed_origin.hostname) and not parsed_origin.username
            and not parsed_origin.path and not parsed_origin.query and not parsed_origin.fragment
            and is_origin_allowed(origin, host, settings.CORS_ORIGINS, allow_any=False)
            and request.headers.get("x-openvoicechanger-action") == action
        )
    except ValueError:
        allowed = False
    if not allowed:
        raise HTTPException(403, "Installation must be requested from the local studio on this computer.")


class InstallRequest(BaseModel):
    version: str = Field(pattern=r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$", max_length=32)
    model_config = {"extra": "forbid"}


@router.get("")
async def get_updates(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await request.app.state.updates.snapshot()


@router.post("/check")
async def check_updates(request: Request, response: Response):
    _guard(request)
    response.headers["Cache-Control"] = "no-store"
    await request.app.state.updates.check()
    return await request.app.state.updates.snapshot()


@router.post("/install", status_code=202)
async def install_update(payload: InstallRequest, request: Request):
    _guard(request)
    try:
        return await request.app.state.updates.install(payload.version)
    except UpdateError as exc:
        raise HTTPException(409, str(exc)) from exc
