# OZOS Brain — the app

FastAPI backend (`backend/`) + React/Vite frontend (`frontend/`). This is the OZOS
command center: one brain for people, meetings, knowledge, goals, data and agents.

All user data lives in the **vault** (see the repo README): `backend/config.py`
resolves it (`$OZOS_VAULT`, then `~/.ozos/config.json`, then `<engine>/vault`) and
every service reads and writes under it. The engine itself holds no company data.

## Run

```bash
bash app/run.sh          # backend on :8765 (/api), frontend on :5173, opens Chrome
```

The backend starts without `--reload` from `run.sh`'s uvicorn call only if you
remove the flag; by default it reloads on edit.

## Pages

| Page | What it is |
|---|---|
| Home | Brain visual, greeting (name from `ozos init`), vitals at a glance |
| People Hub | People YAML under `<vault>/people-hub/`, review cycles, documents |
| Knowledge Hub | Folder tree over `<vault>/knowledge-hub/` sources, tags, stars, preview |
| Setup | The onboarding checklist: connect sources, add stakeholders, pick a review cycle (`/api/setup`) |
| Goals & Tasks | Goals by hand or synced from Atlassian (`/api/goals`, `<vault>/.ozos/goals.json`), each bindable to a data point, plus personal tasks |
| Data Hub | User-defined tabs of tiles showing data points (`/api/datapoints`, `<vault>/.ozos/datapoints.json`, values cached in `.ozos/datapoint-cache/`) |
| Reporting | Daily digest, meeting notes archive, intel agents |
| Control Tower / System Health | Vitals, MCPs, commands, hooks, test board |
| Floating chat | Claude tool loop over the vault (people, notes, Confluence) |

## Tests

```bash
cd app && python3 -m pytest -q
cd app/frontend && npx tsc --noEmit && npx vitest run
```

Backend tests must never touch a real vault: patch `config` paths or the
service-level `*_FILE` / `*_DIR` constants with `tmp_path`.

## Formatting

Python: `python3 -m ruff format app/`. Frontend: `cd app/frontend && npm run format`
(prettier). The pre-commit hook blocks drift in both.
