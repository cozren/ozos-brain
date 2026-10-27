# Meeting Notes Sync

Fetches meeting notes from **two sources** — **Notes by Gemini** emails (Gmail) and **Granola** meetings (MCP) — categorizes them using the Claude API (via the Examplecorp LLM gateway), and saves them as Google Docs to the correct sub-folder in Google Drive plus a local `.md` copy.

The **Gemini** half runs automatically at every Claude Code session start via a `SessionStart` hook, and on demand via `/sync-notes`. The **Granola** half runs only via `/sync-notes` (the headless hook can't call MCP).

Each saved note records its origin in a `source` frontmatter field (`gemini` or `granola`). A meeting captured by both sources produces two notes — one per source — which is expected; there is no cross-source de-duplication.

---

## How it works

```
SessionStart hook
    └─▶ sync_gemini_notes.py
            ├─ 1. Drive API    → rename any existing notes still using old date prefix (one-time migration, idempotent)
            ├─ 2. Gmail API    → search unread emails from gemini-notes@google.com with subject starting "Notes:"
            ├─ 3. Drive API    → export the source Gemini Doc as markdown → attendees + full transcript
            ├─ 4. Claude API   → categorize note into subfolder (Ads, Widget, Casey, …)
            ├─ 5. Drive API    → create Google Doc in Ozos: Knowledge Hub/Meeting Notes/<subfolder>/
            ├─ 6. Claude API   → extract people, projects, topics, action items, scope
            ├─ 7. Local file   → save .md with YAML frontmatter to vault/knowledge-hub/meeting-notes/<subfolder>/
            └─ 8. Gmail API    → mark as read, apply "Processed-by-Claude" label
```

**File naming:** `YYYY-MM-DD — {subject}` (e.g. `2026-04-02 — Notes: "Casey / Taylor" Apr 2, 2026`) — sortable chronologically in Drive and locally.

**Local copy format:**
```markdown
---
date: 2026-04-02
subject: 'Notes: "Casey / Taylor" Apr 2, 2026'
folder: Casey
source: gemini
scope: 1:1
tags:
  - 1-1
  - Widget
folders:
  - Casey
attendees:            # from the Gemini doc's Invited list — authoritative
  - name: Casey Example
    email: casey.example@examplecorp.com
    declined: false
people:               # inferred from the summary; includes people only *mentioned*
  - name: Casey
    role: Manager
projects:
  - Widget
topics:
  - Q2 planning
action_items:
  - Send recap by Friday
---

# Notes: "Casey / Taylor" Apr 2, 2026

...emailed summary...

## 📖 Full Transcript

### 00:00:00

**Taylor Lee:** ...
```

**Email format matched:** `Notes: "Meeting Name" Mar 30, 2026` from `gemini-notes@google.com`

**Gmail search query:** `from:gemini-notes@google.com subject:Notes:`

---

## Transcripts & attendees (source doc)

The notification email carries **only the summary**. The full transcript and the
real attendee list live in the source "Notes by Gemini" Google Doc, which has two
tabs — `Notes` and `Transcript`.

The doc id is recovered from the **`text/html` part** of the email (the
`text/plain` part strips hyperlinks, so the doc is unreachable from it), then the
doc is exported with `files().export(mimeType="text/markdown")`.

Markdown export — not `text/plain` — is required, because only markdown preserves:
- `Invited [Name](mailto:email)` → parsed into `attendees:`
- `~~[Name](mailto:…)~~` → strikethrough marks a **declined** invite

`split_transcript` also strips two artefacts of markdown export:
- pandoc heading anchors (`### 00:01:09 {#00:01:09}`), which would render literally
- **base64 image reference definitions** (`[image19]: <data:image/png;base64,…>`) —
  one per image in the doc, i.e. every screen-share frame, appended at the end of
  the export and therefore inside the transcript half. Nothing references them
  (the inline `![][imageN]` markers live in the Notes tab, and we use the emailed
  summary for that half). Left in, they were **90% of the whole corpus by bytes —
  55 MB of 61 MB**, with a single line reaching 219 KB.

Roughly 85% of meetings have a transcript (it only exists when Meet transcription
was on). A meeting with no transcript still gets its `attendees:`. A doc that
can't be exported is logged and the note is still saved with its summary — the
transcript is never worth losing a note over.

**Two attendance fields, deliberately:** `attendees` is the invite list and is
authoritative. `people` is LLM-inferred from the summary and conflates
participants with people merely referenced ("check with Pat") — do not use it
to decide who was in a meeting.

---

## Person folders

Routing is configured in the **vault**, never in the engine:
`<vault>/.ozos/meeting-routing.json`. Its `person_folders` map turns an attendee
email into a Knowledge Hub folder label; `folders` lists the categories the LLM may
pick from; `group_rules` reroute a note when enough members of a group are present
(e.g. a leadership team); `drive_parent_folder_id` (optional) mirrors notes to a
Google Drive folder; `tagging_guide` is free text appended to the tagging prompt.

```json
{
  "folders": ["Team A", "Other"],
  "default_folder": "Other",
  "person_folders": { "pat@example.com": "Pat Example" },
  "group_rules": [{ "folder": "Leadership", "members": ["pat", "sam"], "min_present": 2 }],
  "drive_parent_folder_id": null,
  "tagging_guide": ""
}
```

Every meeting that person **attended** then appears under their folder, on top of
whichever folder the note was categorized into — a note can be in `Widget` and
`Pat Example` at once.

Attendance is read from **two independent sources**, because either alone misses
real meetings:

| Source | Matched on | Catches |
|---|---|---|
| `attendees` (doc's Invited line) | **email** | invitees who stayed silent; a **declined invite still counts** |
| transcript speakers | **full name** | docs with **no Invited line at all** |

The second source is not redundant. A doc has no Invited line when the meeting was
an ad-hoc Meet call with no calendar event, or when the event hides its guest list
(`guestsCanSeeGuests: false`). The `All hands - Strategy Kick Off 2026` note is
exactly that: `attendees: []`, yet Pat Example created the event and took 28
speaking turns. Invite-based tagging structurally could not see it.

Speaker matching requires the **full name** — `Pat` alone could be a different
Pat. Add an alias to the `person_folders` values only if Gemini starts abbreviating.

This works because the meeting-notes source runs in `mode: "labels"` in
`.ozos/knowledge-sources.json`: its folders are built from each note's `folders:`
frontmatter (`services/knowledge.py::_build_label_children`), not from directories
on disk. No directory is created for a person folder.

> **Gotcha:** a note with **no** `folders:` key falls back to its physical parent
> directory. Writing `folders:` switches that fallback off, so anything adding a
> person folder must seed the original folder in first, or the note silently
> leaves `Ads/`. `merge_doc_into_note` handles this; keep it in mind for any new
> writer.

**To add a person:** add their email to `person_folders` in the routing config, then re-run the
backfill (below) to label their past meetings.

---

## Backfill (existing notes)

`backfill_transcripts.py` re-reads the source doc behind every local note and
merges in `attendees:`, any person folders, and the transcript. Notes are matched
to emails by their `subject:` frontmatter. It is **idempotent** — re-running after
adding a person to `person_folders` only adds the new labels.

```bash
python3 tools/meeting-notes/backfill_transcripts.py --dry-run   # report only
python3 tools/meeting-notes/backfill_transcripts.py             # write

# Retry just the notes whose doc export hit a transient network error
python3 tools/meeting-notes/backfill_transcripts.py --only "Widget Migration Team Daily"
```

`--only SUBSTRING` restricts the run to notes whose **filename** contains the
substring (case-insensitive). The summary lists any note under `Failed:` — feed
its name back through `--only` instead of re-exporting all ~200 docs.

---

## Importing a meeting with no notes email

The sync is **Gmail-driven**, so a meeting whose "Notes by Gemini" email never
arrived has **no local note at all** — and a folder tag cannot be added to a note
that doesn't exist. This happens when the notes were not shared with us, or for an
all-hands that hides its guest list.

Such meetings are invisible to the sync but visible on the **calendar**, as an
event carrying a `Notes by Gemini` attachment with no corresponding local note.
Import one straight from its doc id:

```bash
python3 tools/meeting-notes/backfill_transcripts.py --from-doc <DOC_ID>
```

This derives the title and date from the doc header, uses the doc's **Notes tab**
as the body (there is no emailed summary to use), attaches the transcript, applies
person folders from both attendance sources, and records `gemini_doc_id:` for
provenance. The `subject:` is written in the same
`Notes: “<title>” <Mon D, YYYY>` shape the emails use, so if the notes email ever
does arrive it maps onto this note instead of creating a duplicate.

> The LLM categorises the note like any other, and can misfile an unusual meeting —
> the all-hands landed in `Jordan/` (she presented) and was moved to `Other/`
> to match the sibling all-hands note. Check the chosen folder after importing.

Granola-sourced notes are skipped (they have no Gemini doc). A run takes several
minutes — it fetches ~200 emails and exports ~200 docs sequentially.

**Abort guard:** if Gmail returns no emails, or fewer than half the message
fetches succeed, the run raises `BackfillAborted` and writes nothing (exit 1).
Without it a mid-run network drop produced an empty subject index and every note
was reported as "No matching email" — a total failure that looks exactly like a
clean "nothing to update" run.

> `knowledge-hub/` is **gitignored**, so there is no `git checkout` undo for a bad
> backfill. Copy `vault/knowledge-hub/meeting-notes` aside before a first run.

---

## Granola sync (MCP-driven)

Granola's local cache is encrypted, so the Python script can't read it directly.
Instead the `/sync-notes` command drives the Granola MCP, fetches new meetings, and
hands them to the script via a JSON file:

```
/sync-notes (Claude-driven)
    ├─ 1. Read .ozos/granola-processed.json → {last_scan, processed_ids}  (missing → 30 days ago)
    ├─ 2. Granola MCP list_meetings (since last_scan) → meeting ids + titles
    ├─ 3. Skip ids already in processed_ids
    ├─ 4. Granola MCP get_meetings (batches ≤10) → AI summary + private notes
    ├─ 5. Write /tmp/granola-meetings.json: [{id, title, content, date}, …]
    └─ 6. python3 sync_gemini_notes.py --granola-input /tmp/granola-meetings.json
              ├─ skip ids already in processed_ids (dedup)
              ├─ categorize → subfolder, upload Google Doc, write local .md (source: granola)
              └─ update .ozos/granola-processed.json (processed_ids += new ids; last_scan = now)
```

**Scan window:** each run scans from the last successful scan (high-water-mark).
First run with no state falls back to the last 30 days.

**State file:** `.ozos/granola-processed.json` —
`{"last_scan": "<ISO 8601>", "processed_ids": ["<meeting-id>", …]}`. Written by the
Python script; read by the command to bound the scan. Per-meeting failures are
logged and left out of `processed_ids` so they retry next run.

**Manual Granola-only run** (after fetching meetings into a JSON file):

```bash
python3 tools/meeting-notes/sync_gemini_notes.py --granola-input /tmp/granola-meetings.json
```

**Drive structure:**
```
Ozos: Knowledge Hub/
└── Meeting Notes/
    ├── Ads/
    ├── Widget/
    ├── Sam/
    ├── Alex/
    ├── Jordan/
    ├── Casey/
    └── Other/        ← notes that don't match any category
```

Sub-folders are created automatically on first run if they don't exist.

Local copies are saved to `vault/knowledge-hub/meeting-notes/<subfolder>/` alongside the Drive docs.

---

## Manual trigger

Run a one-off Gemini sync at any time (use system `python3` — the repo `.venv` has no `python` binary):

```bash
python3 tools/meeting-notes/sync_gemini_notes.py
```

For both sources, use the `/sync-notes` command (it orchestrates the Granola MCP fetch).

---

## Historical catchup (already-read emails)

To process emails you've already read (drops the `is:unread` filter):

```bash
python3 tools/meeting-notes/sync_gemini_notes.py --historical
```

Already processed 56 notes going back to November 2025 using this command.

---

## Prerequisites for a new machine

### 1. Google Cloud setup (reuse existing project `ozos-mcp`)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → project `ozos-mcp`
2. **APIs & Services → Library** → search **Gmail API** → Enable
3. **APIs & Services → Library** → search **Google Drive API** → Enable
4. Download the OAuth credentials JSON (Desktop app type) → save to `~/.gdrive-credentials.json`

### 2. Python environment

```bash
python -m venv .venv
pip install -r requirements.txt
```

### 3. Environment variables

Copy `.env.example` to `.env` and fill in:

```
ANTHROPIC_API_KEY=sk-ant-...
OZOS_LLM_BASE_URL=   # optional Anthropic-compatible proxy
```

> **Note:** Categorization and metadata extraction use the shared model (`OZOS_LLM_MODEL`, default `claude-sonnet-5-5`). If your key is issued by an employer gateway it may expire — check the expiry date when getting a new one.

### 4. Google OAuth (one-time per machine)

```bash
python3 tools/meeting-notes/sync_gemini_notes.py --auth
```

This opens a browser, you log in with Google, authorize Gmail + Drive access, and the token is saved to `~/.config/ozos/meeting-notes-token.json`.

---

## Running tests

```bash
python3 -m pytest tools/meeting-notes/tests/ -v
```

Or run the whole repo suite: `python3 tools/test-pipeline/pipeline.py`.

> **Any test that calls `run_sync` MUST pass `output_dir=tmp_path`.**
> `save_note_locally` binds `LOCAL_NOTES_DIR` as a *default argument*, evaluated at
> import time, so `monkeypatch.setattr(sync_gemini_notes, "LOCAL_NOTES_DIR", …)`
> does **not** redirect writes — the test writes into the real
> `vault/knowledge-hub/meeting-notes/`, overwriting live notes. Because `vault/`
> is gitignored, there is no undo.
