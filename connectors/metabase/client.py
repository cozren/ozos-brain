"""Direct, read-only Metabase REST API client.

Scope: this client only ever reads a *dashboard you point it at* (and the
result rows of the cards on it) or a *card id you point it at*. It does not
browse databases, schemas, collections, or any other content. Configuration
lives in environment variables (see .env.example); the dashboard or card is
supplied per call.

Auth precedence:
  1. METABASE_API_KEY -> sent as the X-API-Key header (preferred, no expiry).
  2. METABASE_USERNAME + METABASE_PASSWORD -> POST /api/session to obtain a
     session token, sent as X-Metabase-Session (fallback; token is cached
     for the life of the client instance).
"""

import os
import re
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

# Credentials live in the vault .env (never in the engine checkout).
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "skills"))
import ozos_vault  # noqa: E402


def vault_env_path() -> Path:
    return ozos_vault.vault_dir() / ".env"


class MetabaseClient:
    """Read-only, dashboard-scoped HTTP client for Metabase."""

    def __init__(self):
        load_dotenv(vault_env_path())
        base_url = os.getenv("METABASE_URL")
        if not base_url:
            raise ValueError(
                "METABASE_URL is not set. Add it to the vault .env "
                "(just the host, e.g. https://metabase.example.com)."
            )
        self.base_url = base_url.rstrip("/")

        self._api_key = os.getenv("METABASE_API_KEY") or None
        self._username = os.getenv("METABASE_USERNAME") or None
        self._password = os.getenv("METABASE_PASSWORD") or None
        self._session_token = None
        # Flipped once the API key is denied and we fall back to session auth,
        # so subsequent requests go straight to the working method.
        self._force_session = False

        if not self._api_key and not (self._username and self._password):
            raise ValueError(
                "No Metabase auth configured. Set METABASE_API_KEY, or both "
                "METABASE_USERNAME and METABASE_PASSWORD, in your .env file."
            )

    # -- auth ---------------------------------------------------------------

    def _ensure_session_token(self) -> str:
        """Create (and cache) a session token from username/password."""
        if self._session_token:
            return self._session_token
        resp = requests.post(
            f"{self.base_url}/api/session",
            json={"username": self._username, "password": self._password},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        self._session_token = resp.json()["id"]
        return self._session_token

    @property
    def _has_credentials(self) -> bool:
        return bool(self._username and self._password)

    @property
    def _headers(self) -> dict:
        """Auth + content headers for every request."""
        headers = {"Content-Type": "application/json"}
        if self._api_key and not self._force_session:
            headers["X-API-Key"] = self._api_key
        else:
            headers["X-Metabase-Session"] = self._ensure_session_token()
        return headers

    def _send(self, method: str, url: str, json=None, timeout=60):
        """Dispatch a single request with the current auth headers."""
        if method == "GET":
            return requests.get(url, headers=self._headers, timeout=timeout)
        if method == "POST":
            return requests.post(url, json=json, headers=self._headers, timeout=timeout)
        raise ValueError(f"Unsupported method: {method}")

    def _request(self, method: str, url: str, json=None, timeout=60):
        """Send a request with the current auth, falling back from a denied
        (403) API key to credential-based session auth exactly once."""
        try:
            resp = self._send(method, url, json=json, timeout=timeout)
            resp.raise_for_status()
            return resp
        except requests.exceptions.HTTPError as exc:
            denied = getattr(exc.response, "status_code", None) == 403
            can_fall_back = (
                denied and self._api_key and not self._force_session and self._has_credentials
            )
            if not can_fall_back:
                raise RuntimeError(f"Metabase request failed: {exc}") from exc
            # API key lacks permission — switch to session auth and retry once.
            self._force_session = True
            try:
                resp = self._send(method, url, json=json, timeout=timeout)
                resp.raise_for_status()
                return resp
            except requests.exceptions.HTTPError as exc2:
                raise RuntimeError(f"Metabase request failed: {exc2}") from exc2

    # -- helpers ------------------------------------------------------------

    @staticmethod
    def parse_dashboard_id(url_or_id) -> int:
        """Resolve a dashboard id from a raw id or a Metabase dashboard URL.

        Accepts 7, "7", or "https://host/dashboard/7-some-slug".
        Raises ValueError for anything that is not a dashboard reference.
        """
        if isinstance(url_or_id, int):
            return url_or_id
        text = str(url_or_id).strip()
        if text.isdigit():
            return int(text)
        match = re.search(r"/dashboard/(\d+)", text)
        if not match:
            raise ValueError(
                f"Could not find a dashboard id in {url_or_id!r}. "
                "Expected a number or a .../dashboard/<id>-... URL."
            )
        return int(match.group(1))

    # -- requests -----------------------------------------------------------

    def get_dashboard(self, dashboard_id) -> dict:
        """GET /api/dashboard/:id — the dashboard definition and its cards."""
        dashboard_id = self.parse_dashboard_id(dashboard_id)
        resp = self._request("GET", f"{self.base_url}/api/dashboard/{dashboard_id}", timeout=60)
        return resp.json()

    def query_dashcard(self, dashboard_id, dashcard_id, card_id, parameters=None) -> dict:
        """POST the query endpoint for a single card on a dashboard.

        Returns the raw result payload ({"data": {"rows", "cols"}, ...}).
        """
        url = (
            f"{self.base_url}/api/dashboard/{dashboard_id}"
            f"/dashcard/{dashcard_id}/card/{card_id}/query"
        )
        payload = {"parameters": parameters or []}
        resp = self._request("POST", url, json=payload, timeout=120)
        return resp.json()

    def query_card(self, card_id, parameters=None) -> dict:
        """POST /api/card/:id/query — run a saved question (card) directly,
        without going through a dashboard. Returns the raw result payload
        ({"data": {"rows", "cols"}, ...}). Row volume must be small; for
        large results use a dashboard's export endpoint instead."""
        url = f"{self.base_url}/api/card/{int(card_id)}/query"
        payload = {"parameters": parameters or []}
        resp = self._request("POST", url, json=payload, timeout=120)
        return resp.json()

    def run_native_query(self, database_id, sql) -> list[dict]:
        """POST /api/dataset — run a native SQL query against a database id.

        Returns rows as dicts keyed by column name (like `export_dashcard`,
        but for an ad-hoc native query rather than a saved card). Metabase can
        report a query failure as an HTTP 200/202 body carrying
        `status="failed"`; that is raised as a RuntimeError rather than
        silently returning no rows."""
        url = f"{self.base_url}/api/dataset"
        payload = {
            "database": int(database_id),
            "type": "native",
            "native": {"query": sql},
        }
        resp = self._request("POST", url, json=payload, timeout=180)
        body = resp.json()
        if isinstance(body, dict) and body.get("status") == "failed":
            raise RuntimeError(f"Metabase query failed: {body.get('error', body)!r}")
        data = body.get("data", {}) if isinstance(body, dict) else {}
        cols = [col.get("name") for col in data.get("cols", [])]
        return [dict(zip(cols, row)) for row in data.get("rows", [])]

    def export_dashcard(
        self, dashboard_id, dashcard_id, card_id, parameters=None, timeout=180
    ) -> list[dict]:
        """POST the JSON *export* endpoint for a dashcard — unlike query_dashcard
        this bypasses Metabase's 2000-row display cap. Body is form-encoded.
        Returns rows as dicts keyed by column name. Upstream query failures can
        arrive as HTTP 200 with a dict body — treated as errors."""
        import json as _json

        url = (
            f"{self.base_url}/api/dashboard/{dashboard_id}"
            f"/dashcard/{dashcard_id}/card/{card_id}/query/json"
        )
        headers = {k: v for k, v in self._headers.items() if k != "Content-Type"}
        resp = requests.post(
            url,
            data={"parameters": _json.dumps(parameters or []), "format_rows": "false"},
            headers=headers,
            timeout=timeout,
        )
        resp.raise_for_status()
        body = resp.json()
        if isinstance(body, dict):
            raise RuntimeError(f"Metabase export failed: {body.get('error', body)!r}")
        return body

    def fetch_dashboard_data(self, url_or_id) -> dict:
        """Read a dashboard and the result rows of every queryable card on it.

        Returns:
            {
              "dashboard": {"id", "name"},
              "cards": [{"card_id", "dashcard_id", "name", "columns", "rows"}],
            }
        Text/heading dashcards (no underlying card) are skipped.
        """
        dashboard_id = self.parse_dashboard_id(url_or_id)
        dashboard = self.get_dashboard(dashboard_id)
        dashcards = dashboard.get("dashcards") or dashboard.get("ordered_cards") or []

        cards = []
        for dashcard in dashcards:
            card_id = dashcard.get("card_id")
            if card_id is None:
                continue  # text box, heading, or otherwise non-queryable
            result = self.query_dashcard(
                dashboard_id=dashboard_id,
                dashcard_id=dashcard["id"],
                card_id=card_id,
            )
            data = result.get("data", {})
            cards.append(
                {
                    "card_id": card_id,
                    "dashcard_id": dashcard["id"],
                    "name": (dashcard.get("card") or {}).get("name"),
                    "columns": [col.get("name") for col in data.get("cols", [])],
                    "rows": data.get("rows", []),
                }
            )

        return {
            "dashboard": {"id": dashboard.get("id"), "name": dashboard.get("name")},
            "cards": cards,
        }
