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
        from crm_api.contacts import ensure_contacts_tables
        from crm_api.sms import ensure_sms_log_table

        run_migrations(db_url)
        pool = await _ensure_pool()
        await ensure_profile_table(pool)
        await ensure_sms_log_table(pool)
        await ensure_contacts_tables(pool)

    # Outbound notification gateways (Resend email, Semaphore SMS) share one
    # HTTP client whose lifetime matches the app's. Unconfigured keys leave the
    # defaults in place: log-only email, 503 from POST /sms.
    http_client = None
    if settings.resend_api_key or settings.semaphore_api_key:
        import httpx

        http_client = httpx.AsyncClient(timeout=15)
    if settings.resend_api_key:
        from platform_core.ports.email import register_email_sender
        from platform_email.providers.resend import ResendGateway

        from crm_api.notify import ResendEmailSender

        register_email_sender(
            ResendEmailSender(
                ResendGateway(
                    settings.resend_api_key.get_secret_value(), http_client=http_client
                ),
                from_addr=settings.resend_from,
            )
        )
    if settings.semaphore_api_key:
        from platform_sms.providers.semaphore import SemaphoreGateway

        app.state.sms_gateway = SemaphoreGateway(
            settings.semaphore_api_key.get_secret_value(),
            http_client=http_client,
            sender_name=settings.semaphore_sender_name or None,
        )

    # Card-image storage: presigned direct-to-R2 uploads (bucket crm-images).
    if settings.r2_account_id and settings.r2_bucket and settings.r2_secret_access_key:
        from platform_storage_r2 import R2StorageAdapter, R2StorageConfig

        app.state.card_storage = R2StorageAdapter(
            config=R2StorageConfig(
                account_id=settings.r2_account_id,
                bucket=settings.r2_bucket,
                access_key_id=settings.r2_access_key_id,
                secret_access_key=settings.r2_secret_access_key.get_secret_value(),
            )
        )

    try:
        yield
    finally:
        if http_client is not None:
            await http_client.aclose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title=settings.service_name, lifespan=_lifespan)
    app.state.settings = settings

    # CORS so the mobile app's RN-Web build can call the API cross-origin.
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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

    from crm_api.sms import router as sms_router

    app.include_router(sms_router)

    from crm_api.cards import router as cards_router
    from crm_api.contacts import router as contacts_router
    from crm_api.dashboard import router as dashboard_router
    from crm_api.import_export import router as import_export_router

    app.include_router(contacts_router)
    app.include_router(dashboard_router)
    app.include_router(cards_router)
    app.include_router(import_export_router)

    return app


app = create_app()
