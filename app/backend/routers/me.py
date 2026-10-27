"""Who is using this OZOS: name and person id from ~/.ozos/config.json (`ozos init`)."""

from fastapi import APIRouter

from ..vault import load_user_config

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
def me():
    cfg = load_user_config()
    return {"name": str(cfg.get("name") or ""), "me": str(cfg.get("me") or "me")}
