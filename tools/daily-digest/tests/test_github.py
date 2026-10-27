"""Tests for tools/daily-digest/github.py."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
import github as gh

# ---------------------------------------------------------------------------
# Fixture HTML
# ---------------------------------------------------------------------------

SAMPLE_HTML = """
<html><body>
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/openai/gpt-engineer">openai / gpt-engineer</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 pr-4">Build entire codebases with an AI agent</p>
  <div class="f6 color-fg-muted mt-2">
    <a href="/openai/gpt-engineer/stargazers">52,400</a>
    <span class="d-inline-block float-sm-right">312 stars today</span>
  </div>
  <a class="topic-tag topic-tag-link" href="/topics/ai">ai</a>
  <a class="topic-tag topic-tag-link" href="/topics/agents">agents</a>
</article>
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/pallets/flask">pallets / flask</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 pr-4">The Python micro framework for web apps</p>
  <div class="f6 color-fg-muted mt-2">
    <a href="/pallets/flask/stargazers">66,000</a>
    <span class="d-inline-block float-sm-right">10 stars today</span>
  </div>
</article>
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/langchain-ai/langchain">langchain-ai / langchain</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 pr-4">Building LLM applications</p>
  <div class="f6 color-fg-muted mt-2">
    <a href="/langchain-ai/langchain/stargazers">85,000</a>
    <span class="d-inline-block float-sm-right">500 stars today</span>
  </div>
</article>
</body></html>
"""


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def test_parse_star_count_plain():
    assert gh._parse_star_count("1,234") == 1234


def test_parse_star_count_k():
    assert gh._parse_star_count("12.3k") == 12300


def test_parse_star_count_empty():
    assert gh._parse_star_count("") == 0


def test_parse_trending_repos_count():
    repos = gh.parse_trending_repos(SAMPLE_HTML)
    assert len(repos) == 3


def test_parse_trending_repos_fields():
    repos = gh.parse_trending_repos(SAMPLE_HTML)
    gpt = repos[0]
    assert gpt["name"] == "openai/gpt-engineer"
    assert "codebases" in gpt["description"]
    assert gpt["url"] == "https://github.com/openai/gpt-engineer"
    assert gpt["stars_today"] == 312
    assert gpt["stars_total"] == 52400


def test_parse_trending_repos_topics():
    repos = gh.parse_trending_repos(SAMPLE_HTML)
    assert "ai" in repos[0]["topics"]
    assert "agents" in repos[0]["topics"]


def test_matches_filters_by_topic():
    repo = {
        "name": "foo/bar",
        "description": "a thing",
        "topics": ["ai"],
    }
    assert gh._matches_filters(repo, ["ai", "llm"])


def test_matches_filters_by_description():
    repo = {
        "name": "foo/bar",
        "description": "This is an LLM-powered tool",
        "topics": [],
    }
    assert gh._matches_filters(repo, ["llm"])


def test_matches_filters_no_match():
    repo = {
        "name": "pallets/flask",
        "description": "web framework",
        "topics": [],
    }
    assert not gh._matches_filters(repo, ["ai", "llm", "agents"])


def test_get_trending_filters_and_splits():
    """get_trending should split repos into two sorted categories."""
    with (
        patch("github.fetch_trending_html", return_value=SAMPLE_HTML),
        patch(
            "github.load_config",
            return_value={
                "github": {
                    "filters": ["ai", "llm", "agents"],
                    "trending_count": 5,
                    "popular_count": 10,
                }
            },
        ),
    ):
        result = gh.get_trending()

    assert "top_trending" in result
    assert "most_popular" in result
    # flask has no AI topics/description, should be filtered out
    names = [r["name"] for r in result["top_trending"]]
    assert "pallets/flask" not in names
    # langchain has more stars today (500 vs 312) → should be first
    assert result["top_trending"][0]["name"] == "langchain-ai/langchain"


def test_get_trending_respects_count():
    with (
        patch("github.fetch_trending_html", return_value=SAMPLE_HTML),
        patch(
            "github.load_config",
            return_value={
                "github": {
                    "filters": ["ai", "llm", "agents"],
                    "trending_count": 1,
                    "popular_count": 1,
                }
            },
        ),
    ):
        result = gh.get_trending()

    assert len(result["top_trending"]) <= 1
    assert len(result["most_popular"]) <= 1


def test_get_trending_no_topics_field_in_output():
    """Output dicts must not contain internal 'topics' field."""
    with (
        patch("github.fetch_trending_html", return_value=SAMPLE_HTML),
        patch(
            "github.load_config",
            return_value={
                "github": {
                    "filters": ["ai", "llm", "agents"],
                    "trending_count": 5,
                    "popular_count": 5,
                }
            },
        ),
    ):
        result = gh.get_trending()

    for repo in result["top_trending"] + result["most_popular"]:
        assert "topics" not in repo


def test_load_config_reads_file():
    """load_config should read github section from config.yml."""
    cfg = gh.load_config()
    assert "github" in cfg
    assert "filters" in cfg["github"]
    assert "trending_count" in cfg["github"]
    assert "popular_count" in cfg["github"]
