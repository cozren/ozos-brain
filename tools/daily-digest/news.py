"""Fetch and filter AI-relevant news from RSS feeds."""

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import feedparser
import yaml

CONFIG_PATH = Path(__file__).parent / "config.yml"

AI_KEYWORDS = [
    "ai",
    "artificial intelligence",
    "machine learning",
    "llm",
    "large language model",
    "gpt",
    "claude",
    "gemini",
    "openai",
    "anthropic",
    "neural",
    "deepmind",
    "transformer",
    "diffusion",
    "autonomous",
    "agent",
    "chatbot",
    "copilot",
    "automation",
    "model",
]


def load_config() -> dict:
    """Load settings from config.yml."""
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def _is_ai_relevant(title: str, summary: str) -> bool:
    """Return True if the title or summary contains any AI keyword."""
    text = (title + " " + summary).lower()
    return any(kw in text for kw in AI_KEYWORDS)


def _parse_published(entry) -> Optional[datetime]:
    """Extract and return a timezone-aware datetime from a feed entry."""
    # feedparser provides published_parsed as a time.struct_time in UTC
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        import time

        ts = time.mktime(entry.published_parsed)
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    if hasattr(entry, "updated_parsed") and entry.updated_parsed:
        import time

        ts = time.mktime(entry.updated_parsed)
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    return None


def _entry_to_item(entry, source_name: str) -> dict:
    """Convert a feedparser entry to a digest news item dict."""
    title = getattr(entry, "title", "")
    summary = getattr(entry, "summary", "") or getattr(entry, "description", "")
    # Strip HTML tags from summary
    summary = re.sub(r"<[^>]+>", "", summary).strip()
    url = getattr(entry, "link", "")
    return {
        "title": title,
        "summary": summary[:300],  # Keep it concise
        "url": url,
        "source": source_name,
    }


def fetch_feed(url: str) -> feedparser.FeedParserDict:
    """Fetch and parse an RSS feed from the given URL."""
    return feedparser.parse(url)


def get_news(feeds_override: Optional[list] = None) -> list[dict]:
    """Fetch AI-relevant news stories from all configured RSS feeds.

    Returns a list of up to max_items stories, each as:
      {title, summary, url, source}
    Only items published within lookback_hours are included.
    """
    config = load_config()
    news_cfg = config["news"]
    lookback_hours: int = news_cfg["lookback_hours"]
    max_items: int = news_cfg["max_items"]
    rss_feeds: list[dict] = feeds_override if feeds_override is not None else news_cfg["rss_feeds"]

    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=lookback_hours)
    items: list[dict] = []

    for feed_cfg in rss_feeds:
        url = feed_cfg["url"]
        name = feed_cfg["name"]
        try:
            feed = fetch_feed(url)
            for entry in feed.entries:
                published = _parse_published(entry)
                if published and published < cutoff:
                    continue  # Too old
                title = getattr(entry, "title", "")
                summary = getattr(entry, "summary", "") or getattr(entry, "description", "")
                if _is_ai_relevant(title, summary):
                    items.append(_entry_to_item(entry, name))
        except Exception as exc:
            print(f"[news] Warning: failed to fetch {name} ({url}): {exc}")

    # Deduplicate by URL, preserve order
    seen: set[str] = set()
    unique: list[dict] = []
    for item in items:
        if item["url"] not in seen:
            seen.add(item["url"])
            unique.append(item)

    return unique[:max_items]


if __name__ == "__main__":
    stories = get_news()
    print(f"Found {len(stories)} AI-relevant stories:\n")
    for s in stories:
        print(f"[{s['source']}] {s['title']}")
        print(f"  {s['url']}")
        print(f"  {s['summary'][:120]}...")
        print()
