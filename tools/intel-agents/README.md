# intel-agents

Run engine + scheduler for **Intel Agents** — topic-driven intelligence agents
that each watch a defined topic and produce a daily artifact: LinkedIn post
options in a chosen voice (`purpose: linkedin`) or a research/insight article
(`purpose: research`).

An Intel Agent = **Topic** (focus / keywords / source prefs / search budget) +
**Purpose** (output schema + rules) + **Voice** (tone). Agents are defined in
`.ozos/intel-agents.json` (managed by the People Hub backend / console). This
tool is the engine that turns one agent into a dated report instance.

## What it does

`run.py <agent-id>`:
1. Loads the agent's config from `.ozos/intel-agents.json`.
2. Composes the prompt = shared house style (voice block + purpose-specific
   output rules — templates A–D + scoring + quality checklist for `linkedin`,
   article structure for `research`) + the agent's topic. The house style lives
   in `run.py`, never in the config.
3. Runs the prompt through **Claude Code headless** (`claude -p`), which does
   the web searches with its own `WebSearch` tool (pre-authorized via a scoped
   `--allowedTools WebSearch` allowlist — not a blanket permission bypass) and
   returns the JSON report. Driving Claude Code headless is how unattended runs
   get live search, and it works whether your key is direct or goes through an
   employer proxy that lacks the server-side `web_search` tool.
4. Parses and **validates** the result against the purpose's schema
   (`linkedin` → exactly 4 posts A/B/C/D with all required fields;
   `research` → an `article` with title/tldr/sections/sources). Invalid
   payloads raise and exit non-zero; nothing is written.
5. Writes the instance to
   `knowledge-hub/intel-agents/<agent-id>/<agent-id>-YYYY-MM-DD.json`
   (date from `datetime.now()`).

The LLM adapter (`call_model`) is module-level and injectable, so tests never
hit the network.

## Environment

No API key is required — the engine uses your local Claude Code CLI, which
authenticates itself. It locates the `claude` binary via, in order: `$CLAUDE_BIN`,
`PATH`, then `~/.local/bin/claude`. Because launchd runs with a minimal `PATH`,
the plist sets `CLAUDE_BIN` explicitly (see below). Override it if your `claude`
lives elsewhere.

## Manual run

```bash
# one agent, from the repo root (uses system python3)
python3 tools/intel-agents/run.py shopping-marketplace-pulse

# every enabled agent (per-agent failures are logged, don't abort the loop)
bash tools/intel-agents/run-all.sh
```

There is also an in-session Claude Code command for the manual "call in Claude"
path — `/intel-run <agent-id-or-name>` — which composes the same prompt, runs
the searches with the `WebSearch` tool, validates with the same validator, and
writes the same JSON instance.

## Scheduling (launchd)

`run-all.sh` is scheduled daily at 07:00 via a launchd agent. A reference copy
of the plist lives in this directory. To install:

```bash
cp tools/intel-agents/com.ozos.intel-agents.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ozos.intel-agents.plist
```

To stop it:

```bash
launchctl unload ~/Library/LaunchAgents/com.ozos.intel-agents.plist
```

`RunAtLoad` is `false`, so loading does not fire an immediate run — it waits for
07:00. Output is appended to `tools/intel-agents/intel-agents.log` (the wrapper)
and `launchd.out.log` / `launchd.err.log` (launchd-level).

## Tests

```bash
python3 -m pytest tools/intel-agents/tests/test_run.py -x -q
```

Covers prompt composition (topic + voice + purpose rules), schema validation
(accepts valid linkedin/research payloads, rejects malformed ones), and the
end-to-end run with a fake injected LLM client writing to the correct per-agent
path with the correct date. Deterministic: no network, no hardcoded dates.
