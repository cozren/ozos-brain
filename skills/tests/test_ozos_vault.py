import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ozos_vault import vault_dir  # noqa: E402


def test_env_var_wins(tmp_path):
    assert (
        vault_dir(engine_root=tmp_path, env={"OZOS_VAULT": str(tmp_path / "v")}, home=tmp_path)
        == tmp_path / "v"
    )


def test_config_json_used_when_no_env(tmp_path):
    (tmp_path / ".ozos").mkdir()
    (tmp_path / ".ozos" / "config.json").write_text(json.dumps({"vault": str(tmp_path / "cfg")}))
    assert vault_dir(engine_root=tmp_path, env={}, home=tmp_path) == tmp_path / "cfg"


def test_malformed_config_falls_back(tmp_path):
    (tmp_path / ".ozos").mkdir()
    (tmp_path / ".ozos" / "config.json").write_text("{nope")
    assert vault_dir(engine_root=tmp_path, env={}, home=tmp_path) == tmp_path / "vault"


def test_default_is_engine_vault(tmp_path):
    assert vault_dir(engine_root=tmp_path, env={}, home=tmp_path) == tmp_path / "vault"


def test_tools_use_the_shared_resolver():
    """Every tool that writes user data must resolve the vault the same way the app does."""
    root = Path(__file__).resolve().parents[2]
    for rel in (
        "tools/meeting-notes/sync_gemini_notes.py",
        "tools/daily-digest/digest.py",
        "tools/intel-agents/run.py",
        "tools/chatgpt-import/convert.py",
        "tools/youtube-xray/xray_single.py",
        "skills/ozos_llm.py",
    ):
        text = (root / rel).read_text(encoding="utf-8")
        assert "ozos_vault" in text, rel
        assert 'os.environ.get("OZOS_VAULT")' not in text, rel
