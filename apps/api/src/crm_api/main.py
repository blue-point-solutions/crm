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

        from crm_api.auth import ensure_profile_table

        run_migrations(db_url)
        pool = await _ensure_pool()
        await ensure_profile_table(pool)
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title=settings.service_name, lifespan=_lifespan)
    app.state.settings = settings

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    # --- feature routers register here (auth #7, contacts #8, cards, …) ---
    from platform_core.auth.router import router as platform_auth_router

    from crm_api.auth import router as crm_auth_router

    # crm_auth_router owns /auth/register, /auth/login, /me (wire contract the
    # mobile app already expects: {email, password}, not platform-core's
    # {username, password}). Drop platform-core's own /auth/login so there's
    # exactly one handler per path; keep its /auth/refresh, /auth/logout,
    # password-reset, email-verify unchanged — mobile's refresh call already
    # matches platform-core's {refresh_token} shape.
    platform_auth_router.routes = [
        r for r in platform_auth_router.routes if getattr(r, "path", None) != "/auth/login"
    ]
    app.include_router(crm_auth_router)
    app.include_router(platform_auth_router)

    return app


app = create_app()
