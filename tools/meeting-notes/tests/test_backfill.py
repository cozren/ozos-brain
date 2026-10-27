"""
Tests for tools/meeting-notes/backfill_transcripts.py

The backfill re-reads each note's source "Notes by Gemini" doc and merges two
things into the existing local .md: the invite list (as `attendees`, plus any
person-folder labels) and the full transcript. It must be idempotent — the whole
corpus gets re-run whenever a person folder is added — and it must never drop
information that is already in the note.

knowledge-hub/ is gitignored, so a bad merge here has no git undo. These tests
are the safety net.
"""

import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parents[3] / "tools" / "meeting-notes"))

from sync_gemini_notes import TRANSCRIPT_HEADING, GroupRule, Routing  # noqa: E402
from backfill_transcripts import (  # noqa: E402
    BackfillAborted,
    build_subject_index,
    import_note_from_doc,
    merge_doc_into_note,
    parse_doc_header,
    run_backfill,
    split_note,
)


TEST_ROUTING = Routing(
    folders=["Ads", "Widget", "Other", "product-leadership-team"],
    default_folder="Other",
    person_folders={"pat.example@examplecorp.com": "Pat Example"},
    group_rules=[GroupRule("product-leadership-team", frozenset({"jordan", "taylor", "casey"}), 3)],
    drive_parent_folder_id=None,
    tagging_guide="",
)


# ─── Fixtures ──────────────────────────────────────────────────────────────────

_DOC_MD = """# 📝 Notes

Jan 21, 2026

## Commercial Stakeholder pt 2

Invited [Pat Example](mailto:pat.example@examplecorp.com) [Taylor Lee](mailto:taylor.lee@examplecorp.com)

### Summary

Pat Example initiated the meeting.

# 📖 Transcript

## Commercial Stakeholder pt 2 \\- Transcript

### 00:00:00

**Pat Example:** Right, so the purpose of these calls.

### Transcription ended after 00:58:58
"""

# Pat absent from BOTH attendance sources: not invited AND never spoke.
# Removing him from only the invite line is not enough now that transcript
# speakers also confer a person folder.
_DOC_MD_NO_PAT = _DOC_MD.replace("[Pat Example](mailto:pat.example@examplecorp.com) ", "").replace(
    "**Pat Example:** Right, so the purpose of these calls.",
    "**Lee Brook:** Right, so the purpose of these calls.",
)

_DOC_MD_NO_TRANSCRIPT = _DOC_MD.split("# 📖 Transcript")[0]


def _note(meta: dict, body: str = "Summary body text.") -> str:
    fm = yaml.dump(meta, allow_unicode=True, sort_keys=False)
    return f"---\n{fm}---\n\n# Notes: “X”\n\n**Date:** Wed, 21 Jan 2026\n\n---\n\n{body}"


# The pre-existing shape of 125 of the 200 notes: no `folders`, no `source`.
_LEGACY_META = {
    "date": "2026-01-21",
    "subject": "Notes: “Commercial Stakeholder pt 2” Jan 21, 2026",
    "folder": "Ads",
    "scope": "external",
    "tags": ["Ads/strategy", "Senior-Stakeholders/Pat-Example"],
    "people": [{"name": "Pat Example", "role": "meeting initiator"}],
    "projects": ["DMP"],
    "topics": ["digital display"],
    "action_items": ["Send the deck"],
}

# The newer shape: explicit `folders`.
_MODERN_META = {
    **_LEGACY_META,
    "source": "gemini",
    "folders": ["Ads"],
}


def _meta_of(text: str) -> dict:
    return yaml.safe_load(split_note(text)[0])


def _body_of(text: str) -> str:
    return split_note(text)[1]


# ─── split_note ────────────────────────────────────────────────────────────────


def test_split_note_separates_frontmatter_from_body():
    text = _note(_MODERN_META, body="The body.")
    fm_text, body = split_note(text)
    assert yaml.safe_load(fm_text)["folder"] == "Ads"
    assert "The body." in body
    assert "date:" not in body


def test_split_note_returns_none_frontmatter_when_absent():
    fm_text, body = split_note("# Just a heading\n\nNo frontmatter here.")
    assert fm_text is None
    assert body == "# Just a heading\n\nNo frontmatter here."


# ─── Attendees ─────────────────────────────────────────────────────────────────


def test_merge_writes_attendees_from_the_invite_list():
    out = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    attendees = _meta_of(out)["attendees"]
    assert [a["email"] for a in attendees] == [
        "pat.example@examplecorp.com",
        "taylor.lee@examplecorp.com",
    ]


def test_merge_places_attendees_after_folders():
    """Keeps the key order build_frontmatter produces, so synced and backfilled
    notes look identical."""
    out = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    keys = list(_meta_of(out).keys())
    assert keys.index("attendees") == keys.index("folders") + 1


def test_merge_places_attendees_after_a_newly_created_folders_key():
    """A legacy note gets `folders` written for the first time; `attendees` must
    still land right after it, so every note ends up with the same key order."""
    out = merge_doc_into_note(
        _note(_LEGACY_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    keys = list(_meta_of(out).keys())
    assert keys.index("attendees") == keys.index("folders") + 1


def test_merge_sets_empty_attendees_when_doc_has_no_invite_line():
    out = merge_doc_into_note(
        _note(_MODERN_META), "# 📝 Notes\n\n### Summary\n\nNothing.", routing=TEST_ROUTING
    )
    assert _meta_of(out)["attendees"] == []


# ─── Person folders ────────────────────────────────────────────────────────────


def test_merge_adds_person_folder_and_tag():
    out = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    meta = _meta_of(out)
    assert meta["folders"] == ["Ads", "Pat Example"]
    assert "Pat Example" in meta["tags"]


def test_merge_seeds_folders_from_folder_field_for_a_legacy_note():
    """A note with no `folders` key renders under its physical directory via the
    _doc_folders fallback. Writing `folders` switches that fallback off, so the
    original folder MUST be seeded in — otherwise the note silently leaves Ads/."""
    out = merge_doc_into_note(
        _note(_LEGACY_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    assert _meta_of(out)["folders"] == ["Ads", "Pat Example"]


def test_merge_seeds_folders_from_physical_folder_when_folder_field_missing():
    meta = {k: v for k, v in _LEGACY_META.items() if k != "folder"}
    out = merge_doc_into_note(_note(meta), _DOC_MD, physical_folder="Widget", routing=TEST_ROUTING)
    assert _meta_of(out)["folders"] == ["Widget", "Pat Example"]


def test_merge_preserves_existing_extra_folders():
    meta = {**_MODERN_META, "folders": ["Ads", "product-leadership-team"]}
    out = merge_doc_into_note(_note(meta), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING)
    assert _meta_of(out)["folders"] == ["Ads", "product-leadership-team", "Pat Example"]


def test_merge_does_not_duplicate_an_already_present_person_folder():
    meta = {**_MODERN_META, "folders": ["Ads", "Pat Example"], "tags": ["Pat Example"]}
    out = merge_doc_into_note(_note(meta), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING)
    assert _meta_of(out)["folders"] == ["Ads", "Pat Example"]
    assert _meta_of(out)["tags"].count("Pat Example") == 1


def test_merge_adds_no_person_folder_when_person_was_not_invited():
    """Absent from BOTH sources — not invited and never spoke."""
    out = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD_NO_PAT, physical_folder="Ads", routing=TEST_ROUTING
    )
    meta = _meta_of(out)
    assert meta["folders"] == ["Ads"]
    assert "Pat Example" not in meta["tags"]


def test_merge_tags_a_speaker_when_the_doc_has_no_invite_list():
    """The All-hands shape: no Invited line, but Pat spoke."""
    doc = _DOC_MD.replace(
        "Invited [Pat Example](mailto:pat.example@examplecorp.com) "
        "[Taylor Lee](mailto:taylor.lee@examplecorp.com)",
        "",
    )
    out = merge_doc_into_note(
        _note(_MODERN_META), doc, physical_folder="Other", routing=TEST_ROUTING
    )
    meta = _meta_of(out)
    assert meta["attendees"] == []
    assert "Pat Example" in meta["folders"]
    assert "Pat Example" in meta["tags"]


def test_merge_leaves_a_legacy_note_without_folders_when_nothing_to_add():
    """No person folder and no pre-existing `folders` key → don't write one, so
    the physical-directory fallback keeps working untouched."""
    out = merge_doc_into_note(
        _note(_LEGACY_META), _DOC_MD_NO_PAT, physical_folder="Ads", routing=TEST_ROUTING
    )
    assert "folders" not in _meta_of(out)


# ─── Transcript ────────────────────────────────────────────────────────────────


def test_merge_appends_the_transcript_under_its_heading():
    out = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    assert TRANSCRIPT_HEADING in out
    assert "**Pat Example:** Right, so the purpose of these calls." in out


def test_merge_keeps_the_summary_above_the_transcript():
    out = merge_doc_into_note(
        _note(_MODERN_META, body="EMAILED SUMMARY"), _DOC_MD, physical_folder="Ads"
    )
    assert "EMAILED SUMMARY" in out
    assert out.index("EMAILED SUMMARY") < out.index(TRANSCRIPT_HEADING)


def test_merge_adds_no_transcript_section_when_meeting_was_not_transcribed():
    out = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD_NO_TRANSCRIPT, physical_folder="Ads", routing=TEST_ROUTING
    )
    assert TRANSCRIPT_HEADING not in out
    assert _meta_of(out)["attendees"] != []  # attendees still captured


def test_merge_replaces_a_stale_transcript_instead_of_appending_a_second_one():
    first = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    updated_doc = _DOC_MD.replace("Right, so the purpose of these calls.", "REVISED LINE.")
    second = merge_doc_into_note(first, updated_doc, physical_folder="Ads", routing=TEST_ROUTING)
    assert second.count(TRANSCRIPT_HEADING) == 1
    assert "REVISED LINE." in second
    assert "Right, so the purpose of these calls." not in second


def test_merge_drops_a_stale_transcript_when_the_doc_no_longer_has_one():
    first = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    second = merge_doc_into_note(
        first, _DOC_MD_NO_TRANSCRIPT, physical_folder="Ads", routing=TEST_ROUTING
    )
    assert TRANSCRIPT_HEADING not in second
    assert "**Pat Example:** Right" not in second


# ─── Idempotency & preservation ────────────────────────────────────────────────


def test_merge_is_idempotent():
    once = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    twice = merge_doc_into_note(once, _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING)
    assert once == twice


def test_merge_is_idempotent_for_a_legacy_note():
    once = merge_doc_into_note(
        _note(_LEGACY_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    twice = merge_doc_into_note(once, _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING)
    assert once == twice


def test_merge_preserves_every_other_frontmatter_field():
    meta = {**_MODERN_META, "links": [{"to": "docs/x.md"}]}
    out = merge_doc_into_note(_note(meta), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING)
    merged = _meta_of(out)
    for key in ("date", "subject", "folder", "source", "scope", "people", "projects", "topics"):
        assert merged[key] == meta[key], f"{key} changed"
    assert merged["links"] == [{"to": "docs/x.md"}]
    assert merged["action_items"] == ["Send the deck"]


def test_merge_preserves_pre_existing_tags():
    out = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    tags = _meta_of(out)["tags"]
    assert "Ads/strategy" in tags
    assert "Senior-Stakeholders/Pat-Example" in tags


def test_merge_returns_note_unchanged_when_it_has_no_frontmatter():
    text = "# Loose note\n\nNo frontmatter, nothing to merge into."
    assert merge_doc_into_note(text, _DOC_MD, physical_folder="Ads") == text


def test_merge_body_keeps_the_note_heading_and_date_line():
    out = merge_doc_into_note(
        _note(_MODERN_META), _DOC_MD, physical_folder="Ads", routing=TEST_ROUTING
    )
    body = _body_of(out)
    assert "# Notes: “X”" in body
    assert "**Date:** Wed, 21 Jan 2026" in body


@pytest.mark.parametrize("doc", [_DOC_MD, _DOC_MD_NO_TRANSCRIPT, _DOC_MD_NO_PAT, ""])
def test_merge_always_returns_parseable_frontmatter(doc):
    out = merge_doc_into_note(_note(_MODERN_META), doc, physical_folder="Ads", routing=TEST_ROUTING)
    assert out.startswith("---\n")
    assert isinstance(_meta_of(out), dict)


# ─── Abort instead of silently reporting "nothing matched" ─────────────────────
# A network drop mid-run made build_subject_index swallow every per-message error
# and return {}, so run_backfill reported all 195 notes as "No matching email" —
# a total failure that reads exactly like a clean no-op run.


class _FakeGmail:
    """Gmail stub whose message fetches all fail, as during a network outage."""

    def __init__(self, msg_ids, fail=True):
        self._ids = msg_ids
        self._fail = fail

    def users(self):
        return self

    def messages(self):
        return self

    def list(self, **kwargs):
        return self

    def execute(self):
        return {"messages": [{"id": i} for i in self._ids]}


def test_build_subject_index_aborts_when_every_message_fetch_fails(monkeypatch):
    import backfill_transcripts as bt

    monkeypatch.setattr(bt, "search_gemini_notes", lambda svc, historical=True: ["m1", "m2", "m3"])

    def boom(svc, msg_id):
        raise OSError("Unable to find the server at www.googleapis.com")

    monkeypatch.setattr(bt, "get_email_content", boom)

    with pytest.raises(BackfillAborted, match="0/3"):
        build_subject_index(_FakeGmail(["m1", "m2", "m3"]))


def test_build_subject_index_tolerates_a_few_failures(monkeypatch):
    """One bad message out of many is not an outage — keep going."""
    import backfill_transcripts as bt

    ids = [f"m{i}" for i in range(10)]
    monkeypatch.setattr(bt, "search_gemini_notes", lambda svc, historical=True: ids)

    def sometimes(svc, msg_id):
        if msg_id == "m3":
            raise OSError("transient")
        return {"subject": f"Notes: {msg_id}", "doc_id": f"doc-{msg_id}"}

    monkeypatch.setattr(bt, "get_email_content", sometimes)

    index = build_subject_index(_FakeGmail(ids))
    assert len(index) == 9
    assert index["Notes: m0"] == "doc-m0"


def test_run_backfill_aborts_rather_than_marking_everything_unmatched(monkeypatch, tmp_path):
    """The guard must reach run_backfill, so a dead network can never be mistaken
    for 'no notes needed updating'."""
    import backfill_transcripts as bt

    note = tmp_path / "Ads" / "2026-01-21 — x.md"
    note.parent.mkdir(parents=True)
    original = _note(_MODERN_META)
    note.write_text(original)

    monkeypatch.setattr(bt, "search_gemini_notes", lambda svc, historical=True: ["m1"])
    monkeypatch.setattr(
        bt, "get_email_content", lambda svc, msg_id: (_ for _ in ()).throw(OSError("network"))
    )

    with pytest.raises(BackfillAborted):
        run_backfill(
            notes_dir=tmp_path,
            gmail_service=_FakeGmail(["m1"]),
            drive_service=object(),
            routing=TEST_ROUTING,
        )

    assert note.read_text() == original  # nothing touched


# ─── --only filter (retrying individual notes) ─────────────────────────────────


def _wire_backfill(monkeypatch, subject, doc_md=_DOC_MD):
    """Index one subject → one doc, and a Drive stub that returns doc_md."""
    import backfill_transcripts as bt

    monkeypatch.setattr(bt, "search_gemini_notes", lambda svc, historical=True: ["m1"])
    monkeypatch.setattr(
        bt, "get_email_content", lambda svc, msg_id: {"subject": subject, "doc_id": "doc-1"}
    )
    monkeypatch.setattr(bt, "export_doc_markdown", lambda svc, doc_id: doc_md)


def test_run_backfill_only_processes_matching_filenames(monkeypatch, tmp_path):
    subject = _MODERN_META["subject"]
    _wire_backfill(monkeypatch, subject)

    ads = tmp_path / "Ads"
    ads.mkdir()
    target = ads / "2026-05-15 — Notes “Widget Migration Team Daily” May 15, 2026.md"
    other = ads / "2026-05-19 — Notes “Widget Migration Team Daily” May 19, 2026.md"
    for path in (target, other):
        path.write_text(_note(_MODERN_META))

    report = run_backfill(
        notes_dir=tmp_path,
        gmail_service=_FakeGmail(["m1"]),
        drive_service=object(),
        only="May 15",
        routing=TEST_ROUTING,
    )

    assert report["updated"] == [target.name]
    assert TRANSCRIPT_HEADING in target.read_text()
    assert TRANSCRIPT_HEADING not in other.read_text()  # untouched


def test_run_backfill_only_is_case_insensitive(monkeypatch, tmp_path):
    subject = _MODERN_META["subject"]
    _wire_backfill(monkeypatch, subject)
    ads = tmp_path / "Ads"
    ads.mkdir()
    target = ads / "2026-05-15 — Notes “Widget Migration TEAM Daily” May 15, 2026.md"
    target.write_text(_note(_MODERN_META))

    report = run_backfill(
        notes_dir=tmp_path,
        gmail_service=_FakeGmail(["m1"]),
        drive_service=object(),
        only="team daily",
        routing=TEST_ROUTING,
    )
    assert report["updated"] == [target.name]


def test_run_backfill_without_only_processes_everything(monkeypatch, tmp_path):
    subject = _MODERN_META["subject"]
    _wire_backfill(monkeypatch, subject)
    ads = tmp_path / "Ads"
    ads.mkdir()
    for name in ("2026-05-15 — a.md", "2026-05-19 — b.md"):
        (ads / name).write_text(_note(_MODERN_META))

    report = run_backfill(
        notes_dir=tmp_path,
        gmail_service=_FakeGmail(["m1"]),
        drive_service=object(),
        routing=TEST_ROUTING,
    )
    assert len(report["updated"]) == 2


def test_parse_args_only_defaults_to_none():
    from backfill_transcripts import parse_args

    assert parse_args([]).only is None
    assert parse_args(["--only", "May 15"]).only == "May 15"


# ─── Importing a note from a doc with no notification email ────────────────────
# Some meetings produce a Gemini doc but never a "Notes by Gemini" email (notes
# not shared with us, or an all-hands hiding its guest list). The sync is
# email-driven, so those meetings have no local note at all and cannot be tagged.


_ALLHANDS_DOC = """# 📝 Notes

Mar 18, 2026

## All hands \\- Strategy Kick Off 2026 🚀

Attachments [All hands](https://www.google.com/calendar/event?eid=abc)

Meeting records [Transcript](?tab=t.abc)

### Summary

Pat Example opened the all-hands and walked through the 2026 strategy.

# 📖 Transcript

## All hands \\- Strategy Kick Off 2026 🚀 - Transcript

### 00:00:00

**Pat Example:** All right, we got 127 people and still rising.
**Lee Brook:** Thanks Oli.

### Transcription ended after 00:52:00
"""


def test_parse_doc_header_extracts_title_and_iso_date():
    header = parse_doc_header(_ALLHANDS_DOC)
    assert header["title"] == "All hands - Strategy Kick Off 2026 🚀"
    assert header["date_iso"] == "2026-03-18"


def test_parse_doc_header_unescapes_markdown_escapes_in_the_title():
    assert "\\-" not in parse_doc_header(_ALLHANDS_DOC)["title"]


def test_parse_doc_header_returns_none_for_a_doc_without_a_header():
    assert parse_doc_header("no header here") is None


def test_parse_doc_header_returns_none_for_empty_doc():
    assert parse_doc_header("") is None


class _FakeDrive:
    def __init__(self, doc_md):
        self._doc = doc_md

    def files(self):
        return self

    def export(self, **kwargs):
        return self

    def execute(self):
        return self._doc.encode("utf-8")


class _FakeLLM:
    """Returns a canned reply for both categorize_note and extract_note_metadata."""

    def __init__(self, content):
        from unittest.mock import MagicMock

        self.messages = MagicMock()
        self.messages.create = MagicMock(return_value=MagicMock(content=[MagicMock(text=content)]))


def test_import_note_from_doc_creates_a_note_with_summary_and_transcript(tmp_path):
    path = import_note_from_doc(
        "doc-1",
        drive_service=_FakeDrive(_ALLHANDS_DOC),
        client=_FakeLLM("Other"),
        output_dir=tmp_path,
        routing=TEST_ROUTING,
    )
    text = path.read_text()
    assert path.name.startswith("2026-03-18")
    assert "Pat Example opened the all-hands" in text
    assert TRANSCRIPT_HEADING in text
    assert "**Pat Example:** All right, we got 127 people" in text


def test_import_note_from_doc_tags_the_speaker_despite_no_invite_list(tmp_path):
    path = import_note_from_doc(
        "doc-1",
        drive_service=_FakeDrive(_ALLHANDS_DOC),
        client=_FakeLLM("Other"),
        output_dir=tmp_path,
        routing=TEST_ROUTING,
    )
    meta = yaml.safe_load(path.read_text().split("---")[1])
    assert meta["attendees"] == []
    assert "Pat Example" in meta["folders"]
    assert "Pat Example" in meta["tags"]


def test_import_note_from_doc_records_the_source_doc_id(tmp_path):
    """So a re-import or audit can trace the note back to its doc."""
    path = import_note_from_doc(
        "doc-abc123",
        drive_service=_FakeDrive(_ALLHANDS_DOC),
        client=_FakeLLM("Other"),
        output_dir=tmp_path,
        routing=TEST_ROUTING,
    )
    meta = yaml.safe_load(path.read_text().split("---")[1])
    assert meta["gemini_doc_id"] == "doc-abc123"


def test_import_note_from_doc_subject_matches_the_email_naming_convention(tmp_path):
    """So a later notes email for the same meeting maps onto this note."""
    path = import_note_from_doc(
        "doc-1",
        drive_service=_FakeDrive(_ALLHANDS_DOC),
        client=_FakeLLM("Other"),
        output_dir=tmp_path,
        routing=TEST_ROUTING,
    )
    meta = yaml.safe_load(path.read_text().split("---")[1])
    assert meta["subject"] == "Notes: “All hands - Strategy Kick Off 2026 🚀” Mar 18, 2026"


def test_import_note_from_doc_raises_on_an_unparseable_doc(tmp_path):
    with pytest.raises(BackfillAborted, match="header"):
        import_note_from_doc(
            "doc-1",
            drive_service=_FakeDrive("garbage with no header"),
            client=_FakeLLM("Other"),
            output_dir=tmp_path,
        )


def test_build_subject_index_aborts_when_no_emails_found_at_all(monkeypatch):
    """Zero Gemini emails means the query or auth is broken, not that there is
    nothing to do — 200 local notes came from somewhere."""
    import backfill_transcripts as bt

    monkeypatch.setattr(bt, "search_gemini_notes", lambda svc, historical=True: [])

    with pytest.raises(BackfillAborted, match="no Gemini notes emails"):
        build_subject_index(_FakeGmail([]))
