import json

import pytest

from backend.vault import load_user_config, resolve_vault


def test_env_var_wins(tmp_path):
    v = tmp_path / "v"
    v.mkdir()
    assert resolve_vault(tmp_path, env={"OZOS_VAULT": str(v)}, home=tmp_path) == v


def test_env_var_missing_dir_raises(tmp_path):
    with pytest.raises(FileNotFoundError, match="OZOS_VAULT"):
        resolve_vault(tmp_path, env={"OZOS_VAULT": str(tmp_path / "nope")}, home=tmp_path)


def test_config_json_used_when_no_env(tmp_path):
    v = tmp_path / "cfgvault"
    v.mkdir()
    (tmp_path / ".ozos").mkdir()
    (tmp_path / ".ozos" / "config.json").write_text(json.dumps({"vault": str(v)}))
    assert resolve_vault(tmp_path, env={}, home=tmp_path) == v


def test_malformed_config_falls_back_with_warning(tmp_path, caplog):
    (tmp_path / ".ozos").mkdir()
    (tmp_path / ".ozos" / "config.json").write_text("{not json")
    with caplog.at_level("WARNING"):
        assert resolve_vault(tmp_path, env={}, home=tmp_path) == tmp_path / "vault"
    assert "config.json" in caplog.text


def test_default_is_engine_vault(tmp_path):
    assert resolve_vault(tmp_path, env={}, home=tmp_path) == tmp_path / "vault"


def test_load_user_config_missing_or_malformed_is_empty(tmp_path):
    assert load_user_config(home=tmp_path) == {}
    (tmp_path / ".ozos").mkdir()
    (tmp_path / ".ozos" / "config.json").write_text("nope")
    assert load_user_config(home=tmp_path) == {}


def test_load_user_config_reads_me(tmp_path):
    (tmp_path / ".ozos").mkdir()
    (tmp_path / ".ozos" / "config.json").write_text(json.dumps({"me": "taylor"}))
    assert load_user_config(home=tmp_path)["me"] == "taylor"
