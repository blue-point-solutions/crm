"""CRM-specific auth adapter (ticket #7).

Wires platform-core auth (register/login/JWT) into the wire contract the
mobile app already expects: {email, password[, name]} instead of
platform-core's own {username, password}. All actual identity/password/JWT
logic is delegated to platform_core.auth.service.AuthService and
platform_core.users.service.UserService — nothing is reimplemented here.

Tenancy note: platform-tenancy ships only an in-memory TenantStore (no
Postgres-backed persistence, no user-tenant-role membership model). Building
real multi-tenant persistence is out of scope for this pass — the MVP happy
path is single-workspace per account, so /me returns one synthesized default
tenant. Revisit when/if multi-tenant workspaces become real product scope.
"""

from __future__ import annotations

import uuid

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from platform_core.auth.deps import get_auth_service, get_current_user
from platform_core.auth.service import AuthService
from platform_core.db import get_pool
from platform_core.users.exceptions import EmailAlreadyExistsError, UsernameAlreadyExistsError
from platform_core.users.models import User
from platform_core.users.schemas import UserCreate
from platform_core.users.service import UserService
from pydantic import BaseModel, EmailStr
from pydantic import ValidationError as PydanticValidationError

router = APIRouter(tags=["crm-auth"])

# Single synthesized workspace until real multi-tenant persistence exists.
DEFAULT_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEFAULT_TENANT_NAME = "My Workspace"


class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"  # OAuth2 token-type identifier, not a credential


async def ensure_profile_table(pool: asyncpg.Pool) -> None:
    """App-owned table for the display name platform-core's User has no field for."""
    async with pool.acquire() as conn:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS crm_profiles ("
            "  user_id UUID PRIMARY KEY, "
            "  display_name TEXT NOT NULL"
            ")"
        )


async def _set_display_name(pool: asyncpg.Pool, user_id: uuid.UUID, name: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO crm_profiles (user_id, display_name) VALUES ($1, $2) "
            "ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name",
            user_id,
            name,
        )


async def _get_display_name(pool: asyncpg.Pool, user_id: uuid.UUID, fallback: str) -> str:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT display_name FROM crm_profiles WHERE user_id = $1", user_id
        )
    return row["display_name"] if row else fallback


@router.post("/auth/register", response_model=TokenPairOut)
async def register(
    body: RegisterBody,
    pool: asyncpg.Pool = Depends(get_pool),  # noqa: B008
    svc: AuthService = Depends(get_auth_service),  # noqa: B008
) -> TokenPairOut:
    user_svc = UserService(pool)
    username_base = body.email.split("@")[0][:80] or "user"
    username = username_base
    suffix = 0
    user = None
    # username must be unique; email is what actually identifies the account
    # to the user, so on collision we just try suffixed variants.
    while user is None:
        try:
            create_payload = UserCreate(
                username=username,
                email=body.email,
                password=body.password,
                is_admin=False,
            )
        except PydanticValidationError as exc:
            # UserCreate enforces platform-core's password policy (>=12 chars,
            # digit/special char required). Surface it as a clean 400 instead
            # of an unhandled 500 -- this raises outside FastAPI's own
            # request-body validation, so it isn't caught automatically.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=exc.errors()[0]["msg"] if exc.errors() else "invalid registration data",
            ) from exc
        try:
            user = await user_svc.create(create_payload)
        except UsernameAlreadyExistsError:
            suffix += 1
            username = f"{username_base}{suffix}"
        except EmailAlreadyExistsError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="an account with this email already exists",
            ) from exc

    await _set_display_name(pool, user.id, body.name)
    tokens = await svc.issue_tokens(user.id)
    return TokenPairOut(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
    )


@router.post("/auth/login", response_model=TokenPairOut)
async def login(
    body: LoginBody,
    svc: AuthService = Depends(get_auth_service),  # noqa: B008
) -> TokenPairOut:
    user = await svc.authenticate(body.email, body.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
    tokens = await svc.issue_tokens(user.id)
    return TokenPairOut(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
    )


@router.get("/me")
async def me(
    user: User = Depends(get_current_user),  # noqa: B008
    pool: asyncpg.Pool = Depends(get_pool),  # noqa: B008
) -> dict[str, object]:
    name = await _get_display_name(pool, user.id, user.username)
    role = "Admin" if user.is_admin else "Member"
    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": name,
            "tenant_id": str(DEFAULT_TENANT_ID),
            "role": role,
        },
        "tenant": {"id": str(DEFAULT_TENANT_ID), "name": DEFAULT_TENANT_NAME},
        "role": role,
    }
