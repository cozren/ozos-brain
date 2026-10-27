# backend/services/knowledge.py
"""Knowledge Hub — read-only browse/search over the project's markdown corpus.

Sources are declared in `.ozos/knowledge-sources.json` (seeded with sensible
defaults on first read). All data paths are relative to the vault (`_ROOT`); only
the derived knowledge graph lives beside the engine (`_GRAPH_ROOT`).

NOTE: this is a different module from `services/knowledge_hub.py`, which is the
chat-tool service (Confluence + meeting-note lookups for the ChatPanel). Keep
them separate.
"""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path

from .frontmatter import join_frontmatter, split_frontmatter
from ..config import (
    REPO_ROOT as _GRAPH_ROOT,
    VAULT as _ROOT,
    KNOWLEDGE_HUB_DIR,
    OZOS_CONFIG_DIR,
    OZOS_KNOWLEDGE_COLORS,
    OZOS_KNOWLEDGE_FOLDER_TAGS,
    OZOS_KNOWLEDGE_OPENS,
    OZOS_KNOWLEDGE_ORDER,
    OZOS_KNOWLEDGE_SOURCES,
    OZOS_KNOWLEDGE_STARS,
)

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")


def _doc_sort_key(node: dict) -> tuple:
    """Descending sort key: leading YYYY-MM-DD in the name, else empty (sinks)."""
    m = _DATE_RE.match(node["name"])
    return (m.group(1) if m else "", node["name"])


def _doc_folders(meta: dict, physical_parent: str) -> list[str]:
    """Return the folder labels a doc belongs to.

    Uses meta['folders'] when non-empty; falls back to [physical_parent] so
    docs with no frontmatter still appear under their physical directory name.
    """
    return meta.get("folders") or [physical_parent]


# Custom source colours are stored as #rrggbb hex strings.
_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

# Markdown files are the browsable corpus.
_MD_SUFFIXES = {".md", ".markdown"}

# Path (as str) to the generated tag retrieval index.  Patchable in tests.
_TAG_INDEX_PATH = str(OZOS_CONFIG_DIR / "knowledge-tag-index.json")

# Image types served as assets (referenced from markdown).
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}

# Self-contained HTML documents (e.g. generated dashboards/visualisations).
# Rendered read-only in a sandboxed iframe by the frontend.
_HTML_SUFFIXES = {".html", ".htm"}


class KnowledgeAccessError(Exception):
    """Raised when a path request is denied. `status` maps to an HTTP code."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# Default extras — only sources OUTSIDE knowledge-hub/ (those are auto-discovered).
_DEFAULT_SOURCES: list[dict] = [
    {"id": "docs", "label": "Docs & PRDs", "path": "docs"},
]


def _label_from_name(name: str) -> str:
    """Derive a human-readable label from a folder name."""
    label = name.replace("-", " ").replace("_", " ").title()
    if label.startswith("Ai "):
        label = "AI " + label[3:]
    return label


def _discover_hub_sources(mode_overrides: dict[str, str] | None = None) -> list[dict]:
    """Return source entries for every direct subdirectory of knowledge-hub/, sorted alpha.

    `mode_overrides` maps source id → mode string (e.g. `{"meeting-notes": "labels"}`).
    Sources not in the map default to `"dir"`.
    """
    out: list[dict] = []
    try:
        entries = sorted(KNOWLEDGE_HUB_DIR.iterdir(), key=lambda p: p.name.lower())
    except OSError:
        return out
    for entry in entries:
        if entry.is_dir():
            name = entry.name
            sid = name.lower().replace(" ", "-").replace("_", "-")
            src: dict = {
                "id": sid,
                "label": _label_from_name(name),
                "path": f"knowledge-hub/{name}",
            }
            if mode_overrides:
                mode = mode_overrides.get(sid)
                if mode and mode != "dir":
                    src["mode"] = mode
            out.append(src)
    return out


# ── Source registry ───────────────────────────────────────────────────


def load_sources() -> list[dict]:
    """Return knowledge sources: auto-discovered hub dirs + registered extras.

    Extras are entries in `.ozos/knowledge-sources.json` whose path does NOT
    start with `knowledge-hub/` (e.g. `docs`). Hub subdirectories are discovered
    automatically — no JSON entry needed. If the registry file is absent the
    default extras are seeded to disk so the user has a reference format.

    The `mode` field (e.g. `"labels"`) is picked up from any matching JSON entry
    for a hub-subdirectory source and threaded into the auto-discovered dict.
    """
    mode_overrides: dict[str, str] = {}

    if OZOS_KNOWLEDGE_SOURCES.exists():
        try:
            data = json.loads(OZOS_KNOWLEDGE_SOURCES.read_text())
            raw = data.get("sources", [])
            # Collect mode overrides from hub-dir entries in the JSON.
            for s in raw:
                if s.get("path", "").startswith("knowledge-hub/") and s.get("mode"):
                    mode_overrides[s["id"]] = s["mode"]
            extras = [s for s in raw if not s.get("path", "").startswith("knowledge-hub/")]
        except Exception:
            extras = list(_DEFAULT_SOURCES)
    else:
        extras = list(_DEFAULT_SOURCES)
        try:
            OZOS_KNOWLEDGE_SOURCES.parent.mkdir(parents=True, exist_ok=True)
            OZOS_KNOWLEDGE_SOURCES.write_text(json.dumps({"sources": extras}, indent=2))
        except Exception:
            pass

    discovered = _discover_hub_sources(mode_overrides)
    return discovered + extras


# ── Tree ──────────────────────────────────────────────────────────────


def _build_node(abs_path: Path) -> dict | None:
    """Build a tree node for a file or directory, or None to skip it.

    Directories recurse (dirs first, then files newest-first by mtime). Markdown
    and image files are listed (image bytes are served via the asset endpoint);
    all other file types are skipped entirely.
    """
    rel = abs_path.relative_to(_ROOT).as_posix()
    try:
        st = abs_path.stat()
    except OSError:
        return None

    if abs_path.is_dir():
        return {
            "name": abs_path.name,
            "path": rel,
            "type": "dir",
            "mtime": st.st_mtime,
            "children": _build_children(abs_path),
        }

    suffix = abs_path.suffix.lower()
    if suffix in _MD_SUFFIXES or suffix in _IMAGE_SUFFIXES or suffix in _HTML_SUFFIXES:
        if suffix in _IMAGE_SUFFIXES:
            kind = "image"
        elif suffix in _HTML_SUFFIXES:
            kind = "html"
        else:
            kind = "markdown"
        return {
            "name": abs_path.name,
            "path": rel,
            "type": "file",
            "kind": kind,
            "mtime": st.st_mtime,
        }

    return None


def _build_children(directory: Path) -> list[dict]:
    """Children of a directory: dirs first (alpha), then files newest-first."""
    try:
        entries = list(directory.iterdir())
    except OSError:
        return []

    dirs: list[dict] = []
    files: list[dict] = []
    for entry in entries:
        node = _build_node(entry)
        if node is None:
            continue
        (dirs if node["type"] == "dir" else files).append(node)

    dirs.sort(key=lambda n: n["name"].lower())
    # Newest-first by leading YYYY-MM-DD in the filename (falls back to "" for
    # undated files, which sink to the bottom).  mtime is no longer used because
    # a bulk sync can rewrite every file and collapse all mtimes to today.
    files.sort(key=_doc_sort_key, reverse=True)
    return dirs + files


def _build_label_children(abs_dir: Path, source_rel: str) -> list[dict]:
    """Build virtual folder nodes for a label-mode source.

    Walks all markdown files under `abs_dir` recursively, reads their
    frontmatter, and buckets each file into every folder returned by
    `_doc_folders` (using the file's immediate parent directory name as the
    physical_parent fallback).  Each distinct label becomes a virtual dir-node
    whose `path` is a stable synthetic key (`<source_rel>#label/<label>`);
    file nodes keep their real root-relative path so the preview fetch works.

    Folders are sorted alphabetically; files within each folder are sorted
    date-desc via `_doc_sort_key`.
    """
    if not abs_dir.is_dir():
        return []

    # bucket: label → list of file-node dicts
    buckets: dict[str, list[dict]] = {}

    for md_path in abs_dir.rglob("*"):
        if not md_path.is_file() or md_path.suffix.lower() not in _MD_SUFFIXES:
            continue
        try:
            st = md_path.stat()
        except OSError:
            continue
        try:
            text = md_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        meta, _ = split_frontmatter(text)
        physical_parent = md_path.parent.name
        labels = _doc_folders(meta, physical_parent)

        rel = md_path.relative_to(_ROOT).as_posix()
        file_node = {
            "name": md_path.name,
            "path": rel,
            "type": "file",
            "kind": "markdown",
            "mtime": st.st_mtime,
        }

        for label in labels:
            buckets.setdefault(label, []).append(file_node)

    # Build sorted virtual dir-nodes
    result: list[dict] = []
    for label in sorted(buckets.keys(), key=str.lower):
        files = sorted(buckets[label], key=_doc_sort_key, reverse=True)
        result.append(
            {
                "name": label,
                "path": f"{source_rel}#label/{label}",
                "type": "dir",
                "mtime": files[0]["mtime"] if files else 0,
                "children": files,
            }
        )
    return result


def build_tree(sources: list[dict] | None = None) -> dict:
    """Build the full source tree.

    Each source becomes a top-level node `{id, label, children}` whose children
    are the nested dirs/markdown files under its (root-relative) path. Missing
    source directories yield empty children rather than an error.

    Ordering: if the user has saved a manual order (`.ozos/knowledge-order.json`)
    the cards follow it, with any source absent from the list dropped to the
    bottom. The unplaced tail (and the whole list when no manual order exists)
    falls back to 30-day open count desc, then label alpha for stability.
    """
    if sources is None:
        sources = load_sources()

    opens = load_opens()
    scores = source_scores(opens, sources)

    out: list[dict] = []
    for src in sources:
        abs_dir = _ROOT / src["path"]
        if src.get("mode") == "labels":
            children = _build_label_children(abs_dir, src["path"])
        else:
            children = _build_children(abs_dir) if abs_dir.is_dir() else []
        out.append(
            {
                "id": src["id"],
                "label": src["label"],
                "path": src["path"],
                "mode": src.get("mode", "dir"),
                "children": children,
            }
        )

    # Manual order wins for the sources it names; everything else falls to the
    # bottom, tail-sorted by frequency-then-alpha (the historical default).
    manual = load_order()
    rank = {sid: i for i, sid in enumerate(manual)}
    placed = len(manual)
    out.sort(
        key=lambda s: (
            rank.get(s["id"], placed),  # placed cards first, in manual order
            -scores.get(s["id"], 0),  # then most-opened
            s["label"].lower(),  # then alpha
        )
    )
    return {"sources": out}


# ── Starred documents ─────────────────────────────────────────────────


def load_stars() -> list[str]:
    """Return the list of starred document paths (root-relative).

    Returns an empty list if the stars file is missing or unreadable.
    """
    if not OZOS_KNOWLEDGE_STARS.exists():
        return []
    try:
        data = json.loads(OZOS_KNOWLEDGE_STARS.read_text())
        return list(data.get("starred", []))
    except Exception:
        return []


def set_star(rel_path: str, starred: bool) -> list[str]:
    """Star or unstar a document, persist, and return the updated star list.

    The path is validated against the registered source roots first, so a
    request that escapes the corpus raises KnowledgeAccessError(403). Starring
    is idempotent (a path appears at most once).
    """
    resolved, _ = _resolve_within_sources(rel_path)
    canonical = resolved.relative_to(_ROOT).as_posix()

    stars = load_stars()
    if starred:
        if canonical not in stars:
            stars.append(canonical)
    else:
        stars = [s for s in stars if s != canonical]

    try:
        OZOS_KNOWLEDGE_STARS.parent.mkdir(parents=True, exist_ok=True)
        OZOS_KNOWLEDGE_STARS.write_text(json.dumps({"starred": stars}, indent=2))
    except Exception:
        pass
    return stars


# ── Source colours ────────────────────────────────────────────────────


def load_colors() -> dict[str, str]:
    """Return the map of source id → custom hex colour ("#rrggbb").

    Empty dict if the file is missing or unreadable.
    """
    if not OZOS_KNOWLEDGE_COLORS.exists():
        return {}
    try:
        data = json.loads(OZOS_KNOWLEDGE_COLORS.read_text())
        return dict(data.get("colors", {}))
    except Exception:
        return {}


def set_color(source_id: str, color: str | None) -> dict[str, str]:
    """Set (or clear) a source's custom colour, persist, return the full map.

    `color` is a "#rrggbb" hex string (case-insensitive, stored lowercased);
    passing None or "" clears the override so the source falls back to its
    default palette colour. An invalid hex raises KnowledgeAccessError(400).
    """
    colors = load_colors()
    if color:
        if not _HEX_RE.match(color):
            raise KnowledgeAccessError(400, "Invalid colour; expected #rrggbb")
        colors[source_id] = color.lower()
    else:
        colors.pop(source_id, None)

    try:
        OZOS_KNOWLEDGE_COLORS.parent.mkdir(parents=True, exist_ok=True)
        OZOS_KNOWLEDGE_COLORS.write_text(json.dumps({"colors": colors}, indent=2))
    except Exception:
        pass
    return colors


# ── Manual card order ─────────────────────────────────────────────────


def load_order() -> list[str]:
    """Return the user's manual top-level card order (list of source ids).

    Empty list if the order file is missing or unreadable, in which case
    build_tree falls back to the open-frequency sort.
    """
    if not OZOS_KNOWLEDGE_ORDER.exists():
        return []
    try:
        data = json.loads(OZOS_KNOWLEDGE_ORDER.read_text())
        return [s for s in data.get("order", []) if isinstance(s, str)]
    except Exception:
        return []


def set_order(order: list[str]) -> list[str]:
    """Persist the manual card order (a list of source ids) and return it.

    Rejects a list containing any non-string entry with KnowledgeAccessError(400).
    """
    if not all(isinstance(s, str) for s in order):
        raise KnowledgeAccessError(400, "Order must be a list of source ids")
    try:
        OZOS_KNOWLEDGE_ORDER.parent.mkdir(parents=True, exist_ok=True)
        OZOS_KNOWLEDGE_ORDER.write_text(json.dumps({"order": order}, indent=2))
    except Exception:
        pass
    return order


# ── Folder creation ───────────────────────────────────────────────────


def _slugify(name: str) -> str:
    """Turn a display name into a safe directory slug.

    Lowercases, replaces whitespace/underscores with hyphens, drops anything
    outside [a-z0-9-], and collapses/strips repeated or edge hyphens. Returns
    "" when nothing usable remains.
    """
    s = name.strip().lower()
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"[^a-z0-9-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def create_folder(name: str, parent: str) -> str:
    """Create a new folder under knowledge-hub/; return its root-relative path.

    `parent` is a root-relative path that must resolve inside KNOWLEDGE_HUB_DIR
    (the hub root itself or any nested dir). `name` is slugified.

    Raises KnowledgeAccessError: 403 if the parent escapes the hub, 404 if the
    parent dir does not exist, 400 if the name slugifies to nothing, 409 if the
    target already exists.
    """
    hub = KNOWLEDGE_HUB_DIR.resolve()
    parent_abs = (_ROOT / parent).resolve()
    if parent_abs != hub and hub not in parent_abs.parents:
        raise KnowledgeAccessError(403, "Parent is outside knowledge-hub")
    if not parent_abs.is_dir():
        raise KnowledgeAccessError(404, "Parent folder not found")

    slug = _slugify(name)
    if not slug:
        raise KnowledgeAccessError(400, "Folder name is empty after sanitising")

    target = parent_abs / slug
    if target.exists():
        raise KnowledgeAccessError(409, "A folder with that name already exists")

    try:
        target.mkdir()
    except OSError as e:
        raise KnowledgeAccessError(400, f"Could not create folder: {e}")
    return target.relative_to(_ROOT).as_posix()


# ── Open tracking (rolling 30-day) ───────────────────────────────────

_THIRTY_DAYS = 30 * 24 * 3600


def load_opens() -> list[dict]:
    """Return open records from the last 30 days.

    Returns an empty list if the file is missing or unreadable.
    """
    if not OZOS_KNOWLEDGE_OPENS.exists():
        return []
    try:
        data = json.loads(OZOS_KNOWLEDGE_OPENS.read_text())
        cutoff = time.time() - _THIRTY_DAYS
        return [o for o in data.get("opens", []) if o.get("timestamp", 0) >= cutoff]
    except Exception:
        return []


def record_open(rel_path: str) -> None:
    """Record that a document was opened; prune entries older than 30 days.

    Validates the path against the registered source roots (same guard as
    stars) so out-of-bounds paths raise KnowledgeAccessError(403).
    """
    _resolve_within_sources(rel_path)
    cutoff = time.time() - _THIRTY_DAYS
    try:
        data = json.loads(OZOS_KNOWLEDGE_OPENS.read_text()) if OZOS_KNOWLEDGE_OPENS.exists() else {}
        opens = [o for o in data.get("opens", []) if o.get("timestamp", 0) >= cutoff]
    except Exception:
        opens = []
    opens.append({"path": rel_path, "timestamp": time.time()})
    try:
        OZOS_KNOWLEDGE_OPENS.parent.mkdir(parents=True, exist_ok=True)
        OZOS_KNOWLEDGE_OPENS.write_text(json.dumps({"opens": opens}))
    except Exception:
        pass


def source_scores(opens: list[dict], sources: list[dict]) -> dict[str, int]:
    """Return a {source_id: open_count} map for the given opens list."""
    scores: dict[str, int] = {s["id"]: 0 for s in sources}
    for o in opens:
        path = o.get("path", "")
        for src in sources:
            prefix = src["path"]
            if path == prefix or path.startswith(prefix + "/"):
                scores[src["id"]] = scores.get(src["id"], 0) + 1
                break
    return scores


# ── Knowledge graph projection ────────────────────────────────────────

# Auto-generated by graphify; we serve a trimmed projection for the graph view.
_GRAPH_REL = "graphify-out/graph.json"


def load_graph() -> dict:
    """Return a trimmed node-link projection of the graphify knowledge graph.

    Projects nodes to {id, label, file_type, source_file, community} and links
    to {source, target, relation} — enough to render and to map a node back to
    a knowledge document. Returns empty lists if the graph file is absent or
    unreadable (graphify may not have run yet).
    """
    path = _GRAPH_ROOT / _GRAPH_REL
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"nodes": [], "links": []}

    nodes = [
        {
            "id": n.get("id"),
            "label": n.get("label"),
            "file_type": n.get("file_type"),
            "source_file": n.get("source_file"),
            "community": n.get("community"),
        }
        for n in data.get("nodes", [])
    ]
    links = [
        {
            "source": e.get("source"),
            "target": e.get("target"),
            "relation": e.get("relation"),
        }
        for e in data.get("links", [])
    ]
    return {"nodes": nodes, "links": links}


# ── Path security + file/asset access ─────────────────────────────────


def _resolve_within_sources(rel_path: str) -> tuple[Path, str]:
    """Resolve a root-relative path and confirm it lives inside a source root.

    Returns (resolved_abs_path, source_id). Raises KnowledgeAccessError(403)
    for any path that escapes the registered source roots (kills `../` and
    absolute-path traversal). This check runs BEFORE suffix/existence checks so
    we never leak information about files outside the corpus.
    """
    resolved = (_ROOT / rel_path).resolve()
    for src in load_sources():
        root = (_ROOT / src["path"]).resolve()
        if resolved == root or root in resolved.parents:
            return resolved, src["id"]
    raise KnowledgeAccessError(403, "Path is outside the knowledge sources")


def read_file(rel_path: str) -> dict:
    """Return a document's metadata + content.

    Markdown returns its raw text in `content`; images return `kind="image"`
    with empty `content` (the bytes are fetched separately via the asset
    endpoint). 403 if outside sources, 400 if unsupported type, 404 if missing.
    """
    resolved, source_id = _resolve_within_sources(rel_path)
    suffix = resolved.suffix.lower()
    is_image = suffix in _IMAGE_SUFFIXES
    is_html = suffix in _HTML_SUFFIXES
    if suffix not in _MD_SUFFIXES and not is_image and not is_html:
        raise KnowledgeAccessError(400, "Unsupported file type")
    if not resolved.is_file():
        raise KnowledgeAccessError(404, "File not found")

    if is_image:
        # Image bytes are served via the asset endpoint, not inlined here.
        tags: list = []
        folders: list = []
        links: list = []
        confluence_url: str | None = None
        content = ""
    elif is_html:
        # Self-contained HTML doc: return raw markup for a sandboxed iframe.
        # No frontmatter/tag/folder parsing — HTML has no markdown metadata.
        tags = []
        folders = [resolved.parent.name]
        links = []
        confluence_url = None
        content = resolved.read_text(encoding="utf-8", errors="replace")
    else:
        content = resolved.read_text(encoding="utf-8", errors="replace")
        meta, _ = split_frontmatter(content)
        tags = meta.get("tags") or []
        links = meta.get("links") or []
        # `confluence:` points at the upstream Confluence page this doc summarises.
        # Only a plain string is a usable href — anything else is dropped.
        raw_confluence = meta.get("confluence")
        confluence_url = raw_confluence if isinstance(raw_confluence, str) else None
        raw_folders = meta.get("folders")
        if raw_folders:
            folders = raw_folders
        else:
            folders = [resolved.parent.name]

    if is_image:
        kind = "image"
    elif is_html:
        kind = "html"
    else:
        kind = "markdown"

    return {
        "path": resolved.relative_to(_ROOT).as_posix(),
        "name": resolved.name,
        "source_id": source_id,
        "mtime": resolved.stat().st_mtime,
        "kind": kind,
        "content": content,
        "tags": tags,
        "folders": folders,
        "links": links,
        "confluence_url": confluence_url,
        "folder_tags": folder_tags_for(resolved.relative_to(_ROOT).as_posix()),
    }


def resolve_asset(rel_path: str) -> Path:
    """Resolve an image asset path for serving.

    403 if outside sources, 400 if not an image type, 404 if missing.
    """
    resolved, _ = _resolve_within_sources(rel_path)
    if resolved.suffix.lower() not in _IMAGE_SUFFIXES:
        raise KnowledgeAccessError(400, "Not an image asset")
    if not resolved.is_file():
        raise KnowledgeAccessError(404, "Asset not found")
    return resolved


# ── Full-text search ──────────────────────────────────────────────────

_MAX_RESULTS = 50
_SNIPPET_RADIUS = 80  # chars on each side of the first match (~160 total)

# path -> (mtime, lowercased_content, lowercased_title, source_id)
_INDEX: dict[str, tuple] = {}


def _iter_md_files():
    """Yield (abs_path, source_id) for every markdown file under all sources."""
    for src in load_sources():
        base = _ROOT / src["path"]
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix.lower() in _MD_SUFFIXES:
                yield path, src["id"]


def _extract_title(content: str) -> str:
    """First markdown `# heading`, else the first non-empty line."""
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
        if stripped:
            return stripped
    return ""


def _refresh_index() -> dict[str, tuple]:
    """Refresh the module-level index by cheap mtime comparison.

    Only re-reads files whose mtime changed; prunes entries for files that no
    longer exist (so the cache can't leak across repos/tests).
    """
    current: dict[str, tuple] = {}
    for abs_path, source_id in _iter_md_files():
        rel = abs_path.relative_to(_ROOT).as_posix()
        try:
            mtime = abs_path.stat().st_mtime
        except OSError:
            continue
        cached = _INDEX.get(rel)
        if cached and cached[0] == mtime:
            current[rel] = cached
            continue
        try:
            text = abs_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        current[rel] = (mtime, text.lower(), _extract_title(text).lower(), source_id)
    _INDEX.clear()
    _INDEX.update(current)
    return current


def _make_snippet(rel: str, words: list[str]) -> str:
    """~160-char window around the first content match (original casing)."""
    try:
        text = (_ROOT / rel).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    lower = text.lower()
    pos = min((p for p in (lower.find(w) for w in words) if p >= 0), default=-1)
    if pos < 0:
        return text[: _SNIPPET_RADIUS * 2].strip()
    start = max(0, pos - _SNIPPET_RADIUS)
    end = min(len(text), pos + _SNIPPET_RADIUS)
    snippet = text[start:end].replace("\n", " ").strip()
    if start > 0:
        snippet = "…" + snippet
    if end < len(text):
        snippet = snippet + "…"
    return snippet


def _regen_tag_index() -> None:
    """Regenerate the tag index after a successful edit.

    Best-effort: any failure is logged and swallowed so it never breaks a save.
    """
    try:
        from . import tag_index as _ti

        _ti.write_tag_index(_TAG_INDEX_PATH)
    except Exception:
        logger.exception("tag index regen failed (non-fatal)")


def write_file(rel_path: str, content: str) -> dict:
    """Atomically write full markdown content to a document.

    The file must already exist (no creation). Returns a read_file-shaped dict.
    403 if outside sources, 400 if not markdown, 404 if missing.
    """
    resolved, _ = _resolve_within_sources(rel_path)
    if resolved.suffix.lower() not in _MD_SUFFIXES:
        raise KnowledgeAccessError(400, "Only markdown files are editable")
    if not resolved.is_file():
        raise KnowledgeAccessError(404, "File not found")
    tmp = resolved.with_suffix(resolved.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(resolved)
    _refresh_index()
    _regen_tag_index()
    return read_file(rel_path)


def update_meta(rel_path: str, *, tags=None, folders=None, links=None) -> dict:
    """Merge provided frontmatter fields into the document, preserving body and other fields.

    Only fields explicitly passed (not None) are updated. Returns a read_file-shaped dict.
    """
    resolved, _ = _resolve_within_sources(rel_path)
    meta, body = split_frontmatter(resolved.read_text(encoding="utf-8", errors="replace"))
    if tags is not None:
        meta["tags"] = tags
    if folders is not None:
        meta["folders"] = folders
    if links is not None:
        meta["links"] = links
    return write_file(rel_path, join_frontmatter(meta, body))


def load_folder_tag_map() -> dict:
    """Load the folder→tag mapping ({folder_rel_path: tag|None}); {} if missing/unreadable."""
    try:
        return json.loads(OZOS_KNOWLEDGE_FOLDER_TAGS.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except Exception:
        logger.warning("folder-tag map unreadable at %r; ignoring", str(OZOS_KNOWLEDGE_FOLDER_TAGS))
        return {}


def folder_tags_for(
    rel_path: str, tag_map: dict | None = None, sources: list | None = None
) -> list[str]:
    """Flat, de-duped tags a file inherits from its ancestor folders.

    Walks from the file's source root down to its immediate parent directory.
    For each ancestor folder (root-relative path): the tag is tag_map[folder]
    when that key is present (a string is used verbatim; None skips the folder),
    otherwise the folder's basename. Returns [] for files in a labels-mode
    source. Non-string/empty tags are dropped.

    `sources` lets a caller pass an already-resolved source list (e.g. a
    per-file loop rebuilding the tag index) so `load_sources()` — which reads
    JSON and scans the hub directory — isn't re-invoked on every call.
    """
    if tag_map is None:
        tag_map = load_folder_tag_map()
    if sources is None:
        sources = load_sources()
    resolved = (_ROOT / rel_path).resolve()
    # Find the owning source (root path + mode).
    src_root = None
    for src in sources:
        root = (_ROOT / src["path"]).resolve()
        if resolved == root or root in resolved.parents:
            if src.get("mode") == "labels":
                return []
            src_root = root
            break
    if src_root is None:
        return []
    # Ancestor folders from source root down to the file's parent, inclusive.
    folders: list[Path] = []
    cur = resolved.parent
    while True:
        folders.append(cur)
        if cur == src_root:
            break
        cur = cur.parent
    folders.reverse()  # outermost (source root) first
    out: list[str] = []
    seen: set[str] = set()
    for folder in folders:
        key = folder.relative_to(_ROOT).as_posix()
        if key in tag_map:
            tag = tag_map[key]
        else:
            tag = folder.name
        if isinstance(tag, str) and tag and tag not in seen:
            seen.add(tag)
            out.append(tag)
    return out


def all_tags() -> list[str]:
    """Return a sorted list of unique tags across all markdown docs in registered sources."""
    tags: set[str] = set()
    for abs_path, _ in _iter_md_files():
        try:
            text = abs_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        meta, _ = split_frontmatter(text)
        for tag in meta.get("tags") or []:
            if isinstance(tag, str) and tag:
                tags.add(tag)
    return sorted(tags)


def rename_file(rel_path: str, new_name: str) -> dict:
    """Rename a document within its directory; returns a read_file-shaped dict at the new path.

    Rejects names containing path separators, empty names, or a target that already exists.
    400 if the name is invalid, 409 if the target exists, 403/404 from _resolve_within_sources.
    """
    if "/" in new_name or "\\" in new_name or new_name in ("", ".", ".."):
        raise KnowledgeAccessError(400, "Invalid file name")
    resolved, _ = _resolve_within_sources(rel_path)
    if not new_name.lower().endswith(".md"):
        new_name += ".md"
    target = resolved.with_name(new_name)
    if target.exists():
        raise KnowledgeAccessError(409, "A file with that name already exists")
    resolved.rename(target)
    _refresh_index()
    _regen_tag_index()
    new_rel = target.relative_to(_ROOT).as_posix()
    return read_file(new_rel)


def move_file(rel_path: str, dest_dir: str) -> dict:
    """Move a file into another directory within the same source.

    Physically relocates the file (markdown or image) from its current
    directory into `dest_dir`; returns a read_file-shaped dict at the new path.

    400 if the destination is in a different source, 404 if the destination is
    not an existing directory (or the file is missing), 409 if a file of that
    name already exists there, 403 from _resolve_within_sources for paths
    outside the corpus. Dropping a file onto its own current directory is a
    no-op that returns it unchanged.
    """
    resolved, src_source = _resolve_within_sources(rel_path)
    if not resolved.is_file():
        raise KnowledgeAccessError(404, "File not found")
    dest_resolved, dest_source = _resolve_within_sources(dest_dir)
    if dest_source != src_source:
        raise KnowledgeAccessError(400, "Cannot move a file to a different source")
    if not dest_resolved.is_dir():
        raise KnowledgeAccessError(404, "Destination folder not found")
    if dest_resolved == resolved.parent:
        return read_file(resolved.relative_to(_ROOT).as_posix())
    target = dest_resolved / resolved.name
    if target.exists():
        raise KnowledgeAccessError(409, "A file with that name already exists there")
    resolved.rename(target)
    _refresh_index()
    _regen_tag_index()
    return read_file(target.relative_to(_ROOT).as_posix())


def _load_tag_index() -> dict:
    """Load the tag index from disk; return empty structure if missing or unreadable.

    Best-effort: errors are logged at debug/warning level so they are observable
    without ever breaking search.
    """
    try:
        text = Path(_TAG_INDEX_PATH).read_text(encoding="utf-8")
        data = json.loads(text)
        if isinstance(data, dict) and "by_path" in data:
            return data
        logger.warning("tag index at %r has unexpected structure; ignoring", _TAG_INDEX_PATH)
    except FileNotFoundError:
        logger.debug("tag index not found at %r; tag boost disabled", _TAG_INDEX_PATH)
    except Exception:
        logger.warning("failed to load tag index from %r", _TAG_INDEX_PATH, exc_info=True)
    return {"by_tag": {}, "by_path": {}}


# Tag-match bonus: enough to beat 20 body occurrences but less than a title hit.
_TAG_BOOST = 500.0


def search(query: str, limit: int = _MAX_RESULTS) -> dict:
    """Case-insensitive multi-word (AND) full-text search over the corpus.

    A document matches when every query word appears in its filename, title, or
    content. Ranking: filename hit > title hit > tag match > content occurrences;
    newer mtime breaks ties. Returns up to `limit` results with snippets.

    Tag boost: when the single-word query exactly matches an indexed tag for a
    document, that document receives a bonus score (_TAG_BOOST) so it ranks
    above documents that only mention the query term in body text.
    """
    words = query.lower().split()
    if not words:
        return {"results": []}

    # Load tag index for boost (best-effort; missing index → no boost, no error)
    tag_idx = _load_tag_index()
    by_path = tag_idx.get("by_path", {})

    index = _refresh_index()
    scored: list[tuple[float, float, dict]] = []

    for rel, (mtime, content, title, source_id) in index.items():
        name = rel.rsplit("/", 1)[-1].lower()
        score = 0.0
        matched_all = True
        for word in words:
            word_score = 0.0
            if word in name:
                word_score += 1000.0
            if word in title:
                word_score += 100.0
            occurrences = content.count(word)
            word_score += occurrences
            if word_score == 0.0:
                matched_all = False
                break
            score += word_score
        if not matched_all:
            continue

        # Tag boost: applied at most ONCE per document — a single _TAG_BOOST if
        # ANY query word exactly matches one of the doc's indexed tags.
        # Applying it once-per-matching-word would compound the boost for
        # multi-word queries (e.g. _TAG_BOOST*2 for "pricing strategy"), which
        # can exceed a filename hit and break the intended ranking.
        doc_tags_lower = [t.lower() for t in (by_path.get(rel) or [])]
        if any(word in doc_tags_lower for word in words):
            score += _TAG_BOOST

        scored.append(
            (
                score,
                mtime,
                {
                    "path": rel,
                    "name": rel.rsplit("/", 1)[-1],
                    "source_id": source_id,
                    "mtime": mtime,
                    "snippet": _make_snippet(rel, words),
                    "score": score,
                },
            )
        )

    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return {"results": [item for _, _, item in scored[:limit]]}
