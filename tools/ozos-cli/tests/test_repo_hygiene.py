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
