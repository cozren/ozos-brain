"""Chat engine — typed-event streaming behind a small interface.

Phase 1 ships ToolLoopEngine (Anthropic SDK tool loop).
Phase 2 will add a ClaudeAgentEngine behind the same protocol; see
docs/superpowers/specs/platform/2026-07-10-floating-chat-design.md.
"""

import json
import time
from dataclasses import dataclass
from typing import Iterator, Protocol

import anthropic

from . import data as svc
from .chat_skills import load_skill
from .knowledge_hub import TOOL_EXECUTORS as KNOWLEDGE_EXECUTORS
from .knowledge_hub import TOOLS as KNOWLEDGE_TOOLS
from .llm_client import make_anthropic_client, model
from .project_tools import PROJECT_TOOL_EXECUTORS, PROJECT_TOOLS


TOOL_LABELS = {
    "get_meeting_notes": "meeting notes",
    "get_review_document": "review document",
    "search_confluence": "Confluence",
    "get_confluence_page": "Confluence page",
    "search_project": "project files",
    "read_project_file": "a project file",
    "read_wiki": "the knowledge-graph wiki",
    "lookup_knowledge_tags": "knowledge tags",
    "create_artifact": "a new artifact",
}


def _text(text: str) -> dict:
    return {"type": "text", "text": text}


def _status(text: str) -> dict:
    return {"type": "status", "text": text}


def _tool_start(name: str) -> dict:
    return {"type": "tool_start", "tool": name, "label": TOOL_LABELS.get(name, name)}


def _tool_done(name: str) -> dict:
    return {"type": "tool_done", "tool": name, "label": TOOL_LABELS.get(name, name)}


def _error(text: str) -> dict:
    return {"type": "error", "text": text}


def _done() -> dict:
    return {"type": "done"}


@dataclass
class ChatContext:
    page: str | None = None
    skill: str | None = None


class ChatEngine(Protocol):
    def stream(self, messages: list[dict], context: ChatContext) -> Iterator[dict]: ...


def _tools() -> list[dict]:
    """Tool schemas the engine offers. Extended with project tools in Task 6."""
    return list(KNOWLEDGE_TOOLS) + list(PROJECT_TOOLS)


def _executors() -> dict:
    return {**KNOWLEDGE_EXECUTORS, **PROJECT_TOOL_EXECUTORS}


def build_system_prompt(context: ChatContext) -> str:
    people = svc.list_people()
    cycles = svc.read_cycles()
    active_cycle_id = cycles.get("active_cycle", "")

    lines = [
        "You are the OZOS assistant — a floating chat available on every page of the OZOS app.",
        "OZOS is a local personal operating system. Project layout: tools/ (one tool per folder),",
        "knowledge-hub/ (meeting notes, AI learning, digests), people-hub/ (people YAML data),",
        "docs/ (PRDs, specs, learnings.md), graphify-out/wiki/ (auto-generated knowledge-graph wiki).",
        "",
        "TOOL STRATEGY:",
        "- For questions about meetings, people, decisions, or architecture: call read_wiki FIRST",
        "  and navigate its communities before anything else.",
        "- Use lookup_knowledge_tags to jump to knowledge-hub documents by tag.",
        "- Use search_project / read_project_file for code and everything else.",
        "- When asked to produce a document (analysis, summary, PRD…), write it with create_artifact —",
        "  the ONLY way you can create files — and tell the user the path it landed at.",
        "- You cannot edit existing files, run commands, or modify app data.",
        "",
        f"Active cycle: {active_cycle_id}",
        "",
        "People and their current cycle data:",
    ]
    for person in people:
        pid = person["name"]
        summary = svc.get_cycle_summary(pid, active_cycle_id) or {}
        lines.append(f"\n## {person['display_name']} ({person['role']})")
        lines.append(f"Rating: {summary.get('manager_rating', 'not set')}")
        goals = summary.get("key_goals", [])
        # Goals are {title, description, done} dicts since the cycle manager;
        # older cycles stored plain strings.
        goal_names = [g["title"] if isinstance(g, dict) else g for g in goals]
        if goal_names:
            lines.append("Goals: " + "; ".join(goal_names))
        comp = summary.get("competencies", {})
        self_comp = comp.get("self", {})
        low = [k for k, v in self_comp.items() if v == "need-improvement"]
        if low:
            lines.append(f"Areas needing improvement (self): {', '.join(low)}")

    lines += [
        "",
        "You have tools to fetch meeting notes and review documents from the knowledge hub on demand.",
        "Use them when the user asks about meetings, 1:1 history, or review document details.",
        "",
        "FORMATTING RULES (always follow these):",
        "- Use markdown in every response.",
        "- Use **bold** for names, ratings, and key terms.",
        "- Use bullet lists (- item) for enumerations, feedback points, competencies, and comparisons.",
        "- Use numbered lists for sequential steps or ranked items.",
        "- Use ### headings to separate sections when covering multiple people or topics.",
        "- Keep paragraphs short (2-3 sentences max). Prefer lists over long prose.",
        "- Never write a wall of text — break everything into scannable sections.",
    ]
    if context.page:
        lines += [
            "",
            f"The user is currently looking at the '{context.page}' page of the OZOS app.",
        ]
    if context.skill:
        lines += [
            "",
            "ARTIFACT SKILL — the user selected a skill for this request. Follow these",
            "instructions when writing the artifact:",
            load_skill(context.skill),
        ]
    return "\n".join(lines)


class ToolLoopEngine:
    """Anthropic-SDK agentic tool loop (direct API or an Anthropic-compatible proxy)."""

    def __init__(self, client_factory=make_anthropic_client):
        self._client_factory = client_factory

    def stream(self, messages: list[dict], context: ChatContext) -> Iterator[dict]:
        # Setup must stay inside the try: an exception here would otherwise
        # kill the SSE stream with an empty 200 and the UI would hang silently.
        try:
            client = self._client_factory()
            system = build_system_prompt(context)
            tools = _tools()
            executors = _executors()
        except Exception as e:
            yield _error(f"{type(e).__name__}: {e}")
            return
        current_messages = list(messages)

        try:
            while True:
                # Retry inline (not via a helper) so a status event is yielded
                # immediately, before the sleep — a helper that returns
                # (response, statuses) can only flush statuses after the whole
                # retry-and-sleep cycle completes, leaving the UI silent for
                # the entire wait.
                response = None
                for attempt in range(3):
                    try:
                        response = client.messages.create(
                            model=model(),
                            max_tokens=2048,
                            system=system,
                            tools=tools,
                            messages=current_messages,
                        )
                        break
                    except anthropic.RateLimitError:
                        if attempt < 2:
                            wait = 62
                            yield _status(
                                f"Rate limit hit — retrying in {wait}s ({attempt + 1}/2)…"
                            )
                            time.sleep(wait)
                        else:
                            raise

                if response.stop_reason == "tool_use":
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            yield _tool_start(block.name)
                            result = executors[block.name](block.input)
                            tool_results.append(
                                {
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": json.dumps(result, ensure_ascii=False),
                                }
                            )
                            yield _tool_done(block.name)
                    current_messages = current_messages + [
                        {"role": "assistant", "content": response.content},
                        {"role": "user", "content": tool_results},
                    ]

                else:  # end_turn — stream the final answer
                    for attempt in range(3):
                        try:
                            with client.messages.stream(
                                model=model(),
                                max_tokens=2048,
                                system=system,
                                tools=tools,
                                messages=current_messages,
                            ) as stream:
                                for text in stream.text_stream:
                                    yield _text(text)
                            break
                        except anthropic.RateLimitError:
                            if attempt < 2:
                                wait = 62
                                yield _status(
                                    f"Rate limit hit — retrying in {wait}s ({attempt + 1}/2)…"
                                )
                                time.sleep(wait)
                            else:
                                raise
                    break
        except anthropic.RateLimitError:
            yield _error("Rate limit exceeded. Wait a minute and try again.")
            return
        except Exception as e:
            yield _error(f"{type(e).__name__}: {e}")
            return
        yield _done()
