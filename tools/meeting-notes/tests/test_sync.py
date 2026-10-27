"""
Tests for tools/meeting-notes/sync_gemini_notes.py

Patterns mirror tests/tools/youtube-xray/test_xray_single.py:
- Fake service objects for Drive/Gmail (no real API calls)
- Fake Claude client via injection
- pytest fixtures and monkeypatching
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parents[3] / "tools" / "meeting-notes"))

from sync_gemini_notes import (
    GroupRule,
    PROCESSED_LABEL_NAME,
    Routing,
    TRANSCRIPT_HEADING,
    _to_tag,
    build_frontmatter,
    categorize_note,
    ensure_drive_folders,
    ensure_processed_label,
    export_doc_markdown,
    extract_doc_id,
    parse_speakers,
    split_summary,
    extract_note_metadata,
    get_email_content,
    load_granola_state,
    mark_processed,
    parse_args,
    parse_invited,
    person_folders,
    route_group,
    run_granola_sync,
    run_sync,
    save_granola_state,
    save_note_locally,
    save_note_to_drive,
    search_gemini_notes,
    split_transcript,
)

# Routing used across these tests (the engine ships none; the vault provides it).
SUBFOLDERS = ["Ads", "Widget", "Jordan", "Casey", "Other", "product-leadership-team"]
PLT_RULE = GroupRule(
    "product-leadership-team",
    frozenset({"jordan", "taylor", "casey", "riley", "sasha", "morgan", "quinn", "robin"}),
    3,
)
PERSON_FOLDERS = {"pat.example@examplecorp.com": "Pat Example"}
TEST_ROUTING = Routing(
    folders=list(SUBFOLDERS),
    default_folder="Other",
    person_folders=dict(PERSON_FOLDERS),
    group_rules=[PLT_RULE],
    drive_parent_folder_id="parent-id",
    tagging_guide="",
)

# skills/ holds the shared run-log helper used by the Command Hub.
sys.path.insert(0, str(Path(__file__).parents[3] / "skills"))
import run_log  # noqa: E402
from run_log import read_last_run  # noqa: E402

import sync_gemini_notes  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_runs_dir(tmp_path, monkeypatch):
    """Keep tests hermetic: never write run-logs to the real .ozos/runs.

    Calls that don't pass an explicit runs_dir fall back to this temp dir.
    """
    monkeypatch.setattr(sync_gemini_notes, "RUNS_DIR", tmp_path / "_runs_default")


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_drive_service(existing_folders: dict[str, str] | None = None):
    """
    Build a minimal fake Drive service.
    Pass the returned svc directly to functions — svc.files().list(...).execute() is wired up.
    """
    existing = existing_folders or {}
    files_items = [{"id": v, "name": k} for k, v in existing.items()]

    # list(...).execute() → {"files": [...]}  (no nextPageToken → loop stops)
    list_exec = MagicMock(return_value={"files": files_items})
    list_obj = MagicMock()
    list_obj.execute = list_exec

    # create(...).execute() → {"id": "new-folder-id"}
    create_exec = MagicMock(return_value={"id": "new-folder-id"})
    create_obj = MagicMock()
    create_obj.execute = create_exec

    files_resource = MagicMock()
    files_resource.list = MagicMock(return_value=list_obj)
    files_resource.create = MagicMock(return_value=create_obj)

    svc = MagicMock()
    svc.files = MagicMock(return_value=files_resource)
    return svc, files_resource.create


def _make_gmail_service(labels=None, messages=None):
    """
    Build a minimal fake Gmail service.
    Wires up users().labels().list/create and users().messages().list/modify.
    """
    labels = labels or []
    messages = messages or []

    # ── labels resource ──────────────────────────────────────────────────────
    label_list_obj = MagicMock()
    label_list_obj.execute = MagicMock(return_value={"labels": labels})

    label_create_obj = MagicMock()
    label_create_obj.execute = MagicMock(
        return_value={"id": "new-label-id", "name": PROCESSED_LABEL_NAME}
    )

    labels_resource = MagicMock()
    labels_resource.list = MagicMock(return_value=label_list_obj)
    labels_resource.create = MagicMock(return_value=label_create_obj)

    # ── messages resource ─────────────────────────────────────────────────────
    msg_list_obj = MagicMock()
    msg_list_obj.execute = MagicMock(return_value={"messages": messages})

    msg_modify_obj = MagicMock()
    msg_modify_obj.execute = MagicMock(return_value={})

    messages_resource = MagicMock()
    messages_resource.list = MagicMock(return_value=msg_list_obj)
    messages_resource.modify = MagicMock(return_value=msg_modify_obj)

    # ── users() resource ──────────────────────────────────────────────────────
    users_resource = MagicMock()
    users_resource.labels = MagicMock(return_value=labels_resource)
    users_resource.messages = MagicMock(return_value=messages_resource)

    svc = MagicMock()
    svc.users = MagicMock(return_value=users_resource)
    return svc, labels_resource.create, messages_resource.modify


class _FakeMessage:
    def __init__(self, content):
        self.content = [MagicMock(text=content)]


class _FakeClient:
    def __init__(self, content):
        self._content = content
        self.messages = MagicMock()
        self.messages.create = MagicMock(return_value=_FakeMessage(content))


# ─── Drive tests ──────────────────────────────────────────────────────────────


def test_ensure_drive_folders_creates_missing():
    """All sub-folders missing: should call create for each."""
    svc, create_mock = _make_drive_service(existing_folders={})
    result = ensure_drive_folders(svc, "parent-id", ["Ads", "Widget"])
    assert create_mock.call_count == 2
    assert set(result.keys()) == {"Ads", "Widget"}


def test_ensure_drive_folders_skips_existing():
    """Sub-folders already present: create should not be called."""
    svc, create_mock = _make_drive_service(
        existing_folders={"Ads": "id-ads", "Widget": "id-widget"}
    )
    result = ensure_drive_folders(svc, "parent-id", ["Ads", "Widget"])
    create_mock.assert_not_called()
    assert result["Ads"] == "id-ads"
    assert result["Widget"] == "id-widget"


def test_ensure_drive_folders_partial():
    """Only create the missing ones, keep the existing ones."""
    svc, create_mock = _make_drive_service(existing_folders={"Ads": "id-ads"})
    result = ensure_drive_folders(svc, "parent-id", ["Ads", "Widget"])
    assert create_mock.call_count == 1
    assert result["Ads"] == "id-ads"


# ─── Gmail label tests ────────────────────────────────────────────────────────


def test_ensure_processed_label_creates_when_missing():
    """Label missing: create called, new id returned."""
    svc, label_create_mock, _ = _make_gmail_service(labels=[])
    label_id = ensure_processed_label(svc)
    label_create_mock.assert_called_once()
    assert label_id == "new-label-id"


def test_ensure_processed_label_skips_when_exists():
    """Label already exists: create not called, existing id returned."""
    svc, label_create_mock, _ = _make_gmail_service(
        labels=[{"id": "existing-label-id", "name": PROCESSED_LABEL_NAME}]
    )
    label_id = ensure_processed_label(svc)
    label_create_mock.assert_not_called()
    assert label_id == "existing-label-id"


# ─── Gmail search tests ───────────────────────────────────────────────────────


def test_search_gemini_notes_excludes_processed_by_default():
    """Default search excludes already-processed emails via -label filter."""
    svc, _, _ = _make_gmail_service(messages=[{"id": "msg1"}])
    ids = search_gemini_notes(svc, historical=False)
    call_args = svc.users.return_value.messages.return_value.list.call_args
    q = call_args.kwargs.get("q", "")
    assert f"-label:{PROCESSED_LABEL_NAME}" in q
    assert ids == ["msg1"]


def test_search_gemini_notes_historical_includes_all():
    """Historical search uses the base query without label exclusion."""
    svc, _, _ = _make_gmail_service(messages=[{"id": "msg1"}, {"id": "msg2"}])
    ids = search_gemini_notes(svc, historical=True)
    call_args = svc.users.return_value.messages.return_value.list.call_args
    q = call_args.kwargs.get("q", "")
    assert f"-label:{PROCESSED_LABEL_NAME}" not in q
    assert len(ids) == 2


# ─── Mark processed tests ─────────────────────────────────────────────────────


def test_mark_processed_removes_unread_and_adds_label():
    """modify should remove UNREAD and add the processed label."""
    svc, _, msg_modify_mock = _make_gmail_service()
    mark_processed(svc, "msg-id-123", "label-id-abc")
    msg_modify_mock.assert_called_once_with(
        userId="me",
        id="msg-id-123",
        body={
            "removeLabelIds": ["UNREAD"],
            "addLabelIds": ["label-id-abc"],
        },
    )


# ─── Categorization tests ─────────────────────────────────────────────────────


def test_categorize_note_valid_response():
    """Claude returns a valid subfolder name: use it directly."""
    client = _FakeClient("Widget")
    result = categorize_note("Weekly sync", "Discussed Widget metrics.", SUBFOLDERS, client=client)
    assert result == "Widget"


def test_categorize_note_case_insensitive():
    """Claude returns lowercase version: should still match."""
    client = _FakeClient("widget")
    result = categorize_note("Weekly sync", "Discussed Widget metrics.", SUBFOLDERS, client=client)
    assert result == "Widget"


def test_categorize_note_fallback_on_unknown():
    """Claude returns garbage: fall back to 'Other'."""
    client = _FakeClient("NotARealCategory")
    result = categorize_note("Random subject", "Some body text.", SUBFOLDERS, client=client)
    assert result == "Other"


def test_categorize_note_uses_configured_model(monkeypatch):
    """Categorization must call the shared configured model, not a hardcoded one."""
    monkeypatch.setenv("OZOS_LLM_MODEL", "claude-test-model")
    client = _FakeClient("Widget")
    categorize_note("Weekly sync", "Discussed Widget metrics.", SUBFOLDERS, client=client)
    _, kwargs = client.messages.create.call_args
    assert kwargs["model"] == "claude-test-model"


# ─── Extraction tests ─────────────────────────────────────────────────────────


_VALID_METADATA = {
    "people": [{"name": "Casey", "role": "Manager"}],
    "projects": ["Widget"],
    "topics": ["Q2 planning"],
    "action_items": ["Send recap by Friday"],
    "scope": "1:1",
}


def test_extract_note_metadata_valid_json():
    """Claude returns valid JSON: parsed and returned as dict."""
    import json

    client = _FakeClient(json.dumps(_VALID_METADATA))
    result = extract_note_metadata("Weekly sync", "Discussed Q2.", client)
    assert result["people"] == [{"name": "Casey", "role": "Manager"}]
    assert result["projects"] == ["Widget"]
    assert result["scope"] == "1:1"
    assert result["action_items"] == ["Send recap by Friday"]


def test_extract_note_metadata_json_in_code_fence():
    """Claude wraps JSON in ```json fences: should still parse correctly."""
    import json

    fenced = f"```json\n{json.dumps(_VALID_METADATA)}\n```"
    client = _FakeClient(fenced)
    result = extract_note_metadata("Weekly sync", "Discussed Q2.", client)
    assert result["scope"] == "1:1"


def test_extract_note_metadata_invalid_json_returns_empty():
    """Claude returns garbage: all fields fall back to empty defaults."""
    client = _FakeClient("not json at all")
    result = extract_note_metadata("Subject", "Body", client)
    assert result["people"] == []
    assert result["projects"] == []
    assert result["topics"] == []
    assert result["action_items"] == []
    assert result["scope"] == ""


def test_extract_note_metadata_partial_json_fills_missing_keys():
    """Claude returns JSON missing some keys: missing keys get empty defaults."""
    import json

    client = _FakeClient(json.dumps({"scope": "team sync"}))
    result = extract_note_metadata("Subject", "Body", client)
    assert result["scope"] == "team sync"
    assert result["people"] == []
    assert result["action_items"] == []


# ─── Tag slug tests ───────────────────────────────────────────────────────────


def test_to_tag_spaces_become_hyphens():
    assert _to_tag("Ads Strategy") == "Ads-Strategy"


def test_to_tag_special_chars_removed():
    assert _to_tag("1:1") == "1-1"


def test_to_tag_already_clean():
    assert _to_tag("Widget") == "Widget"


def test_to_tag_multiple_spaces_collapse():
    assert _to_tag("team  sync") == "team-sync"


def test_to_tag_leading_trailing_stripped():
    assert _to_tag("  hello world  ") == "hello-world"


# ─── Frontmatter tests ────────────────────────────────────────────────────────


def test_build_frontmatter_is_valid_yaml():
    """Output should be parseable YAML between --- delimiters."""
    fm = build_frontmatter("2026-04-02", 'Notes: "Casey / Taylor"', "Casey", _VALID_METADATA)
    assert fm.startswith("---\n")
    assert fm.strip().endswith("---")
    inner = fm[4 : fm.rfind("---")].strip()
    parsed = yaml.safe_load(inner)
    assert parsed["date"] == "2026-04-02"
    assert parsed["folder"] == "Casey"
    assert parsed["scope"] == "1:1"
    assert parsed["projects"] == ["Widget"]


def test_build_frontmatter_contains_all_keys():
    """All expected keys are present in the frontmatter."""
    fm = build_frontmatter("2026-04-02", "Subject", "Casey", _VALID_METADATA)
    parsed = yaml.safe_load(fm.split("---")[1])
    for key in (
        "date",
        "subject",
        "folder",
        "scope",
        "tags",
        "people",
        "projects",
        "topics",
        "action_items",
    ):
        assert key in parsed, f"Missing key: {key}"


def test_build_frontmatter_tags_come_from_claude_metadata():
    """tags are taken directly from metadata['tags'] (Claude's nested hierarchy),
    not derived from projects/scope (changed in commit 06fa21a)."""
    metadata = {**_VALID_METADATA, "tags": ["Ads/Strategy", "Widget", "1:1"]}
    fm = build_frontmatter("2026-04-02", "Subject", "Casey", metadata)
    parsed = yaml.safe_load(fm.split("---")[1])
    assert parsed["tags"] == ["Ads/Strategy", "Widget", "1:1"]


def test_build_frontmatter_tags_deduplicated_and_empties_dropped():
    """Duplicate tags collapse (first-seen order preserved) and empty strings drop."""
    metadata = {**_VALID_METADATA, "tags": ["Widget", "", "Widget", "Ads/Strategy"]}
    fm = build_frontmatter("2026-04-02", "Subject", "Casey", metadata)
    parsed = yaml.safe_load(fm.split("---")[1])
    assert parsed["tags"] == ["Widget", "Ads/Strategy"]


def test_build_frontmatter_tags_empty_when_no_tags_key():
    """tags is an empty list when metadata carries no tags."""
    metadata = {k: v for k, v in _VALID_METADATA.items() if k != "tags"}
    fm = build_frontmatter("2026-04-02", "Subject", "Casey", metadata)
    parsed = yaml.safe_load(fm.split("---")[1])
    assert parsed["tags"] == []


def test_build_frontmatter_source_defaults_to_gemini():
    """When no source is passed, frontmatter records source: gemini."""
    fm = build_frontmatter("2026-04-02", "Subject", "Casey", _VALID_METADATA)
    parsed = yaml.safe_load(fm.split("---")[1])
    assert parsed["source"] == "gemini"


def test_build_frontmatter_source_granola():
    """source='granola' is written into the frontmatter."""
    fm = build_frontmatter("2026-04-02", "Subject", "Jordan", _VALID_METADATA, source="granola")
    parsed = yaml.safe_load(fm.split("---")[1])
    assert parsed["source"] == "granola"


# ─── Local save tests ─────────────────────────────────────────────────────────


def test_save_note_locally_creates_file(tmp_path):
    """File is created in the correct subfolder with correct name format."""
    path = save_note_locally(
        subject='Notes: "Casey / Taylor" Apr 2, 2026',
        body="Body text",
        date="Thu, 02 Apr 2026 13:36:59 +0000",
        subfolder="Casey",
        metadata=_VALID_METADATA,
        output_dir=tmp_path,
    )
    assert path.exists()
    assert path.parent.name == "Casey"
    assert path.name.startswith("2026-04-02")
    assert path.suffix == ".md"


def test_save_note_locally_file_has_frontmatter(tmp_path):
    """Written file starts with YAML frontmatter."""
    path = save_note_locally(
        subject="Weekly sync",
        body="Some body",
        date="Thu, 02 Apr 2026 13:36:59 +0000",
        subfolder="Other",
        metadata=_VALID_METADATA,
        output_dir=tmp_path,
    )
    content = path.read_text()
    assert content.startswith("---\n")
    assert "scope:" in content
    assert "action_items:" in content


def test_save_note_locally_file_contains_body(tmp_path):
    """Body text is included after the frontmatter."""
    path = save_note_locally(
        subject="Weekly sync",
        body="Important discussion happened here.",
        date="Thu, 02 Apr 2026 13:36:59 +0000",
        subfolder="Other",
        metadata=_VALID_METADATA,
        output_dir=tmp_path,
    )
    content = path.read_text()
    assert "Important discussion happened here." in content


def test_save_note_locally_records_source_granola(tmp_path):
    """A Granola note carries source: granola in its frontmatter."""
    path = save_note_locally(
        subject="Jordan 1:1",
        body="Discussed roadmap.",
        date="Thu, 02 Apr 2026 13:36:59 +0000",
        subfolder="Jordan",
        metadata=_VALID_METADATA,
        output_dir=tmp_path,
        source="granola",
    )
    parsed = yaml.safe_load(path.read_text().split("---")[1])
    assert parsed["source"] == "granola"


def test_save_note_locally_defaults_source_gemini(tmp_path):
    """Without an explicit source, a note is recorded as source: gemini."""
    path = save_note_locally(
        subject="Weekly sync",
        body="body",
        date="Thu, 02 Apr 2026 13:36:59 +0000",
        subfolder="Other",
        metadata=_VALID_METADATA,
        output_dir=tmp_path,
    )
    parsed = yaml.safe_load(path.read_text().split("---")[1])
    assert parsed["source"] == "gemini"


def test_save_note_locally_strips_illegal_chars_from_filename(tmp_path):
    """Characters illegal in filenames are removed from the subject."""
    path = save_note_locally(
        subject='Notes: "Casey/Taylor" <test>',
        body="body",
        date="Thu, 02 Apr 2026 13:36:59 +0000",
        subfolder="Casey",
        metadata=_VALID_METADATA,
        output_dir=tmp_path,
    )
    for ch in '<>:"/\\|?*':
        assert ch not in path.name


# ─── Granola state tests ──────────────────────────────────────────────────────


def test_load_granola_state_missing_file_returns_default(tmp_path):
    """A missing state file yields empty defaults (no last_scan, no ids)."""
    state = load_granola_state(tmp_path / "does-not-exist.json")
    assert state == {"last_scan": None, "processed_ids": []}


def test_save_then_load_granola_state_roundtrip(tmp_path):
    """State written by save_granola_state is read back identically."""
    state_path = tmp_path / "granola-processed.json"
    save_granola_state(
        state_path, {"last_scan": "2026-06-13T10:00:00", "processed_ids": ["a", "b"]}
    )
    loaded = load_granola_state(state_path)
    assert loaded["last_scan"] == "2026-06-13T10:00:00"
    assert loaded["processed_ids"] == ["a", "b"]


def test_save_granola_state_creates_parent_dir(tmp_path):
    """save_granola_state creates the .ozos parent directory if absent."""
    state_path = tmp_path / "nested" / "granola-processed.json"
    save_granola_state(state_path, {"last_scan": None, "processed_ids": []})
    assert state_path.exists()


# ─── Granola sync tests ───────────────────────────────────────────────────────


def _granola_meeting(mid, title, content="Some discussion.", date="2026-06-10T09:00:00Z"):
    return {"id": mid, "title": title, "content": content, "date": date}


def _all_folder_map():
    return {sf: f"id-{sf.lower()}" for sf in SUBFOLDERS}


def test_run_granola_sync_processes_new_meeting(tmp_path):
    """A new meeting is categorized and saved locally; returns count processed."""
    drive_svc, _ = _make_drive_service(existing_folders={})
    client = _FakeClient("Jordan")
    state_path = tmp_path / "state.json"
    out_dir = tmp_path / "notes"

    count = run_granola_sync(
        [_granola_meeting("m1", "Jordan 1:1")],
        drive_service=drive_svc,
        folder_map=_all_folder_map(),
        state_path=state_path,
        client=client,
        output_dir=out_dir,
        routing=TEST_ROUTING,
    )

    assert count == 1
    saved = list((out_dir / "Jordan").glob("*.md"))
    assert len(saved) == 1


def test_run_granola_sync_routes_to_categorized_folder(tmp_path):
    """A Jordan 1:1 lands in the Jordan/ folder (folder routing via categorize_note)."""
    drive_svc, _ = _make_drive_service(existing_folders={})
    client = _FakeClient("Jordan")
    out_dir = tmp_path / "notes"

    run_granola_sync(
        [_granola_meeting("m1", "Jordan 1:1")],
        drive_service=drive_svc,
        folder_map=_all_folder_map(),
        state_path=tmp_path / "state.json",
        client=client,
        output_dir=out_dir,
        routing=TEST_ROUTING,
    )

    note = next((out_dir / "Jordan").glob("*.md"))
    assert note.parent.name == "Jordan"


def test_run_granola_sync_marks_source_granola(tmp_path):
    """Saved Granola notes carry source: granola in frontmatter."""
    drive_svc, _ = _make_drive_service(existing_folders={})
    client = _FakeClient("Casey")
    out_dir = tmp_path / "notes"

    run_granola_sync(
        [_granola_meeting("m1", "Casey sync")],
        drive_service=drive_svc,
        folder_map=_all_folder_map(),
        state_path=tmp_path / "state.json",
        client=client,
        output_dir=out_dir,
        routing=TEST_ROUTING,
    )

    note = next((out_dir / "Casey").glob("*.md"))
    parsed = yaml.safe_load(note.read_text().split("---")[1])
    assert parsed["source"] == "granola"


def test_run_granola_sync_skips_already_processed(tmp_path):
    """Meetings whose id is already in processed_ids are skipped."""
    drive_svc, _ = _make_drive_service(existing_folders={})
    client = _FakeClient("Other")
    state_path = tmp_path / "state.json"
    save_granola_state(state_path, {"last_scan": "2026-06-01T00:00:00", "processed_ids": ["m1"]})
    out_dir = tmp_path / "notes"

    count = run_granola_sync(
        [_granola_meeting("m1", "Old meeting"), _granola_meeting("m2", "New meeting")],
        drive_service=drive_svc,
        folder_map=_all_folder_map(),
        state_path=state_path,
        client=client,
        output_dir=out_dir,
        routing=TEST_ROUTING,
    )

    assert count == 1  # only m2
    all_notes = list(out_dir.rglob("*.md"))
    assert len(all_notes) == 1


def test_run_granola_sync_updates_state(tmp_path):
    """After a run, processed_ids gains the new id and last_scan is set."""
    drive_svc, _ = _make_drive_service(existing_folders={})
    client = _FakeClient("Other")
    state_path = tmp_path / "state.json"

    run_granola_sync(
        [_granola_meeting("m1", "Meeting")],
        drive_service=drive_svc,
        folder_map=_all_folder_map(),
        state_path=state_path,
        client=client,
        output_dir=tmp_path / "notes",
    )

    state = load_granola_state(state_path)
    assert "m1" in state["processed_ids"]
    assert state["last_scan"] is not None


def test_run_granola_sync_failed_meeting_not_marked_processed(tmp_path):
    """A meeting that fails mid-pipeline is not added to processed_ids (retried next run)."""
    # categorize returns a folder absent from folder_map → KeyError inside the loop.
    drive_svc, _ = _make_drive_service(existing_folders={})
    client = _FakeClient("Jordan")
    state_path = tmp_path / "state.json"

    count = run_granola_sync(
        [_granola_meeting("m1", "Jordan 1:1")],
        drive_service=drive_svc,
        folder_map={},  # no folders → save lookup fails
        state_path=state_path,
        client=client,
        output_dir=tmp_path / "notes",
    )

    assert count == 0
    state = load_granola_state(state_path)
    assert "m1" not in state["processed_ids"]


# ─── CLI arg tests ────────────────────────────────────────────────────────────


def test_parse_args_granola_input():
    """--granola-input captures the path to the fetched-meetings JSON."""
    args = parse_args(["--granola-input", "/tmp/meetings.json"])
    assert args.granola_input == "/tmp/meetings.json"


def test_parse_args_granola_input_defaults_none():
    """Without --granola-input the attribute defaults to None."""
    args = parse_args([])
    assert args.granola_input is None


# ─── Run-log integration ──────────────────────────────────────────────────────


def test_run_granola_sync_writes_run_log(tmp_path):
    """After a Granola sync, a run record is written with count + synced titles."""
    drive_svc, _ = _make_drive_service(existing_folders={})
    client = _FakeClient("Jordan")
    runs = tmp_path / "runs"

    run_granola_sync(
        [_granola_meeting("m1", "Jordan 1:1")],
        drive_service=drive_svc,
        folder_map=_all_folder_map(),
        state_path=tmp_path / "state.json",
        client=client,
        output_dir=tmp_path / "notes",
        runs_dir=runs,
    )

    rec = read_last_run(runs, "meeting-notes")
    assert rec is not None
    assert rec["count"] == 1
    assert "Jordan 1:1" in rec["items"]


def test_run_granola_sync_survives_run_log_failure(tmp_path, monkeypatch):
    """A run-log write failure must not abort the sync."""
    drive_svc, _ = _make_drive_service(existing_folders={})
    client = _FakeClient("Casey")

    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(run_log, "record_run", boom)

    count = run_granola_sync(
        [_granola_meeting("m1", "Casey sync")],
        drive_service=drive_svc,
        folder_map=_all_folder_map(),
        state_path=tmp_path / "state.json",
        client=client,
        output_dir=tmp_path / "notes",
        runs_dir=tmp_path / "runs",
    )

    assert count == 1  # sync still completed despite the run-log failure


def test_run_sync_logs_zero_count_when_no_messages(tmp_path, monkeypatch):
    """A Gmail sync that finds nothing still records a run (count 0) — the whole
    point of the run-log over file-mtime inference."""
    gmail_svc, _, _ = _make_gmail_service(messages=[])
    drive_svc, _ = _make_drive_service(existing_folders={sf: f"id-{sf}" for sf in SUBFOLDERS})

    monkeypatch.setattr("sync_gemini_notes.load_credentials", lambda *a, **k: object())
    monkeypatch.setattr(
        "sync_gemini_notes.build",
        lambda svc, *a, **k: gmail_svc if svc == "gmail" else drive_svc,
    )
    runs = tmp_path / "runs"

    processed = run_sync(historical=False, runs_dir=runs, routing=TEST_ROUTING)

    assert processed == 0
    rec = read_last_run(runs, "meeting-notes")
    assert rec is not None
    assert rec["count"] == 0


# ─── PLT routing tests ────────────────────────────────────────────────────────


def _p(*names):
    return [{"name": n, "role": ""} for n in names]


def test_route_group_true_at_threshold():
    assert route_group(_p("Taylor Lee", "Jordan Park", "Casey Smith"), PLT_RULE) is True


def test_route_group_false_below_threshold():
    assert route_group(_p("Taylor Lee", "Jordan Park", "Random Person"), PLT_RULE) is False


def test_route_group_matches_full_names_case_insensitive():
    assert route_group(_p("MORGAN", "quinn a.", "Riley B"), PLT_RULE) is True


def test_route_group_dedupes_same_person():
    assert route_group(_p("Jordan", "Jordan Park", "Casey"), PLT_RULE) is False  # only 2 distinct


# ─── Frontmatter folders tests ────────────────────────────────────────────────


def _fm(text):
    return yaml.safe_load(text.split("---")[1])


def test_frontmatter_includes_folders_defaulting_to_subfolder():
    fm = _fm(build_frontmatter("2026-06-29", "X", "Jordan", {"tags": ["team-sync"]}))
    assert fm["folders"] == ["Jordan"]


def test_plt_routed_frontmatter():
    meta = {
        "tags": ["team-sync"],
        "people": [{"name": "Jordan"}, {"name": "Taylor"}, {"name": "Casey"}],
    }
    fm = _fm(
        build_frontmatter(
            "2026-06-29",
            "X",
            "product-leadership-team",
            meta,
            extra_tags=["product-leadership-team"],
        )
    )
    assert fm["folder"] == "product-leadership-team"
    assert "product-leadership-team" in fm["folders"]
    assert "product-leadership-team" in fm["tags"]


# ─── IPv4 preference (broken-IPv6 networks) ────────────────────────────────────
# httplib2 (the Google API client transport) has no Happy-Eyeballs fallback, so
# on networks that advertise IPv6 but can't route it, it hangs on the AAAA
# address until timeout and the whole sync fails. We reorder getaddrinfo so IPv4
# is tried first.


def test_ipv4_first_orders_ipv4_before_ipv6():
    import socket
    from sync_gemini_notes import _ipv4_first

    v6 = (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("2001:db8::1", 443, 0, 0))
    v4 = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.2.3.4", 443))

    ordered = _ipv4_first([v6, v4])
    assert ordered[0][0] == socket.AF_INET
    # IPv6 is kept as a fallback, not dropped.
    assert any(r[0] == socket.AF_INET6 for r in ordered)


def test_prefer_ipv4_installs_ipv4_first_getaddrinfo(monkeypatch):
    import socket
    import sync_gemini_notes as sgn

    v6 = (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("2001:db8::1", 443, 0, 0))
    v4 = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.2.3.4", 443))

    # Pretend the resolver returns IPv6 first, and start from an un-patched state.
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [v6, v4])
    monkeypatch.setattr(socket, "_ozos_ipv4_preferred", False, raising=False)

    sgn._prefer_ipv4()
    result = socket.getaddrinfo("host", 443)
    assert result[0][0] == socket.AF_INET


# ─── LLM client request timeout (prevents indefinite hangs) ────────────────────
# The LLM client must carry an explicit per-request timeout + bounded retries so
# one stalled/malformed response fails fast and retries instead of hanging the run.


def test_load_claude_client_sets_request_timeout_and_retries(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    from sync_gemini_notes import (
        load_claude_client,
        LLM_TIMEOUT_SECONDS,
        LLM_MAX_RETRIES,
    )

    client = load_claude_client()
    assert client.timeout == LLM_TIMEOUT_SECONDS
    assert client.max_retries == LLM_MAX_RETRIES
    # A bounded timeout (not the SDK's 600s default) and at least one retry.
    assert 0 < LLM_TIMEOUT_SECONDS <= 120
    assert LLM_MAX_RETRIES >= 1


# ─── Gemini source-doc capture ─────────────────────────────────────────────────
# The Gmail email carries only the summary. The full transcript and the
# authoritative attendee list live in the source "Notes by Gemini" Google Doc,
# whose id appears as a docs.google.com link in the email's text/html part.


_EMAIL_HTML = """
<html><body>
  <a href="https://support.google.com/meet">Help</a>
  <a href="https://docs.google.com/document/d/1AbC-dEf_123/edit?usp=meet">Open meeting notes</a>
  <a href="https://docs.google.com/document/d/1ZzZ-other_999/edit">Another doc</a>
</body></html>
"""


def test_extract_doc_id_finds_gemini_doc():
    assert extract_doc_id(_EMAIL_HTML) == "1AbC-dEf_123"


def test_extract_doc_id_returns_none_when_no_doc_link():
    assert extract_doc_id('<a href="https://example.com">nope</a>') is None


def test_extract_doc_id_returns_none_for_empty_html():
    assert extract_doc_id("") is None


def test_get_email_content_includes_doc_id(monkeypatch):
    """get_email_content surfaces the source doc id alongside subject/body/date."""
    import base64

    def b64(s):
        return base64.urlsafe_b64encode(s.encode()).decode()

    payload = {
        "mimeType": "multipart/alternative",
        "headers": [
            {"name": "Subject", "value": "Notes: “Sync” Apr 2, 2026"},
            {"name": "Date", "value": "Thu, 02 Apr 2026 13:36:59 +0000"},
        ],
        "parts": [
            {"mimeType": "text/plain", "body": {"data": b64("Summary text")}},
            {"mimeType": "text/html", "body": {"data": b64(_EMAIL_HTML)}},
        ],
    }
    svc = MagicMock()
    svc.users.return_value.messages.return_value.get.return_value.execute.return_value = {
        "payload": payload
    }

    content = get_email_content(svc, "msg-1")
    assert content["body"] == "Summary text"
    assert content["doc_id"] == "1AbC-dEf_123"


def test_get_email_content_doc_id_none_when_html_missing():
    import base64

    payload = {
        "mimeType": "text/plain",
        "headers": [{"name": "Subject", "value": "S"}, {"name": "Date", "value": "D"}],
        "body": {"data": base64.urlsafe_b64encode(b"Body").decode()},
    }
    svc = MagicMock()
    svc.users.return_value.messages.return_value.get.return_value.execute.return_value = {
        "payload": payload
    }
    assert get_email_content(svc, "msg-1")["doc_id"] is None


# ─── Doc export ────────────────────────────────────────────────────────────────
# Markdown export (not text/plain) is required: it keeps the mailto: links that
# identify attendees and the strikethrough that marks decliners.


def test_export_doc_markdown_requests_markdown_and_decodes_bytes():
    svc = MagicMock()
    svc.files.return_value.export.return_value.execute.return_value = b"# \xf0\x9f\x93\x9d Notes"
    out = export_doc_markdown(svc, "doc-1")
    assert out == "# 📝 Notes"
    kwargs = svc.files.return_value.export.call_args.kwargs
    assert kwargs["fileId"] == "doc-1"
    assert kwargs["mimeType"] == "text/markdown"


def test_export_doc_markdown_passes_through_str():
    svc = MagicMock()
    svc.files.return_value.export.return_value.execute.return_value = "already text"
    assert export_doc_markdown(svc, "doc-1") == "already text"


# ─── Invited list ──────────────────────────────────────────────────────────────


_DOC_MD = """# 📝 Notes

Jan 21, 2026

## Commercial Stakeholder pt 2

Invited [Pat Example](mailto:pat.example@examplecorp.com) [Taylor Lee](mailto:taylor.lee@examplecorp.com) ~~[Casey Example](mailto:casey.example@partner.example)~~

Attachments [Commercial Stakeholder pt 2](https://www.google.com/calendar/event?eid=abc)

### Summary

Pat Example initiated the meeting.

# 📖 Transcript

Jan 21, 2026

## Commercial Stakeholder pt 2 \\- Transcript

### 00:00:00

**Pat Example:** Right, so the purpose of these calls.

### 00:01:09 {#00:01:09}

**Taylor Lee:** Understood.

### Transcription ended after 00:58:58
"""


def test_parse_invited_returns_name_and_email_for_each_attendee():
    invited = parse_invited(_DOC_MD)
    assert [a["email"] for a in invited] == [
        "pat.example@examplecorp.com",
        "taylor.lee@examplecorp.com",
        "casey.example@partner.example",
    ]
    assert invited[0]["name"] == "Pat Example"
    assert invited[1]["name"] == "Taylor Lee"


def test_parse_invited_marks_struck_through_attendee_as_declined():
    """Gemini renders a decliner's name in strikethrough. They still count as
    invited (per the folder rule) but the decline is recorded."""
    invited = parse_invited(_DOC_MD)
    by_email = {a["email"]: a for a in invited}
    assert by_email["casey.example@partner.example"]["declined"] is True
    assert by_email["pat.example@examplecorp.com"]["declined"] is False


def test_parse_invited_ignores_links_outside_the_invited_line():
    """The Attachments line also holds links — they must not become attendees."""
    emails = [a["email"] for a in parse_invited(_DOC_MD)]
    assert all("@" in e for e in emails)
    assert not any("calendar" in e for e in emails)


def test_parse_invited_returns_empty_when_no_invited_line():
    assert parse_invited("# 📝 Notes\n\n### Summary\n\nNo invite block.") == []


def test_parse_invited_returns_empty_for_empty_doc():
    assert parse_invited("") == []


# ─── Transcript split ──────────────────────────────────────────────────────────


def test_split_transcript_returns_only_the_transcript_half():
    transcript = split_transcript(_DOC_MD)
    assert "**Pat Example:** Right, so the purpose" in transcript
    # The summary half must not leak into the transcript section.
    assert "Pat Example initiated the meeting." not in transcript
    assert "Invited [Pat Example]" not in transcript


def test_split_transcript_strips_pandoc_heading_anchors():
    """`### 00:01:09 {#00:01:09}` would render the brace literally in the Hub."""
    transcript = split_transcript(_DOC_MD)
    assert "{#00:01:09}" not in transcript
    assert "### 00:01:09" in transcript


def test_split_transcript_drops_the_transcript_tab_title_heading():
    """The doc's own '# 📖 Transcript' / '## … - Transcript' headings are replaced
    by our own section heading, so they must not be duplicated in the body."""
    transcript = split_transcript(_DOC_MD)
    assert "# 📖 Transcript" not in transcript
    assert "- Transcript" not in transcript


def test_split_transcript_strips_base64_image_definitions():
    """Markdown export dumps every screen-share frame as a base64 data-URI
    reference definition at the end of the doc, which lands in the transcript half.
    Nothing references them and they were 90% of the corpus by bytes (55MB of 61MB)."""
    doc = _DOC_MD + (
        "\n[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSU" + "A" * 5000 + ">\n"
        "[image2]: <data:image/jpeg;base64," + "B" * 5000 + ">\n"
    )
    transcript = split_transcript(doc)
    assert "base64" not in transcript
    assert "[image1]" not in transcript
    assert "[image2]" not in transcript
    assert len(transcript) < 2000
    # The actual spoken content survives.
    assert "**Pat Example:** Right, so the purpose of these calls." in transcript


def test_split_transcript_keeps_a_normal_markdown_link():
    """Only base64 image definitions are stripped, not ordinary links."""
    doc = _DOC_MD.replace(
        "**Taylor Lee:** Understood.",
        "**Taylor Lee:** See [the doc](https://example.com/x).",
    )
    assert "[the doc](https://example.com/x)" in split_transcript(doc)


def test_split_transcript_returns_empty_when_meeting_was_not_transcribed():
    assert split_transcript("# 📝 Notes\n\n### Summary\n\nShort meeting.") == ""


def test_split_transcript_returns_empty_for_empty_doc():
    assert split_transcript("") == ""


# ─── Person folders ────────────────────────────────────────────────────────────
# A person folder is a virtual Knowledge Hub folder (mode: "labels") driven by the
# note's `folders:` frontmatter. Membership is by invitation, not by speaking.


def test_person_folders_maps_a_configured_attendee_email_to_its_folder():
    assert person_folders(
        [{"name": "Pat Example", "email": "pat.example@examplecorp.com"}], person_map=PERSON_FOLDERS
    ) == ["Pat Example"]


def test_person_folders_includes_a_decliner():
    """Invited counts even when the invite was declined."""
    attendees = [
        {"name": "Pat Example", "email": "pat.example@examplecorp.com", "declined": True},
    ]
    assert person_folders(attendees, person_map=PERSON_FOLDERS) == ["Pat Example"]


def test_person_folders_ignores_unconfigured_people():
    assert (
        person_folders(
            [{"name": "Someone Else", "email": "someone@examplecorp.com"}],
            person_map=PERSON_FOLDERS,
        )
        == []
    )


def test_person_folders_matches_email_case_insensitively():
    assert person_folders(
        [{"name": "OW", "email": "Pat.Example@ExampleCorp.com"}], person_map=PERSON_FOLDERS
    ) == ["Pat Example"]


def test_person_folders_deduplicates():
    attendees = [
        {"name": "Pat Example", "email": "pat.example@examplecorp.com"},
        {"name": "Pat E", "email": "pat.example@examplecorp.com"},
    ]
    assert person_folders(attendees, person_map=PERSON_FOLDERS) == ["Pat Example"]


def test_person_folders_empty_for_no_attendees():
    assert person_folders([], person_map=PERSON_FOLDERS) == []


def test_person_folders_empty_without_a_person_map():
    assert person_folders([{"name": "Pat Example", "email": "pat.example@examplecorp.com"}]) == []


# ─── Transcript speakers as a second attendance source ─────────────────────────
# Some docs carry no "Invited" line at all — a Meet call with no calendar event, or
# an event that hides its guest list (guestsCanSeeGuests: false, as on an
# All-hands that Pat Example both created and ran). Invite-based tagging
# structurally cannot see those, so whoever *spoke* also counts as present.


_TRANSCRIPT_ONLY = """### 00:00:00

**Pat Example:** All right, welcome everyone.
**Lee Brook:** Thanks Oli.

### 00:01:09

**Pat Example:** So the plan for this year.
**Jordan Park:** Sounds good.
"""


def test_parse_speakers_returns_unique_names_in_first_seen_order():
    assert parse_speakers(_TRANSCRIPT_ONLY) == ["Pat Example", "Lee Brook", "Jordan Park"]


def test_parse_speakers_empty_for_empty_transcript():
    assert parse_speakers("") == []


def test_parse_speakers_only_counts_turns_at_the_start_of_a_line():
    """Mid-line bold (`… and **Pat Example:** said`) is quoted prose, not a turn."""
    text = "**Pat Example:** Hello.\nSomeone wrote that **Lee Brook:** disagreed.\n"
    assert parse_speakers(text) == ["Pat Example"]


def test_parse_speakers_handles_a_name_with_diacritics():
    assert parse_speakers("**Taylor Lee:** Understood.") == ["Taylor Lee"]


def test_person_folders_picks_up_a_speaker_who_was_never_invited():
    """The All-hands case: no invite list, but Pat spoke 28 times."""
    assert person_folders([], speakers=["Pat Example", "Lee Brook"], person_map=PERSON_FOLDERS) == [
        "Pat Example"
    ]


def test_person_folders_speaker_match_is_case_insensitive():
    assert person_folders([], speakers=["pat example"], person_map=PERSON_FOLDERS) == [
        "Pat Example"
    ]


def test_person_folders_does_not_match_a_first_name_only_speaker():
    """'Pat' alone could be a different Pat — require the full name."""
    assert person_folders([], speakers=["Pat"], person_map=PERSON_FOLDERS) == []


def test_person_folders_dedupes_across_invitees_and_speakers():
    attendees = [{"name": "Pat Example", "email": "pat.example@examplecorp.com"}]
    assert person_folders(attendees, speakers=["Pat Example"], person_map=PERSON_FOLDERS) == [
        "Pat Example"
    ]


def test_person_folders_speakers_default_to_none():
    """Existing callers that pass only attendees keep working."""
    assert person_folders(
        [{"name": "Pat Example", "email": "pat.example@examplecorp.com"}], person_map=PERSON_FOLDERS
    ) == ["Pat Example"]


def test_person_folders_ignores_unconfigured_speakers():
    assert (
        person_folders([], speakers=["Jordan Park", "Lee Brook"], person_map=PERSON_FOLDERS) == []
    )


# ─── Summary half (docs with no notification email) ────────────────────────────
# A doc whose notes email never arrived (notes not shared with us) has no emailed
# summary to use as the body, so the body must come from the doc's Notes tab.


def test_split_summary_returns_the_notes_half_without_the_transcript():
    summary = split_summary(_DOC_MD)
    assert "Pat Example initiated the meeting." in summary
    assert "**Pat Example:** Right, so the purpose" not in summary


def test_split_summary_drops_the_invited_and_attachments_boilerplate():
    """Attendees are captured in frontmatter; the raw lines add noise to the body."""
    summary = split_summary(_DOC_MD)
    assert "Invited [Pat Example]" not in summary
    assert "mailto:" not in summary
    assert "Attachments [" not in summary


def test_split_summary_strips_pandoc_heading_anchors():
    doc = _DOC_MD.replace("### Summary", "### Summary {#summary}")
    assert "{#summary}" not in split_summary(doc)


def test_split_summary_of_a_doc_with_no_transcript_still_returns_the_summary():
    doc = _DOC_MD.split("# 📖 Transcript")[0]
    assert "Pat Example initiated the meeting." in split_summary(doc)


def test_split_summary_empty_for_empty_doc():
    assert split_summary("") == ""


# ─── Frontmatter: attendees + person folders ───────────────────────────────────


def test_build_frontmatter_records_attendees():
    attendees = [{"name": "Pat Example", "email": "pat.example@examplecorp.com", "declined": False}]
    fm = _fm(build_frontmatter("2026-01-21", "X", "Ads", {"tags": []}, attendees=attendees))
    assert fm["attendees"] == attendees


def test_build_frontmatter_attendees_defaults_to_empty_list():
    fm = _fm(build_frontmatter("2026-01-21", "X", "Ads", {"tags": []}))
    assert fm["attendees"] == []


def test_build_frontmatter_person_folder_joins_folders_and_tags():
    """A note keeps its categorized folder AND gains the person folder."""
    fm = _fm(
        build_frontmatter(
            "2026-01-21", "X", "Ads", {"tags": ["Ads/strategy"]}, extra_tags=["Pat Example"]
        )
    )
    assert fm["folders"] == ["Ads", "Pat Example"]
    assert "Pat Example" in fm["tags"]
    assert "Ads/strategy" in fm["tags"]


# ─── Local save: transcript section ────────────────────────────────────────────


def test_save_note_locally_appends_transcript_section(tmp_path):
    path = save_note_locally(
        subject="Weekly sync",
        body="Summary body",
        date="Thu, 02 Apr 2026 13:36:59 +0000",
        subfolder="Other",
        metadata=_VALID_METADATA,
        output_dir=tmp_path,
        transcript="### 00:00:00\n\n**Taylor Lee:** Hello.",
    )
    content = path.read_text()
    assert "Summary body" in content
    assert TRANSCRIPT_HEADING in content
    assert "**Taylor Lee:** Hello." in content
    # Summary comes first so the note still opens on the summary.
    assert content.index("Summary body") < content.index(TRANSCRIPT_HEADING)


def test_save_note_locally_omits_transcript_section_when_absent(tmp_path):
    path = save_note_locally(
        subject="Weekly sync",
        body="Summary body",
        date="Thu, 02 Apr 2026 13:36:59 +0000",
        subfolder="Other",
        metadata=_VALID_METADATA,
        output_dir=tmp_path,
    )
    assert TRANSCRIPT_HEADING not in path.read_text()


def test_save_note_locally_writes_attendees_to_frontmatter(tmp_path):
    path = save_note_locally(
        subject="Weekly sync",
        body="Summary body",
        date="Thu, 02 Apr 2026 13:36:59 +0000",
        subfolder="Other",
        metadata=_VALID_METADATA,
        output_dir=tmp_path,
        attendees=[
            {"name": "Pat Example", "email": "pat.example@examplecorp.com", "declined": False}
        ],
    )
    parsed = yaml.safe_load(path.read_text().split("---")[1])
    assert parsed["attendees"][0]["email"] == "pat.example@examplecorp.com"


def test_transcript_heading_is_an_h2_so_it_collapses_and_shows_in_the_outline():
    """The Knowledge Hub preview makes H2 sections collapsible and lists only
    H1/H2 in the outline — so the transcript must be an H2, not an H3."""
    assert TRANSCRIPT_HEADING.startswith("## ")


# ─── run_sync wiring ───────────────────────────────────────────────────────────


def _gemini_email_payload(subject="Notes: “Commercial Stakeholder pt 2” Jan 21, 2026"):
    import base64

    def b64(s):
        return base64.urlsafe_b64encode(s.encode()).decode()

    return {
        "mimeType": "multipart/alternative",
        "headers": [
            {"name": "Subject", "value": subject},
            {"name": "Date", "value": "Wed, 21 Jan 2026 16:33:00 +0000"},
        ],
        "parts": [
            {"mimeType": "text/plain", "body": {"data": b64("Summary\nPat Example initiated.")}},
            {
                "mimeType": "text/html",
                "body": {
                    "data": b64(
                        '<a href="https://docs.google.com/document/d/DOC1/edit">Open notes</a>'
                    )
                },
            },
        ],
    }


def _wire_sync_fakes(monkeypatch, tmp_path, doc_md=_DOC_MD, payload=None):
    """Wire fake Gmail/Drive services for a one-message run_sync run."""
    gmail_svc, _, _ = _make_gmail_service(
        labels=[{"id": "lbl", "name": PROCESSED_LABEL_NAME}], messages=[{"id": "msg1"}]
    )
    gmail_svc.users.return_value.messages.return_value.get.return_value.execute.return_value = {
        "payload": payload or _gemini_email_payload()
    }

    drive_svc, _ = _make_drive_service(existing_folders={sf: f"id-{sf}" for sf in SUBFOLDERS})
    drive_svc.files.return_value.export.return_value.execute.return_value = doc_md.encode("utf-8")

    monkeypatch.setattr("sync_gemini_notes.load_credentials", lambda *a, **k: object())
    monkeypatch.setattr(
        "sync_gemini_notes.build",
        lambda svc, *a, **k: gmail_svc if svc == "gmail" else drive_svc,
    )
    monkeypatch.setattr("sync_gemini_notes.LOCAL_NOTES_DIR", tmp_path / "notes")
    return gmail_svc, drive_svc


def _only_saved_note(tmp_path):
    notes = list((tmp_path / "notes").rglob("*.md"))
    assert len(notes) == 1, f"expected 1 note, got {notes}"
    return notes[0]


def test_run_sync_appends_transcript_from_source_doc(tmp_path, monkeypatch):
    """A synced note carries the full transcript, not just the emailed summary."""
    _wire_sync_fakes(monkeypatch, tmp_path)
    run_sync(
        historical=False,
        client=_FakeClient("Ads"),
        runs_dir=tmp_path / "runs",
        output_dir=tmp_path / "notes",
        routing=TEST_ROUTING,
    )

    content = _only_saved_note(tmp_path).read_text()
    assert "Pat Example initiated." in content  # emailed summary still present
    assert TRANSCRIPT_HEADING in content
    assert "**Pat Example:** Right, so the purpose of these calls." in content


def test_run_sync_records_attendees_from_source_doc(tmp_path, monkeypatch):
    _wire_sync_fakes(monkeypatch, tmp_path)
    run_sync(
        historical=False,
        client=_FakeClient("Ads"),
        runs_dir=tmp_path / "runs",
        output_dir=tmp_path / "notes",
        routing=TEST_ROUTING,
    )

    parsed = yaml.safe_load(_only_saved_note(tmp_path).read_text().split("---")[1])
    emails = [a["email"] for a in parsed["attendees"]]
    assert "pat.example@examplecorp.com" in emails
    assert "casey.example@partner.example" in emails  # declined, still invited


def test_run_sync_adds_person_folder_for_invited_attendee(tmp_path, monkeypatch):
    """The note keeps its categorized folder and also joins the person folder."""
    _wire_sync_fakes(monkeypatch, tmp_path)
    run_sync(
        historical=False,
        client=_FakeClient("Ads"),
        runs_dir=tmp_path / "runs",
        output_dir=tmp_path / "notes",
        routing=TEST_ROUTING,
    )

    parsed = yaml.safe_load(_only_saved_note(tmp_path).read_text().split("---")[1])
    assert parsed["folders"] == ["Ads", "Pat Example"]
    assert "Pat Example" in parsed["tags"]


def test_run_sync_no_person_folder_when_attendee_absent(tmp_path, monkeypatch):
    """Absent means absent from BOTH sources — not invited and never spoke."""
    doc_md = _DOC_MD.replace("[Pat Example](mailto:pat.example@examplecorp.com) ", "").replace(
        "**Pat Example:** Right, so the purpose of these calls.",
        "**Lee Brook:** Right, so the purpose of these calls.",
    )
    _wire_sync_fakes(monkeypatch, tmp_path, doc_md=doc_md)
    run_sync(
        historical=False,
        client=_FakeClient("Ads"),
        runs_dir=tmp_path / "runs",
        output_dir=tmp_path / "notes",
        routing=TEST_ROUTING,
    )

    parsed = yaml.safe_load(_only_saved_note(tmp_path).read_text().split("---")[1])
    assert parsed["folders"] == ["Ads"]
    assert "Pat Example" not in parsed["tags"]


def test_run_sync_survives_doc_export_failure(tmp_path, monkeypatch):
    """A Doc that can't be exported must not lose the note — the summary still saves."""
    _, drive_svc = _wire_sync_fakes(monkeypatch, tmp_path)
    drive_svc.files.return_value.export.return_value.execute.side_effect = OSError("403")

    processed = run_sync(
        historical=False,
        client=_FakeClient("Ads"),
        runs_dir=tmp_path / "runs",
        output_dir=tmp_path / "notes",
        routing=TEST_ROUTING,
    )

    assert processed == 1
    content = _only_saved_note(tmp_path).read_text()
    assert "Pat Example initiated." in content
    assert TRANSCRIPT_HEADING not in content


def test_run_sync_handles_email_without_doc_link(tmp_path, monkeypatch):
    """Older notes emails may carry no doc link; the sync degrades to summary-only."""
    import base64

    payload = {
        "mimeType": "text/plain",
        "headers": [
            {"name": "Subject", "value": "Notes: “Old” Jan 1, 2026"},
            {"name": "Date", "value": "Thu, 01 Jan 2026 10:00:00 +0000"},
        ],
        "body": {"data": base64.urlsafe_b64encode(b"Just a summary.").decode()},
    }
    _wire_sync_fakes(monkeypatch, tmp_path, payload=payload)

    processed = run_sync(
        historical=False,
        client=_FakeClient("Ads"),
        runs_dir=tmp_path / "runs",
        output_dir=tmp_path / "notes",
        routing=TEST_ROUTING,
    )

    assert processed == 1
    parsed = yaml.safe_load(_only_saved_note(tmp_path).read_text().split("---")[1])
    assert parsed["attendees"] == []


def test_run_sync_tags_from_transcript_when_doc_has_no_invite_list(tmp_path, monkeypatch):
    """The All-hands shape: no Invited line, but Pat speaks."""
    doc_md = _DOC_MD.replace(
        "Invited [Pat Example](mailto:pat.example@examplecorp.com) "
        "[Taylor Lee](mailto:taylor.lee@examplecorp.com) "
        "~~[Casey Example](mailto:casey.example@partner.example)~~",
        "",
    )
    _wire_sync_fakes(monkeypatch, tmp_path, doc_md=doc_md)
    run_sync(
        historical=False,
        client=_FakeClient("Ads"),
        runs_dir=tmp_path / "runs",
        output_dir=tmp_path / "notes",
        routing=TEST_ROUTING,
    )

    parsed = yaml.safe_load(_only_saved_note(tmp_path).read_text().split("---")[1])
    assert parsed["attendees"] == []  # nothing to parse
    assert "Pat Example" in parsed["folders"]  # but he spoke


def test_run_sync_plt_routing_still_applies_with_person_folder(tmp_path, monkeypatch):
    """PLT routing and the person folder coexist — both land in folders."""
    import json

    _wire_sync_fakes(monkeypatch, tmp_path)
    plt_meta = json.dumps(
        {
            "people": [{"name": "Jordan"}, {"name": "Taylor"}, {"name": "Casey"}],
            "projects": [],
            "topics": [],
            "action_items": [],
            "scope": "team-sync",
            "tags": [],
        }
    )
    # categorize_note() gets the same canned reply; only the folder list matters here.
    run_sync(
        historical=False,
        client=_FakeClient(plt_meta),
        runs_dir=tmp_path / "runs",
        output_dir=tmp_path / "notes",
        routing=TEST_ROUTING,
    )

    parsed = yaml.safe_load(_only_saved_note(tmp_path).read_text().split("---")[1])
    assert parsed["folder"] == "product-leadership-team"
    assert "product-leadership-team" in parsed["folders"]
    assert "Pat Example" in parsed["folders"]
