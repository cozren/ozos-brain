"""Goals: by hand, or pulled from the Atlassian Goals connector into the vault."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import goals, goals_sync

router = APIRouter(prefix="/goals", tags=["goals"])

Status = Literal["on_track", "at_risk", "off_track", "complete", "cancelled", "pending"]


class NewGoal(BaseModel):
    title: str
    description: str = ""
    owner: str = ""
    status: Status = "pending"
    progress: int | None = None
    target_date: str = ""


class GoalPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    owner: str | None = None
    status: Status | None = None
    progress: int | None = None
    target_date: str | None = None
    data_point_id: str | None = None


@router.get("")
def get_goals():
    state = goals.load_goals()
    return {
        "goals": state["goals"],
        "sync": state["sync"],
        "connector": goals_sync.connector_status(),
        "statuses": list(goals.STATUSES),
    }


@router.post("")
def post_goal(body: NewGoal):
    try:
        return goals.add_goal(body.model_dump())
    except FileExistsError as exc:
        raise HTTPException(409, f"A goal with id '{exc}' already exists")
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.put("/{goal_id}")
def put_goal(goal_id: str, body: GoalPatch):
    patch = {k: v for k, v in body.model_dump().items() if k in body.model_fields_set}
    try:
        return goals.update_goal(goal_id, patch)
    except KeyError:
        raise HTTPException(404, f"Unknown goal '{goal_id}'")
    except PermissionError as exc:
        raise HTTPException(409, str(exc))
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.delete("/{goal_id}")
def delete_goal(goal_id: str):
    try:
        goals.delete_goal(goal_id)
    except KeyError:
        raise HTTPException(404, f"Unknown goal '{goal_id}'")
    except PermissionError as exc:
        raise HTTPException(409, str(exc))
    return {"deleted": goal_id}


@router.post("/sync")
def post_sync():
    try:
        return goals_sync.sync_goals()
    except LookupError as exc:
        raise HTTPException(422, str(exc))
    except RuntimeError as exc:
        raise HTTPException(502, str(exc))
