# metabase

Direct, **read-only** Metabase REST client. It only reads a dashboard you point
it at and the result rows of the cards on that dashboard — no database, schema,
or collection browsing.

## In the app

Data points of kind `metabase` (Setup → Data points, or the Data Hub empty state) call
`MetabaseClient.query_card(card_id)` through `POST /api/datapoints/<id>/refresh` and cache
the columns and rows in `<vault>/.ozos/datapoint-cache/`. The Setup page writes
`METABASE_URL` and `METABASE_API_KEY` into the vault `.env`; `POST /api/datapoints/metabase/test`
makes one authenticated request to check them. See `setup.md`.

## Configuration (vault `.env`)

```
METABASE_URL=https://your-metabase-host        # host only, no path
METABASE_API_KEY=...                            # preferred (X-API-Key header)
METABASE_USERNAME=you@company.com               # fallback / used when the key is denied
METABASE_PASSWORD=...
```

**Auth precedence:** the API key is tried first. If Metabase returns **403** (the
key's group lacks permission on that dashboard/card), the client transparently
logs in with the username/password and retries via a session token. Configure
either or both.

## Usage

```bash
# Fetch every queryable card on a dashboard as JSON
python3 connectors/metabase/fetch.py "https://host/dashboard/4242-ads-performance-dashboard"
python3 connectors/metabase/fetch.py 4242
```

In code:

```python
from client import MetabaseClient
mb = MetabaseClient()
data = mb.fetch_dashboard_data("https://host/dashboard/4242-...")
# -> {"dashboard": {...}, "cards": [{"name", "columns", "rows", ...}, ...]}
```

`fetch_dashboard_data` currently fetches cards with their default filters.
Per-card dashboard parameters (date ranges, currency, etc.) are passed via
`query_dashcard(..., parameters=[...])`.

## Tests

```bash
python3 -m pytest connectors/metabase/tests/ -q
```
