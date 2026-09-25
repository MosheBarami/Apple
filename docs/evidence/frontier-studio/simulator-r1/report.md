# Frontier Studio simulator-r1 — measured terminal failure

**25 September 2026.** One fixed prompt, Apple MAX / Agent / Autonomous, paired to an
isolated Studio Baseplate. The exact prompt is `TASKS[0]` in
`packages/evals/frontier-studio/missions.mjs`. Live worker build:
`3c98a2b1316accb7067b798ed5dea39bd0002cea`. The user message began at
14:10:13 UTC and the second assistant segment ended at 14:18:33 UTC. The operator
made **one bounded preview rejection**, with no freeform hint or place edit.

The saved, sanitized [tool trace](trace.json) contains 50 calls from both assistant
segments. Its source was the admin-gated SessionDO message response (local source
SHA-256 `8b4089568042c3bf93f59dcd274ac79751ead0515f5ae139f1f2ae47c742d694`).
There were 26 `shape_terrain` attempts, 24 successful, four
`find_library_model` calls and **zero model insertions, Play checks, visual inspections
or UI operations**. The first library search was for `wooden arch gate`; the three
actual previews were **Wooden Plate, Wooden Wheel, Wooden Plate**. All were visibly
wrong for the requested gate. The normal “None of these look right” choice restarted
the agent, which exhausted three more searches and ended `incomplete`. The benchmark
scorer grades this as a measured failure, with the bank-wide pass rate withheld until
all 36 runs have evidence. Reproduce with `node packages/evals/frontier-studio/score.mjs
docs/evidence/frontier-studio/simulator-r1/evidence-bundles.json` (nonzero exit is
expected while the bank is incomplete).

The place was saved before and after the run, without publishing to Roblox. SHA-256:

| File | SHA-256 | Size |
|---|---|---:|
| Baseline `.rbxl` | `b75332cb6bf1b2c1ac8379fcdefe8b0f6196786ccbcbe73a8def4dd8c504161f` | 63,448 B |
| After `.rbxl` | `99b4a34e41fa6305cf1fd6b365dade37860a03a29c3d682cf9912b4196d57601` | 146,249 B |

`inspect-place.luau` deserialized both saved places without running scripts. The
baseline had two Workspace parts, **zero game scripts** and zero ScreenGuis. It also
contained one pre-existing `TestService/LuauLSP_Settings` helper script and a
script-free `ServerStorage/__PanicGitFastV5` object, which the earlier Workspace-only
scan missed. The after file had 11 parts, three new `ServerScriptService` scripts
(`Profile`, `Currency`, `RemoteGuard`), zero ScreenGuis, zero remotes and zero
library insertions. `SpawnLocation` stayed at `[0, 0.5, 0]`; the agent's terrain
operations reported surfaces from roughly Y=4 to Y=16. In a manual Studio Play
observation, the avatar appeared **under an overhanging terrain surface**, next to a
bright yellow wall, with no game HUD. This was an observation through the Studio UI,
not a neutral screenshot artifact or a blind critic pass. The absence of a completed
game is already proven by the trace and the agent's terminal response; untested
individual features are not asserted to have passed or failed.

The immediate product defects are irrelevant preview ranking and the missing
spawn/terrain safety check. The first has a red-first source fix in the next worker
change; the second remains a concrete gameplay and visual failure to address before
the next fresh-place run. The 1/36 result is a failed *product run*, not a universal
score for the underlying language model.
