# tests/test_import_export.py
"""Import/export routes over an in-memory repo fake (same pattern as
test_contacts.py: these tests pin the HTTP contract — preview shape, mapping
heuristic, partial-success import, export serialization + sanitization, 422s)."""

from __future__ import annotations

import io
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient
from openpyxl import Workbook
from platform_core.auth.deps import get_current_user

from crm_api.contacts import get_contact_repo
from crm_api.import_export import suggest_mapping
from crm_api.main import create_app
from crm_api.settings import Settings

NOW = datetime(2026, 7, 29, 12, 0, tzinfo=UTC)


class FakeUser:
    id = uuid.UUID("00000000-0000-0000-0000-0000000000aa")
    email = "test@example.com"
    username = "test"
    is_admin = False


class FakeRepo:
    """In-memory ContactRepo (only the methods import/export touch)."""

    def __init__(self) -> None:
        self.rows: dict[uuid.UUID, dict[str, Any]] = {}

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

    async def candidates(self, tenant_id: uuid.UUID, **kw: Any) -> list[dict[str, Any]]:
        return []  # POST /contacts is only used here to seed export data

    async def search(self, tenant_id: uuid.UUID, **kw: Any) -> Any:
        rows = list(self.rows.values())
        if kw.get("favorite") is not None:
            rows = [r for r in rows if r["favorite"] == kw["favorite"]]
        page, page_size = kw["page"], kw["page_size"]
        window = rows[(page - 1) * page_size : page * page_size]
        return window, len(rows), {"status": {}, "leadTemperature": {}}


def _client(repo: FakeRepo | None = None) -> tuple[TestClient, FakeRepo]:
    repo = repo or FakeRepo()
    app = create_app(Settings(database_url=None))
    app.dependency_overrides[get_current_user] = lambda: FakeUser()
    app.dependency_overrides[get_contact_repo] = lambda: repo
    return TestClient(app), repo


def _csv_upload(text: str, filename: str = "contacts.csv") -> dict[str, Any]:
    return {"file": (filename, io.BytesIO(text.encode("utf-8")), "text/csv")}


def _xlsx_bytes(rows: list[list[str]]) -> bytes:
    wb = Workbook()
    sheet = wb.active
    assert sheet is not None
    for row in rows:
        sheet.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# --------------------------------------------------------------------------
# Preview
# --------------------------------------------------------------------------


def test_preview_returns_columns_samples_and_suggested_mapping() -> None:
    client, _ = _client()
    csv_text = "First Name,Last Name,E-Mail Address,Company Name,Phone #\n" + "\n".join(
        f"Ada{i},Lovelace,ada{i}@example.com,Apex,+63917000000{i}" for i in range(7)
    )
    resp = client.post("/import/preview", files=_csv_upload(csv_text))
    assert resp.status_code == 200
    body = resp.json()
    assert body["columns"] == ["First Name", "Last Name", "E-Mail Address", "Company Name", "Phone #"]
    assert body["totalRows"] == 7
    assert len(body["sampleRows"]) == 5  # capped at first 5
    assert body["sampleRows"][0] == ["Ada0", "Lovelace", "ada0@example.com", "Apex", "+639170000000"]
    assert body["suggestedMapping"] == {
        "firstName": "First Name",
        "lastName": "Last Name",
        "email": "E-Mail Address",
        "company": "Company Name",
        "phone": "Phone #",
    }


def test_preview_reads_xlsx() -> None:
    client, _ = _client()
    data = _xlsx_bytes([["Full Name", "Mobile"], ["Grace Hopper", "0917 123 4567"]])
    resp = client.post(
        "/import/preview",
        files={"file": ("book.xlsx", io.BytesIO(data), "application/octet-stream")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["totalRows"] == 1
    assert body["suggestedMapping"] == {"name": "Full Name", "phone": "Mobile"}


def test_suggest_mapping_claims_each_column_once() -> None:
    # "Name" must not be claimed twice; unknown headers are simply unmapped.
    assert suggest_mapping(["Name", "name", "Favourite Colour"]) == {"name": "Name"}


def test_preview_oversized_file_422() -> None:
    client, _ = _client()
    blob = b"a" * (10 * 1024 * 1024 + 1)  # just over the library's 10 MB guard
    resp = client.post("/import/preview", files={"file": ("big.csv", io.BytesIO(blob), "text/csv")})
    assert resp.status_code == 422
    assert "max_bytes" in resp.json()["detail"]


def test_preview_malformed_xlsx_422() -> None:
    client, _ = _client()
    resp = client.post(
        "/import/preview",
        files={"file": ("broken.xlsx", io.BytesIO(b"not a zip"), "application/octet-stream")},
    )
    assert resp.status_code == 422


def test_preview_unsupported_extension_422() -> None:
    client, _ = _client()
    resp = client.post(
        "/import/preview", files={"file": ("contacts.txt", io.BytesIO(b"x"), "text/plain")}
    )
    assert resp.status_code == 422


# --------------------------------------------------------------------------
# Import
# --------------------------------------------------------------------------


def test_import_happy_path_inserts_via_repo() -> None:
    client, repo = _client()
    csv_text = (
        "fn,ln,mail,tel,co\n"
        "Ada,Lovelace,ada@example.com,+639171234567,Apex\n"
        "Grace,Hopper,grace@example.com,,Compilers\n"
    )
    resp = client.post(
        "/import",
        files=_csv_upload(csv_text),
        data={
            "mapping": '{"firstName": "fn", "lastName": "ln", "email": "mail",'
            ' "phone": "tel", "company": "co"}'
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"imported": 2, "failed": 0, "errors": []}
    rows = sorted(repo.rows.values(), key=lambda r: r["first_name"])
    assert rows[0]["first_name"] == "Ada"
    assert rows[0]["last_name"] == "Lovelace"
    assert rows[0]["emails"] == ["ada@example.com"]
    assert rows[0]["phones"] == ["+639171234567"]
    assert rows[0]["company"] == "Apex"
    assert rows[0]["source_method"] == "CSV Import"
    assert rows[0]["added_by"] == FakeUser.id
    assert rows[1]["phones"] == []


def test_import_partial_failures_reported_per_row() -> None:
    client, repo = _client()
    csv_text = (
        "fn,ln,mail\n"
        "Ada,Lovelace,ada@example.com\n"
        "Bad,Email,not-an-email\n"
        ",,blank@example.com\n"
        "Grace,Hopper,\n"
    )
    resp = client.post(
        "/import",
        files=_csv_upload(csv_text),
        data={"mapping": '{"firstName": "fn", "lastName": "ln", "email": "mail"}'},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 2  # Ada + Grace (empty email is fine)
    assert body["failed"] == 2
    assert [e["rowNumber"] for e in body["errors"]] == [2, 3]
    assert "invalid email" in body["errors"][0]["message"]
    assert "neither a first nor a last name" in body["errors"][1]["message"]
    assert len(repo.rows) == 2


def test_import_splits_single_name_column() -> None:
    client, repo = _client()
    csv_text = "Contact Name\nAda Lovelace King\nGrace\n"
    resp = client.post(
        "/import", files=_csv_upload(csv_text), data={"mapping": '{"name": "Contact Name"}'}
    )
    assert resp.status_code == 200
    assert resp.json()["imported"] == 2
    by_first = {r["first_name"]: r for r in repo.rows.values()}
    assert by_first["Ada"]["last_name"] == "Lovelace King"  # split on FIRST space only
    assert by_first["Grace"]["last_name"] == ""


def test_import_tags_split_on_semicolons_and_commas() -> None:
    client, repo = _client()
    csv_text = "fn,Tags\nAda,vip; expo 2026,\n"
    resp = client.post(
        "/import",
        files=_csv_upload(csv_text),
        data={"mapping": '{"firstName": "fn", "tags": "Tags"}'},
    )
    assert resp.status_code == 200
    (row,) = repo.rows.values()
    assert row["tags"] == ["vip", "expo 2026"]


def test_import_rejects_bad_mapping() -> None:
    client, _ = _client()
    csv_text = "fn\nAda\n"
    for bad in (
        "not json",
        '{"firstName": 3}',
        '{"nickname": "fn"}',  # unknown contact field
        '{"firstName": "missing_col"}',  # column not in header
        "{}",
        '{"firstName": "fn", "name": "fn"}',  # two fields claiming one column
    ):
        resp = client.post("/import", files=_csv_upload(csv_text), data={"mapping": bad})
        assert resp.status_code == 422, bad


def test_import_malformed_csv_422() -> None:
    client, _ = _client()
    resp = client.post(
        "/import",
        files={"file": ("c.csv", io.BytesIO(b"\xff\xfe\x00bad"), "text/csv")},
        data={"mapping": '{"firstName": "fn"}'},
    )
    assert resp.status_code == 422


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------


def test_export_csv_content_and_headers() -> None:
    client, _ = _client()
    client.post(
        "/contacts",
        json={
            "firstName": "Ada", "lastName": "Lovelace", "company": "Apex",
            "emails": ["a@x.co", "b@x.co"], "phones": ["+639171234567"],
            "tags": ["vip", "expo"], "marketingConsent": "Yes", "notes": "met at expo",
        },
    )
    resp = client.get("/export", params={"format": "csv"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    assert resp.headers["content-disposition"] == (
        f'attachment; filename="contacts-{stamp}.csv"'
    )
    lines = resp.text.strip().splitlines()
    assert lines[0] == (
        "firstName,lastName,company,jobTitle,emails,phones,website,address,status,"
        "source,tags,marketingConsent,leadTemperature,notes,followUpDate,dateAdded"
    )
    # leading "+" on the phone is a formula trigger, so the library quotes it
    assert "Ada,Lovelace,Apex,,a@x.co;b@x.co,'+639171234567,,,Lead,,vip;expo,Yes,," in lines[1]
    assert "met at expo" in lines[1]


def test_export_sanitizes_formula_injection() -> None:
    client, _ = _client()
    client.post("/contacts", json={"firstName": "=HYPERLINK(\"http://evil\")", "lastName": "X"})
    resp = client.get("/export", params={"format": "csv"})
    # The library prefixes a single quote so spreadsheets treat it as text.
    assert "'=HYPERLINK" in resp.text
    assert "\n=HYPERLINK" not in resp.text


def test_export_xlsx_media_type_and_filename() -> None:
    client, _ = _client()
    client.post("/contacts", json={"firstName": "Ada"})
    resp = client.get("/export", params={"format": "xlsx"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert resp.headers["content-disposition"].endswith('.xlsx"')
    assert resp.content[:2] == b"PK"  # xlsx is a zip container


def test_export_pages_through_repo() -> None:
    client, repo = _client()
    for i in range(750):  # more than one 500-row page
        cid = uuid.uuid4()
        repo.rows[cid] = repo._defaults({"id": cid, "first_name": f"C{i}"})
    resp = client.get("/export", params={"format": "csv"})
    assert len(resp.text.strip().splitlines()) == 751  # header + all rows


def test_export_respects_favorite_filter() -> None:
    client, repo = _client()
    client.post("/contacts", json={"firstName": "Fav"})
    for row in repo.rows.values():
        row["favorite"] = True
    client.post("/contacts", json={"firstName": "Plain"})
    resp = client.get("/export", params={"format": "csv", "favorite": "true"})
    assert "Fav" in resp.text
    assert "Plain" not in resp.text
