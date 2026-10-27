"""Tests for tools/daily-digest/news.py."""

import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
import news as news_mod


# ---------------------------------------------------------------------------
# Helpers to build fake feedparser entries
# ---------------------------------------------------------------------------


def _make_entry(title: str, summary: str, url: str, hours_ago: float) -> SimpleNamespace:
    """Return a fake feedparser entry published `hours_ago` hours in the past."""
    dt = datetime.now(tz=timezone.utc)
    # published_parsed is a time.struct_time in local time (feedparser behaviour)
    from datetime import timedelta

    published = dt - timedelta(hours=hours_ago)
    # Convert to struct_time via timestamp (mimics feedparser)
    struct = time.gmtime(published.timestamp())
    entry = SimpleNamespace(
        title=title,
        summary=summary,
        link=url,
        published_parsed=struct,
    )
    return entry


def _make_feed(entries: list) -> SimpleNamespace:
    """Return a fake feedparser FeedParserDict with the given entries."""
    return SimpleNamespace(entries=entries)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_is_ai_relevant_matches_keyword():
    assert news_mod._is_ai_relevant("OpenAI releases new model", "")
    assert news_mod._is_ai_relevant("", "This chatbot is built on an LLM")


def test_is_ai_relevant_no_match():
    assert not news_mod._is_ai_relevant("Local bakery wins award", "Great croissants")


def test_is_ai_relevant_case_insensitive():
    assert news_mod._is_ai_relevant("CLAUDE 3 is here", "")


def test_parse_published_returns_datetime():
    entry = _make_entry("title", "summary", "http://example.com", hours_ago=1)
    dt = news_mod._parse_published(entry)
    assert isinstance(dt, datetime)
    assert dt.tzinfo is not None


def test_parse_published_missing_returns_none():
    entry = SimpleNamespace()
    assert news_mod._parse_published(entry) is None


def test_entry_to_item_fields():
    entry = _make_entry("AI breakthrough", "Neural nets improve", "http://x.com/1", 1)
    item = news_mod._entry_to_item(entry, "Test Feed")
    assert item["title"] == "AI breakthrough"
    assert item["url"] == "http://x.com/1"
    assert item["source"] == "Test Feed"
    assert "Neural" in item["summary"]


def test_entry_to_item_strips_html():
    entry = SimpleNamespace(
        title="Test",
        summary="<p>Hello <b>world</b></p>",
        link="http://x.com",
        published_parsed=None,
    )
    item = news_mod._entry_to_item(entry, "Src")
    assert "<p>" not in item["summary"]
    assert "Hello world" in item["summary"]


def test_entry_to_item_truncates_long_summary():
    long_text = "AI " * 200
    entry = SimpleNamespace(title="T", summary=long_text, link="u", published_parsed=None)
    item = news_mod._entry_to_item(entry, "S")
    assert len(item["summary"]) <= 300


def test_get_news_filters_old_items():
    """Items older than lookback_hours should be excluded."""
    ai_entry = _make_entry("AI model released", "new llm", "http://ai.com", hours_ago=2)
    old_entry = _make_entry("Old AI news", "old llm stuff", "http://old.com", hours_ago=30)

    fake_feed = _make_feed([ai_entry, old_entry])
    with (
        patch("news.fetch_feed", return_value=fake_feed),
        patch(
            "news.load_config",
            return_value={
                "news": {
                    "lookback_hours": 24,
                    "max_items": 10,
                    "rss_feeds": [{"url": "http://test.com", "name": "Test"}],
                }
            },
        ),
    ):
        items = news_mod.get_news()

    urls = [i["url"] for i in items]
    assert "http://ai.com" in urls
    assert "http://old.com" not in urls


def test_get_news_filters_non_ai():
    """Non-AI items should be excluded even if recent."""
    ai_entry = _make_entry("GPT-5 announced", "new model", "http://ai.com", hours_ago=1)
    non_ai = _make_entry("Recipe of the day", "pasta recipe", "http://food.com", hours_ago=1)

    fake_feed = _make_feed([ai_entry, non_ai])
    with (
        patch("news.fetch_feed", return_value=fake_feed),
        patch(
            "news.load_config",
            return_value={
                "news": {
                    "lookback_hours": 24,
                    "max_items": 10,
                    "rss_feeds": [{"url": "http://test.com", "name": "Test"}],
                }
            },
        ),
    ):
        items = news_mod.get_news()

    assert all("food.com" not in i["url"] for i in items)


def test_get_news_respects_max_items():
    entries = [
        _make_entry(f"AI story {i}", "llm stuff", f"http://x.com/{i}", hours_ago=1)
        for i in range(20)
    ]
    fake_feed = _make_feed(entries)
    with (
        patch("news.fetch_feed", return_value=fake_feed),
        patch(
            "news.load_config",
            return_value={
                "news": {
                    "lookback_hours": 24,
                    "max_items": 3,
                    "rss_feeds": [{"url": "http://test.com", "name": "Test"}],
                }
            },
        ),
    ):
        items = news_mod.get_news()

    assert len(items) <= 3


def test_get_news_deduplicates():
    entry = _make_entry("AI story", "llm", "http://same.com", hours_ago=1)
    fake_feed = _make_feed([entry])
    # Two feeds returning the same URL
    with (
        patch("news.fetch_feed", return_value=fake_feed),
        patch(
            "news.load_config",
            return_value={
                "news": {
                    "lookback_hours": 24,
                    "max_items": 10,
                    "rss_feeds": [
                        {"url": "http://feed1.com", "name": "Feed1"},
                        {"url": "http://feed2.com", "name": "Feed2"},
                    ],
                }
            },
        ),
    ):
        items = news_mod.get_news()

    urls = [i["url"] for i in items]
    assert urls.count("http://same.com") == 1


def test_load_config_reads_news_section():
    cfg = news_mod.load_config()
    assert "news" in cfg
    assert "rss_feeds" in cfg["news"]
    assert "lookback_hours" in cfg["news"]
    assert "max_items" in cfg["news"]
    assert len(cfg["news"]["rss_feeds"]) == 3


def test_get_news_handles_feed_error_gracefully(capsys):
    """A broken feed URL should not crash the whole run."""
    with (
        patch("news.fetch_feed", side_effect=Exception("timeout")),
        patch(
            "news.load_config",
            return_value={
                "news": {
                    "lookback_hours": 24,
                    "max_items": 10,
                    "rss_feeds": [{"url": "http://broken.com", "name": "Broken"}],
                }
            },
        ),
    ):
        items = news_mod.get_news()

    assert items == []
    captured = capsys.readouterr()
    assert "Warning" in captured.out
