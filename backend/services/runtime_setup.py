"""Isolated, cancellable runtime preparation. Only the managed launcher runs it."""

import hashlib
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess
import time
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import zipfile

from backend.services.setup_manifest import ASSETS, MIN_FREE_BYTES, PROFILE, PYTHON_VERSION, SOURCES, UV
from backend.services.update_installer import JOB_PATTERN, _safe_archive_path, atomic_json, owned_path, read_json
from backend.services.update_release import UpdateError


class SetupError(UpdateError):
    pass


class SetupCancelled(SetupError):
    pass


def setup_directory(root: Path) -> Path:
    return owned_path(root, "data", "rvc-setup")


def setup_job(root: Path, job_id: str) -> Path:
    if not isinstance(job_id, str) or not JOB_PATTERN.fullmatch(job_id):
        raise SetupError("Invalid runtime setup job.")
    return owned_path(root, "data", "rvc-setup", "jobs", job_id)


def selected_runtime(root: Path) -> dict | None:
    active = read_json(setup_directory(root) / "active.json")
    if not active:
        return None
    job = setup_job(root, active.get("job_id"))
    marker = read_json(owned_path(root, str(job.relative_to(root)), "verified.json"))
    python = owned_path(root, str(job.relative_to(root)), "venv", "Scripts", "python.exe")
    hubert = owned_path(root, str(job.relative_to(root)), "assets", "hubert_base.pt")
    rmvpe = owned_path(root, str(job.relative_to(root)), "assets", "rmvpe", "rmvpe.pt")
    if marker.get("profile") != PROFILE or not all(path.is_file() for path in (python, hubert, rmvpe)):
        raise SetupError("The selected RVC environment is incomplete. Restore data/rvc-setup/active.json or reinstall.")
    return {"job_id": active["job_id"], "python": str(job / "venv" / "Scripts" / "python.exe"),
            "env": {"OVC_HUBERT_PATH": str(job / "assets" / "hubert_base.pt"),
                    "OVC_RMVPE_ROOT": str(job / "assets" / "rmvpe"), "OVC_RVC_SETUP_JOB": active["job_id"]}}


def preflight(root: Path) -> dict:
    directory = setup_directory(root)
    supported = platform.system() == "Windows" and platform.machine().lower() in {"amd64", "x86_64"}
    free = shutil.disk_usage(directory if directory.exists() else root).free
    blocked = None if supported else "One-click setup currently supports Windows x64 CPU only. Use the installation guide on other platforms."
    if supported and free < MIN_FREE_BYTES:
        blocked = "At least 6 GiB of free disk space is required for the isolated runtime."
    return {"profile": PROFILE, "label": "Windows x64 / CPU", "python": PYTHON_VERSION,
            "free_bytes": free, "required_free_bytes": MIN_FREE_BYTES,
            "asset_bytes": sum(asset["limit"] for asset in ASSETS), "blocked": blocked}


def _trusted_url(url: str) -> bool:
    try:
        parsed = urlsplit(url)
        host = parsed.hostname or ""
        return (parsed.scheme == "https" and not parsed.username and not parsed.password
                and parsed.port in {None, 443} and not parsed.fragment
                and (host in {"files.pythonhosted.org", "codeload.github.com", "huggingface.co"}
                     or host.endswith(".huggingface.co") or host.endswith(".hf.co")))
    except ValueError:
        return False


class TrustedRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _trusted_url(newurl):
            raise SetupError("A runtime download redirected to an unapproved host.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def sha256(path: Path) -> str:
    # Also runs in Python 3.10, whose hashlib has no file_digest.
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_checked(asset, target: Path, report, cancelled=lambda: False):
    if cancelled():
        raise SetupCancelled("Setup cancelled. The previous runtime is unchanged.")
    temporary = target.with_suffix(target.suffix + ".part")
    for path in (target, temporary):
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise SetupError("Linked or non-file download targets are not supported.")
    if target.is_file() and sha256(target) == asset["sha256"]:
        return target
    if not _trusted_url(asset["url"]):
        raise SetupError("Unapproved runtime download URL.")
    temporary.unlink(missing_ok=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    opener = build_opener(TrustedRedirects())
    digest = hashlib.sha256()
    received = 0
    last_report = 0.0
    try:
        with opener.open(Request(asset["url"], headers={"User-Agent": "OpenVoiceChanger-RuntimeSetup"}), timeout=30) as response, temporary.open("xb") as output:
            total = int(response.headers.get("Content-Length", "0"))
            if total > asset["limit"]:
                raise SetupError("Runtime download exceeds its size limit.")
            while True:
                if cancelled():
                    raise SetupCancelled("Setup cancelled. The previous runtime is unchanged.")
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                received += len(chunk)
                if received > asset["limit"]:
                    raise SetupError("Runtime download exceeds its size limit.")
                digest.update(chunk)
                output.write(chunk)
                if time.monotonic() - last_report >= 0.5:
                    report(asset["name"], received, total or None)
                    last_report = time.monotonic()
        if digest.hexdigest() != asset["sha256"]:
            raise SetupError(f"SHA-256 verification failed for {asset['name']}. Retry the download.")
        os.replace(temporary, target)
        report(asset["name"], received, received)
        return target
    finally:
        temporary.unlink(missing_ok=True)


def unpack_source(archive: Path, destination: Path, package: str | None = None) -> Path:
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        if len(entries) > 20000 or sum(item.file_size for item in entries) > 256 * 1024**2:
            raise SetupError("Runtime source archive exceeds extraction limits.")
        if package:
            entries = [item for item in entries if len(item.filename.rstrip('/').split('/')) <= 2
                       or item.filename.split('/')[1] == package]
        names = set()
        roots = set()
        for entry in entries:
            name = entry.filename.rstrip("/")
            mode = entry.external_attr >> 16
            if (not _safe_archive_path(name) or name.casefold() in names or stat.S_ISLNK(mode)
                    or stat.S_IFMT(mode) not in {0, stat.S_IFREG, stat.S_IFDIR}):
                raise SetupError("Unsafe path in runtime source archive.")
            names.add(name.casefold())
            roots.add(name.split("/")[0])
        if len(roots) != 1:
            raise SetupError("Unexpected runtime archive layout.")
        source.extractall(destination, members=entries)
        return destination / roots.pop()


class RuntimeInstaller:
    def __init__(self, root: Path, job_id: str, report):
        self.root = root.resolve()
        self.directory = setup_directory(self.root)
        for name in ("cache", "python", "bin", "downloads"):
            owned_path(self.root, "data", "rvc-setup", name)
        self.job = setup_job(self.root, job_id)
        self.job_id = job_id
        self.report = report
        self.phase = "preparing"
        self.env = {key: value for key, value in os.environ.items()
                    if not key.startswith(("UV_", "PIP_", "PYTHON")) and key != "VIRTUAL_ENV"}
        self.env.update({"PYTHONUTF8": "1", "UV_NO_CONFIG": "1",
                         "UV_CACHE_DIR": str(self.directory / "cache"),
                         "UV_PYTHON_INSTALL_DIR": str(self.directory / "python"),
                         "UV_PYTHON_BIN_DIR": str(self.directory / "bin")})

    def cancelled(self):
        return read_json(self.directory / "cancel.json").get("job_id") == self.job_id

    def stage(self, phase):
        if self.cancelled():
            raise SetupCancelled("Setup cancelled. The previous runtime is unchanged.")
        self.phase = phase
        self.report(phase)

    def run(self, arguments, timeout=1800):
        with (self.job / "setup.log").open("ab") as log:
            process = subprocess.Popen([str(arg) for arg in arguments], cwd=self.root, env=self.env,
                                       stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            deadline = time.monotonic() + timeout
            try:
                while process.poll() is None:
                    if self.cancelled():
                        raise SetupCancelled("Setup cancelled. The previous runtime is unchanged.")
                    if time.monotonic() > deadline:
                        raise SetupError(f"The {self.phase} step timed out. Retry setup; verified downloads will be reused.")
                    time.sleep(0.2)
                if process.returncode:
                    raise SetupError(f"The {self.phase} step failed (exit {process.returncode}). See data/rvc-setup/jobs/{self.job_id}/setup.log.")
            finally:
                if process.poll() is None:
                    if os.name == "nt":
                        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW, timeout=30)
                    else:
                        process.kill()
                    process.wait(timeout=30)

    def download(self, asset):
        target = owned_path(self.root, "data", "rvc-setup", "downloads", asset["name"])
        return download_checked(asset, target, lambda name, done, total: self.report(
            self.phase, file=name, downloaded_bytes=done, total_bytes=total), self.cancelled)

    def prepare(self):
        plan = preflight(self.root)
        if plan["blocked"]:
            raise SetupError(plan["blocked"])
        self.job.mkdir(parents=True, exist_ok=False)
        self.stage("preparing")
        wheel = self.download(UV)
        with zipfile.ZipFile(wheel) as archive:
            executable = [item for item in archive.infolist() if item.filename.endswith("/uv.exe")]
            if len(executable) != 1 or executable[0].file_size > 100 * 1024**2:
                raise SetupError("Unexpected uv bootstrap wheel.")
            uv = self.job / "uv.exe"
            uv.write_bytes(archive.read(executable[0]))
        self.stage("python")
        self.run([uv, "venv", "--python", PYTHON_VERSION, "--managed-python", "--no-config", self.job / "venv"])
        python = self.job / "venv" / "Scripts" / "python.exe"
        self.stage("packages")
        self.run([uv, "pip", "sync", "--python", python, "--require-hashes", "--torch-backend", "cpu", "--no-config",
                  self.root / "backend" / "runtime" / "windows-cpu.lock"])
        self.stage("sources")
        site = self.job / "venv" / "Lib" / "site-packages"
        for source in SOURCES:
            extracted = unpack_source(self.download(source), self.job / "sources" / source["package"], source["package"])
            # Only inference packages are installed. Training/C++ extensions and upstream setup scripts are not executed.
            shutil.copytree(extracted / source["package"], site / source["package"])
            if source["package"] == "fairseq":
                version = (site / "fairseq" / "version.txt").read_text().strip()
                if not re.fullmatch(r"[0-9A-Za-z.+-]+", version):
                    raise SetupError("Unexpected fairseq version metadata.")
                (site / "fairseq" / "version.py").write_text(f'__version__ = "{version}"\n', encoding="utf-8")
        self.stage("assets")
        for asset in ASSETS:
            source = self.download(asset)
            destination = self.job / "assets" / ("rmvpe" if asset["name"] == "rmvpe.pt" else "") / asset["name"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
        self.stage("verifying")
        self.run([python, "-m", "backend.runtime.verify", str(self.job)], timeout=600)
        marker = read_json(self.job / "verified.json")
        if marker.get("profile") != PROFILE:
            raise SetupError("The new environment did not pass runtime verification.")
        return self.job
