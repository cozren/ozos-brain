# Metabase connector — setup

A read-only client for one Metabase instance. The `/ozos-setup` skill walks through this
file for the **Data points** item. Metabase is optional: a data point can also be a SQL
query against a SQLite file in the vault or a CSV in the vault, neither of which needs
credentials. Finish this file when you want a saved Metabase question on a Data Hub tile.

## What it gives you

- A **Metabase card** as a data point source: the app runs the saved question
  (`POST /api/card/:id/query`, default filters) and caches its columns and rows in the vault.
- `python3 connectors/metabase/fetch.py <dashboard url or id>` prints every queryable card
  on a dashboard as JSON, handy for finding card ids and checking what a card returns.
- Nothing is written to Metabase. The client only reads cards and dashboards.

## What you need

- The Metabase host, e.g. `https://metabase.yourcompany.com` (host only, no path).
- Either an **API key** (Metabase → Admin → Settings → Authentication → API keys) or a
  **username and password**. The key is tried first; the password login is the fallback
  when the key's group lacks permission on a card.
- The id of one saved question (card) you can open: it is the number in the card's URL,
  `https://metabase.yourcompany.com/question/42-weekly-signups` → `42`.

## Steps

1. Save the credentials. On **Setup → Data points → Connect Metabase**, fill `METABASE_URL`
   and `METABASE_API_KEY` and press *Save to .env*; they go into the **vault** `.env`
   (never the engine) and are not shown again. Without the app:

   ```
   METABASE_URL=https://metabase.yourcompany.com
   METABASE_API_KEY=mb_...
   METABASE_USERNAME=you@yourcompany.com   # optional fallback, by hand only
   METABASE_PASSWORD=...                   # optional fallback, by hand only
   ```

2. Press **Test connection** (one authenticated request; it answers *Connected as …*), or
   `curl -X POST http://localhost:8765/api/datapoints/metabase/test`.

3. Install the connector's only dependency if it is missing: `pip3 install requests`.

4. Define the data point in the same panel: a name, source *Metabase card* with the card
   id, a display (`number`, `table`, `line`), a refresh (`manual`, `daily`) and a unit.
   The item turns *Done* with the first data point of any kind.

5. Put it on a tile: **Data Hub → Add tab**, then the tile's `+` lists your data points.
   Press the tile's refresh icon once; `daily` points refresh through the
   `datapoints-refresh` vital on the Control Tower afterwards.

## How to verify

The tile shows the card's first value (or its rows, or a line). If it shows an error:

- `METABASE_URL is not set` — the vault `.env` lacks the line; save it in Setup.
- `Metabase request failed: 401` — wrong key or password.
- `403` — the key's group lacks access to that card and no username/password fallback is
  configured.
- `Metabase query failed: …` — the question itself fails in Metabase; open it there.

Setup → Data points shows the same error next to the point and the item reads
**Needs attention** until the next refresh succeeds.
