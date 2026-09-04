from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
VERSION_PATTERN = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\Z")


def version_tuple(value: str) -> tuple[int, int, int]:
    if not isinstance(value, str) or len(value) > 32 or not VERSION_PATTERN.fullmatch(value):
        raise ValueError("Expected a stable major.minor.patch version")
    return tuple(int(part) for part in value.split("."))


def read_version(root: Path = ROOT) -> str:
    value = (root / "VERSION").read_text(encoding="utf-8").strip()
    version_tuple(value)
    return value


VERSION = read_version()
