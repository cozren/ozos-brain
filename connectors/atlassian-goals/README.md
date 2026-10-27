# Atlassian Goals MCP Server

Connects Claude Code to the Atlassian Atlas Goals API. Ask Claude to list your goals, check key results, read check-ins, and update goal status — all without opening a browser.

## Two ways in

- **The app**: Setup → Goals saves the credentials and **Sync now** (or *Sync Atlassian* on
  the Goals & Tasks page) calls `POST /api/goals/sync`, which uses this directory's
  `api_client.AtlassianGoalsClient` to pull every goal into `<vault>/.ozos/goals.json`.
  Synced goals are shown read-only next to the goals you add by hand.
- **The MCP server** (below): for asking about and updating goals from a Claude Code
  session.

## How it works

Uses the Atlassian GraphQL gateway at `https://{subdomain}.atlassian.net/gateway/api/graphql` with Basic auth (email + API token). This is the correct API per [Atlassian's Goals integration docs](https://support.atlassian.com/platform-experiences/docs/integrate-and-update-third-party-metrics-with-atlassian-goals/).

## Prerequisites

- Python 3.11+ (this project uses 3.13)
- An Atlassian API token — create one at: https://id.atlassian.com/manage-profile/security/api-tokens
- Atlas (Goals) product enabled for your org

## Setup

### 1. Install dependencies

```bash
cd <engine-root>
pip install -r connectors/atlassian-goals/requirements.txt
```

### 2. Add credentials to the vault `.env`

The server reads `<vault>/.env` (the Setup page's Confluence item writes the first three). Add these lines (plus `ATLASSIAN_TOKEN`):

```
ATLASSIAN_EMAIL=you@yourcompany.com
ATLASSIAN_SUBDOMAIN=yourcompany
ATLASSIAN_CLOUD_ID=<your-cloud-id>
```

**Finding your subdomain:** it's the part before `.atlassian.net` in your Atlassian URL (e.g. `yourcompany.atlassian.net` → subdomain is `yourcompany`).

**Finding your Cloud ID:** go to any Jira/Confluence project in your browser and run this in the console:
```js
fetch("/rest/api/3/serverInfo").then(r => r.json()).then(d => console.log(d.baseUrl))
```

### 3. Add to Claude Code

The engine ships a project-level `.mcp.json` that registers this server for sessions opened in the engine checkout. For a user-level registration instead, create `~/.claude/.mcp.json`:

```bash
cat > ~/.claude/.mcp.json << 'EOF'
{
  "mcpServers": {
    "atlassian-goals": {
      "command": "python3",
      "args": [
        "connectors/atlassian-goals/server.py"
      ]
    }
  }
}
EOF
```

If `~/.claude/.mcp.json` already exists, add the `"atlassian-goals"` entry inside the existing `mcpServers` block.

### 4. Restart Claude Code

Close and reopen Claude Code. The MCP server starts automatically.

### 5. Verify it works

In any Claude Code session, say: **"Test my Atlassian connection"**

## Tools

| What to say to Claude | What it does |
|---|---|
| "Show me all my goals" | Lists all goals |
| "Show me at-risk goals" | Lists goals filtered to `at_risk` status |
| "Get details for goal [ID]" | Full detail for one goal including recent check-ins |
| "What are the key results for goal [ID]?" | Lists metric targets (key results) |
| "Show recent check-ins for goal [ID]" | Lists updates/check-ins |
| "Update goal [ID] status to on_track" | Posts a status update check-in |
| "Update goal [ID] to at_risk — note: delayed by 2 weeks" | Posts status update with summary note |
| "Test my Atlassian connection" | Verifies credentials work |

**Valid status values:** `on_track` · `at_risk` · `off_track` · `complete` · `cancelled` · `pending`

**Goal IDs** are ARI-format strings like `ari:cloud:townsquare:{cloud-id}:goal/{uuid}`. Use "show me all my goals" — the `id` field in each goal is what you need.

## Troubleshooting

**"Error: Authentication failed"**
Your email or API token in `.env` is wrong. Double-check `ATLASSIAN_EMAIL` and `ATLASSIAN_TOKEN`.

**"Error: API error 404"**
The `ATLASSIAN_SUBDOMAIN` is wrong — check it matches your actual Atlassian URL.

**"Error: GraphQL errors: …"**
Usually a bad goal ID or a field that requires Atlas to be enabled. Check the error message text.

**Server doesn't appear in Claude Code**
Restart Claude Code after creating/editing `~/.claude/.mcp.json`. Validate JSON syntax (no trailing commas).

**"ATLASSIAN_SUBDOMAIN not set"**
Add `ATLASSIAN_SUBDOMAIN=yoursubdomain` to the vault `.env`.
