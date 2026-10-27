"""Tests for tools/daily-digest/youtube.py."""

import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
import youtube as yt_mod


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_entry(title: str, video_id: str, upload_date: str) -> dict:
    """Return a fake yt-dlp flat entry dict."""
    return {
        "id": video_id,
        "title": title,
        "upload_date": upload_date,
    }


def _recent_upload_date() -> str:
    """yt-dlp-style upload_date (YYYYMMDD) for 'now'.

    Use this for entries that must fall *inside* the lookback window. Pinning a
    literal date here rots: once real time passes the window, the entry is
    correctly filtered out and the test fails for no real reason.
    """
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def _ydl_context_manager(entries: list):
    """Return a mock that simulates yt_dlp.YoutubeDL context manager."""
    mock_ydl = MagicMock()
    mock_ydl.extract_info.return_value = {"entries": entries}
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=mock_ydl)
    cm.__exit__ = MagicMock(return_value=False)
    return cm


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def test_parse_upload_date_valid():
    dt = yt_mod._parse_upload_date("20260404")
    assert dt.year == 2026
    assert dt.month == 4
    assert dt.day == 4
    assert dt.tzinfo == timezone.utc


def test_parse_upload_date_format_error():
    with pytest.raises(ValueError):
        yt_mod._parse_upload_date("not-a-date")


def test_fetch_channel_videos_returns_entries():
    entries = [_make_entry("Video 1", "abc123", "20260404")]
    cm = _ydl_context_manager(entries)

    with patch("youtube.yt_dlp.YoutubeDL", return_value=cm):
        result = yt_mod.fetch_channel_videos("https://www.youtube.com/@test")

    assert len(result) == 1
    assert result[0]["title"] == "Video 1"


def test_fetch_channel_videos_empty_info():
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=MagicMock(extract_info=MagicMock(return_value=None)))
    cm.__exit__ = MagicMock(return_value=False)

    with patch("youtube.yt_dlp.YoutubeDL", return_value=cm):
        result = yt_mod.fetch_channel_videos("https://www.youtube.com/@test")

    assert result == []


def test_get_recent_videos_within_window():
    """Videos within lookback_hours should be returned."""
    entries = [_make_entry("Recent AI Video", "vid1", _recent_upload_date())]
    cm = _ydl_context_manager(entries)

    channels = [{"name": "Test Channel", "url": "https://www.youtube.com/@test"}]

    with (
        patch("youtube.yt_dlp.YoutubeDL", return_value=cm),
        patch(
            "youtube.load_config",
            return_value={"youtube": {"channels": channels, "lookback_hours": 48}},
        ),
    ):
        results = yt_mod.get_recent_videos(channels_override=channels, lookback_hours=48)

    assert len(results) == 1
    assert results[0]["title"] == "Recent AI Video"
    assert results[0]["channel"] == "Test Channel"


def test_get_recent_videos_outside_window():
    """Videos older than lookback_hours should be excluded."""
    entries = [_make_entry("Old Video", "vid2", "20200101")]  # very old
    cm = _ydl_context_manager(entries)

    channels = [{"name": "Test Channel", "url": "https://www.youtube.com/@test"}]

    with (
        patch("youtube.yt_dlp.YoutubeDL", return_value=cm),
        patch(
            "youtube.load_config",
            return_value={"youtube": {"channels": channels, "lookback_hours": 48}},
        ),
    ):
        results = yt_mod.get_recent_videos(channels_override=channels, lookback_hours=48)

    assert results == []


def test_get_recent_videos_url_format():
    """Returned URL should be a full YouTube watch URL."""
    entries = [_make_entry("New Video", "xyz789", _recent_upload_date())]
    cm = _ydl_context_manager(entries)

    channels = [{"name": "Ch", "url": "https://www.youtube.com/@ch"}]

    with (
        patch("youtube.yt_dlp.YoutubeDL", return_value=cm),
        patch(
            "youtube.load_config",
            return_value={"youtube": {"channels": channels, "lookback_hours": 48}},
        ),
    ):
        results = yt_mod.get_recent_videos(channels_override=channels, lookback_hours=48)

    assert results[0]["url"] == "https://www.youtube.com/watch?v=xyz789"


def test_get_recent_videos_skips_missing_date():
    """Entries without upload_date should be skipped."""
    entries = [{"id": "vid1", "title": "No Date"}]  # no upload_date key
    cm = _ydl_context_manager(entries)

    channels = [{"name": "Ch", "url": "https://www.youtube.com/@ch"}]

    with (
        patch("youtube.yt_dlp.YoutubeDL", return_value=cm),
        patch(
            "youtube.load_config",
            return_value={"youtube": {"channels": channels, "lookback_hours": 48}},
        ),
    ):
        results = yt_mod.get_recent_videos(channels_override=channels, lookback_hours=48)

    assert results == []


def test_get_recent_videos_handles_channel_error(capsys):
    """A broken channel should not crash the run."""
    with (
        patch("youtube.fetch_channel_videos", side_effect=Exception("network error")),
        patch(
            "youtube.load_config",
            return_value={
                "youtube": {
                    "channels": [{"name": "Bad", "url": "https://bad.url"}],
                    "lookback_hours": 48,
                }
            },
        ),
    ):
        results = yt_mod.get_recent_videos()

    assert results == []
    captured = capsys.readouterr()
    assert "Warning" in captured.out


def test_get_recent_videos_result_fields():
    """Each result must have channel, title, url, published_date."""
    entries = [_make_entry("Test", "v1", _recent_upload_date())]
    cm = _ydl_context_manager(entries)
    channels = [{"name": "Ch", "url": "https://www.youtube.com/@ch"}]

    with (
        patch("youtube.yt_dlp.YoutubeDL", return_value=cm),
        patch(
            "youtube.load_config",
            return_value={"youtube": {"channels": channels, "lookback_hours": 48}},
        ),
    ):
        results = yt_mod.get_recent_videos(channels_override=channels, lookback_hours=48)

    assert all(k in results[0] for k in ("channel", "title", "url", "published_date"))


def test_load_config_reads_youtube_section():
    cfg = yt_mod.load_config()
    assert "youtube" in cfg
    assert "channels" in cfg["youtube"]
    assert "lookback_hours" in cfg["youtube"]
    assert len(cfg["youtube"]["channels"]) == 7
