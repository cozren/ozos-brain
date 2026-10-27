# backend/tests/test_reporting.py
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import reporting as svc

client = TestClient(app)

BASE = "/api/reporting"


# ---- sources ----


def test_list_sources_returns_200():
    r = client.get(f"{BASE}/sources")
    assert r.status_code == 200


def test_list_sources_includes_daily_digest():
    sources = client.get(f"{BASE}/sources").json()
    ids = {s["id"] for s in sources}
    assert "daily-digest" in ids
    digest = next(s for s in sources if s["id"] == "daily-digest")
    assert digest["label"] == "Daily Digest"
    assert digest["kind"] == "script"
    assert digest["body"] == "markdown"
    assert digest["runnable"] is True


def test_list_sources_includes_meeting_notes_archive():
    sources = client.get(f"{BASE}/sources").json()
    mn = next((s for s in sources if s["id"] == "meeting-notes"), None)
    assert mn is not None
    assert mn["label"] == "Meeting Notes"
    assert mn["kind"] == "archive"
    assert mn["runnable"] is False  # archives have no generator to run


def test_reporting_sources_are_generic_only():
    ids = {s["id"] for s in svc.list_sources()}
    assert ids == {"daily-digest", "meeting-notes", "intel-agents"}


def test_list_sources_includes_intel_agents_archive():
    sources = client.get(f"{BASE}/sources").json()
    intel = next((s for s in sources if s["id"] == "intel-agents"), None)
    assert intel is not None
    assert intel["label"] == "Intel Agents"
    assert intel["kind"] == "archive"  # tile appears in the picker; console uses /intel-agents/*
    assert intel["body"] == "intel-agents"  # custom JSON body -> console widget
    assert intel["runnable"] is False  # runs go through the /intel-agents/*/run endpoint


# ---- instances ----


@pytest.fixture
def seeded_sources(tmp_path, monkeypatch):
    """Point the daily-digest and meeting-notes sources at throwaway folders with
    sample instances, so these tests never depend on a real vault."""
    digests = tmp_path / "digests"
    digests.mkdir()
    (digests / "digest-2026-01-05.md").write_text("# Digest Jan 5\n\nolder\n")
    (digests / "digest-2026-02-10.md").write_text("# Digest Feb 10\n\nnewer\n")
    notes = tmp_path / "meeting-notes" / "Alex"
    notes.mkdir(parents=True)
    (notes / "2026-03-01 — Alex 1-1.md").write_text("# Alex 1-1\n\nnotes\n")
    for source in svc.SOURCES:
        if source["id"] == "daily-digest":
            monkeypatch.setitem(source, "instances_dir", digests)
        if source["id"] == "meeting-notes":
            monkeypatch.setitem(source, "instances_dir", tmp_path / "meeting-notes")
    return tmp_path


def test_list_instances_returns_dated_items_newest_first(seeded_sources):
    items = client.get(f"{BASE}/sources/daily-digest/instances").json()
    assert isinstance(items, list)
    assert len(items) == 2
    first = items[0]
    assert {"id", "date", "label", "age"} <= set(first.keys())
    dates = [it["date"] for it in items]
    assert dates == sorted(dates, reverse=True)  # newest first


def test_list_instances_unknown_source_404():
    assert client.get(f"{BASE}/sources/nope/instances").status_code == 404


def test_get_latest_instance_returns_markdown_content(seeded_sources):
    r = client.get(f"{BASE}/sources/daily-digest/instances/latest")
    assert r.status_code == 200
    body = r.json()
    assert body["body"] == "markdown"
    assert "newer" in body["content"]


def test_get_specific_instance_by_id(seeded_sources):
    items = client.get(f"{BASE}/sources/daily-digest/instances").json()
    target = items[-1]["id"]
    r = client.get(f"{BASE}/sources/daily-digest/instances/{target}")
    assert r.status_code == 200
    assert r.json()["id"] == target


def test_get_unknown_instance_404(seeded_sources):
    r = client.get(f"{BASE}/sources/daily-digest/instances/digest-1999-01-01.md")
    assert r.status_code == 404


def test_meeting_notes_instances_use_nested_paths_and_title_labels(seeded_sources):
    items = client.get(f"{BASE}/sources/meeting-notes/instances").json()
    assert len(items) == 1
    # nested per-person folders -> ids carry a subfolder
    assert "/" in items[0]["id"]
    # title labels are not bare ISO dates
    assert items[0]["label"] != items[0]["date"]


def test_meeting_notes_nested_instance_content_resolves(seeded_sources):
    items = client.get(f"{BASE}/sources/meeting-notes/instances").json()
    target = next(it for it in items if "/" in it["id"])
    r = client.get(f"{BASE}/sources/meeting-notes/instances/{target['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == target["id"]
    assert len(r.json()["content"]) > 0


def test_meeting_notes_latest_resolves(seeded_sources):
    r = client.get(f"{BASE}/sources/meeting-notes/instances/latest")
    assert r.status_code == 200
    assert r.json()["body"] == "markdown"


def test_instances_empty_when_source_folder_missing(tmp_path, monkeypatch):
    for source in svc.SOURCES:
        if source["id"] == "daily-digest":
            monkeypatch.setitem(source, "instances_dir", tmp_path / "absent")
    assert client.get(f"{BASE}/sources/daily-digest/instances").json() == []
    assert client.get(f"{BASE}/sources/daily-digest/instances/latest").status_code == 404


# ---- run ----


def test_run_unknown_source_404():
    assert client.post(f"{BASE}/sources/nope/run").status_code == 404


def test_run_triggers_execution_and_reports_status(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "RUNS_DIR", tmp_path)

    # Run the launched target inline instead of in a real background thread.
    monkeypatch.setattr(svc, "_launch", lambda target: target())

    fake_proc = MagicMock(returncode=0)
    with patch.object(svc.subprocess, "run", return_value=fake_proc) as mock_run:
        r = client.post(f"{BASE}/sources/daily-digest/run")
        assert r.status_code == 200
        assert r.json()["state"] in ("started", "running")
        mock_run.assert_called_once()

    # lock cleared, status file written with exit 0
    assert not (tmp_path / "daily-digest.lock").exists()
    status = json.loads((tmp_path / "daily-digest.run-status.json").read_text())
    assert status["exit"] == 0


def test_run_status_idle_when_never_run(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "RUNS_DIR", tmp_path)
    r = client.get(f"{BASE}/sources/daily-digest/run/status")
    assert r.status_code == 200
    assert r.json()["state"] == "idle"


def test_run_status_running_when_lock_present(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "RUNS_DIR", tmp_path)
    (tmp_path / "daily-digest.lock").write_text("1")
    r = client.get(f"{BASE}/sources/daily-digest/run/status")
    assert r.json()["state"] == "running"


# ---- layout ----


def test_get_layout_returns_default_row_when_unset(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "reporting.json")
    body = client.get(f"{BASE}/layout").json()
    assert "rows" in body
    assert len(body["rows"]) >= 1
    row = body["rows"][0]
    assert "id" in row and "tiles" in row
    tile = row["tiles"][0]
    assert {"i", "refId", "w", "h"} == set(tile.keys())  # NEW shape: no x, refId not sourceId
    assert tile["refId"] == "daily-digest"


def test_save_then_get_layout_roundtrips_rows(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "reporting.json")
    layout = {
        "rows": [
            {
                "id": "row-1",
                "tiles": [
                    {"i": "w1", "refId": "daily-digest", "w": 6, "h": 8},
                    {"i": "w2", "refId": "meeting-notes", "w": 6, "h": 8},
                ],
            },
            {
                "id": "row-2",
                "tiles": [{"i": "w3", "refId": "daily-digest", "w": 4, "h": 8}],
            },
        ]
    }
    r = client.put(f"{BASE}/layout", json=layout)
    assert r.status_code == 200
    got = client.get(f"{BASE}/layout").json()
    assert len(got["rows"]) == 2
    assert got["rows"][0]["tiles"][1]["i"] == "w2"
    assert got["rows"][1]["tiles"][0]["refId"] == "daily-digest"
    # tiles carry no x in the new shape
    assert "x" not in got["rows"][0]["tiles"][0]


def test_save_layout_keeps_empty_rows(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "reporting.json")
    layout = {"rows": [{"id": "row-1", "tiles": []}, {"id": "row-2", "tiles": []}]}
    client.put(f"{BASE}/layout", json=layout)
    got = client.get(f"{BASE}/layout").json()
    assert len(got["rows"]) == 2


def test_save_layout_drops_tiles_with_unknown_source(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "reporting.json")
    layout = {
        "rows": [
            {
                "id": "row-1",
                "tiles": [
                    {"i": "w1", "refId": "daily-digest", "w": 6, "h": 8},
                    {"i": "bad", "refId": "does-not-exist", "w": 6, "h": 8},
                ],
            }
        ]
    }
    client.put(f"{BASE}/layout", json=layout)
    got = client.get(f"{BASE}/layout").json()
    ids = {t["refId"] for row in got["rows"] for t in row["tiles"]}
    assert "does-not-exist" not in ids
    assert "daily-digest" in ids


# ---- layout: read-time migration of OLD shapes ----


def test_get_layout_migrates_old_items_shape(tmp_path, monkeypatch):
    """OLD shape (items/sourceId/x) migrates to NEW (tiles/refId, x dropped)."""
    f = tmp_path / "reporting.json"
    # x out of order: ascending x must determine left->right tile order.
    f.write_text(
        json.dumps(
            {
                "rows": [
                    {
                        "id": "row-1",
                        "items": [
                            {"i": "b", "sourceId": "meeting-notes", "x": 6, "w": 6, "h": 10},
                            {"i": "a", "sourceId": "daily-digest", "x": 0, "w": 6, "h": 10},
                        ],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(svc, "LAYOUT_FILE", f)
    got = client.get(f"{BASE}/layout").json()
    tiles = got["rows"][0]["tiles"]
    assert [t["i"] for t in tiles] == ["a", "b"]  # ordered by ascending old x
    assert tiles[0]["refId"] == "daily-digest"
    assert tiles[1]["refId"] == "meeting-notes"
    assert all("x" not in t and "sourceId" not in t for t in tiles)
    assert {"i", "refId", "w", "h"} == set(tiles[0].keys())


def test_get_layout_migrates_old_items_drops_unknown_source(tmp_path, monkeypatch):
    f = tmp_path / "reporting.json"
    f.write_text(
        json.dumps(
            {
                "rows": [
                    {
                        "id": "row-1",
                        "items": [
                            {"i": "ok", "sourceId": "daily-digest", "x": 0, "w": 6, "h": 10},
                            {"i": "bad", "sourceId": "nope", "x": 6, "w": 6, "h": 10},
                        ],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(svc, "LAYOUT_FILE", f)
    got = client.get(f"{BASE}/layout").json()
    ids = {t["refId"] for row in got["rows"] for t in row["tiles"]}
    assert ids == {"daily-digest"}


def test_get_layout_migrates_legacy_flat_widgets(tmp_path, monkeypatch):
    """Legacy flat {'widgets': [...]} -> single row in the NEW shape."""
    f = tmp_path / "reporting.json"
    f.write_text(
        json.dumps(
            {
                "widgets": [
                    {"i": "w1", "sourceId": "daily-digest", "x": 6, "w": 6, "h": 10},
                    {"i": "w0", "sourceId": "meeting-notes", "x": 0, "w": 6, "h": 10},
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(svc, "LAYOUT_FILE", f)
    got = client.get(f"{BASE}/layout").json()
    assert len(got["rows"]) == 1
    tiles = got["rows"][0]["tiles"]
    assert [t["i"] for t in tiles] == ["w0", "w1"]  # ascending old x
    assert all({"i", "refId", "w", "h"} == set(t.keys()) for t in tiles)
