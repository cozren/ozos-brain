"""Intel Agents service — topic-driven intelligence agents.

An Intel Agent is a config object (topic + purpose + voice) persisted in
`.ozos/intel-agents.json`. Each agent's dated report instances live under
`knowledge-hub/intel-agents/<agent-id>/<agent-id>-YYYY-MM-DD.json` and are
written by the run engine (`tools/intel-agents/run.py`). Stars are stored
separately in `.ozos/intel-agents-stars.json` (agent-keyed) so generated
report files are never mutated.

Mirrors the date/age/label and lock/status machinery patterns from
`services/reporting.py`.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path

from ..config import (
    INTEL_AGENTS_DIR,
    KNOWLEDGE_HUB_DIR,
    OZOS_INTEL_AGENTS_CONFIG,
    OZOS_INTEL_AGENTS_STARS,
    OZOS_RUNS_DIR,
)

# Repo root (knowledge-hub lives at the root).
REPO_ROOT = KNOWLEDGE_HUB_DIR.parent

# Monkeypatched in tests.
CONFIG_FILE = OZOS_INTEL_AGENTS_CONFIG
STARS_FILE = OZOS_INTEL_AGENTS_STARS
INSTANCES_DIR = INTEL_AGENTS_DIR
RUNS_DIR = OZOS_RUNS_DIR

PURPOSES = {"linkedin", "research"}
VOICES = {"me", "executive", "research"}
DATE_RE = r"(\d{4}-\d{2}-\d{2})"

_EDITABLE_FIELDS = (
    "name",
    "purpose",
    "voice",
    "focus",
    "keywords",
    "sources_prefer",
    "sources_avoid",
    "searches_per_run",
)


# --- Config store ----------------------------------------------------------


def _load_config() -> list[dict]:
    if not CONFIG_FILE.exists():
        return []
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return list(data.get("agents", []))
    except (json.JSONDecodeError, OSError):
        return []


def _read_config_document() -> dict:
    """The whole config file (agents + other top-level keys such as voice_text)."""
    if not CONFIG_FILE.exists():
        return {}
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_config(agents: list[dict]) -> None:
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    document = _read_config_document()
    document["agents"] = agents
    CONFIG_FILE.write_text(json.dumps(document, indent=2), encoding="utf-8")


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return slug or "agent"


def _unique_slug(base: str, existing_ids: set[str]) -> str:
    if base not in existing_ids:
        return base
    n = 2
    while f"{base}-{n}" in existing_ids:
        n += 1
    return f"{base}-{n}"


def _clamp_searches(value) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        v = 6
    return max(1, min(12, v))


def list_agents() -> list[dict]:
    return _load_config()


def get_agent(agent_id: str) -> dict | None:
    return next((a for a in _load_config() if a.get("id") == agent_id), None)


def create_agent(body: dict) -> dict:
    agents = _load_config()
    existing_ids = {a.get("id") for a in agents}
    agent = {
        "id": _unique_slug(_slugify(body.get("name", "")), existing_ids),
        "name": body.get("name", ""),
        "purpose": body.get("purpose") if body.get("purpose") in PURPOSES else "linkedin",
        "voice": body.get("voice") if body.get("voice") in VOICES else "me",
        "focus": body.get("focus", ""),
        "keywords": list(body.get("keywords") or []),
        "sources_prefer": list(body.get("sources_prefer") or []),
        "sources_avoid": list(body.get("sources_avoid") or []),
        "searches_per_run": _clamp_searches(body.get("searches_per_run", 6)),
        "enabled": True,
        "created_at": datetime.now().strftime("%Y-%m-%d"),
    }
    agents.append(agent)
    _save_config(agents)
    return agent


def update_agent(agent_id: str, body: dict) -> dict | None:
    agents = _load_config()
    idx = next((i for i, a in enumerate(agents) if a.get("id") == agent_id), None)
    if idx is None:
        return None
    agent = agents[idx]
    for field in _EDITABLE_FIELDS:
        if field not in body:
            continue
        if field == "purpose":
            agent[field] = body[field] if body[field] in PURPOSES else agent.get(field, "linkedin")
        elif field == "voice":
            agent[field] = body[field] if body[field] in VOICES else agent.get(field, "me")
        elif field in ("keywords", "sources_prefer", "sources_avoid"):
            agent[field] = list(body[field] or [])
        elif field == "searches_per_run":
            agent[field] = _clamp_searches(body[field])
        else:
            agent[field] = body[field]
    if "enabled" in body:
        agent["enabled"] = bool(body["enabled"])
    agents[idx] = agent
    _save_config(agents)
    return agent


def delete_agent(agent_id: str) -> bool:
    agents = _load_config()
    remaining = [a for a in agents if a.get("id") != agent_id]
    if len(remaining) == len(agents):
        return False
    _save_config(remaining)
    return True


# --- Stars -----------------------------------------------------------------


def _load_stars() -> dict:
    if not STARS_FILE.exists():
        return {}
    try:
        data = json.loads(STARS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_stars(stars: dict) -> None:
    STARS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STARS_FILE.write_text(json.dumps(stars, indent=2), encoding="utf-8")


def starred_ids(agent_id: str) -> set[str]:
    return set(_load_stars().get(agent_id, []))


def set_star(agent_id: str, instance_id: str, starred: bool) -> bool:
    stars = _load_stars()
    ids = list(stars.get(agent_id, []))
    if starred:
        if instance_id not in ids:
            ids.append(instance_id)
    else:
        ids = [i for i in ids if i != instance_id]
    if ids:
        stars[agent_id] = ids
    else:
        stars.pop(agent_id, None)
    _save_stars(stars)
    return starred


# --- Instances -------------------------------------------------------------


def _agent_dir(agent_id: str) -> Path:
    return INSTANCES_DIR / agent_id


def _date_of(path: Path) -> str | None:
    m = re.search(DATE_RE, path.name)
    return m.group(1) if m else None


def _human_age(date_str: str) -> str:
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return ""
    days = (datetime.now().date() - d).days
    if days <= 0:
        return "today"
    if days == 1:
        return "yesterday"
    if days < 7:
        return f"{days}d ago"
    if days < 30:
        return f"{days // 7}w ago"
    if days < 365:
        return f"{days // 30}mo ago"
    return f"{days // 365}y ago"


def _pretty_label(date_str: str) -> str:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").strftime("%b %-d, %Y")
    except ValueError:
        return date_str


def list_reports(agent_id: str) -> list[dict] | None:
    if get_agent(agent_id) is None:
        return None
    starred = starred_ids(agent_id)
    folder = _agent_dir(agent_id)
    items: list[dict] = []
    if folder.exists():
        for path in folder.glob("*.json"):
            date = _date_of(path)
            if not date:
                continue
            iid = path.name
            items.append(
                {
                    "id": iid,
                    "date": date,
                    "label": _pretty_label(date),
                    "age": _human_age(date),
                    "starred": iid in starred,
                }
            )
    items.sort(key=lambda it: it["date"], reverse=True)  # newest first
    return items


def get_report(agent_id: str, instance_id: str) -> dict | None:
    agent = get_agent(agent_id)
    if agent is None:
        return None
    reports = list_reports(agent_id) or []
    if instance_id == "latest":
        if not reports:
            return None
        instance_id = reports[0]["id"]

    match = next((it for it in reports if it["id"] == instance_id), None)
    if match is None:
        return None
    path = _agent_dir(agent_id) / instance_id
    if not path.exists():
        return None
    content = path.read_text(encoding="utf-8")
    # Prefer the purpose recorded inside the report; fall back to the agent's.
    purpose = agent.get("purpose", "linkedin")
    try:
        purpose = json.loads(content).get("purpose", purpose)
    except json.JSONDecodeError:
        pass
    return {
        "id": match["id"],
        "date": match["date"],
        "label": match["label"],
        "purpose": purpose,
        "starred": match["starred"],
        "content": content,
    }


# --- Running ---------------------------------------------------------------


def _lock_path(agent_id: str) -> Path:
    return RUNS_DIR / f"{agent_id}.lock"


def _status_path(agent_id: str) -> Path:
    return RUNS_DIR / f"{agent_id}.run-status.json"


def _launch(target) -> None:
    """Run target in a background daemon thread (patched inline in tests)."""
    threading.Thread(target=target, daemon=True).start()


def _execute(agent_id: str) -> None:
    exit_code = 1
    try:
        proc = subprocess.run(
            [sys.executable, "tools/intel-agents/run.py", agent_id],
            cwd=REPO_ROOT,
        )
        exit_code = proc.returncode
    finally:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        _status_path(agent_id).write_text(
            json.dumps({"ts": datetime.now().isoformat(), "exit": exit_code})
        )
        _lock_path(agent_id).unlink(missing_ok=True)


def run_agent(agent_id: str) -> dict | None:
    """Start an agent's run. Returns None if the agent is unknown, else
    {'state': 'started'} or {'state': 'running'} if a run is already locked."""
    if get_agent(agent_id) is None:
        return None
    if _lock_path(agent_id).exists():
        return {"state": "running"}
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    _lock_path(agent_id).write_text(datetime.now().isoformat())
    _launch(lambda: _execute(agent_id))
    return {"state": "started"}


def run_status(agent_id: str) -> dict | None:
    if get_agent(agent_id) is None:
        return None
    if _lock_path(agent_id).exists():
        return {"state": "running", "last_run": None, "last_exit": None}
    status_path = _status_path(agent_id)
    if status_path.exists():
        data = json.loads(status_path.read_text())
        return {
            "state": "idle" if data.get("exit") == 0 else "error",
            "last_run": data.get("ts"),
            "last_exit": data.get("exit"),
        }
    return {"state": "idle", "last_run": None, "last_exit": None}
