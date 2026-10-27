"""Data Hub API — dashboard grid layout persistence. Data endpoints come from data points (later phase)."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from ..services import datahub as svc

router = APIRouter(prefix="/datahub", tags=["datahub"])


class TabPayload(BaseModel):
    # rows/tiles are validated/sanitized by the service; accept any dict here so
    # malformed individual tiles are dropped rather than rejecting the whole PUT
    rows: list[Any]


class LayoutPayload(BaseModel):
    tabs: dict[str, TabPayload]
    # category -> user-created sub-folders; sanitized by the service. Optional so
    # older clients that only send tabs still validate.
    pickerFolders: dict[str, Any] | None = None


@router.get("/layout")
def get_layout():
    return svc.get_layout()


@router.put("/layout")
def save_layout(payload: LayoutPayload):
    return svc.save_layout(payload.model_dump())
