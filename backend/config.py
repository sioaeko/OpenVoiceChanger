from pydantic_settings import BaseSettings

# Canonical default pitch-detection method, shared by the realtime WebSocket
# path and the offline file converter so both behave identically when a client
# omits `f0_method`. "pm" is chosen deliberately: it is what the Voice Lab UI
# ships as its default, it needs no downloaded assets, and — unlike "rmvpe" —
# it can never silently fall back to the much slower "harvest" when
# models/assets/rmvpe/rmvpe.pt is absent. Pick "rmvpe" per request (one click
# in Voice Lab) when quality matters more than latency.
DEFAULT_F0_METHOD = "pm"

# Origins allowed by default: the Vite dev server and the backend's own port on
# loopback. Same-origin requests are always allowed regardless of this list
# (see backend.security.is_origin_allowed), so serving the built frontend from
# this backend works on any host without extra configuration.
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]


class Settings(BaseSettings):
    """Application settings loaded from environment variables with OVC_ prefix."""

    MODELS_DIR: str = "models"
    # Loopback by default. Set OVC_HOST=0.0.0.0 to expose the studio on a LAN,
    # and add the LAN origin to OVC_CORS_ORIGINS if you also serve the frontend
    # from a different host/port than the backend.
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    # Sample rate suggested to the client. The browser reports the rate its
    # AudioContext actually runs at in the WebSocket config message, and that
    # value — not this one — is what the server processes with.
    SAMPLE_RATE: int = 40000
    CHUNK_SIZE: int = 4096
    # Explicit allowlist for cross-origin HTTP and WebSocket access.
    CORS_ORIGINS: list[str] = DEFAULT_ALLOWED_ORIGINS
    # Escape hatch for reverse proxies / embedding in another app. Turning this
    # on disables origin checks for both CORS and the WebSocket handshake and
    # also disables credentialed CORS, so only enable it on a trusted network.
    ALLOW_ANY_ORIGIN: bool = False
    LOG_LEVEL: str = "info"
    HUBERT_PATH: str = "models/assets/hubert_base.pt"
    RMVPE_ROOT: str = "models/assets/rmvpe"
    RMVPE_ONNX_PATH: str = "models/assets/rmvpe/rmvpe.onnx"
    CREPE_ONNX_FULL_PATH: str = "models/assets/crepe/full.onnx"
    CREPE_ONNX_TINY_PATH: str = "models/assets/crepe/tiny.onnx"
    CREPE_HOP_LENGTH: int = 160
    # Length of the rolling 16 kHz history each RVC stream keeps and re-runs
    # inference over. Every chunk is inferred against this whole window, so the
    # value trades conversion context against per-chunk CPU/GPU cost: 0.14 s
    # keeps realtime headroom at the default 4096-sample chunk. Raising it
    # improves continuity but multiplies inference work per chunk.
    RVC_STREAM_CONTEXT_SECONDS: float = 0.14
    RVC_INDEX_RATE: float = 0.75
    RVC_FILTER_RADIUS: int = 3
    RVC_RMS_MIX_RATE: float = 0.25
    RVC_PROTECT: float = 0.33
    # RVC .pth checkpoints are Python pickles. Loading one with weights_only
    # disabled executes arbitrary code from the file, so it stays off unless
    # the operator explicitly opts in for a checkpoint they trust.
    RVC_ALLOW_UNSAFE_CHECKPOINTS: bool = False
    PRESETS_PATH: str = "data/presets.json"
    MAX_CONVERT_SECONDS: int = 600
    # Public release metadata only; installation always requires an explicit action.
    UPDATE_CHECK_ENABLED: bool = True

    model_config = {
        "env_prefix": "OVC_",
    }


settings = Settings()
