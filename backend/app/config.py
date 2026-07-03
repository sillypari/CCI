from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Pramaan IPDR"
    api_prefix: str = "/api"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    upload_dir: Path = Path("uploads")
    max_upload_bytes: int = 50 * 1024 * 1024

    model_config = SettingsConfigDict(env_file=".env", env_prefix="IPDR_", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()