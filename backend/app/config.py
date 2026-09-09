from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Patterns"
    secret_key: str = "change-me-in-azure-key-vault"
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = "postgresql+psycopg2://patterns:patterns@postgres:5432/patterns"
    media_root: Path = Path("/data/media")
    azure_storage_connection_string: str | None = None
    azure_storage_container: str = "jaguar-media"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    match_threshold: float = 0.82
    suggest_threshold: float = 0.68
    # opencv | embedding | trained | auto
    recognition_engine: str = "auto"
    # Path to coat-reid checkpoint from `python -m app.train_coat_reid`
    coat_model_path: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
