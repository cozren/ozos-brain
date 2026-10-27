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


# ── action endpoints ────────────────────────────────────────────────────

import shutil  # noqa: E402
from pathlib import Path  # noqa: E402

from backend.services import data, setup_actions  # noqa: E402

TEMPLATE = Path(__file__).resolve().parents[3] / "vault-template"


@pytest.fixture
def action_env(client_env, monkeypatch):
    v = client_env / "vault"
    shutil.copytree(TEMPLATE / "people-hub", v / "people-hub")
    (v / ".ozos").mkdir()
    (v / "knowledge-hub").mkdir()
    monkeypatch.setattr(data, "DATA_DIR", v / "people-hub")
    monkeypatch.setattr(setup_actions, "ROUTING_FILE", v / ".ozos" / "meeting-routing.json")
    monkeypatch.setattr(setup_actions, "SOURCES_FILE", v / ".ozos" / "knowledge-sources.json")
    monkeypatch.setattr(setup_actions, "ENV_FILE", v / ".env")
    monkeypatch.setattr(setup_actions, "KNOWLEDGE_HUB_DIR", v / "knowledge-hub")
    monkeypatch.setattr(setup_actions, "GDRIVE_CREDS", client_env / "nope.json")
    monkeypatch.setattr(setup_actions, "GMAIL_TOKEN", client_env / "nope2.json")
    monkeypatch.setattr(setup_actions, "ME_PERSON_ID", "me")
    return v


def test_post_people_then_duplicate_409(action_env):
    body = {"person_id": "pat", "display_name": "Pat", "email": "p@x.y", "leadership": True}
    r = client.post("/api/setup/people", json=body)
    assert r.status_code == 200 and r.json()["person"]["display_name"] == "Pat"
    assert client.post("/api/setup/people", json=body).status_code == 409
    assert (
        client.post(
            "/api/setup/people", json={"person_id": "Bad Id", "display_name": "x"}
        ).status_code
        == 422
    )


def test_put_cycle_both_modes(action_env):
    r = client.put("/api/setup/cycle", json={"mode": "default"})
    assert r.status_code == 200 and r.json()["cadence"]["mode"] == "default"
    r = client.put(
        "/api/setup/cycle",
        json={"mode": "company", "name": "Annual", "type": "deep-dive", "stages": [{"label": "A"}]},
    )
    assert r.status_code == 200 and r.json()["cycles"]["active_cycle"] == "annual"
    assert (
        client.put(
            "/api/setup/cycle", json={"mode": "company", "name": "", "stages": []}
        ).status_code
        == 422
    )


def test_reminders_endpoint(action_env):
    assert client.get("/api/setup/reminders").json() == []


def test_folders_endpoint(action_env):
    r = client.post("/api/setup/folders", json={"item_id": "pdf-drop-folder", "folder": "pdfs"})
    assert r.status_code == 200 and r.json()["path"] == "knowledge-hub/pdfs"
    assert (
        client.post("/api/setup/folders", json={"item_id": "granola", "folder": "x"}).status_code
        == 422
    )


def test_routing_endpoint(action_env):
    r = client.put("/api/setup/routing", json={"folders": ["A"], "default_folder": "Other"})
    assert r.status_code == 200 and r.json()["folders"] == ["A", "Other"]


def test_env_endpoints_never_echo_values(action_env):
    r = client.put("/api/setup/env", json={"vars": {"ATLASSIAN_EMAIL": "me@x.y"}})
    assert r.status_code == 200 and r.json() == {"set": ["ATLASSIAN_EMAIL"]}
    assert "me@x.y" not in r.text
    g = client.get("/api/setup/env")
    assert g.json() == {
        "ATLASSIAN_EMAIL": True,
        "ATLASSIAN_TOKEN": False,
        "ATLASSIAN_SUBDOMAIN": False,
    }
    assert "me@x.y" not in g.text
    bad = client.put("/api/setup/env", json={"vars": {"ANTHROPIC_API_KEY": "x"}})
    assert (
        bad.status_code == 422
        and "x" not in bad.json()["detail"].split("ANTHROPIC_API_KEY")[-1][:1]
    )


def test_gmail_endpoint(action_env):
    body = client.get("/api/setup/gmail").json()
    assert body["credentials_file"] is False and "--auth" in body["auth_command"]
