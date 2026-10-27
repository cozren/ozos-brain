"""API tests for the per-person cycle lifecycle: create a blank cycle (carrying
growth goals forward), list cycles with metadata, and finalize a cycle."""

import yaml
import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Data dir with one person (alex) who has an active 2026 deep-dive cycle
    holding two growth goals."""
    data_dir = tmp_path / "people-hub"
    (data_dir).mkdir()
    (data_dir / "cycles.yaml").write_text(yaml.safe_dump({"active_cycle": "2026-deep-dive"}))

    person_dir = data_dir / "people" / "alex"
    (person_dir / "cycles").mkdir(parents=True)
    (person_dir / "meta.yaml").write_text(yaml.safe_dump({"role": "PM"}))
    cycle_dir = person_dir / "cycles" / "2026-deep-dive"
    cycle_dir.mkdir()
    (cycle_dir / "summary.yaml").write_text(
        yaml.safe_dump(
            {
                "title": "Deep Dive 2026",
                "status": "active",
                "start_date": "2026-04-09",
                "end_date": "2026-07-17",
                "key_goals": [
                    {"title": "Grow strategy muscle", "description": "", "done": False},
                    {"title": "Mentor juniors", "description": "", "done": False},
                ],
            }
        )
    )
    monkeypatch.setattr("backend.services.data.DATA_DIR", data_dir)
    return {"data_dir": data_dir}


def test_create_cycle_makes_a_blank_cycle_with_metadata(env):
    r = client.post(
        "/api/people/alex/cycles",
        json={
            "title": "H2 Check-in 2026",
            "type": "light-touch",
            "start": "2026-07-01",
            "end": "2026-12-31",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "h2-check-in-2026"
    assert body["title"] == "H2 Check-in 2026"
    assert body["cycle_type"] == "light-touch"
    assert body["status"] == "active"
    # blank working fields
    assert body["key_accomplishments"] == []
    assert body["key_goals"] == []
    # persisted to disk
    summary_file = (
        env["data_dir"] / "people" / "alex" / "cycles" / "h2-check-in-2026" / "summary.yaml"
    )
    assert summary_file.exists()


def test_create_cycle_carries_previous_goals_as_reminder_not_into_own_goals(env):
    r = client.post(
        "/api/people/alex/cycles",
        json={"title": "2027 Annual", "type": "deep-dive", "from_cycle": "2026-deep-dive"},
    )
    assert r.status_code == 200
    body = r.json()
    # previous cycle's goals are carried as a read-only reminder
    assert [g["title"] for g in body["prev_growth_goals"]] == [
        "Grow strategy muscle",
        "Mentor juniors",
    ]
    # the new cycle's OWN growth goals start empty
    assert body["key_goals"] == []


def _two_cycle_env(data_dir):
    """Add a second global cycle (2027-annual) alex has no folder for yet."""
    (data_dir / "cycles.yaml").write_text(
        yaml.safe_dump(
            {
                "active_cycle": "2026-deep-dive",
                "cycles": {
                    "2026-deep-dive": {"name": "Deep Dive 2026", "type": "deep-dive", "events": []},
                    "2027-annual": {"name": "Annual 2027", "type": "deep-dive", "events": []},
                },
            }
        )
    )


def test_get_cycle_synthesizes_blank_summary_with_previous_goals_reminder(env):
    # A cycle defined globally that alex has no folder for yet: the GET returns a
    # synthetic blank summary whose own goals are empty and whose previous-cycle
    # reminder carries his most recent cycle's goals, without persisting anything.
    data_dir = env["data_dir"]
    _two_cycle_env(data_dir)
    folder = data_dir / "people" / "alex" / "cycles" / "2027-annual"
    assert not folder.exists()

    r = client.get("/api/people/alex/cycles/2027-annual")
    assert r.status_code == 200
    body = r.json()
    assert body["key_goals"] == []
    assert [g["title"] for g in body["prev_growth_goals"]] == [
        "Grow strategy muscle",
        "Mentor juniors",
    ]
    assert body["status"] == "active"
    # synthetic only — nothing written until the cycle is edited
    assert not folder.exists()


def test_editing_synthesized_cycle_persists_previous_goals_reminder(env):
    # Editing a not-yet-started cycle writes the folder and keeps the carried
    # previous-cycle reminder alongside the cycle's own (newly edited) goals.
    data_dir = env["data_dir"]
    _two_cycle_env(data_dir)

    upd = client.put(
        "/api/people/alex/cycles/2027-annual",
        json={"key_goals": [{"title": "New focus", "description": "", "done": False}]},
    )
    assert upd.status_code == 200

    got = client.get("/api/people/alex/cycles/2027-annual").json()
    assert [g["title"] for g in got["key_goals"]] == ["New focus"]
    assert [g["title"] for g in got["prev_growth_goals"]] == [
        "Grow strategy muscle",
        "Mentor juniors",
    ]
    assert (data_dir / "people" / "alex" / "cycles" / "2027-annual").exists()


def test_get_unknown_cycle_still_404(env):
    r = client.get("/api/people/alex/cycles/2099-ghost")
    assert r.status_code == 404


def test_create_cycle_404_for_unknown_person(env):
    r = client.post("/api/people/ghost/cycles", json={"title": "X", "type": "deep-dive"})
    assert r.status_code == 404


def test_list_cycles_returns_id_title_status_and_period(env):
    r = client.get("/api/people/alex/cycles")
    assert r.status_code == 200
    cycles = r.json()
    assert cycles == [
        {
            "id": "2026-deep-dive",
            "title": "Deep Dive 2026",
            "status": "active",
            "period": "Apr-Jul",
        }
    ]


def test_period_falls_back_to_cycle_timeline_as_month_range_without_year(env):
    # A cycle with no dates in its summary still shows a month range, derived
    # from the cycle's event timeline in cycles.yaml — and never a year.
    data_dir = env["data_dir"]
    (data_dir / "cycles.yaml").write_text(
        yaml.safe_dump(
            {
                "active_cycle": "2026-deep-dive",
                "cycles": {
                    "2025-annual": {
                        "events": [
                            {"start": "2025-01-10", "end": "2025-02-01"},
                            {"start": "2025-02-15", "end": "2025-03-20"},
                        ]
                    }
                },
            }
        )
    )
    cdir = data_dir / "people" / "alex" / "cycles" / "2025-annual"
    cdir.mkdir()
    (cdir / "summary.yaml").write_text(yaml.safe_dump({"title": "Annual 2025"}))

    cycles = client.get("/api/people/alex/cycles").json()
    annual = next(c for c in cycles if c["id"] == "2025-annual")
    assert annual["period"] == "Jan-Mar"


def test_delete_cycle_removes_it(env):
    created = client.post(
        "/api/people/alex/cycles", json={"title": "Oops", "type": "deep-dive"}
    ).json()
    cid = created["id"]
    cycle_dir = env["data_dir"] / "people" / "alex" / "cycles" / cid
    assert cycle_dir.exists()

    r = client.delete(f"/api/people/alex/cycles/{cid}")
    assert r.status_code == 200
    assert not cycle_dir.exists()


def test_finalize_cycle_sets_status_shown_in_list(env):
    upd = client.put("/api/people/alex/cycles/2026-deep-dive", json={"status": "finalized"})
    assert upd.status_code == 200
    cycles = client.get("/api/people/alex/cycles").json()
    assert cycles[0]["status"] == "finalized"
