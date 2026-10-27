"""Pull goals from the Atlassian Goals connector into <vault>/.ozos/goals.json.

Credentials are the same four variables the Setup page writes to the vault .env
(ATLASSIAN_EMAIL, ATLASSIAN_TOKEN, ATLASSIAN_SUBDOMAIN, ATLASSIAN_CLOUD_ID). The
file is re-read on every sync because Setup writes it while the app is running;
a shell variable is only a fallback. `fetch_remote` is the seam tests replace.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import dotenv_values

from ..config import REPO_ROOT
from . import goals, setup_actions
from .setup_actions import _slug as slug

ENV_NAMES = ("ATLASSIAN_EMAIL", "ATLASSIAN_TOKEN", "ATLASSIAN_SUBDOMAIN", "ATLASSIAN_CLOUD_ID")
ENV_FILE: Path = setup_actions.ENV_FILE  # tests monkeypatch this
CONNECTOR_DIR = REPO_ROOT / "connectors" / "atlassian-goals"
SOURCE = "atlassian"
FETCH_LIMIT = 200
# Spellings seen on the read side that differ from the connector's write vocabulary.
STATUS_ALIASES = {"completed": "complete", "paused": "pending"}


def credentials() -> tuple[dict[str, str], list[str]]:
    """Values for ENV_NAMES (vault .env first, then the process environment) and
    the names still empty, in ENV_NAMES order."""
    from_file = dotenv_values(ENV_FILE) if ENV_FILE.is_file() else {}
    values: dict[str, str] = {}
    for name in ENV_NAMES:
        value = (from_file.get(name) or "").strip() or (os.environ.get(name) or "").strip()
        values[name] = value
    missing = [name for name in ENV_NAMES if not values[name]]
    return values, missing


def connector_status() -> dict:
    _, missing = credentials()
    return {"configured": not missing, "missing": missing}


def _client(creds: dict[str, str]):
    if str(CONNECTOR_DIR) not in sys.path:
        sys.path.insert(0, str(CONNECTOR_DIR))
    from api_client import AtlassianGoalsClient  # noqa: PLC0415

    return AtlassianGoalsClient(
        email=creds["ATLASSIAN_EMAIL"],
        api_token=creds["ATLASSIAN_TOKEN"],
        subdomain=creds["ATLASSIAN_SUBDOMAIN"],
        cloud_id=creds["ATLASSIAN_CLOUD_ID"],
    )


def fetch_remote(creds: dict[str, str]) -> list[dict]:
    """The connector's goal nodes as dicts. Raises RuntimeError with the
    connector's own message when it answers `Error: …`."""
    result = asyncio.run(_client(creds).list_goals(limit=FETCH_LIMIT))
    if result.startswith("Error:"):
        raise RuntimeError(result)
    nodes = json.loads(result)
    if not isinstance(nodes, list):
        raise RuntimeError("Error: expected a list of goals from the connector")
    return [n for n in nodes if isinstance(n, dict)]


def map_remote_goal(node: dict) -> dict:
    external_id = str(node.get("id") or "")
    status = str(((node.get("status") or {}).get("value")) or "").lower()
    status = STATUS_ALIASES.get(status, status)
    percentage = (node.get("progress") or {}).get("percentage")
    return goals.normalize_goal(
        {
            "id": "atlassian-" + (slug(external_id.rsplit("/", 1)[-1]) or slug(external_id)),
            "title": node.get("name") or "",
            "status": status if status in goals.STATUSES else "pending",
            "progress": percentage if percentage is not None else None,
            "owner": (node.get("owner") or {}).get("name") or "",
            "target_date": (node.get("targetDate") or {}).get("label") or "",
            "external_id": external_id,
        },
        source=SOURCE,
    )


def sync_goals(now: datetime | None = None) -> dict:
    """LookupError when a credential is missing (nothing written); RuntimeError
    when the remote call fails (failure recorded in goals.json)."""
    creds, missing = credentials()
    if missing:
        raise LookupError(f"{missing[0]} is not set")
    # Fetching and mapping both count as "the pull": any failure is recorded so the
    # Setup item can show needs_attention, and nothing in goals.json is replaced.
    try:
        nodes = fetch_remote(creds)
        mapped = [map_remote_goal(n) for n in nodes]
    except Exception as exc:
        goals.record_sync_failure(str(exc), now)
        raise RuntimeError(str(exc)) from exc
    state = goals.replace_synced(mapped, SOURCE, now)
    return {"synced": len(mapped), "sync": state["sync"]}
