# 3. Product, business model and vision history

_Section of the planning dossier. Compiled 2026-10-04 from the repository (`/Users/moshe/Developer/RbxAI`), the owner's memory notes, and the local owner-library files. Every fact is followed by its source path in backticks. "Unknown" means the repo does not say._

**Reading notes for planners (these change how much to trust a number):**

1. **`GOAL.md` is the current goal and supersedes everything else here.** It retires the 11-point `/goal`, the fixed meter, the V3 scope and the `ACCEPTANCE.json` gates (`GOAL.md`). Sections 3.1 to 3.2 describe the product as it is built; section 3.3 explains how the vision got to `GOAL.md`.
2. **`main` is not the deployed product.** `handoff/research-feed` has 158 commits that `main` lacks, and `handoff/fix-r3` has 163 (checked with `git rev-list --count main..<branch>`). Round-4 notes say the product source is `research-feed` and `fix-r3` (`research/roblox/phase-t/t1-round4/validation.md`). Plugin 1.4.3 is on `main` and 1.5.0 on `fix-r3` (`apps/apple-plugin/package.json` on each ref). The plan, credit and price tables are identical on both refs; only package scope names changed (`@golem/shared` to `@apple/shared`). Facts below come from `main` unless marked.
3. **Docs disagree with code in places.** `docs/COST-MODEL.md` still lists Free as 60 credits per day and Pro as 400 per day (`docs/COST-MODEL.md`, "Per-user quotas"). The enforced numbers are in `packages/shared/src/index.ts` (`PLAN_LIMITS`). I use the code.

---

## 3.1 What Apple is today

### 3.1.1 One-paragraph definition

Apple is a hosted AI agent that builds Roblox games inside the creator's own Roblox Studio place. The creator describes a game in plain English in a web app. A Cloudflare Worker runs the agent loop on GLM 5.3 Flash. A Studio plugin, paired by a six-character code, carries out typed operations in the creator's place (`CLAUDE.md`, "Architecture in one screen"; `docs/autonomy/MISSION.md`). The V3 promise is that "even a rough one-line prompt" becomes "a complete, substantial Roblox game" (`docs/autonomy/v3/Apple_RbxAI_HANDOFF_V3.md` §1). The measured reality is far from that: three blind-critic rounds on one game scored 2, 1.5 and 1.5 out of 10 (`research/roblox/phase-t/MODEL-COMPARISON.md`; `planning/sections/02-owner-directives-and-session-history.md` §2.3).

### 3.1.2 Surfaces and stack

| Surface | What it is | Path |
|---|---|---|
| Marketing site | Astro, served at `/`. Pages: home, pricing, models, proof, changelog, status, discord, privacy, terms, 10 docs pages | `apps/site/src/pages/` |
| Web app | React + Vite SPA at `/app`. Routes: login, signup, dashboard (projects), `/projects/:id` (chat workspace), `/projects/:id/roadmap`, `/projects/:id/branding`, `/usage`, `/settings`, `/join`, `/admin` | `apps/web/src/app.tsx`, `apps/web/src/routes/` |
| Worker | Hono router plus Durable Objects: SessionDO (per project agent loop), QuotaDO (credit ledger), PairingDO, BudgetDO (global spend), AdminDO, Discord and collab stores | `apps/worker/src/index.ts`, `apps/worker/src/do/` |
| Studio plugin | Luau, long-polls the worker, executes typed ops against allowlists. Version 1.4.3 on `main`, 1.5.0 on `fix-r3` | `apps/apple-plugin/` |
| Auth and registry | Supabase (Postgres plus Auth, RLS). Free plan; Pro is an open owner decision | `docs/DECISIONS.md` ADR-003; `docs/autonomy/OWNER_QUEUE.md` Q-003 |
| Data plane | Cloudflare D1 (static site store, owner-corpus components, generated images), KV, Vectorize (docs RAG) | `apps/worker/src/owner-corpus.ts`; `docs/DECISIONS.md` ADR-002, ADR-023 |
| Outside access | Public API (`/v1/projects/:id/runs`, keys `gk_live_`/`gk_test_`), a read-only MCP surface, a Discord bot, voice typing (frozen) | `packages/shared/src/index.ts` (`API_SCOPES`); `apps/worker/src/mcp.ts`; `docs/autonomy/v3/Apple_RbxAI_DECISIONS_V3.md` Q13 |

Production is `https://apple.moshe-barami111.workers.dev` (`docs/autonomy/MISSION.md`). The old `golem` worker was still a live dependency of the payments path as of 2026-09-20 (`docs/GO-LIVE.md`, "A defect on this path"). Whether that still holds after the rename phases is unknown.

### 3.1.3 The user journey, end to end

| # | Step | What happens | Source |
|---|---|---|---|
| 1 | Land on the site | Hero: "Build it in the place you already have open." A real composer form submits to `/app/signup?start=<text>`. The page comment says the app does not read `?start=` yet | `apps/site/src/pages/index.astro` |
| 2 | Sign up | Email and password, no card, no phone. The free daily allowance (231 credits) applies at once | `apps/site/src/pages/docs/getting-started.astro` |
| 3 | Create a project | One project is one game. The project keeps chat, checkpoints and memory. Returning continues that game. Projects are unlimited on every plan | `docs/autonomy/v3/Apple_RbxAI_DECISIONS_V3.md` Q26; `packages/shared/src/index.ts` (`PLAN_FEATURES`) |
| 4 | Get the plugin | **Public install is unavailable.** `STUDIO_PLUGIN_STORE_LIVE = false`, so every install link goes to `/docs/plugin`. Approved testers use a local install (`~/Documents/Roblox/Plugins/AppleStudio.rbxm`) | `packages/shared/src/index.ts`; `docs/autonomy/CURRENT_STATE.md` (2026-09-30 late) |
| 5 | Pre-launch gate | Only the owner and approved accounts can start a build. Others see "Apple is in private pre-launch: building is open to approved accounts only." With no `OWNER_USER_IDS` configured, nothing is gated | `apps/worker/src/do/session.ts` (`ACCOUNT_NOT_APPROVED`); `apps/worker/src/owner-corpus.ts` (`buildApproved`) |
| 6 | Pair Studio | The web app shows "Your pairing code": 6 characters from a 31-character alphabet with no I, L, O, 0 or 1. It expires after 10 minutes. The plugin claims it for a scoped session | `apps/worker/src/do/pairing.ts`; `apps/web/src/components/pairing-dialog.tsx` |
| 7 | Allow edits | The composer stays locked until the correct place is paired and edits are enabled. Stop is never locked. The same rule is enforced server-side. A test the person starts pauses edits instead of revoking them | `docs/autonomy/v3/Apple_RbxAI_HANDOFF_V3.md` §5; `docs/autonomy/DECISIONS.md` D-PLUGIN-2 |
| 8 | Chat | One engine, no mode picker. The composer has a UI theme chip: `studded` (default), `cartoony`, `none` (Apple chooses; never "no UI") | `packages/shared/src/ui-theme.ts`; `packages/shared/src/index.ts` (`ProductMode = 'agent'`) |
| 9 | The run | A checkpoint is taken first. The agent plans, then calls tools in a loop of up to **1,000 steps**. The user can steer mid-run, Stop (server-acknowledged), and press Continue after a Studio disconnect | `apps/worker/src/do/session.ts` (`MAX_RUN_STEPS`); `docs/autonomy/CURRENT_STATE.md` (G03, G10 evidence) |
| 10 | The reply | While working, one live status line. The final answer arrives at the end. The 23-component evidence renderers are built and tested but unmounted, because the owner removed the per-turn Details disclosure on 2026-09-29 | `apps/web/src/components/ws/turn.tsx`; `docs/autonomy/CURRENT_STATE.md`; `docs/autonomy/SESSION_HANDOFF_2026-09-30.md` §1 |
| 11 | After the game | **Generate Branding** at `/app/projects/:id/branding`. It captures the place read-only, composes icon and thumbnail art from real pictures, and has the model write names and descriptions. It never publishes | `apps/web/src/routes/branding.tsx` |
| 12 | Account pages | Usage meter and Plans and Credits (`/usage`), settings (Roblox key, API keys, asset-source policy), roadmap, collaborator join, admin | `apps/web/src/routes/`, `apps/web/src/components/` |

The delivered game must run without Apple, a subscription or any model call (V3 Q33). Monetisation code may be prepared but stays inactive until the game owner configures it (Q34) (`docs/autonomy/v3/Apple_RbxAI_DECISIONS_V3.md`).

### 3.1.4 What the agent has to work with

- **Tools.** `apps/worker/src/tools.ts` registers on the order of 100 or more tools (a regex count gave 119; treat as approximate). New tools must also be listed in `packages/shared/src/index.ts`, `apps/worker/src/mcp.ts` and `apps/worker/src/run-idle.ts` (`CLAUDE.md`).
- **Plugin safety.** Every class and property the plugin writes is on an allowlist in `apps/apple-plugin/src/Commands.luau`. `run_code` is refused (`docs/PLUGIN-RELEASE.md`).
- **Libraries.** A stored UI library (5,277 CC0 PNGs plus 77,076 Creator Store UI image ids), a model library, an FX library (126,780 playable audio ids; 22 VFX presets), and the owner library (3.4) (`docs/autonomy/DECISIONS.md` D-UILIB-2, D-UISTORE-1, D-FXLIB-1).
- **Knowledge.** Docs RAG (8,326 chunks at launch) plus Phase R: 23 cited research notes, 1,025 passages in live search, 23 auto-pushed skill cards, 519 look-up skills (`git log` commit 17be2ee6; `planning/sections/02-owner-directives-and-session-history.md` §2.3).
- **Checkpoints.** A restore returns real content (instances, scripts, properties). It was proven live on 2026-09-29 (`docs/autonomy/CURRENT_STATE.md`, G11).

### 3.1.5 Plans, credits and what users pay

**Users pay nothing today.** Stripe checkout is not live. `CREDIT_PURCHASE_LIVE = false` and no `mode=payment` checkout exists anywhere (`packages/shared/src/index.ts`). Subscription checkout works in Stripe test mode only for an allow-list of admins (D-PAY-2) (`docs/autonomy/DECISIONS.md`). V3 holds live billing and public plugin distribution until a new owner instruction (`docs/autonomy/v3/Apple_RbxAI_HANDOFF_V3.md` §8).

**The plan ladder as coded.** Plan ids are stored in QuotaDO and mapped to Stripe prices, so ids stay `free`, `builder`, `studio` and `enterprise`, while the display names are Free, Pro, Max and Enterprise (`packages/shared/src/index.ts`, `PLAN_COPY`).

| Plan (id) | Price | Credits per day | Credits per month | "Builds" per month at 77 credits | Notes |
|---|---|---|---|---|---|
| Free (`free`) | $0 | 231 | 2,310 | about 30 | Monthly cap bites first: 10 full days |
| Pro (`builder`) | $12 per month | 416 | 12,600 | about 163 | "About 5x the Free allowance" |
| Max (`studio`) | $40 per month | 700 | 21,000 | about 272 | "About 9x" |
| Enterprise (`enterprise`) | negotiated | 833 | 25,000 | about 324 | Not self-serve |

Source for the whole table: `packages/shared/src/index.ts` (`PLAN_LIMITS`, `PLAN_COPY`, `CREDITS_PER_BUILD`, `buildsPerMonth`). Prices are the owner's own, taken from a design artifact on 2026-09-14 (`docs/DECISIONS.md` ADR-019).

How the ladder behaves:

- **Every plan uses the same engine.** Plans differ only in allowance. Beyond the allowance and commercial terms, nothing is gated by plan: no feature, mode, project or checkpoint limits (`packages/shared/src/index.ts`, `PLAN_FEATURES` comment; `packages/shared/src/models.ts`).
- **Credits are a rate, not a balance.** The allowance resets at midnight UTC and does not roll over. Purchased credits (not yet sellable) would be a separate non-expiring balance spent only after the allowance. The smaller of the daily and monthly limits is the one the user has (`apps/worker/src/quota-math.ts`).
- **Charging model.** One credit is taken up front. The run then settles against measured neurons: `creditsForNeurons(neurons) = max(1, ceil(neurons / 30))` (`packages/shared/src/index.ts`, `MODE_INFO` comment; `apps/worker/src/pricing.ts`). Out of credits mid-run, the run stops and keeps what it finished. A stopped run is refunded (Stop refunded 21 credits live on 2026-09-29) (`docs/autonomy/CURRENT_STATE.md`). Apple's own memory housekeeping counts against the global budget but is not charged to the user (`docs/COST-MODEL.md`).
- **Owner bypass.** Accounts listed in `OWNER_USER_IDS` can switch their own account to unmetered credits (`POST /api/me/owner-credits`). The owner's runs never touch the ledger (`apps/worker/src/index.ts`; `apps/worker/src/do/quota.ts`, `/set-unmetered`). Admins can also grant a temporary credit balance (`/api/admin/grant-credits`).
- **Support promise.** Email only, no response time promised (`packages/shared/src/index.ts`, `PLAN_SUPPORT`, `SUPPORT_EMAIL`).

---

## 3.2 Unit economics as implemented

### 3.2.1 Model cost

| Item | Value | Source |
|---|---|---|
| Model | `@cf/zai-org/glm-5.3-flash` on Workers AI, through AI Gateway | `packages/shared/src/models.ts`; `apps/worker/src/gateway.ts` |
| Input price | $0.15 per million tokens | `apps/worker/src/pricing.ts` (`MODEL_PRICES`) |
| Cached input | $0.03 per million tokens (the only Workers AI row with a cached rate) | same |
| Output | $0.50 per million tokens | same |
| Neuron price | $0.011 per 1,000 neurons ($0.000011 each) | `apps/worker/src/pricing.ts` (`USD_PER_NEURON`) |
| Context and output | 1,310,720 token context, 6,500 max output tokens, vision on, native tools | `packages/shared/src/models.ts` |

My arithmetic from those rows: about 13.6 neurons per 1,000 uncached input tokens, 2.7 per 1,000 cached, 45.5 per 1,000 output tokens. Cloudflare reports exact neurons per call and the ledger bills from that figure (`docs/COST-MODEL.md`). A warm agent step re-sends a large fixed prefix; about 90% of input was cache-served in a measured run, so a warm step costs 60 to 155 neurons, which is 2 to 5 credits (`docs/autonomy/PRODUCT_HYPOTHESES.md` H-6; `docs/COST-MODEL.md`).

### 3.2.2 Neuron-to-credit mapping

- **1 credit = 30 neurons = $0.00033** (`packages/shared/src/index.ts`, `NEURONS_PER_CREDIT = 30`). So 1,000 credits cost about $0.33 of inference.
- **The published "build" unit is 77 credits** (2,300 neurons, about $0.025). It was measured on 2026-08-30 as about 16 steps at about 145 neurons plus one or two visual critiques (`packages/shared/src/index.ts`, `BUILD_NEURONS`, `CREDITS_PER_BUILD`; `docs/COST-MODEL.md`). The pricing page and plan matrix divide allowances by this number.
- **Price table rule.** An unpriced model is refused before it runs. Where Cloudflare's two primary pages differ by rounding, the higher rate is used (`apps/worker/src/pricing.ts`).

### 3.2.3 Caps and ceilings

| Cap | Value | Status | Source |
|---|---|---|---|
| Per model call (per step) | 1,200 neurons (about 40 credits, about $0.013) | Binding | `apps/worker/src/pricing.ts` (`MAX_NEURONS_PER_REQUEST`); `packages/shared/src/models.ts` (`maxNeuronsPerStep`) |
| Steps per run | 1,000 | Binding | `apps/worker/src/do/session.ts` (`MAX_RUN_STEPS`) |
| Terrain writes in a row | 24 | Binding | `apps/worker/src/terrain-streak.ts` (D-TERRAIN-1) |
| Cloudflare free neurons | 10,000 per day, service-wide (about 333 credits) | Provider-given | `apps/worker/src/pricing.ts` (`FREE_NEURONS_PER_DAY`) |
| Global daily billable neurons | 1,000,000,000 (about $11,000 per day) | **Effectively unlimited.** Lifted on 2026-09-29, owner: "No Apple cap" | `apps/worker/src/pricing.ts`; `docs/COST-MODEL.md` |
| Global monthly billable neurons | 30,000,000,000 (about $330,000) | **Effectively unlimited** | same |
| Third-party model ceiling | $5 per day, $60 per month | Unused; V3 removed third-party models | `apps/worker/src/pricing.ts` |
| Per-account credits | 231 to 833 per day, 2,310 to 25,000 per month | Binding for customers | `packages/shared/src/index.ts` |
| Per-account request rate | 240 per minute per account, 400 per minute per IP on plugin poll | Binding | `docs/COST-MODEL.md` |
| Provider throughput | Workers AI error 3021: about 30 successful requests per minute measured for GLM 5.3 Flash | Binding at scale | `docs/COST-MODEL.md` ("Known limitation") |

The history of the global cap matters for planning. It was 15,000 neurons per day (about $5 per month maximum), then 90,000 on 2026-09-20 because "every build on the live product" was refused, then removed on 2026-09-29 after it stopped a build mid-run (`apps/worker/src/pricing.ts` comments; `docs/autonomy/DECISIONS.md` D-SPEND-DAY-1). The hard maximum bill in `docs/COST-MODEL.md` is now **$330,005 per month**. The only bounds are the per-step cap, the per-account allowances and Cloudflare billing itself. AI Gateway is on Standard billing, which has uncapped overage, so `BudgetDO` is the only application-side guard (`~/.claude/projects/-Users-moshe-Developer-RbxAI/memory/apple-zero-cost-architecture.md`).

### 3.2.4 What a typical build costs in credits (measured)

All credit numbers below are ledger credits shown by the run. Dollar figures are my conversion at $0.00033 per credit and exclude memory housekeeping, which is not charged to users.

| Work | Credits | Steps | Time | USD | Source |
|---|---|---|---|---|---|
| Owner bench baseline, 26 items judged | 3,423 total, mean 131, median 47 | | | $1.13 total | `packages/evals/owner-bench/results/2026-10-02-baseline.json` |
| Single objects (chest, pet, donut, sword, jukebox, balloon) | 1 each | 3 | 21 to 97 s | $0.0003 | same |
| Silly and modify items | mean 27 and 50 | 7 and 15 | 72 and 140 s | $0.01 to $0.02 | same |
| UI items | mean 85 (11 to 184) | 20 | 131 s | $0.03 | same |
| System items (coins, shop, checkpoints, day-night) | mean 184 (47 to 344) | 39 | 237 s | $0.06 | same |
| Map items (3 judged) | 434 to 584 (mean 504) | about 97 | about 25 min | $0.14 to $0.19 | same; `packages/evals/owner-bench/BASELINE.md` |
| 10-stage obby (game item) | 582 | 124 | 956 s | $0.19 | same |
| Same 11 object and silly items, baseline code | 139 total, score 7.09 of 18 | | | $0.05 | same |
| Same 11 items with self-check on | **2,273 total (mean 207), score 9.36 of 18** | | mean 243 s | $0.75 | `docs/handoff/2026-10-04/bench-2026-10-04-selfcheck.log` |
| 30-stage obby (live V3 check) | about 170 | 30 | | $0.06 | `docs/autonomy/CURRENT_STATE.md` |
| Candy Garden v1 (Grow a Garden style, finished) | about 1,049 | 205 | | $0.35 | same |
| Candy Garden v2 (three runs kept) | about 1,790 | | about 60 min for run 1 | $0.59 | same |
| Phase T game 1, rounds 2 and 3 | 82 and 192 | 10 and 44 | 245 and 298 s | $0.03 and $0.06 | `research/roblox/phase-t/t1-round2/causes.md`, `t1-round3/causes.md` |

### 3.2.5 What the numbers say

1. **Cost to serve is small.** A finished game-sized build is roughly $0.35 to $0.60 of inference. The owner's 10,000-credit testing budget (`planning/sections/02-owner-directives-and-session-history.md` §2.1) is about $3.30 of Cloudflare spend. His budget worry reads as credits, not dollars. Whether he knows this is unknown.
2. **Plan margins at full use** (my arithmetic from `docs/DECISIONS.md` ADR-019, whose "costs to serve" column matches):

   | Plan | Inference at full monthly use | Price | Gross margin before Stripe fees and tax |
   |---|---|---|---|
   | Free | $0.76 | $0 | negative $0.76 per active user |
   | Pro | $4.16 | $12 | $7.84 (65%) |
   | Max | $6.93 | $40 | $33.07 (83%) |

   Stripe fees, tax and support cost are not modelled in the repo (I found no figure).
3. **The "builds per month" claim is not what users will experience.** The pricing page sells about 163 builds a month on Pro by dividing by the 77-credit build of 2026-08-30. A real game costs 1,000 to 1,800 credits, which is 13 to 23 of those "builds". Pro's 12,600 credits is then about 7 to 12 full games a month, and Free's 2,310 is about 1 to 2. The site's own estimator and `perBuild` switch use the 77-credit unit (`apps/site/src/pages/pricing.astro`).
4. **The daily cap is smaller than one game.** A 1,000-credit game exceeds the daily allowance of every self-serve plan (Free 231, Pro 416, Max 700, even Enterprise 833). A game spans several days, or the run stops at quota. No customer-facing test of this exists, because the owner's account is unmetered (`apps/worker/src/do/quota.ts`).
5. **The self-check made object-sized work about 16 times dearer.** Those 11 items went from 139 to 2,273 credits while the judge score rose from 7.09 to 9.36 out of 18 (sources in the table above). The self-check is an in-product look-and-critique loop that V3 had removed (Q21) and the 2026-10-02 goal re-added (3.3.3).
6. **Free tier exposure is bounded per user.** 1,000 free users at full use cost about $760 a month (2,310 credits each). Signup abuse is bounded by Turnstile and per-IP limits (`apps/worker/src/turnstile.ts`, `apps/worker/src/abuse.ts`) and, before launch, by the approved-accounts gate.
7. **Fixed costs.** Workers Paid is $5 per month. Supabase is on Free (leaked-password protection needs Pro at $25 per month, an open owner decision, Q-003) (`docs/COST-MODEL.md`; `docs/autonomy/OWNER_QUEUE.md`). GitHub Actions minutes ran out once on a private repo; the repo went public on 2026-09-24 (`docs/autonomy/OWNER_QUEUE.md` Q-001).
8. **Tooling cost is separate.** The owner runs Claude and Codex plans to build the product; he ordered aggressive Claude usage cuts on 2026-09-23 and 2026-09-29 (`docs/autonomy/DECISIONS.md` D-COST-1; `~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/usage-economy.md`).

---

## 3.3 Vision history

### 3.3.1 Timeline

Dates are the repo's commit or document dates (owner local time, Israel, where a time is given).

| Date | Event | What it added or dropped | Source |
|---|---|---|---|
| 2026-08-30 | **Golem v0.** Founding ADRs. Brand "Golem"; modes Clay, Stone, Rune; free tier with hard quotas and "Credits" energy; Pro as waitlist; no payments; target about $5 a month, open-weight models only, "no purchases without approval" | Born as a zero-cost project. Same day: GLM 5.3 Flash replaced gpt-oss-120b; BudgetDO hard maximum $10.06 per month | `docs/DECISIONS.md` ADR-001 to ADR-008; `git log` 138b9eb4, ff8e9224 |
| 2026-08-31 | User-facing modes become **Plan / Agent / Super Agent**; agent must see its own work (visual loop, composition gate) | Added visual self-critique. Clay/Stone/Rune become internal | `docs/DECISIONS.md` ADR-012, ADR-018; commit 61c3f576 |
| 2026-09-14 | **Rename to Apple.** Owner says he always wanted "a SaaS in every sense, with subscriptions and credits". Stripe subscriptions and a credit ledger land. Plans $0 / $12 / $40 | Dropped zero-cost (reversed three times in one session). Added billing. Apple LoRA v1 trained: a regression, not promoted | `~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/apple-zero-cost-architecture.md`; commits 7fb753ae, 775219a3; `docs/DECISIONS.md` ADR-019 |
| 2026-09-15 | Apple worker stands up beside golem. Sparks renamed Credits. ADR-021: no organisations, no workspaces. Customer's own Roblox key | Dropped 73 backlog items as "not planned" | commits 7ffa7add, 04d38008, 32b99d55; `docs/DECISIONS.md` ADR-021 |
| 2026-09-18 | **Apple vs Apple MAX.** "Apple is a separate, limited free model; Apple MAX is for paid subscribers." Up to $20 for training and serving | Added a model-tier wall and a training thesis | `docs/DECISIONS.md` ADR-022 |
| 2026-09-19 to 09-24 | Plugin on the Creator Store: removed same day (09-19) for "Misusing Roblox Systems", appealed; live 09-22; version 2 removed 09-23, appeal upheld 09-24; public 404 again 09-25 | Distribution became a recurring blocker | `docs/PLUGIN-RELEASE.md`; `docs/autonomy/DECISIONS.md` D-STORE-1, D-STORE-2; `packages/shared/src/index.ts` |
| 2026-09-22 | Autonomous product-owner harness: `OWNER_PROMPT.md` ("Do not finish my vision. Own the problem."), `MISSION.md`, `ACCEPTANCE.json` | Owner steps out of routine product decisions | `docs/autonomy/OWNER_PROMPT.md`; `docs/autonomy/README.md` |
| 2026-09-23 | **D-VISION-1**, "the owner's definition of finished": 193 picks submitted; Free = Apple, Pro adds Apple MAX, Max adds Gemini 3.8 Flash and GPT-5.6; BYOK removed (it had been added hours earlier); train everything; voice; Stripe test mode; repo public after a secret scan | Peak expansion of scope | `docs/autonomy/DECISIONS.md` D-VISION-1, D-BYOK-1, D-PICKS-1 |
| 2026-09-24 | Repo public. Libraries: UI-only-from-library, FX library, model library. Blind critic on final screenshots replaces reference-image tests | Rule: Apple never draws UI by hand | `docs/autonomy/DECISIONS.md` D-UIONLY-1, D-FXLIB-1, D-GAUNTLET-2 |
| 2026-09-25 | "Focus Apple on colorful **cartoon** Roblox games" | Narrowed to cartoon-only | commit 5ff77b8c |
| 2026-09-26 | Cartoon-only removed: all genres; **owner-supplied corpus is first priority**; no LoRA | The owner library becomes central | `packages/owner-corpus/README.md`; `docs/autonomy/archive/pre-v3/MISSION.v1.md` |
| 2026-09-28 | **V3 locked.** 38 owner decisions Q1 to Q38; one engine "Apple vX"; no Plan/Agent/Autonomous; no training or LoRA; no Apple MAX; Jev dropped; live Stripe and public plugin held; pre-launch accounts only | Largest scope reset before 10-04 | `docs/autonomy/v3/Apple_RbxAI_DECISIONS_V3.md`; `docs/autonomy/DECISIONS.md` D-V3-1, D-V3-2 |
| 2026-09-29 | V3 implemented in one day (gates G01 to G16 touched): single engine, modes removed, approval gate, Studio hard gate, Stop/Continue, Generate Branding. Owner: "No Apple cap". **Studded** becomes the default look. Per-turn Details removed. Owner-library tools shipped | Studded specialty arrives | `git log` c839d7af, 38efea2e, e3b4b23d, f642b602, d2c17f77, c6f74af4; `apps/worker/src/pricing.ts` |
| 2026-09-30 | Owner rejects the library-game builder ("Plants vs Brainrots but fruit"): it copied a whole world, ignored the twist, T-posed creatures. The earlier "client test pass" is revoked. New plan: components, never whole worlds | Reversed V3 §3 "reuse complete maps" | `docs/autonomy/SESSION_HANDOFF_2026-09-30.md`; `docs/autonomy/CURRENT_STATE.md` |
| 2026-10-01 | `build_object`, a lean toolset, forced studded UI; owner library connects automatically | Component-style building | `git log` 09e97ab7, 15e38fd4 |
| 2026-10-02 | **11-point `/goal`** (method: "generalize, never patch"; library at least 90% top-3 search; asset order; visual quality; website rebuilt; frontier benchmark; GitHub; giant PR) and a fixed meter. Baseline 7.27 of 18 | Replaced V3 gates as the definition of done | `git show c6a576f6:HANDOFF.md` §1.3; `packages/evals/owner-bench/BASELINE.md` |
| 2026-10-03 | Website direction: "Ember Rail" rejected; rebuild from `uhub/awesome-llm` and `ai-sdk.dev` (v4, parked) | | `planning/sections/02-owner-directives-and-session-history.md` §2.2 |
| 2026-10-04 | **The reset.** `GOAL.md`: stop the test loop and the old goals; research Roblox game-making from cited sources and feed the agent; only then build 3 to 5 real games. Same day: game 1 scored 2, 1.5, 1.5; a stronger-model comparison was started and cancelled; model stays GLM 5.3 Flash | Current vision | `GOAL.md`; `research/roblox/phase-t/MODEL-COMPARISON.md` |

### 3.3.2 The named versions and what each carried

| Name | Period | Core idea | Dropped later |
|---|---|---|---|
| **Golem** | 2026-08-30 to 09-14 | Free AI builder on open weights, about $5 a month, Clay/Stone/Rune, no payments | Name, zero-cost thesis |
| **Apple** (SaaS) | 2026-09-14 on | Subscriptions and credits; Free/Builder/Studio plans; Plan/Agent/Super Agent modes | Super Agent naming, modes |
| **Apple vs Apple MAX** | 2026-09-18 to 09-28 | Free trainable model vs paid MAX; Max tier with Gemini and GPT; LoRA training to v33 | All of it, by V3 |
| **V1** | 2026-09-22 to 09-27 | The autonomous-owner handoff era (Claude session `97464f8d`), Apple MAX and training, byte-identical corpus rebuild | Superseded by V3 |
| **V2** | about 2026-09-27 to 09-28 | Codex continuation and analysis of the Claude export; owner library reconstruction | Superseded by V3 |
| **V3** | locked 2026-09-28 | One engine "Apple vX"; complete game from one line; 23-component evidence UI; Generate Branding; owner library plus Roblox-specific sources; held launch | Replaced by the 10-02 goal, then `GOAL.md` |
| **Studded look** | default from 2026-09-29 | Plastic, studs on top, saturated colour blocking; targets Steal a Brainrot, Grow a Garden, Arm Wrestle Simulator quality | Memory notes on the "studded visual bar" were deleted on 10-04 |
| **Owner library** | 2026-09-26 on | 565 games and about 97k assets as the first-priority source (3.4) | Whole-world reuse, rejected 09-30 |
| **Phase R / Phase T** | 2026-10-04 | Research and feed, then real games judged by a blind critic | Benchmark loop retired |

The V1 and V2 date ranges above are my inference from the V3 history. V1 and V2 are not stored as files in the repo; they exist only as references in the V3 package (`docs/autonomy/v3/Apple_RbxAI_HISTORY_V3.md`, `docs/autonomy/v3/START_HERE.md`). The "handoffs" of 2026-10-02 are different documents from V1/V2.

### 3.3.3 Decisions that were reversed

| # | Earlier decision | Later reversal | Sources |
|---|---|---|---|
| 1 | Zero-cost, free-tier-only (08-30) | SaaS with subscriptions (09-14) | ADR-006; memory `apple-zero-cost-architecture.md` |
| 2 | Plan / Agent / Super Agent (08-31) | Apple vs Apple MAX (09-18); then no modes at all (V3, 09-29) | ADR-018, ADR-022; commit c839d7af |
| 3 | Apple MAX and third-party models as paid tiers (09-23) | Removed (09-28 to 09-29) | D-VISION-1; D-V3-1 |
| 4 | BYOK (morning 09-23) | Removed the same afternoon | D-BYOK-1 superseded by D-VISION-1 |
| 5 | "Train everything trainable", LoRA to v33 (09-23 to 09-26) | Cancelled (09-28) | D-VISION-1; `docs/autonomy/v3/Apple_RbxAI_HISTORY_V3.md` |
| 6 | No public plugin updates until final (09-23 01:35) | Publishing unrestricted (09-23 14:30); then public distribution held (09-28) | D-STORE-2; D-VISION-1; V3 §8 |
| 7 | Cartoon-only (09-25) | All genres (09-26); studded default with all genres (09-29) | commit 5ff77b8c; `docs/autonomy/archive/pre-v3/MISSION.v1.md` |
| 8 | Props: parts fallback (09-23); never build from scratch (09-24) | Asset order as a capability, no word lists (10-02) | D-MODELLIB-1, -2, -3 |
| 9 | "Apple never draws UI by hand", UI only from the library (09-23) | Studded UI builder; `studded` theme forbids `insert_ui_component` (09-29 to 10-01) | D-UIONLY-1; `packages/shared/src/ui-theme.ts` |
| 10 | Reference-image tests; then blind critic (09-24); then in-product critic removed (V3 Q21, 09-28) | Self-check re-added (10-02); blind critic is the core quality loop (10-04) | D-GAUNTLET-2; V3 Q21; `docs/handoff/2026-10-04/`; `GOAL.md` |
| 11 | Short outputs, detail hidden (09-23) | Codex-style visible evidence, 23 components (09-28) | D-UX-2; V3 UI-LATEST |
| 12 | Per-turn Details removed (09-29); "real users never see technical things" (09-30) | Evidence renderers built but unmounted | `docs/autonomy/CURRENT_STATE.md`; `docs/autonomy/SESSION_HANDOFF_2026-09-30.md` |
| 13 | V3 §3 allows reusing complete maps (09-28) | Forbidden: build component by component (09-30) | `docs/autonomy/SESSION_HANDOFF_2026-09-30.md` |
| 14 | Spend caps: 15k neurons per day, then 90k | No cap (09-29) | `apps/worker/src/pricing.ts` |
| 15 | Pricing-page "Priority during busy periods" | Removed (09-20): the feature never existed | `packages/shared/src/index.ts` (`PLAN_COPY.builder`) |
| 16 | Stronger build model comparison (10-04, owner chose "compare 3") | Cancelled mid-run; back to GLM 5.3 Flash | `research/roblox/phase-t/MODEL-COMPARISON.md` |
| 17 | Site: deep blue, then near-black one-accent, then glass aurora, then Ember Rail, then v4 black-and-white | Five directions in three weeks | ADR-020; commit 6662c41b; D-GLASS-1; section 02 §2.2 |
| 18 | 11-point goal, fixed meter, benchmark loop (10-02) | Retired by `GOAL.md` (10-04) | `GOAL.md` |

Pattern for planners: the owner changes direction fast and decisively. Rejected work was usually rejected on how it looks and plays, not on its tests (`~/.claude/projects/-Users-moshe-Developer-RbxAI/memory/visual-quality-bar.md`).

### 3.3.4 The vision today

`GOAL.md` (set 2026-10-04): "Make Apple's agent know Roblox game-making as deeply as a top professional studio does, and then prove it by building real, complete games from scratch." Phase R feeds research into knowledge, skills and a short prompt. Phase T builds 3 to 5 games in different genres, each playable and publish-ready, with core loop, progression, onboarding, UI, sound, VFX and monetisation hooks. Parked, not deleted: site v4, web v4, library search at 86% top-3, the repo reorganisation and worker fixes (`handoff/*` branches; `docs/handoff/2026-10-04/`). The owner chose "plugin release, then deploy, then build games" after research round 2 (`planning/sections/02-owner-directives-and-session-history.md` §2.2).

What survives from V3 in code and copy: single engine, English-only, one project one game, Studio hard gate, Stop/Continue, checkpoints, Generate Branding, pre-launch approved accounts, held billing. Whether these are still binding product requirements or only history is a planner question (3.7). `GOAL.md` says the V3 scope "stays in git as history only".

---

## 3.4 The owner library

### 3.4.1 What it is

A private, local collection of Roblox games and assets supplied by the owner. I measured the local files on 2026-10-04 (`~/Library/Application Support/Apple/owner-library/`, 1.7 GB; `sources/` is 675 MB):

| Item | Count | Source |
|---|---|---|
| Source games | 565 | `sources.json` |
| Asset records / verified round-trips | 97,428 / 97,265 (0 failed) | `assets.json`, `verify.json` |
| Roblox content ids found | 99,941 | `verify.json` |
| By kind | models 35,327; scripts 19,883; UI 13,244; sounds 12,307; effects 6,872; animations 5,486; tools 3,969; maps 340 | `assets.json` field `k` |
| Families | 504 | `families.json` |
| UI kits and screens | 367 kits, 18,979 screens | `ui.json` |
| Systems | 54 | `systems.json` |
| Scripts across all games | 225,900 | `catalog.json` |
| Knowledge cards | 182 files (handoff says 180 cards plus 8 genre syntheses) | `knowledge/`; `docs/autonomy/SESSION_HANDOFF_2026-09-30.md` §4 |

Earlier stages: 438 unique sources, 9,619,989 binary nodes (`docs/autonomy/v3/Apple_RbxAI_HISTORY_V3.md`). A second owner folder added 127 files on 2026-09-30 (`~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/owner-library-v2.md`).

### 3.4.2 How it is served

- **Code.** `packages/owner-corpus/` (Python, SQLite, Luau) is gitignored and private, because the repo is public (`.gitignore`; `docs/autonomy/DECISIONS.md` D-V3-3). Main-branch files in the worker: `apps/worker/src/owner-corpus.ts`, `owner-corpus-routes.ts`, `local-owner-corpus.ts`.
- **Gateway.** `packages/owner-corpus/gateway.py` runs on the owner's Mac at `127.0.0.1:63747`. It is read-only, loopback-only, with an ephemeral bearer key. **The cloud worker cannot call it.** The paired plugin is the bridge (`packages/owner-corpus/gateway-README.md`; `CLAUDE.md`). The gateway "does not exist in CI or the cloud".
- **Cloud copy.** Approved accounts read a "release library" from D1 tables (`owner_corpus_components`, FTS) plus component blobs, namespaced by `RELEASE_LIBRARY_OWNER_ID` and `LIBRARY_APPROVED_USER_IDS` (`apps/worker/src/owner-corpus.ts`). Publishing it needs the owner's `APPLE_OWNER_JWT` (`docs/autonomy/CURRENT_STATE.md`, G05 note). How much is actually in the cloud is unknown.
- **Classification and search.** `packages/owner-classify` exists only on `handoff/search-90`, not `main`. It gives every item a type, tags, size, colour and quality score, with BM25 plus optional dense search. Top-3 hit rate was 76% at the 2026-10-02 handoff and 86% per `GOAL.md` against a 90% target (`git show handoff/search-90:packages/owner-classify/README.md`; `GOAL.md`). Descriptions are templates unless a model sampled them; no local model was installed (same README).

### 3.4.3 Permissions

"Commercial use is owner-attested; no license investigation was performed." (`packages/owner-corpus/README.md`.) The worker refuses a component manifest unless `ownerAttested: true` (`apps/worker/src/owner-corpus.ts`, `parseOwnerManifest`). V3 records the owner's commercial-rights assertion as "owner-provided provenance, not an independent rights audit and not blanket proof for unrelated external downloads" (`docs/autonomy/v3/Apple_RbxAI_HANDOFF_V3.md` §4). Pre-launch, the library is shared only with the owner and `LIBRARY_APPROVED_USER_IDS`. A public gallery of the corpus is frozen and the full backend corpus "is still not a public gallery" (V3 §6, Q13).

### 3.4.4 How the agent uses it

- **Tools:** `browse_owner_library` (list, find and per-kind search across all games), `import_owner_library`, `recreate_owner_game`, `install_owner_system`, `insert_owner_component`, `preview_library_models` (`packages/shared/src/index.ts`; `docs/autonomy/CURRENT_STATE.md`; `docs/autonomy/DECISIONS.md` D-MODELLIB-3).
- **Asset order** (owner, 2026-10-02): library, then Creator Store (Roblox-owned and quality first), then combine and adapt, then build from scratch only as a last resort, highly detailed (D-MODELLIB-3).
- **Component plan** (confirmed 2026-09-30): split the 565 games into components with contracts, build a new map every time, build the twist for real, add code-driven Motor6D animation (`docs/autonomy/SESSION_HANDOFF_2026-09-30.md` §2; `docs/autonomy/CURRENT_STATE.md`). Status: not shown complete.
- Imported scripts are data until reviewed; nothing is executed at import (`packages/owner-corpus/README.md`).

### 3.4.5 Limits

- **Local only.** It cannot serve customers until the cloud copy exists. V3 requires production to run "independent of the owner's Mac" (V3 §4); not evidenced as done.
- **Dead scripts.** 68k of 226k scripts are empty or stripped (saveinstance dumps), so those UIs never respond as imported. Most brainrot cores use DataStores that hang in unpublished places (`~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/owner-library-v2.md`).
- **Private animations and audio.** Original creators' animations are private ("Animation failed to load"), so creatures T-pose. Private sound ids fail with "not authorized"; a `private-audio` pass silences them (`docs/autonomy/SESSION_HANDOFF_2026-09-30.md` §1, §3).
- **Terrain voxels are not copied** (children are) (`docs/autonomy/CURRENT_STATE.md`).
- **Indexed is not playable.** The V3 history separates indexed, packaged, insertable and verified; a media id is not a downloaded file (`docs/autonomy/v3/Apple_RbxAI_HANDOFF_V3.md` §4).
- **Provenance and rights.** The memory note calls some content "saveinstance dumps", which are copies of others' published games. The repo contains no rights audit. Distribution of derived content to customers is therefore an open legal question (3.6).
- **Quality of use.** Past use produced a knife for a treasure chest, a Doge head for a robot pet and a 1:1 copied map (`packages/evals/owner-bench/BASELINE.md`; `docs/autonomy/SESSION_HANDOFF_2026-09-30.md`).

---

## 3.5 Competitors and positioning

### 3.5.1 Roblox's own tools (the real competition)

Sources: `research/roblox/09-tools-ecosystem.md` and `11-rdc-2026-and-roadmap.md` (both researched 2026-10-04) and `docs/research/competitors.md` (2026-08-30, written under the Golem name).

| Roblox feature | Status and date | Source |
|---|---|---|
| **Assistant** (in Studio, free, multiple cloud-saved chats per place, screen-capture subagent, edits scripts and objects, inserts Creator Store assets) | Shipped. Planning Mode GA 2026-04-15/16. Bring-your-own-key for Anthropic, OpenAI, Gemini from early March 2026. No published chat quota; community reports limits hit quickly (DevForum 2026-07-18) | `research/roblox/09-tools-ecosystem.md` §A, §B |
| **Built-in Studio MCP server** | Built in since 2026-03-05; multi-agent update 2026-08-19. Clients named: Claude Code, Codex, Cursor and others. Tools: scripts, data model, Luau in Edit/Client/Server, mesh and texture generation, playtest, screenshots | `research/roblox/11-rdc-2026-and-roadmap.md`; `09-tools-ecosystem.md` §C |
| **Playtest Agent** | Studio beta since 2026-04-09; Roblox-run model, daily cap, max 50 turns, false positives, cannot test real-time combat or vehicles. Multiplayer version demoed at RDC26 (2026-09-10 to 12), no date | same |
| **Cube / mesh, procedural model, texture generation** | Mesh GA; 50 procedural models per rolling 24 h; 5 textures plus 25 previews per day (beta). Open Cube weights are research-only licensed | `09-tools-ecosystem.md` §B; `docs/research/competitors.md` §1.3 |
| **Roblox Build** (mobile, prompt to playable starter game) | Public alpha since 2026-07-28 in New Zealand (testers 9+, published games for age-checked 16+); expanded to Serbia and Singapore; about 9,000 games published; 71% of creators never used Studio; free base tier with paid options; shares backend and chat history with Studio | `11-rdc-2026-and-roadmap.md`; `docs/research/competitors.md` §1.6 |
| **Analytics and Experiment agents, Scene Generator** | Announced; late 2026 or later | `11-rdc-2026-and-roadmap.md` |
| Adoption | Nearly half of the top 1,000 creators use Assistant or MCP; Assistant usage +20% quarter on quarter (Roblox's own figures) | `11-rdc-2026-and-roadmap.md` |

### 3.5.2 Third parties

From `docs/research/competitors.md` (2026-08-30; pricing marked unverified where noted there):

| Product | What it does | Price signal |
|---|---|---|
| Lemonade (lemonade.gg) | Prompt to Roblox game plus Studio plugin; claims 500K+ creators | about $20 per month for 100 prompts (unverified). A HAR of its UI was captured on 2026-09-27 as an observation only (`docs/autonomy/v3/Apple_RbxAI_FLOW_V3.json`) |
| PromptBlox | Prompt to downloadable `.rbxlx` | $0 / $9.99 / $14.99 / $34.99 with daily and monthly credit caps (verified) |
| Nilo | Browser 3D asset suite with export to Studio | "Bits" credits (price unknown) |
| Ropanion and other Studio plugins | In-Studio agent, bring your own key | Free or freemium |
| Claude Code, Cursor or Codex plus Roblox MCP | The pro-developer route; DIY | $20+ per month for the AI tool |
| Rosebud AI | Prompt to browser game, not Roblox | $19.99 per month |

### 3.5.3 How Apple differs, and where it overlaps

My synthesis, built from the sources above and from the V3 scope:

- **Different in design.** Apple is a hosted agent with its own web workspace, credits and typed-op plugin. It is not a client of Roblox's MCP server (ADR-004: "real plugin, typed op protocol"; its `mcp.ts` goes the other way and exposes read-only project tools to outside clients) (`docs/DECISIONS.md`; `apps/worker/src/mcp.ts`). The agent runs on a cheap open-weight model, GLM 5.3 Flash, paid in credits, with no bring-your-own-key.
- **Different in intended product.** One line to a complete, studded-style game, using a 565-game private library, plus checkpoints, branding generation and a game that runs without Apple (V3 §1, §7).
- **Overlaps with Roblox.** Planning, building in Studio, playtesting, asset and mesh generation, and a "describe it, get a game" flow. Roblox ships these free and first-party, and Build targets the same beginner.
- **Competitors' own positioning angles** (from `docs/research/competitors.md` §4): "verified working game, not a starter", a web-plus-Studio bridge, and "autonomy at hobbyist prices". The first angle is unproven, since 0 of 5 internal game rounds passed a blind critic.
- **Where Apple has no evidence of an edge.** Quality, the stated moat, is the weakest measured area: baseline 7.27 of 18, self-check 9.4 of 18 on 11 items, game 1 at 2 and 1.5 out of 10 (3.2.4, 3.3.1).

---

## 3.6 Business risks visible in the repo

| # | Risk | Evidence | Source |
|---|---|---|---|
| 1 | **Creator Store policy for the plugin.** The plugin was removed for "Misusing Roblox Systems" at least twice (2026-09-19 and 09-23); triggers were "never identified". The store listing is not live (`STUDIO_PLUGIN_STORE_LIVE = false`; public 404 on 2026-09-25) | `docs/PLUGIN-RELEASE.md`; `packages/shared/src/index.ts` |
| 1a | Plugin ops that look risky to a reviewer: `InsertService:LoadAsset` use; on the `research-feed` and `fix-r3` branches also a `DataModel:GetObjects` insert path, which D-MODELLIB-1 had banned because of the earlier removal | `apps/apple-plugin/src/Commands.luau` (both refs); `docs/autonomy/DECISIONS.md` D-MODELLIB-1 |
| 1b | No CI publishing is possible. Every release is a human clicking "Publish as Plugin, overwrite". Studio never auto-updates plugins, so old versions persist. The listing sits under a user account other than the owner's (Shahar474) | `docs/DECISIONS.md` ADR-017; `docs/PLUGIN-RELEASE.md` |
| 1c | Roblox only lets `LoadAsset` load Roblox-owned models; 20 of 20 free third-party models were refused in Studio. This caps what the Creator Store path can supply | `docs/autonomy/DECISIONS.md` D-MODELLIB-1 |
| 1d | Roblox brand rules: "Apple" avoids the Roblox name, but a "not affiliated" disclaimer and no Roblox logo are needed. A community report (2026-07-25) of a 7-day ban linked to Assistant mesh generation is single-source | `docs/research/competitors.md` §3; `research/roblox/09-tools-ecosystem.md` §A |
| 2 | **Cost exposure.** Global caps are removed; the hard maximum is $330,005 per month; AI Gateway has uncapped overage; one account can run 1,000 steps at up to 1,200 neurons each (about $13). No revenue offsets spend because billing is off | `apps/worker/src/pricing.ts`; `docs/COST-MODEL.md`; memory `apple-zero-cost-architecture.md` |
| 2a | A credit allowance is a rate promise, but a full game costs more than a day's credits on every plan (3.2.5) | `packages/shared/src/index.ts`; table in 3.2.4 |
| 3 | **Dependency on Workers AI.** One model for everything (build, vision judge, self-check). No LoRA on it, no fallback provider, no zero-data-retention claim (`zdr: false`). Price or availability change hits all work. Throughput about 30 requests per minute measured. A small model "cannot carry a multi-step creative build" on its own (session finding) | `packages/shared/src/models.ts`; `docs/model-serving-reality.md`; `docs/COST-MODEL.md`; `planning/sections/02-owner-directives-and-session-history.md` §2.3 |
| 4 | **Solo, non-technical, young owner.** `docs/GO-LIVE.md` states "The owner is 15", so Stripe needs an adult account holder or waiting until 18. Support is one Gmail address. The codebase is agent-built (2,257 commits on `main`) and many tests assert on source text, so changes are fragile (`CLAUDE.md`). Direction changes weekly (3.3.3) | `docs/GO-LIVE.md`; `packages/shared/src/index.ts` (`SUPPORT_EMAIL`); `CLAUDE.md` |
| 5 | **Quality and promise risk.** The product sells complete games; measured results are 2, 1.5, 1.5 out of 10 and a 7.27 of 18 baseline. Pricing copy says "quality-gated builds" while V3 removed the gate | `research/roblox/phase-t/`; `packages/evals/owner-bench/BASELINE.md` |
| 6 | **Library rights.** Owner-attested only; no rights audit; some content is described as saveinstance dumps. Serving it to paying customers is a legal question the repo does not answer | `packages/owner-corpus/README.md`; memory `owner-library-v2.md` |
| 7 | **Repo is public** (since 2026-09-24) with the full product source. A load-test password leaked in git history; 30 accounts were banned rather than deleted. The private library had to be stripped from history | `docs/autonomy/DECISIONS.md` D-SEC-LOAD-1, D-V3-3 |
| 8 | **Branch drift.** The shipped product is on `research-feed`/`fix-r3`, not `main`; 158 and 163 commits ahead. `main` carries the old `golem` scope names | git counts above |
| 9 | **Infrastructure still named `golem`** (worker, D1, KV, wire strings). The legacy worker was a live payments dependency on 2026-09-20 | `CLAUDE.md`; `docs/GO-LIVE.md` |
| 10 | **Legal pages for a young audience.** Terms and privacy exist (beta, as-is). Age-handling policy (the audience includes minors, Build tests at 9+) is not stated in the files I read: unknown | `apps/site/src/pages/terms.astro`; `research/roblox/11-rdc-2026-and-roadmap.md` |

---

## 3.7 Open questions this section raises for the planners

1. **Which scope is binding?** `GOAL.md` retires V3, yet the code still enforces V3 pieces (single engine, approved-accounts gate, Studio hard gate, branding, English only). Which of these survive into the final product, and which are history?
2. **Who is the customer and what is the promise?** V3 says a beginner who can install a plugin. Roblox Build already targets prompt-to-game for beginners, free, on mobile. What can Apple do that Build and Assistant cannot, and is it provable with a blind critic?
3. **Pricing unit.** Should plans be denominated in credits, "builds" or "games"? A game costs 1,000 to 1,800 credits against a 77-credit "build". Today's page overstates by 13 to 23 times.
4. **Daily cap versus game size.** Raise daily allowances, add a per-game budget, or sell game packs? Do the plans' $12 and $40 prices still make sense at about $4 and $7 inference at full use?
5. **Does the self-check stay?** It raised objects-sized cost about 16 times for +2.3 points of 18. Where is the right spend per quality point, and does it conflict with V3's removal of the in-product critic?
6. **Model strategy.** The owner cancelled the stronger-model test on cost, yet the diagnosis says a small model cannot carry a long creative build. Is a second, stronger model a paid-tier feature, or is the harness expected to make GLM 5.3 Flash succeed? Dollar cost (cents per game) suggests cost is not the real constraint; does the owner know this?
7. **Credits versus dollars in the owner's mind.** His 10,000-credit test budget is about $3.30. Should budgets be restated in dollars?
8. **Launch gates.** Stripe needs an adult account holder (owner is 15). Plugin public distribution has failed twice. What is the launch path for each, and in what order (the owner chose "plugin release, then deploy, then build games")?
9. **Library rights and cloud.** Can the owner library legally be served to customers? How much of it is in the cloud today? Is the 565-game library a launch dependency or a development asset only?
10. **Plugin policy.** Is the `GetObjects` path (on `fix-r3`) acceptable given the earlier removals? Who owns the Creator Store listing (Shahar474)?
11. **Branch reality.** Which branch is the product (deployed worker)? What is the deployed `buildSha`? This section reports `main` plus branch checks only.
12. **Competitive timing.** Roblox expects Scene Generator, Analytics and Experiment agents in late 2026. Which Apple capabilities will be absorbed by Roblox first, and which depend on Apple's own library and taste?
13. **Support and trust.** One Gmail address, no response times, and a minor-run business. What minimum operational setup (terms, age policy, refunds, status page) must exist before any paying customer?
