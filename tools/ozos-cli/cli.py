"""`ozos` — set up and check an OZOS engine + vault.

    ozos init          create a vault from vault-template/, write ~/.ozos/config.json and the vault .env
    ozos setup         print the setup journal (what is connected, what is left); --json for scripts
    ozos setup mark    ozos setup mark <item> <status> [--notes TEXT]
    ozos scrub-check   fail if any forbidden term (company names, people, hosts, ids) is in the engine tree

Run through the `ozos` shim at the engine root. No dependencies beyond the stdlib.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ENGINE_ROOT / "skills"))
import ozos_vault  # noqa: E402

TEMPLATE = ENGINE_ROOT / "vault-template"
HOME = Path.home()  # monkeypatched in tests
DEFAULT_MODEL = "claude-sonnet-5-5"
SCRUB_EXCLUDE = (
    "vault",
    "node_modules",
    ".git",
    "graphify-out",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".superpowers",  # plan-execution scratch, gitignored
)


# ── init ────────────────────────────────────────────────────────────────────


def create_vault(template: Path, dest: Path) -> None:
    """Copy the vault template to `dest`. Refuses to touch an existing vault."""
    if (dest / ".ozos").exists():
        raise FileExistsError(
            f"{dest} already looks like a vault (.ozos/ exists); refusing to overwrite."
        )
    shutil.copytree(template, dest, dirs_exist_ok=True)


def write_user_config(path: Path, *, name: str, me: str, vault: Path, voice_text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {"name": name, "me": me, "vault": str(vault), "voice_text": voice_text}, indent=2
        )
        + "\n",
        encoding="utf-8",
    )


def write_env(dest: Path, api_key: str, base_url: str, model: str) -> None:
    env = dest / ".env"
    env.write_text(
        "# Written by `ozos init`. Never commit this file.\n"
        f"ANTHROPIC_API_KEY={api_key}\n"
        f"OZOS_LLM_BASE_URL={base_url}\n"
        f"OZOS_LLM_MODEL={model}\n",
        encoding="utf-8",
    )
    os.chmod(env, 0o600)


def _write_voice_text(vault: Path, voice_text: str) -> None:
    cfg = vault / ".ozos" / "intel-agents.json"
    data = json.loads(cfg.read_text(encoding="utf-8")) if cfg.is_file() else {"agents": []}
    data["voice_text"] = voice_text
    cfg.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _ask(prompt: str, default: str = "", secret: bool = False) -> str:
    shown = f" [{default}]" if default else ""
    value = (getpass.getpass if secret else input)(f"{prompt}{shown}: ").strip()
    return value or default


def init(args: argparse.Namespace) -> int:
    name = args.name if args.yes else _ask("Your name", args.name or "")
    me = (
        args.me
        if args.yes
        else _ask(
            "Short person id (lowercase)", args.me or (name.split()[0].lower() if name else "me")
        )
    )
    vault = Path(
        args.vault if args.yes else _ask("Vault path", args.vault or str(ENGINE_ROOT / "vault"))
    ).expanduser()
    api_key = (
        args.api_key if args.yes else _ask("Anthropic API key", args.api_key or "", secret=True)
    )
    base_url = (
        args.base_url
        if args.yes
        else _ask("LLM base URL (blank for Anthropic direct)", args.base_url or "")
    )
    model = args.model if args.yes else _ask("Model id", args.model or DEFAULT_MODEL)
    voice_text = (
        args.voice_text
        if args.yes
        else _ask("One line describing your writing voice (optional)", args.voice_text or "")
    )

    if not name or not me:
        print("ozos init: name and person id are required.", file=sys.stderr)
        return 1
    config_path = HOME / ".ozos" / "config.json"
    if config_path.is_file() and not args.force:
        try:
            current = json.loads(config_path.read_text(encoding="utf-8")).get("vault")
        except (OSError, ValueError, AttributeError):
            current = None
        if current and Path(current).expanduser() != vault:
            print(
                f"ozos init: {config_path} already points at {current}. "
                "Re-run with --force to switch this machine to the new vault.",
                file=sys.stderr,
            )
            return 1
    try:
        create_vault(TEMPLATE, vault)
    except FileExistsError as exc:
        print(f"ozos init: {exc}", file=sys.stderr)
        return 1
    write_env(vault, api_key, base_url, model or DEFAULT_MODEL)
    _write_voice_text(vault, voice_text)
    write_user_config(config_path, name=name, me=me, vault=vault, voice_text=voice_text)

    scrub_dst = HOME / ".ozos" / "scrub-terms.txt"
    if args.scrub_terms:
        shutil.copyfile(Path(args.scrub_terms).expanduser(), scrub_dst)
    print(f"✓ Vault created at {vault}")
    print(f"✓ User config written to {config_path}")
    if not api_key:
        print(
            "! ANTHROPIC_API_KEY is empty in the vault .env — the chat and the LLM tools "
            "will not work until you set it."
        )
    if scrub_dst.is_file():
        print(f"✓ Scrub term list at {scrub_dst}")
    else:
        print(
            f"  (no scrub term list at {scrub_dst}; `ozos scrub-check` will warn until you "
            "add one — pass --scrub-terms PATH)"
        )
    print("\nNext: bash app/run.sh  — then open Setup in the app to connect your sources.")
    return 0


# ── setup ───────────────────────────────────────────────────────────────────
#
# The item list is the app's registry (pure data, no app config import). The
# state file is read and written here with the same tolerant shape the app uses;
# derived states (profile, MCP, needs_attention) are the app's business.


def _registry():
    sys.path.insert(0, str(ENGINE_ROOT / "app"))
    from backend.services import setup_registry  # noqa: E402

    return setup_registry


def _setup_file(vault: Path) -> Path:
    return vault / ".ozos" / "setup.json"


def read_setup_state(vault: Path) -> dict:
    """{"items": {id: {status, updated_at, notes, ...}}, "badge_dismissed", "cadence"} —
    every registry item present, missing or malformed file tolerated."""
    reg = _registry()
    raw: dict = {}
    try:
        loaded = json.loads(_setup_file(vault).read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            raw = loaded
    except (OSError, ValueError):
        raw = {}
    stored = raw.get("items") if isinstance(raw.get("items"), dict) else {}
    items = {}
    for item_id in reg.ITEM_IDS:
        entry = {"status": "not_started", "updated_at": None, "notes": ""}
        got = stored.get(item_id)
        if isinstance(got, dict):
            entry.update({k: v for k, v in got.items() if k in ("updated_at", "notes", "rows")})
            if got.get("status") in reg.STATUSES:
                entry["status"] = got["status"]
        items[item_id] = entry
    return {
        "items": items,
        "badge_dismissed": bool(raw.get("badge_dismissed", False)),
        "cadence": raw.get("cadence") if isinstance(raw.get("cadence"), dict) else None,
    }


def setup_view(vault: Path) -> dict:
    reg = _registry()
    state = read_setup_state(vault)
    groups = []
    for gid, label in reg.GROUPS:
        items = [{**it, **state["items"][it["id"]]} for it in reg.ITEMS if it["group"] == gid]
        groups.append({"id": gid, "label": label, "items": items})
    statuses = [e["status"] for e in state["items"].values()]
    done = statuses.count("done")
    skipped = statuses.count("skipped")
    return {
        "groups": groups,
        "summary": {"done": done, "total": len(statuses), "open": len(statuses) - done - skipped},
        "cadence": state["cadence"],
    }


def mark_setup_item(vault: Path, item_id: str, status: str, notes: str | None = None) -> dict:
    reg = _registry()
    if item_id not in reg.ITEM_IDS:
        raise KeyError(item_id)
    if status not in reg.STATUSES:
        raise ValueError(status)
    state = read_setup_state(vault)
    entry = state["items"][item_id]
    entry["status"] = status
    entry["updated_at"] = datetime.now().isoformat(timespec="seconds")
    if notes is not None:
        entry["notes"] = notes
    path = _setup_file(vault)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    return entry


def setup_cmd(args: argparse.Namespace) -> int:
    vault = ozos_vault.vault_dir(ENGINE_ROOT, home=HOME)
    if args.setup_cmd == "mark":
        try:
            entry = mark_setup_item(vault, args.item, args.status, args.notes)
        except KeyError:
            print(f"ozos setup: unknown item '{args.item}'", file=sys.stderr)
            return 1
        except ValueError:
            print(f"ozos setup: unknown status '{args.status}'", file=sys.stderr)
            return 1
        print(f"{args.item}: {entry['status']}")
        return 0
    view = setup_view(vault)
    if args.json:
        print(json.dumps(view, indent=2))
        return 0
    print(f"Setup journal — {vault}")
    for group in view["groups"]:
        print(f"\n{group['label']}")
        for it in group["items"]:
            print(f"  [{it['status']}] {it['title']}")
    s = view["summary"]
    print(f"\n{s['done']} of {s['total']} done, {s['open']} open")
    return 0


# ── datapoints ──────────────────────────────────────────────────────────────


def datapoints_refresh(vault: Path, daily_only: bool) -> int:
    """The `datapoints-refresh` vital: refresh daily points (or all with --all) into
    the vault cache, one line per point, exit 1 when any fetch failed."""
    os.environ["OZOS_VAULT"] = str(vault)  # backend.config binds the vault at import
    sys.path.insert(0, str(ENGINE_ROOT / "app"))
    import run_log  # noqa: E402  (skills/ is on sys.path at module import)
    from backend.services import datapoints  # noqa: E402

    points = [p for p in datapoints.load_datapoints() if not daily_only or p["refresh"] == "daily"]
    if not points:
        print("no data points to refresh")
        return 0
    result = datapoints.refresh_all(daily_only=daily_only)
    for point in points:
        value = datapoints.read_value(point["id"])
        if value["error"]:
            print(f"{point['id']}: error: {value['error']}")
        else:
            print(f"{point['id']}: {len(value['rows'])} rows")
    run_log.record_run(
        vault / ".ozos" / "runs",
        "datapoints-refresh",
        result["refreshed"],
        [p["id"] for p in points if p["id"] not in result["failed"]],
    )
    return 1 if result["failed"] else 0


def datapoints_cmd(args: argparse.Namespace) -> int:
    vault = ozos_vault.vault_dir(ENGINE_ROOT, home=HOME)
    if args.datapoints_cmd == "refresh":
        return datapoints_refresh(vault, daily_only=not args.all)
    print("usage: ozos datapoints refresh [--all]", file=sys.stderr)
    return 2


# ── scrub-check ─────────────────────────────────────────────────────────────


def load_terms(terms_file: Path) -> list[str]:
    terms = []
    for line in terms_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            terms.append(line.lower())
    return terms


def scrub_check(
    root: Path, terms_file: Path, exclude: tuple[str, ...] = SCRUB_EXCLUDE
) -> list[tuple[Path, int, str]]:
    """Case-insensitive, line-based substring search over text files under root."""
    terms = load_terms(terms_file)
    terms_path = terms_file.resolve()
    hits: list[tuple[Path, int, str]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in exclude]
        for fn in filenames:
            path = Path(dirpath) / fn
            if path.resolve() == terms_path:
                continue  # the term list itself is not a leak
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for no, line in enumerate(text.splitlines(), 1):
                low = line.lower()
                for term in terms:
                    if term in low:
                        hits.append((path, no, term))
    return hits


def scrub(args: argparse.Namespace) -> int:
    terms_file = Path(args.terms).expanduser()
    root = Path(args.root).resolve()
    if not terms_file.is_file():
        print(f"WARNING: no scrub term list at {terms_file}; check skipped")
        return 0
    hits = scrub_check(root, terms_file)
    for path, no, term in hits:
        try:
            rel = path.relative_to(root)
        except ValueError:
            rel = path
        print(f"{rel}:{no}: {term}")
    if hits:
        print(f"scrub-check: {len(hits)} hit(s) — remove them before committing.")
        return 1
    print("scrub-check: clean")
    return 0


# ── entry ───────────────────────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ozos", description="OZOS engine + vault setup")
    sub = p.add_subparsers(dest="cmd", required=True)

    i = sub.add_parser("init", help="create a vault and write your user config")
    i.add_argument("--yes", action="store_true", help="non-interactive; take values from flags")
    i.add_argument("--name", default="")
    i.add_argument("--me", default="")
    i.add_argument("--vault", default=str(ENGINE_ROOT / "vault"))
    i.add_argument("--api-key", default="")
    i.add_argument("--base-url", default="")
    i.add_argument("--model", default=DEFAULT_MODEL)
    i.add_argument("--voice-text", default="")
    i.add_argument(
        "--force",
        action="store_true",
        help="repoint ~/.ozos/config.json even if it names another vault",
    )
    i.add_argument(
        "--scrub-terms", default="", help="copy this term list to ~/.ozos/scrub-terms.txt"
    )
    i.set_defaults(func=init)

    st = sub.add_parser("setup", help="print the setup journal; `setup mark` writes one status")
    st.add_argument("--json", action="store_true", help="machine-readable output")
    st_sub = st.add_subparsers(dest="setup_cmd")
    mk = st_sub.add_parser("mark", help="set one item's status")
    mk.add_argument("item")
    mk.add_argument("status")
    mk.add_argument("--notes", default=None)
    st.set_defaults(func=setup_cmd)

    dp = sub.add_parser("datapoints", help="`datapoints refresh` fetches daily data points")
    dp_sub = dp.add_subparsers(dest="datapoints_cmd")
    rf = dp_sub.add_parser("refresh", help="refresh daily data points into the vault cache")
    rf.add_argument("--all", action="store_true", help="refresh manual points too")
    dp.set_defaults(func=datapoints_cmd)

    s = sub.add_parser("scrub-check", help="fail if forbidden terms appear in the engine tree")
    s.add_argument("--terms", default=str(HOME / ".ozos" / "scrub-terms.txt"))
    s.add_argument("--root", default=str(ENGINE_ROOT))
    s.set_defaults(func=scrub)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
