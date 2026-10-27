Ask me: "Enter a short session summary (or press Enter to skip):"

Wait for my response. If I provide a summary, append it to the **vault's** learnings log
(`vault/docs/learnings.md`, or `<OZOS_VAULT>/docs/learnings.md`) under a new heading:
## Session Save — [today's date and time]
[my summary]

Then, if the vault is a git repo, commit it there:
```
cd <vault> && git add docs/learnings.md && git commit -m "session save: [today's date]"
```
Never commit session notes into the engine repo.

After that, print exactly this:

✅ Session saved. Start a fresh chat and type /start-session.
