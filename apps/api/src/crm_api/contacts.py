# src/crm_api/contacts.py
"""Contacts API (ticket #8) — tenant-scoped CRUD/search over asyncpg.

Domain vocabulary (status/consent/temperature literals), the weighted
completeness score, and duplicate-candidate matching are reused from
platform-contacts; this module owns persistence (app table ``crm_contacts``)
and the HTTP layer. platform-contacts' ContactService/ContactStore port is
sync-only (flagged at review), so the CRUD itself is thin SQL here rather
than a blocking adapter behind the sync port.

Wire format is the camelCase contract the mobile app already ships
(``apps/mobile/src/api/contacts.ts``): pydantic alias_generator=to_camel on
every body/response model. ``marketingConsent`` uses "NotAsked" on the wire
but the library's canonical "Not Asked" in scoring.

Tenancy: every row carries ``tenant_id UUID NOT NULL`` defaulted to the
synthesized single workspace (see auth.DEFAULT_TENANT_ID) — cheap now,
expensive backfill later, per the Phase-4 recommendation on record.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Protocol

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from platform_contacts import (
    Contact,
    compute_completeness_score,
    find_potential_duplicates,
)
from platform_core.auth.deps import get_current_user
from platform_core.db import get_pool
from platform_core.users.models import User
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from crm_api.auth import DEFAULT_TENANT_ID

router = APIRouter(tags=["contacts"])

WireConsent = Literal["Yes", "No", "NotAsked"]
SortKey = Literal["recent", "name", "company"]

_CONSENT_TO_DB = {"Yes": "Yes", "No": "No", "NotAsked": "Not Asked"}
_CONSENT_TO_WIRE = {v: k for k, v in _CONSENT_TO_DB.items()}


async def ensure_contacts_tables(pool: asyncpg.Pool) -> None:
    """App-owned contact + activity tables (same bootstrap pattern as crm_profiles)."""
    async with pool.acquire() as conn:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS crm_contacts ("
            "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
            f" tenant_id UUID NOT NULL DEFAULT '{DEFAULT_TENANT_ID}', "
            "  first_name TEXT NOT NULL DEFAULT '', "
            "  last_name TEXT NOT NULL DEFAULT '', "
            "  job_title TEXT, "
            "  company TEXT, "
            "  phones TEXT[] NOT NULL DEFAULT '{}', "
            "  emails TEXT[] NOT NULL DEFAULT '{}', "
            "  website TEXT, "
            "  address TEXT, "
            "  linkedin TEXT, "
            "  facebook TEXT, "
            "  card_image_url TEXT, "
            "  industry TEXT, "
            "  source TEXT, "
            "  tags TEXT[] NOT NULL DEFAULT '{}', "
            "  interests TEXT[] NOT NULL DEFAULT '{}', "
            "  status TEXT NOT NULL DEFAULT 'Lead', "
            "  marketing_consent TEXT NOT NULL DEFAULT 'Not Asked', "
            "  decision_maker TEXT NOT NULL DEFAULT 'Unknown', "
            "  lead_temperature TEXT, "
            "  notes TEXT NOT NULL DEFAULT '', "
            "  pain_point TEXT, "
            "  follow_up_at TIMESTAMPTZ, "
            "  favorite BOOLEAN NOT NULL DEFAULT FALSE, "
            "  added_by UUID, "
            "  source_method TEXT NOT NULL DEFAULT 'Manual Entry', "
            "  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
            "  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
            "  revision INT NOT NULL DEFAULT 0"
            ")"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS crm_contacts_tenant_created "
            "ON crm_contacts (tenant_id, created_at DESC)"
        )
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS crm_activity ("
            "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
            f" tenant_id UUID NOT NULL DEFAULT '{DEFAULT_TENANT_ID}', "
            "  contact_id UUID NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE, "
            "  type TEXT NOT NULL, "
            "  content TEXT NOT NULL, "
            "  created_by UUID, "
            "  created_at TIMESTAMPTZ NOT NULL DEFAULT now()"
            ")"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS crm_activity_contact "
            "ON crm_activity (contact_id, created_at DESC)"
        )


# --------------------------------------------------------------------------
# Repo port (async; in-memory fake in tests, asyncpg in prod)
# --------------------------------------------------------------------------


class ContactConflictError(Exception):
    """Optimistic-lock mismatch (stale revision)."""


class ContactRepo(Protocol):
    async def create(self, row: dict[str, Any]) -> dict[str, Any]: ...
    async def get(self, tenant_id: uuid.UUID, contact_id: uuid.UUID) -> dict[str, Any] | None: ...
    async def update(
        self,
        tenant_id: uuid.UUID,
        contact_id: uuid.UUID,
        updates: dict[str, Any],
        expected_revision: int | None,
    ) -> dict[str, Any] | None: ...
    async def delete(self, tenant_id: uuid.UUID, contact_id: uuid.UUID) -> bool: ...
    async def toggle_favorite(
        self, tenant_id: uuid.UUID, contact_id: uuid.UUID
    ) -> dict[str, Any] | None: ...
    async def search(
        self,
        tenant_id: uuid.UUID,
        *,
        q: str | None,
        tag: str | None,
        status: str | None,
        source: str | None,
        lead_temperature: str | None,
        favorite: bool | None,
        sort: SortKey,
        page: int,
        page_size: int,
    ) -> tuple[list[dict[str, Any]], int, dict[str, dict[str, int]]]: ...
    async def candidates(
        self,
        tenant_id: uuid.UUID,
        *,
        emails: list[str],
        phones: list[str],
        first_name: str,
        last_name: str,
    ) -> list[dict[str, Any]]: ...
    async def list_activities(
        self, tenant_id: uuid.UUID, contact_id: uuid.UUID, limit: int
    ) -> list[dict[str, Any]]: ...
    async def add_activity(
        self,
        tenant_id: uuid.UUID,
        contact_id: uuid.UUID,
        *,
        type_: str,
        content: str,
        created_by: uuid.UUID | None,
    ) -> dict[str, Any]: ...


_SORT_SQL: dict[str, str] = {
    "recent": "created_at DESC",
    "name": "lower(last_name) ASC, lower(first_name) ASC",
    "company": "lower(coalesce(company, '')) ASC, lower(last_name) ASC",
}


class AsyncpgContactRepo:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create(self, row: dict[str, Any]) -> dict[str, Any]:
        cols = list(row)
        placeholders = ", ".join(f"${i + 1}" for i in range(len(cols)))
        async with self._pool.acquire() as conn:
            created = await conn.fetchrow(
                f"INSERT INTO crm_contacts ({', '.join(cols)}) "
                f"VALUES ({placeholders}) RETURNING *",
                *row.values(),
            )
        return dict(created)

    async def get(self, tenant_id: uuid.UUID, contact_id: uuid.UUID) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            r = await conn.fetchrow(
                "SELECT * FROM crm_contacts WHERE tenant_id = $1 AND id = $2",
                tenant_id, contact_id,
            )
        return dict(r) if r else None

    async def update(
        self,
        tenant_id: uuid.UUID,
        contact_id: uuid.UUID,
        updates: dict[str, Any],
        expected_revision: int | None,
    ) -> dict[str, Any] | None:
        sets = ", ".join(f"{col} = ${i + 3}" for i, col in enumerate(updates))
        sql = (
            f"UPDATE crm_contacts SET {sets}, updated_at = now(), revision = revision + 1 "
            "WHERE tenant_id = $1 AND id = $2"
        )
        args: list[Any] = [tenant_id, contact_id, *updates.values()]
        if expected_revision is not None:
            sql += f" AND revision = ${len(args) + 1}"
            args.append(expected_revision)
        sql += " RETURNING *"
        async with self._pool.acquire() as conn:
            r = await conn.fetchrow(sql, *args)
            if r is None and expected_revision is not None:
                exists = await conn.fetchval(
                    "SELECT 1 FROM crm_contacts WHERE tenant_id = $1 AND id = $2",
                    tenant_id, contact_id,
                )
                if exists:
                    raise ContactConflictError
        return dict(r) if r else None

    async def delete(self, tenant_id: uuid.UUID, contact_id: uuid.UUID) -> bool:
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM crm_contacts WHERE tenant_id = $1 AND id = $2",
                tenant_id, contact_id,
            )
        return str(result).endswith("1")

    async def toggle_favorite(
        self, tenant_id: uuid.UUID, contact_id: uuid.UUID
    ) -> dict[str, Any] | None:
        # Atomic negation — a read-then-write toggle would let two concurrent
        # taps write the same value.
        async with self._pool.acquire() as conn:
            r = await conn.fetchrow(
                "UPDATE crm_contacts SET favorite = NOT favorite, "
                "updated_at = now(), revision = revision + 1 "
                "WHERE tenant_id = $1 AND id = $2 RETURNING *",
                tenant_id, contact_id,
            )
        return dict(r) if r else None

    async def search(
        self,
        tenant_id: uuid.UUID,
        *,
        q: str | None,
        tag: str | None,
        status: str | None,
        source: str | None,
        lead_temperature: str | None,
        favorite: bool | None,
        sort: SortKey,
        page: int,
        page_size: int,
    ) -> tuple[list[dict[str, Any]], int, dict[str, dict[str, int]]]:
        where = ["tenant_id = $1"]
        args: list[Any] = [tenant_id]

        def bind(value: Any) -> str:
            args.append(value)
            return f"${len(args)}"

        if q:
            p = bind(f"%{q}%")
            where.append(
                f"(first_name || ' ' || last_name ILIKE {p} "
                f"OR coalesce(company, '') ILIKE {p} "
                f"OR EXISTS (SELECT 1 FROM unnest(emails) e WHERE e ILIKE {p}))"
            )
        if tag:
            where.append(f"{bind(tag)} = ANY(tags)")
        if status:
            where.append(f"status = {bind(status)}")
        if source:
            where.append(f"source = {bind(source)}")
        if lead_temperature:
            where.append(f"lead_temperature = {bind(lead_temperature)}")
        if favorite is not None:
            where.append(f"favorite = {bind(favorite)}")

        cond = " AND ".join(where)
        order = _SORT_SQL[sort]
        offset = (page - 1) * page_size
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                f"SELECT * FROM crm_contacts WHERE {cond} ORDER BY {order} "
                f"LIMIT {page_size} OFFSET {offset}",
                *args,
            )
            total = await conn.fetchval(
                f"SELECT count(*) FROM crm_contacts WHERE {cond}", *args
            )
            facet_rows = await conn.fetch(
                "SELECT status, lead_temperature, count(*) AS n FROM crm_contacts "
                "WHERE tenant_id = $1 GROUP BY status, lead_temperature",
                tenant_id,
            )
        status_counts: dict[str, int] = {}
        temp_counts: dict[str, int] = {}
        for fr in facet_rows:
            status_counts[fr["status"]] = status_counts.get(fr["status"], 0) + fr["n"]
            if fr["lead_temperature"]:
                temp_counts[fr["lead_temperature"]] = (
                    temp_counts.get(fr["lead_temperature"], 0) + fr["n"]
                )
        facets = {"status": status_counts, "leadTemperature": temp_counts}
        return [dict(r) for r in rows], int(total or 0), facets

    async def candidates(
        self,
        tenant_id: uuid.UUID,
        *,
        emails: list[str],
        phones: list[str],
        first_name: str,
        last_name: str,
    ) -> list[dict[str, Any]]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM crm_contacts WHERE tenant_id = $1 AND ("
                "  emails && $2::text[] OR phones && $3::text[] "
                "  OR (lower(first_name) = lower($4) AND lower(last_name) = lower($5) "
                "      AND ($4 <> '' OR $5 <> ''))"
                ")",
                tenant_id, emails, phones, first_name, last_name,
            )
        return [dict(r) for r in rows]

    async def list_activities(
        self, tenant_id: uuid.UUID, contact_id: uuid.UUID, limit: int
    ) -> list[dict[str, Any]]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM crm_activity WHERE tenant_id = $1 AND contact_id = $2 "
                "ORDER BY created_at DESC LIMIT $3",
                tenant_id, contact_id, limit,
            )
        return [dict(r) for r in rows]

    async def add_activity(
        self,
        tenant_id: uuid.UUID,
        contact_id: uuid.UUID,
        *,
        type_: str,
        content: str,
        created_by: uuid.UUID | None,
    ) -> dict[str, Any]:
        async with self._pool.acquire() as conn:
            r = await conn.fetchrow(
                "INSERT INTO crm_activity (tenant_id, contact_id, type, content, created_by) "
                "VALUES ($1, $2, $3, $4, $5) RETURNING *",
                tenant_id, contact_id, type_, content, created_by,
            )
        return dict(r)


async def get_contact_repo(pool: asyncpg.Pool = Depends(get_pool)) -> ContactRepo:  # noqa: B008
    return AsyncpgContactRepo(pool)


# --------------------------------------------------------------------------
# Wire schemas (camelCase, matching apps/mobile/src/api/contacts.ts)
# --------------------------------------------------------------------------


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ContactIn(_Camel):
    first_name: str = Field(default="", max_length=200)
    last_name: str = Field(default="", max_length=200)
    job_title: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    phones: list[str] = Field(default_factory=list, max_length=3)
    emails: list[str] = Field(default_factory=list, max_length=3)
    website: str | None = Field(default=None, max_length=500)
    address: str | None = Field(default=None, max_length=500)
    linkedin: str | None = Field(default=None, max_length=500)
    facebook: str | None = Field(default=None, max_length=500)
    card_image_uri: str | None = Field(default=None, max_length=1000)
    industry: str | None = Field(default=None, max_length=200)
    source: str | None = Field(default=None, max_length=100)
    tags: list[str] = Field(default_factory=list, max_length=20)
    interests: list[str] = Field(default_factory=list, max_length=20)
    status: Literal["Lead", "Active", "Inactive"] = "Lead"
    marketing_consent: WireConsent = "NotAsked"
    decision_maker: Literal["Yes", "No", "Unknown"] = "Unknown"
    lead_temperature: Literal["Hot", "Warm", "Cold"] | None = None
    notes: str = Field(default="", max_length=10_000)
    pain_point: str | None = Field(default=None, max_length=2_000)
    follow_up_date: datetime | None = None
    source_method: Literal["Card Scan", "Manual Entry", "CSV Import", "Phone Import"] = (
        "Manual Entry"
    )


class ContactPatch(_Camel):
    """PATCH whitelist — every field optional; omitted fields untouched."""

    first_name: str | None = Field(default=None, max_length=200)
    last_name: str | None = Field(default=None, max_length=200)
    job_title: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    phones: list[str] | None = Field(default=None, max_length=3)
    emails: list[str] | None = Field(default=None, max_length=3)
    website: str | None = Field(default=None, max_length=500)
    address: str | None = Field(default=None, max_length=500)
    linkedin: str | None = Field(default=None, max_length=500)
    facebook: str | None = Field(default=None, max_length=500)
    card_image_uri: str | None = Field(default=None, max_length=1000)
    industry: str | None = Field(default=None, max_length=200)
    source: str | None = Field(default=None, max_length=100)
    tags: list[str] | None = Field(default=None, max_length=20)
    interests: list[str] | None = Field(default=None, max_length=20)
    status: Literal["Lead", "Active", "Inactive"] | None = None
    marketing_consent: WireConsent | None = None
    decision_maker: Literal["Yes", "No", "Unknown"] | None = None
    lead_temperature: Literal["Hot", "Warm", "Cold"] | None = None
    notes: str | None = Field(default=None, max_length=10_000)
    pain_point: str | None = Field(default=None, max_length=2_000)
    follow_up_date: datetime | None = None
    favorite: bool | None = None
    revision: int | None = None  # optional optimistic-lock guard; 409 on mismatch


# Columns that are genuinely NULLable in crm_contacts — the only PATCH fields
# an explicit JSON null may clear.
_NULLABLE_PATCH_FIELDS = frozenset({
    "job_title", "company", "website", "address", "linkedin", "facebook",
    "card_image_uri", "industry", "source", "lead_temperature", "pain_point",
    "follow_up_date",
})


class ActivityIn(_Camel):
    type: Literal["note", "call", "email", "meeting"]
    content: str = Field(min_length=1, max_length=10_000)


class ActivityOut(_Camel):
    id: uuid.UUID
    type: str
    content: str
    created_at: datetime


class ContactListItemOut(_Camel):
    id: uuid.UUID
    first_name: str
    last_name: str
    company: str = ""
    email: str | None = None
    phone: str | None = None
    lead_temperature: str | None = None
    source: str | None = None
    favorite: bool = False
    completeness_score: int
    date_added: datetime


class ContactListOut(_Camel):
    items: list[ContactListItemOut]
    total: int
    page: int
    page_size: int
    facets: dict[str, dict[str, int]]


class ContactDetailOut(ContactListItemOut):
    job_title: str = ""
    emails: list[str]
    phones: list[str]
    website: str = ""
    address: str = ""
    linkedin: str = ""
    facebook: str = ""
    card_image_uri: str | None = None
    industry: str = ""
    tags: list[str]
    interests: list[str]
    status: str
    marketing_consent: WireConsent
    decision_maker: str
    pain_point: str = ""
    notes: str = ""
    follow_up_date: datetime | None = None
    source_method: str
    revision: int
    activities: list[ActivityOut]
    last_activity_date: datetime | None = None


class ContactCreateOut(ContactDetailOut):
    duplicates: list[ContactListItemOut]


class FavoriteOut(_Camel):
    id: uuid.UUID
    favorite: bool
    # Toggling bumps the optimistic-lock revision; clients holding the row
    # must merge this or their next PATCH would 409 spuriously.
    revision: int


# --------------------------------------------------------------------------
# Row → wire mapping
# --------------------------------------------------------------------------


def _score(row: dict[str, Any]) -> int:
    return compute_completeness_score(
        Contact(
            id=str(row["id"]),
            tenant_id=str(row["tenant_id"]),
            first_name=row["first_name"],
            last_name=row["last_name"],
            job_title=row["job_title"],
            company=row["company"],
            phones=tuple(row["phones"]),
            emails=tuple(row["emails"]),
            industry=row["industry"],
            source=row["source"],
            marketing_consent=row["marketing_consent"],
            notes=row["notes"],
            pain_point=row["pain_point"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
    )


def _list_item(row: dict[str, Any]) -> ContactListItemOut:
    return ContactListItemOut(
        id=row["id"],
        first_name=row["first_name"],
        last_name=row["last_name"],
        company=row["company"] or "",
        email=(row["emails"] or [None])[0],
        phone=(row["phones"] or [None])[0],
        lead_temperature=row["lead_temperature"],
        source=row["source"],
        favorite=row["favorite"],
        completeness_score=_score(row),
        date_added=row["created_at"],
    )


def _detail(row: dict[str, Any], activities: list[dict[str, Any]]) -> dict[str, Any]:
    item = _list_item(row).model_dump(by_alias=False)
    acts = [
        ActivityOut(
            id=a["id"], type=a["type"], content=a["content"], created_at=a["created_at"]
        )
        for a in activities
    ]
    return {
        **item,
        "job_title": row["job_title"] or "",
        "emails": list(row["emails"]),
        "phones": list(row["phones"]),
        "website": row["website"] or "",
        "address": row["address"] or "",
        "linkedin": row["linkedin"] or "",
        "facebook": row["facebook"] or "",
        "card_image_uri": row["card_image_url"],
        "industry": row["industry"] or "",
        "tags": list(row["tags"]),
        "interests": list(row["interests"]),
        "status": row["status"],
        "marketing_consent": _CONSENT_TO_WIRE.get(row["marketing_consent"], "NotAsked"),
        "decision_maker": row["decision_maker"],
        "pain_point": row["pain_point"] or "",
        "notes": row["notes"],
        "follow_up_date": row["follow_up_at"],
        "source_method": row["source_method"],
        "revision": row["revision"],
        "activities": acts,
        "last_activity_date": activities[0]["created_at"] if activities else None,
    }


def _body_to_row(body: ContactIn) -> dict[str, Any]:
    data = body.model_dump(by_alias=False)
    data["marketing_consent"] = _CONSENT_TO_DB[body.marketing_consent]
    data["card_image_url"] = data.pop("card_image_uri")
    data["follow_up_at"] = data.pop("follow_up_date")
    return data


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------


def _tenant(_user: User) -> uuid.UUID:
    # Single synthesized workspace for now (see auth.py tenancy note).
    return DEFAULT_TENANT_ID


@router.post("/contacts", response_model=ContactCreateOut, status_code=status.HTTP_201_CREATED)
async def create_contact(
    body: ContactIn,
    user: User = Depends(get_current_user),  # noqa: B008
    repo: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> ContactCreateOut:
    if not body.first_name.strip() and not body.last_name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="firstName or lastName is required",
        )
    tenant_id = _tenant(user)
    candidate_rows = await repo.candidates(
        tenant_id,
        emails=body.emails,
        phones=body.phones,
        first_name=body.first_name,
        last_name=body.last_name,
    )
    # Same matching semantics as the library: candidates surface, never block.
    dupes = find_potential_duplicates(
        tuple(_row_to_lib_contact(r) for r in candidate_rows),
        first_name=body.first_name,
        last_name=body.last_name,
        emails=tuple(body.emails),
        phones=tuple(body.phones),
    )
    dupe_ids = {d.id for d in dupes}

    row = _body_to_row(body)
    row["added_by"] = user.id
    created = await repo.create(row)
    detail = _detail(created, [])
    return ContactCreateOut(
        **detail,
        duplicates=[_list_item(r) for r in candidate_rows if str(r["id"]) in dupe_ids],
    )


def _row_to_lib_contact(row: dict[str, Any]) -> Contact:
    return Contact(
        id=str(row["id"]),
        tenant_id=str(row["tenant_id"]),
        first_name=row["first_name"],
        last_name=row["last_name"],
        phones=tuple(row["phones"]),
        emails=tuple(row["emails"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("/contacts", response_model=ContactListOut)
async def list_contacts(
    q: str | None = None,
    tag: str | None = None,
    status_: str | None = Query(default=None, alias="status"),
    source: str | None = None,
    lead_temperature: str | None = None,
    favorite: bool | None = None,
    sort: SortKey = "recent",
    page: int = 1,
    page_size: int = 25,
    user: User = Depends(get_current_user),  # noqa: B008
    repo: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> ContactListOut:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    rows, total, facets = await repo.search(
        _tenant(user),
        q=q,
        tag=tag,
        status=status_,
        source=source,
        lead_temperature=lead_temperature,
        favorite=favorite,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return ContactListOut(
        items=[_list_item(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        facets=facets,
    )


@router.get("/contacts/{contact_id}", response_model=ContactDetailOut)
async def get_contact(
    contact_id: uuid.UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    repo: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> ContactDetailOut:
    tenant_id = _tenant(user)
    row = await repo.get(tenant_id, contact_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="contact not found")
    activities = await repo.list_activities(tenant_id, contact_id, limit=50)
    return ContactDetailOut(**_detail(row, activities))


@router.patch("/contacts/{contact_id}", response_model=ContactDetailOut)
async def patch_contact(
    contact_id: uuid.UUID,
    body: ContactPatch,
    user: User = Depends(get_current_user),  # noqa: B008
    repo: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> ContactDetailOut:
    tenant_id = _tenant(user)
    updates = body.model_dump(by_alias=False, exclude_unset=True)
    expected_revision = updates.pop("revision", None)
    # ContactPatch fields are Optional so they can be omitted, but an explicit
    # JSON null is only meaningful for genuinely nullable columns — anywhere
    # else it would hit a NOT NULL constraint and 500.
    for key, value in list(updates.items()):
        if value is None and key not in _NULLABLE_PATCH_FIELDS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{key} cannot be null",
            )
    if "marketing_consent" in updates and updates["marketing_consent"] is not None:
        updates["marketing_consent"] = _CONSENT_TO_DB[updates["marketing_consent"]]
    if "card_image_uri" in updates:
        updates["card_image_url"] = updates.pop("card_image_uri")
    if "follow_up_date" in updates:
        updates["follow_up_at"] = updates.pop("follow_up_date")

    if "first_name" in updates or "last_name" in updates:
        current = await repo.get(tenant_id, contact_id)
        if current is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="contact not found")
        new_first = updates.get("first_name", current["first_name"]) or ""
        new_last = updates.get("last_name", current["last_name"]) or ""
        if not new_first.strip() and not new_last.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="firstName or lastName is required",
            )

    if not updates:
        row = await repo.get(tenant_id, contact_id)
    else:
        try:
            row = await repo.update(tenant_id, contact_id, updates, expected_revision)
        except ContactConflictError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="contact was modified by someone else; reload and retry",
            ) from exc
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="contact not found")
    activities = await repo.list_activities(tenant_id, contact_id, limit=50)
    return ContactDetailOut(**_detail(row, activities))


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: uuid.UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    repo: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> None:
    if not await repo.delete(_tenant(user), contact_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="contact not found")


@router.post("/contacts/{contact_id}/favorite", response_model=FavoriteOut)
async def toggle_favorite(
    contact_id: uuid.UUID,
    user: User = Depends(get_current_user),  # noqa: B008
    repo: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> FavoriteOut:
    tenant_id = _tenant(user)
    updated = await repo.toggle_favorite(tenant_id, contact_id)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="contact not found")
    return FavoriteOut(
        id=updated["id"], favorite=updated["favorite"], revision=updated["revision"]
    )


@router.get("/contacts/{contact_id}/activity", response_model=list[ActivityOut])
async def list_activity(
    contact_id: uuid.UUID,
    limit: int = 50,
    user: User = Depends(get_current_user),  # noqa: B008
    repo: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> list[ActivityOut]:
    tenant_id = _tenant(user)
    if await repo.get(tenant_id, contact_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="contact not found")
    rows = await repo.list_activities(tenant_id, contact_id, limit=min(limit, 200))
    return [
        ActivityOut(id=a["id"], type=a["type"], content=a["content"], created_at=a["created_at"])
        for a in rows
    ]


@router.post(
    "/contacts/{contact_id}/activity",
    response_model=ActivityOut,
    status_code=status.HTTP_201_CREATED,
)
async def log_activity(
    contact_id: uuid.UUID,
    body: ActivityIn,
    user: User = Depends(get_current_user),  # noqa: B008
    repo: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> ActivityOut:
    tenant_id = _tenant(user)
    if await repo.get(tenant_id, contact_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="contact not found")
    a = await repo.add_activity(
        tenant_id, contact_id, type_=body.type, content=body.content, created_by=user.id
    )
    return ActivityOut(id=a["id"], type=a["type"], content=a["content"], created_at=a["created_at"])
