"""Tests for skills/run_log.py — the shared per-vital run-log helper."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from run_log import read_last_run, read_runs, record_run


FIXED = datetime(2026, 6, 17, 10, 0, 0, tzinfo=timezone.utc)


def test_record_run_creates_dir_and_writes_record(tmp_path):
    runs = tmp_path / "runs"  # does not exist yet
    record_run(runs, "meeting-notes", count=2, items=["a", "b"], now=FIXED)
    path = runs / "meeting-notes.jsonl"
    assert path.exists()
    rec = json.loads(path.read_text().splitlines()[0])
    assert rec["count"] == 2
    assert rec["items"] == ["a", "b"]
    assert rec["ts"] == FIXED.isoformat()


def test_read_last_run_returns_latest_of_many(tmp_path):
    record_run(tmp_path, "meeting-notes", 1, ["first"], now=FIXED)
    record_run(tmp_path, "meeting-notes", 3, ["x", "y", "z"], now=FIXED)
    last = read_last_run(tmp_path, "meeting-notes")
    assert last["count"] == 3
    assert last["items"] == ["x", "y", "z"]


def test_read_last_run_missing_file_returns_none(tmp_path):
    assert read_last_run(tmp_path, "never-run") is None


def test_read_last_run_skips_corrupt_last_line(tmp_path):
    record_run(tmp_path, "daily-digest", 4, ["s1", "s2"], now=FIXED)
    # Append a corrupt trailing line directly.
    (tmp_path / "daily-digest.jsonl").open("a").write("{not json\n")
    last = read_last_run(tmp_path, "daily-digest")
    assert last is not None
    assert last["count"] == 4  # falls back to the last valid record


def test_read_last_run_all_corrupt_returns_none(tmp_path):
    (tmp_path / "broken.jsonl").write_text("garbage\n{also bad\n")
    assert read_last_run(tmp_path, "broken") is None


def test_read_last_run_picks_newest_by_timestamp_not_line_order(tmp_path):
    """A record appended out of chronological order must not skew 'last run'."""
    from datetime import timedelta

    older = FIXED - timedelta(hours=3)
    record_run(tmp_path, "v", 5, ["new"], now=FIXED)
    record_run(tmp_path, "v", 1, ["old"], now=older)  # appended last, but older ts
    last = read_last_run(tmp_path, "v")
    assert last["count"] == 5
    assert last["items"] == ["new"]


def test_read_runs_returns_all_records_in_order(tmp_path):
    record_run(tmp_path, "meeting-notes", 1, ["first"], now=FIXED)
    record_run(tmp_path, "meeting-notes", 2, ["a", "b"], now=FIXED)
    runs = read_runs(tmp_path, "meeting-notes")
    assert [r["count"] for r in runs] == [1, 2]


def test_read_runs_missing_file_returns_empty(tmp_path):
    assert read_runs(tmp_path, "never") == []


def test_read_runs_skips_corrupt_lines(tmp_path):
    record_run(tmp_path, "x", 1, ["ok"], now=FIXED)
    (tmp_path / "x.jsonl").open("a").write("{broken\n")
    record_run(tmp_path, "x", 2, ["ok2"], now=FIXED)
    runs = read_runs(tmp_path, "x")
    assert [r["count"] for r in runs] == [1, 2]


def test_record_run_zero_count_still_recorded(tmp_path):
    """A run that produced nothing still leaves a record (true last-executed)."""
    record_run(tmp_path, "meeting-notes", 0, [], now=FIXED)
    last = read_last_run(tmp_path, "meeting-notes")
    assert last["count"] == 0
    assert last["items"] == []
