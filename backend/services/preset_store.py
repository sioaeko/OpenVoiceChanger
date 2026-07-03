"""Voice preset definitions and user preset persistence.

A preset bundles the tunable stream settings (pitch, formant, effect rack
state) into one named payload the client can apply in a single click.
Built-in presets ship with the app; user presets are stored as JSON on disk.
"""

import json
import logging
import re
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_USER_PRESETS = 100

BUILTIN_PRESETS = [
    {
        "id": "clean",
        "name": "Clean",
        "emoji": "🎙️",
        "description": "No coloration — raw model or mic output",
        "settings": {"pitch_shift": 0, "formant_shift": 0, "effects": {}},
    },
    {
        "id": "chipmunk",
        "name": "Chipmunk",
        "emoji": "🐿️",
        "description": "High pitch, bright formants",
        "settings": {
            "pitch_shift": 7,
            "formant_shift": 4,
            "effects": {},
        },
    },
    {
        "id": "helium",
        "name": "Helium",
        "emoji": "🎈",
        "description": "Balloon-gas timbre, mostly formants",
        "settings": {
            "pitch_shift": 3,
            "formant_shift": 7,
            "effects": {},
        },
    },
    {
        "id": "deep",
        "name": "Deep Voice",
        "emoji": "🎩",
        "description": "Lowered pitch with darker formants",
        "settings": {
            "pitch_shift": -6,
            "formant_shift": -4,
            "effects": {"eq": {"enabled": True, "low": 4, "high": -2}},
        },
    },
    {
        "id": "monster",
        "name": "Monster",
        "emoji": "👹",
        "description": "Growling low pitch with drive",
        "settings": {
            "pitch_shift": -9,
            "formant_shift": -5,
            "effects": {
                "distortion": {"enabled": True, "drive": 0.45},
                "reverb": {"enabled": True, "size": 0.35, "mix": 0.25},
            },
        },
    },
    {
        "id": "robot",
        "name": "Robot",
        "emoji": "🤖",
        "description": "Ring-mod metal voice with bit reduction",
        "settings": {
            "pitch_shift": 0,
            "formant_shift": 0,
            "effects": {
                "robot": {"enabled": True, "freq": 90},
                "bitcrush": {"enabled": True, "bits": 10, "down": 2},
            },
        },
    },
    {
        "id": "alien",
        "name": "Alien",
        "emoji": "👽",
        "description": "Slow ring-mod wobble with chorus",
        "settings": {
            "pitch_shift": 2,
            "formant_shift": 2,
            "effects": {
                "robot": {"enabled": True, "freq": 28},
                "chorus": {"enabled": True, "rate": 1.6, "depth": 0.7, "mix": 0.5},
            },
        },
    },
    {
        "id": "whisper",
        "name": "Whisper",
        "emoji": "🤫",
        "description": "Breathy noise-excited voice",
        "settings": {
            "pitch_shift": 0,
            "formant_shift": 0,
            "effects": {
                "whisper": {"enabled": True, "mix": 0.85},
                "gain": {"enabled": True, "db": 4},
            },
        },
    },
    {
        "id": "ghost",
        "name": "Ghost",
        "emoji": "👻",
        "description": "Whispery echoes in a large space",
        "settings": {
            "pitch_shift": -2,
            "formant_shift": 0,
            "effects": {
                "whisper": {"enabled": True, "mix": 0.6},
                "reverb": {"enabled": True, "size": 0.85, "mix": 0.5},
                "echo": {"enabled": True, "time": 0.42, "feedback": 0.45, "mix": 0.3},
            },
        },
    },
    {
        "id": "telephone",
        "name": "Telephone",
        "emoji": "📞",
        "description": "Narrowband landline call",
        "settings": {
            "pitch_shift": 0,
            "formant_shift": 0,
            "effects": {
                "telephone": {"enabled": True},
                "compressor": {"enabled": True, "threshold": -24, "ratio": 4},
            },
        },
    },
    {
        "id": "megaphone",
        "name": "Megaphone",
        "emoji": "📣",
        "description": "Distorted PA horn",
        "settings": {
            "pitch_shift": 0,
            "formant_shift": 0,
            "effects": {
                "telephone": {"enabled": True},
                "distortion": {"enabled": True, "drive": 0.55},
                "gain": {"enabled": True, "db": 3},
            },
        },
    },
    {
        "id": "radio",
        "name": "Radio DJ",
        "emoji": "📻",
        "description": "Broadcast warmth and compression",
        "settings": {
            "pitch_shift": 0,
            "formant_shift": 0,
            "effects": {
                "eq": {"enabled": True, "low": 3, "high": 2},
                "compressor": {"enabled": True, "threshold": -26, "ratio": 5},
                "gain": {"enabled": True, "db": 2},
            },
        },
    },
    {
        "id": "cave",
        "name": "Cave",
        "emoji": "🕳️",
        "description": "Long dark echoes",
        "settings": {
            "pitch_shift": 0,
            "formant_shift": 0,
            "effects": {
                "reverb": {"enabled": True, "size": 0.85, "mix": 0.45},
                "echo": {"enabled": True, "time": 0.35, "feedback": 0.5, "mix": 0.35},
                "eq": {"enabled": True, "low": 2, "high": -4},
            },
        },
    },
    {
        "id": "stadium",
        "name": "Stadium",
        "emoji": "🏟️",
        "description": "Huge announcement reverb",
        "settings": {
            "pitch_shift": 0,
            "formant_shift": 0,
            "effects": {
                "echo": {"enabled": True, "time": 0.6, "feedback": 0.4, "mix": 0.4},
                "reverb": {"enabled": True, "size": 1.0, "mix": 0.5},
                "compressor": {"enabled": True, "threshold": -20, "ratio": 3},
            },
        },
    },
    {
        "id": "underwater",
        "name": "Underwater",
        "emoji": "🌊",
        "description": "Muffled, slowly wobbling depths",
        "settings": {
            "pitch_shift": 0,
            "formant_shift": -2,
            "effects": {
                "eq": {"enabled": True, "low": 6, "high": -12},
                "chorus": {"enabled": True, "rate": 0.3, "depth": 0.8, "mix": 0.6},
            },
        },
    },
    {
        "id": "arcade",
        "name": "Arcade",
        "emoji": "🕹️",
        "description": "8-bit crushed game cabinet voice",
        "settings": {
            "pitch_shift": 2,
            "formant_shift": 0,
            "effects": {
                "bitcrush": {"enabled": True, "bits": 6, "down": 6},
                "eq": {"enabled": True, "low": -2, "high": 4},
            },
        },
    },
]


def _slugify(name: str) -> str:
    slug = re.sub(r"[^\w\-]+", "-", name.strip().lower()).strip("-")
    return slug[:48] or "preset"


class PresetStore:
    """Thread-safe JSON-file-backed store for user presets."""

    def __init__(self, path: str) -> None:
        self._path = Path(path)
        self._lock = threading.Lock()
        self._presets: dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                self._presets = {
                    p["id"]: p
                    for p in data
                    if isinstance(p, dict) and "id" in p and "settings" in p
                }
            logger.info("Loaded %d user preset(s) from %s", len(self._presets), self._path)
        except Exception:
            logger.exception("Failed to load user presets from %s", self._path)

    def _flush_locked(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(list(self._presets.values()), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(self._path)

    def list_builtin(self) -> list[dict]:
        return [{**p, "builtin": True} for p in BUILTIN_PRESETS]

    def list_user(self) -> list[dict]:
        with self._lock:
            return [{**p, "builtin": False} for p in self._presets.values()]

    def save(self, name: str, settings: dict, emoji: str = "⭐") -> dict:
        name = name.strip()
        if not name:
            raise ValueError("Preset name is empty")
        if len(name) > 40:
            raise ValueError("Preset name is too long (max 40 characters)")
        if not isinstance(settings, dict):
            raise ValueError("Preset settings must be an object")

        preset_id = f"user-{_slugify(name)}"
        preset = {
            "id": preset_id,
            "name": name,
            "emoji": (emoji or "⭐")[:4],
            "description": "Custom preset",
            "settings": {
                "pitch_shift": float(settings.get("pitch_shift", 0) or 0),
                "formant_shift": float(settings.get("formant_shift", 0) or 0),
                "effects": settings.get("effects") if isinstance(settings.get("effects"), dict) else {},
            },
        }

        with self._lock:
            if preset_id not in self._presets and len(self._presets) >= MAX_USER_PRESETS:
                raise ValueError(f"Preset limit reached ({MAX_USER_PRESETS})")
            self._presets[preset_id] = preset
            self._flush_locked()
        logger.info("Saved user preset: %s", preset_id)
        return {**preset, "builtin": False}

    def delete(self, preset_id: str) -> None:
        with self._lock:
            if preset_id not in self._presets:
                raise KeyError(preset_id)
            del self._presets[preset_id]
            self._flush_locked()
        logger.info("Deleted user preset: %s", preset_id)
