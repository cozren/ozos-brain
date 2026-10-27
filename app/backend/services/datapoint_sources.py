"""Fetch a data point's rows from its source.

Three sources, one function: `fetch(source) -> (columns, rows)`.
  metabase  runs a saved card through the read-only metabase connector
  sqlite    runs a query against a SQLite file inside the vault (read-only)
  csv       reads a CSV inside the vault (first row = header), optionally one column

Metabase credentials are re-read from the vault .env on every call because the
Setup page writes that file while the backend runs. The connector reads
`os.getenv` in its constructor, so the values are pushed into the process
environment first (`load_dotenv` would never override a stale value).
"""

from __future__ import annotations

import csv
import math
import os
import re
import sqlite3
import sys
from pathlib import Path

from dotenv import dotenv_values

from ..config import REPO_ROOT
from . import datapoints, setup_actions

ENV_FILE: Path = setup_actions.ENV_FILE  # tests monkeypatch
ENV_NAMES = ("METABASE_URL", "METABASE_API_KEY")
_ALL_NAMES = ENV_NAMES + ("METABASE_USERNAME", "METABASE_PASSWORD")
ROW_CAP = 1000

_INT_RE = re.compile(r"^-?\d+$")


# ── metabase ────────────────────────────────────────────────────────────


def metabase_credentials() -> tuple[dict[str, str], list[str]]:
    """Values from the vault .env (fresh read), else the process env, else "".
    `missing` names METABASE_URL when blank and METABASE_API_KEY when the key is
    blank and no username/password pair stands in for it."""
    file_values = dotenv_values(ENV_FILE) if ENV_FILE.is_file() else {}
    values = {
        name: str(file_values.get(name) or os.environ.get(name) or "").strip()
        for name in _ALL_NAMES
    }
    missing: list[str] = []
    if not values["METABASE_URL"]:
        missing.append("METABASE_URL")
    has_login = values["METABASE_USERNAME"] and values["METABASE_PASSWORD"]
    if not values["METABASE_API_KEY"] and not has_login:
        missing.append("METABASE_API_KEY")
    return values, missing


def connector_status() -> dict:
    _, missing = metabase_credentials()
    return {"configured": not missing, "missing": missing}


def metabase_client(creds: dict[str, str]):
    """The connector's MetabaseClient, constructed against `creds` (test seam)."""
    connector_dir = str(REPO_ROOT / "connectors" / "metabase")
    if connector_dir not in sys.path:
        sys.path.insert(0, connector_dir)
    from client import MetabaseClient  # noqa: E402

    for name, value in creds.items():
        if name.startswith("METABASE_") and value:
            os.environ[name] = value
    return MetabaseClient()


def fetch_metabase(source: dict, creds: dict[str, str]) -> tuple[list[str], list[list]]:
    body = metabase_client(creds).query_card(source["card_id"])
    if not isinstance(body, dict):
        raise RuntimeError("Metabase returned no result")
    if body.get("status") == "failed":
        raise RuntimeError(str(body.get("error") or "Metabase query failed"))
    data = body.get("data") or {}
    columns = [str(col.get("name")) for col in data.get("cols") or []]
    rows = [list(row) for row in (data.get("rows") or [])[:ROW_CAP]]
    return columns, rows


def test_metabase() -> str:
    """One authenticated GET; the message names the connected user."""
    creds, missing = metabase_credentials()
    if missing:
        raise LookupError(f"{missing[0]} is not set")
    try:
        client = metabase_client(creds)
        body = client._request("GET", f"{client.base_url}/api/user/current").json()
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc
    who = (body or {}).get("email") or (body or {}).get("common_name") or "user"
    return f"Connected as {who}"


# ── sqlite ──────────────────────────────────────────────────────────────


def _vault_file(rel: str) -> Path:
    path = datapoints.vault_path(rel)
    if not path.is_file():
        raise FileNotFoundError(f"{rel} not found in the vault")
    return path


def _authorizer(action, *_args) -> int:
    """Read-only mode blocks writes to the opened file; this blocks ATTACH, which
    would otherwise create a database file at any path (outside the vault)."""
    if action == sqlite3.SQLITE_ATTACH:
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


def fetch_sqlite(source: dict) -> tuple[list[str], list[list]]:
    path = _vault_file(source["path"])
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            con.set_authorizer(_authorizer)
            cur = con.execute(source["query"])
            columns = [str(d[0]) for d in (cur.description or [])]
            rows = [list(r) for r in cur.fetchmany(ROW_CAP)]
        finally:
            con.close()
    except sqlite3.Error as exc:
        raise RuntimeError(str(exc)) from exc
    return columns, rows


# ── csv ─────────────────────────────────────────────────────────────────


def coerce(cell: str):
    """int when it looks like one, float when it parses, None when blank, else text."""
    text = cell.strip()
    if text == "":
        return None
    if _INT_RE.match(text):
        return int(text)
    try:
        number = float(text)
    except ValueError:
        return text
    # NaN/inf cannot travel through JSON; a blank is what the user sees anyway.
    return number if math.isfinite(number) else None


def fetch_csv(source: dict) -> tuple[list[str], list[list]]:
    path = _vault_file(source["path"])
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        header = next(reader, None)
        if not header:
            raise RuntimeError("CSV has no header row")
        columns = [h.strip() for h in header]
        rows = [[coerce(c) for c in row] for row in reader if row][:ROW_CAP]
    column = source.get("column")
    if column:
        if column not in columns:
            raise RuntimeError(f"column '{column}' not in CSV")
        at = columns.index(column)
        return [column], [[row[at] if at < len(row) else None] for row in rows]
    return columns, rows


# ── dispatch ────────────────────────────────────────────────────────────


def fetch(source: dict) -> tuple[list[str], list[list]]:
    kind = source.get("kind")
    if kind == "metabase":
        creds, missing = metabase_credentials()
        if missing:
            raise LookupError(f"{missing[0]} is not set")
        return fetch_metabase(source, creds)
    if kind == "sqlite":
        return fetch_sqlite(source)
    if kind == "csv":
        return fetch_csv(source)
    raise ValueError(f"unknown source kind: {kind}")
