import pytest

from backend.services import chat_skills
from backend.services.chat_engine import ChatContext, build_system_prompt

SKILL_MD = """---
name: quick-prd
description: Creates a structured Quick PRD from feature context.
---

## Steps
Write the PRD with sections: Problem, Goals, Requirements.
"""


@pytest.fixture
def fake_skills(tmp_path, monkeypatch):
    d = tmp_path / "skills" / "quick-prd"
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text(SKILL_MD, encoding="utf-8")
    monkeypatch.setattr(chat_skills, "_skill_dirs", lambda: [tmp_path / "skills"])
    monkeypatch.setattr(chat_skills, "CHAT_ARTIFACT_SKILLS", ("quick-prd", "doc-style"))
    return tmp_path


def test_list_skills_returns_only_existing_whitelisted(fake_skills):
    assert chat_skills.list_skills() == [
        {"name": "quick-prd", "description": "Creates a structured Quick PRD from feature context."}
    ]


def test_load_skill_returns_body_without_frontmatter(fake_skills):
    body = chat_skills.load_skill("quick-prd")
    assert "Write the PRD" in body
    assert "description:" not in body


def test_list_skills_handles_description_containing_triple_dash(tmp_path, monkeypatch):
    """A '---' embedded in a frontmatter value (not on its own line) must not
    be mistaken for the closing fence — same bug class fixed in
    frontmatter.split_frontmatter, guarded against regressing here too."""
    d = tmp_path / "skills" / "quick-prd"
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text(
        "---\n"
        "name: quick-prd\n"
        "description: Use --- to separate sections when writing.\n"
        "---\n\n"
        "## Steps\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(chat_skills, "_skill_dirs", lambda: [tmp_path / "skills"])
    monkeypatch.setattr(chat_skills, "CHAT_ARTIFACT_SKILLS", ("quick-prd",))
    assert chat_skills.list_skills() == [
        {"name": "quick-prd", "description": "Use --- to separate sections when writing."}
    ]


def test_load_skill_rejects_unknown_and_missing(fake_skills):
    with pytest.raises(ValueError):
        chat_skills.load_skill("systematic-debugging")  # not whitelisted
    with pytest.raises(ValueError):
        chat_skills.load_skill("doc-style")  # whitelisted but no SKILL.md on disk


def test_system_prompt_injects_skill(fake_skills, tmp_data_dir):
    prompt = build_system_prompt(ChatContext(skill="quick-prd"))
    assert "ARTIFACT SKILL" in prompt
    assert "Write the PRD" in prompt


def test_skills_endpoint(fake_skills, client):
    resp = client.get("/api/chat/skills")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "quick-prd"
