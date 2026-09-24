# CURRENT STATE

Directly measured facts only. Re-measure at the start of every session; this file is a snapshot.

**Measured:** 2026-09-25 ~02:03 IDT. Older snapshots below are historical.

## Current boundary checks

- GitHub Actions run `36069966833` for `9538599` passed all six job groups.
  The live worker serves `9538599`; the site and app were deployed from clean exports, with served bytes checked.
  F-037 socket recovery and presence fixes are live, with a browser reconnect check still owed.
- Apple Studio 1.4.0, SHA-256 `50fc250291fac769a972b3314b7094939dd42cbb8e5250b8ea5305b0388bf649`,
  was submitted in Studio over the existing plugin asset `107230158271368`. Studio reported success.
  The public Store page and toolbox details API returned 404 immediately afterward; distribution
  and logged-out installation are unverified. See `docs/evidence/plugin-1.4-upload-2026-09-25.md`.
- The local CPU training supervisor is running v20. Validation through step 125 and training through
  step 140 completed without the Metal watchdog. No v20 evaluation exists yet; v5 remains the best valid
  measured LoRA at 20/38. A 51-row verified Luau game-logic shard is private on Hugging Face.
  Historical v5/v11 base answers differ on 19/38 pinned rows, so the next comparison must re-evaluate
  the best nearby; see `docs/training/eval-drift-2026-09-25.md`.
- Acceptance still needs three fresh independent reviews and live checks for F-059, F-064 and F-069.

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
