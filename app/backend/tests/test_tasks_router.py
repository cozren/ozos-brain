"""API tests for /api/tasks — own-task CRUD plus review-goal mirror + write-back."""

import yaml
import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Throwaway task store + a data dir holding the local user's active review cycle."""
    # personal-tasks store points at a fresh file
    monkeypatch.setattr("backend.routers.tasks.PERSONAL_TASKS_FILE", tmp_path / "tasks.json")

    # data dir: cycles.yaml (active cycle) + the local user's cycle summary with two goals
    data_dir = tmp_path / "people-hub"
    (data_dir).mkdir()
    (data_dir / "cycles.yaml").write_text(yaml.safe_dump({"active_cycle": "2026-deep-dive"}))
    monkeypatch.setattr("backend.routers.tasks.ME_PERSON_ID", "taylor")
    cycle_dir = data_dir / "people" / "taylor" / "cycles" / "2026-deep-dive"
    cycle_dir.mkdir(parents=True)
    (cycle_dir / "summary.yaml").write_text(
        yaml.safe_dump(
            {
                "key_goals": [
                    {"title": "Product knowledge", "description": "immerse", "done": False},
                    {"title": "Reporting", "description": "metrics", "done": False},
                ],
            }
        )
    )
    monkeypatch.setattr("backend.services.data.DATA_DIR", data_dir)
    return {"data_dir": data_dir, "cycle_dir": cycle_dir}


def test_get_tasks_empty_store_lists_review_goals(env):
    r = client.get("/api/tasks")
    assert r.status_code == 200
    body = r.json()
    assert body["tasks"] == []
    assert len(body["reviewGoals"]) == 2
    assert body["reviewGoals"][0]["labels"] == ["performance review"]
    assert "performance review" in body["labels"]


def test_create_then_get_round_trip(env):
    created = client.post("/api/tasks", json={"title": "Ship it", "labels": ["work"]}).json()
    assert created["title"] == "Ship it"
    body = client.get("/api/tasks").json()
    assert [t["id"] for t in body["tasks"]] == [created["id"]]
    assert "work" in body["labels"]


def test_create_rejects_blank_title(env):
    assert client.post("/api/tasks", json={"title": "   "}).status_code == 422


def test_patch_task_marks_done(env):
    t = client.post("/api/tasks", json={"title": "A"}).json()
    r = client.patch(f"/api/tasks/{t['id']}", json={"done": True})
    assert r.status_code == 200
    assert r.json()["done"] is True


def test_patch_task_subtasks(env):
    t = client.post("/api/tasks", json={"title": "A"}).json()
    subs = [{"id": "s_1", "title": "step", "done": False}]
    r = client.patch(f"/api/tasks/{t['id']}", json={"subtasks": subs})
    assert r.json()["subtasks"] == subs


def test_patch_missing_task_404(env):
    assert client.patch("/api/tasks/t_ghost", json={"done": True}).status_code == 404


def test_reorder_endpoint_changes_listing_order(env):
    a = client.post("/api/tasks", json={"title": "A"}).json()
    b = client.post("/api/tasks", json={"title": "B"}).json()
    c = client.post("/api/tasks", json={"title": "C"}).json()
    r = client.patch("/api/tasks/reorder", json={"ids": [c["id"], a["id"], b["id"]]})
    assert r.status_code == 200
    ids = [t["id"] for t in client.get("/api/tasks").json()["tasks"]]
    assert ids == [c["id"], a["id"], b["id"]]


def test_reorder_does_not_shadow_patch_task(env):
    # the /reorder literal route must win over /{task_id}, not be read as a task id
    t = client.post("/api/tasks", json={"title": "A"}).json()
    client.patch("/api/tasks/reorder", json={"ids": [t["id"]]})
    # the task is untouched (no phantom task named "reorder", title intact)
    body = client.get("/api/tasks").json()
    assert [x["title"] for x in body["tasks"]] == ["A"]


def test_delete_task(env):
    t = client.post("/api/tasks", json={"title": "A"}).json()
    assert client.delete(f"/api/tasks/{t['id']}").status_code == 200
    assert client.get("/api/tasks").json()["tasks"] == []


def test_delete_missing_task_404(env):
    assert client.delete("/api/tasks/t_ghost").status_code == 404


def test_review_goal_done_writes_back_to_summary(env):
    r = client.patch("/api/tasks/review-goal/2026-deep-dive/0", json={"done": True})
    assert r.status_code == 200
    assert r.json()["done"] is True
    # persisted to the cycle summary on disk
    saved = yaml.safe_load((env["cycle_dir"] / "summary.yaml").read_text())
    assert saved["key_goals"][0]["done"] is True
    # and reflected via the live mirror
    assert client.get("/api/tasks").json()["reviewGoals"][0]["done"] is True


def test_review_goal_edit_title_and_description_writes_back(env):
    client.patch(
        "/api/tasks/review-goal/2026-deep-dive/1",
        json={"title": "Reporting & data", "description": "deeper metrics"},
    )
    saved = yaml.safe_load((env["cycle_dir"] / "summary.yaml").read_text())
    assert saved["key_goals"][1]["title"] == "Reporting & data"
    assert saved["key_goals"][1]["description"] == "deeper metrics"


def test_review_goal_subtasks_write_back(env):
    subs = [{"id": "s_1", "title": "immerse week 1", "done": False}]
    r = client.patch("/api/tasks/review-goal/2026-deep-dive/0", json={"subtasks": subs})
    assert r.status_code == 200
    assert r.json()["subtasks"] == subs
    saved = yaml.safe_load((env["cycle_dir"] / "summary.yaml").read_text())
    assert saved["key_goals"][0]["subtasks"] == subs
    # surfaced on next load
    assert client.get("/api/tasks").json()["reviewGoals"][0]["subtasks"] == subs


def test_task_plan_set_and_clear(env):
    t = client.post("/api/tasks", json={"title": "A"}).json()
    plan = {"start": "2026-06-15", "end": "2026-07-13"}
    assert client.patch(f"/api/tasks/{t['id']}", json={"plan": plan}).json()["plan"] == plan
    # explicit null clears it (exclude_unset keeps the null)
    assert client.patch(f"/api/tasks/{t['id']}", json={"plan": None}).json()["plan"] is None


def test_review_goal_plan_writes_back(env):
    plan = {"start": "2026-06-15", "end": "2026-07-13"}
    r = client.patch("/api/tasks/review-goal/2026-deep-dive/0", json={"plan": plan})
    assert r.status_code == 200 and r.json()["plan"] == plan
    saved = yaml.safe_load((env["cycle_dir"] / "summary.yaml").read_text())
    assert saved["key_goals"][0]["plan"] == plan


def test_review_goal_out_of_range_404(env):
    assert (
        client.patch("/api/tasks/review-goal/2026-deep-dive/9", json={"done": True}).status_code
        == 404
    )


def test_get_tasks_includes_label_colors(env):
    client.post("/api/tasks", json={"title": "A", "labels": ["work"]})
    body = client.get("/api/tasks").json()
    assert "labelColors" in body
    # auto-assigned a color for the in-use label
    assert body["labelColors"]["work"].startswith("#")


def test_set_label_color_round_trip(env):
    client.post("/api/tasks", json={"title": "A", "labels": ["work"]})
    r = client.patch("/api/tasks/labels/work", json={"color": "#ff6ad5"})
    assert r.status_code == 200
    assert r.json()["labelColors"]["work"] == "#ff6ad5"
    # reflected on next load
    assert client.get("/api/tasks").json()["labelColors"]["work"] == "#ff6ad5"


def test_set_label_color_rejects_bad_hex(env):
    assert client.patch("/api/tasks/labels/work", json={"color": "nope"}).status_code == 422


def test_review_goals_empty_when_no_active_cycle(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.routers.tasks.PERSONAL_TASKS_FILE", tmp_path / "tasks.json")
    data_dir = tmp_path / "people-hub"
    data_dir.mkdir()
    (data_dir / "cycles.yaml").write_text(yaml.safe_dump({"cycles": {}}))
    monkeypatch.setattr("backend.services.data.DATA_DIR", data_dir)
    body = client.get("/api/tasks").json()
    assert body["reviewGoals"] == []
