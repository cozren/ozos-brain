"""Data points: definitions in the vault, cached values, refresh, Metabase test."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import datapoint_sources, datapoints

router = APIRouter(prefix="/datapoints", tags=["datapoints"])

Display = Literal["number", "table", "line"]
Refresh = Literal["manual", "daily"]


class NewDataPoint(BaseModel):
    name: str
    source: dict[str, Any]
    display: Display = "number"
    refresh: Refresh = "manual"
    unit: str = ""


class DataPointPatch(BaseModel):
    name: str | None = None
    source: dict[str, Any] | None = None
    display: Display | None = None
    refresh: Refresh | None = None
    unit: str | None = None


@router.get("")
def get_datapoints():
    return {
        "datapoints": datapoints.load_datapoints(),
        "connector": datapoint_sources.connector_status(),
        "kinds": list(datapoints.KINDS),
        "displays": list(datapoints.DISPLAYS),
        "refreshes": list(datapoints.REFRESHES),
    }


@router.post("")
def post_datapoint(body: NewDataPoint):
    try:
        return datapoints.add_datapoint(body.model_dump())
    except FileExistsError as exc:
        raise HTTPException(409, f"A data point with id '{exc}' already exists")
    except ValueError as exc:
        raise HTTPException(422, str(exc))


# Fixed paths before the /{dp_id} routes so "refresh" and "metabase" never read as ids.
@router.post("/refresh")
def post_refresh_all():
    return datapoints.refresh_all()


@router.post("/metabase/test")
def post_metabase_test():
    try:
        return {"ok": True, "message": datapoint_sources.test_metabase()}
    except LookupError as exc:
        raise HTTPException(422, str(exc))
    except RuntimeError as exc:
        raise HTTPException(502, str(exc))


@router.put("/{dp_id}")
def put_datapoint(dp_id: str, body: DataPointPatch):
    patch = {k: v for k, v in body.model_dump().items() if k in body.model_fields_set}
    try:
        return datapoints.update_datapoint(dp_id, patch)
    except KeyError:
        raise HTTPException(404, f"Unknown data point '{dp_id}'")
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.delete("/{dp_id}")
def delete_datapoint(dp_id: str):
    try:
        datapoints.delete_datapoint(dp_id)
    except KeyError:
        raise HTTPException(404, f"Unknown data point '{dp_id}'")
    return {"deleted": dp_id}


@router.post("/{dp_id}/refresh")
def post_refresh(dp_id: str):
    try:
        return datapoints.refresh_datapoint(dp_id)
    except KeyError:
        raise HTTPException(404, f"Unknown data point '{dp_id}'")


@router.get("/{dp_id}/value")
def get_value(dp_id: str):
    try:
        datapoints.get_datapoint(dp_id)
    except KeyError:
        raise HTTPException(404, f"Unknown data point '{dp_id}'")
    return datapoints.read_value(dp_id)
