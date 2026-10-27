"""The setup journal: a living checklist for connecting a new company's sources."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services import setup_actions, setup_state, setup_view

router = APIRouter(prefix="/setup", tags=["setup"])


class StatusUpdate(BaseModel):
    status: Literal["not_started", "in_progress", "done", "skipped", "needs_attention"]
    notes: str | None = None


class NewStakeholder(BaseModel):
    person_id: str
    display_name: str
    email: str = ""
    team_folder: str = ""
    leadership: bool = False
    manager: str = ""
    role: str = ""


class CycleStage(BaseModel):
    id: str = ""
    label: str
    start: str = ""
    end: str = ""


class CycleChoice(BaseModel):
    mode: Literal["company", "default"]
    name: str = ""
    type: str = ""
    stages: list[CycleStage] = Field(default_factory=list)


class NewFolder(BaseModel):
    item_id: str
    folder: str


class RoutingUpdate(BaseModel):
    folders: list[str] | None = None
    default_folder: str | None = None
    tagging_guide: str | None = None
    drive_parent_folder_id: str | None = None
    # drive_parent_folder_id is only applied when the client sends the key at all
    model_config = {"extra": "ignore"}


class EnvUpdate(BaseModel):
    vars: dict[str, str]


@router.get("")
def get_setup():
    return setup_view.build_view()


@router.put("/items/{item_id}")
def put_item_status(item_id: str, body: StatusUpdate):
    try:
        setup_state.set_status(item_id, body.status, body.notes)
    except KeyError:
        raise HTTPException(404, f"Unknown setup item '{item_id}'")
    return setup_view.item_view(item_id)


@router.post("/dismiss")
def dismiss_badge():
    setup_state.dismiss_badge()
    return {"badge_dismissed": True}


@router.post("/people")
def post_stakeholder(body: NewStakeholder):
    try:
        return setup_actions.add_stakeholder(body.model_dump())
    except FileExistsError:
        raise HTTPException(409, f"A person with id '{body.person_id}' already exists")
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.put("/cycle")
def put_cycle(body: CycleChoice):
    if body.mode == "default":
        return {"cadence": setup_actions.set_default_cadence()}
    try:
        cycles = setup_actions.set_company_cycle(
            body.name, body.type, [s.model_dump() for s in body.stages]
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return {"cycles": cycles, "cadence": setup_state.load_state()["cadence"]}


@router.get("/reminders")
def get_reminders():
    return setup_actions.reminders()


@router.post("/folders")
def post_folder(body: NewFolder):
    try:
        return setup_actions.add_drop_folder(body.item_id, body.folder)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.put("/routing")
def put_routing(body: RoutingUpdate):
    kwargs: dict = {
        "folders": body.folders,
        "default_folder": body.default_folder,
        "tagging_guide": body.tagging_guide,
    }
    if "drive_parent_folder_id" in body.model_fields_set:
        kwargs["drive_parent_folder_id"] = body.drive_parent_folder_id
    return setup_actions.update_routing(**kwargs)


@router.get("/env")
def get_env():
    return setup_actions.env_status()


@router.put("/env")
def put_env(body: EnvUpdate):
    try:
        return {"set": setup_actions.write_env(body.vars)}
    except ValueError as exc:
        # The message names the variable, never its value.
        raise HTTPException(422, str(exc))


@router.get("/gmail")
def get_gmail():
    return setup_actions.gmail_status()
