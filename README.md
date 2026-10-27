# OZOS Brain

A personal operating system for product leaders, built on Claude Code: one local
brain for your people, meetings, knowledge, goals and data. It syncs meeting notes,
keeps a knowledge graph, tracks review cycles and personal tasks, runs daily
digests and intel agents, and gives you a chat that can read all of it.

https://github.com/user-attachments/assets/d752f9cd-4c36-4aa4-b760-04267fc0b7da

OZOS is **app + vault**. This repo is the engine. Everything about a particular
company — people, notes, credentials, dashboards, routing rules — lives in a
separate **vault** folder that the engine points at. Change jobs, start a new
vault, keep the engine.

## Quick start

Starting at a new company? Follow **[docs/SETUP.md](docs/SETUP.md)**, the day-one
guide: prerequisites, `ozos init`, where the vault lives, connecting each source,
adding people, and what to do when something is not wired yet.

```bash
git clone https://github.com/cozren/ozos-brain.git && cd ozos-brain
pip3 install -r requirements.txt
(cd app/frontend && npm ci)
./ozos init                 # creates vault/ from vault-template/, writes ~/.ozos/config.json and vault/.env
./ozos setup                # the onboarding checklist in the terminal (the app has it as the Setup page)
bash tools/test-pipeline/hooks/install.sh   # pre-commit: tests + scrub check
bash app/run.sh             # backend :8765, frontend :5173, opens the app
```

You need Python 3.12+, Node 20+, and an Anthropic API key (or an Anthropic-compatible
proxy URL from your employer: set `OZOS_LLM_BASE_URL` in the vault `.env`).

## App + vault

| | Engine (this repo) | Vault (yours, per company) |
|---|---|---|
| Holds | app, tools, connectors, CLI, templates | people YAML, meeting notes, knowledge, `.ozos/` config, `.env` |
| Git | public-ready; `ozos scrub-check` blocks company terms | private repo, or just a folder |
| Where | wherever you clone it | `vault/` inside the engine by default; `OZOS_VAULT` or `~/.ozos/config.json` to point elsewhere |

`vault-template/` shows the full shape of a vault with example wording only.

## Layout

```
app/              OZOS Brain — FastAPI backend + React/Vite frontend
tools/            generic tools (meeting-notes, daily-digest, intel-agents, youtube-xray, chatgpt-import, todo, test-pipeline, ozos-cli)
connectors/       optional clients a vault can enable (metabase, atlassian-goals)
skills/           shared Python (ozos_llm.py, run_log.py) and Claude skills
vault-template/   seed for a new vault
docs/             engine specs and plans; docs/connectors/ holds per-source setup guides
```

## Tests and formatting

TDD is mandatory (see `CLAUDE.md`). The whole suite:

```bash
python3 tools/test-pipeline/pipeline.py
cd app/frontend && npx tsc --noEmit && npx vitest run
```

Format with `python3 -m ruff format tools/ skills/ app/ connectors/` and
`cd app/frontend && npm run format`. The pre-commit hook blocks drift, red tests,
uncollected tests, and any forbidden term found by `./ozos scrub-check`.

## Status

Phase 2 of the extraction is in: the engine runs against an empty vault and the
**Setup page** (plus `/ozos-setup` and `./ozos setup`) is the living checklist for
connecting sources, adding stakeholders and choosing a review cycle, with a progress badge
and cadence reminders on Home. Data Hub and Goals are still empty states. Next up: goals
(Phase 3), data points for the Data Hub (Phase 4), and the public README (Phase 5).

## License

MIT — see `LICENSE`.
