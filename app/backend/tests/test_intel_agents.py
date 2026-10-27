# backend/tests/test_intel_agents.py
import json
from datetime import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

from backend.main import app
from backend.services import intel_agents as svc

client = TestClient(app)

BASE = "/api/intel-agents"


# ---- fixtures / helpers ---------------------------------------------------


def _isolate(tmp_path, monkeypatch):
    """Point config store, stars, instances dir, and runs dir at temp files."""
    config = tmp_path / "intel-agents.json"
    stars = tmp_path / "intel-agents-stars.json"
    instances = tmp_path / "instances"
    runs = tmp_path / "runs"
    instances.mkdir(parents=True, exist_ok=True)
    runs.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(svc, "CONFIG_FILE", config)
    monkeypatch.setattr(svc, "STARS_FILE", stars)
    monkeypatch.setattr(svc, "INSTANCES_DIR", instances)
    monkeypatch.setattr(svc, "RUNS_DIR", runs)
    return config, stars, instances, runs


def _seed_agent(config: Path, agent_id="shopping-marketplace-pulse", **overrides):
    agent = {
        "id": agent_id,
        "name": "Shopping & Marketplace Pulse",
        "purpose": "linkedin",
        "voice": "me",
        "focus": "C2C commerce",
        "keywords": ["Vinted", "resale"],
        "sources_prefer": ["TechCrunch"],
        "sources_avoid": [],
        "searches_per_run": 6,
        "enabled": True,
        "created_at": "2026-07-01",
    }
    agent.update(overrides)
    config.parent.mkdir(parents=True, exist_ok=True)
    existing = []
    if config.exists():
        existing = json.loads(config.read_text()).get("agents", [])
    existing.append(agent)
    config.write_text(json.dumps({"agents": existing}))
    return agent


def _create_body(**overrides):
    body = {
        "name": "Agentic Shopping Watch",
        "purpose": "linkedin",
        "voice": "me",
        "focus": "AI-driven shopping",
        "keywords": ["agentic shopping"],
        "sources_prefer": ["The Verge"],
        "sources_avoid": [],
        "searches_per_run": 6,
    }
    body.update(overrides)
    return body


def _write_linkedin_instance(instances: Path, agent_id: str, date: str) -> None:
    folder = instances / agent_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{agent_id}-{date}.json").write_text(
        json.dumps(
            {
                "generated_at": date,
                "purpose": "linkedin",
                "summary": {"strongest_signal": "x", "confession": []},
                "posts": [{"n": 1, "template": "A", "text": "hi"}],
            }
        ),
        encoding="utf-8",
    )


def _write_research_instance(instances: Path, agent_id: str, date: str) -> None:
    folder = instances / agent_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{agent_id}-{date}.json").write_text(
        json.dumps(
            {
                "generated_at": date,
                "purpose": "research",
                "summary": {"strongest_signal": "y", "confession": []},
                "article": {
                    "title": "State of resale",
                    "tldr": "summary",
                    "sections": [{"heading": "H", "body": "B"}],
                    "sources": [
                        {
                            "outlet": "Reuters",
                            "date": "2d ago",
                            "url": "https://x",
                            "url_verified": True,
                        }
                    ],
                },
            }
        ),
        encoding="utf-8",
    )


# ---- agent CRUD -----------------------------------------------------------


def test_list_agents_empty(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    r = client.get(f"{BASE}/agents")
    assert r.status_code == 200
    assert r.json() == []


def test_create_agent_generates_slug_id_and_defaults(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    r = client.post(f"{BASE}/agents", json=_create_body(name="Agentic Shopping Watch!"))
    assert r.status_code == 200
    agent = r.json()
    assert agent["id"] == "agentic-shopping-watch"
    assert agent["name"] == "Agentic Shopping Watch!"
    assert agent["purpose"] == "linkedin"
    assert agent["voice"] == "me"
    assert agent["enabled"] is True
    # created_at defaults to today's date computed from the clock
    assert agent["created_at"] == datetime.now().strftime("%Y-%m-%d")


def test_create_agent_clamps_searches_per_run_high(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    r = client.post(f"{BASE}/agents", json=_create_body(searches_per_run=99))
    assert r.json()["searches_per_run"] == 12


def test_create_agent_clamps_searches_per_run_low(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    r = client.post(f"{BASE}/agents", json=_create_body(searches_per_run=0))
    assert r.json()["searches_per_run"] == 1


def test_create_agent_unique_slug_on_collision(tmp_path, monkeypatch):
    config, *_ = _isolate(tmp_path, monkeypatch)
    _seed_agent(config, agent_id="agentic-shopping-watch", name="Agentic Shopping Watch")
    r = client.post(f"{BASE}/agents", json=_create_body(name="Agentic Shopping Watch"))
    assert r.status_code == 200
    assert r.json()["id"] != "agentic-shopping-watch"
    assert r.json()["id"].startswith("agentic-shopping-watch")


def test_get_agent(tmp_path, monkeypatch):
    config, *_ = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    r = client.get(f"{BASE}/agents/shopping-marketplace-pulse")
    assert r.status_code == 200
    assert r.json()["name"] == "Shopping & Marketplace Pulse"
    assert r.json()["keywords"] == ["Vinted", "resale"]


def test_get_agent_404(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    assert client.get(f"{BASE}/agents/nope").status_code == 404


def test_list_agents_returns_seeded(tmp_path, monkeypatch):
    config, *_ = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    ids = {a["id"] for a in client.get(f"{BASE}/agents").json()}
    assert "shopping-marketplace-pulse" in ids


def test_update_agent(tmp_path, monkeypatch):
    config, *_ = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    r = client.put(
        f"{BASE}/agents/shopping-marketplace-pulse",
        json={
            "name": "Renamed",
            "purpose": "research",
            "voice": "executive",
            "focus": "new focus",
            "keywords": ["k"],
            "sources_prefer": [],
            "sources_avoid": ["X"],
            "searches_per_run": 3,
            "enabled": False,
        },
    )
    assert r.status_code == 200
    updated = r.json()
    assert updated["id"] == "shopping-marketplace-pulse"  # id is stable
    assert updated["name"] == "Renamed"
    assert updated["purpose"] == "research"
    assert updated["enabled"] is False
    assert updated["searches_per_run"] == 3


def test_update_agent_clamps_searches(tmp_path, monkeypatch):
    config, *_ = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    r = client.put(
        f"{BASE}/agents/shopping-marketplace-pulse",
        json={
            "name": "n",
            "purpose": "linkedin",
            "voice": "me",
            "focus": "f",
            "keywords": [],
            "sources_prefer": [],
            "sources_avoid": [],
            "searches_per_run": 100,
            "enabled": True,
        },
    )
    assert r.json()["searches_per_run"] == 12


def test_update_agent_404(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    r = client.put(
        f"{BASE}/agents/nope",
        json={
            "name": "n",
            "purpose": "linkedin",
            "voice": "me",
            "focus": "f",
            "keywords": [],
            "sources_prefer": [],
            "sources_avoid": [],
            "searches_per_run": 6,
            "enabled": True,
        },
    )
    assert r.status_code == 404


def test_delete_agent(tmp_path, monkeypatch):
    config, *_ = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    r = client.delete(f"{BASE}/agents/shopping-marketplace-pulse")
    assert r.status_code == 200
    assert r.json() == {"deleted": True}
    assert client.get(f"{BASE}/agents/shopping-marketplace-pulse").status_code == 404


def test_delete_agent_404(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    assert client.delete(f"{BASE}/agents/nope").status_code == 404


# ---- reports (instances) --------------------------------------------------


def test_reports_list_newest_first(tmp_path, monkeypatch):
    config, _stars, instances, _runs = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    _write_linkedin_instance(instances, "shopping-marketplace-pulse", "2026-06-28")
    _write_linkedin_instance(instances, "shopping-marketplace-pulse", "2026-07-01")
    items = client.get(f"{BASE}/agents/shopping-marketplace-pulse/reports").json()
    assert len(items) == 2
    assert [it["date"] for it in items] == ["2026-07-01", "2026-06-28"]
    first = items[0]
    assert {"id", "date", "label", "age", "starred"} <= set(first.keys())
    assert first["starred"] is False


def test_reports_list_404_unknown_agent(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    assert client.get(f"{BASE}/agents/nope/reports").status_code == 404


def test_get_linkedin_report_content(tmp_path, monkeypatch):
    config, _stars, instances, _runs = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    _write_linkedin_instance(instances, "shopping-marketplace-pulse", "2026-07-01")
    items = client.get(f"{BASE}/agents/shopping-marketplace-pulse/reports").json()
    iid = items[0]["id"]
    r = client.get(f"{BASE}/agents/shopping-marketplace-pulse/reports/{iid}")
    assert r.status_code == 200
    body = r.json()
    assert body["purpose"] == "linkedin"
    assert body["starred"] is False
    payload = json.loads(body["content"])
    assert payload["posts"][0]["template"] == "A"


def test_get_research_report_content(tmp_path, monkeypatch):
    config, _stars, instances, _runs = _isolate(tmp_path, monkeypatch)
    _seed_agent(config, agent_id="research-agent", name="Research Agent", purpose="research")
    _write_research_instance(instances, "research-agent", "2026-07-01")
    items = client.get(f"{BASE}/agents/research-agent/reports").json()
    iid = items[0]["id"]
    r = client.get(f"{BASE}/agents/research-agent/reports/{iid}")
    assert r.status_code == 200
    body = r.json()
    assert body["purpose"] == "research"
    payload = json.loads(body["content"])
    assert payload["article"]["title"] == "State of resale"


def test_get_report_latest(tmp_path, monkeypatch):
    config, _stars, instances, _runs = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    _write_linkedin_instance(instances, "shopping-marketplace-pulse", "2026-06-28")
    _write_linkedin_instance(instances, "shopping-marketplace-pulse", "2026-07-01")
    r = client.get(f"{BASE}/agents/shopping-marketplace-pulse/reports/latest")
    assert r.status_code == 200
    assert r.json()["date"] == "2026-07-01"


def test_get_report_404_unknown_agent(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    assert client.get(f"{BASE}/agents/nope/reports/x.json").status_code == 404


def test_get_report_404_unknown_instance(tmp_path, monkeypatch):
    config, *_ = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    r = client.get(f"{BASE}/agents/shopping-marketplace-pulse/reports/missing-2099-01-01.json")
    assert r.status_code == 404


# ---- stars ----------------------------------------------------------------


def test_star_roundtrip_and_flag_in_reports(tmp_path, monkeypatch):
    config, stars, instances, _runs = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    _write_linkedin_instance(instances, "shopping-marketplace-pulse", "2026-07-01")
    items = client.get(f"{BASE}/agents/shopping-marketplace-pulse/reports").json()
    iid = items[0]["id"]

    # star it
    r = client.post(
        f"{BASE}/agents/shopping-marketplace-pulse/reports/{iid}/star",
        json={"starred": True},
    )
    assert r.status_code == 200
    assert r.json() == {"starred": True}

    # starred flag shows in the reports listing
    items = client.get(f"{BASE}/agents/shopping-marketplace-pulse/reports").json()
    assert items[0]["starred"] is True

    # and in the report get
    got = client.get(f"{BASE}/agents/shopping-marketplace-pulse/reports/{iid}").json()
    assert got["starred"] is True

    # persisted under the agent-keyed shape
    persisted = json.loads(stars.read_text())
    assert iid in persisted["shopping-marketplace-pulse"]

    # unstar
    r = client.post(
        f"{BASE}/agents/shopping-marketplace-pulse/reports/{iid}/star",
        json={"starred": False},
    )
    assert r.json() == {"starred": False}
    items = client.get(f"{BASE}/agents/shopping-marketplace-pulse/reports").json()
    assert items[0]["starred"] is False


def test_star_404_unknown_agent(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    r = client.post(f"{BASE}/agents/nope/reports/x.json/star", json={"starred": True})
    assert r.status_code == 404


# ---- run ------------------------------------------------------------------


def test_run_agent_started_then_running(tmp_path, monkeypatch):
    config, _stars, _instances, runs = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    # do not actually spawn anything
    monkeypatch.setattr(svc, "_launch", lambda target: None)

    r = client.post(f"{BASE}/agents/shopping-marketplace-pulse/run")
    assert r.status_code == 200
    assert r.json()["state"] == "started"

    # lock now present -> a second call reports running
    r = client.post(f"{BASE}/agents/shopping-marketplace-pulse/run")
    assert r.status_code == 200
    assert r.json()["state"] == "running"


def test_run_agent_launches_run_py_with_agent_id(tmp_path, monkeypatch):
    config, _stars, _instances, runs = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    # run the launched target inline; stub subprocess so nothing spawns
    monkeypatch.setattr(svc, "_launch", lambda target: target())
    fake_proc = MagicMock(returncode=0)
    with patch.object(svc.subprocess, "run", return_value=fake_proc) as mock_run:
        r = client.post(f"{BASE}/agents/shopping-marketplace-pulse/run")
        assert r.status_code == 200
        mock_run.assert_called_once()
        args, kwargs = mock_run.call_args
        cmd = args[0]
        assert cmd[1:] == ["tools/intel-agents/run.py", "shopping-marketplace-pulse"]
    # lock cleared, status file written with exit 0
    assert not (runs / "shopping-marketplace-pulse.lock").exists()
    status = json.loads((runs / "shopping-marketplace-pulse.run-status.json").read_text())
    assert status["exit"] == 0


def test_run_agent_404_unknown(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    assert client.post(f"{BASE}/agents/nope/run").status_code == 404


def test_run_status_idle_when_never_run(tmp_path, monkeypatch):
    config, *_ = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    r = client.get(f"{BASE}/agents/shopping-marketplace-pulse/run/status")
    assert r.status_code == 200
    body = r.json()
    assert body["state"] == "idle"
    assert {"state", "last_run", "last_exit"} <= set(body.keys())


def test_run_status_running_when_lock_present(tmp_path, monkeypatch):
    config, _stars, _instances, runs = _isolate(tmp_path, monkeypatch)
    _seed_agent(config)
    (runs / "shopping-marketplace-pulse.lock").write_text("1")
    r = client.get(f"{BASE}/agents/shopping-marketplace-pulse/run/status")
    assert r.json()["state"] == "running"


def test_run_status_404_unknown(tmp_path, monkeypatch):
    _isolate(tmp_path, monkeypatch)
    assert client.get(f"{BASE}/agents/nope/run/status").status_code == 404


def test_voice_presets_have_no_personal_name():
    from backend.services import intel_agents as svc

    assert svc.VOICES == {"me", "executive", "research"}


def test_saving_agents_preserves_other_top_level_config_keys(tmp_path, monkeypatch):
    """`voice_text` (and any future top-level key) must survive agent edits."""
    import json

    from backend.services import intel_agents as svc

    cfg = tmp_path / "intel-agents.json"
    cfg.write_text(json.dumps({"voice_text": "Plain.", "agents": []}))
    monkeypatch.setattr(svc, "CONFIG_FILE", cfg)
    svc.create_agent({"name": "Pulse", "purpose": "linkedin", "voice": "me"})
    saved = json.loads(cfg.read_text())
    assert saved["voice_text"] == "Plain."
    assert saved["agents"][0]["name"] == "Pulse"
