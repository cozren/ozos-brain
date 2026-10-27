If the user provided a commit message with the command (e.g. `/commit fix login bug`), use that as the message. Otherwise, ask: "Enter a commit message:"  and wait for the response.

Then run the graphify update in the background:
```
graphify . --update
```

While that runs (or after if it's fast), stage all changes:
```
git add -A
```

Then commit with the provided message:
```
git commit -m "[message]"
```

Then push:
```
git push
```

Print a confirmation with the commit hash once done.
