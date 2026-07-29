# tests/test_notify.py
"""ResendEmailSender adapts platform-core's EmailSender port onto
platform-email's EmailGateway (Resend in prod, mock here)."""

import asyncio

from platform_email.testing import MockEmailGateway

from crm_api.notify import ResendEmailSender


def test_send_maps_port_args_onto_email_message() -> None:
    gateway = MockEmailGateway()
    sender = ResendEmailSender(gateway, from_addr="BP Connect <no-reply@bpconnect.app>")

    asyncio.run(
        sender.send(
            to="user@example.com",
            subject="Reset your password",
            body_html="<p>hi</p>",
            body_text="hi",
        )
    )

    assert len(gateway.sent) == 1
    msg = gateway.sent[0]
    assert [a.email for a in msg.to] == ["user@example.com"]
    assert msg.from_.email == "no-reply@bpconnect.app"
    assert msg.subject == "Reset your password"
    assert msg.html == "<p>hi</p>"
    assert msg.text == "hi"
