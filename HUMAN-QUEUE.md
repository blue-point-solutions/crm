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

## 3. Semaphore sender name (blocks ALL SMS sending)
Live test 2026-07-28 to +639157661766: Semaphore rejects every send with
"No active sender name found. Please apply for a sender name before sending
messages." — the account (79422, 5010 credits) cannot use even the default
sender until one is approved. Dashboard → Sender Names → apply (e.g.
BPCONNECT); approval usually takes days. Then set `SEMAPHORE_SENDER_NAME` in
crm/.env (and grocery's backend .env), redeploy, and retry — every attempt is
already logged in `crm_sms_log` (GET /sms) for verification.

## 4. Grocery public hostname (decision)
`bpconnect.app` is active in the Cloudflare account and the **crm** tunnel is
routed (api/apk.bpconnect.app). Grocery's storefront still has
`grocery.infobroker.tech` URLs **baked at build time**. Decide: route grocery
under bpconnect.app (needs a storefront rebuild with new public URLs — an agent
can do it) or add infobroker.tech as a second zone. Then tell the agent.
