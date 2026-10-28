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

Want to see a populated app before setting up your own? `./ozos init --demo` creates a
vault for Brightfold, a fictional company, and `bash app/run.sh` shows it. Delete that
vault (or re-run `init --force`) before the real one.

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
| `ATLASSIAN_CLOUD_ID` | the Atlassian Goals connector |
| `METABASE_URL` + `METABASE_API_KEY` (or username/password by hand) | Metabase data points; the two named ones are written by Setup → Data points |

Never put any of these in the engine. Never commit `.env`.

---

## 5. Connect sources, one at a time: the Setup page

Open **Setup** (first entry in the sidebar, right under the logo). It is a grouped
checklist of everything a new company can feed into OZOS, in this order: You, Meeting
notes, Chat & workspace, Boards, Documentation, People, Review cycle, Goals, Data,
Insights. Each item shows what it is for, which vault file it writes, and a status chip:
*Not started*, *In progress*, *Done*, *Skipped* or *Needs attention*. Nothing gates
anything; the page is meant to stay half-done for weeks.

Three ways to work an item, all writing the same files:

- **The item's form on the Setup page.** Short, one item at a time, and it writes the
  right vault file for you (routing JSON, knowledge sources, `cycles.yaml`, a person's
  `meta.yaml`, named `.env` variables). Secrets go straight into `<vault>/.env` and are
  never shown again.
- **`/ozos-setup` in a Claude Code session.** It reads the journal, lists what is left,
  and walks you through ONE item conversationally using that connector's `setup.md`.
  Add an item id to go straight to it: `/ozos-setup add-stakeholder`.
- **`./ozos setup` in the terminal.** Prints the checklist; `./ozos setup mark <item>
  done|skipped --notes "…"` records a status without the app.

State lives in `<vault>/.ozos/setup.json`. The home page shows **Setup: N of M done**
until you dismiss it; dismissing is remembered in the same file, and the Setup page stays
in the sidebar.

What each group needs, in the recommended order for a new job:

| Item | What you do | Guide |
|---|---|---|
| Your profile | Done by `ozos init` (name, person id, voice line). | — |
| Gemini notes via Gmail | Save the OAuth client JSON, run the auth command the page shows, optionally enter a Drive folder id. | `docs/connectors/gmail-gemini-notes.md` |
| Granola | Enable the Granola MCP in Claude Code, run `/sync-notes` once. | `docs/connectors/granola.md` |
| Routing folders | Type the folders a note may land in, one per line, plus a tagging guide. | — |
| Slack, Google Workspace, Figma, Miro | Run `/mcp` in Claude Code, enable and authenticate; the page shows *Connected* on the next app start. | — |
| Confluence | Enter email, API token and subdomain; the page writes the three `ATLASSIAN_*` lines. | `connectors/atlassian-goals/setup.md` |
| Notion/wiki exports, PDF drop folder, interviews, surveys | Name a folder; it is created under `knowledge-hub/` and registered as a knowledge source. | — |
| Add a stakeholder | See section 6. | — |
| Review cycle | See section 7. | — |
| Goals | Save the four `ATLASSIAN_*` lines and press *Sync now*, or add a goal by hand. See section 8. | `connectors/atlassian-goals/setup.md` |
| Data points | Optionally save `METABASE_URL` + `METABASE_API_KEY` and *Test connection*; define a point (Metabase card, SQLite query or CSV) and put it on a Data Hub tile. See section 9. | `connectors/metabase/setup.md` |

A *Done* meeting-notes item flips to **Needs attention** by itself when the
`meeting-notes` vital on the Control Tower fails or goes stale, so a broken token shows up
on the Setup page without anyone checking. The Goals item does the same when its last
Atlassian sync failed, and the Data points item when any point's last fetch failed.

Daily digest and intel agents are not setup items: the digest runs with
`python3 tools/daily-digest/digest.py` (or `/daily-digest`); intel agents read
`<vault>/.ozos/intel-agents.json` and run with `/intel-run <agent-id>`.

---

## 6. Add people as you meet them

Setup → People → **Add a stakeholder**: name, person id (slugged from the name), email,
team folder, a *member of leadership group* checkbox, and manager. One save does all of
this in a single backend call:

1. creates `<vault>/people-hub/people/<id>/meta.yaml` (start date = today),
2. maps their email to a person folder in `meeting-routing.json` so every meeting they
   attend is labelled with their name,
3. adds the team folder to the routing folders if it is new,
4. when the checkbox is on, adds their first name to the `Leadership` group rule
   (created with `min_present: 3` the first time), so notes with three or more leaders
   present are rerouted to the Leadership folder,
5. records a sub-row under the item and deletes the `example-report` person the first
   time a real person is added.

Expect this to take a month. The app is fine with two people today and twenty later.
People Hub → Add person still works for a person who needs no routing.

---

## 7. Review cycle

Setup → Review cycle offers two buttons:

- **Company cycle**: a name, a type (`deep-dive` or `light-touch`) and stages with dates.
  Saving writes `<vault>/people-hub/cycles.yaml`, replaces the example cycle and makes
  the new one active.
- **Use default cadence**: when the company has no formal cycle. The recommended default
  is a monthly 1:1 note check and a quarterly written reflection per report. It is stored
  in `setup.json` and rendered on the home page as a reminder list with the next due dates
  (first day of next month and of next quarter), computed from the clock each time.

Either choice marks the item done; you can reopen it later.

---

## 8. Goals

Goals live in `<vault>/.ozos/goals.json` and show on **Goals & Tasks → Goals** as a board:
one row per goal with a status chip (*On track*, *At risk*, *Off track*, *Complete*,
*Cancelled*, *Pending*), a progress bar when the goal reports one, owner and target. Rows
that need attention sort to the top. Two ways to fill it, mixable:

- **By hand.** The *Add a goal* form at the bottom of the board (or on Setup → Goals):
  title, owner, target date, status, progress. These goals are editable in place: change
  the status from the select, type a new progress, *Delete* when it no longer applies.
- **From Atlassian Goals.** Setup → Goals → *Connect Atlassian Goals*: the same three
  `ATLASSIAN_*` variables as Confluence plus `ATLASSIAN_CLOUD_ID`
  (`connectors/atlassian-goals/setup.md` says where to find it), *Save to .env*, then
  **Sync now**. Every goal in your Atlassian site lands on the board with an `Atlassian`
  badge. They are **read-only here**: change them in Atlassian and press *Sync Atlassian*
  on the board again. A sync replaces the Atlassian set wholesale, so a goal removed there
  disappears here; goals added by hand are never touched.

The first goal added, or the first successful sync, marks the Setup item *Done*. A failed
sync (bad token, wrong subdomain, network) is remembered in `goals.json` and shows the item
as **Needs attention** until the next sync succeeds; the board shows the connector's
message. No goals tool at the new company? Skip the connector and use the form.

Each goal has a **Data point** select on the board (synced goals too: the binding is the one
field they accept here). A bound goal shows the data point's latest number beside its
progress, as `188 users · Weekly signups`; the measure never overwrites `progress`. A goal
bound to a data point that was deleted reads *no value* until you pick another.

---

## 9. Data points

A data point is one named thing to measure: a **source**, a **display**, a **refresh**
cadence and a **unit**. Definitions live in `<vault>/.ozos/datapoints.json`; each point's
last value (or last error) is cached in `<vault>/.ozos/datapoint-cache/<id>.json`, which the
vault's `.gitignore` keeps out of git. Data Hub tiles and goal measures can only show data
points.

Three sources, each a small object:

| Source | Fields | Notes |
|---|---|---|
| Metabase card | `card_id` | Runs the saved question with its default filters. Needs `METABASE_URL` + `METABASE_API_KEY` (or a username/password pair) in the vault `.env`; `connectors/metabase/setup.md`. |
| SQLite query | `path`, `query` | `path` is relative to the vault and must stay inside it; the file is opened read-only. |
| CSV file | `path`, optional `column` | First row is the header; numbers are parsed; `column` keeps only that column. Same path rule. |

Three displays: **number** (first cell of the first row, with the unit; when the result has
a second row it is read as the previous value and shown as a delta), **table** (every column,
the first 50 rows) and **line** (first column on x, second on y). Rows are capped at 1000 in
the cache.

Two cadences: **manual** (the tile's refresh icon, or `./ozos datapoints refresh --all`) and
**daily**. Daily points refresh through the `datapoints-refresh` vital, which runs
`./ozos datapoints refresh` (`--all` refreshes manual points too); run it from the Control
Tower like any vital, and it shows *STALE* there after 24 hours. Nothing schedules it: a
vault nobody opens does not refresh.

Where to define one, all writing the same file:

- **Setup → Data points**: *Connect Metabase* (optional; *Save to .env*, then *Test
  connection*), *Define a data point*, and *Your data points* listing each point with its
  last fetch or error and a *Delete*.
- **Data Hub** with no data points yet: *Define your first data point* opens the same form.
- `/ozos-setup first-data-point` in a Claude Code session.

Then **Data Hub → Add tab** (tabs are typed names; no rename or delete yet, edit
`datahub.json` by hand), and the tile's `+` lists your data points grouped by source kind.
Deleting a data point leaves its tiles in place: they read *Data point removed* with a
*Remove this tile* action.

The item turns *Done* with the first data point of any kind (derived, so it reverts if you
delete them all). A point whose last fetch failed shows the error on its tile and on Setup,
and the item reads **Needs attention** until a refresh succeeds.

---

## 10. Daily use

| Do | How |
|---|---|
| Start the app | `bash app/run.sh` (or `/ozos-brain` in Claude Code) |
| Work the next setup item | `/ozos-setup` in a Claude Code session, or the Setup page |
| Sync notes from both sources | `/sync-notes` in a Claude Code session |
| Pull goals from Atlassian again | *Sync Atlassian* on Goals & Tasks, or `/ozos-setup define-goals` |
| Refresh daily data points | Control Tower → `datapoints-refresh`, or `./ozos datapoints refresh` (`--all` for manual points too) |
| Save a session summary | `/save-session` (writes to the vault's `docs/learnings.md`) |
| Commit engine changes | `/git`; the pre-commit gate runs tests and the scrub check |
| Keep the term list current | add new names, hosts and IDs to `~/.ozos/scrub-terms.txt` the day you learn them |
| Check the whole git history for terms | `./ozos scrub-check --history` (before making a repo public) |

---

## 11. What is not here yet

Data Hub tabs cannot be renamed or deleted from the page yet (edit
`<vault>/.ozos/datahub.json`).

---

## 12. Troubleshooting

- **"Gmail not configured" at session start** — expected until the *Gemini notes via Gmail* item in Setup is done.
- **App shows "NEVER RUN" for a vital** — the vital has not written output into the
  vault yet; run it once.
- **Chat says `ANTHROPIC_API_KEY is not set`** — fill it in `<vault>/.env` and
  restart `app/run.sh`.
- **The app reads the wrong vault** — check `echo $OZOS_VAULT` and
  `cat ~/.ozos/config.json`; env wins over config.
- **Commit blocked by scrub-check** — a company term is in the engine; move it to
  the vault. Never use `--no-verify`.
- **`scrub-check --history` reports a commit** — the term is in that commit's diff, message
  or author line even if the tree is clean; rewrite history (`git filter-repo`), rotate anything that was a credential, and
  never flip the repo public first.
- **Knowledge Hub is empty** — it lists `<vault>/knowledge-hub/*`; put a Markdown
  file there and reload.
- **A Setup item says "Needs attention"** — its vital failed or is stale; open the
  Control Tower, run the vital, and the chip recovers on its own.
- **An MCP item stays "Not detected yet"** — the app reads `claude mcp list` once at
  start (`app/run.sh` caches it); authenticate in `/mcp`, then restart `app/run.sh`.
- **Sync Atlassian answers `ATLASSIAN_… is not set`** — that variable is empty in
  `<vault>/.env`; fill it on Setup → Goals (the app re-reads the file on every sync, no
  restart needed).
- **The Goals item says "Needs attention"** — the last Atlassian sync failed; the
  board shows the connector's message (`Authentication failed` = email or token, `404` =
  subdomain). Fix the variable and sync again; the chip recovers by itself.
- **A synced goal cannot be edited or deleted** — by design; change it in Atlassian and
  sync again. Only goals added by hand are editable in OZOS.
- **The Data points item says "Needs attention"** — a point's last fetch failed; the item
  lists the point with its error (`METABASE_URL is not set`, `401`, `403`, `… not found in
  the vault`, `no such table`). Fix the cause and press the tile's refresh icon.
- **A tile says "Not fetched yet"** — the point has never been fetched; press its refresh
  icon, or wait for the daily vital if it is a `daily` point.
- **The Control Tower does not list `datapoints-refresh`** — the vault predates Phase 4;
  copy that entry from `vault-template/.ozos/vitals.json` into `<vault>/.ozos/vitals.json`.
- **A data point path is refused ("must stay inside the vault")** — sqlite and csv files
  have to live under the vault; copy or symlink the file in and use a relative path.

---

## A. JSON reference

Everything the Setup page writes can also be edited by hand. The files live in
`<vault>/.ozos/` unless noted.

### A.1 `setup.json`

```json
{
  "items": { "granola": { "status": "skipped", "updated_at": "2026-…", "notes": "" } },
  "badge_dismissed": false,
  "cadence": null
}
```

Statuses: `not_started`, `in_progress`, `done`, `skipped`, `needs_attention`. The last one
is normally derived at read time (a done item whose vital failed or went stale) and only
stored if you set it yourself. `cadence` is `{"mode": "company", "cycle_id": "…"}` or
`{"mode": "default", …}`. Item ids are listed by `./ozos setup --json`.

### A.2 `meeting-routing.json` (a commented example sits next to it)

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

- `folders`: the categories the LLM may pick from.
- `person_folders`: attendee email → a virtual folder that collects every meeting that
  person was invited to.
- `group_rules`: when at least `min_present` of these first names are in a meeting, the
  note is rerouted to that folder.
- `drive_parent_folder_id`: set it to mirror notes into a Google Drive folder, then run
  `python3 tools/meeting-notes/sync_gemini_notes.py --auth` again (the scope widens).
- `tagging_guide`: free text appended to the tagging prompt.

### A.3 `knowledge-sources.json`

Folders under `<vault>/knowledge-hub/` are discovered automatically; an entry is only
needed for a path outside it (the template registers `docs/`) or to set a `mode`
(`"labels"` for meeting notes). Drop-folder items add an entry for a stable label.

### A.4 `people-hub/cycles.yaml` and `people-hub/people/<id>/meta.yaml`

See `vault-template/people-hub/` for both shapes with a comment on every field.

### A.5 `.env`

The Setup page writes only `ATLASSIAN_EMAIL`, `ATLASSIAN_TOKEN`, `ATLASSIAN_SUBDOMAIN`,
`ATLASSIAN_CLOUD_ID`, `METABASE_URL` and `METABASE_API_KEY`. Everything else in section 4 is
edited by hand.

### A.6 `goals.json`

```json
{
  "goals": [
    {
      "id": "grow-activation",
      "title": "Grow activation",
      "description": "",
      "owner": "Pat Example",
      "status": "on_track",
      "progress": 42,
      "target_date": "2027-03-31",
      "source": "manual",
      "external_id": null,
      "data_point_id": null,
      "updated_at": "2026-…",
      "synced_at": null
    }
  ],
  "sync": { "last_run": "2026-…", "status": "ok", "message": "", "count": 7 }
}
```

- `id`: the slug of the title for manual goals; `atlassian-<key>` for synced ones.
- `status`: one of `on_track`, `at_risk`, `off_track`, `complete`, `cancelled`, `pending`
  (the Atlassian vocabulary; an unknown remote state becomes `pending`).
- `progress`: `0`–`100` or `null`; `target_date`: free text (ISO date from the form, a
  label such as a quarter from Atlassian).
- `source` / `external_id`: `manual`, or `atlassian` with the goal's ARI. Synced goals
  are replaced on every sync; only `data_point_id` survives from the previous copy.
- `data_point_id`: the id of a data point (A.7) the goal is measured by, or `null`. The
  board shows that point's latest number beside the goal; nothing writes `progress` from it.
- `sync`: `null` until the first sync; `status` `fail` is what turns the Setup item into
  *Needs attention*.

### A.7 `datapoints.json` and the cache

```json
{
  "datapoints": [
    {
      "id": "weekly-signups",
      "name": "Weekly signups",
      "source": { "kind": "metabase", "card_id": 42 },
      "display": "number",
      "refresh": "daily",
      "unit": "users",
      "created_at": "2026-…"
    },
    {
      "id": "signups-by-week",
      "name": "Signups by week",
      "source": { "kind": "csv", "path": "data/signups.csv", "column": null },
      "display": "line",
      "refresh": "manual",
      "unit": "",
      "created_at": "2026-…"
    }
  ]
}
```

- `id`: the slug of the name; a renamed point keeps its id (tiles point at it).
- `source`: `{"kind": "metabase", "card_id": int}`, `{"kind": "sqlite", "path", "query"}` or
  `{"kind": "csv", "path", "column"}`; paths are relative to the vault and must resolve inside
  it. Changing the source drops the cached value.
- `display`: `number`, `table` or `line`; `refresh`: `manual` or `daily`; `unit`: free text.
- A point with an unknown `display` or `refresh` is read with the default; one with a blank
  name or an invalid source is ignored.

`.ozos/datapoint-cache/<id>.json` (gitignored by the template) is either

```json
{ "fetched_at": "2026-…", "columns": ["week", "signups"], "rows": [["2026-W01", 120]] }
```

or, after a failed fetch,

```json
{ "fetched_at": "2026-…", "error": "METABASE_URL is not set" }
```

`GET /api/datapoints/<id>/value` returns `{"id", "fetched_at", "columns", "rows", "error"}`
with `fetched_at: null` when the point was never fetched. The `datapoints-refresh` vital in
`vitals.json` watches this folder (`output_glob: "*.json"`, `stale_after_hours: 24`) and runs
`python3 ozos datapoints refresh`.
