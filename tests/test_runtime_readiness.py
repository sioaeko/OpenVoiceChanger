import json

from backend.services import f0_registry as registry


def test_readiness_lists_all_missing_prerequisites_without_paths(monkeypatch, tmp_path):
    monkeypatch.setattr(registry, "_module_available", lambda name: name == "torch")
    monkeypatch.setattr(registry.settings, "HUBERT_PATH", str(tmp_path / "private-hubert.pt"))
    result = registry.runtime_readiness()
    assert not result["prerequisitesDetected"]
    assert "private-hubert" not in json.dumps(result)
    required = {item["id"]: item for item in result["checks"] if item["required"]}
    assert required["torch"]["available"]
    assert not required["rvc"]["available"]
    assert not required["HUBERT_PATH"]["available"]
    assert len(required) == len(registry.BASE_RUNTIME_MODULES) + 2


def test_optional_assets_do_not_block_base_readiness(monkeypatch, tmp_path):
    monkeypatch.setattr(registry, "_module_available", lambda name: True)
    hubert = tmp_path / "hubert.pt"
    hubert.touch()
    monkeypatch.setattr(registry.settings, "HUBERT_PATH", str(hubert))
    monkeypatch.setattr(registry.settings, "RMVPE_ROOT", str(tmp_path / "missing"))
    result = registry.runtime_readiness()
    assert result["prerequisitesDetected"]
    assert not next(item for item in result["checks"] if item["id"] == "RMVPE_ROOT")["available"]
    assert str(tmp_path) not in json.dumps(registry.f0_capabilities())
