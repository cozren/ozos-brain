"""Read and write <vault>/.ozos/setup.json — the setup journal's stored state.

Shape:
  {"items": {"<item-id>": {"status", "updated_at", "notes", "rows"?}},
   "badge_dismissed": bool,
   "cadence": null | {...}}

Reads are tolerant (missing or malformed file → everything not_started); writes
are explicit and atomic. Derived states (profile done, MCP connected,
needs_attention) are NOT stored here — see setup_view.py.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from ..config import OZOS_SETUP_FILE
from .setup_registry import ITEM_IDS, STATUSES

SETUP_FILE: Path = OZOS_SETUP_FILE  # tests monkeypatch this


def _blank_entry() -> dict:
    return {"status": "not_started", "updated_at": None, "notes": ""}


def load_state() -> dict:
    raw: dict = {}
    try:
        loaded = json.loads(SETUP_FILE.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            raw = loaded
    except (OSError, ValueError):
        raw = {}
    stored_items = raw.get("items") if isinstance(raw.get("items"), dict) else {}
    items: dict[str, dict] = {}
    for item_id in ITEM_IDS:
        entry = _blank_entry()
        stored = stored_items.get(item_id)
        if isinstance(stored, dict):
            entry.update({k: v for k, v in stored.items() if k in ("updated_at", "notes", "rows")})
            if stored.get("status") in STATUSES:
                entry["status"] = stored["status"]
        items[item_id] = entry
    cadence = raw.get("cadence")
    return {
        "items": items,
        "badge_dismissed": bool(raw.get("badge_dismissed", False)),
        "cadence": cadence if isinstance(cadence, dict) else None,
    }


def save_state(state: dict) -> None:
    SETUP_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = SETUP_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, SETUP_FILE)


def set_status(item_id: str, status: str, notes: str | None = None) -> dict:
    if item_id not in ITEM_IDS:
        raise KeyError(item_id)
    if status not in STATUSES:
        raise ValueError(f"unknown setup status: {status}")
    state = load_state()
    entry = state["items"][item_id]
    entry["status"] = status
    entry["updated_at"] = datetime.now().isoformat(timespec="seconds")
    if notes is not None:
        entry["notes"] = notes
    save_state(state)
    return entry


def dismiss_badge() -> None:
    state = load_state()
    state["badge_dismissed"] = True
    save_state(state)


def add_row(item_id: str, row: dict) -> None:
    if item_id not in ITEM_IDS:
        raise KeyError(item_id)
    state = load_state()
    entry = state["items"][item_id]
    rows = entry.get("rows")
    if not isinstance(rows, list):
        rows = []
    rows.append(row)
    entry["rows"] = rows
    save_state(state)


def set_cadence(cadence: dict | None) -> None:
    state = load_state()
    state["cadence"] = cadence
    save_state(state)
