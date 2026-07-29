# src/crm_api/dashboard.py
"""GET /dashboard — contact-derived summary for the mobile home screen.

Deals/pipeline are Phase 2; those fields are returned as zeros so the wire
shape is stable when they become real.
"""

from __future__ import annotations

import uuid
from typing import Any, Protocol

import asyncpg
from fastapi import APIRouter, Depends
from platform_core.auth.deps import get_current_user
from platform_core.db import get_pool
from platform_core.users.models import User
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from crm_api.auth import DEFAULT_TENANT_ID
from crm_api.contacts import ContactListItemOut, _list_item

router = APIRouter(tags=["dashboard"])


class DashboardRepo(Protocol):
    async def summary(self, tenant_id: uuid.UUID) -> dict[str, Any]: ...


class AsyncpgDashboardRepo:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def summary(self, tenant_id: uuid.UUID) -> dict[str, Any]:
        async with self._pool.acquire() as conn:
            total = await conn.fetchval(
                "SELECT count(*) FROM crm_contacts WHERE tenant_id = $1", tenant_id
            )
            recent = await conn.fetch(
                "SELECT * FROM crm_contacts WHERE tenant_id = $1 "
                "ORDER BY created_at DESC LIMIT 5",
                tenant_id,
            )
            upcoming = await conn.fetch(
                "SELECT * FROM crm_contacts WHERE tenant_id = $1 "
                "AND follow_up_at IS NOT NULL AND follow_up_at >= now() - interval '1 day' "
                "ORDER BY follow_up_at ASC LIMIT 5",
                tenant_id,
            )
            inactive = await conn.fetch(
                "SELECT c.* FROM crm_contacts c WHERE c.tenant_id = $1 "
                "AND c.updated_at < now() - interval '30 days' "
                "AND NOT EXISTS (SELECT 1 FROM crm_activity a WHERE a.contact_id = c.id "
                "                AND a.created_at > now() - interval '30 days') "
                "ORDER BY c.updated_at ASC LIMIT 5",
                tenant_id,
            )
        return {
            "total_contacts": int(total or 0),
            "recent": [dict(r) for r in recent],
            "upcoming_reminders": [dict(r) for r in upcoming],
            "inactive_30d": [dict(r) for r in inactive],
        }


async def get_dashboard_repo(pool: asyncpg.Pool = Depends(get_pool)) -> DashboardRepo:  # noqa: B008
    return AsyncpgDashboardRepo(pool)


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReminderOut(_Camel):
    contact: ContactListItemOut
    follow_up_date: str


class DashboardOut(_Camel):
    total_contacts: int
    recent: list[ContactListItemOut]
    upcoming_reminders: list[ReminderOut]
    inactive_30d: list[ContactListItemOut]
    active_deals_count: int = 0
    pipeline_value: float = 0.0


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(
    _user: User = Depends(get_current_user),  # noqa: B008
    repo: DashboardRepo = Depends(get_dashboard_repo),  # noqa: B008
) -> DashboardOut:
    data = await repo.summary(DEFAULT_TENANT_ID)
    return DashboardOut(
        total_contacts=data["total_contacts"],
        recent=[_list_item(r) for r in data["recent"]],
        upcoming_reminders=[
            ReminderOut(contact=_list_item(r), follow_up_date=r["follow_up_at"].isoformat())
            for r in data["upcoming_reminders"]
        ],
        inactive_30d=[_list_item(r) for r in data["inactive_30d"]],
    )
