"""Shared per-vital run-log helper.

Tools (meeting-notes, daily-digest) append a record each time they run; the
OZOS Brain Command Hub reads the latest record to show when a vital function
last executed, the delta (items added), and the titles produced.

One append-only JSONL file per vital lives under a runs directory
(``.ozos/runs/<vital-id>.jsonl``). Each line:

    {"ts": "2026-06-17T10:00:00+00:00", "count": 2, "items": ["title a", "title b"]}

The last valid line is the last run. Writing is best-effort for callers: a
run-log failure should never break the sync/digest itself.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional


def record_run(
    runs_dir: Path | str,
    vital_id: str,
    count: int,
    items: Iterable[str],
    now: Optional[datetime] = None,
) -> dict:
    """Append a run record for ``vital_id`` to ``runs_dir/<vital_id>.jsonl``.

    Creates ``runs_dir`` if missing. Returns the written record.
    """
    timestamp = (now or datetime.now(timezone.utc)).isoformat()
    record = {"ts": timestamp, "count": int(count), "items": list(items)}

    path = Path(runs_dir)
    path.mkdir(parents=True, exist_ok=True)
    with (path / f"{vital_id}.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def read_last_run(runs_dir: Path | str, vital_id: str) -> Optional[dict]:
    """Return the most recent valid run record for ``vital_id``, or None.

    "Most recent" is decided by the record's ``ts`` (not file line order), so an
    entry appended out of chronological order can't skew the result. Ties are
    broken in favour of the later line. Returns None if there are no valid records.
    """
    records = read_runs(runs_dir, vital_id)
    if not records:
        return None
    # max by (ts, index): newest timestamp wins; equal ts → later line wins.
    return max(enumerate(records), key=lambda pair: (pair[1].get("ts", ""), pair[0]))[1]


def read_runs(runs_dir: Path | str, vital_id: str) -> list[dict]:
    """Return all valid run records for ``vital_id`` in chronological order.

    Missing file → empty list. Corrupt lines are skipped.
    """
    path = Path(runs_dir) / f"{vital_id}.jsonl"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (FileNotFoundError, NotADirectoryError):
        return []

    records: list[dict] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records
