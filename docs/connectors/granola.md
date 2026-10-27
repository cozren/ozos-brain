# Granola meeting notes — setup

Granola is the second meeting-notes source. Its local cache is encrypted, so the Python
sync cannot read it; instead a Claude Code session fetches meetings through the Granola
MCP and hands them to the same pipeline as the Gemini notes. The `/ozos-setup` skill walks
through this file for the **Granola** item.

## What it gives you

- Granola meetings become Markdown notes under
  `<vault>/knowledge-hub/meeting-notes/<folder>/` with `source: granola` in their
  frontmatter, categorised and tagged like the Gemini notes.
- A meeting captured by both Gemini and Granola yields two notes, one per source. That is
  expected; there is no cross-source de-duplication yet.

## What you need

- The Granola desktop app signed in with the company account.
- The Granola MCP enabled in Claude Code: run `/mcp`, enable *Granola* and authenticate.
  It appears as `claude.ai Granola` in `claude mcp list`.
- Nothing in the vault `.env`; there are no credentials to store.

## Steps

1. Enable the Granola MCP as above and confirm it is listed as connected in `/mcp`.
2. In a Claude Code session opened in the engine, run:

   ```
   /sync-notes
   ```

   Step 2 of that command lists Granola meetings since the last scan (first run: the last
   30 days), fetches their summaries, writes `/tmp/granola-meetings.json` and runs
   `sync_gemini_notes.py --granola-input` on it.
3. Mark the item once the first run produced notes:

   ```bash
   ./ozos setup mark granola done
   ```

## How to verify

- `/sync-notes` reports how many Granola meetings it processed; the notes appear under
  `<vault>/knowledge-hub/meeting-notes/` with `source: granola`.
- `<vault>/.ozos/granola-processed.json` holds `last_scan` and the processed ids; the
  next run only scans from `last_scan`.
- The sync is **manual by design**: the SessionStart hook cannot call an MCP, so Granola
  notes only arrive when `/sync-notes` runs. If the MCP is unavailable the command says so
  and the Gemini half still succeeds.
