import argparse
import os
import sys
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, parse_qs

import anthropic
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi

# Shared LLM client (skills/)
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "skills"))
import ozos_llm  # noqa: E402
import ozos_vault  # noqa: E402


def sanitize_title(title: str) -> str:
    """
    Convert a video title into a filesystem-safe directory name.
    """
    safe = "".join(c if c.isalnum() or c in ("-", "_", " ") else " " for c in title)
    safe = "_".join(part for part in safe.strip().split() if part)
    return safe or "video"


def load_llm_client() -> anthropic.Anthropic:
    """Create the shared Anthropic client (credentials from the vault .env)."""
    return ozos_llm.make_client(timeout=120.0)


def extract_video_id(url: str) -> str:
    """
    Extract the YouTube video ID from a URL.
    """
    parsed = urlparse(url)
    if parsed.hostname in ("youtu.be",):
        return parsed.path[1:]
    qs = parse_qs(parsed.query)
    ids = qs.get("v", [])
    if not ids:
        raise ValueError(f"Cannot extract video ID from URL: {url}")
    return ids[0]


def extract_transcript(url: str) -> tuple[str, str]:
    """
    Use yt-dlp for the video title and youtube-transcript-api for the transcript.
    Returns (title, transcript_text).
    """
    print("[1/4] Fetching video title...")
    ydl_opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
    title = info.get("title") or "video"

    print("[2/4] Fetching transcript...")
    video_id = extract_video_id(url)
    ytt_api = YouTubeTranscriptApi()
    fetched = ytt_api.fetch(video_id)
    chunks = fetched.snippets
    transcript_text = " ".join(snippet.text for snippet in chunks)
    if not transcript_text.strip():
        raise RuntimeError("Transcript appears to be empty.")

    return title, transcript_text


def save_markdown(path: Path, content: str) -> None:
    """
    Save text content to a Markdown file, creating parent directories if needed.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def summarize_transcript(transcript: str, client: Optional[anthropic.Anthropic] = None) -> str:
    """
    Ask Claude to summarise a transcript into key learnings and actions.
    """
    if client is None:
        client = load_llm_client()

    prompt = (
        "You are analysing a single YouTube video transcript.\n\n"
        "Produce a concise Markdown summary with these sections:\n\n"
        "1. Key Learnings\n"
        "   - Bullet list of the most important ideas.\n\n"
        "2. Exact Actionable Steps\n"
        "   - Numbered list of concrete steps the viewer could take.\n\n"
        "3. Commands, Links, Tools, and Resources Mentioned\n"
        "   - Bullet list capturing any commands, URLs, tools, APIs, or files referenced.\n\n"
        "4. Notable Quotes (optional)\n"
        "   - Bullet list of short direct quotes where wording matters.\n\n"
        "Be specific and avoid vague advice. Preserve technical detail where useful.\n\n"
        "Here is the raw transcript:\n\n"
        "----- TRANSCRIPT START -----\n"
        f"{transcript}\n"
        "----- TRANSCRIPT END -----\n"
    )

    summary = ozos_llm.complete(
        client,
        system="You summarise technical YouTube videos into precise, actionable notes.",
        user=prompt,
        max_tokens=4000,
        temperature=0.2,
    )
    if not summary:
        raise RuntimeError("The model returned an empty summary.")
    return summary


def run_xray_single(
    url: str, output_root: Optional[Path] = None, client: Optional[anthropic.Anthropic] = None
) -> Path:
    """
    End-to-end pipeline for a single video; returns the output directory path.
    """
    if output_root is None:
        output_root = ozos_vault.vault_dir() / "knowledge-hub" / "ai-learning"

    title, transcript = extract_transcript(url)

    safe_title = sanitize_title(title)
    video_dir = output_root / safe_title

    transcript_path = video_dir / "transcript.md"
    summary_path = video_dir / "summary.md"

    print(f"[3/4] Transcript saved to {transcript_path}")
    save_markdown(transcript_path, transcript)

    print("[4/4] Calling Claude API for summary...")
    summary = summarize_transcript(transcript, client=client)

    print(f"[5/5] Summary saved to {summary_path}")
    save_markdown(summary_path, summary)

    print(f"Done! Output saved to {video_dir}/")
    return video_dir


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    """
    Parse command-line arguments for the xray_single script.
    """
    parser = argparse.ArgumentParser(
        description="Extract transcript and AI summary for a single YouTube video.",
    )
    parser.add_argument(
        "url",
        help="Full YouTube video URL (e.g. https://www.youtube.com/watch?v=...)",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> None:
    """
    CLI entrypoint for processing a single YouTube video.
    """
    args = parse_args(argv)
    run_xray_single(args.url)


if __name__ == "__main__":
    main(sys.argv[1:])
