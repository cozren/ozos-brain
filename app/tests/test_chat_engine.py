import types

import anthropic
import pytest

from backend.services import chat_engine
from backend.services.chat_engine import ChatContext, ToolLoopEngine


class FakeToolBlock:
    type = "tool_use"

    def __init__(self, name, tool_input, block_id="tu_1"):
        self.name = name
        self.input = tool_input
        self.id = block_id


class FakeCreateResponse:
    def __init__(self, stop_reason, content):
        self.stop_reason = stop_reason
        self.content = content


class FakeStream:
    def __init__(self, chunks):
        self._chunks = chunks

    def __enter__(self):
        return types.SimpleNamespace(text_stream=iter(self._chunks))

    def __exit__(self, *args):
        return False


class FakeClient:
    """Yields queued create() responses, then streams the final answer.

    A queued item that is an exception instance is raised instead of returned,
    so tests can simulate a RateLimitError on a specific attempt.
    """

    def __init__(self, create_responses, stream_chunks):
        create_iter = iter(create_responses)

        def _create(**kw):
            item = next(create_iter)
            if isinstance(item, BaseException):
                raise item
            return item

        self.messages = types.SimpleNamespace(
            create=_create,
            stream=lambda **kw: FakeStream(stream_chunks),
        )


@pytest.fixture
def quiet_prompt(monkeypatch):
    monkeypatch.setattr(chat_engine, "build_system_prompt", lambda ctx: "SYSTEM")


def test_plain_answer_yields_text_then_done(quiet_prompt):
    client = FakeClient(
        create_responses=[FakeCreateResponse("end_turn", [])],
        stream_chunks=["Hello ", "world"],
    )
    engine = ToolLoopEngine(client_factory=lambda: client)
    events = list(engine.stream([{"role": "user", "content": "hi"}], ChatContext()))
    assert events == [
        {"type": "text", "text": "Hello "},
        {"type": "text", "text": "world"},
        {"type": "done"},
    ]


def test_tool_round_emits_tool_events(quiet_prompt, monkeypatch):
    calls = []
    monkeypatch.setattr(
        chat_engine,
        "_executors",
        lambda: {"get_meeting_notes": lambda inp: calls.append(inp) or [{"filename": "x"}]},
    )
    client = FakeClient(
        create_responses=[
            FakeCreateResponse(
                "tool_use", [FakeToolBlock("get_meeting_notes", {"person_name": "Casey"})]
            ),
            FakeCreateResponse("end_turn", []),
        ],
        stream_chunks=["done."],
    )
    engine = ToolLoopEngine(client_factory=lambda: client)
    events = list(engine.stream([{"role": "user", "content": "notes?"}], ChatContext()))
    assert events[0] == {
        "type": "tool_start",
        "tool": "get_meeting_notes",
        "label": "meeting notes",
    }
    assert events[1] == {
        "type": "tool_done",
        "tool": "get_meeting_notes",
        "label": "meeting notes",
    }
    assert events[-2:] == [{"type": "text", "text": "done."}, {"type": "done"}]
    assert calls == [{"person_name": "Casey"}]


def test_tool_round_rate_limit_status_streams_before_sleep(quiet_prompt, monkeypatch):
    """The retry status event must be observable before time.sleep(62) runs —
    otherwise the browser shows nothing for the whole 62s wait (the bug this
    guards: the old code batched status events until the retry loop returned)."""
    import httpx

    sleep_calls = []
    monkeypatch.setattr(chat_engine.time, "sleep", lambda s: sleep_calls.append(s))

    rate_limit_error = anthropic.RateLimitError(
        "rate limited",
        response=httpx.Response(429, request=httpx.Request("POST", "https://example.test")),
        body=None,
    )
    client = FakeClient(
        create_responses=[rate_limit_error, FakeCreateResponse("end_turn", [])],
        stream_chunks=["ok"],
    )
    engine = ToolLoopEngine(client_factory=lambda: client)
    events = engine.stream([{"role": "user", "content": "hi"}], ChatContext())

    first = next(events)
    assert first["type"] == "status"
    assert "Rate limit hit" in first["text"]
    assert sleep_calls == []  # must be yielded before the retry sleeps

    remaining = list(events)
    assert sleep_calls == [62]
    assert remaining[-2:] == [{"type": "text", "text": "ok"}, {"type": "done"}]


def test_setup_failure_yields_error_event(monkeypatch):
    def boom():
        raise RuntimeError("no key")

    engine = ToolLoopEngine(client_factory=boom)
    events = list(engine.stream([{"role": "user", "content": "hi"}], ChatContext()))
    assert events == [{"type": "error", "text": "RuntimeError: no key"}]


def test_system_prompt_mentions_current_page(tmp_data_dir):
    prompt = chat_engine.build_system_prompt(ChatContext(page="data-hub"))
    assert "data-hub" in prompt


# Ported from the now-deleted backend/tests/test_claude_chat.py (claude_chat.py
# service superseded by this module): build_system_prompt inherited the same
# dict-vs-string goals handling and must keep the regression coverage for the
# TypeError bug that used to silently kill the chat stream.
_GOALS_PERSON = {"name": "alice", "display_name": "Alice", "role": "Engineer"}
_GOALS_CYCLES = {"active_cycle": "2026-deep-dive"}


def _goals_summary(goals):
    return {"manager_rating": "strong", "key_goals": goals, "competencies": {}}


def test_build_system_prompt_handles_dict_goals(monkeypatch):
    """Cycle goals are stored as {title, description, done} dicts since the
    Timeline cycle manager; the prompt builder must not assume plain strings."""
    goals = [
        {"title": "Discovery", "description": "Regular discovery meeting", "done": False},
        {"title": "Strategy", "description": "", "done": True},
    ]
    monkeypatch.setattr(chat_engine.svc, "list_people", lambda: [_GOALS_PERSON])
    monkeypatch.setattr(chat_engine.svc, "read_cycles", lambda: _GOALS_CYCLES)
    monkeypatch.setattr(chat_engine.svc, "get_cycle_summary", lambda *a, **k: _goals_summary(goals))
    prompt = chat_engine.build_system_prompt(ChatContext())
    assert "Discovery" in prompt
    assert "Strategy" in prompt


def test_build_system_prompt_still_handles_string_goals(monkeypatch):
    """Older cycle data stored goals as plain strings — keep supporting it."""
    monkeypatch.setattr(chat_engine.svc, "list_people", lambda: [_GOALS_PERSON])
    monkeypatch.setattr(chat_engine.svc, "read_cycles", lambda: _GOALS_CYCLES)
    monkeypatch.setattr(
        chat_engine.svc,
        "get_cycle_summary",
        lambda *a, **k: _goals_summary(["Ship the roadmap", "Mentor juniors"]),
    )
    prompt = chat_engine.build_system_prompt(ChatContext())
    assert "Ship the roadmap" in prompt


def test_engine_offers_project_tools():
    names = {t["name"] for t in chat_engine._tools()}
    assert {
        "get_meeting_notes",
        "search_project",
        "read_project_file",
        "read_wiki",
        "lookup_knowledge_tags",
        "create_artifact",
    } <= names
    assert set(chat_engine._executors()) == names


def test_system_prompt_has_project_overview(tmp_data_dir):
    prompt = chat_engine.build_system_prompt(ChatContext())
    assert "OZOS" in prompt
    assert "read_wiki" in prompt
    assert "create_artifact" in prompt
