"""Every service that touches user data must resolve paths against the vault, never
the engine root. Pins the review finding where the Knowledge Hub listed engine files."""

import json
import time


def test_knowledge_and_tag_index_data_root_is_the_vault():
    from backend import config
    from backend.services import knowledge, tag_index

    assert knowledge._ROOT == config.VAULT
    assert tag_index._ROOT == config.VAULT
    # The knowledge graph is derived output beside the engine, not vault data.
    assert knowledge._GRAPH_ROOT == config.REPO_ROOT


def test_vitals_output_dir_resolves_against_the_vault(tmp_path, monkeypatch):
    from backend.services import control_tower as svc

    vault = tmp_path / "vault"
    (vault / "knowledge-hub" / "digests").mkdir(parents=True)
    (vault / "knowledge-hub" / "digests" / "digest-x.md").write_text("# d\n")
    vitals = tmp_path / "vitals.json"
    vitals.write_text(
        json.dumps(
            {
                "vitals": [
                    {
                        "id": "daily-digest",
                        "name": "daily-digest",
                        "tool": "daily-digest",
                        "output_dir": "knowledge-hub/digests",
                        "output_glob": "*.md",
                        "stale_after_hours": 24,
                        "run": ["python3", "tools/daily-digest/digest.py"],
                    }
                ]
            }
        )
    )
    monkeypatch.setattr(svc, "OZOS_VITALS", vitals)
    monkeypatch.setattr(svc, "OZOS_RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr(svc, "VAULT", vault)
    [vital] = svc.load_vitals()
    assert vital["status"] == "ok", vital
    assert (
        svc._latest_output_mtime({"output_dir": "knowledge-hub/digests", "output_glob": "*.md"})
        is not None
    )


def test_lookup_knowledge_tags_reads_the_vault_index(tmp_path, monkeypatch):
    from backend.services import project_tools as pt

    cfg = tmp_path / ".ozos"
    cfg.mkdir()
    (cfg / "knowledge-tag-index.json").write_text(json.dumps({"by_tag": {"pricing": []}}))
    monkeypatch.setattr(pt, "OZOS_CONFIG_DIR", cfg)
    monkeypatch.setattr(pt, "REPO_ROOT", tmp_path / "engine")  # has no .ozos at all
    assert pt.lookup_knowledge_tags() == {"tags": ["pricing"]}


def test_search_roots_cover_engine_and_vault(tmp_path, monkeypatch):
    from backend.services import project_tools as pt

    engine = tmp_path / "engine"
    vault = tmp_path / "elsewhere"
    engine.mkdir()
    vault.mkdir()
    monkeypatch.setattr(pt, "REPO_ROOT", engine)
    monkeypatch.setattr(pt, "VAULT", vault)
    assert pt._search_roots() == [engine.resolve(), vault.resolve()]
    # a vault inside the engine is searched once
    inside = engine / "vault"
    inside.mkdir()
    monkeypatch.setattr(pt, "VAULT", inside)
    assert pt._search_roots() == [engine.resolve()]


def test_vital_output_path_prefers_vault_then_engine(tmp_path, monkeypatch):
    """Vital outputs live in the vault; the knowledge graph is the one output that
    lives beside the engine, so an output_dir missing from the vault falls back."""
    from backend.services import control_tower as svc

    vault = tmp_path / "vault"
    engine = tmp_path / "engine"
    (vault / "knowledge-hub" / "digests").mkdir(parents=True)
    (engine / "graphify-out").mkdir(parents=True)
    monkeypatch.setattr(svc, "VAULT", vault)
    monkeypatch.setattr(svc, "REPO_ROOT", engine)
    assert (
        svc._vital_output_path("knowledge-hub/digests")
        == (vault / "knowledge-hub" / "digests").resolve()
    )
    assert svc._vital_output_path("graphify-out") == (engine / "graphify-out").resolve()
    assert (
        svc._vital_output_path("knowledge-hub/nothing")
        == (vault / "knowledge-hub" / "nothing").resolve()
    )
