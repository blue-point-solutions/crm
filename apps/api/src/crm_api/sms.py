# src/crm_api/sms.py
"""Outbound SMS endpoints — thin FastAPI glue over platform-sms.

The send/record/refresh logic lives in the library (`platform_sms.log`:
SmsSendService over the SmsLogStore port); this module contributes only the
asyncpg store (app-owned ``crm_sms_log`` table) and the HTTP layer.

Authenticated: any logged-in user may send (single-tenant internal fleet).
503 when no provider is configured; 400 with the provider's reason on
rejection (not 502 — Cloudflare replaces origin 502/504 bodies with its own
error page). Every attempt is recorded; ``POST /sms/{id}/refresh`` pulls the
provider's current delivery status into the row.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from platform_core.auth.deps import get_current_user
from platform_core.db import get_pool
from platform_sms.log import SmsSendRejected, SmsSendService
from platform_sms.ports import SmsGateway
from pydantic import BaseModel, Field

router = APIRouter()


async def ensure_sms_log_table(pool: asyncpg.Pool) -> None:
    """App-owned send/delivery log (same pattern as crm_profiles)."""
    async with pool.acquire() as conn:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS crm_sms_log ("
            "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
            "  user_id UUID, "
            "  recipient TEXT NOT NULL, "
            "  message TEXT NOT NULL, "
            "  sender TEXT, "
            "  provider_message_id TEXT, "
            "  status TEXT NOT NULL, "
            "  error TEXT, "
            "  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
            "  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
            ")"
        )


class AsyncpgSmsLogStore:
    """platform_sms.log.SmsLogStore over the crm_sms_log table."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def record(
        self,
        *,
        user_id: uuid.UUID | None,
        recipient: str,
        message: str,
        sender: str | None,
        provider_message_id: str | None,
        status: str,
        error: str | None,
    ) -> uuid.UUID:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "INSERT INTO crm_sms_log "
                "  (user_id, recipient, message, sender, provider_message_id, status, error) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
                user_id, recipient, message, sender, provider_message_id, status, error,
            )
            return uuid.UUID(str(row["id"]))

    async def get(self, log_id: uuid.UUID) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM crm_sms_log WHERE id = $1", log_id)
            return dict(row) if row else None

    async def set_status(self, log_id: uuid.UUID, status: str, error: str | None) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                "UPDATE crm_sms_log SET status = $2, error = $3, updated_at = now() "
                "WHERE id = $1",
                log_id, status, error,
            )

    async def list_recent(self, limit: int) -> list[dict[str, Any]]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM crm_sms_log ORDER BY created_at DESC LIMIT $1", limit
            )
            return [dict(r) for r in rows]


class SmsSendBody(BaseModel):
    to: str = Field(min_length=7, max_length=20, description="E.164 or 09… PH mobile")
    message: str = Field(min_length=1, max_length=1000)


class SmsLogEntry(BaseModel):
    id: uuid.UUID
    recipient: str
    sender: str | None = None
    status: str
    provider_message_id: str | None = None
    error: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SmsSendResponse(BaseModel):
    ok: bool = True
    id: uuid.UUID | None = None
    provider_message_id: str | None = None


def get_sms_gateway(request: Request) -> SmsGateway:
    """App-state gateway built in the lifespan; 503 when unconfigured."""
    gateway = getattr(request.app.state, "sms_gateway", None)
    if gateway is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMS is not configured",
        )
    return gateway


async def get_sms_log(pool: asyncpg.Pool = Depends(get_pool)) -> AsyncpgSmsLogStore:  # noqa: B008
    return AsyncpgSmsLogStore(pool)


@router.post("/sms", response_model=SmsSendResponse)
async def sms_send(
    request: Request,
    body: SmsSendBody,
    user: object = Depends(get_current_user),
    gateway: SmsGateway = Depends(get_sms_gateway),  # noqa: B008
    store: AsyncpgSmsLogStore = Depends(get_sms_log),  # noqa: B008
) -> SmsSendResponse:
    settings = request.app.state.settings
    svc = SmsSendService(gateway, store)
    try:
        log_id, result = await svc.send(
            recipient=body.to,
            content=body.message,
            sender=settings.semaphore_sender_name or None,
            user_id=getattr(user, "id", None),
        )
    except SmsSendRejected as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SMS provider rejected the message: {exc.cause} (log id {exc.log_id})",
        ) from exc
    return SmsSendResponse(id=log_id, provider_message_id=result.provider_message_id)


@router.get("/sms", response_model=list[SmsLogEntry])
async def sms_list(
    limit: int = 50,
    _user: object = Depends(get_current_user),
    store: AsyncpgSmsLogStore = Depends(get_sms_log),  # noqa: B008
) -> list[SmsLogEntry]:
    return [SmsLogEntry(**row) for row in await store.list_recent(min(limit, 200))]


@router.post("/sms/{log_id}/refresh", response_model=SmsLogEntry)
async def sms_refresh(
    log_id: uuid.UUID,
    _user: object = Depends(get_current_user),
    gateway: SmsGateway = Depends(get_sms_gateway),  # noqa: B008
    store: AsyncpgSmsLogStore = Depends(get_sms_log),  # noqa: B008
) -> SmsLogEntry:
    row = await SmsSendService(gateway, store).refresh(log_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="unknown SMS log id")
    return SmsLogEntry(**row)
