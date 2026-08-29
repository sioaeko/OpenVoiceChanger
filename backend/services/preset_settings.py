"""Shape and coercion rules for a preset's ``settings`` payload.

A preset is meant to restore a voice in one click, so it stores the whole
tunable state: the pitch/formant pair and effect rack it always carried, plus
the RVC controls the Voice Lab exposes.

The advanced fields are *optional by design*. Built-in presets describe a voice
character and deliberately say nothing about pitch detection or retrieval
strength, and user presets saved before this existed have no such keys either.
Both cases must round-trip unchanged, which is why a missing field is dropped
here rather than defaulted — the client treats absence as "leave as-is".
"""

# field name -> (coercion, low, high)
ADVANCED_FIELDS: dict[str, tuple] = {
    "index_rate": (float, 0.0, 1.0),
    "filter_radius": (int, 0, 7),
    "rms_mix_rate": (float, 0.0, 1.0),
    "protect": (float, 0.0, 0.5),
}

F0_METHODS = ("pm", "harvest", "crepe", "rmvpe", "fcpe")


def _coerce_number(value, cast, low, high):
    """Return the clamped number, or None when it is not usable."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = cast(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if number != number or number in (float("inf"), float("-inf")):  # NaN / inf
        return None
    return min(max(number, low), high)


def _coerce_f0_method(value):
    if not isinstance(value, str):
        return None
    method = value.strip().lower()
    return method if method in F0_METHODS else None


def normalize_preset_settings(settings: dict) -> dict:
    """Build the stored ``settings`` payload for a user preset.

    ``pitch_shift``, ``formant_shift`` and ``effects`` are always present (that
    is the pre-existing contract). Advanced fields appear only when the caller
    supplied a usable value.
    """
    if not isinstance(settings, dict):
        settings = {}

    normalized = {
        "pitch_shift": float(settings.get("pitch_shift", 0) or 0),
        "formant_shift": float(settings.get("formant_shift", 0) or 0),
        "effects": settings.get("effects") if isinstance(settings.get("effects"), dict) else {},
    }

    f0_method = _coerce_f0_method(settings.get("f0_method"))
    if f0_method is not None:
        normalized["f0_method"] = f0_method

    for field, (cast, low, high) in ADVANCED_FIELDS.items():
        number = _coerce_number(settings.get(field), cast, low, high)
        if number is not None:
            normalized[field] = number

    return normalized


def advanced_fields_present(settings: dict) -> set[str]:
    """Which optional fields a stored preset actually carries."""
    if not isinstance(settings, dict):
        return set()
    keys = set(ADVANCED_FIELDS) | {"f0_method"}
    return {key for key in keys if key in settings}
