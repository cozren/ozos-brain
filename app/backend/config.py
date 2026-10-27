# backend/config.py
"""Paths. Code lives under the engine root (_ROOT); every piece of user data lives
under the vault (VAULT) — see backend/vault.py for how the vault is found."""

from pathlib import Path
from dotenv import load_dotenv

from .vault import load_user_config, resolve_vault

_ROOT = Path(__file__).parents[2]
VAULT = resolve_vault(_ROOT)

load_dotenv(VAULT / ".env")

# Vault data roots
DATA_DIR = VAULT / "people-hub"
KNOWLEDGE_HUB_DIR = VAULT / "knowledge-hub"
REPO_ROOT = _ROOT

# Claude home
CLAUDE_HOME = Path.home() / ".claude"
CLAUDE_SKILLS_DIR = CLAUDE_HOME / "skills"
CLAUDE_GLOBAL_SETTINGS = CLAUDE_HOME / "settings.json"
CLAUDE_PLUGINS_JSON = CLAUDE_HOME / "plugins" / "installed_plugins.json"
CLAUDE_PLUGINS_CACHE = CLAUDE_HOME / "plugins" / "cache"

# OZOS runtime config (in the vault)
OZOS_CONFIG_DIR = VAULT / ".ozos"
OZOS_REMOTE_MCPS = OZOS_CONFIG_DIR / "remote-mcps.json"
OZOS_VITALS = OZOS_CONFIG_DIR / "vitals.json"
OZOS_RUNS_DIR = OZOS_CONFIG_DIR / "runs"  # per-vital run-logs written by the tools

# Project settings & MCP config
OZOS_PROJECT_SETTINGS = _ROOT / ".claude" / "settings.json"
OZOS_PROJECT_COMMANDS = _ROOT / ".claude" / "commands"
OZOS_MCP_CONFIG = _ROOT / ".mcp.json"

# Tools
TOOLS_DIR = _ROOT / "tools"

# Peon ping state
PEON_STATE_FILE = CLAUDE_HOME / "hooks" / "peon-ping" / ".state.json"

# People
PEOPLE_DIR = DATA_DIR / "people"

# Graphify
GRAPHIFY_REPORT = _ROOT / "graphify-out" / "GRAPH_REPORT.md"


# Knowledge Hub — extensible source registry + starred documents + open tracking
OZOS_KNOWLEDGE_SOURCES = OZOS_CONFIG_DIR / "knowledge-sources.json"
OZOS_KNOWLEDGE_STARS = OZOS_CONFIG_DIR / "knowledge-stars.json"
OZOS_KNOWLEDGE_OPENS = OZOS_CONFIG_DIR / "knowledge-opens.json"
OZOS_KNOWLEDGE_COLORS = OZOS_CONFIG_DIR / "knowledge-colors.json"
OZOS_KNOWLEDGE_ORDER = OZOS_CONFIG_DIR / "knowledge-order.json"
OZOS_KNOWLEDGE_FOLDER_TAGS = OZOS_CONFIG_DIR / "knowledge-folder-tags.json"

# Reporting page widget layout (drag/resize positions persisted here)
OZOS_REPORTING_LAYOUT = OZOS_CONFIG_DIR / "reporting.json"

# Intel Agents — per-agent config store, stars, and dated report instances
INTEL_AGENTS_DIR = KNOWLEDGE_HUB_DIR / "intel-agents"
OZOS_INTEL_AGENTS_CONFIG = OZOS_CONFIG_DIR / "intel-agents.json"
OZOS_INTEL_AGENTS_STARS = OZOS_CONFIG_DIR / "intel-agents-stars.json"

# Data Hub page dashboard layout (per-tab grid positions persisted here)
OZOS_DATAHUB_LAYOUT = OZOS_CONFIG_DIR / "datahub.json"

# Personal tasks
PERSONAL_TASKS_FILE = OZOS_CONFIG_DIR / "personal-tasks.json"
ME_PERSON_ID = load_user_config().get("me", "me")  # the single local user; set by `ozos init`

# Floating chat — skills the assistant may use to style artifacts (Phase 1:
# interpreted as writing instructions, not executed).
CHAT_ARTIFACT_SKILLS = ("quick-prd", "doc-style")
