"""Personal-tasks service.

Two concerns, both kept pure for isolated testing:
  * a JSON store of the user's own tasks (functions take the store Path)
  * projection/write-back of performance-review goals (functions take a cycle
    `summary` dict — the router wires the actual file I/O via ``data.py``)
"""

import json
import re
import secrets
from datetime import datetime
from pathlib import Path

PR_LABEL = "performance review"


def _now_iso() -> str:
    return datetime.now().isoformat()


def _apply_done_transition(item: dict, new_done: bool) -> None:
    """Stamp ``completedAt`` when an item first becomes done, clear it when it
    is reopened, and leave it untouched while it stays done. Call BEFORE writing
    the new ``done`` value, so the old state is still readable."""
    was_done = bool(item.get("done"))
    if new_done and not was_done:
        item["completedAt"] = _now_iso()
    elif not new_done:
        item["completedAt"] = None


# On-theme neon swatches, assigned to labels in order. `performance review`
# keeps its own fixed amber on the frontend and is never assigned from here.
PALETTE = [
    "#2dd4ff",  # cyan
    "#00e5c0",  # teal
    "#9bff5b",  # lime
    "#ffce6a",  # amber
    "#ff6ad5",  # pink
    "#b06cff",  # violet
    "#ff6a6a",  # red
    "#5b9bff",  # blue
]

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


# ── JSON store of own tasks ─────────────────────────────────────────


def read_store(path: Path) -> dict:
    if not path.exists():
        return {"tasks": []}
    return json.loads(path.read_text())


def write_store(path: Path, store: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2, ensure_ascii=False))


def create_task(
    path: Path, title: str, description: str = "", labels: list[str] | None = None
) -> dict:
    store = read_store(path)
    task = {
        "id": _new_id("t"),
        "title": title,
        "description": description,
        "labels": list(labels or []),
        "done": False,
        "order": len(store["tasks"]),
        "completedAt": None,  # ISO timestamp set when first marked done
        "subtasks": [],
        "plan": None,  # {"start": iso, "end": iso} week range, or None
    }
    store["tasks"].append(task)
    write_store(path, store)
    return task


_PATCHABLE = ("title", "description", "labels", "done", "subtasks", "order", "plan")


def update_task(path: Path, task_id: str, fields: dict) -> dict | None:
    store = read_store(path)
    for task in store["tasks"]:
        if task["id"] == task_id:
            if "done" in fields:
                _apply_done_transition(task, fields["done"])
            for key in _PATCHABLE:
                if key in fields:
                    task[key] = fields[key]
            write_store(path, store)
            return task
    return None


def reorder_tasks(path: Path, ids: list[str]) -> list[dict]:
    """Reorder the own-task store to match ``ids``. Unknown ids are ignored;
    any stored task not named in ``ids`` keeps its relative order at the end.
    Each task's ``order`` is reassigned to its new index, then persisted."""
    store = read_store(path)
    by_id = {t["id"]: t for t in store["tasks"]}
    ordered = [by_id[i] for i in ids if i in by_id]
    named = {t["id"] for t in ordered}
    ordered += [t for t in store["tasks"] if t["id"] not in named]
    for i, task in enumerate(ordered):
        task["order"] = i
    store["tasks"] = ordered
    write_store(path, store)
    return ordered


def delete_task(path: Path, task_id: str) -> bool:
    store = read_store(path)
    remaining = [t for t in store["tasks"] if t["id"] != task_id]
    if len(remaining) == len(store["tasks"]):
        return False
    store["tasks"] = remaining
    write_store(path, store)
    return True


def labels_union(tasks: list[dict], review_goals: list[dict] | None = None) -> list[str]:
    """Distinct labels in use across own tasks (order-preserving). The
    ``performance review`` label is surfaced whenever review goals exist."""
    seen: list[str] = []
    for task in tasks:
        for label in task.get("labels", []):
            if label not in seen:
                seen.append(label)
    if review_goals and PR_LABEL not in seen:
        seen.append(PR_LABEL)
    return seen


def ensure_colors(store: dict, labels: list[str]) -> dict:
    """Assign a palette color to any label lacking one (excluding the
    system-managed ``performance review``). Picks the first swatch not already
    in use; cycles deterministically once the palette is exhausted. Mutates
    ``store['labelColors']`` and returns it."""
    colors = store.setdefault("labelColors", {})
    for label in labels:
        if label == PR_LABEL or label in colors:
            continue
        used = set(colors.values())
        nxt = next((c for c in PALETTE if c not in used), None)
        if nxt is None:
            nxt = PALETTE[len(colors) % len(PALETTE)]
        colors[label] = nxt
    return colors


def set_label_color(path: Path, name: str, color: str) -> dict:
    """Persist ``color`` (a ``#rrggbb`` hex) for label ``name``. Raises
    ValueError on a malformed hex."""
    if not _HEX_RE.match(color):
        raise ValueError(f"invalid color: {color!r}")
    store = read_store(path)
    store.setdefault("labelColors", {})[name] = color
    write_store(path, store)
    return store["labelColors"]


# ── performance-review goals (live mirror of a cycle summary) ───────


def _coerce_goal(raw) -> dict:
    """Normalise a goal that may be the legacy bare-string form or a dict.
    Subtasks live alongside the goal in the cycle summary so review goals can be
    broken down here; they are preserved across edits."""
    if isinstance(raw, str):
        return {
            "title": raw,
            "description": "",
            "done": False,
            "subtasks": [],
            "plan": None,
            "completedAt": None,
        }
    return {
        "title": raw.get("title", ""),
        "description": raw.get("description", ""),
        "done": bool(raw.get("done", False)),
        "subtasks": raw.get("subtasks") or [],
        "plan": raw.get("plan"),
        "completedAt": raw.get("completedAt"),
    }


def project_review_goals(summary: dict | None, cycle_id: str) -> list[dict]:
    """Project a cycle's ``key_goals`` into read/edit-here task shapes."""
    if not summary:
        return []
    out = []
    for i, raw in enumerate(summary.get("key_goals") or []):
        goal = _coerce_goal(raw)
        out.append(
            {
                "id": f"pr:{cycle_id}:{i}",
                "title": goal["title"],
                "description": goal["description"],
                "labels": [PR_LABEL],
                "done": goal["done"],
                "subtasks": goal["subtasks"],
                "plan": goal["plan"],
                "completedAt": goal["completedAt"],
                "reviewLinked": True,
                "cycle": cycle_id,
                "index": i,
            }
        )
    return out


def update_review_goal(summary: dict, index: int, fields: dict) -> dict:
    """Apply a partial ``title|description|done`` to ``key_goals[index]`` and
    return the mutated summary. Raises IndexError if the index is out of range."""
    goals = list(summary.get("key_goals") or [])
    if index < 0 or index >= len(goals):
        raise IndexError(index)
    goal = _coerce_goal(goals[index])
    if "done" in fields:
        _apply_done_transition(goal, fields["done"])
    for key in ("title", "description", "done", "subtasks", "plan"):
        if key in fields:
            goal[key] = fields[key]
    goals[index] = goal
    summary["key_goals"] = goals
    return summary
