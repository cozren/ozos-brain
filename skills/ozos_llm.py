"""Shared LLM client for the OZOS Brain app and every tool.

One place decides how OZOS reaches Claude:

* ``ANTHROPIC_API_KEY`` — required.
* ``OZOS_LLM_BASE_URL`` — optional; an Anthropic-compatible proxy (employer gateway).
* ``OZOS_LLM_MODEL`` — optional; defaults to ``DEFAULT_MODEL``.

Credentials live in the vault's ``.env`` (``<engine>/vault/.env`` by default, or
``$OZOS_VAULT/.env``). ``make_client`` loads it without overriding variables that
are already set, so tests and shells keep control.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import anthropic
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))

DEFAULT_MODEL = "claude-sonnet-5-5"

from ozos_vault import vault_dir

ENV_FILE = vault_dir() / ".env"


def load_env() -> None:
    """Load the vault .env into os.environ (existing variables win)."""
    if ENV_FILE.is_file():
        load_dotenv(ENV_FILE, override=False)


def model() -> str:
    return os.environ.get("OZOS_LLM_MODEL") or DEFAULT_MODEL


def make_client(timeout: float = 60.0, max_retries: int | None = None) -> anthropic.Anthropic:
    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Put it in your vault's .env "
            "(run `ozos init`) or export it in the shell."
        )
    kwargs: dict = {"api_key": api_key, "timeout": timeout}
    base_url = os.environ.get("OZOS_LLM_BASE_URL")
    if base_url:
        kwargs["base_url"] = base_url
    if max_retries is not None:
        kwargs["max_retries"] = max_retries
    return anthropic.Anthropic(**kwargs)


def complete(
    client: anthropic.Anthropic,
    system: str | None,
    user: str,
    max_tokens: int = 2048,
    model_id: str | None = None,
    temperature: float | None = None,
) -> str:
    """Single-turn completion; returns the first text block, stripped."""
    kwargs: dict = {
        "model": model_id or model(),
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": user}],
    }
    if system:
        kwargs["system"] = system
    if temperature is not None:
        kwargs["temperature"] = temperature
    response = client.messages.create(**kwargs)
    return response.content[0].text.strip()
