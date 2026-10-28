"""Stranger-facing files of the engine repo: README, screenshots, CONTRIBUTING,
SECURITY, package metadata, issue template. Pinned so the published face cannot
regress silently."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
IMAGES = ["home", "setup", "people", "goals", "data-hub", "knowledge-hub"]


def test_demo_screenshots_exist():
    for name in IMAGES:
        png = REPO_ROOT / "docs" / "images" / f"{name}.png"
        assert png.is_file(), png
        assert png.stat().st_size > 20_000, f"{name}.png looks blank"


VIDEO = "https://github.com/user-attachments/assets/d752f9cd-4c36-4aa4-b760-04267fc0b7da"


def _lines(path: Path) -> list[str]:
    return [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def test_readme_is_for_strangers():
    import re

    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    assert readme.count(VIDEO) == 1, "the approved launch video link stays, exactly once"
    assert "./ozos init --demo" in readme
    for name in IMAGES:
        assert f"docs/images/{name}.png" in readme, name
    assert "## What works today" in readme
    assert re.search(r"Phase \d", readme) is None, "no phase numbers for strangers"
    for link in ("docs/SETUP.md", "CONTRIBUTING.md", "SECURITY.md", "LICENSE"):
        assert link in readme, link


def test_contributing_and_security_fit_a_screen():
    contributing = REPO_ROOT / "CONTRIBUTING.md"
    security = REPO_ROOT / "SECURITY.md"
    assert contributing.is_file() and security.is_file()
    assert len(_lines(contributing)) <= 45 and len(_lines(security)) <= 45
    c = contributing.read_text(encoding="utf-8")
    assert "pipeline.py" in c and "scrub-check" in c and "[tool-name]" in c
    s = security.read_text(encoding="utf-8")
    assert ".env" in s and "scrub-check --history" in s and "report" in s.lower()


def test_package_json_names_the_project():
    import json

    pkg = json.loads((REPO_ROOT / "app" / "frontend" / "package.json").read_text(encoding="utf-8"))
    assert pkg["name"] == "ozos-brain-frontend"
    assert pkg["license"] == "MIT" and pkg["author"] == "cozren"
    assert pkg["private"] is True


def test_bug_report_template_exists():
    tpl = REPO_ROOT / ".github" / "ISSUE_TEMPLATE" / "bug_report.md"
    assert tpl.is_file()
    assert len(tpl.read_text(encoding="utf-8").splitlines()) <= 25
    assert ".env" in tpl.read_text(encoding="utf-8"), "reminds not to paste credentials"


def test_project_settings_enable_no_plugins():
    import json

    settings = json.loads((REPO_ROOT / ".claude" / "settings.json").read_text(encoding="utf-8"))
    assert "enabledPlugins" not in settings
