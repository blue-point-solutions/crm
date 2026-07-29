# tests/test_deals.py
"""Deals/pipeline routes over fakes: platform-tracking's real pure engine +
sales_pipeline template run for real; only persistence is faked."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi.testclient import TestClient
from platform_core.auth.deps import get_current_user
from platform_tracking import Job, JobNotFoundError
from test_contacts import FakeRepo, FakeUser

from crm_api.contacts import get_contact_repo
from crm_api.deals import get_tracking_store
from crm_api.main import create_app
from crm_api.settings import Settings


class FakeTrackingStore:
    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}

    async def create_job(self, job: Job) -> None:
        self.jobs[job.id] = job

    async def get_job(self, tenant_id: str, job_id: str) -> Job:
        job = self.jobs.get(job_id)
        if job is None or job.tenant_id != tenant_id:
            raise JobNotFoundError(job_id)
        return job

    async def save_job(self, job: Job) -> None:
        self.jobs[job.id] = job

    async def list_open_jobs(self, tenant_id: str) -> tuple[Job, ...]:
        return tuple(
            j for j in self.jobs.values() if j.tenant_id == tenant_id and j.status == "open"
        )

    async def list_jobs_for_customer(
        self, tenant_id: str, customer_id: str, *, status: str | None = None
    ) -> tuple[Job, ...]:
        return tuple(
            j
            for j in self.jobs.values()
            if j.tenant_id == tenant_id
            and j.customer_id == customer_id
            and (status is None or j.status == status)
        )

    async def closed_counts(self, tenant_id: str) -> tuple[int, int]:
        closed = [
            j for j in self.jobs.values() if j.tenant_id == tenant_id and j.status != "open"
        ]
        return (
            sum(1 for j in closed if j.current_state == "won"),
            sum(1 for j in closed if j.current_state == "lost"),
        )


def _client() -> tuple[TestClient, FakeRepo, FakeTrackingStore]:
    from crm_api.dashboard import get_dashboard_repo

    contacts = FakeRepo()
    tracking = FakeTrackingStore()
    app = create_app(Settings(database_url=None))
    app.dependency_overrides[get_current_user] = lambda: FakeUser()
    app.dependency_overrides[get_contact_repo] = lambda: contacts
    app.dependency_overrides[get_dashboard_repo] = lambda: contacts
    app.dependency_overrides[get_tracking_store] = lambda: tracking
    return TestClient(app), contacts, tracking


def _contact(client: TestClient, name: str = "Ada") -> str:
    return client.post("/contacts", json={"firstName": name}).json()["id"]


def _deal(client: TestClient, cid: str, **extra: Any) -> dict[str, Any]:
    resp = client.post("/deals", json={"contactId": cid, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_create_deal_starts_at_lead_with_transitions_and_logs_activity() -> None:
    client, _, _ = _client()
    cid = _contact(client)
    deal = _deal(client, cid, title="Website revamp", value=150000)
    assert deal["stage"] == "lead"
    assert deal["stageLabel"] == "Lead"
    assert deal["contactId"] == cid
    assert deal["value"] == 150000
    targets = {t["toStage"] for t in deal["allowedTransitions"]}
    assert targets == {"qualified", "lost"}
    # Deal start shows on the contact timeline
    acts = client.get(f"/contacts/{cid}/activity").json()
    assert any(a["type"] == "stage" and "Deal started" in a["content"] for a in acts)


def test_create_deal_unknown_contact_404s() -> None:
    client, _, _ = _client()
    resp = client.post("/deals", json={"contactId": str(uuid.uuid4())})
    assert resp.status_code == 404


def test_advance_happy_path_and_activity_glue() -> None:
    client, _, _ = _client()
    cid = _contact(client)
    deal = _deal(client, cid)
    resp = client.post(f"/deals/{deal['id']}/advance", json={"toStage": "qualified"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["stage"] == "qualified"
    assert {t["toStage"] for t in body["allowedTransitions"]} == {"proposal", "lost"}
    acts = client.get(f"/contacts/{cid}/activity").json()
    assert any("Lead → Qualified" in a["content"] for a in acts)


def test_advance_illegal_jump_409s_with_allowed_set() -> None:
    client, _, _ = _client()
    cid = _contact(client)
    deal = _deal(client, cid)
    resp = client.post(f"/deals/{deal['id']}/advance", json={"toStage": "won"})
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert {t["toStage"] for t in detail["allowedTransitions"]} == {"qualified", "lost"}


def test_mark_lost_from_any_stage_then_closed() -> None:
    client, _, _ = _client()
    cid = _contact(client)
    deal = _deal(client, cid)
    client.post(f"/deals/{deal['id']}/advance", json={"toStage": "qualified"})
    resp = client.post(
        f"/deals/{deal['id']}/advance", json={"toStage": "lost", "note": "went dark"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] != "open"
    # Closed deal refuses further moves
    again = client.post(f"/deals/{deal['id']}/advance", json={"toStage": "qualified"})
    assert again.status_code == 409


def test_full_win_path() -> None:
    client, _, _ = _client()
    cid = _contact(client)
    deal = _deal(client, cid, value=50000)
    for stage in ("qualified", "proposal", "negotiation", "won"):
        resp = client.post(f"/deals/{deal['id']}/advance", json={"toStage": stage})
        assert resp.status_code == 200, stage
    assert resp.json()["stage"] == "won"
    assert resp.json()["allowedTransitions"] == []


def test_list_deals_filters_by_stage_and_contact() -> None:
    client, _, _ = _client()
    a, b = _contact(client, "Ada"), _contact(client, "Grace")
    d1 = _deal(client, a, title="A")
    _deal(client, b, title="B")
    client.post(f"/deals/{d1['id']}/advance", json={"toStage": "qualified"})
    assert client.get("/deals").json()["total"] == 2
    q = client.get("/deals", params={"stage": "qualified"}).json()
    assert q["total"] == 1 and q["items"][0]["title"] == "A"
    assert q["items"][0]["contactName"] == "Ada"
    by_contact = client.get("/deals", params={"contactId": b}).json()
    assert by_contact["total"] == 1 and by_contact["items"][0]["title"] == "B"


def test_dashboard_deals_tiles_are_real() -> None:
    client, _, _ = _client()
    cid = _contact(client)
    _deal(client, cid, value=100)
    d2 = _deal(client, cid, value=900)
    client.post(f"/deals/{d2['id']}/advance", json={"toStage": "lost"})
    dash = client.get("/dashboard").json()
    assert dash["activeDealsCount"] == 1
    assert dash["pipelineValue"] == 100


def test_pipeline_board_rollup() -> None:
    client, _, _ = _client()
    cid = _contact(client)
    d1 = _deal(client, cid, value=100)
    d2 = _deal(client, cid, value=250)
    d3 = _deal(client, cid, value=999)
    client.post(f"/deals/{d2['id']}/advance", json={"toStage": "qualified"})
    client.post(f"/deals/{d3['id']}/advance", json={"toStage": "lost"})
    board = client.get("/pipeline").json()
    stages = {s["key"]: s for s in board["stages"]}
    assert stages["lead"]["count"] == 1 and stages["lead"]["value"] == 100
    assert stages["qualified"]["count"] == 1 and stages["qualified"]["value"] == 250
    assert board["totalOpenCount"] == 2
    assert board["totalOpenValue"] == 350
    assert board["wonCount"] == 0 and board["lostCount"] == 1
    assert d1["stage"] == "lead"
