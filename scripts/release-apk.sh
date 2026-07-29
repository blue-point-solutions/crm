#!/usr/bin/env bash
# Build + publish a sideloaded Android release of the CRM mobile app.
#
#   bash scripts/release-apk.sh ["release notes"]        # bumps versionCode
#   BUMP=0 bash scripts/release-apk.sh ["release notes"] # keep current versionCode
#
# Pipeline (mirrors schedule's app-self-update design):
#   1. bump android.versionCode in apps/mobile/app.json (the update check is
#      purely versionCode-based — it must increment every published build)
#   2. expo prebuild + gradlew assembleRelease with the prod API URL baked in
#      (EXPO_PUBLIC_API_URL is read at JS-bundle time)
#   3. copy app-v<N>.apk into apk-dist/, write update.json (sha256, notes)
#   4. rsync apk-dist/ to the box — the crm `apk` nginx container serves it at
#      https://apk.bpconnect.app (update.json + APKs, Cache-Control: no-store)
#
# SIGNING CONSTRAINT: Android only installs an update signed with the SAME key
# as the installed build. Expo's generated gradle signs release builds with the
# debug keystore (~/.android/debug.keystore) — fine for the internal fleet, but
# every publish must happen from a machine with that same keystore. A real
# release keystore is a queued human gate before any external distribution.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
NOTES="${1:-}"
APP_JSON=apps/mobile/app.json
DIST="$REPO_ROOT/apk-dist"

die() { echo "✗ $*" >&2; exit 1; }
[ -f .env ] || die ".env missing"

if [ "${BUMP:-1}" = "1" ]; then
  node -e "
    const fs = require('fs');
    const j = JSON.parse(fs.readFileSync('$APP_JSON', 'utf8'));
    j.expo.android.versionCode += 1;
    fs.writeFileSync('$APP_JSON', JSON.stringify(j, null, 2) + '\n');
    console.log('==> versionCode bumped to ' + j.expo.android.versionCode);"
fi
VCODE=$(node -p "require('./$APP_JSON').expo.android.versionCode")
VNAME=$(node -p "require('./$APP_JSON').expo.version")

echo "==> [1/4] build v$VNAME (versionCode $VCODE)"
(
  cd apps/mobile
  export EXPO_PUBLIC_API_URL=https://api.bpconnect.app
  npx expo prebuild --platform android --no-install
  cd android && ./gradlew --quiet assembleRelease
)
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
[ -f "$APK" ] || die "build produced no APK at $APK"

echo "==> [2/4] stage apk-dist/"
mkdir -p "$DIST"
cp "$APK" "$DIST/app-v$VCODE.apk"
cp "$APK" "$DIST/bpconnect-crm-latest.apk"   # stable URL for first installs
SHA=$(sha256sum "$DIST/app-v$VCODE.apk" | cut -d' ' -f1)

echo "==> [3/4] write update.json"
node -e "
  const fs = require('fs');
  let min = 1;
  try { min = JSON.parse(fs.readFileSync('$DIST/update.json', 'utf8')).minVersionCode ?? 1; } catch {}
  fs.writeFileSync('$DIST/update.json', JSON.stringify({
    versionCode: $VCODE,
    versionName: '$VNAME',
    apkUrl: 'https://apk.bpconnect.app/app-v$VCODE.apk',
    sha256: '$SHA',
    minVersionCode: min,
    mandatory: false,
    notes: ${NOTES@Q},
  }, null, 2) + '\n');"

echo "==> [4/4] publish to box"
KEY="$(grep -E '^CONTABO_SSH_KEY_PATH=' .env | cut -d= -f2)"; KEY="${KEY/#\~/$HOME}"
HOST="$(grep -E '^CONTABO_SSH_USER=' .env | cut -d= -f2)@$(grep -E '^CONTABO_HOST=' .env | cut -d= -f2)"
rsync -az -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  "$DIST/" "$HOST:/home/deploy/factory/crm/apk-dist/"

echo "✓ published v$VNAME ($VCODE) — https://apk.bpconnect.app/update.json"
echo "  install URL: https://apk.bpconnect.app/bpconnect-crm-latest.apk"
