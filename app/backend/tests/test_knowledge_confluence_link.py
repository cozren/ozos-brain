"""Knowledge Hub docs can point at their upstream Confluence page.

A doc that carries `confluence: <url>` in its frontmatter surfaces that URL as
`confluence_url` on the read-file payload, so the preview can render a
"open in Confluence" link. Docs without the field return None.
"""

import pytest

from backend.services import knowledge as knowledge_svc


@pytest.fixture
def hub(tmp_path, monkeypatch):
    """A one-source knowledge root under tmp_path."""
    root = tmp_path
    src = root / "knowledge-hub" / "ad-stack"
    src.mkdir(parents=True)
    monkeypatch.setattr(knowledge_svc, "_ROOT", root)
    monkeypatch.setattr(
        knowledge_svc,
        "load_sources",
        lambda: [{"id": "ad-stack", "label": "Ad Stack", "path": "knowledge-hub/ad-stack"}],
    )
    monkeypatch.setattr(knowledge_svc, "folder_tags_for", lambda _p: [])
    return src


def test_read_file_exposes_confluence_url_from_frontmatter(hub):
    (hub / "doc.md").write_text(
        "---\n"
        "confluence: https://examplecorp.atlassian.net/wiki/spaces/PEP/pages/8836907194/Ad+Tech\n"
        "tags: [ads]\n"
        "---\n\n"
        "# Ad Tech\n",
        encoding="utf-8",
    )

    doc = knowledge_svc.read_file("knowledge-hub/ad-stack/doc.md")

    assert (
        doc["confluence_url"]
        == "https://examplecorp.atlassian.net/wiki/spaces/PEP/pages/8836907194/Ad+Tech"
    )
    assert doc["tags"] == ["ads"]


def test_read_file_returns_none_when_no_confluence_field(hub):
    (hub / "plain.md").write_text("# Plain\n", encoding="utf-8")

    assert knowledge_svc.read_file("knowledge-hub/ad-stack/plain.md")["confluence_url"] is None


def test_read_file_ignores_non_string_confluence_field(hub):
    """A malformed value must not reach the frontend as a bogus href."""
    (hub / "bad.md").write_text("---\nconfluence: [1, 2]\n---\n\n# Bad\n", encoding="utf-8")

    assert knowledge_svc.read_file("knowledge-hub/ad-stack/bad.md")["confluence_url"] is None
