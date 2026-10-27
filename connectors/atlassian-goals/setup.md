# Atlassian connector — setup

One Atlassian API token serves two setup items: **Confluence** (search in the chat, needs
three variables) and **Goals** (the Atlassian Goals MCP server, needs two more). The
`/ozos-setup` skill walks through this file for both; the Goals page itself arrives in
Phase 3, so the Goals item can stay `skipped` after the connection works.

## What it gives you

- **Confluence**: the floating chat can search Confluence and open pages when asked.
- **Goals**: in a Claude Code session opened in the engine, the `atlassian-goals` MCP
  server answers "show me my goals", "what is at risk", "update goal X to on_track".

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

2. **Goals** — add the one remaining line to the vault `.env` by hand (Phase 3 adds the
   form):

   ```
   ATLASSIAN_CLOUD_ID=...
   ```

   The engine's project-level `.mcp.json` already registers
   `connectors/atlassian-goals/server.py`; restart Claude Code once so it starts.
   Dependencies: `pip3 install -r connectors/atlassian-goals/requirements.txt`.

3. Mark the items: Confluence marks itself `done` when all three variables are set. For
   Goals run `./ozos setup mark define-goals skipped --notes "connector verified; goals page in Phase 3"`
   or leave it open.

## How to verify

- **Confluence**: in the app's chat ask *"search Confluence for onboarding"*. A list of
  pages means the token works; `ATLASSIAN_* not set` names the missing variable.
- **Goals**: in a Claude Code session say *"Test my Atlassian connection"*. The MCP tool
  `test_connection` replies with your account; `Authentication failed` means the email or
  token is wrong, a `404` means the subdomain is wrong.
