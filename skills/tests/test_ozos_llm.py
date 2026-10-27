import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ozos_llm  # noqa: E402
from ozos_llm import DEFAULT_MODEL, complete, make_client, model  # noqa: E402


@pytest.fixture(autouse=True)
def _no_vault_env(monkeypatch, tmp_path):
    # Never read a real vault/.env during tests.
    monkeypatch.setattr(ozos_llm, "ENV_FILE", tmp_path / ".env")


def test_make_client_requires_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        make_client()


def test_make_client_passes_optional_base_url(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setenv("OZOS_LLM_BASE_URL", "http://proxy.local")
    assert str(make_client().base_url).startswith("http://proxy.local")


def test_make_client_without_base_url_uses_sdk_default(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.delenv("OZOS_LLM_BASE_URL", raising=False)
    assert "anthropic.com" in str(make_client().base_url)


def test_model_default_and_override(monkeypatch):
    monkeypatch.delenv("OZOS_LLM_MODEL", raising=False)
    assert model() == DEFAULT_MODEL == "claude-sonnet-5-5"
    monkeypatch.setenv("OZOS_LLM_MODEL", "claude-opus-5-5")
    assert model() == "claude-opus-5-5"


def test_complete_returns_first_text_block_and_passes_system(monkeypatch):
    monkeypatch.delenv("OZOS_LLM_MODEL", raising=False)
    client = MagicMock()
    client.messages.create.return_value = SimpleNamespace(content=[SimpleNamespace(text="  hi  ")])
    assert complete(client, system="be terse", user="hello", max_tokens=7) == "hi"
    kwargs = client.messages.create.call_args.kwargs
    assert kwargs["model"] == "claude-sonnet-5-5"
    assert kwargs["system"] == "be terse"
    assert kwargs["max_tokens"] == 7
    assert kwargs["messages"] == [{"role": "user", "content": "hello"}]


def test_complete_omits_system_when_none():
    client = MagicMock()
    client.messages.create.return_value = SimpleNamespace(content=[SimpleNamespace(text="x")])
    complete(client, system=None, user="hello")
    assert "system" not in client.messages.create.call_args.kwargs
