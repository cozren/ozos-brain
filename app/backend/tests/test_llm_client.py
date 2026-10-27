# backend/tests/test_llm_client.py
import pytest

from backend.services import llm_client


def test_client_uses_anthropic_key_and_optional_proxy(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-123")
    monkeypatch.setenv("OZOS_LLM_BASE_URL", "https://example.test")
    client = llm_client.make_anthropic_client()
    assert str(client.base_url).startswith("https://example.test")
    assert client.api_key == "sk-test-123"


def test_client_requires_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(llm_client.ozos_llm, "ENV_FILE", llm_client.Path("/nonexistent/.env"))
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        llm_client.make_anthropic_client()
