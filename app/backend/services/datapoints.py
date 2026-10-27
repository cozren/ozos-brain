"""Data points in the vault: <vault>/.ozos/datapoints.json and one cached value
per point under <vault>/.ozos/datapoint-cache/<id>.json.

A data point is a name, a source (a Metabase card, a SQL query against a SQLite
file in the vault, or a CSV in the vault), a display (number, table, line), a
refresh cadence (manual, daily) and a unit. Data Hub tiles and goal measures can
only show data points.

Shapes:
  datapoints.json   {"datapoints": [{"id", "name", "source", "display", "refresh",
                                      "unit", "created_at"}]}
  cache/<id>.json   {"fetched_at", "columns", "rows"}  or  {"fetched_at", "error"}

Reads are tolerant (missing or malformed file → no points); writes are atomic.
The fetchers live in datapoint_sources.py; this module owns definitions and the
cache.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from ..config import OZOS_DATAPOINT_CACHE_DIR, OZOS_DATAPOINTS_FILE
from .setup_actions import _slug as slug

DATAPOINTS_FILE: Path = OZOS_DATAPOINTS_FILE  # tests monkeypatch these two
CACHE_DIR: Path = OZOS_DATAPOINT_CACHE_DIR

KINDS = ("metabase", "sqlite", "csv")
DISPLAYS = ("number", "table", "line")
REFRESHES = ("manual", "daily")
SETUP_ITEM = "first-data-point"
VITAL_ID = "datapoints-refresh"

_EDITABLE = ("name", "source", "display", "refresh", "unit")


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


# ── paths ───────────────────────────────────────────────────────────────


def vault_root() -> Path:
    """The vault is two levels above the cache dir (<vault>/.ozos/datapoint-cache)."""
    return CACHE_DIR.parent.parent


def vault_path(rel: str) -> Path:
    """Resolve a sqlite/csv path relative to the vault; refuse anything outside it."""
    root = vault_root().resolve()
    candidate = Path(str(rel).strip())
    if candidate.is_absolute():
        raise ValueError("path must stay inside the vault")
    resolved = (root / candidate).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        raise ValueError("path must stay inside the vault") from None
    return resolved


# ── validation ──────────────────────────────────────────────────────────


def normalize_source(raw) -> dict:
    """One of the three typed source objects; ValueError for anything else."""
    if not isinstance(raw, dict):
        raise ValueError("source must be an object")
    kind = raw.get("kind")
    if kind == "metabase":
        card = raw.get("card_id")
        try:
            card_id = int(str(card).strip())
        except (TypeError, ValueError):
            raise ValueError("card_id must be a positive integer") from None
        if isinstance(card, bool) or card_id <= 0:
            raise ValueError("card_id must be a positive integer")
        return {"kind": "metabase", "card_id": card_id}
    if kind == "sqlite":
        path = str(raw.get("path") or "").strip()
        query = str(raw.get("query") or "").strip()
        if not path:
            raise ValueError("path is required")
        if not query:
            raise ValueError("query is required")
        vault_path(path)
        return {"kind": "sqlite", "path": path, "query": query}
    if kind == "csv":
        path = str(raw.get("path") or "").strip()
        if not path:
            raise ValueError("path is required")
        vault_path(path)
        column = str(raw.get("column") or "").strip() or None
        return {"kind": "csv", "path": path, "column": column}
    raise ValueError(f"source kind must be one of {', '.join(KINDS)}")


def normalize_datapoint(raw: dict) -> dict:
    name = str(raw.get("name") or "").strip()
    if not name:
        raise ValueError("name is required")
    display = str(raw.get("display") or "number")
    if display not in DISPLAYS:
        raise ValueError(f"display must be one of {', '.join(DISPLAYS)}")
    refresh = str(raw.get("refresh") or "manual")
    if refresh not in REFRESHES:
        raise ValueError(f"refresh must be one of {', '.join(REFRESHES)}")
    return {
        "id": str(raw.get("id") or ""),
        "name": name,
        "source": normalize_source(raw.get("source")),
        "display": display,
        "refresh": refresh,
        "unit": str(raw.get("unit") or "").strip(),
        "created_at": str(raw.get("created_at") or ""),
    }


def _tolerant(raw: dict) -> dict | None:
    """A stored point with a bad display or refresh keeps the default; a blank
    name or an invalid source drops it (there is nothing to show)."""
    fixed = dict(raw)
    if fixed.get("display") not in DISPLAYS:
        fixed["display"] = "number"
    if fixed.get("refresh") not in REFRESHES:
        fixed["refresh"] = "manual"
    try:
        point = normalize_datapoint(fixed)
    except ValueError:
        return None
    if not point["id"]:
        point["id"] = slug(point["name"])
    return point


# ── definitions ─────────────────────────────────────────────────────────


def load_datapoints() -> list[dict]:
    try:
        loaded = json.loads(DATAPOINTS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if not isinstance(loaded, dict):
        return []
    points: list[dict] = []
    for entry in loaded.get("datapoints") or []:
        if isinstance(entry, dict):
            point = _tolerant(entry)
            if point is not None:
                points.append(point)
    return points


def save_datapoints(points: list[dict]) -> None:
    DATAPOINTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATAPOINTS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"datapoints": points}, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, DATAPOINTS_FILE)


def get_datapoint(dp_id: str) -> dict:
    for point in load_datapoints():
        if point["id"] == dp_id:
            return point
    raise KeyError(dp_id)


def count() -> int:
    return len(load_datapoints())


def add_datapoint(payload: dict) -> dict:
    point = normalize_datapoint({k: v for k, v in payload.items() if k != "id"})
    point["id"] = slug(point["name"])
    if not point["id"]:
        raise ValueError("name must contain a letter or a digit")
    points = load_datapoints()
    if any(p["id"] == point["id"] for p in points):
        raise FileExistsError(point["id"])
    point["created_at"] = _now()
    points.append(point)
    save_datapoints(points)
    return point


def update_datapoint(dp_id: str, patch: dict) -> dict:
    points = load_datapoints()
    current = next((p for p in points if p["id"] == dp_id), None)
    if current is None:
        raise KeyError(dp_id)
    changes = {k: v for k, v in patch.items() if k in _EDITABLE}
    updated = normalize_datapoint({**current, **changes})
    updated["id"] = current["id"]
    if updated["source"] != current["source"]:
        cache_path(dp_id).unlink(missing_ok=True)  # a stale value for a new source is wrong
    save_datapoints([updated if p["id"] == dp_id else p for p in points])
    return updated


def delete_datapoint(dp_id: str) -> None:
    points = load_datapoints()
    if not any(p["id"] == dp_id for p in points):
        raise KeyError(dp_id)
    save_datapoints([p for p in points if p["id"] != dp_id])
    cache_path(dp_id).unlink(missing_ok=True)


# ── cache ───────────────────────────────────────────────────────────────


def cache_path(dp_id: str) -> Path:
    return CACHE_DIR / f"{dp_id}.json"


def _empty_value(dp_id: str) -> dict:
    return {"id": dp_id, "fetched_at": None, "columns": [], "rows": [], "error": None}


def read_value(dp_id: str) -> dict:
    value = _empty_value(dp_id)
    try:
        loaded = json.loads(cache_path(dp_id).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return value
    if not isinstance(loaded, dict):
        return value
    value["fetched_at"] = str(loaded["fetched_at"]) if loaded.get("fetched_at") else None
    if loaded.get("error"):
        value["error"] = str(loaded["error"])
        return value
    value["columns"] = [str(c) for c in (loaded.get("columns") or [])]
    value["rows"] = [list(r) for r in (loaded.get("rows") or []) if isinstance(r, (list, tuple))]
    return value


def _write_cache(dp_id: str, payload: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = cache_path(dp_id)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def write_rows(dp_id: str, columns: list, rows: list, now: datetime | None = None) -> None:
    stamp = (now or datetime.now()).isoformat(timespec="seconds")
    _write_cache(dp_id, {"fetched_at": stamp, "columns": list(columns), "rows": list(rows)})


def write_error(dp_id: str, message: str, now: datetime | None = None) -> None:
    stamp = (now or datetime.now()).isoformat(timespec="seconds")
    _write_cache(dp_id, {"fetched_at": stamp, "error": str(message)})


def refresh_health() -> dict | None:
    """The cache as a vital-shaped record for the Setup page: None without data
    points, `fail` naming the first point whose cache holds an error, else `ok`."""
    points = load_datapoints()
    if not points:
        return None
    for point in points:
        error = read_value(point["id"])["error"]
        if error:
            return {"id": VITAL_ID, "status": "fail", "message": f"{point['name']}: {error}"}
    return {"id": VITAL_ID, "status": "ok", "message": ""}
