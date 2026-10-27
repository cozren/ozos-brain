# Setup Journal (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A living onboarding checklist for a new company: `setup.json` in the vault, a Setup page in the app with a short form per item, a home-page badge and cadence reminders, an `/ozos-setup` skill and `ozos setup` CLI, connector setup docs, and one vault resolver shared by app and tools.

**Architecture:** The backend owns a declarative item registry (pure data, importable without the app config) and a small state service over `<vault>/.ozos/setup.json`; derived states (profile done, MCP connected, needs_attention) are computed at read time, never stored. "Forms" are backend actions that write the same vault files the rest of the engine already reads (meeting-routing.json, knowledge-sources.json, cycles.yaml, people meta.yaml, `.env`). The frontend is one new page built one component at a time, plus a badge and a reminder list on Home. The skill and CLI reuse the backend services; nothing is implemented twice.

**Tech Stack:** Python 3 (FastAPI, pydantic, PyYAML, python-dotenv, pytest), React 19 + Vite + TypeScript (vitest, @testing-library/react), Playwright (screenshots only), bash.

**Spec:** The binding design lives in the private archive repo as `docs/superpowers/specs/2026-10-27-ozos-app-vault-extraction-design.md` (section 6.8 and the Phase 2 line of section 7). It is not copied here because it names company terms. The brief that fixes Phase 2 decisions (item ids, groups, forms, cadence, docs scope) is the user message that started this work; its decisions are restated in this plan.

## Global Constraints

- TDD: failing test first, watch it fail for the right reason, minimal code, green. Whole suite before any task is done: `python3 tools/test-pipeline/pipeline.py` → `0 failing`, no `NOT COLLECTED`.
- Frontend gate: `cd app/frontend && npx tsc --noEmit && npx vitest run`. `npm run build` is not a gate.
- Format before commit: `python3 -m ruff format tools/ skills/ app/ connectors/` and `cd app/frontend && npm run format`.
- Tests never touch a real vault or `~/.ozos`: monkeypatch module-level `*_FILE` / `*_DIR` constants with `tmp_path`.
- No "today" literal in tests; compute from `datetime.now()`.
- Never write company names, people, hostnames or IDs into the engine. `./ozos scrub-check` runs in the pre-commit hook; never `--no-verify`.
- System `python3` only. No new Python dependencies (PyYAML, python-dotenv, FastAPI already present).
- Commit format `[tool-name] …` (`[app]`, `[ozos-cli]`, `[skills]`, `[docs]`, `[connectors]`, `[vault-template]`). Push to `origin main` after every task.
- Item ids and group order are fixed by the brief (Task 2). Sidebar label is "Setup", placed first in the nav (right under the logo, which is Home).
- The `.env` endpoint writes only variable names declared in the registry and never returns values.
- Frontend increments are each verified with a headless Playwright screenshot against `design-system/ozos-brain/MASTER.md` (dark theme, Fira Code/Sans, Lucide icons, cursor:pointer, visible focus, 150–300 ms transitions); the user pre-approved each increment.

## Review Focus

1. `setup.json` is missing, empty (`{}`) or malformed → `GET /api/setup` still returns every registry item as `not_started` and the first write recreates the file (Task 2, Task 3).
2. `PUT /api/setup/items/{id}` with an unknown id or a status outside the five allowed values → 404 / 422, file untouched (Task 3).
3. Adding a stakeholder whose person id already exists → 409, no routing change, no sub-row added; adding when `meeting-routing.json` is missing → it is created from the empty default shape (Task 4).
4. `PUT /api/setup/env` with a variable name not in the registry → 422 and nothing written; a value containing a newline → 422 (Task 4).
5. Cadence reminders when the vault has only `example-report` (or no people) → an empty list, and Home shows nothing for reminders (Task 4, Task 10).

---

### Task 1: One vault resolver

**Files:**
- Modify: `skills/ozos_vault.py`
- Modify: `app/backend/vault.py`
- Test: `skills/tests/test_ozos_vault.py`, `app/backend/tests/test_vault.py`

**Interfaces:**
- Produces in `skills/ozos_vault.py`:
  - `user_config_path(home: Path | None = None) -> Path` → `(home or Path.home()) / ".ozos" / "config.json"`
  - `load_user_config(home: Path | None = None) -> dict` → `{}` when missing, malformed, or not a dict (silent)
  - `vault_candidate(engine_root=None, env=None, home=None, config: Mapping | None = None) -> tuple[str, Path]` → `("env", p)` | `("config", p)` | `("default", engine_root / "vault")`; `config` overrides reading the file
  - `vault_dir(...) -> Path` unchanged signature, now `vault_candidate(...)[1]`
- `app/backend/vault.py` keeps `load_user_config(home) -> dict` (with the malformed-file warning) and `resolve_vault(engine_root, env=None, home=None) -> Path` (raises on a missing `OZOS_VAULT` dir, warns and falls back on a missing config dir), but the lookup order comes from `vault_candidate`.

- [ ] **Step 1: Failing tests in `skills/tests/test_ozos_vault.py`**

```python
def test_vault_candidate_reports_source(tmp_path):
    assert vault_candidate(tmp_path, env={"OZOS_VAULT": str(tmp_path / "v")}, home=tmp_path) == ("env", tmp_path / "v")
    (tmp_path / ".ozos").mkdir()
    (tmp_path / ".ozos" / "config.json").write_text(json.dumps({"vault": str(tmp_path / "c")}))
    assert vault_candidate(tmp_path, env={}, home=tmp_path) == ("config", tmp_path / "c")
    assert vault_candidate(tmp_path, env={}, home=tmp_path, config={}) == ("default", tmp_path / "vault")

def test_load_user_config_silent_on_bad_file(tmp_path):
    assert load_user_config(home=tmp_path) == {}
    (tmp_path / ".ozos").mkdir()
    (tmp_path / ".ozos" / "config.json").write_text("{nope")
    assert load_user_config(home=tmp_path) == {}
```

Add to `test_tools_use_the_shared_resolver` the path `"app/backend/vault.py"` and a second assertion for it: `'"OZOS_VAULT"' not in text.replace('FileNotFoundError(f"OZOS_VAULT', "")` — simpler: assert `'env.get("OZOS_VAULT")' not in text` for every file in the list, and that `app/backend/vault.py` contains `vault_candidate`.

- [ ] **Step 2: Run, expect ImportError for `vault_candidate`**

Run: `cd skills && python3 -m pytest tests/test_ozos_vault.py -q`

- [ ] **Step 3: Implement in `skills/ozos_vault.py`; rewrite `app/backend/vault.py` to `sys.path.insert(0, <engine>/skills)` and `import ozos_vault`, delegating the order to `vault_candidate(engine_root, env, home, config=load_user_config(home))`**

Keep the `log.warning` texts: `"Ignoring malformed %s: %s"` and `"config.json vault %s does not exist; using the default vault"`.

- [ ] **Step 4: Both suites green**

Run: `cd skills && python3 -m pytest -q && cd ../app && python3 -m pytest backend/tests/test_vault.py backend/tests/test_vault_seam.py -q`

- [ ] **Step 5: Full pipeline, format, commit, push**

```bash
python3 -m ruff format tools/ skills/ app/ connectors/ && python3 tools/test-pipeline/pipeline.py
git add skills/ozos_vault.py app/backend/vault.py skills/tests/test_ozos_vault.py
git commit -m "[app] resolve the vault through skills/ozos_vault (one lookup order)"
git push origin main
```

---

### Task 2: Setup registry, state file, vault template

**Files:**
- Create: `app/backend/services/setup_registry.py` (pure data; imports nothing from `backend.config`)
- Create: `app/backend/services/setup_state.py`
- Modify: `app/backend/config.py` (add `OZOS_SETUP_FILE = OZOS_CONFIG_DIR / "setup.json"`)
- Modify: `vault-template/.ozos/setup.json`
- Test: `app/backend/tests/test_setup_registry.py`, `app/backend/tests/test_setup_state.py`

**Interfaces:**
- `setup_registry.GROUPS: list[tuple[str, str]]` in this order: `("you","You")`, `("meeting-notes","Meeting notes")`, `("workspace","Chat & workspace")`, `("boards","Boards")`, `("documentation","Documentation")`, `("people","People")`, `("review-cycle","Review cycle")`, `("goals","Goals")`, `("data","Data")`, `("insights","Insights")`.
- `setup_registry.ITEMS: list[dict]`, each `{"id", "group", "title", "why", "writes", "setup_doc", "kind", "vital", "env", "mcp_match", "default_folder"}`; ids in order: `profile`, `gmail-gemini`, `granola`, `routing-folders`, `slack-mcp`, `google-workspace-mcp`, `figma-mcp`, `miro-mcp`, `confluence`, `notion-or-wiki-drop-folder`, `pdf-drop-folder`, `add-stakeholder`, `define-cycle`, `define-goals`, `first-data-point`, `interviews-folder`, `surveys-folder`.
  - `kind` ∈ `profile | gmail | manual | routing | mcp | env | folder | people | cycle | placeholder`.
  - `vital`: `"meeting-notes"` for `gmail-gemini` and `granola`, else `None`.
  - `env`: `["ATLASSIAN_EMAIL","ATLASSIAN_TOKEN","ATLASSIAN_SUBDOMAIN"]` for `confluence`, else `[]`.
  - `mcp_match`: `"slack"`, `"google"`, `"figma"`, `"miro"` for the four MCP items, else `None`.
  - `default_folder`: `"wiki"`, `"pdfs"`, `"user-interviews"`, `"surveys"` for the four folder items, else `None`.
  - `setup_doc`: `docs/connectors/gmail-gemini-notes.md` (gmail-gemini), `docs/connectors/granola.md` (granola), `connectors/atlassian-goals/setup.md` (confluence and define-goals), `connectors/metabase/setup.md` (first-data-point), else `None`.
  - `writes`: a short human string, e.g. `".ozos/meeting-routing.json"`, `"people-hub/people/<id>/meta.yaml + routing"`, `".env (ATLASSIAN_*)"`, `"~/.ozos/config.json"`, `"(nothing; Claude Code MCP)"`.
- `setup_registry.STATUSES = ("not_started","in_progress","done","skipped","needs_attention")`, `ITEM_IDS: list[str]`, `item(item_id) -> dict | None`.
- `setup_state`:
  - `SETUP_FILE` (module constant from config; tests monkeypatch it)
  - `load_state() -> dict` → always `{"items": {...}, "badge_dismissed": bool, "cadence": dict | None}` with every registry id present (missing/malformed file tolerated)
  - `save_state(state: dict) -> None` (atomic write, `indent=2`, creates parent dir)
  - `set_status(item_id, status, notes: str | None = None) -> dict` (returns the item entry; sets `updated_at` to `datetime.now().isoformat(timespec="seconds")`; raises `KeyError` for unknown id, `ValueError` for bad status)
  - `dismiss_badge() -> None`, `add_row(item_id, row: dict) -> None` (appends to `items[id]["rows"]`)

- [ ] **Step 1: Failing tests**

`test_setup_registry.py`:
```python
def test_item_ids_and_group_order():
    assert [g for g, _ in GROUPS] == ["you","meeting-notes","workspace","boards","documentation","people","review-cycle","goals","data","insights"]
    assert ITEM_IDS == ["profile","gmail-gemini","granola","routing-folders","slack-mcp","google-workspace-mcp","figma-mcp","miro-mcp","confluence","notion-or-wiki-drop-folder","pdf-drop-folder","add-stakeholder","define-cycle","define-goals","first-data-point","interviews-folder","surveys-folder"]

def test_every_item_belongs_to_a_group_and_has_copy():
    groups = {g for g, _ in GROUPS}
    for it in ITEMS:
        assert it["group"] in groups and it["title"] and it["why"] and it["kind"]

def test_vault_template_lists_every_item_not_started():
    tpl = json.loads((REPO_ROOT / "vault-template" / ".ozos" / "setup.json").read_text())
    assert set(tpl["items"]) == set(ITEM_IDS)
    assert {v["status"] for v in tpl["items"].values()} == {"not_started"}
    assert tpl["badge_dismissed"] is False

def test_registry_is_importable_without_app_config():
    out = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, 'app'); import backend.services.setup_registry as r; print(len(r.ITEMS)); assert 'backend.config' not in sys.modules"], cwd=REPO_ROOT, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
```

`test_setup_state.py` (fixture monkeypatches `setup_state.SETUP_FILE = tmp_path / ".ozos" / "setup.json"`):
```python
def test_load_state_tolerates_missing_and_malformed(setup_file):
    assert set(load_state()["items"]) == set(ITEM_IDS)
    setup_file.parent.mkdir(parents=True); setup_file.write_text("{nope")
    assert load_state()["items"]["profile"]["status"] == "not_started"

def test_set_status_persists_and_stamps(setup_file):
    entry = set_status("granola", "done", notes="ran /sync-notes")
    assert entry["status"] == "done" and entry["notes"] == "ran /sync-notes"
    assert datetime.fromisoformat(entry["updated_at"]).year == datetime.now().year
    assert json.loads(setup_file.read_text())["items"]["granola"]["status"] == "done"

def test_set_status_rejects_unknown_item_and_status(setup_file):
    with pytest.raises(KeyError): set_status("nope", "done")
    with pytest.raises(ValueError): set_status("granola", "finished")
    assert not setup_file.exists()

def test_dismiss_badge_and_add_row(setup_file):
    dismiss_badge(); add_row("add-stakeholder", {"id": "pat", "display_name": "Pat"})
    s = load_state()
    assert s["badge_dismissed"] is True and s["items"]["add-stakeholder"]["rows"] == [{"id": "pat", "display_name": "Pat"}]
```

- [ ] **Step 2: Run, expect ModuleNotFoundError**

Run: `cd app && python3 -m pytest backend/tests/test_setup_registry.py backend/tests/test_setup_state.py -q`

- [ ] **Step 3: Implement the two modules, the config constant, and rewrite `vault-template/.ozos/setup.json`** to `{"items": {<each id>: {"status": "not_started", "updated_at": null, "notes": ""}}, "badge_dismissed": false, "cadence": null}`.

- [ ] **Step 4: Green, pipeline, format, commit, push**

```bash
git add app/backend/services/setup_registry.py app/backend/services/setup_state.py app/backend/config.py app/backend/tests/test_setup_registry.py app/backend/tests/test_setup_state.py vault-template/.ozos/setup.json
git commit -m "[app] setup journal registry and setup.json state service"
git push origin main
```

---

### Task 3: `/api/setup` read model and status endpoints

**Files:**
- Create: `app/backend/services/setup_view.py`
- Create: `app/backend/routers/setup.py`
- Modify: `app/backend/main.py` (include router)
- Test: `app/backend/tests/test_setup_view.py`, `app/backend/tests/test_setup_router.py`

**Interfaces:**
- `setup_view.build_view() -> dict`:
  ```
  {"groups": [{"id","label","items":[item_view...]}],
   "summary": {"done": int, "total": int, "open": int, "badge_dismissed": bool},
   "cadence": dict | None}
  ```
  `item_view` = registry fields + `status`, `updated_at`, `notes`, `rows`, `derived: {"profile": {...} | "mcp": {"connected": bool, "names": [...]} | "vital": {"status": str} | None}`.
- Derivations (read time, nothing stored):
  - `profile`: `done` when `load_user_config()` has non-empty `name` and `me`; `derived.profile = {"name","me","voice_text"}` (voice_text may be empty).
  - `mcp` items: `connected` = any entry in `discover_mcps()["remote"] + ["local"]` whose lowercase name contains `mcp_match` and whose status is `active` or `pending`; when connected and stored status is not `skipped`, the view shows `done`.
  - `needs_attention`: stored `done` and `vital` set and `load_vitals()` has that vital with status `fail` or `warn`.
  - `summary.total = len(ITEMS)`, `done` = views with status `done`, `open` = total − done − skipped.
- Module seams for tests: `setup_view.load_user_config`, `setup_view.discover_mcps`, `setup_view.load_vitals` are module attributes to monkeypatch.
- Router (`prefix="/setup"`): `GET ""` → `build_view()`; `PUT "/items/{item_id}"` body `{"status": str, "notes": str | None}` → the updated `item_view` (404 unknown id, 422 bad status); `POST "/dismiss"` → `{"badge_dismissed": true}`.

- [ ] **Step 1: Failing tests**

`test_setup_view.py` (fixture: `SETUP_FILE` → tmp; monkeypatch `setup_view.load_user_config=lambda: {}`, `discover_mcps=lambda: {"remote": [], "local": []}`, `load_vitals=lambda: []`):
```python
def test_fresh_vault_everything_not_started(view_env):
    v = build_view()
    assert [g["id"] for g in v["groups"]][0] == "you"
    assert v["summary"] == {"done": 0, "total": 17, "open": 17, "badge_dismissed": False}

def test_profile_done_when_config_has_name_and_me(view_env, monkeypatch):
    monkeypatch.setattr(setup_view, "load_user_config", lambda: {"name": "Taylor", "me": "taylor"})
    item = next(i for g in build_view()["groups"] for i in g["items"] if i["id"] == "profile")
    assert item["status"] == "done" and item["derived"]["profile"]["me"] == "taylor"

def test_mcp_connected_derives_done(view_env, monkeypatch):
    monkeypatch.setattr(setup_view, "discover_mcps", lambda: {"remote": [{"name": "Slack", "status": "active"}], "local": []})
    items = {i["id"]: i for g in build_view()["groups"] for i in g["items"]}
    assert items["slack-mcp"]["status"] == "done" and items["slack-mcp"]["derived"]["mcp"]["connected"]
    assert items["figma-mcp"]["status"] == "not_started"

def test_done_item_with_stale_vital_needs_attention(view_env, monkeypatch):
    set_status("gmail-gemini", "done")
    monkeypatch.setattr(setup_view, "load_vitals", lambda: [{"id": "meeting-notes", "status": "warn"}])
    items = {i["id"]: i for g in build_view()["groups"] for i in g["items"]}
    assert items["gmail-gemini"]["status"] == "needs_attention"
    assert items["granola"]["status"] == "not_started"
```

`test_setup_router.py` (TestClient on `backend.main.app` with the same seams):
```python
def test_get_setup_lists_groups(client_env): assert client.get("/api/setup").json()["summary"]["total"] == 17
def test_put_item_status(client_env):
    r = client.put("/api/setup/items/granola", json={"status": "skipped", "notes": "no granola here"})
    assert r.status_code == 200 and r.json()["status"] == "skipped"
    assert client.get("/api/setup").json()["summary"]["open"] == 16
def test_put_unknown_item_404_and_bad_status_422(client_env):
    assert client.put("/api/setup/items/nope", json={"status": "done"}).status_code == 404
    assert client.put("/api/setup/items/granola", json={"status": "finished"}).status_code == 422
def test_dismiss(client_env):
    assert client.post("/api/setup/dismiss").json() == {"badge_dismissed": True}
    assert client.get("/api/setup").json()["summary"]["badge_dismissed"] is True
```

- [ ] **Step 2: Run, expect import errors / 404**
- [ ] **Step 3: Implement `setup_view.py` and `routers/setup.py`; register in `main.py`**

Status body as a pydantic model with `status: Literal[...]` so FastAPI returns 422 itself.

- [ ] **Step 4: Green, pipeline, format, commit, push**

```bash
git commit -m "[app] GET/PUT /api/setup with derived profile, MCP and needs_attention states"
git push origin main
```

---

### Task 4: Setup actions (the forms' backend)

**Files:**
- Create: `app/backend/services/setup_actions.py`
- Modify: `app/backend/routers/setup.py` (new endpoints)
- Test: `app/backend/tests/test_setup_actions.py`, extend `app/backend/tests/test_setup_router.py`

**Interfaces** (all in `setup_actions`; module constants `ROUTING_FILE = OZOS_CONFIG_DIR / "meeting-routing.json"`, `SOURCES_FILE = OZOS_KNOWLEDGE_SOURCES`, `ENV_FILE = VAULT / ".env"`, `KNOWLEDGE_HUB_DIR`, `DATA_DIR`, `GDRIVE_CREDS = Path.home() / ".gdrive-credentials.json"`, `GMAIL_TOKEN = Path.home() / ".config" / "ozos" / "meeting-notes-token.json"` — tests monkeypatch every one):

- `load_routing() -> dict` → file or the empty default `{"folders": ["Other"], "default_folder": "Other", "person_folders": {}, "group_rules": [], "drive_parent_folder_id": None, "tagging_guide": ""}`; `save_routing(d)`.
- `add_stakeholder(p: dict) -> dict` with `p = {"person_id","display_name","email","team_folder","leadership": bool,"manager","role"?}`:
  1. `409`-class error (`FileExistsError`) if `DATA_DIR/people/<id>` exists.
  2. `data.create_person(id, {"name": id, "display_name", "role" (default ""), "start_date": today ISO, "manager", "email"})`.
  3. routing: `person_folders[email.lower()] = display_name` (when email given); `team_folder` appended to `folders` if new; when `leadership`, the rule `{"folder": "Leadership", "members": [...], "min_present": 3}` is created if absent and `display_name.split()[0].lower()` appended to its members if absent; `"Leadership"` appended to `folders` if absent.
  4. If `DATA_DIR/people/example-report` exists → `data.delete_person("example-report")`.
  5. `setup_state.add_row("add-stakeholder", {"id", "display_name", "added_at"})`; `set_status("add-stakeholder", "done")`.
  6. Returns `{"person": meta, "routing": routing, "removed_example": bool}`.
- `set_company_cycle(name: str, cycle_type: str, stages: list[dict]) -> dict`: `stages = [{"id"?, "label", "start", "end"}]` (id defaults to slug of label); removes the `example-annual` cycle if present, adds `<slug(name)>` with `{"name", "type", "events"}`, sets `active_cycle`; stores `cadence = {"mode": "company", "cycle_id": slug}`; `set_status("define-cycle","done")`; returns cycles data.
- `set_default_cadence() -> dict`: `cadence = {"mode": "default", "monthly": "1:1 note check", "quarterly": "written reflection", "set_at": ISO}`; `set_status("define-cycle","done")`.
- `reminders(now: datetime | None = None) -> list[dict]`: `[]` unless `cadence.mode == "default"`; reports = `data.list_people()` minus `example-report` minus `ME_PERSON_ID`; each `{"person_id","display_name","monthly_due": first day of next month (ISO date),"quarterly_due": first day of next quarter}`.
- `add_drop_folder(item_id: str, folder: str) -> dict`: item must be of kind `folder`; sanitises `folder` to `[a-z0-9-]`; creates `KNOWLEDGE_HUB_DIR/<folder>`; adds `{"id": folder, "label": Title Case, "path": f"knowledge-hub/{folder}"}` to `SOURCES_FILE` if absent; `set_status(item_id, "done", notes=f"knowledge-hub/{folder}")`; returns the source entry.
- `update_routing(folders: list[str] | None, default_folder: str | None, tagging_guide: str | None, drive_parent_folder_id: str | None | Unset) -> dict`: merges into routing; keeps `default_folder` inside `folders`; marks `routing-folders` done when `folders` were provided.
- `env_status() -> dict[str, bool]`: for every name in any item's `env`, whether `dotenv_values(ENV_FILE)` has a non-empty value. **Never values.**
- `write_env(vars: dict[str, str]) -> list[str]`: rejects (`ValueError`) any name not in the registry whitelist or any value containing `\n` or `\r`; replaces `NAME=` lines in place, appends missing ones, `chmod 600`; returns names written. Marks the owning item `done` when all of its names are set.
- `gmail_status() -> dict`: `{"credentials_file": bool, "token_file": bool, "drive_parent_folder_id": str | None, "auth_command": "python3 tools/meeting-notes/sync_gemini_notes.py --auth"}`.
- Router additions: `POST /setup/people` (409 on duplicate), `PUT /setup/cycle` body `{"mode": "company", "name", "type", "stages"} | {"mode": "default"}`, `GET /setup/reminders`, `POST /setup/folders` body `{"item_id","folder"}` (422 wrong kind), `PUT /setup/routing`, `GET /setup/env` (booleans), `PUT /setup/env` body `{"vars": {...}}` → `{"set": [names]}` (422 on rejected name/value), `GET /setup/gmail`.

- [ ] **Step 1: Failing tests** (fixture `vault` builds a tmp vault: `people-hub/people/example-report/meta.yaml`, `people-hub/cycles.yaml` copied from `vault-template`, `.ozos/` empty; monkeypatches the constants above, `setup_state.SETUP_FILE`, `data.DATA_DIR`, `setup_actions.ME_PERSON_ID = "me"`)

```python
def test_add_stakeholder_writes_everything_in_one_call(vault):
    out = add_stakeholder({"person_id": "pat", "display_name": "Pat Example", "email": "Pat@Example.com", "team_folder": "Growth", "leadership": True, "manager": "Taylor"})
    assert (vault / "people-hub/people/pat/meta.yaml").exists()
    assert not (vault / "people-hub/people/example-report").exists() and out["removed_example"]
    r = json.loads((vault / ".ozos/meeting-routing.json").read_text())
    assert r["person_folders"] == {"pat@example.com": "Pat Example"}
    assert "Growth" in r["folders"] and "Leadership" in r["folders"]
    assert r["group_rules"] == [{"folder": "Leadership", "members": ["pat"], "min_present": 3}]
    state = load_state()["items"]["add-stakeholder"]
    assert state["status"] == "done" and state["rows"][0]["id"] == "pat"

def test_add_second_leader_extends_existing_rule_and_duplicate_is_rejected(vault): ...
def test_add_stakeholder_without_routing_file_creates_default_shape(vault): ...
def test_company_cycle_replaces_example(vault):
    data = set_company_cycle("Annual Review", "deep-dive", [{"label": "Self Assessment", "start": "2027-01-10", "end": "2027-01-24"}])
    assert "example-annual" not in data["cycles"] and data["active_cycle"] == "annual-review"
    assert data["cycles"]["annual-review"]["events"][0]["id"] == "self-assessment"
def test_default_cadence_reminders_skip_example_and_me(vault):
    set_default_cadence(); create_person("me", {...}); create_person("sam", {"display_name": "Sam"})
    now = datetime(datetime.now().year, 5, 17)
    [r] = reminders(now)
    assert r["person_id"] == "sam" and r["monthly_due"] == f"{now.year}-06-01" and r["quarterly_due"] == f"{now.year}-07-01"
def test_reminders_empty_without_default_cadence_or_reports(vault): ...
def test_drop_folder_creates_dir_and_source(vault): ...  # also rejects item kind != folder
def test_env_write_whitelist_and_no_echo(vault):
    assert write_env({"ATLASSIAN_EMAIL": "a@b.c", "ATLASSIAN_TOKEN": "t", "ATLASSIAN_SUBDOMAIN": "acme"}) == [...]
    assert (vault / ".env").stat().st_mode & 0o777 == 0o600
    assert env_status() == {"ATLASSIAN_EMAIL": True, "ATLASSIAN_TOKEN": True, "ATLASSIAN_SUBDOMAIN": True}
    assert load_state()["items"]["confluence"]["status"] == "done"
    with pytest.raises(ValueError): write_env({"ANTHROPIC_API_KEY": "x"})
    with pytest.raises(ValueError): write_env({"ATLASSIAN_TOKEN": "a\nb"})
def test_env_write_preserves_other_lines(vault): ...
def test_update_routing_marks_done_and_keeps_default_folder(vault): ...
def test_gmail_status_reports_files(vault, tmp_path): ...
```
Router tests: `POST /api/setup/people` 200 then 409; `PUT /api/setup/env` with a bad name → 422 and response body has no values; `GET /api/setup/env` returns only booleans; `GET /api/setup/reminders` returns a list.

- [ ] **Step 2: Run, expect failures**
- [ ] **Step 3: Implement `setup_actions.py` and the router endpoints**
- [ ] **Step 4: Green, pipeline, format, commit, push**

```bash
git commit -m "[app] setup actions: stakeholder, cycle, cadence reminders, drop folders, routing, env, gmail checks"
git push origin main
```

---

### Task 5: Frontend increment A — Setup nav entry and read-only checklist

**Files:**
- Create: `app/frontend/src/types/setup.ts`, `app/frontend/src/lib/setup.ts`, `app/frontend/src/pages/Setup.tsx`, `app/frontend/src/components/setup/StatusChip.tsx`, `app/frontend/src/components/setup/SetupItemRow.tsx`
- Modify: `app/frontend/src/components/Sidebar.tsx` (`Page` gains `'setup'`; NAV item `{ page: 'setup', icon: ListChecks, label: 'Setup' }` first), `app/frontend/src/lib/initial-page.ts` (add `'setup'`), `app/frontend/src/App.tsx` (route), `app/frontend/src/api.ts` (`getSetup`, `setSetupStatus`, `dismissSetup`)
- Test: `app/frontend/src/components/__tests__/Sidebar.test.tsx` (add), `app/frontend/src/lib/__tests__/setup.test.ts`, `app/frontend/src/pages/__tests__/Setup.test.tsx`, `app/frontend/src/components/setup/__tests__/StatusChip.test.tsx`

**Interfaces:**
- `types/setup.ts`: `SetupStatus`, `SetupItem` (mirrors `item_view`), `SetupGroup`, `SetupView`, `Reminder`, `GmailStatus`.
- `lib/setup.ts`: `statusLabel(s: SetupStatus): string` → `Not started | In progress | Done | Skipped | Needs attention`; `progressText(summary): string` → `Setup: ${done} of ${total} done`; `showBadge(summary): boolean` → `!badge_dismissed && open > 0`.
- `StatusChip({ status })` renders `statusLabel` with `data-status={status}`; colours: done `#22C55E`, needs_attention `#EF4444`, in_progress `#F59E0B`, skipped `#475569`, not_started `#94A3B8` (border 1px of the same colour at 40% alpha, transparent fill, Fira Code 10px uppercase, 2px letter-spacing).
- `SetupItemRow({ item, onStatus, children })`: title, "why" line in `--text-dim`, `writes` in 10px mono, chip at right; `children` is the form slot (empty in this increment).
- `Setup` page: `PageHeader title="Setup" subtitle="Connect your sources one at a time. Nothing here gates anything." icon={<ListChecks size={44} strokeWidth={1.5}/>}`, then one section per group: label in `.section-label`, rows in a `.card`-styled list. Loading state text `Loading setup…`; error text `Could not load setup`.

- [ ] **Step 1: Failing tests** — Sidebar: `renders a Setup nav item first and navigates to setup`; lib: the three helpers; StatusChip: label + `data-status`; Setup page (mock `../../api` `getSetup` resolving a two-group fixture): group labels in order, item titles, chips.
- [ ] **Step 2: Run `npx vitest run src/components/__tests__/Sidebar.test.tsx src/lib/__tests__/setup.test.ts src/pages/__tests__/Setup.test.tsx src/components/setup` — expect failures**
- [ ] **Step 3: Implement; `npx tsc --noEmit && npx vitest run` green**
- [ ] **Step 4: Screenshot audit** — start backend (`cd app && uvicorn backend.main:app --port 8765`) and frontend (`npm run dev`), then `python3 ~/.claude/skills/design-audit/shoot.py "http://localhost:5173/?page=setup" <scratchpad>/setup-a.png --width 1280`. Read the PNG; check against MASTER.md (dark bg, Fira Code headings, Lucide icon, chips readable at 4.5:1). Fix and re-shoot until clean.
- [ ] **Step 5: Format, pipeline, commit, push**

```bash
(cd app/frontend && npm run format) && python3 tools/test-pipeline/pipeline.py
git commit -m "[app] Setup page: sidebar entry and grouped read-only checklist"
git push origin main
```

---

### Task 6: Frontend increment B — status controls

**Files:**
- Modify: `app/frontend/src/components/setup/SetupItemRow.tsx`, `app/frontend/src/pages/Setup.tsx`
- Test: `app/frontend/src/components/setup/__tests__/SetupItemRow.test.tsx`

**Interfaces:**
- Controls per row, derived from status: `not_started | in_progress | needs_attention` → buttons `Mark done`, `Skip`; `done | skipped` → `Reopen`. `profile` and MCP-kind rows whose status is derived show no `Mark done` (only `Skip`/`Reopen` where meaningful). Each click calls `onStatus(item.id, newStatus)`; the page calls `api.setSetupStatus` and replaces the item in state from the response.
- Buttons use `.btn-neon` sizing 10px with `cursor: pointer` and visible `:focus-visible` outline (`2px solid var(--neon-cyan)`).

- [ ] **Step 1: Failing tests** — `Mark done` calls `onStatus(id,'done')`; `Skip` → `'skipped'`; a done row shows only `Reopen` → `'not_started'`; a profile row shows no `Mark done`.
- [ ] **Step 2: Run, expect failures** — **Step 3: Implement, green** — **Step 4: Screenshot `setup-b.png`, audit** — **Step 5: Format, pipeline, commit `[app] Setup page: mark done / skip / reopen controls`, push**

---

### Task 7: Frontend increment C — stakeholder form

**Files:**
- Create: `app/frontend/src/components/setup/StakeholderForm.tsx`
- Modify: `app/frontend/src/api.ts` (`addStakeholder`), `app/frontend/src/pages/Setup.tsx` (render form for kind `people`, show `rows` as sub-rows "Added: Pat Example · 2026-…")
- Test: `app/frontend/src/components/setup/__tests__/StakeholderForm.test.tsx`

**Interfaces:**
- `StakeholderForm({ onSubmit })` fields: Name (display_name), Person id (auto-slugged from name until edited), Email, Team folder, checkbox "Member of leadership group", Manager. Submit disabled until name and id present. `onSubmit(payload)` resolves → form resets and a one-line confirmation `Added <name>. Example person removed.` when `removed_example`. A 409 shows `A person with id "<id>" already exists.`

- [ ] **Step 1: Failing tests** — slug derivation (`"Pat Example"` → `pat-example`), submit payload shape, 409 message, reset after success.
- [ ] **Steps 2–5** as above; commit `[app] Setup page: add-stakeholder form writes person, routing and leadership rule`, push.

---

### Task 8: Frontend increment D — review cycle form

**Files:**
- Create: `app/frontend/src/components/setup/CycleForm.tsx`
- Modify: `api.ts` (`setSetupCycle`), `Setup.tsx` (render for kind `cycle`)
- Test: `app/frontend/src/components/setup/__tests__/CycleForm.test.tsx`

**Interfaces:**
- Two choices as radio-style buttons: `Company cycle` (name, type select `deep-dive | light-touch`, a stage table with label/start/end rows, "Add stage") and `Default cadence` (text: monthly 1:1 note check and quarterly written reflection per report; one button `Use default cadence`). `onSubmit` receives `{mode:'company', name, type, stages}` or `{mode:'default'}`.

- [ ] **Steps 1–5**: tests (default submit payload; company submit payload with two stages; submit disabled with no stages), implement, screenshot `setup-d.png`, commit `[app] Setup page: review cycle form (company stages or default cadence)`, push.

---

### Task 9: Frontend increment E — env, folder, routing, MCP and Gmail panels

**Files:**
- Create: `app/frontend/src/components/setup/EnvForm.tsx`, `FolderForm.tsx`, `RoutingForm.tsx`, `McpPanel.tsx`, `GmailPanel.tsx`, `PlaceholderPanel.tsx`
- Modify: `api.ts` (`getSetupEnv`, `setSetupEnv`, `addSetupFolder`, `setSetupRouting`, `getSetupGmail`), `Setup.tsx` (dispatch by `kind`)
- Test: one test file per component under `components/setup/__tests__/`

**Interfaces:**
- `EnvForm({ names, status, onSave })`: one input per name, `type="password"` for names containing `TOKEN|KEY|PASSWORD`; placeholder `set` when `status[name]` is true; never pre-fills a value; `onSave(vars)` sends only non-empty fields.
- `FolderForm({ defaultFolder, onCreate })`: single input prefilled with `default_folder`; `onCreate(folder)`.
- `RoutingForm({ routing?, onSave })`: textarea folders (one per line), default folder, tagging guide; `onSave({folders, default_folder, tagging_guide})`.
- `McpPanel({ item })`: shows `In Claude Code run /mcp, enable <Title> and authenticate.`, then `Connected (<names>)` in green or `Not detected yet` in amber from `item.derived.mcp`.
- `GmailPanel({ status, onSaveDrive })`: three check lines (credentials file, token file, drive folder id), the auth command in a `<code>` block, an input for the optional Drive folder id.
- `PlaceholderPanel({ phase })`: `Arrives in Phase <n>. Skip this for now.`
- `granola` (kind `manual`): a short text with `/sync-notes`; no form.

- [ ] **Steps 1–5**: tests (EnvForm sends only filled names and never renders values; FolderForm default; McpPanel connected/not; GmailPanel renders the command), implement, screenshot `setup-e.png` with the confluence and slack rows expanded, commit `[app] Setup page: env, drop-folder, routing, MCP and Gmail panels`, push.

---

### Task 10: Frontend increment F — Home badge and cadence reminders

**Files:**
- Create: `app/frontend/src/components/SetupBadge.tsx`, `app/frontend/src/components/CadenceReminders.tsx`
- Modify: `app/frontend/src/pages/Home.tsx` (accepts `onNavigate?: (p: Page) => void`; renders both under the title), `app/frontend/src/App.tsx` (passes `setPage`), `api.ts` (`getSetupReminders`)
- Test: `app/frontend/src/components/__tests__/SetupBadge.test.tsx`, `CadenceReminders.test.tsx`, `app/frontend/src/pages/__tests__/Home.test.tsx`

**Interfaces:**
- `SetupBadge({ summary, onOpen, onDismiss })`: renders `progressText(summary)` as a button-like pill linking to Setup; a small `×` with `aria-label="Dismiss setup badge"` calls `onDismiss` → `api.dismissSetup()`; hidden when `!showBadge(summary)`.
- `CadenceReminders({ reminders })`: renders nothing when empty; otherwise title `Reminders` and one line per report: `<display_name> — 1:1 note check due <monthly_due> · reflection due <quarterly_due>`.
- Home fetches `api.getSetup()` and `api.getSetupReminders()` on mount; failures render nothing (Home must never break).

- [ ] **Steps 1–5**: tests (badge text and dismissal, hidden when dismissed or open=0, reminders empty vs list, Home passes navigation), implement, screenshot `home-f.png`, commit `[app] Home: setup progress badge and cadence reminders`, push.

---

### Task 11: `ozos setup` CLI and `/ozos-setup` skill

**Files:**
- Modify: `tools/ozos-cli/cli.py` (subcommand `setup` with `--json`, and `setup mark <item> <status> [--notes]`)
- Create: `.claude/skills/ozos-setup/SKILL.md`
- Test: `tools/ozos-cli/tests/test_setup_cmd.py`

**Interfaces:**
- `cli.setup_cmd(args) -> int`: resolves the vault with `skills/ozos_vault.vault_dir()`; imports `backend.services.setup_registry` by inserting `<engine>/app` on `sys.path` (pure data, Task 2 guarantees it); reads `<vault>/.ozos/setup.json` through `setup_state`-equivalent tolerant parsing (missing → all not_started); prints groups and items as `  [status] title` with a final `N of M done`; `--json` prints `{"groups": [...], "summary": {...}}`. `mark` writes the status via `backend.services.setup_state` with `SETUP_FILE` pointed at the resolved vault (the CLI sets `backend.config` aside by importing `setup_state` only after setting `OZOS_VAULT`? No: `setup_state` imports `config`, which loads the real vault. Ruling: the CLI reimplements only the 15-line tolerant read/write in `cli.py` using the registry for ids and statuses; derived states are not shown by the CLI.)
- Skill: frontmatter `name: ozos-setup`, `description`, `user_invocable: true`. Body: (1) run `./ozos setup --json`; (2) list what is left grouped; (3) ask which ONE item to do, or pick the first open one; (4) read that item's `setup_doc` from the registry when present; (5) walk through it conversationally; (6) write: if `curl -s localhost:8765/health` is ok, call the matching `/api/setup/*` endpoint (table of item kind → endpoint and JSON body); otherwise run the same action in-process: `cd app && python3 -c "from backend.services import setup_actions as a; print(a.<fn>(...))"`; (7) mark with `./ozos setup mark <id> done`; (8) stop after one item and show the new count.

- [ ] **Step 1: Failing tests** — `setup` prints every title and `0 of 17 done` on a template vault (tmp vault, `OZOS_VAULT` set in `env`); `--json` has 10 groups; `mark granola skipped` writes the file and a second `setup` run prints `[skipped]`; `mark nope done` exits 1.
- [ ] **Step 2: Run, expect failures** — **Step 3: Implement** — **Step 4: Green; pipeline** — **Step 5: Write the skill; commit `[ozos-cli] ozos setup checklist and mark; /ozos-setup skill`, push**

---

### Task 12: Connector setup docs

**Files:**
- Create: `connectors/metabase/setup.md`, `connectors/atlassian-goals/setup.md`, `docs/connectors/gmail-gemini-notes.md`, `docs/connectors/granola.md`
- Modify: `connectors/atlassian-goals/README.md` (fix the stale `tools/atlassian-goals-mcp` path and "project root .env" → vault `.env`), `connectors/metabase/README.md` (test path `connectors/metabase/tests/`)
- Test: `app/backend/tests/test_setup_registry.py::test_setup_docs_exist` (every non-null `setup_doc` is a file with the four headings)

**Interfaces:** Each doc has exactly these H2 headings in order: `What it gives you`, `What you need`, `Steps`, `How to verify`. Example wording only (`yourcompany`, `you@yourcompany.com`); no real hosts or ids.

- [ ] **Step 1: Failing test** — **Step 2: Run** — **Step 3: Write the four docs and README fixes** — **Step 4: Green, scrub-check, commit `[connectors] setup.md for metabase and atlassian-goals; docs/connectors for gmail-gemini and granola`, push**

---

### Task 13: Docs and template catch-up

**Files:**
- Modify: `docs/SETUP.md` (section 5 → the Setup page and `/ozos-setup`; old JSON instructions move to a new appendix `A. JSON reference`; sections 6, 7 and 9 updated: people and cycle via Setup, "What is not here yet" now lists Phases 3–5 only), `README.md` (Status: Phase 2 done; layout line mentions `docs/connectors/`), `CLAUDE.md` + `AGENTS.md` project-structure block (`.claude/skills/ozos-setup`, `docs/connectors/`), `app/README.md` if it lists routers.
- Test: `app/backend/tests/test_setup_registry.py::test_setup_guide_mentions_setup_page` (SETUP.md contains `Setup page` and `/ozos-setup`, and no longer says `Until the Setup page ships`).

- [ ] **Steps**: failing doc test → run → edit docs → green → `./ozos scrub-check` → commit `[docs] SETUP.md around the Setup page and /ozos-setup; README status` → push.

---

### Task 14: Final verification and review

- [ ] `python3 tools/test-pipeline/pipeline.py` → `0 failing`, no `NOT COLLECTED`.
- [ ] `cd app/frontend && npx tsc --noEmit && npx vitest run` green; `npm run format:check` clean; `python3 -m ruff format --check tools/ skills/ app/ connectors/` clean.
- [ ] `./ozos scrub-check` clean.
- [ ] Boot the app against the real vault; shoot `home` and `setup` once more.
- [ ] `graphify update .`
- [ ] Dispatch one fresh reviewer (most capable model) over `git diff 633f905..HEAD`; for every Critical/Important finding: failing test, fix, green, commit, push. Minors go to the final message.
- [ ] `git status --short && git log origin/main..HEAD` both print nothing.

## Rulings made while planning (each with its cost if wrong)

- **Derived states are never stored.** Profile, MCP connected and needs_attention are computed in `build_view`; the CLI shows stored state only. Cost: `ozos setup` can say `not_started` for an MCP the app shows as done.
- **MCP "one command" is `/mcp`** (Claude Code's MCP manager, where claude.ai connectors are enabled and authenticated); the engine already discovers those connectors through `claude mcp list`. Cost: a user who installs a local MCP server instead needs the connector's own docs.
- **A connected MCP item shows `done`** without a click. Cost: none, `Skip`/`Reopen` still work.
- **Leadership folder name is literally `Leadership`** and the rule threshold is 3, per the brief. Cost: a rename means editing routing JSON.
- **Company cycle replaces only the `example-annual` cycle**, other cycles are kept. Cost: none for a fresh vault.
- **Default-cadence due dates** are the first day of the next month and of the next quarter, computed from `datetime.now()` at request time; nothing is persisted per report. Cost: no "done this month" tracking (Phase 3 territory).
- **Drop-folder items create the folder under `knowledge-hub/`** and register it in `knowledge-sources.json` for a stable label; hub folders are auto-discovered, so the entry is informational. Cost: none.
- **`.env` writes are whitelisted by the registry** (only `ATLASSIAN_EMAIL`, `ATLASSIAN_TOKEN`, `ATLASSIAN_SUBDOMAIN` in Phase 2). Metabase and Goals variables stay in the docs until Phases 3–4 add their items. Cost: the Confluence form is the only env form today.
- **The CLI does not import `backend.config`** (it would load the real vault and `.env`); it reads/writes `setup.json` with its own tolerant 15 lines and takes ids from the registry. Cost: two tiny readers of the same JSON shape, pinned by tests on both sides.
