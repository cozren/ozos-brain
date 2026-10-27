from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import me as me_router

client = TestClient(app)


def test_me_returns_name_and_id_from_user_config(monkeypatch):
    monkeypatch.setattr(me_router, "load_user_config", lambda: {"name": "Taylor", "me": "taylor"})
    assert client.get("/api/me").json() == {"name": "Taylor", "me": "taylor"}


def test_me_defaults_when_no_config(monkeypatch):
    monkeypatch.setattr(me_router, "load_user_config", lambda: {})
    assert client.get("/api/me").json() == {"name": "", "me": "me"}
