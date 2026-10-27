#!/usr/bin/env python3
"""
test-pipeline — run every tool's test suite in isolation and render a board.

Each tool under tools/ is tested in its own working directory (respecting its
own pytest.ini / conftest.py / sys.path hacks), because the suites are written
to run independently and collide when collected together from the repo root.

Usage:
    python3 tools/test-pipeline/pipeline.py            # terminal board
    python3 tools/test-pipeline/pipeline.py --html OUT  # also write HTML board
    python3 tools/test-pipeline/pipeline.py --json OUT  # also write JSON results

Exit code is non-zero if any tool has failing or errored tests, so it can gate
hooks and pre-commit.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TOOLS_DIR = REPO_ROOT / "tools"

# Matches the trailing pytest summary line, e.g. "5 failed, 72 passed in 0.41s"
_COUNT_RE = re.compile(r"(\d+)\s+(passed|failed|error|errors|skipped)")


@dataclass
class ToolResult:
    name: str
    passed: int
    failed: int
    errors: int
    skipped: int
    summary: str
    uncollected: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.passed + self.failed + self.errors + self.skipped


def parse_pytest_summary(output: str) -> dict[str, int]:
    """Parse pytest's summary text into counts. Robust to multi-part lines."""
    counts = {"passed": 0, "failed": 0, "errors": 0, "skipped": 0}
    for num, label in _COUNT_RE.findall(output):
        key = "errors" if label in ("error", "errors") else label
        counts[key] += int(num)
    return counts


def status_for(result: ToolResult) -> str:
    """Reduce a result to a single status string."""
    if result.errors:
        return "error"
    if result.failed:
        return "fail"
    if result.passed:
        return "pass"
    return "no-tests"


def discover_tools(tools_dir: Path) -> list[Path]:
    """Return tool directories (direct children of tools_dir) that contain tests."""
    found = []
    for child in sorted(tools_dir.iterdir()):
        if not child.is_dir():
            continue
        if any(child.rglob("test_*.py")):
            found.append(child)
    return found


def discover_test_roots(repo_root: Path) -> list[Path]:
    """Return every dir whose tests the pipeline should run, sorted by path.

    That's the app/ directory, each connector under connectors/, each tool under
    tools/, plus the shared skills/ directory — each only when it contains tests.
    """
    roots: list[Path] = []
    for single in ("app", "skills"):
        d = repo_root / single
        if d.is_dir() and any(d.rglob("test_*.py")):
            roots.append(d)
    for group in ("connectors", "tools"):
        d = repo_root / group
        if d.is_dir():
            roots.extend(discover_tools(d))
    return sorted(roots, key=lambda r: r.relative_to(repo_root).as_posix())


def parse_collected_files(collect_output: str) -> set[str]:
    """Extract the set of test file paths from `pytest --collect-only -q` output.

    Each collected node id looks like `path/to/test_x.py::test_y[case]`; we keep
    the file portion before the first `::`.
    """
    files = set()
    for line in collect_output.splitlines():
        line = line.strip()
        if "::" in line:
            files.add(line.split("::", 1)[0])
    return files


def uncollected_test_files(tool_dir: Path, collected: set[str]) -> list[str]:
    """Return test files present on disk but NOT collected by pytest.

    This catches the blind spot where a restrictive `testpaths` in pytest.ini
    silently hides whole test directories from the suite.
    """
    on_disk = {
        str(p.relative_to(tool_dir))
        for p in tool_dir.rglob("test_*.py")
        if ".venv" not in p.parts and "node_modules" not in p.parts
    }
    return sorted(on_disk - collected)


def run_tool_tests(tool_dir: Path) -> ToolResult:
    """Run pytest inside a tool dir and capture a structured result."""
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "--no-header"],
        cwd=tool_dir,
        capture_output=True,
        text=True,
    )
    output = proc.stdout + proc.stderr
    # The summary lives on the last non-empty line(s); scan the whole tail.
    counts = parse_pytest_summary(output)
    # Grab a short human summary line for display.
    summary_line = ""
    for line in reversed(output.splitlines()):
        if _COUNT_RE.search(line) or "no tests ran" in line:
            summary_line = line.strip().strip("=").strip()
            break

    # Detect test files that pytest never collected (e.g. restrictive testpaths).
    collect = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q"],
        cwd=tool_dir,
        capture_output=True,
        text=True,
    )
    uncollected = uncollected_test_files(tool_dir, parse_collected_files(collect.stdout))

    return ToolResult(
        name=tool_dir.name,
        passed=counts["passed"],
        failed=counts["failed"],
        errors=counts["errors"],
        skipped=counts["skipped"],
        summary=summary_line or "no tests ran",
        uncollected=uncollected,
    )


# --- rendering ------------------------------------------------------------

_ICON = {"pass": "✅", "fail": "❌", "error": "💥", "no-tests": "⚪"}


def render_terminal(results: list[ToolResult]) -> str:
    lines = []
    name_w = max((len(r.name) for r in results), default=4)
    for r in results:
        st = status_for(r)
        lines.append(f"{_ICON[st]}  {r.name.ljust(name_w)}  {r.summary}")
        for f in r.uncollected:
            lines.append(f"    ⚠️  NOT COLLECTED: {f}  (check pytest.ini testpaths)")
    total_failed = sum(r.failed + r.errors for r in results)
    total_passed = sum(r.passed for r in results)
    total_uncollected = sum(len(r.uncollected) for r in results)
    lines.append("")
    lines.append(f"   {total_passed} passed, {total_failed} failing across {len(results)} tools")
    if total_uncollected:
        lines.append(
            f"   ⚠️  {total_uncollected} test file(s) NOT being collected — hidden from the suite"
        )
    return "\n".join(lines)


def render_html(results: list[ToolResult]) -> str:
    rows = []
    for r in results:
        st = status_for(r)
        summary = r.summary
        if r.uncollected:
            summary += (
                f' <span class="warn">⚠ {len(r.uncollected)} file(s) not collected: '
                f"{', '.join(r.uncollected)}</span>"
            )
        rows.append(
            f'<tr class="{st}"><td class="ico">{_ICON[st]}</td>'
            f'<td class="name">{r.name}</td>'
            f'<td class="status">{st}</td>'
            f'<td class="num pass">{r.passed}</td>'
            f'<td class="num fail">{r.failed + r.errors}</td>'
            f'<td class="num skip">{r.skipped}</td>'
            f'<td class="summary">{summary}</td></tr>'
        )
    total_failed = sum(r.failed + r.errors for r in results)
    total_passed = sum(r.passed for r in results)
    overall = "fail" if total_failed else "pass"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OZOS Test Pipeline</title>
<style>
  :root {{ --bg:#0a0e14; --panel:#0f1620; --cyan:#22d3ee; --green:#34d399;
           --red:#f87171; --amber:#fbbf24; --dim:#5b6b7a; --fg:#cbd5e1; }}
  * {{ box-sizing:border-box; }}
  body {{ background:var(--bg); color:var(--fg); font-family:'Fira Code',ui-monospace,monospace;
          margin:0; padding:2rem; }}
  h1 {{ color:var(--cyan); font-size:1.3rem; letter-spacing:.08em; margin:0 0 .25rem; }}
  .sub {{ color:var(--dim); font-size:.8rem; margin-bottom:1.5rem; }}
  .banner {{ display:inline-block; padding:.4rem 1rem; border-radius:6px; font-weight:700;
             letter-spacing:.1em; margin-bottom:1.5rem; }}
  .banner.pass {{ background:rgba(52,211,153,.12); color:var(--green); border:1px solid var(--green); }}
  .banner.fail {{ background:rgba(248,113,113,.12); color:var(--red); border:1px solid var(--red); }}
  table {{ width:100%; border-collapse:collapse; background:var(--panel); border-radius:10px; overflow:hidden; }}
  th, td {{ text-align:left; padding:.7rem 1rem; border-bottom:1px solid #1c2733; font-size:.85rem; }}
  th {{ color:var(--cyan); text-transform:uppercase; font-size:.7rem; letter-spacing:.1em; }}
  tr:last-child td {{ border-bottom:none; }}
  td.ico {{ width:2rem; }}
  td.name {{ font-weight:600; color:#e2e8f0; }}
  tr.fail td.status, tr.error td.status {{ color:var(--red); }}
  tr.pass td.status {{ color:var(--green); }}
  tr.no-tests td.status {{ color:var(--dim); }}
  .num {{ text-align:right; font-variant-numeric:tabular-nums; }}
  .num.pass {{ color:var(--green); }}
  .num.fail {{ color:var(--red); }}
  .num.skip {{ color:var(--amber); }}
  .summary {{ color:var(--dim); }}
  .warn {{ color:var(--amber); font-weight:600; }}
</style>
</head>
<body>
  <h1>◢ OZOS TEST PIPELINE</h1>
  <div class="sub">{total_passed} passed · {total_failed} failing · {len(results)} tools</div>
  <div class="banner {overall}">{"ALL GREEN" if overall == "pass" else "FAILURES PRESENT"}</div>
  <table>
    <thead><tr><th></th><th>Tool</th><th>Status</th><th>Pass</th><th>Fail</th><th>Skip</th><th>Summary</th></tr></thead>
    <tbody>
      {"".join(rows)}
    </tbody>
  </table>
</body>
</html>"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run all tool test suites and render a board.")
    parser.add_argument("--html", metavar="PATH", help="write an HTML board to PATH")
    parser.add_argument("--json", metavar="PATH", help="write JSON results to PATH")
    parser.add_argument("--quiet", action="store_true", help="suppress the terminal board")
    args = parser.parse_args(argv)

    tools = discover_test_roots(REPO_ROOT)
    results = [run_tool_tests(t) for t in tools]

    if not args.quiet:
        print(render_terminal(results))

    if args.html:
        Path(args.html).write_text(render_html(results), encoding="utf-8")
        if not args.quiet:
            print(f"\n   HTML board → {args.html}")
    if args.json:
        payload = [{**asdict(r), "status": status_for(r)} for r in results]
        Path(args.json).write_text(json.dumps(payload, indent=2), encoding="utf-8")

    failing = sum(r.failed + r.errors for r in results)
    uncollected = sum(len(r.uncollected) for r in results)
    return 1 if (failing or uncollected) else 0


if __name__ == "__main__":
    raise SystemExit(main())
