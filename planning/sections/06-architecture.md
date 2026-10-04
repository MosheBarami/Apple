# 6. Architecture and technology inventory

**Scope of this section.** It describes the system as it is on the branch `research-feed` (worktree `/Users/moshe/Developer/RbxAI-feed`, HEAD `2ffd22db`), and says where `main` (`/Users/moshe/Developer/RbxAI`, HEAD `f8991a96`) differs. Every fact is followed by the path it came from. Numbers that I counted myself say how I counted them. I did not run builds or tests, so test and file counts are static counts of declarations, not pass/fail results.

## 6.0 How `research-feed` relates to `main`

| Item | Fact | Source |
|---|---|---|
| Two separate git object stores | The `research-feed` worktree belongs to the repo at `/Users/moshe/Developer/RbxAI-rename/.git`, not to `/Users/moshe/Developer/RbxAI/.git`. `main`'s HEAD `f8991a96` exists inside the feed repo as an ancestor, but the feed's commit `2ffd22db` does not exist in the `main` repo. | `git rev-parse --git-common-dir` in `/Users/moshe/Developer/RbxAI-feed`; `git cat-file -t 2ffd22db` fails in `/Users/moshe/Developer/RbxAI` |
| Distance | `research-feed` is 163 commits ahead of `f8991a96` and 0 behind. The diff is 810 files, +65,358 / -10,799 lines. 149 of those files are under `apps/worker/src`. | `git rev-list --count f8991a96..research-feed`; `git diff --stat f8991a96 research-feed` |
| New worker modules on feed (36) | The whole self-check stack (`self-check.ts`, `self-check-run.ts`, `look-gate.ts`, `look-observe.ts`, `look-tool.ts`, `studio-look.ts`, `evidence-ledger.ts`, `claim-audit.ts`, `claim-audit-judge.ts`, `blind-critique.ts`, `judge-gate.ts`, `world-pass.ts`, `world-steps.ts`, `skill-push.ts`, `scene-flags.ts`, `scene-flags-run.ts`), plus `behaviour-*.ts`, `dress-object.ts`, `model-anatomy.ts`, `model-geometry.ts`, `dup-names.ts`, `placement.ts`, `local-space.ts`, `terrain-path.ts`, `library-run.ts`, `creator-store-live.ts`, `compose-lane.ts`, `project-state.ts`, `trace-entry.ts`, `ui-icons.ts`, `ui-layout.ts`, `build-ledger.ts`, `created-paths.ts`, `colour-family.ts`. None of the self-check files exist on `main`. | `git diff --name-status f8991a96 research-feed -- apps/worker/src`; `ls /Users/moshe/Developer/RbxAI/apps/worker/src` |
| Tool registry | feed 122 tools; `main` 118. Feed adds `look`, `dress_object`, `add_behaviour`, `model_anatomy`, `preview_library_models`. `main` has one tool feed lacks: `cool_library_model` (a tool that put "a chef hat on a pizza" style subjects into code; replaced on feed by the general `dress_object`). | text scan of `export const TOOLS` in `apps/worker/src/tools.ts` on both trees |
| Plugin | feed `PLUGIN_VERSION = "1.5.0"`; `main` `"1.4.3"`. The store build is 1.0.0 (`LATEST_PLUGIN_VERSION = '1.0.0'`). Neither 1.4.3 nor 1.5.0 is published. | `apps/apple-plugin/src/Bridge.luau`; `apps/worker/src/plugin-version.ts` |
| File sizes | `session.ts` 7,790 lines (main 7,482); `tools.ts` 6,934 (main 5,945); `index.ts` 7,409 (main 7,398); `Commands.luau` 5,665 (main 5,404). | `wc -l` in both trees |
| Packages | feed has `packages/owner-classify` (tracked, Python). `main` has `packages/owner-corpus` (the gateway, untracked and git-ignored, see 6.6.4). Feed does not contain `owner-corpus`. | `ls packages` in both trees; `.gitignore` line 296 of `/Users/moshe/Developer/RbxAI/.gitignore` |
| Uncommitted state on `main` | modified `.claude/launch.json`, `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md`, `CLAUDE.md`; deleted `HANDOFF.md`; untracked `GOAL.md`, `planning/`, `research/`. | `git status` snapshot in the session header |

Read-me-first for planners: **anything in sections 6.3, 6.4 and 6.5 about the self-check, look gate, blind critique, judge gate, world pass and skill push is feed-only.** `main` still runs the older flow (judge_game, critic, client-judge) without the gate that stops an answer.

---

## 6.1 System diagram in words

Apple is a SaaS whose "frontend of record" is the user's own Roblox Studio. Five runtime pieces and one local helper:

```
 Browser (React SPA at /app) ──WebSocket (subprotocol)──┐
                                                         ▼
 Marketing site (Astro, /) ──served from D1──►  Cloudflare Worker "apple" (Hono, apps/worker/src/index.ts)
                                                  │  │  │  │
                       SessionDO (per project) ◄──┘  │  │  └──► Supabase (auth JWT, project registry, RLS)
                       QuotaDO (per user)  BudgetDO (singleton)  │
                       PairingDO  AdminDO  DiscordDO             ├──► D1 golem-corpus (docs chunks, static site, checkpoints, memory, ...)
                                                                 ├──► KV, Vectorize golem-docs, R2 apple-media
 Studio plugin (Luau) ◄──HTTPS long-poll op queue───────────────┤──► Workers AI (GLM 5.3 Flash) via AI Gateway "golem"
   pairs with 6-char code, runs typed ops                        ├──► Queue apple-notifications, Workflow apple-model-upload
   │                                                             └──► Analytics Engine apple_product_events, Images binding
   └──HTTP──► 127.0.0.1:63747  owner-library gateway (Python, on the owner's Mac only)
```

### 6.1.1 The Worker (`apps/worker`)

- **One Hono app is the whole backend.** `apps/worker/src/index.ts` (7,409 lines) has 211 top-level `app.get/post/put/patch/delete/all/route/use` calls. Route families by prefix (my count of `app.<verb>('/...')` literals): `/api/projects` 43, `/api/admin` 41, `/api/shared` 29, `/api/me` 22, `/api/memory` 10, `/api/billing` 10, `/api/automations` 7, `/v1/projects` 6, `/api/orgs` 5, `/api/keys` 4, `/v1/mcp` 3, `/api/discord` 3, `/api/studio` 2 (`claim`, `poll`), plus `/api/health`, `/api/docs`, `/api/voice`, `/v1/chat`, `/v1/completions`, `/v1/models`, `/v1/openapi.json`. Source: `apps/worker/src/index.ts`.
- **Worker entry** exports `SessionDO` and `ModelUploadWorkflow`, a `scheduled` handler and a `queue` handler. Source: `apps/worker/src/index.ts` lines 334, 341, 7404-7409.
- **File count.** 251 `.ts` files under `apps/worker/src` including `do/` (my `ls`), plus `src/generated/embedding-index.json`, `src/providers/` (6 files) and `src/types/` (3 `.d.ts`). The AGENTS.md figure "137 TypeScript files" is stale (it was measured 2026-09-16). Source: `AGENTS.md` section 3; `ls apps/worker/src`.
- **Two worker deployments share one data plane.** `wrangler.apple.jsonc` (name `apple`) and `wrangler.jsonc` (name `golem`) bind the same D1 database id, KV id, Vectorize index and R2 bucket. Only the Durable Object namespaces differ, which is why the legacy worker `golem` stays deployed (BudgetDO ledger "does not travel"). Source: `apps/worker/wrangler.apple.jsonc` header comment; `apps/worker/wrangler.jsonc`.

### 6.1.2 Durable Objects (all SQLite-backed, migrations v1-v3)

| Class | Instance scope | Job | Source |
|---|---|---|---|
| `SessionDO` | one per project | browser WebSocket (hibernating: `webSocketMessage`, `webSocketClose`), the plugin's long-poll op queue (`handlePluginPoll`), checkpoints, collaboration presence, and the alarm-driven agent loop (`alarm()` -> `runStep()`) | `apps/worker/src/do/session.ts` |
| `QuotaDO` | one per user | authoritative Credits ledger with daily UTC reset; also reconciles billing authority mutations; apple binds a second handle `LEGACY_QUOTA_DO` to golem's namespace for the migration | `apps/worker/src/do/quota.ts`; `wrangler.apple.jsonc` |
| `BudgetDO` | singleton | the one place that decides whether any inference may run: reserve neurons before a call, settle actuals after, kill switch, daily/monthly ceilings, third-party USD ledger | `apps/worker/src/do/budget.ts` |
| `PairingDO` | singleton | 10-minute pairing codes, 6 characters from a 31-letter alphabet (no I, L, O, 0, 1), drawn without modulo bias; `/api/studio/claim` is unauthenticated, so the code is the credential | `apps/worker/src/do/pairing.ts` |
| `AdminDO` | singleton | operational counters (no PII) and the durable analytics event log (events table, row and age retention) | `apps/worker/src/do/admin.ts` |
| `DiscordDO` | singleton | which Discord user may spend which Apple account (code minted by the signed-in side, redeemed in Discord), rate limits, progress pusher | `apps/worker/src/do/discord.ts` |

`apps/worker/src/do/collab-store.ts` (559 lines) is not a Durable Object class; it is the SQLite store for collaboration threads and versions that `SessionDO` uses. Source: its header comment.

Wrangler migrations: `v1` creates SessionDO, QuotaDO, PairingDO, AdminDO; `v2` BudgetDO; `v3` DiscordDO. Source: `apps/worker/wrangler.apple.jsonc` `migrations`.

### 6.1.3 Cloudflare bindings (from `wrangler.apple.jsonc`; `wrangler.jsonc` carries the first four only)

| Binding | Resource | Used for | Source |
|---|---|---|---|
| `AI` | Workers AI | all inference (GLM 5.3 Flash, Qwen3 30B memory model, BGE embeddings, Flux image, Whisper/MeloTTS speech) through AI Gateway id `golem` (var `AI_GATEWAY_ID`) | `wrangler.apple.jsonc`; `apps/worker/src/gateway.ts`; `speech.ts`; `imagegen.ts` |
| `CORPUS` | D1 `golem-corpus`, id `32c9471e-a7d7-49ee-a8fe-0a7def2c68bd`, about 1.26 GB on 2026-10-02 | docs chunks and FTS, the static site and SPA (`static_assets`, `static_chunks`), checkpoints, memory entries, notifications, billing events, generated-image index, owner-corpus component index, collab tables, and more | `wrangler.apple.jsonc`; `docs/operations/GOLEM-REMOVAL-RUNBOOK.md` section 0 |
| `KV` | KV namespace id `cc341a7db4d748139f161fdc292e6e84` (`golem-kv`) | config such as `config:models`, small state | `wrangler.apple.jsonc`; `gateway.ts` |
| `VEC` | Vectorize index `golem-docs` (384-dim cosine, about 4,350 vectors when last measured) | Roblox docs retrieval (`search_docs`) | `wrangler.apple.jsonc`; `rag.ts`; runbook section 0 |
| `MEDIA` | R2 bucket `apple-media` | generated images, generated audio, chat attachments keyed `<kind>/<projectId>/<id>`; optional in code (`mediaStore()` returns null if unbound) | `wrangler.apple.jsonc`; `env.ts`; `AGENTS.md` section 4 |
| `PRODUCT_EVENTS` | Analytics Engine dataset `apple_product_events` | product events, no person in them (apple only) | `wrangler.apple.jsonc`; `analytics-engine.ts` |
| `NOTIFY_QUEUE` | Queue `apple-notifications`, producer and consumer on the same worker (batch 10, timeout 2 s, 6 retries) | notifications written by a queue consumer (apple only) | `wrangler.apple.jsonc`; `notify-queue.ts` |
| `MODEL_UPLOAD_WORKFLOW` | Workflow `apple-model-upload`, class `ModelUploadWorkflow` | finishes a slow 3D model upload and notifies (apple only) | `wrangler.apple.jsonc`; `model-upload-workflow.ts` |
| `IMAGES` | Cloudflare Images binding | display-sized WebP copies of generated images (apple only) | `wrangler.apple.jsonc`; `image-resize.ts` |
| Cron | `* * * * *` on apple (drains the membership-access outbox); golem has `* * * * *` and `0 3 * * *` (nightly retention sweeps) | outbox drain and retention | `wrangler.apple.jsonc` `triggers`; `wrangler.jsonc` `triggers`; `index.ts` `runScheduled` |
| Observability | logs on; traces on, `head_sampling_rate` 0.05 | which step of a build broke (GLM call, Vectorize, D1, DO hops) | `wrangler.apple.jsonc` |

Notable vars on apple: `SELF_CHECK: "on"` (production since 2026-10-04), `BILLING_WORKER_NAME: "apple"`, `BILLING_TEST_ADMINS` (Stripe test mode limited to the owner's email), `MEMBERSHIP_OUTBOX_CONSUMER: "apple"`, a committed `BUILD_SHA: "616d84b"` that `deploy-worker.mjs` overrides at deploy time. Source: `apps/worker/wrangler.apple.jsonc` `vars`. Vars that differ between the two configs: golem sets `ROBLOX_CREATOR_USER_ID`, apple does not; apple sets `SELF_CHECK`, `BILLING_TEST_ADMINS`, `CF_ACCOUNT_ID`, golem does not. Source: both wrangler files.

### 6.1.4 Supabase

- **What lives there:** auth (JWT `sub` is the user id), the project registry and everything the web dashboard lists, with row-level security on every table. The worker forwards the caller's own JWT to PostgREST, so "RLS is the thing deciding, not the worker". Source: `AGENTS.md` section 4; `apps/worker/src/supa.ts`.
- **Public Supabase project URL** `https://npqvyijsvzkuwddyhtpm.supabase.co` and the publishable anon key are in `wrangler*.jsonc` `vars`. Source: `apps/worker/wrangler.apple.jsonc`.
- **Tables created by the 13 migrations:** `profiles`, `projects`, `messages`, `checkpoints`, `usage_events`, `feedback`, `studio_pairings`, `waitlist`, `membership_events`, `project_members`, `membership_outbox_consumers`, `membership_outbox_secret`, `membership_access_state`, `membership_access_outbox`. Migrations: `0001_init` ... `0013_product_modes_only`. Source: `infra/supabase/migrations/*.sql`.
- **Migrations are applied by hand** (`infra/supabase/migrate.mjs`); two once sat unapplied while dependent code shipped. Source: `AGENTS.md` section 4.
- **Tests** against a real Postgres: `rls-isolation.mjs` (192 lines), `schema-hardening.mjs` (668), `membership-access-outbox.mjs` (266), `migration-ledger-security.mjs` (171), `export-completeness.mjs` (130). Source: `infra/supabase/tests/`.
- **Membership outbox pattern:** Supabase writes an access change to an outbox, a worker cron every minute drains a bounded batch and each worker acknowledges only its own consumer row (`golem` or `apple`). Source: `apps/worker/src/membership-access-outbox.ts`; `wrangler.jsonc` comment.
- The repo root also has an empty `/supabase` directory (placeholder). Source: `ls supabase` is empty in `/Users/moshe/Developer/RbxAI-feed`.

### 6.1.5 Web SPA (`apps/web`)

- React 19, Vite 6, Tailwind 4, react-router-dom 7 with `basename="/app"`, TanStack Query, `@supabase/supabase-js`, Vercel `ai` v6 plus Streamdown and an `ai-elements` component set, `@xyflow/react`, shiki, katex. Source: `apps/web/package.json`; `apps/web/src/app.tsx`.
- **Routes:** `/login`, `/signup`, `/forgot`, `/recovery`, `/reset`, `/confirm`, `/` (dashboard), `/projects/:id` (the workspace), `/projects/:id/roadmap`, `/projects/:id/branding`, `/join`, `/usage`, `/settings`, `/admin` (is_admin only), `/ui-lab` (dev specimen book), `*` not found. Source: `apps/web/src/app.tsx`.
- **Workspace internals:** `apps/web/src/components/ws/` holds the chat turn, thinking card, composer, panels (credits, memory, files, members, automations, search), evidence panels and the tool vocabulary (`tool-vocabulary.ts`, `op-vocabulary.ts`). The WebSocket client is `apps/web/src/lib/use-project-socket.ts` (1,350 lines). Source: those paths.
- **Size:** 333 `.ts/.tsx` files in `apps/web/src`; 221 test files; biggest sources `routes/settings.tsx` 2,677 lines, `lib/api.ts` 2,356, `routes/workspace.tsx` 1,397. Source: `find`/`wc -l`.
- **CI gates specific to it:** bundle budget (`scripts/check-app-bundle.mjs`), unstyled classes, copy check. Source: `.github/workflows/ci.yml`.

### 6.1.6 Marketing site (`apps/site`)

- Astro 7, `@astrojs/sitemap`; pages `index`, `pricing`, `models`, `proof`, `status`, `changelog`, `discord`, `privacy`, `terms`, `404`, and a docs tree (`getting-started`, `connect`, `plugin`, `credits-and-limits`, `billing`, `build-from-source`, `faq`, `troubleshooting`, `privacy-and-data`). Source: `apps/site/src/pages/`.
- **Stored in D1 and served by the worker.** `apps/worker/src/static.ts` serves `static_assets`/`static_chunks` rows with edge caching; the stated reason is that the deploy channel "cannot use Workers static assets". The SPA is stored the same way. Source: `apps/worker/src/static.ts` header; `infra/deploy-static.mjs`.
- 50 test files, about 255 test declarations, including pixel tests that decode a rendered page in Chromium. Source: `apps/site/tests/`; `.github/workflows/ci.yml`.

### 6.1.7 Studio plugin (`apps/apple-plugin`, Luau)

- **Pairing:** the person types a 6-character code (from `PairingDO`) into the plugin dock; the plugin claims it at `https://apple.moshe-barami111.workers.dev/api/studio/claim` and receives a token (client TTL 30 days). The credential lives only in the current Lua state; there is no persisted session. Source: `apps/apple-plugin/src/Bridge.luau`; `apps/worker/src/do/session.ts` `PLUGIN_TOKEN_TTL_MS`.
- **Transport:** HTTPS long poll to `/api/studio/poll`; the worker hands out at most 10 ops per poll (`MAX_BATCH = 10`); plugin keeps a bounded result queue (64), replay table (256) and event queue (64). Poll hold times in the DO: 4 s active, 6 s warm, idle after 180 s. Source: `Bridge.luau`; `session.ts` constants `POLL_HOLD_ACTIVE_MS`, `POLL_HOLD_WARM_MS`, `POLL_IDLE_AFTER_MS`.
- **Typed ops, not code:** the worker sends typed ops (the `StudioOp` union has 58 explicit members: `get_tree`, `create_instances`, `set_props`, `run_code`, `play_check`, `render_view`, `snapshot`/`restore`, `import_owner_library`, `query_owner_local`, `place_copies`, `rig_model`, `terrain_read`, `ui_layout_check`, `preload_content`, and so on). Source: `packages/shared/src/index.ts` lines 53-420 (my count of `| { op: '...'` members).
- **Allowlists in `src/Commands.luau` (5,665 lines):** every class and property an op may write must appear as an `X = true,` line. The tables are `READ_SERVICES`, `PLACE_SERVICES`, `SCRIPT_SERVICES`, `CREATE_CLASSES`, `DELETE_ONLY_CLASSES`, `HELD_CLASSES`, `SCRIPT_CLASSES`, `PROTECTED_CONTAINER_CLASSES`, `PROPERTY_ALLOW`, `READ_PROPERTIES`, `CONTENT_PROPERTY`, `ENUM_ALLOW`, `INSTANCE_REF_PROPERTY`. Approximate sizes by my count of `= true` entries: `CREATE_CLASSES` about 113, `PROPERTY_ALLOW` about 335, `READ_PROPERTIES` about 327, `ENUM_ALLOW` about 52. Anything else is refused at runtime. Source: `apps/apple-plugin/src/Commands.luau` (table headings at lines 55, 73, 93, 108, 255, 268, 284, 315, 323, 669, 1007, 1057, 1114).
- **Op families** live in `src/ops/` because `Commands.luau` is "at the edge of Luau's 200-local limit"; they join the allowlists through `OP_FAMILIES.install`. Families: `Query`, `Physics`, `Terrain`, `Rig`, `Ui`, `Fx`, `Content`, `OwnerCorpus`, `LocalOwnerCorpus`, `Compose`, `Surface`, `Joints`, `Upright`. Each loads in its own `pcall`; a family that fails to load reports no ops and the worker offers a family op only when the plugin reports it supported. Source: `apps/apple-plugin/src/ops/init.luau`; `Commands.luau` line 5269.
- **Edit consent** is Apple's own gate (not a Studio setting): writes are refused until the person presses "Enable edits..." and "Allow edits for this connection". Source: `Commands.luau` lines 5465, 5479.
- **Other source files:** `Bridge.luau` 867, `GenerationService.luau` 468, `PlayCheck.luau` 1,025, `Render.luau` 502 (software renderer), `StudioCapture.luau` 259, `init.server.luau` 516. Total Luau in the plugin about 12,400 lines. Source: `wc -l apps/apple-plugin/src/*.luau apps/apple-plugin/src/ops/*`.
- **Version and release state:** source 1.5.0 on feed (changelog comments in `Bridge.luau` 1.1.0 ... 1.5.0). The Creator Store build "Apple Studio" (asset 107230158271368) is 1.0.0 "by inference" and the worker's `LATEST_PLUGIN_VERSION` is `'1.0.0'`. Publishing is a manual human step. Source: `Bridge.luau`; `apps/worker/src/plugin-version.ts`; `AGENTS.md` section 3; `.github/workflows/plugin-release.yml`.
- **Build:** `node apps/apple-plugin/scripts/build.mjs` parses with `luau-analyze`, refuses unbundled requires, builds with Rojo 7.7.0 into `release/apple-studio.rbxm`, secret-scans the artifact, and reads the built bytes for every claimed capability (`verify-artifact.py`). Source: `.github/workflows/ci.yml` job `plugin`.
- **Legacy `apps/plugin`:** test fixtures only (not built or shipped; its Creator Store asset 132128477945417 was removed). It still contains `globalTypes.d.luau` (17,286 lines, the largest file in the repo) and 11 Luau specs. Source: `AGENTS.md` section 3; `find apps -name '*.spec.luau'`.
- **Tests:** 24 test files in `apps/apple-plugin/tests` (about 79 declarations) plus Studio-engine proof builds (`build:engine-proof`, `build:generation-proof`, `build:restore-proof`). Source: `apps/apple-plugin/package.json`.

### 6.1.8 The owner-library gateway on the owner's Mac

- A Python server (`packages/owner-corpus/gateway.py`) listens on `127.0.0.1:63747` (loopback only), started by a macOS LaunchAgent `com.moshe.apple.owner-gateway` through `start-gateway.sh`, with a cache at `~/Library/Application Support/Apple/owner-gateway-cache`. Source: `/Users/moshe/Developer/RbxAI/packages/owner-corpus/start-gateway.sh` (main checkout only).
- The Studio plugin, not the worker, reaches it: `LocalOwnerCorpus.luau` calls `http://127.0.0.1:63747/...` with an ephemeral loopback credential "that never leaves Studio"; the cloud ops carry only IDs and cursors. The dock tells the user "Your owner library connects by itself while Apple is paired (the library server on this Mac, port 63747)". Source: `apps/apple-plugin/src/ops/LocalOwnerCorpus.luau` lines 1, 69, 431-451; `apps/apple-plugin/src/init.server.luau` lines 247, 284.
- It does not exist in CI or the cloud, so owner-library tools only work on that one Mac. Source: `CLAUDE.md` "Owner library".
- `packages/owner-classify` (tracked on feed) classifies and indexes the library into a sidecar under `~/Library/Application Support/Apple/owner-classify/` (SQLite FTS5 BM25 with colour/size facets, optional dense MiniLM tier), and exposes `GET /v1/library/find` through a patch to `gateway_library.py`. Source: `packages/owner-classify/README.md`.

### 6.1.9 Packages and tools

| Package / tool | What it is | Evidence |
|---|---|---|
| `packages/shared` (`@apple/shared`) | the wire contract: `StudioOp`, `ClientMsg`/`ServerMsg`, plan limits (`PLAN_LIMITS`), model registry (`models.ts`), legacy wire derivation (`legacy-wire.ts`), attachments, spilled payloads. 3,158 lines in `index.ts`. Published to GitHub Packages with the SDK. | `packages/shared/src/`; `.github/workflows/publish-packages.yml` |
| `packages/corpus` (`@apple/corpus`) | Roblox creator-docs RAG source, skill cards (23), genre references, mechanic library, UI construction references, verified modules, kit pins; 23 research notes `research/01-...23-*.md` (feed-only additions). `data/` 11 MB. Tests: 20 files. | `packages/corpus/data/`, `packages/corpus/research/` |
| `packages/owner-classify` | owner-library classifier and search (see 6.1.8). 0 JS tests; Python `unittest`. | `packages/owner-classify/package.json` |
| `packages/components` (`@apple/components`) | reviewed Luau game components the composers install: `tycoon`, `shop`, `economy`, `machines`, `upgrades`, `waves`, `defenders`, `creatures`, `animate`, `behave` (feed-only), `motion`, `fx`, `gameui`, `boot`. `node scripts/gen-components.mjs` regenerates `apps/worker/src/components.generated.ts` (610 lines). | `packages/components/*/component.json`; `CLAUDE.md` |
| `packages/evals` (`@apple/evals`) | eval and security suites: `security.test.mjs` (3,523 lines, the standing proof of trust boundaries), `owner-bench/` (frozen request bank, `runner.js`, `score.mjs`), `tasks/` (15 JSON task files), `tasks-visual/`, `frontier-studio/`, selftest against real `luau-analyze`. Runners that spend money are never run in CI. | `packages/evals/`; `.github/workflows/ci.yml` header |
| `packages/sdk` (`@apple/sdk`) | public `/v1` clients in JS, TypeScript types, Python, Luau and a CLI (`bin/apple.mjs`). Protocol-parity tests read `packages/shared/src/index.ts`. | `packages/sdk/README.md` |
| `packages/asset-library` | manifests for CC0 UI images, SFX and VFX stores, `ui-components.json`; large stores git-ignored. | `packages/asset-library/`; `.gitignore` |
| `packages/design` (`@apple/design`) | design tokens and the design-rule checker (`rules.mjs` 1,690 lines), "NOT a UI library". | `packages/design/src/` |
| `packages/training` | LoRA/MLX training archive, 2.7 GB on `main`, 66 test files; excluded from the pnpm workspace ("Training and LoRA are cancelled (V3 section 2)"). | `pnpm-workspace.yaml`; `/Users/moshe/Developer/RbxAI/packages/training` |
| `packages/langflow` | flow sync helper with one test. | `packages/langflow/package.json` |
| `tools/repo-chat` | local read-only Next.js chat that answers only about this repo, on `127.0.0.1:4790`; not a workspace member, not deployed; uses OpenRouter via `.env.local`; 96 `.ts/.tsx` files; has its own copy of `prompt-input.tsx` (1,463 lines, same as the web app's). | `tools/repo-chat/README.md`; `find` |
| `apps/benchmark/crystal-canyon` | a benchmark Roblox world with Luau source (largest file `world/Build.luau` 4,727 lines) and 10 Luau specs; the promo code `GOLEM`/`APPLE` is kept as one aliased code. | `apps/benchmark/`; `scripts/golem-allowlist.json` entry `benchmark-code-alias` |
| `apps/experiences` | experience fixtures (workspace member). | `pnpm-workspace.yaml` |

pnpm workspace members: `apps/*`, `apps/benchmark/*`, `apps/experiences/*`, `packages/*` minus `packages/training`. Root `package.json` scripts: `build`, `typecheck`, `test` (runs `scripts/check-workspace-coverage.mjs` then `pnpm -r test`), `e2e` (Playwright), `check:dispositions`, `check:backlog`, `check:pixels`, `brand`. Source: `pnpm-workspace.yaml`; `package.json`.

---

## 6.2 Models and spend control

### 6.2.1 One customer engine, four gateway roles

| Role key | Model id | Output ceiling | Context | Native tools | Effort | Use | Source |
|---|---|---|---|---|---|---|---|
| `agent` | `@cf/zai-org/glm-5.3-flash` | 6,500 tokens | 1,310,720 | yes | low (per-step policy) | every agent step | `apps/worker/src/gateway.ts` `DEFAULT_MODELS` |
| `plan` | same | 6,500 | 1,310,720 | yes | low | legacy persisted runs may carry `plan`; same model | `gateway.ts`; `session.ts` `gatewayModelFor` |
| `vision` | same | 4,000 | 1,310,720 | no | low | `look`, blind critique, image inspection, benchmark judge | `gateway.ts`; `look-observe.ts`; `blind-critique.ts`; `vision.ts` |
| `memory` | `@cf/qwen/qwen3-30b-a3b-fp8` | 800 | 32,768 | no | n/a | memory summaries and the optional claim-audit judge (not game-building) | `gateway.ts`; `claim-audit-judge.ts` |

- **Single engine rule.** `packages/shared/src/models.ts` has a one-row `MODEL_REGISTRY` (id `apple`, provider id `@cf/zai-org/glm-5.3-flash`, `maxNeuronsPerStep: 1200`, `zdr: false`). `normalizeModelId` returns `'apple'` for anything, so old clients and rows are served, never refused. Retired ids kept as a bridge: `apple-max`, `gemini-3.8-flash`, `gpt-5.6`, `gpt-5.6-luna`. Source: `packages/shared/src/models.ts`.
- **No model picker or tier.** Plans differ only in allowance. Source: `packages/shared/src/models.ts` header (V3 gate G01).
- **Other models called outside the chat roles:** embeddings `@cf/baai/bge-small-en-v1.5` (`gateway.ts` line 557) and `bge-m3`; image `@cf/black-forest-labs/flux-1-schnell` (`imagegen.ts`); speech `@cf/openai/whisper-large-v3-turbo` and `@cf/myshell-ai/melotts` (`speech.ts`); a second image model via Hugging Face Z-Image-Turbo (`generate_ui_image_hf`, capped a few calls a day). Source: those files; `tools.ts`.
- **KV override.** `getModels(env)` reads KV key `config:models`, merges it over `DEFAULT_MODELS` (60-second in-isolate cache), validates each entry's shape, and ignores a few known stale ids (`gpt-oss-20b`, `gpt-oss-120b`, `llama-3.2-11b-vision`) for the protected keys so an old production KV value cannot drag users back. Source: `gateway.ts` `getModels`, `configuredModels`, `LEGACY_USER_MODEL_IDS`.
- **Third-party models are classed separately** and limited by dollars (`THIRD_PARTY_USD_PER_DAY = 5`, `THIRD_PARTY_USD_PER_MONTH = 60`), not neurons; an override naming an unpriced model is refused. Source: `apps/worker/src/pricing.ts` lines 208-209, `routeForModelId`.

### 6.2.2 The price guard

- `MODEL_PRICES` is the single table of $/M-token prices (10 rows including `glm-5.3-flash` at $0.15 in, $0.50 out, $0.03 cached in; `qwen3-30b` $0.051/$0.335; BGE rows). Neurons convert at $0.011 per 1,000. Source: `apps/worker/src/pricing.ts`.
- **`UnpricedModelError`:** `neuronsFor(modelId, ...)` throws if the id has no row. The comment says an unknown model used to be priced at the dearest row, "a guess that under-reserves is the one failure this table exists to prevent". Source: `pricing.ts` lines 47-69.
- **Reserve, settle, release.** `chat()` encodes the request, estimates neurons pessimistically (chars/3.5 as input tokens, every output token spent, no cache discount), calls `BudgetDO /reserve`, runs the model, then settles actual usage (with the cached-input discount) or releases the hold on failure. Source: `gateway.ts` `chat`, `reserve`, `settle`, `release`; `pricing.ts` `estimateNeurons`.
- **Per-call neuron cap.** `maxNeuronsPerStepFor(modelId)` returns the registry row's `maxNeuronsPerStep` (1,200 for Apple), else `MAX_NEURONS_PER_REQUEST = 1,200`. `chat()` throws `BudgetError('request_too_large')` above it, and `BudgetDO` applies the same cap one hop later. The code comment says the first check "cannot be falsified behaviourally" and is kept as defence in depth. Source: `pricing.ts` lines 165-174; `gateway.ts`; `do/budget.ts`.
- **Daily/monthly ceilings are effectively removed.** `BILLABLE_NEURONS_PER_DAY = 1,000,000,000` and `BILLABLE_NEURONS_PER_MONTH = 30,000,000,000` ("No Apple cap", owner decision 2026-09-29), so Cloudflare billing is the only real bound besides the per-call cap and per-user Credits. Source: `pricing.ts` lines 100-140.
- **No automatic retries of a failed inference** (a retry is a second bill). The one exception is a free rate-limit refusal (Workers AI error 3021): up to 6 waits of 1/2/4/8/16/32 s, about 63 s total, holding the reservation. A further layer in `SessionDO` waits 5/15/30 s on `StepRefusedError`, up to a 5-minute provider-outage bound (`PROVIDER_OUTAGE_MAX_MS`), then ends the run as a refundable error. Source: `gateway.ts` `RATE_LIMIT_WAITS_MS`; `session.ts` `RATE_LIMIT_WAIT_MS`, `waitOnProvider`.
- **Prompt budget derives from the same estimator.** `promptBudget()` takes the tightest of reservation, context window (2.5 chars/token, 0.85 margin) and storage (`PERSISTED_TRANSCRIPT_MAX_CHARS = 600,000`), minus the tool-definition characters, floor `MIN_TRANSCRIPT_CHARS = 24,000`, trim target 70 percent. Source: `apps/worker/src/prompt-budget.ts`.
- **Credits.** `NEURONS_PER_CREDIT = 30`; `PLAN_LIMITS`: free 231/day 2,310/month, builder 416/12,600, studio 700/21,000, enterprise 833/25,000. Source: `packages/shared/src/index.ts` lines 2172-2196, 2363.
- **Adaptive reasoning:** only `low` and `high` are used; `medium` is "a trap" (measured 2.8x cost and no answer on a design task). At most 8 high-effort steps per run (`MAX_HIGH_EFFORT_STEPS`). Source: `apps/worker/src/reasoning.ts` header.

---

## 6.3 The agent loop

### 6.3.1 Run lifecycle

1. **Start.** A browser WebSocket message (or the `/v1/projects/:id/runs` API) reaches `SessionDO.startRun`/`startRunInner`. Access is checked (`stopForAccess`, private pre-launch approval gate), the Studio gate is applied (a run that needs Studio is refused if it is not paired), and a rollback checkpoint is taken when the run will change the place. Source: `apps/worker/src/do/session.ts` lines 3471-3800, `refuseStudio`, `ACCOUNT_NOT_APPROVED`; `apps/worker/tests/run-loop-traps.test.mjs` `RUN_START_OPS`.
2. **State.** One `AgentState` blob under storage key `agent` holds the transcript (`llm`), trace, plan, counters and guard state; the evidence ledger is its own key `selfCheckLedger`; Stop is its own key (`stop-signal.ts`) so a concurrent write cannot erase it; steers (messages sent during a run) wait under `steerQueue` until the next step boundary. Source: `session.ts` `AgentState`, `SELF_CHECK_KEY`, `STEER_KEY`; `apps/worker/src/stop-signal.ts`.
3. **Persistence limit.** Durable Object values are capped at 128 KiB; `persist.ts` sheds history rather than let an oversized `put` reject, because a rejected `put` makes the platform replay the alarm from stale state and double-apply mutations. Source: `apps/worker/src/persist.ts` header.
4. **Alarm loop.** Every step is one `alarm()` call: enforce socket expiries, notice Studio silence, re-arm the Studio watchdog first, load `agent`, return if idle, stop on access revocation or Stop request, honour `pausedForStudio` (waits at most 45 s, `STUDIO_PAUSE_MAX_MS`) and `resumeAt`, then `runStep`. Errors map to endings: `BudgetError` to `quota`, `RateLimitedError` or a transient provider failure to `waitOnProvider` (retry across alarms), `CAPACITY_EXHAUSTED` to `quota`, anything else to `error`/`model_failed` with "Everything already built is saved". Source: `session.ts` lines 3801-3940.
5. **Ending.** `finishRun(agent, reason, errorCode?, override?, buildOutcome?)` with `reason` in `done | stopped | error | quota | incomplete`; the error is a code from a closed vocabulary (`RUN_FAILURES` in `@apple/shared`) so the app owns the sentence; refunds are issued for refundable endings; the build log gets a finer outcome than `reason`. Source: `session.ts` `finishRun` (line 5798); `packages/shared/src/index.ts`.
6. **Hard ceiling.** `MAX_RUN_STEPS = 1000` accepted steps per message; there is no wall-clock limit. Source: `session.ts` line 642.

### 6.3.2 What one step does (`runStep`, about 1,530 lines, `session.ts` 3987-5517)

In order:

1. Normalise legacy `plan` mode to `agent`; rebind the project; re-check access. Source: `session.ts` 3987-4036.
2. If the step cap is reached, end `incomplete` with `step_limit`. Source: `session.ts` line 4037.
3. **Studio gate (G03):** a run that has used Studio does not take another step without it; it pauses and resumes on `continue`. Source: comments in `runStep`; `pauseForStudio`.
4. **Steers (G10):** user messages sent mid-run join here, between steps, with the prefix "New direction from the user" (the only raw user-role push left). Source: `applySteers` in `session.ts`; `packages/evals/src/security.test.mjs` A5 block.
5. **Context management:** collapse the art-direction brief once the blockout exists (it is about 7,001 of about 15,048 system-prompt characters), trim the transcript to the model-derived budget and report `context_budget` frames, and allow a read whose result was trimmed away to be read again. Source: `session.ts` comments; `prompt-budget.ts`; `apps/worker/tests/run-loop-traps.test.mjs`.
6. **Choose the tool set, narrowing only, in this order:** `toolsForMode` (router.ts) -> capability filter for what the connected plugin reports (`pluginToolFilter`) -> user tool permissions (allow/ask/deny, `applyToolPermissions` in `preferences.ts`) -> read-only withheld set for requests that forbid changes -> the "focused" set, which defers 30 tools behind `more_tools` -> removal of `look` when the self-check is off. Greetings and questions about Apple on the first step get no tool definitions (F-019: "hi" cost 9 Credits because all tool definitions were about 80 percent of input). Source: `session.ts`; `apps/worker/src/router.ts` line 156; `tools.ts` `DEFERRED_GROUPS`, `toolDefs`; `run-loop-traps.test.mjs` line 1026.
7. **Reasoning effort** for this step from `reasoning.ts` (signals: first step, recovery after failure, visual design, irreversible work); output budget from `tokensForEffort`. Source: `reasoning.ts`; `session.ts`.
8. **Model call** through the gateway with `sessionId` = per-project DO id as the provider's prefix-cache key, streaming so reasoning reaches the browser live in about 150 ms batches. Source: `session.ts`; `gateway.ts` `ChatOptions.sessionId`, `onReasoning`.
9. **Settle Credits** from actual neurons (rounded once per run, not per call); check Stop after settlement (Stop is not a refund). Source: `session.ts`; `quotaSpend`.
10. **Finish-reason check:** a response that did not positively say `stop` (for example `length`) is not treated as a completed answer; a call whose JSON was guillotined mid-arguments is not executed or written back into history. Source: `session.ts`; `apps/worker/src/tool-call-integrity.ts`.
11. **Tool-call-as-text recovery:** if the model wrote a tool call's arguments as prose, an inert-tool recovery re-reads it, and only names in the registry count (`tool-recovery.ts`). Source: `tool-recovery.ts`.
12. **No tool calls = an answer.** The loop first applies any steer for missing parts of the request's list (`run-parts.ts`), an "autonomous continue" (up to 3 times, `AUTONOMOUS_CONTINUES`) when the reply leaves work open or the game lacks a HUD or playtest (`run-idle.ts`), and then, with the self-check on, `selfCheckAtAnswer` (6.3.4). Source: `session.ts` lines 4693-4715; `run-idle.ts`.
13. **Tool calls:** at most 4 per step (`MAX_CALLS_PER_STEP = 4`; extras get "not run ... resend this one"). Each call goes through guards (6.3.5) and `runTool`, which refuses a Studio tool when Studio is down, parses arguments strictly (unparseable is not absent), records an evidence-ledger entry, scrubs engine identity, caps what goes back to the model (`MAX_RESULT_CHARS = 3000`, scripts up to 24,000) and what goes to the browser (`MAX_DETAIL_CHARS = 24,000`, explicit UI payload 96,000). Source: `session.ts` lines 4748-5200; `tools.ts` `runTool` (line 6744), constants at lines 1094-1096.
14. **After the calls:** update plan status, composer base (`noteComposer`), ready verdict, failure streaks, duplicate streak, idle/read-stall counters, layout check after world-building steps (3 per run), then re-arm the alarm. Source: `session.ts` lines 4939-5420.

### 6.3.3 The plan

- `propose_plan` is the first step of a building run: an ordered list (at most `MAX_PLAN_STEPS = 12`) where each step is `{title, detail?, tool}` and `tool` must be a tool offered in this run; a plan must include a verification step; defects return one of `shape | too_long | bad_step | unavailable_tool` and it may refuse only a bounded number of times. Source: `apps/worker/src/tools.ts` lines 538-860.
- A plan step is `done` only if "the tool that step named was called after the plan was announced, and did not fail"; it is explicitly not a claim the step achieved its title. Source: `apps/worker/src/run-plan.ts` header.
- **Knowledge is pushed, not hoped for.** Before each plan step: `skill-cards.ts` picks up to 2 craft cards for the system prompt and one more per step (max 5 per run, keyword overlap, no Vectorize call); `skill-push.ts` ranks the 360 creator skills in `creator-skills.ts` for that step's own words and pushes the top one or two as a harness note (at most 8 skills and 14,000 characters per run, never the same skill twice, never while the transcript is past 60 percent of its budget). Measured motive: in 90 tool calls the agent made 0 calls to `search_docs`, `search_creation_skills` or `read_creation_skill`. Source: `skill-cards.ts`; `skill-push.ts`; `creator-skills.ts` (4,100 lines, 360 `domain:` entries by my count).

### 6.3.4 The self-check before answering (feed only)

Switch: Worker var `SELF_CHECK` = `off | on | full`; unset means `on` except `ENVIRONMENT=production` where it means `off`; apple's wrangler sets `"on"`. `SELF_CHECK_CRITIC` (default on) controls only the blind critique, and `SELF_CHECK=off` turns that off too. With the check off, no ledger, no gate, no audit, and the `look` tool is not offered. Source: `apps/worker/src/self-check.ts`; `wrangler.apple.jsonc`; `env.ts`.

Parts, all sharing one run-scoped ledger:

| Part | What it does | Bounds | Source |
|---|---|---|---|
| **Evidence ledger** | per-run facts: what was written, read back, looked at and played, each tagged `write`/`read`/`play` and with `seq`/`mutationSeq`; also colours, texts, names, looks, plays, issues, inserted paths. Bounded lists (entries 60, looks 30, plays 8, issues 8). Own storage key. | `LEDGER_LIMITS` | `apps/worker/src/evidence-ledger.ts` |
| **`look` tool + vision observations** | frames what changed from several angles (front, high, eye level at the spawn; side with `all`), using only existing plugin ops (`viewport_info`, `spatial_query`, `set_props` on the camera, `capture_studio_viewport`), restores the user's camera, then asks the `vision` role for seen / not seen / cannot tell per `expect` item. Never a score. | up to 4 frames (`LOOK_FRAME_MAX`), 350 ms settle (`SELF_CHECK_SETTLE_MS`) | `studio-look.ts`, `look-observe.ts`, `look-tool.ts` |
| **Look gate (completion gate)** | structural: reads only the ledger and what was offered, never the request. A run that changed something the viewport can show and never looked gets one forced look; after later changes the agent is asked to look again. | `SELF_CHECK_LIMITS`: forcedLooks 1, repairRounds 2, looksPerRun 6 | `look-gate.ts`, `self-check.ts` |
| **Claim audit** | deterministic extraction of concrete claims in the reply (colour, visible text, count, behaviour, presence) and a verdict per claim against the ledger: supported, contradicted, unsupported (reported as "not checked", never as wrong). Findings a tool could settle go back to the agent; what remains is stated in one plain line after the agent's words. Words are never rewritten. | `auditRounds` 2 | `claim-audit.ts`, `self-check-run.ts` |
| **Claim-audit judge (mode `full` only)** | one cheap text-judge call on the `memory` role over the final reply | at most once per candidate final answer | `claim-audit-judge.ts` |
| **Blind critique** | for a run that changed what the viewport shows: a vision call given ONLY the user's request and the frames (the input type has no field for plan, reply or touched paths, and a test holds the prompt to that). Returns a rubric over six areas (delivers, world, art, assets, ui, feedback) and up to five flaws with severity; a `severe` flaw sends the agent back for one fix pass. Measured motive: a run's own look said "no cave walls visible" while a blind critic scored the game 2/10. | `fixPasses` 1, `flaws` 5 | `blind-critique.ts`, `critic-input.ts` |
| **Judge gate** | the run remembers its latest `judge_game` verdict; an answer is sent back with the judge's own ordered fixes (fenced) while the verdict is "not ready". After the bound the answer goes and its last line says what is still not ready. | `fixPasses` 2, 6 fixes | `judge-gate.ts` |
| **World pass** | after a composer (`compose_game`), the run is not done until at least 3 successful content-placing changes (a model placed, an object built, terrain shaped, instances created/cloned/scattered). The steer is a numbered list of concrete calls worked out from the run's own facts (`world-steps.ts`), fenced as untrusted data. After 2 steers the answer goes and says the place is still the template's base. | `minChanges` 3, `steers` 2 | `world-pass.ts`, `world-steps.ts` |
| **Layout flags** | model-free reads of the Workspace tree, Lighting and Terrain after world-building steps; high flags sent once per kind | 3 reads per run | `scene-flags.ts`, `scene-flags-run.ts`, `session.ts` `layoutCheckAfterWorldStep` |

**Answer-time decision order** (`checkAtAnswer`, one pure function, every counter only goes up so every path terminates): (1) work the run owes (world pass, then judge gate) is sent back first; (2) the look gate forces or asks for a look; (3) the claim audit sends back claims the agent can settle; (4) the blind critique runs once; (5) the plain "not checked" line and any admissions are appended after the agent's own text. Source: `self-check-run.ts`; `session.ts` `selfCheckAtAnswer`, `owedAtAnswer` (lines 5530-5640).

**Judge-then-answer flow.** Once `judge_game` returns `ready`, `run-flow.ts` makes the run refuse further project changes and the next step is the answer from the judge's `forUser` sentence. `judge_game` itself plays up to 3 short Test sessions inside an 8-minute budget (`JUDGE_BUDGET_MS`), presses buttons, walks onto collectables, and answers seven client questions (unique, flawlessly built, real progression, clean UI, no placeholders, correct code, features implied). Source: `run-flow.ts`; `apps/worker/src/client-judge.ts`, `client-judge-rules.ts`, `client-judge-ui.ts`.

**World-building cheap exit that is off when the self-check is on.** A composed plot-sim that passed its play check is answered from what the composer built, with no model call, but "only with the self-check off". Source: `session.ts` comments near line 4160.

### 6.3.5 Loop guards

All constants below are read from the source; "nudge" means one harness note, "limit" ends the run.

| Guard | Trigger | Action | Source |
|---|---|---|---|
| Duplicate call | identical call signature already seen, or the same failure 3 times (`MAX_SAME_FAILURES`) | refused as "already done" with the plan's next step named; a failure classified safe to repeat gets 2 identical retries (`MAX_IDENTICAL_RETRIES`) | `session.ts` lines 4776-4800; `op-failure.ts` |
| Duplicate streak | 3 consecutive all-duplicate steps (`MAX_DUPLICATE_STREAK`) | "unstick" steer up to 2 times per run (`UNSTICKS_PER_RUN`), then the run ends on what it built | `session.ts` 5218-5260; `run-idle.ts` |
| Idle after verify | a check passed, then only reads | nudge at 4 steps, finish at 8 | `run-idle.ts` `IDLE_AFTER_VERIFY_*` |
| Answer-only | a request that forbade changes keeps reading | nudge after 5 read-only steps | `run-idle.ts` `ANSWER_ONLY_NUDGE` |
| **Read stall** | read-only steps since the last change in a run that can build | nudge at 6 (it was 10; after a composer it restates the next world-pass step), end at 20 | `run-idle.ts` `READ_STALL_NUDGE`, `READ_STALL_LIMIT`; `world-pass.ts` `readStallNote` |
| Re-tune | the same target changed repeatedly | nudge at 6, finish at 12; alternation between two targets caught by a window of 24 changes with nudge at 12 and finish after 2 nudges | `run-idle.ts` `RETUNE_*`, `CHANGE_WINDOW`, `WINDOW_*` |
| Failing tool | consecutive failures of one tool | steer at 3, end at 8 | `run-idle.ts` `FAIL_STEER_AT`, `FAIL_END_AT` |
| Terrain streak | consecutive terrain writes | refused after 24 (`TERRAIN_STREAK_CAP`); lifted by any non-terrain change (a run once made 951 `edit_terrain` calls) | `terrain-streak.ts` |
| Order and scope gates | lighting-only, owner-recreate-first, owner-library-only, kit-kept requests | tool refused with a fixed sentence | `session.ts` lines 695-716 |
| Asset order gate | a Model of Parts built before the library was tried | refused (bounded count) | `model-rule.ts`; `library-run.ts` |
| After-ready refusal | any project-changing tool after a `ready` judge verdict | refused | `run-flow.ts` |
| Text-call steer | tool call written as text | up to 2 steers (`MAX_TEXT_CALL_STEERS`) | `session.ts` line 717 |
| Explicit tool sequence | user wrote "Exactly X then Y then finish" | only that sequence is allowed; never widens permissions | `tool-sequence.ts` |
| Unfinished parts | request's list items nothing built is named for | part steer, bounded by `partSteerAllowed` | `run-parts.ts` |
| Provider outage | no answer for 5 minutes | run ends as refundable error | `session.ts` `PROVIDER_OUTAGE_MAX_MS` |
| Step ceiling | 1,000 accepted steps | `incomplete` / `step_limit` | `session.ts` `MAX_RUN_STEPS` |

**Harness voice rule.** Every turn the harness writes into the transcript is pushed through `pushHarness`, which prefixes `[Harness note, not the user] `, because the transcript only has a user role and the model once quoted a harness nudge back as the person's words. Tool output is wrapped in a per-run fence as untrusted data. Source: `run-idle.ts` `HARNESS_PREFIX`; `session.ts` `fencedToolOutput`, `fenceIdFor`; `packages/evals/src/security.test.mjs` A5 block.

---

## 6.4 Tool inventory

**Count: 122 tools** in `export const TOOLS` (text scan of `apps/worker/src/tools.ts` lines 2602-6486, cross-checked by pulling each `def.name`; my scan, no runtime import). About 47 declare `mutatesProject` and about 79 declare `studio: true` (a text scan of each registry entry; treat as approximate). 30 tools are **deferred** behind `more_tools` in 8 groups (below). Every tool must be registered in three more places or tests fail: `packages/shared/src/index.ts` (phase and permission label), `apps/worker/src/mcp.ts` (exposed or excluded, each name exactly once) and `apps/worker/src/run-idle.ts` (plain label); the web app also holds each name to a label (`apps/web/src/components/ws/tool-vocabulary.ts`). Source: `CLAUDE.md`; `apps/worker/src/mcp.ts` header; comments in `tools.ts` near line 6440.

Registry mechanics worth knowing: tools from other files (audio, phase-A, fx-library, UI components, webtools) are registered one by one, not by spread, because `apps/worker/tests/webtools-wiring.test.mjs` refuses a spread; three guards read the literal out of source to decide what each tool owes (a web label, a phase, a mode). Source: comment above `design_sound` in `tools.ts`.

### 6.4.1 By family

Deferred tools are marked (D:group).

**Read and inspect the place (15)**

| Tool | Purpose |
|---|---|
| `get_project_tree` | snapshot of the instance tree with classes, measured sizes and duplicate-name warnings; "start here" |
| `get_instance` | read one instance back (class, props, attributes) to verify a change |
| `get_selection` | what the user has selected in Studio |
| `viewport_info` | camera pose and a spatial summary of top-level models |
| `search_instances` | find by name/glob, class, tag, attribute or property comparison |
| `spatial_query` | raycast, find ground, bounds, overlap questions about the 3D world |
| `get_output_logs` | recent Studio console output |
| `list_scripts` | scripts with class and line counts |
| `read_script` | script source, paged with `nextStartLine` |
| `search_scripts` | substring search over all script sources |
| `find_symbol` (D:code) | scope-aware symbol lookup, declarations and reads/writes of one binding |
| `review_scripts` (D:code) | static Luau review (syntax, dead code, globals, require cycles, unvalidated remotes, DataStore lost updates) |
| `model_anatomy` | read a placed model: parts, joints, hinge candidates, what is clickable/lit/playing (feed only) |
| `inspect_model` | structural QC of an inserted model |
| `inspect_attachment_image` | pixel inspection of a private image the user attached |

**Scripts and modules (5)**

| Tool | Purpose |
|---|---|
| `edit_script` | create or edit a script by full source, find/replace edits or a saved workspace file |
| `format_script` (D:code) | token-proven reformat |
| `run_luau` | edit-time Luau snippet in the plugin context; may not bring assets in (ingress scanner) |
| `install_module` | install a vetted self-contained ModuleScript for failure-prone systems |
| `run_spec` (D:code) | per-case assertions against the project's own modules |

**Instances and layout (17)**

`create_instances`, `set_properties`, `set_properties_bulk` (up to 500 targets or a query), `delete_instances`, `move_instances` (reparent), `transform_instances`, `clone_instances` (many copies by points, path or region), `scatter_instances` (up to 200 copies dropped by ray, seeded), `group_instances`, `ungroup_instances`, `rename_instance`, `set_locked`, `set_visible`, `collision_groups` (D:code), `create_rig` (R15/R6 character from a description), `focus_camera`, `select_instances`. Source: `tools.ts`; `phase-a-tools.ts`.

**Terrain (4)**

| Tool | Purpose |
|---|---|
| `edit_terrain` (D:terrain) | bounded typed smooth-terrain ops (clear, fill block/ball/region, replace material), no Luau |
| `shape_terrain` (D:terrain) | more shapes and look of Terrain, at most 65,536 voxels per call |
| `read_terrain` (D:terrain) | material histogram and fullness of a region |
| `build_scene` | plain terrain foundation for a floating island (deliberately incomplete) |

**UI (9)**

`insert_ui_component` (D:ui; the only way to put game UI in the place, D-UIONLY-1, from the UI library in a genre skin), `build_studded_ui` (studded GUI pieces: counter, button, bar, panel), `check_ui_layout` (renders a ScreenGui at real device sizes in a temporary copy and reports offscreen, clipped, overlapping, small touch targets), `build_ui` (D:ui; **retired**: always returns a refusal that points to `insert_ui_component`), `find_ui_asset` (5,000+ CC0 PNGs plus Creator Store UI images), `upload_ui_asset` (D:image; uploads one chosen image into the user's own Roblox account with their Open Cloud key), `generate_image` (D:image), `generate_ui_image_hf` (D:image; second image model, daily cap), `add_upgrades` (money per press, upgrades panel, server-checked buys, saved). Source: `tools.ts`; `ui-components.ts`.

**Audio, effects, mood, behaviour, animation, objects (16)**

| Tool | Purpose |
|---|---|
| `find_sound`, `insert_sound`, `play_library_sound` | search a library of Roblox audio ids; the only way to put a Sound in the place; audition for the person at the computer |
| `design_sound` (D:sound) | acoustics and a five-bus mixer (Music, Ambience, SFX, UI, Voice), no assets |
| `assign_sounds` (D:sound) | route existing Sounds onto the mixer with 3D falloff, as a dB trim |
| `generate_sound` (D:sound) | synthesise an original SFX from a recipe; stays in the workspace, never uploaded to Roblox |
| `speak_line` (D:sound) | text-to-speech line (language and pacing only, no voice control) |
| `find_vfx`, `insert_vfx` | engine-particle effect presets (the only way to put particles/beams in the place) |
| `add_effect`, `remove_effect` | ambient engine effects attached to an instance, removable |
| `set_mood` | named lighting mood (atmosphere, bloom, colour correction, sun rays, depth of field) |
| `add_behaviour` | give a placed model behaviour from reviewed verbs on triggers (feed only) |
| `animate_model` | rig a model and keyframe clips |
| `dress_object` | optional extras for a placed object (stage, click motion, counter); empty call is an error (feed only, replaces `main`'s `cool_library_model`) |
| `build_object` | build one object from named parts with measured notes |

**Assets, library and the owner library (19)**

| Tool | Purpose |
|---|---|
| `choose_asset_source` | ordered list of sources for a piece of the scene |
| `find_library_model` | step 1 of the asset order: owner's local corpus (paired plugin), then ingested owner components, then bundled Roblox-owned models, then the live Creator Store (ids `cs:<n>`) |
| `preview_library_models` | stage 1-6 candidates off-place and measure them (feed only) |
| `insert_library_model` | place one chosen model as a script-free copy and report its size against a player |
| `find_verified_asset`, `insert_asset` | Creator Store search (free, public, zero scripts, Mesh/Image only) and insertion by id, scanned |
| `generate_model` (D:models), `generate_model_external` (D:models) | **closed**: refuse, "Apple never generates a 3D model from scratch" (D-MODELLIB-2) |
| `query_owner_catalog`, `query_owner_assembly`, `read_owner_media`, `list_owner_original_strings`, `read_owner_original_string`, `read_owner_component` | page the private local owner source index through the paired plugin; results are untrusted inert data |
| `insert_owner_component` | import an owner-attested native RBXM component |
| `browse_owner_library`, `import_owner_library`, `recreate_owner_game`, `install_owner_system` | the owner's uploaded games: find by meaning/colour/size, import parts with original scripts, recreate a whole game, or install one ready-made system (daily rewards, spin wheel, pets, shop and others) |

**Composers (3, plus build_scene, build_object, add_upgrades above)**

| Tool | Purpose |
|---|---|
| `compose_game` | the BASE of a new game: the agent names a `template` and fills what makes it this game; templates are `tycoon` (dropper, belt, machines, seller, buy pads), `plot-sim` (hub, claimable plots, machine shop, upgrades, rebirth, studded HUD) and `lane-defense` (waves on a road, defenders on plots). With no template it returns a menu of what each can and cannot make. |
| `plan_game`, `build_game` | design and build a copy of a saved owner-library game (only when the user names one) |

Source: `apps/worker/src/compose-tool.ts` `TEMPLATES`; `compose.ts`, `compose-tycoon.ts`, `compose-plotsim.ts`, `compose-lane.ts`, `compose-run.ts`; components in `packages/components`.

**Checks and verification (11)**

| Tool | Purpose |
|---|---|
| `look` | the self-check camera tool (feed only, only offered when `SELF_CHECK` is on) |
| `judge_game` | score the game like a paying client; plays up to 3 Test sessions |
| `play_check` | playtest as a player: real Test session, optional walk onto touch parts, reads what the player's screen shows |
| `play_check_ui` | `play_check` that also presses on-screen buttons (up to 5) |
| `run_and_check` | Run-mode playtest that collects console errors ("proves nothing errored, not that anything is correct") |
| `audit_build` | panel of adversarial critics returning confirmed defects with a measured metric and threshold |
| `check_composition` | cost-free blockout check against the request |
| `inspect_visually` | render and critique against a visual gate (a model call) |
| `render_view` | software geometry views and native pixels when permitted |
| `capture_studio_viewport` | native viewport pixels, no model call |
| `compose_thumbnail` | frame and capture a store thumbnail or icon of the user's place |

The five verifier tools used to satisfy a plan's verification step are `run_and_check`, `run_spec`, `audit_build`, `check_composition`, `inspect_visually` (`VERIFIER_TOOLS`); `look` is registered separately as an extra check. Source: `apps/worker/src/verifiers.ts`; `run-idle.ts` `EXTRA_CHECK_TOOLS`.

**Knowledge and guidance (9)**

`search_docs` (Vectorize + D1 FTS over official Roblox docs), `docs_lookup` (current library/API docs via Context7, default the Roblox Engine reference; not deferred), `search_creation_skills` and `read_creation_skill` (360-skill catalogue), `get_genre_references`, `get_genre_kit`, `get_verified_module` (reviewed-and-executed Luau), `find_mechanic` (what the pattern is and where authority must live), `get_ui_construction` (how shipped Roblox UIs are built).

**Web and workspace (10)**

`web_fetch`, `browse_page`, `web_search` (Serper with Tavily fallback), `screenshot_page`, `ocr_image` (D:image), `github_lookup`, `git_history` (read-only), `workspace_list`, `workspace_read`, `workspace_write` (a scratch store that never touches the place). `web_fetch`, `browse_page`, `web_search`, `screenshot_page`, `github_lookup` are deferred (D:web); `git_history` is D:code; `ocr_image` is D:image; `workspace_*` are D:workspace. Network reach is by host allowlist with redirects held to it. Source: `webtools.ts`; `net-policy.ts`.

**Control and memory (4)**

`propose_plan`, `more_tools` (unlock by tool or group: terrain, sound, image, models, web, code, workspace, ui; no argument unlocks all), `remember` (durable fact to project memory), `create_checkpoint` (restorable snapshot of scripts and tree).

Deferred groups: sound 4, image 5, terrain 3, models 2, web 5, code 6, workspace 3, ui 2 = 30. Source: `tools.ts` `DEFERRED_GROUPS`; `apps/worker/tests/more-tools-by-need.test.mjs` holds each deferred tool to exactly one group.

(The family counts sum to 122: 15 + 5 + 17 + 4 + 9 + 16 + 19 + 3 + 11 + 9 + 10 + 4; I assigned every tool to exactly one family and checked that none is missing or repeated. The grouping is mine, not the code's.)

### 6.4.2 MCP and public API exposure

- `/v1/mcp` exposes only a read-only allowlist (`MCP_TOOLS`: tree, scripts, symbol, instance, selection, viewport, logs, plus three offline static references) with scope `projects:read`; every other tool name must appear in `MCP_EXCLUDED` with a reason, and `mcp.test.mjs` fails if a name is in neither. To build, an API client starts the agent with `POST /v1/projects/:id/runs` so the change passes the gates. Protocol revisions: 2026-07-28 current plus two older. Source: `apps/worker/src/mcp.ts` header and `MCP_TOOLS`.

### 6.4.3 The tool-definition context-budget test and its tiny margin

- **What pins it.** `apps/worker/tests/run-loop-traps.test.mjs`, test "the context budget a step reports is derived from the model the step is sent to" (line 921), asserts `budget.maxChars > 60_000` where `budget.maxChars` is computed by `promptBudgetForKey('agent', defsChars)`, with `defsChars` the JSON length of every tool definition from `toolDefs(true)`. Because the budget is "the tightest ceiling minus the fixed tool-definition characters", each added tool or longer description shrinks it. Source: `run-loop-traps.test.mjs` lines 913-931; `apps/worker/src/prompt-budget.ts`.
- **How tight.** Commit `46d7356a` records that the budget "(floor 60,000) fell to 57,475 after dup-names, self-check and behaviour added tools" and was repaired by compressing tool text (shorter intros, `S()` omitting an empty `required`, dropped indent and family tags) "with ~120 to spare (the handoff's margin)". So the margin was about 120 characters of budget. I did not run the test on the current tree, so the present margin is unmeasured here. Source: `git show 46d7356a`.
- **Consequence.** Adding a 123rd tool, or lengthening any description, can turn this test red even though no behaviour changed; the only remedy documented is trimming other tool text. A second test (`composer-kit.test.mjs` line 68) says `compose_game`'s definition "stays inside the context budget (the budget test holds the number)". The structural fix would be more deferral (30 tools are already deferred) or removing the two closed `generate_model*` tools and the retired `build_ui`, which still ship definitions to the model. Source: `apps/worker/tests/composer-kit.test.mjs`; `tools.ts`.
- **The cost angle.** F-019 measured that every call carried all 69 tool definitions (about 67,000 characters), about 80 percent of the input of a greeting. The registry has since grown to 122 tools. Source: `run-loop-traps.test.mjs` lines 1026-1027.

---

## 6.5 Size and health

### 6.5.1 Test suites (static counts, 2026-10-04)

My counts are lines matching `^\s*(test|it)(\.x)?\(` in `*.test.mjs` / `*.test.ts`; loops and generated cases make real counts higher.

| Suite | Test files | Declarations (static) | Last runtime figure I found | Source |
|---|---:|---:|---|---|
| `apps/worker/tests` | 410 | 5,335 | "Worker 5,199/0" in commit `46d7356a`; AGENTS.md (2026-09-22) said 3,706 | `apps/worker/tests/` |
| `apps/web` | 221 | 2,334 | "web 2,453/0" in `46d7356a` | `apps/web/tests/` |
| `apps/site/tests` | 50 | 255 | 224 on 2026-09-22 with 24 failing during the redesign | `apps/site/tests/` |
| `packages/evals` | 63 | 1,250 | "evals 1,474/0" in `46d7356a` | `packages/evals/` |
| root `tests/` | about 48 | 614 | "root 588/0" in `46d7356a` | `tests/` |
| `apps/apple-plugin/tests` | 24 | 79 | "apple-plugin 79/0" | `apps/apple-plugin/tests/` |
| `packages/corpus` | 20 | 287 | n/a | `packages/corpus/` |
| `packages/sdk` | 11 | 89 | n/a | `packages/sdk/` |
| `packages/design` | 3 | 80 | n/a | `packages/design/` |
| `packages/components` | 4 | 6 | n/a | `packages/components/tests/` |
| `packages/asset-library` | 3 | 22 | n/a | `packages/asset-library/` |
| `packages/training` (not in workspace) | 66 | 597 | n/a | `packages/training/` |
| Luau specs | 22 `*.spec.luau` (11 in legacy `apps/plugin/tests`, 10 in `apps/benchmark/crystal-canyon/tests`, 1 other) | n/a | "250 Luau specs, 56/56 mutations caught" in AGENTS.md (2026-09-22) | `find apps packages -name '*.spec.luau'` |
| Supabase (real Postgres) | 5 scripts | n/a | rls-isolation described as 43 checks | `infra/supabase/tests/` |

Run time: the worker suite takes about 3 minutes (`cd apps/worker && node --test`). Node 26 runs `.ts` sources directly, no build step (the local Node is v26.8.1; CI sets `NODE_VERSION: '22'`; several worker tests bundle `src/*.ts` with esbuild first, for example `prompt-no-subjects.test.mjs`). Source: `CLAUDE.md`; `.github/workflows/ci.yml` `NODE_VERSION`.

### 6.5.2 CI (`.github/workflows/ci.yml`, plus two workflows)

Runs on push to `main`, every pull request and manual dispatch; no job gets repository secrets and none can deploy or call a paid provider ("COST POLICY").

| Job | What it does |
|---|---|
| `typecheck-and-test` (20 min) | pnpm install frozen; Luau 0.663 toolchain; `pnpm -r typecheck`; builds the site (47 site tests read the built output); installs Chromium; `pnpm -r test`; `node --test tests/*.test.mjs`; `node scripts/gate-check.mjs --lint` (ledger shape of `GATES.md`) |
| `build` (12 min) | builds site and web; `check-site-links` (577 links), `check-credit-figures` (published Credit figures equal the worker's arithmetic), `check-site-semantics`, `check-dispositions`, `check-app-bundle`, `check-landing-budget`, `check-asset-wall`; uploads `site-dist` |
| `plugin` (8 min) | Luau + Rojo 7.7.0; `node apps/apple-plugin/scripts/build.mjs` (parse, bundle check, rojo build, secret scan, verify built bytes); uploads `apple-studio-pr-unverified` |
| `static-checks` (8 min) | eval-script syntax check, `check-workspace-coverage`, `check-rebrand --offline`, `check-no-golem`, `check-ci-references`, report-only Prettier |
| `security` | the secret scanner's own tests, `scripts/secret-scan.py` over full history, no tracked env files, `pnpm audit --audit-level moderate` (warns only) |
| Playwright smoke | builds the site, installs Chromium, `pnpm exec playwright test` |

Other workflows: `plugin-release.yml` (workflow_dispatch only; builds and verifies the artifact and stops before the human Creator Store upload) and `publish-packages.yml` (tag `packages-v*` publishes `@apple/shared` and `@apple/sdk` to GitHub Packages; PRs only dry-run). Source: `.github/workflows/`.

`scripts/` holds 81 entries: checkers (`check-copy`, `check-deadends`, `check-backlog`, `check-escape-hatches`, `check-schema-drift`, `check-template-freshness`, and others), generators (`gen-components.mjs`, `build-verified-modules.mjs`, `build-ui-construction.mjs`), `gate-check.mjs`/`gate-suite.mjs` (44 gates in `GATES.md`), `secret-scan.py`, `rename-golem.mjs`, `land-worktrees.mjs`. Source: `ls scripts`.

### 6.5.3 Deploy

- **Worker:** `node infra/deploy-worker.mjs [apple|golem] [--secrets-file ...] [--build-sha ...]` stamps `BUILD_SHA` from git at deploy time (a dirty tree is stamped `<sha>-dirty`, not refused) and then fetches what it deployed; verify at `/api/health` (`buildSha`, `compat`, `legacyWire`). Never use bare `wrangler deploy` (the committed `BUILD_SHA` once went stale and `/api/health` named the wrong build). Source: `infra/deploy-worker.mjs` header; `index.ts` health route.
- **Site and SPA:** `node infra/deploy-static.mjs [--only site|web]` uploads files to the worker's D1 static store with `APPLE_ADMIN_KEY` against `API_BASE`; content-addressed assets first and pages last (not transactional, the survivable mixed state is old pages with all their assets); `--file <local> <remote>` is the rollback path; `infra/rollback-static.mjs` and `infra/capture-rollback.mjs` support it. Source: `infra/deploy-static.mjs` header; `infra/`.
- **Plugin:** built by CI, published to the Creator Store by a human (`docs/PLUGIN-RELEASE.md`). Source: `.github/workflows/plugin-release.yml`.
- **Operational scripts:** `infra/healthcheck.mjs`, `smoke.mjs`, `e2e.mjs`, `loadtest.mjs`, `real-chat.mjs`, `pair-helper.mjs`, `store-validation.mjs`, `provision-outbox-token.mjs`, `deploy-showcase.mjs`, `discord-server.mjs`. Source: `ls infra`.

### 6.5.4 The "golem" names that stay, and the rename status

- **Rule.** The product is Apple; the word `golem` may appear in tracked files only where `scripts/golem-allowlist.json` lists it (29 entries today), enforced by `node scripts/check-no-golem.mjs` (in CI `static-checks`). Infrastructure names stay `golem` because renaming breaks live sessions: D1 `golem-corpus`, KV `golem-kv`, Vectorize `golem-docs`, AI Gateway `golem`, the legacy worker `golem`, the `golem.workers.dev` host, wire literals such as `golem.v1`, `X-Golem-*` headers, `golem_session`, and hash domain separators. Source: `CLAUDE.md`; `scripts/golem-allowlist.json` entries `cloud-resource-names`, `shim-wire`, `hash-domains`.
- **Compat status.** The worker accepts BOTH wire spellings: `/api/health` returns `compat: 'wire-both'` and `legacyWire`, a per-isolate count of requests read in the old spelling (evidence for phase D removal). Source: `apps/worker/src/index.ts` lines 828-832; `packages/shared/src/legacy-wire.ts`.
- **Phases.** A (repository rename) and B1 (worker accepts both) are in this tree. **B2** (clients send the new spellings) is not: it sits on branch `golem-rename-b2` and the allowlist entry `b2-pending-old-wire-spellings` (max 144 hits) holds the old spellings in clients (web socket, SDKs, plugin sources, infra scripts, the owner-bench runner) until that merge deletes it. Phases C (cloud) and D (counters allow) are unexecuted: the runbook's status line reads "NOTHING IN THIS FILE HAS BEEN EXECUTED". Source: `docs/operations/GOLEM-REMOVAL-RUNBOOK.md`; `scripts/golem-allowlist.json`.
- **Order that must hold:** merge A+B1, deploy apple, verify `compat: wire-both`, only then merge `golem-rename-b2`, then the owner decides on publishing plugin 1.1.0+ built from B2 sources. Source: runbook section 1.2.
- **Compatibility shims that read both:** `legacyOf` derives old subprotocol, headers, capability schema, UI fence and attribute; the CLI reads `GOLEM_TOKEN`/`GOLEM_API_URL` after `APPLE_*`; memory export accepts the old format stamp; the Crystal Canyon promo code `GOLEM` aliases `APPLE`. Source: allowlist entries `shim-wire`, `shim-sdk-env`, `stored-format-memory`, `benchmark-code-alias`.
- **Deployment-config oddity:** golem's wrangler has the nightly `0 3 * * *` retention cron, apple's does not; apple's `scheduled` handler would run retention only for an unrecognised cron value, but apple only schedules `* * * * *`. Retention sweeps therefore appear to depend on `golem` staying deployed (from reading the two configs and `runScheduled`; not verified against the live account). Source: `apps/worker/wrangler.jsonc`; `wrangler.apple.jsonc`; `apps/worker/src/index.ts` lines 7314-7360.

---

## 6.6 Technical debt and hazards

### 6.6.1 Size

| File | Lines (feed) | Notes | Source |
|---|---:|---|---|
| `apps/worker/src/do/session.ts` | 7,790 | `runStep` alone is about 1,530 lines (3987-5517); `fetch` about 990 (2086-3072); `webSocketMessage` about 340; about 36 percent of lines are comments (2,803 comment-ish lines by my grep). One class owns WebSocket, plugin queue, access control, collaboration presence, checkpoints, the agent loop and the self-check wiring. | `wc -l`; `grep` |
| `apps/worker/src/index.ts` | 7,409 | 211 routes in one file | `grep -c` |
| `apps/worker/src/tools.ts` | 6,934 | the whole 122-tool registry in one object literal (lines 2602-6486); `S()` hand-written schemas read back with casts | `wc -l` |
| `apps/apple-plugin/src/Commands.luau` | 5,665 | "at the edge of Luau's 200-local limit"; new ops must go into `src/ops/` | `ops/init.luau` comment |
| `apps/worker/src/creator-skills.ts` | 4,100 | 360 skills as code, not data | `wc -l` |
| `apps/worker/src/assets.ts` | 3,544 | still large although the asset library was removed (2026-09-20); I did not audit what remains | `wc -l`; `AGENTS.md` section 5 |
| `apps/worker/src/mechanic-citations.ts` | 3,016 | | `wc -l` |
| `apps/worker/src/prefabs.ts`, `meshgen.ts` | 2,274 and 2,138 | **`meshgen.ts` is imported only by its own test** (`apps/worker/tests/meshgen.test.mjs`) while `generate_model` is closed; candidate dead weight | `grep -rl meshgen apps packages` |
| `packages/evals/src/security.test.mjs` | 3,523 | | `wc -l` |
| `apps/web/src/routes/settings.tsx` | 2,677 | | `wc -l` |

Whole-repo: about 574,000 lines across `.ts/.tsx/.luau/.mjs/.astro/.py/.css` outside `node_modules`, `training` and `corpus/raw`, of which `apps/plugin/globalTypes.d.luau` (17,286) is a vendored type dump. Source: `find ... | xargs wc -l`.

TODO/FIXME/HACK/XXX count is effectively zero (1 in worker source, in a string; 1 in evals; 2 in `scripts`). The codebase records debt as long `//[[ ... ]]` comment blocks, decision tags (`D-VISION-1`, `D-UIONLY-1`, `D-FXLIB-1`, `D-MODELLIB-2`, `D-PAY-2`, ...), failure ids (`F-019`, `F-31` in `docs/FAILURES.md`) and dispositions in `docs/backlog/FEATURES.json` (1,249 rows). So grep for TODO finds nothing; the real debt list is `docs/BLOCKERS.md`, `docs/FAILURES.md`, `docs/backlog/DEADENDS.md`. Source: `grep -rE '\b(TODO|FIXME|XXX|HACK)\b'`; `scripts/check-dispositions.mjs`.

### 6.6.2 Tests that pin exact text

- **Source-text tests are the norm.** About 130 of the 410 worker test files read `src/` text with `readFileSync` and assert on it (`grep -lE 'readFileSync\(.*src'`); `CLAUDE.md` warns that "a call must sit inside a guard's character window, a literal must not appear" and "a pure move or reorder can fail them; run the whole suite". Examples: the audio-tool registration test refuses a `...AUDIO_TOOLS` spread because three guards parse the `TOOLS` literal; `security.test.mjs` scans `session.ts` for `agent.llm.push(` and `pushHarness(agent.llm,` blocks. Source: `CLAUDE.md`; `apps/worker/tests/webtools-wiring.test.mjs`; `packages/evals/src/security.test.mjs` line 2616.
- **A5 harness push-count test.** `security.test.mjs` asserts `harnessPushes.length === 21` (line 2661) and `userPushes.length === 22` (line 2775) in `do/session.ts`, with the message "review it for injection risk (do not just bump the number)". Each new harness note therefore needs a written review entry in a comment block. The self-check, world pass, judge gate and report pushes each earned an entry (the latest, F3+F5, took it from 20 to 21). Source: `packages/evals/src/security.test.mjs` lines 2643-2661, 2775.
- **No-subject and banned-word tests.** `apps/worker/tests/no-subject-literals.test.mjs` scans every worker `.ts` and component `.luau` file (comments stripped, strings and prompts not) for subjects of earlier benchmarks: `laundry`, `washing machine`, `pizza`, `bakery`, `keyboard`, `piano`, `typewriter`, `butter`, `donut`, `crown`, `asmr`, `duck`, `tomato`, `carrot`, `eggplant`, `pumpkin`, `orchard`, `Dirty Laundry`, `Doge`, plus raw `⌨`, `egg_glow`, `squish`, `Click it!` and tier words; the allowlist (3 entries) "may only shrink". `prompt-no-subjects.test.mjs` applies the same list to what the model is actually shown (assembled system prompt, craft cards, every tool definition, every creation skill). A tool description or skill that uses one of these words as an ordinary noun fails the build. Source: `apps/worker/tests/no-subject-literals.test.mjs` lines 32-38; `apps/worker/tests/no-subject-literals.allow.json`; `apps/worker/tests/prompt-no-subjects.test.mjs`.
- **Other pinned vocab.** `run-failure-vocabulary.test.mjs` reads each `finishRun` call site to prove the error code is from the closed set; `tool-vocabulary.test.mjs` (web) holds each tool to a label; `phase-coverage.test.mjs` to a phase; `tools-for-mode.test.mjs` to a mode; `check-credit-figures` pins site copy to the arithmetic. Source: comment above `design_sound` in `tools.ts`; `apps/worker/tests/run-failure-vocabulary.test.mjs`.
- **Tripwire counts that may only move in one direction** exist in several places (allowlist lengths, `SELF_CHECK_LIMITS`, `JUDGE_LIMITS`, `WORLD_PASS` pinned "as a tripwire"). Source: `self-check.ts` comment; `no-subject-literals.test.mjs` header.
- **Tool-definition budget** (6.4.3) is a numeric text-size tripwire of the same kind.

### 6.6.3 Persistence and concurrency

- DO value cap 128 KiB vs a prompt budget that allows up to 600,000 transcript characters (`PERSISTED_TRANSCRIPT_MAX_CHARS`, said to stay under 2 MB at two bytes per character). These two documents disagree about the limit; `persist.ts` sheds history to fit, so a long run may lose older turns even when the prompt budget allowed them. Source: `apps/worker/src/persist.ts`; `apps/worker/src/prompt-budget.ts`.
- A rejected `put` makes Cloudflare replay the alarm from stale state, which re-runs a paid model call and re-applies mutations; the code goes to length to avoid it (`persist.ts`, `stop-signal.ts` own key, ledger own key). Any new per-run state must go in its own key or be shed-aware. Source: `persist.ts`, `stop-signal.ts` headers.
- D1 is single-threaded; per-request DDL once took the site down (`schema-once.ts` memoises `create table if not exists` per isolate and database). New stores must use `oncePerIsolate`. Source: `apps/worker/src/schema-once.ts` header.

### 6.6.4 Repository hygiene

- **Many worktrees and two repos.** `/Users/moshe/Developer/RbxAI*` has 15 directories (`RbxAI`, `-caps`, `-ci`, `-design2`, `-feed`, `-fix-agent`, `-fix-assets`, `-fix-r2`, `-fix-r3`, `-fix-ui`, `-integration`, `-rename`, `-reorg`, `-search`, `-site-v4`, `-web-v4`). The main repo registers 19 worktrees (2 prunable under `/private/tmp`) and 26 local branches, 13 of them agent worktrees under `.claude/worktrees` that use 5.1 GB. `RbxAI-rename` is a second repo with its own `.git` (44 MB), 9 worktrees and 12 branches, and the research-feed branch lives only there. AGENTS.md (2026-09-16) recorded 58 worktrees and 15 GB, so cleanup happened but the sprawl persists. The shared-checkout rules in AGENTS.md (never `git add -A`, `checkout`, `switch`, `stash`, `reset`; never `pnpm install` in the main checkout; commit with `git commit -F <msg> -- <pathspec>`) exist because several agents edit one tree. Source: `git worktree list` in both repos; `du -sh`; `AGENTS.md` sections 2 and 7.
- **Untracked owner-corpus gateway code.** `packages/owner-corpus/` (131 entries, 88 Python files, 3.6 MB, plus `docs/evidence/owner-corpus-*/`) is git-ignored by design (".gitignore" line 296; "the repository is public; the full backend corpus is not a public gallery") and exists only in `/Users/moshe/Developer/RbxAI`. Consequences: the gateway at `127.0.0.1:63747` has no history, CI cannot test it (its Python tests run only locally), the research-feed tree cannot run or even read it, `LocalOwnerCorpus.luau` and the `apps/apple-plugin/tests/{owner-corpus,local-owner-corpus,owner-library}.test.mjs` tests assume a protocol that is defined in untracked code, and a lost laptop loses the owner library's decoder. `gateway_library.find.patch` in `packages/owner-classify` is a patch against a file feed does not contain. Source: `.gitignore`; `ls /Users/moshe/Developer/RbxAI/packages/owner-corpus`; `packages/owner-classify/gateway_library.find.patch`.
- **Training and corpus weight.** `packages/training` is 2.7 GB on `main` (LoRA adapters and MLX data) though training is cancelled; `packages/corpus` is 13 MB tracked on `main` (the Roblox docs `chunks.jsonl` named in AGENTS.md is not in the feed tree's `data/`, only `chunks-witness.json`). Source: `du -sh`; `ls packages/corpus/data`.
- **Duplicated code.** `tools/repo-chat/components/ai-elements/prompt-input.tsx` and `apps/web/src/components/ai-elements/prompt-input.tsx` are both 1,463 lines; the legacy `apps/plugin` is kept only for tests that read its text. Source: `wc -l`; `AGENTS.md` section 3.
- **Docs that are stale in the repo.** `AGENTS.md` (feed tree) still says the plugin source is 1.1.0, the worker has 137 TS files, the worker suite has 3,706 tests, and `apps/apple-plugin` has "6 Luau files in src/" (it now has 6 top-level files plus 13 under `src/ops/`). It says its own numbers will drift. `docs/autonomy/CURRENT_STATE.md` is dated 2026-09-28/30 and its "client test pass" is revoked by the owner. Source: those files.

### 6.6.5 Product-architecture hazards

- **The owner library is a single-Mac dependency.** The first source for "every build" in several tool descriptions (`browse_owner_library`, `find_library_model`, `install_owner_system`) is data that exists only on the owner's machine; those tools work for approved accounts only through `RELEASE_LIBRARY_OWNER_ID` and `LIBRARY_APPROVED_USER_IDS` secrets and a paired plugin, and the gateway must be running locally. A customer without that path falls to bundled Roblox-owned models and the live Creator Store. Source: `apps/worker/src/env.ts`; `tools.ts` descriptions; `CLAUDE.md`.
- **Model-quality ceiling.** One small fast model (GLM 5.3 Flash, low effort) runs every step; much of the harness (skill push, world steps, harness nudges, caps on reads, refusal sentences) exists to compensate for it not looking things up or building the whole request. Source: `skill-push.ts` header ("The model is small and fast; it does not go looking"); `world-pass.ts`; `reasoning.ts`.
- **Harness text is a large share of behaviour.** There are 21 harness push sites in `session.ts` and about 15 steer constants in `run-idle.ts`; behaviour changes by editing sentences, which tests pin. Source: `security.test.mjs`; `run-idle.ts`.
- **Self-check cost.** Each look costs a vision call; the blind critique is a second; the optional judge a third. They are settled into the run's Credits; bounds are 6 looks per run, 1 critique. There is no measured Credits cost per game in the files I read. Source: `self-check.ts`; `blind-critique.ts`.
- **Legacy retired paths still shipped.** `build_ui` (retired, always refuses), `generate_model`, `generate_model_external` (closed) still send full definitions and tests, and `meshgen.ts`/`hf-3d-pipeline.ts`/`model-upload*` and the `apple-model-upload` Workflow serve a path the agent can no longer use. Source: `tools.ts` lines for those names; `model-upload.ts`; `wrangler.apple.jsonc`.
- **The product has no hard shared spend cap.** With the daily/monthly neuron ceilings lifted, only per-user Credits and the 1,200-neuron per-call cap bound spend. Source: `pricing.ts`.

---

## Open questions this section raises for the planners

1. **Which tree is the base for the final product?** `research-feed` is 163 commits ahead of `main` in a different git object store (`RbxAI-rename`), and the self-check stack exists only there. Is `main` going to be fast-forwarded or rebuilt from feed, and who reconciles the two stores?
2. **Is `look`/blind critique/world pass the final quality model, or a stopgap?** They add up to three vision calls plus bounded retries per run, and their effect on Credits per game is not measured in the files I read. What is the target cost per finished game?
3. **Should the owner library stay a loopback gateway on one Mac?** The final product needs a story for non-owner customers and for CI: ship the corpus to a hosted store (the worker already has `owner_corpus_components` in D1), keep it private, or drop it for bundled models plus the Creator Store.
4. **What is the plan for the untracked `packages/owner-corpus`?** Backed up where, tested how, and does the final architecture need it tracked (private repo or submodule) or replaced by the hosted index?
5. **Tool-definition budget.** The 60,000-character floor passes with a margin recorded as about 120 characters. Is the answer more deferral, removing retired tools (`build_ui`, `generate_model*`), moving descriptions to read-on-demand skills, or lowering the floor? What is the maximum tool count the model can use well?
6. **Split `session.ts` and `tools.ts`?** Any split changes text that about 130 worker tests read and that A5 counts. Is a mechanical split worth a one-time rewrite of those tests into behavioural ones, or is the monolith accepted?
7. **Retention cron after `golem` is removed.** Apple's wrangler lacks `0 3 * * *`. Is the nightly sweep moved into apple's config before golem is deleted?
8. **Finish the rename?** B2, phase C (cloud resources) and D are unexecuted and each needs owner approval; is renaming D1/KV/Vectorize worth the risk, or should `golem` infra names be declared permanent and the allowlist closed?
9. **Persistence limits.** `persist.ts` says 128 KiB per value; `prompt-budget.ts` budgets up to 600,000 transcript characters. Which is true on the platform today, and what does shedding drop in a long run?
10. **Plugin release.** Source 1.5.0 versus store 1.0.0: the worker serves ops the published plugin cannot execute. What is the release and minimum-version policy (`plugin-version.ts`), and who performs the manual Creator Store step?
11. **No spend ceiling.** With daily and monthly neuron caps lifted by owner decision, is a per-user and global dollar alarm needed before paying customers arrive?
12. **Dead or near-dead modules.** `meshgen.ts` (2,138 lines), `prefabs.ts`, `assets.ts`, the 3D upload Workflow and `packages/training` look unused by the live agent. Delete, archive, or revive under a new owner decision?
13. **Test strategy.** About 5,335 worker declarations run in roughly 3 minutes, but many assert source text. Which of them protect behaviour and which protect wording, and does the final product want a behavioural eval harness (real Studio runs) as the primary gate instead?
