# backend/tests/test_knowledge.py
import json
import os
from unittest.mock import patch

from backend.services import knowledge as svc


# ── load_sources ──────────────────────────────────────────────────────


def test_load_sources_seeds_defaults_when_missing(tmp_path):
    cfg = tmp_path / "knowledge-sources.json"
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with (
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        sources = svc.load_sources()
    # Hub is empty → only default extras (docs) returned
    assert isinstance(sources, list) and len(sources) >= 1
    ids = {s["id"] for s in sources}
    assert "docs" in ids
    # meeting-notes not in defaults (auto-discovered, but hub is empty here)
    assert "meeting-notes" not in ids
    for s in sources:
        assert {"id", "label", "path"} <= set(s)
    # File seeded so future reads are stable
    assert cfg.exists()
    written = json.loads(cfg.read_text())
    assert any(s["id"] == "docs" for s in written["sources"])


def test_load_sources_reads_existing_file(tmp_path):
    cfg = tmp_path / "knowledge-sources.json"
    cfg.write_text(
        json.dumps({"sources": [{"id": "custom", "label": "Custom", "path": "some/dir"}]})
    )
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with (
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        sources = svc.load_sources()
    # Hub empty → only the custom extra
    assert sources == [{"id": "custom", "label": "Custom", "path": "some/dir"}]


def test_load_sources_discovers_hub_dirs(tmp_path):
    cfg = tmp_path / "missing.json"
    hub = tmp_path / "knowledge-hub"
    (hub / "Onboarding").mkdir(parents=True)
    (hub / "ai-learning").mkdir()
    with (
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        sources = svc.load_sources()
    ids = {s["id"] for s in sources}
    assert "onboarding" in ids
    assert "ai-learning" in ids
    hub_sources = [s for s in sources if s["path"].startswith("knowledge-hub/")]
    for s in hub_sources:
        assert {"id", "label", "path"} <= set(s)
    assert len(hub_sources) == 2


def test_load_sources_appends_non_hub_extras(tmp_path):
    cfg = tmp_path / "sources.json"
    cfg.write_text(json.dumps({"sources": [{"id": "docs", "label": "Docs", "path": "docs"}]}))
    hub = tmp_path / "knowledge-hub"
    (hub / "meeting-notes").mkdir(parents=True)
    with (
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        sources = svc.load_sources()
    ids = {s["id"] for s in sources}
    assert "meeting-notes" in ids  # auto-discovered
    assert "docs" in ids  # extra from JSON


def test_load_sources_excludes_knowledge_hub_registry_entries(tmp_path):
    cfg = tmp_path / "sources.json"
    cfg.write_text(
        json.dumps(
            {
                "sources": [
                    {
                        "id": "ai-learning",
                        "label": "AI Learning",
                        "path": "knowledge-hub/ai-learning",
                    },
                    {"id": "docs", "label": "Docs", "path": "docs"},
                ]
            }
        )
    )
    hub = tmp_path / "knowledge-hub"
    (hub / "ai-learning").mkdir(parents=True)
    with (
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        sources = svc.load_sources()
    # knowledge-hub/ai-learning entry in JSON is dropped; auto-discovered one kept
    ai_entries = [s for s in sources if s["id"] == "ai-learning"]
    assert len(ai_entries) == 1
    assert "docs" in {s["id"] for s in sources}


def test_load_sources_label_prettification(tmp_path):
    cfg = tmp_path / "missing.json"
    hub = tmp_path / "knowledge-hub"
    for name in ["Onboarding", "ai-learning", "meeting-notes", "tech-wiki", "ai-history"]:
        (hub / name).mkdir(parents=True)
    with (
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        sources = svc.load_sources()
    by_id = {s["id"]: s["label"] for s in sources}
    assert by_id["onboarding"] == "Onboarding"
    assert by_id["ai-learning"] == "AI Learning"
    assert by_id["meeting-notes"] == "Meeting Notes"
    assert by_id["tech-wiki"] == "Tech Wiki"
    assert by_id["ai-history"] == "AI History"


# ── build_tree ────────────────────────────────────────────────────────


def _set_mtime(path, mtime):
    os.utime(path, (mtime, mtime))


def test_build_tree_includes_md_and_images_excludes_other(tmp_path):
    root = tmp_path
    src = root / "kh"
    (src / "sub").mkdir(parents=True)
    (src / "a.md").write_text("# A")
    (src / "ignore.txt").write_text("nope")
    (src / "image.png").write_bytes(b"\x89PNG")
    (src / "sub" / "b.md").write_text("# B")

    sources = [{"id": "kh", "label": "Knowledge", "path": "kh"}]
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)

    assert "sources" in tree
    node = tree["sources"][0]
    assert node["id"] == "kh"
    assert node["label"] == "Knowledge"
    names = {c["name"] for c in node["children"]}
    # markdown + image files are browsable; other types still excluded
    assert "a.md" in names
    assert "image.png" in names
    assert "ignore.txt" not in names
    assert "sub" in names
    # nested md present under the dir
    sub = next(c for c in node["children"] if c["name"] == "sub")
    assert sub["type"] == "dir"
    assert [c["name"] for c in sub["children"]] == ["b.md"]
    assert sub["children"][0]["type"] == "file"


def test_build_tree_includes_html(tmp_path):
    root = tmp_path
    src = root / "kh"
    src.mkdir(parents=True)
    (src / "a.md").write_text("# A")
    (src / "chart.html").write_text("<!doctype html><h1>Chart</h1>")
    (src / "page.htm").write_text("<h1>Legacy</h1>")

    sources = [{"id": "kh", "label": "K", "path": "kh"}]
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)

    children = {c["name"]: c for c in tree["sources"][0]["children"]}
    assert "chart.html" in children
    assert "page.htm" in children
    assert children["chart.html"]["type"] == "file"
    assert children["chart.html"]["kind"] == "html"
    assert children["page.htm"]["kind"] == "html"


def test_read_file_returns_html_content(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    html = "<!doctype html><html><body><h1>Bands</h1></body></html>"
    (tmp_path / "kh" / "bands.html").write_text(html)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        result = svc.read_file("kh/bands.html")
    assert result["path"] == "kh/bands.html"
    assert result["name"] == "bands.html"
    assert result["source_id"] == "kh"
    assert result["kind"] == "html"
    assert result["content"] == html
    assert result["mtime"] > 0


def test_build_tree_orders_dirs_first_then_files_newest_first(tmp_path):
    root = tmp_path
    src = root / "kh"
    (src / "zdir").mkdir(parents=True)
    old = src / "2026-01-01-old.md"
    new = src / "2026-06-01-new.md"
    old.write_text("old")
    new.write_text("new")
    _set_mtime(old, 1000)
    _set_mtime(new, 2000)

    sources = [{"id": "kh", "label": "K", "path": "kh"}]
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)

    children = tree["sources"][0]["children"]
    assert children[0]["type"] == "dir"  # dir first
    files = [c for c in children if c["type"] == "file"]
    assert [f["name"] for f in files] == ["2026-06-01-new.md", "2026-01-01-old.md"]


def test_build_tree_nodes_have_relative_path_and_mtime(tmp_path):
    root = tmp_path
    src = root / "kh"
    src.mkdir(parents=True)
    f = src / "a.md"
    f.write_text("# A")

    sources = [{"id": "kh", "label": "K", "path": "kh"}]
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)

    file_node = tree["sources"][0]["children"][0]
    assert file_node["path"] == "kh/a.md"  # relative to _ROOT, posix
    assert isinstance(file_node["mtime"], (int, float))
    assert file_node["mtime"] > 0


def test_build_tree_missing_source_dir_yields_empty_children(tmp_path):
    sources = [{"id": "gone", "label": "Gone", "path": "does/not/exist"}]
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)
    assert tree["sources"][0]["children"] == []


def test_build_tree_defaults_to_load_sources_when_no_arg(tmp_path):
    cfg = tmp_path / "knowledge-sources.json"
    cfg.write_text(json.dumps({"sources": [{"id": "kh", "label": "K", "path": "kh"}]}))
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("# A")
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        tree = svc.build_tree()
    # Hub empty → only the "kh" extra from the registry
    assert tree["sources"][0]["id"] == "kh"
    assert tree["sources"][0]["children"][0]["name"] == "a.md"


# ── read_file / resolve_asset (M2: path security) ─────────────────────

import pytest


def _fixture_sources(tmp_path):
    """Two source dirs + a secret file outside them; returns (root, sources)."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "note.md").write_text("# Note\nbody text")
    (tmp_path / "kh" / "pic.png").write_bytes(b"\x89PNG\r\n")
    (tmp_path / "kh" / "data.json").write_text("{}")
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "spec.md").write_text("# Spec")
    (tmp_path / "secret.md").write_text("TOP SECRET")  # outside any source
    sources = [
        {"id": "kh", "label": "KH", "path": "kh"},
        {"id": "docs", "label": "Docs", "path": "docs"},
    ]
    return tmp_path, sources


def _patch(tmp_path, sources):
    return patch.multiple(
        svc,
        _ROOT=tmp_path,
        OZOS_KNOWLEDGE_SOURCES=tmp_path / "missing.json",
    ), patch.object(svc, "load_sources", lambda: sources)


def test_read_file_rejects_parent_traversal(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.read_file("kh/../secret.md")
    assert ei.value.status == 403


def test_read_file_rejects_path_outside_sources(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.read_file("secret.md")
    assert ei.value.status == 403


def test_read_file_rejects_non_markdown(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.read_file("kh/data.json")
    assert ei.value.status == 400


def test_read_file_missing_returns_404(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.read_file("kh/nope.md")
    assert ei.value.status == 404


def test_read_file_happy_path(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        result = svc.read_file("kh/note.md")
    assert result["path"] == "kh/note.md"
    assert result["name"] == "note.md"
    assert result["source_id"] == "kh"
    assert result["kind"] == "markdown"
    assert result["content"] == "# Note\nbody text"
    assert result["mtime"] > 0


def test_read_file_returns_image_metadata_without_content(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        result = svc.read_file("kh/pic.png")
    assert result["path"] == "kh/pic.png"
    assert result["name"] == "pic.png"
    assert result["source_id"] == "kh"
    assert result["kind"] == "image"
    # Image bytes are served via the asset endpoint, not inlined as text.
    assert result["content"] == ""
    assert result["mtime"] > 0


def test_resolve_asset_happy_path_returns_abs_path(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        path = svc.resolve_asset("kh/pic.png")
    assert path == (tmp_path / "kh" / "pic.png").resolve()


def test_resolve_asset_rejects_non_image(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.resolve_asset("kh/note.md")
    assert ei.value.status == 400


def test_resolve_asset_rejects_traversal(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.resolve_asset("kh/../../etc/hosts.png")
    assert ei.value.status == 403


# ── search (M3: full-text) ────────────────────────────────────────────


def _search_repo(tmp_path):
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "alpha.md").write_text("# Alpha\nThe quick brown fox jumps.")
    (tmp_path / "kh" / "beta.md").write_text("# Beta notes\nNothing about animals here.")
    (tmp_path / "kh" / "quick-guide.md").write_text("# Guide\nUnrelated body content.")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    return tmp_path, sources


def test_search_matches_content_substring(tmp_path):
    root, sources = _search_repo(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        res = svc.search("brown")["results"]
    paths = {r["path"] for r in res}
    assert "kh/alpha.md" in paths
    assert "kh/beta.md" not in paths


def test_search_is_case_insensitive(tmp_path):
    root, sources = _search_repo(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        res = svc.search("BROWN")["results"]
    assert any(r["path"] == "kh/alpha.md" for r in res)


def test_search_multiword_is_and(tmp_path):
    root, sources = _search_repo(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        both = svc.search("quick brown")["results"]
        one = svc.search("quick zzzznope")["results"]
    assert any(r["path"] == "kh/alpha.md" for r in both)
    assert one == []  # zzzznope absent everywhere → AND fails


def test_search_filename_beats_content(tmp_path):
    root, sources = _search_repo(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        res = svc.search("quick")["results"]
    # quick-guide.md (filename hit) should outrank alpha.md (content hit)
    assert res[0]["path"] == "kh/quick-guide.md"
    assert res[0]["score"] > res[1]["score"]


def test_search_snippet_contains_match(tmp_path):
    root, sources = _search_repo(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        res = svc.search("fox")["results"]
    hit = next(r for r in res if r["path"] == "kh/alpha.md")
    assert "fox" in hit["snippet"].lower()


def test_search_result_shape(tmp_path):
    root, sources = _search_repo(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        res = svc.search("brown")["results"]
    assert {"path", "name", "source_id", "mtime", "snippet", "score"} <= set(res[0])


def test_search_empty_query_returns_no_results(tmp_path):
    root, sources = _search_repo(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        assert svc.search("")["results"] == []
        assert svc.search("   ")["results"] == []


def test_search_refreshes_on_mtime_change(tmp_path):
    root, sources = _search_repo(tmp_path)
    p1, p2 = _patch(tmp_path, sources)
    target = tmp_path / "kh" / "beta.md"
    with p1, p2:
        assert svc.search("platypus")["results"] == []
        target.write_text("# Beta\nNow mentions a platypus.")
        _set_mtime(target, target.stat().st_mtime + 100)  # bump mtime
        res = svc.search("platypus")["results"]
    assert any(r["path"] == "kh/beta.md" for r in res)


def test_search_caps_results(tmp_path):
    (tmp_path / "kh").mkdir()
    for i in range(60):
        (tmp_path / "kh" / f"doc{i:03d}.md").write_text("# Doc\nshared keyword here")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        res = svc.search("keyword")["results"]
    assert len(res) <= 50


# ── stars (starred documents) ─────────────────────────────────────────


def test_load_stars_empty_when_missing(tmp_path):
    with patch.object(svc, "OZOS_KNOWLEDGE_STARS", tmp_path / "missing.json"):
        assert svc.load_stars() == []


def test_set_star_adds_and_persists(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    stars = tmp_path / "knowledge-stars.json"
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2, patch.object(svc, "OZOS_KNOWLEDGE_STARS", stars):
        result = svc.set_star("kh/note.md", True)
    assert "kh/note.md" in result
    assert stars.exists()
    assert "kh/note.md" in json.loads(stars.read_text())["starred"]


def test_set_star_removes(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    stars = tmp_path / "knowledge-stars.json"
    stars.write_text(json.dumps({"starred": ["kh/note.md", "docs/spec.md"]}))
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2, patch.object(svc, "OZOS_KNOWLEDGE_STARS", stars):
        result = svc.set_star("kh/note.md", False)
    assert "kh/note.md" not in result
    assert "docs/spec.md" in result


def test_set_star_is_idempotent(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    stars = tmp_path / "knowledge-stars.json"
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2, patch.object(svc, "OZOS_KNOWLEDGE_STARS", stars):
        svc.set_star("kh/note.md", True)
        result = svc.set_star("kh/note.md", True)
    assert result.count("kh/note.md") == 1


def test_set_star_rejects_path_outside_sources(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    stars = tmp_path / "knowledge-stars.json"
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2, patch.object(svc, "OZOS_KNOWLEDGE_STARS", stars):
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.set_star("../secret.md", True)
    assert ei.value.status == 403


# ── source colours ────────────────────────────────────────────────────


def test_load_colors_empty_when_missing(tmp_path):
    with patch.object(svc, "OZOS_KNOWLEDGE_COLORS", tmp_path / "missing.json"):
        assert svc.load_colors() == {}


def test_set_color_adds_and_persists(tmp_path):
    colors = tmp_path / "knowledge-colors.json"
    with patch.object(svc, "OZOS_KNOWLEDGE_COLORS", colors):
        result = svc.set_color("docs", "#ff8800")
    assert result == {"docs": "#ff8800"}
    assert colors.exists()
    assert json.loads(colors.read_text())["colors"]["docs"] == "#ff8800"


def test_set_color_normalizes_hex_to_lowercase(tmp_path):
    colors = tmp_path / "knowledge-colors.json"
    with patch.object(svc, "OZOS_KNOWLEDGE_COLORS", colors):
        result = svc.set_color("docs", "#FF8800")
    assert result["docs"] == "#ff8800"


def test_set_color_overwrites_existing(tmp_path):
    colors = tmp_path / "knowledge-colors.json"
    colors.write_text(json.dumps({"colors": {"docs": "#111111"}}))
    with patch.object(svc, "OZOS_KNOWLEDGE_COLORS", colors):
        result = svc.set_color("docs", "#abcdef")
    assert result["docs"] == "#abcdef"


def test_set_color_reset_removes_entry(tmp_path):
    colors = tmp_path / "knowledge-colors.json"
    colors.write_text(json.dumps({"colors": {"docs": "#111111", "kh": "#222222"}}))
    with patch.object(svc, "OZOS_KNOWLEDGE_COLORS", colors):
        result = svc.set_color("docs", None)
    assert "docs" not in result
    assert result["kh"] == "#222222"


def test_set_color_rejects_invalid_hex(tmp_path):
    colors = tmp_path / "knowledge-colors.json"
    with patch.object(svc, "OZOS_KNOWLEDGE_COLORS", colors):
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.set_color("docs", "red")
    assert ei.value.status == 400


# ── graph projection (M7) ─────────────────────────────────────────────


def _write_graph(tmp_path):
    """Write a minimal graphify graph.json under tmp_path/graphify-out/."""
    gdir = tmp_path / "graphify-out"
    gdir.mkdir()
    (gdir / "graph.json").write_text(
        json.dumps(
            {
                "directed": True,
                "nodes": [
                    {
                        "id": "a",
                        "label": "A",
                        "file_type": "document",
                        "source_file": "docs/a.md",
                        "community": 1,
                        "norm_label": "a",
                    },
                    {
                        "id": "b",
                        "label": "B",
                        "file_type": "code",
                        "source_file": "tools/x.py",
                        "community": 2,
                        "extra": "drop me",
                    },
                ],
                "links": [
                    {
                        "source": "a",
                        "target": "b",
                        "relation": "mentions",
                        "weight": 1.0,
                        "confidence": "EXTRACTED",
                    },
                ],
            }
        )
    )
    return tmp_path


def test_load_graph_projects_fields(tmp_path):
    _write_graph(tmp_path)
    with patch.object(svc, "_GRAPH_ROOT", tmp_path):
        graph = svc.load_graph()
    assert {n["id"] for n in graph["nodes"]} == {"a", "b"}
    node_a = next(n for n in graph["nodes"] if n["id"] == "a")
    assert node_a == {
        "id": "a",
        "label": "A",
        "file_type": "document",
        "source_file": "docs/a.md",
        "community": 1,
    }
    # Extra/unused fields are dropped from the projection.
    assert "norm_label" not in node_a
    link = graph["links"][0]
    assert link == {"source": "a", "target": "b", "relation": "mentions"}


def test_load_graph_missing_file_returns_empty(tmp_path):
    with patch.object(svc, "_ROOT", tmp_path):
        graph = svc.load_graph()
    assert graph == {"nodes": [], "links": []}


# ── opens (rolling 30-day tracking) ───────────────────────────────────

import time as _time


def test_load_opens_empty_when_missing(tmp_path):
    with patch.object(svc, "OZOS_KNOWLEDGE_OPENS", tmp_path / "missing.json"):
        assert svc.load_opens() == []


def test_load_opens_returns_recent_entries_only(tmp_path):
    now = _time.time()
    opens_file = tmp_path / "opens.json"
    opens_file.write_text(
        json.dumps(
            {
                "opens": [
                    {"path": "kh/a.md", "timestamp": now - 10},
                    {"path": "kh/b.md", "timestamp": now - 31 * 86400},
                ]
            }
        )
    )
    with patch.object(svc, "OZOS_KNOWLEDGE_OPENS", opens_file):
        result = svc.load_opens()
    assert len(result) == 1
    assert result[0]["path"] == "kh/a.md"


def test_load_opens_empty_file_returns_empty(tmp_path):
    opens_file = tmp_path / "opens.json"
    opens_file.write_text(json.dumps({"opens": []}))
    with patch.object(svc, "OZOS_KNOWLEDGE_OPENS", opens_file):
        assert svc.load_opens() == []


def test_record_open_appends_and_saves(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    opens_file = tmp_path / "opens.json"
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2, patch.object(svc, "OZOS_KNOWLEDGE_OPENS", opens_file):
        svc.record_open("kh/note.md")
    assert opens_file.exists()
    data = json.loads(opens_file.read_text())
    assert any(o["path"] == "kh/note.md" for o in data["opens"])
    assert all("timestamp" in o for o in data["opens"])


def test_record_open_rejects_path_outside_sources(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    opens_file = tmp_path / "opens.json"
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2, patch.object(svc, "OZOS_KNOWLEDGE_OPENS", opens_file):
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.record_open("../secret.md")
    assert ei.value.status == 403


def test_record_open_prunes_stale_entries(tmp_path):
    root, sources = _fixture_sources(tmp_path)
    now = _time.time()
    opens_file = tmp_path / "opens.json"
    opens_file.write_text(
        json.dumps({"opens": [{"path": "kh/note.md", "timestamp": now - 32 * 86400}]})
    )
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2, patch.object(svc, "OZOS_KNOWLEDGE_OPENS", opens_file):
        svc.record_open("kh/note.md")
    data = json.loads(opens_file.read_text())
    # stale entry pruned; only the new one survives
    assert len(data["opens"]) == 1
    assert data["opens"][0]["timestamp"] > now - 86400


def test_source_scores_counts_opens_per_source(tmp_path):
    now = _time.time()
    opens = [
        {"path": "kh/a.md", "timestamp": now - 100},
        {"path": "kh/b.md", "timestamp": now - 200},
        {"path": "docs/spec.md", "timestamp": now - 300},
    ]
    sources = [
        {"id": "kh", "label": "KH", "path": "kh"},
        {"id": "docs", "label": "Docs", "path": "docs"},
    ]
    scores = svc.source_scores(opens, sources)
    assert scores["kh"] == 2
    assert scores["docs"] == 1


def test_source_scores_zero_for_sources_with_no_opens(tmp_path):
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    scores = svc.source_scores([], sources)
    assert scores["kh"] == 0


def test_build_tree_sources_sorted_by_open_score(tmp_path):
    root = tmp_path
    for name in ["kh", "docs"]:
        (root / name).mkdir(parents=True)
        (root / name / "a.md").write_text("# A")
    sources = [
        {"id": "kh", "label": "KH", "path": "kh"},
        {"id": "docs", "label": "Docs", "path": "docs"},
    ]
    now = _time.time()
    opens_file = tmp_path / "opens.json"
    opens_file.write_text(
        json.dumps(
            {
                "opens": [
                    {"path": "docs/a.md", "timestamp": now - 100},
                    {"path": "docs/a.md", "timestamp": now - 200},
                ]
            }
        )
    )
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
        patch.object(svc, "OZOS_KNOWLEDGE_OPENS", opens_file),
    ):
        tree = svc.build_tree(sources)
    ids = [s["id"] for s in tree["sources"]]
    assert ids.index("docs") < ids.index("kh")


def test_build_tree_stable_alpha_order_when_scores_equal(tmp_path):
    root = tmp_path
    for name in ["beta", "alpha"]:
        (root / name).mkdir(parents=True)
    sources = [
        {"id": "beta", "label": "Beta", "path": "beta"},
        {"id": "alpha", "label": "Alpha", "path": "alpha"},
    ]
    opens_file = tmp_path / "opens.json"
    opens_file.write_text(json.dumps({"opens": []}))
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
        patch.object(svc, "OZOS_KNOWLEDGE_OPENS", opens_file),
    ):
        tree = svc.build_tree(sources)
    ids = [s["id"] for s in tree["sources"]]
    assert ids == ["alpha", "beta"]


# ── manual order (load_order / set_order) ─────────────────────────────


def test_load_order_empty_when_missing(tmp_path):
    with patch.object(svc, "OZOS_KNOWLEDGE_ORDER", tmp_path / "missing.json"):
        assert svc.load_order() == []


def test_set_order_persists_and_returns(tmp_path):
    order_file = tmp_path / "order.json"
    with patch.object(svc, "OZOS_KNOWLEDGE_ORDER", order_file):
        result = svc.set_order(["docs", "kh"])
    assert result == ["docs", "kh"]
    assert order_file.exists()
    assert json.loads(order_file.read_text())["order"] == ["docs", "kh"]


def test_set_order_overwrites_existing(tmp_path):
    order_file = tmp_path / "order.json"
    order_file.write_text(json.dumps({"order": ["a", "b", "c"]}))
    with patch.object(svc, "OZOS_KNOWLEDGE_ORDER", order_file):
        result = svc.set_order(["c", "a"])
    assert result == ["c", "a"]


def test_set_order_rejects_non_string_entries(tmp_path):
    order_file = tmp_path / "order.json"
    with patch.object(svc, "OZOS_KNOWLEDGE_ORDER", order_file):
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.set_order(["ok", 5])  # type: ignore[list-item]
    assert ei.value.status == 400


def _two_source_repo(tmp_path):
    """Two source dirs (kh, docs), each with one md; returns (root, sources)."""
    for name in ["kh", "docs"]:
        (tmp_path / name).mkdir(parents=True)
        (tmp_path / name / "a.md").write_text("# A")
    sources = [
        {"id": "kh", "label": "KH", "path": "kh"},
        {"id": "docs", "label": "Docs", "path": "docs"},
    ]
    return tmp_path, sources


def test_build_tree_honors_manual_order(tmp_path):
    root, sources = _two_source_repo(tmp_path)
    order_file = tmp_path / "order.json"
    order_file.write_text(json.dumps({"order": ["docs", "kh"]}))
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
        patch.object(svc, "OZOS_KNOWLEDGE_OPENS", tmp_path / "no-opens.json"),
        patch.object(svc, "OZOS_KNOWLEDGE_ORDER", order_file),
    ):
        tree = svc.build_tree(sources)
    assert [s["id"] for s in tree["sources"]] == ["docs", "kh"]


def test_build_tree_unplaced_sources_go_to_bottom(tmp_path):
    """A source absent from the manual order drops below placed ones."""
    root, sources = _two_source_repo(tmp_path)
    # New source 'extra' discovered but not in the saved order.
    (root / "extra").mkdir()
    (root / "extra" / "a.md").write_text("# A")
    sources.append({"id": "extra", "label": "Extra", "path": "extra"})

    order_file = tmp_path / "order.json"
    order_file.write_text(json.dumps({"order": ["docs", "kh"]}))
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
        patch.object(svc, "OZOS_KNOWLEDGE_OPENS", tmp_path / "no-opens.json"),
        patch.object(svc, "OZOS_KNOWLEDGE_ORDER", order_file),
    ):
        tree = svc.build_tree(sources)
    ids = [s["id"] for s in tree["sources"]]
    assert ids[:2] == ["docs", "kh"]
    assert ids[-1] == "extra"


def test_build_tree_no_order_file_keeps_frequency_sort(tmp_path):
    """With no manual order, the existing open-frequency sort still applies."""
    root, sources = _two_source_repo(tmp_path)
    now = _time.time()
    opens_file = tmp_path / "opens.json"
    opens_file.write_text(json.dumps({"opens": [{"path": "docs/a.md", "timestamp": now - 100}]}))
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
        patch.object(svc, "OZOS_KNOWLEDGE_OPENS", opens_file),
        patch.object(svc, "OZOS_KNOWLEDGE_ORDER", tmp_path / "no-order.json"),
    ):
        tree = svc.build_tree(sources)
    ids = [s["id"] for s in tree["sources"]]
    assert ids.index("docs") < ids.index("kh")


# ── create_folder ─────────────────────────────────────────────────────


def test_create_folder_at_hub_root(tmp_path):
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        rel = svc.create_folder("Team Retros", "knowledge-hub")
    assert rel == "knowledge-hub/team-retros"
    assert (hub / "team-retros").is_dir()


def test_create_folder_inside_subfolder(tmp_path):
    hub = tmp_path / "knowledge-hub"
    (hub / "ai-learning").mkdir(parents=True)
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        rel = svc.create_folder("Retros", "knowledge-hub/ai-learning")
    assert rel == "knowledge-hub/ai-learning/retros"
    assert (hub / "ai-learning" / "retros").is_dir()


def test_create_folder_slugifies_name(tmp_path):
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        rel = svc.create_folder("  My Cool Folder!!  ", "knowledge-hub")
    assert rel == "knowledge-hub/my-cool-folder"
    assert (hub / "my-cool-folder").is_dir()


def test_create_folder_rejects_empty_name(tmp_path):
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.create_folder("!!!", "knowledge-hub")
    assert ei.value.status == 400


def test_create_folder_rejects_duplicate(tmp_path):
    hub = tmp_path / "knowledge-hub"
    (hub / "existing").mkdir(parents=True)
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.create_folder("Existing", "knowledge-hub")
    assert ei.value.status == 409


def test_create_folder_rejects_parent_outside_hub(tmp_path):
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    (tmp_path / "docs").mkdir()
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.create_folder("x", "docs")
    assert ei.value.status == 403


def test_create_folder_rejects_parent_traversal(tmp_path):
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.create_folder("x", "knowledge-hub/../docs")
    assert ei.value.status == 403


def test_create_folder_rejects_missing_parent(tmp_path):
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.create_folder("x", "knowledge-hub/nope")
    assert ei.value.status == 404


# ── write_file + update_meta (Phase 2, Task 2.2) ─────────────────────────────


def test_write_file_roundtrip(tmp_path):
    """write_file atomically writes content and returns a read_file-shaped dict."""
    (tmp_path / "kh").mkdir()
    f = tmp_path / "kh" / "2026-06-29 — X.md"
    f.write_text("---\ntags: []\n---\n# X\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        out = svc.write_file("kh/2026-06-29 — X.md", "---\ntags:\n- new\n---\n# X edited\n")
    assert "edited" in out["content"]
    assert out["path"] == "kh/2026-06-29 — X.md"
    assert out["name"] == "2026-06-29 — X.md"


def test_write_file_rejects_path_outside_sources(tmp_path):
    """write_file raises 403 for paths outside registered sources."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "secret.md").write_text("SECRET", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.write_file("secret.md", "# pwned")
    assert ei.value.status == 403


def test_write_file_rejects_missing_file(tmp_path):
    """write_file raises 404 if the file does not exist."""
    (tmp_path / "kh").mkdir()
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.write_file("kh/nope.md", "# content")
    assert ei.value.status == 404


def test_write_file_rejects_path_traversal(tmp_path):
    """write_file raises 403 when rel_path contains a parent-directory traversal."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "secret.md").write_text("TOP SECRET", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.write_file("kh/../secret.md", "# pwned")
    assert ei.value.status == 403


def test_update_meta_preserves_body(tmp_path):
    """update_meta merges meta fields without touching the body text."""
    (tmp_path / "kh").mkdir()
    f = tmp_path / "kh" / "2026-06-29 — X.md"
    f.write_text(
        "---\ndate: '2026-06-29'\ntags: []\nfolders:\n- Jordan\n---\n# Body\nkeep me\n",
        encoding="utf-8",
    )
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        out = svc.update_meta("kh/2026-06-29 — X.md", tags=["pricing"], folders=["Jordan", "Robin"])
    assert "keep me" in out["content"]
    meta, _ = svc.split_frontmatter(out["content"])
    assert meta["tags"] == ["pricing"]
    assert meta["folders"] == ["Jordan", "Robin"]
    assert meta["date"] == "2026-06-29"  # untouched field preserved


# ── rename_file (Phase 2, Task 2.3) ──────────────────────────────────────────


def test_rename_file(tmp_path):
    """rename_file renames within the same dir and returns read_file-shaped dict at new path."""
    (tmp_path / "kh").mkdir()
    f = tmp_path / "kh" / "2026-06-29 — Old.md"
    f.write_text("---\n---\n# x\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        out = svc.rename_file("kh/2026-06-29 — Old.md", "2026-06-29 — New.md")
    assert out["name"] == "2026-06-29 — New.md"
    assert out["path"] == "kh/2026-06-29 — New.md"
    assert (tmp_path / "kh" / "2026-06-29 — New.md").exists()
    assert not (tmp_path / "kh" / "2026-06-29 — Old.md").exists()


def test_rename_rejects_separator(tmp_path):
    """rename_file rejects new_name containing path separators."""
    (tmp_path / "kh").mkdir()
    f = tmp_path / "kh" / "a.md"
    f.write_text("x", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.rename_file("kh/a.md", "../evil.md")
    assert ei.value.status == 400


def test_rename_rejects_existing_target(tmp_path):
    """rename_file raises 409 if the target name already exists."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("x", encoding="utf-8")
    (tmp_path / "kh" / "b.md").write_text("y", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.rename_file("kh/a.md", "b.md")
    assert ei.value.status == 409


# ── move_file ────────────────────────────────────────────────────────────────


def test_move_file_relocates_into_subfolder(tmp_path):
    """move_file physically moves a markdown file into a subfolder of the same source."""
    (tmp_path / "kh" / "sub").mkdir(parents=True)
    (tmp_path / "kh" / "a.md").write_text("---\n---\n# A\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        out = svc.move_file("kh/a.md", "kh/sub")
    assert out["path"] == "kh/sub/a.md"
    assert (tmp_path / "kh" / "sub" / "a.md").exists()
    assert not (tmp_path / "kh" / "a.md").exists()


def test_move_file_moves_image(tmp_path):
    """move_file moves image files too, returning kind=image at the new path."""
    (tmp_path / "kh" / "sub").mkdir(parents=True)
    (tmp_path / "kh" / "pic.png").write_bytes(b"\x89PNG\r\nDATA")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        out = svc.move_file("kh/pic.png", "kh/sub")
    assert out["path"] == "kh/sub/pic.png"
    assert out["kind"] == "image"
    assert (tmp_path / "kh" / "sub" / "pic.png").exists()


def test_move_file_rejects_existing_target(tmp_path):
    """move_file raises 409 when the destination already has a file of that name."""
    (tmp_path / "kh" / "sub").mkdir(parents=True)
    (tmp_path / "kh" / "a.md").write_text("x", encoding="utf-8")
    (tmp_path / "kh" / "sub" / "a.md").write_text("y", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.move_file("kh/a.md", "kh/sub")
    assert ei.value.status == 409


def test_move_file_rejects_cross_source(tmp_path):
    """move_file raises 400 when the destination lives in a different source."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "other").mkdir()
    (tmp_path / "kh" / "a.md").write_text("x", encoding="utf-8")
    sources = [
        {"id": "kh", "label": "KH", "path": "kh"},
        {"id": "other", "label": "Other", "path": "other"},
    ]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.move_file("kh/a.md", "other")
    assert ei.value.status == 400


def test_move_file_rejects_dest_not_a_dir(tmp_path):
    """move_file raises 404 when the destination is not an existing directory."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("x", encoding="utf-8")
    (tmp_path / "kh" / "b.md").write_text("y", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.move_file("kh/a.md", "kh/b.md")
    assert ei.value.status == 404


def test_move_file_rejects_dest_outside_sources(tmp_path):
    """move_file raises 403 when the destination escapes the source roots."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("x", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        with pytest.raises(svc.KnowledgeAccessError) as ei:
            svc.move_file("kh/a.md", "kh/../outside")
    assert ei.value.status == 403


def test_move_file_into_current_folder_is_noop(tmp_path):
    """Dropping a file onto its own current folder is a no-op success."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("---\n---\n# A\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        out = svc.move_file("kh/a.md", "kh")
    assert out["path"] == "kh/a.md"
    assert (tmp_path / "kh" / "a.md").exists()


def test_move_file_updates_search_index(tmp_path):
    """After a move, full-text search finds the file at its new path, not the old."""
    (tmp_path / "kh" / "sub").mkdir(parents=True)
    (tmp_path / "kh" / "note.md").write_text("# Note\nuniquetoken", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        svc.move_file("kh/note.md", "kh/sub")
        results = svc.search("uniquetoken")["results"]
    paths = {r["path"] for r in results}
    assert "kh/sub/note.md" in paths
    assert "kh/note.md" not in paths


# ── all_tags (Phase 2, Task 2.4) ─────────────────────────────────────────────


def test_all_tags_unions_across_docs(tmp_path):
    """all_tags returns sorted unique union of tags from all markdown docs in sources."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("---\ntags:\n- x\n- y\n---\n", encoding="utf-8")
    (tmp_path / "kh" / "b.md").write_text("---\ntags:\n- y\n- z\n---\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        result = svc.all_tags()
    assert result == ["x", "y", "z"]


def test_all_tags_empty_when_no_tags(tmp_path):
    """all_tags returns [] when no docs have tags."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("# no frontmatter\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        result = svc.all_tags()
    assert result == []


def test_all_tags_deduplicates(tmp_path):
    """all_tags deduplicates the same tag appearing in multiple docs."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("---\ntags:\n- pricing\n---\n", encoding="utf-8")
    (tmp_path / "kh" / "b.md").write_text(
        "---\ntags:\n- pricing\n- growth\n---\n", encoding="utf-8"
    )
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        result = svc.all_tags()
    assert result == ["growth", "pricing"]
    assert result.count("pricing") == 1


# ── read_file returns parsed tags/folders/links (Task 2.7) ───────────────────


def test_read_file_tags_and_folders_from_frontmatter(tmp_path):
    """read_file returns tags, folders, links parsed from YAML frontmatter."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "note.md").write_text(
        "---\ntags:\n- a\n- b\nfolders:\n- X\n- Y\nlinks:\n- label: foo\n  url: http://example.com\n---\n# Note\n",
        encoding="utf-8",
    )
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        result = svc.read_file("kh/note.md")
    assert result["tags"] == ["a", "b"]
    assert result["folders"] == ["X", "Y"]
    assert result["links"] == [{"label": "foo", "url": "http://example.com"}]


def test_read_file_folders_default_to_parent_dir_name(tmp_path):
    """When no folders field in frontmatter, folders defaults to [parent_dir_name]."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "note.md").write_text("# Note\nbody text", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        result = svc.read_file("kh/note.md")
    # Parent directory is "kh"; no frontmatter folders → defaults to ["kh"]
    assert result["folders"] == ["kh"]
    assert result["tags"] == []
    assert result["links"] == []


def test_read_file_image_returns_empty_meta_fields(tmp_path):
    """Images always return tags=[], folders=[], links=[]."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "pic.png").write_bytes(b"\x89PNG\r\n")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        result = svc.read_file("kh/pic.png")
    assert result["tags"] == []
    assert result["folders"] == []
    assert result["links"] == []


# ── date sort (Phase 0, Task 0.1) ─────────────────────────────────────────────


def test_files_sorted_by_filename_date_desc(tmp_path):
    """Files are ordered by leading YYYY-MM-DD in the filename (desc), not mtime."""
    d = tmp_path / "Jordan"
    d.mkdir()
    older = d / "2026-06-01 — Old.md"
    newer = d / "2026-06-29 — New.md"
    mid = d / "2026-06-15 — Mid.md"
    for f in (older, newer, mid):
        f.write_text("---\ndate: x\n---\n# t\n", encoding="utf-8")
    # Make mtimes deliberately reversed vs. the filename dates so the test
    # distinguishes the two sort strategies.
    import time as _t

    os.utime(newer, (_t.time() - 10_000, _t.time() - 10_000))  # oldest mtime
    os.utime(older, (_t.time(), _t.time()))  # newest mtime
    # Patch _ROOT so _build_node's relative_to() resolves correctly.
    with patch.object(svc, "_ROOT", tmp_path):
        children = svc._build_children(d)
    names = [c["name"] for c in children if c["type"] == "file"]
    assert names == [
        "2026-06-29 — New.md",
        "2026-06-15 — Mid.md",
        "2026-06-01 — Old.md",
    ]


# ── _doc_folders (Phase 3, Task 3.1) ─────────────────────────────────────────


def test_doc_folders_returns_frontmatter_list_when_present():
    """_doc_folders returns meta['folders'] when it is non-empty."""
    assert svc._doc_folders({"folders": ["A", "B"]}, "Jordan") == ["A", "B"]


def test_doc_folders_falls_back_to_physical_parent():
    """_doc_folders returns [physical_parent] when folders is absent or empty."""
    assert svc._doc_folders({}, "Jordan") == ["Jordan"]
    assert svc._doc_folders({"folders": []}, "Jordan") == ["Jordan"]
    assert svc._doc_folders({"folders": None}, "Jordan") == ["Jordan"]


def test_load_sources_carries_mode_field_from_json(tmp_path):
    """load_sources passes the 'mode' field from JSON entries for matching hub dirs."""
    cfg = tmp_path / "knowledge-sources.json"
    hub = tmp_path / "knowledge-hub"
    (hub / "meeting-notes").mkdir(parents=True)
    cfg.write_text(
        json.dumps(
            {
                "sources": [
                    {
                        "id": "meeting-notes",
                        "label": "Meeting Notes",
                        "path": "knowledge-hub/meeting-notes",
                        "mode": "labels",
                    }
                ]
            }
        )
    )
    with (
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        sources = svc.load_sources()
    mn = next(s for s in sources if s["id"] == "meeting-notes")
    assert mn["mode"] == "labels"


def test_load_sources_defaults_mode_to_dir(tmp_path):
    """load_sources gives mode='dir' to auto-discovered sources with no JSON override."""
    cfg = tmp_path / "knowledge-sources.json"
    hub = tmp_path / "knowledge-hub"
    (hub / "ai-learning").mkdir(parents=True)
    cfg.write_text(json.dumps({"sources": []}))
    with (
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        sources = svc.load_sources()
    ai = next(s for s in sources if s["id"] == "ai-learning")
    assert ai.get("mode", "dir") == "dir"


# ── build_tree label mode (Phase 3, Task 3.2) ────────────────────────────────


def test_label_mode_doc_appears_in_two_folders(tmp_path):
    """A doc with folders:[Jordan,Robin] appears under both virtual folder nodes."""
    (tmp_path / "mn" / "Jordan").mkdir(parents=True)
    note = tmp_path / "mn" / "Jordan" / "2026-06-29 — X.md"
    note.write_text("---\nfolders:\n- Jordan\n- Robin\n---\n# X\n", encoding="utf-8")
    sources = [{"id": "mn", "label": "MN", "path": "mn", "mode": "labels"}]
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)
    folder_names = {c["name"] for c in tree["sources"][0]["children"]}
    assert {"Jordan", "Robin"} <= folder_names
    # The file appears under both folders
    for folder in tree["sources"][0]["children"]:
        if folder["name"] in {"Jordan", "Robin"}:
            file_names = {f["name"] for f in folder["children"]}
            assert "2026-06-29 — X.md" in file_names


def test_label_mode_no_folders_defaults_to_physical_parent(tmp_path):
    """A doc with no folders frontmatter falls under its physical parent dir name."""
    (tmp_path / "mn" / "Jordan").mkdir(parents=True)
    note = tmp_path / "mn" / "Jordan" / "2026-06-29 — Plain.md"
    note.write_text("# No frontmatter\n", encoding="utf-8")
    sources = [{"id": "mn", "label": "MN", "path": "mn", "mode": "labels"}]
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)
    folder_names = {c["name"] for c in tree["sources"][0]["children"]}
    assert "Jordan" in folder_names
    jordan = next(c for c in tree["sources"][0]["children"] if c["name"] == "Jordan")
    assert any(f["name"] == "2026-06-29 — Plain.md" for f in jordan["children"])


def test_label_mode_virtual_folder_for_nonphysical_label(tmp_path):
    """A label naming a non-existent dir (e.g. 'Robin') still produces a virtual folder."""
    (tmp_path / "mn" / "Jordan").mkdir(parents=True)
    note = tmp_path / "mn" / "Jordan" / "2026-06-29 — X.md"
    note.write_text("---\nfolders:\n- Robin\n---\n# X\n", encoding="utf-8")
    sources = [{"id": "mn", "label": "MN", "path": "mn", "mode": "labels"}]
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)
    folder_names = {c["name"] for c in tree["sources"][0]["children"]}
    assert "Robin" in folder_names
    assert "Jordan" not in folder_names


def test_label_mode_folders_sorted_alpha_files_date_desc(tmp_path):
    """Virtual folders are sorted alpha; files within each folder are date-desc."""
    (tmp_path / "mn" / "Jordan").mkdir(parents=True)
    older = tmp_path / "mn" / "Jordan" / "2026-06-01 — Old.md"
    newer = tmp_path / "mn" / "Jordan" / "2026-06-29 — New.md"
    older.write_text("---\nfolders:\n- Zebra\n---\n# Old\n", encoding="utf-8")
    newer.write_text("---\nfolders:\n- Apple\n---\n# New\n", encoding="utf-8")
    sources = [{"id": "mn", "label": "MN", "path": "mn", "mode": "labels"}]
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)
    folder_names = [c["name"] for c in tree["sources"][0]["children"]]
    assert folder_names == sorted(folder_names)  # alpha


def test_label_mode_file_nodes_have_real_path(tmp_path):
    """File nodes in label-mode keep their real relative path (for preview fetch)."""
    (tmp_path / "mn" / "Jordan").mkdir(parents=True)
    note = tmp_path / "mn" / "Jordan" / "2026-06-29 — X.md"
    note.write_text("---\nfolders:\n- Jordan\n---\n# X\n", encoding="utf-8")
    sources = [{"id": "mn", "label": "MN", "path": "mn", "mode": "labels"}]
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)
    jordan = next(c for c in tree["sources"][0]["children"] if c["name"] == "Jordan")
    file_node = jordan["children"][0]
    assert file_node["path"] == "mn/Jordan/2026-06-29 — X.md"
    assert file_node["type"] == "file"


def test_label_mode_virtual_dir_nodes_have_stable_synthetic_path(tmp_path):
    """Virtual dir-node paths are stable synthetic strings (not real fs paths)."""
    (tmp_path / "mn" / "Jordan").mkdir(parents=True)
    note = tmp_path / "mn" / "Jordan" / "2026-06-29 — X.md"
    note.write_text("---\nfolders:\n- Robin\n---\n# X\n", encoding="utf-8")
    sources = [{"id": "mn", "label": "MN", "path": "mn", "mode": "labels"}]
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)
    robin = next(c for c in tree["sources"][0]["children"] if c["name"] == "Robin")
    assert robin["type"] == "dir"
    assert robin["path"].startswith("mn")  # anchored to source path
    assert "Robin" in robin["path"]


def test_dir_mode_source_unaffected_by_label_logic(tmp_path):
    """A dir-mode source produces the normal nested dir/file tree, unchanged."""
    (tmp_path / "kh" / "sub").mkdir(parents=True)
    (tmp_path / "kh" / "sub" / "a.md").write_text(
        "---\nfolders:\n- Elsewhere\n---\n# A\n", encoding="utf-8"
    )
    # No mode key → dir mode (default)
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)
    # Dir-mode: children are real dirs/files, not virtual label folders
    children = tree["sources"][0]["children"]
    assert len(children) == 1
    assert children[0]["name"] == "sub"
    assert children[0]["type"] == "dir"
    # File still under its real physical dir, not under "Elsewhere"
    assert children[0]["children"][0]["name"] == "a.md"


def test_build_tree_source_node_reports_mode(tmp_path):
    """Each source node exposes its mode so the frontend can gate drag-drop targets."""
    (tmp_path / "mn" / "Jordan").mkdir(parents=True)
    note = tmp_path / "mn" / "Jordan" / "2026-06-29 — X.md"
    note.write_text("---\nfolders:\n- Jordan\n---\n# X\n", encoding="utf-8")
    (tmp_path / "kh").mkdir(parents=True)
    sources = [
        {"id": "mn", "label": "MN", "path": "mn", "mode": "labels"},
        {"id": "kh", "label": "KH", "path": "kh"},
    ]
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", tmp_path / "missing.json"),
    ):
        tree = svc.build_tree(sources)
    by_id = {s["id"]: s for s in tree["sources"]}
    assert by_id["mn"]["mode"] == "labels"
    assert by_id["kh"]["mode"] == "dir"


# ── tag index regen on edits (Phase 4, Task 4.2) ─────────────────────────────


def _patch_with_index(tmp_path, sources, index_file):
    """Patch svc + tag_index module for index-regen tests."""
    from backend.services import tag_index as ti

    return (
        patch.multiple(svc, _ROOT=tmp_path, OZOS_KNOWLEDGE_SOURCES=tmp_path / "missing.json"),
        patch.object(svc, "load_sources", lambda: sources),
        patch.object(ti, "_ROOT", tmp_path),
        patch.object(ti, "load_sources", lambda: sources),
        patch.object(svc, "_TAG_INDEX_PATH", str(index_file)),
    )


def test_update_meta_regenerates_tag_index(tmp_path):
    """After update_meta adds tag 'pricing', the index file contains it."""
    (tmp_path / "kh").mkdir()
    f = tmp_path / "kh" / "2026-06-29 — X.md"
    f.write_text(
        "---\ndate: '2026-06-29'\ntags: []\nfolders:\n- Jordan\n---\n# Body\n",
        encoding="utf-8",
    )
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    index_file = tmp_path / ".ozos" / "knowledge-tag-index.json"
    p1, p2, p3, p4, p5 = _patch_with_index(tmp_path, sources, index_file)
    with p1, p2, p3, p4, p5:
        svc.update_meta("kh/2026-06-29 — X.md", tags=["pricing"])
    assert index_file.exists()
    import json as _json

    idx = _json.loads(index_file.read_text(encoding="utf-8"))
    assert "pricing" in idx["by_tag"]


def test_write_file_regenerates_tag_index(tmp_path):
    """After write_file with a new tag, the index file reflects it."""
    (tmp_path / "kh").mkdir()
    f = tmp_path / "kh" / "2026-06-29 — X.md"
    f.write_text("---\ntags: []\n---\n# X\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    index_file = tmp_path / ".ozos" / "knowledge-tag-index.json"
    p1, p2, p3, p4, p5 = _patch_with_index(tmp_path, sources, index_file)
    with p1, p2, p3, p4, p5:
        svc.write_file("kh/2026-06-29 — X.md", "---\ntags:\n- budget\n---\n# X\n")
    assert index_file.exists()
    import json as _json

    idx = _json.loads(index_file.read_text(encoding="utf-8"))
    assert "budget" in idx["by_tag"]


def test_rename_file_regenerates_tag_index(tmp_path):
    """After rename_file, the index reflects the new path."""
    (tmp_path / "kh").mkdir()
    f = tmp_path / "kh" / "2026-06-29 — Old.md"
    f.write_text("---\ntags:\n- oldtag\n---\n# Old\n", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    index_file = tmp_path / ".ozos" / "knowledge-tag-index.json"
    p1, p2, p3, p4, p5 = _patch_with_index(tmp_path, sources, index_file)
    with p1, p2, p3, p4, p5:
        svc.rename_file("kh/2026-06-29 — Old.md", "2026-06-29 — New.md")
    assert index_file.exists()
    import json as _json

    idx = _json.loads(index_file.read_text(encoding="utf-8"))
    # oldtag still indexed (same content, new path)
    assert "oldtag" in idx["by_tag"]
    paths = [e["path"] for e in idx["by_tag"]["oldtag"]]
    assert any("New" in p for p in paths)
    assert not any("Old" in p for p in paths)


def test_search_boosts_tagged_doc_above_body_mention(tmp_path):
    """search('pricing') ranks a doc tagged 'pricing' above one that only mentions it in body."""
    (tmp_path / "kh").mkdir()
    # Doc A: tagged pricing, body mentions it once
    (tmp_path / "kh" / "2026-06-01 — Tagged.md").write_text(
        "---\ntags:\n- pricing\n---\n# Tagged\nBody mentions pricing once.\n",
        encoding="utf-8",
    )
    # Doc B: not tagged, body mentions "pricing" many times to win on content score alone
    (tmp_path / "kh" / "2026-06-01 — Body Only.md").write_text(
        "---\ntags: []\n---\n# Body Only\n" + "pricing " * 20 + "\n",
        encoding="utf-8",
    )
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    # Build the index file so search can use it
    index_file = tmp_path / ".ozos" / "knowledge-tag-index.json"
    p1, p2, p3, p4, p5 = _patch_with_index(tmp_path, sources, index_file)
    with p1, p2, p3, p4, p5:
        # Pre-build index
        from backend.services import tag_index as ti

        ti.write_tag_index(str(index_file), sources=sources)
        results = svc.search("pricing")["results"]
    assert len(results) >= 2
    paths = [r["path"] for r in results]
    assert any("Tagged" in p for p in paths)
    assert any("Body Only" in p for p in paths)
    tagged_rank = next(i for i, r in enumerate(results) if "Tagged" in r["path"])
    body_rank = next(i for i, r in enumerate(results) if "Body Only" in r["path"])
    assert tagged_rank < body_rank, (
        f"Tagged doc (rank {tagged_rank}) should beat body-only doc (rank {body_rank})"
    )


def test_search_multiword_tag_boost_does_not_exceed_filename(tmp_path):
    """A doc tagged both 'pricing' and 'strategy' must NOT outrank a doc whose
    FILENAME contains one query word while the other only appears in the body.

    The scenario that exposes the double-boost bug:
    - Doc A (filename): name contains 'pricing', body mentions 'strategy' once
      → score = 1000 (filename) + 1 (body) = 1001, no tag boost
    - Doc B (double-tagged): tags=[pricing, strategy], body mentions each once
      → score = 1 + 1 (body) + 500*2 (buggy double boost) = 1002  ← beats A!
      → score = 1 + 1 (body) + 500*1 (correct single boost) = 503  ← loses to A

    The tag boost must be applied at most ONCE per document regardless of how
    many query words match indexed tags.
    """
    (tmp_path / "kh").mkdir()
    # Doc A: filename contains "pricing", body mentions "strategy" once
    (tmp_path / "kh" / "2026-06-01 — pricing-doc.md").write_text(
        "---\ntags: []\n---\n# Pricing Doc\nMentions strategy once.\n",
        encoding="utf-8",
    )
    # Doc B: tagged with BOTH query words, body mentions each once (no filename match)
    (tmp_path / "kh" / "2026-06-01 — Tagged Both.md").write_text(
        "---\ntags:\n- pricing\n- strategy\n---\n# Tagged Both\nBody mentions pricing and strategy.\n",
        encoding="utf-8",
    )
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    index_file = tmp_path / ".ozos" / "knowledge-tag-index.json"
    p1, p2, p3, p4, p5 = _patch_with_index(tmp_path, sources, index_file)
    with p1, p2, p3, p4, p5:
        from backend.services import tag_index as ti

        ti.write_tag_index(str(index_file), sources=sources)
        results = svc.search("pricing strategy")["results"]
    assert len(results) >= 2
    filename_rank = next(i for i, r in enumerate(results) if "pricing-doc" in r["path"])
    tagged_rank = next(i for i, r in enumerate(results) if "Tagged Both" in r["path"])
    assert filename_rank < tagged_rank, (
        f"Filename doc (rank {filename_rank}) must beat double-tagged doc (rank {tagged_rank}): "
        "tag boost must not be applied once per matching query word"
    )


# ── folder_tags_for ──────────────────────────────────────────────────────────


def test_folder_tags_walks_ancestors_default_basename(tmp_path):
    """With no map, a doc inherits each ancestor folder's basename as a flat tag."""
    (tmp_path / "kh" / "DMP" / "Lotame").mkdir(parents=True)
    (tmp_path / "kh" / "DMP" / "Lotame" / "a.md").write_text("# a", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        tags = svc.folder_tags_for("kh/DMP/Lotame/a.md", {})
    assert tags == ["kh", "DMP", "Lotame"]


def test_folder_tags_uses_map_override_and_skip(tmp_path):
    """A string maps a folder to a chosen tag; None skips it (confers nothing)."""
    (tmp_path / "kh" / "DMP" / "Lotame").mkdir(parents=True)
    (tmp_path / "kh" / "DMP" / "Lotame" / "a.md").write_text("# a", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    tag_map = {"kh": "Ads", "kh/DMP": "DMP", "kh/DMP/Lotame": None}
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        tags = svc.folder_tags_for("kh/DMP/Lotame/a.md", tag_map)
    assert tags == ["Ads", "DMP"]


def test_folder_tags_file_at_source_root(tmp_path):
    """A file directly at the source root gets only the source tag."""
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "a.md").write_text("# a", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        tags = svc.folder_tags_for("kh/a.md", {"kh": "Ads"})
    assert tags == ["Ads"]


def test_folder_tags_empty_for_labels_source(tmp_path):
    """Label-mode sources are excluded — folder_tags_for returns []."""
    (tmp_path / "mn").mkdir()
    (tmp_path / "mn" / "a.md").write_text("---\nfolders:\n- X\n---\n# a", encoding="utf-8")
    sources = [{"id": "mn", "label": "MN", "path": "mn", "mode": "labels"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2:
        tags = svc.folder_tags_for("mn/a.md", {"mn": "Notes"})
    assert tags == []


def test_folder_tags_honors_explicit_sources_without_load_sources(tmp_path):
    """Passing `sources` explicitly must be used directly, without calling load_sources()."""
    (tmp_path / "kh" / "DMP").mkdir(parents=True)
    (tmp_path / "kh" / "DMP" / "a.md").write_text("# a", encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    with (
        patch.object(svc, "_ROOT", tmp_path),
        patch.object(svc, "load_sources", side_effect=AssertionError("should not be called")),
    ):
        tags = svc.folder_tags_for("kh/DMP/a.md", {"kh": "Ads", "kh/DMP": "DMP"}, sources=sources)
    assert tags == ["Ads", "DMP"]


def test_read_file_includes_folder_tags(tmp_path):
    """read_file surfaces derived folder_tags from the loaded config map."""
    (tmp_path / "kh" / "DMP").mkdir(parents=True)
    (tmp_path / "kh" / "DMP" / "a.md").write_text("# a", encoding="utf-8")
    cfg = tmp_path / "folder-tags.json"
    cfg.write_text(json.dumps({"kh": "Ads", "kh/DMP": "DMP"}), encoding="utf-8")
    sources = [{"id": "kh", "label": "KH", "path": "kh"}]
    p1, p2 = _patch(tmp_path, sources)
    with p1, p2, patch.object(svc, "OZOS_KNOWLEDGE_FOLDER_TAGS", cfg):
        out = svc.read_file("kh/DMP/a.md")
    assert out["folder_tags"] == ["Ads", "DMP"]


def test_load_folder_tag_map_missing_returns_empty(tmp_path):
    """A missing config file yields an empty map, never an error."""
    p1, p2 = _patch(tmp_path, [{"id": "kh", "label": "KH", "path": "kh"}])
    with p1, p2, patch.object(svc, "OZOS_KNOWLEDGE_FOLDER_TAGS", tmp_path / "nope.json"):
        assert svc.load_folder_tag_map() == {}
