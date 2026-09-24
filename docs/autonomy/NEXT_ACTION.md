# NEXT ACTION

**Gauntlet round 8, after Apple Studio 1.4.0 reaches the Creator Store.**

Round 7 (project f199a2a8) was stopped by hand at step 357. Findings from its toolTrace:
- F-068 is closed: the longest successful terrain streak was 22 (cap 24), then the run went to props.
- F-059 root cause: the library search worked, but both insert_library_model calls were refused. Asset sources
  are only asked in the web app, so a Studio-started build never has an answer. The run then hand-built
  157 create_instances plus 151 transform_instances.

Measured 2026-09-25:
- The worker is serving `08cdfcf`; 4,165 clean-export worker tests passed, none failed. The app and site
  were also deployed from clean exports and their served bytes checked. The site suite passed 316/316,
  and `/discord` has one main landmark and the community invite.
- The UI embedding index is current again: 30 rows, built locally from the pinned MIT BGE model with no
  Workers AI spend. The 18 known-positive UI lookups stayed 17/18 top-1 and 18/18 top-5 under local
  queries. The clean-export worker suite passed; see `docs/evidence/local-ui-embedding-refresh-2026-09-25.md`.
- The plugin 1.4.0 artifact passed 58/58 tests and byte inspection. Local artifact:
  `apps/apple-plugin/release/apple-studio-1.4.0.rbxm`, sha256 `50fc250291fac769a972b3314b7094939dd42cbb8e5250b8ea5305b0388bf649`.
  GitHub Plugin release run `36060591975` passed. The Store probe still shows the 2026-09-23 upload;
  Studio was not available to this session. Q-019 records the exact overwrite step.
- The local training supervisor runs versions in order. v10 was truncated by the Metal watchdog; v11
  completed 400 training steps and is evaluating. The best fully measured model remains v5, 20/38.
- The thinking/glass workflow did not complete: its Claude agents were refused by organisation access.

Then:
1. confirm that the Creator Store serves plugin 1.4.0; then bump `LATEST_PLUGIN_VERSION` and do a
   logged-out install check;
2. run round 8 (Apple MAX, Agent, Autonomous) and answer the source question with both sources;
3. verify that library props are inserted, that F-064 does not end the run with listed parts unbuilt, and that
   Stop ends the run within one step (F-069);
4. run the blind critic.

The next CI run must complete before claiming the repository green. Finish the requested friendly,
single-step thinking animation and glassy app/site design with no technical-detail disclosure.

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
