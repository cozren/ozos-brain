"""The Setup page's read model: stored state plus states derived at read time."""

import pytest

from backend.services import setup_state, setup_view
from backend.services.setup_state import set_status
from backend.services.setup_view import build_view


@pytest.fixture
def view_env(tmp_path, monkeypatch):
    monkeypatch.setattr(setup_state, "SETUP_FILE", tmp_path / ".ozos" / "setup.json")
    monkeypatch.setattr(setup_view, "load_user_config", lambda: {})
    monkeypatch.setattr(setup_view, "discover_mcps", lambda: {"remote": [], "local": []})
    monkeypatch.setattr(setup_view, "load_vitals", lambda: [])


def _items(view: dict) -> dict:
    return {i["id"]: i for g in view["groups"] for i in g["items"]}


def test_fresh_vault_everything_not_started(view_env):
    v = build_view()
    assert [g["id"] for g in v["groups"]][:2] == ["you", "meeting-notes"]
    assert v["groups"][0]["label"] == "You"
    assert v["summary"] == {"done": 0, "total": 17, "open": 17, "badge_dismissed": False}
    assert v["cadence"] is None
    item = _items(v)["granola"]
    assert item["status"] == "not_started" and item["title"] == "Granola"
    assert item["rows"] == [] and item["notes"] == "" and item["derived"] is None


def test_profile_done_when_config_has_name_and_me(view_env, monkeypatch):
    monkeypatch.setattr(setup_view, "load_user_config", lambda: {"name": "Taylor", "me": "taylor"})
    item = _items(build_view())["profile"]
    assert item["status"] == "done"
    assert item["derived"]["profile"] == {"name": "Taylor", "me": "taylor", "voice_text": ""}


def test_profile_not_done_without_name(view_env, monkeypatch):
    monkeypatch.setattr(setup_view, "load_user_config", lambda: {"me": "me"})
    assert _items(build_view())["profile"]["status"] == "not_started"


def test_mcp_connected_derives_done(view_env, monkeypatch):
    monkeypatch.setattr(
        setup_view,
        "discover_mcps",
        lambda: {
            "remote": [{"name": "Slack", "status": "active"}],
            "local": [{"name": "Figma Dev Mode", "status": "needs-auth"}],
        },
    )
    items = _items(build_view())
    assert items["slack-mcp"]["status"] == "done"
    assert items["slack-mcp"]["derived"]["mcp"] == {"connected": True, "names": ["Slack"]}
    assert items["figma-mcp"]["status"] == "not_started"
    assert items["figma-mcp"]["derived"]["mcp"] == {"connected": False, "names": []}


def test_skipped_mcp_stays_skipped_even_when_connected(view_env, monkeypatch):
    set_status("slack-mcp", "skipped")
    monkeypatch.setattr(
        setup_view,
        "discover_mcps",
        lambda: {"remote": [{"name": "Slack", "status": "active"}], "local": []},
    )
    assert _items(build_view())["slack-mcp"]["status"] == "skipped"


def test_done_item_with_stale_vital_needs_attention(view_env, monkeypatch):
    set_status("gmail-gemini", "done")
    monkeypatch.setattr(
        setup_view, "load_vitals", lambda: [{"id": "meeting-notes", "status": "warn"}]
    )
    items = _items(build_view())
    assert items["gmail-gemini"]["status"] == "needs_attention"
    assert items["gmail-gemini"]["derived"]["vital"] == {"status": "warn"}
    assert items["granola"]["status"] == "not_started"


def test_summary_counts_done_skipped_and_open(view_env):
    set_status("granola", "done")
    set_status("miro-mcp", "skipped")
    set_status("figma-mcp", "in_progress")
    s = build_view()["summary"]
    assert s == {"done": 1, "total": 17, "open": 15, "badge_dismissed": False}


def test_view_survives_broken_discovery(view_env, monkeypatch):
    def boom():
        raise RuntimeError("claude not installed")

    monkeypatch.setattr(setup_view, "discover_mcps", boom)
    monkeypatch.setattr(setup_view, "load_vitals", boom)
    assert build_view()["summary"]["total"] == 17
