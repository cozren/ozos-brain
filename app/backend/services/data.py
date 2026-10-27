import re
import yaml
from pathlib import Path
from ..config import DATA_DIR


def read_cycles() -> dict:
    with open(DATA_DIR / "cycles.yaml") as f:
        return yaml.safe_load(f)


def write_cycles(data: dict) -> None:
    with open(DATA_DIR / "cycles.yaml", "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def list_people() -> list[dict]:
    people_dir = DATA_DIR / "people"
    result = []
    for p in sorted(people_dir.iterdir()):
        if p.is_dir():
            meta_file = p / "meta.yaml"
            if meta_file.exists():
                with open(meta_file) as f:
                    meta = yaml.safe_load(f)
                meta["name"] = p.name  # always use directory name as the canonical id
                result.append(meta)
    return result


def get_person_meta(person_id: str) -> dict | None:
    meta_file = DATA_DIR / "people" / person_id / "meta.yaml"
    if not meta_file.exists():
        return None
    with open(meta_file) as f:
        return yaml.safe_load(f)


def create_person(person_id: str, meta: dict) -> None:
    person_dir = DATA_DIR / "people" / person_id
    person_dir.mkdir(parents=True, exist_ok=True)
    (person_dir / "cycles").mkdir(exist_ok=True)
    with open(person_dir / "meta.yaml", "w") as f:
        yaml.dump(meta, f, default_flow_style=False, allow_unicode=True)


def get_cycle_summary(person_id: str, cycle_id: str) -> dict | None:
    summary_file = DATA_DIR / "people" / person_id / "cycles" / cycle_id / "summary.yaml"
    if not summary_file.exists():
        return None
    with open(summary_file) as f:
        return yaml.safe_load(f)


def write_cycle_summary(person_id: str, cycle_id: str, data: dict) -> None:
    cycle_dir = DATA_DIR / "people" / person_id / "cycles" / cycle_id
    cycle_dir.mkdir(parents=True, exist_ok=True)
    with open(cycle_dir / "summary.yaml", "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def list_person_cycles(person_id: str) -> list[str]:
    cycles_dir = DATA_DIR / "people" / person_id / "cycles"
    if not cycles_dir.exists():
        return []
    return sorted([d.name for d in cycles_dir.iterdir() if d.is_dir()])


def _pretty_title(cycle_id: str) -> str:
    """Human label for a cycle that has no stored title (e.g. '2026-deep-dive')."""
    return cycle_id.replace("-", " ").title()


_MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _month(date_str: str) -> str:
    """Month abbreviation from a 'YYYY-MM-DD' string ('' if unparseable)."""
    try:
        return _MONTHS[int(date_str.split("-")[1])]
    except (IndexError, ValueError):
        return ""


def _cycle_period(person_id: str, cycle_id: str, summary: dict) -> str:
    """Secondary label for a cycle: its start–end month range (e.g. 'Apr-Jul').
    Months only (no year — the year lives in the title). Uses the summary's own
    start/end dates, else the cycle's event timeline in cycles.yaml."""
    start, end = _month(summary.get("start_date", "")), _month(summary.get("end_date", ""))
    if start and end:
        return f"{start}-{end}"
    try:
        events = read_cycles().get("cycles", {}).get(cycle_id, {}).get("events", []) or []
    except Exception:
        events = []
    starts = [e["start"] for e in events if e.get("start")]
    ends = [e["end"] for e in events if e.get("end")]
    if starts and ends:
        return f"{_month(min(starts))}-{_month(max(ends))}"
    return ""


def list_person_cycle_meta(person_id: str) -> list[dict]:
    """Cycles for the dropdown: id + title + status (active|finalized) + period."""
    out = []
    for cid in list_person_cycles(person_id):
        s = get_cycle_summary(person_id, cid) or {}
        out.append(
            {
                "id": cid,
                "title": s.get("title") or _pretty_title(cid),
                "status": s.get("status") or "active",
                "period": _cycle_period(person_id, cid, s),
            }
        )
    return out


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "cycle"


def _blank_summary(title: str, cycle_type: str, prev_growth_goals: list | None = None) -> dict:
    """A fresh per-person cycle summary. Its own goals start empty; the previous
    cycle's goals are carried into `prev_growth_goals` as a read-only reminder."""
    return {
        "title": title,
        "cycle_type": cycle_type,
        "start_date": "",
        "end_date": "",
        "status": "active",
        "key_accomplishments": [],
        "key_goals": [],
        "prev_growth_goals": prev_growth_goals or [],
        "documents": [],
        "manager_rating": None,
        "promotion_nominated": False,
        "personal_notes": "",
    }


def create_cycle(person_id: str, meta: dict, carry_from: str | None = None) -> dict:
    """Create a new blank cycle for a person. `meta` carries title/type/start/end.
    The previous cycle's growth goals (key_goals from `carry_from`) are carried into
    prev_growth_goals as a read-only reminder; the new cycle's own key_goals start
    empty. Returns the stored summary plus its generated id."""
    cycles_dir = DATA_DIR / "people" / person_id / "cycles"
    base = _slugify(meta.get("title", "cycle"))
    cycle_id = base
    n = 2
    while (cycles_dir / cycle_id).exists():
        cycle_id = f"{base}-{n}"
        n += 1

    prev_goals = []
    if carry_from:
        prev = get_cycle_summary(person_id, carry_from) or {}
        prev_goals = prev.get("key_goals", []) or []

    summary = _blank_summary(meta.get("title", ""), meta.get("type", ""), prev_goals)
    summary["start_date"] = meta.get("start", "")
    summary["end_date"] = meta.get("end", "")
    write_cycle_summary(person_id, cycle_id, summary)
    return {"id": cycle_id, **summary}


def most_recent_person_cycle(person_id: str, exclude_id: str | None = None) -> str | None:
    """The person's latest existing cycle by end/start date (else the last by id).
    Returns None when the person has no cycles. Used to pick a carry-forward source."""
    best, best_key = None, ""
    for cid in list_person_cycles(person_id):
        if cid == exclude_id:
            continue
        s = get_cycle_summary(person_id, cid) or {}
        key = s.get("end_date") or s.get("start_date") or ""
        if best is None or key >= best_key:
            best, best_key = cid, key
    return best


def synthesize_cycle_summary(person_id: str, cycle_id: str) -> dict:
    """A blank summary for a globally-defined cycle the person hasn't started yet.
    Growth goals are carried forward from the person's most recent cycle. NOT
    persisted — the folder is written only when the cycle is first edited."""
    cdef = read_cycles().get("cycles", {}).get(cycle_id, {})
    src = most_recent_person_cycle(person_id, exclude_id=cycle_id)
    carried = (get_cycle_summary(person_id, src) or {}).get("key_goals", []) if src else []
    return _blank_summary(
        cdef.get("name") or _pretty_title(cycle_id), cdef.get("type", ""), carried
    )


def get_or_synthesize_summary(person_id: str, cycle_id: str) -> dict | None:
    """The stored summary, or a synthetic one when the cycle exists globally but the
    person hasn't started it. None when the cycle is unknown entirely. Used by both
    the read and update paths so the carried reminder persists on first edit."""
    stored = get_cycle_summary(person_id, cycle_id)
    if stored is not None:
        return stored
    if cycle_id in read_cycles().get("cycles", {}):
        return synthesize_cycle_summary(person_id, cycle_id)
    return None


_EVENT_TEMPLATES = {
    "deep-dive": [
        ("self-assessment", "Self Assessment"),
        ("manager-review", "Manager Review"),
        ("calibration", "Calibration Sessions"),
        ("performance-conversations", "Performance Conversations"),
        ("salary-promotions", "Salary + Promotions"),
    ],
    "light-touch": [
        ("manager-conversation", "Manager Conversation"),
    ],
}


def _events_template(data: dict, cycle_type: str) -> list[dict]:
    """Milestone skeleton for a new cycle: cloned (ids+labels, blank dates) from an
    existing cycle of the same type, else the built-in default for that type."""
    for c in data.get("cycles", {}).values():
        if c.get("type") == cycle_type and c.get("events"):
            return [
                {"id": e["id"], "label": e["label"], "start": "", "end": ""} for e in c["events"]
            ]
    return [
        {"id": i, "label": label, "start": "", "end": ""}
        for i, label in _EVENT_TEMPLATES.get(cycle_type, [])
    ]


def create_global_cycle(name: str, cycle_type: str) -> dict:
    """Add a cycle definition to cycles.yaml with a per-type event template.
    Returns the full updated cycles data."""
    data = read_cycles()
    cycles = data.setdefault("cycles", {})
    base = _slugify(name)
    cid = base
    n = 2
    while cid in cycles:
        cid = f"{base}-{n}"
        n += 1
    cycles[cid] = {"name": name, "type": cycle_type, "events": _events_template(data, cycle_type)}
    write_cycles(data)
    return data


def delete_global_cycle(cycle_id: str) -> dict:
    """Remove a cycle definition and every person's folder for it. Repoints
    active_cycle if needed. Caller is responsible for guarding the last cycle."""
    data = read_cycles()
    cycles = data.get("cycles", {})
    cycles.pop(cycle_id, None)
    if data.get("active_cycle") == cycle_id and cycles:
        data["active_cycle"] = next(iter(cycles))
    write_cycles(data)
    for person in list_people():
        delete_cycle(person["name"], cycle_id)
    return data


def get_cycle_dir(person_id: str, cycle_id: str) -> Path:
    return DATA_DIR / "people" / person_id / "cycles" / cycle_id


def save_document(person_id: str, cycle_id: str, filename: str, content: bytes) -> Path:
    originals_dir = get_cycle_dir(person_id, cycle_id) / "originals"
    originals_dir.mkdir(parents=True, exist_ok=True)
    dest = originals_dir / filename
    dest.write_bytes(content)
    return dest


def get_document_path(person_id: str, cycle_id: str, filename: str) -> Path | None:
    path = get_cycle_dir(person_id, cycle_id) / filename
    return path if path.exists() else None


def register_document(person_id: str, cycle_id: str, entry: dict) -> None:
    """Add or update a document entry in summary.yaml documents list."""
    summary = get_cycle_summary(person_id, cycle_id) or {}
    docs = summary.get("documents", [])
    docs = [d for d in docs if d.get("file") != entry["file"]]
    docs.append(entry)
    summary["documents"] = docs
    write_cycle_summary(person_id, cycle_id, summary)


def delete_person(person_id: str) -> None:
    import shutil

    person_dir = DATA_DIR / "people" / person_id
    if person_dir.exists():
        shutil.rmtree(person_dir)


def delete_cycle(person_id: str, cycle_id: str) -> None:
    import shutil

    cycle_dir = get_cycle_dir(person_id, cycle_id)
    if cycle_dir.exists():
        shutil.rmtree(cycle_dir)


def delete_document(person_id: str, cycle_id: str, filename: str) -> None:
    """Remove document entry and its files. Competencies are reset so callers can re-ingest."""
    cycle_dir = get_cycle_dir(person_id, cycle_id)
    summary = get_cycle_summary(person_id, cycle_id) or {}
    docs = summary.get("documents", [])

    target = next((d for d in docs if d.get("file") == filename), None)
    summary["documents"] = [d for d in docs if d.get("file") != filename]

    # delete markdown file
    md_path = cycle_dir / filename
    if md_path.exists():
        md_path.unlink()

    # delete original PDF if recorded
    if target:
        src = target.get("source_pdf", "")
        if src:
            pdf_path = cycle_dir / src
            if pdf_path.exists():
                pdf_path.unlink()

    # clear competencies so they get rebuilt from remaining docs
    summary.pop("competencies", None)
    write_cycle_summary(person_id, cycle_id, summary)
