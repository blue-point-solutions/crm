# src/crm_api/sms.py
"""Outbound SMS endpoint over the configured platform-sms gateway (Semaphore).

Authenticated: any logged-in user may send (single-tenant internal fleet).
Returns 503 when no SMS provider is configured so callers can degrade.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from platform_core.auth.deps import get_current_user
from platform_sms.errors import SmsError
from platform_sms.models import SmsMessage
from platform_sms.ports import SmsGateway
from pydantic import BaseModel, Field

router = APIRouter()


class SmsSendBody(BaseModel):
    to: str = Field(min_length=7, max_length=20, description="E.164 or 09… PH mobile")
    message: str = Field(min_length=1, max_length=1000)


class SmsSendResponse(BaseModel):
    ok: bool = True
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


@router.post("/sms", response_model=SmsSendResponse)
async def sms_send(
    request: Request,
    body: SmsSendBody,
    _user: object = Depends(get_current_user),
    gateway: SmsGateway = Depends(get_sms_gateway),  # noqa: B008
) -> SmsSendResponse:
    settings = request.app.state.settings
    try:
        result = await gateway.send(
            SmsMessage(
                recipient=body.to,
                content=body.message,
                sender=settings.semaphore_sender_name or None,
            )
        )
    except SmsError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"SMS provider rejected the message: {exc}",
        ) from exc
    return SmsSendResponse(provider_message_id=result.provider_message_id)
