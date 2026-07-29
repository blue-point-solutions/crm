# src/crm_api/deals.py
"""Deals / sales pipeline API (crm #37, increment 1).

Stage graph and transition legality come from platform-tracking's
``sales_pipeline()`` template (Lead → Qualified → Proposal → Negotiation →
Won, mark-lost from any stage): the pure ``apply_transition`` engine + the
package's asyncpg ``jobs`` store do the heavy lifting; this module is HTTP
glue plus two CRM-specific behaviors:

- a deal belongs to a contact (``customer_id`` = contact id, existence
  checked against crm_contacts), with ``{title, value}`` in job metadata;
- every stage change is also logged to the contact's activity timeline
  (type ``stage``), so engagement recency ("needs attention") stays truthful.

Placement note: the turnover marks #37 "blocked on erp access" — that is a
repo-location question, not a technical one; built here against the live
apps/api reality and flagged on the PR.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from platform_core.auth.deps import get_current_user
from platform_core.db import get_pool
from platform_core.users.models import User
from platform_tracking import (
    Actor,
    Caller,
    ConcurrencyError,
    Job,
    JobNotFoundError,
    JobNotOpenError,
    TrackingError,
    apply_transition,
    sales_pipeline,
)
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from crm_api.auth import DEFAULT_TENANT_ID
from crm_api.contacts import ContactRepo, get_contact_repo

router = APIRouter(tags=["deals"])

SALES = sales_pipeline()
_ADVANCE_CAP = "tracking:advance"
_STAGE_LABELS = {s.key: s.label for s in SALES.states}
_OPEN_STAGES = tuple(s.key for s in SALES.states if not s.is_terminal)


def _caller(user: User) -> Caller:
    return Caller(
        actor=Actor(actor_type="provider", id_hash=str(user.id)),
        capabilities=frozenset({_ADVANCE_CAP}),
    )


def _allowed(job: Job) -> list[dict[str, str]]:
    """Legal next transitions from the job's current state (deduped by target)."""
    if job.status != "open":
        return []
    return [
        {"key": t.key, "toStage": t.to_state, "label": t.label}
        for t in SALES.transitions
        if t.from_state == job.current_state
    ]


# --------------------------------------------------------------------------
# Store port (platform-tracking's AsyncpgTrackingStore in prod, fake in tests)
# --------------------------------------------------------------------------


async def get_tracking_store(pool: asyncpg.Pool = Depends(get_pool)) -> Any:  # noqa: B008
    from platform_tracking.asyncpg_store import AsyncpgTrackingStore

    return AsyncpgTrackingStore(pool)


async def ensure_deals_schema(pool: asyncpg.Pool) -> None:
    from platform_tracking.asyncpg_store import ensure_jobs_schema

    async with pool.acquire() as conn:
        await ensure_jobs_schema(conn)


# --------------------------------------------------------------------------
# Wire schemas
# --------------------------------------------------------------------------


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class DealIn(_Camel):
    contact_id: uuid.UUID
    title: str = Field(default="", max_length=200)
    value: float = Field(default=0, ge=0, le=1_000_000_000)


class DealAdvanceIn(_Camel):
    to_stage: str = Field(min_length=1, max_length=40)
    note: str | None = Field(default=None, max_length=2_000)


class TransitionOut(_Camel):
    key: str
    to_stage: str
    label: str


class DealOut(_Camel):
    id: str
    contact_id: str
    contact_name: str = ""
    title: str = ""
    value: float = 0
    stage: str
    stage_label: str
    status: str
    created_at: datetime
    updated_at: datetime
    allowed_transitions: list[TransitionOut]


class DealListOut(_Camel):
    items: list[DealOut]
    total: int


class PipelineStageOut(_Camel):
    key: str
    label: str
    count: int
    value: float


class PipelineOut(_Camel):
    stages: list[PipelineStageOut]
    total_open_count: int
    total_open_value: float
    won_count: int
    lost_count: int


def _deal_out(job: Job, contact_name: str = "") -> DealOut:
    meta = dict(job.metadata)
    return DealOut(
        id=job.id,
        contact_id=job.customer_id,
        contact_name=contact_name,
        title=str(meta.get("title", "")),
        value=float(meta.get("value", 0) or 0),
        stage=job.current_state,
        stage_label=_STAGE_LABELS.get(job.current_state, job.current_state),
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        allowed_transitions=[TransitionOut(**t) for t in _allowed(job)],
    )


async def _contact_names(
    repo: ContactRepo, tenant_id: uuid.UUID, contact_ids: set[str]
) -> dict[str, str]:
    names: dict[str, str] = {}
    for cid in contact_ids:
        try:
            row = await repo.get(tenant_id, uuid.UUID(cid))
        except ValueError:
            row = None
        if row:
            names[cid] = f"{row['first_name']} {row['last_name']}".strip()
    return names


async def _log_stage_activity(
    repo: ContactRepo,
    tenant_id: uuid.UUID,
    job: Job,
    content: str,
    user_id: uuid.UUID,
) -> None:
    """Deal lifecycle shows up on the contact timeline; failures never break
    the deal write itself (the job row is the source of truth)."""
    try:
        await repo.add_activity(
            tenant_id, uuid.UUID(job.customer_id),
            type_="stage", content=content, created_by=user_id,
        )
    except Exception:
        logging.getLogger(__name__).warning(
            "stage-activity log failed for deal %s", job.id, exc_info=True
        )


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------


@router.post("/deals", response_model=DealOut, status_code=status.HTTP_201_CREATED)
async def create_deal(
    body: DealIn,
    user: User = Depends(get_current_user),  # noqa: B008
    store: Any = Depends(get_tracking_store),  # noqa: B008
    contacts: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> DealOut:
    tenant_id = DEFAULT_TENANT_ID
    contact = await contacts.get(tenant_id, body.contact_id)
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="contact not found")
    contact_name = f"{contact['first_name']} {contact['last_name']}".strip()

    now = datetime.now(UTC)
    job = Job(
        id=str(uuid.uuid4()),
        tenant_id=str(tenant_id),
        customer_id=str(body.contact_id),
        pipeline_id=SALES.id,
        pipeline_version=SALES.version,
        current_state=SALES.initial_state,
        metadata={"title": body.title, "value": body.value},
        created_at=now,
        updated_at=now,
    )
    await store.create_job(job)
    await _log_stage_activity(
        contacts, tenant_id, job,
        f"Deal started: {body.title or contact_name} (₱{body.value:,.0f})", user.id,
    )
    return _deal_out(job, contact_name)


@router.get("/deals", response_model=DealListOut)
async def list_deals(
    stage: str | None = None,
    status_: str | None = Query(default=None, alias="status", pattern="^(open|completed)$"),
    contact_id: uuid.UUID | None = Query(default=None, alias="contactId"),  # noqa: B008
    user: User = Depends(get_current_user),  # noqa: B008
    store: Any = Depends(get_tracking_store),  # noqa: B008
    contacts: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> DealListOut:
    tenant_id = DEFAULT_TENANT_ID
    if contact_id is not None:
        jobs = await store.list_jobs_for_customer(
            str(tenant_id), str(contact_id), status=status_
        )
    elif status_ in (None, "open"):
        jobs = await store.list_open_jobs(str(tenant_id))
    else:
        # Closed deals across all contacts: no store-level listing yet — the
        # board's won/lost rollup covers the aggregate; per-contact history
        # is available via contactId. Keep the surface honest.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status=completed requires contactId",
        )
    if stage:
        jobs = tuple(j for j in jobs if j.current_state == stage)
    names = await _contact_names(contacts, tenant_id, {j.customer_id for j in jobs})
    items = [_deal_out(j, names.get(j.customer_id, "")) for j in jobs]
    items.sort(key=lambda d: d.updated_at, reverse=True)
    return DealListOut(items=items, total=len(items))


@router.post("/deals/{deal_id}/advance", response_model=DealOut)
async def advance_deal(
    deal_id: uuid.UUID,
    body: DealAdvanceIn,
    user: User = Depends(get_current_user),  # noqa: B008
    store: Any = Depends(get_tracking_store),  # noqa: B008
    contacts: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> DealOut:
    tenant_id = DEFAULT_TENANT_ID
    try:
        job = await store.get_job(str(tenant_id), str(deal_id))
    except JobNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="deal not found"
        ) from exc

    # The wire contract is {toStage}; resolve it to the (unique) legal
    # transition from the current state, 409 with the legal set otherwise.
    match = next(
        (
            t for t in SALES.transitions
            if t.from_state == job.current_state and t.to_state == body.to_stage
        ),
        None,
    )
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"cannot move from {job.current_state} to {body.to_stage}",
                "allowedTransitions": _allowed(job),
            },
        )

    try:
        updated = apply_transition(
            SALES, job, match.key, _caller(user), note=body.note, now=datetime.now(UTC)
        )
        await store.save_job(updated)
    except JobNotOpenError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="deal is already closed"
        ) from exc
    except ConcurrencyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="deal was modified concurrently; reload and retry",
        ) from exc
    except TrackingError as exc:
        # Fails closed: anything else the engine refuses is a client error.
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    names = await _contact_names(contacts, tenant_id, {updated.customer_id})
    contact_name = names.get(updated.customer_id, "")
    await _log_stage_activity(
        contacts, tenant_id, updated,
        f"{_STAGE_LABELS[job.current_state]} → {_STAGE_LABELS[updated.current_state]}"
        + (f" — {body.note}" if body.note else ""),
        user.id,
    )
    return _deal_out(updated, contact_name)


@router.get("/pipeline", response_model=PipelineOut)
async def pipeline_board(
    _user: User = Depends(get_current_user),  # noqa: B008
    store: Any = Depends(get_tracking_store),  # noqa: B008
) -> PipelineOut:
    tenant_id = str(DEFAULT_TENANT_ID)
    open_jobs = await store.list_open_jobs(tenant_id)
    by_stage: dict[str, list[Job]] = {k: [] for k in _OPEN_STAGES}
    for j in open_jobs:
        by_stage.setdefault(j.current_state, []).append(j)

    def _value(j: Job) -> float:
        return float(dict(j.metadata).get("value", 0) or 0)

    stages = [
        PipelineStageOut(
            key=k,
            label=_STAGE_LABELS[k],
            count=len(by_stage.get(k, [])),
            value=sum(_value(j) for j in by_stage.get(k, [])),
        )
        for k in _OPEN_STAGES
    ]
    won_count, lost_count = await _closed_counts(store, tenant_id)
    return PipelineOut(
        stages=stages,
        total_open_count=len(open_jobs),
        total_open_value=sum(_value(j) for j in open_jobs),
        won_count=won_count,
        lost_count=lost_count,
    )


async def _closed_counts(store: Any, tenant_id: str) -> tuple[int, int]:
    """Won/lost rollup. The tracking-store port has no closed-jobs listing;
    the asyncpg adapter's table is queried directly (same database, same
    deploy unit), and test fakes provide closed_counts()."""
    if hasattr(store, "closed_counts"):
        result = await store.closed_counts(tenant_id)
        return int(result[0]), int(result[1])
    pool: asyncpg.Pool = store._pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT data->>'current_state' AS state, count(*) AS n FROM jobs "
            "WHERE tenant_id = $1 AND status != 'open' GROUP BY 1",
            tenant_id,
        )
    counts = {r["state"]: int(r["n"]) for r in rows}
    return counts.get("won", 0), counts.get("lost", 0)
