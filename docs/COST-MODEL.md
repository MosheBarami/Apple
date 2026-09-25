# Apple — cost model and spend safety

Every number here is **measured in production**, not estimated. Reproduce any of it from the admin
console (`/app/admin` → AI spend) or `GET /api/admin/spend`.

## Production model

**`@cf/zai-org/glm-5.3-flash`** — the model used for the historical Plan/Agent, memory and vision measurements below.
Current serving may route Apple and Apple MAX differently; these rows remain the measured cost record. $0.15/M input, $0.03/M cached input, $0.50/M output, 1M context, native tool calling,
multimodal. It replaced gpt-oss-120b on 2026-08-30 and is both **better** (98.9 vs 96.8 on the
Roblox eval suite) and **cheaper per token**.

Cloudflare reports the exact neuron cost of every GLM call in `usage.neurons`; the gateway bills
from that figure rather than from an estimate, so the ledger below is the provider's own number.

## What one request actually costs

Measured 2026-08-30 against the live service, GLM-5.3-flash at `reasoning: low`. Cloudflare bills
Workers AI in *neurons* at **$0.011 per 1,000 neurons**.

| Request | Neurons | USD |
|---|---|---|
| Plan question (Studio attached) | 37–43 | $0.00041–0.00047 |
| Agent, answer only (no Studio) | 107 | $0.00118 |
| Agent, targeted edit + read-back verify in Studio | 111 | $0.00122 |
| Agent, inspect + playtest verify in Studio | 241 | $0.00265 |
| **Agent, full build + edit + verify in Studio** | **511** | **$0.00562** |
| **Agent, build + read-back verify + playtest in Studio** | **297** | **$0.00327** |
| Memory distillation (after a run) | ~21 | $0.00023 |
| Docs search (embedding, cached 24h) | 1 | $0.00001 |
| **Visual critique (`inspect_visually`, 3 frames)** | **63–72** | **$0.00069–0.00079** |

A full Agent build costs **$0.0056 versus $0.0139 before the GLM migration — 2.5× cheaper for the
same work**, on a model that scores higher.

### What the visual loop adds

Building blind was cheap. Looking at the result is not free, and this is the honest arithmetic:

| | before the visual loop | with it |
|---|---|---|
| Agent full build | 511 neurons | ~526 neurons (adaptive reasoning, +3%) |
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
| Agent step, high effort | 53 | 7,426 | **140** |
| Agent step, low effort | 17 | 2,638 | **155** |
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
($0.025)**, against 511 ($0.0056) for the old build-blind path. At today's daily ceiling of 100,000
neurons that is roughly **43 full quality-gated builds per day service-wide**, against ~196
build-blind ones.

<!--[[ THE CEILING DID MOVE, ON 2026-09-20, AND THIS SAID OTHERWISE FOR A DAY.
       This paragraph read "The ceiling has not moved — the hard maximum is still $10.06/month",
       and three other documents restated that figure. It stopped being true when
       BILLABLE_NEURONS_PER_DAY went 15,000 -> 90,000 and BILLABLE_NEURONS_PER_MONTH went
       460,000 -> 1,800,000, because every build on the live product was being refused with
       "Apple has reached today's shared building capacity" — see the decision comment above
       BILLABLE_NEURONS_PER_DAY in apps/worker/src/pricing.ts. The constants, the enforcement and
       packages/evals/src/economics.test.mjs all moved together that day; only the documents did
       not, and the number they left behind was the OWNER'S WORST CASE, understated 2.5x.
       Every figure below is now derived from those constants and checked by
       "the documented hard maximum is the one the safeguards actually allow" in
       economics.test.mjs. ]]-->
**The ceiling moved on 2026-09-20 — the hard maximum is $24.80/month, up from $10.06.** It was
raised on purpose, because at the old cap the service was refusing every build. What has not
changed is that it is a hard cap: beyond it the caps refuse generation rather than spending more.

**Art-direction prompt saving, re-measured 2026-09-25.** The older 7,406-character brief and its
proposed 430-neuron saving were a historical estimate, not a current reduction. Moving the brief
behind a tool would not save repeated input: the tool result is re-sent with the transcript. The
product now sends the visual brief initially, then replaces it with a short reminder after the first
successful mutating step. In a reproducible Agent prompt fixture from the committed source, the full
system prompt is 23,341 characters (89 estimated GLM-5.3-flash input neurons), the art block is 5,194
characters, and the collapsed prompt is 18,440 characters (70 estimated input neurons). That is **19 neurons saved per
subsequent step**, or about **190** if ten later steps run. These are prompt-input estimates, not
measured end-to-end build savings; the number of later steps varies.

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
answers. So Agent defaults to `high`, Plan stays `low`, and **`medium` is never
selected**. See `apps/worker/src/reasoning.ts`.

## The bill

Cloudflare includes **10,000 neurons/day free** on both Free and Paid plans. Spend only begins
after that. Workers Paid is **$5.00/month** flat.

Every row below is `billable neurons × $0.011/1,000 + $5.00`, with the billable figure taken from
`BILLABLE_NEURONS_PER_DAY` / `BILLABLE_NEURONS_PER_MONTH` in `apps/worker/src/pricing.ts`. Builds
are counted at the 2,300-neuron quality-gated figure measured above, which is the same one the
Credit allowances are denominated in.

| Scenario | Daily neurons | Billable/day | AI cost/month | **Total bill** |
|---|---|---|---|---|
| **Low** — ~4 builds or ~100 questions/day service-wide | ~10,000 | 0 | $0.00 | **$5.00** |
| **Medium** — ~15 builds/day | ~35,000 | 25,000 | $8.25 | **$13.25** |
| **Heavy** — demand at or above the daily ceiling | 100,000 (capped) | 90,000 | $19.80 (capped) | **$24.80** |

The heavy row is the one worth reading twice. At the daily cap the AI spend is **$0.99 a day**, so
thirty such days would be $29.70 — and the monthly backstop stops it at $19.80 instead. The month's
cap is reached on **day 20**; every day after that refuses generation whatever the daily figure
says. That is deliberate: a month of heavy days cannot quietly become a bigger bill than a month of
light ones was budgeted for.

Beyond "heavy" the caps refuse further generation rather than spending more — users get a
capacity message, the bill does not move.

### Exact hard maximum

The monthly billable cap is **1,800,000 neurons = $19.80**. Added to the $5.00 platform fee:

> ## Hard maximum: **$24.80 / month**

One caveat stated honestly: the ledger blocks on *reserved + settled* neurons, so the only way to
exceed the cap is requests already in flight at the instant it is crossed. That is bounded by
(concurrent requests × 1,200 neurons/request) — about **$0.40** in a pathological burst of 30
simultaneous requests. `MAX_NEURONS_PER_REQUEST` was not touched when the caps were raised, so that
bound is the same as it always was. The true ceiling is **$24.80, and under no circumstances above
~$25.20**.

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

Credits are the user-facing unit, billed from what a run *actually* consumed and rounded once per
run. Recalibrated for GLM: **1 Credit = 30 neurons** (was 90), so a Credit stays a meaningful unit
now that the same work costs less.

| Plan | Credits/day | Credits/month | Roughly |
|---|---|---|---|
| Free | 60 | 900 | ~3 full builds, ~16 small edits, or ~45 questions per day |
| Pro (designed, not launched) | 400 | 6,000 | ~23 full builds/day |

Whichever limit binds first applies. Apple's own housekeeping (memory distillation) counts against
the global budget but is **not** charged to the user.

## Cost controls in the product

- **Apple AI Gateway** (deployment binding `golem`): all inference routes through it — 200 req/min sliding rate limit,
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
  24,000 chars (was 120,000); tool definitions filtered per mode so Plan does not pay to be told
  about playtesting tools. Step budgets cut from 4/14/32 to 3/8/14.
- **Embedding cache**: 24h TTL, deterministic inputs — repeat doc searches are free.
- **Rate limiting**: 240 requests/min per account, 400/min per IP on the plugin poll endpoint,
  plus the gateway's own 200/min.

## Where the money actually goes

From the live ledger after a day of testing:

Every purpose now resolves to the same model, so the admin breakdown reads by *purpose* rather
than by model — Plan steps, Agent steps, `memory` and `embed`. Agent steps in builder
mode remain the overwhelming majority of spend, which is the right place for it to go.

## Known limitation: per-model rate ceiling

GLM-5.3-flash is a frontier-tier model on Workers AI and carries a low per-account
requests-per-minute ceiling (Workers AI error `3021`). Measured sustained throughput with retry
handling in place: **~30 successful requests/minute**. A single Agent build makes 2–11 model calls,
so a handful of simultaneous builders will queue rather than fail — visible as higher p95 latency
(17.3s under 6 concurrent inferences vs 2.0s median), not as errors. The 20-user concurrency test
completed with **zero inference errors**. If this becomes a real constraint, the documented lever
is prepaid AI Gateway credits, which raise the ceiling — that is a purchase and would be brought to
the owner first.

## Prompt caching — settled by measurement, 2026-08-31

`cached_tokens` reported 0 on every identical call. The cause was **not** request shape and not the
gateway: Workers AI prefix caching only engages when consecutive requests are routed to the same
model instance, which requires an `x-session-affinity` header that Apple previously did not send
(https://developers.cloudflare.com/changelog/product/workers-ai/ — "Prefix caching and session
affinity"). Apple now sends it, keyed on the session Durable Object id: per-project, opaque, never
shared across tenants. It is a routing hint rather than a cache key, so a collision costs a cache
miss and can never produce a cross-tenant read. AI Gateway *response* caching, which would be a
tenant risk, stays off (`cacheTtl: 0`) on every agent call.

**Then the measurement, through the deployed worker, identical 2,700-token prefix, `cacheTtl: 0`:**

| model | header | call 1 | call 2 | call 3 |
|---|---|---|---|---|
| `@cf/zai-org/glm-5.3-flash` | none | cached 0 | cached 0 | cached 0 |
| `@cf/zai-org/glm-5.3-flash` | `x-session-affinity` | cached 0 | cached 0 | cached 0 |
| `@cf/moonshotai/kimi-k2.5` | `x-session-affinity` | cached 0 | **cached 2,688 / 2,723** | **cached 2,688 / 2,723** |

Same code path, same gateway, same header. **Prefix caching works on Workers AI and Apple's plumbing
is now correct — but the production model does not surface cached tokens.** This is a per-model
property, not a misconfiguration: Cloudflare's changelog documents the feature against kimi-k2.5 and
lists cached pricing on that model's page.

What this is worth if GLM ever surfaces it: a step sends ~5,226 input tokens of system prompt plus
tool definitions, which is 72 neurons before the model writes anything. At the published cached rate
($0.03/M against $0.15/M input, already in `MODEL_PRICES` and already applied by `neuronsFor`) a
98%-cached prefix would cost ~14 neurons instead of 72 — about **58 neurons per step, ~930 on a
16-step gated build, roughly 40%**. No further work is needed to collect it; the header is sent and
the accounting already prices cached input.

**Switching to kimi-k2.5 to get this today is NOT recommended.** GLM-5.3-flash was selected on a
measured Roblox eval (98.9 vs 96.8) and the model is the product's quality floor. Trading that for an
input-cost discount is the wrong trade, and it is recorded here so the option is not rediscovered as
if it were new.

---

## Addendum — 2026-08-31: the largest cost lever is the false-reject rate

This phase did **not** reduce the measured per-build neuron cost. A normal
quality-gated Agent build still costs roughly what it did (~2,300 neurons by
the estimate above), against a Free daily allowance of 1,800 neurons
(60 Credits x 30). **1,800 was not reached, and no accounting change was made to
make it look closer.**

What the phase did find is where the money actually goes, and it is not prompt
size.

### The finding

The composition generalization study (`packages/evals/tasks-visual/composition/
generalization/REPORT.md`) measured the gate against 15 independent scene
families rather than the single plaza it was calibrated on:

| scene type | false-reject rate |
|---|---|
| open / exterior | 0.0% |
| enclosed / roofed | **68.8%** |

Five families reject every exemplar, good and bad.

A false reject is not a cheap event. It is the most expensive one in a run: the
gate tells the agent the layout itself is wrong, and the agent clears and
rebuilds. A rebuild re-runs blockout and build — on the order of a full build
again — so an interior request that trips this pays roughly twice.

That makes the expected cost of an interior build substantially higher than the
headline figure, and it is invisible in a per-call cost breakdown because every
individual call is correctly priced. The waterfall was never going to show it.

### What follows

1. **Scope the landmark rules away from enclosed subjects**, the way they are
   already scoped away from `prop`. The study shows every threshold
   counterfactual trades false rejects for false passes about 1:1, so moving a
   number is not the fix — the rule is measuring the wrong quantity indoors.
2. **The render contract needs an interior camera.** The framing camera orbits
   the bounding box, so a roofed scene renders as a lid and the pixel half of
   the gate never sees the interior at all.
3. Two metrics are falsified on independent families and should not be trusted
   outside exteriors: `verticalElements` (AUC 0.431) and `interiorEdgeDensity`
   (0.398) — both below chance.

### Already banked

The intent extractor added this phase derives the requested-elements checklist
deterministically, in ~0.2ms and **0 neurons**. Previously that list only
existed after a full build plus a visual critique produced it in prose. That is
a real structural saving on gated builds, though it is nowhere near large
enough on its own to close a 500-neuron gap.

**Honest conclusion: the Free-tier target is not met, and closing it depends on
fixing the interior false-reject rate first. Compression will not get there.**
