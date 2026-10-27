# /intel-run

Run an Intel Agent in-session (the manual "call in Claude" path): load the
agent's config, run the same web searches + house-style prompt composition that
`tools/intel-agents/run.py` uses, and write the same dated JSON report instance.

**Usage:** `/intel-run <agent-id-or-name>`

**Example:** `/intel-run shopping-marketplace-pulse`

## Steps

1. Take `$ARGUMENTS` as the agent id or name. If empty, read
   `<vault>/.ozos/intel-agents.json` (the vault is `vault/` by default, or wherever `~/.ozos/config.json` points), list the enabled agents (id + name + purpose), and
   ask which one to run.

2. Load the agent's config from `<vault>/.ozos/intel-agents.json`. Match `$ARGUMENTS`
   against `id` first, then case-insensitively against `name`. If no match,
   list the available agents and stop.

3. Compose the prompt exactly as the run engine does — reuse the shared house
   style baked into `tools/intel-agents/run.py`:
   - Import `compose_prompt` from the run engine to get the byte-identical prompt:
     ```
     python3 -c "import sys; sys.path.insert(0,'tools/intel-agents'); import run, json; a=run.load_agent('<agent-id>'); print(run.compose_prompt(a))"
     ```
   - The composed prompt already contains: the voice block for the agent's
     `voice`, the topic (focus / keywords / source prefs / search budget), the
     shared `summary` block spec, and the purpose-specific rules
     (templates A–D + scoring + quality checklist + the "exactly 4 posts,
     80–180 words" rule for `purpose: linkedin`; the title/tldr/sections/sources
     article structure for `purpose: research`).

4. Do the work IN-SESSION:
   - Run up to `searches_per_run` web searches with the `WebSearch` tool,
     grounded in the topic's focus and keywords, respecting `sources_prefer` /
     `sources_avoid`. Never fabricate a source, outlet, date, or URL; mark any
     URL you cannot verify as `url_verified: false`.
   - Build the JSON payload that matches the schema in the composed prompt.

5. Validate the payload before writing — reuse the run engine's validator so it
   matches `run.py` exactly:
   ```
   python3 -c "import sys,json; sys.path.insert(0,'tools/intel-agents'); import run; run.validate_payload(json.load(open('/tmp/intel-payload.json')), purpose='<purpose>'); print('valid')"
   ```
   For `linkedin`: exactly 4 posts, templates A/B/C/D, all required fields.
   For `research`: an `article` with title / tldr / sections / sources.
   If validation fails, fix the payload and re-validate — do not write an
   invalid instance.

6. Set `generated_at` and `purpose` from `datetime.now()` / the agent, then
   write the instance to:
   `<vault>/knowledge-hub/intel-agents/<agent-id>/<agent-id>-YYYY-MM-DD.json`
   (create the per-agent directory if needed). This is the same path the run
   engine writes — never under the engine tree.

7. Report the path written and a one-line summary (e.g. "4 LinkedIn options,
   strongest signal: …" or the article title).

If loading the config fails because the agent id/name is unknown, list the
agents from `<vault>/.ozos/intel-agents.json` and ask the user to pick one.
