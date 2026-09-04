from dataclasses import replace
import hashlib
import io
import json
from pathlib import Path
import shutil
import socket
import stat
import subprocess
import uuid
from urllib.request import urlopen
import zipfile

import pytest

from backend.services.update_installer import UpdateInstaller, atomic_json, read_json, unpack_frontend
from backend.services.update_release import REPOSITORY_URL, Release, UpdateError
from launch import Launcher, launcher_lock
from scripts.package_release import build_bundle


def git(root, *args):
    return subprocess.check_output(["git", "-c", "core.hooksPath=/dev/null", *args], cwd=root,
                                   text=True, encoding="utf-8", stderr=subprocess.PIPE).strip()


def write(root, name, content):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


APP_SOURCE = '''import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
VERSION = Path("VERSION").read_text().strip()
app = FastAPI()
@app.get("/api/config")
def config():
    return {"version": VERSION, "update_instance": os.environ.get("OVC_UPDATE_INSTANCE")}
app.mount("/", StaticFiles(directory="frontend/dist", html=True))
'''


@pytest.fixture
def installation(tmp_path):
    upstream = tmp_path / "upstream"
    upstream.mkdir()
    git(upstream, "init", "-b", "main")
    git(upstream, "config", "user.name", "Updater test")
    git(upstream, "config", "user.email", "updater@example.invalid")
    git(upstream, "config", "commit.gpgsign", "false")
    git(upstream, "config", "core.autocrlf", "false")
    write(upstream, ".gitignore", "tmp/\nfrontend/dist/\nmodels/\ndata/\n__pycache__/\n")
    write(upstream, "VERSION", "2.1.0\n")
    write(upstream, "backend/__init__.py", "")
    write(upstream, "backend/main.py", APP_SOURCE)
    write(upstream, "backend/requirements.txt", "fastapi\n")
    write(upstream, "launch.py", "# launcher\n")
    for name in ("package.json", "package-lock.json"):
        write(upstream, f"frontend/{name}", json.dumps({"version": "2.1.0"}))
    git(upstream, "add", ".")
    git(upstream, "commit", "-m", "old version")
    old = git(upstream, "rev-parse", "HEAD")
    root = tmp_path / "installed"
    git(tmp_path, "clone", str(upstream), str(root))
    git(root, "config", "core.autocrlf", "false")
    git(root, "remote", "set-url", "origin", REPOSITORY_URL + ".git")
    write(root, "frontend/dist/index.html", "old frontend")
    write(root, "models/personal.pth", "private model")
    write(root, "data/presets.json", '{"personal": true}')
    return root, upstream, old


def publish_fixture(installation, *, broken=False, extra=None):
    root, upstream, old = installation
    write(upstream, "VERSION", "2.2.0\n")
    for name in ("package.json", "package-lock.json"):
        write(upstream, f"frontend/{name}", json.dumps({"version": "2.2.0"}))
    if broken:
        write(upstream, "backend/main.py", "raise RuntimeError('intentional startup failure')\n")
    for name, content in (extra or {}).items():
        write(upstream, name, content)
    git(upstream, "add", ".")
    git(upstream, "commit", "-m", "new version")
    git(upstream, "tag", "v2.2.0")
    write(upstream, "frontend/dist/index.html", "new frontend")
    write(upstream, "frontend/dist/assets/app.js", "console.log('new frontend');")
    bundle = build_bundle(upstream, upstream / "tmp" / "releases")
    release = Release("2.2.0", git(upstream, "rev-parse", "HEAD"), bundle.stat().st_size,
                      "sha256:" + hashlib.sha256(bundle.read_bytes()).hexdigest())
    def download(selected, destination):
        assert selected == release
        shutil.copyfile(bundle, destination)
    installer = UpdateInstaller(root, remote=str(upstream), downloader=download)
    return installer, release, bundle


def prepare(installer, release):
    return installer.prepare(release, uuid.uuid4().hex, lambda *args: None)


def test_package_round_trip_checks_commit_and_file_hashes(installation, tmp_path):
    _, release, bundle = publish_fixture(installation)
    unpack_frontend(bundle, tmp_path / "unpacked", release)
    assert (tmp_path / "unpacked/index.html").read_text() == "new frontend"
    assert bundle.with_suffix(".zip.sha256").read_text().startswith(release.digest[7:])
    with pytest.raises(UpdateError, match="commit and version"):
        unpack_frontend(bundle, tmp_path / "wrong", replace(release, commit="b" * 40))


@pytest.mark.parametrize("name", ["../outside", "dist/../../outside", "C:/outside", "dist\\outside", "/absolute",
                                      "dist/CON", "dist/file.", "dist/.env/../outside"])
def test_archive_traversal_and_windows_device_paths_are_rejected(tmp_path, name):
    bundle = tmp_path / "bad.zip"
    with zipfile.ZipFile(bundle, "w") as archive:
        entry = zipfile.ZipInfo(name)
        # ZipInfo normalizes native separators on Windows; exercise the raw ZIP input.
        entry.filename = name
        archive.writestr(entry, "bad")
    release = Release("2.2.0", "a" * 40, bundle.stat().st_size, "sha256:" + hashlib.sha256(bundle.read_bytes()).hexdigest())
    with pytest.raises(UpdateError, match="unsafe"):
        unpack_frontend(bundle, tmp_path / "dist", release)
    assert not (tmp_path.parent / "outside").exists()


def test_archive_symlinks_and_case_collisions_are_rejected(tmp_path):
    for kind in ("link", "collision"):
        bundle = tmp_path / f"{kind}.zip"
        with zipfile.ZipFile(bundle, "w") as archive:
            if kind == "link":
                entry = zipfile.ZipInfo("dist/link")
                entry.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(entry, "../../outside")
            else:
                archive.writestr("dist/index.html", "a")
                archive.writestr("dist/INDEX.html", "b")
        release = Release("2.2.0", "a" * 40, bundle.stat().st_size, "sha256:" + hashlib.sha256(bundle.read_bytes()).hexdigest())
        with pytest.raises(UpdateError):
            unpack_frontend(bundle, tmp_path / kind, release)


def test_dirty_checkout_is_never_reset_or_stashed(installation):
    installer, release, _ = publish_fixture(installation)
    root, _, old = installation
    write(root, "backend/main.py", "# user edit\n")
    with pytest.raises(UpdateError, match="Local code changes"):
        prepare(installer, release)
    assert (root / "backend/main.py").read_text() == "# user edit\n"
    assert git(root, "rev-parse", "HEAD") == old


def test_untracked_work_blocks_installation(installation):
    installer, release, _ = publish_fixture(installation)
    write(installation[0], "notes.txt", "user notes")
    with pytest.raises(UpdateError, match="Local code changes"):
        prepare(installer, release)


def test_dependency_changes_require_manual_update(installation):
    installer, release, _ = publish_fixture(installation, extra={"backend/requirements.txt": "torch==999\n"})
    with pytest.raises(UpdateError, match="Python dependencies"):
        prepare(installer, release)
    assert git(installation[0], "rev-parse", "HEAD") == installation[2]


def test_non_official_remote_is_rejected(installation):
    installer, release, _ = publish_fixture(installation)
    git(installation[0], "remote", "set-url", "origin", "https://github.com/other/fork.git")
    with pytest.raises(UpdateError, match="official"):
        prepare(installer, release)


def test_diverged_main_is_rejected(installation):
    installer, release, _ = publish_fixture(installation)
    root = installation[0]
    write(root, "local.txt", "local commit")
    git(root, "add", ".")
    git(root, "-c", "user.name=Updater test", "-c", "user.email=updater@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "local work")
    with pytest.raises(UpdateError, match="history differs"):
        prepare(installer, release)


def test_moved_tag_is_rejected(installation):
    installer, release, _ = publish_fixture(installation)
    with pytest.raises(UpdateError, match="tag moved"):
        prepare(installer, replace(release, commit="a" * 40))


def test_update_and_rollback_preserve_models_and_presets(installation):
    installer, release, _ = publish_fixture(installation)
    root, _, old = installation
    prepared = prepare(installer, release)
    phases = []
    installer.install(prepared, stop=lambda: None, start=lambda: None, healthy=lambda version: True,
                      report=lambda phase, error=None: phases.append(phase))
    assert phases == ["applying", "restarting", "complete"]
    assert git(root, "rev-parse", "HEAD") == release.commit
    assert (root / "frontend/dist/index.html").read_text() == "new frontend"
    installer.rollback(prepared.job)
    assert git(root, "rev-parse", "HEAD") == old
    assert (root / "frontend/dist/index.html").read_text() == "old frontend"
    assert (root / "models/personal.pth").read_text() == "private model"
    assert json.loads((root / "data/presets.json").read_text()) == {"personal": True}


def test_failed_health_check_restores_previous_version(installation):
    installer, release, _ = publish_fixture(installation)
    phases = []
    installer.install(prepare(installer, release), stop=lambda: None, start=lambda: None,
                      healthy=lambda version: version == "2.1.0",
                      report=lambda phase, error=None: phases.append(phase))
    assert phases == ["applying", "restarting", "rolling_back", "rolled_back"]
    assert git(installation[0], "rev-parse", "HEAD") == installation[2]
    assert (installation[0] / "frontend/dist/index.html").read_text() == "old frontend"


def test_edits_after_prepare_are_preserved(installation):
    installer, release, _ = publish_fixture(installation)
    prepared = prepare(installer, release)
    write(installation[0], "backend/main.py", "# changed while downloading\n")
    stopped = []
    with pytest.raises(UpdateError, match="Local code changes"):
        installer.install(prepared, stop=lambda: stopped.append(1), start=lambda: None,
                          healthy=lambda version: True, report=lambda *args: None)
    assert stopped == []
    assert "changed while downloading" in (installation[0] / "backend/main.py").read_text()


def test_recovery_will_not_erase_concurrent_edits(installation):
    installer, release, _ = publish_fixture(installation)
    prepared = prepare(installer, release)
    installer.install(prepared, stop=lambda: None, start=lambda: None,
                      healthy=lambda version: True, report=lambda *args: None)
    write(installation[0], "backend/main.py", "# concurrent user edit\n")
    with pytest.raises(UpdateError, match="preserve your edits"):
        installer.rollback(prepared.job)
    assert (installation[0] / "backend/main.py").read_text() == "# concurrent user edit\n"


def test_launcher_lock_prevents_duplicate_supervisors(tmp_path):
    with launcher_lock(tmp_path):
        with pytest.raises(UpdateError, match="already running"):
            with launcher_lock(tmp_path):
                pass


@pytest.mark.parametrize("broken", [False, True])
def test_real_process_restart_and_recovery(installation, broken):
    pytest.importorskip("uvicorn")
    installer, release, _ = publish_fixture(installation, broken=broken)
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    launcher = Launcher(installation[0], port=port)
    phases = []
    try:
        launcher.start()
        assert launcher.healthy("2.1.0", timeout=15)
        prepared = prepare(installer, release)
        installer.install(prepared, stop=launcher.stop, start=launcher.start,
                          healthy=lambda version: launcher.healthy(version, timeout=15),
                          report=lambda phase, error=None: phases.append(phase))
        expected = "2.1.0" if broken else "2.2.0"
        assert launcher.healthy(expected, timeout=5)
        with urlopen(launcher.url, timeout=3) as response:
            assert response.read().decode() == ("old frontend" if broken else "new frontend")
        assert phases[-1] == ("rolled_back" if broken else "complete")
        assert (installation[0] / "models/personal.pth").read_text() == "private model"
    finally:
        launcher.stop()
