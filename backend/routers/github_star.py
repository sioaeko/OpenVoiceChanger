"""Explicit, local-only GitHub starring through the user's ``gh`` login.

The repository is intentionally fixed in server code. The browser can request
one action -- starring OpenVoiceChanger -- but cannot choose a command, owner,
or repository. This keeps the local GitHub credential out of the frontend and
out of OpenVoiceChanger's storage.
"""

from __future__ import annotations

import ipaddress
import os
import re
import shutil
import subprocess

from fastapi import APIRouter, HTTPException, Request, status

from backend.config import settings
from backend.security import is_origin_allowed

router = APIRouter(prefix="/api/github", tags=["github"])

GITHUB_REPOSITORY = "sioaeko/OpenVoiceChanger"
_STAR_API_PATH = f"/user/starred/{GITHUB_REPOSITORY}"
_ACTION_HEADER = "x-openvoicechanger-action"
_ACTION_VALUE = "star"
_COMMAND_TIMEOUT_SECONDS = 10
_HTTP_STATUS_RE = re.compile(r"\bHTTP(?:/\S+)?\s+(\d{3})\b", re.IGNORECASE)


class GitHubCliError(RuntimeError):
    """A locally actionable ``gh`` availability or execution failure."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _run_gh(*arguments: str) -> subprocess.CompletedProcess[str]:
    """Run one fixed-shape GitHub CLI command without a shell or prompt."""
    executable = shutil.which("gh")
    if executable is None:
        raise GitHubCliError("gh_not_installed")

    environment = os.environ.copy()
    environment.update({
        "GH_PROMPT_DISABLED": "1",
        "GH_PAGER": "cat",
        "NO_COLOR": "1",
    })

    try:
        return subprocess.run(
            [executable, *arguments],
            capture_output=True,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            encoding="utf-8",
            errors="replace",
            env=environment,
            stdin=subprocess.DEVNULL,
            text=True,
            timeout=_COMMAND_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise GitHubCliError("github_timeout") from exc
    except OSError as exc:
        raise GitHubCliError("gh_unavailable") from exc


def _http_status(result: subprocess.CompletedProcess[str]) -> int | None:
    output = f"{result.stdout}\n{result.stderr}"
    match = _HTTP_STATUS_RE.search(output)
    return int(match.group(1)) if match else None


def _failure_reason(result: subprocess.CompletedProcess[str]) -> str:
    output = f"{result.stdout}\n{result.stderr}".lower()
    response_status = _http_status(result)
    if response_status in {401, 403} or "gh auth login" in output or "authentication" in output:
        return "github_auth_required"
    if "could not resolve host" in output or "connection" in output:
        return "github_unreachable"
    return "github_unavailable"


def _unavailable(reason: str) -> dict:
    return {
        "available": False,
        "starred": None,
        "reason": reason,
        "repository": GITHUB_REPOSITORY,
    }


def _query_star_state() -> dict:
    try:
        result = _run_gh("api", "--silent", _STAR_API_PATH)
    except GitHubCliError as exc:
        return _unavailable(exc.reason)

    if result.returncode == 0:
        return {
            "available": True,
            "starred": True,
            "reason": None,
            "repository": GITHUB_REPOSITORY,
        }
    if _http_status(result) == 404:
        return {
            "available": True,
            "starred": False,
            "reason": None,
            "repository": GITHUB_REPOSITORY,
        }
    return _unavailable(_failure_reason(result))


def _star_repository() -> dict:
    try:
        result = _run_gh(
            "api",
            "--silent",
            "--method",
            "PUT",
            "-H",
            "Accept: application/vnd.github+json",
            _STAR_API_PATH,
        )
    except GitHubCliError as exc:
        return _unavailable(exc.reason)

    if result.returncode != 0:
        return _unavailable(_failure_reason(result))
    return {
        "available": True,
        "starred": True,
        "reason": None,
        "repository": GITHUB_REPOSITORY,
    }


def _is_loopback_client(host: str | None) -> bool:
    if not host:
        return False
    if host.lower() == "localhost":
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        return address.ipv4_mapped.is_loopback
    return address.is_loopback


def _require_local_browser_action(request: Request) -> None:
    client_host = request.client.host if request.client else None
    origin = request.headers.get("origin")
    host = request.headers.get("host")

    # The write uses a credential stored on this machine, so LAN clients are
    # deliberately sent through the ordinary GitHub link instead.
    if not _is_loopback_client(client_host):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="GitHub Star requires a click from this device.",
        )

    # Browsers attach Origin to POST. Requiring it, plus a non-simple custom
    # header, prevents an unrelated page from driving the localhost endpoint.
    allowed_origins = [item for item in settings.CORS_ORIGINS if item != "*"]
    if not origin or not is_origin_allowed(origin, host, allowed_origins, allow_any=False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="GitHub Star requires an allowed browser origin.",
        )
    if request.headers.get(_ACTION_HEADER) != _ACTION_VALUE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="GitHub Star requires an explicit button action.",
        )


@router.get("/star")
def get_star_state():
    """Report whether the active GitHub CLI account has starred the repo."""
    return _query_star_state()


@router.post("/star")
def star_repository(request: Request):
    """Star the fixed repository after an explicit same-device browser click."""
    _require_local_browser_action(request)
    result = _star_repository()
    if not result["available"] or not result["starred"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub CLI could not star the repository. Open GitHub to finish manually.",
        )
    return result
