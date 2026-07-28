#!/usr/bin/env bash
# Deploy the CRM production stack (api + apk server; postgres is shared with
# grocery over the external shared-db network) to the Contabo box.
#
#   bash scripts/deploy-contabo.sh
#
# Mirrors grocery's deploy-contabo.sh, minus the tunnel container: the box runs
# a host-level cloudflared (systemd, tunnel "crm") that already routes tunnel
# traffic to localhost:8000. One command, idempotent.
#
# Prereqs:
#   - key SSH to $CONTABO_HOST (default deploy@194.233.76.189, key in .env's
#     CONTABO_SSH_KEY_PATH)
#   - .env present locally (prod secrets incl. CRM_POSTGRES_PASSWORD)
#   - sibling ../library checkout (the api image builds platform-core/-tenancy
#     from it)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

die() { echo "✗ $*" >&2; exit 1; }

[ -f .env ] || die ".env missing — prod secrets"
[ -d ../library/packages ] || die "../library not found — sibling checkout required"

# shellcheck disable=SC1091
KEY="$(grep -E '^CONTABO_SSH_KEY_PATH=' .env | cut -d= -f2)"; KEY="${KEY/#\~/$HOME}"
HOST="${CONTABO_HOST:-$(grep -E '^CONTABO_SSH_USER=' .env | cut -d= -f2)@$(grep -E '^CONTABO_HOST=' .env | cut -d= -f2)}"
REMOTE="${REMOTE_DIR:-/home/deploy/factory}"
SSHOPT=(-i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes)

mkdir -p apk-dist   # APK publish dir (release-apk.sh fills it); must exist for the mount

echo "==> [1/4] sync crm + library to $HOST:$REMOTE"
ssh "${SSHOPT[@]}" "$HOST" "mkdir -p $REMOTE/crm $REMOTE/library && docker network inspect shared-db >/dev/null 2>&1 || docker network create shared-db"
rsync -az --delete -e "ssh ${SSHOPT[*]}" \
  --exclude '.git' --exclude 'node_modules' --exclude '**/.venv' \
  --exclude '**/__pycache__' --exclude '**/dist' --exclude '.expo' \
  --exclude '.env' --exclude '**/.env' \
  ./ "$HOST:$REMOTE/crm/"
rsync -az --delete -e "ssh ${SSHOPT[*]}" \
  --exclude '.git' --exclude 'node_modules' --exclude '**/.venv' --exclude '**/__pycache__' \
  ../library/ "$HOST:$REMOTE/library/"

echo "==> [2/4] sync secrets (.env)"
rsync -az -e "ssh ${SSHOPT[*]}" .env "$HOST:$REMOTE/crm/.env"
ssh "${SSHOPT[@]}" "$HOST" "chmod 600 $REMOTE/crm/.env"

echo "==> [3/4] stack up"
ssh "${SSHOPT[@]}" "$HOST" "cd $REMOTE/crm && docker compose -f docker-compose.contabo.yml up -d --build --remove-orphans"

echo "==> [4/4] smoke check"
sleep 5
ssh "${SSHOPT[@]}" "$HOST" "cd $REMOTE/crm && docker compose -f docker-compose.contabo.yml ps --format '{{.Name}}: {{.Status}}' && curl -fsS -m 10 http://localhost:8000/health && curl -fsS -m 10 -o /dev/null -w ' apk:%{http_code}' http://localhost:8081/"
echo
echo "✓ deployed — https://api.bpconnect.app / https://apk.bpconnect.app"
