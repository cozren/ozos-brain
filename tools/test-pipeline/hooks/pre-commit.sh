#!/usr/bin/env bash
# Pre-commit gate.
#
# The full test pipeline must be green AND have no uncollected test files, or the
# commit is blocked. This is the hard "code can't skip tests" enforcement.
# Emergency bypass: git commit --no-verify
set -uo pipefail

REPO=$(git rev-parse --show-toplevel)
# Use system python3: it has every tool's deps (feedparser, fastapi, …) and is
# what run.sh launches the app with. The repo .venv is incomplete (see README).
PY=python3

echo "[pre-commit] Checking formatting…"
"$PY" -m ruff format --check "$REPO/tools" "$REPO/skills" "$REPO/app" "$REPO/connectors" --quiet
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ [pre-commit] Python formatting drift — commit BLOCKED."
  echo "   Fix:  python3 -m ruff format tools/ skills/ app/ connectors/"
  exit 1
fi
(cd "$REPO/app/frontend" && npx --no-install prettier --check src >/dev/null 2>&1)
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ [pre-commit] Frontend formatting drift — commit BLOCKED."
  echo "   Fix:  cd app/frontend && npm run format"
  exit 1
fi

echo "[pre-commit] Running test pipeline…"
"$PY" "$REPO/tools/test-pipeline/pipeline.py" 2>&1 | grep -vi deprecat
code=${PIPESTATUS[0]}

if [ "$code" -ne 0 ]; then
  echo ""
  echo "❌ [pre-commit] Tests failing or test files not being collected — commit BLOCKED."
  echo "   Inspect:  python3 tools/test-pipeline/pipeline.py --html /tmp/board.html"
  echo "   Bypass (emergency only):  git commit --no-verify"
  exit 1
fi

echo "[pre-commit] Scrub check (no company terms in the engine)…"
"$PY" "$REPO/ozos" scrub-check
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ [pre-commit] Forbidden terms found — commit BLOCKED. Remove them (they belong in the vault)."
  exit 1
fi

echo "✅ [pre-commit] All tests green and scrub check clean — commit allowed."
exit 0
