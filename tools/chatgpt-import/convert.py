"""
Convert ChatGPT data export JSON files to Markdown conversation files.

Usage:
    python convert.py <source_folder> [--output <output_folder>]
"""

import os
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "skills"))
import ozos_vault  # noqa: E402

DEFAULT_OUTPUT = ozos_vault.vault_dir() / "knowledge-hub" / "ai-history" / "chatgpt"

ROLE_LABELS = {
    "user": "**You:**",
    "assistant": "**ChatGPT:**",
}


def load_conversations(source_folder: Path) -> list[dict]:
    """Load all conversations from conversations-*.json files in the source folder."""
    files = sorted(source_folder.glob("conversations-*.json"))
    conversations = []
    for f in files:
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list):
            conversations.extend(data)
    return conversations


def extract_messages(mapping: dict) -> list[dict]:
    """Extract ordered messages from a conversation mapping, skipping empty ones.

    Walks the linked-list structure (parent/children) to produce messages in
    chronological order, keeping only user and assistant messages with content.
    """
    # Build id -> node lookup
    nodes = {k: v for k, v in mapping.items()}

    # Find root (node with no parent or parent == None)
    root_id = None
    for node_id, node in nodes.items():
        if not node.get("parent"):
            root_id = node_id
            break

    if root_id is None:
        return []

    # Walk the tree depth-first following the first child (linear conversation)
    ordered = []
    visited = set()
    stack = [root_id]
    while stack:
        current_id = stack.pop()
        if current_id in visited:
            continue
        visited.add(current_id)
        node = nodes.get(current_id)
        if not node:
            continue
        msg = node.get("message")
        if msg:
            ordered.append(msg)
        # Push children in reverse so first child is processed first
        children = node.get("children", [])
        for child_id in reversed(children):
            stack.append(child_id)

    messages = []
    for msg in ordered:
        role = msg.get("author", {}).get("role", "")
        if role not in ROLE_LABELS:
            continue
        content = msg.get("content", {})
        text = extract_text(content)
        if not text:
            continue
        create_time = msg.get("create_time")
        messages.append({"role": role, "text": text, "create_time": create_time})

    return messages


def extract_text(content: dict | str) -> str:
    """Extract plain text from a message content object.

    Handles the common 'text' content_type with 'parts' list. Returns empty
    string for non-text content types (images, code output, etc.).
    """
    if not content:
        return ""
    if isinstance(content, str):
        return content.strip()
    content_type = content.get("content_type", "text")
    if content_type != "text":
        return ""
    parts = content.get("parts", [])
    text_parts = [p for p in parts if isinstance(p, str) and p.strip()]
    return "\n".join(text_parts).strip()


def slugify_title(title: str) -> str:
    """Convert a conversation title to a safe filename slug."""
    title = title.strip()
    title = re.sub(r"[^\w\s-]", "", title)
    title = re.sub(r"[\s]+", "-", title)
    title = re.sub(r"-+", "-", title)
    return title[:80].strip("-")


def format_markdown(conversation: dict, messages: list[dict]) -> str:
    """Render a conversation as a Markdown string with header and message body."""
    title = conversation.get("title", "Untitled")
    create_time = conversation.get("create_time")
    date_str = (
        datetime.fromtimestamp(create_time, tz=timezone.utc).strftime("%Y-%m-%d")
        if create_time
        else "unknown"
    )

    lines = [
        f"# {title}",
        "",
        f"**Date:** {date_str}  ",
        f"**Messages:** {len(messages)}",
        "",
        "---",
        "",
    ]

    for msg in messages:
        label = ROLE_LABELS[msg["role"]]
        lines.append(f"{label} {msg['text']}")
        lines.append("")

    return "\n".join(lines)


def output_filename(conversation: dict) -> str:
    """Build the output filename: YYYY-MM-DD_slug.md"""
    create_time = conversation.get("create_time")
    date_str = (
        datetime.fromtimestamp(create_time, tz=timezone.utc).strftime("%Y-%m-%d")
        if create_time
        else "0000-00-00"
    )
    title = conversation.get("title", "untitled")
    slug = slugify_title(title)
    return f"{date_str}_{slug}.md"


def convert_all(source_folder: Path, output_folder: Path) -> tuple[int, int]:
    """Convert all conversations from source_folder and write .md files to output_folder.

    Returns (processed, skipped) counts.
    """
    output_folder.mkdir(parents=True, exist_ok=True)
    conversations = load_conversations(source_folder)

    processed = 0
    skipped = 0

    for conv in conversations:
        mapping = conv.get("mapping", {})
        messages = extract_messages(mapping)
        if not messages:
            skipped += 1
            continue

        md = format_markdown(conv, messages)
        filename = output_filename(conv)
        out_path = output_folder / filename
        out_path.write_text(md, encoding="utf-8")
        processed += 1

    return processed, skipped


def main():
    """Entry point: parse args and run the conversion."""
    parser = argparse.ArgumentParser(description="Convert ChatGPT export JSON to Markdown files.")
    parser.add_argument("source", type=Path, help="Folder containing conversations-*.json files")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output folder (default: {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args()

    if not args.source.is_dir():
        print(f"Error: source folder '{args.source}' does not exist.", file=sys.stderr)
        sys.exit(1)

    print(f"Reading from: {args.source}")
    print(f"Writing to:   {args.output}")

    processed, skipped = convert_all(args.source, args.output)

    print(f"\nDone. Processed: {processed}  Skipped (empty): {skipped}")


if __name__ == "__main__":
    main()
