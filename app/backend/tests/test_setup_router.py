import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import setup_state, setup_view

client = TestClient(app)


@pytest.fixture
def client_env(tmp_path, monkeypatch):
    monkeypatch.setattr(setup_state, "SETUP_FILE", tmp_path / ".ozos" / "setup.json")
    monkeypatch.setattr(setup_view, "load_user_config", lambda: {})
    monkeypatch.setattr(setup_view, "discover_mcps", lambda: {"remote": [], "local": []})
    monkeypatch.setattr(setup_view, "load_vitals", lambda: [])
    return tmp_path


def test_get_setup_lists_groups(client_env):
    r = client.get("/api/setup")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["total"] == 17 and len(body["groups"]) == 10


def test_put_item_status(client_env):
    r = client.put("/api/setup/items/granola", json={"status": "skipped", "notes": "no granola"})
    assert r.status_code == 200
    assert r.json()["status"] == "skipped" and r.json()["notes"] == "no granola"
    assert client.get("/api/setup").json()["summary"]["open"] == 16


def test_put_unknown_item_404_and_bad_status_422(client_env):
    assert client.put("/api/setup/items/nope", json={"status": "done"}).status_code == 404
    assert client.put("/api/setup/items/granola", json={"status": "finished"}).status_code == 422
    assert not (client_env / ".ozos" / "setup.json").exists()


def test_dismiss(client_env):
    assert client.post("/api/setup/dismiss").json() == {"badge_dismissed": True}
    assert client.get("/api/setup").json()["summary"]["badge_dismissed"] is True
