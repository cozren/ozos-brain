"""/api/datapoints: definitions, cached values, refresh and the Metabase test."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import datapoint_sources, datapoints

client = TestClient(app)


@pytest.fixture
def env(tmp_path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(datapoints, "DATAPOINTS_FILE", vault / ".ozos" / "datapoints.json")
    monkeypatch.setattr(datapoints, "CACHE_DIR", vault / ".ozos" / "datapoint-cache")
    monkeypatch.setattr(datapoint_sources, "ENV_FILE", vault / ".env")
    for name in ("METABASE_URL", "METABASE_API_KEY", "METABASE_USERNAME", "METABASE_PASSWORD"):
        monkeypatch.delenv(name, raising=False)
    return vault


def test_get_empty_shape(env):
    body = client.get("/api/datapoints").json()
    assert body["datapoints"] == [] and body["connector"]["configured"] is False
    assert body["displays"] == ["number", "table", "line"]
    assert body["refreshes"] == ["manual", "daily"]
    assert body["kinds"] == ["metabase", "sqlite", "csv"]


def test_post_put_delete(env):
    r = client.post(
        "/api/datapoints",
        json={
            "name": "Weekly signups",
            "source": {"kind": "metabase", "card_id": 42},
            "display": "number",
            "unit": "users",
        },
    )
    assert r.status_code == 200
    assert r.json()["id"] == "weekly-signups" and r.json()["refresh"] == "manual"
    dup = client.post(
        "/api/datapoints",
        json={"name": "weekly signups", "source": {"kind": "metabase", "card_id": 1}},
    )
    assert dup.status_code == 409 and "weekly-signups" in dup.json()["detail"]
    assert (
        client.post(
            "/api/datapoints", json={"name": "x", "source": {"kind": "csv", "path": "../x.csv"}}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/datapoints",
            json={"name": "x", "source": {"kind": "metabase", "card_id": 1}, "display": "pie"},
        ).status_code
        == 422
    )
    assert (
        client.put("/api/datapoints/weekly-signups", json={"refresh": "daily"}).json()["refresh"]
        == "daily"
    )
    assert (
        client.put("/api/datapoints/weekly-signups", json={"refresh": "hourly"}).status_code == 422
    )
    assert client.put("/api/datapoints/nope", json={"unit": "x"}).status_code == 404
    assert client.delete("/api/datapoints/weekly-signups").json() == {"deleted": "weekly-signups"}
    assert client.delete("/api/datapoints/weekly-signups").status_code == 404


def test_value_refresh_and_refresh_all(env, monkeypatch):
    client.post(
        "/api/datapoints",
        json={"name": "A", "source": {"kind": "csv", "path": "a.csv"}, "refresh": "daily"},
    )
    assert client.get("/api/datapoints/a/value").json() == {
        "id": "a",
        "fetched_at": None,
        "columns": [],
        "rows": [],
        "error": None,
    }
    assert client.get("/api/datapoints/nope/value").status_code == 404
    monkeypatch.setattr(datapoint_sources, "fetch", lambda s: (["n"], [[3]]))
    assert client.post("/api/datapoints/a/refresh").json()["rows"] == [[3]]

    def boom(s):
        raise RuntimeError("bad file")

    monkeypatch.setattr(datapoint_sources, "fetch", boom)
    r = client.post("/api/datapoints/a/refresh")
    assert r.status_code == 200 and r.json()["error"] == "bad file"
    assert client.post("/api/datapoints/refresh").json() == {"refreshed": 0, "failed": ["a"]}
    assert client.post("/api/datapoints/nope/refresh").status_code == 404


def test_metabase_test_endpoint(env, monkeypatch):
    r = client.post("/api/datapoints/metabase/test")
    assert r.status_code == 422 and "METABASE_URL" in r.json()["detail"]
    monkeypatch.setattr(
        datapoint_sources, "test_metabase", lambda: "Connected as pat@yourcompany.com"
    )
    assert client.post("/api/datapoints/metabase/test").json() == {
        "ok": True,
        "message": "Connected as pat@yourcompany.com",
    }

    def bad():
        raise RuntimeError("401")

    monkeypatch.setattr(datapoint_sources, "test_metabase", bad)
    r = client.post("/api/datapoints/metabase/test")
    assert r.status_code == 502 and "401" in r.json()["detail"]
