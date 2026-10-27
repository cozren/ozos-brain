"""The setup journal's items: what a new company's onboarding consists of.

Pure data. This module must stay importable without `backend.config` (the `ozos`
CLI and the `/ozos-setup` skill read it from outside the app), so it imports
nothing from the app.

Each item:
  id            stable key used in <vault>/.ozos/setup.json
  group         one of GROUPS
  title / why   what the page shows
  writes        the vault file or env var the item's form writes (human string)
  setup_doc     repo-relative markdown the /ozos-setup skill walks through, or None
  kind          which form the page renders:
                profile | gmail | manual | routing | mcp | env | folder | people |
                cycle | goals | placeholder
  vital         vitals.json id whose failure/staleness turns a done item into
                needs_attention, or None ("goals-sync" is synthesised by setup_view
                from the last goals sync, not read from vitals.json)
  env           .env variable names the item's form may write (the whitelist)
  mcp_match     lowercase substring matched against `claude mcp list` names
  default_folder  default knowledge-hub folder name for folder items
"""

from __future__ import annotations

STATUSES = ("not_started", "in_progress", "done", "skipped", "needs_attention")

GROUPS: list[tuple[str, str]] = [
    ("you", "You"),
    ("meeting-notes", "Meeting notes"),
    ("workspace", "Chat & workspace"),
    ("boards", "Boards"),
    ("documentation", "Documentation"),
    ("people", "People"),
    ("review-cycle", "Review cycle"),
    ("goals", "Goals"),
    ("data", "Data"),
    ("insights", "Insights"),
]


def _item(
    id: str,
    group: str,
    title: str,
    why: str,
    writes: str,
    kind: str,
    *,
    setup_doc: str | None = None,
    vital: str | None = None,
    env: list[str] | None = None,
    mcp_match: str | None = None,
    default_folder: str | None = None,
) -> dict:
    return {
        "id": id,
        "group": group,
        "title": title,
        "why": why,
        "writes": writes,
        "kind": kind,
        "setup_doc": setup_doc,
        "vital": vital,
        "env": list(env or []),
        "mcp_match": mcp_match,
        "default_folder": default_folder,
    }


ITEMS: list[dict] = [
    _item(
        "profile",
        "you",
        "Your profile",
        "Your name, person id and writing voice drive the greeting, tasks and intel agents.",
        "~/.ozos/config.json (via ozos init)",
        "profile",
    ),
    _item(
        "gmail-gemini",
        "meeting-notes",
        "Gemini notes via Gmail",
        "Meeting notes arrive automatically at every session start once Gmail is authorised.",
        "~/.gdrive-credentials.json, OAuth token, .ozos/meeting-routing.json",
        "gmail",
        setup_doc="docs/connectors/gmail-gemini-notes.md",
        vital="meeting-notes",
    ),
    _item(
        "granola",
        "meeting-notes",
        "Granola",
        "Granola meetings flow into the same notes pipeline through /sync-notes.",
        "(nothing; the Granola MCP in Claude Code)",
        "manual",
        setup_doc="docs/connectors/granola.md",
        vital="meeting-notes",
    ),
    _item(
        "routing-folders",
        "meeting-notes",
        "Routing folders",
        "The folders a note can land in; start with the teams you already know.",
        ".ozos/meeting-routing.json",
        "routing",
    ),
    _item(
        "slack-mcp",
        "workspace",
        "Slack",
        "Lets the chat read channels and threads you point it at.",
        "(nothing; Claude Code MCP)",
        "mcp",
        mcp_match="slack",
    ),
    _item(
        "google-workspace-mcp",
        "workspace",
        "Google Workspace",
        "Drive, Docs and Calendar access for the chat and for importing documents.",
        "(nothing; Claude Code MCP)",
        "mcp",
        mcp_match="google",
    ),
    _item(
        "figma-mcp",
        "boards",
        "Figma",
        "Design files become readable context for the chat.",
        "(nothing; Claude Code MCP)",
        "mcp",
        mcp_match="figma",
    ),
    _item(
        "miro-mcp",
        "boards",
        "Miro",
        "Boards become readable context for the chat.",
        "(nothing; Claude Code MCP)",
        "mcp",
        mcp_match="miro",
    ),
    _item(
        "confluence",
        "documentation",
        "Confluence",
        "Confluence search in the chat needs an Atlassian API token.",
        ".env (ATLASSIAN_EMAIL, ATLASSIAN_TOKEN, ATLASSIAN_SUBDOMAIN)",
        "env",
        setup_doc="connectors/atlassian-goals/setup.md",
        env=["ATLASSIAN_EMAIL", "ATLASSIAN_TOKEN", "ATLASSIAN_SUBDOMAIN"],
    ),
    _item(
        "notion-or-wiki-drop-folder",
        "documentation",
        "Notion or wiki exports",
        "Anything you can export as Markdown becomes searchable once it sits in the vault.",
        "knowledge-hub/<folder>, .ozos/knowledge-sources.json",
        "folder",
        default_folder="wiki",
    ),
    _item(
        "pdf-drop-folder",
        "documentation",
        "PDF drop folder",
        "PDFs dropped here are ingested into the Knowledge Hub.",
        "knowledge-hub/<folder>, .ozos/knowledge-sources.json",
        "folder",
        default_folder="pdfs",
    ),
    _item(
        "add-stakeholder",
        "people",
        "Add a stakeholder",
        "One action creates the person, routes their meetings and seeds the leadership rule.",
        "people-hub/people/<id>/meta.yaml, .ozos/meeting-routing.json",
        "people",
    ),
    _item(
        "define-cycle",
        "review-cycle",
        "Review cycle",
        "Enter the company's review stages and dates, or accept the default manager cadence.",
        "people-hub/cycles.yaml or .ozos/setup.json (cadence)",
        "cycle",
    ),
    _item(
        "define-goals",
        "goals",
        "Goals",
        "Add goals by hand, or connect Atlassian Goals and pull them in; each goal can later "
        "bind to a data point.",
        ".ozos/goals.json, .env (ATLASSIAN_*)",
        "goals",
        setup_doc="connectors/atlassian-goals/setup.md",
        vital="goals-sync",
        env=["ATLASSIAN_EMAIL", "ATLASSIAN_TOKEN", "ATLASSIAN_SUBDOMAIN", "ATLASSIAN_CLOUD_ID"],
    ),
    _item(
        "first-data-point",
        "data",
        "First data point",
        "Data points (Metabase card, SQL, CSV) feed Data Hub tiles in Phase 4.",
        "(Phase 4)",
        "placeholder",
        setup_doc="connectors/metabase/setup.md",
    ),
    _item(
        "interviews-folder",
        "insights",
        "User interview notes",
        "A drop folder for interview notes so the chat can quote them.",
        "knowledge-hub/<folder>, .ozos/knowledge-sources.json",
        "folder",
        default_folder="user-interviews",
    ),
    _item(
        "surveys-folder",
        "insights",
        "Survey exports",
        "A drop folder for survey exports and summaries.",
        "knowledge-hub/<folder>, .ozos/knowledge-sources.json",
        "folder",
        default_folder="surveys",
    ),
]

ITEM_IDS: list[str] = [it["id"] for it in ITEMS]
_BY_ID = {it["id"]: it for it in ITEMS}


def item(item_id: str) -> dict | None:
    return _BY_ID.get(item_id)


def env_whitelist() -> list[str]:
    names: list[str] = []
    for it in ITEMS:
        for n in it["env"]:
            if n not in names:
                names.append(n)
    return names
