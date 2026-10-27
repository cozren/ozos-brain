#!/usr/bin/env bash
# PostToolUse hook (matcher: Edit|Write).
#
# After Claude edits a .py file under tools/, connectors/ or app/, run THAT suite and, if
# it's red, report the failure back into Claude's context. Non-blocking by design:
# TDD's red phase legitimately has failing tests, so this informs rather than gates.
# The hard gate lives in the pre-commit hook.
set -uo pipefail

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../../.." && pwd)}"
input=$(cat)

fp=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -n "$fp" ] || exit 0
case "$fp" in
  *.py) ;;
  *) exit 0 ;;
esac
# Map the edited file to its suite root: tools/<x>, connectors/<x>, or app
case "$fp" in
  "$REPO"/tools/*)      rel=${fp#"$REPO"/tools/};      tool=${rel%%/*}; tooldir="$REPO/tools/$tool" ;;
  "$REPO"/connectors/*) rel=${fp#"$REPO"/connectors/}; tool=${rel%%/*}; tooldir="$REPO/connectors/$tool" ;;
  "$REPO"/app/*)        tool="app";                    tooldir="$REPO/app" ;;
  *) exit 0 ;;
esac
[ -d "$tooldir" ] || exit 0

# Use system python3: it has every tool's deps (feedparser, fastapi, …) and is
# what run.sh launches the app with. The repo .venv is incomplete (see README).
PY=python3

summary=$(cd "$tooldir" && "$PY" -m pytest -q 2>&1 | grep -vi deprecat | tail -1)

if printf '%s' "$summary" | grep -qiE "failed|error"; then
  msg="⚠️ Tests for tool '$tool' are RED after this edit — $summary. If this isn't an intended TDD red step, fix before continuing."
  jq -cn --arg m "$msg" \
    '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$m}}'
fi
exit 0
