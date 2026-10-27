# backend/services/frontmatter.py
"""Frontmatter parse/serialize helpers for Knowledge Hub documents.

Markdown frontmatter is YAML between `---` fences (standard Hugo/Jekyll format).
Field order is preserved on rewrite (`sort_keys=False`).
"""

import yaml


def split_frontmatter(text: str) -> tuple[dict, str]:
    """Split a markdown document into (frontmatter_dict, body).

    Returns ({}, text) if no valid `---` fences are found.

    Fences are matched as whole lines (exactly "---", no leading/trailing
    content), not as a bare substring search — a substring search would
    misfire whenever a YAML-quoted value happens to *contain* "---" (e.g. a
    tag whose value is literally "---", or a multi-line quoted scalar whose
    indented continuation line is "  ---"), splitting the document at the
    wrong point and feeding truncated, invalid YAML to the loader.
    """
    if text.startswith("---"):
        lines = text.split("\n")
        if lines[0] == "---":
            for i in range(1, len(lines)):
                if lines[i] == "---":
                    meta_text = "\n".join(lines[1:i])
                    body = "\n".join(lines[i + 1 :])
                    return (yaml.safe_load(meta_text) or {}), body.lstrip("\n")
    return {}, text


def join_frontmatter(meta: dict, body: str) -> str:
    """Combine a frontmatter dict and body back into a markdown document.

    If `meta` is empty, returns `body` unchanged (no fences added).
    Uses `sort_keys=False, allow_unicode=True` to preserve field order.
    """
    if not meta:
        return body
    return f"---\n{yaml.dump(meta, allow_unicode=True, sort_keys=False)}---\n\n{body}"
