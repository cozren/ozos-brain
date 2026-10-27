# Setting up OZOS at a new company

This is the day-one guide. It takes you from a blank laptop to a running OZOS Brain
with your own vault, and then through connecting sources one at a time over your
first weeks. Nothing here has to be finished in one sitting: every step is
independent, and the app runs fine with most of them still open.

Two ideas to keep in mind:

- **Engine vs vault.** This repo is the engine (code). Your vault is a separate folder
  with your data for this company: people, meeting notes, knowledge, credentials,
  runtime config. The engine never holds company data; `./ozos scrub-check` blocks
  commits that try.
- **Partial is normal.** Connect what you have today. Add stakeholders as you meet
  them. Come back to this guide whenever something new appears.

---

## 0. Before you leave the old company

Carry exactly three things:

1. This engine repo (it is on GitHub, nothing to do).
2. Your previous vault or archive repo, if your contract lets you keep it. Keep it
   **private forever**.
3. The scrub term list. It is the list of names, hosts and IDs that must never appear
   in the engine. It lives at `~/.ozos/scrub-terms.txt` on the old machine and is
   usually also committed in the old archive repo at `.ozos/scrub-terms.txt`.

Do **not** carry the old `.env`, OAuth token files, or service-account keys. Those
are the old employer's credentials.

---

## 1. New machine: prerequisites

| Need | Why | Check |
|---|---|---|
| Python 3.12+ | backend, tools, CLI | `python3 --version` |
| Node 20+ and npm | frontend | `node --version` |
| git | both repos | `git --version` |
| Claude Code | sessions, `/sync-notes`, intel agents | `claude --version` |
| ripgrep | the chat's project search | `rg --version` (`brew install ripgrep`) |
| graphify (optional) | knowledge graph over code + vault | `graphify --version` |
| Google Chrome (optional) | `app/run.sh` opens it | |

An Anthropic API key, or the URL and key of an Anthropic-compatible proxy if the new
employer provides one.

---

## 2. Install the engine (10 minutes)

```bash
git clone https://github.com/cozren/ozos-brain.git ~/Developer/ozos-brain
cd ~/Developer/ozos-brain
pip3 install -r requirements.txt
(cd app/frontend && npm ci)
```

Create your vault and user config. The scrub list argument is the file from step 0:

```bash
./ozos init --scrub-terms /path/to/scrub-terms.txt
```

It asks for your name, a short id (used as your person id), where the vault should
live (default `vault/` inside the engine), your API key, an optional proxy URL and
model, and one line describing your writing voice (used by intel agents). It writes
`~/.ozos/config.json`, creates the vault from `vault-template/`, and writes the
vault's `.env`.

Install the git gate and start the app:

```bash
bash tools/test-pipeline/hooks/install.sh
bash app/run.sh
```

The app opens at http://localhost:5173. Expect: a greeting with your name, one
example person in People Hub, empty Knowledge Hub folders, and empty states on Data
Hub and Goals. That is correct for a fresh vault.

Running `ozos init` again on the same machine for a *different* vault is refused
unless you pass `--force`, so you cannot repoint your config by accident.

---

## 3. Decide where the vault lives and whether it is a repo

Three options, pick one:

- **Private GitHub repo** (your account): `cd vault && git init && gh repo create
  <you>/ozos-vault-<company> --private --source=. --push`. The template already has a
  `.gitignore` that keeps `.env`, tokens and keys out.
- **Plain folder**, backed up to the company drive. Many employers forbid company
  data on personal GitHub. The engine does not care.
- **Somewhere other than `vault/`**: put the path in `~/.ozos/config.json` (`ozos
  init` asks for it) or export `OZOS_VAULT=/path`. The app and every tool resolve the
  vault the same way: `$OZOS_VAULT`, then `~/.ozos/config.json`, then `<engine>/vault`.

Whatever you choose, the engine checkout stays a clean public-ready repo.

---

## 4. Credentials (vault/.env)

Open `<vault>/.env`. `ozos init` already wrote the LLM lines. Add the rest as you
enable each source; `<vault>/.env.example` lists them with comments.

| Variable | For |
|---|---|
| `ANTHROPIC_API_KEY` | everything that talks to Claude (required) |
| `OZOS_LLM_BASE_URL`, `OZOS_LLM_MODEL` | optional proxy and model override |
| `ATLASSIAN_EMAIL`, `ATLASSIAN_TOKEN`, `ATLASSIAN_SUBDOMAIN` | Confluence search in the chat |
| `ATLASSIAN_ORG_ID`, `ATLASSIAN_CLOUD_ID` | the Atlassian Goals connector |
| `METABASE_URL` + `METABASE_API_KEY` (or username/password) | the Metabase connector |

Never put any of these in the engine. Never commit `.env`.

---

## 5. Connect sources, one at a time

Until the Setup page ships (see section 9), connecting a source means editing a JSON
file in `<vault>/.ozos/` and, for Google, running one auth command. Order below is
the recommended one for a new job; skip anything the company does not use.

### 5.1 Meeting notes from Gemini (Gmail)

1. In Google Cloud, create an OAuth client (Desktop app) for your **new** Google
   account, download the JSON and save it as `~/.gdrive-credentials.json`.
2. Authorise once: `python3 tools/meeting-notes/sync_gemini_notes.py --auth`. The
   token lands in `~/.config/ozos/meeting-notes-token.json`.
3. Run it: `python3 tools/meeting-notes/sync_gemini_notes.py`. Notes arrive under
   `<vault>/knowledge-hub/meeting-notes/<folder>/`.

The SessionStart hook runs this sync every time you open Claude Code here. Before
step 1 it prints one line, "Gmail not configured", and moves on.

**Mirror notes into a Google Drive folder (optional).** Set
`"drive_parent_folder_id": "<folder id>"` in `<vault>/.ozos/meeting-routing.json`
and run `--auth` again (the scope widens from read-only to full Drive).

### 5.2 Meeting notes from Granola

Nothing to configure. In a Claude Code session run `/sync-notes`; it fetches
Granola meetings through the MCP and feeds them to the same pipeline.

### 5.3 Routing: which folder a note lands in

`<vault>/.ozos/meeting-routing.json` (a commented example sits next to it):

```json
{
  "folders": ["Growth team", "Platform team", "Leadership", "Other"],
  "default_folder": "Other",
  "person_folders": { "pat@newco.com": "Pat Example" },
  "group_rules": [
    { "folder": "Leadership", "members": ["pat", "sam", "you"], "min_present": 3 }
  ],
  "drive_parent_folder_id": null,
  "tagging_guide": "Tag product talk as <Product>/<topic>; tag people as <Team>/<FirstName>."
}
```

- `folders`: the categories the LLM may pick from. Start with teams you already know.
- `person_folders`: attendee email → a virtual folder that collects every meeting
  that person was invited to.
- `group_rules`: when at least `min_present` of these first names are in a meeting,
  the note is rerouted to that folder (your leadership team, for example).
- `tagging_guide`: free text appended to the tagging prompt as you learn the
  company's teams, products and people.

### 5.4 Confluence, Notion, wikis

Confluence search works in the chat once the three `ATLASSIAN_*` variables are set.
For any documentation you can export as Markdown or PDF, drop it into a folder
under `<vault>/knowledge-hub/` and it appears in the Knowledge Hub. Register the
folder in `<vault>/.ozos/knowledge-sources.json` only if it is outside
`knowledge-hub/` (the template already registers `docs/`).

### 5.5 Goals

The Atlassian Goals connector is wired as a project MCP server (`.mcp.json`) and
needs `ATLASSIAN_ORG_ID` and `ATLASSIAN_CLOUD_ID`. A Goals page in the app arrives
with Phase 3.

### 5.6 Daily digest and intel agents

- **Daily digest** runs on demand with `python3 tools/daily-digest/digest.py`
  (or `/daily-digest`). To schedule it, copy
  `tools/daily-digest/com.ozos.daily-digest.plist` to `~/Library/LaunchAgents/`
  and replace the `/ABSOLUTE/PATH/TO/...` placeholders.
- **Intel agents** read `<vault>/.ozos/intel-agents.json`. Edit the example agent
  (set `"enabled": true`), set `voice_text` to how you write, and run `/intel-run
  <agent-id>` in a session, or `python3 tools/intel-agents/run.py <agent-id>` (uses
  the `claude` CLI for web search).

### 5.7 Data (Metabase)

Set the `METABASE_*` variables. The connector is a read-only client you can call
from scripts and the chat; the Data Hub stays an empty canvas until data points
arrive in Phase 4.

---

## 6. Add people as you meet them

For each person you manage or work closely with:

1. Create `<vault>/people-hub/people/<id>/meta.yaml` (copy
   `example-report/meta.yaml`; the folder name is the id). Or use **People Hub →
   Add person** in the app.
2. Add them to `meeting-routing.json`: their email under `person_folders`, and
   their team under `folders` if it is new.
3. Delete the `example-report` folder once you have a real person.

Expect this to take a month. The app is fine with two people today and twenty later.

---

## 7. Review cycle

`<vault>/people-hub/cycles.yaml` holds an example cycle with empty dates. If the
company has a review cycle, rename it and fill in the stage dates. If it does not,
leave the example as a reminder of the recommended default: a monthly 1:1 note check
and a quarterly written reflection per report. Guided cycle setup arrives in Phase 3.

---

## 8. Daily use

| Do | How |
|---|---|
| Start the app | `bash app/run.sh` (or `/ozos-brain` in Claude Code) |
| Sync notes from both sources | `/sync-notes` in a Claude Code session |
| Save a session summary | `/save-session` (writes to the vault's `docs/learnings.md`) |
| Commit engine changes | `/git`; the pre-commit gate runs tests and the scrub check |
| Keep the term list current | add new names, hosts and IDs to `~/.ozos/scrub-terms.txt` the day you learn them |

---

## 9. What is not here yet

The Setup page in the app, with a grouped checklist of everything above and a
`/ozos-setup` skill that walks you through one item at a time, is Phase 2 of the
design. Until then this file is the checklist. Phases 3 to 5 add guided review-cycle
setup, goals, data points for the Data Hub, and the public README.

---

## 10. Troubleshooting

- **"Gmail not configured" at session start** — expected until 5.1 is done.
- **App shows "NEVER RUN" for a vital** — the vital has not written output into the
  vault yet; run it once.
- **Chat says `ANTHROPIC_API_KEY is not set`** — fill it in `<vault>/.env` and
  restart `app/run.sh`.
- **The app reads the wrong vault** — check `echo $OZOS_VAULT` and
  `cat ~/.ozos/config.json`; env wins over config.
- **Commit blocked by scrub-check** — a company term is in the engine; move it to
  the vault. Never use `--no-verify`.
- **Knowledge Hub is empty** — it lists `<vault>/knowledge-hub/*`; put a Markdown
  file there and reload.
