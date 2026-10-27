# Metabase connector — setup

A read-only client for one Metabase instance. The `/ozos-setup` skill walks through this
file for the **First data point** item; the item itself stays a placeholder until Phase 4
wires data points into Data Hub tiles, so finishing this today means "the client can read
a dashboard", nothing more.

## What it gives you

- `python3 connectors/metabase/fetch.py <dashboard url or id>` prints every queryable card
  on a dashboard as JSON (columns and rows).
- `MetabaseClient().fetch_dashboard_data(...)` for scripts and, later, Data Hub data points.
- Nothing is written to Metabase. The client only reads dashboards and card results.

## What you need

- The Metabase host, e.g. `https://metabase.yourcompany.com` (host only, no path).
- Either an **API key** (Metabase → Admin → Settings → Authentication → API keys) or a
  **username and password**. Configure both if you can: the key is tried first and the
  password login is the fallback when the key's group lacks permission on a card.
- One dashboard you are allowed to view, to verify with.

## Steps

1. Add the credentials to the **vault** `.env` (never the engine):

   ```
   METABASE_URL=https://metabase.yourcompany.com
   METABASE_API_KEY=mb_...
   METABASE_USERNAME=you@yourcompany.com   # optional fallback
   METABASE_PASSWORD=...                   # optional fallback
   ```

   The Setup page does not write these yet (Phase 4 adds the data-point form); edit the
   file by hand or let `/ozos-setup` append the lines.

2. Install the connector's only dependency if it is missing: `pip3 install requests`.

3. Leave the **First data point** item as it is, or mark it `skipped` until Phase 4:

   ```bash
   ./ozos setup mark first-data-point skipped --notes "client verified; data points arrive in Phase 4"
   ```

## How to verify

```bash
python3 connectors/metabase/fetch.py 4242      # any dashboard id you can open
```

Expect JSON with a `dashboard` object and a `cards` list. `METABASE_URL is not set` means
the vault `.env` was not found or the line is missing; a `403` on every card means the API
key's group lacks access and no username/password fallback is configured.
