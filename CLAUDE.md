## OZOS Brain — engine

This repo is the **engine**: the OZOS Brain app, the generic tools and connectors,
and the `ozos` CLI. It holds **no company data**. Your data lives in a **vault**
(`vault/` by default, gitignored; or wherever `OZOS_VAULT` / `~/.ozos/config.json`
points). Create one with `./ozos init`.

**Never write company names, people, hostnames, card or dashboard IDs into this
repo; they belong in the vault.** `./ozos scrub-check` runs on every commit and
blocks the ones that do.

---

## graphify

A graphify knowledge graph is built at `graphify-out/` (gitignored, derived) over the
engine code **and** the in-checkout vault. It is rebuilt incrementally at session start.

Rules:
- Before answering any question about meetings, people, decisions, learnings, tools, or
  architecture — check `graphify-out/wiki/index.md` first, then raw files.
- When building/planning a feature: consult the wiki FIRST, then read the actual source
  files you intend to edit (the wiki is a summary and may be stale).
- After modifying code, run `graphify update .` (AST-only). The wiki is rebuilt by the
  skill: `/graphify . --update --wiki --no-viz` when the session-start hook says it is stale.
- After a substantial research answer, persist it: `graphify save-result --question "..."
  --answer "..." --type query --nodes <NodeLabel1> <NodeLabel2>`.

## Knowledge retrieval

Before grepping notes or docs, check `vault/.ozos/knowledge-tag-index.json` to jump to
candidate documents by tag; fall back to grep if the index is missing.

---

## Project Structure

```
app/                    — OZOS Brain: FastAPI backend (backend/) + React/Vite frontend (frontend/), tests in tests/ + backend/tests/
tools/                  — Generic tools; one directory each with a .tool-manifest.json and tests/
  test-pipeline/        — Runs every suite + renders the pass/fail board; holds the git hooks
  ozos-cli/             — The `ozos` command (init, scrub-check); `./ozos` at the root is its shim
  meeting-notes, daily-digest, intel-agents, youtube-xray, chatgpt-import, todo, scripts
connectors/             — Optional clients a vault may enable: metabase/, atlassian-goals/
skills/                 — Shared Python used by more than one tool: ozos_llm.py (LLM client), run_log.py; capture-learning skill
vault-template/         — What `ozos init` copies to create a new vault (example people, cycle, configs)
vault/                  — Your data (gitignored). Override with OZOS_VAULT or ~/.ozos/config.json
design-system/          — Visual design standards for the app
docs/                   — Engine specs and plans only; company specs live in each vault
.claude/                — Claude Code config: commands/, skills/, settings.json (hooks use $CLAUDE_PROJECT_DIR)
graphify-out/           — Derived knowledge graph (gitignored; never edit manually)
```

A vault looks like: `.ozos/` (vitals, knowledge sources, meeting routing, layouts,
setup state), `.env` (credentials), `people-hub/` (people YAML, cycles), `knowledge-hub/`
(notes, digests, learning), `docs/` (that company's PRDs and learnings).

## Conventions
- New tools go in `tools/<tool-name>/`; new optional clients in `connectors/<name>/`
- Tests go in the tool's own `tests/` — the pipeline discovers `app/`, `connectors/*`, `tools/*`, `skills/`
- Reusable Python goes in `skills/` once two tools need it
- Tools find the vault the same way the app does: `$OZOS_VAULT`, else `~/.ozos/config.json`, else `<engine>/vault`
- LLM calls go through `skills/ozos_llm.py` (`ANTHROPIC_API_KEY`, optional `OZOS_LLM_BASE_URL` / `OZOS_LLM_MODEL`)
- Before starting a task, check the vault's `docs/learnings.md`; when corrected, suggest a one-liner for it

## Testing & TDD (strict — this project enforces it)
- **TDD is mandatory** for new features, bug fixes, refactors, and behaviour changes: write the failing test FIRST, watch it fail for the right reason, then write the minimum code to pass.
- **Run the whole suite:** `python3 tools/test-pipeline/pipeline.py`. Done means `0 failing` AND no "NOT COLLECTED" warnings.
- **Use system `python3`**, never a repo `.venv`.
- **Tests never touch a real vault**: patch config paths or service-level `*_FILE` / `*_DIR` constants with `tmp_path`; never read `~/.ozos` or `vault/`.
- **No time-dependent tests:** compute "today" from `datetime.now()`, never hardcode it.
- **Refactor a behaviour → update its test in the same change.**
- **Every test file must be collected** (the pipeline flags any it cannot).
- **A bug fix starts with a failing test that reproduces the bug.**
- The **pre-commit hook** runs formatting checks, the full pipeline and `ozos scrub-check`. Never `--no-verify`.
- Install the gate once on a fresh clone: `bash tools/test-pipeline/hooks/install.sh`.
- Frontend: `cd app/frontend && npx tsc --noEmit && npx vitest run` (`npm run build` is not a gate).

## Commit Messages
- Format: `[tool-name] short description of what changed` (e.g. `[app] …`, `[meeting-notes] …`, `[engine] …`)

## API Keys & Secrets
- Never hardcode API keys, tokens, or secrets in any file; credentials live in the vault `.env`
- `.env`, `credentials.json`, `token.json`, `*service-account*.json`, `*-key.json` are gitignored before any code is written
- Before staging, scan for secrets: credential files gitignored and not staged
- If a secret is accidentally committed, stop and fix it: untrack, gitignore, scrub history with `git filter-repo`, rotate the credential
