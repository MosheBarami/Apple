---
name: phase-status
description: Report the status of the owner's phases 0-7 (measurement, remove request-specific code, library, store search, senses and critique, and so on) from the handoff, plan docs and git.
---
# Phase status (phases 0-7)

Use for "where are we", "what phase is active", "is phase N done".

1. `search_code` for "| 0 | Measurement" in `HANDOFF.md` (the phase table is near the top) and `read_file` that table plus the section that says which `/goal` is active and what is NOT finished.
2. For each phase the owner asks about, `search_knowledge` "phase N <topic>" and read the plan/status text; `docs/autonomy/PHASE-3-4-PLAN.md` covers phases 3 and 4 (design only unless it says otherwise), `docs/autonomy/CURRENT_STATE.md` and `NEXT_ACTION.md` give the latest state.
3. Verify claims against git: `git_log` (n=20) for recent commits, `git_branches` to see phase branches (for example integration branches), `git_worktrees` for parallel work. A phase is "done" only if its stated exit criteria in the table are met by evidence you saw; otherwise say "claimed done" or "not started" accordingly.
4. State dates. Docs go stale: when HANDOFF, CURRENT_STATE and git disagree, name both and say which is newer.
5. Answer as a compact list: phase number, one-line goal, status (done / in progress / not started / unknown), evidence with `path:line`, and the next action if the docs name one.
