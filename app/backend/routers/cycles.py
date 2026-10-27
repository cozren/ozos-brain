from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services import data as svc
from ..services.data import read_cycles, write_cycles

router = APIRouter(prefix="/cycles", tags=["cycles"])


class EventUpdate(BaseModel):
    start: str
    end: str


class CycleNameUpdate(BaseModel):
    name: str


class NewGlobalCycle(BaseModel):
    name: str
    type: str = ""


@router.get("")
def get_cycles():
    return read_cycles()


@router.post("")
def create_cycle(body: NewGlobalCycle):
    return svc.create_global_cycle(body.name, body.type)


@router.delete("/{cycle_id}")
def delete_cycle(cycle_id: str):
    data = read_cycles()
    cycles = data.get("cycles", {})
    if cycle_id not in cycles:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    if len(cycles) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last remaining cycle")
    return svc.delete_global_cycle(cycle_id)


@router.patch("/{cycle_id}/name")
def update_cycle_name(cycle_id: str, body: CycleNameUpdate):
    data = read_cycles()
    if cycle_id not in data["cycles"]:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    data["cycles"][cycle_id]["name"] = body.name
    write_cycles(data)
    return data


@router.put("/{cycle_id}/events/{event_id}")
def update_event(cycle_id: str, event_id: str, body: EventUpdate):
    data = read_cycles()
    cycle = data["cycles"].get(cycle_id)
    if not cycle:
        raise HTTPException(status_code=404, detail=f"Cycle '{cycle_id}' not found")
    for event in cycle["events"]:
        if event["id"] == event_id:
            event["start"] = body.start
            event["end"] = body.end
            write_cycles(data)
            return event
    raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")
