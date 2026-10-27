# Gemini meeting notes via Gmail — setup

"Notes by Gemini" emails are the primary meeting-notes source. The sync is the
`meeting-notes` tool under `tools/`; it is not split into a connector yet (that refactor is
deferred until a second notes source needs it). The `/ozos-setup` skill walks through this
file for the **Gemini notes via Gmail** item.

## What it gives you

- Every Gemini notes email becomes a Markdown note under
  `<vault>/knowledge-hub/meeting-notes/<folder>/`, with attendees, tags, action items and
  the full transcript when one exists.
- The sync runs at every Claude Code session start (SessionStart hook) and on demand with
  `/sync-notes`; the `meeting-notes` vital on the Control Tower shows when it last ran.
- Optional: a mirror of each note as a Google Doc in a Drive folder you choose.

## What you need

- A Google account at the new company that receives the Gemini notes emails.
- A Google Cloud project with the **Gmail API** and **Google Drive API** enabled, and an
  OAuth client of type **Desktop app**. Download its JSON.
- Python packages: `google-api-python-client`, `google-auth-oauthlib` (in
  `requirements.txt`).
- Optional: the id of a Drive folder for the mirror (the part after `/folders/` in its URL).

## Steps

1. Save the OAuth client JSON as `~/.gdrive-credentials.json` (outside the vault; it is
   per machine, not per company).
2. Authorise once. A browser opens; sign in with the **company** account:

   ```bash
   python3 tools/meeting-notes/sync_gemini_notes.py --auth
   ```

   The token lands in `~/.config/ozos/meeting-notes-token.json`. The Setup page's Gmail
   item shows both files as green checks once they exist.
3. Optional Drive mirror: enter the folder id in the Setup page's *Drive folder id* field
   (it writes `drive_parent_folder_id` in `<vault>/.ozos/meeting-routing.json`), then run
   `--auth` again, because the OAuth scope widens from read-only to full Drive.
4. Run the sync once and mark the item:

   ```bash
   python3 tools/meeting-notes/sync_gemini_notes.py
   ./ozos setup mark gmail-gemini done
   ```

   Routing folders and people come from **Routing folders** and **Add a stakeholder** in
   Setup; until then every note lands in `Other`.

## How to verify

- The command above prints one line per processed email and `Done`. Notes appear under
  `<vault>/knowledge-hub/meeting-notes/`.
- The Control Tower shows the `meeting-notes` vital as `SYNCED`. If it later shows `STALE`
  or `NEVER RUN`, the Setup item flips to *Needs attention* on its own.
- `Gmail not configured` at session start means step 1 or 2 is missing.
  `invalid_scope` on refresh means the token was issued for a different scope set: delete
  the token file and run `--auth` again.
- Already-read emails are not picked up by default; backfill once with
  `python3 tools/meeting-notes/sync_gemini_notes.py --historical`.
