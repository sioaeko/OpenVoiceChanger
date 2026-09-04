"""A fast-forward-only source update with a separately verified frontend bundle."""

import ast
from dataclasses import dataclass
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import tarfile
import uuid
import zipfile

from backend.services.update_release import (
    REPOSITORY, REPOSITORY_URL, SHA_PATTERN, Release, UpdateError, download_release,
)
from backend.version import read_version, version_tuple

BUSY_PHASES = frozenset({"queued", "preparing", "downloading", "verifying", "applying", "restarting", "rolling_back"})
JOB_PATTERN = re.compile(r"[0-9a-f]{32}\Z")
MAX_EXPANDED_BYTES = 128 * 1024 * 1024


def atomic_json(path: Path, value: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as output:
            json.dump(value, output)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def read_json(path: Path) -> dict:
    try:
        if path.stat().st_size > 1024 * 1024:
            return {}
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def owned_path(root: Path, *parts: str) -> Path:
    path = root.joinpath(*parts)
    if not path.resolve().is_relative_to(root.resolve()) or path.is_symlink():
        raise UpdateError("An updater path points outside the installation. Update manually.")
    # Reject junctions/symlink parents, including links that happen to point inside the repo.
    current = path
    while current != root:
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
            raise UpdateError("Linked updater directories are not supported. Update manually.")
        current = current.parent
    return path


def _safe_archive_path(name: str) -> bool:
    path = PurePosixPath(name)
    if not name or "\\" in name or ":" in name or path.is_absolute():
        return False
    if any(part in {"", ".", ".."} for part in name.split("/")):
        return False
    for part in path.parts:
        stem = part.split(".")[0].upper()
        if part.endswith((".", " ")) or stem in {"CON", "PRN", "AUX", "NUL"}:
            return False
        if re.fullmatch(r"(?:COM|LPT)[1-9]", stem) or any(ord(char) < 32 for char in part):
            return False
    return True


def unpack_frontend(bundle: Path, destination: Path, release: Release):
    with bundle.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if f"sha256:{digest}" != release.digest:
        raise UpdateError("The frontend bundle failed SHA-256 verification.")
    try:
        with zipfile.ZipFile(bundle) as archive:
            entries = archive.infolist()
            if len(entries) > 4096 or sum(entry.file_size for entry in entries) > MAX_EXPANDED_BYTES:
                raise UpdateError("The frontend bundle exceeds extraction limits.")
            names = set()
            files = {}
            for entry in entries:
                name = entry.filename.rstrip("/") if entry.is_dir() else entry.filename
                original = entry.orig_filename.rstrip("/") if entry.is_dir() else entry.orig_filename
                mode = entry.external_attr >> 16
                if not _safe_archive_path(original) or not _safe_archive_path(name) or name.casefold() in names:
                    raise UpdateError("The frontend bundle contains an unsafe or duplicate path.")
                if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in {0, stat.S_IFREG, stat.S_IFDIR}):
                    raise UpdateError("The frontend bundle contains a link or special file.")
                names.add(name.casefold())
                if not entry.is_dir():
                    files[name] = entry
            manifest_entry = files.get("manifest.json")
            if manifest_entry is None or manifest_entry.file_size > 1024 * 1024:
                raise UpdateError("The frontend bundle is missing its manifest.")
            manifest = json.loads(archive.read(manifest_entry))
            if not isinstance(manifest, dict) or manifest.get("protocol") != 1:
                raise UpdateError("This frontend bundle needs a newer updater. Update manually.")
            if manifest.get("version") != release.version or manifest.get("commit") != release.commit:
                raise UpdateError("The frontend bundle does not match the release commit and version.")
            expected = manifest.get("files")
            if not isinstance(expected, dict) or "index.html" not in expected:
                raise UpdateError("The frontend manifest is incomplete.")
            if any(not isinstance(name, str) or not _safe_archive_path(name) for name in expected):
                raise UpdateError("The frontend manifest contains unsafe paths.")
            if set(files) != {"manifest.json", *(f"dist/{name}" for name in expected)}:
                raise UpdateError("The frontend bundle does not match its file manifest.")
            destination.mkdir(parents=True, exist_ok=False)
            for name, digest in expected.items():
                content = archive.read(files[f"dist/{name}"])
                if hashlib.sha256(content).hexdigest() != digest:
                    raise UpdateError("A frontend file failed SHA-256 verification.")
                target = owned_path(destination, *PurePosixPath(name).parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
    except (zipfile.BadZipFile, ValueError, KeyError, OSError, RuntimeError) as exc:
        if isinstance(exc, UpdateError):
            raise
        raise UpdateError("The frontend bundle could not be verified or unpacked.") from exc


@dataclass
class PreparedUpdate:
    job: Path
    old_commit: str
    release: Release


class UpdateInstaller:
    def __init__(self, root: Path, *, remote=REPOSITORY_URL + ".git", downloader=download_release, data_paths=()):
        self.root = root.resolve()
        self.state_dir = owned_path(self.root, "tmp", "updater")
        self.remote = remote
        self.downloader = downloader
        self.data_paths = []
        for name in data_paths:
            path = (self.root / name).resolve()
            if path.is_relative_to(self.root):
                self.data_paths.append(path.relative_to(self.root).as_posix().casefold())

    def git(self, *args: str, timeout=30, binary=False, check=True):
        try:
            result = subprocess.run(
                ["git", "-c", f"core.hooksPath={self.state_dir / 'no-hooks'}",
                 "-c", "core.fsmonitor=false", "-c", "submodule.recurse=false",
                 "-c", "credential.helper=", *args],
                cwd=self.root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=timeout, check=False,
                env={**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never"},
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise UpdateError("Git is unavailable or timed out. Update manually or try again later.") from exc
        if check and result.returncode:
            raise UpdateError(f"Git {args[0]} failed. The installation may need a manual update.")
        if not check:
            return result.returncode
        return result.stdout if binary else result.stdout.decode("utf-8").strip()

    def preflight(self) -> str:
        top = Path(self.git("rev-parse", "--show-toplevel")).resolve()
        if top != self.root:
            raise UpdateError("In-app installation requires a Git clone of OpenVoiceChanger.")
        branch = self.git("symbolic-ref", "--quiet", "--short", "HEAD")
        if branch != "main":
            raise UpdateError("Switch to the main branch before updating in the app.")
        origin = self.git("remote", "get-url", "origin").rstrip("/")
        if origin not in {REPOSITORY_URL, REPOSITORY_URL + ".git", f"git@github.com:{REPOSITORY}.git",
                          f"ssh://git@github.com/{REPOSITORY}.git"}:
            raise UpdateError("In-app updates are only supported for the official repository.")
        if self.git("status", "--porcelain", "--untracked-files=normal"):
            raise UpdateError("Local code changes detected. Commit or move them before updating.")
        for marker in ("MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "BISECT_LOG", "rebase-merge", "rebase-apply"):
            marker_path = Path(self.git("rev-parse", "--git-path", marker))
            if (self.root / marker_path).exists():
                raise UpdateError("Finish the current Git operation before updating.")
        owned_path(self.root, "frontend", "dist")
        self.state_dir.mkdir(parents=True, exist_ok=True)
        hooks = owned_path(self.root, "tmp", "updater", "no-hooks")
        hooks.mkdir(exist_ok=True)
        if any(hooks.iterdir()):
            raise UpdateError("The updater's empty hooks directory was modified. Update manually.")
        return self.git("rev-parse", "HEAD")

    def _verify_source(self, old_commit: str, release: Release):
        if self.git("merge-base", "--is-ancestor", old_commit, release.commit, check=False):
            raise UpdateError("Local history differs from the release. A manual update is required.")
        if self.git("show", f"{release.commit}:VERSION") != release.version:
            raise UpdateError("The release tag and source version do not match.")
        changed = self.git("diff", "--name-only", "-z", old_commit, release.commit, binary=True).decode("utf-8").split("\0")
        for name in changed:
            base = PurePosixPath(name).name.casefold()
            parts = PurePosixPath(name.casefold()).parts
            if parts and parts[0] in {"models", "data"} and base != ".gitkeep":
                raise UpdateError("This release would change local models or data. Update manually.")
            if any(name.casefold() == path or name.casefold().startswith(path + "/") for path in self.data_paths):
                raise UpdateError("This release would change a configured model or preset path. Update manually.")
            if (base.startswith("requirements") and base.endswith(".txt") and base != "requirements-test.txt") or base in {
                "pyproject.toml", "uv.lock", "poetry.lock", "Pipfile", "Pipfile.lock", "setup.py", "setup.cfg",
            }:
                raise UpdateError("This release changes Python dependencies. Update manually to preserve your GPU environment.")
        tree = self.git("ls-tree", "-rz", release.commit, binary=True).decode("utf-8")
        for entry in filter(None, tree.split("\0")):
            metadata, name = entry.split("\t", 1)
            if not _safe_archive_path(name):
                raise UpdateError("The release contains a path unsupported on this installation.")
            if metadata.split()[0] not in {"100644", "100755"}:
                raise UpdateError("This release contains links or submodules. Update manually.")
            parts = PurePosixPath(name.casefold()).parts
            if parts[0] in {"data", "models"} and parts[-1] != ".gitkeep":
                raise UpdateError("This release would overwrite local models or data. Update manually.")
            if (parts[0] in {"tmp", ".venv", "venv", "node_modules"} or name.casefold().startswith("frontend/dist/")
                    or "node_modules" in parts or parts[-1] == ".env" or parts[-1].startswith(".env.")):
                if not parts[-1].endswith((".example", ".sample")):
                    raise UpdateError("This release contains protected local files. Update manually.")
        source = self.git("archive", "--format=tar", release.commit, "backend", "launch.py", "VERSION", binary=True)
        if len(source) > 32 * 1024 * 1024:
            raise UpdateError("The release source exceeds validation limits.")
        try:
            with tarfile.open(fileobj=io.BytesIO(source)) as archive:
                for member in archive.getmembers():
                    if member.isfile() and member.name.endswith(".py"):
                        ast.parse(archive.extractfile(member).read(), filename=member.name)
        except (SyntaxError, ValueError, tarfile.TarError) as exc:
            raise UpdateError("The release is not compatible with this Python version.") from exc

    def prepare(self, release: Release, job_id: str, report) -> PreparedUpdate:
        version_tuple(release.version)
        if not JOB_PATTERN.fullmatch(job_id) or not release.installable:
            raise UpdateError("A verified release and a valid update job are required.")
        if version_tuple(release.version) <= version_tuple(read_version(self.root)):
            raise UpdateError("This release is not newer than the installed version.")
        report("preparing")
        old_commit = self.preflight()
        job = owned_path(self.root, "tmp", "updater", "jobs", job_id)
        job.mkdir(parents=True, exist_ok=False)
        # Fetch a fixed official tag, not a command, URL, branch or ref from the browser.
        self.git("fetch", "--no-tags", "--no-recurse-submodules", self.remote,
                 f"refs/tags/{release.tag}", timeout=180)
        if self.git("rev-parse", "FETCH_HEAD^{commit}") != release.commit:
            raise UpdateError("The release tag moved after it was checked. Check for updates again.")
        self._verify_source(old_commit, release)
        report("downloading")
        self.downloader(release, job / "frontend.zip")
        report("verifying")
        unpack_frontend(job / "frontend.zip", job / "dist", release)
        if self.preflight() != old_commit:
            raise UpdateError("The local repository changed while preparing the update.")
        atomic_json(job / "transaction.json", {
            "old_commit": old_commit, "target_commit": release.commit,
            "version": release.version, "had_dist": (self.root / "frontend" / "dist").exists(),
        })
        return PreparedUpdate(job, old_commit, release)

    def rollback(self, job: Path):
        owned_path(self.root, "tmp", "updater", "jobs", job.name)
        if not JOB_PATTERN.fullmatch(job.name) or job.parent != self.state_dir / "jobs":
            raise UpdateError("Invalid recovery directory.")
        transaction = read_json(job / "transaction.json")
        old, target = transaction.get("old_commit", ""), transaction.get("target_commit", "")
        if not SHA_PATTERN.fullmatch(old) or not SHA_PATTERN.fullmatch(target):
            raise UpdateError("The recovery record is incomplete. No local files were replaced.")
        head = self.git("rev-parse", "HEAD")
        if head not in {old, target} or self.git("status", "--porcelain", "--untracked-files=normal"):
            raise UpdateError("Local code changed during the update. Recovery stopped to preserve your edits.")
        if head == target:
            # --keep aborts on conflicting edits; never discard work with --hard.
            self.git("reset", "--keep", old)
        dist = owned_path(self.root, "frontend", "dist")
        backup = owned_path(self.root, "tmp", "updater", "jobs", job.name, "previous-dist")
        if backup.exists() or not transaction.get("had_dist"):
            if dist.exists():
                dist.rename(owned_path(self.root, "tmp", "updater", "jobs", job.name, f"failed-dist-{uuid.uuid4().hex}"))
            if backup.exists():
                backup.rename(dist)

    def install(self, prepared: PreparedUpdate, *, stop, start, healthy, report):
        stopped = False
        try:
            if self.preflight() != prepared.old_commit:
                raise UpdateError("The local repository changed before installation.")
            report("applying")
            stop()
            stopped = True
            self.git("merge", "--ff-only", "--no-edit", prepared.release.commit)
            dist = owned_path(self.root, "frontend", "dist")
            if dist.exists():
                dist.rename(prepared.job / "previous-dist")
            (prepared.job / "dist").rename(dist)
            report("restarting")
            start()
            if not healthy(prepared.release.version):
                raise UpdateError("The new version did not start successfully.")
            report("complete")
        except BaseException as exc:
            if not stopped:
                raise
            report("rolling_back")
            try:
                stop()
                self.rollback(prepared.job)
                start()
                if not healthy(read_version(self.root)):
                    raise UpdateError("The previous version also failed to start. Check the launcher log.")
            except Exception as recovery_error:
                raise UpdateError(f"Update failed; automatic recovery needs attention. {recovery_error}") from exc
            report("rolled_back", "The update failed. The previous version was restored.")
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
