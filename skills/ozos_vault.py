"""Where the vault is — shared by every tool, the same answer the app gives.

Order: ``$OZOS_VAULT`` → ``~/.ozos/config.json`` → ``"vault"`` → ``<engine>/vault``.
The app's ``backend/vault.py`` adds existence checks and logging; tools only need
the path.
"""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parents[1]


def vault_dir(
    engine_root: Path | None = None,
    env: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> Path:
    env = os.environ if env is None else env
    explicit = env.get("OZOS_VAULT")
    if explicit:
        return Path(explicit).expanduser()
    cfg = (home or Path.home()) / ".ozos" / "config.json"
    if cfg.is_file():
        try:
            configured = json.loads(cfg.read_text(encoding="utf-8")).get("vault")
            if configured:
                return Path(configured).expanduser()
        except (OSError, ValueError, AttributeError):
            pass
    return (engine_root or ENGINE_ROOT) / "vault"
