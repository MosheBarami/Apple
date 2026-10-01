# NEXT ACTION (V3)

**2026-10-01 night — Frontier ≈57%: test 1 DONE (round 15), 1 of 5 silly tests green.** Test 1 ("make an asmr keyboard" → "make it a full game with plots for 4 players"): the keyboard is 9 credits and 2 steps (~1 min), the game 9 credits and 2 steps (~1.5 min; the first run was 274 credits and 93 steps). A dark gamer keyboard with an F row and real modifiers, rainbow legends, a purple underglow and a "+N" over every pressed key; a hub with the keyboard on the plaza, four 4x4 plots of 9-stud tiles, a free starter machine on a plinth beside each player's spawn, library pianos/keyboards in the shop, library lamps, trees and rocks, a HUD with Shop, Upgrades and Rebirth.

**Next, in order:**
1. Test 2: "make me a stick of butter" on a fresh baseplate, the same loop (critique → fix → re-run until nothing is left).
2. Still open in general: the web page stays "Studio disconnected" after a Studio restart (seen once); play_check does not press the game's own buttons; tower-defence field names inside the shop config; the model sometimes says "rainbow keycaps" for rainbow legends.

**2026-10-01 evening — Frontier ≈45%: test 1 (ASMR keyboard → "make it a full game with plots for 4 players") on round 8 of the critique loop, 0 of 5 silly tests green.** Every live test now ends in a harsh critique; it is fixed and re-run on a fresh baseplate until nothing is left, then marked done, and the next silly request starts. Five green tests means frontier. Meter: 50% × green tests/5 + 30% × critique fixed/found (48/57 at round 6) + 20% × cost/speed targets met (≤12 credits, ≤3 steps, ≤3 min, no failed call: met since round 5).

**Where test 1 stands (production 65006872):** the keyboard costs 9–11 credits in 2 steps (~50 s); the game costs 10 credits in 2 steps (~80 s), was 274 credits and 93 steps on the first run. Fixed and deployed today: the HUD (batched creates), hub sized to the hero, library trees/rocks/pianos, one panel at a time, +N/s and Rebirth driven, a free starter machine, players start on their own plot, paid presses capped at 12 a second, shop copies anchored and gold that is gold, keyboards with real rows and no junk parts, and a composed game answered with the composer's own words.

**Next, in order:**
1. Round 8 of test 1 on a fresh baseplate: play it (starter machine, pads, Rebirth, a step on your own keyboard), write the critique; mark it done only when nothing is left.
2. Still open from the critique: machines are tiny on a 6-stud tile; empty roads; stacked plates under the hero; keycap labels read sideways from the roads; play_check does not press the game's own buttons; tower-defence names inside the shop config.
3. Then test 2: "make me a stick of butter", same loop.

**2026-09-30 night: the owner rejected the library game (see CURRENT_STATE top).** Next is a rebuild of HOW games are made:
compose from components (systems, UI kit, props and creatures) on a NEW map, never import a whole world and cut it down.
Request twists must be really made (fruit enemies built as fruit, rigged and animated without private assets). Tests are
ideas, not game names. The status below is history.

**Owner confirmed 2026-09-30 (question round), in this order:**
0. Small fixes first: a judge/play check always stops the Studio play session; a second request on a built place continues that game.
1. Components with contracts (needs/gives), each tested alone in Studio, plus 4. our own code-driven Motor6D animation (walk, idle,
   attack; no private assets). Scope: ONE idea end to end, "defend your orchard from vegetables that come in waves", with only the
   components it needs, then built live on a new map.
Twist creatures: a rigged library body plus real fruit/veg meshes from the garden games, animated by our code. No uploads.

**Done 2026-09-30 late:** the two fixes (deployed 7f7d75a0) and the first component, `packages/components/motion` (AppleMotion,
0c4d7894). It was proven in a throwaway Studio place (15/15 biped, 7/7 quadruped and 1/1 tomato joints moved in play; see
evidence/20260930-components). The library survey for the orchard idea is in the same folder.

**Next, in order:**
1. Wire components into the builder. Add a worker tool that installs a component from its component.json (files go to the
   listed parents; the plugin writes the scripts), and a build step that runs AppleMotion.prepare on each creature. Ship the
   Luau as text in the worker bundle (wrangler Text rule or a generated .ts), not as copies.
2. Library proof through the product: import MythicNPC (PvB modded `f3ac50e43d68`), Penguin (Steal An Egg `4ba7759f7d19`)
   and one Bone-skinned rig. Prepare them and play them; they must move with no "Animation failed to load" left.
3. The fruit enemy: a Motor6D body (MythicNPC or the R15 Dummy) with real vegetable models from survey.md on it.
4. The orchard components, each with a contract and tested alone: WaveService (ours; none exists in the library), plots and
   planting (Easy Plot System), shop, sell and save (PvB modded donor, the Core/Data ProfileService wrapper), one UI kit from survey.md.
5. A new map laid out from the idea, the composer that puts it together, and the new judge (fails on a copied map, a twist
   that wasn't built, a creature that doesn't move, assets that don't load). Test with ideas only.

Status 2026-09-30 evening (production 177876ea): the library passes the client test. "Plants vs Brainrots, but the brainrots
are fruit" builds in ~55 s and the judge says ready (94/100, all seven criteria) on two builds in a row and two re-checks;
played by hand it is clean and progresses (evidence/20260930-client-test); the agent's answer is plain and friendly.
Next, in order:
1. After a ready verdict the model still wanders: once it replaced the silent private music and added a second money counter
   (fixed by hand; the run now REFUSES project changes after "ready", 177876ea, unit-tested, not yet seen live), once it read
   the viewport and called tools that do not exist ("get_transcript") instead of answering. End the run with the answer when
   the verdict is ready (finishRun from the judge result) rather than hoping the model does.
2. The same client test for the other genres (candy garden, steal-a-brainrot, escape tsunami, pet sim): their designs pass the
   planner tests but were not built live; the content choice (library_content.select) only runs for a creature twist.
3. Private sounds/animations of the original creator stay silent (see item 3 below).

Status 2026-09-30 (production db4ec488, plugin c707e1c6 local): the owner library is complete end to end (see
CURRENT_STATE "Owner library v2"). The owner's next prompt is about the PRODUCT. Found while testing, in priority order:
1. When a screen is visible in edit mode but hidden in play, play_check should name the script that hides it (first-join
   tutorials like Plants vs Brainrots' Onboarding hide Left/Right until the tutorial is done; the agent could not find it
   and looped on set_properties/search_scripts).
2. After `assemble_owner_game` the agent still wanders (extra UI packs, repeated searches, edits to original scripts);
   the build → one player check → answer flow should be enforced by the run, not only the tool note.
3. Other creators' private sounds/animations/texture packs stay silent (≈ half the ids in brainrot games): offer a
   replacement from public audio automatically, or (owner-gated) re-upload under the owner's account.
4. Media library (5,797 icons/panels) is not in Roblox: uploads are permanent and need the owner's go-ahead.
5. Site/web: the New project dialog has no brainrot/garden starting point; plugin version still 1.4.3 (no capability
   check for the `route`/`studioData` features an older plugin lacks).
6. Owner decision: the autonomous Studio audit plugin (native previews, content availability and button presses for all
   565 games in a few hours) was refused by the safety classifier; its sources are in packages/owner-corpus/audit/.

Pre-V3 queue archived in `archive/pre-v3/NEXT_ACTION.md`. Order follows `v3/Apple_RbxAI_EXECUTION_V3.md`.
Owner consent on record for the rest of V3 (2026-09-29): Cloudflare deploy to existing production, bounded
paid GLM runs, driving Roblox Studio, push to GitHub `main`. Stripe (L01) and public plugin release (L02) stay held.

Status 2026-09-29 ~03:10Z: `main` through 9c776d41 is deployed (worker); the local test plugin in
`~/Documents/Roblox/Plugins` is rebuilt from 00807fb7; live evidence is in CURRENT_STATE.md
(G01, G03, G10, G13 on Candy Garden v2). 2026-09-29 ~03:45Z: G11 restore proven live with plugin 01c91e39
(evidence/20260929-g11-restore; still owed: a follow-up run after a restore) and G15 Generate Branding proven live
(evidence/20260929-g15-branding). Building is paused until the daily neuron capacity resets
(midnight UTC). The owner decides whether to raise `BILLABLE_NEURONS_PER_DAY` (a day fits about 2-3 full game builds).

Status 2026-09-29 ~08:46Z (production 56de3f12): the final grow_a_garden recreate run is clean — right game, all
slots in their services (16,636 instances, 1,248 scripts), original names kept, no generated parts, one real script fix
(OwnerTagHandler race), 81 Credits, nothing after the reply. Fixed on the way: part steer after a recreate (f0cbf825),
recreate-first fence (7ec54a20), model-file recreate fence + local gateway search ignoring separators (56de3f12).
Next: a "new niche game from library parts" run (e.g. steal_a_brainrot parts); raise MAX_SNAPSHOT_NODES so run_and_check
works on large recreated places. Owner action: publish the place with Studio API access for DataStores.

Landed in code (pushed to `main`):
G01 single engine, mode removal, training retirement, G05 native-readiness consumer, G06 library
namespace, G03 hard Studio gate + pause/Continue + steering + acknowledged Stop (G10), English-only
output (G08), G02 pre-launch account gate, Q21 critique-loop removal, Stop abandons in-flight model calls.

1. **Finish in-flight work.** Branding (G15), game independence (G13/G14) and cleanup (workflow
   wejim95fb); G12 evidence renderers (workflow wp4lz7sb4) then one integration into `ws/turn.tsx`.
   Commit each piece separately after worker + web tests and tsc pass.
2. **Deploy.** `node infra/deploy-worker.mjs apple`, then `node infra/deploy-static.mjs` (needs
   `API_BASE`/`GOLEM_ADMIN_KEY` from the repo `.env`, read by the script only). Set secrets
   `LIBRARY_APPROVED_USER_IDS` (and optionally `RELEASE_LIBRARY_OWNER_ID`). Verify `/api/health`
   `buildSha` equals `main` and one real GLM request (G01 evidence).
3. **Library publish (G06).** `packages/owner-corpus/publish_native_readiness.py --live` with the owner's
   `APPLE_OWNER_JWT` (201/203 units ready in dry run; 2 skipped for open refs).
4. **Live Studio checks (G03/G10).** Install the local test plugin build, then: unpaired composer locked
   → pair unlocks → wrong place locks → disconnect mid-run pauses → reconnect offers Continue with no
   duplication → steering applies at the next step → offline Stop works.
5. **Three complete games** (G07/G08/G09/G13/G14): Steal a Brainrot, Grow a Garden, Arm Wrestle
   Simulator families, each in its own project, played in Studio. Grow a Garden = Candy Garden v2
   (project 2b3cbdae). Next, send its open fixes as one follow-up: growing label/countdown, unlock prices,
   real icons, the close button hidden under My Plot. Then ask for one inactive game pass / developer product (G14: v2 has none) and continue after the G11 restore; then the other two games.
6. **Final audit (G16)** and update `ACCEPTANCE.json` gate statuses with live evidence only.
7. Move the working copy back to `~/Desktop/RbxAI` (owner request): swap the evicted Desktop `.git`
   for the local one; private data stays in iCloud.
