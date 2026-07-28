# tests/test_sms.py
"""POST /sms — authenticated outbound SMS through the configured gateway
(Semaphore in prod; a stub here)."""

from fastapi.testclient import TestClient
from platform_core.auth.deps import get_current_user
from platform_sms.models import SendResult, SmsMessage

from crm_api.main import create_app
from crm_api.settings import Settings
from crm_api.sms import get_sms_gateway


class StubGateway:
    def __init__(self) -> None:
        self.sent: list[SmsMessage] = []

    async def send(self, msg: SmsMessage) -> SendResult:
        self.sent.append(msg)
        return SendResult(provider_message_id="msg-1", status="queued", segments=1)


def _app_with(gateway: StubGateway | None):
    app = create_app(Settings(database_url=None, semaphore_sender_name="BPCONNECT"))
    app.dependency_overrides[get_current_user] = lambda: object()  # authed
    if gateway is not None:
        app.dependency_overrides[get_sms_gateway] = lambda: gateway
    return app


def test_sms_send_ok() -> None:
    gateway = StubGateway()
    with TestClient(_app_with(gateway)) as client:
        resp = client.post("/sms", json={"to": "+639171234567", "message": "hello"})
    assert resp.status_code == 200
    assert resp.json()["provider_message_id"] == "msg-1"
    assert gateway.sent[0].recipient == "+639171234567"
    assert gateway.sent[0].content == "hello"
    assert gateway.sent[0].sender == "BPCONNECT"


def test_sms_requires_auth() -> None:
    gateway = StubGateway()
    app = create_app(Settings(database_url=None))
    # get_current_user's *sub*-dependency needs platform env; stub it out — with
    # no bearer header the 401 is raised before the service is ever touched.
    from platform_core.auth.deps import get_auth_service

    app.dependency_overrides[get_auth_service] = lambda: None
    app.dependency_overrides[get_sms_gateway] = lambda: gateway
    with TestClient(app) as client:
        resp = client.post("/sms", json={"to": "+639171234567", "message": "x"})
    assert resp.status_code == 401
    assert gateway.sent == []


def test_sms_503_when_unconfigured() -> None:
    # No SEMAPHORE_API_KEY and no override → the dependency refuses.
    app = create_app(Settings(database_url=None, semaphore_api_key=None))
    app.dependency_overrides[get_current_user] = lambda: object()
    with TestClient(app) as client:
        resp = client.post("/sms", json={"to": "+639171234567", "message": "x"})
    assert resp.status_code == 503
