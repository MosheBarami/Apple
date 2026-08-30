# Golem — cost model and spend safety

Every number here is **measured in production**, not estimated. Reproduce any of it from the admin
console (`/app/admin` → AI spend) or `GET /api/admin/spend`.

## What one request actually costs

Measured 2026-08-30 against the live service. Cloudflare bills Workers AI in *neurons* at
**$0.011 per 1,000 neurons**.

| Request | Model(s) | Neurons | USD |
|---|---|---|---|
| Clay question ("what is a RemoteEvent?") | qwen3-30b-a3b | 33 | $0.00036 |
| Stone, answer only (no Studio attached) | gpt-oss-120b | 115–165 | $0.0013–0.0018 |
| **Stone, full build + playtest verify in Studio** | gpt-oss-120b + qwen3-30b | **1,266** | **$0.0139** |
| Memory distillation (after a run) | qwen3-30b | 21 | $0.00023 |
| Docs search (embedding) | bge-small | 1 | $0.00001 |

The build case is the one that matters: it covers reading the project tree, authoring instances,
editing a script, starting Run mode, reading logs, and snapshotting a checkpoint — 11 model calls.

## The bill

Cloudflare includes **10,000 neurons/day free** on both Free and Paid plans. Spend only begins
after that. Workers Paid is **$5.00/month** flat.

| Scenario | Daily neurons | Billable/day | AI cost/month | **Total bill** |
|---|---|---|---|---|
| **Low** — ~7 builds + 100 questions/day service-wide | ~10,000 | 0 | $0.00 | **$5.00** |
| **Medium** — ~12 builds + 200 questions/day | ~17,000 | 7,000 | $2.34 | **$7.34** |
| **Heavy** — demand at or above the ceiling | 25,000 (capped) | 15,000 | $5.02 | **$10.02** |

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

Sparks are the user-facing unit: **1 Spark = 90 neurons**, billed from what a run *actually*
consumed, rounded once per run. Verified live: a 33-neuron Clay run charges 1 Spark; a 115-neuron
Stone run charges 2.

| Plan | Sparks/day | Sparks/month | Roughly |
|---|---|---|---|
| Free | 60 | 900 | ~4 full builds or ~60 questions per day |
| Pro (designed, not launched) | 400 | 6,000 | ~26 builds/day |

Whichever limit binds first applies. Golem's own housekeeping (memory distillation) counts against
the global budget but is **not** charged to the user.

## Cost controls in the product

- **AI Gateway** (`golem`): all inference routes through it — 200 req/min sliding rate limit,
  response caching, per-call `kind` metadata, full logs. Cache hits cost **zero**; verified in the
  gateway log. Gateway-level retries are explicitly disabled.
- **No automatic retries.** A retry is a second bill for the same work. Removed entirely.
- **Model routing.** Clay runs entirely on qwen3-30b (~5× cheaper per token). Within a builder run,
  post-build verification steps route to the cheap model. *Measured and then reverted:* routing the
  step immediately after inspection to the cheap model saved ~90 neurons but changed the outcome —
  the cheap model read the tree and declared the task done instead of building. Quality won.
- **Context reduction.** Tool results capped at 3,000 chars (was 7,000); agent transcript capped at
  24,000 chars (was 120,000); tool definitions filtered per mode so Clay does not pay to be told
  about playtesting tools. Step budgets cut from 4/14/32 to 3/8/14.
- **Embedding cache**: 24h TTL, deterministic inputs — repeat doc searches are free.
- **Rate limiting**: 240 requests/min per account, 400/min per IP on the plugin poll endpoint,
  plus the gateway's own 200/min.

## Where the money actually goes

From the live ledger after a day of testing:

| Purpose | Model | Calls | Neurons |
|---|---|---|---|
| stone:authoring step | gpt-oss-120b | 7 | 1,176 |
| stone:planning step | gpt-oss-120b | 7 | 764 |
| clay:clay mode | qwen3-30b | 7 | 124 |
| stone:digesting inspection | qwen3-30b | 1 | 51 |
| memory | qwen3-30b | 1 | 21 |
| embed | bge-small | 3 | 3 |

Authoring on the flagship model is ~85% of spend. That is the right place for the money to go, and
it is the part that cannot be cheapened without hurting the product.
