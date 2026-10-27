# OZOS Tool: YouTube Channel X-Ray

**Status:** In Progress  
**Last updated:** 04 Apr 2026  
**Location in project:** `ozos/tools/youtube-xray/`

---

## What is this tool?

YouTube Channel X-Ray takes a YouTube channel URL and automatically extracts every video transcript, saves them as Markdown files, and generates an AI-powered summary for each video — capturing key learnings, actionable steps, commands, links, and resources mentioned.

It is the first tool inside OZOS (Ozzy's Operating System) and serves as the foundation for a future personal AI learning assistant.

---

## Before you start every session

Your API key expires every 10 hours. Do this first every time:

1. Get an Anthropic API key (or a key for your employer's Anthropic-compatible proxy)
2. Open `ozos/.env` in Cursor or nano and paste the new key:
   ```
   ANTHROPIC_API_KEY=sk-ant-...your-key...
   OZOS_LLM_BASE_URL=   # optional Anthropic-compatible proxy
   ```
3. Save the file — you're ready for the day

---

## Project phases

### Phase 1 — Core X-Ray (build now)

Take a channel URL → extract all transcripts → generate summaries.

**Output folder structure:**
```
knowledge-hub/ai-learning/
└── video-title/
    ├── transcript.md
    └── summary.md
```

> All summaries are saved to `knowledge-hub/ai-learning/` by default, keeping AI learning content alongside digests and meeting notes in the knowledge hub.

**Summary file contains:**
- Key learnings from the video
- Exact actionable steps mentioned
- Commands, links, tools, and document examples referenced
- Direct quotes where precision matters

**Tech stack:**

| Component | Tool | Reason |
|---|---|---|
| Transcript extraction | `yt-dlp` | No API key needed, handles auto-captions |
| AI summarisation | Anthropic SDK (`claude-sonnet-4-6`) | Native to OZOS stack |
| Output format | Markdown `.md` | Readable by humans and AI, git-friendly |
| Testing | `pytest` | Simple, standard |
| Config | `python-dotenv` | Loads API key and base URL from `.env` |

---

### Phase 2 — Daily Digest

Moved to `tools/daily-digest/README.md`

---

### Phase 3 — Weekly Learning Suggestion (future)

Analyse the full context of everything watched and summarised. Generate a personalised suggestion for what to try or learn this week — connected to your current skill level and goals.

**Example output:**
> "This week you might try automating extraction of Gemini notes from your email to local disk. Based on 3 videos you reviewed this week, here's a starter approach..."

This phase connects YouTube X-Ray to the broader OZOS Personal Assistant vision.

---

## Future ideas backlog

- Connect to a Personal OS / assistant agent that surfaces suggestions proactively
- Multi-channel support — track several channels at once with a config file
- Tag and categorise summaries by topic (AI tools, coding, productivity, etc.)
- Build a searchable local knowledge base from all summaries
- Weekly digest email with top learnings across all tracked channels
- "What did I miss?" feature — summaries for a date range

---

## Setup checklist

### Environment setup
- [x] Git installed and configured
- [x] Python installed (3.8+)
- [x] Cursor installed
- [x] GitHub account created
- [x] OZOS repository created on GitHub (named OZOS)

### Project structure
- [x] Cloned OZOS repo to local machine
- [x] Created folder structure: `tools/`, `agents/`, `docs/`, `skills/`
- [x] Created `.cursorrules` file with coding conventions and learning log rule
- [x] Created `docs/learnings.md` for capturing session learnings
- [x] Copied existing skills from `~/.claude/skills/` into `OZOS/skills/`
- [x] Cleaned up duplicate skills from `~/.claude/skills/` (single source of truth)
- [x] First git commit pushed to GitHub
- [x] Created `.env` with API key and base URL
- [x] Created `.env.example` as safe template
- [x] Added `.env` to `.gitignore`
- [x] Created `requirements.txt`
- [x] Tested API connection — `claude-sonnet-4-6` responding correctly

### YouTube X-Ray build (next steps)
- [x] Open OZOS in Cursor
- [ ] Step 1: build single video script (see build plan below)
- [ ] Step 2: extend to full channel
- [ ] Step 3: add daily automation
- [ ] Add a learning to `docs/learnings.md` from each session

---

## Build plan — 3 steps in order

> **Important:** Complete each step fully before moving to the next.
> Each step builds on the previous one. Going straight to whole channel
> makes debugging much harder if something breaks.

---

### Step 1 — Single video ← start here

**Goal:** Get one video's transcript and summary working perfectly before touching channels.

**Cursor prompt** — open Cursor, press `Cmd+L`, paste this:

```
In the tools/youtube-xray/ folder, build a Python script called xray_single.py that:
1. Takes a single YouTube video URL as input (e.g. python xray_single.py "https://youtube.com/watch?v=xxx")
2. Uses yt-dlp to extract the transcript for that video
3. Saves the transcript as transcript.md inside output/video-title/
4. Calls the Anthropic API (Claude) to generate a summary of the transcript
5. Summary should include: key learnings, exact actionable steps, commands/links/tools mentioned
6. Saves the summary as summary.md in the same folder as the transcript

Use the Anthropic client with api_key and base_url loaded from .env using python-dotenv.
Use model claude-sonnet-4-6.
Follow the rules in .cursorrules.
Write pytest tests for all core functions.
Run the tests before telling me the task is complete.
```

**Run it manually:**
```bash
cd ~/Developer/OZOS
python3 tools/youtube-xray/xray_single.py "https://www.youtube.com/watch?v=PASTE_VIDEO_ID_HERE"
```

**Run the tests:**
```bash
pytest tests/
```

**This step is done when:**
- [ ] `output/video-title/transcript.md` is created
- [ ] `output/video-title/summary.md` is created
- [ ] Summary quality looks good — real learnings, not generic text
- [ ] All pytest tests pass
- [ ] Commit: `git commit -m "[youtube-xray] single video working"`

---

### Step 2 — Whole channel

**Goal:** Loop over every video in a channel using the single video logic from Step 1.

**Cursor prompt** — open Cursor, press `Cmd+L`, paste this:

```
In the tools/youtube-xray/ folder, build a Python script called xray_channel.py that:
1. Takes a YouTube channel URL as input (e.g. python xray_channel.py "https://youtube.com/@channelname")
2. Uses yt-dlp to fetch all video IDs and titles from the channel
3. For each video, reuses the transcript and summary logic from xray_single.py
4. Saves outputs following this structure: output/channel-name/video-title/transcript.md and summary.md
5. Skips videos with no transcript available — log skipped videos to output/channel-name/skipped.md, do not crash
6. Prints progress as it runs: "Processing video 3/47: video title..."

Use the Anthropic client with api_key and base_url loaded from .env using python-dotenv.
Use model claude-sonnet-4-6.
Follow the rules in .cursorrules.
Add pytest tests for the new channel functions.
Run all tests before telling me the task is complete.
```

**Run it manually:**
```bash
cd ~/Documents/ozos
python3 tools/youtube-xray/xray_channel.py "https://www.youtube.com/@CHANNEL_NAME"
```

**Run the tests:**
```bash
pytest tests/
```

**This step is done when:**
- [ ] All videos processed and saved in correct folder structure
- [ ] Skipped videos logged to `skipped.md` — no crashes on missing transcripts
- [ ] Progress printed clearly while running
- [ ] All pytest tests pass
- [ ] Commit: `git commit -m "[youtube-xray] full channel processing working"`

---

### Step 3 — Daily automation

**Goal:** Run automatically every day, process only new videos, generate a digest.

**Cursor prompt** — open Cursor, press `Cmd+L`, paste this:

```
In the tools/youtube-xray/ folder, add daily automation to xray_channel.py:
1. Add a function that checks which videos have already been processed (transcript.md already exists)
2. Skip already-processed videos — only process new ones published since last run
3. After processing new videos, generate a digest file at output/channel-name/digest-YYYY-MM-DD.md
4. Digest should include: list of new videos processed today, one-paragraph summary of each
5. Create a shell script tools/youtube-xray/run_daily.sh that runs xray_channel.py for each channel in a config file
6. Create tools/youtube-xray/channels.txt where each line is one channel URL to track

Follow the rules in .cursorrules.
Add pytest tests for the new functions.
Run all tests before telling me the task is complete.
```

**Add channels to track** — edit `channels.txt`:
```
https://www.youtube.com/@channel1
https://www.youtube.com/@channel2
```

**Run it manually:**
```bash
cd ~/Documents/ozos
bash tools/youtube-xray/run_daily.sh
```

**Automate on Mac (runs every day at 8am):**
```bash
crontab -e
```
Add this line:
```
0 8 * * * cd ~/Documents/ozos && bash tools/youtube-xray/run_daily.sh
```

**This step is done when:**
- [ ] Only new videos are processed on each run (no re-processing)
- [ ] Daily digest file generated with summaries
- [ ] Multiple channels tracked via `channels.txt`
- [ ] All pytest tests pass
- [ ] Commit: `git commit -m "[youtube-xray] daily automation working"`

---

## Key technical decisions

| Decision | Choice | Reason |
|---|---|---|
| Transcript extraction | `yt-dlp` | No API key needed, handles auto-captions |
| AI summarisation | Anthropic SDK (Claude) | Native to OZOS stack |
| Output format | Markdown `.md` | Readable by humans and AI, git-friendly |
| Testing | `pytest` | Simple, standard, works with `.cursorrules` |
| Skills location | `OZOS/skills/` | Self-contained, git-tracked, no hidden dependencies |

---

## Known gotchas

- **No transcript available** — script skips and logs to `skipped.md`, does not crash
- **Large channels** — 500+ videos take 10–30 seconds just to list, this is normal
- **Non-English videos** — transcripts may be auto-translated, noted in summary file
- **API costs** — each summary call uses tokens, start with a small channel to test
- **Key expired** — if you get an auth error and your key comes from an employer gateway, mint a new one

---

## Connections to broader OZOS vision

This tool feeds into:
- **Personal learning assistant** — summaries become a local knowledge base
- **Weekly suggestion engine** (Phase 3) — uses summary context to recommend next actions
- **Personal OS** — YouTube X-Ray is one data source among many (email, notes, calendar) that will eventually power a unified personal assistant

---

## End of session checklist

After every working session:

```bash
cd ~/Documents/ozos
git add .
git commit -m "[youtube-xray] describe what you built or changed"
git push origin main
```

And add any lessons learned:
```bash
nano docs/learnings.md
```

---

*This file lives at `ozos/tools/youtube-xray/README.md` — update it at the end of each working session.*
