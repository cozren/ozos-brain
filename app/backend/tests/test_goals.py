"""Goals live in <vault>/.ozos/goals.json: manual goals and goals pulled from a
connector share one shape and one status vocabulary."""

import json

import pytest

from backend.services import goals, setup_state
from backend.services.goals import (
    add_goal,
    delete_goal,
    load_goals,
    normalize_goal,
    record_sync_failure,
    replace_synced,
    sync_health,
    update_goal,
)
from backend.services.setup_state import load_state


@pytest.fixture
def goals_file(tmp_path, monkeypatch):
    path = tmp_path / ".ozos" / "goals.json"
    monkeypatch.setattr(goals, "GOALS_FILE", path)
    monkeypatch.setattr(setup_state, "SETUP_FILE", tmp_path / ".ozos" / "setup.json")
    return path


def _remote(i: int, title: str | None = None) -> dict:
    return normalize_goal(
        {"id": f"atlassian-{i}", "title": title or f"R{i}", "external_id": f"ari:{i}"},
        source="atlassian",
    )


def test_load_goals_tolerates_missing_and_malformed(goals_file):
    assert load_goals() == {"goals": [], "sync": None}
    goals_file.parent.mkdir(parents=True)
    goals_file.write_text("{nope")
    assert load_goals() == {"goals": [], "sync": None}
    goals_file.write_text(json.dumps({"goals": [{"id": "x", "title": "X", "status": "weird"}]}))
    [g] = load_goals()["goals"]
    assert g["status"] == "pending" and g["source"] == "manual" and g["data_point_id"] is None
    assert g["progress"] is None and g["external_id"] is None and g["synced_at"] is None


def test_add_goal_slugs_marks_done_and_rejects_duplicates_and_blank(goals_file):
    g = add_goal({"title": "Grow activation", "owner": "Pat", "status": "on_track", "progress": 20})
    assert g["id"] == "grow-activation" and g["source"] == "manual" and g["progress"] == 20
    assert json.loads(goals_file.read_text())["goals"][0]["title"] == "Grow activation"
    assert load_state()["items"]["define-goals"]["status"] == "done"
    with pytest.raises(FileExistsError):
        add_goal({"title": "Grow Activation!"})
    with pytest.raises(ValueError):
        add_goal({"title": "   "})
    with pytest.raises(ValueError):
        add_goal({"title": "Bad", "progress": 101})
    with pytest.raises(ValueError):
        add_goal({"title": "Bad", "status": "done"})
    assert len(load_goals()["goals"]) == 1


def test_update_and_delete_manual_goal(goals_file):
    add_goal({"title": "Ship onboarding"})
    g = update_goal(
        "ship-onboarding", {"status": "at_risk", "progress": 40, "title": "Ship onboarding v2"}
    )
    assert g["id"] == "ship-onboarding" and g["status"] == "at_risk"
    assert g["title"] == "Ship onboarding v2" and g["progress"] == 40
    with pytest.raises(ValueError):
        update_goal("ship-onboarding", {"progress": -1})
    with pytest.raises(KeyError):
        update_goal("nope", {"status": "pending"})
    delete_goal("ship-onboarding")
    assert load_goals()["goals"] == []
    with pytest.raises(KeyError):
        delete_goal("ship-onboarding")


def test_synced_goals_are_read_only_except_binding(goals_file):
    replace_synced([_remote(1, "Remote")], "atlassian")
    with pytest.raises(PermissionError):
        update_goal("atlassian-1", {"title": "Local rename"})
    with pytest.raises(PermissionError):
        delete_goal("atlassian-1")
    assert update_goal("atlassian-1", {"data_point_id": "dp-1"})["data_point_id"] == "dp-1"


def test_replace_synced_keeps_manual_and_bindings_and_drops_vanished(goals_file):
    add_goal({"title": "Manual one"})
    replace_synced([_remote(1), _remote(2)], "atlassian")
    update_goal("atlassian-1", {"data_point_id": "dp-1"})
    state = replace_synced([_remote(1, "R1 renamed")], "atlassian")
    ids = {g["id"]: g for g in state["goals"]}
    assert set(ids) == {"manual-one", "atlassian-1"}
    assert ids["atlassian-1"]["data_point_id"] == "dp-1"
    assert ids["atlassian-1"]["title"] == "R1 renamed"
    assert ids["atlassian-1"]["synced_at"] is not None
    assert state["sync"]["status"] == "ok" and state["sync"]["count"] == 1
    assert load_state()["items"]["define-goals"]["status"] == "done"


def test_record_sync_failure_leaves_goals_and_reports_health(goals_file):
    add_goal({"title": "Keep me"})
    assert sync_health() is None
    record_sync_failure("Authentication failed")
    assert [g["id"] for g in load_goals()["goals"]] == ["keep-me"]
    assert load_goals()["sync"]["status"] == "fail"
    assert sync_health() == {
        "id": "goals-sync",
        "status": "fail",
        "message": "Authentication failed",
    }
