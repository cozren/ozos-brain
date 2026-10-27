"""<vault>/.ozos/setup.json: tolerant to read, explicit to write."""

import json
from datetime import datetime

import pytest

from backend.services import setup_state
from backend.services.setup_registry import ITEM_IDS
from backend.services.setup_state import (
    add_row,
    dismiss_badge,
    load_state,
    set_status,
)


@pytest.fixture
def setup_file(tmp_path, monkeypatch):
    f = tmp_path / ".ozos" / "setup.json"
    monkeypatch.setattr(setup_state, "SETUP_FILE", f)
    return f


def test_load_state_tolerates_missing_and_malformed(setup_file):
    state = load_state()
    assert set(state["items"]) == set(ITEM_IDS)
    assert state["badge_dismissed"] is False and state["cadence"] is None
    setup_file.parent.mkdir(parents=True)
    setup_file.write_text("{nope")
    assert load_state()["items"]["profile"]["status"] == "not_started"
    setup_file.write_text(json.dumps({"items": {"granola": {"status": "done"}}}))
    state = load_state()
    assert state["items"]["granola"]["status"] == "done"
    assert state["items"]["profile"] == {"status": "not_started", "updated_at": None, "notes": ""}


def test_set_status_persists_and_stamps(setup_file):
    entry = set_status("granola", "done", notes="ran /sync-notes")
    assert entry["status"] == "done" and entry["notes"] == "ran /sync-notes"
    assert datetime.fromisoformat(entry["updated_at"]).year == datetime.now().year
    on_disk = json.loads(setup_file.read_text())
    assert on_disk["items"]["granola"]["status"] == "done"
    # notes are kept when a later call does not pass them
    assert set_status("granola", "skipped")["notes"] == "ran /sync-notes"


def test_set_status_rejects_unknown_item_and_status(setup_file):
    with pytest.raises(KeyError):
        set_status("nope", "done")
    with pytest.raises(ValueError):
        set_status("granola", "finished")
    assert not setup_file.exists()


def test_dismiss_badge_and_add_row(setup_file):
    dismiss_badge()
    add_row("add-stakeholder", {"id": "pat", "display_name": "Pat"})
    state = load_state()
    assert state["badge_dismissed"] is True
    assert state["items"]["add-stakeholder"]["rows"] == [{"id": "pat", "display_name": "Pat"}]
