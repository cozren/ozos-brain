#!/bin/bash
# Wrapper for running the daily digest under launchd (or any scheduler).
#
# launchd runs jobs with a minimal environment and PATH, so this script uses
# ABSOLUTE paths for both the repo and the Python interpreter, cd's into the
# repo so digest.py can load the repo-root .env, and appends timestamped output
# to digest.log. Installed via ~/Library/LaunchAgents/com.ozos.daily-digest.plist.

set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON="${PYTHON:-python3}"
LOG="$REPO/tools/daily-digest/digest.log"

cd "$REPO" || { echo "$(date '+%F %T %z') cannot cd to $REPO" >> "$LOG"; exit 1; }

echo "===== $(date '+%F %T %z') daily-digest starting =====" >> "$LOG"
"$PYTHON" tools/daily-digest/digest.py >> "$LOG" 2>&1
status=$?
echo "===== $(date '+%F %T %z') finished (exit $status) =====" >> "$LOG"
exit "$status"
