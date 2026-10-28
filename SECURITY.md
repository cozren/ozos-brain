# Security

## What never goes in the engine

This repo is public-ready. It must never contain, in any file or any commit:

- company names, product names, hostnames, dashboard or card ids, Drive folder ids;
- real people's names or emails (the demo vault uses invented people on `example.com`);
- meeting content, notes, documents;
- credentials of any kind: API keys, tokens, OAuth client files, service-account keys.

All of that belongs in a **vault**, which is a separate folder and, if it is a repo at all,
a private one.

## Where credentials live

- `<vault>/.env`: the Anthropic key, Atlassian and Metabase variables. Written by `ozos init`
  and the Setup page; gitignored by the vault template.
- `~/.gdrive-credentials.json` and `~/.config/ozos/meeting-notes-token.json`: the Gmail
  OAuth client and token, outside both repos.

## The guard

`./ozos scrub-check` greps the engine tree for a term list kept **outside** the repo
(`~/.ozos/scrub-terms.txt`); the pre-commit hook runs it. `./ozos scrub-check --history`
runs the same list over every commit's diff, message and author identity; run it before
making any fork public.

## Reporting a leak or a vulnerability

Open a GitHub issue titled `security: <short description>` **without** the sensitive value
itself, or email the address on the repository owner's GitHub profile. You will get an answer
within a few days.

## If something leaks

1. Stop; do not push more commits on top.
2. Remove the file from tracking and add it to `.gitignore`.
3. Rewrite history (`git filter-repo`) and force-push, then run `./ozos scrub-check --history`.
4. Rotate the credential. A rewritten history does not un-leak a key.
