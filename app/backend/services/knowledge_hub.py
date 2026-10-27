import os
import re
import httpx
from ..config import KNOWLEDGE_HUB_DIR, DATA_DIR

# Confluence connection — everything comes from the vault .env:
# ATLASSIAN_SUBDOMAIN (the part before .atlassian.net), ATLASSIAN_EMAIL, ATLASSIAN_TOKEN.


def confluence_base() -> str:
    sub = os.getenv("ATLASSIAN_SUBDOMAIN", "").strip()
    return f"https://{sub}.atlassian.net" if sub else ""


def confluence_user() -> str:
    return os.getenv("ATLASSIAN_EMAIL", "").strip()


def _confluence_token() -> str:
    return os.getenv("ATLASSIAN_TOKEN", "").strip()


def _confluence_config_error() -> str | None:
    missing = [
        name
        for name, value in (
            ("ATLASSIAN_SUBDOMAIN", confluence_base()),
            ("ATLASSIAN_EMAIL", confluence_user()),
            ("ATLASSIAN_TOKEN", _confluence_token()),
        )
        if not value
    ]
    if missing:
        return f"{', '.join(missing)} not set in the vault .env — Confluence access unavailable."
    return None


def _strip_html(html: str) -> str:
    """Very lightweight HTML → plain text for Confluence body content."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


# ── Local knowledge-hub tools ─────────────────────────────────────────────────


def get_meeting_notes(person_name: str, limit: int = 5) -> list[dict]:
    folder = KNOWLEDGE_HUB_DIR / "meeting-notes" / person_name
    if not folder.exists():
        available = [d.name for d in (KNOWLEDGE_HUB_DIR / "meeting-notes").iterdir() if d.is_dir()]
        return [
            {
                "error": f"No meeting notes found for '{person_name}'. Available: {', '.join(sorted(available))}"
            }
        ]
    files = sorted(folder.glob("*.md"), reverse=True)[:limit]
    return [{"filename": f.name, "content": f.read_text(encoding="utf-8")[:3000]} for f in files]


def get_review_document(person_id: str) -> dict:
    from . import data as svc

    cycles = svc.read_cycles()
    active_cycle = cycles.get("active_cycle", "")
    cycle_dir = DATA_DIR / "people" / person_id / "cycles" / active_cycle
    if not cycle_dir.exists():
        return {"error": f"No cycle directory for '{person_id}' / '{active_cycle}'"}
    md_files = list(cycle_dir.glob("*.md"))
    if not md_files:
        return {"error": f"No review document for '{person_id}' in cycle '{active_cycle}'"}
    content = md_files[0].read_text(encoding="utf-8")
    return {"filename": md_files[0].name, "content": content[:8000]}


# ── Confluence tools ──────────────────────────────────────────────────────────


def search_confluence(query: str, limit: int = 5) -> list[dict]:
    if err := _confluence_config_error():
        return [{"error": err}]
    try:
        resp = httpx.get(
            f"{confluence_base()}/wiki/rest/api/search",
            params={
                "cql": f'text ~ "{query}" AND type = page',
                "limit": limit,
                "expand": "content.body.view",
            },
            auth=(confluence_user(), _confluence_token()),
            timeout=15,
        )
        resp.raise_for_status()
        results = []
        for item in resp.json().get("results", []):
            content_obj = item.get("content", {})
            body_html = content_obj.get("body", {}).get("view", {}).get("value", "")
            results.append(
                {
                    "page_id": content_obj.get("id", ""),
                    "title": item.get("title", ""),
                    "url": f"{confluence_base()}/wiki{item.get('url', '')}",
                    "excerpt": _strip_html(item.get("excerpt", "")),
                    "body": _strip_html(body_html)[:4000],
                }
            )
        return results if results else [{"info": f"No Confluence pages found for query: {query}"}]
    except httpx.HTTPStatusError as e:
        return [
            {"error": f"Confluence API error {e.response.status_code}: {e.response.text[:200]}"}
        ]
    except Exception as e:
        return [{"error": f"Confluence request failed: {str(e)}"}]


def get_confluence_page(page_id: str) -> dict:
    if err := _confluence_config_error():
        return {"error": err}
    try:
        resp = httpx.get(
            f"{confluence_base()}/wiki/rest/api/content/{page_id}",
            params={"expand": "body.view"},
            auth=(confluence_user(), _confluence_token()),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        body_html = data.get("body", {}).get("view", {}).get("value", "")
        return {
            "page_id": page_id,
            "title": data.get("title", ""),
            "url": f"{confluence_base()}/wiki{data.get('_links', {}).get('webui', '')}",
            "body": _strip_html(body_html)[:8000],
        }
    except httpx.HTTPStatusError as e:
        return {"error": f"Confluence API error {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e:
        return {"error": f"Confluence request failed: {str(e)}"}


# ── Registry ──────────────────────────────────────────────────────────────────

TOOL_EXECUTORS = {
    "get_meeting_notes": lambda inp: get_meeting_notes(inp["person_name"], inp.get("limit", 5)),
    "get_review_document": lambda inp: get_review_document(inp["person_id"]),
    "search_confluence": lambda inp: search_confluence(inp["query"], inp.get("limit", 5)),
    "get_confluence_page": lambda inp: get_confluence_page(inp["page_id"]),
}

TOOLS = [
    {
        "name": "get_meeting_notes",
        "description": (
            "Get recent 1:1 meeting notes or minutes for a specific person from the local knowledge hub. "
            "Use when asked about meetings, conversations, discussions, commitments, or 1:1 history. "
            "person_name must be the exact name of a folder under knowledge-hub/meeting-notes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "person_name": {
                    "type": "string",
                    "description": "Exact folder name (a person or a team folder)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of most recent notes (default 5, max 20)",
                },
            },
            "required": ["person_name"],
        },
    },
    {
        "name": "get_review_document",
        "description": (
            "Get the full text of an uploaded performance review PDF (converted to markdown) for a person "
            "in the active performance cycle. Use for detailed review content or qualitative feedback."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "person_id": {
                    "type": "string",
                    "description": "Lowercase person id (the folder name under people-hub/people)",
                },
            },
            "required": ["person_id"],
        },
    },
    {
        "name": "search_confluence",
        "description": (
            "Search Confluence for pages by keyword or topic. Use when asked about OKRs, goals, team pages, "
            "strategy docs, roadmaps, or any company knowledge stored in Confluence. "
            "Returns page titles, URLs, and content excerpts."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search terms, e.g. 'team OKRs', 'product roadmap Q2'",
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of pages to return (default 5)",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_confluence_page",
        "description": (
            "Fetch the full content of a specific Confluence page by its page ID. "
            "Use this after search_confluence returns a relevant page_id to get complete content."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "page_id": {
                    "type": "string",
                    "description": "Confluence page ID from search results",
                },
            },
            "required": ["page_id"],
        },
    },
]
