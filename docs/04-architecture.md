# CRM — Architecture (LOCKED)

Frozen decisions for parallel multi-agent build. Change only via a new issue +
PR; don't design around this silently.

## 1. Stack (with justification — brief §9)
- **Backend:** **FastAPI + Postgres + uv**, reusing the platform **library**
  (mirrors the proven `schedule` app). Justification: ~13 library packages drop
  in (auth/tenancy/quota/tracking/storage/qr/notifications/webhooks/queue), so we
  build glue + 4 new packages instead of a CRM from scratch. Async (asyncpg) hot
  path + pure engine, per `platform_tracking`.
- **Mobile + Web:** **React Native + Expo**, with **React-Native-Web** for the
  browser target → one codebase for iOS / Android / web (brief allows RN or
  Flutter; RN-Web gives the web target free and matches the team's React
  experience). **OCR:** on-device **ML Kit** (react-native) with a **Cloud Vision**
  server fallback.
- **Auth:** platform-core JWT (email/password). **Push:** FCM (new `platform-push`).
  **Storage:** Cloudflare R2 via `platform-storage-r2`. **Email:** transactional
  port now; campaigns in Phase 3.

## 2. Repo / build layout
```
apps/api      # FastAPI backend (uv, editable platform-* path deps -> ../../../library)
apps/mobile   # React Native + Expo (RN-Web for web)
docs          # these docs
```
The platform **library** is a sibling clone (`~/projects/library`); new reusable
logic goes there as `platform-*` packages (born-catalogued), NOT in this repo.

## 3. Library reuse map (read library/PACKAGES.md)
**Reuse as-is:** platform-core (auth/users/RBAC/OAuth/JWT) · platform-tenancy
(personal vs team) · platform-quota (Free/Solo/Team/Business limits) ·
**platform-tracking (DEAL PIPELINE)** · platform-notifications (in-app reminders)
· platform-storage(+r2)+platform-image-meta (card images) · platform-qr (vCard
share) · platform-queue (scheduled reminders/imports/sends) · platform-webhooks
(ESP open/click) · platform-kiosk-offline (offline sync primitives) ·
platform-audit (optional integrity) · platform-flags (tier gating).

**NEW packages to create (each born-catalogued):**
| Package | Purpose | Phase |
|---|---|---|
| `platform-contacts` | contact entity: CRUD, search/filter, tags/status, favorites, completeness, dedup/merge | 1 (#3) |
| `platform-ocr-cards` | OCR provider Protocol + business-card field parser + review staging | 1 (#4) |
| `platform-activity` | append-only per-entity interaction/timeline log | 1 (#5) |
| `platform-import-export` | CSV/Excel import w/ field mapping + export | 1 (#6) |
| `platform-deals` | typed deal fields (value/close/priority) + pipeline rollups over platform-tracking | 2 |
| `platform-campaigns` | email campaigns/templates/scheduling/tracking/segmentation/opt-out | 3 |
| `platform-push` | device-token registry + FCM/APNs sender | 2 |
| `platform-plans` | pricing-tier → platform-quota limit bundles | 2 |
| `platform-calendar-sync` | Google/Apple calendar (on platform-core OAuth) | 2 |

Name traps (per catalog): `platform-card` = NFC identity (NOT business cards);
`platform-capture` = kiosk device registry (NOT image capture). Do not use them.

## 4. CI (added in #2 backend scaffold; then made a required check)
`apps/api` CI: `ruff` · `ruff format --check` · `mypy --strict` · `pytest` (with a
Postgres service) · library `catalog check`. Once it exists, add it as a
**required status check** on `main` (branch protection is already on). Mobile CI:
`tsc` + lint + build.

## 5. Phase plan
Per `MACHINE-BOOTSTRAP` / the issues. Phase 1 = #2–#9 (+ dashboard, import/export
API, offline-sync API to be added). Dependencies are encoded as `Depends-On`;
never build a downstream ticket before its deps are Done.

## 6. MACHINE_ID roster
| ID | Machine | Lane |
|---|---|---|
| M1 | vivobook | general (backend/lib) |
| MAC1 | Mac mini | macOS/iOS builder (see `prompts/agent-bootstrap-ios-macmini.md`, `docs/IOS-SETUP.md`) |
| M2 | _(unassigned)_ | general |
| M3 | _(unassigned)_ | general |
