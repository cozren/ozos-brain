"""`ozos setup` prints the checklist from <vault>/.ozos/setup.json; `ozos setup mark`
writes one status. Items come from the app's registry; nothing imports backend.config."""

import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cli import TEMPLATE, main  # noqa: E402


@pytest.fixture
def vault(tmp_path, monkeypatch):
    v = tmp_path / "v"
    shutil.copytree(TEMPLATE, v)
    monkeypatch.setenv("OZOS_VAULT", str(v))
    return v


def test_setup_prints_groups_items_and_count(vault, capsys):
    assert main(["setup"]) == 0
    out = capsys.readouterr().out
    assert "You" in out and "Meeting notes" in out and "Insights" in out
    assert "Your profile" in out and "Survey exports" in out
    assert "[not_started] Granola" in out
    assert "0 of 17 done" in out


def test_setup_json(vault, capsys):
    assert main(["setup", "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert len(data["groups"]) == 10
    assert data["summary"] == {"done": 0, "total": 17, "open": 17}
    ids = [i["id"] for g in data["groups"] for i in g["items"]]
    assert ids[0] == "profile" and ids[-1] == "surveys-folder"
    first = data["groups"][0]["items"][0]
    assert first["status"] == "not_started" and first["kind"] == "profile"
    assert "setup_doc" in first and "title" in first


def test_setup_mark_writes_and_shows(vault, capsys):
    assert main(["setup", "mark", "granola", "skipped", "--notes", "no granola here"]) == 0
    on_disk = json.loads((vault / ".ozos" / "setup.json").read_text())
    assert on_disk["items"]["granola"]["status"] == "skipped"
    assert on_disk["items"]["granola"]["notes"] == "no granola here"
    assert on_disk["items"]["granola"]["updated_at"]
    assert on_disk["items"]["profile"]["status"] == "not_started"
    capsys.readouterr()
    main(["setup"])
    out = capsys.readouterr().out
    assert "[skipped] Granola" in out and "0 of 17 done" in out


def test_setup_mark_rejects_unknown_item_and_status(vault, capsys):
    assert main(["setup", "mark", "nope", "done"]) == 1
    assert "unknown item" in capsys.readouterr().err
    assert main(["setup", "mark", "granola", "finished"]) == 1
    assert "unknown status" in capsys.readouterr().err


def test_setup_tolerates_missing_state_file(vault, capsys):
    (vault / ".ozos" / "setup.json").unlink()
    assert main(["setup"]) == 0
    assert "0 of 17 done" in capsys.readouterr().out


def test_setup_uses_home_config_when_no_env(tmp_path, monkeypatch, capsys):
    import cli

    monkeypatch.delenv("OZOS_VAULT", raising=False)
    monkeypatch.setattr(cli, "HOME", tmp_path)
    v = tmp_path / "cfgvault"
    shutil.copytree(TEMPLATE, v)
    (tmp_path / ".ozos").mkdir()
    (tmp_path / ".ozos" / "config.json").write_text(json.dumps({"vault": str(v)}))
    main(["setup", "mark", "granola", "done"])
    assert (
        json.loads((v / ".ozos" / "setup.json").read_text())["items"]["granola"]["status"] == "done"
    )
