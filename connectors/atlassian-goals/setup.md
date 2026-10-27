# Atlassian connector — setup

One Atlassian API token serves two setup items: **Confluence** (search in the chat, needs
three variables) and **Goals** (the Goals page pulls your goals in, needs one more). The
`/ozos-setup` skill walks through this file for both.

## What it gives you

- **Confluence**: the floating chat can search Confluence and open pages when asked.
- **Goals**: the Goals & Tasks page lists your Atlassian goals with status, progress,
  owner and target next to the goals you add by hand. **Sync Atlassian** pulls them again
  whenever you like. In a Claude Code session opened in the engine, the `atlassian-goals`
  MCP server also answers "show me my goals", "what is at risk", "update goal X to
  on_track".

## What you need

- Your Atlassian account email.
- An API token: https://id.atlassian.com/manage-profile/security/api-tokens → *Create
  API token*. Copy it once; Atlassian does not show it again.
- The **subdomain**: the part before `.atlassian.net` in your site URL.
- For Goals only: the **cloud id**. Open any Jira or Confluence page and run this in the
  browser console; the response's `cloudId` is what you need:

  ```js
  fetch("/_edge/tenant_info").then(r => r.json()).then(console.log)
  ```

## Steps

1. **Confluence** — in the app, Setup → Documentation → Confluence, enter the email,
   token and subdomain and press *Save to .env*. The page writes exactly these three
   lines to the **vault** `.env` and never shows the values again:

   ```
   ATLASSIAN_EMAIL=you@yourcompany.com
   ATLASSIAN_TOKEN=...
   ATLASSIAN_SUBDOMAIN=yourcompany
   ```

   Without the app, `/ozos-setup` writes the same lines through
   `setup_actions.write_env`, or add them by hand.

2. **Goals** — Setup → Goals → *Connect Atlassian Goals* shows the same three fields plus
   `ATLASSIAN_CLOUD_ID`; fill in whatever is still *not set* and press *Save to .env*.
   Then press **Sync now**. The app pulls your goals into `<vault>/.ozos/goals.json`
   and marks the item done. Without the app, `/ozos-setup` calls
   `goals_sync.sync_goals()` in-process.

   Goals pulled this way are read-only in OZOS (change them in Atlassian and sync
   again); goals you add by hand on the same page are fully editable.

   For the MCP server in Claude Code: the engine's project-level `.mcp.json` already
   registers `connectors/atlassian-goals/server.py`; restart Claude Code once so it
   starts. Dependencies: `pip3 install -r connectors/atlassian-goals/requirements.txt`.

3. Mark the items: Confluence marks itself `done` when all three variables are set; Goals
   marks itself `done` after the first successful sync or the first goal added by hand.
   No Atlassian goals? Skip the connector and add goals by hand, or
   `./ozos setup mark define-goals skipped --notes "no goals tool here"`.

## How to verify

- **Confluence**: in the app's chat ask *"search Confluence for onboarding"*. A list of
  pages means the token works; `ATLASSIAN_* not set` names the missing variable.
- **Goals**: open Goals & Tasks; after *Sync Atlassian* the board lists your goals with an
  `Atlassian` badge and the Setup item reads *Done*. A `422 … is not set` names the
  missing variable; `Authentication failed` means the email or token is wrong; a `404`
  means the subdomain is wrong. A failed sync flips the Setup item to *Needs attention*
  until the next sync succeeds.
- **MCP**: in a Claude Code session say *"Test my Atlassian connection"*; the
  `test_connection` tool replies with your account.
