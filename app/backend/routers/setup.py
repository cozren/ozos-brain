"""The setup journal: a living checklist for connecting a new company's sources."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import setup_state, setup_view

router = APIRouter(prefix="/setup", tags=["setup"])


class StatusUpdate(BaseModel):
    status: Literal["not_started", "in_progress", "done", "skipped", "needs_attention"]
    notes: str | None = None


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
