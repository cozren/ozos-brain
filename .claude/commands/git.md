Save the current work to git: **commit → push → merge into main** when possible.

If the user typed a message after the command (e.g. `/git fix cycle dropdown`), use it as the
commit subject. Otherwise derive a concise subject yourself from the staged diff — do NOT stop
to ask, just pick a sensible one and proceed.

## Steps

1. **Inspect state.** Run `git status --short` and `git branch --show-current`.

2. **Stage the real work, skip the noise.** `git add -A`, then unstage generated / runtime /
   throwaway-data files so they don't pollute the commit:
   ```
   git reset -q graphify-out vault
   ```
   (Re-add any of these only if the user explicitly asks.) Then show `git diff --cached --name-status`
   so it's clear what's going in.

3. **Scan for secrets** in the staged diff (api keys, tokens, passwords, private keys,
   `client_secret`, `access_token`). If anything real shows up, STOP and tell the user.

4. **Commit message.** Follow the project convention: `[tool-name] short description of what changed`
   (e.g. `[app] add cycle selector to timeline`). Use the user's message if they gave one.

5. **Branch first if on the default branch.** If the current branch is `main`, create a short
   feature branch before committing:
   ```
   git checkout -b <tool-name>/<short-topic>
   ```
   If already on a non-main branch, commit there directly.

6. **Commit.** End the message body with:
   the attribution line Claude Code provides for the session.

7. **Respect the gates — never `--no-verify`.** The pre-commit hook runs formatting checks and the
   full test pipeline. If it blocks on:
   - **formatting** → run `cd app/frontend && npm run format` and/or
     `python3 -m ruff format tools/ skills/ app/ connectors/`, re-stage, retry the commit.
   - **scrub check** → a company term is in the engine; move it to the vault. Never bypass.
   - **failing/uncollected tests** → do NOT bypass. Report which tests fail and stop; the work
     isn't ready to commit.

8. **Merge into main** (this is the "merge if possible" part). If the commit landed on a feature
   branch, fast-forward it into main:
   ```
   git checkout main && git merge --ff-only <branch>
   ```
   If the fast-forward is refused (main moved on), say so and ask before doing a real merge.

9. **Push.** `git push origin main` (or the current branch if not merging). Then delete the merged
   feature branch: `git branch -d <branch>`.

10. **Confirm** with the pushed hash and the `origin/main` ref range (e.g. `de7cf1c..1b8a1f3`).

## Notes
- "commit", "push", "merge to git", and "/git" all mean this same full flow.
- One commit = one coherent change where possible. If unrelated work is intertwined in shared
  files and can't be split, commit it together and note that in the message body.
