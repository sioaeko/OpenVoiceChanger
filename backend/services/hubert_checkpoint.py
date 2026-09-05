"""Trust the bundled HuBERT checkpoint by content, never by its file name."""

import hashlib

from backend.services.setup_manifest import HUBERT_SHA256


def load_hubert_checkpoint(torch, path):
    with path.open("rb") as source:
        digest = hashlib.sha256()
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
        source.seek(0)
        # The pinned upstream checkpoint contains fairseq configuration objects.
        # Unknown/custom checkpoints must still pass PyTorch's weights-only loader.
        state = torch.load(source, map_location="cpu", weights_only=digest.hexdigest() != HUBERT_SHA256)
    if isinstance(state.get("cfg"), dict):
        from omegaconf import OmegaConf
        state["cfg"] = OmegaConf.create(state["cfg"], flags={"allow_objects": True})
    return state
