import json

from backend.routers import chat as chat_router


class FakeEngine:
    def __init__(self):
        self.seen = None

    def stream(self, messages, context):
        self.seen = (messages, context)
        yield {"type": "text", "text": "hi"}
        yield {"type": "done"}


def _sse_events(body: str) -> list[dict]:
    return [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: ")]


def test_chat_route_streams_typed_json_events(client, monkeypatch):
    fake = FakeEngine()
    monkeypatch.setattr(chat_router, "_engine", fake)
    resp = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "hi"}], "page": "data-hub", "skill": None},
    )
    assert resp.status_code == 200
    events = _sse_events(resp.text)
    assert events == [{"type": "text", "text": "hi"}, {"type": "done"}]
    assert "[DONE]" not in resp.text
    messages, context = fake.seen
    assert messages == [{"role": "user", "content": "hi"}]
    assert context.page == "data-hub"
    assert context.skill is None


def test_chat_without_api_key_reports_the_missing_variable(client, monkeypatch):
    """Missing LLM credentials must surface as a chat error, never crash the app."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    # Never read a real vault .env (or hit the network) from a unit test.
    from backend.services import llm_client

    monkeypatch.setattr(llm_client.ozos_llm, "ENV_FILE", llm_client.Path("/nonexistent/.env"))
    monkeypatch.setattr(chat_router, "_engine", chat_router.ToolLoopEngine())
    assert client.get("/health").status_code == 200
    resp = client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code == 200
    events = _sse_events(resp.text)
    assert events[0]["type"] == "error"
    assert "ANTHROPIC_API_KEY" in events[0]["text"]
