# backend/services/control_tower.py
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from ..config import (
    REPO_ROOT,
    VAULT,
    CLAUDE_SKILLS_DIR,
    CLAUDE_PLUGINS_CACHE,
    CLAUDE_GLOBAL_SETTINGS,
    CLAUDE_PLUGINS_JSON,
    OZOS_PROJECT_SETTINGS,
    OZOS_PROJECT_COMMANDS,
    OZOS_MCP_CONFIG,
    OZOS_REMOTE_MCPS,
    OZOS_RUNS_DIR,
    OZOS_VITALS,
    TOOLS_DIR,
    PEON_STATE_FILE,
    PEOPLE_DIR,
    GRAPHIFY_REPORT,
    KNOWLEDGE_HUB_DIR,
)

# Shared run-log helper (skills/) — written by meeting-notes / daily-digest.
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "skills"))
import run_log  # noqa: E402


def _read_json(path: Path) -> dict | list | None:
    """Return parsed JSON or None if file missing/invalid."""
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def _human_age(mtime: float) -> str:
    """Convert a file mtime to a human-readable age string."""
    seconds = time.time() - mtime
    if seconds < 120:
        return "just now"
    if seconds < 3600:
        return f"{int(seconds // 60)}m ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)}h ago"
    return f"{int(seconds // 86400)}d ago"


def _iso_to_age(iso: str) -> str | None:
    """Convert an ISO timestamp to a human-readable age, or None if unparseable."""
    try:
        return _human_age(datetime.fromisoformat(iso).timestamp())
    except (ValueError, TypeError):
        return None


def _vital_output_path(output_dir: str) -> Path:
    """Vital outputs live in the vault. The one exception is derived output that
    lives beside the engine (the knowledge graph), so a path absent from the vault
    but present under the engine root resolves there."""
    in_vault = (Path(VAULT) / output_dir).resolve()
    if in_vault.exists():
        return in_vault
    in_engine = (Path(REPO_ROOT) / output_dir).resolve()
    return in_engine if in_engine.exists() else in_vault


def _latest_output_mtime(vital: dict) -> float | None:
    """Newest mtime among a vital's output files (its mtime-based 'last run')."""
    output_dir = vital.get("output_dir")
    if not output_dir:
        return None
    out_path = _vital_output_path(output_dir)
    if not out_path.exists():
        return None
    glob = vital.get("output_glob", "*.md")
    files = list(out_path.rglob(glob)) if "**" in glob else list(out_path.glob(glob))
    return max((f.stat().st_mtime for f in files), default=None)


# ── Skills ──────────────────────────────────────────────────────────


def _load_skill_usage() -> dict[str, dict]:
    """Parse history.jsonl for skill usage counts and last-used timestamps.

    Only counts entries where the display text starts with '/' — genuine
    slash-command invocations. Skips file paths and other text that happen
    to contain a slash-prefixed word.
    """
    history_path = Path.home() / ".claude" / "history.jsonl"
    usage: dict[str, dict] = {}
    if not history_path.exists():
        return usage
    slash_re = re.compile(r"^/([a-z][a-z0-9:_-]+)", re.IGNORECASE)
    try:
        with history_path.open() as f:
            for line in f:
                try:
                    entry = json.loads(line)
                    text = entry.get("display", "").strip()
                    ts = entry.get("timestamp", 0) / 1000
                    m = slash_re.match(text)
                    if m:
                        key = m.group(1).lower()
                        rec = usage.setdefault(key, {"count": 0, "last_ts": 0.0})
                        rec["count"] += 1
                        if ts > rec["last_ts"]:
                            rec["last_ts"] = ts
                except Exception:
                    pass
    except Exception:
        pass
    return usage


def _parse_skill_meta(path: Path) -> dict:
    """Parse SKILL.md YAML frontmatter and measure file size."""
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return {"content_chars": 0}
    result: dict = {"content_chars": len(content)}
    m = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if m:
        for line in m.group(1).split("\n"):
            if ":" in line:
                key, _, val = line.partition(":")
                result[key.strip()] = val.strip().strip("\"'")
    return result


def _resolve_usage(keys: list[str], usage: dict) -> tuple[int, str | None]:
    for key in keys:
        rec = usage.get(key)
        if rec and rec["count"] > 0:
            last_ts = rec["last_ts"]
            return rec["count"], (_human_age(last_ts) if last_ts else None)
    return 0, None


# Skills that can't be self-tagged via SKILL.md due to filesystem permissions
_KNOWN_EXTERNAL_SKILLS: frozenset[str] = frozenset({"ui-ux-pro-max", "graphify"})


def load_skills() -> list[dict]:
    """Load all skills with usage stats, metadata, and context size estimate."""
    usage = _load_skill_usage()
    seen: set[str] = set()
    skills: list[dict] = []

    # 1. Standalone skills from ~/.claude/skills/
    if CLAUDE_SKILLS_DIR.exists():
        for skill_dir in sorted(CLAUDE_SKILLS_DIR.iterdir()):
            if not skill_dir.is_dir():
                continue
            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                continue
            meta = _parse_skill_meta(skill_md)
            name = meta.get("name", skill_dir.name)
            if name in seen:
                continue
            seen.add(name)
            is_external = (
                meta.get("origin") == "external"
                or name in _KNOWN_EXTERNAL_SKILLS
                or skill_dir.name in _KNOWN_EXTERNAL_SKILLS
            )
            origin = "external" if is_external else "mine"
            count, last_used = _resolve_usage([skill_dir.name, name], usage)
            skills.append(
                {
                    "name": name,
                    "description": meta.get("description", ""),
                    "version": meta.get("version") or None,
                    "origin": origin,
                    "source": None,
                    "usageCount": count,
                    "lastUsed": last_used,
                    "contextTokens": max(1, meta["content_chars"] // 4),
                }
            )

    # 2. Plugin-contributed skills from plugin caches
    if CLAUDE_PLUGINS_CACHE.exists():
        for publisher_dir in sorted(CLAUDE_PLUGINS_CACHE.iterdir()):
            if not publisher_dir.is_dir():
                continue
            for plugin_dir in sorted(publisher_dir.iterdir()):
                if not plugin_dir.is_dir():
                    continue
                plugin_name = plugin_dir.name
                versions = sorted(
                    (v for v in plugin_dir.iterdir() if v.is_dir()),
                    key=lambda p: p.name,
                    reverse=True,
                )
                latest = next(iter(versions), None)
                if not latest:
                    continue
                for skill_md in sorted(latest.rglob("SKILL.md")):
                    meta = _parse_skill_meta(skill_md)
                    name = meta.get("name", skill_md.parent.name)
                    if name in seen:
                        continue
                    seen.add(name)
                    count, last_used = _resolve_usage(
                        [f"{plugin_name}:{name}", name, skill_md.parent.name], usage
                    )
                    skills.append(
                        {
                            "name": name,
                            "description": meta.get("description", ""),
                            "version": meta.get("version") or None,
                            "origin": "plugin",
                            "source": plugin_name,
                            "usageCount": count,
                            "lastUsed": last_used,
                            "contextTokens": max(1, meta["content_chars"] // 4),
                        }
                    )

    skills.sort(key=lambda s: s["usageCount"], reverse=True)
    return skills


# ── Hooks ────────────────────────────────────────────────────────────


def _extract_target(cmd: str) -> str:
    """Extract a human-readable target name from a hook command string."""
    if not cmd:
        return ""
    operators = {"&&", "||", "|", ";", "&", "2>&1", ">>", ">", "<"}
    parts = [p for p in cmd.strip().split() if p not in operators]

    # First: find a script file (.sh .py .js .ts)
    for part in parts:
        basename = part.split("/")[-1]
        if "." in basename and not basename.startswith("-"):
            name, _, ext = basename.rpartition(".")
            if ext in ("sh", "py", "js", "ts") and name:
                return name

    # Second: audio launcher followed by a sound file
    for i, part in enumerate(parts):
        if part in ("afplay", "aplay", "paplay") and i + 1 < len(parts):
            basename = parts[i + 1].split("/")[-1]
            return basename.rpartition(".")[0] or basename

    # Third: known keyword anywhere in the full command
    for kw in ("graphify", "meeting-notes"):
        if kw in cmd:
            return kw

    return parts[-1] if parts else cmd[:30]


def load_hooks() -> list[dict]:
    """Parse hook entries from global and project settings.json files."""
    hooks = []
    seen: set[tuple] = set()

    for path, scope in [(CLAUDE_GLOBAL_SETTINGS, "global"), (OZOS_PROJECT_SETTINGS, "project")]:
        data = _read_json(path)
        if not data or not isinstance(data, dict):
            continue
        for hook_event, entries in data.get("hooks", {}).items():
            if not isinstance(entries, list):
                continue
            for entry in entries:
                cmd = entry.get("command") or entry.get("hooks", [{}])[0].get("command", "")
                target = _extract_target(cmd)
                key = (hook_event, target)
                if key not in seen:
                    seen.add(key)
                    hooks.append(
                        {
                            "event": hook_event,
                            "target": target,
                            "command": cmd,
                            "scope": scope,
                            "status": "ok",
                        }
                    )
    return hooks


# ── Slash commands ───────────────────────────────────────────────────


def _parse_command_meta(path: Path) -> dict:
    """Parse a .claude/commands/*.md file into {description, content_chars}.

    Prefers a YAML-frontmatter `description:`; otherwise falls back to the first
    non-empty line of the body (the convention these command files follow).
    """
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return {"description": "", "content_chars": 0}

    result: dict = {"description": "", "content_chars": len(content)}
    body = content
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", content, re.DOTALL)
    if m:
        body = m.group(2)
        for line in m.group(1).split("\n"):
            if ":" in line:
                key, _, val = line.partition(":")
                if key.strip() == "description":
                    result["description"] = val.strip().strip("\"'")

    if not result["description"]:
        for line in body.split("\n"):
            stripped = line.strip()
            if stripped:
                result["description"] = stripped
                break
    return result


def load_commands() -> list[dict]:
    """Load project slash commands from .claude/commands/*.md with usage stats.

    Each command maps to a file `<name>.md`; usage is resolved from the same
    slash-invocation history that powers skill usage. Sorted by usage desc, then
    name. Returns an empty list if the directory is absent.
    """
    if not OZOS_PROJECT_COMMANDS.exists():
        return []

    usage = _load_skill_usage()
    commands: list[dict] = []
    for path in sorted(OZOS_PROJECT_COMMANDS.glob("*.md")):
        if not path.is_file():
            continue
        name = path.stem
        meta = _parse_command_meta(path)
        count, last_used = _resolve_usage([name], usage)
        commands.append(
            {
                "name": name,
                "description": meta["description"],
                "usageCount": count,
                "lastUsed": last_used,
                "contextTokens": max(1, meta["content_chars"] // 4),
            }
        )

    commands.sort(key=lambda c: (-c["usageCount"], c["name"]))
    return commands


# ── Plugins ──────────────────────────────────────────────────────────


def load_plugins() -> list[dict]:
    """Read installed plugins from ~/.claude/plugins/installed_plugins.json."""
    data = _read_json(CLAUDE_PLUGINS_JSON)
    if not data or not isinstance(data, dict):
        return []

    plugins = []
    for key, entries in data.get("plugins", {}).items():
        name = key.split("@")[0] if "@" in key else key
        publisher = key.split("@")[1] if "@" in key else ""
        entry = entries[0] if isinstance(entries, list) and entries else {}
        if not isinstance(entry, dict):
            entry = {}
        plugins.append(
            {
                "name": name,
                "publisher": publisher,
                "version": entry.get("version", ""),
                "enabled": True,
                "installedAt": entry.get("installedAt", ""),
                "lastUpdated": entry.get("lastUpdated", ""),
                "gitCommitSha": entry.get("gitCommitSha", ""),
            }
        )
    return plugins


# ── MCP Discovery ────────────────────────────────────────────────────

_MCP_CACHE: dict = {"data": None, "ts": 0.0}
_MCP_CACHE_TTL = 60.0

_LINE_RE = re.compile(r"^(claude\.ai\s+)?(.+?):\s+\S.*?\s+-\s+(.+)$")

# Products per MCP name — most-specific match first (case-insensitive substring)
_MCP_PRODUCT_MAP: list[tuple[str, list[str], str]] = [
    ("atlassian goals", ["Goals"], "product"),
    ("atlassian", ["Jira", "Confluence"], "product"),
]


def _mcp_meta(name: str) -> tuple[list[str], str]:
    """Return (products, connectionType) for a given MCP display name."""
    lower = name.lower()
    for key, prods, conn_type in _MCP_PRODUCT_MAP:
        if key in lower:
            return prods, conn_type
    return [], "mcp"


def _parse_mcp_status(raw: str) -> str:
    if "✓" in raw or "Connected" in raw:
        return "active"
    if "✗" in raw or "Failed" in raw:
        return "error"
    if "⏸" in raw or "Pending" in raw:
        return "pending"
    return "needs-auth"


_CLAUDE_BIN = Path.home() / ".local" / "bin" / "claude"


def _regenerate_mcp_cache(mcp_cache_file: Path) -> None:
    """Run `claude mcp list` and write output to the cache file."""
    if not _CLAUDE_BIN.exists():
        return
    try:
        result = subprocess.run(
            [str(_CLAUDE_BIN), "mcp", "list"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        mcp_cache_file.write_text(result.stdout)
    except Exception:
        pass


def discover_mcps() -> dict:
    """Run `claude mcp list` via osascript (clean shell context). Cached 60s."""
    now = time.time()
    if _MCP_CACHE["data"] is not None and (now - _MCP_CACHE["ts"]) < _MCP_CACHE_TTL:
        return _MCP_CACHE["data"]

    remote: list[dict] = []
    local: list[dict] = []

    mcp_cache_file = Path("/tmp/ozos-mcp-list.txt")

    if not mcp_cache_file.exists():
        _regenerate_mcp_cache(mcp_cache_file)

    try:
        raw = mcp_cache_file.read_text() if mcp_cache_file.exists() else ""
        for line in raw.splitlines():
            m = _LINE_RE.match(line.strip())
            if not m:
                continue
            is_remote = bool(m.group(1))
            name = m.group(2).strip()
            status = _parse_mcp_status(m.group(3))
            products, conn_type = _mcp_meta(name)
            entry = {
                "name": name,
                "status": status,
                "products": products,
                "connectionType": conn_type,
            }
            if is_remote:
                remote.append(entry)
            else:
                local.append(entry)
    except Exception:
        pass

    local.extend(_load_api_connections())

    data = {"remote": remote, "local": local}
    _MCP_CACHE["data"] = data
    _MCP_CACHE["ts"] = now
    return data


def _load_api_connections() -> list[dict]:
    """Read env for known API connections and return as MCP-style entries."""
    llm_key = os.environ.get("ANTHROPIC_API_KEY", "")
    return [
        {
            "name": "Claude API",
            "status": "active" if llm_key else "needs-auth",
            "products": [],
            "connectionType": "api-connection",
        }
    ]


# kept for import compatibility — delegates to discover_mcps
def load_local_mcps() -> list[dict]:
    return discover_mcps()["local"]


def load_remote_mcps() -> list[dict]:
    return discover_mcps()["remote"]


# ── Vital Functions ──────────────────────────────────────────────────


def load_vitals() -> list[dict]:
    """Load vitals from .ozos/vitals.json and compute status from output file mtimes."""
    data = _read_json(OZOS_VITALS)
    if not data or not isinstance(data, dict):
        return []

    results = []

    for v in data.get("vitals", []):
        output_dir = v.get("output_dir")
        glob = v.get("output_glob", "*.md")
        stale_hours = v.get("stale_after_hours", 24)

        last_mtime: float | None = None
        file_count = 0

        if output_dir:
            out_path = _vital_output_path(output_dir)
            if out_path.exists():
                files = list(out_path.rglob(glob)) if "**" in glob else list(out_path.glob(glob))
                file_count = len(files)
                if files:
                    last_mtime = max(f.stat().st_mtime for f in files)

        age_seconds = (time.time() - last_mtime) if last_mtime else None
        stale_seconds = stale_hours * 3600

        if last_mtime is None:
            status = "fail"
            metric = "never run"
            badge = "NEVER RUN"
            last_run_human = "—"
        elif age_seconds > stale_seconds:
            status = "warn"
            metric = _human_age(last_mtime).replace(" ago", "") + " stale"
            badge = "STALE"
            last_run_human = _human_age(last_mtime)
        else:
            status = "ok"
            # Special metric computation per vital type
            if v["id"] == "meeting-notes":
                # Count files modified in last 24h
                new_today = (
                    sum(
                        1
                        for f in (out_path.rglob(glob) if "**" in glob else out_path.glob(glob))
                        if (time.time() - f.stat().st_mtime) < 86400
                    )
                    if last_mtime
                    else 0
                )
                metric = f"{new_today} new" if new_today else f"{file_count} total"
                badge = "SYNCED"
            elif v["id"] == "graphify":
                nodes = _parse_graphify_nodes()
                metric = f"{nodes} nodes" if nodes else f"{file_count} files"
                badge = "CURRENT"
            else:
                metric = f"{file_count} files"
                badge = "OK"
            last_run_human = _human_age(last_mtime)

        # Prefer the run-log (true last execution + delta) over file mtime.
        last_run = run_log.read_last_run(OZOS_RUNS_DIR, v["id"])
        if last_run and last_run.get("ts"):
            last_run_iso = last_run["ts"]
            last_run_human = _iso_to_age(last_run_iso) or last_run_human
            delta = f"+{int(last_run.get('count', 0))}"
        else:
            last_run_iso = (
                datetime.fromtimestamp(last_mtime, tz=timezone.utc).isoformat()
                if last_mtime
                else None
            )
            delta = None

        results.append(
            {
                "id": v["id"],
                "name": v["name"],
                "status": status,
                "metric": metric,
                "lastRunHuman": last_run_human,
                "lastRunIso": last_run_iso,
                "delta": delta,
                "badge": badge,
            }
        )

    return results


# Gemini note titles embed the meeting date, e.g. 'Notes: "X" Jun 17, 2026'.
_ITEM_DATE_RE = re.compile(r"([A-Z][a-z]{2} \d{1,2}, \d{4})")


def _item_meeting_date(item: str):
    """Parse the meeting date embedded in an item title, or None if absent."""
    m = _ITEM_DATE_RE.search(item)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%b %d, %Y").date()
    except ValueError:
        return None


def _items_added_today(runs: list[dict]) -> list[str]:
    """Titles for today's meetings: items from runs that happened today (local),
    keeping only those whose embedded meeting date is today. Items without an
    embedded date (e.g. digest section headings) are kept — they belong to today's
    run by timestamp. Deduped, first-seen order.
    """
    today = datetime.now().astimezone().date()
    seen: set[str] = set()
    out: list[str] = []
    for rec in runs:
        ts = rec.get("ts")
        try:
            when = datetime.fromisoformat(ts).astimezone().date()
        except (ValueError, TypeError):
            continue
        if when != today:
            continue
        for item in rec.get("items", []):
            meeting_date = _item_meeting_date(item)
            if meeting_date is not None and meeting_date != today:
                continue  # synced today, but for an earlier meeting
            if item not in seen:
                seen.add(item)
                out.append(item)
    return out


def load_vital_detail(vital_id: str) -> dict | None:
    """Detailed run info for one vital, fetched lazily when a row is clicked.

    Returns {id, lastRunIso, lastRunHuman, delta, todayCount, items} or None if the
    vital id is unknown. `delta` is the count added in the most recent run ("just
    now"); `items` is everything added across today's runs. Falls back to output-
    file mtime (no items) when no run-log exists yet.
    """
    data = _read_json(OZOS_VITALS)
    if not data or not isinstance(data, dict):
        return None
    vital = next((v for v in data.get("vitals", []) if v.get("id") == vital_id), None)
    if vital is None:
        return None

    last_run = run_log.read_last_run(OZOS_RUNS_DIR, vital_id)
    if last_run and last_run.get("ts"):
        iso = last_run["ts"]
        today_items = _items_added_today(run_log.read_runs(OZOS_RUNS_DIR, vital_id))
        return {
            "id": vital_id,
            "lastRunIso": iso,
            "lastRunHuman": _iso_to_age(iso) or "—",
            "delta": f"+{int(last_run.get('count', 0))}",
            "todayCount": len(today_items),
            "items": today_items,
        }

    mtime = _latest_output_mtime(vital)
    return {
        "id": vital_id,
        "lastRunIso": (
            datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat() if mtime else None
        ),
        "lastRunHuman": _human_age(mtime) if mtime else "—",
        "delta": None,
        "todayCount": 0,
        "items": [],
    }


# ── Manual vital re-trigger ──────────────────────────────────────────
# Mirrors the reporting "run source" pattern: a POST kicks off the vital's
# `run` command in a background daemon thread, guarded by a lockfile; a status
# file records the last exit code. The frontend polls run-status until idle.


# A lock older than this is assumed abandoned (backend crashed/killed mid-run);
# nothing legitimately runs this long, so we relaunch over it instead of leaving
# the button permanently stuck on "running".
STALE_LOCK_SECONDS = 3600


def _vital_lock_path(vital_id: str) -> Path:
    return OZOS_RUNS_DIR / f"{vital_id}.lock"


def _lock_is_active(vital_id: str) -> bool:
    """True if a run lock exists and is fresh enough to be a live run."""
    lock = _vital_lock_path(vital_id)
    if not lock.exists():
        return False
    return (time.time() - lock.stat().st_mtime) < STALE_LOCK_SECONDS


def _vital_status_path(vital_id: str) -> Path:
    return OZOS_RUNS_DIR / f"{vital_id}.run-status.json"


def _get_vital(vital_id: str) -> dict | None:
    """Return the raw vital config from vitals.json, or None if unknown."""
    data = _read_json(OZOS_VITALS)
    if not data or not isinstance(data, dict):
        return None
    return next((v for v in data.get("vitals", []) if v.get("id") == vital_id), None)


def _launch(target) -> None:
    """Run target in a background daemon thread (patched inline in tests)."""
    threading.Thread(target=target, daemon=True).start()


def _last_meaningful_line(output: str, limit: int = 200) -> str:
    """Last non-empty line of output — for a traceback, the exception message."""
    for line in reversed(output.splitlines()):
        stripped = line.strip()
        if stripped:
            return stripped[:limit]
    return ""


def _execute_vital(vital: dict) -> None:
    """Run a vital's command, capturing output, then write status and clear lock."""
    vital_id = vital["id"]
    exit_code = 1
    output = ""
    try:
        proc = subprocess.run(vital["run"], cwd=REPO_ROOT, capture_output=True, text=True)
        exit_code = proc.returncode
        output = (proc.stdout or "") + (proc.stderr or "")
    finally:
        OZOS_RUNS_DIR.mkdir(parents=True, exist_ok=True)
        if output:
            (OZOS_RUNS_DIR / f"{vital_id}.run.log").write_text(output)
        status = {"ts": datetime.now().isoformat(), "exit": exit_code}
        if exit_code != 0:
            # Surface the reason so the UI shows more than a bare exit code.
            status["error"] = _last_meaningful_line(output)
        _vital_status_path(vital_id).write_text(json.dumps(status))
        _vital_lock_path(vital_id).unlink(missing_ok=True)


def run_vital(vital_id: str) -> dict | None:
    """Start a vital's `run` command in the background.

    Returns None if the vital is unknown, {'state': 'not-runnable'} if it has no
    `run` command, {'state': 'running'} if one is already in flight, else
    {'state': 'started'}.
    """
    vital = _get_vital(vital_id)
    if vital is None:
        return None
    if not vital.get("run"):
        return {"state": "not-runnable"}
    if _lock_is_active(vital_id):
        return {"state": "running"}
    OZOS_RUNS_DIR.mkdir(parents=True, exist_ok=True)
    _vital_lock_path(vital_id).write_text(datetime.now().isoformat())
    _launch(lambda: _execute_vital(vital))
    return {"state": "started"}


def vital_run_status(vital_id: str) -> dict | None:
    """Return the current run state for a vital, or None if unknown.

    'running' while the lock is held; otherwise 'idle' (last run succeeded or
    never ran) or 'error' (last run exited non-zero).
    """
    if _get_vital(vital_id) is None:
        return None
    if _lock_is_active(vital_id):
        return {"state": "running", "last_run": None, "last_exit": None, "error": None}
    status_path = _vital_status_path(vital_id)
    if status_path.exists():
        data = json.loads(status_path.read_text())
        return {
            "state": "idle" if data.get("exit") == 0 else "error",
            "last_run": data.get("ts"),
            "last_exit": data.get("exit"),
            "error": data.get("error"),
        }
    return {"state": "idle", "last_run": None, "last_exit": None, "error": None}


def _parse_graphify_nodes() -> int | None:
    """Extract node count from graphify-out/GRAPH_REPORT.md."""
    if not GRAPHIFY_REPORT.exists():
        return None
    text = GRAPHIFY_REPORT.read_text()
    m = re.search(r"(\d+)\s+nodes", text)
    return int(m.group(1)) if m else None


# ── Session ──────────────────────────────────────────────────────────


def load_session(session_start_time: float) -> dict:
    """Build session status. session_start_time is set when the app starts."""
    peon_ping = "off"
    if PEON_STATE_FILE.exists():
        peon_data = _read_json(PEON_STATE_FILE)
        if isinstance(peon_data, dict) and peon_data.get("active"):
            peon_ping = "live"

    duration = int(time.time() - session_start_time)
    return {
        "active": True,
        "durationSeconds": duration,
        "peonPing": peon_ping,
        "sessionsToday": 1,  # placeholder — wire to real log in future
        "model": "claude-sonnet-4-6",
        "tokensThisSession": 0,  # placeholder — requires token tracking
        "tokensAllTime": 0,  # placeholder — requires token log
        "estimatedCostUsd": 0.0,
    }


# ── Brain Overview ───────────────────────────────────────────────────


def load_brain_overview() -> dict:
    """Count artifacts across the knowledge base."""
    # Meeting notes
    notes_dir = KNOWLEDGE_HUB_DIR / "meeting-notes"
    meeting_notes = len(list(notes_dir.rglob("*.md"))) if notes_dir.is_dir() else 0

    # Other documents in knowledge-hub (excluding meeting-notes subdir)
    documents = (
        sum(
            len(list(d.rglob("*.md")))
            for d in KNOWLEDGE_HUB_DIR.iterdir()
            if d.is_dir() and d.name != "meeting-notes"
        )
        if KNOWLEDGE_HUB_DIR.is_dir()
        else 0
    )

    # People
    people = len([d for d in PEOPLE_DIR.iterdir() if d.is_dir()]) if PEOPLE_DIR.is_dir() else 0

    # Graph nodes
    graph_nodes = _parse_graphify_nodes() or 0

    return {
        "meetingNotes": meeting_notes,
        "documents": documents,
        "goals": 0,  # future: wire to Goals hub
        "reports": 0,  # future: wire to Reports hub
        "people": people,
        "graphNodes": graph_nodes,
    }
