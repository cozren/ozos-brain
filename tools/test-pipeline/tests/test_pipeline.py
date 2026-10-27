"""
Tests for the test-pipeline runner logic.

These cover the pure functions (parsing pytest output, deriving status,
discovering tools, rendering the board) — the orchestration that shells out
to pytest is exercised separately via an integration smoke test.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from pipeline import (
    ToolResult,
    discover_test_roots,
    discover_tools,
    parse_collected_files,
    parse_pytest_summary,
    render_html,
    render_terminal,
    status_for,
    uncollected_test_files,
)


# --- parse_pytest_summary -------------------------------------------------


def test_parse_all_passed():
    counts = parse_pytest_summary("22 passed in 0.10s")
    assert counts == {"passed": 22, "failed": 0, "errors": 0, "skipped": 0}


def test_parse_failed_and_passed():
    counts = parse_pytest_summary("5 failed, 72 passed in 0.41s")
    assert counts["failed"] == 5
    assert counts["passed"] == 72


def test_parse_collection_error():
    counts = parse_pytest_summary("1 error in 1.43s")
    assert counts["errors"] == 1


def test_parse_with_skipped():
    counts = parse_pytest_summary("3 passed, 2 skipped in 0.05s")
    assert counts["passed"] == 3
    assert counts["skipped"] == 2


def test_parse_no_tests_ran():
    counts = parse_pytest_summary("no tests ran in 0.01s")
    assert counts == {"passed": 0, "failed": 0, "errors": 0, "skipped": 0}


# --- status_for -----------------------------------------------------------


def test_status_pass_when_only_passed():
    assert status_for(ToolResult("x", 5, 0, 0, 0, "")) == "pass"


def test_status_fail_when_any_failed():
    assert status_for(ToolResult("x", 5, 1, 0, 0, "")) == "fail"


def test_status_error_when_any_error():
    assert status_for(ToolResult("x", 0, 0, 1, 0, "")) == "error"


def test_status_no_tests_when_empty():
    assert status_for(ToolResult("x", 0, 0, 0, 0, "")) == "no-tests"


# --- discover_tools -------------------------------------------------------


def test_discover_finds_dirs_with_tests(tmp_path):
    (tmp_path / "alpha" / "tests").mkdir(parents=True)
    (tmp_path / "alpha" / "tests" / "test_a.py").write_text("def test_x(): pass")
    (tmp_path / "beta").mkdir()
    (tmp_path / "beta" / "test_b.py").write_text("def test_y(): pass")
    (tmp_path / "gamma").mkdir()  # no tests
    (tmp_path / "gamma" / "main.py").write_text("x = 1")

    found = {p.name for p in discover_tools(tmp_path)}
    assert found == {"alpha", "beta"}


def test_discover_test_roots_includes_skills_when_it_has_tests(tmp_path):
    """discover_test_roots returns tools/ children plus skills/ when skills has tests."""
    (tmp_path / "tools" / "alpha" / "tests").mkdir(parents=True)
    (tmp_path / "tools" / "alpha" / "tests" / "test_a.py").write_text("def test_x(): pass")
    (tmp_path / "skills" / "tests").mkdir(parents=True)
    (tmp_path / "skills" / "tests" / "test_run_log.py").write_text("def test_y(): pass")

    roots = {p.name for p in discover_test_roots(tmp_path)}
    assert "alpha" in roots
    assert "skills" in roots


def test_discover_test_roots_omits_skills_when_no_tests(tmp_path):
    """skills/ is not included as a root when it contains no test files."""
    (tmp_path / "tools" / "alpha" / "tests").mkdir(parents=True)
    (tmp_path / "tools" / "alpha" / "tests" / "test_a.py").write_text("def test_x(): pass")
    (tmp_path / "skills" / "capture-learning").mkdir(parents=True)

    roots = {p.name for p in discover_test_roots(tmp_path)}
    assert "alpha" in roots
    assert "skills" not in roots


# --- render_html ----------------------------------------------------------


def test_render_html_includes_each_tool_and_status():
    results = [
        ToolResult("alpha", 5, 0, 0, 0, "5 passed"),
        ToolResult("beta", 3, 2, 0, 0, "2 failed, 3 passed"),
    ]
    html = render_html(results)
    assert "alpha" in html
    assert "beta" in html
    assert "<html" in html.lower()
    # the failing tool's status must be visible as a fail state
    assert "fail" in html.lower()


def test_render_terminal_is_plain_string():
    results = [ToolResult("alpha", 5, 0, 0, 0, "5 passed")]
    out = render_terminal(results)
    assert "alpha" in out


# --- collection blind-spot detection --------------------------------------


def test_parse_collected_files_extracts_unique_paths():
    output = (
        "tests/test_a.py::test_one\n"
        "tests/test_a.py::test_two[case1]\n"
        "tests/test_b.py::TestClass::test_three\n"
        "\n"
        "3 tests collected in 0.01s\n"
    )
    assert parse_collected_files(output) == {"tests/test_a.py", "tests/test_b.py"}


def test_parse_collected_files_ignores_noise():
    assert parse_collected_files("no tests ran\nrandom line\n") == set()


def test_uncollected_flags_files_pytest_skipped(tmp_path):
    # Two test files on disk, but pytest only "collected" one of them.
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_seen.py").write_text("def test_x(): pass")
    (tmp_path / "backend").mkdir()
    (tmp_path / "backend" / "test_hidden.py").write_text("def test_y(): pass")

    collected = {"tests/test_seen.py"}
    missing = uncollected_test_files(tmp_path, collected)
    assert missing == ["backend/test_hidden.py"]


def test_uncollected_empty_when_all_collected(tmp_path):
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_seen.py").write_text("def test_x(): pass")
    assert uncollected_test_files(tmp_path, {"tests/test_seen.py"}) == []


def test_discover_test_roots_includes_app_and_connectors(tmp_path):
    for d in [
        "tools/a/tests",
        "app/tests",
        "connectors/c1/tests",
        "connectors/c2/tests",
        "skills/tests",
    ]:
        (tmp_path / d).mkdir(parents=True)
        (tmp_path / d / "test_x.py").write_text("def test_x(): pass\n")
    (tmp_path / "connectors" / "empty").mkdir()
    roots = discover_test_roots(tmp_path)
    assert [r.relative_to(tmp_path).as_posix() for r in roots] == [
        "app",
        "connectors/c1",
        "connectors/c2",
        "skills",
        "tools/a",
    ]
