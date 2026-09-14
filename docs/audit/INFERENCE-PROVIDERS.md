# INFERENCE PROVIDERS — the zero-recurring-cost serving decision for Apple

**Status:** decided. One recommendation, not a survey.
**Written:** 2026-09-14, against provider documentation fetched and adversarially re-verified the same day.
**Binding constraint:** zero recurring payments for the owner. Everything below is subordinate to that.

This document supersedes any plan that assumed a hosted provider would serve our own LoRA. None will, at any
free price, and the reason is the same at every vendor: custom-weight serving is the thing they sell.

---

## 1. COMPARISON TABLE

"KIND" is the classification that decides whether a thing can be planned against:
`permanent` = recurring allowance that resets and never expires · `trial` = credit- or time-bounded ·
`local` = runs on hardware we own.

| Provider | Free-tier KIND | Exact limits (verified) | Blocks or bills | Card? | Native tools | Serves OUR LoRA | Commercial OK |
|---|---|---|---|---|---|---|---|
| **Cloudflare Workers AI** (on Workers **Free**) | permanent | 10,000 neurons/day, reset 00:00 UTC; 300 rpm text-gen. ≈171 turns/day on glm-4.7-flash @4k-in/1k-out; ≈613/day on granite-4.0-h-micro; ≈65/day at a realistic 8k-in/3k-out agentic turn | **BLOCKS** on Workers Free ("N/A — Upgrade to Workers Paid"). **BILLS UNCAPPED** on Workers Paid at $0.011/1k neurons — this is the account's state today | no | yes | **NO** — adapter upload accepts only `model_type` mistral\|gemma\|llama, r≤8, ≤300 MB; and *no* LoRA-capable base has function calling | yes; model licences pass through to us |
| **Groq (GroqCloud)** | permanent (tab is literally "Free Plan Limits"; downgrade-back-to-free is documented) | Per-model, **org-level**: `gpt-oss-120b` and `gpt-oss-20b` each 30 RPM / 1,000 RPD / **8,000 TPM** / 200,000 TPD. `compound` 30/250/70K TPM. Cached tokens do not count. Each model has its **own** pool | **BLOCKS** — 429 + `retry-after`; spend limits are a paid-only feature, so the free tier has no spend surface at all | no (inferred from the upgrade gate — **confirm at signup**) | yes | **NO** — enterprise-tier only, base restricted to `llama-3.1-8b-instant`, price sales-gated | **YES** — B2B Services Agreement; §4.2 bars Groq from training on Inputs/Outputs; we retain IP in outputs |
| **Google Gemini API** | permanent, daily reset | **UNPUBLISHED.** Google removed the free-tier RPM/TPM/RPD table; the docs now say only "Specified rate limits are not guaranteed and actual capacity may vary." Third-party measurements of the same models in the same month disagree by ~75× (20 RPD vs 1,500 RPD) | **BLOCKS** — 429 RESOURCE_EXHAUSTED; a free project has no billing account attached | no | yes | **NO** — fine-tuning removed from the API with the May 2025 Gemini-1.5-Flash-001 deprecation, "no immediate plans" | Commercial yes, **but**: unpaid tier may **not** serve end users in EEA/CH/UK; free prompts are used to train Google and "human reviewers may read, annotate, and process your API input and output" |
| **OpenRouter** (`:free` slugs) | permanent | 20 RPM always. 50 RPD if credits purchased all-time < $10; 1,000 RPD if ≥ $10 (**one-time**, not recurring). Failed attempts count against quota. 19 `:free` slugs live, 18 with tools | **BLOCKS** — 429; `:free` endpoints are priced $0 so there is nothing to bill. (Separately: a negative balance 402s even on free models) | no | yes | **NO** — Private Models require the Enterprise plan *and* you host the weights yourself | yes; no reselling API access. Their own FAQ: free models are "usually not suitable for production use" |
| **Hugging Face — Inference Providers router** | permanent | **$0.10/month** in credits, Inference-Providers-only. ≈1,000 req/mo at the cheapest route; ≈205/mo on gpt-oss-120b; ≈11/mo on Kimi-K2.7-Code | **BLOCKS** — account has `canPay:false`, verified live | no | yes | **NO** — closed 139-model provider-deployed catalogue | yes, no warranty, no SLA |
| **Hugging Face — ZeroGPU Space** | permanent | **5 GPU-min/day charged to the CALLING account** (2 min unauthenticated). Free accounts may host 2 ZeroGPU Spaces (verified email + account >30 days). Gradio SDK only, 60 s default per call, no `torch.compile` | **BLOCKS** — free users get no credit overage | no | **no** — a Gradio Space is not an OpenAI tool-calling endpoint | **YES** — the only *hosted* place our adapter runs for $0 | yes |
| **Mistral La Plateforme — Free mode** | permanent | **Unpublished.** RPS / TPM / tokens-per-month visible only in the admin panel after signup. The widely-quoted 1 req/s · 1B tok/mo figures appear on no Mistral-owned page | **BLOCKS** — "A 429 means you exceeded one of them" | no | yes | **NO** — serves only adapters trained through Mistral's own API, and charges **$2/month/model storage** = recurring | yes, but **trains on your data by default** (opt-out available, must be set day one) |
| **Local — M2 Pro 32 GB, llama.cpp / MLX** | local | Hardware-bound. Measured on this chip class: 7B Q4 decode 38.86 tok/s, prefill pp512 341 t/s, 200 GB/s. Realistically **~1 concurrent serious request** | **QUEUES** | no | yes (`llama-server`) | **YES** — `--lora-scaled`, per-request `lora` field, hot-swap, `GET/POST /lora-adapters` | yes — llama.cpp / Ollama / mlx-lm are all MIT. **LM Studio is disqualified**: its ToS forbids "service bureau use, as an application service provider, or a software-as-a-service" |

---

## 2. REFUTED AND REJECTED — do not re-propose these

Each of these looks viable from a blog post and is not viable from the vendor's own documentation.

| Option | Why it is dead | The trap that makes people re-propose it |
|---|---|---|
| **Cerebras Cloud** | **REFUTED — it is a trial, not a free tier.** Their own FAQ, titled *"Is there a permanently free tier?"*, answers verbatim: *"No. The Free Trial is time- and credit-bounded: $5 in credits that expire 30 days after they're granted."* And a **verified payment method is required before a single call works** | Multiple SEO aggregators (pricepertoken, getaiperks, tokenmix, adam.holter.com) currently claim "1M tokens/day free, no credit card… resets daily, not a one-time credit." Every clause of that is contradicted by Cerebras's own docs. Cerebras genuinely has ~4–11× Groq's throughput — which is exactly why the misinformation is tempting |
| **NVIDIA NIM / build.nvidia.com** | **REFUTED on two independent grounds.** (1) Trial ToS §1.2: *"for limited trial purposes only and without use of the API Service or Generated Content in production."* Note it bans production use of the *output*, not just the service. (2) Self-hosted NIM's free Developer licence is dev/test/research only; production needs **NVIDIA AI Enterprise at $4,500/GPU/year** | The "1,000 free credits, up to 5,000" figure is from Sept 2024. NVIDIA staff confirmed on 2025-09-10 that credits were **abolished** and replaced by undisclosed rate limits — yet the stale number is still copy-pasted into 2026 forum posts. Also: if the goal is local LoRA serving, NIM is the wrong container entirely — plain vLLM (Apache-2.0) or llama.cpp (MIT) serve the same adapter on the same GPU with no licence and no clock |
| **GitHub Models** | **REFUTED — the service no longer exists.** *"As of July 30, 2026, GitHub Models has been fully retired. The playground, model catalog, inference API, and bring your own key (BYOK) are no longer available to any customer."* No grandfathering | Its successor is Azure AI Foundry: metered per token, card required |
| **SambaNova Cloud** | Real permanent free allowance, no card — but **20 requests per DAY**. That is not a product | The 200,000 tokens/day headline reads generous until you notice it is gated behind 20 RPD |
| **Together AI** | No free tier at all. Signup credit is gone; fine-tune minimums $4–$60/job; dedicated GPUs $3.99–$8.99/hr | One promotional $0.00 model is listed. A single promo endpoint is not an allowance |
| **Fireworks AI** | "$1 in free credits" = promotional credit. Runs out, then every call bills | Also: uploaded LoRA adapters can only be deployed to **dedicated** (paid GPU) deployments — the most expensive option, not the cheapest |
| **DeepInfra / Hyperbolic** | `free_account_paid_usage`. No free tier, no free credits, no permanently free models | DeepInfra *does* accept an HF LoRA path — which makes it look like the answer to our hardest requirement. The account is free; the usage is not |
| **Mistral fine-tuning** | $2/month/model storage. **A $2 recurring charge is a recurring charge.** The constraint is not "cheap", it is "zero" | The $4 one-off job fee looks like the whole cost. It is not |
| **Cloudflare LoRA serving** | Open beta and free *"during this period"* — but the LoRA-capable bases (Mistral-7B-v0.2, Gemma-2B/7B, Llama-2-7B, four of them already marked DEPRECATED) and the strong tool-calling bases are **disjoint sets**. You may have our adapter, or function calling, never both | `@cf/qwen/qwen2.5-coder-32b-instruct` is tagged LoRA-capable in the catalogue while the upload docs accept only `model_type` mistral\|gemma\|llama. That contradiction is unresolved and must not be planned around without an empirical upload test |
| **LM Studio as the backend** | Licence, not capability. ToS forbids SaaS / application-service-provider / service-bureau use. The July-2025 "free for work" announcement covers internal employee use, not reselling inference | It is the easiest local server to stand up, which is why it keeps getting suggested |

### The single most important refuted assumption is ours, not a vendor's

`packages/training/lora-apple-v1.yaml` states, in a comment, that **rank 8 is deliberate** in order to keep
Cloudflare's hosted LoRA path open (`r <= 8`). **That option does not exist.** Cloudflare's upload accepts only
`model_type` mistral | gemma | llama; our base is `Qwen3-4B-Instruct-2507`. Even if we retrained onto Llama-2-7B
to satisfy it, no LoRA-capable Cloudflare base supports native function calling, which is a hard product
requirement. Rank 8 is therefore now a **free choice, not a constraint** — if local-only serving is accepted
(it is, below), rank can rise on the next train.

---

## 3. RECOMMENDED ARCHITECTURE

Three lanes, each with an unambiguous owner. Everything blocks; nothing bills.

```
                        ┌──────────────────────────────────────────┐
   user request ──►     │  gateway.ts  — spend gate + lane select  │
                        └───────────┬──────────────────────────────┘
                                    │
        ┌───────────────────────────┼────────────────────────────────┐
        │                           │                                │
   APPLE (fast)              APPLE MAX (heavy)               LoRA lane (ours)
   Cloudflare Workers AI     Groq free                       local M2 Pro
   FREE plan                 openai/gpt-oss-120b             llama-server + apple-v1
   @cf/zai-org/glm-4.7-flash 131k ctx · 65k out · ~500 tok/s Qwen3-4B-Instruct Q4 + LoRA
   131k ctx · fn-calling     30 RPM/1k RPD/8k TPM/200k TPD   ≤1024 tokens, short outputs
   @cf/ibm-granite/          (gpt-oss-20b = a SECOND,        advisory: falls through
   granite-4.0-h-micro        separate 200k TPD pool)        to the hosted lane if down
   for housekeeping
```

### 3.1 What serves **Apple** (fast chat / small edits)

**Cloudflare Workers AI on the Workers *Free* plan**, `@cf/zai-org/glm-4.7-flash` for anything conversational
or tool-calling, `@cf/ibm-granite/granite-4.0-h-micro` for the `memory` key and every classify/summarise/title
step.

Why this and not Groq for the fast tier:

- **No network hop.** Inference runs through the Worker's `AI` binding, in the same datacenter as the request
  we are already serving. No API key round-trip, no third-party cold start, no egress. For a "fast" tier the
  transport cost is the whole game.
- **Not on the paid-billing-gated list.** `glm-4.7-flash`, `granite-4.0-h-micro`, `gemma-4-26b-a4b-it`,
  `qwen3-30b-a3b-fp8` and both `gpt-oss` models are all free-path. Our *current* model,
  `@cf/zai-org/glm-5.3-flash`, **is** on the gated list — that single line in `DEFAULT_MODELS` is what forces
  the Workers Paid seat today.
- **Best free-path Hebrew candidate.** `glm-4.7-flash` is the only free-path model whose own card claims
  "multi-turn tool calling across 100+ languages". That is a lineage claim, not a Hebrew benchmark — see §5.
- **Cleanest data terms of any hosted option.** "Cloudflare does not use your Customer Content to (1) train any
  AI models made available on Workers AI or (2) improve any Cloudflare or third-party services", identical on
  free and paid.
- **Cost per turn is 3.5× lower on granite** (≈16 neurons vs ≈58 at 4k-in/1k-out), which converts directly into
  more turns per day out of the same 10,000.

### 3.2 What serves **Apple MAX** (heavy multi-file builds)

**Groq free tier, `openai/gpt-oss-120b`.**

This is the most defensible choice in the document because it is the only one backed by *our own* measurement
rather than a vendor claim. `apps/worker/src/router.ts` records the result of a 56-task Roblox eval
(`docs/evals/FINDINGS.md`):

> `gpt-oss-120b` 97.6 overall — 100.0 on tool-selection, 100.0 on project-comprehension, 100.0 on api-knowledge,
> 100.0 on ui-implementation. `qwen3-30b-a3b` 88.2 overall, losing specifically on api-knowledge (67.9) and
> ui-implementation (66.7).

Groq's free tier serves exactly that model, at ~500 tok/s, 131,072 context, 65,536 max completion, native tool
calling, designated a **Production** model (not Preview), under an agreement that forbids Groq from training on
our inputs. We already know it is good at this job.

**Throughput is the answer to the 152.6 s baseline.** The measured competitor turn was 152.6 s / 25 tool calls /
316k input tokens. At ~500 tok/s a 6,000-token build script emits in ~12 s. The remaining 140 s in a comparable
run is *not* generation — it is 25 sequential round trips each re-sending a growing context. Which leads to the
important point:

> **We cannot out-spend that baseline. We have to out-engineer it — and the free tiers force us to.**
> Groq's binding limit is **8,000 TPM**, so a 316k-token turn is not "expensive", it is *impossible*: it is 40×
> the per-minute budget and would be rejected before processing. The free tier and the latency target demand the
> same fix — fewer, smaller turns. Cached tokens do not count against Groq's limits, which makes a stable
> system-prompt-and-tools prefix (the worker already passes `x-session-affinity`, `gateway.ts` `ChatOptions.sessionId`)
> worth real capacity, not just real money.

`openai/gpt-oss-20b` carries its **own separate** 1,000 RPD / 200,000 TPD pool. Use it for the cheap steps of a
MAX run (file listing, diff summarisation, tool-result compression) so the 120b pool is spent only on authoring.

**Why not Gemini 3.8 Flash for MAX,** despite a genuinely better 1M-token context on the free tier:
1. Free-tier prompts are used to train Google **and read by human reviewers**, with an explicit instruction not
   to submit confidential information. We would be relaying other people's game code.
2. The terms forbid serving **EEA / Switzerland / UK end users** on unpaid quota. A Roblox product has European
   players by default.
3. The free-tier limits are no longer published at all, so the lane cannot be capacity-planned.
4. The anti-competing-models clause plausibly prohibits using Gemini output as a teacher for our own LoRA.
   (We are clean here — our corpus is MIT/Apache-licensed Roblox repos, see `packages/training/data/dataset-card.json`
   — and it must stay that way.)

Gemini therefore sits at fallback rank 4 **behind an explicit per-project consent gate**, and only for
owner-initiated whole-project reads. It is not a default.

### 3.3 Where our OWN trained LoRA actually runs

**On the M2 Pro, under `llama-server` (llama.cpp, MIT), reachable by the Worker as an OpenAI-compatible
endpoint, owning one narrow lane.** This is the only zero-cost path in existence — verified against eight
providers — where weights we trained serve real user requests.

The lane is **not** "everything". It is bounded by what we actually trained:

- `lora-apple-v1.yaml` sets `max_seq_length: 1024`, and the dataset's p99 is 931 tokens (max 1,078). **A LoRA
  trained at 1,024 tokens cannot do long-context multi-file work.** No hosting decision changes that; it is a
  property of the artifact.
- The M2 Pro's binding limit is **prefill, not decode**: ~341 t/s prompt processing means a 32k-token agent
  context costs minutes of time-to-first-token. Short prompts are not a preference, they are the only thing
  this machine is fast at.
- 4-bit Qwen3-4B is ~2.4 GB resident, so it is comfortable in 32 GB with room for KV cache — unlike the 35B-A3B
  alternative, which lands at ~19–20 GB against macOS's default ~21 GB Metal wired limit.

So the LoRA owns the **≤1,024-token Luau authoring and repair inner loop**: "write this one function", "fix this
one script", "normalise these tool arguments" — exactly the shape of the 327 training examples.

**It is advisory, never load-bearing.** The Worker calls it with a hard `AbortSignal.timeout()` and falls
through to the hosted lane on any failure. A closed laptop degrades *quality*, never *availability*. That is the
honest trade: a real trained artifact genuinely in the serving path, with a single-machine availability ceiling
that we design around instead of pretending away.

Rejected alternative for this lane: **HF ZeroGPU**. It is the only hosted $0 place our adapter could run, but the
5-GPU-minutes/day quota is charged to the *calling* account — one service token means 5 minutes/day for the
entire user base — it is Gradio-only (not an OpenAI tool-calling endpoint), free Spaces sleep and cold-reload,
and queue priority degrades as the quota drains. Keep it as a public demo of the adapter; do not put it in the
product's path.

### 3.4 What happens when a free allowance is exhausted mid-build

This is a product decision, not an error path, and the repo already has the machinery for it (`BudgetError` with
user-facing copy, `RateLimitedError`, `STEP_LIMITS`, and a pre-agent checkpoint on every non-Plan run at
`session.ts:735`).

**The rule: a run never dies of exhaustion. It degrades, then it pauses, and it always says which.**

1. **Every lane must block, never bill.** This is only true for Cloudflare on the Workers **Free** plan. On
   Workers Paid — the account's state today — the same 10,000 neurons is a discount, not a ceiling, and overage
   bills silently at $0.011/1k neurons with no platform cap. The downgrade is a prerequisite, not a nicety.
2. **Pre-flight.** `reserve()` already gates neurons. It gains a per-provider allowance check (requests/day,
   tokens/day, tokens/minute) so a lane's exhaustion is known *before* the call, not discovered as a 429.
3. **Nothing was billed, so retry elsewhere — not here.** A 429 on a free tier means the request never reached
   the model. The current loop retries the *same* adapter 3× at 1.2 s intervals; on a per-minute window that is
   useless. It must instead mark the lane cold until `retry-after` and re-issue the **same step** to the next
   lane. The step boundary is the natural seam — the transcript is already durable.
4. **Say it in the transcript.** A mid-build downgrade from gpt-oss-120b to glm-4.7-flash changes output quality.
   The provenance system exists; use it. Silent downgrade is the one behaviour that makes the product feel
   broken rather than constrained.
5. **When every lane is cold: checkpoint and pause, do not fail.** The user sees a specific, honest, actionable
   message with a time:

   > *"Apple MAX is out of capacity until 00:00 UTC. Your build is saved at step 9 of 16 — resume then, or
   > continue now on Apple (slower, and it will work in smaller pieces)."*

   Not "an error occurred". Not a spinner. The reset time is knowable for every lane we use (Cloudflare 00:00
   UTC, Groq per-minute/per-day windows with `retry-after`, OpenRouter daily), so state it.
6. **Refuse before starting, when we can see it won't fit.** If a MAX build is estimated to need more capacity
   than remains today, say so *before* step 1 rather than stranding the user at step 9. `estimateNeuronsForModel`
   already does the arithmetic for one call; it needs a per-run projection.

### 3.5 Fallback ordering

**Apple (fast tier)**

| # | Lane | Condition |
|---|---|---|
| 1 | **Local LoRA** (`apple-v1` on M2 Pro) | only for the Luau-authoring/repair lane, prompt ≤1,024 tokens, health ring shows the endpoint alive; hard timeout |
| 2 | **Cloudflare Workers AI Free** — `glm-4.7-flash` (`granite-4.0-h-micro` for `memory`/classify) | default; neurons remain today |
| 3 | **Groq `gpt-oss-20b`** | CF neurons exhausted; spends the 20b pool, leaving the 120b pool for MAX |
| 4 | **OpenRouter `:free`** tool-calling slug | last resort. p90 ≈27 s, p99 ≈56 s — needs a timeout and must never be the only path |
| 5 | **Pause + resume** | all cold; checkpoint, name the reset time |

**Apple MAX (heavy tier)**

| # | Lane | Condition |
|---|---|---|
| 1 | **Groq `gpt-oss-120b`** | default. Measured 97.6 on our own 56-task eval |
| 2 | **Cloudflare Workers AI Free** — `glm-4.7-flash` | Groq 120b pool exhausted; announce the downgrade |
| 3 | **Groq `gpt-oss-20b`** | separate pool; use for non-authoring steps first, then as a fallback |
| 4 | **Gemini 3.8 Flash free** | **consent-gated.** Only with explicit per-project opt-in, never for EEA/CH/UK end users, and only when 1M context is the actual need |
| 5 | **OpenRouter `:free`** | last resort |
| 6 | **Pause + resume** | all cold |

The local LoRA never appears in the MAX ordering. A 1,024-token adapter has nothing to offer a multi-file build,
and pretending otherwise would be the dishonest version of "a real trained artifact in the serving path".

---

## 4. MIGRATION NOTE — `apps/worker/src/providers/` and `gateway.ts`

The provider layer's own header says adding a provider is "one new adapter plus one line in `registry.ts`". That
is true for a *provider*. It is **not** true for a *free tier*, because the layer has no vocabulary for quota, no
vocabulary for a lane, and a selector that ranks on price — which is $0 for every candidate here.

### 4.1 `providers/types.ts`

- `ProviderId` union and `PROVIDER_ORDER` gain `'groq' | 'local-lora' | 'openrouter'`.
- `UnavailableReason` is currently `'no_credentials' | 'binding_missing'`. Add **`'quota_exhausted'`** and
  **`'endpoint_unreachable'`**. Today a lane that is cold until 00:00 UTC cannot be expressed at all, which is
  why §3.4's user-facing message has nowhere to come from.
- `ProviderAvailability` gains `coldUntil?: number` so the reset time is data, not prose.
- `ProviderModel` gains a free-allowance descriptor — `{ rpm, rpd, tpm, tpd }` plus `billsOnOverage: boolean` —
  and `unverifiedFields` should carry `tpm`/`tpd` for Gemini and Mistral, whose numbers are genuinely unpublished.
- `ProviderError` gains `retryAfterMs`, parsed from the header, so the gateway sets a cold-until instead of
  sleeping a guess.

### 4.2 New adapters — cheap, because the wire shape is already shared

`openai.ts` already exports `encodeOpenAiChat` / `decodeOpenAiChat` / `classifyHttpError` / `postJson`, and
`deepseek.ts` is the worked example of reusing them. All three new adapters follow it:

- **`providers/groq.ts`** — base `https://api.groq.com/openai/v1`, `availability()` reads `env.GROQ_API_KEY`.
  The one real addition is `classifyError` parsing `retry-after` and `x-ratelimit-*` into `retryAfterMs`. Two
  models: `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, each with its own allowance record. **Do not add the
  Qwen3 models** — Groq marks them Preview, and the docs say Preview models "should not be used in production
  environments as they may be discontinued at short notice."
- **`providers/local-lora.ts`** — `env.LOCAL_LORA_URL` + shared secret, `llama-server`'s `/v1/chat/completions`,
  `AbortSignal.timeout()` so an unreachable laptop fails in ms rather than hanging a step. `availability()` is
  URL-set **and** the `health.ts` ring shows no recent connection failure — the ring already exists and is the
  right structure for this. Cost is genuinely 0, but it must still call `reserve()` for a nominal amount so a
  runaway local loop is bounded by the same ledger as everything else.
- **`providers/openrouter.ts`** — must **hard-assert the model id ends in `:free`** before `invoke()`. This is
  the identified billing-by-accident vector: if any code path builds a slug at runtime and drops the suffix,
  those requests silently draw down a prepaid balance.

### 4.3 `providers/registry.ts` — the selector has to change shape

- `selectProvider()` currently sorts eligible models by `blendedPricePer1M` and breaks ties on `PROVIDER_ORDER`.
  **Every model in the new world prices at $0, so every comparison ties and selection silently collapses to array
  order.** Replace the price sort with an explicit `laneFor(modelKey, tier): ProviderId[]` returning the §3.5
  ordering, then filter by availability → quota → capability and take the first.
- Keep the `rejected[]` / `reasoning` machinery unchanged. It is already exactly the right shape for "why is
  Apple MAX unavailable right now", which is a question users will ask daily on these limits.
- `adapterForModelId()` falls back to `workersAiAdapter` for unknown ids, which was correct when the AI binding
  was the only transport. With four HTTP providers it is a bug: a KV `config:models` override naming a Groq id
  would be handed to `env.AI.run`. Make it return `undefined` and let the caller throw.

### 4.4 `providers/cost.ts` — the neuron ledger stops being a limiter

`neuronsForModelTokens()` prices non-Cloudflare providers from USD. **On a free tier USD is zero, so every Groq
and OpenRouter call settles 0 neurons and `BudgetDO` stops bounding anything.** Fix:

- Keep neurons as the ledger for Cloudflare (unchanged, exact).
- Add a **sibling per-provider allowance ledger** — requests-today, tokens-today, tokens-this-minute, per
  `(provider, modelId)` — that `reserve()`/`settle()` also update. Same DO, new keys; it must be the same
  single-threaded `idFromName('singleton')` object or two isolates will both think there is room.
- Without this, the only thing protecting the free tiers is the provider's own 429 — and the survey is explicit
  that on these tiers hitting 429 is *the normal steady state, not an exception*.

### 4.5 `gateway.ts`

- `ModelCfg` gains `tier: 'apple' | 'apple-max'`. `DEFAULT_MODELS` stops pointing all five keys at one id:
  `clay`/`memory`/`vision` → Apple lane; `stone` → Apple; `rune` → Apple MAX.
- **The retry loop (≈ lines 283–316) is the main behavioural change.** It currently retries the same adapter up
  to 3× at 1.2 s×n. Replace with: on `rate_limit` / `quota_exhausted`, mark the lane cold with `retryAfterMs` and
  advance to the next lane in `laneFor()` for the **same step**; only when the lane list is exhausted, throw.
  The existing rule — *a failed inference is never retried, a pre-run rejection is free to retry* — stays exactly
  as written; we are changing where the free retry goes, not whether it happens.
- The hardcoded error sniffing at the bottom (`/4006|daily free allocation|neurons/i`, `/\b3021\b|rate limit/i`)
  is Workers-AI wire detail living in the gateway. Move it into `workersAiAdapter.classifyError` and have the
  gateway switch on `ErrorClassification.kind` only — otherwise every new provider adds another regex here.
- `BudgetError['reason']` gains `'all_lanes_cold'`, with a `resumeAt` and the §3.4 copy.
- `reserve()` / `settle()` signatures carry `providerId` so the allowance ledger can be per-provider.

### 4.6 `env.ts` and `wrangler.jsonc`

- Add `GROQ_API_KEY?`, `OPENROUTER_API_KEY?`, `LOCAL_LORA_URL?`, `LOCAL_LORA_KEY?`. Keep the existing honest
  pattern: declared-but-unset means the adapter reports `no_credentials` and refuses before the network.
- **Ordering matters for the plan downgrade:** `DEFAULT_MODELS` must move off `@cf/zai-org/glm-5.3-flash`
  **before** the account is downgraded to Workers Free, or every inference call returns HTTP 403 / error 5035.
- `packages/evals/src/economics.test.mjs` asserts the spend constants but compares hardcoded literals to
  hardcoded literals and imports neither `pricing.ts` nor the ledger. It will ship green through all of this.
  Fix it in the same change or it is worse than no test.

---

## 5. WHAT CANNOT BE MET AT ZERO COST — stated, not hidden

1. **Hosted serving of our own LoRA. Impossible, everywhere, at any free price.** Groq: enterprise-only.
   Cerebras: private preview. Google: fine-tuning removed from the API entirely. OpenRouter: Enterprise *and*
   you host it yourself. HF router: closed catalogue. NVIDIA: self-host + $4,500/GPU/yr for production. Mistral:
   $2/month/model. Cloudflare: only onto obsolete bases with no function calling. **Local execution is not one
   option among several — it is the only one.**
2. **Our LoRA plus long context.** The adapter is trained at `max_seq_length: 1024`. This is an artifact
   property, not a hosting problem. Long-context work belongs to the hosted tiers, permanently, unless we retrain.
3. **24/7 availability of the LoRA lane.** It requires a machine that is powered, awake, unthrottled, networked,
   and not simultaneously being used as the owner's development workstation. There is no redundancy, no failover,
   no SLA, and no on-call. Designed around in §3.3; not solved.
4. **Multi-user scale.** Total free capacity across every lane is roughly **100–250 substantive agent turns per
   day, service-wide** — not per user. All free limits are org-level or project-level. This supports a demo, a
   private beta, and a handful of daily users. It does not support a public launch. Sharding across multiple free
   accounts to multiply the allowance is an explicit ToS breach at Groq (AUP: "registering multiple accounts or
   orchestrating usage between multiple organizations") and OpenRouter (§7), and is grounds for suspension.
5. **Hebrew.** **Not one provider publishes a Hebrew benchmark or language commitment for any candidate model.**
   n = 0 measurements, everywhere. `glm-4.7-flash`'s "100+ languages" and Qwen3.5's "201 languages and dialects"
   are lineage claims that do not name Hebrew. If Hebrew quality fails on every free model, meeting that
   requirement costs money — and we will not know until someone tests it.
6. **Any latency or availability guarantee.** Every free tier disclaims warranty. Cloudflare publishes no p50/p99
   for Workers AI. OpenRouter's own FAQ says free models are "usually not suitable for production use."
7. **Exposing the local box without a card on file.** Cloudflare Tunnel's setup collects a payment method even on
   the Zero Trust Free plan ("you will not be charged", but the card is on file). **Prefer Tailscale Funnel**,
   which does not. A residential dynamic IP and ISP terms on running servers are separate hazards.
8. **The recurring cost this document does not fix.** Per `docs/audit/APPLE-LEDGER.md` §3.3, **Durable Object
   residency is the largest recurring line item and it dwarfs inference** — the plugin's long-poll keeps a
   SessionDO in-flight ~85% of wall-clock, and roughly one always-connected project consumes the entire
   400,000 GB-s monthly allowance. Choosing free inference providers does not achieve zero recurring cost on its
   own. That is a separate fix (idle timeout, disconnect-after-N-minutes) and it is on the critical path.

### Where the uncertainty actually is

| Claim | Confidence | Why |
|---|---|---|
| gpt-oss-120b is good at our Roblox tasks | **High** | Our own 56-task eval, 97.6 overall, 100.0 on four sub-scores |
| Groq's free tier is permanent, blocks, needs no card | **High** on permanence and blocking (verified verbatim from raw HTML, plus a documented downgrade-back-to-free path); **Medium** on the card — it is inferred from the upgrade gate, never stated affirmatively. Confirm at signup |
| Cloudflare free-path model list and neuron costs | **High** — live pricing page and per-model pages |
| Gemini free-tier capacity | **None.** Officially unpublished; third-party measurements disagree 75× | Do not plan against it |
| Mistral free-tier numbers | **None.** Visible only after signup | Same |
| M2 Pro throughput for 4B + LoRA | **Low** — extrapolated from a 7B Q4 benchmark on the same chip class, not measured on our artifact. Prefill is the number that matters and it is the one least likely to be flattering |
| `apple-v1` adapter quality | **None yet.** Training was still running when this was written (iter 10 of 250; val loss 2.812 → train 1.937). **327 training examples is a small corpus.** No eval has been run against it |
| Hebrew, anywhere | **None.** n = 0 |

---

## 6. THE FIRST FIVE MOVES

1. Land the `DEFAULT_MODELS` change off `@cf/zai-org/glm-5.3-flash` onto `glm-4.7-flash` + `granite-4.0-h-micro`.
   **Before** any plan change, or the product 403s.
2. Downgrade the Cloudflare account to **Workers Free** (owner, dashboard). This is what converts "bills
   silently, uncapped" into "blocks with an error".
3. Add `providers/groq.ts` + the lane selector + the per-provider allowance ledger. Ship the Apple/Apple MAX split.
4. Run the Hebrew and Luau evals against `glm-4.7-flash` and `gpt-oss-120b`. Two unknowns, one afternoon.
5. Finish `apple-v1`, convert to GGUF, stand up `llama-server` behind Tailscale Funnel, wire
   `providers/local-lora.ts` as an advisory lane with a hard timeout.
