# src/crm_api/settings.py
"""App configuration (env / .env). Kept minimal for the scaffold — feature
tickets add their own settings (JWT secret in #7 auth, R2 in card storage, etc.)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CRM_", env_file=".env", extra="ignore")

    service_name: str = "crm-api"
    environment: str = "dev"
    # Optional so the app + unit tests run with no database configured; when set,
    # the lifespan runs platform-core migrations and pre-warms the pool.
    database_url: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
