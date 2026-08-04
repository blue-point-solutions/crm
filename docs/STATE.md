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

## 2026-08-05 session — web app live at app.bpconnect.app
- The mobile app now ships as a web app: Expo static web export (SPA,
  `web.output: "single"` — avoids the static-export hydration double-mount
  found during the #57 e2e) of the SAME apps/mobile codebase, served by a new
  `web` nginx container (loopback :8083, SPA fallback, hashed bundles
  immutable, index.html no-store) behind tunnel ingress + proxied CNAME
  **app.bpconnect.app** (both added via CF API). Publish via
  `scripts/release-web.sh` (bakes EXPO_PUBLIC_API_URL, rsyncs web-dist/).
- Web-gap fixes in apps/mobile: sessions persist in localStorage on web
  (documented tradeoff — rotating single-use refresh tokens + replay
  detection; was memory-only, logout on every refresh); new
  utils/dialogs.ts (RN-Web Alert.alert is a silent no-op — all 7 Alert call
  sites migrated, confirms now work in browsers); DateField renders a native
  `<input type=date>` on web (RNC datetimepicker has no web impl); card-scan
  entry on web is upload-first (no camera flow; OCR mock now __DEV__-only so
  fabricated data can never prefill a prod form — falls back to manual
  entry); e2e spec updated to the new web scan flow.
- CORS tightened: `CRM_CORS_ORIGINS=https://app.bpconnect.app` in prod
  compose (STATE "Next" item closed); localhost defaults still apply for
  local dev/e2e when unset.
- Evidence: 2026-08-05 · web app · mobile tsc clean + jest 52/52 (6 new);
  Playwright happy path green vs live api.bpconnect.app (dev server); prod
  static-export smoke green served locally AND live at
  https://app.bpconnect.app (login → dashboard → reload keeps session);
  preflight from app.bpconnect.app → 200 + allow-origin echo, evil origin →
  400; SPA deep route → 200; bundle → max-age=31536000 immutable; e2e Jane
  Smith contact deleted from shared tenant (DELETE 204, q=Jane total 0).
- PR #67 squash-merged after agent code review (5 reviewers, 7 candidates,
  none ≥ threshold; the three 75-scored findings fixed pre-merge anyway):
  Web Locks API serializes /auth/refresh across tabs (localStorage shares
  the single-use refresh token — per-tab single-flight alone could trip
  replay detection and revoke the session family), deleteCardImage revokes
  web blob: URLs (security #52 parity), hashed /assets/ now cached
  immutable. jest 54/54; redeployed + live smoke re-green, hashed asset
  serves immutable. NOTE: #67's squash also carried two previously
  local-only docs commits (782384b, 025895c HUMAN-QUEUE encryption items) —
  local main was reset to origin/main after verifying content-identical.
- Process fix from that note: AGENTS.md work-rule 8 (#69) — never commit to
  local main; every change (docs included) merges via its own PR branch.
- 2026-08-05 · headless local e2e · Docker Desktop restored on this machine;
  `docker compose up -d postgres` (local :5433) + uvicorn crm_api on :8001 +
  `PW_HEADLESS=1 npx playwright test` → happy path 1/1 green in 13.2s
  (register → card upload → review → save, fully local stack, main @48fb82a).
  Local api/postgres stopped after; e2e rows live only in the local volume.

## Next
- QA device pass of v5 (1.2.1) on a fleet A15 (HUMAN-QUEUE §5) — 9 Device
  cases + 7 emulator-Blocked cases in docs/test-matrix.xlsx; REM-02/03 and
  SCAN-03 re-test against the v1.2.1 fixes.
- Minor QoL from the emulator pass: Contacts sort control (server supports
  ?sort=), dashboard refetch on resume-from-background.
- Offline sync (docs/05-api.md POST /sync/push, GET /sync/pull) — the one
  Phase-1 contract item deliberately not built this pass; needs a joint look
  at platform-kiosk-offline vs crm PR #35's AsyncStorage stand-in shape.
- Phase 2 when unblocked: deals API (#37, needs erp access), push reminders,
  tags/status/source management UI, sales_pipeline() wiring (#255 merged).

## Blockers
- None mechanical. Human gates in HUMAN-QUEUE.md: token expiry 2026-08-25,
  release keystore, Semaphore sender name, v4 QA device pass (§5),
  erp access/CI billing, grocery hostname. (kvm §4 closed 2026-07-30.)

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

## Phase 2 — increment 1 (2026-07-29)
- Deals/pipeline API live (crm #37): POST /deals · GET /deals?stage=&contactId= ·
  POST /deals/{id}/advance ({toStage} → unique legal transition; 409 carries
  allowedTransitions) · GET /pipeline board rollup. platform-tracking pure
  engine + sales_pipeline() (#255) + its asyncpg jobs store — no transition
  logic reimplemented. Stage events land on the contact activity timeline
  (type "stage"); dashboard activeDealsCount/pipelineValue are real.
- Evidence: pytest 51/51, mypy strict, ruff clean; deployed; live e2e:
  create deal (lead, ₱75k) → advance qualified → illegal jump to won 409 w/
  allowed [proposal, lost] → board (qualified 1/₱75k) → dashboard tiles →
  timeline shows "Deal started" + "Lead → Qualified". QA rows removed after.
- Next increments: contact-detail deal card + start-deal (mobile), pipeline
  board screen, auto-log quick actions + local follow-up notifications,
  tags management. Placement of #37 in crm/apps/api flagged for Sid.

## 2026-07-30 session — emulator e2e of v4 COMPLETE (post-WSL-restart)
- KVM live after restart (HUMAN-QUEUE §4 closed); AVD spike35 boots <1 min.
  Emulator DNS was dead under WSL2 — relaunch with `-dns-server 8.8.8.8` and
  `cmd wifi connect-network AndroidWifi open` fixed it (last session's
  "unconfirmed register" never reached the server; network was down).
- Full matrix pass against live api.bpconnect.app: **40 Pass / 7 Blocked / 9
  device-only** — statuses + notes written into docs/test-matrix.xlsx.
  Highlights: R8 v4 build exercised across every screen (SEC-03); auth incl.
  cold-start restore + expired-token single-flight refresh (AUTH-06/07);
  CD 409 → "Contact changed elsewhere — reloaded"; deals e2e incl. comma-peso
  parse, server-driven transitions, 409 allowedTransitions, lost-confirm,
  no-dup-on-offline-retry; pipeline rollups/repaint/empty; import preview→2
  imported; export formula-injection-safe; cleartext off; no JWT outside
  SecureStore; offline error+retry sweep.
- **Findings (new bugs/gaps)**:
  1. Scanner: ML Kit text model is Play-delivered (unbundled) — where GMS
     can't fetch it the app hangs forever on "Analysing card…" with no
     timeout/error/manual fallback (SCAN-03 note; blocked SCAN-04..08 on
     emulator). Consider bundled ML Kit model or a timeout → manual entry.
  2. Reminders: could NOT confirm scheduleFollowUpReminder ever registers a
     notification (no expo store, no alarm) even after permission grant +
     date change — suspect silent no-op in release build (try/catch masks
     it). REM-02/03 flagged for QA device pass (HUMAN-QUEUE §5).
  3. Minor: no sort control in Contacts UI (server supports ?sort=);
     resume-from-background doesn't refetch dashboard (nav focus does).
- e2e data cleaned from shared tenant: 29 contacts DELETEd via API (activity
  cascaded), 4 deal jobs removed via psql on grocery-db-1 (tables at 0).
  e2e account e2e-emu-1785412955@bluepointsolutions.dev kept for reuse
  (creds in .e2e-emu/e2e-email.txt; no account-delete API).
- Handoff: QA runs the 9 Device cases + re-checks 7 Blocked on a fleet A15
  per HUMAN-QUEUE §5 (rewritten with the reminder + scanner cautions).

## 2026-07-30 session — emulator e2e of v4 (superseded resume notes)
- Goal: emulated e2e of app-v4.apk against live api.bpconnect.app; on pass,
  hand APK to QA for real-device testing (supersedes agent device-test item;
  HUMAN-QUEUE §5 checklist still applies to QA).
- Done so far (software emulation, no KVM): AVD spike35 resized (4096M RAM,
  720x1280 — 1536M caused system_server watchdog kill-loop); app-v4.apk
  installed; **R8 release build boots to Login** (STATE Next item "verify
  minified build boots" = verified); register form filled + submitted, live
  register POST result unconfirmed at restart time. Local app-v4.apk sha256
  matches published update.json (bdd20be1…).
- Emulator QoL applied on the AVD: hide_error_dialogs=1, disabled
  wellbeing/quicksearchbox/vending (ANR storm under TCG), animations off.
- **User added to kvm group (done, pending WSL restart)** — HUMAN-QUEUE §4
  closes after restart. WSL restart queued behind grocery assembleRelease.
- Resume protocol (fresh session after restart): read `.e2e-emu/` (gitignored)
  — ui.sh adb driver (tap-by-text/content-desc, LAST-match default because RN
  repeats title+button labels), screenshots 01–09, e2e-email.txt (account may
  already exist server-side — delete or reuse). Relaunch: `emulator -avd
  spike35 -no-window -no-audio -no-snapshot` (NO -wipe-data: APK + tweaks
  persist; KVM should now engage → boot <1 min). Then rerun full e2e per
  docs/test-matrix.xlsx emulator-marked cases; clean e2e rows from shared
  tenant after (contacts have DELETE; deals need psql on box).
- docs/test-matrix.xlsx created (56 cases, Env column marks Emulator vs
  Device) — QA guide for the real-device pass.

## 2026-07-31 session — v1.2.0 findings fixed, v1.2.1 (versionCode 5) published
- PR #65 squash-merged (agent code review: no blocking findings; raw-error-object
  logging hardened to message-only on review note). Fixes:
  1. Scanner hang: new `parseCardImageSafe` (15s timeout + catch, never rejects);
     CardScannerReviewScreen falls back to manual entry with a banner when ML Kit
     can't deliver. 3 new tests.
  2. Reminders: `android.permission.SCHEDULE_EXACT_ALARM` added to app.json (Expo
     v56 docs require manual declaration for exact DATE triggers on Android 12+;
     config plugin doesn't add it — verified in the built AndroidManifest.xml);
     scheduleFollowUpReminder now reads the OS store back after scheduling
     (getAllScheduledNotificationsAsync) and returns false + warn-logs (id only,
     no PII) instead of phantom success; catch no longer silent. 8 new tests, incl.
     validating our trigger against the REAL expo-notifications SDK 56
     parseTrigger (jest.requireActual) — JS-side shape confirmed valid, so the
     emulator no-op was native-side; on-device confirmation rides HUMAN-QUEUE §5.
- Gates: tsc --noEmit clean, jest 46/46 (was 35).
- Evidence: 2026-07-31 · v1.2.1 (versionCode 5) release ·
  https://apk.bpconnect.app/update.json serves versionCode 5 / 1.2.1; published
  app-v5.apk sha256 matches local + manifest (6c10f09a…);
  bpconnect-crm-latest.apk sha matches; `api.bpconnect.app/health` ok; baked
  `api.bpconnect.app` URL confirmed inside the APK's JS bundle; versionCode 5 /
  versionName 1.2.1 in built gradle config. Debug-keystore signing unchanged
  (HUMAN-QUEUE §2) — publish from this machine only.

## Phase 2 — increments 2–4 + release (2026-07-29)
- Mobile deals shipped in three reviewed PRs (#60 deal card on ContactDetail,
  #61 Pipeline board screen + dashboard tile links, #62 quick-action auto-log
  + local follow-up reminders). Every advance/lost button renders from the
  server's allowedTransitions — no client-side stage graph. Reviews caught
  and fixed: stale-load races, duplicate-deal-on-error path, comma-decimal
  peso parsing, post-advance wrong-tab repaint, missing foreground
  notification handler. Gates each PR: tsc clean, jest 35/35.
- v1.2.0 (versionCode 4) published to apk.bpconnect.app — carries the deals
  UI AND the expo-notifications native module (reminders are inert on v3
  builds by design, try/catch no-op). Manifest sha verified against the
  staged APK (bdd20be1…); badging versionCode=4/1.2.0.
- Remaining Phase 2: tags/status/source management UI (increment 5), then
  the deferred offline-sync decision. On-device verification of v4 rides
  HUMAN-QUEUE §5 (now also: update prompt v2/v3→v4, notification permission
  + a reminder firing, deal flow on hardware).
