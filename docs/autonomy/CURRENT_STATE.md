# CURRENT STATE

2026-09-25 07:53 UTC: the Studio viewport is addressable after closing the unrelated Lemonade floating window in the same Studio process. The full "Place1 - Roblox Studio" window visibly shows the baseplate and an Apple Studio dock marked "Not connected" and "Access: inspect only". Plugin Management lists Apple Studio by Shahar474, last updated 2026-09-25, with its toggle visually off, while the dock remains visible. That may be a separate local plugin; the active dock's build/version and the scratch place's identity are not yet verified. No pairing, asset-source answer, library insert, run Stop or round-8 verdict was observed. This supersedes the earlier statement below that the controller cannot capture the viewport. F-059/F-064/F-069 and 0/3 fresh reviews remain open.

2026-09-25 07:45 UTC: CI for the new storage-outcome shard passed five of six jobs; the root suite found that its one-shot builder lacked a dead-ends disposition. This was recorded as WIRE, matching the existing UI-shard builder pattern. The exact failing gate was rerun locally and now passes 15/15. The Hugging Face dataset card was updated for the four new rows and downloaded back byte-identical (SHA-256 `394fa2a3b4dc5b82e946b3d187fb7f313d2a6b1e11d208f49dca1ed8577cd5b9`). A new full CI run is required before calling the repository green.

2026-09-25 07:35 UTC: four new first-party Luau lessons distinguish a successful empty read from a failed read, targeting the measured rep16 first-save failure without changing the benchmark answer or judge. All four execute locally, reject an assertion-breaking mutation and pass the training supervisor's shard gate. The full training package passed 661/661. The shard was uploaded to the private Hugging Face corpus and downloaded back with identical SHA-256 bytes. A new single-lever hypothesis is queued after v24; no trained result or frontier improvement is claimed. Evidence: `docs/training/storage-outcome-shard-2026-09-25.md`. CI for this commit remains to be run; acceptance remains 0/3 with F-059/F-064/F-069 open.

2026-09-25 07:21 UTC: `--reviews-only` now gets its own bounded window (three sessions or four hours by default), so the long-lived owner supervisor's older 72-hour/80-session ceiling cannot silently prevent new independent reviews. A regression failed before the change with an aged-out owner state and passed afterward; a second test proves the new review ceiling still stops the invocation. All 24 autonomy-harness tests pass. This does not supply a reviewer or change acceptance: 0/3 fresh reviews and open high F-059/F-064/F-069 remain.

2026-09-25 07:17 UTC: the review supervisor now refuses a reviewer PASS without a fresh report naming production and a screenshot under docs/autonomy/evidence; it also refuses PASS while a critical/high customer finding remains open. A reviewer session that exits without a verdict stops instead of burning more sessions. The bare-PASS regression failed before the change; all 22 autonomy-harness tests pass afterward. No real reviewer was run or credited: acceptance remains 0/3 and F-059/F-064/F-069 are open. The Claude Code subscription remains unavailable; this change does not claim to replace a product review or restore Studio access.

2026-09-25 07:01 UTC update: a new full Apple MAX Agent code run (rep16) answered all 16 items using 444 Workers AI neurons from the free allowance. One initial miss was a local UDim2 arithmetic gap. A red-first saved-answer regression and a component arithmetic test now pass, along with all 88 frontier controls. Rescoring six saved full runs changed only rep16 UI: 14/16 to 15/16; the new Apple MAX pool is 76/80 (95.0%) across five runs, while Apple remains 15/16 (93.8%). The dashboard live API reports both groups current and the Agent requests identical. Rep16 still fails its first-save task for a new player. v24 CPU training is alive past iteration 130/400; no held-out result yet. Full Studio and public plugin verification remain blocked, so acceptance is not met. Evidence: `docs/training/frontier-udim2-rep16-2026-09-25.md`.

2026-09-25 06:46 UTC update: the private Hugging Face model card was corrected
after a red-first test found that it listed v11/v20 even though both evaluations
were marked invalid. The 1,737-byte replacement was uploaded and downloaded back
with identical SHA-256 bytes; it shows v22 as local best and v23 as an unpromoted
experiment. The dashboard live API returned the revised status at 06:38:39 UTC;
training v24 was still alive at validation step 75/400, with no held-out score.
CI runs 36103187726 and 36103885839 both passed all six groups, including the
corrected model card's tests and Playwright (latest checked 06:47 UTC).

To try the Studio gauntlet without altering a project file, a byte-identical
scratch copy of `apps/apple-plugin/release/apple-studio-engine-proof.rbxl` was
opened via Finder (`/private/tmp/apple-studio-window-probe.rbxl`, SHA-256
`58944ee805fa17689e94552b6ca469a21b5dc6ca4a27ef5db8f2f47bbc145532`).
A lock file appeared, but the computer controller exposes only a 300×200
"Lemonade" floating window for the running Studio installation and cannot
capture the editable viewport. No build, Stop, library insertion or visual
round-8 verdict was observed. F-059, F-064 and F-069 remain open. The
independent-review supervisor still defaults to Claude Code, whose organization
subscription access is disabled; the acceptance counter remains 0/3. Codex CLI
is installed and logged in, but has not been substituted for a genuine external
product reviewer.

2026-09-25 06:14 UTC update: the live owner dashboard was read back and shows
Apple MAX 61/64 (95.3%, four full code-harness runs) and Apple 15/16 (93.8%, one
run), both current under the corrected shop-stock fixture. The saved model
answers and requests did not change. The v23 CPU adapter completed 400 steps but
scored 14/38 versus v22's 24/38 in a valid paired evaluation, so v22 remains
the best local adapter. Both sides of the v22 and v23 comparisons were verified
in the private Hugging Face model repository. v24 started automatically with
nine verified UI examples; it has not finished. The public plugin still returns
404 and round 8 in Studio has not been observed. Acceptance remains unmet:
0/3 fresh reviews and open high F-059, F-064 and F-069. Evidence:
`docs/training/frontier-shop-stock-2026-09-25.md` and
`docs/training/v23-paired-result-2026-09-25.md`.

2026-09-25 04:20 UTC update: v23 remains alive on CPU and has passed iteration 100/400.
Commit `3f97d9f` adds a fail-closed, row-by-row identity and base-outcome check before a
future LoRA promotion. Its new test failed on the old guard, then 33/33 supervisor tests
and 648/648 training package tests passed after the fix. The real v22 paired files still
pass with 38 matching rows and 24/38 versus 18/38. The long-lived v23 supervisor loaded
older source before the commit; adopt this guard and the earlier template preflight fix
only at a safe version boundary. GitHub Actions run `36093092688` passed all six groups.
The public Apple Studio Store page still shows 404, and a clean round 8 Studio run has
not been observed. The acceptance gate remains at 0/3 fresh reviews and open high
F-059, F-064, F-069.

2026-09-25 03:42 UTC update: local LoRA v22 completed 400/400 CPU steps and was scored
on the same 38 held-out rows and runtime as v5: 24/38 versus 18/38. The row IDs, base outcomes
and base tally matched exactly; neither score included known harness-unavailable or
out-of-curriculum reasons. v22's tracks were trajectory 17/23, game logic 1/8, finish 6/7.
The supervisor promoted v22, posted to Discord, and the private Hugging Face model repo was
independently checked for its adapter config, weights and scored evaluation. v23 started
immediately and is training on CPU. This is a local code evaluation, not a full Roblox Studio
build or proof that the served Apple models are frontier. F-059, F-064 and F-069 remain open.

Directly measured facts only. Re-measure at the start of every session; this file is a snapshot.

**Measured:** 2026-09-25 ~04:23 IDT. Older snapshots below are historical.

2026-09-25 03:14 UTC update: the live Apple worker reported build `f14733d` after a clean
archive deployment. The Studio asset-source answer protocol now distinguishes retryable storage
failures from a lasting policy refusal. Clean worker tests passed 4,176/4,176, Studio plugin tests
58/58, and CI run 36089011844 passed all six jobs. The public plugin details endpoint remains
404 while Rojo and Moon Animator controls return 200; no Studio round 8 run has occurred, so
F-059, F-064 and F-069 remain open. The CPU LoRA supervisor completed v22 training at 400/400
steps by 03:20 UTC and started the paired 38-row evaluation against v5; no valid new score or
promotion exists. An updated 1.4.0 preview was built and byte-verified, but has not been installed
or distributed. Evidence:
`docs/evidence/f059-studio-answer-retry-2026-09-25.md`.

2026-09-25 ~04:45 IDT update: the v22 CPU training supervisor and its child were alive at
iteration 140; no promotion verdict exists. A scoring guard now refuses empty final replies
(`62abc55`, 15 focused tests passed; stored v4/v5/v20 finish answers had zero blanks).
The local Studio controller began opening a clean Baseplate but selected an unrelated Lemonade
floating window before the viewport could be inspected; round 8 remains untested. The
Apple-Plugin-Release.rbxl place was closed without saving in-memory state; its disk file was
unchanged. The latest CI run for the dashboard update was in progress at this measurement.

2026-09-25 03:55 UTC update: a private static Hugging Face Space for the measured LoRA
results was created at https://huggingface.co/spaces/moshebarami/apple-training-results.
The API confirmed private visibility and static SDK, the runtime reported RUNNING, and the
owner browser displayed the 24/38 versus 18/38 page. This is a results snapshot, not model
inference or production deployment. The repo source lives in packages/training/hf-space/.

## Current boundary checks

- GitHub Actions runs `36077908319` for `b529ffe`, `36078577416` for `6216ec1`,
  `36079960470` for `a56e7bf`, and `36081078529` for `e1453fa` passed all six job groups.
  `/api/health` returned 200 with live worker build `e1453fa` after a clean-export deploy.
  The site and app were previously deployed from clean exports, with served bytes checked.
  F-037 socket recovery and presence fixes are live, with a browser reconnect check still owed.
- F-064's renewed move-on bound is live in `e1453fa`. A clean old-code archive with the new
  integration test failed 1/30 because it ended a run that had built requested parts; the clean
  patched archive passed 39/39 focused tests, TypeScript typecheck, and 4,173 worker tests with
  zero failures. A fresh Studio run is still required to close F-064.
- Apple Studio 1.4.0, SHA-256 `50fc250291fac769a972b3314b7094939dd42cbb8e5250b8ea5305b0388bf649`,
  was submitted in Studio over the existing plugin asset `107230158271368`. Studio reported success.
  The public Store page and toolbox details API returned 404 immediately afterward; distribution
  and logged-out installation are unverified. See `docs/evidence/plugin-1.4-upload-2026-09-25.md`.
- The local CPU training supervisor finished all 400 steps of v20 without the Metal watchdog.
  Its adapter scored 24/38, but promotion was invalid: the base trajectory score changed from the
  historical 0/23 to 1/23. The supervisor was restarted with the new paired comparison and is
  training v22 on CPU (processes 35962 and 36313 at 00:56 UTC); v21 was stopped for that restart.
  v5 remains the best valid measured LoRA at 20/38. A 51-row verified Luau game-logic shard is
  private on Hugging Face. The private `moshebarami/apple-lora/v20-experimental/` directory now
  holds a converted v20 PEFT adapter and an explicit non-promotion note, verified by listing the
  Hub files at revision `369d777e`. The new supervisor will regenerate candidate and best in the
  same batch when v22 finishes; see `docs/training/eval-drift-2026-09-25.md`.
- Acceptance still needs three fresh independent reviews and live checks for F-059, F-064 and F-069.
- The current code-task benchmark shows Apple MAX 60/64 (93.8%) across four full runs and Apple
  15/16 (93.8%) in one. The newest Apple MAX run alone was 12/16, so the earlier 16/16 results do
  not establish stable 100%. The local owner dashboard was queried and reports these figures.
  A local Apple Studio 1.4.0 preview is visible but no clean test run has been completed.

## Historical snapshot (2026-09-23 ~07:55 IDT)

## Repository

- HEAD = origin/main `e9462f8`, pushed. Peer lanes' uncommitted edits remain in the tree (not this lane's).
- Suites at the last run (05:00): worker 3847/0, web 2186/0, evals 1354/0, plugin 46/0.
- CI has not run since 2026-09-21 (OWNER_QUEUE Q-001); local suites are the gate.

## Production (https://apple.moshe-barami111.workers.dev)

- Worker deployed ~04:58 (serving ac1b223-dirty + the duplicate-refusal next-step change); web deployed ~05:03.
- Outdoor art-direction rules live in the brief (only for outdoor requests); particle formats documented.
- Creator Store: Apple Studio refused (F-038); appeal with the final build per D-STORE-2.

## Studio

- One Studio process (pid 24529) on Apple-Mission2b-Baseplate.rbxl, paired to project "Sky Island 2 23 Sep"
  (c58b1815-7bcb-4ab9-a809-da159374bf78), running the plugin build loaded at 04:21 (ed6622c5 era, before the
  ColorGradingEffect and NumberSequence fixes). A quit prompt is open on it (Q-005).
- Installed local plugin (loaded at the next launch): sha256 494fb68f875cdb1f9481634aedcdc43886fd87c4b709a32a4248356a2d7d7f8e.

## Since 07:25

- F-028 closed (planted bug found read-only in 14 s, 18 Credits); F-036 closed (lighting-only scope: 85 Credits,
  nothing but Lighting changed). Project menu: rows were unclickable (under the thread) and two were unlabelled —
  fixed and measured on production. Outcome line no longer says "without changing anything" for unfinished runs.
- Gate: unmet = 0/3 fresh reviews; critical F-020, F-034, F-038 (final publish + appeal); high F-033, F-051
  (Studio relaunch, Q-005).

## Since 06:50

- Mission 2 met (D-VIS-1): 07:14 run, one sentence → the kit floating island, 62 Credits, 1 m 51 s, honest reply;
  follow-up "add a campfire" 40 Credits, 2 m 52 s. A render that cannot show Terrain no longer scores an
  outdoor scene. F-023, F-030 closed; F-049 medium (sunset sky only).
- Gate: unmet = 0/3 fresh reviews; critical F-020, F-034, F-038 (final publish); high F-028, F-033, F-036, F-051.

## Since 05:05

- build_scene kit floating_island + kit guard (worker 8d4f21c): the first sky island that reads as one,
  observed in the Studio viewport; 179 Credits with the guard. Renderer now draws Terrain (plugin 8a9ec295,
  installed, NOT loaded — Studio restart waits on Q-005). aim() reads list targets (retune bound no longer
  ends builds that move many different objects); bound endings say what changed; terrain_edit clear.
- The paired Studio (pid 24529) still runs the plugin loaded at 04:21; menus and the command bar work
  behind the open quit prompt, so runs continue in Sky Island 2.

## Missions tonight

- Sky island, fresh baseplate, 04:20: 116 Credits, 5 m 30 s (was 232 / 13 m 25 s), Terrain island, still
  short of epic (F-049). Rebuild 04:45: 68 Credits, terrain only, ended on the duplicate bound.

## Acceptance gate (scripts/autonomy-review-gate.py, 05:05)

- Unmet: visually_ambitious_environment mission; 0 of 3 fresh reviews; critical F-020, F-034, F-038; high
  F-023, F-028, F-030, F-033, F-036, F-049, F-051. mobile_qa now true (375 px measured; pixels at 500 px).
