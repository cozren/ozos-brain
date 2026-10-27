Start the People Hub local app and open it in Chrome.

1. Kill any stale processes on ports 8765 and 5173:
```
lsof -ti :8765 | xargs kill -9 2>/dev/null; lsof -ti :5173 | xargs kill -9 2>/dev/null; sleep 0.5
```

2. Start the backend from the correct directory (must be app/ so package imports resolve):
```
cd "$CLAUDE_PROJECT_DIR/app" && uvicorn backend.main:app --port 8765 --reload > /tmp/people-hub-backend.log 2>&1 &
```

3. Start the frontend:
```
cd "$CLAUDE_PROJECT_DIR/app/frontend" && npm run dev > /tmp/people-hub-frontend.log 2>&1 &
```

4. Wait for both servers to be ready:
```
until curl -s http://localhost:8765/health > /dev/null 2>&1; do sleep 0.5; done
until curl -s http://localhost:5173 > /dev/null 2>&1; do sleep 0.5; done
```

5. Open Chrome:
```
open -a "Google Chrome" http://localhost:5173
```

6. Print: "✓ People Hub running — backend on :8765, frontend on :5173. Chrome opened."

Logs are at /tmp/people-hub-backend.log and /tmp/people-hub-frontend.log if anything looks wrong.
