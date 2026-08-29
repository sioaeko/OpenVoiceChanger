"""RVC checkpoint loading must not silently unpickle uploaded files.

A .pth checkpoint is a Python pickle, and anyone who can reach the studio can
upload one. Loading it with weights_only disabled runs code from the file, so
the safe loader is tried first and the unsafe path needs an explicit opt-in.
"""

import numpy as np
import pytest

torch = pytest.importorskip("torch")

from backend.config import settings  # noqa: E402
from backend.services.rvc_processor import (  # noqa: E402
    UNSAFE_CHECKPOINT_HINT,
    RvcProcessor,
    _numpy_safe_globals,
)


class Marker:
    """A custom class instance — exactly what weights-only loading refuses."""

    def __init__(self, value=42):
        self.value = value


def make_processor(path):
    """An RvcProcessor shell: _load_checkpoint only needs _model_path."""
    processor = object.__new__(RvcProcessor)
    processor._model_path = path
    return processor


@pytest.fixture
def safe_checkpoint(tmp_path):
    path = tmp_path / "safe.pth"
    torch.save(
        {
            "config": [1025, 32, 192, 192, 768, 2, 6, 3, 0, "1", [3, 7, 11], 109, 40000],
            "weight": {"emb_g.weight": torch.zeros(1, 256)},
            "f0": 1,
            "version": "v2",
            "info": "epoch 100",
        },
        path,
    )
    return path


@pytest.fixture
def numpy_checkpoint(tmp_path):
    """Some checkpoints carry numpy values alongside tensors."""
    path = tmp_path / "numpy.pth"
    torch.save(
        {
            "config": [np.int64(1025), np.float32(0.5)],
            "weight": {"emb_g.weight": torch.zeros(1, 256)},
            "sr": np.int32(40000),
        },
        path,
    )
    return path


@pytest.fixture
def unsafe_checkpoint(tmp_path):
    path = tmp_path / "unsafe.pth"
    torch.save({"weight": {"emb_g.weight": torch.zeros(1, 4)}, "payload": Marker()}, path)
    return path


class TestSafeLoading:
    def test_loads_a_normal_checkpoint_without_unpickling(self, safe_checkpoint):
        checkpoint = make_processor(safe_checkpoint)._load_checkpoint(torch)

        assert checkpoint["config"][-1] == 40000
        assert checkpoint["version"] == "v2"
        assert "emb_g.weight" in checkpoint["weight"]

    def test_loads_checkpoints_carrying_numpy_values(self, numpy_checkpoint):
        # Data-only numpy symbols are allowlisted, so these need no opt-in.
        checkpoint = make_processor(numpy_checkpoint)._load_checkpoint(torch)
        assert int(checkpoint["sr"]) == 40000
        assert int(checkpoint["config"][0]) == 1025

    def test_loads_checkpoints_carrying_numpy_arrays(self, tmp_path):
        path = tmp_path / "arr.pth"
        torch.save({"weight": {"emb_g.weight": torch.zeros(1, 4)},
                    "arr": np.arange(4, dtype=np.float32)}, path)

        checkpoint = make_processor(path)._load_checkpoint(torch)
        np.testing.assert_array_equal(checkpoint["arr"], np.arange(4, dtype=np.float32))

    def test_safe_globals_are_resolvable_on_this_numpy(self):
        resolved = _numpy_safe_globals()
        assert resolved, "expected at least numpy.ndarray and numpy.dtype to resolve"
        assert np.ndarray in resolved
        assert np.dtype in resolved

    def test_safe_globals_include_concrete_dtype_classes(self):
        """numpy >= 1.25 pickles scalars via numpy.dtypes.*DType, not numpy.dtype."""
        pytest.importorskip("numpy.dtypes")
        import numpy.dtypes as numpy_dtypes

        resolved = _numpy_safe_globals()
        assert numpy_dtypes.Int64DType in resolved
        assert numpy_dtypes.Float32DType in resolved

    def test_safe_globals_are_all_classes_or_callables(self):
        # Nothing in the allowlist should be an arbitrary object.
        for entry in _numpy_safe_globals():
            assert isinstance(entry, type) or callable(entry)


class TestUnsafeLoadingIsGated:
    def test_refuses_a_checkpoint_that_needs_unpickling(self, unsafe_checkpoint):
        assert settings.RVC_ALLOW_UNSAFE_CHECKPOINTS is False

        with pytest.raises(RuntimeError) as excinfo:
            make_processor(unsafe_checkpoint)._load_checkpoint(torch)

        message = str(excinfo.value)
        assert "unsafe.pth" in message
        assert UNSAFE_CHECKPOINT_HINT in message

    def test_the_error_tells_the_operator_how_to_proceed(self, unsafe_checkpoint):
        with pytest.raises(RuntimeError) as excinfo:
            make_processor(unsafe_checkpoint)._load_checkpoint(torch)

        message = str(excinfo.value)
        assert "OVC_RVC_ALLOW_UNSAFE_CHECKPOINTS" in message
        assert "trust" in message.lower()

    def test_opt_in_allows_it_and_warns(self, unsafe_checkpoint, monkeypatch, caplog):
        monkeypatch.setattr(settings, "RVC_ALLOW_UNSAFE_CHECKPOINTS", True)

        with caplog.at_level("WARNING"):
            checkpoint = make_processor(unsafe_checkpoint)._load_checkpoint(torch)

        assert isinstance(checkpoint["payload"], Marker)
        assert checkpoint["payload"].value == 42

        warnings = " ".join(record.getMessage() for record in caplog.records)
        assert "OVC_RVC_ALLOW_UNSAFE_CHECKPOINTS" in warnings
        assert "weights_only=False" in warnings

    def test_a_corrupt_file_is_reported_not_swallowed(self, tmp_path):
        path = tmp_path / "corrupt.pth"
        path.write_bytes(b"this is not a torch checkpoint")

        with pytest.raises(RuntimeError):
            make_processor(path)._load_checkpoint(torch)
