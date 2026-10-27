"""Confluence connection details come from the vault .env, never from constants."""

from backend.services import knowledge_hub as kh


def test_confluence_base_from_subdomain(monkeypatch):
    monkeypatch.setenv("ATLASSIAN_SUBDOMAIN", "examplecorp")
    assert kh.confluence_base() == "https://examplecorp.atlassian.net"


def test_confluence_user_from_env(monkeypatch):
    monkeypatch.setenv("ATLASSIAN_EMAIL", "pat@example.com")
    assert kh.confluence_user() == "pat@example.com"


def test_search_confluence_explains_missing_config(monkeypatch):
    monkeypatch.delenv("ATLASSIAN_SUBDOMAIN", raising=False)
    monkeypatch.setenv("ATLASSIAN_TOKEN", "tok")
    monkeypatch.setenv("ATLASSIAN_EMAIL", "pat@example.com")
    result = kh.search_confluence("roadmap")
    assert result and "ATLASSIAN_SUBDOMAIN" in result[0]["error"]


def test_tool_descriptions_name_no_people():
    text = str(kh.TOOLS).lower()
    for name in ("alex", "sam", "jordan", "taylor", "widget"):
        assert name not in text
