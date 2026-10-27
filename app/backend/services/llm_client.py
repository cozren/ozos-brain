# backend/services/llm_client.py
"""Anthropic client for the app — thin wrapper over the shared skills/ozos_llm.py
so the app and the tools agree on credentials, proxy, and model."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "skills"))

import anthropic  # noqa: E402
import ozos_llm  # noqa: E402


def make_anthropic_client(timeout: float = 60.0) -> anthropic.Anthropic:
    return ozos_llm.make_client(timeout=timeout)


def model() -> str:
    return ozos_llm.model()
