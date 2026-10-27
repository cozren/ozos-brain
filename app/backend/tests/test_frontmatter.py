# backend/tests/test_frontmatter.py
from backend.services.frontmatter import split_frontmatter, join_frontmatter


def test_split_roundtrip():
    text = "---\ndate: '2026-06-29'\ntags:\n- a\n---\n# Title\n\nBody\n"
    meta, body = split_frontmatter(text)
    assert meta["tags"] == ["a"]
    assert body.strip().startswith("# Title")
    again = join_frontmatter(meta, body)
    assert split_frontmatter(again)[0] == meta


def test_no_frontmatter():
    assert split_frontmatter("# just body")[0] == {}


def test_empty_frontmatter_returns_empty_dict():
    text = "---\n---\n# Body\n"
    meta, body = split_frontmatter(text)
    assert meta == {}
    assert "Body" in body


def test_join_empty_meta_returns_body_unchanged():
    body = "# Title\n\nSome content\n"
    assert join_frontmatter({}, body) == body


def test_join_preserves_field_order():
    meta = {"date": "2026-06-29", "tags": ["a", "b"], "folders": ["Jordan"]}
    body = "# Title\n"
    result = join_frontmatter(meta, body)
    assert result.startswith("---\n")
    # date must come before tags in the output (sort_keys=False)
    date_pos = result.index("date:")
    tags_pos = result.index("tags:")
    assert date_pos < tags_pos


def test_split_roundtrip_when_value_contains_literal_fence_string():
    # Regression test: split_frontmatter used to find fences via a bare
    # substring search (text.split("---", 2)). yaml.dump must quote a tag
    # value that is literally "---" (e.g. '---') because unquoted it would be
    # a YAML document-start marker — and that quoted "---" inside the meta
    # block was itself matched as the closing fence, truncating the YAML
    # mid-token and raising a ScannerError. Fences are now matched as whole
    # lines, so an embedded "---" inside a value no longer confuses the split.
    meta = {"tags": ["a", "---"]}
    body = "# real body\n"
    text = join_frontmatter(meta, body)
    parsed_meta, parsed_body = split_frontmatter(text)  # must not raise
    assert parsed_meta == meta
    assert parsed_body == body


def test_split_roundtrip_when_value_is_multiline_quoted_scalar():
    # Regression test: a multi-line quoted scalar's indented continuation
    # line (e.g. "  ---") must not be mistaken for a fence either — only an
    # unindented, exact "---" line closes the frontmatter block.
    meta = {"tags": ["b]\n---\n\n# fake\n\ninjected"]}
    body = "# real body\n\nthe actual content\n"
    text = join_frontmatter(meta, body)
    parsed_meta, parsed_body = split_frontmatter(text)  # must not raise
    assert parsed_meta == meta
    assert parsed_body == body
