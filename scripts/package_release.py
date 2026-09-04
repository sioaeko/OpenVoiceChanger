"""Package a clean, built checkout for the in-app updater (does not publish)."""

import argparse
import hashlib
import json
from pathlib import Path
import stat
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.update_installer import MAX_EXPANDED_BYTES, _safe_archive_path
from backend.services.update_release import MAX_DOWNLOAD_BYTES, asset_name
from backend.version import read_version


def build_bundle(root: Path, output: Path) -> Path:
    version = read_version(root)
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=root, text=True, encoding="utf-8").strip()

    if git("status", "--porcelain", "--untracked-files=normal"):
        raise ValueError("Release packaging requires a clean checkout.")
    if git("show", "HEAD:VERSION") != version:
        raise ValueError("Commit VERSION before packaging a release.")
    for name in ("package.json", "package-lock.json"):
        package = json.loads((root / "frontend" / name).read_text(encoding="utf-8"))
        if package.get("version") != version:
            raise ValueError(f"frontend/{name} must match VERSION.")
    dist = root / "frontend" / "dist"
    if not (dist / "index.html").is_file():
        raise ValueError("Run npm ci and npm run build in frontend before packaging.")
    files = {}
    total = 0
    for path in sorted(dist.rglob("*")):
        if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
            raise ValueError("Release bundles cannot contain links.")
        if not path.is_file():
            continue
        name = path.relative_to(dist).as_posix()
        if not _safe_archive_path(name) or not path.resolve().is_relative_to(dist.resolve()):
            raise ValueError("Unsafe frontend asset path.")
        total += path.stat().st_size
        if total > MAX_EXPANDED_BYTES or len(files) >= 4094:
            raise ValueError("The frontend build exceeds updater limits.")
        files[name] = path.read_bytes()
    manifest = {
        "protocol": 1, "version": version, "commit": git("rev-parse", "HEAD"),
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in files.items()},
    }
    output.mkdir(parents=True, exist_ok=True)
    bundle = output / asset_name(version)
    with zipfile.ZipFile(bundle, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        entries = {"manifest.json": json.dumps(manifest, sort_keys=True).encode("utf-8"),
                   **{f"dist/{name}": data for name, data in files.items()}}
        for name, data in entries.items():
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.external_attr = (stat.S_IFREG | 0o644) << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, data)
    if bundle.stat().st_size > MAX_DOWNLOAD_BYTES:
        raise ValueError("The compressed frontend bundle exceeds updater limits.")
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    bundle.with_suffix(".zip.sha256").write_text(f"{digest}  {bundle.name}\n", encoding="ascii")
    return bundle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "tmp" / "releases")
    parser.add_argument("--check-tag")
    args = parser.parse_args()
    if args.check_tag and args.check_tag != f"v{read_version(ROOT)}":
        parser.error("The release tag must be v followed by VERSION.")
    print(build_bundle(ROOT, args.output))


if __name__ == "__main__":
    main()
