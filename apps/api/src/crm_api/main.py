# src/crm_api/main.py
"""CRM FastAPI app factory.

Scaffold (ticket #2): health endpoint + lifespan that runs platform-core
migrations when a database is configured. Feature routers (auth #7, contacts #8,
cards, …) register at the marked seam.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from crm_api.settings import Settings, get_settings


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Run DB migrations + pre-warm the pool when a database is configured.

    With no DATABASE_URL (unit tests, bare boot) this is a no-op so the app still
    starts and /health works.
    """
    settings: Settings = app.state.settings
    db_url = settings.database_url or os.environ.get("DATABASE_URL")
    if db_url:
        # platform-core owns users/sessions/oauth migrations (idempotent).
        from platform_core.db import _ensure_pool, run_migrations

        run_migrations(db_url)
        await _ensure_pool()
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title=settings.service_name, lifespan=_lifespan)
    app.state.settings = settings

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    # --- feature routers register here (auth #7, contacts #8, cards, …) ---

    return app


app = create_app()
