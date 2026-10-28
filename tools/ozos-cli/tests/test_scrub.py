import sys

import pytest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cli import main, scrub_check  # noqa: E402


def test_scrub_finds_terms_case_insensitively(tmp_path):
    (tmp_path / "a.py").write_text("x = 'ExampleCorp'\n")
    terms = tmp_path / "t.txt"
    terms.write_text("# c\nexamplecorp\n")
    assert scrub_check(tmp_path, terms) == [(tmp_path / "a.py", 1, "examplecorp")]


def test_scrub_skips_excluded_dirs(tmp_path):
    (tmp_path / "vault").mkdir()
    (tmp_path / "vault" / "n.md").write_text("examplecorp")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "x.js").write_text("examplecorp")
    # plan-execution scratch (gitignored; test logs there carry absolute paths)
    (tmp_path / ".superpowers" / "sdd").mkdir(parents=True)
    (tmp_path / ".superpowers" / "sdd" / "tests.log").write_text("examplecorp")
    terms = tmp_path / "t.txt"
    terms.write_text("examplecorp\n")
    assert scrub_check(tmp_path, terms) == []


def test_scrub_ignores_binary_files(tmp_path):
    (tmp_path / "img.png").write_bytes(b"\x89PNG\x00\xff examplecorp \xfe")
    terms = tmp_path / "t.txt"
    terms.write_text("examplecorp\n")
    assert scrub_check(tmp_path, terms) == []


def test_cli_without_terms_file_warns_and_passes(tmp_path, capsys):
    rc = main(["scrub-check", "--terms", str(tmp_path / "missing.txt"), "--root", str(tmp_path)])
    assert rc == 0
    assert "WARNING" in capsys.readouterr().out


def test_cli_with_hit_fails(tmp_path, capsys):
    (tmp_path / "a.txt").write_text("examplecorp")
    t = tmp_path / "t.txt"
    t.write_text("examplecorp\n")
    assert main(["scrub-check", "--terms", str(t), "--root", str(tmp_path)]) == 1
    assert "a.txt:1: examplecorp" in capsys.readouterr().out


def test_cli_clean_tree_passes(tmp_path, capsys):
    (tmp_path / "a.txt").write_text("nothing to see")
    t = tmp_path / "t.txt"
    t.write_text("examplecorp\n")
    assert main(["scrub-check", "--terms", str(t), "--root", str(tmp_path)]) == 0
    assert "clean" in capsys.readouterr().out


# ── --history: every commit's diff, same term list ──────────────────────────

import subprocess  # noqa: E402

from cli import scrub_history  # noqa: E402


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), "-c", "user.email=t@example.com", "-c", "user.name=t", *args],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def _commit(repo: Path, path: str, text: str, message: str) -> None:
    (repo / path).write_text(text)
    _git(repo, "add", path)
    _git(repo, "commit", "-q", "-m", message)


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "repo"
    r.mkdir()
    _git(r, "init", "-q")
    return r


def test_scrub_history_finds_a_term_removed_from_the_tree(repo, tmp_path):
    _commit(repo, "a.txt", "hello ExampleCorp\n", "add")
    _commit(repo, "a.txt", "hello\n", "remove")
    terms = tmp_path / "t.txt"
    terms.write_text("examplecorp\n")
    assert scrub_check(repo, terms) == []  # the tree is clean…
    hits = scrub_history(repo, terms)  # …but history is not
    assert len(hits) == 2  # the commit that added the line, and the one that removed it
    shas = {sha for sha, _term, _n in hits}
    assert _git(repo, "rev-parse", "--short=12", "HEAD~1") in shas
    assert _git(repo, "rev-parse", "--short=12", "HEAD") in shas
    assert all(term == "examplecorp" and n == 1 for _sha, term, n in hits)


def test_scrub_history_clean_repo(repo, tmp_path):
    _commit(repo, "a.txt", "nothing to see\n", "add")
    terms = tmp_path / "t.txt"
    terms.write_text("examplecorp\n")
    assert scrub_history(repo, terms) == []


def test_scrub_history_not_a_repo(tmp_path):
    terms = tmp_path / "t.txt"
    terms.write_text("examplecorp\n")
    with pytest.raises(RuntimeError):
        scrub_history(tmp_path / "plain", terms)


def test_cli_history_hit_fails(repo, tmp_path, capsys):
    _commit(repo, "a.txt", "ExampleCorp\n", "add")
    _commit(repo, "a.txt", "clean\n", "remove")
    terms = tmp_path / "t.txt"
    terms.write_text("examplecorp\n")
    rc = main(["scrub-check", "--history", "--terms", str(terms), "--root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert _git(repo, "rev-parse", "--short=12", "HEAD~1") in out
    assert "examplecorp" in out and "history rewrite needed" in out


def test_cli_history_clean_passes(repo, tmp_path, capsys):
    _commit(repo, "a.txt", "clean\n", "add")
    terms = tmp_path / "t.txt"
    terms.write_text("examplecorp\n")
    rc = main(["scrub-check", "--history", "--terms", str(terms), "--root", str(repo)])
    assert rc == 0
    assert "history clean" in capsys.readouterr().out


def test_cli_history_not_a_repo_is_a_readable_error(tmp_path, capsys):
    terms = tmp_path / "t.txt"
    terms.write_text("examplecorp\n")
    rc = main(["scrub-check", "--history", "--terms", str(terms), "--root", str(tmp_path)])
    assert rc == 2
    assert "not a git repository" in capsys.readouterr().err


def test_scrub_history_commit_boundaries_survive_nul_bytes_in_diffs(repo, tmp_path):
    # git sniffs the first 8 kB for NUL to call a file binary; a NUL after that is diffed
    # as text (a source file with a literal NUL inside a string does this). The term sits
    # in a later file of the SAME commit, so a splitter that trips on the NUL misreports
    # the commit.
    (repo / "blob.txt").write_bytes(b"a" * 9000 + b"\nids.join('\x00') !== x\n")
    (repo / "z.txt").write_text("ExampleCorp\n")
    _git(repo, "add", "blob.txt", "z.txt")
    _git(repo, "commit", "-q", "-m", "nul and term")
    terms = tmp_path / "t.txt"
    terms.write_text("examplecorp\n")
    hits = scrub_history(repo, terms)
    assert hits == [(_git(repo, "rev-parse", "--short=12", "HEAD"), "examplecorp", 1)]
