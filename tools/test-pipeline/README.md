# test-pipeline

Runs **every tool's test suite in isolation** and renders a pass/fail status board
(terminal + HTML), plus the hook enforcement that keeps the suite honest.

## Why this exists

The per-tool suites are written to run independently (each has its own
`pytest.ini` / `conftest.py` / `sys.path` setup) and **collide when collected
together from the repo root** — one tool's import bug halts collection for all.
So there was no single command that ran everything, which meant failures sat
hidden. This tool runs each tool in its own working directory and aggregates the
results into one board.

## Usage

```bash
# Terminal board
python3 tools/test-pipeline/pipeline.py

# Also write the HTML board + machine-readable JSON
python3 tools/test-pipeline/pipeline.py --html graphify-out/test-pipeline.html --json .ozos/test-pipeline.json
```

Exit code is non-zero if **any** tool has failing/errored tests **or** has test
files that pytest never collected — so it can gate hooks and commits.

> **Interpreter:** always run with system `python3`, not the repo `.venv`. The
> `.venv` is incomplete (missing `feedparser`, `fastapi`, …) and is **not** how
> the apps run — `tools/people-hub/run.sh` launches via bare `uvicorn`/system
> Python. System `python3` has every tool's dependencies; that's where the suite
> is green. The hooks hard-code `python3` for this reason.

## The collection blind-spot guard

A restrictive `testpaths` in a tool's `pytest.ini` can silently hide whole test
directories. (This is exactly how a broken `control_tower` test went unseen:
`tools/people-hub/pytest.ini` said `testpaths = tests`, so the 38 tests under
`backend/tests/` were never run.)

The pipeline now cross-checks the `test_*.py` files **on disk** against the files
pytest actually **collected**, and flags any that are hidden:

```
💥  people-hub   1 error
    ⚠️  NOT COLLECTED: backend/tests/test_control_tower.py  (check pytest.ini testpaths)
```

## Enforcement hooks (`hooks/`)

Two complementary gates — see `hooks/`:

| Hook | When | Behavior |
|------|------|----------|
| **PostToolUse** (`post-edit-tests.sh`) | After Claude edits a `.py` under `tools/` | Runs *that tool's* tests; if red, reports it back into Claude's context. **Non-blocking** — TDD's red phase legitimately fails, so this informs rather than gates. Wired in `.claude/settings.json`. |
| **pre-commit** (`pre-commit.sh`) | Before every `git commit` | Runs the full pipeline. Blocks the commit if anything is red **or** any test file is uncollected. The hard "can't skip tests" gate. Bypass with `git commit --no-verify`. |

Install the pre-commit gate (symlinks into `.git/hooks/`, so script edits take
effect without reinstalling):

```bash
bash tools/test-pipeline/hooks/install.sh
```

## Tests

This tool is itself TDD'd — `tests/test_pipeline.py` covers the pure logic
(summary parsing, status derivation, tool discovery, rendering, and the
collection blind-spot detector).

## Possible next step

The `--json` output is shaped to feed a **Test Pipeline card in the Control Hub**
UI (live pass/fail per tool) — not built yet; build incrementally if wanted.
