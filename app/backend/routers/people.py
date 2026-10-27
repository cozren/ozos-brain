from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, model_validator
from ..services import data as svc

router = APIRouter(prefix="/people", tags=["people"])


class NewPerson(BaseModel):
    name: str
    display_name: str
    role: str
    start_date: str
    manager: str


class GoalItem(BaseModel):
    title: str
    description: str = ""
    done: bool = False

    @model_validator(mode="before")
    @classmethod
    def coerce_legacy_string(cls, v):
        # Goals/accomplishments used to be bare strings; normalise them.
        if isinstance(v, str):
            return {"title": v, "description": "", "done": False}
        return v


class CycleUpdate(BaseModel):
    manager_rating: str | None = None
    promotion_nominated: bool | None = None
    promotion_justification: str | None = None
    key_goals: list[GoalItem] | None = None
    key_accomplishments: list[GoalItem] | None = None
    personal_notes: str | None = None
    competencies: dict | None = None
    status: str | None = None


class NewCycle(BaseModel):
    title: str
    type: str = ""
    start: str = ""
    end: str = ""
    from_cycle: str | None = None


@router.get("")
def list_people():
    return svc.list_people()


@router.post("")
def add_person(body: NewPerson):
    person_id = body.name.lower().replace(" ", "-")
    meta = body.model_dump()
    svc.create_person(person_id, meta)
    return meta


@router.get("/{person_id}/cycles")
def list_cycles(person_id: str):
    if not svc.get_person_meta(person_id):
        return []
    return svc.list_person_cycle_meta(person_id)


@router.post("/{person_id}/cycles")
def create_cycle(person_id: str, body: NewCycle):
    if not svc.get_person_meta(person_id):
        raise HTTPException(404, f"Person '{person_id}' not found")
    return svc.create_cycle(
        person_id,
        {"title": body.title, "type": body.type, "start": body.start, "end": body.end},
        carry_from=body.from_cycle,
    )


@router.delete("/{person_id}/cycles/{cycle_id}")
def delete_cycle(person_id: str, cycle_id: str):
    if not svc.get_person_meta(person_id):
        raise HTTPException(404, f"Person '{person_id}' not found")
    svc.delete_cycle(person_id, cycle_id)
    return {"deleted": cycle_id}


@router.get("/{person_id}/cycles/{cycle_id}")
def get_cycle(person_id: str, cycle_id: str):
    if not svc.get_person_meta(person_id):
        raise HTTPException(404, f"Person '{person_id}' not found")
    # Falls back to a synthetic blank summary (with the previous-cycle reminder) when
    # the cycle exists globally but the person hasn't started it; the folder is written
    # only when the cycle is first edited.
    summary = svc.get_or_synthesize_summary(person_id, cycle_id)
    if summary is None:
        raise HTTPException(404, f"Cycle '{cycle_id}' not found for '{person_id}'")
    return summary


@router.delete("/{person_id}")
def delete_person(person_id: str):
    if not svc.get_person_meta(person_id):
        raise HTTPException(404, f"Person '{person_id}' not found")
    svc.delete_person(person_id)
    return {"deleted": person_id}


@router.put("/{person_id}/cycles/{cycle_id}")
def update_cycle(person_id: str, cycle_id: str, body: CycleUpdate):
    if not svc.get_person_meta(person_id):
        raise HTTPException(404, f"Person '{person_id}' not found")
    summary = svc.get_or_synthesize_summary(person_id, cycle_id) or {}
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    summary.update(updates)
    svc.write_cycle_summary(person_id, cycle_id, summary)
    return summary
