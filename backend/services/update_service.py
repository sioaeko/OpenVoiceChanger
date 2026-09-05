import asyncio
from contextlib import suppress
from datetime import datetime, timezone
import os
from pathlib import Path
import time
import uuid

from backend.config import settings
from backend.services.update_activity import UpdateActivity
from backend.services.update_installer import BUSY_PHASES, UpdateInstaller, atomic_json, read_json
from backend.services.update_release import UpdateError, latest_release
from backend.services.setup_manifest import SETUP_BUSY
from backend.version import ROOT, VERSION, version_tuple

CHECK_INTERVAL = 3600
MANUAL_CHECK_INTERVAL = 60


class UpdateService:
    def __init__(self, root: Path = ROOT, *, enabled=True, checker=latest_release):
        self.root = root
        self.enabled = enabled
        self.checker = checker
        self.installer = UpdateInstaller(root, data_paths=(settings.MODELS_DIR, settings.PRESETS_PATH,
                                                         settings.HUBERT_PATH, settings.RMVPE_ROOT,
                                                         settings.RMVPE_ONNX_PATH,
                                                         settings.CREPE_ONNX_FULL_PATH,
                                                         settings.CREPE_ONNX_TINY_PATH))
        self.activity = UpdateActivity()
        self.instance = os.environ.get("OVC_UPDATE_INSTANCE", "")
        self.release = None
        self.checked_at = None
        self.check_error = None
        self.checking = False
        self._last_attempt = float("-inf")
        self._check_lock = asyncio.Lock()
        self._install_lock = asyncio.Lock()
        self._task = None

    def managed(self) -> bool:
        runtime = read_json(self.installer.state_dir / "runtime.json")
        # Windows venv python.exe is a redirector; the actual interpreter is its child.
        process_ids = {os.getpid()}
        if os.name == "nt":
            process_ids.add(os.getppid())
        return bool(self.instance and runtime.get("instance") == self.instance
                    and runtime.get("pid") in process_ids)

    def operation(self) -> dict:
        value = read_json(self.installer.state_dir / "state.json")
        if not self.managed() or value.get("instance") != self.instance:
            return {"phase": "idle"}
        return value

    def sync_activity(self):
        setup = read_json(self.root / "data" / "rvc-setup" / "state.json")
        setup_busy = (self.managed() and setup.get("instance") == self.instance
                      and setup.get("phase") in SETUP_BUSY)
        self.activity.set_maintenance(self.operation().get("phase") in BUSY_PHASES or setup_busy)

    async def start(self):
        self.sync_activity()
        self._task = asyncio.create_task(self._loop())

    async def close(self):
        if self._task:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task

    async def _loop(self):
        while True:
            self.sync_activity()
            if self.enabled and time.monotonic() - self._last_attempt >= CHECK_INTERVAL:
                await self.check()
            await asyncio.sleep(1)

    async def check(self):
        async with self._check_lock:
            if time.monotonic() - self._last_attempt < MANUAL_CHECK_INTERVAL:
                return
            self._last_attempt = time.monotonic()
            self.checking = True
            try:
                self.release = await asyncio.to_thread(self.checker)
                self.checked_at = datetime.now(timezone.utc).isoformat()
                self.check_error = None
            except UpdateError as exc:
                self.check_error = str(exc)
            except Exception:
                self.check_error = "Unable to check for updates. Try again later."
            finally:
                self.checking = False

    async def snapshot(self):
        operation = self.operation()
        busy = operation.get("phase") in BUSY_PHASES
        self.sync_activity()
        available = bool(self.release and version_tuple(self.release.version) > version_tuple(VERSION))
        blocked = None
        if not self.managed():
            blocked = "Start the studio with python launch.py to install updates here."
        elif available and not self.release.installable:
            blocked = "This release has no verified app bundle. Open the release page to update manually."
        elif available and not busy:
            try:
                await asyncio.to_thread(self.installer.preflight)
            except UpdateError as exc:
                blocked = str(exc)
        status = "available" if available else "up_to_date" if self.release else "no_release" if self.checked_at else "not_checked"
        if self.check_error:
            status = "error"
        # A preflight may have overlapped the launcher's next phase.
        operation = self.operation()
        busy = operation.get("phase") in BUSY_PHASES
        self.sync_activity()
        return {
            "current_version": VERSION,
            "status": status,
            "available": available,
            "latest": self.release.public() if self.release else None,
            "checking": self.checking,
            "automatic_checks": self.enabled,
            "checked_at": self.checked_at,
            "check_error": self.check_error,
            "install_blocked": blocked,
            "busy": busy,
            "operation": operation,
        }

    async def install(self, version: str):
        async with self._install_lock:
            if not self.managed():
                raise UpdateError("Start the studio with python launch.py to install updates here.")
            if self.check_error or not self.release or version != self.release.version:
                raise UpdateError("Check for updates again before installing.")
            if version_tuple(version) <= version_tuple(VERSION) or not self.release.installable:
                raise UpdateError("No newer verified release is available.")
            # Keep maintenance excluded from the periodic state reader until it is persisted.
            await asyncio.to_thread(self.installer.preflight)
            self.activity.begin_update()
            job_id = uuid.uuid4().hex
            state = {"instance": self.instance, "job_id": job_id, "version": version, "phase": "queued"}
            try:
                atomic_json(self.installer.state_dir / "state.json", state)
                atomic_json(self.installer.state_dir / "request.json", state)
            except OSError as exc:
                self.activity.set_maintenance(False)
                atomic_json(self.installer.state_dir / "state.json", {**state, "phase": "error", "error": "Unable to queue the update."})
                raise UpdateError("Unable to queue the update. No app files were changed.") from exc
            return state
