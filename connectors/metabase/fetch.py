"""CLI: fetch one Metabase dashboard's data and print it as JSON.

Usage:
    python3 connectors/metabase/fetch.py "https://metabase.example.com/dashboard/123-name"
    python3 tools/metabase/fetch.py 123

Prints a summary to stderr and the full structured data as JSON to stdout,
so you can pipe it: `python3 tools/metabase/fetch.py 123 > dashboard.json`.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from client import MetabaseClient


def main():
    if len(sys.argv) < 2:
        print("Usage: fetch.py <dashboard-url-or-id>", file=sys.stderr)
        sys.exit(1)

    target = sys.argv[1]
    client = MetabaseClient()
    data = client.fetch_dashboard_data(target)

    name = data["dashboard"]["name"]
    print(
        f"Dashboard {data['dashboard']['id']} — {name!r}: {len(data['cards'])} card(s) fetched.",
        file=sys.stderr,
    )
    for card in data["cards"]:
        print(
            f"  - {card['name']!r}: {len(card['rows'])} row(s), columns={card['columns']}",
            file=sys.stderr,
        )

    print(json.dumps(data, indent=2, default=str))


if __name__ == "__main__":
    main()
