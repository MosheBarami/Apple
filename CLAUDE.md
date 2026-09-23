# Apple (RbxAI)

> **START HERE: `docs/autonomy/`.** Read `README.md`, `MISSION.md`, `CURRENT_STATE.md`, `NEXT_ACTION.md` there
> (the mission ends `RESEARCH-REPORT.md` → `OWNER_PROMPT.md`). `.claude/hooks/autonomy_guard.py` enforces the safety
> envelope; `touch .autonomy/STOP` freezes every mutating tool.
> **Owner autonomy is enforced:** load `.claude/skills/apple-owner-autonomy/SKILL.md`. Decide instead of asking,
> keep working until acceptance, route only payments, account creation, passwords/2FA and CAPTCHAs to
> `docs/autonomy/OWNER_QUEUE.md`.

Memory (auto-memory is off to save context, D-COST-1): read
`~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/MEMORY.md` when prior decisions, owner preferences or infra
facts matter; write new memories there by hand. The old SGSD loop is archived in `docs/sgsd/SGSD-ORCHESTRATOR.md`;
read it only when asked to run SGSD.

## Karpathy principles (override everything below)

1. **Think before coding.** State assumptions; surface tradeoffs and competing readings instead of picking silently;
   say when a simpler approach exists; name what is unclear.
2. **Simplicity first.** Minimum code for the request. No speculative features, single-use abstractions, unrequested
   configurability, or handling of impossible cases. If 200 lines could be 50, rewrite.
3. **Surgical changes.** Touch only what the task needs; match existing style; don't refactor or reformat adjacent
   code; mention unrelated dead code instead of deleting it; remove only what your change made unused.
4. **Goal-driven.** Turn the task into verifiable success criteria, state a short plan with per-step checks, loop
   until verified.

## Closing Recap (repos with `.planning/`)

End every response with this block, last, after answering:

```markdown
## Recap
- **Milestone:** <id and title, or "none, ad-hoc work">
- **Phase:** <id and title, or "n/a">
- **Stage:** <discussed / planned / executing / verifying / closed>
- **Why:** <business/engineering reason in one clause, prefer the milestone core value>
- **Building:** <what is actually being produced>
- **Next:** <one action with owner and trigger, or "none">
```

Source values from `.planning/STATE.md` frontmatter, the milestone `INTENT.md` and `ROADMAP.md`; write `unknown`
rather than guess; never invent a Next action. STATE.md is known to go stale and contradict itself: when sources
disagree, name both values once in the affected line.
