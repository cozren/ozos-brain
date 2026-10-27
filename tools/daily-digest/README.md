# OZOS Tool: Daily Digest

**Status:** Phase 1 complete  
**Last updated:** 04 Apr 2026  
**Location in project:** `OZOS/tools/daily-digest/`

---

## What is this tool?

Daily Digest is a scheduled agent that runs every morning and produces a single `digest-YYYY-MM-DD.md` file — a curated, opinionated briefing built around what you actually care about. Not a firehose of AI news. A tight, signal-heavy read that takes under 10 minutes.

It pulls from public sources (YouTube, GitHub, Reddit, HackerNews), filters aggressively using a personal interest profile, and surfaces only what's worth acting on.

---

## Personal interest profile

This is the filter the agent applies. Content that doesn't fit at least one of these buckets gets dropped.

**Include:**
- New features, releases, or meaningful updates to Claude, Claude Code, Gemini, ChatGPT, or any major AI tool
- How product managers, leaders, or whole businesses are actually using agents — real workflows, not theory
- New Claude Code skills or GitHub repos that can be copied and tried immediately (e.g. Remotion skill, professional website builder)
- Trending repos related to extending Claude Code, building skills, or agent tooling
- Hard AI industry news: company moves, model releases, policy changes, shutdowns (e.g. "Anthropic deprecates X")

**Exclude:**
- Opinion pieces about the future of AI
- Generic "AI is changing everything" content
- Promotional reposts with no original insight
- Research papers (unless they ship something usable)
- Anything not actionable or learnable in the near term

---

## Digest structure

Each digest is four sections. Kept short by design — if something needs more than 3 bullet points, it probably isn't digest material.

---

## Generation — per-section LLM calls

`generate_digest()` does **not** send all sources to the model in one big prompt.
Some employer LLM gateways enforce a per-request token cap (~4000 tokens, input +
output combined); one prompt with every raw source plus a large `max_tokens`
blows past it and 429s (`model_per_key ... Limit type: tokens`).

Instead, generation is split into **one small LLM call per output section** (four
calls total — kept well under the per-team requests window of ~8):

| Section | LLM call receives |
|---|---|
| 1. Claude Code & AI Tool Updates | HackerNews + GitHub Trending |
| 2. Trending GitHub Skills & Repos | GitHub Trending + Must-Haves |
| 3. Agent Workflows — PMs, Leaders & Businesses | YouTube + Aakash newsletter + HackerNews |
| 4. General AI News | HackerNews |

Each section call:
- gets **only** the raw sources relevant to it,
- uses the large HackerNews list **pre-limited to the top `HN_PRELIMIT` (25)** by
  points before sending, so input stays bounded,
- runs with a modest `max_tokens` (`SECTION_MAX_TOKENS = 800`),

so every request's prompt + output stays comfortably under the 4000-token cap
(measured ~1300–2300 tokens per call). A section whose relevant sources are all
empty short-circuits to the literal `"Nothing significant today."` line and makes
no LLM call. The four section bodies are then assembled into the identical
four-heading / two-subheading markdown contract.

### Rate-limit resilience

The gateway enforces two windows: a per-key **token** window (~4000 tokens/min)
and a shared per-team **requests** window (~8/min). Four section calls fired
back-to-back can exhaust the request pool mid-run (typically dying around section
3), so generation is paced rather than retried-fast:

- `build_client()` sets `max_retries=0` — SDK-level retries fire immediately and
  would just drain the tiny request pool.
- `_call_section()` owns retry instead: on a 429 it reads the `Limit resets at:
  … UTC` clause from the error (`_seconds_until_reset`), waits for that window to
  refill (default ~60s, capped at 90s), then retries — up to
  `SECTION_MAX_ATTEMPTS` (6) times before giving up.

This spreads the four section calls across per-minute windows, so an unattended
run still completes under a tiny shared request budget — it just takes longer
(a throttled run can span a few minutes). If every attempt for a section is
throttled, the 429 propagates rather than looping forever.

All per-section rules are preserved: section 1 max 6 items; section 2 two
subsections (`### Today's Trending`, `### Must-Haves`) with a `[Category]` tag on
every repo from `REPO_CATEGORIES`; section 3 max 5, prioritising YouTube + Aakash
then HackerNews; `"Nothing significant today."` when empty; no invented content.

---

### 1. Claude Code & AI Tool Updates

New features, model updates, UX changes, or SDK releases across Claude, Gemini, ChatGPT, or any tool in the daily stack. Factual, short. No commentary.

**Example entries:**
- `Claude Code` — slash command autocomplete added in v1.2
- `Gemini 2.5 Flash` — context window extended to 2M tokens
- `ChatGPT` — voice mode now available on desktop

---

### 2. Trending GitHub Skills & Repos

Repos that are gaining traction fast — especially Claude Code skills, agent tooling, or anything that can be dropped into OZOS and tried. Ranked by reshare velocity (how many people mentioned it in the last 48 hours), not just star count.

Each entry includes: repo name, one-line description, GitHub link, and a `→ Try it` flag if it's a skill worth adding to `skills/vault/`.

**Example entries:**
- `anthropics-remotion-skill` — Claude Code skill that generates and edits videos via Remotion → Try it
- `cursor-web-design-skill` — Makes Claude output professional-looking sites, not AI-looking ones → Try it
- `open-codex` — OpenAI's open-source coding agent, 4k stars in 2 days

---

### 3. Agent Workflows — PMs, Leaders & Businesses

How real people are using agents to run their work. Product managers, founders, operators. Focus on *what they built*, *what problem it solved*, and *how they set it up*. Not "AI made me 10x productive" posts — actual workflow descriptions.

**Example entries:**
- PM at Linear shares how they use Claude to draft spec diffs before each sprint
- Founder runs weekly board updates through an agent that pulls from Notion + Linear
- Small agency replaced 3 manual steps in their client onboarding with a single Claude Code prompt

---

### 4. General AI News

Hard news only. Announcements, shutdowns, funding, policy changes, model releases. One-liners.

**Example entries:**
- Anthropic discontinues support for Claude 2 API — migration deadline: June 2026
- Google DeepMind merges Gemini and AlphaCode teams
- OpenAI raises $2B at $300B valuation

---

## Sources

All sources are free, public, and don't require paid API access.

| Source | What it covers | Why it's useful |
|---|---|---|
| **GitHub Trending** | Top repos by stars gained in 24–48h | Best signal for new skills and tools |
| **r/ClaudeAI** | Claude-specific news, workflows, skills | High signal, low noise community |
| **r/LocalLLaMA** | Broader AI tool releases and repos | Catches things Claude subreddits miss |
| **HackerNews** | AI industry news, hard announcements | Reliable for factual news, low hype |
| **YouTube channels** | Tutorials, walkthroughs, agent demos | Longer-form context on trending tools |

YouTube channels tracked (configurable in `config.yml`):
- Channels focused on Claude Code, Cursor, agent workflows, and AI productivity
- Add/remove channels via config — no code change needed

---

## Skills folder structure

```
OZOS/skills/
├── quick-prd/           ← skills you built or customised
├── experience-build/
├── experience-answer/
├── experience-save/
├── docx-style/
└── vault/               ← skills pulled from GitHub repos to try
    ├── remotion/
    ├── professional-website/
    └── ...
```

**How vault works:**
- Find a skill on GitHub (usually a single `.md` file)
- Copy it into `skills/vault/skill-name/SKILL.md`
- Reference it in a Cursor prompt: "Use the skill at skills/vault/remotion/SKILL.md"
- No installation needed unless the skill requires a specific library — those are called out in the skill file itself
- If a vault skill proves useful and you modify it, promote it to the root `skills/` folder

---

## Output

```
knowledge-hub/digests/
└── digest-YYYY-MM-DD.md
```

Each digest is self-contained. No database, no state beyond the previous digest file (used to detect what's already been covered).

---

## Scheduling (launchd)

The digest runs **every day at 10:00** local time via a macOS `launchd` agent. It's
a local script (needs the repo-root `.env` and writes to local `knowledge-hub/`),
so it's scheduled on the Mac — not as a cloud routine.

Files:
- `run-digest.sh` — wrapper launchd invokes. Uses absolute paths (launchd has a
  minimal PATH), `cd`s into the repo so `.env` loads, appends to `digest.log`.
- `com.ozos.daily-digest.plist` — reference copy of the launchd agent. The **live**
  copy lives at `~/Library/LaunchAgents/com.ozos.daily-digest.plist`.

Install / manage:

```bash
# install (copy reference → LaunchAgents, then load)
cp tools/daily-digest/com.ozos.daily-digest.plist ~/Library/LaunchAgents/
launchctl load   ~/Library/LaunchAgents/com.ozos.daily-digest.plist

launchctl list | grep daily-digest      # confirm it's registered
launchctl start com.ozos.daily-digest   # run once now, on demand
tail -f tools/daily-digest/digest.log   # watch a run

launchctl unload ~/Library/LaunchAgents/com.ozos.daily-digest.plist  # disable
```

**Change the time:** edit `StartCalendarInterval` (`Hour`/`Minute`) in the plist,
copy it to `~/Library/LaunchAgents/`, then `unload` + `load`. Adding a `Day` or
`Weekday` key narrows it (e.g. every-2-days isn't directly expressible — use a
`Day` array or a guard in the wrapper). With only `Hour`+`Minute` it runs daily.

launchd re-fires a missed run when the Mac wakes if it was asleep at 10:00 — an
edge cron doesn't handle. A throttled run can take a few minutes (it paces through
rate-limit windows; see *Rate-limit resilience* above).

The run logs (`digest.log`, `launchd.out.log`, `launchd.err.log`) are gitignored.

---

## Tech stack

| Component | Choice | Reason |
|---|---|---|
| Scheduling | macOS `launchd` or cron | Runs locally without cloud dependency |
| GitHub Trending | HTML scrape of `github.com/trending` | Free, public, reliable |
| Reddit | `praw` Python library (free API) | Clean API, no scraping needed |
| HackerNews | Official Algolia API | Free, fast, structured |
| YouTube | `yt-dlp` (existing, from YouTube X-Ray) | Already in stack |
| Filtering + writing | Claude via the shared OZOS client (`skills/ozos_llm.py`) | Consistent with OZOS stack |
| Output | Markdown `.md` | Readable by humans and Claude Code |

---

## Known gotchas

- Reddit API rate limits — `praw` handles this but batch requests carefully
- GitHub Trending page layout changes occasionally — scraper may need updating
- Reshare velocity is a proxy for trending, not a perfect signal — tune the threshold over time
- If you route through an employer proxy it may log content — keep digest prompts impersonal (no private context)

---

## Build phases

### Phase 1 — GitHub + HN digest ✓ Done
`digest.py` scrapes GitHub Trending and HackerNews (via Algolia API). Claude filters by interest profile and writes all four sections. Saves to `knowledge-hub/auto/digest-YYYY-MM-DD.md`.

Run: `python3 tools/daily-digest/digest.py`
Tests: `python3 -m pytest tools/daily-digest/tests/test_digest.py`

### Phase 2 — Reddit + YouTube
Add Reddit sources (r/ClaudeAI, r/LocalLLaMA). Pull new videos from tracked YouTube channels using existing X-Ray infrastructure. Complete all four sections.

### Phase 3 — Reshare velocity + vault suggestions
Detect when the same repo appears across multiple sources in 48h — flag as high-signal. Auto-suggest vault additions at the bottom of the digest.

---

## Connections to broader OZOS vision

- **YouTube X-Ray** feeds Section 3 (agent workflows) and Section 2 (skill repos from video walkthroughs)
- **Knowledge Hub** stores all digests as a searchable archive
- **Weekly Learning Suggestion** (YouTube X-Ray Phase 3) will eventually pull from digest history to suggest what to try next

---

*This document lives at `OZOS/tools/daily-digest/README.md` and should be updated at the end of each working session.*
