# Project State — CRM

## Current goal (2026-07-29 session)
Finish + polish the mobile app against the now-real backend: feature-complete,
QoL in place, modern theme-appropriate UI. Human gates stay open, never block.

## Current phase
MVP happy-path merged (#32); prod live on Contabo behind **bpconnect.app** with
APK distribution + in-app self-update (2026-07-28).

## Infrastructure (2026-07-28)
- Contabo box 194.233.76.189 (4 vCPU / 8 GB / Ubuntu, host `vmi3468178`), SSH key-only
  (`~/.ssh/contabo_crm`), user `deploy` (NOPASSWD sudo). Hardened: UFW deny-in except 22,
  fail2ban sshd jail, unattended-upgrades, password auth disabled.
- Cloudflare account e04d96a8… — zone **bpconnect.app** active. crm tunnel
  `72ac7753-…` (host systemd `cloudflared`, remote-managed config) ingress:
  `api.bpconnect.app` → localhost:8000, `apk.bpconnect.app` → localhost:8081;
  proxied CNAMEs → `<tunnel>.cfargotunnel.com`. DNS edits use the agent-minted
  zone-scoped `CLOUDFLARE_DNS_TOKEN` in `.env` (main account token lacks zone DNS;
  both expire **2026-08-25**, see HUMAN-QUEUE.md).
- **Shared postgres**: `grocery-db-1` (grocery's compose, postgres:16) now hosts the
  `crm` database/role too, reachable as `grocery-db` on the external `shared-db`
  docker network. crm's compose runs NO db container (old `crm-pgdata` volume kept
  on the box as a pre-migration snapshot). Grocery's compose change is committed in
  the grocery repo.
- Prod stack `docker-compose.contabo.yml`: `api` (loopback :8000) + `apk`
  (nginx:alpine, loopback :8081, serves `apk-dist/` — update.json + APKs,
  `Cache-Control: no-store`). Deploy via `scripts/deploy-contabo.sh`.
- R2 bucket `crm-images` (private + r2.dev public URL in `.env`) — not yet used by code.

## APK distribution + self-update (2026-07-28)
- `@platform/app-update` gained a capacitor-free `./core` export; the Expo glue is
  `apps/mobile/src/update/UpdateGate.tsx` (expo-application / file-system /
  intent-launcher / crypto). Manifest: `https://apk.bpconnect.app/update.json`,
  cache-busted with `?t=`; sha256-verified before the OS installer opens.
- `scripts/release-apk.sh` bumps `android.versionCode`, builds (prebuild +
  `assembleRelease`, `EXPO_PUBLIC_API_URL=https://api.bpconnect.app` baked in),
  writes `apk-dist/{app-v<N>.apk,bpconnect-crm-latest.apk,update.json}`, rsyncs to
  the box. Debug-keystore signing — machine-bound; real keystore queued (HUMAN-QUEUE).
- First install URL: `https://apk.bpconnect.app/bpconnect-crm-latest.apk` (autoindex
  on, so the bare host also lists files).

## Evidence
- 2026-07-28 · tunnel + DNS · `curl https://api.bpconnect.app/health` →
  `{"status":"ok","service":"crm-api"}`; `https://apk.bpconnect.app/` → 200.
- 2026-07-28 · shared-db migration · pg_dump crm → restore into grocery-db-1
  (`RESTORE_OK`, 9 tables); crm-api-1 healthy against `grocery-db`; crm-db-1 removed
  (`--remove-orphans`); grocery-db-1 healthy after network recreate.
- 2026-07-28 · library · @platform/app-update build + 17 vitest tests green with new
  `./core` entry; crm mobile `tsc --noEmit` clean, jest 17/17.
- 2026-07-28 · notifications wired (Resend email + Semaphore SMS) · api pytest 5/5,
  mypy strict + ruff clean; deployed; live e2e: register cloud@blueptsolution.com →
  `POST /auth/password-reset/request` 200 with the Resend sender registered (no
  log-only fallback line in logs) — reset email delivered via Resend; `POST /sms`
  401 unauthenticated (route live, Semaphore gateway built at startup).
- 2026-07-28 · SMS monitoring · send/record/refresh core extracted to library
  `platform_sms.log` (SmsSendService + SmsLogStore port; 5 new tests, 60/60 pkg);
  crm keeps the asyncpg `crm_sms_log` store + GET /sms + POST /sms/{id}/refresh.
  Live test to +639157661766: Semaphore rejects — account has NO active sender
  name (human gate, HUMAN-QUEUE §3); rejection correctly 400s with reason and is
  logged (row b5938044…, status=rejected, visible via GET /sms). Delivery + the
  refresh path against real provider ids re-verify once a sender name is approved.
- 2026-07-28 · APK release v1.0.0 (versionCode 2) · public
  `https://apk.bpconnect.app/update.json` served; `app-v2.apk` downloaded (104 MB)
  and sha256 matches manifest
  (`c94772632c4930943ada47f0a8b60a5507784a248328b4436b5769e739d86be3`);
  `bpconnect-crm-latest.apk` 200.

- 2026-07-29 · library review queue cleared · #256 platform-contacts reviewed+merged
  (33/33, mypy strict; pushed ruff style fix). #257 platform-activity + #258
  platform-import-export: requested changes (sync port / no validation; live
  formula-injection on export), fixes implemented on the branches
  (3c95af77, 215e8db9), re-verified in fresh worktrees (32/32 and 28/28, mypy
  strict + ruff clean), merged. @platform/ocr-cards extracted from crm mobile
  (18 vitest; crm side commit b578682).
- 2026-07-29 · contacts API + dashboard live (crm #8) · pytest 23/23, mypy
  strict, ruff clean; deployed; live e2e against api.bpconnect.app: register →
  POST /contacts (201, completenessScore 65) → activity 201 → GET /contacts?q=
  (total 1) → GET /dashboard (totals+reminder) → favorite toggle → PATCH
  (revision 2, status Active). Tables crm_contacts/crm_activity bootstrap in
  lifespan; tenant_id UUID NOT NULL defaulted per Phase-4 recommendation.

- 2026-07-29 · mobile on real backend + design system · tsc clean, jest 32/32
  after every step. Sessions persist in SecureStore w/ cold-start restore;
  biometrics now unlock the stored pair (empty-refresh-token bug gone).
  Scanner save → POST /contacts (R2 card-image upload when opted in, temp
  file deleted after). Contacts/Dashboard/ContactDetail rewired to live API
  (server search/filter/sort/pagination, optimistic favorites, activity
  composer, revision-aware PATCH w/ 409 handling, focus refetch,
  loading/error/empty states). Design system: src/theme + 12 shared
  components, Ionicons replace emoji, dead HomeScreen/bell removed, Register
  validation + confirm-password, native DateField. Security #48–#53 done
  (__DEV__ gate, cleartext off, R8+shrink, secure storage, temp-file
  cleanup, npm audit fix — 2 high resolved).
- 2026-07-29 · cards API · POST /cards/upload-url live-verified: presign →
  PUT 200 to R2 → public URL 200.

## Next
- Merge PR #57 (feat/notify-wiring → main) once its review comes back clean;
  publish v1.1.0 (versionCode 3) via `BUMP=0 bash scripts/release-apk.sh` after
  the emulator smoke test of the release build (R8 is newly enabled — verify
  the minified build boots before the fleet sees it).
- Device-test v3 on a fleet A15 (HUMAN-QUEUE §5) — update loop + camera OCR +
  biometric unlock on real hardware.
- Offline sync (docs/05-api.md POST /sync/push, GET /sync/pull) — the one
  Phase-1 contract item deliberately not built this pass; needs a joint look
  at platform-kiosk-offline vs crm PR #35's AsyncStorage stand-in shape.
- Phase 2 when unblocked: deals API (#37, needs erp access), push reminders,
  tags/status/source management UI, sales_pipeline() wiring (#255 merged).
- Set `CRM_CORS_ORIGINS` tightly if a browser-based client ships.

## Blockers
- None mechanical. Human gates in HUMAN-QUEUE.md: token expiry 2026-08-25,
  release keystore, Semaphore sender name, kvm group, v3 device test,
  erp access/CI billing, grocery hostname.

## 2026-07-29 session close
- PR #57 squash-merged to main after agent code review (8 findings fixed —
  incl. single-flight token refresh; the concurrent-401 race would have
  tripped platform-core replay detection and revoked all sessions).
  Post-fix gates: api pytest 42/42 + mypy strict + ruff; mobile tsc + jest
  32/32; Playwright happy path green vs real local backend. Live prod
  verified: favorite returns revision, PATCH null → 422, import/export
  round-trip, R2 presign→PUT→public 200.
- v1.1.0 (versionCode 3) published: update.json + app-v3.apk on
  apk.bpconnect.app, sha256 verified post-upload (72fa8291…),
  mandatory=false. Emulator smoke test NOT possible on this machine (no KVM
  — HUMAN-QUEUE §4); APK statically verified (launchable MainActivity, R8
  dex, JS bundle, ML Kit libs). On-device verification = HUMAN-QUEUE §5.
