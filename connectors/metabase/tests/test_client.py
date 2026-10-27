"""Tests for the direct Metabase REST API client.

The client is read-only and dashboard-scoped: it authenticates (API key
preferred, username/password session as fallback), resolves a dashboard id
from a URL or raw id, fetches a dashboard's definition, and queries the
result rows of the cards on that dashboard. It never browses anything else.
"""

import json
from pathlib import Path
import sys
import types

import pytest

CURRENT_FILE = Path(__file__).resolve()
PROJECT_ROOT = CURRENT_FILE.parents[3]
TOOL_DIR = PROJECT_ROOT / "connectors" / "metabase"
if str(TOOL_DIR) not in sys.path:
    sys.path.insert(0, str(TOOL_DIR))


def _fresh_client_module(monkeypatch):
    """Reload the client module with load_dotenv neutralized so the real .env
    never bleeds into a test's environment."""
    import importlib
    import client as client_mod  # type: ignore[import]

    importlib.reload(client_mod)
    monkeypatch.setattr(client_mod, "load_dotenv", lambda *a, **k: None)
    return client_mod


def _ok(json_body):
    """A fake requests Response that succeeds and returns json_body."""
    resp = types.SimpleNamespace(status_code=200, text="")
    resp.raise_for_status = lambda: None
    resp.json = lambda: json_body
    return resp


# ---------------------------------------------------------------------------
# Configuration / construction
# ---------------------------------------------------------------------------


def test_raises_when_url_missing(monkeypatch):
    """No METABASE_URL -> ValueError naming the variable."""
    monkeypatch.delenv("METABASE_URL", raising=False)
    monkeypatch.setenv("METABASE_API_KEY", "key")
    client_mod = _fresh_client_module(monkeypatch)
    with pytest.raises(ValueError, match="METABASE_URL"):
        client_mod.MetabaseClient()


def test_raises_when_no_auth_configured(monkeypatch):
    """URL set but neither API key nor credentials -> ValueError."""
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.delenv("METABASE_API_KEY", raising=False)
    monkeypatch.delenv("METABASE_USERNAME", raising=False)
    monkeypatch.delenv("METABASE_PASSWORD", raising=False)
    client_mod = _fresh_client_module(monkeypatch)
    with pytest.raises(ValueError, match="METABASE_API_KEY"):
        client_mod.MetabaseClient()


def test_strips_trailing_slash_from_url(monkeypatch):
    """A trailing slash on METABASE_URL is normalized away."""
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com/")
    monkeypatch.setenv("METABASE_API_KEY", "key")
    client_mod = _fresh_client_module(monkeypatch)
    c = client_mod.MetabaseClient()
    assert c.base_url == "https://mb.example.com"


# ---------------------------------------------------------------------------
# Dashboard id parsing
# ---------------------------------------------------------------------------


def test_parse_dashboard_id_from_full_url(monkeypatch):
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "key")
    client_mod = _fresh_client_module(monkeypatch)
    c = client_mod.MetabaseClient()
    assert c.parse_dashboard_id("https://mb.example.com/dashboard/42-revenue-overview") == 42


def test_parse_dashboard_id_from_plain_id(monkeypatch):
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "key")
    client_mod = _fresh_client_module(monkeypatch)
    c = client_mod.MetabaseClient()
    assert c.parse_dashboard_id(7) == 7
    assert c.parse_dashboard_id("7") == 7


def test_parse_dashboard_id_rejects_garbage(monkeypatch):
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "key")
    client_mod = _fresh_client_module(monkeypatch)
    c = client_mod.MetabaseClient()
    with pytest.raises(ValueError):
        c.parse_dashboard_id("https://mb.example.com/collection/3-stuff")


# ---------------------------------------------------------------------------
# Authentication headers
# ---------------------------------------------------------------------------


def test_api_key_auth_sends_x_api_key(monkeypatch):
    """With an API key, requests carry the X-API-Key header and no session is created."""
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "secret-key")
    client_mod = _fresh_client_module(monkeypatch)

    captured = {}

    def fake_get(url, headers, timeout):
        captured["url"] = url
        captured["headers"] = headers
        return _ok({"id": 42, "name": "D"})

    def fake_post(*a, **k):
        raise AssertionError("must not create a session when an API key is present")

    monkeypatch.setattr(client_mod.requests, "get", fake_get)
    monkeypatch.setattr(client_mod.requests, "post", fake_post)

    c = client_mod.MetabaseClient()
    c.get_dashboard(42)

    assert captured["headers"]["X-API-Key"] == "secret-key"
    assert "X-Metabase-Session" not in captured["headers"]
    assert captured["url"] == "https://mb.example.com/api/dashboard/42"


def test_session_auth_when_no_api_key(monkeypatch):
    """Without an API key, credentials create a session token used as X-Metabase-Session."""
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.delenv("METABASE_API_KEY", raising=False)
    monkeypatch.setenv("METABASE_USERNAME", "me@example.com")
    monkeypatch.setenv("METABASE_PASSWORD", "pw")
    client_mod = _fresh_client_module(monkeypatch)

    posted = {}

    def fake_post(url, json, headers, timeout):
        posted["url"] = url
        posted["json"] = json
        return _ok({"id": "session-token-xyz"})

    got = {}

    def fake_get(url, headers, timeout):
        got["headers"] = headers
        return _ok({"id": 5, "name": "D"})

    monkeypatch.setattr(client_mod.requests, "post", fake_post)
    monkeypatch.setattr(client_mod.requests, "get", fake_get)

    c = client_mod.MetabaseClient()
    c.get_dashboard(5)

    assert posted["url"] == "https://mb.example.com/api/session"
    assert posted["json"] == {"username": "me@example.com", "password": "pw"}
    assert got["headers"]["X-Metabase-Session"] == "session-token-xyz"


# ---------------------------------------------------------------------------
# Dashboard fetch + card query
# ---------------------------------------------------------------------------


def test_get_dashboard_returns_json(monkeypatch):
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "key")
    client_mod = _fresh_client_module(monkeypatch)

    body = {"id": 9, "name": "Sales", "dashcards": []}
    monkeypatch.setattr(client_mod.requests, "get", lambda url, headers, timeout: _ok(body))

    c = client_mod.MetabaseClient()
    assert c.get_dashboard(9) == body


def test_query_dashcard_posts_to_correct_endpoint(monkeypatch):
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "key")
    client_mod = _fresh_client_module(monkeypatch)

    captured = {}

    def fake_post(url, json, headers, timeout):
        captured["url"] = url
        captured["json"] = json
        return _ok({"data": {"rows": [[1, 2]], "cols": [{"name": "a"}, {"name": "b"}]}})

    monkeypatch.setattr(client_mod.requests, "post", fake_post)

    c = client_mod.MetabaseClient()
    result = c.query_dashcard(dashboard_id=9, dashcard_id=11, card_id=33)

    assert captured["url"] == "https://mb.example.com/api/dashboard/9/dashcard/11/card/33/query"
    assert result["data"]["rows"] == [[1, 2]]


def test_fetch_dashboard_data_aggregates_cards(monkeypatch):
    """fetch_dashboard_data resolves the id, reads the dashboard, and queries each
    card, returning a tidy structure of name + columns + rows per card."""
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "key")
    client_mod = _fresh_client_module(monkeypatch)

    dashboard_body = {
        "id": 9,
        "name": "Sales",
        "dashcards": [
            {"id": 11, "card_id": 33, "card": {"id": 33, "name": "Revenue"}},
            {"id": 12, "card_id": 34, "card": {"id": 34, "name": "Signups"}},
            # a text/heading dashcard has no real card -> must be skipped
            {"id": 13, "card_id": None, "card": {"id": None}},
        ],
    }

    def fake_get(url, headers, timeout):
        return _ok(dashboard_body)

    def fake_post(url, json, headers, timeout):
        if url.endswith("/card/33/query"):
            return _ok({"data": {"rows": [[100]], "cols": [{"name": "rev"}]}})
        if url.endswith("/card/34/query"):
            return _ok({"data": {"rows": [[5]], "cols": [{"name": "n"}]}})
        raise AssertionError(f"unexpected query url: {url}")

    monkeypatch.setattr(client_mod.requests, "get", fake_get)
    monkeypatch.setattr(client_mod.requests, "post", fake_post)

    c = client_mod.MetabaseClient()
    result = c.fetch_dashboard_data("https://mb.example.com/dashboard/9-sales")

    assert result["dashboard"]["name"] == "Sales"
    assert [card["name"] for card in result["cards"]] == ["Revenue", "Signups"]
    assert result["cards"][0]["columns"] == ["rev"]
    assert result["cards"][0]["rows"] == [[100]]
    assert result["cards"][1]["rows"] == [[5]]


def test_api_key_403_falls_back_to_session(monkeypatch):
    """When the API key is denied (403) and credentials exist, the client
    transparently logs in and retries with a session token."""
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "weak-key")
    monkeypatch.setenv("METABASE_USERNAME", "me@example.com")
    monkeypatch.setenv("METABASE_PASSWORD", "pw")
    client_mod = _fresh_client_module(monkeypatch)

    import requests as req_lib

    calls = {"get": 0, "login": 0}

    def fake_get(url, headers, timeout):
        calls["get"] += 1
        if "X-API-Key" in headers:
            resp = types.SimpleNamespace(status_code=403, text="You don't have permissions")
            resp.raise_for_status = lambda: (_ for _ in ()).throw(
                req_lib.exceptions.HTTPError("403", response=resp)
            )
            return resp
        assert headers["X-Metabase-Session"] == "tok"
        return _ok({"id": 4242, "name": "Ads"})

    def fake_post(url, json, headers, timeout):
        calls["login"] += 1
        assert url.endswith("/api/session")
        return _ok({"id": "tok"})

    monkeypatch.setattr(client_mod.requests, "get", fake_get)
    monkeypatch.setattr(client_mod.requests, "post", fake_post)

    c = client_mod.MetabaseClient()
    result = c.get_dashboard(4242)

    assert result["name"] == "Ads"
    assert calls["login"] == 1  # logged in exactly once
    assert calls["get"] == 2  # api-key attempt, then session retry


def test_403_without_credentials_raises(monkeypatch):
    """A 403 with no credentials to fall back to surfaces as a RuntimeError."""
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "weak-key")
    monkeypatch.delenv("METABASE_USERNAME", raising=False)
    monkeypatch.delenv("METABASE_PASSWORD", raising=False)
    client_mod = _fresh_client_module(monkeypatch)

    import requests as req_lib

    def fake_get(url, headers, timeout):
        resp = types.SimpleNamespace(status_code=403, text="nope")
        resp.raise_for_status = lambda: (_ for _ in ()).throw(
            req_lib.exceptions.HTTPError("403", response=resp)
        )
        return resp

    monkeypatch.setattr(client_mod.requests, "get", fake_get)

    c = client_mod.MetabaseClient()
    with pytest.raises(RuntimeError, match="Metabase request failed"):
        c.get_dashboard(1)


def test_get_dashboard_raises_runtimeerror_on_http_error(monkeypatch):
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "key")
    client_mod = _fresh_client_module(monkeypatch)

    import requests as req_lib

    def fake_get(url, headers, timeout):
        resp = types.SimpleNamespace(status_code=403, text="Forbidden")

        def raise_for_status():
            raise req_lib.exceptions.HTTPError("403 Forbidden", response=resp)

        resp.raise_for_status = raise_for_status
        return resp

    monkeypatch.setattr(client_mod.requests, "get", fake_get)

    c = client_mod.MetabaseClient()
    with pytest.raises(RuntimeError, match="Metabase request failed"):
        c.get_dashboard(1)


# ---------------------------------------------------------------------------
# Dashcard export (uncapped JSON export)
# ---------------------------------------------------------------------------


def test_export_dashcard_posts_form_encoded_and_returns_rows(monkeypatch):
    captured = {}

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return [{"dt": "2026-23", "clicks": 3}]

    def fake_post(url, data=None, headers=None, timeout=None):
        captured.update(url=url, data=data, headers=headers)
        return FakeResp()

    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "k")
    client_mod = _fresh_client_module(monkeypatch)
    monkeypatch.setattr(client_mod.requests, "post", fake_post)
    mb = client_mod.MetabaseClient()

    rows = mb.export_dashcard(11, 22, 33, parameters=[{"id": "x"}])

    assert rows == [{"dt": "2026-23", "clicks": 3}]
    assert captured["url"].endswith("/api/dashboard/11/dashcard/22/card/33/query/json")
    assert captured["data"]["format_rows"] == "false"
    assert json.loads(captured["data"]["parameters"]) == [{"id": "x"}]
    assert "Content-Type" not in captured["headers"]  # form-encoded, not JSON


def test_export_dashcard_raises_on_error_dict(monkeypatch):
    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"error": "DB::Exception ... 504", "via": []}

    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "k")
    client_mod = _fresh_client_module(monkeypatch)
    monkeypatch.setattr(client_mod.requests, "post", lambda *a, **k: FakeResp())
    mb = client_mod.MetabaseClient()

    with pytest.raises(RuntimeError, match="export failed"):
        mb.export_dashcard(11, 22, 33)


# ---------------------------------------------------------------------------
# query_card (card-scoped saved-question queries)
# ---------------------------------------------------------------------------


def _client_with_key(monkeypatch):
    monkeypatch.setenv("METABASE_URL", "https://mb.example.com")
    monkeypatch.setenv("METABASE_API_KEY", "key")
    monkeypatch.delenv("METABASE_USERNAME", raising=False)
    monkeypatch.delenv("METABASE_PASSWORD", raising=False)
    client_mod = _fresh_client_module(monkeypatch)
    return client_mod, client_mod.MetabaseClient()


def test_query_card_posts_card_query_endpoint(monkeypatch):
    """query_card POSTs /api/card/:id/query with a parameters body."""
    client_mod, client = _client_with_key(monkeypatch)
    seen = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        seen["url"] = url
        seen["json"] = json
        return _ok({"data": {"cols": [{"name": "Country"}], "rows": [["de"]]}})

    monkeypatch.setattr(client_mod.requests, "post", fake_post)
    result = client.query_card(7777)
    assert seen["url"] == "https://mb.example.com/api/card/7777/query"
    assert seen["json"] == {"parameters": []}
    assert result["data"]["rows"] == [["de"]]


def test_query_card_passes_parameters_through(monkeypatch):
    """Explicit parameters are sent verbatim in the POST body."""
    client_mod, client = _client_with_key(monkeypatch)
    seen = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        seen["json"] = json
        return _ok({"data": {"cols": [], "rows": []}})

    monkeypatch.setattr(client_mod.requests, "post", fake_post)
    params = [{"type": "string/=", "value": ["de"]}]
    client.query_card("7777", parameters=params)
    assert seen["json"] == {"parameters": params}


def test_query_card_surfaces_http_errors(monkeypatch):
    """A failing request raises RuntimeError via the shared _request wrapper."""
    import requests as real_requests

    client_mod, client = _client_with_key(monkeypatch)

    def fake_post(url, json=None, headers=None, timeout=None):
        resp = types.SimpleNamespace(status_code=500, text="boom")

        def boom():
            raise real_requests.exceptions.HTTPError(response=resp)

        resp.raise_for_status = boom
        resp.json = lambda: {}
        return resp

    monkeypatch.setattr(client_mod.requests, "post", fake_post)
    with pytest.raises(RuntimeError):
        client.query_card(7777)


# ---------------------------------------------------------------------------
# run_native_query (native SQL against a database id)
# ---------------------------------------------------------------------------


def test_run_native_query_posts_dataset_endpoint_and_returns_dicts(monkeypatch):
    """run_native_query POSTs /api/dataset with a native body and maps
    cols/rows into a list of dicts keyed by column name."""
    client_mod, client = _client_with_key(monkeypatch)
    seen = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        seen["url"] = url
        seen["json"] = json
        return _ok(
            {
                "data": {
                    "cols": [{"name": "grp"}, {"name": "tag"}, {"name": "n"}],
                    "rows": [["amazon", "eugc", 5], ["non-amazon", "", 7]],
                }
            }
        )

    monkeypatch.setattr(client_mod.requests, "post", fake_post)
    rows = client.run_native_query(74, "SELECT 1")

    assert seen["url"] == "https://mb.example.com/api/dataset"
    assert seen["json"] == {"database": 74, "type": "native", "native": {"query": "SELECT 1"}}
    assert rows == [
        {"grp": "amazon", "tag": "eugc", "n": 5},
        {"grp": "non-amazon", "tag": "", "n": 7},
    ]


def test_run_native_query_raises_on_failed_status(monkeypatch):
    """A native query that Metabase reports as failed (HTTP 200/202 body with
    status='failed') surfaces as a RuntimeError rather than an empty result."""
    client_mod, client = _client_with_key(monkeypatch)

    def fake_post(url, json=None, headers=None, timeout=None):
        return _ok({"status": "failed", "error": "Select statement did not produce a ResultSet"})

    monkeypatch.setattr(client_mod.requests, "post", fake_post)
    with pytest.raises(RuntimeError, match="ResultSet"):
        client.run_native_query(74, "SELECT * FROM models.clicks")


def test_run_native_query_coerces_database_id_to_int(monkeypatch):
    """A string database id is coerced to an int in the request body."""
    client_mod, client = _client_with_key(monkeypatch)
    seen = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        seen["json"] = json
        return _ok({"data": {"cols": [], "rows": []}})

    monkeypatch.setattr(client_mod.requests, "post", fake_post)
    client.run_native_query("74", "SELECT 1")
    assert seen["json"]["database"] == 74
