"""Make the repository root importable so `import backend...` works.

Mirrors how the app itself is launched (`PYTHONPATH=. uvicorn backend.main:app`).
"""

import sys
import os
from pathlib import Path

import pytest

os.environ.setdefault("OVC_UPDATE_CHECK_ENABLED", "false")

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture
def anyio_backend():
    """Run @pytest.mark.anyio tests on asyncio only (trio is not a dependency)."""
    return "asyncio"
