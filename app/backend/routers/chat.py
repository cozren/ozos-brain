import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..services.chat_engine import ChatContext, ChatEngine, ToolLoopEngine
from ..services.chat_skills import list_skills

router = APIRouter(prefix="/chat", tags=["chat"])

_engine: ChatEngine = ToolLoopEngine()


class ChatRequest(BaseModel):
    messages: list[dict]
    page: str | None = None
    skill: str | None = None


@router.post("")
def chat(body: ChatRequest):
    context = ChatContext(page=body.page, skill=body.skill)

    def generator():
        for event in _engine.stream(body.messages, context):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(generator(), media_type="text/event-stream")


@router.get("/skills")
def skills():
    return list_skills()
