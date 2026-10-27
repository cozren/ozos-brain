# backend/tests/test_tag_index.py
"""Tests for the tag retrieval index generator (Phase 4, Task 4.1)."""

import importlib
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.services import tag_index as ti
from backend.services import knowledge as svc


# ── Fixture helpers ────────────────────────────────────────────────────


def _make_corpus(tmp_path: Path) -> tuple[Path, list[dict]]:
    """Build a small test corpus under tmp_path with varied frontmatter."""
    # doc1: has tags, people, folders, projects, topics
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "2026-06-01 — Pricing Review.md").write_text(
        "---\n"
        "date: '2026-06-01'\n"
        "tags:\n- pricing\n- strategy\n"
        "folders:\n- Jordan\n"
        "people:\n- name: Jordan Park\n- name: Taylor Lee\n"
        "projects:\n- growth-initiative\n"
        "topics:\n- revenue\n"
        "---\n# Pricing Review\n\nBody text here.\n",
        encoding="utf-8",
    )
    # doc2: different tags, only body text mentioning "pricing" once (no tag)
    (tmp_path / "kh" / "2026-06-15 — General Notes.md").write_text(
        "---\n"
        "date: '2026-06-15'\n"
        "tags:\n- team-sync\n"
        "folders:\n- Casey\n"
        "people:\n- name: Casey Smith\n"
        "---\n# General Notes\n\nA brief mention of pricing in the body.\n",
        encoding="utf-8",
    )
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    return tmp_path, sources


def _patch_sources(tmp_path: Path, sources: list[dict]):
    """Patch _ROOT and load_sources for knowledge service."""
    return (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
        patch.object(svc, "load_sources", lambda: sources),
        patch.object(ti, "_ROOT", tmp_path),
        patch.object(ti, "load_sources", lambda: sources),
    )


# ── build_tag_index ────────────────────────────────────────────────────


def test_build_tag_index_by_tag_contains_tagged_doc(tmp_path):
    """by_tag['pricing'] lists the doc tagged with 'pricing'."""
    root, sources = _make_corpus(tmp_path)
    p1, p2, p3, p4, p5 = _patch_sources(root, sources)
    with p1, p2, p3, p4, p5:
        idx = ti.build_tag_index(sources)
    assert "pricing" in idx["by_tag"]
    paths = [entry["path"] for entry in idx["by_tag"]["pricing"]]
    assert any("Pricing Review" in p for p in paths)


def test_build_tag_index_by_path_lists_tags(tmp_path):
    """by_path[doc] lists all the doc's tags."""
    root, sources = _make_corpus(tmp_path)
    p1, p2, p3, p4, p5 = _patch_sources(root, sources)
    with p1, p2, p3, p4, p5:
        idx = ti.build_tag_index(sources)
    # Find the pricing doc path
    pricing_path = next((p for p in idx["by_path"] if "Pricing Review" in p), None)
    assert pricing_path is not None
    tags = idx["by_path"][pricing_path]
    assert "pricing" in tags
    assert "strategy" in tags


def test_build_tag_index_indexes_people_names(tmp_path):
    """People's names (first token lowercase) are indexed as tags."""
    root, sources = _make_corpus(tmp_path)
    p1, p2, p3, p4, p5 = _patch_sources(root, sources)
    with p1, p2, p3, p4, p5:
        idx = ti.build_tag_index(sources)
    # "Jordan Park" → first name "jordan"
    assert "jordan" in idx["by_tag"]
    jordan_paths = [e["path"] for e in idx["by_tag"]["jordan"]]
    assert any("Pricing Review" in p for p in jordan_paths)


def test_build_tag_index_indexes_folders(tmp_path):
    """Folder names from the frontmatter 'folders' list are indexed as tags."""
    root, sources = _make_corpus(tmp_path)
    p1, p2, p3, p4, p5 = _patch_sources(root, sources)
    with p1, p2, p3, p4, p5:
        idx = ti.build_tag_index(sources)
    assert "Jordan" in idx["by_tag"]
    assert any("Pricing Review" in e["path"] for e in idx["by_tag"]["Jordan"])


def test_build_tag_index_indexes_projects_and_topics(tmp_path):
    """Projects and topics from frontmatter are indexed as tags."""
    root, sources = _make_corpus(tmp_path)
    p1, p2, p3, p4, p5 = _patch_sources(root, sources)
    with p1, p2, p3, p4, p5:
        idx = ti.build_tag_index(sources)
    assert "growth-initiative" in idx["by_tag"]
    assert "revenue" in idx["by_tag"]


def test_build_tag_index_entry_has_path_title_date(tmp_path):
    """Each entry in by_tag has path, title, date fields."""
    root, sources = _make_corpus(tmp_path)
    p1, p2, p3, p4, p5 = _patch_sources(root, sources)
    with p1, p2, p3, p4, p5:
        idx = ti.build_tag_index(sources)
    entry = idx["by_tag"]["pricing"][0]
    assert "path" in entry
    assert "title" in entry
    assert "date" in entry
    # date comes from frontmatter
    assert entry["date"] == "2026-06-01"
    # title comes from # heading
    assert "Pricing Review" in entry["title"]


def test_build_tag_index_date_falls_back_to_filename(tmp_path):
    """When no 'date' in frontmatter, date is parsed from the leading YYYY-MM-DD in filename."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "2026-06-20 — No Date Field.md").write_text(
        "---\ntags:\n- x\n---\n# No Date Field\n",
        encoding="utf-8",
    )
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2, p3, p4, p5 = _patch_sources(tmp_path, sources)
    with p1, p2, p3, p4, p5:
        idx = ti.build_tag_index(sources)
    entry = idx["by_tag"]["x"][0]
    assert entry["date"] == "2026-06-20"


def test_build_tag_index_returns_expected_structure(tmp_path):
    """build_tag_index returns exactly {by_tag: {...}, by_path: {...}}."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("---\ntags:\n- t\n---\n# A\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2, p3, p4, p5 = _patch_sources(tmp_path, sources)
    with p1, p2, p3, p4, p5:
        idx = ti.build_tag_index(sources)
    assert set(idx.keys()) == {"by_tag", "by_path"}
    assert isinstance(idx["by_tag"], dict)
    assert isinstance(idx["by_path"], dict)


# ── write_tag_index ────────────────────────────────────────────────────


def test_write_tag_index_writes_json_file(tmp_path):
    """write_tag_index persists the index to disk as valid JSON."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("---\ntags:\n- pricing\n---\n# A\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    index_file = tmp_path / ".ozos" / "knowledge-tag-index.json"
    p1, p2, p3, p4, p5 = _patch_sources(tmp_path, sources)
    with p1, p2, p3, p4, p5:
        result = ti.write_tag_index(str(index_file), sources=sources)
    assert index_file.exists()
    on_disk = json.loads(index_file.read_text(encoding="utf-8"))
    assert "by_tag" in on_disk
    assert "pricing" in on_disk["by_tag"]
    # returned dict matches what was written
    assert result == on_disk


def test_write_tag_index_atomic_write(tmp_path):
    """write_tag_index leaves no .tmp file behind after success."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("---\ntags:\n- x\n---\n# A\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    index_file = tmp_path / ".ozos" / "knowledge-tag-index.json"
    p1, p2, p3, p4, p5 = _patch_sources(tmp_path, sources)
    with p1, p2, p3, p4, p5:
        ti.write_tag_index(str(index_file), sources=sources)
    tmp_files = list((tmp_path / ".ozos").glob("*.tmp"))
    assert tmp_files == []


# ── Circular import safety (#1) ────────────────────────────────────────


def test_import_tag_index_without_knowledge_first(tmp_path):
    """Importing tag_index BEFORE knowledge must not raise ImportError.

    This guards against the circular-import bug where tag_index.py had a
    top-level 'from .knowledge import ...' that created a one-sided cycle.
    We verify by importing tag_index in a clean importlib context and then
    calling build_tag_index on a fixture corpus — if the lazy import is
    working correctly, no ImportError is raised.
    """
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text(
        "---\ntags:\n- safe\n---\n# Safe Import\n", encoding="utf-8"
    )
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]

    # Reload tag_index from scratch — this is the critical assertion: it must
    # succeed even without knowledge having been imported first.
    fresh_ti = importlib.import_module("backend.services.tag_index")
    importlib.reload(fresh_ti)

    p1, p2, p3, p4, p5 = _patch_sources(tmp_path, sources)
    with p1, p2, p3, p4, p5:
        # patch the reloaded module's own _ROOT and load_sources
        with patch.object(fresh_ti, "_ROOT", tmp_path):
            idx = fresh_ti.build_tag_index(sources)
    assert "safe" in idx["by_tag"]


# ── String-form people entry (#6) ──────────────────────────────────────


def test_index_includes_derived_folder_tags(tmp_path):
    """A dir-mode doc with no frontmatter tags is indexed under its derived folder tags."""
    (tmp_path / "kh" / "DMP").mkdir(parents=True)
    (tmp_path / "kh" / "DMP" / "a.md").write_text("# Title\nbody", encoding="utf-8")
    cfg = tmp_path / "folder-tags.json"
    cfg.write_text(json.dumps({"kh": "Ads", "kh/DMP": "DMP"}), encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    with (
        patch.object(ti, "_ROOT", tmp_path),
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "load_sources", lambda: sources),
        patch.object(svc, "OZOS_KNOWLEDGE_FOLDER_TAGS", cfg),
    ):
        idx = ti.build_tag_index(sources)
    assert "kh/DMP/a.md" in idx["by_path"]
    assert set(idx["by_path"]["kh/DMP/a.md"]) >= {"Ads", "DMP"}
    assert "Ads" in idx["by_tag"] and "DMP" in idx["by_tag"]


def test_collect_tags_for_doc_string_people_entry(tmp_path):
    """_collect_tags_for_doc indexes people entries that are plain strings."""
    root, sources = _make_corpus(tmp_path)
    # Build a doc with a plain-string people entry (YAML list of strings)
    (tmp_path / "kh" / "string-people.md").write_text(
        "---\ntags:\n- x\npeople:\n- Jordan Park\n---\n# String People\n",
        encoding="utf-8",
    )
    p1, p2, p3, p4, p5 = _patch_sources(root, sources)
    with p1, p2, p3, p4, p5:
        idx = ti.build_tag_index(sources)
    # "Jordan Park" as a bare string → first name "jordan"
    assert "jordan" in idx["by_tag"]
    jordan_paths = [e["path"] for e in idx["by_tag"]["jordan"]]
    assert any("string-people" in p for p in jordan_paths)
