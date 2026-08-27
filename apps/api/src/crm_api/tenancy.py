"""Per-account workspace isolation.

Replaces the single synthesized workspace (auth.DEFAULT_TENANT_ID) that every
account resolved to, which meant every user read and wrote the same contacts,
deals and cards. A workspace is now a real row, and membership is an explicit
user->workspace->role edge.

Deliberately NOT `tenant_id = user.id`: a workspace has to outlive any one
member for the solo->team upgrade to be a no-op. A solo subscriber is simply a
workspace with one member; upgrading inserts membership rows and moves no
business data. Mapping the workspace onto the user would force a rewrite of
tenant_id across contacts/deals/cards/activity the day a team is added.

Two checks on every request, not one:
  1. which workspace is this user acting in
  2. do they actually hold an active membership in it
Skipping (2) would let a caller claim any workspace by guessing its UUID.
"""

from __future__ import annotations

import uuid

import asyncpg
from fastapi import Depends, HTTPException, status
from platform_core.auth.deps import get_current_user
from platform_core.db import get_pool
from platform_core.users.models import User

# The workspace every pre-fix row was written under. Kept as the *real* id of
# the founding workspace rather than migrated away, so the existing contacts
# need no rewrite -- see bootstrap_legacy_workspace().
LEGACY_WORKSPACE_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_MEMBER = "member"

STATUS_ACTIVE = "active"
STATUS_INVITED = "invited"


async def ensure_workspace_tables(pool: asyncpg.Pool) -> None:
    """Idempotent schema for workspaces + membership."""
    async with pool.acquire() as conn:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS crm_workspaces ("
            "  id UUID PRIMARY KEY, "
            "  name TEXT NOT NULL, "
            "  plan TEXT NOT NULL DEFAULT 'solo', "
            "  created_at TIMESTAMPTZ NOT NULL DEFAULT now()"
            ")"
        )
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS crm_workspace_members ("
            "  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE, "
            "  user_id UUID NOT NULL, "
            "  role TEXT NOT NULL DEFAULT 'member', "
            "  status TEXT NOT NULL DEFAULT 'active', "
            "  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
            "  PRIMARY KEY (workspace_id, user_id)"
            ")"
        )
        # Membership lookup runs on every authenticated request.
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS crm_workspace_members_user_idx "
            "ON crm_workspace_members (user_id) WHERE status = 'active'"
        )


async def bootstrap_legacy_workspace(pool: asyncpg.Pool, owner_email: str | None) -> None:
    """Adopt the pre-fix shared workspace instead of migrating the rows out of it.

    Every contact/deal/card written before this change carries
    tenant_id = LEGACY_WORKSPACE_ID. Rather than rewrite those rows (the step
    where real customer data gets lost), we register that id as a genuine
    workspace and make the named account its owner. The data never moves.

    Every *other* pre-existing account gets its own empty workspace lazily, on
    its next authenticated request -- see resolve_workspace_id().

    Owner resolution, in order:
      1. owner_email (CRM_LEGACY_WORKSPACE_OWNER), when set and matching a user
      2. the account that created the legacy rows -- the modal added_by among
         crm_contacts under LEGACY_WORKSPACE_ID. The data already knows who
         scanned it, so the operator does not have to remember which email
         they registered with.

    No-op when neither resolves (fresh database: tests, a new deployment) or
    when the legacy workspace already has an owner.
    """
    async with pool.acquire() as conn:
        already = await conn.fetchrow(
            "SELECT 1 FROM crm_workspace_members WHERE workspace_id = $1 AND role = $2",
            LEGACY_WORKSPACE_ID,
            ROLE_OWNER,
        )
        if already is not None:
            return
        owner = None
        if owner_email:
            owner = await conn.fetchrow(
                "SELECT id FROM users WHERE lower(email) = lower($1)", owner_email
            )
        if owner is None:
            owner = await conn.fetchrow(
                "SELECT added_by AS id FROM crm_contacts "
                "WHERE tenant_id = $1 AND added_by IS NOT NULL "
                "GROUP BY added_by ORDER BY count(*) DESC, min(created_at) ASC LIMIT 1",
                LEGACY_WORKSPACE_ID,
            )
        if owner is None or owner["id"] is None:
            return
        await conn.execute(
            "INSERT INTO crm_workspaces (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
            LEGACY_WORKSPACE_ID,
            "My Workspace",
        )
        await conn.execute(
            "INSERT INTO crm_workspace_members (workspace_id, user_id, role, status) "
            "VALUES ($1, $2, $3, $4) ON CONFLICT (workspace_id, user_id) DO NOTHING",
            LEGACY_WORKSPACE_ID,
            owner["id"],
            ROLE_OWNER,
            STATUS_ACTIVE,
        )


async def create_workspace_for_user(
    pool: asyncpg.Pool, user_id: uuid.UUID, display_name: str
) -> uuid.UUID:
    """Create a workspace owned by user_id. Called at registration."""
    workspace_id = uuid.uuid4()
    name = f"{display_name.strip()}'s Workspace" if display_name.strip() else "My Workspace"
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "INSERT INTO crm_workspaces (id, name) VALUES ($1, $2)", workspace_id, name
            )
            await conn.execute(
                "INSERT INTO crm_workspace_members (workspace_id, user_id, role, status) "
                "VALUES ($1, $2, $3, $4)",
                workspace_id,
                user_id,
                ROLE_OWNER,
                STATUS_ACTIVE,
            )
    return workspace_id


async def resolve_workspace_id(pool: asyncpg.Pool, user_id: uuid.UUID) -> uuid.UUID:
    """The workspace this user acts in, creating one if they have none.

    Lazy creation covers accounts that registered before this change shipped --
    they get their own empty workspace on next request rather than continuing
    to read the founding workspace's contacts.

    Owned workspaces sort first so the account's own workspace stays the
    default once it also belongs to someone else's team. When multi-workspace
    switching ships, the active workspace comes from the request instead and
    this becomes the fallback.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT workspace_id FROM crm_workspace_members "
            "WHERE user_id = $1 AND status = $2 "
            "ORDER BY (role = 'owner') DESC, created_at ASC LIMIT 1",
            user_id,
            STATUS_ACTIVE,
        )
    if row is not None:
        return uuid.UUID(str(row["workspace_id"]))
    return await create_workspace_for_user(pool, user_id, "")


async def assert_member(pool: asyncpg.Pool, user_id: uuid.UUID, workspace_id: uuid.UUID) -> None:
    """Authorization check: reject a workspace the caller does not belong to."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT 1 FROM crm_workspace_members "
            "WHERE user_id = $1 AND workspace_id = $2 AND status = $3",
            user_id,
            workspace_id,
            STATUS_ACTIVE,
        )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="not a member of this workspace"
        )


async def get_current_workspace_id(
    user: User = Depends(get_current_user),  # noqa: B008
    pool: asyncpg.Pool = Depends(get_pool),  # noqa: B008
) -> uuid.UUID:
    """FastAPI dependency replacing the old constant-returning _tenant(user)."""
    return await resolve_workspace_id(pool, user.id)
