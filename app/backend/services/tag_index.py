# backend/services/tag_index.py
"""Tag retrieval index for the Knowledge Hub.

Builds and persists a two-way index:
  - by_tag: {tag: [{path, title, date}, ...]}
  - by_path: {path: [tag, ...]}

Indexed fields: frontmatter tags, folders, people (first name, lowercased),
projects, topics, and derived folder tags.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

# These are patched in tests — resolved at call time, not import time.
from ..config import OZOS_CONFIG_DIR
from ..config import VAULT as _ROOT
from .frontmatter import split_frontmatter

# NOTE: load_sources, _MD_SUFFIXES, and _extract_title are NOT imported at
# module level.  knowledge.py lazily imports this module inside _regen_tag_index
# to avoid a circular import; if tag_index imported knowledge at module level,
# importing tag_index first would trigger the cycle.
#
# These five names are exposed via __getattr__ below so that:
#   • tests can still do `patch.object(ti, "load_sources", ...)` — patch.object
#     calls getattr() first (which hits __getattr__), then setattr() to install
#     the mock, and delattr() to restore; all three work correctly.
#   • build_tag_index references them as module-level lookups (via globals())
#     so the patched values are respected at call time.

_TAG_INDEX_PATH: Path = OZOS_CONFIG_DIR / "knowledge-tag-index.json"

_DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")

_LAZY_FROM_KNOWLEDGE = frozenset(
    {"load_sources", "_MD_SUFFIXES", "_extract_title", "folder_tags_for", "load_folder_tag_map"}
)


def __getattr__(name: str):
    """Lazily resolve knowledge-module symbols to avoid a circular import.

    Called by Python only when `name` is not found in the module's __dict__,
    so an active patch.object mock (which sets the name in __dict__) always
    takes precedence over this fallback.
    """
    if name in _LAZY_FROM_KNOWLEDGE:
        from . import knowledge as _k

        return getattr(_k, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def _derive_date(meta: dict, filename: str) -> str:
    """Return ISO date from frontmatter 'date', falling back to leading YYYY-MM-DD in filename."""
    d = meta.get("date")
    if d:
        return str(d)
    m = _DATE_RE.match(filename)
    return m.group(1) if m else ""


def _collect_tags_for_doc(meta: dict) -> list[str]:
    """Return all indexable tokens from a document's frontmatter."""
    tokens: list[str] = []

    # frontmatter tags (free-form)
    for t in meta.get("tags") or []:
        if isinstance(t, str) and t:
            tokens.append(t)

    # folders
    for f in meta.get("folders") or []:
        if isinstance(f, str) and f:
            tokens.append(f)

    # people — use first token of each name, lowercased
    for p in meta.get("people") or []:
        if isinstance(p, dict):
            name = (p.get("name") or "").strip()
        elif isinstance(p, str):
            name = p.strip()
        else:
            continue
        first = name.split()[0].lower() if name else ""
        if first:
            tokens.append(first)

    # projects
    for proj in meta.get("projects") or []:
        if isinstance(proj, str) and proj:
            tokens.append(proj)

    # topics
    for topic in meta.get("topics") or []:
        if isinstance(topic, str) and topic:
            tokens.append(topic)

    return tokens


def build_tag_index(sources: list[dict] | None = None) -> dict:
    """Scan all markdown files across sources and build the tag index.

    Returns:
        {
            "by_tag":  {tag: [{"path": str, "title": str, "date": str}, ...]},
            "by_path": {path: [tag, ...]},
        }
    """
    import sys as _sys

    _mod = _sys.modules[__name__]

    # Resolve via module attribute so active patch.object mocks are honoured.
    _load_sources = getattr(_mod, "load_sources")
    _md_suffixes = getattr(_mod, "_MD_SUFFIXES")
    _extract_title = getattr(_mod, "_extract_title")
    _folder_tags_for = getattr(_mod, "folder_tags_for")
    _load_folder_tag_map = getattr(_mod, "load_folder_tag_map")
    _tag_map = _load_folder_tag_map()

    if sources is None:
        sources = _load_sources()

    by_tag: dict[str, list[dict]] = {}
    by_path: dict[str, list[str]] = {}

    for src in sources:
        base = _ROOT / src["path"]
        if not base.is_dir():
            continue
        for abs_path in base.rglob("*"):
            if not abs_path.is_file() or abs_path.suffix.lower() not in _md_suffixes:
                continue
            try:
                text = abs_path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue

            meta, body = split_frontmatter(text)
            rel = abs_path.relative_to(_ROOT).as_posix()
            tokens = _collect_tags_for_doc(meta)
            tokens = tokens + _folder_tags_for(rel, _tag_map, sources)
            if not tokens:
                continue

            title = _extract_title(body)
            date = _derive_date(meta, abs_path.name)

            entry = {"path": rel, "title": title, "date": date}

            # Deduplicate tokens while preserving first-seen order
            seen: set[str] = set()
            unique_tokens: list[str] = []
            for t in tokens:
                if t not in seen:
                    seen.add(t)
                    unique_tokens.append(t)

            by_path[rel] = unique_tokens
            for token in unique_tokens:
                by_tag.setdefault(token, []).append(entry)

    return {"by_tag": by_tag, "by_path": by_path}


def write_tag_index(
    path: Path | str | None = None,
    sources: list[dict] | None = None,
) -> dict:
    """Build the tag index and write it atomically to `path`.

    Defaults to the module-level `_TAG_INDEX_PATH` constant so a call from any
    working directory writes to the correct absolute location.  The write is
    atomic: data is written to a .tmp file first, then renamed over the target.
    Returns the index dict.
    """
    out = Path(path) if path is not None else _TAG_INDEX_PATH
    idx = build_tag_index(sources=sources)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(out.suffix + ".tmp")
    tmp.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(out)
    return idx
