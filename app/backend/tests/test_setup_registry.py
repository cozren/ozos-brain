"""The setup journal's item registry is declarative data the app, the CLI and the
skill all read. Ids and group order are fixed by the Phase 2 brief."""

import json
import subprocess
import sys
from pathlib import Path

from backend.services.setup_registry import (
    GROUPS,
    ITEM_IDS,
    ITEMS,
    STATUSES,
    env_whitelist,
    item,
)

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_item_ids_and_group_order():
    assert [g for g, _ in GROUPS] == [
        "you",
        "meeting-notes",
        "workspace",
        "boards",
        "documentation",
        "people",
        "review-cycle",
        "goals",
        "data",
        "insights",
    ]
    assert ITEM_IDS == [
        "profile",
        "gmail-gemini",
        "granola",
        "routing-folders",
        "slack-mcp",
        "google-workspace-mcp",
        "figma-mcp",
        "miro-mcp",
        "confluence",
        "notion-or-wiki-drop-folder",
        "pdf-drop-folder",
        "add-stakeholder",
        "define-cycle",
        "define-goals",
        "first-data-point",
        "interviews-folder",
        "surveys-folder",
    ]
    assert STATUSES == ("not_started", "in_progress", "done", "skipped", "needs_attention")


def test_every_item_belongs_to_a_group_and_has_copy():
    groups = {g for g, _ in GROUPS}
    for it in ITEMS:
        assert it["group"] in groups, it["id"]
        assert it["title"] and it["why"] and it["kind"] and it["writes"], it["id"]
        for key in ("setup_doc", "vital", "env", "mcp_match", "default_folder"):
            assert key in it, (it["id"], key)
    assert item("granola")["vital"] == "meeting-notes"
    assert item("confluence")["env"] == [
        "ATLASSIAN_EMAIL",
        "ATLASSIAN_TOKEN",
        "ATLASSIAN_SUBDOMAIN",
    ]
    assert item("slack-mcp")["mcp_match"] == "slack"
    assert item("pdf-drop-folder")["default_folder"] == "pdfs"
    assert item("nope") is None


def test_vault_template_lists_every_item_not_started():
    tpl = json.loads((REPO_ROOT / "vault-template" / ".ozos" / "setup.json").read_text())
    assert set(tpl["items"]) == set(ITEM_IDS)
    assert {v["status"] for v in tpl["items"].values()} == {"not_started"}
    assert tpl["badge_dismissed"] is False
    assert tpl["cadence"] is None


def test_registry_is_importable_without_app_config():
    """The CLI imports the registry without loading the app config (which reads the
    real vault and .env)."""
    code = (
        "import sys; sys.path.insert(0, 'app'); "
        "import backend.services.setup_registry as r; "
        "assert 'backend.config' not in sys.modules; print(len(r.ITEMS))"
    )
    out = subprocess.run(
        [sys.executable, "-c", code], cwd=REPO_ROOT, capture_output=True, text=True
    )
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == "17"


_DOC_HEADINGS = ["## What it gives you", "## What you need", "## Steps", "## How to verify"]


def test_setup_docs_exist_with_the_four_sections():
    docs = sorted({it["setup_doc"] for it in ITEMS if it["setup_doc"]})
    assert docs == [
        "connectors/atlassian-goals/setup.md",
        "connectors/metabase/setup.md",
        "docs/connectors/gmail-gemini-notes.md",
        "docs/connectors/granola.md",
    ]
    for rel in docs:
        text = (REPO_ROOT / rel).read_text(encoding="utf-8")
        positions = [text.find(h) for h in _DOC_HEADINGS]
        assert all(p >= 0 for p in positions), (rel, positions)
        assert positions == sorted(positions), rel


def test_setup_guide_describes_the_setup_page():
    guide = (REPO_ROOT / "docs" / "SETUP.md").read_text(encoding="utf-8")
    assert "Setup page" in guide and "/ozos-setup" in guide
    assert "Until the Setup page ships" not in guide
    assert "## A. JSON reference" in guide
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    assert "Setup page" in readme
    # Phase 3: the guide has a Goals section and a goals.json reference.
    assert "## 8. Goals" in guide and "### A.6 `goals.json`" in guide
    assert "Placeholders until Phases 3 and 4" not in guide
    assert "Phase 3" in readme and "Goals" in readme
    app_readme = (REPO_ROOT / "app" / "README.md").read_text(encoding="utf-8")
    assert "arrive in Phase 3" not in app_readme and "/api/goals" in app_readme
    # Phase 4: the guide has a Data points section and a datapoints.json reference.
    assert "## 9. Data points" in guide and "### A.7 `datapoints.json`" in guide
    assert "Placeholder until Phase 4" not in guide and "Phases 4 and 5" not in guide
    assert "Phase 4" in readme and "data point" in readme.lower()
    assert "/api/datapoints" in app_readme


def test_define_goals_is_a_real_item():
    it = item("define-goals")
    assert it["kind"] == "goals" and it["vital"] == "goals-sync"
    assert it["env"] == [
        "ATLASSIAN_EMAIL",
        "ATLASSIAN_TOKEN",
        "ATLASSIAN_SUBDOMAIN",
        "ATLASSIAN_CLOUD_ID",
    ]
    assert env_whitelist() == [
        "ATLASSIAN_EMAIL",
        "ATLASSIAN_TOKEN",
        "ATLASSIAN_SUBDOMAIN",
        "ATLASSIAN_CLOUD_ID",
        "METABASE_URL",
        "METABASE_API_KEY",
    ]


def test_vault_template_has_empty_goals_file():
    tpl = json.loads((REPO_ROOT / "vault-template" / ".ozos" / "goals.json").read_text())
    assert tpl == {"goals": [], "sync": None}


def test_goals_docs_no_longer_defer_to_phase_3():
    setup_md = (REPO_ROOT / "connectors" / "atlassian-goals" / "setup.md").read_text()
    assert "Phase 3" not in setup_md and "Sync" in setup_md
    skill = (REPO_ROOT / ".claude" / "skills" / "ozos-setup" / "SKILL.md").read_text()
    assert "define-goals" in skill and "goals_sync" in skill and "/api/goals/sync" in skill
    readme = (REPO_ROOT / "connectors" / "atlassian-goals" / "README.md").read_text()
    assert "/api/goals/sync" in readme


def test_first_data_point_is_a_real_item():
    it = item("first-data-point")
    assert it["kind"] == "data" and it["vital"] == "datapoints-refresh"
    assert it["env"] == ["METABASE_URL", "METABASE_API_KEY"]
    assert it["setup_doc"] == "connectors/metabase/setup.md"
    assert not any(i["kind"] == "placeholder" for i in ITEMS)


def test_vault_template_has_empty_datapoints_file_and_ignores_cache():
    tpl = json.loads((REPO_ROOT / "vault-template" / ".ozos" / "datapoints.json").read_text())
    assert tpl == {"datapoints": []}
    assert ".ozos/datapoint-cache/" in (REPO_ROOT / "vault-template" / ".gitignore").read_text()


def test_vault_template_has_datapoints_refresh_vital():
    vitals = json.loads((REPO_ROOT / "vault-template" / ".ozos" / "vitals.json").read_text())
    [v] = [v for v in vitals["vitals"] if v["id"] == "datapoints-refresh"]
    assert v["run"] == ["python3", "ozos", "datapoints", "refresh"]
    assert v["output_dir"] == ".ozos/datapoint-cache" and v["output_glob"] == "*.json"
    assert v["stale_after_hours"] == 24


def test_data_docs_no_longer_defer_to_phase_4():
    setup_md = (REPO_ROOT / "connectors" / "metabase" / "setup.md").read_text()
    assert "Phase 4" not in setup_md and "placeholder" not in setup_md.lower()
    assert "Test connection" in setup_md and "METABASE_API_KEY" in setup_md
    skill = (REPO_ROOT / ".claude" / "skills" / "ozos-setup" / "SKILL.md").read_text()
    assert "first-data-point" in skill and "/api/datapoints" in skill
    assert "datapoints.add_datapoint" in skill
    readme = (REPO_ROOT / "connectors" / "metabase" / "README.md").read_text()
    assert "/api/datapoints" in readme and "query_card" in readme
    for rel in ("CLAUDE.md", "AGENTS.md"):
        assert "data point" in (REPO_ROOT / rel).read_text().lower(), rel
