# Playbook — how work gets done here, and what has already been learned the hard way

`docs/FAILURES.md` is the log: what was believed, what was true, how it was caught. It is
exhaustive and it is 2,000 lines, which means nobody reads it before starting.

This folder is the other half — the **method**. Short, operational, and written so that an agent
opening the repository for the first time does not spend its first four hours re-deriving what the
last six agents already paid for.

The enforced version is `.claude/skills/rbxai-working-rules/SKILL.md`, which a session loads
automatically. **Read that first.** These files are what it points at when you want the worked
example rather than the rule.

| File | Read it when |
|---|---|
| `OBSERVATION-FAILURE.md` | something reported success and you are not sure it did the thing |
| `GUARDS.md` | you are writing a test, or one went red and you think it is wrong |
| `WORKFLOW.md` | you are about to make a change, dispatch an agent, or deploy |

## The three sentences, if you read nothing else

1. **A failure to observe must not render as an observation.** The dangerous defect here is never a
   crash — it is a confident answer about something nobody looked at.
2. **Assert the property, not the expression.** A guard that goes red when the code improves is a
   guard that will be deleted, and it will take a real one with it.
3. **Red-first proves a guard can fail; green-after proves the feature works.** Both, every time.

## What this folder is not

It is not a style guide, and it is not advice. Every rule in here has a commit behind it and a
defect that shipped in front of it. If you find one that no longer holds, the right move is to
change it and say what you measured — not to quietly work around it.
