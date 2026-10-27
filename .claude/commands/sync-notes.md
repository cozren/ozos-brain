Sync meeting notes from BOTH sources — Gemini (Gmail) and Granola (MCP) — into
`<vault>/knowledge-hub/meeting-notes/<subfolder>/` (and Google Drive when the vault's
routing config sets `drive_parent_folder_id`), then refresh the graph.

Run these steps in order. Do not skip the Granola steps.

## Step 1 — Gemini notes (Gmail, headless Python)

```bash
python3 tools/meeting-notes/sync_gemini_notes.py
```

(Use system `python3`.)

## Step 2 — Granola notes (MCP-driven; you orchestrate this)

The Python script cannot reach Granola (local cache is encrypted), so YOU fetch
the meetings via the Granola MCP and hand them to the script.

1. **Read sync state** — read `vault/.ozos/granola-processed.json` if it exists. It has
   `{"last_scan": "<ISO>", "processed_ids": [...]}`. If the file is missing, treat
   `last_scan` as 30 days ago.

2. **List meetings since last scan** — call `mcp__claude_ai_Granola__list_meetings`:
   - If `last_scan` is set: `time_range: "custom"`, `custom_start: <last_scan>`,
     `custom_end: <today's date>`.
   - If no `last_scan`: `time_range: "last_30_days"`.
   Collect each meeting's `id`, `title`, and date.

3. **Drop already-processed** — skip any meeting whose `id` is in `processed_ids`
   (the Python script dedups too, but skipping here avoids wasted `get_meetings`
   calls).

4. **Fetch content** — for the remaining ids, call
   `mcp__claude_ai_Granola__get_meetings` in batches of **≤10 ids**. For each
   meeting, combine its AI summary and private notes into one `content` string.

5. **Write the input file** — write a JSON array to a temp path, one object per
   meeting:
   ```json
   [{"id": "<uuid>", "title": "<title>", "content": "<summary + notes>", "date": "<ISO date>"}]
   ```
   Save it to `/tmp/granola-meetings.json`. If there are no new meetings, skip
   steps 5–6 and note "no new Granola meetings".

6. **Run the pipeline** — feed the file to the script (it categorizes into the
   same folders, mirrors to Drive when configured, writes local `.md` with `source: granola`,
   and updates `vault/.ozos/granola-processed.json`):
   ```bash
   python3 tools/meeting-notes/sync_gemini_notes.py --granola-input /tmp/granola-meetings.json
   ```

## Step 3 — Refresh the knowledge graph

```bash
graphify update . --wiki --no-viz 2>&1 | tail -10
```

## Notes
- Granola only syncs when this command is run (the automatic SessionStart hook is
  Gmail-only — it can't call MCP).
- A meeting captured by both Gemini and Granola yields two notes, distinguished by
  their `source` frontmatter field. That's expected for now.
- If the Granola MCP is unavailable, report it and continue — the Gemini sync in
  Step 1 still succeeds.
