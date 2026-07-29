# src/crm_api/notify.py
"""Adapts platform-core's EmailSender port onto a platform-email EmailGateway.

platform-core's auth flows (password reset, email verification) depend on the
narrow ``EmailSender`` port; production wires it to Resend by registering an
instance of this adapter (see main.py lifespan). Dev/test keep the default
log-only sender.
"""

from __future__ import annotations

from platform_email.models import EmailAddress, EmailMessage
from platform_email.ports import EmailGateway


class ResendEmailSender:
    """EmailSender-port adapter over any platform-email gateway."""

    def __init__(self, gateway: EmailGateway, *, from_addr: str) -> None:
        self._gateway = gateway
        self._from = EmailAddress.parse(from_addr)

    async def send(self, to: str, subject: str, body_html: str, body_text: str) -> None:
        await self._gateway.send(
            EmailMessage.model_validate(
                {
                    "to": [EmailAddress.parse(to)],
                    "from": self._from,
                    "subject": subject,
                    "html": body_html,
                    "text": body_text,
                }
            )
        )
