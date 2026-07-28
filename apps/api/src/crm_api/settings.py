# src/crm_api/settings.py
"""App configuration (env / .env). Kept minimal for the scaffold — feature
tickets add their own settings (JWT secret in #7 auth, R2 in card storage, etc.)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # populate_by_name so tests can pass aliased fields by their python names.
    model_config = SettingsConfigDict(
        env_prefix="CRM_", env_file=".env", extra="ignore", populate_by_name=True
    )

    service_name: str = "crm-api"
    environment: str = "dev"
    # Optional so the app + unit tests run with no database configured; when set,
    # the lifespan runs platform-core migrations and pre-warms the pool.
    database_url: str | None = None

    # Expo web dev server + Expo web export preview origins so the mobile app's
    # RN-Web build can call the API cross-origin. Required for authenticated
    # requests: the Authorization header makes every call non-simple, so the
    # browser sends an OPTIONS preflight that CORSMiddleware must answer
    # (otherwise 405 blocks all authed requests, not just credentialed ones).
    # Set CRM_CORS_ORIGINS explicitly (and tightly) in production.
    cors_origins: str = "http://localhost:8081,http://localhost:8082,http://localhost:19006"

    # Outbound email (auth password-reset / email-verify) via Resend, and
    # outbound SMS via Semaphore. Unprefixed aliases match the shared .env
    # convention across projects; unset ⇒ email falls back to the log-only
    # sender and POST /sms answers 503.
    resend_api_key: SecretStr | None = Field(default=None, validation_alias="RESEND_API_KEY")
    resend_from: str = Field(
        default="BP Connect <no-reply@bpconnect.app>", validation_alias="RESEND_FROM"
    )
    semaphore_api_key: SecretStr | None = Field(
        default=None, validation_alias="SEMAPHORE_API_KEY"
    )
    semaphore_sender_name: str = Field(default="", validation_alias="SEMAPHORE_SENDER_NAME")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
