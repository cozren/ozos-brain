# backend/tests/test_knowledge_router.py
import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.services import knowledge as svc

client = TestClient(app)


def _fixture_repo(tmp_path):
    """A tiny knowledge corpus under tmp_path; returns (root, sources)."""
    (tmp_path / "kh" / "sub").mkdir(parents=True)
    (tmp_path / "kh" / "note.md").write_text("# Note\nhello world")
    (tmp_path / "kh" / "skip.txt").write_text("nope")
    (tmp_path / "kh" / "sub" / "deep.md").write_text("# Deep")
    cfg = tmp_path / "knowledge-sources.json"
    cfg.write_text(json.dumps({"sources": [{"id": "kh", "label": "KH", "path": "kh"}]}))
    return tmp_path, cfg


def test_tree_endpoint_returns_200_and_shape():
    resp = client.get("/api/knowledge/tree")
    assert resp.status_code == 200
    data = resp.json()
    assert "sources" in data
    assert isinstance(data["sources"], list)


def test_tree_endpoint_uses_registry(tmp_path):
    root, cfg = _fixture_repo(tmp_path)
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        resp = client.get("/api/knowledge/tree")
    assert resp.status_code == 200
    sources = resp.json()["sources"]
    assert len(sources) == 1
    node = sources[0]
    assert node["id"] == "kh"
    names = {c["name"] for c in node["children"]}
    assert "note.md" in names
    assert "sub" in names
    assert "skip.txt" not in names


# ── file + asset endpoints (M2) ───────────────────────────────────────


def _assets_repo(tmp_path):
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "note.md").write_text("# Note\nhello world")
    (tmp_path / "kh" / "pic.png").write_bytes(b"\x89PNG\r\nDATA")
    (tmp_path / "secret.md").write_text("SECRET")
    cfg = tmp_path / "knowledge-sources.json"
    cfg.write_text(json.dumps({"sources": [{"id": "kh", "label": "KH", "path": "kh"}]}))
    return tmp_path, cfg


def test_file_endpoint_happy_path(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    with patch.object(svc, "_ROOT", root), patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg):
        resp = client.get("/api/knowledge/file", params={"path": "kh/note.md"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["content"] == "# Note\nhello world"
    assert data["source_id"] == "kh"


def test_file_endpoint_serves_image_metadata(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    with patch.object(svc, "_ROOT", root), patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg):
        resp = client.get("/api/knowledge/file", params={"path": "kh/pic.png"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["kind"] == "image"
    assert data["content"] == ""
    assert data["name"] == "pic.png"


def test_file_endpoint_traversal_403(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    with patch.object(svc, "_ROOT", root), patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg):
        resp = client.get("/api/knowledge/file", params={"path": "kh/../secret.md"})
    assert resp.status_code == 403


def test_file_endpoint_missing_404(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    with patch.object(svc, "_ROOT", root), patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg):
        resp = client.get("/api/knowledge/file", params={"path": "kh/nope.md"})
    assert resp.status_code == 404


def test_asset_endpoint_serves_bytes(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    with patch.object(svc, "_ROOT", root), patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg):
        resp = client.get("/api/knowledge/asset", params={"path": "kh/pic.png"})
    assert resp.status_code == 200
    assert resp.content == b"\x89PNG\r\nDATA"


def test_asset_endpoint_rejects_md(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    with patch.object(svc, "_ROOT", root), patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg):
        resp = client.get("/api/knowledge/asset", params={"path": "kh/note.md"})
    assert resp.status_code == 400


# ── search endpoint (M3) ──────────────────────────────────────────────


def test_search_endpoint(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    with patch.object(svc, "_ROOT", root), patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg):
        resp = client.get("/api/knowledge/search", params={"q": "hello"})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert any(r["path"] == "kh/note.md" for r in results)


def test_search_endpoint_empty_query(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    with patch.object(svc, "_ROOT", root), patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg):
        resp = client.get("/api/knowledge/search")
    assert resp.status_code == 200
    assert resp.json()["results"] == []


# ── stars endpoints ───────────────────────────────────────────────────


def test_stars_endpoint_empty_when_missing(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "OZOS_KNOWLEDGE_STARS", tmp_path / "stars.json"),
    ):
        resp = client.get("/api/knowledge/stars")
    assert resp.status_code == 200
    assert resp.json()["starred"] == []


def test_star_endpoint_adds_and_returns_list(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    stars = tmp_path / "stars.json"
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "OZOS_KNOWLEDGE_STARS", stars),
    ):
        resp = client.post("/api/knowledge/star", json={"path": "kh/note.md", "starred": True})
    assert resp.status_code == 200
    assert "kh/note.md" in resp.json()["starred"]
    assert "kh/note.md" in json.loads(stars.read_text())["starred"]


def test_star_endpoint_removes(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    stars = tmp_path / "stars.json"
    stars.write_text(json.dumps({"starred": ["kh/note.md"]}))
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "OZOS_KNOWLEDGE_STARS", stars),
    ):
        resp = client.post("/api/knowledge/star", json={"path": "kh/note.md", "starred": False})
    assert resp.status_code == 200
    assert "kh/note.md" not in resp.json()["starred"]


def test_star_endpoint_traversal_403(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "OZOS_KNOWLEDGE_STARS", tmp_path / "stars.json"),
    ):
        resp = client.post("/api/knowledge/star", json={"path": "kh/../secret.md", "starred": True})
    assert resp.status_code == 403


# ── colour endpoints ──────────────────────────────────────────────────


def test_colors_endpoint_empty_when_missing(tmp_path):
    with patch.object(svc, "OZOS_KNOWLEDGE_COLORS", tmp_path / "colors.json"):
        resp = client.get("/api/knowledge/colors")
    assert resp.status_code == 200
    assert resp.json()["colors"] == {}


def test_color_endpoint_sets_and_returns_map(tmp_path):
    colors = tmp_path / "colors.json"
    with patch.object(svc, "OZOS_KNOWLEDGE_COLORS", colors):
        resp = client.post("/api/knowledge/color", json={"source_id": "docs", "color": "#ff8800"})
    assert resp.status_code == 200
    assert resp.json()["colors"]["docs"] == "#ff8800"
    assert json.loads(colors.read_text())["colors"]["docs"] == "#ff8800"


def test_color_endpoint_clears_with_null(tmp_path):
    colors = tmp_path / "colors.json"
    colors.write_text(json.dumps({"colors": {"docs": "#ff8800"}}))
    with patch.object(svc, "OZOS_KNOWLEDGE_COLORS", colors):
        resp = client.post("/api/knowledge/color", json={"source_id": "docs", "color": None})
    assert resp.status_code == 200
    assert "docs" not in resp.json()["colors"]


def test_color_endpoint_rejects_invalid_hex(tmp_path):
    colors = tmp_path / "colors.json"
    with patch.object(svc, "OZOS_KNOWLEDGE_COLORS", colors):
        resp = client.post("/api/knowledge/color", json={"source_id": "docs", "color": "nope"})
    assert resp.status_code == 400


# ── graph endpoint (M7) ───────────────────────────────────────────────


def test_graph_endpoint(tmp_path):
    gdir = tmp_path / "graphify-out"
    gdir.mkdir()
    (gdir / "graph.json").write_text(
        json.dumps(
            {
                "nodes": [
                    {
                        "id": "a",
                        "label": "A",
                        "file_type": "document",
                        "source_file": "docs/a.md",
                        "community": 1,
                    }
                ],
                "links": [{"source": "a", "target": "a", "relation": "self"}],
            }
        )
    )
    with patch.object(svc, "_GRAPH_ROOT", tmp_path):
        resp = client.get("/api/knowledge/graph")
    assert resp.status_code == 200
    data = resp.json()
    assert data["nodes"][0]["id"] == "a"
    assert data["links"][0]["relation"] == "self"


def test_graph_endpoint_missing_returns_empty(tmp_path):
    with patch.object(svc, "_GRAPH_ROOT", tmp_path):
        resp = client.get("/api/knowledge/graph")
    assert resp.status_code == 200
    assert resp.json() == {"nodes": [], "links": []}


# ── open endpoint ─────────────────────────────────────────────────────


def test_open_endpoint_records_open(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    opens = tmp_path / "opens.json"
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "OZOS_KNOWLEDGE_OPENS", opens),
    ):
        resp = client.post("/api/knowledge/open", json={"path": "kh/note.md"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert opens.exists()


def test_open_endpoint_traversal_403(tmp_path):
    root, cfg = _assets_repo(tmp_path)
    opens = tmp_path / "opens.json"
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "OZOS_KNOWLEDGE_OPENS", opens),
    ):
        resp = client.post("/api/knowledge/open", json={"path": "kh/../secret.md"})
    assert resp.status_code == 403


# ── order endpoints ───────────────────────────────────────────────────


def test_order_endpoint_empty_when_missing(tmp_path):
    with patch.object(svc, "OZOS_KNOWLEDGE_ORDER", tmp_path / "missing.json"):
        resp = client.get("/api/knowledge/order")
    assert resp.status_code == 200
    assert resp.json()["order"] == []


def test_order_endpoint_sets_and_persists(tmp_path):
    order_file = tmp_path / "order.json"
    with patch.object(svc, "OZOS_KNOWLEDGE_ORDER", order_file):
        resp = client.post("/api/knowledge/order", json={"order": ["docs", "kh"]})
    assert resp.status_code == 200
    assert resp.json()["order"] == ["docs", "kh"]
    assert json.loads(order_file.read_text())["order"] == ["docs", "kh"]


# ── folder creation endpoint ──────────────────────────────────────────


def test_folder_endpoint_creates_dir(tmp_path):
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with patch.object(svc, "_ROOT", tmp_path), patch.object(svc, "KNOWLEDGE_HUB_DIR", hub):
        resp = client.post(
            "/api/knowledge/folder", json={"name": "Team Retros", "parent": "knowledge-hub"}
        )
    assert resp.status_code == 200
    assert resp.json()["path"] == "knowledge-hub/team-retros"
    assert (hub / "team-retros").is_dir()


def test_folder_endpoint_rejects_parent_outside_hub(tmp_path):
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    (tmp_path / "docs").mkdir()
    with patch.object(svc, "_ROOT", tmp_path), patch.object(svc, "KNOWLEDGE_HUB_DIR", hub):
        resp = client.post("/api/knowledge/folder", json={"name": "x", "parent": "docs"})
    assert resp.status_code == 403


def test_folder_endpoint_rejects_duplicate(tmp_path):
    hub = tmp_path / "knowledge-hub"
    (hub / "existing").mkdir(parents=True)
    with patch.object(svc, "_ROOT", tmp_path), patch.object(svc, "KNOWLEDGE_HUB_DIR", hub):
        resp = client.post(
            "/api/knowledge/folder", json={"name": "Existing", "parent": "knowledge-hub"}
        )
    assert resp.status_code == 409


def test_folder_endpoint_rejects_empty_name(tmp_path):
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    with patch.object(svc, "_ROOT", tmp_path), patch.object(svc, "KNOWLEDGE_HUB_DIR", hub):
        resp = client.post("/api/knowledge/folder", json={"name": "!!!", "parent": "knowledge-hub"})
    assert resp.status_code == 400


# ── edit endpoints (Phase 2, Task 2.5) ───────────────────────────────────────


def _edit_repo(tmp_path):
    """A tiny writable corpus; returns (root, cfg)."""
    hub = tmp_path / "knowledge-hub"
    hub.mkdir()
    (tmp_path / "kh").mkdir()
    (tmp_path / "kh" / "note.md").write_text(
        "---\ntags: [pricing]\nfolders:\n- Jordan\n---\n# Note\nbody text\n", encoding="utf-8"
    )
    cfg = tmp_path / "knowledge-sources.json"
    cfg.write_text(json.dumps({"sources": [{"id": "kh", "label": "KH", "path": "kh"}]}))
    return tmp_path, cfg


def test_put_file_updates_content(tmp_path):
    root, cfg = _edit_repo(tmp_path)
    hub = root / "knowledge-hub"
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        resp = client.put(
            "/api/knowledge/file",
            json={"path": "kh/note.md", "content": "---\ntags: []\n---\n# Note edited\n"},
        )
    assert resp.status_code == 200
    assert "edited" in resp.json()["content"]
    assert resp.json()["path"] == "kh/note.md"


def test_put_file_outside_sources_403(tmp_path):
    root, cfg = _edit_repo(tmp_path)
    hub = root / "knowledge-hub"
    (tmp_path / "secret.md").write_text("SECRET", encoding="utf-8")
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        resp = client.put(
            "/api/knowledge/file",
            json={"path": "secret.md", "content": "# pwned"},
        )
    assert resp.status_code == 403


def test_put_meta_updates_tags(tmp_path):
    root, cfg = _edit_repo(tmp_path)
    hub = root / "knowledge-hub"
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        resp = client.put(
            "/api/knowledge/meta",
            json={"path": "kh/note.md", "folders": ["Jordan", "Robin"]},
        )
    assert resp.status_code == 200
    assert resp.json()["path"] == "kh/note.md"
    # body unchanged
    assert "body text" in resp.json()["content"]
    # folders update actually landed in the returned content
    assert "Robin" in resp.json()["content"]


def test_post_rename_renames_file(tmp_path):
    root, cfg = _edit_repo(tmp_path)
    hub = root / "knowledge-hub"
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        resp = client.post(
            "/api/knowledge/rename",
            json={"path": "kh/note.md", "new_name": "renamed-note.md"},
        )
    assert resp.status_code == 200
    assert resp.json()["name"] == "renamed-note.md"
    assert (tmp_path / "kh" / "renamed-note.md").exists()


def test_post_rename_rejects_separator(tmp_path):
    root, cfg = _edit_repo(tmp_path)
    hub = root / "knowledge-hub"
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        resp = client.post(
            "/api/knowledge/rename",
            json={"path": "kh/note.md", "new_name": "../evil.md"},
        )
    assert resp.status_code == 400


def test_get_tags_returns_list(tmp_path):
    root, cfg = _edit_repo(tmp_path)
    hub = root / "knowledge-hub"
    with (
        patch.object(svc, "_ROOT", root),
        patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg),
        patch.object(svc, "KNOWLEDGE_HUB_DIR", hub),
    ):
        resp = client.get("/api/knowledge/tags")
    assert resp.status_code == 200
    assert "tags" in resp.json()
    tags = resp.json()["tags"]
    assert isinstance(tags, list)
    # _edit_repo writes note.md with tags: [pricing]; verify the tag actually surfaces
    assert "pricing" in tags


# ── move endpoint ─────────────────────────────────────────────────────


def test_move_endpoint_moves_file(tmp_path):
    (tmp_path / "kh" / "sub").mkdir(parents=True)
    (tmp_path / "kh" / "note.md").write_text("# Note\nhello")
    cfg = tmp_path / "knowledge-sources.json"
    cfg.write_text(json.dumps({"sources": [{"id": "kh", "label": "KH", "path": "kh"}]}))
    with patch.object(svc, "_ROOT", tmp_path), patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg):
        resp = client.post("/api/knowledge/move", json={"path": "kh/note.md", "dest_dir": "kh/sub"})
    assert resp.status_code == 200
    assert resp.json()["path"] == "kh/sub/note.md"
    assert (tmp_path / "kh" / "sub" / "note.md").exists()


def test_move_endpoint_collision_409(tmp_path):
    (tmp_path / "kh" / "sub").mkdir(parents=True)
    (tmp_path / "kh" / "note.md").write_text("a")
    (tmp_path / "kh" / "sub" / "note.md").write_text("b")
    cfg = tmp_path / "knowledge-sources.json"
    cfg.write_text(json.dumps({"sources": [{"id": "kh", "label": "KH", "path": "kh"}]}))
    with patch.object(svc, "_ROOT", tmp_path), patch.object(svc, "OZOS_KNOWLEDGE_SOURCES", cfg):
        resp = client.post("/api/knowledge/move", json={"path": "kh/note.md", "dest_dir": "kh/sub"})
    assert resp.status_code == 409
