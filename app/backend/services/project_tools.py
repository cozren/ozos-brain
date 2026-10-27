"""Read-only project tools for the floating chat (+ create_artifact in Task 4).

Everything is confined to the repo. read_project_file blocks secret files by
filename AND content (first-4KB scan); search_project excludes them by
filename only — a secret embedded in a non-secret-named file can still
surface in search results. Tests monkeypatch REPO_ROOT/KNOWLEDGE_HUB_DIR,
so read them at call time.
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

from ..config import KNOWLEDGE_HUB_DIR, OZOS_CONFIG_DIR, REPO_ROOT, VAULT  # noqa: F401
from .frontmatter import join_frontmatter

MAX_LINE_CHARS = 300
SECRET_GLOBS = [".env*", "credentials.json", "token.json", "service-account.json", "*key*.json"]
_SECRET_CONTENT_RE = re.compile(rb"client_secret|private_key|access_token", re.IGNORECASE)
SEARCH_EXCLUDE_DIRS = ["node_modules", ".git", ".venv", "__pycache__", "dist"]


def _root() -> Path:
    return Path(REPO_ROOT).resolve()


def _search_roots() -> list[Path]:
    """Engine root plus the vault, unless the vault already sits inside the engine."""
    roots = [_root()]
    vault = Path(VAULT).resolve()
    if not vault.is_relative_to(roots[0]):
        roots.append(vault)
    return roots


def _resolve_in_repo(rel_path: str) -> Path:
    p = (_root() / rel_path).resolve()
    if not p.is_relative_to(_root()):
        raise ValueError(f"path escapes the project: {rel_path}")
    return p


def _is_secret_file(p: Path) -> bool:
    if any(p.match(g) for g in SECRET_GLOBS):
        return True
    try:
        with p.open("rb") as fh:
            head = fh.read(4096)
    except OSError:
        return False
    return bool(_SECRET_CONTENT_RE.search(head))


def read_project_file(path: str, offset: int = 0, limit: int = 400) -> dict:
    try:
        p = _resolve_in_repo(path)
    except ValueError as e:
        return {"error": str(e)}
    if not p.is_file():
        return {"error": f"not a file: {path}"}
    if _is_secret_file(p):
        return {
            "error": f"'{path}' looks like a credentials/secret file — reading it is not allowed."
        }
    lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
    window = [ln[:MAX_LINE_CHARS] for ln in lines[offset : offset + limit]]
    return {"path": path, "offset": offset, "total_lines": len(lines), "content": "\n".join(window)}


def search_project(query: str, glob: str | None = None, max_results: int = 50):
    if not shutil.which("rg"):
        return {"error": "ripgrep (rg) is not installed on this machine"}
    cmd = ["rg", "--no-heading", "--line-number", "--smart-case", "-m", "5"]
    for d in SEARCH_EXCLUDE_DIRS:
        cmd += ["-g", f"!{d}"]
    if glob:
        cmd += ["-g", glob]
    # Secret excludes are appended LAST: ripgrep's glob matching is
    # last-pattern-wins, so this guarantees the caller-supplied glob can
    # never re-include a secret file (e.g. glob=".env*" must not undo this).
    for g in SECRET_GLOBS:
        cmd += ["-g", f"!{g}"]
    cmd += ["--", query, *[str(r) for r in _search_roots()]]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    except subprocess.TimeoutExpired:
        return {"error": "search timed out — try a narrower query or a glob"}
    if proc.returncode not in (0, 1):  # 1 = no matches
        return {"error": proc.stderr[:500]}
    results = []
    for line in proc.stdout.splitlines():
        if len(results) >= max_results:
            break
        try:
            fname, lineno, text = line.split(":", 2)
        except ValueError:
            continue
        abs_path = Path(fname).resolve()
        root = next((r for r in _search_roots() if abs_path.is_relative_to(r)), _root())
        rel = str(abs_path.relative_to(root))
        if root != _root():
            rel = f"vault/{rel}"
        results.append({"path": rel, "line": int(lineno), "text": text.strip()[:MAX_LINE_CHARS]})
    return results if results else [{"info": f"No matches for: {query}"}]


def read_wiki(article: str | None = None) -> dict:
    wiki_dir = (_root() / "graphify-out" / "wiki").resolve()
    target = (wiki_dir / (f"{article}.md" if article else "index.md")).resolve()
    if not target.is_relative_to(wiki_dir):
        return {"error": "invalid article name"}
    if not target.exists():
        return {
            "error": f"wiki article not found: {article}",
            "hint": "call read_wiki with no argument to see the index of communities",
        }
    return {"article": target.stem, "content": target.read_text(encoding="utf-8")[:12000]}


def lookup_knowledge_tags(tag: str | None = None) -> dict:
    index_file = Path(OZOS_CONFIG_DIR) / "knowledge-tag-index.json"
    if not index_file.exists():
        return {"error": "knowledge tag index missing (<vault>/.ozos/knowledge-tag-index.json)"}
    by_tag = json.loads(index_file.read_text(encoding="utf-8")).get("by_tag", {})
    if tag is None:
        return {"tags": sorted(by_tag.keys())}
    matches = {k: v for k, v in by_tag.items() if tag.lower() in k.lower()}
    if not matches:
        return {"info": f"no tag matching '{tag}'", "tags": sorted(by_tag.keys())[:50]}
    return {"matches": matches}


_ARTIFACT_FILENAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*\.md\Z")


def create_artifact(
    folder: str, filename: str, markdown: str, tags: list[str] | None = None
) -> dict:
    if not _ARTIFACT_FILENAME_RE.match(filename):
        return {"error": "filename must be kebab-case ending in .md, e.g. 'my-analysis.md'"}
    hub = Path(KNOWLEDGE_HUB_DIR).resolve()
    target_dir = (hub / folder).resolve()
    if not target_dir.is_relative_to(hub):
        return {"error": f"folder escapes knowledge-hub/: {folder}"}
    target = target_dir / filename
    target_dir.mkdir(parents=True, exist_ok=True)
    content = join_frontmatter({"tags": tags}, markdown) if tags else markdown
    try:
        with target.open("x", encoding="utf-8") as fh:
            fh.write(content)
    except FileExistsError:
        return {"error": f"{filename} already exists in {folder} — choose a different filename"}
    return {"created": str(target.relative_to(_root()))}


PROJECT_TOOL_EXECUTORS = {
    "search_project": lambda inp: search_project(
        inp["query"], inp.get("glob"), inp.get("max_results", 50)
    ),
    "read_project_file": lambda inp: read_project_file(
        inp["path"], inp.get("offset", 0), inp.get("limit", 400)
    ),
    "read_wiki": lambda inp: read_wiki(inp.get("article")),
    "lookup_knowledge_tags": lambda inp: lookup_knowledge_tags(inp.get("tag")),
    "create_artifact": lambda inp: create_artifact(
        inp["folder"], inp["filename"], inp["markdown"], inp.get("tags")
    ),
}

PROJECT_TOOLS = [
    {
        "name": "search_project",
        "description": (
            "Full-text search (ripgrep) across the whole OZOS project — code, docs, meeting notes, "
            "people data. Returns file paths with line numbers and matching lines. "
            "Prefer read_wiki / lookup_knowledge_tags first for questions about meetings, people, or architecture."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search pattern (regex supported)"},
                "glob": {
                    "type": "string",
                    "description": "Optional file glob, e.g. '*.py' or 'docs/**'",
                },
                "max_results": {"type": "integer", "description": "Cap on results (default 50)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_project_file",
        "description": (
            "Read a file from the OZOS project by repo-relative path. Secret/credential files are blocked. "
            "Use offset/limit to page through large files (limit defaults to 400 lines)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Repo-relative path, e.g. 'docs/learnings.md'",
                },
                "offset": {"type": "integer", "description": "First line to read (0-based)"},
                "limit": {"type": "integer", "description": "Number of lines (default 400)"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "read_wiki",
        "description": (
            "Read the auto-generated knowledge-graph wiki. Without arguments returns the index of "
            "communities; pass a community/article name (as listed in the index, without .md) for its article. "
            "ALWAYS check this first for questions about meetings, people, decisions, or architecture."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "article": {
                    "type": "string",
                    "description": "Article name from the index, e.g. 'Test Pipeline Runner'",
                }
            },
        },
    },
    {
        "name": "lookup_knowledge_tags",
        "description": (
            "Look up documents in the knowledge hub by tag. Without arguments lists all tags; "
            "with a tag returns matching documents (path + title). Use before grepping notes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "tag": {"type": "string", "description": "Tag or substring, e.g. 'ad-stack'"}
            },
        },
    },
    {
        "name": "create_artifact",
        "description": (
            "Create a NEW markdown document in the knowledge hub (the only place you may write). "
            "It appears immediately in the Knowledge Hub page. Never overwrites existing files. "
            "Use for analyses, summaries, PRDs, or any document the user asks you to produce."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "folder": {
                    "type": "string",
                    "description": "Subfolder of knowledge-hub/, e.g. 'analyses' (created if missing)",
                },
                "filename": {"type": "string", "description": "kebab-case name ending in .md"},
                "markdown": {"type": "string", "description": "Full markdown content"},
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional tags written as frontmatter",
                },
            },
            "required": ["folder", "filename", "markdown"],
        },
    },
]
