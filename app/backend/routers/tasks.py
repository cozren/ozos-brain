"""Personal tasks API — own-task CRUD plus a live mirror of the active
performance review's goals (read here, edits write back to the cycle summary)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import PERSONAL_TASKS_FILE, ME_PERSON_ID
from ..services import tasks as svc
from ..services import data

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _active_cycle() -> str | None:
    try:
        return (data.read_cycles() or {}).get("active_cycle")
    except Exception:
        return None


def _review_goals() -> list[dict]:
    cycle_id = _active_cycle()
    if not cycle_id:
        return []
    summary = data.get_cycle_summary(ME_PERSON_ID, cycle_id)
    return svc.project_review_goals(summary, cycle_id)


@router.get("")
def get_tasks():
    store = svc.read_store(PERSONAL_TASKS_FILE)
    review = _review_goals()
    labels = svc.labels_union(store["tasks"], review)
    before = dict(store.get("labelColors", {}))
    colors = svc.ensure_colors(store, labels)
    if colors != before:  # persist newly auto-assigned colors
        svc.write_store(PERSONAL_TASKS_FILE, store)
    return {
        "tasks": store["tasks"],
        "reviewGoals": review,
        "labels": labels,
        "labelColors": colors,
    }


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    labels: list[str] = []


@router.post("")
def create_task(body: TaskCreate):
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title is required")
    return svc.create_task(PERSONAL_TASKS_FILE, body.title.strip(), body.description, body.labels)


class TaskReorder(BaseModel):
    ids: list[str]


# Declared before the `/{task_id}` route so the literal `/reorder` segment wins
# (otherwise it would be read as a task id and 404 in patch_task).
@router.patch("/reorder")
def reorder_tasks(body: TaskReorder):
    return {"tasks": svc.reorder_tasks(PERSONAL_TASKS_FILE, body.ids)}


class TaskPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    labels: list[str] | None = None
    done: bool | None = None
    subtasks: list[dict] | None = None
    plan: dict | None = None


@router.patch("/{task_id}")
def patch_task(task_id: str, body: TaskPatch):
    # exclude_unset so an explicit null (e.g. clearing the plan) is honored, not dropped.
    fields = body.model_dump(exclude_unset=True)
    task = svc.update_task(PERSONAL_TASKS_FILE, task_id, fields)
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    return task


class LabelColor(BaseModel):
    color: str


@router.patch("/labels/{name}")
def set_label_color(name: str, body: LabelColor):
    try:
        colors = svc.set_label_color(PERSONAL_TASKS_FILE, name, body.color)
    except ValueError:
        raise HTTPException(status_code=422, detail="invalid color")
    return {"labelColors": colors}


@router.delete("/{task_id}")
def delete_task(task_id: str):
    if not svc.delete_task(PERSONAL_TASKS_FILE, task_id):
        raise HTTPException(status_code=404, detail="task not found")
    return {"deleted": task_id}


class ReviewGoalPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    done: bool | None = None
    subtasks: list[dict] | None = None
    plan: dict | None = None


@router.patch("/review-goal/{cycle}/{index}")
def patch_review_goal(cycle: str, index: int, body: ReviewGoalPatch):
    summary = data.get_cycle_summary(ME_PERSON_ID, cycle)
    if summary is None:
        raise HTTPException(status_code=404, detail="cycle summary not found")
    # exclude_unset so an explicit null (e.g. clearing the plan) is honored, not dropped.
    fields = body.model_dump(exclude_unset=True)
    try:
        updated = svc.update_review_goal(summary, index, fields)
    except IndexError:
        raise HTTPException(status_code=404, detail="goal index out of range")
    data.write_cycle_summary(ME_PERSON_ID, cycle, updated)
    return svc.project_review_goals(updated, cycle)[index]
