#!/usr/bin/env bash
# Build + publish the CRM web app (Expo static web export of apps/mobile).
#
#   bash scripts/release-web.sh
#
# Pipeline (mirrors release-apk.sh, minus signing/versionCode — the web app
# has no install step, a fresh index.html IS the release):
#   1. expo export --platform web with the prod API URL baked in
#      (EXPO_PUBLIC_API_URL is read at bundle time)
#   2. copy the export into web-dist/
#   3. rsync web-dist/ to the box — the crm `web` nginx container serves it at
#      https://app.bpconnect.app (SPA fallback, hashed bundles immutable,
#      index.html no-store)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
DIST="$REPO_ROOT/web-dist"
API_URL="${WEB_API_URL:-https://api.bpconnect.app}"

die() { echo "✗ $*" >&2; exit 1; }
[ -f .env ] || die ".env missing"

echo "==> [1/3] expo export --platform web (API: $API_URL)"
(cd apps/mobile && EXPO_PUBLIC_API_URL="$API_URL" npx expo export --platform web)

echo "==> [2/3] stage web-dist/"
rm -rf "$DIST"
cp -r apps/mobile/dist "$DIST"

echo "==> [3/3] rsync to box"
KEY="$(grep -E '^CONTABO_SSH_KEY_PATH=' .env | cut -d= -f2)"; KEY="${KEY/#\~/$HOME}"
HOST="${CONTABO_HOST:-$(grep -E '^CONTABO_SSH_USER=' .env | cut -d= -f2)@$(grep -E '^CONTABO_HOST=' .env | cut -d= -f2)}"
REMOTE="${REMOTE_DIR:-/home/deploy/factory}"
SSHOPT=(-i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes)
rsync -az --delete -e "ssh ${SSHOPT[*]}" "$DIST/" "$HOST:$REMOTE/crm/web-dist/"

echo "✓ published — https://app.bpconnect.app"
