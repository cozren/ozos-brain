"""CLI: python -m services.briefing <person_id>"""

import sys
from . import data as svc
from .llm_client import make_anthropic_client, model


def briefing(person_id: str) -> None:
    person = svc.get_person_meta(person_id)
    if not person:
        print(f"Person '{person_id}' not found.")
        sys.exit(1)

    cycles = svc.read_cycles()
    active_id = cycles.get("active_cycle", "")
    summary = svc.get_cycle_summary(person_id, active_id) or {}

    prompt = f"""
You are preparing a pre-1:1 briefing for {person["display_name"]}.

Cycle: {active_id}
Rating: {summary.get("manager_rating", "not set")}
Goals: {", ".join(summary.get("key_goals", []))}

Competency self-scores:
{chr(10).join(f"  {k}: {v}" for k, v in (summary.get("competencies", {}).get("self") or {}).items() if v)}

Write a concise briefing: key topics to cover, areas of concern, and one suggested discussion question.
Keep it under 200 words.
"""
    client = make_anthropic_client()
    print(f"\n=== PRE-1:1 BRIEFING: {person['display_name'].upper()} ===\n")
    with client.messages.stream(
        model=model(),
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
    print("\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m services.briefing <person_id>")
        sys.exit(1)
    briefing(sys.argv[1])
