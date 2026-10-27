"""Unit tests for the personal-tasks service — pure store + review-goal projection."""

import json

from backend.services import tasks as svc


# ── JSON store CRUD (path-injected, tmp_path) ───────────────────────


def test_read_store_empty_when_missing(tmp_path):
    assert svc.read_store(tmp_path / "nope.json") == {"tasks": []}


def test_create_task_appends_and_persists(tmp_path):
    p = tmp_path / "tasks.json"
    t = svc.create_task(p, "Write spec", description="the details", labels=["work"])
    assert t["title"] == "Write spec"
    assert t["description"] == "the details"
    assert t["labels"] == ["work"]
    assert t["done"] is False
    assert t["subtasks"] == []
    assert t["id"].startswith("t_")
    # persisted to disk
    saved = json.loads(p.read_text())
    assert saved["tasks"][0]["id"] == t["id"]


def test_create_task_defaults(tmp_path):
    p = tmp_path / "tasks.json"
    t = svc.create_task(p, "Bare")
    assert t["description"] == ""
    assert t["labels"] == []
    assert t["plan"] is None


def test_update_task_sets_and_clears_plan(tmp_path):
    p = tmp_path / "tasks.json"
    t = svc.create_task(p, "A")
    plan = {"start": "2026-06-15", "end": "2026-07-13"}
    assert svc.update_task(p, t["id"], {"plan": plan})["plan"] == plan
    # clearing with an explicit None must persist
    assert svc.update_task(p, t["id"], {"plan": None})["plan"] is None


def test_create_task_assigns_increasing_order(tmp_path):
    p = tmp_path / "tasks.json"
    a = svc.create_task(p, "A")
    b = svc.create_task(p, "B")
    assert a["order"] == 0
    assert b["order"] == 1


def test_update_task_partial_fields(tmp_path):
    p = tmp_path / "tasks.json"
    t = svc.create_task(p, "A")
    updated = svc.update_task(p, t["id"], {"done": True, "title": "A!"})
    assert updated["done"] is True
    assert updated["title"] == "A!"
    # description untouched
    assert updated["description"] == ""
    assert json.loads(p.read_text())["tasks"][0]["done"] is True


def test_update_task_subtasks_round_trip(tmp_path):
    p = tmp_path / "tasks.json"
    t = svc.create_task(p, "Parent")
    subs = [{"id": "s_1", "title": "step one", "done": False}]
    updated = svc.update_task(p, t["id"], {"subtasks": subs})
    assert updated["subtasks"] == subs


def test_update_task_missing_returns_none(tmp_path):
    assert svc.update_task(tmp_path / "tasks.json", "t_ghost", {"done": True}) is None


def test_delete_task(tmp_path):
    p = tmp_path / "tasks.json"
    t = svc.create_task(p, "A")
    assert svc.delete_task(p, t["id"]) is True
    assert svc.read_store(p)["tasks"] == []


def test_delete_missing_returns_false(tmp_path):
    assert svc.delete_task(tmp_path / "tasks.json", "t_ghost") is False


# ── completion timestamp (drives the Completed backlog ordering) ────


def test_create_task_has_no_completed_at(tmp_path):
    t = svc.create_task(tmp_path / "tasks.json", "A")
    assert t["completedAt"] is None


def test_marking_done_sets_completed_at(tmp_path):
    p = tmp_path / "tasks.json"
    t = svc.create_task(p, "A")
    updated = svc.update_task(p, t["id"], {"done": True})
    assert updated["done"] is True
    assert updated["completedAt"]  # a non-empty ISO timestamp


def test_unmarking_done_clears_completed_at(tmp_path):
    p = tmp_path / "tasks.json"
    t = svc.create_task(p, "A")
    svc.update_task(p, t["id"], {"done": True})
    reopened = svc.update_task(p, t["id"], {"done": False})
    assert reopened["completedAt"] is None


def test_unrelated_patch_preserves_completed_at(tmp_path):
    p = tmp_path / "tasks.json"
    t = svc.create_task(p, "A")
    stamp = svc.update_task(p, t["id"], {"done": True})["completedAt"]
    later = svc.update_task(p, t["id"], {"title": "A!"})
    assert later["completedAt"] == stamp  # a title edit must not restamp


def test_redundant_done_true_keeps_original_completed_at(tmp_path):
    p = tmp_path / "tasks.json"
    t = svc.create_task(p, "A")
    first = svc.update_task(p, t["id"], {"done": True})["completedAt"]
    again = svc.update_task(p, t["id"], {"done": True, "title": "x"})["completedAt"]
    assert again == first  # already-done → not restamped


# ── reorder ─────────────────────────────────────────────────────────


def test_reorder_tasks_reorders_and_reassigns_order(tmp_path):
    p = tmp_path / "tasks.json"
    a = svc.create_task(p, "A")
    b = svc.create_task(p, "B")
    c = svc.create_task(p, "C")
    out = svc.reorder_tasks(p, [c["id"], a["id"], b["id"]])
    assert [t["id"] for t in out] == [c["id"], a["id"], b["id"]]
    assert [t["order"] for t in out] == [0, 1, 2]
    # persisted in the new order
    saved = svc.read_store(p)
    assert [t["id"] for t in saved["tasks"]] == [c["id"], a["id"], b["id"]]


def test_reorder_tasks_appends_unlisted_ids_keeping_their_order(tmp_path):
    p = tmp_path / "tasks.json"
    a = svc.create_task(p, "A")
    b = svc.create_task(p, "B")
    c = svc.create_task(p, "C")
    # only b is named → a and c follow it in their original relative order
    out = svc.reorder_tasks(p, [b["id"]])
    assert [t["id"] for t in out] == [b["id"], a["id"], c["id"]]


def test_reorder_tasks_ignores_unknown_ids(tmp_path):
    p = tmp_path / "tasks.json"
    a = svc.create_task(p, "A")
    out = svc.reorder_tasks(p, ["t_ghost", a["id"]])
    assert [t["id"] for t in out] == [a["id"]]


# ── label union ─────────────────────────────────────────────────────


def test_labels_union_dedups_preserving_order():
    tasks = [
        {"labels": ["work", "urgent"]},
        {"labels": ["home", "work"]},
        {"labels": []},
    ]
    assert svc.labels_union(tasks) == ["work", "urgent", "home"]


def test_labels_union_surfaces_performance_review_when_goals_present():
    assert svc.labels_union([], review_goals=[{"id": "pr:c:0"}]) == ["performance review"]


def test_labels_union_no_performance_review_without_goals():
    assert svc.labels_union([{"labels": ["x"]}], review_goals=[]) == ["x"]


# ── label colors ────────────────────────────────────────────────────


def test_ensure_colors_assigns_palette_in_order():
    store = {"tasks": [], "labelColors": {}}
    colors = svc.ensure_colors(store, ["a", "b"])
    assert colors["a"] == svc.PALETTE[0]
    assert colors["b"] == svc.PALETTE[1]
    # mutates the store in place
    assert store["labelColors"] == colors


def test_ensure_colors_skips_performance_review():
    colors = svc.ensure_colors({"tasks": []}, ["performance review"])
    assert "performance review" not in colors


def test_ensure_colors_preserves_existing_and_avoids_reuse():
    store = {"tasks": [], "labelColors": {"a": svc.PALETTE[2]}}
    colors = svc.ensure_colors(store, ["a", "b"])
    # existing untouched
    assert colors["a"] == svc.PALETTE[2]
    # new label takes the first palette color not already in use
    assert colors["b"] == svc.PALETTE[0]


def test_ensure_colors_cycles_when_palette_exhausted():
    labels = [f"l{i}" for i in range(len(svc.PALETTE) + 1)]
    colors = svc.ensure_colors({"tasks": []}, labels)
    # the (n+1)-th distinct label wraps back to the first swatch
    assert colors[labels[-1]] == svc.PALETTE[0]


def test_ensure_colors_is_idempotent():
    store = {"tasks": [], "labelColors": {}}
    first = dict(svc.ensure_colors(store, ["a", "b"]))
    second = svc.ensure_colors(store, ["a", "b"])
    assert second == first


def test_set_label_color_stores_valid_hex(tmp_path):
    p = tmp_path / "tasks.json"
    colors = svc.set_label_color(p, "work", "#ff6ad5")
    assert colors["work"] == "#ff6ad5"
    saved = json.loads(p.read_text())
    assert saved["labelColors"]["work"] == "#ff6ad5"


def test_set_label_color_rejects_bad_hex(tmp_path):
    import pytest

    for bad in ("red", "#fff", "#zzzzzz", "ff6ad5", "#ff6ad", "#ff6ad55"):
        with pytest.raises(ValueError):
            svc.set_label_color(tmp_path / "tasks.json", "work", bad)


def test_set_label_color_preserves_existing_tasks(tmp_path):
    p = tmp_path / "tasks.json"
    svc.create_task(p, "A", labels=["work"])
    svc.set_label_color(p, "work", "#5b9bff")
    store = svc.read_store(p)
    assert len(store["tasks"]) == 1
    assert store["labelColors"]["work"] == "#5b9bff"


# ── review-goal projection (pure, on a summary dict) ────────────────


def _summary(goals):
    return {"key_goals": goals}


def test_project_review_goals_shapes_each_goal():
    summary = _summary(
        [
            {"title": "Product knowledge", "description": "immerse", "done": False},
            {"title": "Reporting", "description": "metrics", "done": True},
        ]
    )
    out = svc.project_review_goals(summary, "2026-deep-dive")
    assert out[0]["id"] == "pr:2026-deep-dive:0"
    assert out[0]["title"] == "Product knowledge"
    assert out[0]["labels"] == ["performance review"]
    assert out[0]["reviewLinked"] is True
    assert out[0]["cycle"] == "2026-deep-dive"
    assert out[0]["index"] == 0
    assert out[1]["done"] is True
    assert out[1]["index"] == 1


def test_project_review_goals_coerces_legacy_string_form():
    out = svc.project_review_goals(_summary(["just a string goal"]), "c")
    assert out[0]["title"] == "just a string goal"
    assert out[0]["description"] == ""
    assert out[0]["done"] is False


def test_project_review_goals_empty_when_no_summary():
    assert svc.project_review_goals(None, "c") == []
    assert svc.project_review_goals({}, "c") == []


# ── review-goal write-back (mutates the summary, tolerant of legacy) ─


def test_update_review_goal_sets_done():
    summary = _summary([{"title": "G", "description": "d", "done": False}])
    out = svc.update_review_goal(summary, 0, {"done": True})
    assert out["key_goals"][0]["done"] is True


def test_update_review_goal_edits_title_and_description():
    summary = _summary([{"title": "old", "description": "old d", "done": False}])
    out = svc.update_review_goal(summary, 0, {"title": "new", "description": "new d"})
    assert out["key_goals"][0]["title"] == "new"
    assert out["key_goals"][0]["description"] == "new d"
    assert out["key_goals"][0]["done"] is False


def test_update_review_goal_coerces_legacy_string_before_patching():
    summary = _summary(["legacy goal"])
    out = svc.update_review_goal(summary, 0, {"done": True})
    goal = out["key_goals"][0]
    # marking done stamps completedAt; the rest of the coerced shape is fixed
    completed_at = goal.pop("completedAt")
    assert completed_at  # a non-empty ISO timestamp
    assert goal == {
        "title": "legacy goal",
        "description": "",
        "done": True,
        "subtasks": [],
        "plan": None,
    }


def test_update_review_goal_out_of_range_raises():
    import pytest

    with pytest.raises(IndexError):
        svc.update_review_goal(_summary([]), 0, {"done": True})


# ── review-goal subtasks (stored alongside the goal in the cycle summary) ─


def test_project_review_goals_includes_existing_subtasks():
    subs = [{"id": "s_1", "title": "step", "done": False}]
    out = svc.project_review_goals(
        _summary([{"title": "G", "description": "", "done": False, "subtasks": subs}]), "c"
    )
    assert out[0]["subtasks"] == subs


def test_project_review_goals_defaults_subtasks_to_empty():
    out = svc.project_review_goals(
        _summary([{"title": "G", "description": "", "done": False}]), "c"
    )
    assert out[0]["subtasks"] == []


def test_update_review_goal_writes_subtasks_and_preserves_them():
    summary = _summary([{"title": "G", "description": "d", "done": False}])
    subs = [{"id": "s_1", "title": "step", "done": True}]
    out = svc.update_review_goal(summary, 0, {"subtasks": subs})
    assert out["key_goals"][0]["subtasks"] == subs
    # a later unrelated patch must not drop the subtasks
    out2 = svc.update_review_goal(out, 0, {"done": True})
    assert out2["key_goals"][0]["subtasks"] == subs
    assert out2["key_goals"][0]["done"] is True


# ── review-goal plan (week range stored alongside the goal) ─────────


def test_project_review_goals_includes_plan_default_none():
    out = svc.project_review_goals(
        _summary([{"title": "G", "description": "", "done": False}]), "c"
    )
    assert out[0]["plan"] is None


def test_review_goal_done_sets_then_clears_completed_at():
    summary = _summary([{"title": "G", "description": "", "done": False}])
    out = svc.update_review_goal(summary, 0, {"done": True})
    assert out["key_goals"][0]["completedAt"]
    out2 = svc.update_review_goal(out, 0, {"done": False})
    assert out2["key_goals"][0]["completedAt"] is None


def test_review_goal_unrelated_patch_preserves_completed_at():
    summary = _summary([{"title": "G", "description": "", "done": False}])
    out = svc.update_review_goal(summary, 0, {"done": True})
    stamp = out["key_goals"][0]["completedAt"]
    out2 = svc.update_review_goal(out, 0, {"title": "G!"})
    assert out2["key_goals"][0]["completedAt"] == stamp


def test_project_review_goals_includes_completed_at():
    out = svc.project_review_goals(
        _summary(
            [{"title": "G", "description": "", "done": True, "completedAt": "2026-06-12T10:00:00"}]
        ),
        "c",
    )
    assert out[0]["completedAt"] == "2026-06-12T10:00:00"


def test_project_review_goals_defaults_completed_at_to_none():
    out = svc.project_review_goals(
        _summary([{"title": "G", "description": "", "done": False}]), "c"
    )
    assert out[0]["completedAt"] is None


def test_update_review_goal_writes_and_preserves_plan():
    summary = _summary([{"title": "G", "description": "d", "done": False}])
    plan = {"start": "2026-06-15", "end": "2026-07-13"}
    out = svc.update_review_goal(summary, 0, {"plan": plan})
    assert out["key_goals"][0]["plan"] == plan
    # an unrelated later edit keeps the plan
    out2 = svc.update_review_goal(out, 0, {"done": True})
    assert out2["key_goals"][0]["plan"] == plan
