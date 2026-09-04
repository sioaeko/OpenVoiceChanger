"""Public, fixed-repository release discovery; no GitHub credentials are used."""

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from backend.version import version_tuple

REPOSITORY = "sioaeko/OpenVoiceChanger"
API_URL = f"https://api.github.com/repos/{REPOSITORY}"
REPOSITORY_URL = f"https://github.com/{REPOSITORY}"
MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024
SHA_PATTERN = re.compile(r"[0-9a-f]{40}\Z")
DIGEST_PATTERN = re.compile(r"sha256:([0-9a-f]{64})\Z")


class UpdateError(RuntimeError):
    pass


class _ReleaseRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlsplit(newurl)
        if parsed.scheme != "https" or parsed.hostname not in {
            "api.github.com", "github.com", "release-assets.githubusercontent.com",
            "objects.githubusercontent.com",
        }:
            raise UpdateError("The release download redirected to an unexpected host.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _open(url: str):
    request = Request(url, headers={
        "Accept": "application/vnd.github+json" if url.startswith(API_URL) else "application/octet-stream",
        "User-Agent": "OpenVoiceChanger-Updater",
        "X-GitHub-Api-Version": "2026-03-10",
    })
    return build_opener(_ReleaseRedirects()).open(request, timeout=20)


def _get_json(url: str) -> dict:
    with _open(url) as response:
        content = response.read(2 * 1024 * 1024 + 1)
    if len(content) > 2 * 1024 * 1024:
        raise UpdateError("The release metadata is too large.")
    result = json.loads(content)
    if not isinstance(result, dict):
        raise UpdateError("GitHub returned invalid release metadata.")
    return result


def asset_name(version: str) -> str:
    version_tuple(version)
    return f"OpenVoiceChanger-frontend-v{version}.zip"


@dataclass(frozen=True)
class Release:
    version: str
    commit: str
    size: int = 0
    digest: str = ""

    @property
    def tag(self) -> str:
        return f"v{self.version}"

    @property
    def url(self) -> str:
        return f"{REPOSITORY_URL}/releases/tag/{self.tag}"

    @property
    def installable(self) -> bool:
        return bool(SHA_PATTERN.fullmatch(self.commit)
                    and 0 < self.size <= MAX_DOWNLOAD_BYTES
                    and DIGEST_PATTERN.fullmatch(self.digest))

    def public(self) -> dict:
        return {"version": self.version, "url": self.url, "installable": self.installable}


def latest_release() -> Release | None:
    try:
        try:
            data = _get_json(f"{API_URL}/releases/latest")
        except HTTPError as exc:
            if exc.code == 404:
                return None
            raise
        if data.get("draft") or data.get("prerelease"):
            raise UpdateError("No stable public release was returned.")
        tag = data.get("tag_name", "")
        if not isinstance(tag, str) or not tag.startswith("v"):
            raise UpdateError("The release does not have a supported version tag.")
        version = tag[1:]
        version_tuple(version)
        commit = _get_json(f"{API_URL}/commits/{tag}").get("sha", "")
        if not isinstance(commit, str) or not SHA_PATTERN.fullmatch(commit):
            raise UpdateError("The release commit could not be verified.")
        assets = data.get("assets", [])
        if not isinstance(assets, list):
            raise UpdateError("GitHub returned invalid release assets.")
        matches = [item for item in assets if isinstance(item, dict)
                   and item.get("name") == asset_name(version) and item.get("state") == "uploaded"]
        if len(matches) != 1:
            return Release(version, commit)
        item = matches[0]
        size, digest = item.get("size"), item.get("digest")
        if type(size) is not int or not isinstance(digest, str):
            return Release(version, commit)
        return Release(version, commit, size, digest)
    except UpdateError:
        raise
    except HTTPError as exc:
        raise UpdateError(f"GitHub update check failed (HTTP {exc.code}). Try again later.") from exc
    except (URLError, OSError, ValueError, TypeError) as exc:
        raise UpdateError("Unable to verify updates. Check your connection and try again.") from exc


def download_release(release: Release, destination: Path) -> None:
    if not release.installable:
        raise UpdateError("This release has no verified frontend download. Update manually.")
    url = f"{REPOSITORY_URL}/releases/download/{release.tag}/{asset_name(release.version)}"
    digest = hashlib.sha256()
    total = 0
    try:
        with _open(url) as response, destination.open("xb") as output:
            while chunk := response.read(128 * 1024):
                total += len(chunk)
                if total > release.size or total > MAX_DOWNLOAD_BYTES:
                    raise UpdateError("The release download exceeded its declared size.")
                digest.update(chunk)
                output.write(chunk)
    except (URLError, OSError) as exc:
        raise UpdateError("The release download failed. No application files were changed.") from exc
    if total != release.size or f"sha256:{digest.hexdigest()}" != release.digest:
        raise UpdateError("The release download failed SHA-256 verification.")
