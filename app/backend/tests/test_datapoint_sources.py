"""The three data point sources: a Metabase card, a SQLite query and a CSV file.
Every network call is behind the `metabase_client` seam; files live in tmp_path."""

import os
import sqlite3
import types

import pytest

from backend.services import datapoint_sources, datapoints
from backend.services.datapoint_sources import (
    connector_status,
    fetch,
    metabase_client,
    metabase_credentials,
    test_metabase as check_metabase,
)
from backend.services.datapoints import vault_path

METABASE_NAMES = ("METABASE_URL", "METABASE_API_KEY", "METABASE_USERNAME", "METABASE_PASSWORD")


@pytest.fixture
def src_env(tmp_path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(datapoints, "DATAPOINTS_FILE", vault / ".ozos" / "datapoints.json")
    monkeypatch.setattr(datapoints, "CACHE_DIR", vault / ".ozos" / "datapoint-cache")
    monkeypatch.setattr(datapoint_sources, "ENV_FILE", vault / ".env")
    for name in METABASE_NAMES:
        monkeypatch.delenv(name, raising=False)
    return vault


def test_credentials_and_status(src_env):
    assert connector_status() == {
        "configured": False,
        "missing": ["METABASE_URL", "METABASE_API_KEY"],
    }
    env = datapoint_sources.ENV_FILE
    env.write_text(
        'METABASE_URL="https://mb.yourcompany.com"\nMETABASE_USERNAME=u\nMETABASE_PASSWORD=p\n'
    )
    assert connector_status() == {"configured": True, "missing": []}
    env.write_text('METABASE_URL="https://mb.yourcompany.com"\nMETABASE_API_KEY=k\n')
    creds, missing = metabase_credentials()
    assert creds["METABASE_API_KEY"] == "k" and missing == []
    assert creds["METABASE_URL"] == "https://mb.yourcompany.com"


def test_fetch_metabase_parses_and_raises_on_failed_body(src_env, monkeypatch):
    datapoint_sources.ENV_FILE.write_text(
        "METABASE_URL=https://mb.yourcompany.com\nMETABASE_API_KEY=k\n"
    )

    class FakeClient:
        def __init__(self, body):
            self.body = body

        def query_card(self, card_id):
            assert card_id == 42
            return self.body

    ok = {
        "data": {
            "cols": [{"name": "week"}, {"name": "signups"}],
            "rows": [["2026-W01", 10], ["2026-W02", 12]],
        }
    }
    monkeypatch.setattr(datapoint_sources, "metabase_client", lambda creds: FakeClient(ok))
    assert fetch({"kind": "metabase", "card_id": 42}) == (
        ["week", "signups"],
        [["2026-W01", 10], ["2026-W02", 12]],
    )
    failed = {"status": "failed", "error": "no such table"}
    monkeypatch.setattr(datapoint_sources, "metabase_client", lambda creds: FakeClient(failed))
    with pytest.raises(RuntimeError, match="no such table"):
        fetch({"kind": "metabase", "card_id": 42})


def test_fetch_metabase_without_credentials(src_env):
    with pytest.raises(LookupError, match="METABASE_URL is not set"):
        fetch({"kind": "metabase", "card_id": 1})


def test_metabase_client_refreshes_process_env(src_env):
    datapoint_sources.ENV_FILE.write_text(
        "METABASE_URL=https://mb.yourcompany.com\nMETABASE_API_KEY=k\n"
    )
    creds, _ = metabase_credentials()
    client = metabase_client(creds)  # the real connector class; __init__ makes no request
    assert client.base_url == "https://mb.yourcompany.com"
    assert os.environ["METABASE_API_KEY"] == "k"


def test_fetch_sqlite(src_env):
    db = vault_path("data/app.db")
    db.parent.mkdir(parents=True)
    con = sqlite3.connect(db)
    con.execute("create table t (week text, n int)")
    con.executemany("insert into t values (?, ?)", [("w1", 1), ("w2", 2)])
    con.commit()
    con.close()
    src = {"kind": "sqlite", "path": "data/app.db", "query": "select week, n from t order by week"}
    assert fetch(src) == (["week", "n"], [["w1", 1], ["w2", 2]])
    with pytest.raises(RuntimeError, match="no such table"):
        fetch({"kind": "sqlite", "path": "data/app.db", "query": "select * from nope"})
    with pytest.raises(FileNotFoundError, match="data/missing.db"):
        fetch({"kind": "sqlite", "path": "data/missing.db", "query": "select 1"})
    with pytest.raises(ValueError):
        fetch({"kind": "sqlite", "path": "../x.db", "query": "select 1"})


def test_fetch_csv_coerces_and_projects(src_env):
    f = vault_path("data/signups.csv")
    f.parent.mkdir(parents=True)
    f.write_text("week,signups,note\n2026-W01,10,ok\n2026-W02,12.5,\n")
    assert fetch({"kind": "csv", "path": "data/signups.csv", "column": None}) == (
        ["week", "signups", "note"],
        [["2026-W01", 10, "ok"], ["2026-W02", 12.5, None]],
    )
    assert fetch({"kind": "csv", "path": "data/signups.csv", "column": "signups"}) == (
        ["signups"],
        [[10], [12.5]],
    )
    with pytest.raises(RuntimeError, match="not in CSV"):
        fetch({"kind": "csv", "path": "data/signups.csv", "column": "nope"})
    with pytest.raises(FileNotFoundError):
        fetch({"kind": "csv", "path": "data/missing.csv", "column": None})
    f.write_text("")
    with pytest.raises(RuntimeError, match="no header"):
        fetch({"kind": "csv", "path": "data/signups.csv", "column": None})


def test_test_metabase(src_env, monkeypatch):
    with pytest.raises(LookupError):
        check_metabase()
    datapoint_sources.ENV_FILE.write_text(
        "METABASE_URL=https://mb.yourcompany.com\nMETABASE_API_KEY=k\n"
    )

    class Ok:
        base_url = "https://mb.yourcompany.com"

        def _request(self, method, url):
            assert method == "GET" and url.endswith("/api/user/current")
            return types.SimpleNamespace(json=lambda: {"email": "pat@yourcompany.com"})

    monkeypatch.setattr(datapoint_sources, "metabase_client", lambda creds: Ok())
    assert check_metabase() == "Connected as pat@yourcompany.com"

    class Bad(Ok):
        def _request(self, method, url):
            raise RuntimeError("Metabase request failed: 401")

    monkeypatch.setattr(datapoint_sources, "metabase_client", lambda creds: Bad())
    with pytest.raises(RuntimeError, match="401"):
        check_metabase()


def test_fetch_sqlite_refuses_attach_so_nothing_is_written_outside_the_vault(src_env, tmp_path):
    db = vault_path("data/app.db")
    db.parent.mkdir(parents=True)
    sqlite3.connect(db).close()
    outside = tmp_path / "outside.db"
    with pytest.raises(RuntimeError, match="not authorized"):
        fetch(
            {"kind": "sqlite", "path": "data/app.db", "query": f"attach database '{outside}' as e"}
        )
    assert not outside.exists()


def test_fetch_csv_non_finite_cells_become_null(src_env):
    f = vault_path("data/odd.csv")
    f.parent.mkdir(parents=True)
    f.write_text("n\nNaN\ninf\n-Infinity\n3\n")
    assert fetch({"kind": "csv", "path": "data/odd.csv", "column": None}) == (
        ["n"],
        [[None], [None], [None], [3]],
    )
