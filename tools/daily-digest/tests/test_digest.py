"""Tests for tools/daily-digest/digest.py."""

import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
import digest


def _recent_upload_date() -> str:
    """yt-dlp upload_date (YYYYMMDD) for 'now' — keeps in-window fixtures from
    rotting as real time passes the lookback window."""
    return datetime.now(timezone.utc).strftime("%Y%m%d")


# ─── Shared fixtures ──────────────────────────────────────────────────────────

SAMPLE_TRENDING_HTML = """
<html><body>
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/anthropics/claude-code-skills">anthropics / claude-code-skills</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 pr-4">Community skills and tools for Claude Code agents</p>
  <div class="f6 color-fg-muted mt-2">
    <span class="d-inline-block float-sm-right">450 stars today</span>
  </div>
</article>
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/pallets/flask">pallets / flask</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 pr-4">The Python micro framework for web apps</p>
  <div class="f6 color-fg-muted mt-2">
    <span class="d-inline-block float-sm-right">10 stars today</span>
  </div>
</article>
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/openai/openai-agents">openai / openai-agents</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 pr-4">Framework for building multi-agent LLM workflows</p>
  <div class="f6 color-fg-muted mt-2">
    <span class="d-inline-block float-sm-right">1.2k stars today</span>
  </div>
</article>
</body></html>
"""

SAMPLE_HN_RESPONSE = {
    "hits": [
        {
            "objectID": "111",
            "title": "Anthropic releases Claude Code 2.0",
            "url": "https://example.com/claude-code-2",
            "points": 500,
        },
        {
            "objectID": "222",
            "title": "OpenAI launches GPT-5",
            "url": "https://example.com/gpt5",
            "points": 300,
        },
    ]
}

SAMPLE_GH_SEARCH_RESPONSE = {
    "items": [
        {
            "id": 1001,
            "full_name": "community/claude-code-skills",
            "owner": {"login": "community"},
            "description": "Community skills for Claude Code",
            "html_url": "https://github.com/community/claude-code-skills",
            "stargazers_count": 5_000,
        },
        {
            "id": 1002,
            "full_name": "anotheruser/claude-extension",
            "owner": {"login": "anotheruser"},
            "description": "Extension for Claude Code",
            "html_url": "https://github.com/anotheruser/claude-extension",
            "stargazers_count": 2_000,
        },
        {
            "id": 1003,
            "full_name": "anthropics/official-repo",
            "owner": {"login": "anthropics"},
            "description": "Official Anthropic repo — should be excluded",
            "html_url": "https://github.com/anthropics/official-repo",
            "stargazers_count": 50_000,
        },
        {
            "id": 1004,
            "full_name": "small/repo",
            "owner": {"login": "small"},
            "description": "Tiny project",
            "html_url": "https://github.com/small/repo",
            "stargazers_count": 100,  # below threshold
        },
    ]
}

SAMPLE_AAKASHG_HTML = """
<html><body>
<div class="post-preview">
  <h2><a href="/agents-in-2026">How PMs are using agents in 2026</a></h2>
  <p>A deep dive into real workflows from product teams at top companies.</p>
</div>
<div class="post-preview">
  <h2><a href="/claude-code-workflows">Claude Code workflows for product managers</a></h2>
  <p>Practical patterns for non-engineers using Claude Code daily.</p>
</div>
</body></html>
"""


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_fake_client(content: str) -> MagicMock:
    """Build a fake Anthropic client that returns the given content for every call."""
    text_block = MagicMock()
    text_block.text = content

    response = MagicMock()
    response.content = [text_block]

    client = MagicMock()
    client.messages.create.return_value = response
    return client


def _make_sectioned_client(contents: list[str] | None = None) -> MagicMock:
    """Fake Anthropic client that returns a distinct body per successive call.

    `generate_digest` now makes one LLM call per output section. Each call
    returns the next item from `contents` (defaulting to a placeholder that
    contains the section text so assembly can be inspected).
    """
    if contents is None:
        contents = [f"section-{i} body" for i in range(1, 5)]

    responses = []
    for body in contents:
        text_block = MagicMock()
        text_block.text = body
        response = MagicMock()
        response.content = [text_block]
        responses.append(response)

    client = MagicMock()
    client.messages.create.side_effect = responses
    return client


def _ydl_context_manager(entries: list) -> MagicMock:
    """Return a mock that simulates yt_dlp.YoutubeDL context manager."""
    mock_ydl = MagicMock()
    mock_ydl.extract_info.return_value = {"entries": entries}
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=mock_ydl)
    cm.__exit__ = MagicMock(return_value=False)
    return cm


# ─── fetch_hn_stories ─────────────────────────────────────────────────────────


def test_fetch_hn_stories_returns_stories():
    mock_resp = MagicMock()
    mock_resp.json.return_value = SAMPLE_HN_RESPONSE
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        stories = digest.fetch_hn_stories(queries=["Claude Code"])

    assert len(stories) == 2
    assert stories[0]["title"] == "Anthropic releases Claude Code 2.0"
    assert stories[0]["url"] == "https://example.com/claude-code-2"
    assert stories[0]["points"] == 500
    assert stories[0]["source"] == "HackerNews"


def test_fetch_hn_stories_deduplicates_across_queries():
    mock_resp = MagicMock()
    mock_resp.json.return_value = SAMPLE_HN_RESPONSE
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        stories = digest.fetch_hn_stories(queries=["Claude Code", "Gemini AI"])

    ids = [s["url"] for s in stories]
    assert len(ids) == len(set(ids))


def test_fetch_hn_stories_fallback_url_when_no_url():
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "hits": [{"objectID": "999", "title": "Ask HN: thing", "url": None, "points": 10}]
    }
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        stories = digest.fetch_hn_stories(queries=["test"])

    assert "news.ycombinator.com/item?id=999" in stories[0]["url"]


def test_fetch_hn_stories_handles_request_error(capsys):
    with patch("digest.requests.get", side_effect=Exception("timeout")):
        stories = digest.fetch_hn_stories(queries=["Claude Code"])

    assert stories == []
    captured = capsys.readouterr()
    assert "[digest] Warning" in captured.out


# ─── fetch_github_trending_html ───────────────────────────────────────────────


def test_fetch_github_trending_html_returns_text():
    mock_resp = MagicMock()
    mock_resp.text = "<html>trending</html>"
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        html = digest.fetch_github_trending_html()

    assert html == "<html>trending</html>"


# ─── parse_github_trending ────────────────────────────────────────────────────


def test_parse_github_trending_count():
    repos = digest.parse_github_trending(SAMPLE_TRENDING_HTML)
    assert len(repos) == 3


def test_parse_github_trending_fields():
    repos = digest.parse_github_trending(SAMPLE_TRENDING_HTML)
    first = repos[0]
    assert first["name"] == "anthropics/claude-code-skills"
    assert "Claude Code" in first["description"]
    assert first["url"] == "https://github.com/anthropics/claude-code-skills"
    assert first["stars_today"] == 450


def test_parse_github_trending_stars_k_suffix():
    repos = digest.parse_github_trending(SAMPLE_TRENDING_HTML)
    openai_repo = next(r for r in repos if "openai-agents" in r["name"])
    assert openai_repo["stars_today"] == 1200


def test_parse_github_trending_empty_html():
    repos = digest.parse_github_trending("<html><body></body></html>")
    assert repos == []


def test_parse_github_trending_missing_description():
    html = """
    <html><body>
    <article class="Box-row">
      <h2><a href="/foo/bar">foo / bar</a></h2>
    </article>
    </body></html>
    """
    repos = digest.parse_github_trending(html)
    assert len(repos) == 1
    assert repos[0]["description"] == ""


# ─── fetch_github_must_haves ──────────────────────────────────────────────────


def test_fetch_github_must_haves_returns_repos():
    mock_resp = MagicMock()
    mock_resp.json.return_value = SAMPLE_GH_SEARCH_RESPONSE
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        repos = digest.fetch_github_must_haves(queries=["claude-code skill"], min_stars=1_000)

    # anthropics/official-repo is excluded; small/repo is below threshold → 2 remain
    assert len(repos) == 2
    assert repos[0]["name"] == "community/claude-code-skills"
    assert repos[0]["stars"] == 5_000
    assert repos[0]["url"] == "https://github.com/community/claude-code-skills"


def test_fetch_github_must_haves_filters_by_min_stars():
    mock_resp = MagicMock()
    mock_resp.json.return_value = SAMPLE_GH_SEARCH_RESPONSE
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        repos = digest.fetch_github_must_haves(queries=["claude-code skill"], min_stars=1_000)

    names = [r["name"] for r in repos]
    assert "small/repo" not in names


def test_fetch_github_must_haves_excludes_anthropic_owners():
    mock_resp = MagicMock()
    mock_resp.json.return_value = SAMPLE_GH_SEARCH_RESPONSE
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        repos = digest.fetch_github_must_haves(queries=["claude-code skill"], min_stars=1)

    names = [r["name"] for r in repos]
    assert "anthropics/official-repo" not in names


def test_fetch_github_must_haves_deduplicates_by_id():
    """Same repo returned by two queries (same numeric ID) should appear only once."""
    same_repo = {
        "id": 9999,
        "full_name": "user/claude-skill",
        "owner": {"login": "user"},
        "description": "A Claude skill",
        "html_url": "https://github.com/user/claude-skill",
        "stargazers_count": 2_000,
    }
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"items": [same_repo]}
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        repos = digest.fetch_github_must_haves(
            queries=["claude-code skill", "claude code extension"], min_stars=1_000
        )

    assert len(repos) == 1


def test_fetch_github_must_haves_sorted_by_stars():
    mock_resp = MagicMock()
    mock_resp.json.return_value = SAMPLE_GH_SEARCH_RESPONSE
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        repos = digest.fetch_github_must_haves(queries=["claude-code skill"], min_stars=1)

    star_counts = [r["stars"] for r in repos]
    assert star_counts == sorted(star_counts, reverse=True)


def test_fetch_github_must_haves_respects_max_results():
    mock_resp = MagicMock()
    mock_resp.json.return_value = SAMPLE_GH_SEARCH_RESPONSE
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        repos = digest.fetch_github_must_haves(
            queries=["claude-code skill"], min_stars=1, max_results=1
        )

    assert len(repos) == 1


def test_fetch_github_must_haves_handles_request_error(capsys):
    with patch("digest.requests.get", side_effect=Exception("rate limited")):
        repos = digest.fetch_github_must_haves(queries=["claude-code skill"])

    assert repos == []
    captured = capsys.readouterr()
    assert "[digest] Warning" in captured.out


# ─── fetch_youtube_videos ─────────────────────────────────────────────────────


def test_fetch_youtube_videos_returns_recent_videos():
    entries = [
        {
            "id": "vid1",
            "title": "How PMs use Claude Code",
            "upload_date": _recent_upload_date(),
            "url": None,
        },
    ]
    cm = _ydl_context_manager(entries)

    with patch("digest.yt_dlp.YoutubeDL", return_value=cm):
        videos = digest.fetch_youtube_videos(lookback_hours=48)

    assert len(videos) == 1
    assert videos[0]["title"] == "How PMs use Claude Code"
    assert "youtube.com/watch?v=vid1" in videos[0]["url"]
    assert videos[0]["source"] == "YouTube/@growproduct"


def test_fetch_youtube_videos_excludes_old_videos():
    entries = [
        {"id": "old", "title": "Old video", "upload_date": "20200101", "url": None},
    ]
    cm = _ydl_context_manager(entries)

    with patch("digest.yt_dlp.YoutubeDL", return_value=cm):
        videos = digest.fetch_youtube_videos(lookback_hours=24)

    assert videos == []


def test_fetch_youtube_videos_skips_entries_without_date():
    entries = [
        {"id": "vid2", "title": "No date video"},  # no upload_date key
    ]
    cm = _ydl_context_manager(entries)

    with patch("digest.yt_dlp.YoutubeDL", return_value=cm):
        videos = digest.fetch_youtube_videos(lookback_hours=48)

    assert videos == []


def test_fetch_youtube_videos_result_fields():
    entries = [
        {"id": "vid3", "title": "Agent demo", "upload_date": _recent_upload_date(), "url": None},
    ]
    cm = _ydl_context_manager(entries)

    with patch("digest.yt_dlp.YoutubeDL", return_value=cm):
        videos = digest.fetch_youtube_videos(lookback_hours=48)

    assert all(k in videos[0] for k in ("title", "url", "published_date", "source"))


def test_fetch_youtube_videos_handles_ydl_error(capsys):
    with patch("digest.yt_dlp.YoutubeDL", side_effect=Exception("network error")):
        videos = digest.fetch_youtube_videos()

    assert videos == []
    captured = capsys.readouterr()
    assert "[digest] Warning" in captured.out


# ─── fetch_aakashg_articles ───────────────────────────────────────────────────


def test_fetch_aakashg_articles_returns_articles():
    mock_resp = MagicMock()
    mock_resp.text = SAMPLE_AAKASHG_HTML
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        articles = digest.fetch_aakashg_articles()

    assert len(articles) >= 1
    assert any("agents" in a["title"].lower() or "PM" in a["title"] for a in articles)


def test_fetch_aakashg_articles_result_fields():
    mock_resp = MagicMock()
    mock_resp.text = SAMPLE_AAKASHG_HTML
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        articles = digest.fetch_aakashg_articles()

    for a in articles:
        assert "title" in a
        assert "url" in a
        assert "summary" in a
        assert "source" in a


def test_fetch_aakashg_articles_deduplicates():
    mock_resp = MagicMock()
    mock_resp.text = SAMPLE_AAKASHG_HTML
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        articles = digest.fetch_aakashg_articles()

    urls = [a["url"] for a in articles]
    assert len(urls) == len(set(urls))


def test_fetch_aakashg_articles_handles_request_error(capsys):
    with patch("digest.requests.get", side_effect=Exception("connection refused")):
        articles = digest.fetch_aakashg_articles()

    assert articles == []
    captured = capsys.readouterr()
    assert "[digest] Warning" in captured.out


def test_fetch_aakashg_articles_empty_page():
    mock_resp = MagicMock()
    mock_resp.text = "<html><body><p>Nothing here</p></body></html>"
    mock_resp.raise_for_status = MagicMock()

    with patch("digest.requests.get", return_value=mock_resp):
        articles = digest.fetch_aakashg_articles()

    assert articles == []


# ─── build_client ─────────────────────────────────────────────────────────────


def test_build_client_disables_sdk_retries():
    """SDK-level retries are disabled — they fire fast and drain the gateway's
    tiny per-team request pool. `_call_section` owns retry instead, waiting for
    the rate-limit window to reset between attempts."""
    with (
        patch("ozos_llm.anthropic.Anthropic") as mock_ctor,
        patch.dict("os.environ", {"ANTHROPIC_API_KEY": "k"}),
    ):
        digest.build_client()

    kwargs = mock_ctor.call_args.kwargs
    assert kwargs.get("max_retries") == 0


# ─── generate_digest (per-section generation) ─────────────────────────────────

# Max prompt size per LLM call. The gateway caps each request at ~4000 tokens
# (input + output). Keeping each prompt well under this many characters, plus a
# modest max_tokens, keeps every call safely under the cap.
MAX_PROMPT_CHARS = 14000


def _all_call_prompts(client: MagicMock) -> list[str]:
    """Extract the user prompt string from every messages.create call."""
    prompts = []
    for call in client.messages.create.call_args_list:
        messages = call.kwargs.get("messages") or (call.args[2] if len(call.args) > 2 else None)
        # messages is a list of {"role", "content"} dicts
        for msg in messages:
            prompts.append(msg["content"])
    return prompts


def test_generate_digest_makes_one_call_per_section():
    """Generation must split into exactly four LLM calls — one per output section."""
    client = _make_sectioned_client()
    hn = [
        {
            "title": "Claude Code news",
            "url": "https://example.com",
            "points": 100,
            "source": "HackerNews",
        }
    ]
    gh = [
        {
            "name": "foo/bar",
            "description": "agent tool",
            "url": "https://github.com/foo/bar",
            "stars_today": 50,
        }
    ]

    digest.generate_digest(hn, gh, [], [], [], client=client)

    assert client.messages.create.call_count == 4


def test_generate_digest_total_calls_stay_small():
    """Keep total LLM calls within the per-team requests window (<= 6)."""
    client = _make_sectioned_client()
    digest.generate_digest([], [], [], [], [], client=client)

    assert client.messages.create.call_count <= 6


def test_generate_digest_each_prompt_under_budget():
    """Every per-section prompt must stay under the char budget for the token cap.

    Use an oversized HN list (more than the pre-limit) so we exercise the
    bounding logic, not just a tiny fixture.
    """
    client = _make_sectioned_client()
    hn = [
        {
            "title": f"Story number {i} about Claude Code and AI agents " * 3,
            "url": f"https://example.com/story-{i}",
            "points": 100 - i,
            "source": "HackerNews",
        }
        for i in range(80)
    ]
    gh = [
        {
            "name": f"owner/repo-{i}",
            "description": "agent tooling " * 5,
            "url": f"https://github.com/owner/repo-{i}",
            "stars_today": 100,
        }
        for i in range(20)
    ]
    must_haves = [
        {
            "name": f"big/repo-{i}",
            "description": "popular tool " * 5,
            "url": f"https://github.com/big/repo-{i}",
            "stars": 50_000,
        }
        for i in range(10)
    ]

    digest.generate_digest(hn, gh, must_haves, [], [], client=client)

    for prompt in _all_call_prompts(client):
        assert len(prompt) < MAX_PROMPT_CHARS, f"prompt too large: {len(prompt)} chars"


def test_generate_digest_each_call_bounds_max_tokens():
    """max_tokens per call must be modest so input+output stays under the cap."""
    client = _make_sectioned_client()
    digest.generate_digest([], [], [], [], [], client=client)

    for call in client.messages.create.call_args_list:
        assert call.kwargs.get("max_tokens", 99999) <= 1000


def test_generate_digest_assembles_all_headings():
    """The assembled output must contain all four section headings in order."""
    contents = [
        "- [Item](https://example.com) — why it matters",
        "### Today's Trending\n- [r/t](url) `[Agent Frameworks]` — x\n### Must-Haves\n- [r/m](url) `[IDE & Dev Tools]` — y",
        "- [Video](url) — workflow",
        "- [News](url) — announcement",
    ]
    client = _make_sectioned_client(contents)

    # Provide one source per section so all four sections actually generate.
    hn = [{"title": "News", "url": "https://example.com", "points": 10, "source": "HackerNews"}]
    gh = [
        {
            "name": "o/t",
            "description": "trending",
            "url": "https://github.com/o/t",
            "stars_today": 5,
        }
    ]
    must_haves = [
        {"name": "o/m", "description": "must-have", "url": "https://github.com/o/m", "stars": 2_000}
    ]
    videos = [
        {
            "title": "Vid",
            "url": "https://youtube.com/watch?v=z",
            "published_date": "2026-01-01",
            "source": "YouTube/@growproduct",
        }
    ]
    result = digest.generate_digest(hn, gh, must_haves, videos, [], client=client)

    assert "## 1. Claude Code & AI Tool Updates" in result
    assert "## 2. Trending GitHub Skills & Repos" in result
    assert "## 3. Agent Workflows — PMs, Leaders & Businesses" in result
    assert "## 4. General AI News" in result
    # subsections come from the model body for section 2
    assert "### Today's Trending" in result
    assert "### Must-Haves" in result
    # Headings appear in order
    assert (
        result.index("## 1.")
        < result.index("## 2.")
        < result.index("## 3.")
        < result.index("## 4.")
    )


def test_generate_digest_returns_string():
    client = _make_sectioned_client()
    result = digest.generate_digest([], [], [], [], [], client=client)
    assert isinstance(result, str)
    assert len(result) > 0


def test_generate_digest_uses_correct_model_on_every_call():
    client = _make_sectioned_client()
    hn = [{"title": "News", "url": "https://example.com", "points": 10, "source": "HackerNews"}]
    gh = [
        {
            "name": "o/t",
            "description": "trending",
            "url": "https://github.com/o/t",
            "stars_today": 5,
        }
    ]
    must_haves = [
        {"name": "o/m", "description": "must-have", "url": "https://github.com/o/m", "stars": 2_000}
    ]
    videos = [
        {
            "title": "Vid",
            "url": "https://youtube.com/watch?v=z",
            "published_date": "2026-01-01",
            "source": "YouTube/@growproduct",
        }
    ]
    digest.generate_digest(hn, gh, must_haves, videos, [], client=client)

    assert client.messages.create.call_count == 4
    for call in client.messages.create.call_args_list:
        assert call.kwargs.get("model") == digest.ozos_llm.model()


def test_generate_digest_empty_section_says_nothing_significant():
    """A section whose relevant sources are all empty must yield the exact
    'Nothing significant today.' line rather than calling the model."""
    client = _make_sectioned_client()
    # No sources at all → every section is empty.
    result = digest.generate_digest([], [], [], [], [], client=client)

    assert "Nothing significant today." in result
    # With no inputs at all, no LLM call is needed for any section.
    assert client.messages.create.call_count == 0


def test_generate_digest_section1_prompt_includes_hn_and_trending():
    client = _make_sectioned_client()
    hn = [
        {"title": "My HN Story", "url": "https://example.com", "points": 42, "source": "HackerNews"}
    ]
    gh = [
        {
            "name": "acme/agent-kit",
            "description": "Agent tools",
            "url": "https://github.com/acme/agent-kit",
            "stars_today": 100,
        }
    ]

    digest.generate_digest(hn, gh, [], [], [], client=client)

    prompts = _all_call_prompts(client)
    assert any("My HN Story" in p for p in prompts)
    assert any("acme/agent-kit" in p for p in prompts)


def test_generate_digest_section2_prompt_includes_trending_and_must_haves():
    client = _make_sectioned_client()
    gh = [
        {
            "name": "acme/agent-kit",
            "description": "Agent tools",
            "url": "https://github.com/acme/agent-kit",
            "stars_today": 100,
        }
    ]
    must_haves = [
        {
            "name": "big/repo",
            "description": "Very popular",
            "url": "https://github.com/big/repo",
            "stars": 50_000,
        }
    ]

    digest.generate_digest([], gh, must_haves, [], [], client=client)

    prompts = _all_call_prompts(client)
    # Section 2 prompt must mention the category list (so tags can be assigned)
    assert any("big/repo" in p and "Today's Trending" in p for p in prompts)
    assert any("Must-Haves" in p for p in prompts)
    assert any(digest.REPO_CATEGORIES[0] in p for p in prompts)


def test_generate_digest_section3_prompt_includes_youtube_and_aakashg():
    client = _make_sectioned_client()
    videos = [
        {
            "title": "Agent workflow demo",
            "url": "https://youtube.com/watch?v=abc",
            "published_date": "2026-04-04",
            "source": "YouTube/@growproduct",
        }
    ]
    articles = [
        {
            "title": "PMs using Claude",
            "url": "https://news.aakashg.com/pm-claude",
            "summary": "Real workflows.",
            "source": "news.aakashg.com",
        }
    ]

    digest.generate_digest([], [], [], videos, articles, client=client)

    prompts = _all_call_prompts(client)
    assert any("Agent workflow demo" in p for p in prompts)
    assert any("PMs using Claude" in p for p in prompts)


def test_generate_digest_prelimits_large_hn_list():
    """A large HN list must be bounded before being sent in any prompt."""
    client = _make_sectioned_client()
    hn = [
        {
            "title": f"Story {i}",
            "url": f"https://example.com/{i}",
            "points": i,
            "source": "HackerNews",
        }
        for i in range(80)
    ]

    digest.generate_digest(hn, [], [], [], [], client=client)

    # The lowest-points stories should be dropped (top-N by points kept).
    prompts = "\n".join(_all_call_prompts(client))
    assert "Story 79" in prompts  # highest points kept
    assert "Story 0" not in prompts  # lowest points dropped


# ─── save_digest ──────────────────────────────────────────────────────────────


def test_save_digest_creates_file(tmp_path):
    content = "## 1. Claude Code & AI Tool Updates\nNothing significant today."
    path = digest.save_digest(content, output_dir=tmp_path)

    assert path.exists()
    assert path.read_text(encoding="utf-8") == content


def test_save_digest_filename_format(tmp_path):
    import re

    path = digest.save_digest("content", output_dir=tmp_path)
    assert re.match(r"digest-\d{4}-\d{2}-\d{2}\.md", path.name)


def test_save_digest_creates_directory(tmp_path):
    nested = tmp_path / "deep" / "nested"
    path = digest.save_digest("content", output_dir=nested)
    assert nested.exists()
    assert path.exists()


def test_save_digest_returns_path(tmp_path):
    path = digest.save_digest("content", output_dir=tmp_path)
    assert isinstance(path, Path)
    assert path.suffix == ".md"


# ─── Rate-limit resilience ──────────────────────────────────────────────────


def _rate_limit_error(message: str = "429: Rate limit exceeded") -> "object":
    """Construct a real anthropic.RateLimitError for use as a side_effect."""
    import anthropic
    import httpx

    req = httpx.Request("POST", "https://gateway/v1/messages")
    resp = httpx.Response(429, request=req)
    return anthropic.RateLimitError(message, response=resp, body=None)


def test_seconds_until_reset_parses_reset_timestamp():
    """The wait is read from the 'resets at: ... UTC' clause in the 429 message."""
    future = datetime.now(timezone.utc).replace(microsecond=0)
    # 40s in the future
    from datetime import timedelta

    future = future + timedelta(seconds=40)
    msg = f"429: Rate limit exceeded. Limit resets at: {future.strftime('%Y-%m-%d %H:%M:%S')} UTC"
    secs = digest._seconds_until_reset(_rate_limit_error(msg))
    assert 30 <= secs <= 90  # ~40s + small buffer, capped


def test_seconds_until_reset_defaults_when_unparseable():
    """With no parseable reset clause, fall back to a ~minute wait."""
    secs = digest._seconds_until_reset(_rate_limit_error("429: too many requests"))
    assert 30 <= secs <= 90


def test_call_section_retries_after_rate_limit_then_succeeds(monkeypatch):
    """A 429 is retried after waiting for the window reset, then succeeds."""
    import time

    success = MagicMock()
    block = MagicMock()
    block.text = "section body"
    success.content = [block]

    client = MagicMock()
    client.messages.create.side_effect = [_rate_limit_error(), success]

    sleeps: list[float] = []
    monkeypatch.setattr(time, "sleep", lambda s: sleeps.append(s))

    result = digest._call_section(client, "prompt")

    assert result == "section body"
    assert client.messages.create.call_count == 2
    assert len(sleeps) == 1  # waited once before the retry


def test_call_section_raises_after_exhausting_attempts(monkeypatch):
    """If every attempt is rate limited, the error propagates (no infinite loop)."""
    import anthropic
    import time

    client = MagicMock()
    client.messages.create.side_effect = _rate_limit_error()

    monkeypatch.setattr(time, "sleep", lambda s: None)

    with pytest.raises(anthropic.RateLimitError):
        digest._call_section(client, "prompt")
    assert client.messages.create.call_count == digest.SECTION_MAX_ATTEMPTS


def test_call_section_no_wait_on_success(monkeypatch):
    """A first-try success makes no LLM retry and no sleep."""
    import time

    success = MagicMock()
    block = MagicMock()
    block.text = "body"
    success.content = [block]
    client = MagicMock()
    client.messages.create.return_value = success

    sleeps: list[float] = []
    monkeypatch.setattr(time, "sleep", lambda s: sleeps.append(s))

    assert digest._call_section(client, "prompt") == "body"
    assert client.messages.create.call_count == 1
    assert sleeps == []


# ─── Run-log integration ────────────────────────────────────────────────────

import sys as _sys  # noqa: E402
from pathlib import Path as _Path  # noqa: E402

_sys.path.insert(0, str(_Path(__file__).parents[3] / "skills"))
import run_log as _run_log  # noqa: E402
from run_log import read_last_run as _read_last_run  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_digest_runs_dir(tmp_path, monkeypatch):
    """Keep tests hermetic: never write run-logs to the real .ozos/runs."""
    monkeypatch.setattr(digest, "RUNS_DIR", tmp_path / "_runs_default")


def test_save_digest_writes_run_log(tmp_path):
    """Saving a digest records a run with the section headings as items."""
    content = "## 1. Claude Code\n\nbody\n\n## 2. Trending\n\nbody\n"
    runs = tmp_path / "runs"
    digest.save_digest(content, output_dir=tmp_path / "out", runs_dir=runs)

    rec = _read_last_run(runs, "daily-digest")
    assert rec is not None
    assert rec["count"] == 2
    assert any("Claude Code" in item for item in rec["items"])


def test_save_digest_survives_run_log_failure(tmp_path, monkeypatch):
    """A run-log failure must not stop the digest from being saved."""

    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(_run_log, "record_run", boom)
    path = digest.save_digest("## 1. X\n", output_dir=tmp_path / "out", runs_dir=tmp_path / "runs")
    assert path.exists()
