# Final session handoff: 2026-09-30

**Status in one line:** the owner-library game builder is **rejected by the owner**. The next session rebuilds *how* a game is made:
it composes a game from **components**. It never copies a whole world and cuts it down.

Read first:
- `docs/autonomy/README.md`, `MISSION.md`, `CURRENT_STATE.md` (its top section is this verdict), `NEXT_ACTION.md`.
- The scope is V3: `v3/Apple_RbxAI_HANDOFF_V3.md` and the gates in `ACCEPTANCE.json`.
- **Where they conflict, the owner's latest words below win.** V3 §3 allowed reusing complete maps; the owner has now forbidden that.
- Memory: `~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/MEMORY.md` (see `client-test-flow.md`).

## 1. The owner's verdict and requirements (2026-09-30 night)

The game "Plants vs Brainrots, but the brainrots are fruit" was judged "ready 94/100" by our judge and called a pass. The owner
says it is **bad and a big failure**:
1. **It copies a whole world 1:1 and then changes it.** The owner wants games **built component by component, in the style**:
   systems, UI, props and creatures composed into a *new* game. Never an imported map that has been edited.
2. **The twist was ignored.** "Brainrots are fruit" was done by *choosing existing brainrots with fruit names*. The enemies must
   actually **be fruit** (new creatures made by combining pieces).
3. **Every creature T-poses.** Brainrots have no working rig or animation: the original creator's animations are private
   (Output: "Animation failed to load"). Creatures must move.
4. **Big combinations** (mixing systems and content from different sources) were never shown.
5. **Tests are ideas, never game names.** Examples: "defend your orchard from vegetables that come in waves", "an island that
   sinks while you build a boat from parts".
6. Earlier the same night: **real users must never see technical things.** That means no tool names, paths or "checked with
   check_ui_layout" narration, and no red "Failed to load sound … not authorized" spam in Output. In the web app, show **only
   one live status line while working and the answer once, when done** (never streamed chunks under a stuck shimmer pill).

Our judge (`apps/worker/src/client-judge*.ts`) measured the wrong things. It must fail on:
- a map that resembles a source game;
- a twist that was not built;
- a creature that does not move;
- assets that do not load.

## 2. Proposed plan (told to the owner; not confirmed yet, so confirm before a big build)

1. **Library = components, not games.** Split the 565 sources into standalone components, each with a contract (what it needs,
   what it gives):
   - systems: shop, plot/planting, lane/wave enemies, sell, rebirth, index, save;
   - one UI kit per style;
   - props and buildings;
   - creatures (model + rig).

   Test each component alone in Studio. Raw material already indexed in `~/Library/Application Support/Apple/owner-library/`:
   `systems.json`, `families.json`, `ui.json` (367 kits), `style.json`, `entries/*.json`, `knowledge/`.
2. **A new map every time,** laid out from the idea (plots, paths, zones) and filled with library props in one style. Never
   import an existing map.
3. **The twist is built.** A fruit enemy is a rigged library body combined with real fruit pieces (the garden games have many
   fruit models).
4. **Our own animation component:** code-driven walk, idle and attack on Motor6D rigs. No private assets and no uploads, so no T-pose.
5. **A new judge** that fails on the four things in §1, and **idea-only live tests**.

The first steps if the owner agrees: 1 and 4.

## 3. What is live now

- **Worker** `https://apple.moshe-barami111.workers.dev` serves **8804bdac**; the web app was deployed from the same commit.
  Later commits are docs only.
  - `src/plain-reply.ts`: the final reply drops sentences that name a registered tool or a Roblox path (tested).
  - `apps/web/src/components/ws/turn.tsx`: while a turn streams, only the live line renders; the stored answer appears at
    `msg_end` (tested).
  - `src/private-audio.ts`, called from `build_game`: it asks Studio to preload every Sound id and blanks the ones that fail. The
    old id is kept in the `AppleSilenced` attribute, and names stay the same because scripts `WaitForChild` them. **Unit-tested,
    not yet seen live.** Sounds a script picks at run time are not covered. Animations are not handled; the component plan
    replaces them.
- **Tests at hand-off:**
  - worker 4,570 (0 fail);
  - web about 2,441 (1 failure that predates this session and is unrelated: `failed-run-money-claims` "quota");
  - `packages/owner-corpus` Python 328 (0 fail).
- **The rejected flow (still in code; the component builder should replace it, not patch it):** `plan_game` →
  `packages/owner-corpus/library_design.py` + `library_content.py` → `build_game` (`apps/worker/src/game-plan.ts`) →
  `judge_game` → answer. After a "ready" verdict the run offers no tools (`src/run-flow.ts`).
- **Seen in the last live check (project c5405278 "Fruit Siege (end-to-end check)").** The same request was sent again on an
  already-built place. The agent re-judged it, then wandered: it tried to build a new map and edit a script while Studio was
  left **in a test run**, so every write was refused. It ended by asking the user to press Stop. Two open bugs follow:
  - a judge/play session can leave Studio running;
  - a second request on a built place is not handled.

  I pressed Stop in Studio.

## 4. Where things are

- **Repo.** `/Users/moshe/Developer/RbxAI` (origin `github.com/MosheBarami/Apple`, branch `main`). `/Users/moshe/Desktop/RbxAI`
  is a stale copy: work in `~/Developer/RbxAI`. There is no `.planning/`, so no Recap block.
- **Owner library.** The code is local and gitignored in `packages/owner-corpus/`; the data lives in
  `~/Library/Application Support/Apple/owner-library/`. It holds 565 sources, 97,265 verified assets, 180 knowledge cards and
  8 genre syntheses.
- **Gateway** (needed for any library build), port 63747. Restart it after any Python change:
  ```bash
  kill $(lsof -ti tcp:63747 -sTCP:LISTEN); rm -f /private/tmp/apple-owner-gateway-ready.json; cd ~/Developer/RbxAI && nohup python3 packages/owner-corpus/gateway.py --cache "$HOME/Library/Application Support/Apple/owner-gateway-cache" --port 63747 --ready-file /private/tmp/apple-owner-gateway-ready.json > /tmp/gateway.log 2>&1 &
  ```
- **Deploy the worker** from a scratch worktree of `main`:
  1. `ln -sf ~/Developer/RbxAI/.env .env && node infra/deploy-worker.mjs apple`
  2. then `unlink .env`, as a separate command.

  Never read or print `.env`.
- **Deploy the web app:** `cd apps/web && npm run build`, then `node infra/deploy-static.mjs --only web` from the repo root.
- **Owner dashboard:** `node scripts/owner-dashboard/server.mjs 4777` (http://127.0.0.1:4777/#/library).

## 5. Safety and consent (unchanged)

**Ask the owner before anything destructive, paid or external,** beyond the consents on record: Cloudflare deploy, bounded GLM
runs, driving Studio, push to `main`, and keeping library games private.

**Never:**
- read `.env`, or print tokens or keys;
- `git add -A`, or commit `.claude/launch.json`;
- upload media to Roblox (it is permanent and owner-gated);
- click third-party Studio popups: close Lemonade and Revix with their X, never Connect, Disconnect or "I'm ready";
- kill Studio processes that may hold the owner's work;
- retry what the safety classifier refused (the admin run-tool acting as owner, the autonomous audit plugin).

## 6. Driving Studio and the web app

- **Studio.**
  - File > New opens a new process, and the plugin loads there. Ignore auto-recovery.
  - Apple panel steps:
    1. Pairing field (156,354) ×2, type the code, then Connect (156,398).
    2. Port (156,432): `63747`.
    3. Key (156,474): `library-only-placeholder-key-0000000000`.
    4. Connect library (156,517). Clicking it again disconnects.
    5. Enable edits (156,612) ×2.
  - The command bar runs with ⌘↩. The Stop button for a test run is at the top left (≈119,38 in a full window capture).
- **Web (Chrome).**
  - Token: `JSON.parse(localStorage['sb-npqvyijsvzkuwddyhtpm-auth-token']).access_token` (never print it).
  - Send a message: the textarea value setter + `form.requestSubmit()`.
  - Live events: `wss://<host>/api/projects/<id>/ws` with protocols `golem.v1`, `golem.jwt.<token>`.
  - Also: `GET …/studio/diagnostics`, `POST …/stop`, `POST …/pairing`.
  - Keep each JS evaluation under about 35 s.
