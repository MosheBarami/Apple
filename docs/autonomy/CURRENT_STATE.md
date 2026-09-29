# CURRENT STATE — V3 baseline (measured 2026-09-28)

Scope: owner V3 (`docs/autonomy/v3/`), contract `ACCEPTANCE.json` G01–G16. V3 readiness is
**unmeasured**: every gate is `not_evaluated`. The pre-V3 state file is `archive/pre-v3/CURRENT_STATE.md`
(historical, not current proof).

## Live V3 evidence (2026-09-29, production `apple.moshe-barami111.workers.dev`)

- Deployed through 1e753d85 (worker + static, verified serving). Remote renamed to `MosheBarami/Apple`.
- G01: real GLM 5.3 Flash (`@cf/zai-org/glm-5.3-flash`, features `apple:step:high/low`) built a
  spawn pad in Studio. Memory summaries use `@cf/qwen/qwen3-30b-a3b-fp8` (not game-building; flag in G16 audit).
- G03: unpaired composer locked; pairing unlocks; disconnect mid-run pauses ("Paused: Roblox Studio
  disconnected… press Continue"); reconnect offers Continue with no duplicated mutations. Wrong-place
  refusal needs two published place ids (unsaved places are id 0 → `unverified`), so it is unit-tested only.
- G10: steer applied at a later step (Neon); Stop online refunded 21 credits; Stop with a dead socket
  ended the run ("Stopped.") and relocked the composer. Steer messages now keep their position after a
  history reload (989e7dc1).
- Owner direction 2026-09-29: no per-turn "Details" (removed, d2c17f77); bright colourful STUDDED is the
  default look (prompt + scene kits, d2c17f77) and the default UI theme (composer chip, 7ffa6ccb).
- G11 (2026-09-29, plugin 01c91e39 installed locally, Candy Garden v2 in Studio): checkpoint adebac49
  (306 instances, 6 scripts, 7 preserved engine objects); deleted a Lamp and Flower 3 (Workspace 59 → 41
  descendants); restore without edit consent is refused (409, "Enable edits…"); with edits allowed it
  returned 200, 304 instances / 6 of 6 scripts / 0 failed instances, scripts, properties. The Workspace
  signature after restore equals the one before (59 descendants, same children and counts, both Lamps'
  PrimaryPart = Smooth Block Model #1, 8 SpecialMeshes, CurrentCamera Workspace.Camera). A failed restore
  is rolled back as one ChangeHistory cancel. Found and fixed on the way (plugin, each with a failing spec
  first): a child named like a property (a lamp's "Texture") was captured as the property (f57aa293);
  links to same-named siblings resolved to the first one (1fcb0682); TextX/YAlignment, ButtonStyle,
  FrameStyle enums were refused (a94d5392); engine `RBX…` attributes could not be written back (01c91e39).
- G15 (2026-09-29): Generate Branding proven live on Candy Garden v2 (`evidence/20260929-g15-branding`).
- G12 vs owner direction: the evidence renderers (Reasoning, Tool, Plan, Chain of Thought, Agent, Checkpoint, …)
  were mounted only through the per-turn Details disclosure the owner removed (d2c17f77). They stay built and
  tested but unmounted; G12's "technical details accessible" clause is an owner override for the G16 audit.
- Tests 2026-09-29 (5f4e7881, deployed): worker 4332/0 in the checkout, 4328/2 on clean HEAD (the two MCP /
  phase classification checks are satisfied only by uncommitted foreign WIP in `mcp.ts` and
  `packages/shared/src/index.ts`); plugin 71/0; web 2448/0. The art-direction brief now leads with the
  studded default and still follows a named look (all genres, 7238774a).
- Q19 (f806a876): library models insert directly, no "choose the model" interrupt.
- Cost: an obby took ~170 credits over 30 steps (one tool per step, ~37-45k input tokens per step,
  first-step latency ~36-62 s). Prompt now asks for up to 4 calls per step (1e753d85).
- Candy Garden (Grow-a-Garden family, prompt "Make a Grow a Garden style game where everything is candy…"):
  - v1 (project b5c96da6, run 2b637c06): done, 205 steps, ~1,049 credits; working shop/plant/harvest, but
    realistic Terrain grass. The prompt now makes the ground studded Plastic slabs.
  - v2 (project 2b3cbdae, studded, UI Studded): three runs, ~1,790 credits kept. Run 1 ended incomplete
    after ~60 min on the "changed the same thing" stop. Run 2 ended on the "repeating a step" stop.
    Run 3 hit the daily capacity after 23 steps and was refunded.
  - Playtest after run 2: studded ground/UI; one panel at a time; buy 20→10, plant, ~30 s grow,
    harvest →35. Still wrong: "Harvest" is shown while growing, locked seeds have no price (so they
    cannot be unlocked), icons are placeholder letters, and the My Plot button covers the shop close button.
    Save/rejoin is not proven (coins reset in Studio).
  - G13 on v2: scripts contain no HttpService/http/Apple references; with Apple disconnected the loop
    plays (buy, plant, grow, harvest).
  - Fixed on the way: a run that recovered from a refusal no longer ends with the refusal heading
    (f6c4c84d). An incomplete run that built things no longer says "I did not change anything" (ef42a53f).
  - Why runs 1-2 stopped (fixed 2026-09-29, deployed 9c776d41; plugin fix installed locally only):
    - An owner component brought a ThumbnailCamera and two library models brought 8 SpecialMeshes,
      after which every checkpoint was refused, and with it every `run_and_check` playtest. The plugin
      now holds both as detached copies, like MeshPart (00807fb7).
    - `play_check_ui` refused pressing Slot1 twice (plant, then harvest); presses are ordered steps now (9c776d41).
    - The retune stop counted every edit of the client script across the whole build; it now counts
      changes in a row to one target (140eba76).
- Capacity: owner decision 2026-09-29 "No Apple cap": `BILLABLE_NEURONS_PER_DAY` 1e9 / month 3e10
  (de1117b8, deployed). Only `MAX_NEURONS_PER_REQUEST` still bounds a single request.
- Owner library (c6f74af4, deployed; plugin installed locally): 437 uploaded games/models cataloged by
  `packages/owner-corpus/library_catalog.py` (9.9M instances, 203,782 scripts) into
  `~/Library/Application Support/Apple/owner-library/`. The loopback gateway serves `/v1/library*` (no key);
  the agent has `browse_owner_library`, `import_owner_library` and `recreate_owner_game` (whole services with
  scripts, Lighting/Gravity). Terrain voxels are not copied; Terrain's children are (cb256bc6).
- Recreate grow_a_garden live (2026-09-29, project 6de01410): each slot replaces what the template held (cb256bc6), so no
  grey Baseplate/SpawnLocation is left; the original farm, NPCs, sky and UI (SEEDS/GARDEN/SELL, Shop, VIP) appear. Two agent
  defects found and fixed: after the import it renamed originals (Farm → Grow_a_Garden_Map), which breaks scripts that find
  them by name — a run that recreated a game now refuses rename/move/group/ungroup (856b0933); and the HUD gate counted only
  generated UI, so it forced insert_ui_component buttons over the original — the original UI now satisfies it (ffb587db).
  project_census counts up to 200k instances (was 4,800; plugin 856b0933, installed locally). Still open: the protective
  checkpoint refuses a place this large, so run_and_check is refused (play_check works); the original Init waits on DataStores
  until the place is published with Studio API access (owner action). Third defect (f0cbf825): after the verified recreate
  the part steer read "map, UI, scripts, sounds and lighting" as unbuilt parts and, with rename/move fenced, the model
  created Grow_A_Garden_Map/_Sounds/_Lighting folders; a recreate run now owes no named parts.
- Owner-blocked: G02/G06 need a second approved account (agents may not create accounts);
  G05 library publish needs the owner's `APPLE_OWNER_JWT`.

## Repository and production (FACT)

- Checkout `/Users/moshe/Developer/RbxAI`, branch `main`, remote `github.com/MosheBarami/apple`.
  2026-09-29: moved out of iCloud-synced `~/Desktop/RbxAI` (iCloud had evicted ~95k repo files and
  the account quota is full, so git and tests hung). The Desktop copy is kept until its evicted bulk
  data (`packages/corpus/raw`, `packages/training`, `packages/asset-library` stores) finishes
  downloading; the list is in `.git/desktop-evicted-files.txt`.
- Working tree: 329 dirty paths inherited from the Codex continuation (tracked edits across worker, web,
  plugin, training, infra; untracked `packages/owner-corpus/`, evidence, LoRA configs). Archived before
  any V3 change: `.autonomy/backups/codex-wip-2026-09-28/` (tracked.patch, untracked.tgz, HEAD).
- Production `/api/health` 2026-09-28 14:48Z: `buildSha fcdd423-dirty` — that SHA is not in this
  checkout's history (deployed from elsewhere or from uncommitted state).
- No training process is running; `packages/training/OWNER_DISABLED.json` (2026-09-26) blocks
  `train-forever.mjs`. No project launch agent remains (the local Jev server and its code were removed 2026-09-29).
- The local owner-corpus gateway (`packages/owner-corpus/gateway.py`) is running on the owner's Mac.
- Codex desktop app is open but has written nothing in the repo in the last 2 hours.

## Engine (FACT, measured 2026-09-28 — `evidence/20260928-v3-engine/probe-output.txt`)

- `@cf/zai-org/glm-5.3-flash` on the owner's account: HTTP 200 in 2.7 s, 84 tokens, 3.18 neurons.
  Note: with `max_tokens` 64 the whole budget went to `reasoning_content` and `content` was empty —
  callers must budget for reasoning or disable it.
- `typesafe/jev`: HTTP 402 "Insufficient balance; add money to your gateway or use BYOK". The owner then
  dropped Jev entirely (D-V3-2); routing stays deterministic + GLM.

## Requirement-to-code map (Stage 0 deliverable; file refs as of 2026-09-28)

| V3 item | Current code | Verdict |
|---|---|---|
| Single engine | `gateway.ts:113-125` already GLM 5.3 Flash for plan/agent/vision; but `shared/src/models.ts:38` exposes `apple`, `apple-max`, `gemini-3.8-flash`, `gpt-5.6`, `gpt-5.6-luna` with free/pro/max tiers; `providers/workers-ai.ts:34` stale `APPLE_MODEL_ID` qwen3; LoRA lab lanes `gateway.ts:121-122` | adapt: one `Apple vX`, keep wire ids via compat bridge |
| Jev | only `scripts/apple-os/route.mjs` (owner's local Apple-OS tool); nothing in the Worker | dropped by owner (D-V3-2): nothing to build |
| Modes | `ProductMode`/`autonomous` in `shared/src/index.ts:695,760,772,1291,1748,1803`; worker `session.ts:2836`, `router.ts:150`, `prompts.ts:494`; web `composer.tsx:159-163,977-996`, `workspace.tsx`, `usage.tsx`; site `docs/modes.astro`; `messages.mode` column | remove from UI/site; adapt to internal stages |
| Training | `packages/training` (workspace member, CI runs its tests), dashboard LoRA pages, LoRA lanes | remove from active product; archive |
| Studio gate | composer disabled only on socket/permission (`workspace.tsx:1176`); server `chat` never checks Studio (`session.ts:2827-2891`); wrong place only per op (`:5755`) | adapt: UI lock + server refusal |
| Stop | never disabled (`composer.tsx:1108`), socket + HTTP; HTTP ack = request received, not run ended | adapt: real completion ack |
| Pause/Continue/steering | missing: run continues on Studio drop (`session.ts:4380`); mid-run messages refused (`:3110`) | build |
| Checkpoints | exist (`session.ts:789,3367,3037,2353`, `turn-checkpoint.tsx`) | keep; verify restore (G11) |
| 23 UI components | vendored ai-elements: Reasoning, Shimmer, Sources, Suggestion, Task, Prompt Input, Attachments, Message, Conversation, Code Block, Snippet, File Tree used; Tool, Chain of Thought present unused; Plan/Confirmation/Checkpoint/Image local; Inline Citation, Context, Agent, Image absent; AICSS Data Table in admin only, Streaming Text removed | adapt + add missing |
| Generate Branding | absent; `imagegen.ts:196,242` refuses logos/brand marks | build (composition-based per V3 §7) |
| Catalog handoff | gateway `/v1/native-readiness` returns `rows[].readiness.{…}` (203 artifacts); recorded mismatch: consumer expected flat flags (`docs/evidence/owner-corpus-20260926/native-readiness-integration-discrepancy.json`); **no consumer in `apps/apple-plugin/src`** — only in unmerged worktree `/private/tmp/apple-thirdparty-dashboard` | adapt |
| Cloud delivery | none: no worker owner-corpus route; R2 has only `MEDIA` | build (G06) |
| Theme cartoony/studded/none | absent (12 genre UI themes in `ui-kit-themes.ts`) | build |
| English only | 9 reply languages (`preferences.ts:97,702`); Hebrew intent matching `artifact-completion.ts:8-12`; Hebrew fixtures `studio-preview.tsx` | adapt |

## Open findings carried into V3

F-059 (garden visual quality far below reference), F-064 (runs end with planned parts unbuilt) — both
high, both relevant to G07.
