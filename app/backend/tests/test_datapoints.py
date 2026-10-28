"""Data points live in the vault: <vault>/.ozos/datapoints.json plus one cached
value per point under <vault>/.ozos/datapoint-cache/."""

import json

import pytest

from backend.services import datapoints
from backend.services.datapoints import (
    add_datapoint,
    cache_path,
    delete_datapoint,
    load_datapoints,
    normalize_source,
    read_value,
    refresh_health,
    update_datapoint,
    write_error,
    write_rows,
)


@pytest.fixture
def dp_env(tmp_path, monkeypatch):
    vault = tmp_path / "vault"
    monkeypatch.setattr(datapoints, "DATAPOINTS_FILE", vault / ".ozos" / "datapoints.json")
    monkeypatch.setattr(datapoints, "CACHE_DIR", vault / ".ozos" / "datapoint-cache")
    return vault


def test_load_tolerates_missing_malformed_and_bad_fields(dp_env):
    assert load_datapoints() == []
    f = datapoints.DATAPOINTS_FILE
    f.parent.mkdir(parents=True)
    f.write_text("{nope")
    assert load_datapoints() == []
    f.write_text(
        json.dumps(
            {
                "datapoints": [
                    {
                        "id": "a",
                        "name": "A",
                        "source": {"kind": "metabase", "card_id": 42},
                        "display": "pie",
                        "refresh": "hourly",
                    },
                    {"id": "b", "name": "", "source": {"kind": "metabase", "card_id": 1}},
                    {"id": "c", "name": "C", "source": {"kind": "ftp"}},
                ]
            }
        )
    )
    [a] = load_datapoints()
    assert a["display"] == "number" and a["refresh"] == "manual" and a["unit"] == ""
    assert a["id"] == "a" and a["source"] == {"kind": "metabase", "card_id": 42}


def test_normalize_source_shapes_and_vault_escape(dp_env):
    assert normalize_source({"kind": "metabase", "card_id": "42"}) == {
        "kind": "metabase",
        "card_id": 42,
    }
    assert normalize_source({"kind": "csv", "path": "data/signups.csv", "column": ""}) == {
        "kind": "csv",
        "path": "data/signups.csv",
        "column": None,
    }
    src = normalize_source({"kind": "sqlite", "path": "data/app.db", "query": "select 1"})
    assert src["query"] == "select 1"
    for bad in (
        {"kind": "metabase", "card_id": 0},
        {"kind": "metabase", "card_id": "x"},
        {"kind": "sqlite", "path": "x.db", "query": " "},
        {"kind": "sqlite", "path": " ", "query": "select 1"},
        {"kind": "csv", "path": "../outside.csv"},
        {"kind": "csv", "path": "/etc/passwd"},
        {"kind": "ftp"},
        "not a dict",
    ):
        with pytest.raises(ValueError):
            normalize_source(bad)


def test_add_update_delete(dp_env):
    dp = add_datapoint(
        {
            "name": "Weekly signups",
            "source": {"kind": "metabase", "card_id": 42},
            "display": "number",
            "refresh": "daily",
            "unit": "users",
        }
    )
    assert dp["id"] == "weekly-signups" and dp["created_at"]
    stored = json.loads(datapoints.DATAPOINTS_FILE.read_text())["datapoints"]
    assert stored[0]["unit"] == "users"
    with pytest.raises(FileExistsError):
        add_datapoint({"name": "Weekly Signups!", "source": {"kind": "metabase", "card_id": 1}})
    with pytest.raises(ValueError):
        add_datapoint({"name": "  ", "source": {"kind": "metabase", "card_id": 1}})
    with pytest.raises(ValueError):
        add_datapoint({"name": "x", "source": {"kind": "metabase", "card_id": 1}, "display": "pie"})
    with pytest.raises(ValueError):
        add_datapoint({"name": "???", "source": {"kind": "metabase", "card_id": 1}})
    assert len(load_datapoints()) == 1

    write_rows("weekly-signups", ["n"], [[5]])
    upd = update_datapoint("weekly-signups", {"name": "Signups", "display": "line"})
    assert upd["id"] == "weekly-signups" and upd["name"] == "Signups"
    assert upd["display"] == "line" and upd["refresh"] == "daily"
    assert read_value("weekly-signups")["rows"] == [[5]]
    update_datapoint("weekly-signups", {"source": {"kind": "metabase", "card_id": 43}})
    assert read_value("weekly-signups")["fetched_at"] is None  # source changed → cache dropped
    with pytest.raises(ValueError):
        update_datapoint("weekly-signups", {"refresh": "hourly"})
    with pytest.raises(KeyError):
        update_datapoint("nope", {"unit": "x"})

    write_rows("weekly-signups", ["n"], [[5]])
    delete_datapoint("weekly-signups")
    assert load_datapoints() == [] and not cache_path("weekly-signups").exists()
    with pytest.raises(KeyError):
        delete_datapoint("weekly-signups")


def test_cache_value_and_health(dp_env):
    assert refresh_health() is None
    add_datapoint({"name": "A", "source": {"kind": "metabase", "card_id": 1}})
    assert read_value("a") == {
        "id": "a",
        "fetched_at": None,
        "columns": [],
        "rows": [],
        "error": None,
    }
    assert refresh_health() == {"id": "datapoints-refresh", "status": "ok", "message": ""}
    write_rows("a", ["x", "y"], [[1, 2]])
    v = read_value("a")
    assert v["columns"] == ["x", "y"] and v["rows"] == [[1, 2]]
    assert v["error"] is None and v["fetched_at"]
    write_error("a", "boom")
    v = read_value("a")
    assert v["error"] == "boom" and v["rows"] == [] and v["columns"] == []
    assert refresh_health() == {"id": "datapoints-refresh", "status": "fail", "message": "A: boom"}
    cache_path("a").write_text("{nope")
    assert read_value("a")["fetched_at"] is None


def test_refresh_writes_rows_or_error_and_refresh_all_filters_daily(dp_env, monkeypatch):
    from backend.services import datapoint_sources
    from backend.services.datapoints import refresh_all, refresh_datapoint

    add_datapoint(
        {
            "name": "A",
            "source": {"kind": "csv", "path": "a.csv", "column": None},
            "refresh": "daily",
        }
    )
    add_datapoint({"name": "B", "source": {"kind": "csv", "path": "b.csv", "column": None}})
    calls = []

    def fake_fetch(source):
        calls.append(source["path"])
        if source["path"] == "b.csv":
            raise FileNotFoundError("b.csv not found in the vault")
        return ["n"], [[7]]

    monkeypatch.setattr(datapoint_sources, "fetch", fake_fetch)
    assert refresh_datapoint("a")["rows"] == [[7]]
    v = refresh_datapoint("b")
    assert v["error"] == "b.csv not found in the vault" and v["fetched_at"]
    with pytest.raises(KeyError):
        refresh_datapoint("nope")
    calls.clear()
    assert refresh_all(daily_only=True) == {"refreshed": 1, "failed": []}
    assert calls == ["a.csv"]
    assert refresh_all() == {"refreshed": 1, "failed": ["b"]}


def test_cache_never_holds_non_finite_numbers(dp_env):
    write_rows("a", ["n", "label"], [[float("nan"), "x"], [float("inf"), 1.5]])
    assert read_value("a")["rows"] == [[None, "x"], [None, 1.5]]
    assert (
        "NaN" not in cache_path("a").read_text() and "Infinity" not in cache_path("a").read_text()
    )


@pytest.mark.parametrize("bad", [5, "x", {"a": 1}])
def test_load_datapoints_ignores_a_non_list_key(dp_env, bad):
    f = datapoints.DATAPOINTS_FILE
    f.parent.mkdir(parents=True)
    f.write_text(json.dumps({"datapoints": bad}))
    assert load_datapoints() == []
