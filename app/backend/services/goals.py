"""Goals in the vault: <vault>/.ozos/goals.json.

One file holds goals added by hand (`source == "manual"`) and goals pulled from a
connector (`source == "atlassian"`); both use the connector's status vocabulary
so the Goals page needs one chip. Synced goals are read-only here except for
`data_point_id`, the Phase 4 binding to a Data Hub data point.

Shape:
  {"goals": [goal...],
   "sync": null | {"last_run": iso, "status": "ok" | "fail", "message": str, "count": int}}

Reads are tolerant (missing or malformed file → no goals); writes are atomic.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from ..config import OZOS_GOALS_FILE
from . import setup_state
from .setup_actions import _slug as slug

GOALS_FILE: Path = OZOS_GOALS_FILE  # tests monkeypatch this

STATUSES = ("on_track", "at_risk", "off_track", "complete", "cancelled", "pending")
SOURCES = ("manual", "atlassian")
SETUP_ITEM = "define-goals"

_EDITABLE = ("title", "description", "owner", "status", "progress", "target_date", "data_point_id")


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _blank(source: str) -> dict:
    return {
        "id": "",
        "title": "",
        "description": "",
        "owner": "",
        "status": "pending",
        "progress": None,
        "target_date": "",
        "source": source,
        "external_id": None,
        "data_point_id": None,
        "updated_at": None,
        "synced_at": None,
    }


def normalize_goal(raw: dict, *, source: str) -> dict:
    """Fill defaults and validate. Raises ValueError on a blank title, an unknown
    status or a progress outside 0..100."""
    if source not in SOURCES:
        raise ValueError(f"unknown goal source: {source}")
    goal = _blank(source)
    for key in goal:
        if key in raw and raw[key] is not None and key != "source":
            goal[key] = raw[key]
    goal["title"] = str(goal["title"]).strip()
    if not goal["title"]:
        raise ValueError("title is required")
    for key in ("id", "description", "owner", "target_date"):
        goal[key] = str(goal[key] or "")
    goal["status"] = str(goal["status"]).lower()
    if goal["status"] not in STATUSES:
        raise ValueError(f"status must be one of {', '.join(STATUSES)}")
    progress = goal["progress"]
    if progress is not None:
        if isinstance(progress, bool) or not isinstance(progress, (int, float)):
            raise ValueError("progress must be a number between 0 and 100")
        progress = int(round(progress))
        if not 0 <= progress <= 100:
            raise ValueError("progress must be between 0 and 100")
        goal["progress"] = progress
    for key in ("external_id", "data_point_id", "updated_at", "synced_at"):
        goal[key] = str(goal[key]) if goal[key] not in (None, "") else None
    return goal


def _tolerant_goal(raw: dict) -> dict | None:
    """A stored goal that fails validation is kept with the bad fields reset
    rather than dropped, so a hand edit cannot make goals vanish."""
    source = raw.get("source") if raw.get("source") in SOURCES else "manual"
    try:
        return normalize_goal(raw, source=source)
    except ValueError:
        fixed = dict(raw)
        if str(fixed.get("status", "")).lower() not in STATUSES:
            fixed["status"] = "pending"
        try:
            fixed["progress"] = (
                None if fixed.get("progress") is None else min(100, max(0, int(fixed["progress"])))
            )
        except (TypeError, ValueError):
            fixed["progress"] = None
        if not str(fixed.get("title") or "").strip():
            return None
        return normalize_goal(fixed, source=source)


def load_goals() -> dict:
    raw: dict = {}
    try:
        loaded = json.loads(GOALS_FILE.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            raw = loaded
    except (OSError, ValueError):
        raw = {}
    goals: list[dict] = []
    for entry in raw.get("goals") or []:
        if isinstance(entry, dict):
            goal = _tolerant_goal(entry)
            if goal is not None:
                goals.append(goal)
    sync = raw.get("sync")
    return {"goals": goals, "sync": sync if isinstance(sync, dict) else None}


def save_goals(state: dict) -> None:
    GOALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = GOALS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, GOALS_FILE)


def _find(state: dict, goal_id: str) -> dict:
    for goal in state["goals"]:
        if goal["id"] == goal_id:
            return goal
    raise KeyError(goal_id)


def add_goal(payload: dict) -> dict:
    goal = normalize_goal({k: v for k, v in payload.items() if k != "id"}, source="manual")
    goal["id"] = slug(goal["title"])
    if not goal["id"]:
        raise ValueError("title must contain a letter or a digit")
    state = load_goals()
    if any(g["id"] == goal["id"] for g in state["goals"]):
        raise FileExistsError(goal["id"])
    goal["updated_at"] = _now()
    state["goals"].append(goal)
    save_goals(state)
    setup_state.set_status(SETUP_ITEM, "done")
    return goal


def update_goal(goal_id: str, patch: dict) -> dict:
    state = load_goals()
    goal = _find(state, goal_id)
    changes = {k: v for k, v in patch.items() if k in _EDITABLE}
    if goal["source"] != "manual" and any(k != "data_point_id" for k in changes):
        raise PermissionError(f"synced from {goal['source']}; change it there")
    merged = {**goal, **changes}
    merged["id"] = goal["id"]
    # None means "clear" for the two nullable fields; normalize_goal skips None.
    updated = normalize_goal(merged, source=goal["source"])
    for key in ("progress", "data_point_id"):
        if key in changes and changes[key] is None:
            updated[key] = None
    updated["updated_at"] = _now()
    state["goals"] = [updated if g["id"] == goal_id else g for g in state["goals"]]
    save_goals(state)
    return updated


def delete_goal(goal_id: str) -> None:
    state = load_goals()
    goal = _find(state, goal_id)
    if goal["source"] != "manual":
        raise PermissionError(f"synced from {goal['source']}; delete it there")
    state["goals"] = [g for g in state["goals"] if g["id"] != goal_id]
    save_goals(state)


def replace_synced(new_goals: list[dict], source: str, now: datetime | None = None) -> dict:
    """Replace every goal of `source` with `new_goals` (already normalized), carrying
    each surviving goal's data-point binding over by external id."""
    stamp = (now or datetime.now()).isoformat(timespec="seconds")
    state = load_goals()
    previous = {g["external_id"]: g for g in state["goals"] if g["source"] == source}
    kept = [g for g in state["goals"] if g["source"] != source]
    for goal in new_goals:
        old = previous.get(goal["external_id"])
        if old is not None and goal.get("data_point_id") is None:
            goal["data_point_id"] = old["data_point_id"]
        goal["synced_at"] = stamp
        goal["updated_at"] = stamp
    state["goals"] = kept + list(new_goals)
    state["sync"] = {"last_run": stamp, "status": "ok", "message": "", "count": len(new_goals)}
    save_goals(state)
    setup_state.set_status(SETUP_ITEM, "done")
    return state


def record_sync_failure(message: str, now: datetime | None = None) -> dict:
    state = load_goals()
    state["sync"] = {
        "last_run": (now or datetime.now()).isoformat(timespec="seconds"),
        "status": "fail",
        "message": str(message),
        "count": 0,
    }
    save_goals(state)
    return state


def sync_health() -> dict | None:
    """The last sync as a vital-shaped record for the Setup page, or None when a
    sync has never run."""
    sync = load_goals()["sync"]
    if not sync:
        return None
    status = "fail" if sync.get("status") == "fail" else "ok"
    return {"id": "goals-sync", "status": status, "message": str(sync.get("message") or "")}
