"""Fetch and filter GitHub trending repositories."""

import os
import re
import sys
from pathlib import Path
from typing import Optional

import requests
import yaml
from bs4 import BeautifulSoup

CONFIG_PATH = Path(__file__).parent / "config.yml"
TRENDING_URL = "https://github.com/trending?since=daily&spoken_language_code=en"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; OZOS-daily-digest/1.0)"}


def load_config() -> dict:
    """Load settings from config.yml."""
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def _parse_star_count(text: str) -> int:
    """Parse a star count string like '1,234' or '12.3k' into an integer."""
    text = text.strip().replace(",", "").lower()
    match = re.search(r"([\d.]+)k?", text)
    if not match:
        return 0
    value = float(match.group(1))
    if "k" in text:
        value *= 1000
    return int(value)


def _parse_repo(article) -> Optional[dict]:
    """Parse a single trending repo article element into a dict.

    Returns None if the element cannot be parsed.
    """
    try:
        h2 = article.find("h2")
        if not h2:
            return None
        link = h2.find("a")
        if not link:
            return None
        repo_path = link["href"].strip("/")  # "owner/repo"
        name = repo_path

        desc_tag = article.find("p")
        description = desc_tag.get_text(strip=True) if desc_tag else ""

        # Total stars — link to /stargazers
        stars_total = 0
        for a in article.find_all("a", href=True):
            if a["href"].endswith("/stargazers"):
                stars_total = _parse_star_count(a.get_text(strip=True))
                break

        # Stars today — float-sm-right span
        stars_today = 0
        today_span = article.find("span", class_=re.compile(r"float-sm-right"))
        if today_span:
            stars_today = _parse_star_count(today_span.get_text(strip=True))

        # Topic tags on page (not always present on trending page)
        topics = [
            a.get_text(strip=True).lower()
            for a in article.find_all("a", class_=re.compile(r"topic-tag"))
        ]

        return {
            "name": name,
            "description": description,
            "url": f"https://github.com/{repo_path}",
            "stars_today": stars_today,
            "stars_total": stars_total,
            "topics": topics,
        }
    except Exception:
        return None


def _matches_filters(repo: dict, filters: list[str]) -> bool:
    """Return True if the repo name, description, or topics match any filter keyword."""
    text = " ".join([repo["name"].lower(), repo["description"].lower()] + repo["topics"])
    return any(f.lower() in text for f in filters)


def fetch_trending_html(url: str = TRENDING_URL) -> str:
    """Fetch the raw HTML of the GitHub trending page."""
    response = requests.get(url, headers=HEADERS, timeout=15)
    response.raise_for_status()
    return response.text


def parse_trending_repos(html: str) -> list[dict]:
    """Parse all repos from GitHub trending page HTML."""
    soup = BeautifulSoup(html, "html.parser")
    articles = soup.find_all("article", class_=re.compile(r"Box-row"))
    repos = []
    for article in articles:
        repo = _parse_repo(article)
        if repo:
            repos.append(repo)
    return repos


def get_trending(html: Optional[str] = None) -> dict:
    """Fetch GitHub trending repos and return two filtered categories.

    Returns a dict with:
      - "top_trending": top N repos by stars gained today
      - "most_popular": top N repos by total all-time stars
    Both lists contain only repos matching the filters in config.yml.
    """
    config = load_config()
    filters: list[str] = config["github"]["filters"]
    trending_count: int = config["github"]["trending_count"]
    popular_count: int = config["github"]["popular_count"]

    if html is None:
        html = fetch_trending_html()

    all_repos = parse_trending_repos(html)
    filtered = [r for r in all_repos if _matches_filters(r, filters)]

    top_trending = sorted(filtered, key=lambda r: r["stars_today"], reverse=True)[:trending_count]
    most_popular = sorted(filtered, key=lambda r: r["stars_total"], reverse=True)[:popular_count]

    # Remove internal "topics" field before returning
    for repo in top_trending + most_popular:
        repo.pop("topics", None)

    return {"top_trending": top_trending, "most_popular": most_popular}


if __name__ == "__main__":
    result = get_trending()
    print("=== Top Trending Today ===")
    for r in result["top_trending"]:
        print(f"  {r['name']} — {r['stars_today']} today / {r['stars_total']} total")
        print(f"    {r['description']}")
    print("\n=== Most Popular ===")
    for r in result["most_popular"]:
        print(f"  {r['name']} — {r['stars_total']} total stars")
        print(f"    {r['description']}")
