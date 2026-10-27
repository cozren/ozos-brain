import os

import pytest

from backend.services import project_tools as pt


@pytest.fixture
def fake_repo(tmp_path, monkeypatch):
    (tmp_path / "tools" / "demo").mkdir(parents=True)
    (tmp_path / "tools" / "demo" / "app.py").write_text(
        "def hello():\n    return 'floating chat'\n", encoding="utf-8"
    )
    (tmp_path / ".env").write_text("ANTHROPIC_API_KEY=supersecret\n", encoding="utf-8")
    (tmp_path / "credentials.json").write_text(
        '{"note": "CANARY_SECRET_CONTENT_MARKER"}\n', encoding="utf-8"
    )
    (tmp_path / "innocent.txt").write_text('has a "private_key" inside\n', encoding="utf-8")
    (tmp_path / "config_uppercase.txt").write_text(
        "ACCESS_TOKEN=whatever-value-here\n", encoding="utf-8"
    )
    wiki = tmp_path / "graphify-out" / "wiki"
    wiki.mkdir(parents=True)
    (wiki / "index.md").write_text("# Knowledge Graph Index\n", encoding="utf-8")
    (wiki / "Test Pipeline Runner.md").write_text("pipeline article", encoding="utf-8")
    ozos = tmp_path / ".ozos"
    ozos.mkdir()
    (ozos / "knowledge-tag-index.json").write_text(
        '{"by_tag": {"ad-stack": [{"path": "knowledge-hub/x.md", "title": "X", "date": ""}]}}',
        encoding="utf-8",
    )
    monkeypatch.setattr(pt, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(pt, "VAULT", tmp_path)
    monkeypatch.setattr(pt, "OZOS_CONFIG_DIR", tmp_path / ".ozos")
    return tmp_path


def test_read_project_file_reads_inside_repo(fake_repo):
    result = pt.read_project_file("tools/demo/app.py")
    assert "floating chat" in result["content"]
    assert result["total_lines"] == 2


def test_read_project_file_rejects_traversal(fake_repo):
    result = pt.read_project_file("../outside.txt")
    assert "error" in result


def test_read_project_file_denies_secret_names(fake_repo):
    for name in (".env", "credentials.json"):
        result = pt.read_project_file(name)
        assert "error" in result, name
        assert "secret" in result["error"] or "credentials" in result["error"]


def test_read_project_file_denies_secret_content(fake_repo):
    result = pt.read_project_file("innocent.txt")
    assert "error" in result


def test_read_project_file_denies_secret_content_case_insensitive(fake_repo):
    # Regression test for the case-sensitivity gap: conventional uppercase
    # env-var style (ACCESS_TOKEN=...) must be caught even though the
    # filename ("config_uppercase.txt") doesn't match any SECRET_GLOBS
    # pattern — this only passes if _SECRET_CONTENT_RE is case-insensitive.
    result = pt.read_project_file("config_uppercase.txt")
    assert "error" in result


def test_read_project_file_rejects_symlink_escape(fake_repo, tmp_path):
    outside_dir = tmp_path.parent / "outside_secret_area"
    outside_dir.mkdir(exist_ok=True)
    outside_file = outside_dir / "outside_secret.txt"
    outside_file.write_text("TOP SECRET OUTSIDE CONTENT\n", encoding="utf-8")

    link_path = fake_repo / "escape_link.txt"
    os.symlink(outside_file, link_path)

    result = pt.read_project_file("escape_link.txt")
    assert "error" in result
    assert "content" not in result


def test_read_project_file_offset_limit(fake_repo):
    result = pt.read_project_file("tools/demo/app.py", offset=1, limit=1)
    assert result["content"] == "    return 'floating chat'"


def test_search_project_finds_and_excludes_secrets(fake_repo):
    results = pt.search_project("floating chat")
    assert isinstance(results, list)
    paths = [r["path"] for r in results if "path" in r]
    assert "tools/demo/app.py" in paths
    secret_hits = pt.search_project("supersecret")
    assert all(".env" not in r.get("path", "") for r in secret_hits)


def test_search_project_excludes_secret_glob_content_no_override(fake_repo):
    # Non-vacuous: credentials.json is not hidden by ripgrep's default
    # hidden-file skip (unlike .env), so this only passes if the code's own
    # SECRET_GLOBS exclusion for "credentials.json" is actually working.
    results = pt.search_project("CANARY_SECRET_CONTENT_MARKER")
    paths = [r.get("path", "") for r in results]
    assert not any("credentials.json" in p for p in paths)
    assert all("info" in r or "credentials.json" not in r.get("path", "") for r in results)


def test_search_project_glob_override_cannot_bypass_secret_exclusion(fake_repo):
    # Regression test for the glob-exclusion bypass: previously the
    # caller-supplied glob was appended AFTER the SECRET_GLOBS excludes, so
    # ripgrep's last-pattern-wins glob semantics let glob=".env*" (or
    # "*.json") re-include and leak secret file content. Confirm that no
    # longer works, with two different override attempts.
    for bypass_glob in (".env*", "*.json"):
        results = pt.search_project("CANARY_SECRET_CONTENT_MARKER", glob=bypass_glob)
        paths = [r.get("path", "") for r in results]
        assert not any("credentials.json" in p for p in paths), bypass_glob
        assert not any(".env" in p for p in paths), bypass_glob


def test_read_wiki_index_and_article(fake_repo):
    assert "Knowledge Graph Index" in pt.read_wiki()["content"]
    assert pt.read_wiki("Test Pipeline Runner")["content"] == "pipeline article"
    assert "error" in pt.read_wiki("../../secrets")


def test_lookup_knowledge_tags(fake_repo):
    assert pt.lookup_knowledge_tags() == {"tags": ["ad-stack"]}
    assert pt.lookup_knowledge_tags("AD-STACK")["matches"]["ad-stack"][0]["title"] == "X"
    assert "info" in pt.lookup_knowledge_tags("nope")


def test_schemas_and_executors_registered():
    names = {t["name"] for t in pt.PROJECT_TOOLS}
    assert {"search_project", "read_project_file", "read_wiki", "lookup_knowledge_tags"} <= names
    assert set(pt.PROJECT_TOOL_EXECUTORS) >= names


@pytest.fixture
def fake_hub(fake_repo, monkeypatch):
    hub = fake_repo / "knowledge-hub"
    hub.mkdir()
    monkeypatch.setattr(pt, "KNOWLEDGE_HUB_DIR", hub)
    return hub


def test_create_artifact_writes_markdown(fake_hub):
    result = pt.create_artifact("analyses", "my-note.md", "# Hello\n")
    assert result == {"created": "knowledge-hub/analyses/my-note.md"}
    assert (fake_hub / "analyses" / "my-note.md").read_text(encoding="utf-8") == "# Hello\n"


def test_create_artifact_adds_tag_frontmatter(fake_hub):
    pt.create_artifact("analyses", "tagged.md", "body", tags=["ad-stack", "chat"])
    text = (fake_hub / "analyses" / "tagged.md").read_text(encoding="utf-8")
    # Written via the shared join_frontmatter() serializer (yaml.dump), not
    # hand-rolled string concatenation — block-style list, not flow-style.
    assert text == "---\ntags:\n- ad-stack\n- chat\n---\n\nbody"


def test_create_artifact_rejects_escape_and_bad_names(fake_hub):
    assert "error" in pt.create_artifact("../docs", "x.md", "boom")
    assert "error" in pt.create_artifact("a", "No Spaces.md", "boom")
    assert "error" in pt.create_artifact("a", "note.txt", "boom")


def test_create_artifact_never_overwrites(fake_hub):
    assert "created" in pt.create_artifact("a", "note.md", "one")
    result = pt.create_artifact("a", "note.md", "two")
    assert "error" in result
    assert (fake_hub / "a" / "note.md").read_text(encoding="utf-8") == "one"


def test_create_artifact_registered():
    assert "create_artifact" in {t["name"] for t in pt.PROJECT_TOOLS}
    assert "create_artifact" in pt.PROJECT_TOOL_EXECUTORS


def test_create_artifact_tag_with_frontmatter_fence_does_not_break_parser(fake_hub):
    # Regression test: with the old hand-rolled
    # "---\ntags: [" + ", ".join(tags) + "]\n---\n\n" concatenation, a tag of
    # "---" produced a frontmatter YAML block that failed to parse — and
    # tag_index.build_tag_index() calls split_frontmatter() on every markdown
    # file with NO exception handling, so a single artifact with this tag
    # would crash the whole tag-index rebuild. Prove the file round-trips
    # cleanly through the real parser instead of just checking it was written.
    from backend.services.frontmatter import split_frontmatter

    pt.create_artifact("analyses", "danger.md", "# real body\n", tags=["a", "---"])
    text = (fake_hub / "analyses" / "danger.md").read_text(encoding="utf-8")

    meta, body = split_frontmatter(text)  # must not raise
    assert meta == {"tags": ["a", "---"]}
    assert body == "# real body\n"


def test_create_artifact_tag_cannot_inject_content_ahead_of_markdown(fake_hub):
    # Regression test: a crafted tag containing "]\n---\n\n" used to close the
    # fake frontmatter block early and smuggle attacker-controlled text into
    # the document body ahead of the real `markdown` argument — silent
    # content injection later served verbatim by read_wiki/search_project/
    # read_project_file. With the real YAML serializer the tag is just a
    # scalar string value; it cannot terminate the block early.
    from backend.services.frontmatter import split_frontmatter

    evil_tag = "b]\n---\n\n# fake\n\ninjected"
    real_markdown = "# real body\n\nthe actual content"
    pt.create_artifact("analyses", "injection.md", real_markdown, tags=[evil_tag])
    text = (fake_hub / "analyses" / "injection.md").read_text(encoding="utf-8")

    meta, body = split_frontmatter(text)  # must not raise
    assert meta == {"tags": [evil_tag]}
    # The real markdown body appears exactly as given — no injected content
    # ahead of it, and no injected content anywhere in the parsed body.
    assert body == real_markdown
    assert "injected" not in body
    assert "# fake" not in body


def test_create_artifact_exclusive_create_rejects_second_call_same_thread(fake_hub):
    # Regression test for the write-side TOCTOU: the old implementation did
    # `target.exists()` then a separate `write_text()` call — two
    # near-simultaneous calls to the same folder+filename could both pass the
    # check and the second would silently clobber the first. The new
    # implementation uses `target.open("x", ...)` (O_EXCL) so the OS itself
    # enforces atomicity. A same-thread double-call is sufficient to prove
    # the second call now returns an error and the first file is untouched —
    # this is the same guarantee test_create_artifact_never_overwrites checks
    # at the API level, confirmed still green under the new implementation.
    assert "created" in pt.create_artifact("a", "note.md", "one")
    result = pt.create_artifact("a", "note.md", "two")
    assert "error" in result
    assert "already exists" in result["error"]
    assert (fake_hub / "a" / "note.md").read_text(encoding="utf-8") == "one"


def test_create_artifact_rejects_filename_with_trailing_newline(fake_hub):
    # Regression test: Python's `$` anchor matches "end of string OR just
    # before a trailing \n", not strict end-of-string, so
    # _ARTIFACT_FILENAME_RE.match("my-note.md\n") used to return a match. A
    # newline is a legal POSIX filename character, so this could create a
    # file literally named "my-note.md\n" on disk. The regex now uses \Z,
    # which only matches strict end-of-string.
    result = pt.create_artifact("a", "my-note.md\n", "boom")
    assert "error" in result
    assert not (fake_hub / "a" / "my-note.md\n").exists()
    assert not (fake_hub / "a" / "my-note.md").exists()
