import sys
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
