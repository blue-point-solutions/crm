# tests/test_contacts.py
"""Contacts + dashboard routes over an in-memory repo fake (same pattern as
test_sms.py: SQL correctness is verified live on deploy; these tests pin the
HTTP contract — camelCase wire shapes, validation, dedup surfacing, 404/409/422)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from platform_core.auth.deps import get_current_user

from crm_api.contacts import ContactConflictError, get_contact_repo
from crm_api.dashboard import get_dashboard_repo
from crm_api.main import create_app
from crm_api.settings import Settings

NOW = datetime(2026, 7, 29, 12, 0, tzinfo=UTC)


class FakeUser:
    id = uuid.UUID("00000000-0000-0000-0000-0000000000aa")
    email = "test@example.com"
    username = "test"
    is_admin = False


class FakeRepo:
    """In-memory ContactRepo + DashboardRepo."""

    def __init__(self) -> None:
        self.rows: dict[uuid.UUID, dict[str, Any]] = {}
        self.acts: dict[uuid.UUID, list[dict[str, Any]]] = {}

    def _defaults(self, row: dict[str, Any]) -> dict[str, Any]:
        cid = uuid.uuid4()
        return {
            "id": cid, "tenant_id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
            "first_name": "", "last_name": "", "job_title": None, "company": None,
            "phones": [], "emails": [], "website": None, "address": None,
            "linkedin": None, "facebook": None, "card_image_url": None,
            "industry": None, "source": None, "tags": [], "interests": [],
            "status": "Lead", "marketing_consent": "Not Asked",
            "decision_maker": "Unknown", "lead_temperature": None, "notes": "",
            "pain_point": None, "follow_up_at": None, "favorite": False,
            "added_by": None, "source_method": "Manual Entry",
            "created_at": NOW, "updated_at": NOW, "revision": 0,
            **row,
        }

    async def create(self, row: dict[str, Any]) -> dict[str, Any]:
        full = self._defaults(row)
        self.rows[full["id"]] = full
        return full

    async def get(self, tenant_id: uuid.UUID, contact_id: uuid.UUID) -> dict[str, Any] | None:
        return self.rows.get(contact_id)

    async def update(
        self,
        tenant_id: uuid.UUID,
        contact_id: uuid.UUID,
        updates: dict[str, Any],
        expected_revision: int | None,
    ) -> dict[str, Any] | None:
        row = self.rows.get(contact_id)
        if row is None:
            return None
        if expected_revision is not None and row["revision"] != expected_revision:
            raise ContactConflictError
        row.update(updates)
        row["revision"] += 1
        row["updated_at"] = NOW
        return row

    async def delete(self, tenant_id: uuid.UUID, contact_id: uuid.UUID) -> bool:
        return self.rows.pop(contact_id, None) is not None

    async def toggle_favorite(
        self, tenant_id: uuid.UUID, contact_id: uuid.UUID
    ) -> dict[str, Any] | None:
        row = self.rows.get(contact_id)
        if row is None:
            return None
        row["favorite"] = not row["favorite"]
        row["revision"] += 1
        return row

    async def search(self, tenant_id: uuid.UUID, **kw: Any) -> Any:
        rows = list(self.rows.values())
        if kw.get("q"):
            needle = kw["q"].lower()
            rows = [
                r for r in rows
                if needle in f"{r['first_name']} {r['last_name']}".lower()
                or needle in (r["company"] or "").lower()
            ]
        if kw.get("favorite") is not None:
            rows = [r for r in rows if r["favorite"] == kw["favorite"]]
        return rows, len(rows), {"status": {}, "leadTemperature": {}}

    async def candidates(self, tenant_id: uuid.UUID, **kw: Any) -> list[dict[str, Any]]:
        emails = {e.lower() for e in kw.get("emails", [])}
        return [
            r for r in self.rows.values()
            if emails and emails & {e.lower() for e in r["emails"]}
        ]

    async def list_activities(
        self, tenant_id: uuid.UUID, contact_id: uuid.UUID, limit: int
    ) -> list[dict[str, Any]]:
        return sorted(
            self.acts.get(contact_id, []), key=lambda a: a["created_at"], reverse=True
        )[:limit]

    async def add_activity(
        self,
        tenant_id: uuid.UUID,
        contact_id: uuid.UUID,
        *,
        type_: str,
        content: str,
        created_by: uuid.UUID | None,
    ) -> dict[str, Any]:
        a = {
            "id": uuid.uuid4(), "type": type_, "content": content,
            "created_at": NOW + timedelta(seconds=len(self.acts.get(contact_id, []))),
        }
        self.acts.setdefault(contact_id, []).append(a)
        return a

    async def summary(self, tenant_id: uuid.UUID) -> dict[str, Any]:
        rows = list(self.rows.values())
        return {
            "total_contacts": len(rows),
            "recent": rows[:5],
            "upcoming_reminders": [r for r in rows if r["follow_up_at"]][:5],
            "inactive_30d": [],
        }


def _client(repo: FakeRepo | None = None) -> tuple[TestClient, FakeRepo]:
    repo = repo or FakeRepo()
    app = create_app(Settings(database_url=None))
    app.dependency_overrides[get_current_user] = lambda: FakeUser()
    app.dependency_overrides[get_contact_repo] = lambda: repo
    app.dependency_overrides[get_dashboard_repo] = lambda: repo
    return TestClient(app), repo


def test_create_returns_camel_case_detail() -> None:
    client, _ = _client()
    resp = client.post(
        "/contacts",
        json={
            "firstName": "Sarah", "lastName": "Mitchell", "company": "Apex",
            "emails": ["s@apex.co"], "phones": ["+639171234567"],
            "marketingConsent": "Yes", "sourceMethod": "Card Scan",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["firstName"] == "Sarah"
    assert body["email"] == "s@apex.co"
    assert body["marketingConsent"] == "Yes"
    assert body["sourceMethod"] == "Card Scan"
    assert body["duplicates"] == []
    assert body["completenessScore"] == 65  # email 25 + phone 15 + company 15 + consent 10
    assert body["activities"] == []


def test_create_requires_a_name() -> None:
    client, _ = _client()
    resp = client.post("/contacts", json={"company": "Apex"})
    assert resp.status_code == 422


def test_create_surfaces_duplicates_without_blocking() -> None:
    client, repo = _client()
    first = client.post(
        "/contacts", json={"firstName": "Ada", "emails": ["ada@example.com"]}
    ).json()
    resp = client.post(
        "/contacts", json={"firstName": "Ada B", "emails": ["ADA@example.com"]}
    )
    assert resp.status_code == 201  # never blocked
    dupes = resp.json()["duplicates"]
    assert [d["id"] for d in dupes] == [first["id"]]
    assert len(repo.rows) == 2


def test_get_detail_includes_activities_and_last_activity() -> None:
    client, _ = _client()
    cid = client.post("/contacts", json={"firstName": "Ada"}).json()["id"]
    client.post(f"/contacts/{cid}/activity", json={"type": "call", "content": "intro call"})
    client.post(f"/contacts/{cid}/activity", json={"type": "note", "content": "budget ok"})
    body = client.get(f"/contacts/{cid}").json()
    assert [a["type"] for a in body["activities"]] == ["note", "call"]
    assert body["lastActivityDate"] == body["activities"][0]["createdAt"]


def test_get_unknown_contact_404s() -> None:
    client, _ = _client()
    assert client.get(f"/contacts/{uuid.uuid4()}").status_code == 404


def test_patch_updates_and_bumps_revision() -> None:
    client, _ = _client()
    cid = client.post("/contacts", json={"firstName": "Ada"}).json()["id"]
    body = client.patch(f"/contacts/{cid}", json={"company": "Apex", "status": "Active"}).json()
    assert body["company"] == "Apex"
    assert body["status"] == "Active"
    assert body["revision"] == 1


def test_patch_cannot_clear_both_names() -> None:
    client, _ = _client()
    cid = client.post("/contacts", json={"firstName": "Ada"}).json()["id"]
    resp = client.patch(f"/contacts/{cid}", json={"firstName": ""})
    assert resp.status_code == 422


def test_patch_stale_revision_409s() -> None:
    client, _ = _client()
    cid = client.post("/contacts", json={"firstName": "Ada"}).json()["id"]
    client.patch(f"/contacts/{cid}", json={"company": "Apex"})  # revision now 1
    resp = client.patch(f"/contacts/{cid}", json={"company": "Stale", "revision": 0})
    assert resp.status_code == 409


def test_patch_maps_consent_and_card_image_aliases() -> None:
    client, repo = _client()
    cid = client.post("/contacts", json={"firstName": "Ada"}).json()["id"]
    body = client.patch(
        f"/contacts/{cid}",
        json={"marketingConsent": "NotAsked", "cardImageUri": "https://r2/img.jpg"},
    ).json()
    assert body["marketingConsent"] == "NotAsked"
    assert body["cardImageUri"] == "https://r2/img.jpg"
    row = repo.rows[uuid.UUID(cid)]
    assert row["marketing_consent"] == "Not Asked"  # canonical form in storage
    assert row["card_image_url"] == "https://r2/img.jpg"


def test_delete_then_404() -> None:
    client, _ = _client()
    cid = client.post("/contacts", json={"firstName": "Ada"}).json()["id"]
    assert client.delete(f"/contacts/{cid}").status_code == 204
    assert client.get(f"/contacts/{cid}").status_code == 404
    assert client.delete(f"/contacts/{cid}").status_code == 404


def test_favorite_toggles_and_returns_revision() -> None:
    client, _ = _client()
    cid = client.post("/contacts", json={"firstName": "Ada"}).json()["id"]
    first = client.post(f"/contacts/{cid}/favorite").json()
    assert first["favorite"] is True
    assert first["revision"] == 1  # toggle bumps the optimistic lock
    second = client.post(f"/contacts/{cid}/favorite").json()
    assert second["favorite"] is False
    assert second["revision"] == 2


def test_favorite_then_patch_with_merged_revision_succeeds() -> None:
    client, _ = _client()
    cid = client.post("/contacts", json={"firstName": "Ada"}).json()["id"]
    rev = client.post(f"/contacts/{cid}/favorite").json()["revision"]
    resp = client.patch(f"/contacts/{cid}", json={"notes": "kept", "revision": rev})
    assert resp.status_code == 200


def test_patch_null_on_non_nullable_field_422s() -> None:
    client, _ = _client()
    cid = client.post("/contacts", json={"firstName": "Ada"}).json()["id"]
    assert client.patch(f"/contacts/{cid}", json={"notes": None}).status_code == 422
    assert client.patch(f"/contacts/{cid}", json={"status": None}).status_code == 422
    # Genuinely nullable columns may be cleared explicitly.
    assert client.patch(f"/contacts/{cid}", json={"painPoint": None}).status_code == 200


def test_list_returns_items_total_facets() -> None:
    client, _ = _client()
    client.post("/contacts", json={"firstName": "Ada", "company": "Apex"})
    client.post("/contacts", json={"firstName": "Grace", "company": "Compilers"})
    body = client.get("/contacts", params={"q": "apex"}).json()
    assert body["total"] == 1
    assert body["items"][0]["firstName"] == "Ada"
    assert "facets" in body
    assert body["page"] == 1


def test_activity_validation_rejects_unknown_type() -> None:
    client, _ = _client()
    cid = client.post("/contacts", json={"firstName": "Ada"}).json()["id"]
    resp = client.post(f"/contacts/{cid}/activity", json={"type": "fax", "content": "x"})
    assert resp.status_code == 422


def test_activity_on_unknown_contact_404s() -> None:
    client, _ = _client()
    resp = client.post(
        f"/contacts/{uuid.uuid4()}/activity", json={"type": "note", "content": "x"}
    )
    assert resp.status_code == 404


def test_dashboard_shape() -> None:
    client, _ = _client()
    client.post("/contacts", json={"firstName": "Ada", "followUpDate": "2026-08-01T09:00:00Z"})
    body = client.get("/dashboard").json()
    assert body["totalContacts"] == 1
    assert len(body["recent"]) == 1
    assert body["upcomingReminders"][0]["contact"]["firstName"] == "Ada"
    assert body["activeDealsCount"] == 0
    assert body["pipelineValue"] == 0.0
