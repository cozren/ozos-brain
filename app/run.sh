#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo "Starting OZOS Brain..."

# Pre-populate MCP list (must run here, in terminal context, to include remote claude.ai MCPs)
echo "Syncing MCP list..."
CLAUDE_BIN="$HOME/.local/bin/claude"
if [ -x "$CLAUDE_BIN" ]; then
  "$CLAUDE_BIN" mcp list > /tmp/ozos-mcp-list.txt 2>&1 || true
  echo "MCP list cached ($(wc -l < /tmp/ozos-mcp-list.txt) lines)"
fi

# Start backend (must run from app/ so relative package imports resolve)
cd "$SCRIPT_DIR"
uvicorn backend.main:app --port 8765 --reload &
BACKEND_PID=$!

# Start frontend (dev mode)
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID  Frontend PID: $FRONTEND_PID"

# Wait for frontend to be ready, then open Chrome
(
  echo "Waiting for frontend..."
  until curl -s http://localhost:5173 > /dev/null 2>&1; do sleep 0.5; done
  echo "Opening Chrome..."
  open -a "Google Chrome" http://localhost:5173
) &

# Kill both on Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
