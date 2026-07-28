# Project State — CRM

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
  401 unauthenticated (route live, Semaphore gateway built at startup). Live SMS
  send untested (no target number; costs credits) — verify on first real use.
- 2026-07-28 · APK release v1.0.0 (versionCode 2) · public
  `https://apk.bpconnect.app/update.json` served; `app-v2.apk` downloaded (104 MB)
  and sha256 matches manifest
  (`c94772632c4930943ada47f0a8b60a5507784a248328b4436b5769e739d86be3`);
  `bpconnect-crm-latest.apk` 200.

## Next
- Device-test the update loop on a fleet A15: install v2 APK, publish v3, confirm
  prompt → download → OS installer → relaunch (cannot be CI-tested).
- Feature work: card scan endpoints (R2 storage via platform-storage-r2) per docs/05-api.md.
- Set `CRM_CORS_ORIGINS` when a browser-based client appears (mobile app doesn't need it).

## Blockers
- None mechanical. Human gates: token expiry 2026-08-25, release keystore, grocery
  hostname decision (HUMAN-QUEUE.md).
