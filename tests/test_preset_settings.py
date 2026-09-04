"""User presets must round-trip the whole Voice Lab state.

Presets used to persist only pitch/formant/effects, so f0 method and the RVC
advanced controls were silently lost. The advanced fields are optional: presets
written before this existed — and the built-ins, which describe a voice
character rather than a pitch-detection strategy — must keep round-tripping
without them, and applying such a preset must leave the current values alone.
"""

import json

import pytest

from backend.services.preset_settings import (
    ADVANCED_FIELDS,
    advanced_fields_present,
    normalize_preset_settings,
)
from backend.services.preset_store import BUILTIN_PRESETS, PresetStore

FULL_SETTINGS = {
    "pitch_shift": 3.5,
    "formant_shift": -2.0,
    "effects": {"reverb": {"enabled": True, "mix": 0.4}},
    "f0_method": "rmvpe",
    "index_rate": 0.4,
    "filter_radius": 5,
    "rms_mix_rate": 0.8,
    "protect": 0.2,
    "crepe_hop_length": 128,
}

LEGACY_SETTINGS = {
    "pitch_shift": 2.0,
    "formant_shift": 1.0,
    "effects": {"echo": {"enabled": True}},
}


class TestNormalizePresetSettings:
    def test_keeps_every_advanced_field(self):
        result = normalize_preset_settings(FULL_SETTINGS)
        assert result["f0_method"] == "rmvpe"
        assert result["index_rate"] == pytest.approx(0.4)
        assert result["filter_radius"] == 5
        assert result["rms_mix_rate"] == pytest.approx(0.8)
        assert result["protect"] == pytest.approx(0.2)
        assert result["crepe_hop_length"] == 128

    def test_preserves_the_original_three_fields(self):
        result = normalize_preset_settings(FULL_SETTINGS)
        assert result["pitch_shift"] == pytest.approx(3.5)
        assert result["formant_shift"] == pytest.approx(-2.0)
        assert result["effects"] == FULL_SETTINGS["effects"]

    def test_legacy_payload_gains_no_advanced_keys(self):
        # Absence must survive: the client reads it as "leave as-is".
        result = normalize_preset_settings(LEGACY_SETTINGS)
        assert advanced_fields_present(result) == set()
        assert set(result) == {"pitch_shift", "formant_shift", "effects"}

    def test_empty_payload_still_yields_the_base_shape(self):
        result = normalize_preset_settings({})
        assert result == {"pitch_shift": 0.0, "formant_shift": 0.0, "effects": {}}

    def test_non_dict_payload_is_tolerated(self):
        assert normalize_preset_settings(None)["effects"] == {}

    def test_non_dict_effects_become_an_empty_rack(self):
        assert normalize_preset_settings({"effects": "nope"})["effects"] == {}

    @pytest.mark.parametrize(
        "field,value,expected",
        [
            ("index_rate", 5.0, 1.0),
            ("index_rate", -1.0, 0.0),
            ("filter_radius", 99, 7),
            ("filter_radius", -3, 0),
            ("rms_mix_rate", 2.0, 1.0),
            ("protect", 9.0, 0.5),
            ("crepe_hop_length", 12, 64),
            ("crepe_hop_length", 4096, 512),
        ],
    )
    def test_values_are_clamped_to_the_supported_range(self, field, value, expected):
        result = normalize_preset_settings({field: value})
        assert result[field] == pytest.approx(expected)

    @pytest.mark.parametrize("field", ["filter_radius", "crepe_hop_length"])
    def test_integer_fields_are_stored_as_ints(self, field):
        assert isinstance(normalize_preset_settings({field: 100.7})[field], int)

    @pytest.mark.parametrize("value", ["", None, "abc", True, float("nan"), float("inf")])
    def test_unusable_values_are_dropped_rather_than_defaulted(self, value):
        result = normalize_preset_settings({"index_rate": value})
        assert "index_rate" not in result

    @pytest.mark.parametrize("value", ["nope", "", 3, None])
    def test_unknown_f0_methods_are_dropped(self, value):
        assert "f0_method" not in normalize_preset_settings({"f0_method": value})

    def test_f0_method_is_normalised(self):
        assert normalize_preset_settings({"f0_method": " RMVPE "})["f0_method"] == "rmvpe"

    def test_every_declared_advanced_field_round_trips(self):
        result = normalize_preset_settings(FULL_SETTINGS)
        assert set(ADVANCED_FIELDS).issubset(result)


class TestPresetStoreRoundTrip:
    def test_saved_preset_keeps_the_advanced_fields(self, tmp_path):
        store = PresetStore(str(tmp_path / "presets.json"))
        saved = store.save("My Voice", FULL_SETTINGS)

        assert saved["settings"]["f0_method"] == "rmvpe"
        assert saved["settings"]["filter_radius"] == 5

    def test_advanced_fields_survive_a_reload_from_disk(self, tmp_path):
        path = tmp_path / "presets.json"
        PresetStore(str(path)).save("My Voice", FULL_SETTINGS)

        reloaded = PresetStore(str(path)).list_user()
        assert len(reloaded) == 1
        settings = reloaded[0]["settings"]
        assert settings["index_rate"] == pytest.approx(0.4)
        assert settings["rms_mix_rate"] == pytest.approx(0.8)
        assert settings["protect"] == pytest.approx(0.2)
        assert settings["f0_method"] == "rmvpe"

    def test_legacy_preset_on_disk_loads_unchanged(self, tmp_path):
        path = tmp_path / "presets.json"
        path.write_text(
            json.dumps([{
                "id": "user-old",
                "name": "Old",
                "emoji": "⭐",
                "settings": LEGACY_SETTINGS,
            }]),
            encoding="utf-8",
        )

        loaded = PresetStore(str(path)).list_user()[0]
        assert advanced_fields_present(loaded["settings"]) == set()
        assert loaded["settings"]["pitch_shift"] == 2.0

    def test_saving_a_legacy_shaped_payload_adds_nothing(self, tmp_path):
        store = PresetStore(str(tmp_path / "presets.json"))
        saved = store.save("Simple", LEGACY_SETTINGS)
        assert advanced_fields_present(saved["settings"]) == set()

    def test_overwriting_a_preset_replaces_its_advanced_fields(self, tmp_path):
        store = PresetStore(str(tmp_path / "presets.json"))
        store.save("Same Name", FULL_SETTINGS)
        again = store.save("Same Name", LEGACY_SETTINGS)

        assert advanced_fields_present(again["settings"]) == set()
        assert len(store.list_user()) == 1

    def test_existing_validation_still_applies(self, tmp_path):
        store = PresetStore(str(tmp_path / "presets.json"))
        with pytest.raises(ValueError):
            store.save("   ", FULL_SETTINGS)
        with pytest.raises(ValueError):
            store.save("x" * 41, FULL_SETTINGS)
        with pytest.raises(ValueError):
            store.save("ok", "not a dict")


class TestBuiltinPresets:
    def test_builtins_carry_no_advanced_fields(self):
        """They describe a voice, not a pitch-detection strategy."""
        for preset in BUILTIN_PRESETS:
            assert advanced_fields_present(preset["settings"]) == set(), preset["id"]

    def test_builtins_still_have_the_original_three(self):
        for preset in BUILTIN_PRESETS:
            assert set(preset["settings"]) == {"pitch_shift", "formant_shift", "effects"}

    def test_every_builtin_has_an_emoji(self):
        for preset in BUILTIN_PRESETS:
            assert preset.get("emoji")
