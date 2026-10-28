# Contributing

Thanks for looking. OZOS is a small, opinionated project; these rules keep it that way.

## Before you build

Open an issue first for anything bigger than a fix, so we agree on the shape before the code.
Company-specific logic does not belong in the engine: it goes in a vault, or becomes a
generic connector under `connectors/`.

## Tests come first

- **TDD is mandatory.** Write the failing test, watch it fail for the right reason, then
  write the minimum code to pass. A bug fix starts with a test that reproduces the bug.
- Tests live beside the code: `tools/<tool>/tests/`, `connectors/<name>/tests/`,
  `app/tests/` and `app/backend/tests/`, `app/frontend/src/**/__tests__/`.
- Tests never touch a real vault, `~/.ozos` or the network; patch paths with `tmp_path`.
- No time-dependent tests: compute "today" from the clock, never hardcode it.

## The gate

```bash
python3 tools/test-pipeline/pipeline.py          # every suite; must print 0 failing, no NOT COLLECTED
cd app/frontend && npx tsc --noEmit && npx vitest run
python3 -m ruff format tools/ skills/ app/ connectors/ && (cd app/frontend && npm run format)
./ozos scrub-check                               # no company terms in the engine
```

Install the pre-commit hook once (`bash tools/test-pipeline/hooks/install.sh`); it runs all
of the above. Never commit with `--no-verify`.

## Commit messages

`[tool-name] what changed`, one change per commit:

```
[app] Insights feed shows an empty state when a source has no instances yet
[ozos-cli] scrub-check --history scans every commit's diff
```

## Pull requests

Keep them small. Say what you tested and how. If a change touches `docs/SETUP.md` territory
(a new setup item, connector or vault file), update the guide in the same PR.
