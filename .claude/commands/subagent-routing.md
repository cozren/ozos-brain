Route and execute the task in $ARGUMENTS using the rules below.

## Step 1 — Classify the task

Apply these rules to decide whether to use a subagent or handle it in the main session:

### Use a subagent when:
- The task requires **broad exploration** with uncertain scope — results will be large and mostly noise
- The task produces **large intermediate output** that won't be needed again (e.g. reading 20 files to answer one question)
- The task is **independent** of current conversation state — it doesn't need what's already in context
- You need to run **multiple parallel searches** that each return large results
- The task is a **one-shot lookup** where only the final answer matters, not the path to get there
- You're about to read many files just to extract a small fact

### Stay in main session when:
- The task is **tightly coupled** to recent context (current code changes, decisions made this session)
- The result will be **directly acted on** in the next step (read a file then immediately edit it)
- The task is **small and targeted** — 1–3 tool calls max
- You need to **maintain state** across steps (multi-step refactor where each step depends on the last)
- The subagent would need the **entire conversation history** to do its job — passing all that context defeats the purpose

### Quick rules of thumb:
- ≤3 tool calls with confident outcome → main session
- 5+ tool calls with uncertain results → subagent
- Research → subagent. Execution → main session.
- Ask: "Will I use the full output, or just extract one small fact from it?" — if the latter, subagent.

## Step 2 — Execute

**If main session:** perform the task directly now.

**If subagent:** use the Agent tool to spin up a `general-purpose` subagent with a clear, self-contained prompt. The prompt must include:
- The full task description
- Any required context from the current session that the subagent cannot derive on its own
- An explicit instruction to return only the final, distilled result — no intermediate reasoning or raw dumps

Then return only the subagent's final result to the user. Do not summarize or restate the routing decision — just deliver the output.
