"""What a setup item's form actually does: write the vault files the rest of the
engine already reads (people meta.yaml, meeting-routing.json,
knowledge-sources.json, cycles.yaml, .env) and mark the item.

The /ozos-setup skill calls these same functions when the app is not running, so
nothing here depends on FastAPI. Module-level paths are the seams tests patch.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, date
from pathlib import Path

from dotenv import dotenv_values

from ..config import (
    KNOWLEDGE_HUB_DIR as _KNOWLEDGE_HUB_DIR,
    ME_PERSON_ID as _ME_PERSON_ID,
    OZOS_CONFIG_DIR,
    OZOS_KNOWLEDGE_SOURCES,
    VAULT,
)
from . import data, setup_state
from .setup_registry import ITEMS, env_whitelist, item

ROUTING_FILE: Path = OZOS_CONFIG_DIR / "meeting-routing.json"
SOURCES_FILE: Path = OZOS_KNOWLEDGE_SOURCES
ENV_FILE: Path = VAULT / ".env"
KNOWLEDGE_HUB_DIR: Path = _KNOWLEDGE_HUB_DIR
GDRIVE_CREDS: Path = Path.home() / ".gdrive-credentials.json"
GMAIL_TOKEN: Path = Path.home() / ".config" / "ozos" / "meeting-notes-token.json"
ME_PERSON_ID: str = _ME_PERSON_ID

EXAMPLE_PERSON = "example-report"
EXAMPLE_CYCLE = "example-annual"
LEADERSHIP_FOLDER = "Leadership"
LEADERSHIP_MIN_PRESENT = 3
GMAIL_AUTH_COMMAND = "python3 tools/meeting-notes/sync_gemini_notes.py --auth"

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_UNSET = object()


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


# ── routing ─────────────────────────────────────────────────────────────


def _empty_routing() -> dict:
    return {
        "folders": ["Other"],
        "default_folder": "Other",
        "person_folders": {},
        "group_rules": [],
        "drive_parent_folder_id": None,
        "tagging_guide": "",
    }


def load_routing() -> dict:
    routing = _empty_routing()
    try:
        loaded = json.loads(ROUTING_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return routing
    if isinstance(loaded, dict):
        routing.update({k: v for k, v in loaded.items() if k in routing or not k.startswith("_")})
    routing["folders"] = [str(f) for f in routing.get("folders") or []]
    routing["person_folders"] = dict(routing.get("person_folders") or {})
    routing["group_rules"] = list(routing.get("group_rules") or [])
    return routing


def save_routing(routing: dict) -> None:
    _write_json(ROUTING_FILE, routing)


def update_routing(
    folders: list[str] | None = None,
    default_folder: str | None = None,
    tagging_guide: str | None = None,
    drive_parent_folder_id=_UNSET,
) -> dict:
    routing = load_routing()
    if folders is not None:
        routing["folders"] = [f.strip() for f in folders if f and f.strip()]
    if default_folder is not None and default_folder.strip():
        routing["default_folder"] = default_folder.strip()
    # The categoriser only picks from `folders`; keep the default and every group
    # rule's target in the list so a replaced list cannot orphan them.
    for must in [routing["default_folder"]] + [
        r.get("folder") for r in routing["group_rules"] if r.get("folder")
    ]:
        if must not in routing["folders"]:
            routing["folders"].append(must)
    if tagging_guide is not None:
        routing["tagging_guide"] = tagging_guide
    if drive_parent_folder_id is not _UNSET:
        routing["drive_parent_folder_id"] = (drive_parent_folder_id or "").strip() or None
    save_routing(routing)
    if folders is not None:
        setup_state.set_status("routing-folders", "done")
    return routing


# ── people ──────────────────────────────────────────────────────────────


def add_stakeholder(p: dict) -> dict:
    person_id = str(p.get("person_id") or "").strip()
    display_name = str(p.get("display_name") or "").strip()
    if not _ID_RE.match(person_id):
        raise ValueError("person_id must be lowercase letters, digits and dashes")
    if not display_name:
        raise ValueError("display_name is required")
    if (data.DATA_DIR / "people" / person_id).exists():
        raise FileExistsError(person_id)

    email = str(p.get("email") or "").strip().lower()
    team_folder = str(p.get("team_folder") or "").strip()
    leadership = bool(p.get("leadership"))
    meta = {
        "name": person_id,
        "display_name": display_name,
        "role": str(p.get("role") or ""),
        "start_date": date.today().isoformat(),
        "manager": str(p.get("manager") or ""),
        "email": email,
    }
    data.create_person(person_id, meta)

    routing = load_routing()
    if email:
        routing["person_folders"][email] = display_name
    if team_folder and team_folder not in routing["folders"]:
        routing["folders"].append(team_folder)
    if leadership:
        first = display_name.split()[0].lower()
        rule = next(
            (r for r in routing["group_rules"] if r.get("folder") == LEADERSHIP_FOLDER), None
        )
        if rule is None:
            rule = {
                "folder": LEADERSHIP_FOLDER,
                "members": [],
                "min_present": LEADERSHIP_MIN_PRESENT,
            }
            routing["group_rules"].append(rule)
        if first not in rule.setdefault("members", []):
            rule["members"].append(first)
        if LEADERSHIP_FOLDER not in routing["folders"]:
            routing["folders"].append(LEADERSHIP_FOLDER)
    save_routing(routing)

    removed_example = False
    if person_id != EXAMPLE_PERSON and (data.DATA_DIR / "people" / EXAMPLE_PERSON).exists():
        data.delete_person(EXAMPLE_PERSON)
        removed_example = True

    setup_state.add_row(
        "add-stakeholder",
        {
            "id": person_id,
            "display_name": display_name,
            "added_at": datetime.now().isoformat(timespec="seconds"),
        },
    )
    setup_state.set_status("add-stakeholder", "done")
    return {"person": meta, "routing": routing, "removed_example": removed_example}


# ── review cycle ────────────────────────────────────────────────────────


def set_company_cycle(name: str, cycle_type: str, stages: list[dict]) -> dict:
    name = (name or "").strip()
    if not name:
        raise ValueError("cycle name is required")
    events = []
    for s in stages or []:
        label = str(s.get("label") or "").strip()
        if not label:
            continue
        events.append(
            {
                "id": str(s.get("id") or "").strip() or _slug(label),
                "label": label,
                "start": str(s.get("start") or ""),
                "end": str(s.get("end") or ""),
            }
        )
    if not events:
        raise ValueError("at least one stage is required")
    try:
        cycles_data = data.read_cycles() or {}
    except FileNotFoundError:
        cycles_data = {}
    cycles = cycles_data.setdefault("cycles", {}) or {}
    cycles.pop(EXAMPLE_CYCLE, None)
    cycle_id = _slug(name) or "cycle"
    cycles[cycle_id] = {"name": name, "type": cycle_type or "", "events": events}
    cycles_data["cycles"] = cycles
    cycles_data["active_cycle"] = cycle_id
    data.write_cycles(cycles_data)
    setup_state.set_cadence({"mode": "company", "cycle_id": cycle_id})
    setup_state.set_status("define-cycle", "done")
    return cycles_data


def set_default_cadence() -> dict:
    cadence = {
        "mode": "default",
        "monthly": "1:1 note check per report",
        "quarterly": "written reflection per report",
        "set_at": datetime.now().isoformat(timespec="seconds"),
    }
    setup_state.set_cadence(cadence)
    setup_state.set_status("define-cycle", "done")
    return cadence


def _first_of_next_month(now: datetime) -> str:
    y, m = (now.year + 1, 1) if now.month == 12 else (now.year, now.month + 1)
    return date(y, m, 1).isoformat()


def _first_of_next_quarter(now: datetime) -> str:
    next_q_month = ((now.month - 1) // 3 + 1) * 3 + 1
    y, m = (now.year + 1, 1) if next_q_month > 12 else (now.year, next_q_month)
    return date(y, m, 1).isoformat()


def reminders(now: datetime | None = None) -> list[dict]:
    cadence = setup_state.load_state()["cadence"]
    if not cadence or cadence.get("mode") != "default":
        return []
    now = now or datetime.now()
    out = []
    try:
        people = data.list_people()
    except OSError:
        people = []
    for person in people:
        pid = person.get("name")
        if pid in (EXAMPLE_PERSON, ME_PERSON_ID):
            continue
        out.append(
            {
                "person_id": pid,
                "display_name": person.get("display_name") or pid,
                "monthly_due": _first_of_next_month(now),
                "quarterly_due": _first_of_next_quarter(now),
            }
        )
    return out


# ── drop folders ────────────────────────────────────────────────────────


def _load_sources() -> list[dict]:
    try:
        loaded = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
        return list(loaded.get("sources") or []) if isinstance(loaded, dict) else []
    except (OSError, ValueError):
        return []


def add_drop_folder(item_id: str, folder: str) -> dict:
    it = item(item_id)
    if not it or it["kind"] != "folder":
        raise ValueError(f"{item_id} is not a drop-folder item")
    slug = _slug(folder or "")
    if not slug:
        raise ValueError("folder name is required")
    (KNOWLEDGE_HUB_DIR / slug).mkdir(parents=True, exist_ok=True)
    entry = {"id": slug, "label": slug.replace("-", " ").title(), "path": f"knowledge-hub/{slug}"}
    sources = _load_sources()
    if not any(s.get("id") == slug for s in sources):
        sources.append(entry)
        _write_json(SOURCES_FILE, {"sources": sources})
    setup_state.set_status(item_id, "done", notes=entry["path"])
    return entry


# ── env ─────────────────────────────────────────────────────────────────


def _quote_env(value: str) -> str:
    """Double-quote a value so `#`, quotes and spaces survive dotenv parsing."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _write_private_atomic(path: Path, text: str) -> None:
    """Create a 0600 temp beside `path` and swap it in, so a crash can never leave
    a truncated .env and the file is never readable by others, not even briefly."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    os.chmod(path, 0o600)


def env_status() -> dict[str, bool]:
    values = dotenv_values(ENV_FILE) if ENV_FILE.is_file() else {}
    return {name: bool((values.get(name) or "").strip()) for name in env_whitelist()}


def write_env(vars: dict[str, str]) -> list[str]:
    if not vars:
        raise ValueError("no variables given")
    allowed = set(env_whitelist())
    for name, value in vars.items():
        if name not in allowed:
            raise ValueError(f"{name} is not a variable Setup may write")
        if "\n" in str(value) or "\r" in str(value):
            raise ValueError(f"{name}: value must be a single line")
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.is_file() else []
    written: list[str] = []
    for name, value in vars.items():
        new_line = f"{name}={_quote_env(str(value).strip())}"
        replaced = False
        for i, line in enumerate(lines):
            if line.split("=", 1)[0].strip() == name:
                lines[i] = new_line
                replaced = True
                break
        if not replaced:
            lines.append(new_line)
        written.append(name)
    _write_private_atomic(ENV_FILE, "\n".join(lines) + "\n")
    status = env_status()
    for it in (i for i in ITEMS if set(i["env"]) & set(written)):
        if all(status.get(n) for n in it["env"]):
            setup_state.set_status(it["id"], "done")
    return written


# ── gmail ───────────────────────────────────────────────────────────────


def gmail_status() -> dict:
    return {
        "credentials_file": GDRIVE_CREDS.is_file(),
        "token_file": GMAIL_TOKEN.is_file(),
        "drive_parent_folder_id": load_routing().get("drive_parent_folder_id"),
        "auth_command": GMAIL_AUTH_COMMAND,
    }
