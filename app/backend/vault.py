# backend/vault.py
"""Locate the vault: the directory that holds this user's data (people, knowledge,
.ozos config, .env). The engine never stores data of its own.

The lookup order ($OZOS_VAULT → ~/.ozos/config.json → <engine>/vault) lives once,
in skills/ozos_vault.py. This module adds what only the app wants: a loud failure
when $OZOS_VAULT names a missing directory, and a warning plus fallback when the
configured vault does not exist.
"""

from __future__ import annotations

import logging
import sys
from collections.abc import Mapping
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "skills"))
import ozos_vault  # noqa: E402

log = logging.getLogger(__name__)

USER_CONFIG_RELPATH = Path(".ozos") / "config.json"


def load_user_config(home: Path | None = None) -> dict:
    """Return ~/.ozos/config.json as a dict; {} when missing or malformed (warned)."""
    try:
        return ozos_vault.read_user_config(home)
    except (OSError, ValueError) as exc:
        log.warning("Ignoring malformed %s: %s", ozos_vault.user_config_path(home), exc)
        return {}


def resolve_vault(
    engine_root: Path,
    env: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> Path:
    source, path = ozos_vault.vault_candidate(engine_root, env, home, config=load_user_config(home))
    if source == "env" and not path.is_dir():
        raise FileNotFoundError(f"OZOS_VAULT points to a missing directory: {path}")
    if source == "config" and not path.is_dir():
        log.warning("config.json vault %s does not exist; using the default vault", path)
        return engine_root / "vault"
    return path
