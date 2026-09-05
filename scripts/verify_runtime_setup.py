"""Cold Windows installation check, isolated from the operator's running studio.

Run with: python -m scripts.verify_runtime_setup
The generated installation remains in tmp for diagnosis; it is never selected
by the real studio. No uv, Python, package or model caches are copied in.
"""

import json
import os
from pathlib import Path
import shutil
import socket
import time
from urllib.request import ProxyHandler, build_opener
import uuid

from backend.services.runtime_setup import RuntimeInstaller
from backend.services.update_installer import atomic_json
from backend.version import ROOT, read_version
from launch import Launcher


def verify():
    root = ROOT / "tmp" / f"runtime-cold-{uuid.uuid4().hex}"
    root.mkdir(parents=True, exist_ok=False)
    shutil.copytree(ROOT / "backend", root / "backend", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.copyfile(ROOT / "VERSION", root / "VERSION")
    print(f"Cold installation: {root}", flush=True)
    assert not (root / "data").exists()
    installer = RuntimeInstaller(root, uuid.uuid4().hex, lambda phase, **detail: print(phase, detail, flush=True))
    job = installer.prepare()
    atomic_json(root / "data/rvc-setup/active.json", {"job_id": job.name})

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    previous = os.environ.get("OVC_UPDATE_CHECK_ENABLED")
    os.environ["OVC_UPDATE_CHECK_ENABLED"] = "false"
    launcher = Launcher(root, port=port)
    opener = build_opener(ProxyHandler({}))
    try:
        for attempt in range(2):
            launcher.start()
            try:
                assert launcher.healthy(read_version(root)), "Candidate server failed its health check"
                with opener.open(f"{launcher.url}/api/runtime-setup", timeout=10) as response:
                    status = json.load(response)
                assert status["active_job"] == job.name
                assert status["blocked"] is None, "Windows venv child was not recognized by its supervisor"
                print(f"Managed startup {attempt + 1}: verified", flush=True)
            finally:
                launcher.stop()
            # A redirector-only kill would leave the actual server listening.
            deadline = time.monotonic() + 10
            while True:
                with socket.socket() as probe:
                    probe.settimeout(0.5)
                    listening = probe.connect_ex(("127.0.0.1", port)) == 0
                if not listening:
                    break
                assert time.monotonic() < deadline, "Server survived supervisor shutdown"
                time.sleep(0.2)
        print("PASS: cold downloads, asset inference, managed startup, full shutdown and restart", flush=True)
    finally:
        launcher.stop()
        if previous is None:
            os.environ.pop("OVC_UPDATE_CHECK_ENABLED", None)
        else:
            os.environ["OVC_UPDATE_CHECK_ENABLED"] = previous


if __name__ == "__main__":
    verify()
