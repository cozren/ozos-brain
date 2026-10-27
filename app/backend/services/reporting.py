"""Reporting service — a registry of report *sources* and their dated instances.

A source is anything that emits dated instance files into a folder (the
daily-digest pattern). The reporting page reads the latest instance + history;
script-kind sources can also be re-run on demand. Generators (digest, future
agents/data snapshots) write the files; widgets only read them.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path

from ..config import KNOWLEDGE_HUB_DIR, OZOS_RUNS_DIR, OZOS_REPORTING_LAYOUT

# Repo root (knowledge-hub lives at the root).
REPO_ROOT = KNOWLEDGE_HUB_DIR.parent

# Where run locks + status files live (monkeypatched in tests).
RUNS_DIR = OZOS_RUNS_DIR

# Where the page's widget layout is persisted (monkeypatched in tests).
LAYOUT_FILE = OZOS_REPORTING_LAYOUT

# --- Source registry -------------------------------------------------------
# One entry per report source. Add agent/data kinds later; the shell is shared.
SOURCES: list[dict] = [
    {
        "id": "daily-digest",
        "label": "Daily Digest",
        "kind": "script",  # script | archive
        "body": "markdown",  # how the instance body renders
        "instances_dir": KNOWLEDGE_HUB_DIR / "digests",
        "instance_glob": "digest-*.md",
        "date_re": r"(\d{4}-\d{2}-\d{2})",
        "label_from": "date",  # date | title
        "run": [sys.executable, "tools/daily-digest/digest.py"],
    },
    {
        "id": "meeting-notes",
        "label": "Meeting Notes",
        "kind": "archive",  # read-only; synced by the meeting-notes tool
        "body": "markdown",
        "instances_dir": KNOWLEDGE_HUB_DIR / "meeting-notes",
        "instance_glob": "**/*.md",  # nested per-person folders
        "date_re": r"(\d{4}-\d{2}-\d{2})",
        "label_from": "title",
    },
    {
        "id": "intel-agents",
        "label": "Intel Agents",
        "kind": "archive",
        "body": "intel-agents",
        "instances_dir": KNOWLEDGE_HUB_DIR / "intel-agents",
        "instance_glob": "**/*.json",
        "date_re": r"(\d{4}-\d{2}-\d{2})",
        "label_from": "date",
    },
]


def _is_runnable(source: dict) -> bool:
    return source["kind"] == "script" and bool(source.get("run"))


def get_source(source_id: str) -> dict | None:
    return next((s for s in SOURCES if s["id"] == source_id), None)


def list_sources() -> list[dict]:
    return [
        {
            "id": s["id"],
            "label": s["label"],
            "kind": s["kind"],
            "body": s["body"],
            "runnable": _is_runnable(s),
        }
        for s in SOURCES
    ]


# --- Instances -------------------------------------------------------------


def _date_of(source: dict, path: Path) -> str | None:
    m = re.search(source["date_re"], path.name)
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


def _title_label(path: Path, date_str: str) -> str:
    """A human label drawn from the filename — the quoted title if present,
    else the stem with a leading date prefix stripped."""
    stem = path.stem
    quoted = re.search(r'[“"]([^”"]+)[”"]', stem)
    if quoted:
        return quoted.group(1).strip()
    cleaned = re.sub(r"^\d{4}-\d{2}-\d{2}\s*[—–-]\s*", "", stem).strip()
    return cleaned or _pretty_label(date_str)


def _instance_label(source: dict, path: Path, date_str: str) -> str:
    if source.get("label_from") == "title":
        return _title_label(path, date_str)
    return _pretty_label(date_str)


def list_instances(source_id: str) -> list[dict] | None:
    source = get_source(source_id)
    if source is None:
        return None
    folder: Path = source["instances_dir"]
    items: list[dict] = []
    if folder.exists():
        for path in folder.glob(source["instance_glob"]):
            date = _date_of(source, path)
            if not date:
                continue
            items.append(
                {
                    "id": str(path.relative_to(folder)),  # path within the source folder
                    "date": date,
                    "label": _instance_label(source, path, date),
                    "age": _human_age(date),
                }
            )
    items.sort(key=lambda it: it["date"], reverse=True)  # newest first
    return items


def get_instance(source_id: str, instance_id: str) -> dict | None:
    source = get_source(source_id)
    if source is None:
        return None
    instances = list_instances(source_id) or []
    if instance_id == "latest":
        if not instances:
            return None
        instance_id = instances[0]["id"]

    match = next((it for it in instances if it["id"] == instance_id), None)
    if match is None:
        return None
    path: Path = source["instances_dir"] / instance_id
    if not path.exists():
        return None
    return {
        "id": match["id"],
        "date": match["date"],
        "label": match["label"],
        "body": source["body"],
        "content": path.read_text(encoding="utf-8"),
    }


# --- Running (script kinds) ------------------------------------------------


def _lock_path(source_id: str) -> Path:
    return RUNS_DIR / f"{source_id}.lock"


def _status_path(source_id: str) -> Path:
    return RUNS_DIR / f"{source_id}.run-status.json"


def _launch(target) -> None:
    """Run target in a background daemon thread (patched inline in tests)."""
    threading.Thread(target=target, daemon=True).start()


def _execute(source: dict) -> None:
    source_id = source["id"]
    exit_code = 1
    try:
        proc = subprocess.run(source["run"], cwd=REPO_ROOT)
        exit_code = proc.returncode
    finally:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        _status_path(source_id).write_text(
            json.dumps({"ts": datetime.now().isoformat(), "exit": exit_code})
        )
        _lock_path(source_id).unlink(missing_ok=True)


def run_source(source_id: str) -> dict | None:
    """Start a source's generator. Returns None if the source is unknown,
    {'state': 'not-runnable'} if it can't be run, else started/running."""
    source = get_source(source_id)
    if source is None:
        return None
    if not _is_runnable(source):
        return {"state": "not-runnable"}
    if _lock_path(source_id).exists():
        return {"state": "running"}
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    _lock_path(source_id).write_text(datetime.now().isoformat())
    _launch(lambda: _execute(source))
    return {"state": "started"}


def run_status(source_id: str) -> dict | None:
    source = get_source(source_id)
    if source is None:
        return None
    if _lock_path(source_id).exists():
        return {"state": "running", "last_run": None, "last_exit": None}
    status_path = _status_path(source_id)
    if status_path.exists():
        data = json.loads(status_path.read_text())
        return {
            "state": "idle" if data.get("exit") == 0 else "error",
            "last_run": data.get("ts"),
            "last_exit": data.get("exit"),
        }
    return {"state": "idle", "last_run": None, "last_exit": None}


# --- Layout (horizontally-scrolling rows of tiles) -------------------------
# The page is a vertical stack of rows; each row holds tiles laid out
# left-to-right and scrolls sideways. Position is implied by array order, so a
# tile carries only its binding (refId) and size (w, h) — no x/y.
#
# NEW shape: {"rows": [{"id": "row-1", "tiles": [{"i", "refId", "w", "h"}]}]}
# Read-time migration accepts the OLD shape (items/sourceId/x) and the legacy
# flat {"widgets": [...]} shape, preserving left->right order by ascending x.


def _default_layout() -> dict:
    return {
        "rows": [
            {
                "id": "row-1",
                "tiles": [
                    {"i": "daily-digest-1", "refId": "daily-digest", "w": 6, "h": 10},
                ],
            },
        ]
    }


def _sanitize_tile(raw: dict) -> dict | None:
    """Keep a new-shape tile; drop tiles bound to an unknown source."""
    if not isinstance(raw, dict):
        return None
    if get_source(raw.get("refId")) is None:
        return None
    try:
        return {
            "i": str(raw["i"]),
            "refId": str(raw["refId"]),
            "w": int(raw["w"]),
            "h": int(raw["h"]),
        }
    except (KeyError, TypeError, ValueError):
        return None


def _migrate_old_item(raw: dict) -> tuple[int, dict] | None:
    """Migrate an OLD item (sourceId/x) to a (x, new-tile) pair for ordering.

    Drops items bound to an unknown source. `x` is used only to order tiles
    left->right and is not carried into the new shape."""
    if not isinstance(raw, dict):
        return None
    if get_source(raw.get("sourceId")) is None:
        return None
    try:
        x = int(raw["x"])
        tile = {
            "i": str(raw["i"]),
            "refId": str(raw["sourceId"]),
            "w": int(raw["w"]),
            "h": int(raw["h"]),
        }
    except (KeyError, TypeError, ValueError):
        return None
    return (x, tile)


def _migrate_old_items(raw_items: list) -> list[dict]:
    pairs = [p for p in (_migrate_old_item(x) for x in raw_items) if p]
    pairs.sort(key=lambda p: p[0])  # ascending old x -> left->right order
    return [tile for _, tile in pairs]


def _sanitize_row(raw: dict) -> dict | None:
    """Sanitize a row. A row already in the new shape carries `tiles`; an OLD
    row carries `items` (sourceId/x) which we migrate."""
    if not isinstance(raw, dict):
        return None
    rid = str(raw.get("id") or "").strip()
    if not rid:
        return None
    if isinstance(raw.get("tiles"), list):
        tiles = [t for t in (_sanitize_tile(x) for x in raw["tiles"]) if t]
    elif isinstance(raw.get("items"), list):
        tiles = _migrate_old_items(raw["items"])
    else:
        tiles = []
    return {"id": rid, "tiles": tiles}


def _rows_from_data(data: dict) -> list[dict]:
    if not isinstance(data, dict):
        return []
    if isinstance(data.get("rows"), list):
        return [r for r in (_sanitize_row(x) for x in data["rows"]) if r]
    # Migrate a legacy flat {"widgets": [...]} layout into a single row.
    if isinstance(data.get("widgets"), list):
        tiles = _migrate_old_items(data["widgets"])
        return [{"id": "row-1", "tiles": tiles}] if tiles else []
    return []


def get_layout() -> dict:
    if not LAYOUT_FILE.exists():
        return _default_layout()
    try:
        data = json.loads(LAYOUT_FILE.read_text(encoding="utf-8"))
        rows = _rows_from_data(data)
        return {"rows": rows} if rows else _default_layout()
    except (json.JSONDecodeError, OSError):
        return _default_layout()


def save_layout(data: dict) -> dict:
    payload = {"rows": _rows_from_data(data or {})}
    LAYOUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    LAYOUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload
