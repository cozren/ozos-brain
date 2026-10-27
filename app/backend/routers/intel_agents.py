"""Intel Agents API — agent CRUD, per-agent dated reports, stars, and runs."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import intel_agents as svc

router = APIRouter(prefix="/intel-agents", tags=["intel-agents"])


class AgentCreate(BaseModel):
    name: str
    purpose: str = "linkedin"
    voice: str = "me"
    focus: str = ""
    keywords: list[str] = []
    sources_prefer: list[str] = []
    sources_avoid: list[str] = []
    searches_per_run: int = 6


class AgentUpdate(BaseModel):
    name: str
    purpose: str = "linkedin"
    voice: str = "me"
    focus: str = ""
    keywords: list[str] = []
    sources_prefer: list[str] = []
    sources_avoid: list[str] = []
    searches_per_run: int = 6
    enabled: bool = True


class StarPayload(BaseModel):
    starred: bool


@router.get("/agents")
def list_agents():
    return svc.list_agents()


@router.post("/agents")
def create_agent(payload: AgentCreate):
    return svc.create_agent(payload.model_dump())


@router.get("/agents/{agent_id}")
def get_agent(agent_id: str):
    agent = svc.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Unknown agent")
    return agent


@router.put("/agents/{agent_id}")
def update_agent(agent_id: str, payload: AgentUpdate):
    agent = svc.update_agent(agent_id, payload.model_dump())
    if agent is None:
        raise HTTPException(status_code=404, detail="Unknown agent")
    return agent


@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: str):
    if not svc.delete_agent(agent_id):
        raise HTTPException(status_code=404, detail="Unknown agent")
    return {"deleted": True}


@router.get("/agents/{agent_id}/reports")
def list_reports(agent_id: str):
    items = svc.list_reports(agent_id)
    if items is None:
        raise HTTPException(status_code=404, detail="Unknown agent")
    return items


@router.get("/agents/{agent_id}/reports/{instance_id:path}")
def get_report(agent_id: str, instance_id: str):
    report = svc.get_report(agent_id, instance_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Unknown agent or report")
    return report


@router.post("/agents/{agent_id}/reports/{instance_id:path}/star")
def set_star(agent_id: str, instance_id: str, payload: StarPayload):
    if svc.get_agent(agent_id) is None:
        raise HTTPException(status_code=404, detail="Unknown agent")
    starred = svc.set_star(agent_id, instance_id, payload.starred)
    return {"starred": starred}


@router.post("/agents/{agent_id}/run")
def run_agent(agent_id: str):
    result = svc.run_agent(agent_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown agent")
    return result


@router.get("/agents/{agent_id}/run/status")
def run_status(agent_id: str):
    status = svc.run_status(agent_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Unknown agent")
    return status
