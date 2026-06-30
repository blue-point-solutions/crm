# CRM — API Contract (sketch; Phase 1 locked, 2–4 indicative)

REST/JSON over the FastAPI backend. JWT bearer (platform-core). All routes
tenant-scoped from the token; `me` = current user/tenant. Errors: typed →
HTTP per platform conventions (404 not-found, 409 conflict/concurrency, 422
validation, 403 forbidden, 429 rate-limit).

## Auth (reuse platform-core `auth/router`)  — Phase 1 (#7)
- `POST /auth/register` · `POST /auth/login` → TokenPair · `POST /auth/refresh`
- `GET /me` → user + tenant + role (Admin/Member)

## Contacts  — Phase 1 (#8)
- `POST /contacts` · `GET /contacts/{id}` · `PATCH /contacts/{id}` · `DELETE /contacts/{id}`
- `GET /contacts?q=&tag=&status=&source=&favorite=&sort=&page=` → list + facets
- `POST /contacts/{id}/favorite` (toggle)
- `GET /contacts/{id}/activity` → timeline (platform-activity)
- `POST /contacts/{id}/activity` → log note/call/email/meeting

## Card scan / OCR  — Phase 1 (#4 lib + #7-ish API)
- `POST /cards/scan` (multipart image **or** `{image_key}` for a pre-uploaded R2 object)
  → `{extracted: {name,company,emails,phones,website,…}, dedup: {match_contact_id?}}`
  Backend: OCR (Cloud Vision fallback) → parse (platform-ocr-cards) → dedup
  (platform-contacts). Client reviews, then `POST /contacts` with `card_image_key`.
- `POST /cards/upload-url` → presigned R2 upload (platform-storage-r2) for direct
  device→bucket upload.

## Import / Export  — Phase 1 (#6 lib + API)
- `POST /import/preview` (CSV/XLSX) → detected columns + suggested field mapping
- `POST /import` `{mapping}` → enqueue import (platform-queue); returns job id
- `GET /export?format=csv|xlsx&<same filters as list>` → file stream

## Dashboard  — Phase 1
- `GET /dashboard` → {total_contacts, recent[], upcoming_reminders[],
  active_deals_count, pipeline_value, inactive_30d[]}

## Offline sync  — Phase 1
- `POST /sync/push` `{client_event_id, op, payload}[]` → idempotent apply
  (platform-kiosk-offline dedupe) · `GET /sync/pull?since=` → changes

## Deals / pipeline  — Phase 2 (platform-deals + platform-tracking)
- `POST /deals` · `GET /deals?stage=&assignee=&sort=` · `POST /deals/{id}/advance`
  `{to_stage}` · `GET /pipeline` → board + rollups (value/by-stage/win-loss)

## Campaigns / reports  — Phase 3
- `POST /campaigns` · `POST /campaigns/{id}/schedule` · `GET /campaigns/{id}/report`
- `POST /webhooks/esp` (open/click/bounce; platform-webhooks HMAC verify)
- `GET /reports/{contacts-by-source|pipeline-conversion|campaign|follow-up}`
