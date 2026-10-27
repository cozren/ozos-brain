#!/usr/bin/env bash
# Install the pre-commit gate into .git/hooks/ (symlink to the versioned script,
# so edits to the script take effect without re-installing).
set -euo pipefail

REPO=$(git rev-parse --show-toplevel)
chmod +x "$REPO/tools/test-pipeline/hooks/pre-commit.sh"
ln -sf ../../tools/test-pipeline/hooks/pre-commit.sh "$REPO/.git/hooks/pre-commit"
echo "✅ Installed pre-commit hook → tools/test-pipeline/hooks/pre-commit.sh"
echo "   The full test pipeline now runs before every commit."
