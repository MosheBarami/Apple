# Frontier replay diagnostic, 2026-09-25

Six saved Agent-lane answers were replayed locally with `rescore-roblox-frontier.mjs` in a scratch directory. This made **no model calls** and left the source run files untouched. `roblox-frontier.test.mjs` passed 81/81 before the replay.

| Lane and repetition | Saved score | Replay score | Excluded |
|---|---:|---:|---:|
| Apple Agent 7 | 14/15 | 15/15 | 1 |
| Apple Agent 8 | 15/15 | 15/15 | 1 |
| Apple Agent 9 | 13/15 | 14/15 | 1 |
| Apple MAX Agent 4 | 12/15 | 13/15 | 1 |
| Apple MAX Agent 5 | 15/15 | 15/15 | 1 |
| Apple MAX Agent 6 | 14/15 | 14/15 | 1 |

The same `ui-slide-in` item was excluded in **all six** runs. Every saved answer called `insert_ui_component(...)` from inside the requested LocalScript. That is an Apple agent tool, not a Luau global. The harness caught `attempt to call a nil value` and classified it as `runtime_error`, which its tally excludes. Thus **15/15 means 15 measured passes out of 16 attempted items**, not a complete 100% result. The replay changed `platform-mover` from fail to pass in repetitions 7 and 4 and `pet-rename` from fail to pass in repetition 9. No generated answer changed.

This is a **provisional diagnostic**, not a new published benchmark: the replay used working-tree `frontier-harness.luau` SHA-256 `c11b3250404eabe8…` and `roblox-frontier-controls.mjs` SHA-256 `46a086129097dce8…`, both still uncommitted at the time. The scorer was `ff0314bdf550c111…` and tasks `360aad721f4044c1…`. The six replay JSON files are under `/tmp/apple-frontier-rescore.xduI2f/` on this machine; originals remain in `packages/training/runs/`.

Next: settle the UI item's conflict with the owner's library-only UI rule. A valid future prompt can start with library UI already inserted and ask the LocalScript to animate it. That requires **fresh model answers**; rescore cannot make old answers answer a new prompt. Keep the excluded item visible in every report, and do not call either lane a verified 100% frontier model on this evidence.
