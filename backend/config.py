from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables with OVC_ prefix."""

    MODELS_DIR: str = "models"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    SAMPLE_RATE: int = 40000
    CHUNK_SIZE: int = 4096
    CORS_ORIGINS: list[str] = ["*"]
    LOG_LEVEL: str = "info"
    HUBERT_PATH: str = "models/assets/hubert_base.pt"
    RMVPE_ROOT: str = "models/assets/rmvpe"
    RVC_STREAM_CONTEXT_SECONDS: float = 0.14
    RVC_INDEX_RATE: float = 0.75
    RVC_FILTER_RADIUS: int = 3
    RVC_RMS_MIX_RATE: float = 0.25
    RVC_PROTECT: float = 0.33

    model_config = {
        "env_prefix": "OVC_",
    }


settings = Settings()
