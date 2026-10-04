# Game 1, round 2: causes (worker 0adfa451, plugin 1.5.0 + insert fix). Blind critic: 1.5/10 (round 1: 2/10)

Trace (10 tool calls, 82 credits, 245 s): propose_plan → compose_game ×4 failed (missing machine looks, now with the
reason recorded) → find_library_model "glowing crystal cluster" (live store worked) → insert_library_model (worked) →
compose_game OK "Built Crystal Caverns from 0 library pieces" → judge_game "not ready yet (79/100)" → answered.
Model-call log for the run: 10 GLM step calls, 0 vision calls.

| # | Cause | Evidence |
|---|---|---|
| D1 | A composer template was taken as the whole game. plot-sim stamps the same island, hub and 4 plots map for any idea. The request's crystals, mining and caves never appear | workspace: AppleMap (Island, Hub, Road, 4 Plots, empty Props), a single 2x2x4 "Crystals" part |
| D2 | The real asset it inserted was not used. The composer took "0 library pieces"; the inserted crystal cluster was never passed as a machine's `from`/`look` | compose_game summary; machines without looks |
| D3 | It answered over its own judge's "not ready (79/100)" | judge_game last call, then the reply |
| D4 | The in-product look and blind critique never ran | 0 vision calls. Likely the ledger counts a change as visible only for paths matching `^game\.(Workspace|Lighting)`, and the composite tools report other path shapes, or `judge_game` counts as a look. To be confirmed in code |
| D5 | (UI improved: gem icon, one button column, rebirth locked with progress, critic UI 4.5/10.) Still: identical button weights, a "+" that reads as a purchase, no depth/objective | critique 12–13 |

## The owner's play-test (screen recording 2026-10-04 12:34, frames in owner-play/)
| # | Seen in play | Cause |
|---|---|---|
| P1 | No mining at all: only passive "+1/s"; upgrades say "+N per press", but nothing can be pressed | plot-sim template offers per-press upgrades without creating a pressable thing |
| P2 | Rebirth window: "Rebirth for $10K", "You need more money", in a crystal game | composer strings hard-code money language |
| P3 | SHOP floor label mirrored and sideways | pad label decal orientation |
| P4 | Roblox's default spawn star in the middle of the hub | template keeps the default SpawnLocation decal |
| P5 | Flat studded slabs, deposits are flat coloured squares; the one real crystal asset is the only 3D object | composer as the whole game (D1/D2) |
All five were sent to the round-2 fix agent.
