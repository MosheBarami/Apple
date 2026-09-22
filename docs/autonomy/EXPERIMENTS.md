# EXPERIMENTS

## E-1 — Historical no-verifier trap, real production run (2026-09-22 21:15 IDT)

- **Setup:** production worker bd6ab34-dirty; project 81b7c2f8… "Acceptance 22 Sep (disposable)"; Studio
  Place1.rbxl, Apple Studio 1.0.0, edits allowed; Agent, Autonomous OFF, make-from-scratch.
- **Prompt:** the benchmark vis-01-lamppost prompt, verbatim.
- **Measured:** the model's plan had 3 steps (viewport_info, create_instances, render_view) and no
  verifier; the product appended inspect_visually with an announcement; no propose_plan refusal loop;
  the run proceeded to a checkpoint and viewport_info. **Trap fixed in production.**
- **Then:** model step 3 took 90 s and returned 6500 output tokens (the ceiling); the partial
  create_instances call failed; the next model call failed in 305 ms; run ended `error`; 28 Credits
  refunded. **New trap found → F-001, D-RUN-1.**

## E-2 — Same prompt via "Try again" (2026-09-22 21:19 IDT)

- **Measured:** identical failure: calls 71 s/4559, 6 s/6, 91 s/6500 (ceiling), then failed 272 ms;
  `error`, 27 Credits refunded, opsFailed 1. **Deterministic, not a flake.**

## E-3 — Same prompt after D-RUN-1, real paired Studio on the 1.1.0 build (2026-09-22 22:09 IDT)

- **Setup:** worker c0dd945f (buildSha ad10090-dirty) with the truncation fix (gateway drops incomplete
  tool calls on a provider `length`; history never holds unparseable arguments); Studio instance on the
  disposable copy Apple-Acceptance-2026-09-22.rbxl with Apple Studio 1.1.0 (sha256 7e8d692e…), paired,
  edits allowed; Agent, Autonomous OFF.
- **Result (measured):** the run SURVIVED the output ceiling this time (no truncation death). The first two
  create_instances calls were refused by the plugin ("className must be a string", "path must be a string")
  because the tool's item schema was an untyped object; the third succeeded. The lamp EXISTS in the real
  place — stepped plinth, dark post with brass collars, lit glazed lantern, finial (Studio screenshot 22:16
  IDT; trace: propose_plan, viewport_info, create_instances ✗✗✓, add_effect, focus_camera, render_view,
  audit_build ✓). Then a duplicate-guard loop: 53 paid steps of identical refused re-reads after the build,
  nothing executed or traced; I pressed Stop at 441 s (my stop, not a product failure). 68 steps, 205
  Credits. → fixed: create_instances item schema + unambiguous alias reader; duplicate streak bounded at 3;
  a project change forgets remembered read signatures. Deployed as worker 9418fbd5.

## E-4 — Customer mission 1, coin game, real paired Studio (2026-09-22 22:23 IDT)

- **Setup:** worker 9418fbd5 (E-3 fixes live); same disposable place and project; Agent, Autonomous OFF.
- **Prompt:** "Make a simple coin collecting game on this baseplate: put 8 spinning gold coins around the
  map. When a player touches a coin it disappears and their Coins on the leaderboard goes up by 1. Each
  coin comes back after 10 seconds."
- **Measured:** run 76b59615, outcome `done`, 52 steps, 381 s, 195 Credits, 35 ops applied / 5 failed.
  Plan of 6 steps; 5 done (tree, checkpoint, 8 coins, CoinService script, leaderboard); the planned
  playtest (`run_and_check`) NEVER RAN. The first create_instances was refused ('path must start with
  "game"') — caused by MY E-3 default parent `Workspace`. After the build the run tried to create the
  coins again ("already contains a child named Coin1") and then spent ~40 paid steps re-reading tree and
  scripts until the duplicate guard ended it ("Apple stopped because it kept repeating a step…").
- **Root cause (measured):** message metadata `context: {usedChars 21868, maxChars 24000, dropped:
  {groups 55, chars 97566}}` — the 24k transcript budget minus a ~15k system prompt kept only the last two
  turn groups; the agent held no record of its own finished work. Same mechanism explains the E-3 tail.
- **Fixed:** the trim now writes every dropped group as one line into a single pinned, bounded (3k) run
  record ("already happened … do not repeat them"); top-level parents are rooted at `game`, checked against
  the plugin resolver's own source. Tests: transcript-ledger (5), studio-props (+1, 3 corrected); falsified
  4 breaks red. Worker 3753/0, evals 1354/0 (2 eval guards restated: the request is the non-ledger user
  message). Deployed worker 30d97330.

## E-5 — Mission 2 follow-up "playtest it and fix what's broken" (2026-09-22 22:38 IDT)

- **Setup:** worker 30d97330 (run record + game-rooted parents live); plugin 1.1.0 (7e8d692e…).
- **Measured:** run fad0ab1b, `done`, 37 steps, 243 s, 123 Credits, 48 groups dropped. It rewrote CoinService
  twice, ran run_and_check (✓, but detail `stopped:false`), then wandered 25 read steps until the repeat
  guard. Studio log: "[CoinService] managing 0 coins"; "playsolo" still at 19:48 (six minutes later).
- **Root cause (docs + measured):** RunService:IsRunMode() is false for a Run() simulation, so the plugin
  refused its own stop; IsEdit() and StudioTestService.EditModeActive also stay TRUE under Run() — the
  stuck run 604bfd32 had two edit_script writes admitted as "edit mode" while its own simulation ran.
- **Fixed:** plugin remembers the Run it started; edit mode = IsEdit ∧ ¬IsRunning in both definitions;
  mock models the documented semantics; refusals carry the state they saw. Worker: a refused stop fails
  run_and_check and leads its result. Plugin 43/43, worker 3755/0; 6 breaks falsified red.

## E-6 — Playtest-only request on the fixed plugin (2026-09-22 23:03 IDT)

- **Setup:** plugin build 56ec11d3… installed locally, Studio restarted and re-paired; worker 79704b0f.
- **Measured:** run 5316f52b, `done`, 12 steps, 115 s, 35 Credits, 0 failed ops. Two playtests, each
  started and STOPPED (run_mode ok). The reply quoted the real log lines. It also created a RemoteEvent
  although the request said "Do not change anything" → F-022, fixed in worker 863a30f9.

## E-7 — Mission 3 "debug a broken game", read-only then fix (2026-09-22 23:08–23:19 IDT)

- **Read-only diagnosis (run 3bcf3f57, worker 863a30f9):** no writes (F-022 fix held live: only reads and a
  checkpoint), but no answer either — 32 steps, `incomplete`, 99 Credits refunded, and the reply apologised
  for "never making the edit you asked for" → reply copy fixed (worker 200134b0).
- **Fix request (run a95f86fa):** `done`, 54 steps, 167 Credits, 72 groups dropped; both playtests started
  and stopped. The place still cannot score (F-029), and the run spent ~20 read steps after its check
  (F-030) → post-verification idle bound, worker 3f353ba2.
- **Instrument that worked:** saving the disposable place and reading it with lune (`roblox.deserializePlace`)
  gives the true tree and every script source without trusting any product claim.

## E-8 — Mission 4 terrain + lighting (2026-09-22 23:38 IDT)

- **Run d1a97c0d (worker 3f353ba2):** `done`, 152 steps, 450 s, 450 Credits; 149 edit_terrain (fill_ball) calls, one
  op each. Studio stalled once (30 s timeout); Studio tools were then withdrawn and the reply mis-stated both the
  tool availability and the number of edits. A hill-like dome exists; the pond and the sunset do not.
- **Fixed:** edit_terrain takes `operations` (≤32, in order, stops at first failure and reports the partial
  mutation); the description tells the model to build a whole feature in one call. Worker 5a617e92.

## E-9 — Mission 4 re-run after batched terrain and the replay fix (2026-09-22 23:54 IDT)

- **Setup:** worker 5a617e92; plugin build 1e04e884… (Studio restarted, re-paired).
- **Measured:** run 1fe40a80, `done`, 30 steps, 122 s, 105 Credits (was 152 steps, 450 s, 450 Credits): one
  batched edit_terrain call made the hill and pond (five ops). set_mood failed on an existing Atmosphere
  after changing Lighting → F-035, fixed. The automatic visual review failed the result; the model then only
  re-read until the duplicate guard. The viewport is a grey haze.

## E-10 — "List the parts inside the StreetLamp model" (2026-09-23 00:29–01:21 IDT)

- Three failed attempts before the fixes: runs 5034f8f2 (read loop, incomplete), 6133d093 (answered but "the
  earlier reads came back summarized"), 867aff43 and 2d3d2ea9 (re-reads refused as duplicates, incomplete).
- Root causes (measured): get_project_tree handed the model JSON cut at 3,000 chars mid-object; a read trimmed out
  of the transcript stayed in the duplicate guard, so it could never be read again.
- After the tree outline and the trimmed-read fix: run 20cc1671, `done`, 2 steps, 10 Credits — "26 parts:
  Plinth1–3, BaseCap, Column1–5, Ring1–4, TopCollar, LanternBase, Glass, Glow, PostN/S/W/E, CapSlab1–3, Finial.
  Nothing was changed." — correct against the lamp built in E-3.

## E-11 — Creator Store update of Apple Studio (2026-09-23 01:22 IDT)

- Inserted apps/apple-plugin/release/apple-studio.rbxm (sha256 1e04e884…) into ServerStorage of the disposable
  acceptance place, Save / Export → Publish as Plugin → "Overwrite an existing asset…" → the account's only plugin,
  Apple Studio → Save. Studio: "Successfully submitted! ID: 107230158271368". Inserted copy removed afterwards.
- Store page (Chrome): "Apple Studio · By @Shahar474 · Created Sep 19, 2026 · Updated Sep 23, 2026".
- apis.roblox.com/toolbox-service/v1/items/details?assetIds=107230158271368 → 404 immediately after (was 200 on
  2026-09-22). Treated as index/moderation lag until re-probed; LATEST_PLUGIN_VERSION stays 1.0.0 until it answers.
- Re-probed ~01:30 IDT: NOT lag. Configure page → Distribution: "Not distributed on Creator Store — This asset may be
  in violation of Roblox Community Standards … you can appeal"; Version History shows version 2 (01:23) and
  version 1 (09-19). toolbox details still 404. Recorded as F-038; owner decision D-STORE-2 (appeal the final
  version, no interim store updates, keep every plugin tool).
