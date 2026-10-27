"""Whitelisted artifact skills for the floating chat.

A "skill" here is a SKILL.md whose body is injected into the system prompt as
writing instructions — nothing is executed.
"""

from pathlib import Path

from ..config import CHAT_ARTIFACT_SKILLS, CLAUDE_SKILLS_DIR, REPO_ROOT
from .frontmatter import split_frontmatter


def _skill_dirs() -> list[Path]:
    return [
        Path(REPO_ROOT) / "skills",
        Path(REPO_ROOT) / ".claude" / "skills",
        Path(CLAUDE_SKILLS_DIR),
    ]


def _find_skill_md(name: str) -> Path | None:
    for d in _skill_dirs():
        p = d / name / "SKILL.md"
        if p.is_file():
            return p
    return None


def list_skills() -> list[dict]:
    out = []
    for name in CHAT_ARTIFACT_SKILLS:
        p = _find_skill_md(name)
        if not p:
            continue
        meta, _ = split_frontmatter(p.read_text(encoding="utf-8"))
        out.append({"name": name, "description": meta.get("description", "")})
    return out


def load_skill(name: str) -> str:
    if name not in CHAT_ARTIFACT_SKILLS:
        raise ValueError(f"unknown artifact skill: {name}")
    p = _find_skill_md(name)
    if not p:
        raise ValueError(f"skill '{name}' has no SKILL.md on disk")
    _, body = split_frontmatter(p.read_text(encoding="utf-8"))
    return body
