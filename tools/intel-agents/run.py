#!/usr/bin/env python3
"""Intel Agents — run engine (Track B).

Usage:
    python3 tools/intel-agents/run.py <agent-id>

Loads the agent config from `<vault>/.ozos/intel-agents.json`, composes the prompt
(shared house style — voice block + purpose-specific output rules — plus the
agent's topic), calls the LLM WITH WEB SEARCH, parses + validates the result
against the purpose's schema, and writes the report instance to
`<vault>/knowledge-hub/intel-agents/<id>/<id>-YYYY-MM-DD.json` (date from datetime.now()).

The LLM adapter (`call_model`) is module-level and injectable so tests never hit
the network. The real adapter drives Claude Code headless (`claude -p`), which
performs the web searches with its own WebSearch tool and returns the JSON
report. (Driving Claude Code headless is the reliable way to get live web
search unattended, and it works the same whether the key is direct or routed
through an employer proxy that lacks the server-side web_search tool.)
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Engine root = tools/intel-agents/run.py -> parents[2]; data lives in the vault.
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "skills"))
import ozos_vault  # noqa: E402

VAULT_DIR = ozos_vault.vault_dir()
DEFAULT_CONFIG_PATH = VAULT_DIR / ".ozos" / "intel-agents.json"
DEFAULT_INSTANCES_ROOT = VAULT_DIR / "knowledge-hub" / "intel-agents"

# Claude Code headless invocation. `claude -p` runs the composed prompt with the
# WebSearch tool pre-authorized (scoped allowlist — no blanket permission bypass)
# and returns the final text (the JSON report). CLAUDE_BIN can override the path
# for launchd, whose PATH is minimal.
CLAUDE_BIN_ENV = "CLAUDE_BIN"
CLAUDE_FALLBACK_PATH = os.path.expanduser("~/.local/bin/claude")
CLAUDE_TIMEOUT_SEC = 900


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class AgentNotFound(Exception):
    """Raised when an agent id is not present in the config."""


class ValidationError(Exception):
    """Raised when an LLM payload fails validation against its purpose schema."""


# ---------------------------------------------------------------------------
# Shared house style — preset voice blocks. A personal voice ("me") is the user's
# own `voice_text` from the vault config, never a preset in the engine.
# ---------------------------------------------------------------------------

VOICE_BLOCKS = {
    "executive": (
        "VOICE — Executive:\n"
        "Write in a crisp, board-ready executive register. Strategic framing, "
        "outcome-oriented, decisive. No jargon padding, no emoji, no hashtags. "
        "State implications plainly and quantify where the source allows."
    ),
    "research": (
        "VOICE — Research analyst:\n"
        "Write in a neutral, analytical research voice. Precise, evidence-led, and "
        "measured. Attribute claims to sources, flag uncertainty explicitly, and "
        "avoid rhetorical flourish, emoji, and hashtags."
    ),
}

# Shared summary block spec, injected into every prompt (both purposes carry it).
SUMMARY_BLOCK_SPEC = (
    "Every report MUST include a top-level `summary` object with these fields:\n"
    "  - searched: plain text describing what was searched + the time windows used\n"
    "  - found: integer count of relevant items found\n"
    "  - dropped: integer count of items considered but dropped\n"
    "  - strongest_signal: one sentence naming the single most important signal\n"
    "  - clusters_represented: array of cluster names covered\n"
    "  - gaps: what could not be found or verified\n"
    "  - confession: array of {dropped, reason} objects for notable items you dropped "
    "(reason ∈ too old / weak source / duplicate / wrong cluster / no data)\n"
)

# LinkedIn house style — templates A–D, scoring rubric, quality checklist, rules.
# Reuses the C2C "v1.1" prompt intent from the old Industry Pulse spec.
LINKEDIN_RULES = (
    "PURPOSE — LinkedIn post options.\n"
    "Produce EXACTLY 4 LinkedIn post options, one for each template A, B, C, D "
    "(one post per template, in order). Each post is prose only, 80–180 words, "
    "with no hashtags and no emoji.\n"
    "\n"
    "The 4 templates:\n"
    "  A — The sharp take: a crisp, opinionated reaction to a single strong signal.\n"
    "  B — The data point: lead with a concrete number/fact and unpack what it means.\n"
    "  C — The contrarian angle: challenge the obvious read of a trend.\n"
    "  D — The pattern connector: tie 2–3 signals into one larger movement.\n"
    "\n"
    "Source-quality rules: prefer reputable outlets; treat any URL you cannot verify "
    "as unverified (`url_verified: false`) and say so. Never fabricate a URL, outlet, "
    "or date. Scoring is INTERNAL review metadata only — never put scoring in the post "
    "text itself.\n"
    "\n"
    "Internal scoring rubric (per post, in a `scoring` object):\n"
    "  - confidence: High | Medium | Low (how sure you are the underlying facts hold)\n"
    "  - post_worthiness: Strong | Moderate | Weak (how good a LinkedIn post it makes)\n"
    "  - freshness: Breaking | Recent | Evergreen\n"
    "\n"
    "Quality checklist before you finish: exactly 4 posts (A/B/C/D), each 80–180 "
    "words, prose only, each tied to a real cited source with an outlet + date, "
    "scoring filled in, and scoring kept out of the post text.\n"
    "\n"
    "Return JSON matching this schema (no prose outside the JSON):\n"
    "{\n"
    '  "generated_at": "YYYY-MM-DD",\n'
    '  "purpose": "linkedin",\n'
    '  "summary": { ...summary block... },\n'
    '  "posts": [\n'
    '    { "n": 1, "template": "A", "template_name": "The sharp take",\n'
    '      "cluster": "...", "source_outlet": "...", "source_date": "2d ago",\n'
    '      "source_url": "https://...", "url_verified": true,\n'
    '      "text": "80–180 word post, prose only",\n'
    '      "scoring": { "confidence": "High", "post_worthiness": "Strong", '
    '"freshness": "Breaking" } }\n'
    "    // exactly 4 posts, templates A/B/C/D one each\n"
    "  ]\n"
    "}\n"
)

# Research house style — article structure + schema.
RESEARCH_RULES = (
    "PURPOSE — Research / insight article.\n"
    "Produce ONE insight article that synthesizes what you found into a coherent "
    "narrative. Structure it as: a title, a one-paragraph TL;DR executive summary, "
    "an ordered list of sections (each a heading + prose/light-markdown body), and a "
    "list of sources. Attribute claims and flag anything you could not verify. Never "
    "fabricate a source, outlet, date, or URL; mark any URL you cannot verify as "
    "`url_verified: false`.\n"
    "\n"
    "Return JSON matching this schema (no prose outside the JSON):\n"
    "{\n"
    '  "generated_at": "YYYY-MM-DD",\n'
    '  "purpose": "research",\n'
    '  "summary": { ...summary block... },\n'
    '  "article": {\n'
    '    "title": "...",\n'
    '    "tldr": "one-paragraph executive summary",\n'
    '    "sections": [ { "heading": "...", "body": "prose / light markdown" } ],\n'
    '    "sources": [ { "outlet": "...", "date": "2d ago", "url": "https://...", '
    '"url_verified": true } ]\n'
    "  }\n"
    "}\n"
)


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------


def load_config(config_path: Path | str = DEFAULT_CONFIG_PATH) -> dict:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Intel Agents config not found: {path}")
    return json.loads(path.read_text())


def load_agent(agent_id: str, config_path: Path | str = DEFAULT_CONFIG_PATH) -> dict:
    config = load_config(config_path)
    for agent in config.get("agents", []):
        if agent.get("id") == agent_id:
            return agent
    raise AgentNotFound(f"No agent with id '{agent_id}' in {config_path}")


# ---------------------------------------------------------------------------
# Prompt composition
# ---------------------------------------------------------------------------


def voice_block_for(agent: dict, config: dict) -> str:
    """Resolve the voice block: "me" → the config's own voice_text (falls back to
    the research preset when empty); otherwise a preset by name, default research."""
    voice = agent.get("voice", "research")
    if voice == "me":
        text = str((config or {}).get("voice_text") or "").strip()
        if text:
            return f"VOICE — me:\n{text}"
        return VOICE_BLOCKS["research"]
    return VOICE_BLOCKS.get(voice, VOICE_BLOCKS["research"])


def compose_prompt(agent: dict, config: dict | None = None) -> str:
    """Compose the full prompt = shared house style + topic."""
    purpose = agent.get("purpose")
    voice_block = voice_block_for(agent, config or {})

    if purpose == "linkedin":
        rules = LINKEDIN_RULES
    elif purpose == "research":
        rules = RESEARCH_RULES
    else:
        raise ValueError(f"Unknown purpose '{purpose}'")

    keywords = ", ".join(agent.get("keywords", []))
    prefer = ", ".join(agent.get("sources_prefer", [])) or "(none specified)"
    avoid = ", ".join(agent.get("sources_avoid", [])) or "(none specified)"
    budget = agent.get("searches_per_run", 6)

    topic = (
        "TOPIC:\n"
        f"  Focus: {agent.get('focus', '')}\n"
        f"  Keywords: {keywords}\n"
        f"  Prefer sources: {prefer}\n"
        f"  Avoid sources: {avoid}\n"
        f"  Search budget: use up to {budget} web searches this run.\n"
    )

    parts = [
        "You are an Intel Agent producing a daily intelligence artifact.",
        "Use the web-search tool to gather CURRENT, real information before writing. "
        "Ground every claim in what you actually found; do not invent facts, outlets, "
        "dates, or URLs.",
        voice_block,
        topic,
        SUMMARY_BLOCK_SPEC,
        rules,
        "Respond with ONLY the JSON object described above and nothing else.",
    ]
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

_REQUIRED_SUMMARY_FIELDS = [
    "searched",
    "found",
    "dropped",
    "strongest_signal",
    "clusters_represented",
    "gaps",
    "confession",
]

_REQUIRED_POST_FIELDS = [
    "n",
    "template",
    "template_name",
    "cluster",
    "source_outlet",
    "source_date",
    "source_url",
    "url_verified",
    "text",
    "scoring",
]

_REQUIRED_SCORING_FIELDS = ["confidence", "post_worthiness", "freshness"]

_REQUIRED_ARTICLE_FIELDS = ["title", "tldr", "sections", "sources"]

_EXPECTED_TEMPLATES = ["A", "B", "C", "D"]


def _validate_summary(summary) -> None:
    if not isinstance(summary, dict):
        raise ValidationError("summary must be an object")
    for field in _REQUIRED_SUMMARY_FIELDS:
        if field not in summary:
            raise ValidationError(f"summary missing required field '{field}'")


def _validate_linkedin(payload: dict) -> None:
    posts = payload.get("posts")
    if not isinstance(posts, list):
        raise ValidationError("linkedin payload missing 'posts' list")
    if len(posts) != 4:
        raise ValidationError(f"linkedin payload must have exactly 4 posts, got {len(posts)}")
    templates = []
    for i, post in enumerate(posts):
        if not isinstance(post, dict):
            raise ValidationError(f"post {i} is not an object")
        for field in _REQUIRED_POST_FIELDS:
            if field not in post:
                raise ValidationError(f"post {i} missing required field '{field}'")
        scoring = post.get("scoring")
        if not isinstance(scoring, dict):
            raise ValidationError(f"post {i} 'scoring' must be an object")
        for field in _REQUIRED_SCORING_FIELDS:
            if field not in scoring:
                raise ValidationError(f"post {i} scoring missing required field '{field}'")
        templates.append(post.get("template"))
    if sorted(templates) != _EXPECTED_TEMPLATES:
        raise ValidationError(
            f"linkedin posts must use templates A/B/C/D exactly once each, got {templates}"
        )


def _validate_research(payload: dict) -> None:
    article = payload.get("article")
    if not isinstance(article, dict):
        raise ValidationError("research payload missing 'article' object")
    for field in _REQUIRED_ARTICLE_FIELDS:
        if field not in article:
            raise ValidationError(f"article missing required field '{field}'")
    if not isinstance(article["sections"], list) or not article["sections"]:
        raise ValidationError("article.sections must be a non-empty list")
    for i, section in enumerate(article["sections"]):
        if not isinstance(section, dict) or "heading" not in section or "body" not in section:
            raise ValidationError(f"article section {i} must have 'heading' and 'body'")
    if not isinstance(article["sources"], list):
        raise ValidationError("article.sources must be a list")


def validate_payload(payload, purpose: str) -> None:
    """Validate an LLM payload against its purpose schema; raise ValidationError."""
    if not isinstance(payload, dict):
        raise ValidationError("payload must be a JSON object")
    _validate_summary(payload.get("summary"))
    if purpose == "linkedin":
        _validate_linkedin(payload)
    elif purpose == "research":
        _validate_research(payload)
    else:
        raise ValidationError(f"unknown purpose '{purpose}'")


# ---------------------------------------------------------------------------
# LLM adapter (injectable) — real one uses Anthropic API + web search
# ---------------------------------------------------------------------------


def _resolve_claude_bin() -> str:
    """Locate the Claude Code CLI. Honours $CLAUDE_BIN, then PATH, then the
    default user install path (launchd runs with a minimal PATH)."""
    override = os.environ.get(CLAUDE_BIN_ENV)
    if override and os.path.exists(override):
        return override
    found = shutil.which("claude")
    if found:
        return found
    if os.path.exists(CLAUDE_FALLBACK_PATH):
        return CLAUDE_FALLBACK_PATH
    raise RuntimeError(
        "claude CLI not found; set $CLAUDE_BIN or install Claude Code "
        f"(looked on PATH and at {CLAUDE_FALLBACK_PATH})."
    )


def _extract_json(text: str) -> dict:
    """Extract the JSON object from a model text response."""
    text = text.strip()
    # Strip ```json fences if present.
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValidationError("model response did not contain a JSON object")
    return json.loads(text[start : end + 1])


def call_model(prompt: str, searches: int) -> dict:
    """Real LLM adapter: run the composed prompt through Claude Code headless
    (`claude -p`), which performs the web searches with its own WebSearch tool
    and returns the final text (the JSON report).

    WebSearch is pre-authorized via a scoped `--allowedTools` allowlist — NOT a
    blanket permission bypass — so an unattended launchd run never hangs on a
    prompt and never grants tools beyond web search. Returns the parsed JSON
    payload. Injectable — tests monkeypatch this or pass a `call=` override to
    `run_agent`, so this path is never exercised in tests.

    `searches` is passed through to the prompt (which already states the budget);
    Claude self-limits its WebSearch calls to that budget.
    """
    claude = _resolve_claude_bin()
    proc = subprocess.run(
        [
            claude,
            "-p",
            "--output-format",
            "text",
            "--allowedTools",
            "WebSearch",
        ],
        input=prompt,
        capture_output=True,
        text=True,
        timeout=CLAUDE_TIMEOUT_SEC,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()[:500]
        raise RuntimeError(f"claude headless run failed (exit {proc.returncode}): {detail}")
    return _extract_json(proc.stdout)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


def run_agent(
    agent_id: str,
    config_path: Path | str = DEFAULT_CONFIG_PATH,
    instances_root: Path | str = DEFAULT_INSTANCES_ROOT,
    call=None,
) -> Path:
    """Run a single agent: load config, compose prompt, call LLM, validate, write.

    Returns the path of the written instance file. Raises AgentNotFound for an
    unknown id and ValidationError for a malformed payload (nothing is written
    in that case).
    """
    config = load_config(config_path)
    agent = next((a for a in config.get("agents", []) if a.get("id") == agent_id), None)
    if agent is None:
        raise AgentNotFound(f"No agent with id '{agent_id}' in {config_path}")
    purpose = agent["purpose"]
    prompt = compose_prompt(agent, config=config)
    searches = agent.get("searches_per_run", 6)

    llm = call if call is not None else call_model
    payload = llm(prompt, searches)

    # Validate BEFORE writing anything.
    validate_payload(payload, purpose=purpose)

    today = datetime.now().strftime("%Y-%m-%d")
    payload["generated_at"] = today
    payload["purpose"] = purpose

    out_dir = Path(instances_root) / agent_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{agent_id}-{today}.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    return out_path


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: run.py <agent-id>", file=sys.stderr)
        return 2
    agent_id = argv[1]
    try:
        out_path = run_agent(agent_id)
    except AgentNotFound as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except ValidationError as exc:
        print(f"error: invalid payload for '{agent_id}': {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - surface any failure with non-zero exit
        print(f"error: {agent_id}: {exc}", file=sys.stderr)
        return 1
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
