"""The Setup page's read model: registry + stored state + derived states.

Derived at read time, never stored:
  profile          done when ~/.ozos/config.json has a name and a person id
  MCP items        done when `claude mcp list` shows a matching connected server
  needs_attention  a done item whose vital failed or is stale; the goals item's
                   "vital" is the outcome of the last Atlassian sync

Discovery helpers are module attributes so tests can replace them.
"""

from __future__ import annotations

from ..vault import load_user_config as _load_user_config
from . import goals, setup_state
from .control_tower import discover_mcps as _discover_mcps
from .control_tower import load_vitals as _load_vitals
from .setup_registry import GROUPS, ITEMS

load_user_config = _load_user_config
discover_mcps = _discover_mcps
load_vitals = _load_vitals
load_goals_sync = goals.sync_health  # None until a goals sync has run

_CONNECTED = ("active", "pending")


def _safe(fn, default):
    try:
        return fn()
    except Exception:
        return default


def _mcp_names(mcps: dict) -> list[dict]:
    return list(mcps.get("remote") or []) + list(mcps.get("local") or [])


def _item_view(it: dict, stored: dict, ctx: dict) -> dict:
    status = stored["status"]
    derived: dict | None = None

    if it["kind"] == "profile":
        cfg = ctx["config"]
        derived = {
            "profile": {
                "name": str(cfg.get("name") or ""),
                "me": str(cfg.get("me") or ""),
                "voice_text": str(cfg.get("voice_text") or ""),
            }
        }
        if cfg.get("name") and cfg.get("me") and status != "skipped":
            status = "done"

    if it["kind"] == "mcp" and it["mcp_match"]:
        match = it["mcp_match"]
        names = [
            m["name"]
            for m in ctx["mcps"]
            if match in str(m.get("name", "")).lower() and m.get("status") in _CONNECTED
        ]
        derived = {"mcp": {"connected": bool(names), "names": names}}
        if names and status != "skipped":
            status = "done"

    if it["vital"]:
        vital = ctx["vitals"].get(it["vital"])
        if vital is not None:
            derived = {"vital": {"status": vital.get("status")}}
            if status == "done" and vital.get("status") in ("fail", "warn"):
                status = "needs_attention"

    return {
        **it,
        "status": status,
        "updated_at": stored.get("updated_at"),
        "notes": stored.get("notes") or "",
        "rows": list(stored.get("rows") or []),
        "derived": derived,
    }


def build_view() -> dict:
    state = setup_state.load_state()
    vitals: dict[str, dict] = {}
    goals_sync = _safe(load_goals_sync, None)
    if goals_sync:
        vitals[goals_sync["id"]] = goals_sync
    # A real vital of the same id (from vitals.json) wins over the synthetic one.
    vitals.update({v["id"]: v for v in (_safe(load_vitals, []) or []) if "id" in v})
    ctx = {
        "config": _safe(load_user_config, {}) or {},
        "mcps": _mcp_names(_safe(discover_mcps, {}) or {}),
        "vitals": vitals,
    }
    views = [_item_view(it, state["items"][it["id"]], ctx) for it in ITEMS]
    by_group: dict[str, list[dict]] = {g: [] for g, _ in GROUPS}
    for v in views:
        by_group[v["group"]].append(v)
    done = sum(1 for v in views if v["status"] == "done")
    skipped = sum(1 for v in views if v["status"] == "skipped")
    return {
        "groups": [{"id": g, "label": label, "items": by_group[g]} for g, label in GROUPS],
        "summary": {
            "done": done,
            "total": len(views),
            "open": len(views) - done - skipped,
            "badge_dismissed": state["badge_dismissed"],
        },
        "cadence": state["cadence"],
    }


def item_view(item_id: str) -> dict | None:
    for g in build_view()["groups"]:
        for it in g["items"]:
            if it["id"] == item_id:
                return it
    return None
