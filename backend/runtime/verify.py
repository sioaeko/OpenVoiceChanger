"""Run in the candidate interpreter before the launcher selects it."""

import os
from pathlib import Path
import sys

from backend.services.runtime_setup import setup_job, sha256
from backend.services.setup_manifest import ASSETS, PROFILE, SOURCES
from backend.services.update_installer import atomic_json
from backend.version import ROOT


def verify(job):
    if job.resolve() != setup_job(ROOT, job.name):
        raise ValueError("Invalid verification directory")
    hubert = job / "assets/hubert_base.pt"
    rmvpe = job / "assets/rmvpe/rmvpe.pt"
    for asset, path in zip(ASSETS, (hubert, rmvpe)):
        if sha256(path) != asset["sha256"]:
            raise ValueError("Runtime asset checksum mismatch")
    os.environ["OVC_HUBERT_PATH"] = str(hubert)
    os.environ["OVC_RMVPE_ROOT"] = str(rmvpe.parent)
    import numpy as np
    import torch
    from backend.services.rvc_processor import RvcProcessor
    from backend.services.f0_registry import runtime_readiness
    from rvc.lib.rmvpe import RMVPE
    import backend.main  # Verify the API can import in the candidate environment, too.

    torch.set_num_threads(min(4, os.cpu_count() or 1))
    probe = RvcProcessor.__new__(RvcProcessor)
    probe._torch = torch
    probe._hubert_path = hubert
    probe._runtime = RvcProcessor._select_runtime_config()
    probe._load_hubert_model()
    signal = (0.05 * np.sin(2 * np.pi * 220 * np.arange(16000) / 16000)).astype(np.float32)
    with torch.inference_mode():
        features = probe._hubert_model.extract_features(
            source=torch.from_numpy(signal).unsqueeze(0),
            padding_mask=torch.zeros((1, len(signal)), dtype=torch.bool), output_layer=9)[0]
        pitch = RMVPE(str(rmvpe), is_half=False, device="cpu").infer_from_audio(signal)
    if not torch.isfinite(features).all() or features.numel() == 0 or not len(pitch) or not np.isfinite(pitch).all():
        raise ValueError("HuBERT/RMVPE produced invalid output")
    readiness = runtime_readiness()
    if not readiness["prerequisitesDetected"]:
        raise ValueError(f"Missing runtime prerequisites: {readiness}")
    atomic_json(job / "verified.json", {"profile": PROFILE, "python": sys.version.split()[0],
                "torch": torch.__version__, "sources": {item["package"]: item["revision"] for item in SOURCES},
                "checks": ["api-import", "hubert-inference", "rmvpe-inference", "runtime-readiness"]})
    print("Runtime verification passed", flush=True)


if __name__ == "__main__":
    verify(Path(sys.argv[1]))
