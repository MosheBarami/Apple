# Session handoff — 2026-09-30 (owner library closed; original game passes the client test)

> **REVOKED the same night:** the owner rejected this game (a copied world, an ignored fruit twist, T-posed creatures). Read
> CURRENT_STATE.md top first. What follows is how the rejected flow works, kept as context.

Read first: `docs/autonomy/README.md`, `MISSION.md`, `CURRENT_STATE.md`, `NEXT_ACTION.md`; scope is V3
(`v3/Apple_RbxAI_HANDOFF_V3.md`, gates in `ACCEPTANCE.json`). Memory: `~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/MEMORY.md`
(see `client-test-flow.md` and `owner-library-v2.md`). The owner's NEXT prompt is about the PRODUCT (site + agent), not the library.

## Where things are

- Repo: `/Users/moshe/Developer/RbxAI` (origin github.com/MosheBarami/Apple, branch `main`). `/Users/moshe/Desktop/RbxAI` is a stale copy
  (this session's cwd); always work in `~/Developer/RbxAI`. No `.planning/` → no Recap block.
- Production worker: `https://apple.moshe-barami111.workers.dev`, last deploy **70e2fbff** (docs/dashboard commits after it need no deploy).
- Tests at hand-off: worker 4,568 (0 fail), `packages/owner-corpus` Python 328 (0 fail), plugin 77, web tool-vocabulary 7.
- Owner library (local, gitignored code in `packages/owner-corpus/`, data in `~/Library/Application Support/Apple/owner-library/`):
  565 sources, 97,428 assets, 97,265 verified, dossiers, UI index (367 kits), **180 knowledge cards + 8 genre syntheses**
  (`knowledge/`, `knowledge/genres/`, index `knowledge/index.json`), live builds in `live-builds.json`.
- Gateway (must be running for any library build): port 63747. Restart after any Python change:
  `kill $(lsof -ti tcp:63747 -sTCP:LISTEN); rm -f /private/tmp/apple-owner-gateway-ready.json; cd ~/Developer/RbxAI && nohup python3 packages/owner-corpus/gateway.py --cache "$HOME/Library/Application Support/Apple/owner-gateway-cache" --port 63747 --ready-file /private/tmp/apple-owner-gateway-ready.json > /tmp/gateway.log 2>&1 &`
- Owner dashboard: `node scripts/owner-dashboard/server.mjs 4777` (http://127.0.0.1:4777/#/library); data from
  `python3 scripts/owner-dashboard/games.py`; library report `python3 packages/owner-corpus/library_report.py`.
- Deploy worker: in a scratch worktree of `main`, `ln -sf ~/Developer/RbxAI/.env .env && node infra/deploy-worker.mjs apple`, then
  `unlink .env` (separate command). Never read/print `.env`.

## What was built this session (the flow that passes)

`plan_game` → `packages/owner-corpus/library_design.py` (+ `library_content.py`, `library_design_scan.luau`, `library_grants.luau`,
`library_read.luau attrs`) → `build_game` (`apps/worker/src/game-plan.ts`) → `judge_game` (`client-judge*.ts`) → answer.
Key rules (tested; keep them):
- plan_game reads the user's **pinned** message (`src/user-request.ts`), not the model's paraphrase.
- Cuts are closed over the core's own code; a part kept code reads stays; a left-out feature whose world piece is needed stays whole.
- Screens/buttons of left-out features, the creator's Robux/gift/instant-restock buttons (screens AND cloned templates), a left-out
  mode's HUD panel: **hidden + tagged `AppleHidden`**, never deleted; the judge ignores AppleHidden pieces.
- A creature twist ("the brainrots are fruit") **chooses** the core's own matching creatures; exact, compile-checked code edits
  (registry spawn filter, rebirth requirements, drop left-out unlock promises, tutorial skip, admin-console loader block, left-out
  tool grants). The plugin refuses to write scripts naming httpservice/debug./loadstring… → edits go through the caller.
- build_game sets the services' own attributes (Workspace.DataKey!) and the source's StreamingEnabled (extract version 2).
- After `judge_game` says ready the run offers **no tools** and no keep-going steer → the answer ends the run (`src/run-flow.ts`).
Evidence: `docs/autonomy/evidence/20260930-client-test/` (7 screenshots + README): ready 94/100 on two builds and re-checks,
hand-played loop (buy → plant → fruit enemies → sell $280→$317 → index → rebirth).

## Open (do these next, in order)

1. Live-confirm the run ending on a ready verdict (70e2fbff): build once, check the run ends with the plain answer and no extra
   tool calls. (A verification run was started at hand-off in project "Fruit Siege (end-to-end check)"; see CURRENT_STATE.)
2. Client test the other genres live: candy garden (grow-garden), "a brainrot game like steal a brainrot", escape tsunami, pet sim.
   Designs pass the planner tests but were never built; the content choice only runs for a creature twist (a plain "candy theme"
   still asks the model to rename registries — risky; extend `library_content.select` to themes).
3. The original creator's private sounds/animations stay silent; the agent may replace music with licensed audio (allowed), but
   renaming the game's sound objects broke `SoundService:WaitForChild("OldMusic")` once — replacing audio should keep names.
4. The judge cannot play a loop that needs planting/aiming; it passes a working core's loop and says so. A scripted loop walk
   (from the card walkthrough) would make progression truly measured.
5. Product/site items from the older list in `NEXT_ACTION.md` (brainrot/garden starting points in New project, plugin version check).

## Safety / consent (unchanged)

Ask the owner before anything destructive, paid or external beyond consents on record (Cloudflare deploy, bounded GLM runs, driving
Studio, push to `main`, publishing library games privately). Never: read `.env`, print tokens/keys, `git add -A`, upload media to
Roblox, click third-party Studio popups' Connect/Disconnect/"I'm ready" (Lemonade, Revix — close them with their X), kill Studio
processes that may hold the owner's work, retry what the safety classifier refused (admin run-tool as owner, autonomous audit plugin).
Earlier in this session Lemonade's "I'm ready" was likely clicked by accident ("Setup completed!") — the owner was told.

## Driving Studio + the web app (what works)

- Studio: File > New (a new place is a new process; plugin loads there); Ignore auto-recovery; close Lemonade/Revix with X.
  Apple panel: pairing field (156,354) ×2 → code → Connect (156,398); port (156,432) "63747"; key (156,474)
  "library-only-placeholder-key-0000000000"; Connect library (156,517) (clicking it again DISCONNECTS); Enable edits (156,612) ×2.
  Command bar runs with ⌘↩. Many open places trigger "Low System Resources" (Proceed works).
- Web (Chrome tab): New project button (1287,85) (first click after load may not open), name field → "Create project";
  pairing `POST /api/projects/<id>/pairing`; send via the textarea value setter + `form.requestSubmit()`; live events over
  `wss://…/api/projects/<id>/ws` (protocols `golem.v1`, `golem.jwt.<token>`); diagnostics `GET …/studio/diagnostics`;
  stop `POST …/stop`. Keep each JS evaluation under ~40 s or the tab's CDP call times out.
