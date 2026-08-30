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

A full Stone build now costs **$0.0056 versus $0.0139 before the migration — 2.5× cheaper for the
same work**, on a model that scores higher.

## The bill

Cloudflare includes **10,000 neurons/day free** on both Free and Paid plans. Spend only begins
after that. Workers Paid is **$5.00/month** flat.

| Scenario | Daily neurons | Billable/day | AI cost/month | **Total bill** |
|---|---|---|---|---|
| **Low** — ~18 builds + 100 questions/day service-wide | ~10,000 | 0 | $0.00 | **$5.00** |
| **Medium** — ~30 builds + 200 questions/day | ~17,000 | 7,000 | $2.34 | **$7.34** |
| **Heavy** — demand at or above the ceiling | 25,000 (capped) | 15,000 | $5.02 | **$10.02** |

The neuron ceilings are **unchanged by the migration** — the maximum bill did not move. Because
GLM is 2.5× cheaper per build, the same ceiling now buys roughly 2.5× more real work: about
**49 full Stone builds per day** service-wide at the cap, against ~19 before.

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
