"""
sync_gemini_notes.py

Fetches unread "Notes by Gemini" emails from Gmail, categorizes them using
the Claude API, and saves them to Google Drive under
Ozos: Knowledge Hub/Meeting notes/<subfolder>/.

Run once with --auth to complete the Google OAuth flow.
Run with --historical to process already-read emails as well.
"""

import argparse
import base64
import json
import os
import re
import socket
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Optional

import yaml
from dataclasses import dataclass

# Shared run-log helper (skills/) — records each run for the OZOS Brain Command Hub.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "skills"))
import ozos_llm  # noqa: E402
import ozos_vault  # noqa: E402
import run_log  # noqa: E402

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import anthropic

# ─── Constants ────────────────────────────────────────────────────────────────

GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify"
DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"

# The vault holds every piece of user data; the engine only holds code.
VAULT_DIR = ozos_vault.vault_dir()

# ─── Routing config (vault/.ozos/meeting-routing.json) ───────────────────────
#
# Which folder a note lands in, which people get a virtual person folder, and
# which groups of people reroute a note (e.g. a leadership team) are all company
# facts, so they live in the vault, never in this file.
#
# {
#   "folders": ["Team A", "Other"],            # categories the LLM may pick from
#   "default_folder": "Other",                 # always present
#   "person_folders": {"a@x.io": "Alex Lee"},  # attendee email → folder label
#   "group_rules": [{"folder": "Leadership", "members": ["alex", "sam"], "min_present": 2}],
#   "drive_parent_folder_id": null,            # set to mirror notes to Google Drive
#   "tagging_guide": ""                        # free text appended to the tagging prompt
# }

ROUTING_PATH = VAULT_DIR / ".ozos" / "meeting-routing.json"


@dataclass(frozen=True)
class GroupRule:
    folder: str
    members: frozenset[str]  # lowercased first names
    min_present: int


@dataclass
class Routing:
    folders: list[str]
    default_folder: str
    person_folders: dict[str, str]
    group_rules: list[GroupRule]
    drive_parent_folder_id: Optional[str]
    tagging_guide: str = ""


def load_routing(path: Path = ROUTING_PATH) -> Routing:
    """Read the vault routing config; a missing file means "everything goes to Other"."""
    data: dict = {}
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except (OSError, ValueError) as exc:
            print(f"[meeting-notes] Ignoring malformed routing config {path}: {exc}")

    default_folder = str(data.get("default_folder") or "Other")
    folders = [str(f) for f in data.get("folders") or []]
    rules: list[GroupRule] = []
    for raw in data.get("group_rules") or []:
        if not isinstance(raw, dict) or not raw.get("folder"):
            continue
        members = frozenset(str(m).strip().lower() for m in raw.get("members") or [] if m)
        rules.append(GroupRule(str(raw["folder"]), members, int(raw.get("min_present") or 1)))
    for extra in [default_folder] + [r.folder for r in rules]:
        if extra not in folders:
            folders.append(extra)
    person_folders = {
        str(k).strip().lower(): str(v)
        for k, v in (data.get("person_folders") or {}).items()
        if k and v
    }
    drive_id = data.get("drive_parent_folder_id") or None
    return Routing(
        folders=folders,
        default_folder=default_folder,
        person_folders=person_folders,
        group_rules=rules,
        drive_parent_folder_id=str(drive_id) if drive_id else None,
        tagging_guide=str(data.get("tagging_guide") or ""),
    )


def route_group(people: list[dict], rule: GroupRule) -> bool:
    """True if at least `min_present` distinct rule members are among `people`."""
    seen = set()
    for person in people or []:
        name = (person.get("name") or "").strip().lower()
        first = name.split()[0] if name else ""
        if first in rule.members:
            seen.add(first)
    return len(seen) >= rule.min_present


def oauth_scopes(routing: Routing) -> list[str]:
    """Gmail plus read-only Drive always (the source doc export needs it); full
    Drive only when notes are mirrored into a Drive folder."""
    drive = DRIVE_SCOPE if routing.drive_parent_folder_id else DRIVE_READONLY_SCOPE
    return [GMAIL_SCOPE, drive]


DEFAULT_CREDS_PATH = Path.home() / ".gdrive-credentials.json"
DEFAULT_TOKEN_PATH = Path.home() / ".config" / "ozos" / "meeting-notes-token.json"

# Local markdown copies of every note (the Knowledge Hub reads these).
LOCAL_NOTES_DIR = VAULT_DIR / "knowledge-hub" / "meeting-notes"

# Granola sync state: processed meeting ids + last scan time.
GRANOLA_STATE_PATH = VAULT_DIR / ".ozos" / "granola-processed.json"

# Per-vital run-log (read by the OZOS Brain Command Hub).
RUNS_DIR = VAULT_DIR / ".ozos" / "runs"

# H2 so the Knowledge Hub preview renders it as a collapsible section
# (rehypeCollapsibleSections) and lists it in the outline (which only picks H1/H2).
TRANSCRIPT_HEADING = "## 📖 Full Transcript"


PROCESSED_LABEL_NAME = "Processed-by-Claude"
GMAIL_SEARCH_QUERY = "from:gemini-notes@google.com subject:Notes:"


GRANOLA_DEFAULT_LOOKBACK_DAYS = 30

VITAL_ID = "meeting-notes"


def _log_run(count: int, items: list[str], runs_dir: Optional[Path] = None) -> None:
    """Best-effort: append a run record. A failure here must never break the sync."""
    try:
        run_log.record_run(runs_dir or RUNS_DIR, VITAL_ID, count, items)
    except Exception as exc:
        print(f"  [run-log] skipped: {exc}")


# ─── Auth ─────────────────────────────────────────────────────────────────────


def load_credentials(
    token_path: Path = DEFAULT_TOKEN_PATH,
    creds_path: Path = DEFAULT_CREDS_PATH,
    scopes: Optional[list[str]] = None,
) -> Credentials:
    """Load OAuth credentials from token file; run browser flow if missing or expired."""
    scopes = scopes or [GMAIL_SCOPE, DRIVE_READONLY_SCOPE]
    creds = None
    token_path.parent.mkdir(parents=True, exist_ok=True)

    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), scopes)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), scopes)
            creds = flow.run_local_server(port=0)
        token_path.write_text(creds.to_json())

    return creds


# ─── Date helpers ─────────────────────────────────────────────────────────────


_OLD_DATE_RE = re.compile(r"^[A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4}")


def parse_date_to_iso(date_str: str) -> str:
    """Parse an RFC 2822 email date string to YYYY-MM-DD. Falls back to original string on failure."""
    try:
        return parsedate_to_datetime(date_str).strftime("%Y-%m-%d")
    except Exception:
        return date_str


# ─── Drive helpers ─────────────────────────────────────────────────────────────


def ensure_drive_folders(drive_service, parent_id: str, subfolders: list[str]) -> dict[str, str]:
    """
    Ensure each subfolder exists inside parent_id.
    Returns a mapping of {folder_name: folder_id}.
    """
    existing = {}
    page_token = None
    while True:
        resp = (
            drive_service.files()
            .list(
                q=f"'{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields="nextPageToken, files(id, name)",
                pageToken=page_token,
            )
            .execute()
        )
        for f in resp.get("files", []):
            existing[f["name"]] = f["id"]
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    folder_map = {}
    for name in subfolders:
        if name in existing:
            folder_map[name] = existing[name]
            print(f"  [drive] Folder exists: {name}")
        else:
            meta = {
                "name": name,
                "mimeType": "application/vnd.google-apps.folder",
                "parents": [parent_id],
            }
            created = drive_service.files().create(body=meta, fields="id").execute()
            folder_map[name] = created["id"]
            print(f"  [drive] Created folder: {name}")

    return folder_map


def save_note_to_drive(drive_service, subject: str, body: str, date: str, folder_id: str) -> str:
    """
    Create a Google Doc from the note content inside folder_id.
    Returns the new file's ID.
    """
    iso_date = parse_date_to_iso(date) if date else ""
    title = f"{iso_date} — {subject}" if iso_date else subject
    doc_content = f"# {subject}\n\n**Date:** {date}\n\n---\n\n{body}"

    file_meta = {
        "name": title,
        "mimeType": "application/vnd.google-apps.document",
        "parents": [folder_id],
    }
    media_body = _text_media(doc_content)
    created = (
        drive_service.files()
        .create(
            body=file_meta,
            media_body=media_body,
            fields="id",
        )
        .execute()
    )
    return created["id"]


def rename_existing_notes(drive_service, folder_map: dict[str, str]) -> None:
    """
    Rename all Google Docs in folder_map whose names start with an RFC 2822 date
    (e.g. 'Thu, 18 Dec 2025 …') to use a YYYY-MM-DD prefix instead.
    Idempotent — files already in the new format are skipped.
    """
    print("[meeting-notes] Migrating existing note names to YYYY-MM-DD prefix...")
    renamed = 0
    skipped = 0

    for folder_name, folder_id in folder_map.items():
        page_token = None
        while True:
            resp = (
                drive_service.files()
                .list(
                    q=(
                        f"'{folder_id}' in parents"
                        " and mimeType='application/vnd.google-apps.document'"
                        " and trashed=false"
                    ),
                    fields="nextPageToken, files(id, name)",
                    pageToken=page_token,
                )
                .execute()
            )
            for f in resp.get("files", []):
                name = f["name"]
                if not _OLD_DATE_RE.match(name):
                    skipped += 1
                    continue
                sep = " \u2014 "  # em-dash with spaces
                if sep in name:
                    raw_date, rest = name.split(sep, 1)
                else:
                    raw_date, rest = name, ""
                iso_date = parse_date_to_iso(raw_date.strip())
                new_name = f"{iso_date}{sep}{rest}" if rest else iso_date
                if new_name == name:
                    skipped += 1
                    continue
                drive_service.files().update(fileId=f["id"], body={"name": new_name}).execute()
                renamed += 1

            page_token = resp.get("nextPageToken")
            if not page_token:
                break

    print(f"[meeting-notes] Migration done. Renamed: {renamed}  Already correct: {skipped}")


def _text_media(text: str):
    """Build a MediaInMemoryUpload for plain text content."""
    from googleapiclient.http import MediaInMemoryUpload

    return MediaInMemoryUpload(text.encode("utf-8"), mimetype="text/plain", resumable=False)


# ─── Gmail helpers ─────────────────────────────────────────────────────────────


def ensure_processed_label(gmail_service) -> str:
    """
    Return the label_id for PROCESSED_LABEL_NAME.
    Creates the label in Gmail if it doesn't exist yet.
    """
    existing = gmail_service.users().labels().list(userId="me").execute().get("labels", [])
    for label in existing:
        if label["name"] == PROCESSED_LABEL_NAME:
            return label["id"]

    created = (
        gmail_service.users()
        .labels()
        .create(userId="me", body={"name": PROCESSED_LABEL_NAME})
        .execute()
    )
    print(f"  [gmail] Created label: {PROCESSED_LABEL_NAME}")
    return created["id"]


def search_gemini_notes(gmail_service, historical: bool = False) -> list[str]:
    """
    Return message IDs matching the Gemini notes query.
    Excludes emails already labeled Processed-by-Claude unless historical=True.
    """
    if not historical:
        query = f"{GMAIL_SEARCH_QUERY} -label:{PROCESSED_LABEL_NAME}"
    else:
        query = GMAIL_SEARCH_QUERY

    msg_ids = []
    page_token = None
    while True:
        resp = (
            gmail_service.users()
            .messages()
            .list(userId="me", q=query, pageToken=page_token)
            .execute()
        )
        for m in resp.get("messages", []):
            msg_ids.append(m["id"])
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    return msg_ids


def get_email_content(gmail_service, msg_id: str) -> dict:
    """
    Fetch and decode a Gmail message.
    Returns {subject, body, date}.
    """
    msg = gmail_service.users().messages().get(userId="me", id=msg_id, format="full").execute()
    headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}

    subject = headers.get("Subject", "(no subject)")
    date = headers.get("Date", "")

    body = _extract_body(msg["payload"])
    doc_id = extract_doc_id(_extract_part(msg["payload"], "text/html"))
    return {"subject": subject, "body": body, "date": date, "doc_id": doc_id}


def _extract_body(payload: dict) -> str:
    """Recursively extract plain-text body from a Gmail message payload."""
    return _extract_part(payload, "text/plain")


def _extract_part(payload: dict, want_mime: str) -> str:
    """Recursively extract the first body of `want_mime` from a Gmail payload."""
    mime = payload.get("mimeType", "")
    if mime == want_mime:
        data = payload.get("body", {}).get("data", "")
        return (
            base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace") if data else ""
        )
    if mime.startswith("multipart/"):
        for part in payload.get("parts", []):
            text = _extract_part(part, want_mime)
            if text:
                return text
    return ""


# ─── Gemini source doc (transcript + attendees) ─────────────────────────────────
#
# The notification email carries only the summary. The full transcript and the
# authoritative attendee list live in the source "Notes by Gemini" Google Doc,
# which has two tabs — "Notes" and "Transcript". The doc's id appears as a
# docs.google.com link in the email's text/html part (the text/plain part strips
# hyperlinks, which is why the email alone can't get us there).

_DOC_ID_RE = re.compile(r"https://docs\.google\.com/document/d/([A-Za-z0-9_-]+)")

# The "Invited …" line lists every attendee as a mailto link; a declined invite is
# wrapped in ~~strikethrough~~. Other lines (Attachments, Meeting records) carry
# non-mailto links, so parsing is scoped to this line only.
_INVITED_LINE_RE = re.compile(r"^Invited\s+(.*)$", re.MULTILINE)
_MAILTO_RE = re.compile(r"(~~)?\[([^\]]+)\]\(mailto:([^)]+)\)(~~)?")

# Markdown export renders the Transcript tab under its own H1.
_TRANSCRIPT_TAB_RE = re.compile(r"^#\s+\W*\s*Transcript\s*$", re.MULTILINE)
# Pandoc-style heading anchors (`### 00:01:09 {#00:01:09}`) would render literally.
_HEADING_ANCHOR_RE = re.compile(r"\s*\{#[^}]*\}\s*$", re.MULTILINE)
# The tab's own title heading (`## <Meeting name> \- Transcript`) duplicates ours.
_TRANSCRIPT_TITLE_RE = re.compile(r"^##\s+.*\\?-\s*Transcript\s*$", re.MULTILINE)
# Markdown export appends one base64 data-URI reference definition per image in
# the doc (every screen-share frame) at the very end — which is inside the
# transcript half. Nothing in the note references them: they belong to the Notes
# tab, and we use the emailed summary for that half. Left in, they were 90% of the
# whole corpus by bytes (55MB of 61MB), one line reaching 219KB.
_BASE64_IMAGE_DEF_RE = re.compile(
    r"^\[image\d+\]:\s*<data:[^>]*>\s*$", re.MULTILINE | re.IGNORECASE
)
# A transcript turn: `**Name:**` at the start of a line. Mid-line bold is prose.
_SPEAKER_RE = re.compile(r"^\*\*([^:*\n]{2,60}):\*\*", re.MULTILINE)
# Header boilerplate in the Notes tab — the invite list is captured as frontmatter,
# and the Attachments/Meeting-records links are dead outside Google Docs.
_DOC_BOILERPLATE_RE = re.compile(r"^(?:Invited|Attachments|Meeting records)\s.*$", re.MULTILINE)


def extract_doc_id(html: str) -> Optional[str]:
    """Return the source Gemini Doc id from a notes email's HTML part, or None.

    The first docs.google.com link in the email is the "Open meeting notes" link.
    """
    if not html:
        return None
    match = _DOC_ID_RE.search(html)
    return match.group(1) if match else None


def export_doc_markdown(drive_service, doc_id: str) -> str:
    """Export a Google Doc as markdown (all tabs, including Transcript).

    Markdown — not text/plain — because only markdown keeps the `mailto:` links
    that identify attendees and the `~~strikethrough~~` that marks decliners.
    """
    data = drive_service.files().export(fileId=doc_id, mimeType="text/markdown").execute()
    return data.decode("utf-8", errors="replace") if isinstance(data, bytes) else data


def parse_invited(doc_md: str) -> list[dict]:
    """Parse the doc's "Invited …" line into [{name, email, declined}, …].

    Order follows the doc. A struck-through name means the person declined; they
    are still returned, because folder membership is by invitation.
    """
    if not doc_md:
        return []
    line_match = _INVITED_LINE_RE.search(doc_md)
    if not line_match:
        return []

    attendees: list[dict] = []
    for open_strike, name, email, close_strike in _MAILTO_RE.findall(line_match.group(1)):
        attendees.append(
            {
                "name": name.strip(),
                "email": email.strip(),
                "declined": bool(open_strike and close_strike),
            }
        )
    return attendees


def split_transcript(doc_md: str) -> str:
    """Return just the transcript half of an exported Gemini doc ("" if none).

    Strips the tab's own headings (we supply TRANSCRIPT_HEADING instead) and the
    pandoc heading anchors that markdown export adds to timestamp headings.
    """
    if not doc_md:
        return ""
    tab_match = _TRANSCRIPT_TAB_RE.search(doc_md)
    if not tab_match:
        return ""

    transcript = doc_md[tab_match.end() :]
    transcript = _TRANSCRIPT_TITLE_RE.sub("", transcript)
    transcript = _HEADING_ANCHOR_RE.sub("", transcript)
    transcript = _BASE64_IMAGE_DEF_RE.sub("", transcript)
    return transcript.strip()


def parse_speakers(transcript: str) -> list[str]:
    """Names that actually spoke, in first-seen order.

    A turn is `**Name:**` at the start of a line; mid-line bold is quoted prose.
    """
    if not transcript:
        return []
    seen: list[str] = []
    for name in _SPEAKER_RE.findall(transcript):
        name = name.strip()
        if name and name not in seen:
            seen.append(name)
    return seen


def person_folders(
    attendees: list[dict],
    speakers: Optional[list[str]] = None,
    person_map: Optional[dict[str, str]] = None,
) -> list[str]:
    """Person-folder labels for a meeting, deduped, invitees first.

    Two independent sources, because either alone misses real attendance:

    * ``attendees`` — the doc's Invited list, matched on **email** (a nickname or
      changed display name must not drop the folder). Covers people who were
      invited but silent.
    * ``speakers`` — transcript turns, matched on **full name** against the folder
      label. Covers docs with no Invited line at all: a Meet call with no calendar
      event, or an event hiding its guest list (an all-hands the organiser ran
      can have zero invitees in its doc yet dozens of turns from them).
      First-name-only matches are rejected — "Pat" could be someone else.
    """
    person_map = person_map or {}
    folders: list[str] = []
    for attendee in attendees or []:
        label = person_map.get((attendee.get("email") or "").strip().lower())
        if label and label not in folders:
            folders.append(label)

    known = {label.lower(): label for label in person_map.values()}
    for speaker in speakers or []:
        label = known.get((speaker or "").strip().lower())
        if label and label not in folders:
            folders.append(label)
    return folders


def split_summary(doc_md: str) -> str:
    """Return the Notes half of an exported Gemini doc ("" if empty).

    Used when a doc's notification email never arrived, so there is no emailed
    summary to use as the note body. Drops the Invited/Attachments/Meeting-records
    boilerplate (attendees are captured in frontmatter) and the transcript half.
    """
    if not doc_md:
        return ""
    tab_match = _TRANSCRIPT_TAB_RE.search(doc_md)
    summary = doc_md[: tab_match.start()] if tab_match else doc_md
    summary = _DOC_BOILERPLATE_RE.sub("", summary)
    summary = _HEADING_ANCHOR_RE.sub("", summary)
    return summary.strip()


def mark_processed(gmail_service, msg_id: str, label_id: str) -> None:
    """Mark email as read and apply the Processed-by-Claude label."""
    gmail_service.users().messages().modify(
        userId="me",
        id=msg_id,
        body={
            "removeLabelIds": ["UNREAD"],
            "addLabelIds": [label_id],
        },
    ).execute()


# ─── Claude categorization ─────────────────────────────────────────────────────


# Per-request timeout + bounded retries for the LLM client: one stalled or
# malformed response must fail fast and retry, not hang the whole sync.
LLM_TIMEOUT_SECONDS = 60
LLM_MAX_RETRIES = 2


def load_claude_client() -> anthropic.Anthropic:
    """Create the shared Anthropic client (credentials from the vault .env)."""
    return ozos_llm.make_client(timeout=LLM_TIMEOUT_SECONDS, max_retries=LLM_MAX_RETRIES)


def categorize_note(
    subject: str,
    body: str,
    subfolders: list[str],
    client: Optional[anthropic.Anthropic] = None,
) -> str:
    """
    Ask the Claude API which subfolder this note belongs to.
    Returns one of the subfolder names, or the first subfolder as fallback.
    """
    if client is None:
        client = load_claude_client()

    options = ", ".join(subfolders)
    prompt = (
        f"You are categorizing a meeting note. Choose exactly one category from: {options}.\n"
        f"Reply with only the category name — nothing else.\n\n"
        f"Subject: {subject}\n\n"
        f"Content:\n{body[:2000]}"
    )

    guess = ozos_llm.complete(client, system=None, user=prompt, max_tokens=20, temperature=0)

    # Exact match first, then case-insensitive
    if guess in subfolders:
        return guess
    for sf in subfolders:
        if sf.lower() == guess.lower():
            return sf

    print(f"  [claude] Unrecognized category '{guess}', routing to 'Other'")
    return "Other"


# ─── Extraction & local save ──────────────────────────────────────────────────


_CODE_FENCE_RE = re.compile(r"^```[a-z]*\n?|\n?```$")

_EMPTY_METADATA: dict = {
    "people": [],
    "projects": [],
    "topics": [],
    "action_items": [],
    "scope": "",
    "tags": [],
}


def extract_note_metadata(
    subject: str, body: str, client: anthropic.Anthropic, tagging_guide: str = ""
) -> dict:
    """Call Claude to extract structured metadata from a meeting note.

    Returns a dict with keys: people, projects, topics, action_items, scope.
    Falls back to empty values if the API call or JSON parsing fails.
    """
    prompt = (
        "Extract structured information from this meeting note. "
        "Reply with ONLY a JSON object — no markdown, no explanation.\n\n"
        "JSON schema:\n"
        "{\n"
        '  "people": [{"name": "string", "role": "string"}],\n'
        '  "projects": ["string"],\n'
        '  "topics": ["string"],\n'
        '  "action_items": ["string"],\n'
        '  "scope": "e.g. 1-1, team-sync, cross-team, external",\n'
        '  "tags": ["string"]\n'
        "}\n\n"
        "Guidelines for extraction:\n"
        "- people: include every named person mentioned, using their full name in 'name'\n"
        "- projects: include every product or initiative mentioned\n"
        "- scope: use a short hyphenated slug (e.g. 1-1, team-sync, cross-team, external)\n\n"
        "TAGS — use a nested hierarchy with / as the separator:\n"
        "- <Team-or-Product>/<Person> for people, <Team-or-Product>/<topic> for topics\n"
        "- No spaces in tags; use hyphens for multi-word values\n"
        "- scope stays flat (e.g. 1-1, team-sync) and is included as a tag too\n"
        '- Return tags as a flat list of strings, e.g. ["Growth/Alex", "Growth/pricing", "team-sync"]\n\n'
        + (
            f"Company tagging guide (follow it where it applies):\n{tagging_guide.strip()}\n\n"
            if tagging_guide.strip()
            else ""
        )
        + f"Subject: {subject}\n\n"
        f"Content:\n{body[:3000]}"
    )

    try:
        raw = ozos_llm.complete(client, system=None, user=prompt, max_tokens=600, temperature=0)
        raw = _CODE_FENCE_RE.sub("", raw).strip()
        data = json.loads(raw)
        # Ensure all expected keys are present
        return {**_EMPTY_METADATA, **data}
    except Exception as exc:
        print(f"  [extract] Metadata extraction failed: {exc}")
        return dict(_EMPTY_METADATA)


def _to_tag(value: str) -> str:
    """Convert a string to a hashtag-compatible slug (no spaces, no special chars)."""
    slug = re.sub(r"[^\w\s-]", "-", value)  # replace special chars with hyphen
    slug = re.sub(r"[\s_]+", "-", slug)  # spaces/underscores → hyphen
    slug = re.sub(r"-+", "-", slug).strip("-")  # collapse and trim hyphens
    return slug


def build_frontmatter(
    iso_date: str,
    subject: str,
    subfolder: str,
    metadata: dict,
    source: str = "gemini",
    extra_tags: Optional[list[str]] = None,
    attendees: Optional[list[dict]] = None,
) -> str:
    """Render YAML frontmatter block from note metadata, including a tags field.

    ``source`` records which pipeline produced the note (``gemini`` or ``granola``).
    ``extra_tags`` are merged into tags (deduped, order-preserved) and into folders.
    ``attendees`` is the invite list parsed from the source Gemini doc — the
    authoritative record of who was in the meeting, as opposed to ``people``,
    which is inferred from the summary and also names people merely mentioned.
    """
    scope = metadata.get("scope", "")

    # Use tags returned directly by Claude (nested hierarchy with / separator)
    tags = [t for t in metadata.get("tags", []) if t]
    # Merge extra_tags (e.g. PLT routing tag)
    for t in extra_tags or []:
        if t not in tags:
            tags.append(t)
    # Deduplicate while preserving order
    seen: set[str] = set()
    tags = [t for t in tags if not (t in seen or seen.add(t))]  # type: ignore[func-returns-value]

    # folders: subfolder first, then any extra_tags that differ from subfolder
    folders = [subfolder] + [t for t in (extra_tags or []) if t != subfolder]

    fm = {
        "date": iso_date,
        "subject": subject,
        "folder": subfolder,
        "source": source,
        "scope": scope,
        "tags": tags,
        "folders": folders,
        "attendees": attendees or [],
        "people": metadata.get("people", []),
        "projects": metadata.get("projects", []),
        "topics": metadata.get("topics", []),
        "action_items": metadata.get("action_items", []),
    }
    return f"---\n{yaml.dump(fm, allow_unicode=True, sort_keys=False)}---\n"


def save_note_locally(
    subject: str,
    body: str,
    date: str,
    subfolder: str,
    metadata: dict,
    output_dir: Path = LOCAL_NOTES_DIR,
    source: str = "gemini",
    extra_tags: Optional[list[str]] = None,
    attendees: Optional[list[dict]] = None,
    transcript: str = "",
) -> Path:
    """Save a meeting note as a .md file with YAML frontmatter to output_dir/subfolder/.

    ``source`` records the originating pipeline (``gemini`` or ``granola``).
    ``extra_tags`` are passed through to build_frontmatter (e.g. PLT routing tag).
    ``attendees`` is the invite list from the source Gemini doc.
    ``transcript`` (when present) is appended under TRANSCRIPT_HEADING, after the
    summary, so the note still opens on the summary.
    Returns the path of the written file.
    """
    iso_date = parse_date_to_iso(date) if date else "0000-00-00"

    safe_subject = re.sub(r'[<>:"/\\|?*]', "", subject)
    safe_subject = re.sub(r"\s+", " ", safe_subject).strip()[:80]
    filename = f"{iso_date} \u2014 {safe_subject}.md"

    folder_path = output_dir / subfolder
    folder_path.mkdir(parents=True, exist_ok=True)

    frontmatter = build_frontmatter(
        iso_date,
        subject,
        subfolder,
        metadata,
        source=source,
        extra_tags=extra_tags,
        attendees=attendees,
    )
    content = f"{frontmatter}\n# {subject}\n\n**Date:** {date}\n\n---\n\n{body}"
    if transcript:
        content = f"{content.rstrip()}\n\n{TRANSCRIPT_HEADING}\n\n{transcript.strip()}\n"

    out_path = folder_path / filename
    out_path.write_text(content, encoding="utf-8")
    return out_path


# ─── Granola sync ──────────────────────────────────────────────────────────────


def load_granola_state(path: Path = GRANOLA_STATE_PATH) -> dict:
    """Load Granola sync state. Missing/unreadable file → empty defaults.

    Returns {"last_scan": <iso str|None>, "processed_ids": [<meeting id>, ...]}.
    """
    default = {"last_scan": None, "processed_ids": []}
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default
    return {
        "last_scan": data.get("last_scan"),
        "processed_ids": list(data.get("processed_ids", [])),
    }


def save_granola_state(path: Path, state: dict) -> None:
    """Persist Granola sync state, creating the parent directory if needed."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")


def matching_group(people: list[dict], routing: Routing) -> Optional[GroupRule]:
    """First group rule satisfied by the people present, or None."""
    for rule in routing.group_rules:
        if route_group(people, rule):
            return rule
    return None


def _prepare_drive_mirror(drive_service, routing: Routing) -> dict[str, str]:
    """Ensure Drive folders exist when mirroring is configured; {} when it is not."""
    if not routing.drive_parent_folder_id or drive_service is None:
        return {}
    print("[meeting-notes] Checking Drive folder structure...")
    folder_map = ensure_drive_folders(
        drive_service, routing.drive_parent_folder_id, routing.folders
    )
    # Rename any existing notes that still use the old RFC 2822 date prefix
    rename_existing_notes(drive_service, folder_map)
    return folder_map


def run_granola_sync(
    meetings: list[dict],
    drive_service,
    folder_map: dict[str, str],
    state_path: Path = GRANOLA_STATE_PATH,
    client: Optional[anthropic.Anthropic] = None,
    output_dir: Path = LOCAL_NOTES_DIR,
    runs_dir: Optional[Path] = None,
    routing: Optional[Routing] = None,
) -> int:
    """Run fetched Granola meetings through the shared note pipeline.

    Each meeting dict carries {id, title, content, date}. Meetings whose id is
    already in the saved state are skipped. Each remaining meeting is categorized
    into a subfolder, saved to Drive, and written locally with source=granola.
    Successfully processed ids are added to processed_ids; failures are logged and
    left out of the state so they retry on the next run. last_scan is set to now.
    Returns the number of meetings processed.
    """
    routing = routing or load_routing()
    ai_client = client or load_claude_client()
    state = load_granola_state(state_path)
    processed_ids = list(state.get("processed_ids", []))
    already = set(processed_ids)

    processed = 0
    saved_notes: list[tuple[str, str]] = []

    for meeting in meetings:
        mid = meeting.get("id")
        if mid in already:
            print(f"  [skip] Granola meeting already processed: {mid}")
            continue

        title = meeting.get("title", "(untitled)")
        body = meeting.get("content", "")
        date = meeting.get("date", "")

        try:
            subfolder = categorize_note(title, body, routing.folders, client=ai_client)
            metadata = extract_note_metadata(
                title, body, client=ai_client, tagging_guide=routing.tagging_guide
            )

            # Group routing: a configured group present in force reroutes the note.
            extra_tags = None
            group = matching_group(metadata.get("people", []), routing)
            if group:
                subfolder = group.folder
                extra_tags = [group.folder]

            if drive_service is not None:
                save_note_to_drive(drive_service, title, body, date, folder_map[subfolder])
            local_path = save_note_locally(
                title,
                body,
                date,
                subfolder,
                metadata,
                output_dir=output_dir,
                source="granola",
                extra_tags=extra_tags,
            )

            processed_ids.append(mid)
            already.add(mid)
            saved_notes.append((title, subfolder))
            processed += 1
            print(f"  [✓] '{title}' → {subfolder}/ (granola, local: {local_path.name})")
        except Exception as exc:
            print(f"  [✗] Failed to process Granola meeting {mid}: {exc}")

    state["processed_ids"] = processed_ids
    state["last_scan"] = datetime.now(timezone.utc).isoformat()
    save_granola_state(state_path, state)

    print(f"[meeting-notes] Granola sync done. {processed}/{len(meetings)} new meeting(s) saved.")
    _log_run(processed, [title for title, _ in saved_notes], runs_dir)
    _print_summary(processed, saved_notes)
    return processed


# ─── Main pipeline ─────────────────────────────────────────────────────────────


def run_sync(
    historical: bool = False,
    token_path: Path = DEFAULT_TOKEN_PATH,
    creds_path: Path = DEFAULT_CREDS_PATH,
    client: Optional[anthropic.Anthropic] = None,
    runs_dir: Optional[Path] = None,
    output_dir: Optional[Path] = None,
    routing: Optional[Routing] = None,
) -> int:
    """
    Full sync pipeline. Returns number of notes processed.

    ``output_dir`` overrides where local .md copies are written (defaults to
    LOCAL_NOTES_DIR). Tests MUST pass it — save_note_locally binds
    LOCAL_NOTES_DIR as a default argument at import time, so monkeypatching the
    module attribute does not redirect writes and a test run would overwrite real
    notes in knowledge-hub/ (which is gitignored, so there is no undo).
    """
    notes_dir = output_dir or LOCAL_NOTES_DIR
    routing = routing or load_routing()
    print("[meeting-notes] Starting sync...")

    creds = load_credentials(token_path, creds_path, scopes=oauth_scopes(routing))
    gmail_service = build("gmail", "v1", credentials=creds)
    # Drive is needed for the source-doc export even without mirroring; the
    # Drive *write* path (folders, uploads, renames) only runs when configured.
    drive_service = build("drive", "v3", credentials=creds)
    folder_map = _prepare_drive_mirror(drive_service, routing)

    # Ensure Gmail label exists
    label_id = ensure_processed_label(gmail_service)

    # Find matching emails
    msg_ids = search_gemini_notes(gmail_service, historical=historical)
    if not msg_ids:
        print(
            f"[meeting-notes] No {'unprocessed' if not historical else ''} Notes by Gemini found."
        )
        _log_run(0, [], runs_dir)
        _print_summary(0, [])
        return 0

    print(f"[meeting-notes] Found {len(msg_ids)} note(s) to process.")
    ai_client = client or load_claude_client()
    processed = 0
    saved_notes: list[tuple[str, str]] = []  # (subject, subfolder)

    for msg_id in msg_ids:
        try:
            content = get_email_content(gmail_service, msg_id)

            # Pull the source Gemini doc for the full transcript + invite list.
            # Best-effort: a doc we can't reach must not cost us the summary.
            doc_md = ""
            if content["doc_id"]:
                try:
                    doc_md = export_doc_markdown(drive_service, content["doc_id"])
                except Exception as exc:
                    print(f"  [!] Could not export source doc {content['doc_id']}: {exc}")
            attendees = parse_invited(doc_md)
            transcript = split_transcript(doc_md)

            subfolder = categorize_note(
                content["subject"], content["body"], routing.folders, client=ai_client
            )

            # Extract structured metadata via Claude
            metadata = extract_note_metadata(
                content["subject"],
                content["body"],
                client=ai_client,
                tagging_guide=routing.tagging_guide,
            )

            # Person folders come from the invite list and, for docs with no
            # invite list, from who spoke in the transcript.
            extra_tags = person_folders(
                attendees, speakers=parse_speakers(transcript), person_map=routing.person_folders
            )

            # Group routing: a configured group present in force reroutes the note.
            group = matching_group(metadata.get("people", []), routing)
            if group:
                subfolder = group.folder
                extra_tags = [group.folder] + extra_tags

            # Mirror to Google Drive when configured
            file_id = None
            if folder_map:
                file_id = save_note_to_drive(
                    drive_service,
                    content["subject"],
                    content["body"],
                    content["date"],
                    folder_map[subfolder],
                )

            # Save local .md copy with YAML frontmatter
            local_path = save_note_locally(
                content["subject"],
                content["body"],
                content["date"],
                subfolder,
                metadata,
                output_dir=notes_dir,
                extra_tags=extra_tags,
                attendees=attendees,
                transcript=transcript,
            )

            mark_processed(gmail_service, msg_id, label_id)
            print(
                f"  [✓] '{content['subject']}' → {subfolder}/ "
                f"({'doc: ' + file_id + ', ' if file_id else ''}local: {local_path.name})"
            )
            saved_notes.append((content["subject"], subfolder))
            processed += 1
        except Exception as exc:
            print(f"  [✗] Failed to process message {msg_id}: {exc}")

    print(f"[meeting-notes] Done. {processed}/{len(msg_ids)} notes saved.")
    _log_run(processed, [subject for subject, _ in saved_notes], runs_dir)
    _print_summary(processed, saved_notes)
    return processed


def _print_summary(count: int, notes: list[tuple[str, str]]) -> None:
    """Print a human-readable summary for the Claude Code chat."""
    print("\n--- sync summary ---")
    if count == 0:
        print("No new meeting notes found.")
        return
    print(f"Synced {count} meeting note{'s' if count != 1 else ''}:")
    for subject, subfolder in notes:
        print(f"  • [{subfolder}] {subject}")


# ─── CLI ───────────────────────────────────────────────────────────────────────


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    """Parse CLI flags."""
    parser = argparse.ArgumentParser(
        description="Sync Notes-by-Gemini emails from Gmail to Google Drive."
    )
    parser.add_argument(
        "--auth",
        action="store_true",
        help="Run the Google OAuth flow and save credentials, then exit.",
    )
    parser.add_argument(
        "--historical",
        action="store_true",
        help="Process all matching emails, not just unread ones.",
    )
    parser.add_argument(
        "--granola-input",
        default=None,
        metavar="PATH",
        help=(
            "Path to a JSON file of Granola meetings fetched via MCP "
            "(list of {id, title, content, date}). Runs them through the note "
            "pipeline instead of the Gmail sync."
        ),
    )
    return parser.parse_args(argv)


def _ipv4_first(addrinfo_results: list) -> list:
    """Sort getaddrinfo results so IPv4 (AF_INET) entries come first."""
    return sorted(addrinfo_results, key=lambda r: 0 if r[0] == socket.AF_INET else 1)


def _prefer_ipv4() -> None:
    """Make socket.getaddrinfo return IPv4 addresses first (idempotent).

    Some networks advertise IPv6 but can't actually route it. httplib2 — the
    transport under the Google API client — has no Happy-Eyeballs fallback (curl
    does), so it blocks on the dead AAAA address until timeout and the whole sync
    fails with a socket TimeoutError. Reordering so A records come first makes the
    client connect over IPv4 while still leaving IPv6 as a fallback where it works.
    """
    if getattr(socket, "_ozos_ipv4_preferred", False):
        return
    _orig_getaddrinfo = socket.getaddrinfo

    def _patched(host, port, family=0, type=0, proto=0, flags=0):
        return _ipv4_first(_orig_getaddrinfo(host, port, family, type, proto, flags))

    socket.getaddrinfo = _patched
    socket._ozos_ipv4_preferred = True


def main(argv: Optional[list[str]] = None) -> None:
    """CLI entrypoint."""
    _prefer_ipv4()
    args = parse_args(argv)

    if args.auth:
        print("[meeting-notes] Running OAuth flow...")
        load_credentials(scopes=oauth_scopes(load_routing()))
        print(f"[meeting-notes] Token saved to {DEFAULT_TOKEN_PATH}")
        return

    if args.granola_input:
        run_granola_from_file(Path(args.granola_input))
        return

    if not DEFAULT_TOKEN_PATH.exists() and not DEFAULT_CREDS_PATH.exists():
        print(
            "[meeting-notes] Gmail not configured — skipping. Put your Google OAuth client at "
            f"{DEFAULT_CREDS_PATH} and run with --auth once (Setup → Meeting notes)."
        )
        return

    run_sync(historical=args.historical)


def run_granola_from_file(
    input_path: Path,
    token_path: Path = DEFAULT_TOKEN_PATH,
    creds_path: Path = DEFAULT_CREDS_PATH,
    state_path: Path = GRANOLA_STATE_PATH,
    client: Optional[anthropic.Anthropic] = None,
    routing: Optional[Routing] = None,
) -> int:
    """Load Granola meetings from a JSON file and run them through the pipeline.

    Sets up Google credentials and Drive folders, then delegates to
    run_granola_sync. Returns the number of meetings processed.
    """
    print(f"[meeting-notes] Starting Granola sync from {input_path}...")
    meetings = json.loads(Path(input_path).read_text(encoding="utf-8"))
    if not isinstance(meetings, list):
        raise ValueError("Granola input must be a JSON list of meeting objects.")

    if not meetings:
        print("[meeting-notes] No Granola meetings in input file.")
        _print_summary(0, [])
        return 0

    routing = routing or load_routing()
    drive_service = None
    folder_map: dict[str, str] = {}
    if routing.drive_parent_folder_id:
        creds = load_credentials(token_path, creds_path, scopes=oauth_scopes(routing))
        drive_service = build("drive", "v3", credentials=creds)
        folder_map = _prepare_drive_mirror(drive_service, routing)

    return run_granola_sync(
        meetings,
        drive_service=drive_service,
        folder_map=folder_map,
        state_path=state_path,
        client=client,
        routing=routing,
    )


if __name__ == "__main__":
    main(sys.argv[1:])
