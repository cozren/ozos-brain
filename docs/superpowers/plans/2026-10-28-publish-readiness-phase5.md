# Publish readiness (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the engine repo publishable: a committed demo vault a stranger can run in two commands, screenshots and a README written for strangers, CONTRIBUTING and SECURITY, a history scrub, the stranger-facing deferred minors fixed, and repo metadata set. The flip to public is **not** part of this plan.

**Architecture:** `vault-demo/` is a second vault template with a fictional company; `./ozos init --demo` copies it instead of `vault-template/` and refreshes its CSV data points so tiles are populated. `./ozos scrub-check --history` walks `git log -p --all` with the same term list as the tree check. Screenshots are headless Playwright captures of the app booted against `vault-demo/`, committed under `docs/images/`. A repo-hygiene test file pins the stranger-facing files (README, CONTRIBUTING, SECURITY, package.json, `.github/`, images) so they cannot regress.

**Tech Stack:** Python 3 stdlib (`subprocess`, `argparse`, `csv`, pytest), FastAPI backend, React 19 + Vite (vitest), Playwright chromium via `~/.claude/skills/design-audit/shoot.py`, `gh` CLI.

**Spec:** The private archive repo's `docs/superpowers/specs/2026-10-27-ozos-app-vault-extraction-design.md` (section 2 "publishable", section 6.7 scrub guard, section 7 Phase 5). Not copied here because it names company terms. The task brief for this phase (decisions already made) is reproduced in the Rulings section where it narrows the spec.

## Global Constraints

- TDD: failing test first, watch it fail for the right reason, minimal code, green. Whole suite before any task is done: `python3 tools/test-pipeline/pipeline.py` → `0 failing`, no `NOT COLLECTED`.
- Frontend gate: `cd app/frontend && npx tsc --noEmit && npx vitest run`. `npm run build` is not a gate.
- Format before commit: `python3 -m ruff format tools/ skills/ app/ connectors/` and `cd app/frontend && npm run format`.
- Tests never touch a real vault, `~/.ozos` or the network: monkeypatch `cli.HOME`, service `*_FILE` / `*_DIR` constants with `tmp_path`.
- No "today" literal in tests. Demo *data* may carry fixed 2026 dates (it is content, not a test).
- No real person, company, host, id or scrub-list term anywhere in the engine, `vault-demo/` included. `./ozos scrub-check` scans `vault-demo/` (only `vault/` is excluded). Never `--no-verify`.
- Nothing in this phase writes outside the engine repo, except a throwaway `HOME` under the session scratchpad used to boot the app against the demo vault for screenshots.
- Never run `gh repo edit --visibility` or anything else that makes the repo public. `gh repo edit` is used once, for `--description` and `--add-topic` only.
- The launch video line at the top of `README.md` (`https://github.com/user-attachments/assets/d752f9cd-4c36-4aa4-b760-04267fc0b7da`) stays byte-identical and stays the first thing after the opening paragraph.
- Commit format `[tool-name] …` (`[app]`, `[ozos-cli]`, `[vault-demo]`, `[docs]`, `[engine]`). Push to `origin main` after every task.
- No new Python or npm dependency.

## Review Focus

1. A `meta.yaml` that is empty or holds a bare string → `GET /api/people` still answers 200 with the folder name as the id (Task 1c).
2. `datapoints.json` whose `datapoints` key is a number, string or object → `GET /api/datapoints` returns `[]`, never 500 (Task 1d).
3. Insights Hub on a vault with no digest yet → the feed shows an empty state, not `Load report failed: 404` (Task 1b).
4. `scrub-check --history` on a repo whose working tree is clean but whose earlier commit held a term → reports that commit and the term with exit 1; a repo with no commits or no `.git` → a readable error, not a traceback (Task 2).
5. `./ozos init --demo` on a machine whose `~/.ozos/config.json` names another vault → the existing refusal with the `--force` hint, and nothing copied (Task 3).

---

### Task 1: Stranger-facing deferred minors (test-first, one commit each)

**Files:**
- Modify: `app/backend/services/control_tower.py:832` (`load_session`)
- Modify: `app/frontend/src/components/reporting/ReportFeed.tsx:46-66`
- Modify: `app/backend/services/data.py:17-28` (`list_people`)
- Modify: `app/backend/services/datapoints.py:145-158` (`load_datapoints`)
- Modify: `docs/SETUP.md` section 9 ("Two cadences" paragraph)
- Modify: `vault-template/.gitignore`
- Modify: `tools/youtube-xray/README.md` (four `claude-sonnet-4-6` mentions)
- Test: `app/backend/tests/test_control_tower.py`, `app/frontend/src/components/reporting/ReportFeed.test.tsx` (create if absent), `app/tests/test_data.py`, `app/backend/tests/test_datapoints.py`, `app/backend/tests/test_setup_registry.py`, `tools/ozos-cli/tests/test_cli.py`

**Interfaces:**
- Produces: nothing new; behaviours only.

- [ ] **1a. Session model.** Test `test_session_model_follows_the_shared_llm_setting(monkeypatch)` in `test_control_tower.py`: `monkeypatch.setenv("OZOS_LLM_MODEL", "claude-test-1")`; `load_session(time.time())["model"] == "claude-test-1"`; with the variable deleted it equals `llm_client`'s default model name (import the constant the service exposes; if `app/backend/services/llm_client.py` has no public default, add `DEFAULT_MODEL` re-exported from `skills/ozos_llm.py`). Run → FAIL on `claude-sonnet-4-6`. Fix: `"model": os.environ.get("OZOS_LLM_MODEL") or DEFAULT_MODEL`. Also replace the four `claude-sonnet-4-6` mentions in `tools/youtube-xray/README.md` with "the shared model (`OZOS_LLM_MODEL`, default `claude-sonnet-5-5`)". Green → commit `[app] session status reports the configured LLM model, not a hardcoded id`.
- [ ] **1b. Insights feed on an empty source.** vitest `ReportFeed.test.tsx`: mock `api.getReportSources` → `[{id:'daily-digest', label:'Daily Digest', kind:'script', body:'markdown', runnable:true}]`, `api.getReportInstances` → `[]`, `api.getReportInstance` → `vi.fn()` that throws; render `<ReportFeed sourceId="daily-digest" …required props />`; assert `getReportInstance` was **not called** and the text `No Daily Digest yet` is on screen and no `Load report failed` text. Run → FAIL. Fix: after `setInstances(list)`, `if (list.length === 0) return` before the `latest` fetch; render `<p>No {source.label} yet</p>` (styled like the page's other empty states) when `instances.length === 0 && !instance`. Green → `npm run format` → commit `[app] Insights feed shows an empty state instead of a 404 when a source has no instances yet`.
- [ ] **1c. Empty `meta.yaml`.** Test `test_list_people_tolerates_an_empty_meta_yaml(tmp_data_dir)`: write `""` to `people/blank/meta.yaml` and `"just a string\n"` to `people/str/meta.yaml`; `list_people()` ids include `blank` and `str`; each has `name == folder`. Run → FAIL `TypeError`. Fix: `meta = yaml.safe_load(f); meta = meta if isinstance(meta, dict) else {}`. Green → commit `[app] list_people tolerates an empty or non-mapping meta.yaml`.
- [ ] **1d. Non-list `datapoints` key.** Test `test_load_datapoints_ignores_a_non_list_key` (parametrize over `5`, `"x"`, `{"a": 1}`) in `test_datapoints.py` using the file's existing `DATAPOINTS_FILE` monkeypatch pattern: `load_datapoints() == []`. Run → FAIL on `5` (`TypeError`). Fix: `raw = loaded.get("datapoints"); if not isinstance(raw, list): return []`. Green → commit `[app] load_datapoints returns [] when the datapoints key is not a list`.
- [ ] **1e. SETUP.md section 9.** Extend `test_setup_guide_describes_the_setup_page`: `assert "or the point's row on Setup" not in guide`. Run → FAIL. Fix the sentence to: "**manual** (the tile's refresh icon, or `./ozos datapoints refresh --all`)". Green → commit `[docs] SETUP.md: manual refresh is the tile icon or the CLI; the Setup row only deletes`.
- [ ] **1f. Template gitignore.** Test `test_template_gitignore_keeps_user_data_in_git` in `test_cli.py`: read `TEMPLATE / ".gitignore"`; assert `.env` in it and `.ozos/datapoint-cache/` in it; assert `.ozos/personal-tasks.json` **not** in it and `.ozos/knowledge-stars.json` **not** in it. Run → FAIL. Fix: delete the two lines (they are user data, not regenerated). Green → commit `[vault-template] personal tasks and knowledge stars are vault data, no longer gitignored`.

---

### Task 2: `./ozos scrub-check --history`

**Files:**
- Modify: `tools/ozos-cli/cli.py` (scrub section, parser)
- Modify: `tools/ozos-cli/.tool-manifest.json` (description mentions `--history`)
- Modify: `docs/SETUP.md` section 10 "Daily use" (one row) and section 12 (one line)
- Test: `tools/ozos-cli/tests/test_scrub.py`

**Interfaces:**
- Produces: `scrub_history(repo: Path, terms_file: Path) -> list[tuple[str, str, int]]` — `(short_sha_12, term, line_count)` per distinct (commit, term), ordered oldest commit first; raises `RuntimeError("not a git repository: <repo>")` when `git rev-parse --git-dir` fails. Walks `git -C <repo> log --all -p --no-color --format=%x00%H` (NUL-prefixed header per commit, so diff text can never be mistaken for one); case-insensitive substring match on each diff line, same `load_terms`.
- CLI: `ozos scrub-check --history [--terms PATH] [--root PATH]` prints `<sha>: <term> (<n> line(s))` per hit, then `scrub-check --history: <k> hit(s) — history rewrite needed; see SECURITY.md` and exits 1; clean prints `scrub-check: history clean` and exits 0; missing terms file keeps the existing WARNING/exit 0.

- [ ] **Step 1: Failing tests** in `test_scrub.py`. Fixture `repo(tmp_path)`: `git init -q`, `git -c user.email=t@example.com -c user.name=t commit` helper; commit 1 writes `a.txt` = `"hello examplecorp"`, commit 2 rewrites `a.txt` = `"hello"`. Tests: `test_scrub_history_finds_a_term_removed_from_the_tree` → `scrub_check(repo, terms) == []` **and** `scrub_history(repo, terms)` has one hit whose term is `examplecorp` and whose sha is `git rev-parse --short=12 HEAD~1`; `test_scrub_history_clean_repo` (one commit, no term) → `[]`; `test_scrub_history_not_a_repo` → `pytest.raises(RuntimeError)`; `test_cli_history_hit_fails(capsys)` → `main(["scrub-check","--history","--terms",…,"--root",str(repo)]) == 1` and the sha and `history rewrite needed` in stdout; `test_cli_history_clean_passes` → 0 and `history clean`.
- [ ] **Step 2: Run** `cd tools/ozos-cli && python3 -m pytest tests/test_scrub.py -q` → FAIL `ImportError: scrub_history`.
- [ ] **Step 3: Implement** `scrub_history` and extend `scrub(args)` (`if args.history: …`), `--history` flag on the parser; `RuntimeError` → message on stderr, exit 2.
- [ ] **Step 4: Green**, then docs: manifest description; SETUP.md section 10 row `Check the whole git history for terms | ./ozos scrub-check --history (before making a repo public)`; section 12 line `scrub-check --history reports a commit — the term is in history even if the tree is clean; rewrite history (git filter-repo) and rotate anything that was a credential; never flip the repo public first`.
- [ ] **Step 5: Run it for real**: `./ozos scrub-check --history` on this repo; record the result for the final message (a hit is a Critical finding: report commit and term, do not rewrite).
- [ ] **Step 6: Commit** `[ozos-cli] scrub-check --history scans every commit's diff with the term list` → push.

---

### Task 3: Demo vault and `./ozos init --demo`

**Files:**
- Create: `vault-demo/` (full tree below)
- Modify: `tools/ozos-cli/cli.py` (`init`, parser, `DEMO_TEMPLATE`, `DEMO_USER`)
- Modify: `.gitignore` (nothing to add: only `/vault/` is ignored; verify `vault-demo/.ozos/datapoint-cache/` is caught by `vault-demo/.gitignore`)
- Test: `tools/ozos-cli/tests/test_demo_vault.py` (new), `tools/ozos-cli/tests/test_cli.py`

**Interfaces:**
- Consumes: `create_vault(template, dest)`, `write_env`, `write_user_config`, `_write_voice_text`, `datapoints_refresh(vault, daily_only)` (existing).
- Produces: `DEMO_TEMPLATE = ENGINE_ROOT / "vault-demo"`; `DEMO_USER = {"name": "Sam Avery", "me": "sam", "voice_text": "Plain, direct, short paragraphs."}`; `ozos init --demo [--vault PATH] [--force]` = non-interactive init from `vault-demo/` with `DEMO_USER`, blank API key (prints the existing `!` warning), then `datapoints_refresh(vault, daily_only=False)` so both CSV points have a cache; prints `✓ Demo vault created at …` and the usual `Next:` line.

**The fictional company: Brightfold** — appointment scheduling for small clinics. Domain for emails: `brightfold.example.com`. Nothing here is a real company or person; `vault-demo/README.md` says so in two lines. Before committing, grep the chosen names against the scrub list by running `./ozos scrub-check` (never print the list).

Tree (every file is content, written by hand):

```
vault-demo/
  README.md                       # "A fictional company for demos and screenshots. ./ozos init --demo copies it."
  CLAUDE.md                       # vault-template/CLAUDE.md + one line naming Brightfold as fictional
  .gitignore, .env.example        # copies of vault-template's
  docs/learnings.md               # two one-line learnings
  .ozos/setup.json                # every registry id: done (profile, routing-folders, add-stakeholder, define-cycle, define-goals, first-data-point) or skipped (the rest); badge_dismissed true; cadence {"mode":"company","cycle_id":"mid-year-2026"}
  .ozos/meeting-routing.json      # folders ["Product team","Clinic success","Leadership","Other"]; default "Other"; person_folders email→display name for the 7 people; group_rules [{"folder":"Leadership","members":["ingrid","omar","dana","sam"],"min_present":3}]; tagging_guide one sentence
  .ozos/knowledge-sources.json, vitals.json, reporting.json, remote-mcps.json, intel-agents.json (voice_text = DEMO_USER's)
  .ozos/goals.json                # 3 manual goals: "Reach 500 active clinics" (at_risk, 48, owner Mei Tanaka, target 2026-12-31, data_point_id "active-clinics"); "Cut clinic onboarding to under two days" (on_track, 70, owner Luca Moretti, 2026-11-30, data_point_id null); "Ship the patient reminders rewrite" (pending, null, owner Jonas Feld, 2027-01-31). sync null.
  .ozos/datapoints.json           # "active-clinics": csv data/active-clinics.csv column "active_clinics", number, daily, unit "clinics"; "weekly-bookings": csv data/weekly-bookings.csv, line, daily, unit "bookings"
  .ozos/datahub.json              # tab "Overview", one row: t1 refId active-clinics w4 h8, t2 refId weekly-bookings w8 h8, t3 refId null w12 h6
  data/active-clinics.csv         # header month,active_clinics; rows 2026-09,412 then 2026-08,388 (first row = current, second = previous)
  data/weekly-bookings.csv        # header week,bookings; 12 rows 2026-W27..2026-W38, values rising 1840→2410 with one dip
  people-hub/cycles.yaml          # active_cycle mid-year-2026; one cycle "Mid-year review 2026", type light-touch, events self-reflection 2026-06-01..06-12, manager-note 06-15..06-26, conversations 06-29..07-10
  people-hub/people/<id>/meta.yaml  # 7 people, fields name, display_name, role, start_date, location, manager, email:
      ingrid-solberg  CEO · dana-whitlock Head of Design · omar-haddad CTO · jonas-feld Engineering Manager ·
      mei-tanaka Product Manager (manager: Sam Avery) · luca-moretti Product Manager (manager: Sam Avery) · harper-quinn Data Analyst (manager: Sam Avery)
  knowledge-hub/meeting-notes/<Folder>/2026-10-DD-<slug>.md   # 4 notes with frontmatter {date, subject, folder, source: "demo", scope: "", tags: [...], folders: [<Folder>], attendees: [{name, email}], people: [...], projects: [...], topics: [...], action_items: [...]} then "# <subject>", "**Date:**", "---", 6–10 lines of body:
      Product team/2026-10-06-weekly-product-sync.md · Clinic success/2026-10-08-onboarding-retro.md ·
      Leadership/2026-10-13-q4-planning.md · Product team/2026-10-20-1-1-mei.md
  knowledge-hub/{ai-learning,digests,intel-agents}/.gitkeep, people-hub/plan/.gitkeep
```

- [ ] **Step 1: Failing tests** `test_demo_vault.py` (imports `cli`, `yaml`, `json`; `DEMO = cli.DEMO_TEMPLATE`): `test_demo_people_are_fictional_and_complete` (7 dirs; each meta has `display_name`, `role`, `email` ending `@brightfold.example.com`, `name == dir`); `test_demo_setup_is_finished` (ids == `cli._registry().ITEM_IDS` set; every status in `{"done","skipped"}`; `badge_dismissed` true); `test_demo_goals_load` (3 goals, all `source == "manual"`, statuses in the six-value set, the bound `data_point_id` exists in datapoints.json); `test_demo_datapoints_are_csv_inside_the_vault` (2 points, kind csv, `(DEMO / path).is_file()`); `test_demo_tiles_point_at_demo_datapoints` (every non-null `refId` ∈ point ids; one tab; 3 tiles); `test_demo_notes_route_to_demo_folders` (4 `.md` under meeting-notes; each frontmatter `folders` ⊆ routing `folders`; every attendee email ends `@brightfold.example.com`); `test_init_demo_populates_the_cache(tmp_path, monkeypatch)` (`monkeypatch.setattr(cli,"HOME",tmp_path)`; `main(["init","--demo","--vault",str(tmp_path/"v")]) == 0`; config `name == "Sam Avery"`; `(v/".ozos"/"datapoint-cache"/"active-clinics.json")` has `rows[0][0] == 412` and no `error`; `weekly-bookings.json` has 12 rows); `test_init_demo_respects_an_existing_config(tmp_path, monkeypatch, capsys)` (config.json names `tmp_path/"other"` → rc 1, `--force` in stderr, `v` not created).
- [ ] **Step 2: Run** → FAIL `AttributeError: DEMO_TEMPLATE`.
- [ ] **Step 3: Write the vault** files listed above, then `DEMO_TEMPLATE`, `DEMO_USER`, the `--demo` flag (`init(args)`: when `args.demo`, take `name/me/voice_text` from `DEMO_USER`, `api_key/base_url = ""`, `model = DEFAULT_MODEL`, template = `DEMO_TEMPLATE`, and after `write_user_config` call `datapoints_refresh(vault, daily_only=False)`; the `--scrub-terms` copy still applies).
- [ ] **Step 4: Green**; `./ozos scrub-check` clean (it scans `vault-demo/`); `python3 -m ruff format tools/`.
- [ ] **Step 5: Commit** `[vault-demo] fictional Brightfold vault: 7 people, 3 goals, 2 CSV data points, 4 notes; ./ozos init --demo copies it and refreshes the tiles` → push.

---

### Task 4: Screenshots from the demo vault

**Files:**
- Create: `docs/images/home.png`, `setup.png`, `people.png`, `goals.png`, `data-hub.png`, `knowledge-hub.png`
- Create: `tools/scripts/shoot-demo.sh` (so the captures are reproducible; reads the shoot script path from `$SHOOT`, default `~/.claude/skills/design-audit/shoot.py`)
- Test: `tools/ozos-cli/tests/test_repo_hygiene.py` (new; grows in Tasks 5 and 6)

**Interfaces:**
- Consumes: `?page=<id>` launch hint (`app/frontend/src/lib/initial-page.ts`), page ids `home`, `setup`, `people-hub`, `goals-tasks`, `data-hub`, `knowledge-hub`.
- Produces: six PNGs at 1280 px wide, viewport capture (`--no-full-page`, height 900) so each is one screen.

- [ ] **Step 1: Failing test** `test_demo_screenshots_exist`: the six files exist under `docs/images/` and each is > 20 kB (a blank capture is smaller). Run → FAIL.
- [ ] **Step 2: Boot against the demo vault** with a throwaway home: `D=<scratchpad>/demo-home; mkdir -p $D/.ozos; cp vault-demo → <scratchpad>/vault-demo-run; python3 ozos init --demo --vault <scratchpad>/vault-demo-run` with `HOME=$D` (writes `$D/.ozos/config.json`, never `~/.ozos`); then `HOME=$D OZOS_VAULT=<that path> uvicorn backend.main:app --port 8765` from `app/`, and `npm run dev` from `app/frontend`. Confirm `curl localhost:8765/api/me` returns `Sam Avery`.
- [ ] **Step 3: Shoot** each page: `python3 $SHOOT "http://localhost:5173/?page=<id>" docs/images/<name>.png --width 1280 --height 900 --no-full-page --wait-ms 4000`. Look at every PNG (Read tool) and check: the greeting shows the demo user, People shows seven cards, Goals shows three rows with the measured value on the bound one, Data Hub shows the number with a delta and the line, Knowledge Hub shows the four notes in their folders, Setup shows every item done or skipped. If a page shows an error or an empty state the demo should have filled, fix the demo data (Task 3 files) and reshoot. Stop both servers.
- [ ] **Step 4: Green**; write `tools/scripts/shoot-demo.sh` with the commands from steps 2–3 (parameters: scratch dir, shoot script path).
- [ ] **Step 5: Commit** `[docs] demo vault screenshots of Home, Setup, People, Goals, Data Hub and Knowledge Hub; shoot-demo.sh reproduces them` → push.

---

### Task 5: README for strangers, CONTRIBUTING, SECURITY, doc catch-up

**Files:**
- Rewrite: `README.md`
- Create: `CONTRIBUTING.md`, `SECURITY.md`
- Modify: `docs/SETUP.md` (section 2 mentions `--demo` as a try-first path; section 11 "What is not here yet" drops the Phase 5 sentence and keeps the tabs line; section 0 unchanged), `app/README.md` (Insights Hub row: empty state), `CLAUDE.md` + `AGENTS.md` (Project Structure gains `vault-demo/`), `docs/README.md` (one line: `images/` holds the README screenshots)
- Test: `tools/ozos-cli/tests/test_repo_hygiene.py`, `app/backend/tests/test_setup_registry.py::test_setup_guide_describes_the_setup_page`

**README structure (headings in this order):**
1. Title + three sentences (what OZOS is: a personal operating system for product leaders on Claude Code; one local brain for people, meetings, knowledge, goals, data; app + vault so it moves with you between companies).
2. The video line, unchanged, exactly where it is now.
3. `## App + vault` — one ASCII diagram (engine box → vault box, with the resolver order `$OZOS_VAULT` → `~/.ozos/config.json` → `vault/` as the arrow label) and the existing two-column table.
4. `## Try it in two commands` — `./ozos init --demo` then `bash app/run.sh`, one sentence that Brightfold is fictional and what you will see; `## Start at your company` — `./ozos init`, link to `docs/SETUP.md`.
5. `## A tour` — six subsections, each one screenshot (`docs/images/<name>.png`) and two to four sentences: Home, Setup, People Hub, Goals, Data Hub, Knowledge Hub.
6. `## Connectors` — table: meeting notes (Gemini via Gmail, Granola), Atlassian Goals, Metabase, Confluence search, MCPs via Claude Code (Slack, Google Workspace, Figma, Miro); each with the doc link.
7. `## Claude Code` — skills shipped (`/ozos-setup`, `/sync-notes`, `/ozos-brain`, `/save-session`, `/intel-run`, `/daily-digest`, capture-learning), the hooks in `.claude/settings.json`, graphify over engine + vault, the floating chat.
8. `## Requirements` (Python 3.12+, Node 20+, git, Claude Code, ripgrep; optional graphify, Chrome; an Anthropic key or compatible proxy).
9. `## What works today` — the current Status paragraph rewritten with no phase numbers; ends with "Not here yet: renaming or deleting Data Hub tabs from the page (edit `datahub.json`)".
10. `## Layout`, `## Tests and formatting` (kept, shortened; link CONTRIBUTING), `## Security` (two lines, link SECURITY.md), `## License`.

**CONTRIBUTING.md (≤ 45 lines):** TDD rule (failing test first; bug fix starts with a regression test); the pipeline command and the frontend gate; format commands; `./ozos scrub-check` and `--history`; commit message format with two examples; where tests live; "open an issue first for anything bigger than a fix".
**SECURITY.md (≤ 45 lines):** what never goes in the engine (company names, people, hostnames, ids, credentials, meeting content); where credentials live (`<vault>/.env`, OAuth files under `~/.config/ozos/` and `~/.gdrive-credentials.json`); the scrub guard and the history scan; how to report (open a GitHub issue titled `security:` **without** the sensitive value, or email the address on the owner's GitHub profile); what happens on a leak (untrack, gitignore, rewrite history, rotate).

- [ ] **Step 1: Failing tests** in `test_repo_hygiene.py`: `test_readme_is_for_strangers` (video URL present exactly once; `./ozos init --demo` present; each of the six `docs/images/*.png` referenced; `## What works today` present; `re.search(r"Phase \d", readme)` is None; `docs/SETUP.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE` all linked); `test_contributing_and_security_fit_a_screen` (both exist, ≤ 45 non-blank lines each, CONTRIBUTING mentions `pipeline.py` and `scrub-check` and `[tool-name]`; SECURITY mentions `.env` and `scrub-check --history` and `report`). Update `test_setup_guide_describes_the_setup_page`: replace the `"Phase 3" in readme` / `"Phase 4" in readme` assertions with `"Goals" in readme and "data point" in readme.lower()`; add `assert "Phase 5" not in guide`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Write** the files per the structure above.
- [ ] **Step 4: Green**; `./ozos scrub-check` clean.
- [ ] **Step 5: Commit** `[docs] README for strangers with the demo tour; CONTRIBUTING and SECURITY; SETUP points at --demo` → push.

---

### Task 6: Repo hygiene without the flip

**Files:**
- Modify: `app/frontend/package.json` (`"name": "ozos-brain-frontend"`, `"author": "cozren"`, `"license": "MIT"`, keep `"private": true`)
- Create: `.github/ISSUE_TEMPLATE/bug_report.md` (≤ 25 lines: what happened, expected, steps, `./ozos doctor`-style environment lines: OS, Python, Node, commit; reminder not to paste vault content or `.env` values), `.github/ISSUE_TEMPLATE/config.yml` (`blank_issues_enabled: true`)
- Modify: `.claude/settings.json` (remove `enabledPlugins`)
- Test: `tools/ozos-cli/tests/test_repo_hygiene.py`

- [ ] **Step 1: Failing tests**: `test_package_json_names_the_project` (`name == "ozos-brain-frontend"`, `license == "MIT"`, `author == "cozren"`); `test_bug_report_template_exists` (file exists, ≤ 25 lines, mentions `.env`); `test_project_settings_enable_no_plugins` (`"enabledPlugins" not in json.loads(settings)`). Run → FAIL.
- [ ] **Step 2: Edit** the three files. `cd app/frontend && npm run format:check` still clean (package.json is not under `src`).
- [ ] **Step 3: Green**; commit `[engine] package.json metadata, bug-report template, brag plugin no longer enabled` → push.
- [ ] **Step 4: Repo metadata** (not visibility): `gh repo edit cozren/ozos-brain --description "OZOS Brain: a personal operating system for product leaders on Claude Code. App + vault; your data stays yours." --add-topic claude-code --add-topic personal-knowledge-management --add-topic fastapi --add-topic react --add-topic product-management`. Then `gh repo view --json visibility` must still print `PRIVATE`.

---

### Task 7: Final verification and review

- [ ] `python3 tools/test-pipeline/pipeline.py` → `0 failing`, no `NOT COLLECTED`.
- [ ] `cd app/frontend && npx tsc --noEmit && npx vitest run` green; `npm run format:check` clean; `python3 -m ruff format --check tools/ skills/ app/ connectors/` clean.
- [ ] `./ozos scrub-check` clean; `./ozos scrub-check --history` result recorded.
- [ ] Fresh clone smoke test in the scratchpad: `git clone <engine> t && cd t && HOME=<scratch-home> ./ozos init --demo && python3 tools/test-pipeline/pipeline.py` (the stranger's path, minus `npm ci` which the clone shares with the main checkout via `app/frontend/node_modules` symlink or a skipped step; record what was skipped).
- [ ] `graphify update .`
- [ ] Dispatch one fresh reviewer (most capable model) over `git diff cdff7be..HEAD` with the Phase 5 brief and this plan's Review Focus; for every Critical/Important finding: failing test, fix, green, commit, push. Minors go to the final message.
- [ ] `git status --short && git log origin/main..HEAD` both print nothing. `gh repo view --json visibility` prints `PRIVATE`.

## Rulings made while planning (each with its cost if wrong)

- **Third Data Hub tile is empty** (`refId: null`), because the brief fixes two CSV data points and three tiles; the empty tile shows the picker affordance. Cost: one tile in the screenshot reads as "pick a data point".
- **Demo user is a constant in the CLI** (`DEMO_USER`), not a file in the vault, so `vault-demo/` stays a pure vault shape. Cost: changing the demo user means a code edit.
- **`init --demo` is non-interactive and refreshes data points** so the stranger's second command shows populated tiles; the API key is blank and the existing warning explains the chat will not work. Cost: a stranger who wants chat edits `.env` by hand.
- **`--demo` keeps the config-conflict refusal** (`--force` to switch), the same rule as a real vault. Cost: on this machine the demo needs `--force` or a throwaway `HOME`.
- **History scan reads `--all` refs**, not just `main`, since a stray branch is pushed with the repo. Cost: a deleted-but-unpruned local branch can report a hit nobody can see on GitHub.
- **`--history` is not in the pre-commit hook** (it scales with history length and the tree check already blocks new terms). Cost: a term that enters history through a bypassed hook is found only when someone runs it; SETUP.md and SECURITY.md say to run it before any flip.
- **Fresh-vault 404 is fixed in the frontend** (skip `latest` when the list is empty, show an empty state); the backend keeps answering 404 for a `latest` that does not exist, which its test already pins. Cost: a non-OZOS client of the API still has to handle the 404.
- **Screenshots are viewport captures at 1280×900**, one screen each, so the README stays scannable. Cost: long pages are cropped.
- **The throwaway `HOME` for screenshots lives in the session scratchpad**, so nothing under `~/.ozos` or the archive is touched. Cost: none.
- **`vault-demo/` is scanned by scrub-check** as part of the tree (not added to `SCRUB_EXCLUDE`), which is the brief's "run scrub-check against it" by construction. Cost: none.
- **Repo topics and description are set now**; visibility is untouched, and the final message carries the flip checklist. Cost: none.
