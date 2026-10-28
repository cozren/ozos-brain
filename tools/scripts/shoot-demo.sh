#!/usr/bin/env bash
# Reproduce the README screenshots from the demo vault.
#
#   bash tools/scripts/shoot-demo.sh [SCRATCH_DIR]
#
# Boots the backend and the Vite dev server against a throwaway copy of vault-demo/
# under SCRATCH_DIR (default: a fresh mktemp dir), with HOME pointed at a throwaway
# folder so ~/.ozos is never touched, shoots the six pages at 1280x900 into
# docs/images/, and stops both servers. Needs Playwright's chromium and the
# design-audit shoot script ($SHOOT, default ~/.claude/skills/design-audit/shoot.py).
set -euo pipefail

ENGINE=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRATCH=${1:-$(mktemp -d)}
SHOOT=${SHOOT:-$HOME/.claude/skills/design-audit/shoot.py}
DEMO_HOME="$SCRATCH/demo-home"
VAULT="$SCRATCH/vault-demo-run"
OUT="$ENGINE/docs/images"

rm -rf "$DEMO_HOME" "$VAULT"
mkdir -p "$DEMO_HOME" "$OUT"
(cd "$ENGINE" && HOME="$DEMO_HOME" ./ozos init --demo --vault "$VAULT" >/dev/null)

(cd "$ENGINE/app" && HOME="$DEMO_HOME" OZOS_VAULT="$VAULT" python3 -m uvicorn backend.main:app --port 8765 >"$SCRATCH/backend.log" 2>&1) &
BACKEND=$!
(cd "$ENGINE/app/frontend" && npm run dev >"$SCRATCH/frontend.log" 2>&1) &
FRONTEND=$!
trap 'kill $BACKEND $FRONTEND 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  curl -sf http://localhost:8765/api/me >/dev/null && curl -sf http://localhost:5173 >/dev/null && break
  sleep 1
done

shoot() { # page-id file-name [extra shoot.py args]
  local page=$1 name=$2; shift 2
  python3 "$SHOOT" "http://localhost:5173/?page=$page" "$OUT/$name.png" \
    --width 1280 --height 900 --no-full-page --wait-ms 4500 "$@"
}
shoot home home
shoot setup setup
shoot people-hub people
shoot goals-tasks goals
shoot data-hub data-hub
shoot knowledge-hub knowledge-hub \
  --click "text=MEETING NOTES" --click "text=Leadership" --click "text=q4-planning" --click-wait 1800
echo "screenshots written to $OUT"
