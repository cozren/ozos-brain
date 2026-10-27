---
name: ozos-setup
description: Walk through ONE item of the OZOS setup journal conversationally (connect a source, add a stakeholder, set the review cycle), writing the same vault files the Setup page writes and marking the item in <vault>/.ozos/setup.json.
user_invocable: true
aliases:
  - setup
---

Work the setup journal one item at a time. The journal lives in the vault at
`.ozos/setup.json`; the Setup page in the app and this skill write the same files, so
either can be used at any point. Nothing gates anything; skipping is a first-class outcome.

## 1. Read the journal

```bash
./ozos setup --json
```

Group what is left by `groups[].label`, listing only items whose `status` is
`not_started`, `in_progress` or `needs_attention`. Show the count line
(`summary.done` of `summary.total`). If `$ARGUMENTS` names an item id, pick that;
otherwise ask which ONE item to do now, defaulting to the first open one. Do exactly one
item per invocation, then stop.

## 2. Read the item's guide

If the item has a `setup_doc`, read that file (repo-relative) and follow its sections
*What you need* and *Steps* conversationally: ask for one thing at a time, explain why it
is needed in one line, never ask for something the vault already has.

| item id | setup_doc |
|---|---|
| gmail-gemini | `docs/connectors/gmail-gemini-notes.md` |
| granola | `docs/connectors/granola.md` |
| confluence, define-goals | `connectors/atlassian-goals/setup.md` |
| first-data-point | `connectors/metabase/setup.md` |

Items without a doc (`profile`, `routing-folders`, the four MCP items, the drop folders,
`add-stakeholder`, `define-cycle`) are explained by their `why` and `writes` fields.
For `define-goals`, first ask whether the company uses Atlassian Goals at all: if not,
skip the connector and offer to add the first goal by hand.

## 3. Write the vault

Check whether the app is running:

```bash
curl -sf http://localhost:8765/health
```

**App running → call the endpoint** (all under `http://localhost:8765/api/setup`):

| kind | endpoint | body |
|---|---|---|
| people | `POST /people` | `{"person_id","display_name","email","team_folder","leadership":bool,"manager"}` |
| cycle | `PUT /cycle` | `{"mode":"default"}` or `{"mode":"company","name","type","stages":[{"label","start","end"}]}` |
| folder | `POST /folders` | `{"item_id","folder"}` |
| routing | `PUT /routing` | `{"folders":[…],"default_folder","tagging_guide"}` (and `drive_parent_folder_id` for gmail-gemini) |
| env | `PUT /env` | `{"vars":{"ATLASSIAN_EMAIL":…,"ATLASSIAN_TOKEN":…,"ATLASSIAN_SUBDOMAIN":…}}` — plus `ATLASSIAN_CLOUD_ID` for goals; only these names are accepted; values are never echoed back |
| goals | `PUT /env` then `POST /api/goals/sync` (note: not under `/setup`) | env body as above with all four `ATLASSIAN_*` names; sync has no body and answers `{"synced": N}`; `422 … is not set` names a missing variable, `502` carries the connector's error. To add a goal by hand instead: `POST /api/goals` with `{"title","owner","status","progress","target_date"}` (status ∈ on_track, at_risk, off_track, complete, cancelled, pending) |
| gmail | `GET /gmail` | shows which of the OAuth client file, the token and the Drive folder exist |

**App not running → call the same code in-process** from the engine root:

```bash
cd app && python3 -c "from backend.services import setup_actions as a; print(a.add_stakeholder({'person_id': 'pat', 'display_name': 'Pat Example', 'email': 'pat@yourcompany.com', 'team_folder': 'Growth', 'leadership': True, 'manager': ''}))"
```

The functions are `add_stakeholder(dict)`, `set_company_cycle(name, type, stages)`,
`set_default_cadence()`, `add_drop_folder(item_id, folder)`, `update_routing(folders=…,
default_folder=…, tagging_guide=…, drive_parent_folder_id=…)`, `write_env({NAME: value})`,
`gmail_status()`; for goals, `from backend.services import goals, goals_sync` then
`goals_sync.sync_goals()` (pulls Atlassian goals; raises `LookupError` naming a missing
variable, `RuntimeError` with the connector's message) or `goals.add_goal({'title': …})`.
Never print a secret back to the user; pass tokens straight through.

**MCP items** (`slack-mcp`, `google-workspace-mcp`, `figma-mcp`, `miro-mcp`) have no
file to write: tell the user to run `/mcp` in Claude Code, enable the connector and
authenticate. The app derives "connected" from `claude mcp list` on its next start.

**profile** has no form either: if `~/.ozos/config.json` lacks `name` or `me`, the user
runs `./ozos init` (or `./ozos init --force` to repoint an existing config).

**Granola**: run `/sync-notes` once; if it produced notes, the item is done.

## 4. Mark the item

Items written through the endpoints or the actions above are marked automatically
(`add-stakeholder`, `define-cycle`, `define-goals`, the folders, `routing-folders`,
`confluence`). For anything else:

```bash
./ozos setup mark <item-id> done            # or skipped / in_progress
./ozos setup mark <item-id> skipped --notes "company does not use this"
```

## 5. Report

Print the item's new status and the fresh count from `./ozos setup`, then stop. Do not
start the next item unless asked; the journal is meant to stay half-done for weeks.
