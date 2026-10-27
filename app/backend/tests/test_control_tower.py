# backend/tests/test_control_tower.py
import json
import pytest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from backend.main import app

client = TestClient(app)


def test_control_tower_status_returns_200():
    response = client.get("/api/control-tower/status")
    assert response.status_code == 200


def test_control_tower_status_shape():
    response = client.get("/api/control-tower/status")
    data = response.json()
    assert "overallHealth" in data
    assert "session" in data
    assert "vitals" in data
    assert "brainOverview" in data
    assert "mcps" in data
    assert "plugins" in data
    assert "skills" in data
    assert "hooks" in data
    assert "remote" in data["mcps"]
    assert "local" in data["mcps"]


def test_control_tower_overall_health_is_valid():
    response = client.get("/api/control-tower/status")
    data = response.json()
    assert data["overallHealth"] in ("nominal", "degraded", "critical")


def test_load_skills_handles_missing_dir(tmp_path):
    from backend.services import control_tower as svc

    with patch.object(svc, "CLAUDE_SKILLS_DIR", tmp_path / "nonexistent"):
        with patch.object(svc, "CLAUDE_PLUGINS_CACHE", tmp_path / "nonexistent2"):
            result = svc.load_skills()
    assert result == []


def test_load_vitals_handles_missing_config(tmp_path):
    from backend.services import control_tower as svc

    with patch.object(svc, "OZOS_VITALS", tmp_path / "nonexistent.json"):
        result = svc.load_vitals()
    assert result == []


def test_parse_graphify_nodes(tmp_path):
    from backend.services import control_tower as svc

    report = tmp_path / "GRAPH_REPORT.md"
    report.write_text("## Summary\n- 979 nodes · 1402 edges\n")
    with patch.object(svc, "GRAPHIFY_REPORT", report):
        result = svc._parse_graphify_nodes()
    assert result == 979


# ── _human_age ───────────────────────────────────────────────────────────
# Drives the "last run / lastUsed" strings shown all over the Control Hub.


@pytest.mark.parametrize(
    "seconds_ago,expected",
    [
        (5, "just now"),
        (119, "just now"),
        (120, "2m ago"),
        (599, "9m ago"),
        (3600, "1h ago"),
        (90000, "1d ago"),
    ],
)
def test_human_age_buckets(seconds_ago, expected):
    from backend.services import control_tower as svc
    import time as _t

    assert svc._human_age(_t.time() - seconds_ago) == expected


# ── _extract_target ──────────────────────────────────────────────────────
# Turns a raw hook command into the label shown in the Hooks card.


@pytest.mark.parametrize(
    "cmd,expected",
    [
        ("python3 /a/b/sync_gemini_notes.py --flag", "sync_gemini_notes"),
        ("/usr/bin/bash scripts/build.sh", "build"),
        ("node tools/x/index.js", "index"),
        ("afplay /sounds/peon_ready.aiff", "peon_ready"),
        ("python3 a.py && afplay done.wav", "a"),  # script wins over audio
        ("graphify update . --wiki", "graphify"),  # keyword fallback
        ("", ""),  # empty command
        ("echo hello", "hello"),  # bare fallback to last token
    ],
)
def test_extract_target(cmd, expected):
    from backend.services import control_tower as svc

    assert svc._extract_target(cmd) == expected


# ── _parse_mcp_status ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("✓ Connected", "active"),
        ("Connected to server", "active"),
        ("✗ Failed", "error"),
        ("Failed to connect", "error"),
        ("⏸ Pending", "pending"),
        ("Pending auth", "pending"),
        ("something else", "needs-auth"),
    ],
)
def test_parse_mcp_status(raw, expected):
    from backend.services import control_tower as svc

    assert svc._parse_mcp_status(raw) == expected


# ── _mcp_meta ────────────────────────────────────────────────────────────


def test_mcp_meta_atlassian_goals_most_specific():
    from backend.services import control_tower as svc

    products, conn = svc._mcp_meta("Atlassian Goals")
    assert products == ["Goals"]
    assert conn == "product"


def test_mcp_meta_atlassian_generic():
    from backend.services import control_tower as svc

    products, conn = svc._mcp_meta("Atlassian")
    assert products == ["Jira", "Confluence"]
    assert conn == "product"


def test_mcp_meta_unknown_defaults_to_mcp():
    from backend.services import control_tower as svc

    assert svc._mcp_meta("Some Random MCP") == ([], "mcp")


# ── _load_api_connections (Claude API) ─────────────────────────────────


def test_api_connections_report_claude_api_active_when_key_set(monkeypatch):
    from backend.services import control_tower as svc

    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    entries = svc._load_api_connections()
    assert [e["name"] for e in entries] == ["Claude API"]
    assert entries[0]["status"] == "active"
    assert entries[0]["connectionType"] == "api-connection"


def test_api_connections_claude_api_needs_auth_without_key(monkeypatch):
    from backend.services import control_tower as svc

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    entries = svc._load_api_connections()
    assert entries[0]["name"] == "Claude API"
    assert entries[0]["status"] == "needs-auth"


# ── _resolve_usage ───────────────────────────────────────────────────────


def test_resolve_usage_first_matching_key_wins():
    from backend.services import control_tower as svc

    usage = {"alias": {"count": 3, "last_ts": 0.0}, "real": {"count": 9, "last_ts": 0.0}}
    count, _ = svc._resolve_usage(["alias", "real"], usage)
    assert count == 3


def test_resolve_usage_skips_zero_count():
    from backend.services import control_tower as svc

    usage = {"a": {"count": 0, "last_ts": 0.0}, "b": {"count": 4, "last_ts": 0.0}}
    count, _ = svc._resolve_usage(["a", "b"], usage)
    assert count == 4


def test_resolve_usage_no_match():
    from backend.services import control_tower as svc

    assert svc._resolve_usage(["x"], {}) == (0, None)


# ── _parse_skill_meta ────────────────────────────────────────────────────


def test_parse_skill_meta_reads_frontmatter(tmp_path):
    from backend.services import control_tower as svc

    md = tmp_path / "SKILL.md"
    md.write_text("---\nname: my-skill\ndescription: Does a thing\nversion: 1.2.0\n---\nbody")
    meta = svc._parse_skill_meta(md)
    assert meta["name"] == "my-skill"
    assert meta["description"] == "Does a thing"
    assert meta["version"] == "1.2.0"
    assert meta["content_chars"] > 0


def test_parse_skill_meta_no_frontmatter(tmp_path):
    from backend.services import control_tower as svc

    md = tmp_path / "SKILL.md"
    md.write_text("just text, no frontmatter")
    meta = svc._parse_skill_meta(md)
    assert meta == {"content_chars": len("just text, no frontmatter")}


def test_parse_skill_meta_missing_file(tmp_path):
    from backend.services import control_tower as svc

    meta = svc._parse_skill_meta(tmp_path / "nope.md")
    assert meta == {"content_chars": 0}


# ── load_plugins ─────────────────────────────────────────────────────────


def test_load_plugins_parses_publisher_and_version(tmp_path):
    from backend.services import control_tower as svc

    pj = tmp_path / "installed_plugins.json"
    pj.write_text(
        json.dumps(
            {
                "plugins": {
                    "superpowers@anthropics": [{"version": "5.1.0", "installedAt": "2026-01-01"}],
                }
            }
        )
    )
    with patch.object(svc, "CLAUDE_PLUGINS_JSON", pj):
        plugins = svc.load_plugins()
    assert len(plugins) == 1
    assert plugins[0]["name"] == "superpowers"
    assert plugins[0]["publisher"] == "anthropics"
    assert plugins[0]["version"] == "5.1.0"


def test_load_plugins_handles_missing_file(tmp_path):
    from backend.services import control_tower as svc

    with patch.object(svc, "CLAUDE_PLUGINS_JSON", tmp_path / "nope.json"):
        assert svc.load_plugins() == []


# ─── Run-log: delta, lastRunIso, and detail endpoint ────────────────────────


def _setup_vital(tmp_path, *, run_record=None):
    """Build a tmp repo root with one meeting-notes vital, an output file, and an
    optional run-log record. Returns (svc-patch-kwargs dict)."""
    (tmp_path / "tools").mkdir()
    out = tmp_path / "kh"
    out.mkdir()
    (out / "note.md").write_text("hi")  # recent mtime → status ok

    vitals = tmp_path / "vitals.json"
    vitals.write_text(
        json.dumps(
            {
                "vitals": [
                    {
                        "id": "meeting-notes",
                        "name": "meeting-notes",
                        "tool": "meeting-notes",
                        "description": "x",
                        "output_dir": "kh",
                        "output_glob": "*.md",
                        "stale_after_hours": 24,
                    }
                ]
            }
        )
    )
    runs = tmp_path / "runs"
    runs.mkdir()
    if run_record is not None:
        (runs / "meeting-notes.jsonl").write_text(json.dumps(run_record) + "\n")
    return vitals, runs


def test_load_vitals_includes_run_log_delta_and_iso(tmp_path):
    from backend.services import control_tower as svc

    rec = {"ts": "2026-06-17T10:00:00+00:00", "count": 2, "items": ["A", "B"]}
    vitals, runs = _setup_vital(tmp_path, run_record=rec)

    with (
        patch.object(svc, "OZOS_VITALS", vitals),
        patch.object(svc, "TOOLS_DIR", tmp_path / "tools"),
        patch.object(svc, "OZOS_RUNS_DIR", runs),
    ):
        result = svc.load_vitals()

    v = next(x for x in result if x["id"] == "meeting-notes")
    assert v["delta"] == "+2"
    assert v["lastRunIso"] == "2026-06-17T10:00:00+00:00"


def test_load_vital_detail_returns_today_items_and_just_now_delta(tmp_path):
    from backend.services import control_tower as svc

    now = datetime.now(timezone.utc)
    rec = {"ts": now.isoformat(), "count": 2, "items": ["Jordan review", "Robin weekly"]}
    vitals, runs = _setup_vital(tmp_path, run_record=rec)

    with (
        patch.object(svc, "OZOS_VITALS", vitals),
        patch.object(svc, "TOOLS_DIR", tmp_path / "tools"),
        patch.object(svc, "OZOS_RUNS_DIR", runs),
    ):
        detail = svc.load_vital_detail("meeting-notes")

    assert detail is not None
    assert detail["delta"] == "+2"  # added just now (last run)
    assert detail["todayCount"] == 2
    assert detail["items"] == ["Jordan review", "Robin weekly"]


def test_load_vital_detail_aggregates_all_of_todays_runs(tmp_path):
    """`items` is everything added across today's runs; `delta` is just the last run."""
    from backend.services import control_tower as svc

    now = datetime.now(timezone.utc)
    old = now - timedelta(days=2)
    vitals, runs = _setup_vital(tmp_path, run_record=None)
    lines = [
        {"ts": old.isoformat(), "count": 1, "items": ["Yesterday note"]},
        {"ts": now.isoformat(), "count": 2, "items": ["A", "B"]},
        {"ts": now.isoformat(), "count": 1, "items": ["C"]},
    ]
    (runs / "meeting-notes.jsonl").write_text("\n".join(json.dumps(x) for x in lines) + "\n")

    with (
        patch.object(svc, "OZOS_VITALS", vitals),
        patch.object(svc, "TOOLS_DIR", tmp_path / "tools"),
        patch.object(svc, "OZOS_RUNS_DIR", runs),
    ):
        detail = svc.load_vital_detail("meeting-notes")

    assert detail["delta"] == "+1"  # last run only
    assert detail["todayCount"] == 3
    assert detail["items"] == ["A", "B", "C"]  # today only; "Yesterday note" excluded


def test_load_vital_detail_excludes_items_whose_meeting_date_is_not_today(tmp_path):
    """A note synced today but for an earlier meeting (date in its title) is excluded —
    'added today' means today's meetings, not everything synced today."""
    from backend.services import control_tower as svc

    now = datetime.now(timezone.utc)
    local_today = datetime.now().astimezone().date()
    yesterday = local_today - timedelta(days=1)
    today_title = (
        f'Notes: "Standup" {local_today.strftime("%b")} {local_today.day}, {local_today.year}'
    )
    old_title = f'Notes: "Old sync" {yesterday.strftime("%b")} {yesterday.day}, {yesterday.year}'

    vitals, runs = _setup_vital(tmp_path, run_record=None)
    lines = [
        {"ts": now.isoformat(), "count": 1, "items": [old_title]},
        {"ts": now.isoformat(), "count": 1, "items": [today_title]},
    ]
    (runs / "meeting-notes.jsonl").write_text("\n".join(json.dumps(x) for x in lines) + "\n")

    with (
        patch.object(svc, "OZOS_VITALS", vitals),
        patch.object(svc, "TOOLS_DIR", tmp_path / "tools"),
        patch.object(svc, "OZOS_RUNS_DIR", runs),
    ):
        detail = svc.load_vital_detail("meeting-notes")

    assert detail["items"] == [today_title]  # yesterday's meeting excluded
    assert detail["todayCount"] == 1


def test_load_vital_detail_keeps_dateless_items(tmp_path):
    """Items with no embedded date (e.g. digest section headings) stay — they belong
    to today's run by timestamp."""
    from backend.services import control_tower as svc

    now = datetime.now(timezone.utc)
    vitals, runs = _setup_vital(tmp_path, run_record=None)
    lines = [{"ts": now.isoformat(), "count": 2, "items": ["## 1. Section", "## 2. Section"]}]
    (runs / "meeting-notes.jsonl").write_text("\n".join(json.dumps(x) for x in lines) + "\n")

    with (
        patch.object(svc, "OZOS_VITALS", vitals),
        patch.object(svc, "TOOLS_DIR", tmp_path / "tools"),
        patch.object(svc, "OZOS_RUNS_DIR", runs),
    ):
        detail = svc.load_vital_detail("meeting-notes")

    assert detail["items"] == ["## 1. Section", "## 2. Section"]


def test_load_vital_detail_dedups_today_items(tmp_path):
    from backend.services import control_tower as svc

    now = datetime.now(timezone.utc)
    vitals, runs = _setup_vital(tmp_path, run_record=None)
    lines = [
        {"ts": now.isoformat(), "count": 1, "items": ["Daily standup"]},
        {"ts": now.isoformat(), "count": 1, "items": ["Daily standup"]},
    ]
    (runs / "meeting-notes.jsonl").write_text("\n".join(json.dumps(x) for x in lines) + "\n")

    with (
        patch.object(svc, "OZOS_VITALS", vitals),
        patch.object(svc, "TOOLS_DIR", tmp_path / "tools"),
        patch.object(svc, "OZOS_RUNS_DIR", runs),
    ):
        detail = svc.load_vital_detail("meeting-notes")

    assert detail["items"] == ["Daily standup"]


def test_load_vital_detail_unknown_id_returns_none(tmp_path):
    from backend.services import control_tower as svc

    vitals, runs = _setup_vital(tmp_path, run_record=None)
    with (
        patch.object(svc, "OZOS_VITALS", vitals),
        patch.object(svc, "TOOLS_DIR", tmp_path / "tools"),
        patch.object(svc, "OZOS_RUNS_DIR", runs),
    ):
        assert svc.load_vital_detail("does-not-exist") is None


def test_vital_detail_endpoint_404_for_unknown():
    response = client.get("/api/control-tower/vitals/totally-unknown-vital")
    assert response.status_code == 404


def test_vital_detail_endpoint_known_id_shape(tmp_path):
    from backend.services import control_tower as svc

    vitals = tmp_path / "vitals.json"
    vitals.write_text(
        json.dumps(
            {
                "vitals": [
                    {
                        "id": "meeting-notes",
                        "name": "meeting-notes",
                        "tool": "meeting-notes",
                        "description": "sample",
                        "output_dir": "vault/knowledge-hub/meeting-notes",
                        "output_glob": "**/*.md",
                        "stale_after_hours": 24,
                        "run": ["python3", "tools/meeting-notes/sync_gemini_notes.py"],
                    }
                ]
            }
        )
    )
    with (
        patch.object(svc, "OZOS_VITALS", vitals),
        patch.object(svc, "OZOS_RUNS_DIR", tmp_path / "runs"),
    ):
        response = client.get("/api/control-tower/vitals/meeting-notes")
    assert response.status_code == 200
    data = response.json()
    for key in ("id", "lastRunIso", "lastRunHuman", "delta", "todayCount", "items"):
        assert key in data


# ── load_commands (slash commands from .claude/commands/) ─────────────────


def _commands_dir(tmp_path):
    d = tmp_path / "commands"
    d.mkdir()
    return d


def test_load_commands_handles_missing_dir(tmp_path):
    from backend.services import control_tower as svc

    with patch.object(svc, "OZOS_PROJECT_COMMANDS", tmp_path / "nonexistent"):
        assert svc.load_commands() == []


def test_load_commands_parses_name_and_first_line_description(tmp_path):
    from backend.services import control_tower as svc

    d = _commands_dir(tmp_path)
    (d / "my-tasks.md").write_text("Open the personal task manager in the browser.\n\nmore body")
    with (
        patch.object(svc, "OZOS_PROJECT_COMMANDS", d),
        patch.object(svc, "_load_skill_usage", lambda: {}),
    ):
        cmds = svc.load_commands()
    assert len(cmds) == 1
    c = cmds[0]
    assert c["name"] == "my-tasks"
    assert c["description"] == "Open the personal task manager in the browser."
    assert c["usageCount"] == 0
    assert c["contextTokens"] >= 1


def test_load_commands_prefers_frontmatter_description(tmp_path):
    from backend.services import control_tower as svc

    d = _commands_dir(tmp_path)
    (d / "deploy.md").write_text(
        "---\ndescription: Ship the build to prod\nargument-hint: <env>\n---\nLong body here."
    )
    with (
        patch.object(svc, "OZOS_PROJECT_COMMANDS", d),
        patch.object(svc, "_load_skill_usage", lambda: {}),
    ):
        cmds = svc.load_commands()
    assert cmds[0]["description"] == "Ship the build to prod"


def test_load_commands_includes_usage_and_sorts_by_count(tmp_path):
    from backend.services import control_tower as svc

    d = _commands_dir(tmp_path)
    (d / "git.md").write_text("Save work to git.")
    (d / "commit.md").write_text("Commit changes.")
    fake_usage = {
        "git": {"count": 5, "last_ts": 0.0},
        "commit": {"count": 1, "last_ts": 0.0},
    }
    with (
        patch.object(svc, "OZOS_PROJECT_COMMANDS", d),
        patch.object(svc, "_load_skill_usage", lambda: fake_usage),
    ):
        cmds = svc.load_commands()
    assert [c["name"] for c in cmds] == ["git", "commit"]
    assert cmds[0]["usageCount"] == 5


def test_status_endpoint_includes_commands():
    response = client.get("/api/control-tower/status")
    assert response.status_code == 200
    data = response.json()
    assert "commands" in data
    assert isinstance(data["commands"], list)
    # The repo ships .claude/commands/git.md among others.
    assert any(c["name"] == "git" for c in data["commands"])


# ── Manual vital re-trigger (run / run-status) ───────────────────────

VITALS_BASE = "/api/control-tower"


def _write_vitals(tmp_path, vitals):
    """Write a temp vitals.json and return its path."""
    path = tmp_path / "vitals.json"
    path.write_text(json.dumps({"vitals": vitals}))
    return path


def test_run_unknown_vital_returns_404(tmp_path, monkeypatch):
    from backend.services import control_tower as svc

    monkeypatch.setattr(svc, "OZOS_VITALS", _write_vitals(tmp_path, []))
    monkeypatch.setattr(svc, "OZOS_RUNS_DIR", tmp_path)
    assert client.post(f"{VITALS_BASE}/vitals/nope/run").status_code == 404


def test_run_vital_without_command_returns_409(tmp_path, monkeypatch):
    from backend.services import control_tower as svc

    monkeypatch.setattr(svc, "OZOS_VITALS", _write_vitals(tmp_path, [{"id": "graphify"}]))
    monkeypatch.setattr(svc, "OZOS_RUNS_DIR", tmp_path)
    r = client.post(f"{VITALS_BASE}/vitals/graphify/run")
    assert r.status_code == 409


def test_run_vital_triggers_execution_and_reports_status(tmp_path, monkeypatch):
    from backend.services import control_tower as svc

    monkeypatch.setattr(
        svc,
        "OZOS_VITALS",
        _write_vitals(tmp_path, [{"id": "daily-digest", "run": ["echo", "hi"]}]),
    )
    monkeypatch.setattr(svc, "OZOS_RUNS_DIR", tmp_path)
    # Run the launched target inline instead of in a real background thread.
    monkeypatch.setattr(svc, "_launch", lambda target: target())

    fake_proc = MagicMock(returncode=0, stdout="synced 2 notes\n", stderr="")
    with patch.object(svc.subprocess, "run", return_value=fake_proc) as mock_run:
        r = client.post(f"{VITALS_BASE}/vitals/daily-digest/run")
        assert r.status_code == 200
        assert r.json()["state"] in ("started", "running")
        mock_run.assert_called_once()

    # lock cleared, status file written with exit 0 (no error surfaced on success)
    assert not (tmp_path / "daily-digest.lock").exists()
    status = json.loads((tmp_path / "daily-digest.run-status.json").read_text())
    assert status["exit"] == 0
    assert "error" not in status


def test_run_vital_records_nonzero_exit_with_reason(tmp_path, monkeypatch):
    from backend.services import control_tower as svc

    monkeypatch.setattr(
        svc,
        "OZOS_VITALS",
        _write_vitals(tmp_path, [{"id": "daily-digest", "run": ["false"]}]),
    )
    monkeypatch.setattr(svc, "OZOS_RUNS_DIR", tmp_path)
    monkeypatch.setattr(svc, "_launch", lambda target: target())

    # A failing sync ends with a traceback; the last line is the useful reason.
    fake_proc = MagicMock(
        returncode=2,
        stdout="[meeting-notes] Starting sync...\n",
        stderr="Traceback (most recent call last):\nTimeoutError: timed out\n",
    )
    with patch.object(svc.subprocess, "run", return_value=fake_proc):
        client.post(f"{VITALS_BASE}/vitals/daily-digest/run")

    r = client.get(f"{VITALS_BASE}/vitals/daily-digest/run/status")
    body = r.json()
    assert body["state"] == "error"
    assert body["last_exit"] == 2
    # The reason (last meaningful output line) is surfaced to the UI.
    assert body["error"] == "TimeoutError: timed out"
    # Full output is captured to a log for deeper debugging.
    assert (tmp_path / "daily-digest.run.log").exists()
    assert "TimeoutError" in (tmp_path / "daily-digest.run.log").read_text()


def test_run_status_idle_when_never_run(tmp_path, monkeypatch):
    from backend.services import control_tower as svc

    monkeypatch.setattr(
        svc,
        "OZOS_VITALS",
        _write_vitals(tmp_path, [{"id": "daily-digest", "run": ["echo"]}]),
    )
    monkeypatch.setattr(svc, "OZOS_RUNS_DIR", tmp_path)
    r = client.get(f"{VITALS_BASE}/vitals/daily-digest/run/status")
    assert r.status_code == 200
    assert r.json()["state"] == "idle"


def test_run_status_running_when_lock_present(tmp_path, monkeypatch):
    from backend.services import control_tower as svc

    monkeypatch.setattr(
        svc,
        "OZOS_VITALS",
        _write_vitals(tmp_path, [{"id": "daily-digest", "run": ["echo"]}]),
    )
    monkeypatch.setattr(svc, "OZOS_RUNS_DIR", tmp_path)
    (tmp_path / "daily-digest.lock").write_text("1")
    r = client.get(f"{VITALS_BASE}/vitals/daily-digest/run/status")
    assert r.json()["state"] == "running"


def test_run_status_unknown_vital_404(tmp_path, monkeypatch):
    from backend.services import control_tower as svc

    monkeypatch.setattr(svc, "OZOS_VITALS", _write_vitals(tmp_path, []))
    monkeypatch.setattr(svc, "OZOS_RUNS_DIR", tmp_path)
    assert client.get(f"{VITALS_BASE}/vitals/nope/run/status").status_code == 404


def test_run_vital_relaunches_over_a_stale_lock(tmp_path, monkeypatch):
    """A lock left behind by a crashed run must not brick the button forever."""
    import os
    import time
    from backend.services import control_tower as svc

    monkeypatch.setattr(
        svc,
        "OZOS_VITALS",
        _write_vitals(tmp_path, [{"id": "daily-digest", "run": ["echo", "hi"]}]),
    )
    monkeypatch.setattr(svc, "OZOS_RUNS_DIR", tmp_path)
    monkeypatch.setattr(svc, "_launch", lambda target: target())

    # A lock file far older than the staleness threshold (a crashed prior run).
    lock = tmp_path / "daily-digest.lock"
    lock.write_text("old")
    stale = time.time() - (svc.STALE_LOCK_SECONDS + 60)
    os.utime(lock, (stale, stale))

    fake_proc = MagicMock(returncode=0, stdout="", stderr="")
    with patch.object(svc.subprocess, "run", return_value=fake_proc) as mock_run:
        r = client.post(f"{VITALS_BASE}/vitals/daily-digest/run")
        assert r.status_code == 200
        assert r.json()["state"] == "started"  # not blocked by the stale lock
        mock_run.assert_called_once()


def test_run_vital_respects_a_fresh_lock(tmp_path, monkeypatch):
    from backend.services import control_tower as svc

    monkeypatch.setattr(
        svc,
        "OZOS_VITALS",
        _write_vitals(tmp_path, [{"id": "daily-digest", "run": ["echo", "hi"]}]),
    )
    monkeypatch.setattr(svc, "OZOS_RUNS_DIR", tmp_path)
    monkeypatch.setattr(svc, "_launch", lambda target: target())

    (tmp_path / "daily-digest.lock").write_text("fresh")  # just created → in flight
    with patch.object(svc.subprocess, "run") as mock_run:
        r = client.post(f"{VITALS_BASE}/vitals/daily-digest/run")
        assert r.json()["state"] == "running"
        mock_run.assert_not_called()
