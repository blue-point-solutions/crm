# src/crm_api/import_export.py
"""Contact CSV/XLSX import + export over platform-import-export.

Parsing, column->field mapping, per-field validation, and formula-injection-safe
serialization all live in the library (platform-import-export); this module owns
the HTTP layer, the header->contactField suggestion heuristic, and the mapping
onto ``crm_contacts`` rows via the existing ContactRepo port (no duplicated SQL).

Deliberate KISS deviation from the docs/05-api.md sketch: imports run
synchronously in the request instead of being enqueued. The library caps parses
at 10 MB / 50k rows, our own guard caps imports at ``IMPORT_MAX_ROWS`` rows, and
the fleet's real files are hundreds of rows — a queue would be speculative
infrastructure (YAGNI). Revisit if imports ever time out in practice.

Wire format is camelCase like the rest of the app. The ``mapping`` form field is
a JSON object ``{contactField: columnName}`` (the inverse of the library's
column->field orientation; inverted here before calling in).
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile, status
from platform_core.auth.deps import get_current_user
from platform_core.users.models import User
from platform_import_export import (
    FieldValidator,
    FileTooLargeError,
    MalformedFileError,
    UnsupportedFormatError,
    apply_mapping_and_validate,
    export_file,
    read_tabular_file,
)
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from crm_api.auth import DEFAULT_TENANT_ID
from crm_api.contacts import _CONSENT_TO_WIRE, ContactRepo, get_contact_repo

router = APIRouter(tags=["import-export"])

PREVIEW_SAMPLE_ROWS = 5
IMPORT_MAX_ROWS = 10_000  # tighter than the library's 50k parse guard
EXPORT_MAX_ROWS = 10_000
EXPORT_PAGE_SIZE = 500
ERRORS_CAP = 50

# Contact fields accepted in an import mapping. "name" is a convenience column
# split on the first space into firstName + lastName.
_MAPPABLE_FIELDS = (
    "firstName", "lastName", "name", "company", "jobTitle", "email", "phone",
    "website", "address", "notes", "source", "tags",
)

# --------------------------------------------------------------------------
# Header -> contact-field suggestion heuristic (case/space/punct-insensitive)
# --------------------------------------------------------------------------

_HEADER_SYNONYMS: dict[str, tuple[str, ...]] = {
    "firstName": ("firstname", "first", "givenname", "forename"),
    "lastName": ("lastname", "last", "surname", "familyname"),
    # A single full-name column; the importer splits it on the first space.
    "name": ("name", "fullname", "contactname"),
    "company": ("company", "companyname", "organization", "organisation", "employer"),
    "jobTitle": ("jobtitle", "title", "position", "role", "designation"),
    "email": ("email", "emailaddress", "mail"),
    "phone": ("phone", "phonenumber", "mobile", "mobilenumber", "cell", "telephone", "tel"),
    "website": ("website", "url", "web", "homepage"),
    "address": ("address", "location", "streetaddress"),
    "notes": ("notes", "note", "comments", "remarks"),
    "source": ("source", "leadsource"),
    "tags": ("tags", "tag", "labels", "groups"),
}


def _normalize_header(header: str) -> str:
    """Lowercase and strip everything but letters/digits ("E-mail Address" -> "emailaddress")."""
    return re.sub(r"[^a-z0-9]", "", header.lower())


def suggest_mapping(columns: list[str]) -> dict[str, str]:
    """Best-effort {contactField: columnName}; each column claimed at most once."""
    normalized = [_normalize_header(c) for c in columns]
    claimed: set[int] = set()
    suggestion: dict[str, str] = {}
    for field, synonyms in _HEADER_SYNONYMS.items():
        for i, norm in enumerate(normalized):
            if i not in claimed and norm in synonyms:
                suggestion[field] = columns[i]
                claimed.add(i)
                break
    return suggestion


# --------------------------------------------------------------------------
# Field validators (library contract: error message or None)
# --------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^\+?[0-9 ().\-/]{6,25}$")


def _validate_email(value: str) -> str | None:
    if value.strip() and not _EMAIL_RE.match(value.strip()):
        return f"invalid email: {value!r}"
    return None


def _validate_phone(value: str) -> str | None:
    v = value.strip()
    if v and (not _PHONE_RE.match(v) or sum(c.isdigit() for c in v) < 6):
        return f"invalid phone: {value!r}"
    return None


_VALIDATORS: dict[str, FieldValidator] = {"email": _validate_email, "phone": _validate_phone}


# --------------------------------------------------------------------------
# Wire schemas (camelCase, per app convention)
# --------------------------------------------------------------------------


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ImportPreviewOut(_Camel):
    columns: list[str]
    total_rows: int
    sample_rows: list[list[str]]
    suggested_mapping: dict[str, str]


class ImportRowErrorOut(_Camel):
    row_number: int
    message: str


class ImportOut(_Camel):
    imported: int
    failed: int
    errors: list[ImportRowErrorOut]


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------


def _tenant(_user: User) -> uuid.UUID:
    # Single synthesized workspace for now (see auth.py tenancy note).
    return DEFAULT_TENANT_ID


async def _read_upload(file: UploadFile) -> tuple[list[str], list[list[str]]]:
    data = await file.read()
    try:
        return read_tabular_file(data, file.filename or "", max_rows=IMPORT_MAX_ROWS)
    except (MalformedFileError, FileTooLargeError, UnsupportedFormatError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc


@router.post("/import/preview", response_model=ImportPreviewOut)
async def preview_import(
    file: UploadFile,
    _user: User = Depends(get_current_user),  # noqa: B008
) -> ImportPreviewOut:
    header, data_rows = await _read_upload(file)
    return ImportPreviewOut(
        columns=header,
        total_rows=len(data_rows),
        sample_rows=data_rows[:PREVIEW_SAMPLE_ROWS],
        suggested_mapping=suggest_mapping(header),
    )


def _parse_mapping(raw: str, header: list[str]) -> dict[str, str]:
    """Validate the {contactField: columnName} form field against known fields + header."""
    try:
        parsed = json.loads(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="mapping must be valid JSON",
        ) from exc
    if not isinstance(parsed, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in parsed.items()
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="mapping must be a JSON object of {contactField: columnName}",
        )
    mapping: dict[str, str] = dict(parsed)
    unknown_fields = sorted(set(mapping) - set(_MAPPABLE_FIELDS))
    if unknown_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"unknown contact fields in mapping: {unknown_fields}",
        )
    missing_columns = sorted(set(mapping.values()) - set(header))
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"mapped columns not in file header: {missing_columns}",
        )
    # The mapping is inverted to column→field downstream — two fields claiming
    # one column would silently drop one of them.
    if len(set(mapping.values())) != len(mapping):
        dupes = sorted({c for c in mapping.values() if list(mapping.values()).count(c) > 1})
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"each column may feed only one field; duplicated: {dupes}",
        )
    if not mapping:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="mapping is empty"
        )
    return mapping


def _record_to_row(record: dict[str, str], added_by: uuid.UUID) -> dict[str, Any] | str:
    """Build a crm_contacts insert row from a mapped record, or an error message."""
    first = record.get("firstName", "").strip()
    last = record.get("lastName", "").strip()
    if not first and not last and record.get("name", "").strip():
        # Single full-name column: split on the first space.
        name_parts = record["name"].strip().split(" ", 1)
        first = name_parts[0]
        last = name_parts[1].strip() if len(name_parts) > 1 else ""
    if not first and not last:
        return "row has neither a first nor a last name"
    email = record.get("email", "").strip()
    phone = record.get("phone", "").strip()
    tags = [t.strip() for t in re.split(r"[;,]", record.get("tags", "")) if t.strip()]
    return {
        "first_name": first,
        "last_name": last,
        "company": record.get("company", "").strip() or None,
        "job_title": record.get("jobTitle", "").strip() or None,
        "emails": [email] if email else [],
        "phones": [phone] if phone else [],
        "website": record.get("website", "").strip() or None,
        "address": record.get("address", "").strip() or None,
        "notes": record.get("notes", "").strip(),
        "source": record.get("source", "").strip() or None,
        "tags": tags,
        "source_method": "CSV Import",
        "added_by": added_by,
    }


@router.post("/import", response_model=ImportOut)
async def import_contacts(
    file: UploadFile,
    mapping: str = Form(),
    user: User = Depends(get_current_user),  # noqa: B008
    repo: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> ImportOut:
    header, data_rows = await _read_upload(file)
    field_by_column = {v: k for k, v in _parse_mapping(mapping, header).items()}
    result = apply_mapping_and_validate(
        header, data_rows, field_by_column, validators=_VALIDATORS
    )

    errors = [
        ImportRowErrorOut(row_number=e.row_number, message=f"{e.field}: {e.message}")
        for e in result.errors
    ]
    failed_rows = {e.row_number for e in result.errors}
    # Records keep row order but drop row numbers; the surviving rows are
    # exactly the 1..N sequence minus the failed ones, in order.
    ok_row_numbers = (
        n for n in range(1, len(data_rows) + 1) if n not in failed_rows
    )

    imported = 0
    for row_number, record in zip(ok_row_numbers, result.records, strict=True):
        row = _record_to_row(dict(record), added_by=user.id)
        if isinstance(row, str):
            failed_rows.add(row_number)
            errors.append(ImportRowErrorOut(row_number=row_number, message=row))
            continue
        await repo.create(row)
        imported += 1

    errors.sort(key=lambda e: e.row_number)
    return ImportOut(imported=imported, failed=len(failed_rows), errors=errors[:ERRORS_CAP])


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------

EXPORT_FIELDNAMES = (
    "firstName", "lastName", "company", "jobTitle", "emails", "phones", "website",
    "address", "status", "source", "tags", "marketingConsent", "leadTemperature",
    "notes", "followUpDate", "dateAdded",
)

_EXPORT_MEDIA_TYPES = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _export_record(row: dict[str, Any]) -> dict[str, str]:
    return {
        "firstName": row["first_name"],
        "lastName": row["last_name"],
        "company": row["company"] or "",
        "jobTitle": row["job_title"] or "",
        "emails": ";".join(row["emails"]),
        "phones": ";".join(row["phones"]),
        "website": row["website"] or "",
        "address": row["address"] or "",
        "status": row["status"],
        "source": row["source"] or "",
        "tags": ";".join(row["tags"]),
        "marketingConsent": _CONSENT_TO_WIRE.get(row["marketing_consent"], "NotAsked"),
        "leadTemperature": row["lead_temperature"] or "",
        "notes": row["notes"],
        "followUpDate": row["follow_up_at"].isoformat() if row["follow_up_at"] else "",
        "dateAdded": row["created_at"].isoformat(),
    }


@router.get("/export")
async def export_contacts(
    format: Literal["csv", "xlsx"] = "csv",
    q: str | None = None,
    tag: str | None = None,
    status: str | None = None,
    source: str | None = None,
    lead_temperature: str | None = None,
    favorite: bool | None = None,
    user: User = Depends(get_current_user),  # noqa: B008
    repo: ContactRepo = Depends(get_contact_repo),  # noqa: B008
) -> Response:
    tenant_id = _tenant(user)
    rows: list[dict[str, Any]] = []
    page = 1
    while len(rows) < EXPORT_MAX_ROWS:
        batch, _total, _facets = await repo.search(
            tenant_id,
            q=q,
            tag=tag,
            status=status,
            source=source,
            lead_temperature=lead_temperature,
            favorite=favorite,
            sort="recent",
            page=page,
            page_size=EXPORT_PAGE_SIZE,
        )
        rows.extend(batch)
        if len(batch) < EXPORT_PAGE_SIZE:
            break
        page += 1
    rows = rows[:EXPORT_MAX_ROWS]

    body = export_file([_export_record(r) for r in rows], EXPORT_FIELDNAMES, format)
    filename = f"contacts-{datetime.now(UTC):%Y%m%d}.{format}"
    return Response(
        content=body,
        media_type=_EXPORT_MEDIA_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
