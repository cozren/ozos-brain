# Goals (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Goals by hand and goals pulled from the Atlassian Goals connector, stored in the vault, shown on the Goals page, set up from the `define-goals` Setup item, with a failed pull surfacing as *Needs attention*.

**Architecture:** One vault file, `<vault>/.ozos/goals.json`, holds every goal with a `source` of `manual` or `atlassian`. A small backend service owns reads, validation and writes; a sync service maps the connector's GraphQL result into the same shape and replaces the `atlassian` subset wholesale (manual goals and Phase 4 data-point bindings survive). A `/api/goals` router exposes list, add, patch, delete and sync; the Setup item `define-goals` stops being a placeholder and gets a panel that writes the four `ATLASSIAN_*` variables, runs a sync, or adds a first goal. The Goals page replaces its empty state with a board built in three increments. Nothing about a company (goal names, cloud ids) enters the engine.

**Tech Stack:** Python 3 (FastAPI, pydantic, httpx via the existing connector client, pytest), React 19 + Vite + TypeScript (vitest, @testing-library/react), Playwright screenshots.

**Spec:** The binding design lives in the private archive repo as `docs/superpowers/specs/2026-10-27-ozos-app-vault-extraction-design.md` (section 6.8 item 8, the Phase 3 line of section 7, section 8). It is not copied here because it names company terms. The review-cycle half of Phase 3 (cycle item, default cadence, Home reminders) shipped in Phase 2; this plan is the goals half.

## Global Constraints

- TDD: failing test first, watch it fail for the right reason, minimal code, green. Whole suite before any task is done: `python3 tools/test-pipeline/pipeline.py` → `0 failing`, no `NOT COLLECTED`.
- Frontend gate: `cd app/frontend && npx tsc --noEmit && npx vitest run`. `npm run build` is not a gate.
- Format before commit: `python3 -m ruff format tools/ skills/ app/ connectors/` and `cd app/frontend && npm run format`.
- Tests never touch a real vault, `~/.ozos` or the network: monkeypatch module-level `*_FILE` constants and the `goals_sync.fetch_remote` seam with `tmp_path` / lambdas.
- No "today" literal in tests; compute from `datetime.now()`.
- Never write company names, people, hostnames or ids into the engine. `./ozos scrub-check` runs in the pre-commit hook; never `--no-verify`. Example wording only (`yourcompany`, `Grow activation`).
- System `python3` only. No new Python dependencies (`httpx` is already in `app/backend/requirements.txt` and the connector's).
- Commit format `[tool-name] …` (`[app]`, `[connectors]`, `[skills]`, `[docs]`, `[vault-template]`). Push to `origin main` after every task.
- Frontend increments are each verified with a headless Playwright screenshot (`python3 ~/.claude/skills/design-audit/shoot.py <url> <png> --width 1280`) against `design-system/ozos-brain/MASTER.md` (dark theme, Fira Code/Sans, Lucide icons, `cursor: pointer`, visible focus, 150–300 ms transitions).
- The goal status vocabulary is the connector's: `on_track, at_risk, off_track, complete, cancelled, pending`. One list, defined once in the backend and mirrored in `types/goals.ts`.

## Review Focus

1. `goals.json` missing, `{}` or malformed → `GET /api/goals` returns an empty list and `sync: null`; the first add recreates the file (Task 1).
2. A manual add whose slug collides with an existing goal (manual or synced) → 409, file unchanged; a blank title or a progress outside 0–100 → 422 (Task 1, Task 3).
3. Sync when any of the four variables is empty → 422 naming the first missing variable, `goals.json` untouched, no `needs_attention`; sync when Atlassian answers an `Error:` string → 502, manual goals untouched, `sync.status == "fail"` recorded and the Setup item shows `needs_attention` (Task 2, Task 3).
4. A second sync in which a remote goal has disappeared removes only that synced goal and keeps every manual goal and every surviving synced goal's `data_point_id` (Task 2).
5. Editing or deleting a synced goal from the app → 409 with a message that says to change it in Atlassian; patching only `data_point_id` on a synced goal is allowed (Task 1, Task 3).

---

### Task 1: Goals store, registry item, setup view hook, vault template

**Files:**
- Create: `app/backend/services/goals.py`
- Modify: `app/backend/config.py` (add `OZOS_GOALS_FILE = OZOS_CONFIG_DIR / "goals.json"`)
- Modify: `app/backend/services/setup_registry.py` (the `define-goals` item)
- Modify: `app/backend/services/setup_view.py` (synthetic `goals-sync` vital)
- Create: `vault-template/.ozos/goals.json`
- Test: `app/backend/tests/test_goals.py`, extend `app/backend/tests/test_setup_registry.py`, `app/backend/tests/test_setup_view.py`; update `app/backend/tests/test_setup_actions.py::test_env_write_whitelist_and_no_echo` (the whitelist now has four names, so `env_status()` returns four keys and writing the three Confluence names leaves `define-goals` untouched) and the `client_env` fixture in `app/backend/tests/test_setup_router.py` (stub `setup_view.load_goals_sync = lambda: None` so no test reads the real vault)

**Interfaces:**
- `goals.STATUSES = ("on_track", "at_risk", "off_track", "complete", "cancelled", "pending")`, `goals.SOURCES = ("manual", "atlassian")`, `goals.GOALS_FILE: Path` (module constant from config; tests monkeypatch).
- Goal shape (every key always present):
  `{"id": str, "title": str, "description": str, "owner": str, "status": str, "progress": int | None, "target_date": str, "source": str, "external_id": str | None, "data_point_id": str | None, "updated_at": str, "synced_at": str | None}`.
  `id` is `slug(title)` for manual goals; `target_date` is free text (the connector returns labels like a quarter name; the form sends an ISO date). `data_point_id` is reserved for Phase 4 and never set by Phase 3 UI.
- `load_goals() -> dict` → always `{"goals": [goal...], "sync": None | {"last_run": str, "status": "ok" | "fail", "message": str, "count": int}}`; missing/malformed file tolerated; goals lacking keys are filled with defaults; a goal with a bad `status` becomes `pending`.
- `save_goals(state: dict) -> None` (atomic, `indent=2`, creates parent dir).
- `normalize_goal(raw: dict, *, source: str) -> dict` → fills defaults, validates: non-empty `title` (`ValueError`), `status in STATUSES` (`ValueError`), `progress` is `None` or an int in `0..100` (`ValueError`).
- `add_goal(payload: dict) -> dict`: `source="manual"`, `id = slug(title)` (`ValueError` when the slug is empty), `FileExistsError` when the id exists, `updated_at = now`, saves, `setup_state.set_status("define-goals", "done")`, returns the goal.
- `update_goal(goal_id: str, patch: dict) -> dict`: `KeyError` when unknown; allowed keys `title, description, owner, status, progress, target_date, data_point_id`; for a goal with `source != "manual"` any key other than `data_point_id` raises `PermissionError("synced from atlassian; change it there")`; re-validates through `normalize_goal`; `updated_at = now`; the id never changes.
- `delete_goal(goal_id: str) -> None`: `KeyError` unknown; `PermissionError` for a synced goal.
- `replace_synced(new_goals: list[dict], source: str, now: datetime | None = None) -> dict`: keeps every goal whose `source != source`; for each new goal (already normalized, with `external_id`) copies `data_point_id` from a previous goal with the same `external_id`; sets `synced_at = updated_at = now`; writes `sync = {"last_run": now, "status": "ok", "message": "", "count": len(new_goals)}`; saves; `set_status("define-goals", "done")`; returns the state.
- `record_sync_failure(message: str, now=None) -> dict`: writes only `sync = {"last_run", "status": "fail", "message", "count": 0}`; goals untouched.
- `sync_health() -> dict | None`: `None` when `sync` is `None`, else `{"id": "goals-sync", "status": "ok" | "fail", "message": str}`.
- Registry: `define-goals` becomes `title "Goals"`, `why "Add goals by hand, or connect Atlassian Goals and pull them in; each goal can later bind to a data point."`, `writes ".ozos/goals.json, .env (ATLASSIAN_*)"`, `kind "goals"`, `setup_doc` unchanged, `vital "goals-sync"`, `env ["ATLASSIAN_EMAIL", "ATLASSIAN_TOKEN", "ATLASSIAN_SUBDOMAIN", "ATLASSIAN_CLOUD_ID"]`. Nothing else in the registry moves; `ITEM_IDS` order is unchanged.
- `setup_view`: new module attribute `load_goals_sync = goals.sync_health` (seam); `build_view` adds its result (when not `None`) to `ctx["vitals"]` under `"goals-sync"` *before* the file-based vitals so a real vital of that id would win. `_item_view` is unchanged: a `done` item whose vital status is `fail` becomes `needs_attention`.
- `vault-template/.ozos/goals.json` = `{"goals": [], "sync": null}`.

- [ ] **Step 1: Failing tests**

`test_goals.py` (fixture `goals_file` monkeypatches `goals.GOALS_FILE = tmp_path / ".ozos" / "goals.json"` and `setup_state.SETUP_FILE = tmp_path / ".ozos" / "setup.json"`):

```python
def test_load_goals_tolerates_missing_and_malformed(goals_file):
    assert load_goals() == {"goals": [], "sync": None}
    goals_file.parent.mkdir(parents=True); goals_file.write_text("{nope")
    assert load_goals() == {"goals": [], "sync": None}
    goals_file.write_text(json.dumps({"goals": [{"id": "x", "title": "X", "status": "weird"}]}))
    [g] = load_goals()["goals"]
    assert g["status"] == "pending" and g["source"] == "manual" and g["data_point_id"] is None

def test_add_goal_slugs_marks_done_and_rejects_duplicates_and_blank(goals_file):
    g = add_goal({"title": "Grow activation", "owner": "Pat", "status": "on_track", "progress": 20})
    assert g["id"] == "grow-activation" and g["source"] == "manual"
    assert json.loads(goals_file.read_text())["goals"][0]["title"] == "Grow activation"
    assert load_state()["items"]["define-goals"]["status"] == "done"
    with pytest.raises(FileExistsError): add_goal({"title": "Grow Activation!"})
    with pytest.raises(ValueError): add_goal({"title": "   "})
    with pytest.raises(ValueError): add_goal({"title": "Bad", "progress": 101})
    with pytest.raises(ValueError): add_goal({"title": "Bad", "status": "done"})
    assert len(load_goals()["goals"]) == 1

def test_update_and_delete_manual_goal(goals_file):
    add_goal({"title": "Ship onboarding"})
    g = update_goal("ship-onboarding", {"status": "at_risk", "progress": 40, "title": "Ship onboarding v2"})
    assert g["id"] == "ship-onboarding" and g["status"] == "at_risk" and g["title"] == "Ship onboarding v2"
    with pytest.raises(ValueError): update_goal("ship-onboarding", {"progress": -1})
    with pytest.raises(KeyError): update_goal("nope", {"status": "pending"})
    delete_goal("ship-onboarding")
    assert load_goals()["goals"] == []

def test_synced_goals_are_read_only_except_binding(goals_file):
    replace_synced([normalize_goal({"id": "atlassian-1", "title": "Remote", "external_id": "ari:1"}, source="atlassian")], "atlassian")
    with pytest.raises(PermissionError): update_goal("atlassian-1", {"title": "Local rename"})
    with pytest.raises(PermissionError): delete_goal("atlassian-1")
    assert update_goal("atlassian-1", {"data_point_id": "dp-1"})["data_point_id"] == "dp-1"

def test_replace_synced_keeps_manual_and_bindings_and_drops_vanished(goals_file):
    add_goal({"title": "Manual one"})
    first = [normalize_goal({"id": f"atlassian-{i}", "title": f"R{i}", "external_id": f"ari:{i}"}, source="atlassian") for i in (1, 2)]
    replace_synced(first, "atlassian")
    update_goal("atlassian-1", {"data_point_id": "dp-1"})
    second = [normalize_goal({"id": "atlassian-1", "title": "R1 renamed", "external_id": "ari:1"}, source="atlassian")]
    state = replace_synced(second, "atlassian")
    ids = {g["id"]: g for g in state["goals"]}
    assert set(ids) == {"manual-one", "atlassian-1"}
    assert ids["atlassian-1"]["data_point_id"] == "dp-1" and ids["atlassian-1"]["title"] == "R1 renamed"
    assert state["sync"]["status"] == "ok" and state["sync"]["count"] == 1
    assert load_state()["items"]["define-goals"]["status"] == "done"

def test_record_sync_failure_leaves_goals_and_reports_health(goals_file):
    add_goal({"title": "Keep me"})
    assert sync_health() is None
    record_sync_failure("Authentication failed")
    assert [g["id"] for g in load_goals()["goals"]] == ["keep-me"]
    assert sync_health() == {"id": "goals-sync", "status": "fail", "message": "Authentication failed"}
```

`test_setup_registry.py` additions:

```python
def test_define_goals_is_a_real_item():
    it = item("define-goals")
    assert it["kind"] == "goals" and it["vital"] == "goals-sync"
    assert it["env"] == ["ATLASSIAN_EMAIL", "ATLASSIAN_TOKEN", "ATLASSIAN_SUBDOMAIN", "ATLASSIAN_CLOUD_ID"]
    assert env_whitelist() == ["ATLASSIAN_EMAIL", "ATLASSIAN_TOKEN", "ATLASSIAN_SUBDOMAIN", "ATLASSIAN_CLOUD_ID"]

def test_vault_template_has_empty_goals_file():
    assert json.loads((REPO_ROOT / "vault-template" / ".ozos" / "goals.json").read_text()) == {"goals": [], "sync": None}
```

`test_setup_view.py` addition (fixture also sets `setup_view.load_goals_sync = lambda: None`; update the existing fixture so other tests stay isolated):

```python
def test_failed_goals_sync_turns_done_item_into_needs_attention(view_env, monkeypatch):
    set_status("define-goals", "done")
    monkeypatch.setattr(setup_view, "load_goals_sync", lambda: {"id": "goals-sync", "status": "fail", "message": "boom"})
    items = {i["id"]: i for g in build_view()["groups"] for i in g["items"]}
    assert items["define-goals"]["status"] == "needs_attention"
    assert items["define-goals"]["derived"] == {"vital": {"status": "fail"}}
    monkeypatch.setattr(setup_view, "load_goals_sync", lambda: {"id": "goals-sync", "status": "ok", "message": ""})
    items = {i["id"]: i for g in build_view()["groups"] for i in g["items"]}
    assert items["define-goals"]["status"] == "done"
```

- [ ] **Step 2: Run, expect `ModuleNotFoundError: backend.services.goals` and the registry assertions failing**

Run: `cd app && python3 -m pytest backend/tests/test_goals.py backend/tests/test_setup_registry.py backend/tests/test_setup_view.py -q`

- [ ] **Step 3: Implement `goals.py`, the config constant, the registry item, the `setup_view` seam, and the template file**

`slug` is `re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")` (same rule as `setup_actions._slug`; import it rather than copy it).

- [ ] **Step 4: Green, pipeline, format, commit, push**

```bash
python3 -m ruff format app/ && python3 tools/test-pipeline/pipeline.py
git add app/backend/services/goals.py app/backend/config.py app/backend/services/setup_registry.py app/backend/services/setup_view.py vault-template/.ozos/goals.json app/backend/tests/test_goals.py app/backend/tests/test_setup_registry.py app/backend/tests/test_setup_view.py
git commit -m "[app] goals store in the vault; define-goals becomes a real setup item with a sync health vital"
git push origin main
```

---

### Task 2: Atlassian Goals sync service

**Files:**
- Create: `app/backend/services/goals_sync.py`
- Test: `app/backend/tests/test_goals_sync.py`

**Interfaces:**
- `goals_sync.ENV_NAMES = ("ATLASSIAN_EMAIL", "ATLASSIAN_TOKEN", "ATLASSIAN_SUBDOMAIN", "ATLASSIAN_CLOUD_ID")`.
- `goals_sync.ENV_FILE: Path` (defaults to `setup_actions.ENV_FILE`; tests monkeypatch).
- `credentials() -> tuple[dict[str, str], list[str]]`: for each name, the value from `dotenv_values(ENV_FILE)` when non-empty, else `os.environ`, else `""`; returns `(values, missing_names_in_ENV_NAMES_order)`. The vault `.env` is re-read on every call because the Setup page writes it while the app runs.
- `connector_status() -> dict` → `{"configured": bool, "missing": [names]}` (never values).
- `fetch_remote(creds: dict) -> list[dict]` (module attribute, the test seam): inserts `<engine>/connectors/atlassian-goals` on `sys.path`, imports `api_client.AtlassianGoalsClient`, runs `asyncio.run(client.list_goals(limit=200))`; a result starting with `Error:` raises `RuntimeError(result)`; otherwise returns `json.loads(result)`.
- `map_remote_goal(node: dict) -> dict`: `external_id = node["id"]`; `id = "atlassian-" + slug(last path segment of external_id)`; `title = node["name"]`; `status = node.status.value` lowercased when in `goals.STATUSES` else `"pending"`; `progress = int(node.progress.percentage)` when present else `None`; `owner = node.owner.name or ""`; `target_date = node.targetDate.label or ""`; returns `goals.normalize_goal(..., source="atlassian")`.
- `sync_goals(now: datetime | None = None) -> dict`: `creds, missing = credentials()`; when `missing` → `raise LookupError(f"{missing[0]} is not set")` (nothing written); then `try: nodes = fetch_remote(creds) except Exception as exc: goals.record_sync_failure(str(exc)); raise RuntimeError(str(exc))`; else `goals.replace_synced([map_remote_goal(n) for n in nodes], "atlassian", now)` and returns `{"synced": len(nodes), "sync": state["sync"]}`.

- [ ] **Step 1: Failing tests** (fixture reuses Task 1's `goals_file` plus `goals_sync.ENV_FILE = tmp_path / ".env"` and `monkeypatch.delenv` for the four names)

```python
def test_credentials_prefer_env_file_and_name_missing(env_file, monkeypatch):
    env_file.write_text('ATLASSIAN_EMAIL="pat@yourcompany.com"\nATLASSIAN_TOKEN=t\n')
    monkeypatch.setenv("ATLASSIAN_SUBDOMAIN", "yourcompany")
    values, missing = credentials()
    assert values["ATLASSIAN_EMAIL"] == "pat@yourcompany.com" and values["ATLASSIAN_SUBDOMAIN"] == "yourcompany"
    assert missing == ["ATLASSIAN_CLOUD_ID"]
    assert connector_status() == {"configured": False, "missing": ["ATLASSIAN_CLOUD_ID"]}

def test_map_remote_goal():
    g = map_remote_goal({"id": "ari:cloud:townsquare:x:goal/ABC-1", "name": "Grow activation",
                         "status": {"value": "AT_RISK"}, "progress": {"percentage": 42.0},
                         "owner": {"accountId": "a", "name": "Pat"}, "targetDate": {"label": "Q4"}, "startDate": None})
    assert g["id"] == "atlassian-abc-1" and g["external_id"].endswith("goal/ABC-1")
    assert g["status"] == "at_risk" and g["progress"] == 42 and g["owner"] == "Pat" and g["target_date"] == "Q4"
    assert map_remote_goal({"id": "ari:goal/Z", "name": "Odd", "status": {"value": "archived"}})["status"] == "pending"

def test_sync_without_credentials_writes_nothing(env_file, goals_file):
    with pytest.raises(LookupError, match="ATLASSIAN_EMAIL is not set"): sync_goals()
    assert not goals_file.exists()

def test_sync_success_and_failure(env_file, goals_file, monkeypatch):
    env_file.write_text("\n".join(f"{n}=x" for n in ENV_NAMES) + "\n")
    monkeypatch.setattr(goals_sync, "fetch_remote", lambda creds: [{"id": "ari:goal/1", "name": "Remote", "status": {"value": "on_track"}}])
    out = sync_goals()
    assert out["synced"] == 1 and load_goals()["goals"][0]["source"] == "atlassian"
    def boom(creds): raise RuntimeError("Error: Authentication failed")
    monkeypatch.setattr(goals_sync, "fetch_remote", boom)
    with pytest.raises(RuntimeError, match="Authentication failed"): sync_goals()
    state = load_goals()
    assert state["sync"]["status"] == "fail" and [g["id"] for g in state["goals"]] == ["atlassian-1"]

def test_fetch_remote_parses_connector_result(monkeypatch):
    # Patches AtlassianGoalsClient.list_goals so no network is touched.
    import importlib, sys
    sys.path.insert(0, str(REPO_ROOT / "connectors" / "atlassian-goals")); api_client = importlib.import_module("api_client")
    async def fake(self, status=None, limit=50): return json.dumps([{"id": "ari:goal/1", "name": "R"}])
    monkeypatch.setattr(api_client.AtlassianGoalsClient, "list_goals", fake)
    assert fetch_remote({n: "x" for n in ENV_NAMES})[0]["name"] == "R"
    async def err(self, status=None, limit=50): return "Error: API error 404: nope"
    monkeypatch.setattr(api_client.AtlassianGoalsClient, "list_goals", err)
    with pytest.raises(RuntimeError, match="404"): fetch_remote({n: "x" for n in ENV_NAMES})
```

- [ ] **Step 2: Run, expect `ModuleNotFoundError`**

Run: `cd app && python3 -m pytest backend/tests/test_goals_sync.py -q`

- [ ] **Step 3: Implement `goals_sync.py`**

- [ ] **Step 4: Green, pipeline, format, commit, push**

```bash
git add app/backend/services/goals_sync.py app/backend/tests/test_goals_sync.py
git commit -m "[app] Atlassian Goals sync: credentials from the vault .env, remote goals mapped into goals.json"
git push origin main
```

---

### Task 3: `/api/goals` router

**Files:**
- Create: `app/backend/routers/goals.py`
- Modify: `app/backend/main.py` (include router)
- Test: `app/backend/tests/test_goals_router.py`

**Interfaces** (`APIRouter(prefix="/goals", tags=["goals"])`):
- `GET ""` → `{"goals": [...], "sync": ..., "connector": connector_status(), "statuses": list(STATUSES)}`.
- `POST ""` body `NewGoal{title: str, description: str = "", owner: str = "", status: Literal[...] = "pending", progress: int | None = None, target_date: str = ""}` → the goal; `FileExistsError` → 409 `A goal with id '<id>' already exists`; `ValueError` → 422.
- `PUT "/{goal_id}"` body `GoalPatch` (every field optional, `model_fields_set` decides what is patched; `data_point_id: str | None` included) → goal; `KeyError` → 404; `PermissionError` → 409; `ValueError` → 422.
- `DELETE "/{goal_id}"` → `{"deleted": goal_id}`; 404 / 409 as above.
- `POST "/sync"` → `sync_goals()` result; `LookupError` → 422 with its message; `RuntimeError` → 502 with its message.

- [ ] **Step 1: Failing tests** (fixture: `goals.GOALS_FILE`, `setup_state.SETUP_FILE`, `goals_sync.ENV_FILE` → tmp; `monkeypatch.delenv` the four names)

```python
def test_get_goals_empty_shape(env): 
    body = client.get("/api/goals").json()
    assert body["goals"] == [] and body["sync"] is None and body["connector"]["configured"] is False
    assert body["statuses"][0] == "on_track"

def test_post_put_delete_manual_goal(env):
    r = client.post("/api/goals", json={"title": "Grow activation", "status": "on_track", "progress": 10})
    assert r.status_code == 200 and r.json()["id"] == "grow-activation"
    assert client.post("/api/goals", json={"title": "Grow activation"}).status_code == 409
    assert client.post("/api/goals", json={"title": ""}).status_code == 422
    assert client.post("/api/goals", json={"title": "x", "progress": 101}).status_code == 422
    assert client.put("/api/goals/grow-activation", json={"status": "at_risk"}).json()["status"] == "at_risk"
    assert client.put("/api/goals/nope", json={"status": "at_risk"}).status_code == 404
    assert client.delete("/api/goals/grow-activation").json() == {"deleted": "grow-activation"}

def test_synced_goal_is_read_only_over_http(env):
    replace_synced([normalize_goal({"id": "atlassian-1", "title": "R", "external_id": "ari:1"}, source="atlassian")], "atlassian")
    assert client.put("/api/goals/atlassian-1", json={"title": "x"}).status_code == 409
    assert client.delete("/api/goals/atlassian-1").status_code == 409
    assert client.put("/api/goals/atlassian-1", json={"data_point_id": "dp"}).status_code == 200

def test_sync_endpoint_422_without_credentials_and_502_on_remote_error(env, monkeypatch):
    r = client.post("/api/goals/sync")
    assert r.status_code == 422 and "ATLASSIAN_EMAIL" in r.json()["detail"]
    env.env_file.write_text("\n".join(f"{n}=x" for n in ENV_NAMES) + "\n")
    def boom(creds): raise RuntimeError("Error: Authentication failed")
    monkeypatch.setattr(goals_sync, "fetch_remote", boom)
    r = client.post("/api/goals/sync")
    assert r.status_code == 502 and "Authentication failed" in r.json()["detail"]
    monkeypatch.setattr(goals_sync, "fetch_remote", lambda c: [{"id": "ari:goal/1", "name": "R", "status": {"value": "on_track"}}])
    assert client.post("/api/goals/sync").json()["synced"] == 1
```

- [ ] **Step 2: Run, expect 404s** — **Step 3: Implement the router; register in `main.py`** — **Step 4: Green, pipeline, format, commit `[app] /api/goals: list, add, patch, delete and Atlassian sync`, push**

---

### Task 4: Frontend increment A — Goals board (read-only) replaces the empty state

**Files:**
- Create: `app/frontend/src/types/goals.ts`, `app/frontend/src/lib/goals.ts`, `app/frontend/src/components/goals/GoalStatusChip.tsx`, `app/frontend/src/components/goals/GoalCard.tsx`, `app/frontend/src/components/goals/GoalsBoard.tsx`
- Modify: `app/frontend/src/api.ts` (`getGoals`, `addGoal`, `updateGoal`, `deleteGoal`, `syncGoals`), `app/frontend/src/pages/GoalsTasks.tsx` (render `<GoalsBoard />` instead of the empty-state section; `GOALS_EMPTY_COPY` moves into the board)
- Test: `app/frontend/src/lib/__tests__/goals.test.ts`, `app/frontend/src/components/goals/__tests__/GoalStatusChip.test.tsx`, `GoalCard.test.tsx`, `GoalsBoard.test.tsx`; update `app/frontend/src/pages/__tests__/GoalsTasks.test.tsx` (mock `../../api` with `getGoals` resolving the empty payload)

**Interfaces:**
- `types/goals.ts`: `GoalStatus` union of the six values; `Goal` mirrors the backend shape; `GoalsPayload { goals: Goal[]; sync: GoalSync | null; connector: { configured: boolean; missing: string[] }; statuses: GoalStatus[] }`; `GoalSync { last_run: string; status: 'ok' | 'fail'; message: string; count: number }`; `NewGoalPayload { title; description?; owner?; status?; progress?: number | null; target_date? }`; `GoalPatch = Partial<Pick<Goal, 'title' | 'description' | 'owner' | 'status' | 'progress' | 'target_date' | 'data_point_id'>>`.
- `lib/goals.ts`: `STATUS_LABEL: Record<GoalStatus, string>` → `On track, At risk, Off track, Complete, Cancelled, Pending`; `STATUS_COLOR: Record<GoalStatus, string>` → `#22C55E, #F59E0B, #EF4444, var(--neon-cyan), #475569, #94A3B8`; `sortGoals(goals: Goal[]): Goal[]` by status rank `off_track, at_risk, pending, on_track, complete, cancelled` then title (locale compare); `statusCounts(goals): Record<GoalStatus, number>`.
- `GoalStatusChip({ status })` → `<span data-status={status}>` with `STATUS_LABEL`, same geometry as `setup/StatusChip` (1px border at 40% alpha, Fira Code 10px uppercase, 2px letter-spacing).
- `GoalCard({ goal })` (read-only in this increment): title (`font-mono 13px 600`), `GoalStatusChip`, a `role="progressbar"` bar with `aria-valuenow` when `progress !== null`, owner and `target_date` in dim mono, a source badge `Atlassian` when `source === 'atlassian'`. `data-goal={goal.id}`.
- `GoalsBoard()`: fetches `api.getGoals()` on mount; loading text `Loading goals…`; error `Could not load goals`; empty state copy `No goals yet. Add one below, or connect Atlassian Goals in Setup.`; when goals exist: a count strip (one `GoalStatusChip` + number per status with a non-zero count) then `sortGoals(goals).map(GoalCard)`; a `Sync Atlassian` button (`.btn-neon`) rendered only when `connector.configured`, which calls `api.syncGoals()` then reloads; result line `Synced N goals.` or the error's message in `#EF4444`; a `Last sync: <date> · <status>` line when `sync` is set.

- [ ] **Step 1: Failing tests** — lib: labels, sort order, counts; chip: label + `data-status`; card: progressbar `aria-valuenow="42"`, `Atlassian` badge only for synced; board: empty copy, two cards sorted off_track first, sync button hidden when not configured and shown + `Synced 2 goals.` after click when configured (mock `syncGoals` resolving `{synced: 2}` and `getGoals` called twice); GoalsTasks: still shows the heading and the empty copy with `getGoals` mocked.
- [ ] **Step 2: Run `npx vitest run src/lib/__tests__/goals.test.ts src/components/goals src/pages/__tests__/GoalsTasks.test.tsx` — expect failures**
- [ ] **Step 3: Implement; `npx tsc --noEmit && npx vitest run` green**
- [ ] **Step 4: Screenshot audit** — backend `cd app && python3 -m uvicorn backend.main:app --port 8765`, frontend `npm run dev`; seed two manual goals through `POST /api/goals` against the dev vault; shoot `http://localhost:5173/?page=goals-tasks` to `<scratchpad>/goals-a.png`; check against MASTER.md; delete the seeded goals afterwards.
- [ ] **Step 5: Format, pipeline, commit, push**

```bash
(cd app/frontend && npm run format) && python3 tools/test-pipeline/pipeline.py
git commit -m "[app] Goals page: board with status chips, progress and Atlassian sync replaces the empty state"
git push origin main
```

---

### Task 5: Frontend increment B — add, edit and delete manual goals

**Files:**
- Create: `app/frontend/src/components/goals/AddGoalForm.tsx`
- Modify: `app/frontend/src/components/goals/GoalCard.tsx` (edit controls for manual goals), `GoalsBoard.tsx` (renders `AddGoalForm` under the list; passes `onPatch` / `onDelete`)
- Test: `app/frontend/src/components/goals/__tests__/AddGoalForm.test.tsx`, extend `GoalCard.test.tsx` and `GoalsBoard.test.tsx`

**Interfaces:**
- `AddGoalForm({ onSubmit, compact? })`: fields Title, Owner, Target date (`type="date"`), Status (`<select>` of the six, default `pending`), Progress (`type="number" min=0 max=100`, blank → `null`); `Add goal` button disabled until title is non-blank; `onSubmit(payload: NewGoalPayload)` resolves → reset + `Added <title>.`; a 409 (`ApiError` with status 409) shows `A goal with that name already exists.`; other errors `Could not save.`. Uses `setup/formStyles` (`FIELD, LABEL, PRIMARY, FORM_CSS, OK, ERR`).
- `GoalCard({ goal, onPatch?, onDelete? })`: when `goal.source === 'manual'` and handlers are given: the chip becomes a `<select aria-label="Status">` of the six values calling `onPatch(goal.id, {status})`; a progress `<input type="number" aria-label="Progress">` committing on blur/Enter with `onPatch(goal.id, {progress})` (blank → `null`); a `Delete` button (`aria-label="Delete <title>"`) calling `onDelete(goal.id)` after `window.confirm`. Synced goals keep the read-only chip and no delete.
- `GoalsBoard`: `onPatch` → `api.updateGoal` then replaces the goal in state from the response; `onDelete` → `api.deleteGoal` then removes it; `AddGoalForm.onSubmit` → `api.addGoal` then reload.

- [ ] **Step 1: Failing tests** — form: disabled without title, payload shape `{title:'Grow activation', owner:'Pat', target_date:'2027-03-31', status:'on_track', progress: 20}`, 409 message; card: manual goal exposes `Status` select and `Delete`, synced goal exposes neither; board: adding calls `addGoal` and reloads, changing status calls `updateGoal(id, {status:'at_risk'})`.
- [ ] **Steps 2–5** as Task 4; screenshot `goals-b.png` with one manual and (seeded through `replace_synced` in a one-off python call against the dev vault, removed afterwards) one synced goal; commit `[app] Goals page: add, edit status and progress, delete manual goals`, push.

---

### Task 6: Frontend increment C — Setup panel for `define-goals`

**Files:**
- Create: `app/frontend/src/components/setup/GoalsPanel.tsx`
- Modify: `app/frontend/src/types/setup.ts` (`SetupKind` gains `'goals'`), `app/frontend/src/components/setup/SetupItemBody.tsx` (case `'goals'`), `app/frontend/src/components/setup/PlaceholderPanel.tsx` (drop `define-goals` from `PHASE`), `app/frontend/src/pages/__tests__/Setup.test.tsx` mock (`getGoals`, `syncGoals`, `addGoal` stubs)
- Test: `app/frontend/src/components/setup/__tests__/GoalsPanel.test.tsx`; update `PlaceholderPanel.test.tsx` (only the `first-data-point` case remains, plus a `define-goals` case asserting the generic `Arrives in a later phase.` is **not** what Setup renders — simplest: delete the define-goals test); extend `SetupItemBody.test.tsx` with a `goals` item rendering the panel

**Interfaces:**
- `GoalsPanel({ item, onChanged })`: three stacked blocks with `.section-label`-style captions:
  1. **Connect Atlassian Goals** — `EnvForm` with `item.env` (four names) and the env booleans from `api.getSetupEnv()`; under it a `Sync now` button (`PRIMARY`, disabled while busy or when `connector.configured` from `api.getGoals()` is false) → `api.syncGoals()` → `Synced N goals.` or the error message; after a sync `onChanged()`.
  2. **Or add a goal by hand** — `AddGoalForm` (Task 5) → `api.addGoal` → `onChanged()`.
  3. A hint line: `Goals live on the Goals & Tasks page; each goal can bind to a data point once Phase 4 ships.`
- `SetupItemBody`: `case 'goals': return <GoalsPanel item={item} onChanged={onChanged} />`.

- [ ] **Step 1: Failing tests** — panel renders four env inputs by label; `Sync now` disabled when `getGoals` resolves `connector.configured: false` and enabled + shows `Synced 3 goals.` when true; the add form submits through `addGoal` and calls `onChanged`; `SetupItemBody` with `kind: 'goals'` shows `Sync now`; `PlaceholderPanel` still names Phase 4 for `first-data-point`.
- [ ] **Steps 2–5**: implement, `tsc` + vitest green, screenshot `setup-c.png` with the Goals row visible, commit `[app] Setup page: Goals item connects Atlassian Goals, syncs, or adds a first goal`, push.

---

### Task 7: Skill, connector docs and template

**Files:**
- Modify: `.claude/skills/ozos-setup/SKILL.md` (kind `goals` row in the endpoint table: `PUT /env` with the four names, `POST /api/goals/sync`, `POST /api/goals` body; in-process functions `goals.add_goal(dict)` and `goals_sync.sync_goals()`; section 4 lists `define-goals` among items marked automatically)
- Modify: `connectors/atlassian-goals/setup.md` (step 2 now points at Setup → Goals and the Goals page `Sync Atlassian` button; drop the "Phase 3" sentences; *How to verify* gains "Goals page lists your goals after Sync"), `connectors/atlassian-goals/README.md` (one paragraph: the app pulls goals into the vault through `/api/goals/sync`; the MCP server stays for chat)
- Test: `app/backend/tests/test_setup_registry.py::test_setup_docs_exist_with_the_four_sections` already pins the headings; add `test_goals_docs_no_longer_defer_to_phase_3` asserting `"Phase 3" not in` the connector `setup.md` and `"define-goals" in` the skill file and `"goals_sync" in` the skill file.

- [ ] **Step 1: Failing test** — **Step 2: Run** — **Step 3: Edit the three files** — **Step 4: Green, `./ozos scrub-check`, commit `[connectors] atlassian-goals setup for the Goals item; /ozos-setup knows the goals kind`, push**

---

### Task 8: Docs catch-up

**Files:**
- Modify: `docs/SETUP.md`: section 5 table row for Goals (`Setup → Goals → save the four ATLASSIAN_* lines and press Sync now, or add a goal by hand`), new **section 8 "Goals"** (manual vs Atlassian, read-only rule for synced goals, where they show, `needs_attention` on a failed sync, Phase 4 binding note), renumber *Daily use* → 9, *What is not here yet* → 10 (Phases 4 and 5 only), *Troubleshooting* → 11 with two new lines (`Sync Atlassian says 422 ATLASSIAN_… is not set`, `Goals item shows Needs attention`), appendix **A.6 `goals.json`** with the shape, and A.5 now lists `ATLASSIAN_CLOUD_ID` among what Setup writes.
- Modify: `README.md` Status (Phase 3 in: Goals page, Setup Goals item, Atlassian pull; next Phase 4 data points, Phase 5 README), `app/README.md` page table (`Goals & Tasks | Goals by hand or from Atlassian, plus personal tasks`), `CLAUDE.md` + `AGENTS.md` vault description (`.ozos/` list gains `goals`).
- Test: extend `test_setup_guide_describes_the_setup_page` → SETUP.md contains `## 8. Goals` and `### A.6`, README contains `Phase 3`, `app/README.md` no longer says `arrive in Phase 3`.

- [ ] **Steps**: failing doc test → run → edit docs → green → `./ozos scrub-check` → commit `[docs] SETUP.md Goals section and goals.json reference; README status to Phase 3` → push.

---

### Task 9: Final verification and review

- [ ] `python3 tools/test-pipeline/pipeline.py` → `0 failing`, no `NOT COLLECTED`.
- [ ] `cd app/frontend && npx tsc --noEmit && npx vitest run` green; `npm run format:check` clean; `python3 -m ruff format --check tools/ skills/ app/ connectors/` clean.
- [ ] `./ozos scrub-check` clean.
- [ ] Boot the app against the dev vault; shoot `goals-tasks` and `setup` once more.
- [ ] `graphify update .`
- [ ] Dispatch one fresh reviewer (most capable model) over `git diff 6517f9e..HEAD` with the spec's Phase 3 line and this plan's Review Focus; for every Critical/Important finding: failing test, fix, green, commit, push. Minors go to the final message.
- [ ] `git status --short && git log origin/main..HEAD` both print nothing.

## Rulings made while planning (each with its cost if wrong)

- **Phase 3's cycle half is already shipped** (Phase 2 Tasks 4, 8, 10); this plan does not touch it. Cost: none.
- **Goals live in `.ozos/goals.json`**, beside the other runtime state the app owns (tasks, layouts, setup). Cost: a user who wants goals as Markdown in the knowledge hub edits JSON instead.
- **Status vocabulary is the connector's six values**, shared by manual and synced goals, so the board needs one chip. Cost: a company whose goals tool uses other states maps them to `pending`.
- **Synced goals are read-only in the app** except for the Phase 4 binding; pushing status changes back through the connector's `update_goal_status` is not wired. Cost: a status change means opening Atlassian (or asking the MCP in chat).
- **Sync replaces the whole `atlassian` subset.** Goals that vanished remotely disappear locally; bindings follow `external_id`. Cost: no local history of removed goals.
- **A failed sync is reported through the existing vital path** by injecting a synthetic `goals-sync` entry into the view's vitals; it is not a file-mtime vital in `vitals.json` because a mtime check cannot tell "manual goals only" from "pull broken". Cost: the Control Tower does not list goals sync as a runnable vital.
- **Credentials are re-read from the vault `.env` on every sync** (the Setup page writes the file while the backend runs; `load_dotenv` at import would never see it). Cost: a shell variable is only a fallback.
- **`target_date` is free text.** The connector returns labels, the form sends ISO dates; neither is parsed. Cost: no sorting by date.
- **Goal ids are slugs of the title (manual) or `atlassian-<last ARI segment>` (synced).** Cost: a renamed manual goal keeps its old id; two remote goals whose ARIs end alike would collide (ARIs end in a unique key, so this is theoretical).
- **`data_point_id` is written into the schema now and left `null`**; Phase 4 adds the picker and the Data Hub read side. Cost: none.
