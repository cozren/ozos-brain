import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api_client import AtlassianGoalsClient, VALID_STATUSES

CLOUD_ID = "test-cloud-id"
SUBDOMAIN = "testcompany"
CONTAINER_ID = f"ari:cloud:townsquare::site/{CLOUD_ID}"
ENDPOINT = f"https://{SUBDOMAIN}.atlassian.net/gateway/api/graphql"


@pytest.fixture
def client():
    return AtlassianGoalsClient(
        email="test@example.com",
        api_token="test-token",
        subdomain=SUBDOMAIN,
        cloud_id=CLOUD_ID,
    )


def _mock_response(status_code=200, body=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.json.return_value = body or {}
    resp.text = json.dumps(body or {})
    return resp


def _patch_http(mock_post=None):
    mock_client = AsyncMock()
    mock_client.post.return_value = mock_post or _mock_response()
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=mock_client)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx, mock_client


# ── Constructor ───────────────────────────────────────────────────────────────


def test_constructor_builds_correct_container_id(client):
    assert client.container_id == CONTAINER_ID


def test_constructor_builds_correct_endpoint(client):
    assert client.endpoint == ENDPOINT


def test_constructor_sets_basic_auth_header(client):
    import base64

    expected = base64.b64encode(b"test@example.com:test-token").decode()
    assert client.headers["Authorization"] == f"Basic {expected}"


# ── list_goals ────────────────────────────────────────────────────────────────


async def test_list_goals_posts_to_correct_endpoint(client):
    body = {
        "data": {
            "goals_search": {"edges": [], "pageInfo": {"hasNextPage": False, "endCursor": None}}
        }
    }
    ctx, mock_http = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        await client.list_goals()
    assert mock_http.post.call_args[0][0] == ENDPOINT


async def test_list_goals_sends_container_id(client):
    body = {
        "data": {
            "goals_search": {"edges": [], "pageInfo": {"hasNextPage": False, "endCursor": None}}
        }
    }
    ctx, mock_http = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        await client.list_goals()
    variables = mock_http.post.call_args[1]["json"]["variables"]
    assert variables["containerId"] == CONTAINER_ID


async def test_list_goals_passes_limit(client):
    body = {
        "data": {
            "goals_search": {"edges": [], "pageInfo": {"hasNextPage": False, "endCursor": None}}
        }
    }
    ctx, mock_http = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        await client.list_goals(limit=10)
    variables = mock_http.post.call_args[1]["json"]["variables"]
    assert variables["first"] == 10


async def test_list_goals_filters_by_status_client_side(client):
    goals = [
        {
            "id": "g1",
            "name": "Goal 1",
            "status": {"value": "on_track"},
            "progress": {"percentage": 50},
            "owner": None,
            "targetDate": None,
            "startDate": None,
        },
        {
            "id": "g2",
            "name": "Goal 2",
            "status": {"value": "at_risk"},
            "progress": {"percentage": 20},
            "owner": None,
            "targetDate": None,
            "startDate": None,
        },
    ]
    body = {
        "data": {
            "goals_search": {
                "edges": [{"node": g} for g in goals],
                "pageInfo": {"hasNextPage": False, "endCursor": None},
            }
        }
    }
    ctx, _ = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        result = await client.list_goals(status="at_risk")
    parsed = json.loads(result)
    assert len(parsed) == 1
    assert parsed[0]["status"]["value"] == "at_risk"


async def test_list_goals_returns_all_when_no_status_filter(client):
    goals = [
        {
            "id": "g1",
            "name": "G1",
            "status": {"value": "on_track"},
            "progress": {"percentage": None},
            "owner": None,
            "targetDate": None,
            "startDate": None,
        },
        {
            "id": "g2",
            "name": "G2",
            "status": {"value": "at_risk"},
            "progress": {"percentage": None},
            "owner": None,
            "targetDate": None,
            "startDate": None,
        },
    ]
    body = {
        "data": {
            "goals_search": {
                "edges": [{"node": g} for g in goals],
                "pageInfo": {"hasNextPage": False, "endCursor": None},
            }
        }
    }
    ctx, _ = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        result = await client.list_goals()
    assert len(json.loads(result)) == 2


# ── get_goal ──────────────────────────────────────────────────────────────────


async def test_get_goal_sends_goal_id(client):
    goal = {
        "id": "g1",
        "name": "G1",
        "status": {"value": "on_track"},
        "description": "",
        "progress": {"percentage": None},
        "owner": None,
        "targetDate": None,
        "startDate": None,
        "creationDate": None,
        "metricTargets": {"edges": []},
        "updates": {"edges": []},
    }
    body = {"data": {"goals_byId": goal}}
    ctx, mock_http = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        await client.get_goal("g1")
    variables = mock_http.post.call_args[1]["json"]["variables"]
    assert variables["goalId"] == "g1"


async def test_get_goal_returns_goal_object(client):
    goal = {
        "id": "g1",
        "name": "My Goal",
        "status": {"value": "on_track"},
        "description": "desc",
        "progress": {"percentage": 75},
        "owner": {"accountId": "u1", "name": "Alice"},
        "targetDate": {"label": "Q2 2026"},
        "startDate": None,
        "creationDate": "2026-01-01",
        "metricTargets": {"edges": []},
        "updates": {"edges": []},
    }
    body = {"data": {"goals_byId": goal}}
    ctx, _ = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        result = await client.get_goal("g1")
    parsed = json.loads(result)
    assert parsed["name"] == "My Goal"
    assert parsed["status"]["value"] == "on_track"


# ── list_key_results ──────────────────────────────────────────────────────────


async def test_list_key_results_extracts_metric_targets(client):
    krs = [
        {
            "id": "kr1",
            "metric": {"name": "Revenue", "type": "NUMERIC"},
            "startValue": 0.0,
            "targetValue": 100.0,
            "snapshotValue": {"value": 42.0},
        },
    ]
    goal = {"id": "g1", "name": "Goal", "metricTargets": {"edges": [{"node": k} for k in krs]}}
    body = {"data": {"goals_byId": goal}}
    ctx, _ = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        result = await client.list_key_results("g1")
    parsed = json.loads(result)
    assert parsed["goalId"] == "g1"
    assert len(parsed["keyResults"]) == 1
    assert parsed["keyResults"][0]["metric"]["name"] == "Revenue"


async def test_list_key_results_empty(client):
    goal = {"id": "g1", "name": "Goal", "metricTargets": {"edges": []}}
    body = {"data": {"goals_byId": goal}}
    ctx, _ = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        result = await client.list_key_results("g1")
    parsed = json.loads(result)
    assert parsed["keyResults"] == []


# ── list_checkins ─────────────────────────────────────────────────────────────


async def test_list_checkins_extracts_updates(client):
    updates = [
        {
            "id": "u1",
            "summary": "Great progress",
            "creationDate": "2026-04-01",
            "newState": {"label": "On Track"},
            "creator": {"accountId": "a1", "name": "Bob"},
        },
    ]
    goal = {"id": "g1", "name": "Goal", "updates": {"edges": [{"node": u} for u in updates]}}
    body = {"data": {"goals_byId": goal}}
    ctx, _ = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        result = await client.list_checkins("g1")
    parsed = json.loads(result)
    assert len(parsed["checkins"]) == 1
    assert parsed["checkins"][0]["summary"] == "Great progress"


async def test_list_checkins_sends_limit(client):
    goal = {"id": "g1", "name": "Goal", "updates": {"edges": []}}
    body = {"data": {"goals_byId": goal}}
    ctx, mock_http = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        await client.list_checkins("g1", limit=5)
    variables = mock_http.post.call_args[1]["json"]["variables"]
    assert variables["first"] == 5


# ── update_goal_status ────────────────────────────────────────────────────────


async def test_update_goal_status_rejects_invalid_status(client):
    result = await client.update_goal_status("g1", "flying")
    assert "Invalid status" in result
    assert "flying" in result
    assert "on_track" in result


async def test_update_goal_status_all_valid_values_accepted(client):
    body = {
        "data": {
            "goals_createUpdate": {
                "id": "u1",
                "newState": {"label": "On Track"},
                "goal": {"id": "g1", "name": "G", "status": {"value": "on_track"}},
            }
        }
    }
    ctx, _ = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        for status in VALID_STATUSES:
            result = await client.update_goal_status("g1", status)
            assert "Invalid status" not in result


async def test_update_goal_status_sends_correct_input(client):
    body = {
        "data": {
            "goals_createUpdate": {
                "id": "u1",
                "newState": {"label": "At Risk"},
                "goal": {"id": "g1", "name": "G", "status": {"value": "at_risk"}},
            }
        }
    }
    ctx, mock_http = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        await client.update_goal_status("g1", "at_risk", summary="Slipping behind")
    variables = mock_http.post.call_args[1]["json"]["variables"]
    assert variables["input"]["goalId"] == "g1"
    assert variables["input"]["status"] == "at_risk"
    assert variables["input"]["summary"] == "Slipping behind"


async def test_update_goal_status_omits_summary_when_not_provided(client):
    body = {
        "data": {
            "goals_createUpdate": {
                "id": "u1",
                "newState": {"label": "On Track"},
                "goal": {"id": "g1", "name": "G", "status": {"value": "on_track"}},
            }
        }
    }
    ctx, mock_http = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        await client.update_goal_status("g1", "on_track")
    variables = mock_http.post.call_args[1]["json"]["variables"]
    assert "summary" not in variables["input"]


# ── error handling ────────────────────────────────────────────────────────────


async def test_401_returns_auth_error(client):
    ctx, _ = _patch_http(_mock_response(401))
    with patch("httpx.AsyncClient", return_value=ctx):
        result = await client.list_goals()
    assert "Error:" in result
    assert "Authentication failed" in result


async def test_graphql_errors_returned_as_error_string(client):
    body = {"errors": [{"message": "Field 'foo' not found"}], "data": None}
    ctx, _ = _patch_http(_mock_response(200, body))
    with patch("httpx.AsyncClient", return_value=ctx):
        result = await client.list_goals()
    assert "Error:" in result
    assert "foo" in result


async def test_network_error_returns_readable_message(client):
    import httpx as _httpx

    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(side_effect=_httpx.RequestError("connection refused"))
    ctx.__aexit__ = AsyncMock(return_value=False)
    with patch("httpx.AsyncClient", return_value=ctx):
        result = await client.list_goals()
    assert "Error:" in result
    assert "Network error" in result


async def test_500_returns_api_error(client):
    ctx, _ = _patch_http(_mock_response(500, {"message": "Internal server error"}))
    with patch("httpx.AsyncClient", return_value=ctx):
        result = await client.get_goal("g1")
    assert "Error:" in result
    assert "500" in result
