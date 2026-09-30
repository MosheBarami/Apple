# NEXT ACTION (V3)

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
