"""Generate a daily AI digest from GitHub Trending, HackerNews, YouTube, and more."""

import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import anthropic
import requests
import yt_dlp
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Shared run-log helper (skills/) — records each run for the OZOS Brain Command Hub.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "skills"))
import ozos_llm  # noqa: E402
import ozos_vault  # noqa: E402
import run_log  # noqa: E402

# ─── Constants ────────────────────────────────────────────────────────────────

HN_ALGOLIA_URL = "https://hn.algolia.com/api/v1/search"
GH_TRENDING_URL = "https://github.com/trending"
GH_SEARCH_URL = "https://api.github.com/search/repositories"
GH_SEARCH_QUERIES = [
    "claude-code skill",
    "claude code extension",
    "awesome-claude-code",
    "claude code superpower",
]
GH_MIN_STARS = 1_000
GH_MUST_HAVES_MAX = 10
GH_EXCLUDED_OWNERS = {"anthropics", "anthropic-ai"}
GROWPRODUCT_URL = "https://www.youtube.com/@growproduct"
AAKASHG_URL = "https://www.news.aakashg.com/"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; OZOS-daily-digest/1.0)"}
# The vault holds every piece of user data; the engine only holds code.
VAULT_DIR = ozos_vault.vault_dir()
DIGEST_DIR = VAULT_DIR / "knowledge-hub" / "digests"
RUNS_DIR = VAULT_DIR / ".ozos" / "runs"
VITAL_ID = "daily-digest"

REPO_CATEGORIES = [
    "Claude Code Extensions",
    "IDE & Dev Tools",
    "Agent Frameworks",
    "UI & Design Tools",
    "Fun & Creative",
]

HN_QUERIES = [
    "Claude Code",
    "Gemini AI feature",
    "ChatGPT release",
    "AI agent workflow",
    "AI model release announcement",
    "AI startup funding shutdown",
    "LLM product manager",
]

INTEREST_PROFILE = """
Keep only content that matches this profile:
- Claude Code / Gemini / ChatGPT new features or releases
- GitHub repos that are Claude Code skills, agent tooling, or anything that extends Claude Code
- Hard AI industry news: announcements, shutdowns, model releases, company moves
- How product managers, leaders, or businesses are using agents in real workflows

Exclude all of the following:
- Opinion pieces and think pieces
- Hype articles ("AI is changing everything" type content)
- Generic reposts or aggregations with no new information
- Tutorial or how-to content with no news value
- Academic papers with no direct industry impact
"""


# ─── Data fetching — HackerNews ───────────────────────────────────────────────


def fetch_hn_stories(queries: list[str] | None = None, max_per_query: int = 10) -> list[dict]:
    """Fetch HN stories matching each query using the Algolia search API.

    Returns a deduplicated list of story dicts: {title, url, points, source}.
    """
    if queries is None:
        queries = HN_QUERIES

    seen_ids: set[str] = set()
    stories: list[dict] = []

    for query in queries:
        try:
            resp = requests.get(
                HN_ALGOLIA_URL,
                params={"query": query, "tags": "story", "hitsPerPage": max_per_query},
                headers=HEADERS,
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            for hit in data.get("hits", []):
                story_id = hit.get("objectID", "")
                if story_id in seen_ids:
                    continue
                seen_ids.add(story_id)
                stories.append(
                    {
                        "title": hit.get("title", ""),
                        "url": hit.get("url") or f"https://news.ycombinator.com/item?id={story_id}",
                        "points": hit.get("points", 0),
                        "source": "HackerNews",
                    }
                )
        except Exception as exc:
            print(f"[digest] Warning: HN query '{query}' failed: {exc}")

    return stories


# ─── Data fetching — GitHub ───────────────────────────────────────────────────


def fetch_github_trending_html(url: str = GH_TRENDING_URL) -> str:
    """Fetch the raw HTML of the GitHub trending page."""
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    return resp.text


def parse_github_trending(html: str) -> list[dict]:
    """Parse trending repos from GitHub trending page HTML.

    Returns a list of dicts: {name, description, url, stars_today}.
    """
    soup = BeautifulSoup(html, "html.parser")
    articles = soup.find_all("article", class_=re.compile(r"Box-row"))
    repos: list[dict] = []

    for article in articles:
        try:
            h2 = article.find("h2")
            if not h2:
                continue
            link = h2.find("a")
            if not link:
                continue
            repo_path = link["href"].strip("/")

            desc_tag = article.find("p")
            description = desc_tag.get_text(strip=True) if desc_tag else ""

            stars_today = 0
            today_span = article.find("span", class_=re.compile(r"float-sm-right"))
            if today_span:
                text = today_span.get_text(strip=True).replace(",", "").lower()
                m = re.search(r"([\d.]+)k?", text)
                if m:
                    v = float(m.group(1))
                    if "k" in text:
                        v *= 1000
                    stars_today = int(v)

            repos.append(
                {
                    "name": repo_path,
                    "description": description,
                    "url": f"https://github.com/{repo_path}",
                    "stars_today": stars_today,
                }
            )
        except Exception:
            continue

    return repos


def fetch_github_must_haves(
    queries: list[str] | None = None,
    min_stars: int = GH_MIN_STARS,
    max_results: int = GH_MUST_HAVES_MAX,
) -> list[dict]:
    """Fetch community Claude Code extension repos from the GitHub search API.

    Queries Claude Code-specific search terms, deduplicates by numeric repo ID,
    excludes official Anthropic-owned repos, and filters to repos with at least
    min_stars stars. Returns up to max_results repos sorted by star count
    descending. Each dict: {name, description, url, stars}.
    """
    if queries is None:
        queries = GH_SEARCH_QUERIES

    gh_headers = {**HEADERS, "Accept": "application/vnd.github+json"}
    seen_ids: set[int] = set()
    repos: list[dict] = []

    for query in queries:
        try:
            resp = requests.get(
                GH_SEARCH_URL,
                params={"q": query, "sort": "stars", "order": "desc", "per_page": 30},
                headers=gh_headers,
                timeout=10,
            )
            resp.raise_for_status()
            for item in resp.json().get("items", []):
                repo_id = item.get("id")
                full_name = item.get("full_name", "")
                stars = item.get("stargazers_count", 0)
                owner = (item.get("owner") or {}).get("login", "").lower()

                if repo_id in seen_ids:
                    continue
                if owner in GH_EXCLUDED_OWNERS:
                    continue
                if stars < min_stars:
                    continue

                seen_ids.add(repo_id)
                repos.append(
                    {
                        "name": full_name,
                        "description": item.get("description") or "",
                        "url": item.get("html_url") or f"https://github.com/{full_name}",
                        "stars": stars,
                    }
                )
        except Exception as exc:
            print(f"[digest] Warning: GitHub search query '{query}' failed: {exc}")

    repos.sort(key=lambda r: r["stars"], reverse=True)
    return repos[:max_results]


# ─── Data fetching — YouTube ──────────────────────────────────────────────────


def _parse_upload_date(upload_date: str) -> datetime:
    """Parse a yt-dlp upload_date string (YYYYMMDD) to a UTC-aware datetime."""
    return datetime.strptime(upload_date, "%Y%m%d").replace(tzinfo=timezone.utc)


def fetch_youtube_videos(
    channel_url: str = GROWPRODUCT_URL,
    lookback_hours: int = 24,
) -> list[dict]:
    """Fetch recent videos from a YouTube channel using yt-dlp.

    Returns videos published within lookback_hours, each as:
      {title, url, published_date, source}
    """
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=lookback_hours)
    ydl_opts = {
        "extract_flat": "in_playlist",
        "quiet": True,
        "no_warnings": True,
        "playlistend": 10,
    }
    videos: list[dict] = []
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"{channel_url}/videos", download=False)
        entries = (info or {}).get("entries") or []
        for entry in entries:
            if not entry:
                continue
            upload_date_str = entry.get("upload_date")
            if not upload_date_str:
                continue
            try:
                published = _parse_upload_date(upload_date_str)
            except ValueError:
                continue
            if published < cutoff:
                break  # entries are newest-first; once past cutoff, stop
            video_id = entry.get("id") or ""
            video_url = entry.get("url") or (
                f"https://www.youtube.com/watch?v={video_id}" if video_id else ""
            )
            if not video_url:
                continue
            videos.append(
                {
                    "title": entry.get("title", ""),
                    "url": video_url,
                    "published_date": published.strftime("%Y-%m-%d"),
                    "source": "YouTube/@growproduct",
                }
            )
    except Exception as exc:
        print(f"[digest] Warning: YouTube fetch from {channel_url} failed: {exc}")

    return videos


# ─── Data fetching — Aakash G newsletter ─────────────────────────────────────


def fetch_aakashg_articles(
    url: str = AAKASHG_URL,
    lookback_days: int = 7,
) -> list[dict]:
    """Scrape recent articles from news.aakashg.com.

    Tries multiple common blog/newsletter HTML patterns. Returns articles as:
      {title, url, summary, source}
    Up to 10 results, deduplicated by URL.
    """
    articles: list[dict] = []
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Strategy 1: look for <article> or post-preview divs with links
        candidates = soup.find_all(
            ["article", "div"],
            class_=re.compile(r"post|article|entry|story|preview", re.I),
        )

        # Strategy 2: if no structured containers found, find headings with links
        if not candidates:
            candidates = soup.find_all(["h1", "h2", "h3"])

        for tag in candidates:
            # Find the primary link and title
            a_tag = tag.find("a", href=True)
            heading = tag.find(["h1", "h2", "h3"])

            if a_tag:
                title = (heading or a_tag).get_text(strip=True)
                href = a_tag["href"]
            elif tag.name in ("h1", "h2", "h3"):
                a_tag = tag.find_parent("a", href=True) or tag.find("a", href=True)
                if not a_tag:
                    continue
                title = tag.get_text(strip=True)
                href = a_tag["href"]
            else:
                continue

            if not title or not href:
                continue

            # Normalise relative URLs
            if not href.startswith("http"):
                href = url.rstrip("/") + "/" + href.lstrip("/")

            # Extract a short summary from a sibling or child <p>
            p = tag.find("p")
            summary = p.get_text(strip=True)[:200] if p else ""

            articles.append(
                {
                    "title": title,
                    "url": href,
                    "summary": summary,
                    "source": "news.aakashg.com",
                }
            )

    except Exception as exc:
        print(f"[digest] Warning: aakashg.com fetch failed: {exc}")

    # Deduplicate by URL
    seen: set[str] = set()
    unique: list[dict] = []
    for a in articles:
        if a["url"] not in seen:
            seen.add(a["url"])
            unique.append(a)

    return unique[:10]


# ─── Claude ───────────────────────────────────────────────────────────────────


def build_client() -> anthropic.Anthropic:
    """Build the shared Anthropic client with SDK retries disabled.

    Some gateways enforce a small rolling request window. SDK-level retries fire
    fast and would just drain it, so `_call_section` owns the retry: it reads the
    reset time from the 429 and waits for the window to refill (see below).
    """
    return ozos_llm.make_client(max_retries=0)


# Per-section generation keeps each LLM call's prompt + output modest (some
# gateways cap each request at a few thousand tokens). Each section gets ONLY the raw
# sources relevant to it, the large HN list is pre-limited, and max_tokens is
# modest. The four section bodies are assembled into the same final markdown.

HN_PRELIMIT = 25  # top-N HN stories by points sent to the model (bounds input)
SECTION_MAX_TOKENS = 800  # output budget per section call
NOTHING = "Nothing significant today."

SECTION_HEADINGS = {
    1: "## 1. Claude Code & AI Tool Updates",
    2: "## 2. Trending GitHub Skills & Repos",
    3: "## 3. Agent Workflows — PMs, Leaders & Businesses",
    4: "## 4. General AI News",
}


def _prelimit_hn(hn_stories: list[dict], limit: int = HN_PRELIMIT) -> list[dict]:
    """Return the top-`limit` HN stories by points, to bound prompt size."""
    return sorted(hn_stories, key=lambda s: s.get("points", 0), reverse=True)[:limit]


def _hn_block(hn_stories: list[dict]) -> str:
    return "\n".join(f"- [{s['title']}]({s['url']}) ({s['points']} pts)" for s in hn_stories)


def _trending_block(gh_trending: list[dict]) -> str:
    return "\n".join(
        f"- [{r['name']}]({r['url']}) — {r['description']} ({r['stars_today']} stars today)"
        for r in gh_trending
    )


def _must_haves_block(gh_must_haves: list[dict]) -> str:
    return "\n".join(
        f"- [{r['name']}]({r['url']}) — {r['description']} ({r['stars']:,} stars)"
        for r in gh_must_haves
    )


def _yt_block(yt_videos: list[dict]) -> str:
    return "\n".join(
        f"- [{v['title']}]({v['url']}) — published {v['published_date']}" for v in yt_videos
    )


def _aakashg_block(aakashg_articles: list[dict]) -> str:
    return "\n".join(f"- [{a['title']}]({a['url']}) — {a['summary']}" for a in aakashg_articles)


# The gateway's per-team request pool refills on a ~1-minute window. When a
# section call is throttled we wait for that reset (read from the 429 message)
# and try again, spreading the four section calls across windows so the digest
# still completes under a tiny request budget instead of dying mid-run.
SECTION_MAX_ATTEMPTS = 6
_RESET_RE = re.compile(r"resets at:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*UTC")
_RESET_DEFAULT_WAIT = 60.0  # gateway windows are per-minute
_RESET_MAX_WAIT = 90.0  # never block a single retry longer than this


def _seconds_until_reset(
    err: Exception, default: float = _RESET_DEFAULT_WAIT, cap: float = _RESET_MAX_WAIT
) -> float:
    """How long to wait before retrying after a 429.

    Reads the 'Limit resets at: YYYY-MM-DD HH:MM:SS UTC' clause from the error
    message and returns seconds until then (plus a small buffer), capped. Falls
    back to a ~minute wait when the clause is absent or already in the past.
    """
    message = str(getattr(err, "message", "") or err)
    match = _RESET_RE.search(message)
    if match:
        try:
            reset = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S").replace(
                tzinfo=timezone.utc
            )
            secs = (reset - datetime.now(timezone.utc)).total_seconds() + 2.0
            if secs > 0:
                return min(secs, cap)
        except ValueError:
            pass
    return default


def _call_section(client: anthropic.Anthropic, prompt: str) -> str:
    """Make one bounded LLM call and return the stripped text body.

    On a rate-limit 429, wait for the gateway window to reset and retry, up to
    SECTION_MAX_ATTEMPTS times. The error propagates if every attempt is throttled.
    """
    last_err: Optional[anthropic.RateLimitError] = None
    for attempt in range(SECTION_MAX_ATTEMPTS):
        try:
            response = client.messages.create(
                model=ozos_llm.model(),
                max_tokens=SECTION_MAX_TOKENS,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()
        except anthropic.RateLimitError as err:
            last_err = err
            if attempt == SECTION_MAX_ATTEMPTS - 1:
                break
            wait = _seconds_until_reset(err)
            print(
                f"  [digest] rate limited (attempt {attempt + 1}/{SECTION_MAX_ATTEMPTS}); "
                f"waiting {wait:.0f}s for the gateway window to reset..."
            )
            time.sleep(wait)
    raise last_err


def _generate_section1(
    client: anthropic.Anthropic, today: str, hn_block: str, trending_block: str
) -> str:
    prompt = f"""You are writing section 1 of a daily AI digest for {today}: "Claude Code & AI Tool Updates".

Keep only content that matches this interest profile:
{INTEREST_PROFILE}

Raw data for this section:

=== HACKERNEWS STORIES ===
{hn_block or "(none)"}

=== GITHUB TRENDING REPOS ===
{trending_block or "(none)"}

Rules:
- List only items above about new features/releases/updates to Claude Code, Claude, Gemini, ChatGPT, or AI dev tools
- For each item: one bullet with the title as a markdown link, then a one-sentence explanation of why it matters
- Show a MAXIMUM of 6 items
- If nothing relevant, output exactly: {NOTHING}
- Output only the bullet list (or that one line) — no heading, no preamble, no closing remarks
- Do not invent or add any content not present in the raw data above
"""
    return _call_section(client, prompt)


def _generate_section2(
    client: anthropic.Anthropic, today: str, trending_block: str, must_haves_block: str
) -> str:
    categories = ", ".join(REPO_CATEGORIES)
    prompt = f"""You are writing section 2 of a daily AI digest for {today}: "Trending GitHub Skills & Repos".

Raw data for this section:

=== GITHUB TRENDING REPOS ===
{trending_block or "(none)"}

=== GITHUB MUST-HAVES (community Claude Code tools, 1k+ stars) ===
{must_haves_block or "(none)"}

Rules:
- Split into two subsections with these EXACT headings:
  "### Today's Trending" (from the GITHUB TRENDING REPOS data) and
  "### Must-Haves" (from the GITHUB MUST-HAVES data)
- For EVERY repo in both subsections, assign exactly one category tag from this list: {categories}
- Show the tag inline after the repo name link, formatted as `[Tag]`, e.g. "- [repo/name](url) `[Agent Frameworks]` — description"
- Choose the category that best fits the repo description; if none fit well, use the closest match
- For each repo: one bullet with the name as a markdown link, the tag, then a one-sentence explanation
- If a subsection has no repos, put exactly this under it: {NOTHING}
- Output only the two subsections — no top-level heading, no preamble, no closing remarks
- Do not invent or add any content not present in the raw data above
"""
    return _call_section(client, prompt)


def _generate_section3(
    client: anthropic.Anthropic, today: str, yt_block: str, aakashg_block: str, hn_block: str
) -> str:
    prompt = f"""You are writing section 3 of a daily AI digest for {today}: "Agent Workflows — PMs, Leaders & Businesses".

Keep only content that matches this interest profile:
{INTEREST_PROFILE}

Raw data for this section:

=== YOUTUBE @growproduct (last 24h) ===
{yt_block or "(none)"}

=== AAKASH G NEWSLETTER ===
{aakashg_block or "(none)"}

=== HACKERNEWS STORIES ===
{hn_block or "(none)"}

Rules:
- Keep only items about real agent workflows and PM/leader/business use cases
- Prioritise content from YouTube @growproduct and Aakash G newsletter first; fill any remaining slots with HackerNews stories
- Show a MAXIMUM of 5 items total
- For each item: one bullet with the title as a markdown link, then a one-sentence explanation of why it matters
- If nothing relevant, output exactly: {NOTHING}
- Output only the bullet list (or that one line) — no heading, no preamble, no closing remarks
- Do not invent or add any content not present in the raw data above
"""
    return _call_section(client, prompt)


def _generate_section4(client: anthropic.Anthropic, today: str, hn_block: str) -> str:
    prompt = f"""You are writing section 4 of a daily AI digest for {today}: "General AI News".

Keep only content that matches this interest profile:
{INTEREST_PROFILE}

Raw data for this section:

=== HACKERNEWS STORIES ===
{hn_block or "(none)"}

Rules:
- List only hard AI industry news: announcements, model releases, shutdowns, funding, company moves
- For each item: one bullet with the title as a markdown link, then a one-sentence explanation of why it matters
- If nothing relevant, output exactly: {NOTHING}
- Output only the bullet list (or that one line) — no heading, no preamble, no closing remarks
- Do not invent or add any content not present in the raw data above
"""
    return _call_section(client, prompt)


def generate_digest(
    hn_stories: list[dict],
    gh_trending: list[dict],
    gh_must_haves: list[dict],
    yt_videos: list[dict],
    aakashg_articles: list[dict],
    client: Optional[anthropic.Anthropic] = None,
) -> str:
    """Use Claude to filter raw data and write the formatted daily digest.

    Generation is split into one small LLM call per output section so each
    request's prompt + max_tokens stays comfortably under a strict gateway's
    ~4000-token per-request cap. Each section receives only the raw sources
    relevant to it; the large HN list is pre-limited by points before sending.
    The four section bodies are assembled into the same final markdown contract.

    Returns the markdown digest string with the four required sections.
    """
    if client is None:
        client = build_client()

    today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")

    hn_limited = _prelimit_hn(hn_stories)
    hn_block = _hn_block(hn_limited)
    trending_block = _trending_block(gh_trending)
    must_haves_block = _must_haves_block(gh_must_haves)
    yt_block = _yt_block(yt_videos)
    aakashg_block = _aakashg_block(aakashg_articles)

    # Section 1: HN + trending
    if hn_block or trending_block:
        body1 = _generate_section1(client, today, hn_block, trending_block)
    else:
        body1 = NOTHING

    # Section 2: trending + must-haves
    if trending_block or must_haves_block:
        body2 = _generate_section2(client, today, trending_block, must_haves_block)
    else:
        body2 = NOTHING

    # Section 3: YouTube + Aakash + HN
    if yt_block or aakashg_block or hn_block:
        body3 = _generate_section3(client, today, yt_block, aakashg_block, hn_block)
    else:
        body3 = NOTHING

    # Section 4: HN
    if hn_block:
        body4 = _generate_section4(client, today, hn_block)
    else:
        body4 = NOTHING

    return (
        f"{SECTION_HEADINGS[1]}\n{body1}\n\n"
        f"{SECTION_HEADINGS[2]}\n{body2}\n\n"
        f"{SECTION_HEADINGS[3]}\n{body3}\n\n"
        f"{SECTION_HEADINGS[4]}\n{body4}"
    )


# ─── File I/O ─────────────────────────────────────────────────────────────────


def save_digest(
    content: str, output_dir: Path = DIGEST_DIR, runs_dir: Optional[Path] = None
) -> Path:
    """Save the digest markdown to <vault>/knowledge-hub/digests/digest-YYYY-MM-DD.md.

    Creates the output directory if it does not exist. Also appends a run record
    (section headings as items) for the Command Hub — best-effort, never fatal.
    Returns the path to the saved file.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    path = output_dir / f"digest-{today}.md"
    path.write_text(content, encoding="utf-8")

    headings = re.findall(r"^## .+", content, flags=re.MULTILINE)
    try:
        run_log.record_run(runs_dir or RUNS_DIR, VITAL_ID, len(headings), headings)
    except Exception as exc:
        print(f"  [run-log] skipped: {exc}")

    return path


# ─── Orchestration ────────────────────────────────────────────────────────────


def run() -> None:
    """Fetch data from all sources, generate digest with Claude, and save to disk."""
    print("[digest] Fetching HackerNews stories...")
    hn_stories = fetch_hn_stories()
    print(f"[digest] Got {len(hn_stories)} HN stories")

    print("[digest] Fetching GitHub trending repos...")
    html = fetch_github_trending_html()
    gh_trending = parse_github_trending(html)[:5]
    print(f"[digest] Got {len(gh_trending)} trending repos")

    print("[digest] Fetching GitHub must-have repos...")
    gh_must_haves = fetch_github_must_haves()
    print(f"[digest] Got {len(gh_must_haves)} must-have repos")

    print("[digest] Fetching YouTube @growproduct videos...")
    yt_videos = fetch_youtube_videos()
    print(f"[digest] Got {len(yt_videos)} recent videos")

    print("[digest] Fetching Aakash G newsletter articles...")
    aakashg_articles = fetch_aakashg_articles()
    print(f"[digest] Got {len(aakashg_articles)} articles")

    print("[digest] Generating digest with Claude...")
    client = build_client()
    content = generate_digest(
        hn_stories, gh_trending, gh_must_haves, yt_videos, aakashg_articles, client=client
    )

    path = save_digest(content)
    print(f"Digest saved to {path}")


if __name__ == "__main__":
    run()
