# Human Queue — CRM

Batched human gates. Agents never act on these; exact instructions only.

## 1. Cloudflare API token expiry (now two tokens)
- Account token `a75bac4b…` (`CLOUDFLARE_API_TOKEN` in `.env`) expires **2026-08-25**.
- Agent-minted zone token `crm-agent-dns-bpconnect` (`CLOUDFLARE_DNS_TOKEN` in
  `.env`, DNS write on bpconnect.app only) expires the same day.

Before then: dashboard → Manage Account → API Tokens → roll/extend both, update
`.env` (deploy script re-syncs the box copy on next deploy).

## 2. Release keystore before any external APK distribution
`scripts/release-apk.sh` signs with the machine-local **debug keystore**
(`~/.android/debug.keystore`). Android refuses updates signed with a different
key, so: (a) all publishes must run from this machine, and (b) before
distributing outside the internal fleet, generate a real release keystore,
back it up, and wire it into the gradle signing config. Losing the signing key
strands every installed device on manual reinstall.

## 3. Semaphore sender name (blocks ALL SMS sending) — VERIFIED 2026-07-28
Confirmed empirically AND against Semaphore's published policy; there is no
workaround inside Semaphore:
- No sendername → "No active sender name found. Please apply…". Explicit
  `sendername=SEMAPHORE`/`Semaphore` → "The senderName supplied is not valid".
  The `/otp` endpoint fails identically. Account sender-name list is empty;
  account itself is fine (Active, ₱2,500 → 5,000 credits, PayPal).
- Root cause: **since 2024-07-01 Semaphore removed the shared default
  "Semaphore" sender** (anti-abuse); every account must register its own.
- Application (dashboard → Sender Names): needs a business association and a
  realistic sample message (no "test"-style names/samples); approval takes
  **up to 5 business days** → START THE CLOCK NOW (e.g. BPCONNECT).
- After approval: set `SEMAPHORE_SENDER_NAME` in crm/.env (+ grocery backend
  .env), redeploy, retry — attempts are logged in `crm_sms_log` (GET /sms).
- Interim: the mobile app's SMS quick action sends via the device SIM and is
  unaffected. Note other PH gateways (PhilSMS/iTexMo) enforce the same
  telco-level sender-ID registration — switching providers doesn't dodge this.

## 4. Local KVM for emulator verification — DONE 2026-07-30
`sigbin` is in the `kvm` group and `/dev/kvm` is accessible after the WSL
restart; emulator boots in under a minute. Closed.

## 5. QA device pass of v1.2.1 (versionCode 5) on a fleet A15
The emulator pass ran 2026-07-30 against v4 (40 Pass / 7 Blocked / 9
device-only — statuses + notes in `docs/test-matrix.xlsx`); both v4 findings
were fixed in v5 (PR #65, published 2026-07-31). QA should run the 9
Device-marked cases plus re-check the 7 Blocked ones **on v5**:
- Update loop: install v2/v3/v4 → update prompt to v5 → sha-verified download
  → OS installer → relaunch (UPD-01/03/04).
- Camera scan of a real card → ML Kit OCR (SCAN-02, and the emulator-blocked
  SCAN-03..08 flow through Review/consent/save/R2). v5 fix: where ML Kit can't
  deliver, the scanner now gives up after ~15s and drops to manual entry with
  a banner — if it still hangs on "Analysing card…", file it.
- Biometric unlock (AUTH-08), call + SIM-SMS quick actions (QA-01/03).
- **Reminders (REM-02/03) — extra care**: v5 declares SCHEDULE_EXACT_ALARM and
  verifies the OS registered the reminder (failures now warn in logcat, tag
  `[reminders]`). Set a follow-up for tomorrow, grant notification permission,
  and confirm a notification fires at 9am on the follow-up day. If not, file
  it as a v1.2.1 bug and attach any `[reminders]` logcat lines.
- Cold start ≤ ~4s (NF-01).

## 6. erp repo access + real CI (billing/seat issue — from turnover doc)
Sid's account can't see rinehardramos/erp / blue-point-solutions/erp
(rechecked Jul 28) and mobile CI is off pending the same billing fix. Fixing
billing unblocks the deals API (#37) and restores the CI merge gate. Also
still open from the turnover: Play Integrity (#54) is a question, and the
"backend lives in erp repo" pivot (PR #33) vs the live crm/apps/api deployment
needs a decision once access exists.

## 7. Grocery public hostname (decision)
`bpconnect.app` is active in the Cloudflare account and the **crm** tunnel is
routed (api/apk.bpconnect.app). Grocery's storefront still has
`grocery.infobroker.tech` URLs **baked at build time**. Decide: route grocery
under bpconnect.app (needs a storefront rebuild with new public URLs — an agent
can do it) or add infobroker.tech as a second zone. Then tell the agent.
