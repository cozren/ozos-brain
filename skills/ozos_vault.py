"""Where the vault is — shared by every tool and by the app.

Order: ``$OZOS_VAULT`` → ``~/.ozos/config.json`` → ``"vault"`` → ``<engine>/vault``.
This module owns that order and nothing else. The app's ``backend/vault.py`` adds
existence checks and logging on top of :func:`vault_candidate`; tools call
:func:`vault_dir` and only need the path.
"""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parents[1]


def user_config_path(home: Path | None = None) -> Path:
    return (home or Path.home()) / ".ozos" / "config.json"


def read_user_config(home: Path | None = None) -> dict:
    """``~/.ozos/config.json`` as a dict; ``{}`` when the file is missing.

    Raises ``OSError`` / ``ValueError`` when the file exists but cannot be parsed
    (callers that want to log do so; :func:`load_user_config` swallows it).
    """
    path = user_config_path(home)
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} must hold a JSON object")
    return data


def load_user_config(home: Path | None = None) -> dict:
    """``~/.ozos/config.json`` as a dict; ``{}`` when missing, malformed or not a dict."""
    try:
        return read_user_config(home)
    except (OSError, ValueError):
        return {}


def vault_candidate(
    engine_root: Path | None = None,
    env: Mapping[str, str] | None = None,
    home: Path | None = None,
    config: Mapping | None = None,
) -> tuple[str, Path]:
    """The vault path and where it came from: ``("env" | "config" | "default", path)``.

    ``config`` lets a caller pass an already-loaded user config (the app loads it
    with logging); when omitted the file is read silently.
    """
    env = os.environ if env is None else env
    explicit = env.get("OZOS_VAULT")
    if explicit:
        return "env", Path(explicit).expanduser()
    cfg = load_user_config(home) if config is None else config
    configured = cfg.get("vault") if isinstance(cfg, Mapping) else None
    if configured:
        return "config", Path(str(configured)).expanduser()
    return "default", (engine_root or ENGINE_ROOT) / "vault"


def vault_dir(
    engine_root: Path | None = None,
    env: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> Path:
    return vault_candidate(engine_root, env, home)[1]
