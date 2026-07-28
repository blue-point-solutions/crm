# tests/test_sms.py
"""POST /sms — authenticated outbound SMS through the configured gateway
(Semaphore in prod; a stub here) with every attempt recorded to the SMS log."""

import uuid
from typing import Any

from fastapi.testclient import TestClient
from platform_core.auth.deps import get_current_user
from platform_sms.errors import SmsProviderError
from platform_sms.models import DeliveryStatus, SendResult, SmsMessage
from platform_sms.status import SmsStatus

from crm_api.main import create_app
from crm_api.settings import Settings
from crm_api.sms import get_sms_gateway, get_sms_log


class StubGateway:
    def __init__(self, *, fail: bool = False, delivery: SmsStatus = SmsStatus.DELIVERED):
        self.fail = fail
        self.delivery = delivery
        self.sent: list[SmsMessage] = []

    async def send(self, msg: SmsMessage) -> SendResult:
        if self.fail:
            raise SmsProviderError("No active sender name found")
        self.sent.append(msg)
        return SendResult(provider_message_id="msg-1", status=SmsStatus.QUEUED, segments=1)

    async def fetch_status(self, provider_message_id: str) -> DeliveryStatus:
        return DeliveryStatus(provider_message_id=provider_message_id, status=self.delivery)


class FakeSmsLog:
    def __init__(self) -> None:
        self.rows: dict[uuid.UUID, dict[str, Any]] = {}

    async def record(self, **kw: Any) -> uuid.UUID:
        log_id = uuid.uuid4()
        self.rows[log_id] = {"id": log_id, **kw}
        return log_id

    async def list_recent(self, limit: int) -> list[dict[str, Any]]:
        return list(self.rows.values())[:limit]

    async def get(self, log_id: uuid.UUID) -> dict[str, Any] | None:
        return self.rows.get(log_id)

    async def set_status(self, log_id: uuid.UUID, status: str, error: str | None) -> None:
        self.rows[log_id]["status"] = status
        self.rows[log_id]["error"] = error


def _app_with(gateway: StubGateway | None, log: FakeSmsLog | None = None):
    app = create_app(Settings(database_url=None, semaphore_sender_name="BPCONNECT"))
    app.dependency_overrides[get_current_user] = lambda: object()  # authed
    app.dependency_overrides[get_sms_log] = lambda: log or FakeSmsLog()
    if gateway is not None:
        app.dependency_overrides[get_sms_gateway] = lambda: gateway
    return app


def test_sms_send_ok_and_logged() -> None:
    gateway, log = StubGateway(), FakeSmsLog()
    with TestClient(_app_with(gateway, log)) as client:
        resp = client.post("/sms", json={"to": "+639171234567", "message": "hello"})
    assert resp.status_code == 200
    assert resp.json()["provider_message_id"] == "msg-1"
    assert gateway.sent[0].recipient == "+639171234567"
    assert gateway.sent[0].sender == "BPCONNECT"
    (row,) = log.rows.values()
    assert row["status"] == "queued"
    assert row["provider_message_id"] == "msg-1"


def test_sms_provider_rejection_is_400_and_logged() -> None:
    log = FakeSmsLog()
    with TestClient(_app_with(StubGateway(fail=True), log)) as client:
        resp = client.post("/sms", json={"to": "+639171234567", "message": "hello"})
    assert resp.status_code == 400
    assert "No active sender name" in resp.json()["detail"]
    (row,) = log.rows.values()
    assert row["status"] == "rejected"
    assert "No active sender name" in row["error"]


def test_sms_refresh_updates_status() -> None:
    gateway, log = StubGateway(delivery=SmsStatus.DELIVERED), FakeSmsLog()
    app = _app_with(gateway, log)
    with TestClient(app) as client:
        sent = client.post("/sms", json={"to": "+639171234567", "message": "x"}).json()
        resp = client.post(f"/sms/{sent['id']}/refresh")
    assert resp.status_code == 200
    assert resp.json()["status"] == "delivered"
    assert log.rows[uuid.UUID(sent["id"])]["status"] == "delivered"


def test_sms_list() -> None:
    log = FakeSmsLog()
    app = _app_with(StubGateway(), log)
    with TestClient(app) as client:
        client.post("/sms", json={"to": "+639171234567", "message": "x"})
        resp = client.get("/sms")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["status"] == "queued"


def test_sms_requires_auth() -> None:
    gateway = StubGateway()
    app = create_app(Settings(database_url=None))
    # get_current_user's *sub*-dependency needs platform env; stub it out — with
    # no bearer header the 401 is raised before the service is ever touched.
    from platform_core.auth.deps import get_auth_service

    app.dependency_overrides[get_auth_service] = lambda: None
    app.dependency_overrides[get_sms_gateway] = lambda: gateway
    app.dependency_overrides[get_sms_log] = lambda: FakeSmsLog()
    with TestClient(app) as client:
        resp = client.post("/sms", json={"to": "+639171234567", "message": "x"})
    assert resp.status_code == 401
    assert gateway.sent == []


def test_sms_503_when_unconfigured() -> None:
    # No SEMAPHORE_API_KEY and no override → the dependency refuses.
    app = create_app(Settings(database_url=None, semaphore_api_key=None))
    app.dependency_overrides[get_current_user] = lambda: object()
    app.dependency_overrides[get_sms_log] = lambda: FakeSmsLog()
    with TestClient(app) as client:
        resp = client.post("/sms", json={"to": "+639171234567", "message": "x"})
    assert resp.status_code == 503
