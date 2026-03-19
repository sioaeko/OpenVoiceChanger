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

    model_config = {
        "env_prefix": "OVC_",
    }


settings = Settings()
