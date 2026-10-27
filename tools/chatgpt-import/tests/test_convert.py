"""
Tests for tools/chatgpt-import/convert.py core parsing functions.
"""

import json
import sys
from pathlib import Path

import pytest

# Make the tool importable without installing
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "tools" / "chatgpt-import"))
from convert import (
    extract_messages,
    extract_text,
    format_markdown,
    load_conversations,
    output_filename,
    slugify_title,
)


# ── extract_text ────────────────────────────────────────────────────────────


def test_extract_text_plain_parts():
    content = {"content_type": "text", "parts": ["Hello world"]}
    assert extract_text(content) == "Hello world"


def test_extract_text_multiple_parts():
    content = {"content_type": "text", "parts": ["Line one", "Line two"]}
    assert extract_text(content) == "Line one\nLine two"


def test_extract_text_empty_parts():
    content = {"content_type": "text", "parts": []}
    assert extract_text(content) == ""


def test_extract_text_whitespace_only_parts():
    content = {"content_type": "text", "parts": ["   ", ""]}
    assert extract_text(content) == ""


def test_extract_text_non_text_content_type():
    content = {"content_type": "image", "parts": ["some data"]}
    assert extract_text(content) == ""


def test_extract_text_none():
    assert extract_text(None) == ""


def test_extract_text_plain_string():
    assert extract_text("just a string") == "just a string"


# ── slugify_title ────────────────────────────────────────────────────────────


def test_slugify_basic():
    assert slugify_title("Hello World") == "Hello-World"


def test_slugify_special_chars():
    result = slugify_title("What's up? It's a test!")
    assert "?" not in result
    assert "'" not in result


def test_slugify_multiple_spaces():
    assert slugify_title("hello   world") == "hello-world"


def test_slugify_long_title():
    long = "A" * 100
    result = slugify_title(long)
    assert len(result) <= 80


def test_slugify_empty():
    assert slugify_title("") == ""


# ── extract_messages ────────────────────────────────────────────────────────


def _make_mapping(*messages):
    """Build a minimal mapping dict from a list of (role, text) tuples."""
    nodes = {}
    ids = [f"node-{i}" for i in range(len(messages) + 1)]

    # Root node (no message)
    nodes[ids[0]] = {
        "id": ids[0],
        "parent": None,
        "children": [ids[1]] if messages else [],
        "message": None,
    }

    for i, (role, text) in enumerate(messages):
        node_id = ids[i + 1]
        parent_id = ids[i]
        child_id = ids[i + 2] if i + 2 < len(ids) else None
        nodes[node_id] = {
            "id": node_id,
            "parent": parent_id,
            "children": [child_id] if child_id else [],
            "message": {
                "author": {"role": role},
                "content": {"content_type": "text", "parts": [text]},
                "create_time": 1700000000.0,
            },
        }
    return nodes


def test_extract_messages_basic():
    mapping = _make_mapping(("user", "Hi there"), ("assistant", "Hello!"))
    msgs = extract_messages(mapping)
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[0]["text"] == "Hi there"
    assert msgs[1]["role"] == "assistant"
    assert msgs[1]["text"] == "Hello!"


def test_extract_messages_skips_empty():
    mapping = _make_mapping(("user", ""), ("assistant", "Response"))
    msgs = extract_messages(mapping)
    assert len(msgs) == 1
    assert msgs[0]["role"] == "assistant"


def test_extract_messages_skips_tool_role():
    mapping = _make_mapping(("tool", "tool output"), ("user", "ask"), ("assistant", "ans"))
    msgs = extract_messages(mapping)
    roles = [m["role"] for m in msgs]
    assert "tool" not in roles
    assert len(msgs) == 2


def test_extract_messages_empty_mapping():
    assert extract_messages({}) == []


# ── output_filename ──────────────────────────────────────────────────────────


def test_output_filename_format():
    conv = {"title": "My Cool Chat", "create_time": 1700000000.0}
    name = output_filename(conv)
    assert name.endswith(".md")
    # Date part should be YYYY-MM-DD
    assert name[:10].count("-") == 2
    assert "My-Cool-Chat" in name


def test_output_filename_no_create_time():
    conv = {"title": "No Date"}
    name = output_filename(conv)
    assert name.startswith("0000-00-00")


# ── format_markdown ──────────────────────────────────────────────────────────


def test_format_markdown_contains_title():
    conv = {"title": "Test Convo", "create_time": 1700000000.0}
    msgs = [{"role": "user", "text": "Hello", "create_time": None}]
    md = format_markdown(conv, msgs)
    assert "# Test Convo" in md


def test_format_markdown_contains_message_labels():
    conv = {"title": "T", "create_time": 1700000000.0}
    msgs = [
        {"role": "user", "text": "Hi", "create_time": None},
        {"role": "assistant", "text": "Hey", "create_time": None},
    ]
    md = format_markdown(conv, msgs)
    assert "**You:**" in md
    assert "**ChatGPT:**" in md


def test_format_markdown_message_count():
    conv = {"title": "T", "create_time": 1700000000.0}
    msgs = [{"role": "user", "text": f"msg{i}", "create_time": None} for i in range(3)]
    md = format_markdown(conv, msgs)
    assert "**Messages:** 3" in md


# ── load_conversations (integration) ────────────────────────────────────────


def test_load_conversations(tmp_path):
    data = [{"id": "a", "title": "T1"}, {"id": "b", "title": "T2"}]
    (tmp_path / "conversations-000.json").write_text(json.dumps(data))
    result = load_conversations(tmp_path)
    assert len(result) == 2
    assert result[0]["title"] == "T1"


def test_load_conversations_multiple_files(tmp_path):
    for i in range(3):
        (tmp_path / f"conversations-00{i}.json").write_text(json.dumps([{"id": str(i)}]))
    result = load_conversations(tmp_path)
    assert len(result) == 3


def test_load_conversations_no_files(tmp_path):
    result = load_conversations(tmp_path)
    assert result == []
