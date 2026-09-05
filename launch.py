"""Run the studio with an opt-in, supervised update/restart path."""

import argparse
from contextlib import contextmanager
import json
import logging
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.request import ProxyHandler, build_opener
import uuid

from backend.config import settings
from backend.services.update_installer import (
    BUSY_PHASES, JOB_PATTERN, UpdateInstaller, atomic_json, owned_path, read_json,
)
from backend.services.update_release import UpdateError, latest_release
from backend.services.runtime_setup import (
    RuntimeInstaller, SetupCancelled, SetupError, selected_runtime, setup_directory, setup_job,
)
from backend.services.setup_manifest import PROFILE, SETUP_BUSY
from backend.version import ROOT, read_version

logger = logging.getLogger("OpenVoiceChanger.launcher")


@contextmanager
def launcher_lock(directory: Path):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / "launcher.lock").open("a+b") as lock:
        lock.seek(0, os.SEEK_END)
        if lock.tell() == 0:
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise UpdateError("Another managed launcher is already running for this installation.") from exc
        try:
            yield
        finally:
            lock.seek(0)
            if os.name == "nt":
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


class Launcher:
    def __init__(self, root=ROOT, *, host="127.0.0.1", port=8000):
        self.root = root.resolve()
        self.host = host
        self.port = port
        self.instance = uuid.uuid4().hex
        self.installer = UpdateInstaller(self.root, data_paths=(settings.MODELS_DIR, settings.PRESETS_PATH,
                                                              settings.HUBERT_PATH, settings.RMVPE_ROOT,
                                                              settings.RMVPE_ONNX_PATH,
                                                              settings.CREPE_ONNX_FULL_PATH,
                                                              settings.CREPE_ONNX_TINY_PATH))
        self.directory = self.installer.state_dir
        self.setup_directory = setup_directory(self.root)
        self.child = None
        address = f"[{host}]" if ":" in host else host
        self.url = f"http://{address}:{port}"

    def start(self):
        family = socket.AF_INET6 if ":" in self.host else socket.AF_INET
        with socket.socket(family) as probe:
            if os.name != "nt":
                # Match what asyncio (and therefore uvicorn) does on POSIX: a
                # port whose only remaining sockets are TIME_WAIT leftovers from
                # the previous server's connections is free to bind. Without
                # this the probe rejects a restart on the same port that the
                # server itself would have accepted. Windows has no such
                # TIME_WAIT rule, and SO_REUSEADDR there would let the probe
                # succeed on a port another process is actively listening on.
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind((self.host, self.port))
            except OSError as exc:
                raise UpdateError(f"Port {self.port} is already in use. Choose another --port.") from exc
        runtime = selected_runtime(self.root)
        self.child = subprocess.Popen(
            [runtime["python"] if runtime else sys.executable, "-m", "uvicorn", "backend.main:app", "--host", self.host, "--port", str(self.port)],
            cwd=self.root, stdin=subprocess.DEVNULL,
            env={**os.environ, "OVC_UPDATE_INSTANCE": self.instance,
                 "OVC_HOST": self.host, "OVC_PORT": str(self.port), "PYTHONUTF8": "1",
                 **(runtime["env"] if runtime else {})},
        )
        atomic_json(self.directory / "runtime.json", {"instance": self.instance, "pid": self.child.pid})

    def stop(self):
        if self.child and self.child.poll() is None:
            if os.name == "nt":
                # Include the interpreter spawned by Windows' venv redirector.
                subprocess.run(["taskkill", "/PID", str(self.child.pid), "/T", "/F"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=subprocess.CREATE_NO_WINDOW, timeout=30, check=True)
            else:
                self.child.terminate()
            try:
                self.child.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.child.kill()
                self.child.wait(timeout=10)
        self.child = None

    def healthy(self, version: str, timeout=120) -> bool:
        deadline = time.monotonic() + timeout
        opener = build_opener(ProxyHandler({}))
        runtime = selected_runtime(self.root)
        while time.monotonic() < deadline:
            if not self.child or self.child.poll() is not None:
                return False
            try:
                with opener.open(f"{self.url}/api/config", timeout=2) as response:
                    config = json.loads(response.read(128 * 1024))
                runtime_ready = (not runtime or (config.get("runtime_setup_job") == runtime["job_id"]
                                 and config.get("runtime", {}).get("rvc", {}).get("prerequisitesDetected")))
                if config.get("version") == version and config.get("update_instance") == self.instance and runtime_ready:
                    return True
            except (OSError, ValueError):
                pass
            time.sleep(0.5)
        return False

    def report(self, job_id: str, version: str, phase: str, error=None):
        atomic_json(self.directory / "state.json", {
            "instance": self.instance, "job_id": job_id, "version": version,
            "phase": phase, "error": error,
        })
        logger.info("Update %s: %s%s", version, phase, f" ({error})" if error else "")

    def recover_interrupted(self):
        previous = read_json(self.directory / "state.json")
        if previous.get("phase") not in BUSY_PHASES:
            return
        job_id = previous.get("job_id", "")
        if not isinstance(job_id, str) or not JOB_PATTERN.fullmatch(job_id):
            raise UpdateError("The interrupted update record is invalid. Inspect tmp/updater before restarting.")
        job = owned_path(self.root, "tmp", "updater", "jobs", job_id)
        if previous["phase"] in {"applying", "restarting", "rolling_back"}:
            logger.warning("Recovering interrupted update %s", job_id)
            self.installer.rollback(job)
        self.report(job_id, previous.get("version", ""), "rolled_back", "An interrupted update was cancelled; the previous version is active.")

    def update(self, request: dict):
        job_id, version = request.get("job_id", ""), request.get("version", "")
        if (request.get("instance") != self.instance or not isinstance(job_id, str)
                or not JOB_PATTERN.fullmatch(job_id)):
            raise UpdateError("The queued update does not belong to this launcher.")
        report = lambda phase, error=None: self.report(job_id, version, phase, error)
        try:
            report("preparing")
            release = latest_release()
            if release is None or release.version != version:
                raise UpdateError("The latest release changed. Check for updates again.")
            prepared = self.installer.prepare(release, job_id, report)
            self.installer.install(prepared, stop=self.stop, start=self.start, healthy=self.healthy, report=report)
        except Exception as exc:
            logger.exception("Update failed")
            # Keep a failed rollback recoverable on the next launch.
            current = read_json(self.directory / "state.json")
            phase = "recovery_required" if current.get("phase") == "rolling_back" else "error"
            report(phase, str(exc) if isinstance(exc, UpdateError) else "The update failed. Check the launcher log.")

    def run(self):
        with launcher_lock(self.directory):
            previous = read_json(self.directory / "state.json")
            if previous.get("phase") == "recovery_required":
                raise UpdateError("An update needs manual recovery. See tmp/updater/state.json and the launcher log.")
            self.recover_interrupted()
            self.recover_setup()
            (self.setup_directory / "request.json").unlink(missing_ok=True)
            (self.directory / "request.json").unlink(missing_ok=True)
            if read_json(self.directory / "state.json").get("instance") != self.instance:
                atomic_json(self.directory / "state.json", {"instance": self.instance, "phase": "idle"})
            try:
                self.start()
                if not self.healthy(read_version(self.root)):
                    raise UpdateError("The studio did not become ready. Check the server output above.")
                logger.info("Studio ready: %s", self.url)
                while self.child and self.child.poll() is None:
                    request_path = self.directory / "request.json"
                    if request_path.exists():
                        request = read_json(request_path)
                        request_path.unlink()
                        self.update(request)
                    setup_request = self.setup_directory / "request.json"
                    if setup_request.exists():
                        request = read_json(setup_request)
                        setup_request.unlink()
                        self.setup_runtime(request)
                    time.sleep(0.5)
            finally:
                self.stop()
                (self.directory / "runtime.json").unlink(missing_ok=True)

    def report_setup(self, job_id, phase, **details):
        atomic_json(self.setup_directory / "state.json", {
            "instance": self.instance, "job_id": job_id, "profile": PROFILE, "phase": phase, **details,
        })
        if not details.get("file"):
            logger.info("RVC setup %s: %s", job_id, phase)

    def restore_runtime(self, job_id):
        job = setup_job(self.root, job_id)
        rollback = read_json(job / "rollback.json")
        if "previous" not in rollback or not isinstance(rollback["previous"], dict):
            raise SetupError("Runtime recovery record is missing. Inspect data/rvc-setup before restarting.")
        active = read_json(self.setup_directory / "active.json")
        if active.get("job_id") not in {job_id, rollback["previous"].get("job_id")}:
            raise SetupError("The selected runtime changed outside setup. Manual recovery is required.")
        atomic_json(self.setup_directory / "active.json", rollback["previous"])

    def recover_setup(self):
        state = read_json(self.setup_directory / "state.json")
        phase, job_id = state.get("phase"), state.get("job_id")
        if phase in SETUP_BUSY or phase == "recovery_required":
            setup_job(self.root, job_id)
            if phase in {"switching", "restarting", "recovery_required"}:
                self.restore_runtime(job_id)
            self.report_setup(job_id, "error", error="An interrupted setup was cancelled. The previous runtime is selected.")
        else:
            atomic_json(self.setup_directory / "state.json", {**state, "instance": self.instance, "phase": phase or "idle"})

    def setup_runtime(self, request):
        job_id = request.get("job_id")
        if request.get("instance") != self.instance or request.get("profile") != PROFILE:
            raise SetupError("The queued runtime setup does not belong to this launcher.")
        setup_job(self.root, job_id)
        report = lambda phase, **details: self.report_setup(job_id, phase, **details)
        switching = False
        try:
            installer = RuntimeInstaller(self.root, job_id, report)
            job = installer.prepare()
            previous = read_json(self.setup_directory / "active.json")
            atomic_json(job / "rollback.json", {"previous": previous})
            installer.stage("switching")
            switching = True
            self.stop()
            atomic_json(self.setup_directory / "active.json", {"job_id": job_id})
            report("restarting")
            self.start()
            if not self.healthy(read_version(self.root)):
                raise SetupError("The new runtime did not start successfully.")
            report("complete")
        except Exception as exc:
            logger.exception("RVC setup failed")
            if switching:
                try:
                    self.stop()
                    self.restore_runtime(job_id)
                    self.start()
                    if not self.healthy(read_version(self.root)):
                        raise SetupError("The previous runtime could not restart.")
                except Exception:
                    logger.exception("Runtime recovery failed")
                    report("recovery_required", error="Automatic recovery failed. Inspect data/rvc-setup/state.json and the launcher log.")
                    return
            message = str(exc) if isinstance(exc, UpdateError) else "Setup failed. Check the launcher log; the previous runtime is unchanged."
            report("cancelled" if isinstance(exc, SetupCancelled) else "error", error=message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=("127.0.0.1", "localhost", "::1"), default=settings.HOST)
    parser.add_argument("--port", type=int, default=settings.PORT)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"} or not 1 <= args.port <= 65535:
        parser.error("The managed updater requires a loopback host and a valid port. Use uvicorn directly for LAN hosting.")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    try:
        Launcher(host=args.host, port=args.port).run()
    except KeyboardInterrupt:
        pass
    except UpdateError as exc:
        logger.error("%s", exc)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
