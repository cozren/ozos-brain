import subprocess
import re
from pathlib import Path

COMPETENCY_KEYS = [
    "business-operational-knowledge",
    "data-knowledge",
    "industry-domain-knowledge",
    "strategy-definition",
    "user-knowledge",
    "delivery",
    "discovery",
    "driving-impact",
    "optimization",
    "collaboration",
    "leadership-evangelism",
    "stakeholder-management",
    "overall",
]

HEADER_TO_KEY = {
    "business & operational": "business-operational-knowledge",
    "data knowledge": "data-knowledge",
    "industry & domain": "industry-domain-knowledge",
    "strategy definition": "strategy-definition",
    "user knowledge": "user-knowledge",
    "- delivery": "delivery",
    "- discovery": "discovery",
    "driving impact": "driving-impact",
    "- optimization": "optimization",
    "- collaboration": "collaboration",
    "leadership & evangelism": "leadership-evangelism",
    "training & mentoring": "leadership-evangelism",
    "stakeholder management": "stakeholder-management",
}

RATING_MAP = {
    "exceeding expectations": "exceeding-expectations",
    "meeting expectations": "meeting-expectations",
    "need improvement": "need-improvement",
    "needs improvement": "need-improvement",
    "n/a": "n-a",
    "not applicable": "n-a",
}

RATING_PATTERN = re.compile(
    r"^(exceeding expectations|meeting expectations|needs? improvement|n/a|not applicable)$",
    re.IGNORECASE,
)

OVERALL_SELF_PATTERN = re.compile(
    r"how would you rate your overall performance",
    re.IGNORECASE,
)

OVERALL_MANAGER_PATTERN = re.compile(
    r"how would you evaluate this person",
    re.IGNORECASE,
)

# Detects " : Product - " section headers
SECTION_PATTERN = re.compile(r" : product - ", re.IGNORECASE)


def extract_text_from_pdf(pdf_path: Path) -> str:
    result = subprocess.run(
        ["pdftotext", str(pdf_path), "-"], capture_output=True, text=True, check=True
    )
    return result.stdout


def _find_section_key(line: str) -> str | None:
    lower = line.lower()
    for substr, key in HEADER_TO_KEY.items():
        if substr in lower:
            return key
    return None


def _find_rating(line: str) -> str | None:
    m = RATING_PATTERN.match(line.strip())
    if m:
        raw = m.group(0).lower().replace("needs ", "need ")
        return RATING_MAP.get(raw) or RATING_MAP.get(m.group(0).lower())
    return None


def parse_competencies_from_text(text: str) -> dict[str, dict]:
    """
    Returns {"self": {...}, "manager": {...}}.

    For combined PDFs (manager + self-evaluation in one document): the first
    rating found in each competency section is always the manager's; the
    second is the self-evaluator's.  This holds regardless of how pdftotext
    linearises the two-column layout.

    For single-role PDFs, role is inferred from the document text and all
    ratings are assigned to that role.
    """
    lines = text.splitlines()
    stripped_set = {l.strip() for l in lines}

    result: dict[str, dict] = {
        "self": {k: None for k in COMPETENCY_KEYS},
        "manager": {k: None for k in COMPETENCY_KEYS},
    }

    # Combined PDFs always have both standalone labels from the review tool.
    is_combined = "Manager" in stripped_set and "Self-evaluation" in stripped_set

    if not is_combined:
        # Single-role: detect which role and assign first rating per section.
        role = "self" if "self-evaluation" in text.lower() else "manager"
        _parse_single_role(lines, result[role])
        return result

    # Combined PDF: collect ratings per section; 1st → manager, 2nd → self.
    current_key: str | None = None
    section_ratings: list[str] = []
    in_overall_self = False
    in_overall_manager = False

    def flush():
        if current_key and current_key != "overall" and section_ratings:
            if len(section_ratings) >= 1 and result["manager"][current_key] is None:
                result["manager"][current_key] = section_ratings[0]
            if len(section_ratings) >= 2 and result["self"][current_key] is None:
                result["self"][current_key] = section_ratings[1]

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if SECTION_PATTERN.search(stripped):
            key = _find_section_key(stripped)
            if key:
                flush()
                section_ratings = []
                current_key = key
                in_overall_self = False
                in_overall_manager = False
                continue

        if OVERALL_SELF_PATTERN.search(stripped):
            flush()
            section_ratings = []
            current_key = "overall"
            in_overall_self = True
            in_overall_manager = False
            continue

        if OVERALL_MANAGER_PATTERN.search(stripped):
            current_key = "overall"
            in_overall_self = False
            in_overall_manager = True
            continue

        rating = _find_rating(stripped)
        if rating:
            if current_key == "overall":
                if in_overall_self and result["self"]["overall"] is None:
                    result["self"]["overall"] = rating
                elif in_overall_manager and result["manager"]["overall"] is None:
                    result["manager"]["overall"] = rating
            elif current_key is not None:
                section_ratings.append(rating)

    flush()
    return result


def _parse_single_role(lines: list[str], target: dict) -> None:
    """Fill target dict with first rating found per competency section."""
    current_key: str | None = None
    overall_assigned = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if SECTION_PATTERN.search(stripped):
            key = _find_section_key(stripped)
            if key:
                current_key = key
                continue

        if OVERALL_SELF_PATTERN.search(stripped) or OVERALL_MANAGER_PATTERN.search(stripped):
            current_key = "overall"
            continue

        rating = _find_rating(stripped)
        if rating and current_key:
            if current_key == "overall":
                if not overall_assigned:
                    target["overall"] = rating
                    overall_assigned = True
            elif target[current_key] is None:
                target[current_key] = rating


def ingest_pdf(pdf_path: Path, person_id: str, cycle_id: str, label: str) -> dict:
    """Extract text, parse competencies for both roles, write markdown + update summary.yaml."""
    from . import data as svc

    text = extract_text_from_pdf(pdf_path)
    parsed = parse_competencies_from_text(text)

    md_filename = pdf_path.stem + ".md"
    cycle_dir = svc.get_cycle_dir(person_id, cycle_id)
    cycle_dir.mkdir(parents=True, exist_ok=True)
    (cycle_dir / md_filename).write_text(f"# {label}\n\n{text}", encoding="utf-8")

    summary = svc.get_cycle_summary(person_id, cycle_id) or {}
    comp = summary.setdefault("competencies", {})

    for role, competencies in parsed.items():
        if not any(v is not None for v in competencies.values()):
            continue
        existing = comp.get(role, {})
        for key, val in competencies.items():
            if val is not None and existing.get(key) is None:
                existing[key] = val
        comp[role] = existing

    svc.write_cycle_summary(person_id, cycle_id, summary)
    return parsed
