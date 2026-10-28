import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cli  # noqa: E402
from cli import TEMPLATE, create_vault, main, write_env, write_user_config  # noqa: E402


def test_create_vault_copies_template_and_refuses_overwrite(tmp_path):
    dest = tmp_path / "v"
    create_vault(TEMPLATE, dest)
    assert json.loads((dest / ".ozos" / "datahub.json").read_text()) == {
        "tabs": {},
        "pickerFolders": {},
    }
    assert (dest / "people-hub" / "cycles.yaml").exists()
    assert (dest / "people-hub" / "people" / "example-report" / "meta.yaml").exists()
    assert (dest / "knowledge-hub" / "meeting-notes").is_dir()
    assert (dest / ".gitignore").exists()
    with pytest.raises(FileExistsError):
        create_vault(TEMPLATE, dest)


def test_write_user_config(tmp_path):
    p = tmp_path / "config.json"
    write_user_config(p, name="Taylor", me="taylor", vault=tmp_path / "v", voice_text="plain")
    assert json.loads(p.read_text()) == {
        "name": "Taylor",
        "me": "taylor",
        "vault": str(tmp_path / "v"),
        "voice_text": "plain",
    }


def test_write_env_is_private(tmp_path):
    write_env(tmp_path, "k", "", "claude-sonnet-5-5")
    assert (tmp_path / ".env").stat().st_mode & 0o777 == 0o600
    text = (tmp_path / ".env").read_text()
    assert "ANTHROPIC_API_KEY=k" in text
    assert "OZOS_LLM_MODEL=claude-sonnet-5-5" in text


def test_init_non_interactive(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "HOME", tmp_path)
    rc = main(
        [
            "init",
            "--yes",
            "--name",
            "Taylor",
            "--me",
            "taylor",
            "--vault",
            str(tmp_path / "v"),
            "--api-key",
            "k",
            "--voice-text",
            "Plain and direct.",
        ]
    )
    assert rc == 0
    cfg = json.loads((tmp_path / ".ozos" / "config.json").read_text())
    assert cfg["me"] == "taylor" and cfg["vault"] == str(tmp_path / "v")
    assert (tmp_path / "v" / ".env").exists()
    agents = json.loads((tmp_path / "v" / ".ozos" / "intel-agents.json").read_text())
    assert agents["voice_text"] == "Plain and direct."


def test_init_refuses_existing_vault(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "HOME", tmp_path)
    (tmp_path / "v" / ".ozos").mkdir(parents=True)
    rc = main(
        [
            "init",
            "--yes",
            "--name",
            "T",
            "--me",
            "t",
            "--vault",
            str(tmp_path / "v"),
            "--api-key",
            "k",
        ]
    )
    assert rc == 1


def test_template_has_no_pinned_binaries_and_relative_runs():
    text = (TEMPLATE / ".ozos" / "vitals.json").read_text()
    assert "Library/Frameworks" not in text and "/Users/" not in text
    assert '"python3"' in text


def test_template_routing_matches_meeting_notes_schema():
    routing = json.loads((TEMPLATE / ".ozos" / "meeting-routing.json").read_text())
    assert set(routing) >= {
        "folders",
        "default_folder",
        "person_folders",
        "group_rules",
        "drive_parent_folder_id",
        "tagging_guide",
    }
    assert routing["drive_parent_folder_id"] is None


def test_template_hub_dirs_do_not_collide_with_extra_source_ids():
    """knowledge-hub/<dir> sources are auto-discovered by id = dir name; an extra
    source (e.g. the vault's docs/) must not reuse one of those names, or the
    Knowledge Hub renders two sources with the same key."""
    sources = json.loads((TEMPLATE / ".ozos" / "knowledge-sources.json").read_text())["sources"]
    extras = {s["id"] for s in sources if not s["path"].startswith("knowledge-hub/")}
    hub_dirs = {p.name for p in (TEMPLATE / "knowledge-hub").iterdir() if p.is_dir()}
    assert not (extras & hub_dirs), extras & hub_dirs


def _init_args(tmp_path, vault_name, extra=()):
    return [
        "init",
        "--yes",
        "--name",
        "T",
        "--me",
        "t",
        "--vault",
        str(tmp_path / vault_name),
        "--api-key",
        "k",
        *extra,
    ]


def test_init_refuses_to_repoint_an_existing_config_without_force(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "HOME", tmp_path)
    assert main(_init_args(tmp_path, "first")) == 0
    rc = main(_init_args(tmp_path, "second"))
    assert rc == 1
    assert json.loads((tmp_path / ".ozos" / "config.json").read_text())["vault"] == str(
        tmp_path / "first"
    )
    assert main(_init_args(tmp_path, "second", ["--force"])) == 0
    assert json.loads((tmp_path / ".ozos" / "config.json").read_text())["vault"] == str(
        tmp_path / "second"
    )


def test_init_warns_on_empty_api_key(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli, "HOME", tmp_path)
    rc = main(["init", "--yes", "--name", "T", "--me", "t", "--vault", str(tmp_path / "v")])
    assert rc == 0
    assert "ANTHROPIC_API_KEY" in capsys.readouterr().out


def test_init_copies_scrub_terms_when_given(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "HOME", tmp_path)
    src = tmp_path / "terms.txt"
    src.write_text("examplecorp\n")
    rc = main(_init_args(tmp_path, "v", ["--scrub-terms", str(src)]))
    assert rc == 0
    assert (tmp_path / ".ozos" / "scrub-terms.txt").read_text() == "examplecorp\n"


def test_template_gitignore_keeps_user_data_in_git():
    ignored = (TEMPLATE / ".gitignore").read_text()
    assert ".env" in ignored and ".ozos/datapoint-cache/" in ignored
    # personal tasks and knowledge stars are vault data, not regenerated runtime files
    assert ".ozos/personal-tasks.json" not in ignored
    assert ".ozos/knowledge-stars.json" not in ignored
