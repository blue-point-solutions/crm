#!/usr/bin/env bash
# Bootstrap a machine to join the CRM build fleet. Idempotent — safe to re-run.
#   usage:  bash scripts/bootstrap-machine.sh <MACHINE_ID>      # e.g. M2
# Sets up: gh auth check, uv, the library + crm repos as SIBLINGS, and the machine id.
set -euo pipefail

MID="${1:-}"
if [ -z "$MID" ]; then
  echo "usage: bash scripts/bootstrap-machine.sh <MACHINE_ID>   (e.g. M2, M3)" >&2
  exit 2
fi
PROJECTS="${CRM_PROJECTS_DIR:-$HOME/projects}"
echo "== CRM fleet bootstrap — machine '$MID' into $PROJECTS =="

# 1. Required tooling
command -v git >/dev/null || { echo "ERROR: install git" >&2; exit 1; }
command -v gh  >/dev/null || { echo "ERROR: install GitHub CLI — https://cli.github.com" >&2; exit 1; }
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run:  gh auth login   (use the shared rinehardramos token)" >&2
  exit 1
fi
gh auth setup-git >/dev/null 2>&1 || true   # let git push over https with the gh token
if ! command -v uv >/dev/null 2>&1; then
  echo "-- installing uv -> ~/.local/bin"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# 2. Clone the library + crm as siblings (editable path deps expect ../../../library)
mkdir -p "$PROJECTS"
clone_or_fetch() {  # $1 = owner/repo   $2 = dir
  if [ -d "$PROJECTS/$2/.git" ]; then
    echo "-- $2 present; fetching latest"
    git -C "$PROJECTS/$2" fetch -q origin && git -C "$PROJECTS/$2" pull --ff-only -q 2>/dev/null || true
  else
    echo "-- cloning $1 -> $PROJECTS/$2"
    gh repo clone "$1" "$PROJECTS/$2"
  fi
}
clone_or_fetch rinehardramos/library      library
clone_or_fetch blue-point-solutions/crm   crm

# 3. Record the machine id (gitignored)
echo "$MID" > "$PROJECTS/crm/.machine-id"

# 4. Sanity
[ -f "$PROJECTS/library/PACKAGES.md" ] && echo "-- library catalog present (PACKAGES.md) ✓"
echo
echo "== ready =="
echo "Set your identity for this shell session:"
echo "    export CRM_MACHINE_ID=$MID"
echo "Then start the agent with the prompt in: crm/prompts/agent-bootstrap.md"
echo "(continuous operation: use /loop with the loop body — see that file)"
