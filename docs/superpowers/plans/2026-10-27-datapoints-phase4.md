# Data points (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Data points defined in the vault (Metabase card, SQLite query or CSV), cached values, generic Data Hub tiles that render them as a number, table or line, a Data setup item that saves the Metabase credentials and holds the form, a daily refresh vital, and the goal-to-data-point binding.

**Architecture:** `<vault>/.ozos/datapoints.json` holds the definitions; `<vault>/.ozos/datapoint-cache/<id>.json` holds one cached value (or error) per point. A backend service owns definitions, a sources module owns the three fetchers, and a `/api/datapoints` router exposes list, add, patch, delete, refresh one, refresh all, value and a Metabase connection test. The Data Hub keeps `DashboardCanvas`, `DashboardPicker` and `DashboardTile` as the shell; a tile's `refId` now resolves against data point ids and the picker lists data points. The `first-data-point` Setup item stops being a placeholder (kind `data`), the `./ozos datapoints refresh` command is the `datapoints-refresh` vital, and the Goals board gains a data point selector per goal.

**Tech Stack:** Python 3 (FastAPI, pydantic, sqlite3, csv, the metabase connector's `requests` client, pytest), React 19 + Vite + TypeScript (vitest, @testing-library/react, recharts already in `package.json`), Playwright screenshots.

**Spec:** The binding design lives in the private archive repo as `docs/superpowers/specs/2026-10-27-ozos-app-vault-extraction-design.md` (section 6.6 shell paragraph, section 6.8 item 9, the Phase 4 line of section 7). It is not copied here because it names company terms. The task brief for this phase (decisions already made) is reproduced in the Rulings section below where it narrows the spec.

## Global Constraints

- TDD: failing test first, watch it fail for the right reason, minimal code, green. Whole suite before any task is done: `python3 tools/test-pipeline/pipeline.py` → `0 failing`, no `NOT COLLECTED`.
- Frontend gate: `cd app/frontend && npx tsc --noEmit && npx vitest run`. `npm run build` is not a gate.
- Format before commit: `python3 -m ruff format tools/ skills/ app/ connectors/` and `cd app/frontend && npm run format`.
- Tests never touch a real vault, `~/.ozos` or the network: monkeypatch module-level `*_FILE` / `*_DIR` constants and the `datapoint_sources.fetch_*` seams with `tmp_path` / lambdas.
- No "today" literal in tests; compute from `datetime.now()`.
- Never write company names, people, hostnames or ids into the engine. `./ozos scrub-check` runs in the pre-commit hook; never `--no-verify`. Example wording only (`yourcompany`, `Weekly signups`, card id `42`).
- System `python3` only. No new Python dependencies (`requests` is the metabase connector's; `sqlite3` and `csv` are stdlib). No new npm dependency (`recharts` is already installed).
- Nothing in this phase writes outside the vault.
- Commit format `[tool-name] …` (`[app]`, `[ozos-cli]`, `[connectors]`, `[docs]`, `[vault-template]`). Push to `origin main` after every task.
- Frontend increments are each verified with a headless Playwright screenshot (`python3 ~/.claude/skills/design-audit/shoot.py <url> <png> --width 1280`) against `design-system/ozos-brain/MASTER.md` (dark theme, Fira Code/Sans, Lucide icons, `cursor: pointer`, visible focus, 150–300 ms transitions).
- Vocabularies defined once in the backend and mirrored in `types/datapoints.ts`: `KINDS = ("metabase", "sqlite", "csv")`, `DISPLAYS = ("number", "table", "line")`, `REFRESHES = ("manual", "daily")`.

## Review Focus

1. `datapoints.json` missing, `{}` or malformed → `GET /api/datapoints` returns an empty list; a point whose `display` or `refresh` is unknown is kept with the default (`number`, `manual`) rather than dropped (Task 1).
2. A sqlite or csv `path` that escapes the vault (`../x`, absolute) → 422 and nothing read; a missing file → an `error` in the cache, not an exception out of the refresh (Task 2).
3. A Metabase card whose result body carries `status: "failed"` or whose request raises → `error` cached, `fetched_at` updated, previous rows gone; the Setup item shows *Needs attention* only while a cache file holds an error (Task 2, Task 1).
4. Deleting a data point removes its cache file but leaves `datahub.json` untouched; a tile whose `refId` is unknown renders *Data point removed* with a working remove action, and the picker never lists it (Task 1, Task 5).
5. Binding a synced goal to a data point is allowed (only `data_point_id`); the bound value shows beside progress and never writes `progress`; a goal bound to a deleted data point shows *no value*, not a crash (Task 8).

---

### Task 1: Data point store, registry item, setup view, vault template

**Files:**
- Create: `app/backend/services/datapoints.py`
- Modify: `app/backend/config.py` (add `OZOS_DATAPOINTS_FILE = OZOS_CONFIG_DIR / "datapoints.json"` and `OZOS_DATAPOINT_CACHE_DIR = OZOS_CONFIG_DIR / "datapoint-cache"`)
- Modify: `app/backend/services/setup_registry.py` (the `first-data-point` item; docstring `kind` list gains `data`, drops `placeholder`)
- Modify: `app/backend/services/setup_view.py` (seams `load_datapoints_health`, `count_datapoints`; derived done for kind `data`; synthetic health wins over a file vital of the same id)
- Create: `vault-template/.ozos/datapoints.json`; Modify: `vault-template/.gitignore` (add `.ozos/datapoint-cache/`)
- Test: `app/backend/tests/test_datapoints.py`; extend `test_setup_registry.py`, `test_setup_view.py`; update `test_setup_actions.py::test_env_write_whitelist_and_no_echo` (six names in `env_status()`), the fixtures in `test_setup_view.py` and `test_setup_router.py` (stub `setup_view.load_datapoints_health = lambda: None` and `setup_view.count_datapoints = lambda: 0`)

**Interfaces:**
- `datapoints.KINDS = ("metabase", "sqlite", "csv")`, `DISPLAYS = ("number", "table", "line")`, `REFRESHES = ("manual", "daily")`, `SETUP_ITEM = "first-data-point"`, `VITAL_ID = "datapoints-refresh"`, `DATAPOINTS_FILE: Path`, `CACHE_DIR: Path` (from config; tests monkeypatch both).
- Data point shape (every key always present): `{"id": str, "name": str, "source": dict, "display": str, "refresh": str, "unit": str, "created_at": str}`. `id = slug(name)` (import `_slug` from `setup_actions` as `slug`).
- Source shapes (`normalize_source(raw: dict) -> dict`, `ValueError` on anything else): `{"kind": "metabase", "card_id": int}` (`card_id` must be a positive int; a digit string is accepted and converted); `{"kind": "sqlite", "path": str, "query": str}` (both non-blank); `{"kind": "csv", "path": str, "column": str | None}` (path non-blank; blank column → `None`). Paths are stored as given; `vault_path(rel: str) -> Path` (also in this module) resolves `CACHE_DIR.parent.parent / rel` and raises `ValueError("path must stay inside the vault")` when the resolved path is absolute-outside or escapes (`Path.resolve()` + `relative_to`), so Task 2 and the validator share one rule. `normalize_source` calls `vault_path` for sqlite and csv so an escaping path is rejected at definition time.
- `normalize_datapoint(raw: dict) -> dict`: non-empty `name` (`ValueError`), `display in DISPLAYS`, `refresh in REFRESHES`, `unit` str (default `""`), source via `normalize_source`.
- `load_datapoints() -> list[dict]`: missing/malformed file tolerated; an entry with a bad `display`/`refresh` is kept with `number`/`manual`; an entry with a blank name or an invalid source is dropped.
- `save_datapoints(points: list[dict]) -> None` (atomic, `indent=2`, writes `{"datapoints": [...]}`).
- `get_datapoint(dp_id) -> dict` (`KeyError`), `count() -> int`.
- `add_datapoint(payload: dict) -> dict`: `id = slug(name)` (`ValueError` when empty), `FileExistsError` on duplicate, `created_at = now`.
- `update_datapoint(dp_id, patch: dict) -> dict`: allowed keys `name, source, display, refresh, unit`; `KeyError` unknown; re-validates; the id never changes; when `source` changes the cache file is deleted (a stale value for a new source is wrong).
- `delete_datapoint(dp_id) -> None`: `KeyError` unknown; removes `CACHE_DIR / f"{dp_id}.json"` if present; never touches `datahub.json`.
- Cache: `cache_path(dp_id) -> Path`; `read_value(dp_id) -> dict` → `{"id", "fetched_at": str | None, "columns": list, "rows": list, "error": str | None}` (`fetched_at None, [] , [], None` when no file or malformed); `write_rows(dp_id, columns, rows, now=None)` writes `{"fetched_at", "columns", "rows"}`; `write_error(dp_id, message, now=None)` writes `{"fetched_at", "error"}` (no rows).
- `refresh_health() -> dict | None`: `None` when `count() == 0`; else `{"id": VITAL_ID, "status": "fail", "message": "<name>: <error>"}` for the first point whose cache holds an error, otherwise `{"id": VITAL_ID, "status": "ok", "message": ""}`.
- Registry: `first-data-point` becomes `title "Data points"`, `why "Define a data point (Metabase card, SQL against a SQLite file, or a CSV in the vault); tiles on the Data Hub and goal measures can only show data points."`, `writes ".ozos/datapoints.json, .env (METABASE_URL, METABASE_API_KEY)"`, `kind "data"`, `setup_doc` unchanged, `vital "datapoints-refresh"`, `env ["METABASE_URL", "METABASE_API_KEY"]`. `ITEM_IDS` order unchanged. `env_whitelist()` → the four `ATLASSIAN_*` then `METABASE_URL`, `METABASE_API_KEY`.
- `setup_view`: `load_datapoints_health = datapoints.refresh_health`, `count_datapoints = datapoints.count` (seams). `build_view`: file vitals first, then synthetic health entries (`goals_sync`, `datapoints_health`) **overwrite** a same-id file vital (they know about errors, the file vital only knows mtimes). `_item_view`: for `kind == "data"`, `derived = {**(derived or {}), "datapoints": {"count": n}}` and `status = "done"` when `n > 0 and status != "skipped"` (derived, never stored); the vital check runs after, so a done item with a failed refresh still becomes `needs_attention`.
- `vault-template/.ozos/datapoints.json` = `{"datapoints": []}`.

- [ ] **Step 1: Failing tests**

`test_datapoints.py` (fixture `dp_env` monkeypatches `datapoints.DATAPOINTS_FILE = tmp_path / "vault" / ".ozos" / "datapoints.json"`, `datapoints.CACHE_DIR = tmp_path / "vault" / ".ozos" / "datapoint-cache"`):

```python
def test_load_tolerates_missing_malformed_and_bad_fields(dp_env):
    assert load_datapoints() == []
    DATAPOINTS_FILE.parent.mkdir(parents=True); DATAPOINTS_FILE.write_text("{nope")
    assert load_datapoints() == []
    DATAPOINTS_FILE.write_text(json.dumps({"datapoints": [
        {"id": "a", "name": "A", "source": {"kind": "metabase", "card_id": 42}, "display": "pie", "refresh": "hourly"},
        {"id": "b", "name": "", "source": {"kind": "metabase", "card_id": 1}},
        {"id": "c", "name": "C", "source": {"kind": "ftp"}},
    ]}))
    [a] = load_datapoints()
    assert a["display"] == "number" and a["refresh"] == "manual" and a["unit"] == ""

def test_normalize_source_shapes_and_vault_escape(dp_env):
    assert normalize_source({"kind": "metabase", "card_id": "42"}) == {"kind": "metabase", "card_id": 42}
    assert normalize_source({"kind": "csv", "path": "data/signups.csv", "column": ""}) == {"kind": "csv", "path": "data/signups.csv", "column": None}
    assert normalize_source({"kind": "sqlite", "path": "data/app.db", "query": "select 1"})["query"] == "select 1"
    for bad in ({"kind": "metabase", "card_id": 0}, {"kind": "sqlite", "path": "x.db", "query": " "},
                {"kind": "csv", "path": "../outside.csv"}, {"kind": "csv", "path": "/etc/passwd"}, {"kind": "ftp"}):
        with pytest.raises(ValueError): normalize_source(bad)

def test_add_update_delete(dp_env):
    dp = add_datapoint({"name": "Weekly signups", "source": {"kind": "metabase", "card_id": 42}, "display": "number", "refresh": "daily", "unit": "users"})
    assert dp["id"] == "weekly-signups" and dp["created_at"]
    assert json.loads(DATAPOINTS_FILE.read_text())["datapoints"][0]["unit"] == "users"
    with pytest.raises(FileExistsError): add_datapoint({"name": "Weekly Signups!", "source": {"kind": "metabase", "card_id": 1}})
    with pytest.raises(ValueError): add_datapoint({"name": "  ", "source": {"kind": "metabase", "card_id": 1}})
    with pytest.raises(ValueError): add_datapoint({"name": "x", "source": {"kind": "metabase", "card_id": 1}, "display": "pie"})
    write_rows("weekly-signups", ["n"], [[5]])
    upd = update_datapoint("weekly-signups", {"name": "Signups", "display": "line"})
    assert upd["id"] == "weekly-signups" and upd["name"] == "Signups" and read_value("weekly-signups")["rows"] == [[5]]
    update_datapoint("weekly-signups", {"source": {"kind": "metabase", "card_id": 43}})
    assert read_value("weekly-signups")["fetched_at"] is None  # source changed → cache dropped
    with pytest.raises(KeyError): update_datapoint("nope", {"unit": "x"})
    write_rows("weekly-signups", ["n"], [[5]])
    delete_datapoint("weekly-signups")
    assert load_datapoints() == [] and not cache_path("weekly-signups").exists()
    with pytest.raises(KeyError): delete_datapoint("weekly-signups")

def test_cache_value_and_health(dp_env):
    assert refresh_health() is None
    add_datapoint({"name": "A", "source": {"kind": "metabase", "card_id": 1}})
    assert read_value("a") == {"id": "a", "fetched_at": None, "columns": [], "rows": [], "error": None}
    assert refresh_health() == {"id": "datapoints-refresh", "status": "ok", "message": ""}
    write_rows("a", ["x", "y"], [[1, 2]])
    v = read_value("a"); assert v["columns"] == ["x", "y"] and v["rows"] == [[1, 2]] and v["error"] is None and v["fetched_at"]
    write_error("a", "boom")
    v = read_value("a"); assert v["error"] == "boom" and v["rows"] == []
    assert refresh_health() == {"id": "datapoints-refresh", "status": "fail", "message": "A: boom"}
```

`test_setup_registry.py`: change `test_define_goals_is_a_real_item`'s whitelist assertion to the six names; add

```python
def test_first_data_point_is_a_real_item():
    it = item("first-data-point")
    assert it["kind"] == "data" and it["vital"] == "datapoints-refresh"
    assert it["env"] == ["METABASE_URL", "METABASE_API_KEY"]
    assert not any(i["kind"] == "placeholder" for i in ITEMS)

def test_vault_template_has_empty_datapoints_file_and_ignores_cache():
    assert json.loads((REPO_ROOT / "vault-template" / ".ozos" / "datapoints.json").read_text()) == {"datapoints": []}
    assert ".ozos/datapoint-cache/" in (REPO_ROOT / "vault-template" / ".gitignore").read_text()
```

`test_setup_view.py` (fixture gains the two new stubs):

```python
def test_data_item_derives_done_from_count_and_needs_attention_from_health(view_env, monkeypatch):
    assert _items(build_view())["first-data-point"]["status"] == "not_started"
    monkeypatch.setattr(setup_view, "count_datapoints", lambda: 2)
    it = _items(build_view())["first-data-point"]
    assert it["status"] == "done" and it["derived"]["datapoints"] == {"count": 2}
    monkeypatch.setattr(setup_view, "load_datapoints_health", lambda: {"id": "datapoints-refresh", "status": "fail", "message": "A: boom"})
    assert _items(build_view())["first-data-point"]["status"] == "needs_attention"
    set_status("first-data-point", "skipped")
    assert _items(build_view())["first-data-point"]["status"] == "skipped"

def test_synthetic_health_wins_over_file_vital(view_env, monkeypatch):
    monkeypatch.setattr(setup_view, "count_datapoints", lambda: 1)
    monkeypatch.setattr(setup_view, "load_vitals", lambda: [{"id": "datapoints-refresh", "status": "ok"}])
    monkeypatch.setattr(setup_view, "load_datapoints_health", lambda: {"id": "datapoints-refresh", "status": "fail", "message": "x"})
    assert _items(build_view())["first-data-point"]["status"] == "needs_attention"
```

`test_setup_actions.py::test_env_write_whitelist_and_no_echo`: `env_status()` now also has `"METABASE_URL": False, "METABASE_API_KEY": False`; add `write_env({"METABASE_URL": "https://mb.yourcompany.com"})` → `load_state()["items"]["first-data-point"]["status"] == "not_started"` (credentials never mark Data done).

- [ ] **Step 2: Run, expect `ModuleNotFoundError: backend.services.datapoints` and the registry/view assertions failing**

Run: `cd app && python3 -m pytest backend/tests/test_datapoints.py backend/tests/test_setup_registry.py backend/tests/test_setup_view.py backend/tests/test_setup_actions.py -q`

- [ ] **Step 3: Implement `datapoints.py`, the config constants, the registry item, the view seams, the template file and gitignore line**

- [ ] **Step 4: Green, pipeline, format, commit, push**

```bash
python3 -m ruff format app/ && python3 tools/test-pipeline/pipeline.py
git add app/backend/services/datapoints.py app/backend/config.py app/backend/services/setup_registry.py app/backend/services/setup_view.py vault-template/.ozos/datapoints.json vault-template/.gitignore app/backend/tests/
git commit -m "[app] data point store and cache in the vault; Data setup item derives done from the first point"
git push origin main
```

---

### Task 2: Sources — Metabase card, SQLite query, CSV — and refresh

**Files:**
- Create: `app/backend/services/datapoint_sources.py`
- Modify: `app/backend/services/datapoints.py` (add `refresh_datapoint`, `refresh_all`)
- Test: `app/backend/tests/test_datapoint_sources.py`, extend `test_datapoints.py`

**Interfaces:**
- `datapoint_sources.ENV_FILE: Path` (defaults to `setup_actions.ENV_FILE`; tests monkeypatch), `ENV_NAMES = ("METABASE_URL", "METABASE_API_KEY")`, `ROW_CAP = 1000`.
- `metabase_credentials() -> tuple[dict[str, str], list[str]]`: like `goals_sync.credentials()` for `METABASE_URL`, `METABASE_API_KEY`, `METABASE_USERNAME`, `METABASE_PASSWORD` (re-read from `ENV_FILE` on every call, `os.environ` fallback); `missing` lists `METABASE_URL` when blank and `METABASE_API_KEY` when the key is blank **and** username/password are not both set.
- `connector_status() -> {"configured": bool, "missing": [names]}`.
- `metabase_client(creds) -> MetabaseClient` (module attribute, test seam): inserts `<engine>/connectors/metabase` on `sys.path`, imports `client.MetabaseClient`; before constructing it, sets `os.environ[name] = value` for every non-empty `METABASE_*` cred (the client reads `os.getenv` in `__init__`; `load_dotenv` would not override a stale process value).
- `fetch_metabase(source, creds) -> tuple[list[str], list[list]]`: `client.query_card(source["card_id"])`; a body with `status == "failed"` → `RuntimeError(body.get("error") or "Metabase query failed")`; else `([c["name"] for c in data["cols"]], data["rows"][:ROW_CAP])`.
- `fetch_sqlite(source) -> tuple[list[str], list[list]]`: `path = datapoints.vault_path(source["path"])`; `FileNotFoundError(f"{source['path']} not found in the vault")` when missing; `sqlite3.connect(f"file:{path}?mode=ro", uri=True)`; `cur.execute(query)`; columns from `cur.description`; `fetchmany(ROW_CAP)`; rows as lists; `sqlite3.Error` → `RuntimeError(str(exc))`.
- `fetch_csv(source) -> tuple[list[str], list[list]]`: `csv.reader` with `newline=""`, first row = header (`RuntimeError("CSV has no header row")` when empty); cells coerced with `coerce(cell)` (int when `^-?\d+$`, float when `float()` parses, else the string; blank → `None`); when `source["column"]` is set, the result keeps **only** that column (`KeyError` → `RuntimeError(f"column '{column}' not in CSV")`); rows capped at `ROW_CAP`.
- `fetch(source: dict) -> tuple[list[str], list[list]]`: dispatch on `kind`; for `metabase`, `creds, missing = metabase_credentials()`; `missing` → `LookupError(f"{missing[0]} is not set")`.
- `test_metabase() -> str`: `creds, missing = metabase_credentials()`; `missing` → `LookupError`; `client._request("GET", f"{client.base_url}/api/user/current").json()` → `f"Connected as {body.get('email') or body.get('common_name') or 'user'}"`; any exception → `RuntimeError(str(exc))`.
- `datapoints.refresh_datapoint(dp_id, now=None) -> dict`: `dp = get_datapoint(dp_id)`; `try: columns, rows = datapoint_sources.fetch(dp["source"]) except Exception as exc: write_error(dp_id, str(exc), now) else: write_rows(dp_id, columns, rows, now)`; returns `read_value(dp_id)`.
- `datapoints.refresh_all(daily_only: bool = False, now=None) -> dict` → `{"refreshed": int, "failed": [dp_id...]}` over `load_datapoints()` filtered by `refresh == "daily"` when `daily_only`.

- [ ] **Step 1: Failing tests**

`test_datapoint_sources.py` (fixture `src_env`: `dp_env` from Task 1 plus `datapoint_sources.ENV_FILE = tmp_path / "vault" / ".env"`, `monkeypatch.delenv` for the four `METABASE_*` names):

```python
def test_credentials_and_status(src_env):
    assert connector_status() == {"configured": False, "missing": ["METABASE_URL", "METABASE_API_KEY"]}
    ENV_FILE.write_text('METABASE_URL="https://mb.yourcompany.com"\nMETABASE_USERNAME=u\nMETABASE_PASSWORD=p\n')
    assert connector_status() == {"configured": True, "missing": []}
    ENV_FILE.write_text('METABASE_URL="https://mb.yourcompany.com"\nMETABASE_API_KEY=k\n')
    creds, missing = metabase_credentials(); assert creds["METABASE_API_KEY"] == "k" and missing == []

def test_fetch_metabase_parses_and_raises_on_failed_body(src_env, monkeypatch):
    ENV_FILE.write_text("METABASE_URL=https://mb.yourcompany.com\nMETABASE_API_KEY=k\n")
    class FakeClient:
        def __init__(self, body): self.body = body
        def query_card(self, card_id): assert card_id == 42; return self.body
    ok = {"data": {"cols": [{"name": "week"}, {"name": "signups"}], "rows": [["2026-W01", 10], ["2026-W02", 12]]}}
    monkeypatch.setattr(datapoint_sources, "metabase_client", lambda creds: FakeClient(ok))
    assert fetch({"kind": "metabase", "card_id": 42}) == (["week", "signups"], [["2026-W01", 10], ["2026-W02", 12]])
    monkeypatch.setattr(datapoint_sources, "metabase_client", lambda creds: FakeClient({"status": "failed", "error": "no such table"}))
    with pytest.raises(RuntimeError, match="no such table"): fetch({"kind": "metabase", "card_id": 42})

def test_fetch_metabase_without_credentials(src_env):
    with pytest.raises(LookupError, match="METABASE_URL is not set"): fetch({"kind": "metabase", "card_id": 1})

def test_metabase_client_refreshes_process_env(src_env, monkeypatch):
    ENV_FILE.write_text("METABASE_URL=https://mb.yourcompany.com\nMETABASE_API_KEY=k\n")
    creds, _ = metabase_credentials()
    client = metabase_client(creds)   # real connector class, no request made in __init__
    assert client.base_url == "https://mb.yourcompany.com" and os.environ["METABASE_API_KEY"] == "k"

def test_fetch_sqlite(src_env):
    db = vault_path("data/app.db"); db.parent.mkdir(parents=True)
    con = sqlite3.connect(db); con.execute("create table t (week text, n int)"); con.executemany("insert into t values (?, ?)", [("w1", 1), ("w2", 2)]); con.commit(); con.close()
    assert fetch({"kind": "sqlite", "path": "data/app.db", "query": "select week, n from t order by week"}) == (["week", "n"], [["w1", 1], ["w2", 2]])
    with pytest.raises(RuntimeError, match="no such table"): fetch({"kind": "sqlite", "path": "data/app.db", "query": "select * from nope"})
    with pytest.raises(FileNotFoundError): fetch({"kind": "sqlite", "path": "data/missing.db", "query": "select 1"})
    with pytest.raises(ValueError): fetch({"kind": "sqlite", "path": "../x.db", "query": "select 1"})

def test_fetch_csv_coerces_and_projects(src_env):
    f = vault_path("data/signups.csv"); f.parent.mkdir(parents=True)
    f.write_text("week,signups,note\n2026-W01,10,ok\n2026-W02,12.5,\n")
    assert fetch({"kind": "csv", "path": "data/signups.csv", "column": None}) == (["week", "signups", "note"], [["2026-W01", 10, "ok"], ["2026-W02", 12.5, None]])
    assert fetch({"kind": "csv", "path": "data/signups.csv", "column": "signups"}) == (["signups"], [[10], [12.5]])
    with pytest.raises(RuntimeError, match="not in CSV"): fetch({"kind": "csv", "path": "data/signups.csv", "column": "nope"})
    f.write_text("")
    with pytest.raises(RuntimeError, match="no header"): fetch({"kind": "csv", "path": "data/signups.csv", "column": None})

def test_test_metabase(src_env, monkeypatch):
    with pytest.raises(LookupError): test_metabase()
    ENV_FILE.write_text("METABASE_URL=https://mb.yourcompany.com\nMETABASE_API_KEY=k\n")
    class Ok:
        base_url = "https://mb.yourcompany.com"
        def _request(self, m, url): return types.SimpleNamespace(json=lambda: {"email": "pat@yourcompany.com"})
    monkeypatch.setattr(datapoint_sources, "metabase_client", lambda creds: Ok())
    assert test_metabase() == "Connected as pat@yourcompany.com"
    class Bad(Ok):
        def _request(self, m, url): raise RuntimeError("Metabase request failed: 401")
    monkeypatch.setattr(datapoint_sources, "metabase_client", lambda creds: Bad())
    with pytest.raises(RuntimeError, match="401"): test_metabase()
```

`test_datapoints.py` additions:

```python
def test_refresh_writes_rows_or_error_and_refresh_all_filters_daily(dp_env, monkeypatch):
    add_datapoint({"name": "A", "source": {"kind": "csv", "path": "a.csv", "column": None}, "refresh": "daily"})
    add_datapoint({"name": "B", "source": {"kind": "csv", "path": "b.csv", "column": None}})
    calls = []
    def fake_fetch(source):
        calls.append(source["path"])
        if source["path"] == "b.csv": raise FileNotFoundError("b.csv not found in the vault")
        return ["n"], [[7]]
    monkeypatch.setattr(datapoint_sources, "fetch", fake_fetch)
    assert refresh_datapoint("a")["rows"] == [[7]]
    v = refresh_datapoint("b"); assert v["error"] == "b.csv not found in the vault" and v["fetched_at"]
    with pytest.raises(KeyError): refresh_datapoint("nope")
    calls.clear()
    assert refresh_all(daily_only=True) == {"refreshed": 1, "failed": []} and calls == ["a.csv"]
    assert refresh_all() == {"refreshed": 1, "failed": ["b"]}
```

- [ ] **Step 2: Run, expect `ModuleNotFoundError: backend.services.datapoint_sources`** — `cd app && python3 -m pytest backend/tests/test_datapoint_sources.py backend/tests/test_datapoints.py -q`
- [ ] **Step 3: Implement `datapoint_sources.py` and the two refresh functions**
- [ ] **Step 4: Green, pipeline, format, commit `[app] data point sources: Metabase card, SQLite query, CSV; refresh writes the cache`, push**

---

### Task 3: `/api/datapoints` router

**Files:**
- Create: `app/backend/routers/datapoints.py`
- Modify: `app/backend/main.py` (include router)
- Test: `app/backend/tests/test_datapoints_router.py`

**Interfaces** (`APIRouter(prefix="/datapoints", tags=["datapoints"])`; specific routes declared before `/{dp_id}` ones):
- `GET ""` → `{"datapoints": [...], "connector": connector_status(), "kinds": list(KINDS), "displays": list(DISPLAYS), "refreshes": list(REFRESHES)}`.
- `POST ""` body `NewDataPoint{name: str, source: dict, display: Literal[...] = "number", refresh: Literal[...] = "manual", unit: str = ""}` → the point; `FileExistsError` → 409 `A data point with id '<id>' already exists`; `ValueError` → 422.
- `PUT "/{dp_id}"` body `DataPointPatch` (every field optional, `model_fields_set`) → point; `KeyError` → 404; `ValueError` → 422.
- `DELETE "/{dp_id}"` → `{"deleted": dp_id}`; 404.
- `POST "/refresh"` → `refresh_all()` result.
- `POST "/metabase/test"` → `{"ok": True, "message": test_metabase()}`; `LookupError` → 422; `RuntimeError` → 502.
- `POST "/{dp_id}/refresh"` → `refresh_datapoint(dp_id)` (200 even when the value carries `error`); 404.
- `GET "/{dp_id}/value"` → `read_value(dp_id)` after `get_datapoint` (404 unknown).

- [ ] **Step 1: Failing tests** (fixture: `datapoints.DATAPOINTS_FILE`, `datapoints.CACHE_DIR`, `datapoint_sources.ENV_FILE` → tmp; delenv the four names)

```python
def test_get_empty_shape(env):
    body = client.get("/api/datapoints").json()
    assert body["datapoints"] == [] and body["connector"]["configured"] is False
    assert body["displays"] == ["number", "table", "line"] and body["refreshes"] == ["manual", "daily"] and body["kinds"][0] == "metabase"

def test_post_put_delete(env):
    r = client.post("/api/datapoints", json={"name": "Weekly signups", "source": {"kind": "metabase", "card_id": 42}, "display": "number", "unit": "users"})
    assert r.status_code == 200 and r.json()["id"] == "weekly-signups" and r.json()["refresh"] == "manual"
    assert client.post("/api/datapoints", json={"name": "weekly signups", "source": {"kind": "metabase", "card_id": 1}}).status_code == 409
    assert client.post("/api/datapoints", json={"name": "x", "source": {"kind": "csv", "path": "../x.csv"}}).status_code == 422
    assert client.post("/api/datapoints", json={"name": "x", "source": {"kind": "metabase", "card_id": 1}, "display": "pie"}).status_code == 422
    assert client.put("/api/datapoints/weekly-signups", json={"refresh": "daily"}).json()["refresh"] == "daily"
    assert client.put("/api/datapoints/nope", json={"unit": "x"}).status_code == 404
    assert client.delete("/api/datapoints/weekly-signups").json() == {"deleted": "weekly-signups"}
    assert client.delete("/api/datapoints/weekly-signups").status_code == 404

def test_value_refresh_and_refresh_all(env, monkeypatch):
    client.post("/api/datapoints", json={"name": "A", "source": {"kind": "csv", "path": "a.csv"}, "refresh": "daily"})
    assert client.get("/api/datapoints/a/value").json() == {"id": "a", "fetched_at": None, "columns": [], "rows": [], "error": None}
    assert client.get("/api/datapoints/nope/value").status_code == 404
    monkeypatch.setattr(datapoint_sources, "fetch", lambda s: (["n"], [[3]]))
    assert client.post("/api/datapoints/a/refresh").json()["rows"] == [[3]]
    def boom(s): raise RuntimeError("bad file")
    monkeypatch.setattr(datapoint_sources, "fetch", boom)
    r = client.post("/api/datapoints/a/refresh"); assert r.status_code == 200 and r.json()["error"] == "bad file"
    assert client.post("/api/datapoints/refresh").json() == {"refreshed": 0, "failed": ["a"]}
    assert client.post("/api/datapoints/nope/refresh").status_code == 404

def test_metabase_test_endpoint(env, monkeypatch):
    r = client.post("/api/datapoints/metabase/test"); assert r.status_code == 422 and "METABASE_URL" in r.json()["detail"]
    monkeypatch.setattr(datapoint_sources, "test_metabase", lambda: "Connected as pat@yourcompany.com")
    assert client.post("/api/datapoints/metabase/test").json() == {"ok": True, "message": "Connected as pat@yourcompany.com"}
    def bad(): raise RuntimeError("401")
    monkeypatch.setattr(datapoint_sources, "test_metabase", bad)
    assert client.post("/api/datapoints/metabase/test").status_code == 502
```

(The 422 case needs `test_metabase` real: the fixture leaves `.env` empty so `LookupError` is raised by the real function.)

- [ ] **Step 2: Run, expect 404s** — **Step 3: Implement the router; register in `main.py`** — **Step 4: Green, pipeline, format, commit `[app] /api/datapoints: list, add, patch, delete, refresh, value, Metabase test`, push**

---

### Task 4: `./ozos datapoints refresh` and the `datapoints-refresh` vital

**Files:**
- Modify: `tools/ozos-cli/cli.py` (subcommand `datapoints refresh [--all]`)
- Modify: `vault-template/.ozos/vitals.json` (new entry)
- Test: `tools/ozos-cli/tests/test_datapoints_cmd.py`, extend `app/backend/tests/test_setup_registry.py` (template vital entry)

**Interfaces:**
- `cli.datapoints_refresh(vault: Path, daily_only: bool) -> int`: `sys.path.insert(0, ENGINE_ROOT / "app")`, sets `os.environ["OZOS_VAULT"] = str(vault)` **before** importing `backend.services.datapoints` (config resolves the vault at import), calls `refresh_all(daily_only=daily_only)`, prints one line per point `<id>: <n> rows` or `<id>: error: <message>` (read back from `read_value`), appends `run_log.record_run(vault / ".ozos" / "runs", "datapoints-refresh", refreshed, [ids])`, returns `1` when `failed` is non-empty else `0`. Prints `no data points to refresh` and returns 0 when there are none.
- Parser: `sub.add_parser("datapoints")` with `datapoints_cmd` sub-subparser `refresh` and flag `--all` (default refreshes only `daily` points).
- Vital entry: `{"id": "datapoints-refresh", "name": "datapoints-refresh", "tool": "ozos-cli", "description": "Refreshes every daily data point into the vault cache", "output_dir": ".ozos/datapoint-cache", "output_glob": "*.json", "stale_after_hours": 24, "run": ["python3", "ozos", "datapoints", "refresh"]}`.

- [ ] **Step 1: Failing tests**

```python
def test_datapoints_refresh_cmd(tmp_path, monkeypatch):
    vault = tmp_path / "vault"; (vault / ".ozos").mkdir(parents=True)
    (vault / ".ozos" / "datapoints.json").write_text(json.dumps({"datapoints": [
        {"id": "a", "name": "A", "source": {"kind": "csv", "path": "a.csv", "column": None}, "display": "number", "refresh": "daily", "unit": "", "created_at": "x"},
        {"id": "b", "name": "B", "source": {"kind": "csv", "path": "b.csv", "column": None}, "display": "number", "refresh": "manual", "unit": "", "created_at": "x"}]}))
    (vault / "a.csv").write_text("n\n5\n")
    out = subprocess.run([sys.executable, "ozos", "datapoints", "refresh"], cwd=REPO_ROOT, env={**os.environ, "OZOS_VAULT": str(vault)}, capture_output=True, text=True)
    assert out.returncode == 0 and "a: 1 rows" in out.stdout and "b:" not in out.stdout
    assert json.loads((vault / ".ozos" / "datapoint-cache" / "a.json").read_text())["rows"] == [[5]]
    assert (vault / ".ozos" / "runs" / "datapoints-refresh.jsonl").exists()
    out = subprocess.run([sys.executable, "ozos", "datapoints", "refresh", "--all"], cwd=REPO_ROOT, env={**os.environ, "OZOS_VAULT": str(vault)}, capture_output=True, text=True)
    assert out.returncode == 1 and "b: error: b.csv not found" in out.stdout
```

`test_setup_registry.py`: `test_vault_template_has_datapoints_refresh_vital` → the vitals.json entry with `id == "datapoints-refresh"`, `run == ["python3", "ozos", "datapoints", "refresh"]`, `output_dir == ".ozos/datapoint-cache"`, `stale_after_hours == 24`.

- [ ] **Step 2: Run, expect `invalid choice: 'datapoints'`** — **Step 3: Implement** — **Step 4: Green, pipeline, format, commit `[ozos-cli] datapoints refresh command; datapoints-refresh vital in the vault template`, push**

---

### Task 5: Frontend increment A — tiles render data points

**Files:**
- Create: `app/frontend/src/types/datapoints.ts`, `src/lib/datapoints.ts`, `src/components/datahub/displays/NumberDisplay.tsx`, `TableDisplay.tsx`, `LineDisplay.tsx`, `src/components/datahub/DataPointTile.tsx`
- Modify: `src/api.ts` (`getDataPoints`, `addDataPoint`, `updateDataPoint`, `deleteDataPoint`, `refreshDataPoint`, `refreshAllDataPoints`, `getDataPointValue`, `testMetabase`), `src/components/datahub/dashboards/registry.ts` (becomes the picker item model: `PickerItem {id, label, category?}`, `groupByCategory(items)`, `CATEGORY_ORDER = ['Metabase', 'SQLite', 'CSV']`, `DEFAULT_CATEGORY = 'Other'`; `DASHBOARDS`/`getDashboard`/`DashboardDef` removed), `dashboards/pickerFolders.ts` (type rename only), `DashboardPicker.tsx` (prop `items: PickerItem[]`), `DashboardTile.tsx` (props `refId`, `datapoints`; see below), `DashboardCanvas.tsx` (loads `api.getDataPoints()` once; passes `datapoints` down), `src/styles/datahub.css` (tile value styles)
- Test: `src/lib/__tests__/datapoints.test.ts`, `src/components/datahub/displays/__tests__/*.test.tsx`, `src/components/datahub/__tests__/DataPointTile.test.tsx`; rewrite `DashboardTile.test.tsx`, `DashboardPicker.test.tsx`, `dashboards/__tests__/registry.test.ts`, `pickerFolders.test.ts` to the item model; extend `DashboardCanvas.test.tsx` (mock `getDataPoints`)

**Interfaces:**
- `types/datapoints.ts`: `DataPointKind = 'metabase' | 'sqlite' | 'csv'`; `DataPointSource = {kind:'metabase'; card_id:number} | {kind:'sqlite'; path:string; query:string} | {kind:'csv'; path:string; column:string|null}`; `DataPointDisplay = 'number' | 'table' | 'line'`; `DataPointRefresh = 'manual' | 'daily'`; `DataPoint {id; name; source; display; refresh; unit; created_at}`; `DataPointValue {id; fetched_at: string|null; columns: string[]; rows: unknown[][]; error: string|null}`; `DataPointsPayload {datapoints: DataPoint[]; connector: {configured: boolean; missing: string[]}; kinds; displays; refreshes}`; `NewDataPointPayload {name; source; display; refresh; unit}`; `DataPointPatch = Partial<NewDataPointPayload>`; `RefreshAllResult {refreshed: number; failed: string[]}`.
- `lib/datapoints.ts`: `KIND_LABEL: Record<DataPointKind,string>` → `Metabase, SQLite, CSV`; `toPickerItems(points: DataPoint[]): PickerItem[]` (`{id, label: name, category: KIND_LABEL[kind]}`); `formatNumber(v: unknown, unit: string): string` (numbers with `toLocaleString('en-US', {maximumFractionDigits: 2})` + ` ${unit}` when unit; non-numbers `String(v)`; `null` → `'–'`); `numberOf(value: DataPointValue): {current: unknown; previous: unknown | null; delta: number | null}` (first cell of first row; `previous` = first cell of the second row when there are ≥2 rows and both numeric, `delta = current - previous`); `lineSeries(value): {x: string; y: number}[]` (first column → `String`, second column → `Number`, rows whose y is not finite dropped); `TABLE_CAP = 50`; `tableRows(value): unknown[][]` (first 50); `fetchedAgo(iso: string | null): string` (`'never'`, else `'<n>m ago' / '<n>h ago' / '<n>d ago'` from `Date.now()`).
- `NumberDisplay({ value, unit })`: big mono number (`font-mono 28px 600`, cyan), unit dim, delta line `▲ +12 · from 10` green / `▼` red when `delta !== null`.
- `TableDisplay({ value })`: `<table>` with the columns as `<th>`, capped rows, a footer `Showing 50 of N rows` when capped.
- `LineDisplay({ value })`: recharts `ResponsiveContainer` > `LineChart` with `Line dataKey="y"` stroke `var(--neon-cyan)` (`#00FFFF` literal since recharts needs a color), `XAxis dataKey="x"`, `Tooltip`; renders `<p>Need two columns (x, y)</p>` when `columns.length < 2`.
- `DataPointTile({ dp })`: on mount `api.getDataPointValue(dp.id)`; header row inside the body: `dp.name`, `fetchedAgo` dim, a `Refresh` button (`aria-label="Refresh <name>"`) → `api.refreshDataPoint(dp.id)` → set value; states: loading `Loading…`, `error` → `#EF4444` line with the message, `fetched_at === null && !error` → `Not fetched yet.` plus the Refresh button, otherwise the display chosen by `dp.display`.
- `DashboardTile({ refId, datapoints, onPick, onRemove, pickerFolders, onFoldersChange })`: `refId === null` → `DashboardPicker items={toPickerItems(datapoints)} …`; a known id → `<DataPointTile dp={dp} />`; unknown → body `<div class="datahub-tile__placeholder">Data point removed <button>Remove tile</button></div>` (button calls `onRemove`); the chrome title is `''` for a data point tile (the body shows the name), `Data point removed` for unknown, `Choose a data point` when empty.
- `DashboardCanvas`: state `datapoints: DataPoint[]` loaded with `api.getDataPoints()` (`.catch(() => [])`); the `LoadoutCanvas` `renderTile` passes `refId` and `datapoints`.

- [ ] **Step 1: Failing tests** — lib: `formatNumber(1234.5,'users') === '1,234.5 users'`, `numberOf` delta `12 - 10 = 2`, `lineSeries` drops non-numeric y, `tableRows` caps at 50, `toPickerItems` categories; displays: number shows `1,234 users` and `▲`; table shows header cells and `Showing 50 of 60 rows`; line renders `Need two columns (x, y)` for one column and an `svg` for two (jsdom: `ResponsiveContainer` needs a fixed width/height — pass `width={300} height={120}` props and skip Responsive in tests via a `fixed` prop); `DataPointTile`: `getDataPointValue` called with the id, `Not fetched yet.` then Refresh → `refreshDataPoint` called and the number appears, an error value shows its message; `DashboardTile`: picker lists the data point names by category when `refId` null (click → `onPick('weekly-signups')`), `Data point removed` + `Remove tile` → `onRemove` for an unknown id, a known id renders the tile (mock `DataPointTile`); `DashboardCanvas`: existing tests plus `getDataPoints` mocked.
- [ ] **Step 2: Run `npx vitest run src/lib/__tests__/datapoints.test.ts src/components/datahub` — expect failures**
- [ ] **Step 3: Implement; `npx tsc --noEmit && npx vitest run` green**
- [ ] **Step 4: Screenshot audit** — backend `cd app && python3 -m uvicorn backend.main:app --port 8765`, frontend `npm run dev`; seed in the dev vault a CSV `data/signups.csv` with weekly rows, one `csv` data point of each display through `POST /api/datapoints`, refresh them, a tab `growth` with three tiles through `PUT /api/datahub/layout`; shoot `http://localhost:5173/?page=data-hub` to `<scratchpad>/datahub-a.png`; check against MASTER.md; remove the seeds afterwards.
- [ ] **Step 5: Format, pipeline, commit `[app] Data Hub tiles render data points as number, table or line; picker lists data points`, push**

---

### Task 6: Frontend increment B — Data Hub empty state, data point form, Add tab

**Files:**
- Create: `src/components/datahub/DataPointForm.tsx`
- Modify: `src/pages/DataHub.tsx`
- Test: `src/components/datahub/__tests__/DataPointForm.test.tsx`; extend `src/pages/__tests__/DataHub.test.tsx` (mock `getDataPoints`, `addDataPoint`, `saveDataHubLayout`)

**Interfaces:**
- `DataPointForm({ onSubmit, connectorConfigured })`: fields Name; Source kind `<select aria-label="Source">` (`Metabase card`, `SQLite query`, `CSV file`); per kind: Metabase → `Card id` (`type="number" min=1`) and, when `!connectorConfigured`, a hint `Save METABASE_URL and METABASE_API_KEY in Setup → Data points first.`; SQLite → `File (relative to the vault)` and `Query` (`<textarea>`); CSV → `File (relative to the vault)` and `Column (optional)`; Display `<select>` of the three (default `number`); Refresh `<select>` (`manual`, `daily`); Unit. `Define data point` button disabled until name and the kind's required fields are non-blank. `onSubmit(payload: NewDataPointPayload)` resolves → reset + `Defined <name>.`; 409 → `A data point with that name already exists.`; other `ApiError.detail` shown; else `Could not save.`. Uses `setup/formStyles`.
- `DataHub` page: loads `api.getDataHubLayout()` **and** `api.getDataPoints()`; holds `layout: DataHubLayout`. Empty state (no tabs): when `datapoints.length === 0` → copy `No data points yet.` + `Define your first data point` button toggling the form (`onSubmit` → `api.addDataPoint` → reload data points); when data points exist but no tabs → copy `Add a tab to place your data points.` + the Add-tab control. The tablist always ends with an `Add tab` button (`aria-label="Add tab"`, `Plus` icon) that reveals an inline input (`aria-label="Tab name"`, Enter commits, Escape cancels); commit → `api.saveDataHubLayout({...layout, tabs: {...layout.tabs, [name.trim()]: {rows: []}}})` → select the new tab. A blank or duplicate name is ignored. `DashboardCanvas` keeps loading its own copy (it mounts after the save resolves, so it sees the tab).

- [ ] **Step 1: Failing tests** — form: button disabled until required fields; csv payload `{name:'Weekly signups', source:{kind:'csv', path:'data/signups.csv', column:null}, display:'line', refresh:'daily', unit:''}`; metabase payload `{kind:'metabase', card_id: 42}`; the Metabase hint shows only when not configured; 409 message. Page: existing tests updated (`getDataPoints` resolves `[]` by default); `Define your first data point` reveals the form and `addDataPoint` is called; with one data point and no tabs → `Add a tab to place your data points.`; `Add tab` + typing `growth{Enter}` → `saveDataHubLayout` called with `tabs.growth.rows === []` and the `growth` tab selected.
- [ ] **Steps 2–5** as Task 5; screenshots `datahub-b-empty.png` (fresh vault) and `datahub-b-form.png`; commit `[app] Data Hub: define the first data point from the empty state, add tabs from the page`, push.

---

### Task 7: Frontend increment C — Setup `Data points` panel

**Files:**
- Create: `src/components/setup/DataPanel.tsx`
- Modify: `src/types/setup.ts` (`SetupKind` gains `'data'`, drops `'placeholder'`; `SetupDerived` gains `datapoints?: {count: number}`), `src/components/setup/SetupItemBody.tsx` (`case 'data'`; the `placeholder` case and import go), `src/pages/__tests__/Setup.test.tsx` mock (`getDataPoints`, `addDataPoint`, `deleteDataPoint`, `testMetabase` stubs)
- Delete: `src/components/setup/PlaceholderPanel.tsx` and its test
- Test: `src/components/setup/__tests__/DataPanel.test.tsx`; extend `SetupItemBody.test.tsx` with a `data` item

**Interfaces:**
- `DataPanel({ item, onChanged })`: three blocks with the `CAPTION` style from `GoalsPanel` (move `CAPTION` into `formStyles.ts` and import it in both):
  1. **Connect Metabase** — `EnvForm` with `item.env` and `api.getSetupEnv()`; a `Test connection` button (`PRIMARY`, disabled while busy or when `connector.configured` from `api.getDataPoints()` is false) → `api.testMetabase()` → the returned message in `OK`, or the `ApiError.detail` in `ERR`.
  2. **Define a data point** — `DataPointForm connectorConfigured={configured}` → `api.addDataPoint` → reload + `onChanged()`.
  3. **Your data points** — one row per point: name, `KIND_LABEL`, display, refresh, and the last fetch (`fetchedAgo`) or the cached error in `#EF4444` (values from `api.getDataPointValue` per point on load); a `Delete` button (`aria-label="Delete <name>"`, `window.confirm`) → `api.deleteDataPoint` → reload + `onChanged()`. Empty → `No data points yet.`
  A hint line: `Tiles on the Data Hub and goal measures show data points; daily points refresh through the datapoints-refresh vital on the Control Tower.`

- [ ] **Step 1: Failing tests** — panel: two env inputs by label (`METABASE_URL`, `METABASE_API_KEY`); `Test connection` disabled when not configured, enabled and showing `Connected as pat@yourcompany.com` when configured (mock); the form submits through `addDataPoint` and `onChanged` fires; a listed point with an error value shows the error text and `Delete` calls `deleteDataPoint`; `SetupItemBody` with `kind: 'data'` shows `Test connection`.
- [ ] **Steps 2–5**: implement, `tsc` + vitest green, screenshot `setup-c.png` with the Data points row expanded, commit `[app] Setup page: Data points item saves Metabase credentials, tests the connection, defines and lists data points`, push.

---

### Task 8: Frontend increment D — goals bind to data points

**Files:**
- Modify: `src/components/goals/GoalCard.tsx` (data point selector + measured value), `GoalsBoard.tsx` (loads data points and bound values)
- Test: extend `GoalCard.test.tsx`, `GoalsBoard.test.tsx`

**Interfaces:**
- `GoalCard({ goal, first, onPatch, onDelete, datapoints?, measure? })`: when `datapoints` is given (any goal, manual or synced, since binding is the one field a synced goal accepts) and `onPatch` is given, the meta row gains `<select aria-label="Data point">` with an empty option `No data point` and one option per data point (`value = dp.id`, text = `dp.name`), `value = goal.data_point_id ?? ''`, `onChange → onPatch(goal.id, { data_point_id: value || null })`. When `measure` is given, a `<span data-testid="goal-measure">` beside the progress shows `formatNumber(numberOf(measure.value).current, measure.dp.unit)` + ` · ${measure.dp.name}`, or `no value` when `measure.value.error` or `fetched_at === null`. Progress is never written from the measure.
- `GoalsBoard`: after `getGoals`, `api.getDataPoints().catch(() => [])`; for each goal with `data_point_id` matching a data point, `api.getDataPointValue(id)` (deduplicated by id) → `measures: Record<dpId, DataPointValue>`; passes `datapoints` and `measure={dp && value ? {dp, value} : undefined}` to every card. A goal bound to an id not in `datapoints` gets no measure and the select shows `No data point` (ruling: the stale binding is left in place until the user changes it).

- [ ] **Step 1: Failing tests** — card: the `Data point` select lists `Weekly signups`, changing it calls `onPatch(id, {data_point_id: 'weekly-signups'})`, choosing the empty option passes `null`, a synced goal also gets the select; `goal-measure` shows `1,234 users · Weekly signups`; an errored value shows `no value`; board: `getDataPoints` and `getDataPointValue('weekly-signups')` called once for two goals bound to the same point; the measure appears on both.
- [ ] **Steps 2–5**: implement, green, screenshot `goals-d.png` with one bound goal, commit `[app] Goals bind to a data point and show its latest value beside progress`, push.

---

### Task 9: Skill, connector docs, guide, README, template docs

**Files:**
- Modify: `.claude/skills/ozos-setup/SKILL.md` (table row `first-data-point` kind `data`: `PUT /env` with `METABASE_URL`, `METABASE_API_KEY`; `POST /api/datapoints/metabase/test`; `POST /api/datapoints` body `{"name","source":{"kind":"metabase","card_id":42}|{"kind":"sqlite","path","query"}|{"kind":"csv","path","column"},"display","refresh","unit"}`; `POST /api/datapoints/<id>/refresh`; in-process `from backend.services import datapoints; datapoints.add_datapoint({...}); datapoints.refresh_datapoint(id)`; section 4 lists `first-data-point` as derived done from the first point)
- Modify: `connectors/metabase/setup.md` (rewrite: the item is real; steps = save the two variables on Setup → Data points or by hand, *Test connection*, define a point with a card id, refresh the tile; *How to verify* = the tile shows a number; keep the four headings), `connectors/metabase/README.md` (one paragraph: data points call `query_card`; the Setup page writes `METABASE_URL`/`METABASE_API_KEY`)
- Modify: `docs/SETUP.md`: section 4 table row for Metabase now says Setup writes the two variables; section 5 table row `Data points | Save METABASE_URL + METABASE_API_KEY and test, or skip Metabase; define a point (Metabase card, SQLite query or CSV) and refresh it. See section 9.`; new **section 9 "Data points"** (definition fields, the three sources with path-inside-the-vault rule, the three displays, manual vs daily, the `datapoints-refresh` vital and `./ozos datapoints refresh --all`, Data Hub tabs and tiles, *Data point removed*, goal binding, *Needs attention* on a cached error); renumber *Daily use* → 10 (add `Refresh daily data points | Control Tower → datapoints-refresh, or ./ozos datapoints refresh`), *What is not here yet* → 11 (Phase 5 only), *Troubleshooting* → 12 with three lines (`Data points item says Needs attention`, `A tile says "Not fetched yet"`, `The Control Tower does not list datapoints-refresh` → older vault: copy the entry from `vault-template/.ozos/vitals.json`); A.5 lists the two Metabase names; A.6 `data_point_id` line now says it is the id of a data point; new **A.7 `datapoints.json` and the cache** with both shapes.
- Modify: `README.md` Status (Phase 4 in; next Phase 5), `app/README.md` (Data Hub row: `User-defined tabs of tiles showing data points (/api/datapoints, <vault>/.ozos/datapoints.json)`), `CLAUDE.md` + `AGENTS.md` vault description (`.ozos/` list gains `data points`), `vault-template/CLAUDE.md` if it lists `.ozos` files.
- Test: extend `test_setup_registry.py::test_setup_guide_describes_the_setup_page` (`## 9. Data points`, `### A.7`, `Placeholder until Phase 4` absent, README has `Phase 4`, app README has `/api/datapoints`); add `test_data_docs_no_longer_defer_to_phase_4` (`"Phase 4" not in` metabase `setup.md`, `"placeholder" not in` it, `"first-data-point" in` the skill and `"/api/datapoints" in` the skill and in the connector README).

- [ ] **Steps**: failing doc test → run → edit → green → `./ozos scrub-check` → commit `[docs] SETUP.md Data points section and datapoints.json reference; metabase setup for the Data item; README status to Phase 4` → push.

---

### Task 10: Final verification and review

- [ ] `python3 tools/test-pipeline/pipeline.py` → `0 failing`, no `NOT COLLECTED`.
- [ ] `cd app/frontend && npx tsc --noEmit && npx vitest run` green; `npm run format:check` clean; `python3 -m ruff format --check tools/ skills/ app/ connectors/` clean.
- [ ] `./ozos scrub-check` clean.
- [ ] Boot the app against the dev vault; shoot `data-hub`, `setup` and `goals-tasks` once more.
- [ ] `graphify update .`
- [ ] Dispatch one fresh reviewer (most capable model) over `git diff 37faa1f..HEAD` with the Phase 4 brief and this plan's Review Focus; for every Critical/Important finding: failing test, fix, green, commit, push. Minors go to the final message.
- [ ] `git status --short && git log origin/main..HEAD` both print nothing.

## Rulings made while planning (each with its cost if wrong)

- **Path rule.** sqlite and csv paths are relative to the vault and must resolve inside it; rejected at definition time and again at fetch time. Cost: a database that lives outside the vault must be symlinked or copied in.
- **Cache row cap 1000** (`ROW_CAP`) on top of the display cap of 50 for tables. Cost: a line chart shows at most 1000 points.
- **A failed fetch replaces the previous rows** with the error (one cache file, one state). Cost: no "last good value" shown on a broken tile; the Setup item and the tile both say what broke.
- **Refresh is never a request failure.** `POST /{id}/refresh` answers 200 with the value even when it carries `error`; only an unknown id is a 4xx. Cost: a client has to read `error`, not the status code.
- **Metabase credentials are re-read from the vault `.env` per fetch and pushed into the process env** before the connector class is constructed (the connector reads `os.getenv`). Cost: the backend's `METABASE_*` environment mirrors the vault file; a shell variable is overridden once a value is saved on Setup.
- **`connector_status` is a Metabase status.** sqlite and csv need nothing; the Data item is derived done from the first point of any kind, so Metabase can be skipped entirely. Cost: none.
- **Daily means the `datapoints-refresh` vital.** It is a `./ozos datapoints refresh` run from the Control Tower (or by hand); nothing schedules it, staleness after 24 h shows there like every other vital. The Setup item follows the cache (error → *Needs attention*), not the vital's staleness. Cost: a vault that is never opened never refreshes.
- **Synthetic health now wins over a same-id file vital** (it knows about errors; the file vital only knows mtimes). Phase 3 said the opposite; no file vital named `goals-sync` exists, so nothing observable changes for goals. Cost: none.
- **Existing vaults do not get the vital entry automatically**; `vitals.json` is user-owned and the troubleshooting line says to copy the entry from the template. Cost: one hand edit per older vault (the in-checkout dev vault included).
- **Renaming a data point keeps its id**, like goals. Changing its source drops the cache. Cost: a renamed point keeps a slug that no longer matches.
- **Deleting a data point leaves tiles in place**; they render *Data point removed* with a remove action (the brief's rule). Cost: a user deletes twice (point, then tile).
- **Picker categories are the source kinds** (`Metabase`, `SQLite`, `CSV`); user sub-folders keep working per category. Cost: a user with one source kind sees one category.
- **Tabs are typed names used as ids**, created from the page; there is no rename or delete in Phase 4 (hand-edit `datahub.json`). Cost: a mistyped tab stays until edited by hand.
- **Line display is recharts** (already in `package.json`); number and table are plain markup. Cost: none.
- **The data point selector shows on synced goals too**, because binding is the one field they accept. Cost: none.
- **The `placeholder` kind goes** (no item uses it any more). Cost: a future placeholder item re-adds a ten-line component.
- **The Setup item keeps id `first-data-point`** (ids are fixed by Phase 2) and is titled *Data points*. Cost: an id that reads oddly for a list.
