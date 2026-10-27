"""
backfill_transcripts.py

Re-reads the source "Notes by Gemini" Google Doc behind every local meeting note
and merges into the note two things the notification email never carried:

  1. `attendees:` — the doc's Invited list (name, email, declined), which is the
     authoritative record of who was in the meeting. The existing `people:` field
     is inferred from the summary text and also names people merely *mentioned*,
     so it can't be used to decide attendance.
  2. The full transcript, appended under `## 📖 Full Transcript`.

Anyone listed under `person_folders` in the vault's meeting-routing.json also
gains their virtual Knowledge Hub folder on every meeting they were invited to.
Membership is by invitation — a declined invite still counts.

The merge is idempotent: re-run it after adding a person to the routing config
and only the new labels appear. Notes are matched to emails by their `subject`
frontmatter, which is the verbatim email subject.

Usage:
    python3 tools/meeting-notes/backfill_transcripts.py --dry-run   # report only
    python3 tools/meeting-notes/backfill_transcripts.py             # write
"""

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml

sys.path.insert(0, str(Path(__file__).parent))

from sync_gemini_notes import (  # noqa: E402
    GMAIL_SEARCH_QUERY,
    LOCAL_NOTES_DIR,
    TRANSCRIPT_HEADING,
    Routing,
    build,
    categorize_note,
    export_doc_markdown,
    extract_note_metadata,
    get_email_content,
    load_claude_client,
    load_credentials,
    load_routing,
    matching_group,
    oauth_scopes,
    parse_invited,
    parse_speakers,
    person_folders,
    save_note_locally,
    search_gemini_notes,
    split_summary,
    split_transcript,
)

_FM_DELIM = "---\n"

# Below this share of successful email fetches the run is treated as an outage
# rather than a corpus with unmatched notes.
_MIN_INDEX_SUCCESS_RATIO = 0.5


class BackfillAborted(RuntimeError):
    """Raised when the run cannot be trusted (e.g. the network died mid-index).

    Without this, a total Gmail failure yields an empty subject index and every
    note is reported as "No matching email" — indistinguishable from a clean run
    where nothing needed updating.
    """


def split_note(text: str) -> tuple[Optional[str], str]:
    """Split a note into (frontmatter_yaml, body). frontmatter is None if absent."""
    if not text.startswith(_FM_DELIM):
        return None, text
    end = text.find("\n---", len(_FM_DELIM) - 1)
    if end == -1:
        return None, text
    frontmatter = text[len(_FM_DELIM) : end + 1]
    body = text[end + len("\n---") :].lstrip("\n")
    return frontmatter, body


def strip_transcript_section(body: str) -> str:
    """Drop an existing transcript section so a re-run replaces rather than stacks."""
    idx = body.find(TRANSCRIPT_HEADING)
    return body if idx == -1 else body[:idx].rstrip() + "\n"


def _insert_after(meta: dict, key: str, after: str, value) -> dict:
    """Return meta with `key` set, positioned right after `after` when possible."""
    if key in meta:
        meta[key] = value
        return meta
    if after not in meta:
        meta[key] = value
        return meta
    rebuilt: dict = {}
    for k, v in meta.items():
        rebuilt[k] = v
        if k == after:
            rebuilt[key] = value
    return rebuilt


def merge_doc_into_note(
    note_text: str, doc_md: str, physical_folder: str = "", routing: Optional[Routing] = None
) -> str:
    """Merge a Gemini doc's invite list and transcript into an existing note.

    `physical_folder` is the note's directory name, used as the last-resort seed
    for `folders` (see below). Notes with no frontmatter are returned unchanged.
    """
    frontmatter, body = split_note(note_text)
    if frontmatter is None:
        return note_text

    routing = routing or load_routing()
    meta = yaml.safe_load(frontmatter) or {}
    attendees = parse_invited(doc_md)
    transcript = split_transcript(doc_md)
    labels = person_folders(
        attendees, speakers=parse_speakers(transcript), person_map=routing.person_folders
    )

    if labels:
        # A note with no `folders` key renders under its physical directory
        # (services/knowledge.py::_doc_folders falls back to the parent dir name).
        # Writing `folders` disables that fallback, so seed the original folder in
        # first — otherwise adding a person folder would silently move the note out
        # of its team folder.
        folders = list(meta.get("folders") or [])
        if not folders:
            seed = meta.get("folder") or physical_folder
            if seed:
                folders = [seed]
        for label in labels:
            if label not in folders:
                folders.append(label)
        meta = _insert_after(meta, "folders", after="tags", value=folders)

        tags = list(meta.get("tags") or [])
        for label in labels:
            if label not in tags:
                tags.append(label)
        meta["tags"] = tags

    # After `folders`, so synced and backfilled notes share one key order.
    meta = _insert_after(meta, "attendees", after="folders", value=attendees)

    body = strip_transcript_section(body)
    if transcript:
        body = f"{body.rstrip()}\n\n{TRANSCRIPT_HEADING}\n\n{transcript}\n"

    fm_text = yaml.dump(meta, allow_unicode=True, sort_keys=False)
    return f"{_FM_DELIM}{fm_text}---\n\n{body.lstrip()}"


# ─── Importing a note from a doc that never produced an email ──────────────────
#
# The sync is Gmail-driven, so a meeting whose "Notes by Gemini" email never
# arrived (notes not shared with us, or an all-hands hiding its guest list) has no
# local note at all — and a folder tag can't be added to a note that doesn't
# exist. This path builds the note straight from the doc instead.

# `# 📝 Notes` / blank / `Mar 18, 2026` / blank / `## <meeting title>`
_DOC_HEADER_RE = re.compile(
    r"^#\s+\W*\s*Notes\s*$.*?^([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\s*$.*?^##\s+(.+?)\s*$",
    re.MULTILINE | re.DOTALL,
)


def parse_doc_header(doc_md: str) -> Optional[dict]:
    """Extract {title, date_iso, date_label} from a doc's header, or None."""
    if not doc_md:
        return None
    match = _DOC_HEADER_RE.search(doc_md)
    if not match:
        return None
    date_label, title = match.group(1).strip(), match.group(2).strip()
    # Markdown export escapes punctuation in headings (`\-`, `\.`).
    title = re.sub(r"\\(.)", r"\1", title)
    try:
        parsed = datetime.strptime(date_label, "%b %d, %Y")
    except ValueError:
        return None
    return {
        "title": title,
        "date_iso": parsed.strftime("%Y-%m-%d"),
        # RFC 2822 so save_note_locally's parse_date_to_iso understands it.
        "date_rfc2822": parsed.strftime("%a, %d %b %Y 00:00:00 +0000"),
        "date_label": date_label,
    }


def import_note_from_doc(
    doc_id: str,
    drive_service,
    client=None,
    output_dir: Path = LOCAL_NOTES_DIR,
    routing: Optional[Routing] = None,
) -> Path:
    """Create a local note directly from a Gemini doc. Returns the written path."""
    doc_md = export_doc_markdown(drive_service, doc_id)
    header = parse_doc_header(doc_md)
    if not header:
        raise BackfillAborted(
            f"Could not parse a Notes header from doc {doc_id} — refusing to import "
            "a note with a guessed title or date."
        )

    routing = routing or load_routing()
    summary = split_summary(doc_md)
    transcript = split_transcript(doc_md)
    attendees = parse_invited(doc_md)
    labels = person_folders(
        attendees, speakers=parse_speakers(transcript), person_map=routing.person_folders
    )

    # Same shape as the email subject, so a later notes email for this meeting
    # matches this note instead of creating a duplicate.
    subject = f"Notes: “{header['title']}” {header['date_label']}"

    ai_client = client or load_claude_client()
    subfolder = categorize_note(subject, summary, routing.folders, client=ai_client)
    metadata = extract_note_metadata(
        subject, summary, client=ai_client, tagging_guide=routing.tagging_guide
    )

    extra_tags = list(labels)
    group = matching_group(metadata.get("people", []), routing)
    if group:
        subfolder = group.folder
        extra_tags = [group.folder] + extra_tags

    path = save_note_locally(
        subject,
        summary,
        header["date_rfc2822"],
        subfolder,
        metadata,
        output_dir=output_dir,
        extra_tags=extra_tags,
        attendees=attendees,
        transcript=transcript,
    )

    # Record provenance: this note came from a doc, not from an email.
    text = path.read_text(encoding="utf-8")
    frontmatter, body = split_note(text)
    meta = yaml.safe_load(frontmatter) or {}
    meta = _insert_after(meta, "gemini_doc_id", after="source", value=doc_id)
    fm_text = yaml.dump(meta, allow_unicode=True, sort_keys=False)
    path.write_text(f"{_FM_DELIM}{fm_text}---\n\n{body.lstrip()}", encoding="utf-8")
    return path


# ─── Driver ────────────────────────────────────────────────────────────────────


def build_subject_index(gmail_service) -> dict[str, str]:
    """Map every Gemini notes email subject → its source doc id.

    Later emails win on a duplicate subject, which is what we want: a re-sent
    notes email supersedes the earlier one.
    """
    index: dict[str, str] = {}
    msg_ids = search_gemini_notes(gmail_service, historical=True)
    if not msg_ids:
        raise BackfillAborted(
            "Gmail returned no Gemini notes emails — the query, auth or network is "
            "broken. Refusing to run: every note would be reported as unmatched."
        )

    print(f"[backfill] Scanning {len(msg_ids)} Gemini notes email(s) for source doc ids...")
    read_ok = 0
    for i, msg_id in enumerate(msg_ids, 1):
        try:
            content = get_email_content(gmail_service, msg_id)
        except Exception as exc:
            print(f"  [!] Could not read message {msg_id}: {exc}")
            continue
        read_ok += 1
        if content["doc_id"]:
            index[content["subject"]] = content["doc_id"]
        if i % 25 == 0:
            print(f"  ... {i}/{len(msg_ids)}", flush=True)

    if read_ok < len(msg_ids) * _MIN_INDEX_SUCCESS_RATIO:
        raise BackfillAborted(
            f"Only read {read_ok}/{len(msg_ids)} Gemini notes emails — treating this "
            "as a network/auth outage rather than a corpus of unmatched notes. "
            "Nothing was written; re-run once connectivity is back."
        )

    print(f"[backfill] Indexed {len(index)} subject(s) with a source doc.", flush=True)
    return index


def run_backfill(
    notes_dir: Path = LOCAL_NOTES_DIR,
    dry_run: bool = False,
    gmail_service=None,
    drive_service=None,
    only: Optional[str] = None,
    routing: Optional[Routing] = None,
) -> dict:
    """Backfill every local note that maps to a Gemini doc. Returns a report dict.

    ``only`` restricts the run to notes whose filename contains that substring
    (case-insensitive) — used to retry the handful of notes whose doc export hit a
    transient network error, without re-exporting all ~200 docs.
    """
    routing = routing or load_routing()
    if gmail_service is None or drive_service is None:
        creds = load_credentials(scopes=oauth_scopes(routing))
        gmail_service = gmail_service or build("gmail", "v1", credentials=creds)
        drive_service = drive_service or build("drive", "v3", credentials=creds)

    index = build_subject_index(gmail_service)

    notes = sorted(Path(notes_dir).rglob("*.md"))
    if only:
        notes = [p for p in notes if only.lower() in p.name.lower()]
        print(f"[backfill] --only '{only}' matched {len(notes)} note(s).")
    report = {
        "total": len(notes),
        "updated": [],
        "with_transcript": [],
        "person_folder": [],
        "unmatched": [],
        "skipped_granola": [],
        "failed": [],
        "unchanged": [],
    }

    for note_path in notes:
        text = note_path.read_text(encoding="utf-8")
        frontmatter, _ = split_note(text)
        if frontmatter is None:
            report["failed"].append((note_path.name, "no frontmatter"))
            continue
        meta = yaml.safe_load(frontmatter) or {}

        if meta.get("source") == "granola":
            report["skipped_granola"].append(note_path.name)
            continue

        subject = meta.get("subject")
        doc_id = index.get(subject) if subject else None
        if not doc_id:
            report["unmatched"].append(note_path.name)
            continue

        try:
            doc_md = export_doc_markdown(drive_service, doc_id)
        except Exception as exc:
            report["failed"].append((note_path.name, str(exc)[:120]))
            continue
        if not doc_md.strip():
            # An empty export is a transport failure, not a doc without a
            # transcript — merging it would wipe a transcript we already have.
            report["failed"].append((note_path.name, "empty doc export"))
            continue

        merged = merge_doc_into_note(
            text, doc_md, physical_folder=note_path.parent.name, routing=routing
        )

        if split_transcript(doc_md):
            report["with_transcript"].append(note_path.name)
        if person_folders(parse_invited(doc_md), person_map=routing.person_folders):
            report["person_folder"].append(note_path.name)

        if merged == text:
            report["unchanged"].append(note_path.name)
            continue
        if not dry_run:
            note_path.write_text(merged, encoding="utf-8")
        report["updated"].append(note_path.name)

    return report


def print_report(report: dict, dry_run: bool) -> None:
    verb = "Would update" if dry_run else "Updated"
    print("\n--- backfill summary ---")
    print(f"Notes scanned:        {report['total']}")
    print(f"{verb + ':':<21} {len(report['updated'])}")
    print(f"Already up to date:   {len(report['unchanged'])}")
    print(f"With transcript:      {len(report['with_transcript'])}")
    print(f"Gained person folder: {len(report['person_folder'])}")
    print(f"Skipped (granola):    {len(report['skipped_granola'])}")
    print(f"No matching email:    {len(report['unmatched'])}")
    print(f"Failed:               {len(report['failed'])}")

    if report["person_folder"]:
        print("\nPerson-folder meetings:")
        for name in report["person_folder"]:
            print(f"  • {name}")
    if report["unmatched"]:
        print("\nNo matching Gemini email (left untouched):")
        for name in report["unmatched"]:
            print(f"  • {name}")
    if report["failed"]:
        print("\nFailed:")
        for name, why in report["failed"]:
            print(f"  • {name}: {why}")


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill transcripts + attendees into local meeting notes."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would change without writing any file.",
    )
    parser.add_argument(
        "--notes-dir",
        default=str(LOCAL_NOTES_DIR),
        help="Directory of local .md notes (default: <vault>/knowledge-hub/meeting-notes).",
    )
    parser.add_argument(
        "--only",
        default=None,
        help="Only process notes whose filename contains this substring "
        "(case-insensitive). Use to retry notes whose doc export failed.",
    )
    parser.add_argument(
        "--from-doc",
        default=None,
        metavar="DOC_ID",
        help="Import a brand-new note from a Gemini doc id instead of backfilling. "
        "Use for meetings whose notes email never arrived, so no note exists.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    if args.from_doc:
        creds = load_credentials()
        drive = build("drive", "v3", credentials=creds)
        try:
            path = import_note_from_doc(
                args.from_doc, drive_service=drive, output_dir=Path(args.notes_dir)
            )
        except BackfillAborted as exc:
            print(f"[backfill] ABORTED — nothing written.\n  {exc}")
            return 1
        print(f"[backfill] Imported {path.parent.name}/{path.name} ({path.stat().st_size} bytes)")
        return 0

    print(f"[backfill] Gmail query: {GMAIL_SEARCH_QUERY}")
    try:
        report = run_backfill(notes_dir=Path(args.notes_dir), dry_run=args.dry_run, only=args.only)
    except BackfillAborted as exc:
        print(f"\n[backfill] ABORTED — nothing written.\n  {exc}")
        return 1
    print_report(report, args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
