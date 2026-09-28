# CURRENT STATE — V3 baseline (measured 2026-09-28)

Scope: owner V3 (`docs/autonomy/v3/`), contract `ACCEPTANCE.json` G01–G16. V3 readiness is
**unmeasured**: every gate is `not_evaluated`. The pre-V3 state file is `archive/pre-v3/CURRENT_STATE.md`
(historical, not current proof).

## Repository and production (FACT)

- Checkout `/Users/moshe/Desktop/RbxAI`, branch `main`, remote `github.com/MosheBarami/apple`.
- Working tree: 329 dirty paths inherited from the Codex continuation (tracked edits across worker, web,
  plugin, training, infra; untracked `packages/owner-corpus/`, evidence, LoRA configs). Archived before
  any V3 change: `.autonomy/backups/codex-wip-2026-09-28/` (tracked.patch, untracked.tgz, HEAD).
- Production `/api/health` 2026-09-28 14:48Z: `buildSha fcdd423-dirty` — that SHA is not in this
  checkout's history (deployed from elsewhere or from uncommitted state).
- No training process is running; `packages/training/OWNER_DISABLED.json` (2026-09-26) blocks
  `train-forever.mjs`. The only project launch agent is `com.moshe.apple-os.open-jev` (local Jev server).
- The local owner-corpus gateway (`packages/owner-corpus/gateway.py`) is running on the owner's Mac.
- Codex desktop app is open but has written nothing in the repo in the last 2 hours.

## Engine (FACT, measured 2026-09-28 — `evidence/20260928-v3-engine/probe-output.txt`)

- `@cf/zai-org/glm-5.3-flash` on the owner's account: HTTP 200 in 2.7 s, 84 tokens, 3.18 neurons.
  Note: with `max_tokens` 64 the whole budget went to `reasoning_content` and `content` was empty —
  callers must budget for reasoning or disable it.
- `typesafe/jev`: HTTP 402 "Insufficient balance; add money to your gateway or use BYOK" → OWNER_QUEUE
  Q-025. Must stay optional with deterministic fallback.

## Requirement-to-code map (Stage 0 deliverable; file refs as of 2026-09-28)

| V3 item | Current code | Verdict |
|---|---|---|
| Single engine | `gateway.ts:113-125` already GLM 5.3 Flash for plan/agent/vision; but `shared/src/models.ts:38` exposes `apple`, `apple-max`, `gemini-3.8-flash`, `gpt-5.6`, `gpt-5.6-luna` with free/pro/max tiers; `providers/workers-ai.ts:34` stale `APPLE_MODEL_ID` qwen3; LoRA lab lanes `gateway.ts:121-122` | adapt: one `Apple vX`, keep wire ids via compat bridge |
| Jev | only `scripts/apple-os/route.mjs` (owner tool); nothing in the Worker | adapt: bounded backend router + fallback |
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
