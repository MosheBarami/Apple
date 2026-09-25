# NEXT ACTION

**Gauntlet round 8: test the local Apple Studio 1.4.0 plugin; verify public Creator Store
distribution separately.** The free Workers AI allowance reset on 2026-09-25. The local preview
plugin is visible in Studio, but a clean editable test place has not yet been reached through the
window controller, so no round 8 run or F-059/F-064/F-069 live verdict has been recorded.

2026-09-25 00:56 UTC: the CPU supervisor was restarted on the paired-evaluation code in `46d40b2`;
v21 was stopped at the version boundary and v22 is training (supervisor 35962, child 36313 at
measurement). Do not relaunch a duplicate. Watch `packages/training/runs/forever/daemon.log` and
`v22-train.log`; at evaluation, verify that v22 and the current best v5 use the same batch and scorer
before promotion. The v20 adapter was converted to PEFT, delta-W checked on 112 projections, and
uploaded to the existing private HF model under `v20-experimental/` (revision `369d777e`). It is
explicitly unpromoted; the 24/38 standalone score remains non-comparable with the saved v5 score.

2026-09-25 00:44 UTC: the corrected 16-item Luau code judge passed 86/86 guard tests. Re-scoring
unchanged saved answers gave Apple MAX 16/16 in each of three earlier runs, but a newly generated
run scored 12/16. The honest pooled Apple MAX number is **60/64 (93.8%)**, range 75–100%; regular
Apple is **15/16 (93.8%)** in one run. Both lanes use the same model and this is not a full-game
or external frontier comparison. The four new failures and the exact judge corrections are in
`docs/training/frontier-2026-09-25-library-ui.md`. The local dashboard was read back from
`/api/project` and displayed these exact per-lane figures. Commit `6216ec1` carries the evidence;
its CI run is in progress.

2026-09-24 ~22:23 UTC: Studio reported **Successfully submitted!** for the existing asset
`107230158271368` using the verified 1.4.0 file. The public Store page and details endpoint then
returned 404, while two listed controls returned 200. Treat this as uploaded, **not distributed**.
The publisher account installed the asset from its own inventory, but another account still sees
404. Roblox's distribution setting in the publisher's Creator Dashboard has not been inspected
(Q-020). Recheck the public listing; when it returns, install that listing and verify 1.4.0 in
Studio before changing `LATEST_PLUGIN_VERSION`. A local 1.4.0 behavior test can precede this
public release check. Q-019 records the completed upload;
`docs/evidence/plugin-1.4-upload-2026-09-25.md` records the boundary check.

The CPU training supervisor completed all 400 steps of v20 with 51 new verified game-logic training
rows and no Metal watchdog death. Its adapter answered 24/38, but the run is **invalid for promotion**:
the base trajectory score moved from the saved 0/23 to 1/23. v21 started automatically. The valid
leader remains v5 (20/38). The historical base answers differed on 19/38 pinned
rows earlier, so v20 needs a fresh v5 evaluation under the same runtime
(docs/training/eval-drift-2026-09-25.md). CI run 36073895590 for f202c6e passed
all six job groups. F-037 recovery is deployed in the web app and worker,
with a live browser reconnect check still owed (docs/evidence/f037-socket-recovery-2026-09-25.md).

Round 7 (project f199a2a8) was stopped by hand at step 357. Findings from its toolTrace:
- F-068 is closed: the longest successful terrain streak was 22 (cap 24), then the run went to props.
- F-059 root cause: the library search worked, but both insert_library_model calls were refused. Asset sources
  are only asked in the web app, so a Studio-started build never has an answer. The run then hand-built
  157 create_instances plus 151 transform_instances. Worker f202c6e now refuses that parts fallback
  even if permission is owed or insertion fails; all 4,184 worker tests passed. Live proof is owed.

Measured 2026-09-25:
- The worker is serving `f202c6e`; 4,184 working-tree worker tests and 43 focused clean-export
  tests passed, none failed. The app and site
  were also deployed from clean exports and their served bytes checked. The site suite passed 316/316,
  and `/discord` has one main landmark and the community invite.
- The UI embedding index is current again: 30 rows, built locally from the pinned MIT BGE model with no
  Workers AI spend. The 18 known-positive UI lookups stayed 17/18 top-1 and 18/18 top-5 under local
  queries. The clean-export worker suite passed; see `docs/evidence/local-ui-embedding-refresh-2026-09-25.md`.
- The plugin 1.4.0 artifact passed 58/58 tests and byte inspection. Local artifact:
  `apps/apple-plugin/release/apple-studio-1.4.0.rbxm`, sha256 `50fc250291fac769a972b3314b7094939dd42cbb8e5250b8ea5305b0388bf649`.
  GitHub Plugin release run `36060591975` passed. The Studio overwrite was performed; the public
  distribution check above is now the release blocker.
- The local training supervisor runs versions in order. v11 completed 400 steps but its evaluation
  was invalid because the paired base result drifted. GPU runs v12–v19 were mostly truncated by
  Metal; v20 completed training on CPU and its 24/38 adapter score was invalid for promotion because
  the historical base comparator drifted. v21 started. The best valid model remains v5, 20/38.
- The friendly thinking and glass redesign was implemented directly, deployed, and checked in the
  browser. CI run 36066064213 passed all six groups.

Then:
1. once a clean test place is reachable, run round 8 with the locally loaded 1.4.0 plugin
   (Apple MAX, Agent, Autonomous) and answer the source question with both sources;
2. verify that library props are inserted, that F-064 does not end the run with listed parts unbuilt, and that
   Stop ends the run within one step (F-069);
3. run the blind critic;
4. independently confirm that the Creator Store serves plugin 1.4.0; then bump
   `LATEST_PLUGIN_VERSION` and do an install check from another account.

The upload success is not a Store availability signal. Keep the release in progress until the public
listing and fresh Studio installation are observed.

## Previous: round 7 plan

**Gauntlet round 7 (the same simulator prompt), started right after the 00:00 UTC capacity reset.**

Round 6 (2026-09-23) built no game. Apple MAX made 951 edit_terrain calls in a row until the day's shared
capacity ran out (F-068). Stop in the workspace did not reach the run (F-069). Both fixes are live:
- D-TERRAIN-1: ead1e60, a cap of 24 terrain writes in a row;
- the HTTP Stop fallback: 069c821.

Ready since 2026-09-23 22:55Z:
- Studio 0.740 is on a fresh Baseplate. Its self-update loop was broken (the Temp installer copy has no
  libmimalloc), so the in-place installer was run once.
- A new project is paired, with edits allowed: "Gauntlet Round 7",
  f199a2a8-353b-4110-9166-1743e01be850.

Steps:
1. Start the run: Apple MAX, Agent, Autonomous.
2. Watch these live:
   - the longest terrain streak is 24 or fewer;
   - the run reaches props from the model library, scripts and library UI;
   - Stop ends the run within one step (F-069);
   - F-064 to F-066.
3. Take 4 to 8 final shots and stage them as `$SCRATCH/blind-7/shot-K.png`.
4. Spawn one fresh blind critic with only the rubric in `docs/gauntlet/visual/BLIND_CRITIC.md`.
5. Save its report as `docs/gauntlet/visual/rounds/round-7-blind.md`, then send the owner the verdict in Hebrew.
6. Fix the model's general weaknesses that the critic finds, never this one game.

Cloudflare lane, live since 2026-09-23: web (Turnstile widget) deployed, TURNSTILE_SECRET set; a
recovery request with no token or a forged one answers 403. After round 6: Supabase captcha (provider
turnstile, same secret), once the scripted test sign-ins carry a token or use a bypass. The probe worker
apple-cf-probe and queue apple-cf-probe-q are idle leftovers; the safety hook forbids removing a worker,
so they stay until the owner removes them.

## Parked: the Creator Store appeal

**Wait for Roblox's appeal decision on Apple Studio, then flip the store switch.** The final plugin build
(sha256 8a9ec295) was published over asset 107230158271368 on 2026-09-23 14:00 IDT and removed the same minute
("Misusing Roblox Systems", 3Jj4h4hPWRTA3QPDRlNRmejqPrP). The appeal was sent at 14:02; Roblox estimates 5
business days (evidence/20260923T1100Z-final-publish-appeal).

1. Re-probe `https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=107230158271368,6415005344`
   (Rojo is the control) and the Violations & Appeals page once a day.
2. Accepted → set STUDIO_PLUGIN_STORE_LIVE true, drop the known-issue entry, redeploy site + web, close
   F-020/F-034/F-038 with the probe as evidence (per docs/PLUGIN-RELEASE.md).
3. Refused → read the stated reason, record it in F-038, and change only what it names. Never remove a tool
   (owner direction); a second appeal is not possible on the same decision.

Three fresh reviews, once the running lanes have shipped: `python3 scripts/autonomy-supervisor.py --reviews-only`
runs reviewer sessions beside this interactive session (D-AUT-2) and keeps the streak itself. Optional: F-053 (undo after generate_model).
