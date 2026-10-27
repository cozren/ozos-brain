"""Check configured YouTube channels for recent videos."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml
import yt_dlp

CONFIG_PATH = Path(__file__).parent / "config.yml"


def load_config() -> dict:
    """Load settings from config.yml."""
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def _parse_upload_date(upload_date: str) -> datetime:
    """Parse yt-dlp upload_date string (YYYYMMDD) to a UTC-aware datetime."""
    return datetime.strptime(upload_date, "%Y%m%d").replace(tzinfo=timezone.utc)


def fetch_channel_videos(channel_url: str, max_videos: int = 50) -> list[dict]:
    """Use yt-dlp to fetch the flat video list for a channel.

    Returns raw yt-dlp entry dicts (no download, metadata only).
    """
    ydl_opts = {
        "extract_flat": "in_playlist",
        "quiet": True,
        "no_warnings": True,
        "playlistend": max_videos,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"{channel_url}/videos", download=False)
    return info.get("entries", []) if info else []


def get_recent_videos(
    channels_override: list[dict] | None = None,
    lookback_hours: int | None = None,
) -> list[dict]:
    """Return videos posted within lookback_hours across all configured channels.

    Each result is:
      {channel, title, url, published_date}

    Args:
        channels_override: if provided, use this list instead of config channels.
        lookback_hours: if provided, use this instead of config value.
    """
    config = load_config()
    yt_cfg = config["youtube"]
    channels: list[dict] = (
        channels_override if channels_override is not None else yt_cfg["channels"]
    )
    hours: int = lookback_hours if lookback_hours is not None else yt_cfg["lookback_hours"]

    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours)
    results: list[dict] = []

    for channel in channels:
        name = channel["name"]
        url = channel["url"]
        try:
            entries = fetch_channel_videos(url)
            for entry in entries:
                upload_date_str = entry.get("upload_date")
                if not upload_date_str:
                    continue
                published = _parse_upload_date(upload_date_str)
                if published < cutoff:
                    # Videos are returned newest-first; once past cutoff, stop
                    break
                video_id = entry.get("id") or entry.get("url", "")
                video_url = (
                    f"https://www.youtube.com/watch?v={video_id}"
                    if not video_id.startswith("http")
                    else video_id
                )
                results.append(
                    {
                        "channel": name,
                        "title": entry.get("title", ""),
                        "url": video_url,
                        "published_date": published.strftime("%Y-%m-%d"),
                    }
                )
        except Exception as exc:
            print(f"[youtube] Warning: failed to fetch {name} ({url}): {exc}")

    return results


if __name__ == "__main__":
    videos = get_recent_videos()
    print(f"Found {len(videos)} recent videos:\n")
    for v in videos:
        print(f"[{v['channel']}] {v['published_date']} — {v['title']}")
        print(f"  {v['url']}")
        print()
