"""Data Hub service — persists the per-tab dashboard layout.

The Data Hub page is a set of tabs; each tab owns an independent set of rows
of dashboard tiles. Position is implied by array order, so a tile carries only
its binding (refId — the id of the dashboard it shows, or None when empty and
awaiting a pick) and size (w, h). The backend does NOT know the frontend
dashboard registry, so it never validates refId beyond type — unknown ids are
handled at render time by the frontend.

NEW shape: {"tabs": {"<tab>": {"rows": [{"id": "row-1",
            "tiles": [{"i", "refId", "w", "h"}]}]}}}
Read-time migration accepts the OLD per-tab {"tiles": [{i,dashboardId,x,y,w,h}]}
shape: tiles are grouped into rows by ascending y, ordered within a row by
ascending x; dashboardId -> refId; x/y dropped.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..config import OZOS_DATAHUB_LAYOUT

# Where the page's layout is persisted (monkeypatched in tests).
LAYOUT_FILE = OZOS_DATAHUB_LAYOUT

# The Data Hub ships with no tabs; the user creates them (data points, later phase).
DEFAULT_TABS: list[str] = []


def _default_layout() -> dict:
    return {"tabs": {t: {"rows": []} for t in DEFAULT_TABS}, "pickerFolders": {}}


def _sanitize_tile(raw: dict) -> dict | None:
    """Keep a well-formed new-shape tile; drop malformed ones. refId may be None."""
    if not isinstance(raw, dict):
        return None
    ref = raw.get("refId")
    if ref is not None and not isinstance(ref, str):
        return None
    try:
        return {
            "i": str(raw["i"]),
            "refId": ref,
            "w": int(raw["w"]),
            "h": int(raw["h"]),
        }
    except (KeyError, TypeError, ValueError):
        return None


_ROW_ALIGNMENTS = {"left", "center", "right"}


def _sanitize_row(raw: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    rid = str(raw.get("id") or "").strip()
    if not rid:
        return None
    tiles = [t for t in (_sanitize_tile(x) for x in raw.get("tiles", [])) if t]
    row: dict = {"id": rid, "tiles": tiles}
    # Optional per-row alignment (left/center/right); omit anything else so a
    # bogus value falls back to the frontend default (center).
    align = raw.get("align")
    if align in _ROW_ALIGNMENTS:
        row["align"] = align
    return row


def _migrate_old_tile(raw: dict) -> tuple[int, int, dict] | None:
    """Migrate an OLD tile (dashboardId/x/y) to a (y, x, new-tile) tuple for
    grouping/ordering. dashboardId may be None and unknown ids are kept (the
    frontend validates), mirroring the old _sanitize_tile behavior."""
    if not isinstance(raw, dict):
        return None
    dash = raw.get("dashboardId")
    if dash is not None and not isinstance(dash, str):
        return None
    try:
        x = int(raw["x"])
        y = int(raw["y"])
        tile = {
            "i": str(raw["i"]),
            "refId": dash,
            "w": int(raw["w"]),
            "h": int(raw["h"]),
        }
    except (KeyError, TypeError, ValueError):
        return None
    return (y, x, tile)


def _migrate_old_tiles_into_rows(raw_tiles: list) -> list[dict]:
    """Group OLD tiles into rows by ascending y; order within a row by x."""
    triples = [t for t in (_migrate_old_tile(x) for x in raw_tiles) if t]
    triples.sort(key=lambda t: (t[0], t[1]))  # by (y, x)
    rows: list[dict] = []
    last_y: int | None = None
    for y, _x, tile in triples:
        if last_y is None or y != last_y:
            rows.append({"id": f"row-{len(rows) + 1}", "tiles": []})
            last_y = y
        rows[-1]["tiles"].append(tile)
    return rows


def _sanitize_tab(raw: dict) -> dict:
    if not isinstance(raw, dict):
        return {"rows": []}
    if isinstance(raw.get("rows"), list):
        rows = [r for r in (_sanitize_row(x) for x in raw["rows"]) if r]
        return {"rows": rows}
    if isinstance(raw.get("tiles"), list):
        return {"rows": _migrate_old_tiles_into_rows(raw["tiles"])}
    return {"rows": []}


def _tabs_from_data(data: dict) -> dict:
    if not isinstance(data, dict) or not isinstance(data.get("tabs"), dict):
        return {}
    return {str(tab_id): _sanitize_tab(tab) for tab_id, tab in data["tabs"].items()}


def _sanitize_picker_folder(raw: dict) -> dict | None:
    """Keep a well-formed sub-folder; drop malformed ones. The backend does not
    know the dashboard registry, so ids are validated as strings only —
    unknown/stale ids are reconciled away at render time by the frontend."""
    if not isinstance(raw, dict):
        return None
    fid = str(raw.get("id") or "").strip()
    if not fid:
        return None
    ids = [d for d in raw.get("dashboardIds", []) if isinstance(d, str)]
    return {"id": fid, "name": str(raw.get("name") or ""), "dashboardIds": ids}


def _picker_folders_from_data(data: dict) -> dict:
    """category -> ordered sub-folders. Non-list categories and malformed
    folders are dropped so a bad payload can't corrupt the whole config."""
    if not isinstance(data, dict) or not isinstance(data.get("pickerFolders"), dict):
        return {}
    result: dict = {}
    for category, folders in data["pickerFolders"].items():
        if not isinstance(folders, list):
            continue
        result[str(category)] = [f for f in (_sanitize_picker_folder(x) for x in folders) if f]
    return result


def get_layout() -> dict:
    if not LAYOUT_FILE.exists():
        return _default_layout()
    try:
        data = json.loads(LAYOUT_FILE.read_text(encoding="utf-8"))
        tabs = _tabs_from_data(data)
        if not tabs:
            return _default_layout()
        return {"tabs": tabs, "pickerFolders": _picker_folders_from_data(data)}
    except (json.JSONDecodeError, OSError):
        return _default_layout()


def save_layout(data: dict) -> dict:
    payload = {
        "tabs": _tabs_from_data(data or {}),
        "pickerFolders": _picker_folders_from_data(data or {}),
    }
    LAYOUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    LAYOUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload
