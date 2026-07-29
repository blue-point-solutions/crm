# src/crm_api/cards.py
"""Card-image storage endpoints — presigned direct-to-R2 upload.

The scanner keeps OCR fully on-device (July-9 privacy decision); the only
thing that leaves the phone is the card photo the user chose to save.
Flow: POST /cards/upload-url → client PUTs the JPEG straight to R2 with the
required headers → client sends the returned publicUrl as cardImageUri on
POST /contacts. 503 when R2 isn't configured, so the app degrades to
local-only images.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from platform_core.auth.deps import get_current_user
from platform_core.users.models import User
from platform_storage.keys import derive_object_key
from platform_storage_r2 import R2StorageAdapter
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from crm_api.auth import DEFAULT_TENANT_ID

router = APIRouter(tags=["cards"])

_UPLOAD_TTL = timedelta(minutes=10)
_NAMESPACE = "cards"
_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class UploadUrlBody(_Camel):
    content_type: Literal["image/jpeg", "image/png", "image/webp"] = "image/jpeg"


class UploadUrlOut(_Camel):
    upload_url: str
    required_headers: dict[str, str]
    image_key: str
    public_url: str
    expires_at: datetime


def get_storage(request: Request) -> R2StorageAdapter:
    storage = getattr(request.app.state, "card_storage", None)
    if storage is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="card image storage is not configured",
        )
    return storage


@router.post("/cards/upload-url", response_model=UploadUrlOut)
async def create_upload_url(
    request: Request,
    body: UploadUrlBody,
    _user: User = Depends(get_current_user),  # noqa: B008
    storage: R2StorageAdapter = Depends(get_storage),  # noqa: B008
) -> UploadUrlOut:
    logical_key = f"{uuid.uuid4().hex}.{_EXTENSIONS[body.content_type]}"
    expires_at = datetime.now(UTC) + _UPLOAD_TTL
    presigned = await storage.presign_put(
        tenant_id=str(DEFAULT_TENANT_ID),
        namespace=_NAMESPACE,
        logical_key=logical_key,
        content_type=body.content_type,
        expires_at=expires_at,
    )
    object_key = derive_object_key(
        tenant_id=str(DEFAULT_TENANT_ID), namespace=_NAMESPACE, logical_key=logical_key
    )
    public_base = request.app.state.settings.r2_public_url.rstrip("/")
    return UploadUrlOut(
        upload_url=presigned.url,
        required_headers=presigned.required_headers,
        image_key=object_key,
        public_url=f"{public_base}/{object_key}",
        expires_at=presigned.expires_at,
    )
