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
- Capacity: `BILLABLE_NEURONS_PER_DAY` 90k + 10k free (~$0.99/day). One full game build costs 30-40k
  neurons, so a day fits about 2-3 builds. It ran out 2026-09-29 ~03:00Z. Raising it is the owner's
  spending decision (not taken).
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
