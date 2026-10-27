"""Tests for the Intel Agents run engine (Track B).

Deterministic: no network (a fake LLM client is injected), no hardcoded "today"
(the expected date is computed from datetime.now()).
"""

import json
from datetime import datetime
from pathlib import Path

import pytest

# Import the module under test. Located next to this tests/ dir under the tool.
import sys

TOOL_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOL_DIR))

import run  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures: agent configs + canned valid/invalid payloads
# ---------------------------------------------------------------------------

LINKEDIN_AGENT = {
    "id": "shopping-marketplace-pulse",
    "name": "Shopping & Marketplace Pulse",
    "purpose": "linkedin",
    "voice": "me",
    "focus": "C2C commerce, secondhand marketplaces, AI-driven shopping, consumer behaviour",
    "keywords": ["Vinted", "resale", "secondhand marketplace", "C2C", "agentic shopping"],
    "sources_prefer": ["TechCrunch", "Reuters", "Business of Fashion"],
    "sources_avoid": ["low-quality-blog.example"],
    "searches_per_run": 6,
    "enabled": True,
    "created_at": "2026-07-01",
}

RESEARCH_AGENT = {
    "id": "agentic-shopping-research",
    "name": "Agentic Shopping Research",
    "purpose": "research",
    "voice": "research",
    "focus": "autonomous shopping agents and their impact on retail",
    "keywords": ["agentic shopping", "AI checkout", "autonomous agents"],
    "sources_prefer": ["Reuters"],
    "sources_avoid": [],
    "searches_per_run": 4,
    "enabled": True,
    "created_at": "2026-07-01",
}


def _valid_summary():
    return {
        "searched": "searched C2C + AI shopping news, last 7 days",
        "found": 12,
        "dropped": 5,
        "strongest_signal": "Vinted crossed X users.",
        "clusters_represented": ["C2C platforms", "AI & shopping"],
        "gaps": "no reliable GMV numbers",
        "confession": [{"dropped": "old headline", "reason": "too old"}],
    }


def _valid_linkedin_payload():
    posts = []
    for n, tmpl in enumerate(["A", "B", "C", "D"], start=1):
        posts.append(
            {
                "n": n,
                "template": tmpl,
                "template_name": f"Template {tmpl}",
                "cluster": "C2C platforms",
                "source_outlet": "TechCrunch",
                "source_date": "2d ago",
                "source_url": "https://techcrunch.com/x",
                "url_verified": True,
                "text": "word " * 100,
                "scoring": {
                    "confidence": "High",
                    "post_worthiness": "Strong",
                    "freshness": "Breaking",
                },
            }
        )
    return {
        "generated_at": "2026-07-01",
        "purpose": "linkedin",
        "summary": _valid_summary(),
        "posts": posts,
    }


def _valid_research_payload():
    return {
        "generated_at": "2026-07-01",
        "purpose": "research",
        "summary": _valid_summary(),
        "article": {
            "title": "The rise of agentic shopping",
            "tldr": "Agents are starting to check out on behalf of shoppers.",
            "sections": [
                {"heading": "Overview", "body": "Some prose."},
                {"heading": "Impact", "body": "More prose."},
            ],
            "sources": [
                {
                    "outlet": "Reuters",
                    "date": "1d ago",
                    "url": "https://reuters.com/x",
                    "url_verified": True,
                }
            ],
        },
    }


# ---------------------------------------------------------------------------
# (a) Prompt composition
# ---------------------------------------------------------------------------


def test_compose_prompt_linkedin_includes_topic_and_voice_and_rules():
    prompt = run.compose_prompt(LINKEDIN_AGENT)

    # topic: focus + keywords
    assert LINKEDIN_AGENT["focus"] in prompt
    for kw in LINKEDIN_AGENT["keywords"]:
        assert kw in prompt

    # source preferences / budget from the topic
    assert "TechCrunch" in prompt
    assert "low-quality-blog.example" in prompt
    assert "6" in prompt  # searches_per_run

    # "me" voice falls back to the research block when no voice_text is configured
    assert "Research analyst" in prompt

    # linkedin-specific house-style rules
    assert "A" in prompt and "B" in prompt and "C" in prompt and "D" in prompt
    assert "exactly 4" in prompt.lower()
    assert "80" in prompt and "180" in prompt  # word-count rule


def test_compose_prompt_research_includes_article_structure_and_voice():
    prompt = run.compose_prompt(RESEARCH_AGENT)

    assert RESEARCH_AGENT["focus"] in prompt
    for kw in RESEARCH_AGENT["keywords"]:
        assert kw in prompt

    # research voice + article structure rules
    assert "research" in prompt.lower()
    assert "tldr" in prompt.lower()
    assert "sections" in prompt.lower()
    assert "sources" in prompt.lower()


def test_compose_prompt_executive_voice_selected():
    agent = dict(LINKEDIN_AGENT, voice="executive")
    prompt = run.compose_prompt(agent)
    assert "Executive" in prompt or "executive" in prompt


def test_voice_me_uses_config_text():
    block = run.voice_block_for({"voice": "me"}, {"voice_text": "Write like a tired optimist"})
    assert block.startswith("VOICE — me:")
    assert "Write like a tired optimist" in block


def test_voice_me_without_text_falls_back_to_research():
    assert run.voice_block_for({"voice": "me"}, {}) == run.voice_block_for(
        {"voice": "research"}, {}
    )
    assert (
        run.voice_block_for({"voice": "me"}, {"voice_text": "  "}) == run.VOICE_BLOCKS["research"]
    )


def test_no_personal_preset_remains():
    assert set(run.VOICE_BLOCKS) == {"executive", "research"}


def test_compose_prompt_passes_config_voice_text():
    prompt = run.compose_prompt(LINKEDIN_AGENT, config={"voice_text": "Dry wit, short sentences."})
    assert "Dry wit, short sentences." in prompt


def test_run_agent_reads_voice_text_from_config_file(tmp_path):
    cfg = tmp_path / "intel-agents.json"
    cfg.write_text(
        json.dumps({"voice_text": "Plain and direct.", "agents": [LINKEDIN_AGENT]}),
        encoding="utf-8",
    )
    seen = {}

    def fake_call(prompt, searches):
        seen["prompt"] = prompt
        return _valid_linkedin_payload()

    run.run_agent(
        LINKEDIN_AGENT["id"], config_path=cfg, instances_root=tmp_path / "out", call=fake_call
    )
    assert "Plain and direct." in seen["prompt"]


# ---------------------------------------------------------------------------
# (b) Schema validation — accepts valid, rejects malformed
# ---------------------------------------------------------------------------


def test_validate_accepts_valid_linkedin_payload():
    # Should not raise
    run.validate_payload(_valid_linkedin_payload(), purpose="linkedin")


def test_validate_accepts_valid_research_payload():
    run.validate_payload(_valid_research_payload(), purpose="research")


def test_validate_rejects_linkedin_with_wrong_post_count():
    payload = _valid_linkedin_payload()
    payload["posts"] = payload["posts"][:3]  # only 3 posts
    with pytest.raises(run.ValidationError):
        run.validate_payload(payload, purpose="linkedin")


def test_validate_rejects_linkedin_with_wrong_templates():
    payload = _valid_linkedin_payload()
    payload["posts"][3]["template"] = "A"  # A,B,C,A -> missing D, duplicate A
    with pytest.raises(run.ValidationError):
        run.validate_payload(payload, purpose="linkedin")


def test_validate_rejects_linkedin_missing_required_post_field():
    payload = _valid_linkedin_payload()
    del payload["posts"][0]["text"]
    with pytest.raises(run.ValidationError):
        run.validate_payload(payload, purpose="linkedin")


def test_validate_rejects_research_missing_article():
    payload = _valid_research_payload()
    del payload["article"]
    with pytest.raises(run.ValidationError):
        run.validate_payload(payload, purpose="research")


def test_validate_rejects_research_article_missing_sections():
    payload = _valid_research_payload()
    del payload["article"]["sections"]
    with pytest.raises(run.ValidationError):
        run.validate_payload(payload, purpose="research")


def test_validate_rejects_missing_summary():
    payload = _valid_linkedin_payload()
    del payload["summary"]
    with pytest.raises(run.ValidationError):
        run.validate_payload(payload, purpose="linkedin")


# ---------------------------------------------------------------------------
# (c) End-to-end run with a FAKE injected LLM client
# ---------------------------------------------------------------------------


def _write_config(tmp_path: Path, agents: list) -> Path:
    cfg = tmp_path / "intel-agents.json"
    cfg.write_text(json.dumps({"agents": agents}))
    return cfg


def test_run_agent_writes_linkedin_instance(tmp_path, monkeypatch):
    cfg = _write_config(tmp_path, [LINKEDIN_AGENT])
    out_dir = tmp_path / "intel-agents"

    captured = {}

    def fake_call(prompt, searches):
        captured["prompt"] = prompt
        captured["searches"] = searches
        return _valid_linkedin_payload()

    monkeypatch.setattr(run, "call_model", fake_call)

    out_path = run.run_agent(
        LINKEDIN_AGENT["id"],
        config_path=cfg,
        instances_root=out_dir,
        call=fake_call,
    )

    today = datetime.now().strftime("%Y-%m-%d")
    expected = out_dir / LINKEDIN_AGENT["id"] / f"{LINKEDIN_AGENT['id']}-{today}.json"
    assert out_path == expected
    assert expected.exists()

    data = json.loads(expected.read_text())
    assert data["purpose"] == "linkedin"
    assert data["generated_at"] == today
    assert len(data["posts"]) == 4

    # searches budget passed through
    assert captured["searches"] == LINKEDIN_AGENT["searches_per_run"]
    # prompt carried the focus
    assert LINKEDIN_AGENT["focus"] in captured["prompt"]


def test_run_agent_writes_research_instance(tmp_path, monkeypatch):
    cfg = _write_config(tmp_path, [RESEARCH_AGENT])
    out_dir = tmp_path / "intel-agents"

    def fake_call(prompt, searches):
        return _valid_research_payload()

    out_path = run.run_agent(
        RESEARCH_AGENT["id"],
        config_path=cfg,
        instances_root=out_dir,
        call=fake_call,
    )

    today = datetime.now().strftime("%Y-%m-%d")
    expected = out_dir / RESEARCH_AGENT["id"] / f"{RESEARCH_AGENT['id']}-{today}.json"
    assert out_path == expected
    data = json.loads(expected.read_text())
    assert data["purpose"] == "research"
    assert data["generated_at"] == today
    assert "article" in data


def test_run_agent_stamps_generated_at_from_now(tmp_path):
    cfg = _write_config(tmp_path, [LINKEDIN_AGENT])
    out_dir = tmp_path / "intel-agents"

    def fake_call(prompt, searches):
        # Return payload with a stale generated_at; run engine must overwrite it.
        payload = _valid_linkedin_payload()
        payload["generated_at"] = "1999-01-01"
        return payload

    out_path = run.run_agent(
        LINKEDIN_AGENT["id"], config_path=cfg, instances_root=out_dir, call=fake_call
    )
    today = datetime.now().strftime("%Y-%m-%d")
    data = json.loads(out_path.read_text())
    assert data["generated_at"] == today


def test_run_agent_rejects_invalid_payload(tmp_path):
    cfg = _write_config(tmp_path, [LINKEDIN_AGENT])
    out_dir = tmp_path / "intel-agents"

    def bad_call(prompt, searches):
        payload = _valid_linkedin_payload()
        payload["posts"] = payload["posts"][:3]
        return payload

    with pytest.raises(run.ValidationError):
        run.run_agent(LINKEDIN_AGENT["id"], config_path=cfg, instances_root=out_dir, call=bad_call)
    # nothing written
    assert not (out_dir / LINKEDIN_AGENT["id"]).exists() or not list(
        (out_dir / LINKEDIN_AGENT["id"]).glob("*.json")
    )


def test_run_agent_unknown_id_raises(tmp_path):
    cfg = _write_config(tmp_path, [LINKEDIN_AGENT])
    with pytest.raises(run.AgentNotFound):
        run.run_agent(
            "does-not-exist",
            config_path=cfg,
            instances_root=tmp_path / "intel-agents",
            call=lambda p, s: _valid_linkedin_payload(),
        )


def test_load_agent_reads_config(tmp_path):
    cfg = _write_config(tmp_path, [LINKEDIN_AGENT, RESEARCH_AGENT])
    agent = run.load_agent(RESEARCH_AGENT["id"], config_path=cfg)
    assert agent["id"] == RESEARCH_AGENT["id"]
    assert agent["purpose"] == "research"
