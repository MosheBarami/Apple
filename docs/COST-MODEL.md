# Golem — cost model and spend safety

Every number here is **measured in production**, not estimated. Reproduce any of it from the admin
console (`/app/admin` → AI spend) or `GET /api/admin/spend`.

## Production model

**`@cf/zai-org/glm-5.3-flash`** — the single model behind every mode (Clay, Stone, Rune, memory,
vision). $0.15/M input, $0.03/M cached input, $0.50/M output, 1M context, native tool calling,
multimodal. It replaced gpt-oss-120b on 2026-08-30 and is both **better** (98.9 vs 96.8 on the
Roblox eval suite) and **cheaper per token**.

Cloudflare reports the exact neuron cost of every GLM call in `usage.neurons`; the gateway bills
from that figure rather than from an estimate, so the ledger below is the provider's own number.

## What one request actually costs

Measured 2026-08-30 against the live service, GLM-5.3-flash at `reasoning: low`. Cloudflare bills
Workers AI in *neurons* at **$0.011 per 1,000 neurons**.

| Request | Neurons | USD |
|---|---|---|
| Clay question (Studio attached) | 37–43 | $0.00041–0.00047 |
| Stone, answer only (no Studio) | 107 | $0.00118 |
| Stone, targeted edit + read-back verify in Studio | 111 | $0.00122 |
| Stone, inspect + playtest verify in Studio | 241 | $0.00265 |
| **Stone, full build + edit + verify in Studio** | **511** | **$0.00562** |
| **Rune, build + read-back verify + playtest in Studio** | **297** | **$0.00327** |
| Memory distillation (after a run) | ~21 | $0.00023 |
| Docs search (embedding, cached 24h) | 1 | $0.00001 |
| **Visual critique (`inspect_visually`, 3 frames)** | **63–72** | **$0.00069–0.00079** |

A full Stone build costs **$0.0056 versus $0.0139 before the GLM migration — 2.5× cheaper for the
same work**, on a model that scores higher.

### What the visual loop adds

Building blind was cheap. Looking at the result is not free, and this is the honest arithmetic:

| | before the visual loop | with it |
|---|---|---|
| Stone full build | 511 neurons | ~526 neurons (adaptive reasoning, +3%) |
| Visual critique passes | 0 | 2–3 × ~67 = 134–201 |
| **Total per build** | **511** | **~660–727** |
| Cost per build | $0.0056 | **$0.0073–0.0080** |
| Builds/day at the cap | 49 | **34–38** |

So a build costs about **40% more and the service does roughly a quarter fewer builds per day at
the same ceiling**. That is the price of the agent seeing its own work, and it is worth paying: the
alternative is the cheaper build that got rejected.

**The ceiling itself does not move.** The daily and monthly neuron caps in `pricing.ts` are
unchanged, so the maximum bill is exactly what it was. What changed is how much work fits inside it.

### Measured again after the visual loop shipped (2026-08-31)

The earlier figures were taken before step limits and output budgets were raised to make the visual
loop closable. Re-measured from the live ledger across 70 real agent steps:

| purpose | calls | neurons | per call |
|---|---|---|---|
| `stone:step:high` | 53 | 7,426 | **140** |
| `stone:step:low` | 17 | 2,638 | **155** |
| `visual:critique` | 29 | 1,904 | **66** |

Two things stand out.

**`low` is no cheaper than `high` per step (155 vs 140).** Reasoning effort is no longer the driver;
input size is. Every step carries a 13,894-character system prompt plus 6,050 characters of tool
definitions — 5,226 input tokens, **72 neurons of input tax before the model writes anything**.

**Prompt caching is NOT engaging.** Probed three identical calls in a row:
`prompt_tokens: 5226, prompt_tokens_details: {cached_tokens: 0}` every time. GLM bills cached input
at $0.03/M against $0.15/M, so a working cache would cut the dominant cost by 5×. It is not
happening, and the neuron figures above are what we actually pay.

**Cost per quality-gated build:** ~16 steps at ~145 neurons plus 1–2 critiques ≈ **2,300 neurons
($0.025)**, against 511 ($0.0056) for the old build-blind path. At the unchanged daily ceiling that
is roughly **10 full quality-gated builds per day service-wide**, down from ~49 build-blind ones.

**The ceiling has not moved — the hard maximum is still $10.06/month.** What changed is how much fits
inside it. This is the honest trade: far fewer builds, each of which the agent actually looked at.

The identified, quantified saving not yet taken: the art-direction brief is 7,406 of those 13,894
characters and is re-sent on every step of a run. Moving it behind a tool the agent calls once while
planning would convert ~2,100 tokens/step into ~2,100 tokens/run — about **430 neurons (19%) off
every build**. Deliberately not applied mid-measurement.

### Reasoning effort: a measured surprise

Escalating reasoning turned out to be nearly free, and the *middle* setting turned out to be a trap.
Measured against the live service on 2026-08-30, GLM-5.3-flash, two samples per cell:

| task | effort | neurons | latency | answer | finish |
|---|---|---|---|---|---|
| trivial | low | 2.2 | 17.6s | 176 chars | stop |
| trivial | medium | 6.7 | 2.8s | 125 chars | stop |
| trivial | high | **2.7** | 1.3s | 104 chars | stop |
| design | low | 39.7 | 15.4s | 2283 chars | stop |
| design | medium | 109.8 | 41.2s | **0 chars** | **length** |
| design | high | **40.8** | 14.9s | 2361 chars | stop |
| debug | low | 18.4 | 7.8s | 1549 chars | stop |
| debug | medium | 109.9 | 45.4s | **0 chars** | **length** |
| debug | high | **23.8** | 10.9s | 2157 chars | stop |

`medium` sends the model into long deliberation — 7,488 characters of reasoning on the design task,
10,669 on debugging — that consumes the whole output budget before it writes a word. It costs 3–6×
`low` and returns **nothing at all** on two of three task types.

`high` reasons briefly and decisively and costs 3–29% more than `low` while returning better
answers. So Stone and Rune now default to `high`, Clay stays `low`, and **`medium` is never
selected**. See `apps/worker/src/reasoning.ts`.

## The bill

Cloudflare includes **10,000 neurons/day free** on both Free and Paid plans. Spend only begins
after that. Workers Paid is **$5.00/month** flat.

| Scenario | Daily neurons | Billable/day | AI cost/month | **Total bill** |
|---|---|---|---|---|
| **Low** — ~18 builds + 100 questions/day service-wide | ~10,000 | 0 | $0.00 | **$5.00** |
| **Medium** — ~30 builds + 200 questions/day | ~17,000 | 7,000 | $2.34 | **$7.34** |
| **Heavy** — demand at or above the ceiling | 25,000 (capped) | 15,000 | $5.02 | **$10.02** |

The neuron ceilings are **unchanged** by either the GLM migration or the visual loop — the maximum
bill has not moved at any point. What the ceiling buys has changed twice: GLM made builds 2.5×
cheaper (from ~19 to ~49 per day at the cap), and the visual loop then spent some of that back on
quality (down to **~34–38 full Stone builds per day**, still roughly double the pre-migration
capacity, and now with the agent actually checking its work).

Beyond "heavy" the caps refuse further generation rather than spending more — users get a
capacity message, the bill does not move.

### Exact hard maximum

The monthly billable cap is **460,000 neurons = $5.06**. Added to the $5.00 platform fee:

> ## Hard maximum: **$10.06 / month**

One caveat stated honestly: the ledger blocks on *reserved + settled* neurons, so the only way to
exceed the cap is requests already in flight at the instant it is crossed. That is bounded by
(concurrent requests × 1,200 neurons/request) — about **$0.40** in a pathological burst of 30
simultaneous requests. So the true ceiling is **$10.06, and under no circumstances above ~$10.50**.

Non-AI resources (Durable Objects, D1, KV, Vectorize, Workers requests) sit far inside the
allowances included with Workers Paid at this scale; the 30-user load test consumed a rounding
error of each. AI is the only variable-cost driver, and it is capped.

## How the ceiling is enforced

`BudgetDO` is a single globally-unique Durable Object. Because a DO is single-threaded, reservations
serialize — concurrent requests cannot race past the limit.

```
chat()/embed()  →  BudgetDO.reserve(estimate)  →  denied?  → BudgetError, ZERO tokens spent
                                               →  allowed? → env.AI.run(...)  →  settle(actual)
```

Four independent gates, each proven against production:

| Gate | Value | Proven |
|---|---|---|
| Per-request ceiling | 1,200 neurons | a 190k-char prompt is refused before any call |
| Daily ceiling | 25,000 neurons (10k free + 15k billable) | ledger pushed to the ceiling → real call **BLOCKED** |
| Monthly billable cap | 460,000 neurons ($5.06) | month over cap with unlimited daily headroom → **BLOCKED** |
| Kill switch | instant | flipped on → next call refused; flipped off → calls resume |

All four are adjustable at runtime with no redeploy (`POST /api/admin/spend-limits`), and the admin
console has one-click "Halve the caps" / "Stop all AI generation".

## Per-user quotas

Sparks are the user-facing unit, billed from what a run *actually* consumed and rounded once per
run. Recalibrated for GLM: **1 Spark = 30 neurons** (was 90), so a Spark stays a meaningful unit
now that the same work costs less.

| Plan | Sparks/day | Sparks/month | Roughly |
|---|---|---|---|
| Free | 60 | 900 | ~3 full builds, ~16 small edits, or ~45 questions per day |
| Pro (designed, not launched) | 400 | 6,000 | ~23 full builds/day |

Whichever limit binds first applies. Golem's own housekeeping (memory distillation) counts against
the global budget but is **not** charged to the user.

## Cost controls in the product

- **AI Gateway** (`golem`): all inference routes through it — 200 req/min sliding rate limit,
  response caching, per-call `kind` metadata, full logs. Cache hits cost **zero**; verified in the
  gateway log. Gateway-level retries are explicitly disabled.
- **No automatic retries.** A retry is a second bill for the same work. Removed entirely.
- **One model, no routing.** Multi-model routing was removed in the migration. It existed to move
  cheap steps onto qwen3-30b; GLM at `reasoning: low` is cheaper per call than the old flagship AND
  stronger than the old cheap model, so a second model would only add a quality cliff for a
  fraction of a neuron. Measured evidence against keeping it: routing the post-inspection step to
  qwen3 changed the outcome — it read the project tree and declared the task finished instead of
  building it.
- **Rate-limit retries are free, inference retries are not.** Workers AI error 3021 (per-model
  requests-per-minute ceiling) means the request never reached the model and nothing was billed, so
  it is retried with backoff. A *failed inference* is still never retried — that would bill the
  same work twice.
- **Context reduction.** Tool results capped at 3,000 chars (was 7,000); agent transcript capped at
  24,000 chars (was 120,000); tool definitions filtered per mode so Clay does not pay to be told
  about playtesting tools. Step budgets cut from 4/14/32 to 3/8/14.
- **Embedding cache**: 24h TTL, deterministic inputs — repeat doc searches are free.
- **Rate limiting**: 240 requests/min per account, 400/min per IP on the plugin poll endpoint,
  plus the gateway's own 200/min.

## Where the money actually goes

From the live ledger after a day of testing:

Every purpose now resolves to the same model, so the admin breakdown reads by *purpose* rather
than by model — `stone:step`, `clay:step`, `rune:step`, `memory`, `embed`. Agent steps in builder
modes remain the overwhelming majority of spend, which is the right place for it to go.

## Known limitation: per-model rate ceiling

GLM-5.3-flash is a frontier-tier model on Workers AI and carries a low per-account
requests-per-minute ceiling (Workers AI error `3021`). Measured sustained throughput with retry
handling in place: **~30 successful requests/minute**. A single Stone build makes 2–11 model calls,
so a handful of simultaneous builders will queue rather than fail — visible as higher p95 latency
(17.3s under 6 concurrent inferences vs 2.0s median), not as errors. The 20-user concurrency test
completed with **zero inference errors**. If this becomes a real constraint, the documented lever
is prepaid AI Gateway credits, which raise the ceiling — that is a purchase and would be brought to
the owner first.
