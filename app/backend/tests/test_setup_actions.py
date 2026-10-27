"""Setup forms write the same vault files the rest of the engine reads."""

import json
import shutil
from datetime import datetime
from pathlib import Path

import pytest
import yaml

from backend.services import data, setup_actions, setup_state
from backend.services.data import create_person
from backend.services.setup_actions import (
    add_drop_folder,
    add_stakeholder,
    env_status,
    gmail_status,
    reminders,
    set_company_cycle,
    set_default_cadence,
    update_routing,
    write_env,
)
from backend.services.setup_state import load_state

TEMPLATE = Path(__file__).resolve().parents[3] / "vault-template"


@pytest.fixture
def vault(tmp_path, monkeypatch):
    v = tmp_path / "vault"
    shutil.copytree(TEMPLATE / "people-hub", v / "people-hub")
    (v / ".ozos").mkdir()
    (v / "knowledge-hub").mkdir()
    monkeypatch.setattr(data, "DATA_DIR", v / "people-hub")
    monkeypatch.setattr(setup_state, "SETUP_FILE", v / ".ozos" / "setup.json")
    monkeypatch.setattr(setup_actions, "ROUTING_FILE", v / ".ozos" / "meeting-routing.json")
    monkeypatch.setattr(setup_actions, "SOURCES_FILE", v / ".ozos" / "knowledge-sources.json")
    monkeypatch.setattr(setup_actions, "ENV_FILE", v / ".env")
    monkeypatch.setattr(setup_actions, "KNOWLEDGE_HUB_DIR", v / "knowledge-hub")
    monkeypatch.setattr(setup_actions, "GDRIVE_CREDS", tmp_path / "home" / "creds.json")
    monkeypatch.setattr(setup_actions, "GMAIL_TOKEN", tmp_path / "home" / "token.json")
    monkeypatch.setattr(setup_actions, "ME_PERSON_ID", "me")
    return v


def _routing(v: Path) -> dict:
    return json.loads((v / ".ozos" / "meeting-routing.json").read_text())


# ── people ──────────────────────────────────────────────────────────────


def test_add_stakeholder_writes_everything_in_one_call(vault):
    out = add_stakeholder(
        {
            "person_id": "pat",
            "display_name": "Pat Example",
            "email": "Pat@Example.com",
            "team_folder": "Growth",
            "leadership": True,
            "manager": "Taylor",
        }
    )
    meta = yaml.safe_load((vault / "people-hub/people/pat/meta.yaml").read_text())
    assert meta["display_name"] == "Pat Example" and meta["manager"] == "Taylor"
    assert meta["email"] == "pat@example.com"
    assert meta["start_date"] == datetime.now().date().isoformat()
    assert not (vault / "people-hub/people/example-report").exists()
    assert out["removed_example"] is True
    r = _routing(vault)
    assert r["person_folders"] == {"pat@example.com": "Pat Example"}
    assert "Growth" in r["folders"] and "Leadership" in r["folders"] and "Other" in r["folders"]
    assert r["group_rules"] == [{"folder": "Leadership", "members": ["pat"], "min_present": 3}]
    state = load_state()["items"]["add-stakeholder"]
    assert state["status"] == "done"
    assert state["rows"][0]["id"] == "pat" and state["rows"][0]["display_name"] == "Pat Example"


def test_add_second_leader_extends_rule_and_duplicate_is_rejected(vault):
    add_stakeholder({"person_id": "pat", "display_name": "Pat A", "leadership": True})
    out = add_stakeholder(
        {"person_id": "sam", "display_name": "Sam B", "team_folder": "Growth", "leadership": True}
    )
    assert out["removed_example"] is False
    r = _routing(vault)
    assert r["group_rules"] == [
        {"folder": "Leadership", "members": ["pat", "sam"], "min_present": 3}
    ]
    assert r["folders"].count("Growth") == 1
    with pytest.raises(FileExistsError):
        add_stakeholder({"person_id": "sam", "display_name": "Sam Again"})
    assert len(load_state()["items"]["add-stakeholder"]["rows"]) == 2


def test_add_stakeholder_without_email_or_leadership_touches_little(vault):
    add_stakeholder({"person_id": "kim", "display_name": "Kim C", "leadership": False})
    r = _routing(vault)
    assert r["person_folders"] == {} and r["group_rules"] == []
    assert r["folders"] == ["Other"] and r["default_folder"] == "Other"
    assert r["drive_parent_folder_id"] is None and r["tagging_guide"] == ""


def test_add_stakeholder_rejects_bad_ids(vault):
    with pytest.raises(ValueError):
        add_stakeholder({"person_id": "Pat Example", "display_name": "Pat"})
    with pytest.raises(ValueError):
        add_stakeholder({"person_id": "", "display_name": "Pat"})


# ── review cycle ────────────────────────────────────────────────────────


def test_company_cycle_replaces_example(vault):
    out = set_company_cycle(
        "Annual Review",
        "deep-dive",
        [
            {"label": "Self Assessment", "start": "2027-01-10", "end": "2027-01-24"},
            {"id": "mgr", "label": "Manager Review", "start": "", "end": ""},
        ],
    )
    assert "example-annual" not in out["cycles"]
    assert out["active_cycle"] == "annual-review"
    events = out["cycles"]["annual-review"]["events"]
    assert events[0] == {
        "id": "self-assessment",
        "label": "Self Assessment",
        "start": "2027-01-10",
        "end": "2027-01-24",
    }
    assert events[1]["id"] == "mgr"
    on_disk = yaml.safe_load((vault / "people-hub/cycles.yaml").read_text())
    assert on_disk == out
    state = load_state()
    assert state["cadence"] == {"mode": "company", "cycle_id": "annual-review"}
    assert state["items"]["define-cycle"]["status"] == "done"


def test_company_cycle_requires_a_name_and_a_stage(vault):
    with pytest.raises(ValueError):
        set_company_cycle("", "deep-dive", [{"label": "x"}])
    with pytest.raises(ValueError):
        set_company_cycle("Annual", "deep-dive", [])


def test_default_cadence_reminders_skip_example_and_me(vault):
    set_default_cadence()
    cadence = load_state()["cadence"]
    assert cadence["mode"] == "default"
    assert cadence["monthly"] and cadence["quarterly"] and cadence["set_at"]
    assert load_state()["items"]["define-cycle"]["status"] == "done"
    create_person("me", {"name": "me", "display_name": "Me"})
    create_person("sam", {"name": "sam", "display_name": "Sam B"})
    now = datetime(datetime.now().year, 5, 17, 9, 30)
    [r] = reminders(now)
    assert r == {
        "person_id": "sam",
        "display_name": "Sam B",
        "monthly_due": f"{now.year}-06-01",
        "quarterly_due": f"{now.year}-07-01",
    }
    year = datetime.now().year
    assert reminders(datetime(year, 12, 3))[0]["monthly_due"] == f"{year + 1}-01-01"
    assert reminders(datetime(year, 12, 3))[0]["quarterly_due"] == f"{year + 1}-01-01"
    assert reminders(datetime(year, 10, 1))[0]["quarterly_due"] == f"{year + 1}-01-01"


def test_reminders_empty_without_default_cadence_or_reports(vault):
    assert reminders() == []
    set_default_cadence()
    assert reminders() == []  # only example-report exists


# ── drop folders ────────────────────────────────────────────────────────


def test_drop_folder_creates_dir_and_source(vault):
    entry = add_drop_folder("pdf-drop-folder", "My PDFs!")
    assert entry == {"id": "my-pdfs", "label": "My Pdfs", "path": "knowledge-hub/my-pdfs"}
    assert (vault / "knowledge-hub" / "my-pdfs").is_dir()
    sources = json.loads((vault / ".ozos" / "knowledge-sources.json").read_text())["sources"]
    assert entry in sources
    add_drop_folder("surveys-folder", "my-pdfs")
    sources = json.loads((vault / ".ozos" / "knowledge-sources.json").read_text())["sources"]
    assert sources.count(entry) == 1
    item = load_state()["items"]["pdf-drop-folder"]
    assert item["status"] == "done" and item["notes"] == "knowledge-hub/my-pdfs"


def test_drop_folder_rejects_wrong_kind_and_empty_name(vault):
    with pytest.raises(ValueError):
        add_drop_folder("granola", "x")
    with pytest.raises(ValueError):
        add_drop_folder("pdf-drop-folder", "   !!! ")


# ── routing ─────────────────────────────────────────────────────────────


def test_update_routing_marks_done_and_keeps_default_folder(vault):
    r = update_routing(folders=["Growth", "Platform"], default_folder="Misc", tagging_guide="x")
    assert r["folders"] == ["Growth", "Platform", "Misc"] and r["default_folder"] == "Misc"
    assert r["tagging_guide"] == "x"
    assert load_state()["items"]["routing-folders"]["status"] == "done"
    r = update_routing(drive_parent_folder_id="abc")
    assert r["drive_parent_folder_id"] == "abc" and r["folders"] == ["Growth", "Platform", "Misc"]
    r = update_routing(drive_parent_folder_id="")
    assert r["drive_parent_folder_id"] is None


# ── env ─────────────────────────────────────────────────────────────────


def test_env_write_whitelist_and_no_echo(vault):
    written = write_env(
        {"ATLASSIAN_EMAIL": "a@b.c", "ATLASSIAN_TOKEN": "t0k", "ATLASSIAN_SUBDOMAIN": "acme"}
    )
    assert written == ["ATLASSIAN_EMAIL", "ATLASSIAN_TOKEN", "ATLASSIAN_SUBDOMAIN"]
    assert (vault / ".env").stat().st_mode & 0o777 == 0o600
    assert env_status() == {
        "ATLASSIAN_EMAIL": True,
        "ATLASSIAN_TOKEN": True,
        "ATLASSIAN_SUBDOMAIN": True,
    }
    assert load_state()["items"]["confluence"]["status"] == "done"
    with pytest.raises(ValueError):
        write_env({"ANTHROPIC_API_KEY": "x"})
    with pytest.raises(ValueError):
        write_env({"ATLASSIAN_TOKEN": "a\nb"})
    with pytest.raises(ValueError):
        write_env({})


def test_env_write_preserves_other_lines_and_partial_set_is_not_done(vault):
    (vault / ".env").write_text("# mine\nANTHROPIC_API_KEY=k\nATLASSIAN_EMAIL=old@x.y\n")
    write_env({"ATLASSIAN_EMAIL": "new@x.y"})
    text = (vault / ".env").read_text()
    # values are double-quoted so `#`, quotes and spaces survive dotenv parsing
    assert text.splitlines() == ["# mine", "ANTHROPIC_API_KEY=k", 'ATLASSIAN_EMAIL="new@x.y"']
    assert env_status()["ATLASSIAN_EMAIL"] is True and env_status()["ATLASSIAN_TOKEN"] is False
    assert load_state()["items"]["confluence"]["status"] == "not_started"


def test_env_status_without_file(vault):
    assert env_status() == {
        "ATLASSIAN_EMAIL": False,
        "ATLASSIAN_TOKEN": False,
        "ATLASSIAN_SUBDOMAIN": False,
    }


# ── gmail ───────────────────────────────────────────────────────────────


def test_gmail_status_reports_files(vault, tmp_path):
    assert gmail_status() == {
        "credentials_file": False,
        "token_file": False,
        "drive_parent_folder_id": None,
        "auth_command": "python3 tools/meeting-notes/sync_gemini_notes.py --auth",
    }
    (tmp_path / "home").mkdir()
    (tmp_path / "home" / "creds.json").write_text("{}")
    update_routing(drive_parent_folder_id="folder123")
    s = gmail_status()
    assert s["credentials_file"] is True and s["token_file"] is False
    assert s["drive_parent_folder_id"] == "folder123"


# ── review fixes ────────────────────────────────────────────────────────


def test_update_routing_keeps_group_rule_folders(vault):
    """Replacing the folder list must not orphan a group rule's folder (the
    categoriser only picks from `folders`, and the rule reroutes into one of them)."""
    add_stakeholder({"person_id": "pat", "display_name": "Pat A", "leadership": True})
    r = update_routing(folders=["Design"], default_folder="Other")
    assert r["folders"] == ["Design", "Other", "Leadership"]


def test_env_values_round_trip_through_dotenv(vault):
    tricky = 'a #b "q" \\x y'
    write_env({"ATLASSIAN_TOKEN": tricky, "ATLASSIAN_EMAIL": " padded@x.y "})
    from dotenv import dotenv_values

    values = dotenv_values(vault / ".env")
    assert values["ATLASSIAN_TOKEN"] == tricky
    assert values["ATLASSIAN_EMAIL"] == "padded@x.y"


def test_env_write_is_atomic_and_private_from_creation(vault, monkeypatch):
    """The temp file is created 0600 and swapped in; a crash mid-write cannot
    truncate the existing .env."""
    (vault / ".env").write_text("ANTHROPIC_API_KEY=k\n")
    seen: list[tuple[str, int]] = []
    real_open = setup_actions.os.open

    def spy_open(path, flags, mode=0o777, *a, **k):
        seen.append((str(path), mode))
        return real_open(path, flags, mode, *a, **k)

    monkeypatch.setattr(setup_actions.os, "open", spy_open)
    real_replace = setup_actions.os.replace

    def boom(src, dst):
        raise OSError("disk full")

    monkeypatch.setattr(setup_actions.os, "replace", boom)
    with pytest.raises(OSError):
        write_env({"ATLASSIAN_EMAIL": "a@b.c"})
    assert (vault / ".env").read_text() == "ANTHROPIC_API_KEY=k\n"
    assert seen and seen[0][1] == 0o600 and seen[0][0] != str(vault / ".env")
    monkeypatch.setattr(setup_actions.os, "replace", real_replace)
    write_env({"ATLASSIAN_EMAIL": "a@b.c"})
    assert (vault / ".env").stat().st_mode & 0o777 == 0o600
    assert not list(vault.glob(".env.*"))
