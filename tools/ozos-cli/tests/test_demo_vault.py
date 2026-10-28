"""vault-demo/ is a committed vault for a fictional company (Brightfold). A stranger
runs `./ozos init --demo` and sees a populated app. These tests keep it consistent
with the engine's registries and free of anything that is not invented."""

import json
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cli  # noqa: E402
from cli import main  # noqa: E402

DEMO = cli.DEMO_TEMPLATE
DEMO_DOMAIN = "@brightfold.example.com"
GOAL_STATUSES = {"on_track", "at_risk", "off_track", "complete", "cancelled", "pending"}


def _json(rel: str) -> dict:
    return json.loads((DEMO / rel).read_text(encoding="utf-8"))


def _frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n"), path
    end = text.index("\n---\n", 4)
    return yaml.safe_load(text[4:end]) or {}


def test_demo_people_are_fictional_and_complete():
    dirs = sorted(p for p in (DEMO / "people-hub" / "people").iterdir() if p.is_dir())
    assert len(dirs) == 7
    for d in dirs:
        meta = yaml.safe_load((d / "meta.yaml").read_text(encoding="utf-8"))
        assert meta["name"] == d.name
        assert meta["display_name"] and meta["role"]
        assert meta["email"].endswith(DEMO_DOMAIN), d.name


def test_demo_setup_is_finished():
    state = _json(".ozos/setup.json")
    assert set(state["items"]) == set(cli._registry().ITEM_IDS)
    assert {it["status"] for it in state["items"].values()} <= {"done", "skipped"}
    assert state["badge_dismissed"] is True
    assert state["cadence"]["mode"] == "company"


def test_demo_goals_load():
    goals = _json(".ozos/goals.json")["goals"]
    assert len(goals) == 3
    point_ids = {p["id"] for p in _json(".ozos/datapoints.json")["datapoints"]}
    for g in goals:
        assert g["source"] == "manual" and g["status"] in GOAL_STATUSES
        assert g["data_point_id"] is None or g["data_point_id"] in point_ids
    assert any(g["data_point_id"] for g in goals), "one goal is measured by a data point"


def test_demo_datapoints_are_csv_inside_the_vault():
    points = _json(".ozos/datapoints.json")["datapoints"]
    assert len(points) == 2
    for p in points:
        assert p["source"]["kind"] == "csv"
        assert (DEMO / p["source"]["path"]).is_file(), p["id"]


def test_demo_tiles_point_at_demo_datapoints():
    layout = _json(".ozos/datahub.json")
    point_ids = {p["id"] for p in _json(".ozos/datapoints.json")["datapoints"]}
    assert len(layout["tabs"]) == 1
    tiles = [t for tab in layout["tabs"].values() for row in tab["rows"] for t in row["tiles"]]
    assert len(tiles) == 3
    assert all(t["refId"] is None or t["refId"] in point_ids for t in tiles)


def test_demo_notes_route_to_demo_folders():
    notes = sorted((DEMO / "knowledge-hub" / "meeting-notes").rglob("*.md"))
    assert len(notes) == 4
    folders = set(_json(".ozos/meeting-routing.json")["folders"])
    for note in notes:
        meta = _frontmatter(note)
        assert set(meta["folders"]) <= folders, note.name
        assert all(a["email"].endswith(DEMO_DOMAIN) for a in meta["attendees"]), note.name


def test_init_demo_populates_the_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "HOME", tmp_path)
    vault = tmp_path / "v"
    assert main(["init", "--demo", "--vault", str(vault)]) == 0
    cfg = json.loads((tmp_path / ".ozos" / "config.json").read_text())
    assert cfg["name"] == cli.DEMO_USER["name"] and cfg["vault"] == str(vault)
    cache = vault / ".ozos" / "datapoint-cache"
    clinics = json.loads((cache / "active-clinics.json").read_text())
    assert "error" not in clinics and clinics["rows"][0][0] == 412
    bookings = json.loads((cache / "weekly-bookings.json").read_text())
    assert len(bookings["rows"]) == 12


def test_init_demo_respects_an_existing_config(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli, "HOME", tmp_path)
    (tmp_path / ".ozos").mkdir()
    (tmp_path / ".ozos" / "config.json").write_text(json.dumps({"vault": str(tmp_path / "other")}))
    rc = main(["init", "--demo", "--vault", str(tmp_path / "v")])
    assert rc == 1
    assert "--force" in capsys.readouterr().err
    assert not (tmp_path / "v").exists()
