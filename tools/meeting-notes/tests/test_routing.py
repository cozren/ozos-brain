"""Meeting-notes routing comes from the vault (.ozos/meeting-routing.json), never
from constants in the engine."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from sync_gemini_notes import (  # noqa: E402
    DRIVE_READONLY_SCOPE,
    DRIVE_SCOPE,
    GMAIL_SCOPE,
    GroupRule,
    Routing,
    load_routing,
    oauth_scopes,
    route_group,
)


def test_load_routing_missing_file_defaults(tmp_path):
    r = load_routing(tmp_path / "none.json")
    assert r.folders == ["Other"]
    assert r.default_folder == "Other"
    assert r.person_folders == {}
    assert r.group_rules == []
    assert r.drive_parent_folder_id is None
    assert r.tagging_guide == ""


def test_load_routing_parses_rules(tmp_path):
    p = tmp_path / "r.json"
    p.write_text(
        json.dumps(
            {
                "folders": ["Leads", "Other"],
                "default_folder": "Other",
                "person_folders": {"a@x.io": "Alex"},
                "drive_parent_folder_id": None,
                "tagging_guide": "Tag product talk as Product/<name>.",
                "group_rules": [
                    {"folder": "Leads", "members": ["alex", "sam", "taylor"], "min_present": 2}
                ],
            }
        )
    )
    r = load_routing(p)
    assert r.folders == ["Leads", "Other"]
    assert r.person_folders == {"a@x.io": "Alex"}
    assert r.group_rules[0] == GroupRule("Leads", frozenset({"alex", "sam", "taylor"}), 2)
    assert r.tagging_guide.startswith("Tag product talk")


def test_load_routing_always_includes_default_folder_and_rule_folders(tmp_path):
    p = tmp_path / "r.json"
    p.write_text(
        json.dumps(
            {
                "folders": ["Leads"],
                "default_folder": "Other",
                "group_rules": [{"folder": "Leadership", "members": ["a", "b"], "min_present": 2}],
            }
        )
    )
    r = load_routing(p)
    assert "Other" in r.folders and "Leadership" in r.folders


def test_route_group_threshold():
    rule = GroupRule("Leads", frozenset({"alex", "sam", "taylor"}), 2)
    assert route_group([{"name": "Alex A"}, {"name": "Sam S"}], rule)
    assert not route_group([{"name": "Alex A"}, {"name": "Zoe Z"}], rule)


def test_route_group_dedupes_same_first_name_and_ignores_case():
    rule = GroupRule("Leads", frozenset({"alex", "sam", "taylor"}), 2)
    assert not route_group([{"name": "Alex"}, {"name": "alex a."}], rule)
    assert route_group([{"name": "ALEX"}, {"name": "taylor b"}], rule)


def test_oauth_scopes_read_drive_but_never_write_without_folder_id():
    """The source-doc export (transcript, invite list) always needs read access;
    only mirroring notes into a Drive folder needs write access."""
    r = load_routing(Path("/nonexistent/meeting-routing.json"))
    assert oauth_scopes(r) == [GMAIL_SCOPE, DRIVE_READONLY_SCOPE]


def test_oauth_scopes_include_full_drive_when_folder_id_set():
    r = Routing(["Other"], "Other", {}, [], "folder123", "")
    assert oauth_scopes(r) == [GMAIL_SCOPE, DRIVE_SCOPE]


def test_main_without_google_credentials_exits_cleanly(tmp_path, monkeypatch, capsys):
    """A fresh machine has no OAuth client file; the SessionStart hook must not
    print a traceback, just one line saying Gmail is not configured."""
    import sync_gemini_notes as sg

    monkeypatch.setattr(sg, "DEFAULT_CREDS_PATH", tmp_path / "missing-credentials.json")
    monkeypatch.setattr(sg, "DEFAULT_TOKEN_PATH", tmp_path / "missing-token.json")
    sg.main([])
    out = capsys.readouterr().out
    assert "not configured" in out.lower()
    assert "Traceback" not in out
