#!/bin/bash
# Append a session summary to the VAULT's learnings log and commit it there.
set -euo pipefail
ENGINE="$(cd "$(dirname "$0")/../.." && pwd)"
VAULT="$(cd "$ENGINE" && python3 -c "import sys; sys.path.insert(0, 'skills'); import ozos_vault; print(ozos_vault.vault_dir())")"

read -p "Enter a short session summary (or press Enter to skip): " summary

if [ -n "$summary" ]; then
  mkdir -p "$VAULT/docs"
  timestamp=$(date "+%Y-%m-%d %H:%M")
  printf '\n## Session Save — %s\n%s\n' "$timestamp" "$summary" >> "$VAULT/docs/learnings.md"
  if git -C "$VAULT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$VAULT" add docs/learnings.md && git -C "$VAULT" commit -q -m "session save: $(date '+%Y-%m-%d')" || true
  fi
fi

echo ""
echo "✅ Session saved to $VAULT/docs/learnings.md. Safe to clear context."
