from pathlib import Path
import sys
import types

import pytest


# Ensure the youtube-xray tool directory is importable as a plain module path
CURRENT_FILE = Path(__file__).resolve()
PROJECT_ROOT = CURRENT_FILE.parents[3]
TOOL_DIR = PROJECT_ROOT / "tools" / "youtube-xray"
if str(TOOL_DIR) not in sys.path:
    sys.path.insert(0, str(TOOL_DIR))

from xray_single import (  # type: ignore[import]
    sanitize_title,
    extract_video_id,
    summarize_transcript,
    run_xray_single,
)


def test_sanitize_title_basic():
    assert sanitize_title("Simple Title") == "Simple_Title"


def test_sanitize_title_strips_weird_chars():
    title = "My *cool* video: v1.0?"
    safe = sanitize_title(title)
    assert "cool" in safe
    assert "video" in safe
    assert "*" not in safe
    assert ":" not in safe
    assert "?" not in safe


def test_extract_video_id_standard_url():
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert extract_video_id(url) == "dQw4w9WgXcQ"


def test_extract_video_id_short_url():
    url = "https://youtu.be/dQw4w9WgXcQ"
    assert extract_video_id(url) == "dQw4w9WgXcQ"


def test_extract_video_id_missing_raises():
    with pytest.raises(ValueError, match="Cannot extract video ID"):
        extract_video_id("https://www.youtube.com/feed/trending")


class _FakeMessagesAPI:
    def __init__(self, text: str):
        self._text = text

    def create(self, **kwargs):
        return types.SimpleNamespace(content=[types.SimpleNamespace(text=self._text)])


class _FakeLLMClient:
    def __init__(self, text: str):
        self.messages = _FakeMessagesAPI(text)


def test_summarize_transcript_uses_client_injection():
    fake_client = _FakeLLMClient("Summary content")
    summary = summarize_transcript("dummy transcript", client=fake_client)
    assert summary == "Summary content"


def test_run_xray_single_creates_expected_files(tmp_path, monkeypatch):
    # Patch extract_transcript to avoid network calls in tests
    import xray_single as module  # type: ignore[import]

    def fake_extract_transcript(url: str):
        return "Test Video Title", "line one\nline two"

    monkeypatch.setattr(module, "extract_transcript", fake_extract_transcript)

    fake_client = _FakeLLMClient("Fake summary")

    output_dir = run_xray_single(
        "https://www.youtube.com/watch?v=dummy",
        output_root=tmp_path,
        client=fake_client,
    )

    assert output_dir.is_dir()
    transcript_path = output_dir / "transcript.md"
    summary_path = output_dir / "summary.md"

    assert transcript_path.exists()
    assert summary_path.exists()

    assert "line one" in transcript_path.read_text(encoding="utf-8")
    assert "Fake summary" in summary_path.read_text(encoding="utf-8")
