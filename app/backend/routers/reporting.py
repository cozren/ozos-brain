"""Reporting API — report sources, their dated instances, and on-demand runs."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import reporting as svc

router = APIRouter(prefix="/reporting", tags=["reporting"])


class RowPayload(BaseModel):
    # tiles are validated/sanitized by the service; accept any dict here so
    # malformed individual tiles are dropped rather than rejecting the whole PUT
    id: str
    tiles: list[Any]


class LayoutPayload(BaseModel):
    rows: list[RowPayload]


@router.get("/sources")
def get_sources():
    return svc.list_sources()


@router.get("/sources/{source_id}/instances")
def get_instances(source_id: str):
    items = svc.list_instances(source_id)
    if items is None:
        raise HTTPException(status_code=404, detail="Unknown source")
    return items


@router.get("/sources/{source_id}/instances/{instance_id:path}")
def get_instance(source_id: str, instance_id: str):
    instance = svc.get_instance(source_id, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="Unknown source or instance")
    return instance


@router.post("/sources/{source_id}/run")
def run_source(source_id: str):
    result = svc.run_source(source_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown source")
    if result.get("state") == "not-runnable":
        raise HTTPException(status_code=409, detail="Source is not runnable")
    return result


@router.get("/sources/{source_id}/run/status")
def run_status(source_id: str):
    status = svc.run_status(source_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Unknown source")
    return status


@router.get("/layout")
def get_layout():
    return svc.get_layout()


@router.put("/layout")
def save_layout(payload: LayoutPayload):
    return svc.save_layout(payload.model_dump())
