"""/api/goals: list, add, patch, delete and Atlassian sync over HTTP."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import goals, goals_sync, setup_state
from backend.services.goals import normalize_goal, replace_synced
from backend.services.goals_sync import ENV_NAMES

client = TestClient(app)


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(goals, "GOALS_FILE", tmp_path / ".ozos" / "goals.json")
    monkeypatch.setattr(setup_state, "SETUP_FILE", tmp_path / ".ozos" / "setup.json")
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(goals_sync, "ENV_FILE", tmp_path / ".env")
    return tmp_path


def test_get_goals_empty_shape(env):
    r = client.get("/api/goals")
    assert r.status_code == 200
    body = r.json()
    assert body["goals"] == [] and body["sync"] is None
    assert body["connector"] == {"configured": False, "missing": list(ENV_NAMES)}
    assert body["statuses"][0] == "on_track" and len(body["statuses"]) == 6


def test_post_put_delete_manual_goal(env):
    r = client.post(
        "/api/goals", json={"title": "Grow activation", "status": "on_track", "progress": 10}
    )
    assert r.status_code == 200 and r.json()["id"] == "grow-activation"
    assert client.post("/api/goals", json={"title": "Grow activation"}).status_code == 409
    assert client.post("/api/goals", json={"title": ""}).status_code == 422
    assert client.post("/api/goals", json={"title": "x", "progress": 101}).status_code == 422
    assert client.post("/api/goals", json={"title": "x", "status": "done"}).status_code == 422
    r = client.put("/api/goals/grow-activation", json={"status": "at_risk"})
    assert r.status_code == 200 and r.json()["status"] == "at_risk" and r.json()["progress"] == 10
    r = client.put("/api/goals/grow-activation", json={"progress": None})
    assert r.status_code == 200 and r.json()["progress"] is None
    assert client.put("/api/goals/grow-activation", json={"progress": -5}).status_code == 422
    assert client.put("/api/goals/nope", json={"status": "at_risk"}).status_code == 404
    assert client.delete("/api/goals/grow-activation").json() == {"deleted": "grow-activation"}
    assert client.delete("/api/goals/grow-activation").status_code == 404
    assert client.get("/api/goals").json()["goals"] == []


def test_synced_goal_is_read_only_over_http(env):
    replace_synced(
        [
            normalize_goal(
                {"id": "atlassian-1", "title": "R", "external_id": "ari:1"}, source="atlassian"
            )
        ],
        "atlassian",
    )
    assert client.put("/api/goals/atlassian-1", json={"title": "x"}).status_code == 409
    assert client.delete("/api/goals/atlassian-1").status_code == 409
    r = client.put("/api/goals/atlassian-1", json={"data_point_id": "dp"})
    assert r.status_code == 200 and r.json()["data_point_id"] == "dp"


def test_sync_endpoint_422_without_credentials_and_502_on_remote_error(env, monkeypatch):
    r = client.post("/api/goals/sync")
    assert r.status_code == 422 and "ATLASSIAN_EMAIL" in r.json()["detail"]
    (env / ".env").write_text("\n".join(f"{n}=x" for n in ENV_NAMES) + "\n")

    def boom(creds):
        raise RuntimeError("Error: Authentication failed")

    monkeypatch.setattr(goals_sync, "fetch_remote", boom)
    r = client.post("/api/goals/sync")
    assert r.status_code == 502 and "Authentication failed" in r.json()["detail"]
    assert client.get("/api/goals").json()["sync"]["status"] == "fail"
    monkeypatch.setattr(
        goals_sync,
        "fetch_remote",
        lambda c: [{"id": "ari:goal/1", "name": "R", "status": {"value": "on_track"}}],
    )
    r = client.post("/api/goals/sync")
    assert r.status_code == 200 and r.json()["synced"] == 1
    assert client.get("/api/goals").json()["connector"]["configured"] is True
