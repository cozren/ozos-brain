# backend/routers/control_tower.py
import time
from fastapi import APIRouter, HTTPException
from ..services.control_tower import (
    load_skills,
    load_commands,
    load_hooks,
    load_plugins,
    load_local_mcps,
    load_remote_mcps,
    load_vitals,
    load_vital_detail,
    load_session,
    load_brain_overview,
    run_vital,
    vital_run_status,
)

router = APIRouter(prefix="/control-tower", tags=["control-tower"])

# Track when this process started
_SESSION_START = time.time()


def _compute_health(vitals: list[dict], mcps_remote: list[dict], mcps_local: list[dict]) -> str:
    if any(v["status"] == "fail" for v in vitals):
        return "critical"
    if any(v["status"] == "warn" for v in vitals):
        return "degraded"
    if any(m["status"] == "needs-auth" for m in [*mcps_remote, *mcps_local]):
        return "degraded"
    return "nominal"


@router.get("/status")
def get_status():
    vitals = load_vitals()
    remote_mcps = load_remote_mcps()
    local_mcps = load_local_mcps()
    return {
        "overallHealth": _compute_health(vitals, remote_mcps, local_mcps),
        "session": load_session(_SESSION_START),
        "vitals": vitals,
        "brainOverview": load_brain_overview(),
        "mcps": {
            "remote": remote_mcps,
            "local": local_mcps,
        },
        "plugins": load_plugins(),
        "skills": (all_skills := load_skills()),
        "externalSkills": [s for s in all_skills if s["origin"] == "external"],
        "commands": load_commands(),
        "hooks": load_hooks(),
    }


@router.get("/vitals/{vital_id}")
def get_vital_detail(vital_id: str):
    """Lazy per-vital run detail (last run, delta, item titles) for the popover."""
    detail = load_vital_detail(vital_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Unknown vital: {vital_id}")
    return detail


@router.post("/vitals/{vital_id}/run")
def trigger_vital_run(vital_id: str):
    """Manually re-trigger a vital's sync command in the background."""
    result = run_vital(vital_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Unknown vital: {vital_id}")
    if result.get("state") == "not-runnable":
        raise HTTPException(status_code=409, detail="Vital is not runnable")
    return result


@router.get("/vitals/{vital_id}/run/status")
def get_vital_run_status(vital_id: str):
    """Current run state for a vital (idle / running / error), polled by the UI."""
    status = vital_run_status(vital_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Unknown vital: {vital_id}")
    return status
