#!/bin/bash
# Run every ENABLED Intel Agent via run.py, one after another.
#
# launchd runs jobs with a minimal environment and PATH, so this script uses
# ABSOLUTE paths for both the repo and the Python interpreter, cd's into the
# repo so run.py can load the repo-root .env, and appends timestamped output to
# intel-agents.log. A per-agent failure is logged and does NOT abort the loop.
# Installed via ~/Library/LaunchAgents/com.ozos.intel-agents.plist.

set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON="${PYTHON:-python3}"
VAULT="$(cd "$REPO" && python3 -c "import sys; sys.path.insert(0, 'skills'); import ozos_vault; print(ozos_vault.vault_dir())")"
CONFIG="$VAULT/.ozos/intel-agents.json"
LOG="$REPO/tools/intel-agents/intel-agents.log"

cd "$REPO" || { echo "$(date '+%F %T %z') cannot cd to $REPO" >> "$LOG"; exit 1; }

echo "===== $(date '+%F %T %z') intel-agents run-all starting =====" >> "$LOG"

if [ ! -f "$CONFIG" ]; then
  echo "$(date '+%F %T %z') config not found: $CONFIG" >> "$LOG"
  echo "===== $(date '+%F %T %z') finished (no config) =====" >> "$LOG"
  exit 1
fi

# Enabled agent ids, one per line (uses the repo python + stdlib json).
AGENT_IDS=$("$PYTHON" - "$CONFIG" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    cfg = json.load(f)
for a in cfg.get("agents", []):
    if a.get("enabled"):
        print(a["id"])
PY
)

overall=0
for id in $AGENT_IDS; do
  echo "----- $(date '+%F %T %z') running agent: $id -----" >> "$LOG"
  if "$PYTHON" tools/intel-agents/run.py "$id" >> "$LOG" 2>&1; then
    echo "----- $(date '+%F %T %z') agent $id OK -----" >> "$LOG"
  else
    status=$?
    echo "----- $(date '+%F %T %z') agent $id FAILED (exit $status) -----" >> "$LOG"
    overall=1
    # Do NOT abort — continue with the next agent.
  fi
done

echo "===== $(date '+%F %T %z') finished (exit $overall) =====" >> "$LOG"
exit "$overall"
