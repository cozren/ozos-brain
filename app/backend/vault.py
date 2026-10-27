# backend/vault.py
"""Locate the vault: the directory that holds this user's data (people, knowledge,
.ozos config, .env). The engine never stores data of its own.

Resolution order:
  1. $OZOS_VAULT — must be an existing directory, otherwise startup fails loudly.
  2. ~/.ozos/config.json → "vault" (written by `ozos init`).
  3. <engine>/vault — the gitignored default inside the engine checkout.
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Mapping
from pathlib import Path

log = logging.getLogger(__name__)

USER_CONFIG_RELPATH = Path(".ozos") / "config.json"


def load_user_config(home: Path | None = None) -> dict:
    """Return ~/.ozos/config.json as a dict; {} when missing or malformed (warned)."""
    path = (home or Path.home()) / USER_CONFIG_RELPATH
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        log.warning("Ignoring malformed %s: %s", path, exc)
        return {}
    return data if isinstance(data, dict) else {}


def resolve_vault(
    engine_root: Path,
    env: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> Path:
    env = os.environ if env is None else env
    explicit = env.get("OZOS_VAULT")
    if explicit:
        p = Path(explicit).expanduser()
        if not p.is_dir():
            raise FileNotFoundError(f"OZOS_VAULT points to a missing directory: {p}")
        return p
    configured = load_user_config(home).get("vault")
    if configured:
        p = Path(configured).expanduser()
        if p.is_dir():
            return p
        log.warning("config.json vault %s does not exist; using the default vault", p)
    return engine_root / "vault"
