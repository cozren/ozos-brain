"""Pulling goals from the Atlassian Goals connector into goals.json. No network:
`fetch_remote` is the seam, and the connector client is patched where the seam
itself is under test."""

import importlib
import json
import sys
from pathlib import Path

import pytest

from backend.services import goals, goals_sync, setup_state
from backend.services.goals import load_goals
from backend.services.goals_sync import (
    ENV_NAMES,
    connector_status,
    credentials,
    fetch_remote,
    map_remote_goal,
    sync_goals,
)

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def goals_file(tmp_path, monkeypatch):
    path = tmp_path / ".ozos" / "goals.json"
    monkeypatch.setattr(goals, "GOALS_FILE", path)
    monkeypatch.setattr(setup_state, "SETUP_FILE", tmp_path / ".ozos" / "setup.json")
    return path


@pytest.fixture
def env_file(tmp_path, monkeypatch):
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    path = tmp_path / ".env"
    monkeypatch.setattr(goals_sync, "ENV_FILE", path)
    return path


def test_credentials_prefer_env_file_and_name_missing(env_file, monkeypatch):
    env_file.write_text('ATLASSIAN_EMAIL="pat@yourcompany.com"\nATLASSIAN_TOKEN=t\n')
    monkeypatch.setenv("ATLASSIAN_SUBDOMAIN", "yourcompany")
    values, missing = credentials()
    assert values["ATLASSIAN_EMAIL"] == "pat@yourcompany.com"
    assert values["ATLASSIAN_SUBDOMAIN"] == "yourcompany"
    assert missing == ["ATLASSIAN_CLOUD_ID"]
    assert connector_status() == {"configured": False, "missing": ["ATLASSIAN_CLOUD_ID"]}
    env_file.write_text(env_file.read_text() + "ATLASSIAN_CLOUD_ID=c\n")
    assert connector_status() == {"configured": True, "missing": []}


def test_map_remote_goal():
    g = map_remote_goal(
        {
            "id": "ari:cloud:townsquare:x:goal/ABC-1",
            "name": "Grow activation",
            "status": {"value": "AT_RISK"},
            "progress": {"percentage": 42.0},
            "owner": {"accountId": "a", "name": "Pat"},
            "targetDate": {"label": "Q4"},
            "startDate": None,
        }
    )
    assert g["id"] == "atlassian-abc-1" and g["external_id"].endswith("goal/ABC-1")
    assert g["status"] == "at_risk" and g["progress"] == 42
    assert g["owner"] == "Pat" and g["target_date"] == "Q4" and g["source"] == "atlassian"
    odd = map_remote_goal({"id": "ari:goal/Z", "name": "Odd", "status": {"value": "archived"}})
    assert odd["status"] == "pending" and odd["progress"] is None and odd["owner"] == ""
    # Atlassian's read-side spellings are aliased onto the engine vocabulary.
    done = map_remote_goal({"id": "ari:goal/D", "name": "Done", "status": {"value": "COMPLETED"}})
    assert done["status"] == "complete"
    paused = map_remote_goal({"id": "ari:goal/P", "name": "P", "status": {"value": "paused"}})
    assert paused["status"] == "pending"


def test_sync_without_credentials_writes_nothing(env_file, goals_file):
    with pytest.raises(LookupError, match="ATLASSIAN_EMAIL is not set"):
        sync_goals()
    assert not goals_file.exists()


def test_sync_success_and_failure(env_file, goals_file, monkeypatch):
    env_file.write_text("\n".join(f"{n}=x" for n in ENV_NAMES) + "\n")
    monkeypatch.setattr(
        goals_sync,
        "fetch_remote",
        lambda creds: [{"id": "ari:goal/1", "name": "Remote", "status": {"value": "on_track"}}],
    )
    out = sync_goals()
    assert out["synced"] == 1 and out["sync"]["status"] == "ok"
    assert load_goals()["goals"][0]["source"] == "atlassian"

    def boom(creds):
        raise RuntimeError("Error: Authentication failed")

    monkeypatch.setattr(goals_sync, "fetch_remote", boom)
    with pytest.raises(RuntimeError, match="Authentication failed"):
        sync_goals()
    state = load_goals()
    assert state["sync"]["status"] == "fail"
    assert [g["id"] for g in state["goals"]] == ["atlassian-1"]


def test_fetch_remote_parses_connector_result(monkeypatch):
    sys.path.insert(0, str(REPO_ROOT / "connectors" / "atlassian-goals"))
    api_client = importlib.import_module("api_client")
    creds = {n: "x" for n in ENV_NAMES}

    async def fake(self, status=None, limit=50):
        return json.dumps([{"id": "ari:goal/1", "name": "R"}])

    monkeypatch.setattr(api_client.AtlassianGoalsClient, "list_goals", fake)
    assert fetch_remote(creds)[0]["name"] == "R"

    async def err(self, status=None, limit=50):
        return "Error: API error 404: nope"

    monkeypatch.setattr(api_client.AtlassianGoalsClient, "list_goals", err)
    with pytest.raises(RuntimeError, match="404"):
        fetch_remote(creds)


def test_sync_records_failure_when_a_remote_goal_cannot_be_mapped(
    env_file, goals_file, monkeypatch
):
    env_file.write_text("\n".join(f"{n}=x" for n in ENV_NAMES) + "\n")
    goals.add_goal({"title": "Keep me"})
    monkeypatch.setattr(
        goals_sync,
        "fetch_remote",
        lambda creds: [
            {"id": "ari:goal/1", "name": "Fine", "status": {"value": "on_track"}},
            {"id": "ari:goal/2", "name": None},
        ],
    )
    with pytest.raises(RuntimeError, match="title is required"):
        sync_goals()
    state = load_goals()
    assert state["sync"]["status"] == "fail"
    assert [g["id"] for g in state["goals"]] == ["keep-me"]


def test_fetch_remote_rejects_a_non_list_payload(monkeypatch):
    sys.path.insert(0, str(REPO_ROOT / "connectors" / "atlassian-goals"))
    api_client = importlib.import_module("api_client")

    async def odd(self, status=None, limit=50):
        return "{}"

    monkeypatch.setattr(api_client.AtlassianGoalsClient, "list_goals", odd)
    with pytest.raises(RuntimeError, match="expected a list"):
        fetch_remote({n: "x" for n in ENV_NAMES})
