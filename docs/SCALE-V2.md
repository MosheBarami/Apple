# Scale Architecture v2

Status: design only. Nothing here is deployed. No spend was incurred producing it.

Scope: what Golem's execution layer would have to become to survive more load than one person
testing it, and — more importantly — which parts of that are worth building **now, for zero
dollars**, and which are a way to spend money you do not have yet.

Every number is either measured (marked **measured**, sourced) or arithmetic from a measured
number (marked **estimate**, with the arithmetic shown). Nothing here is asserted from feel.

Ground truth this design is built on, unchanged:

| Fact | Source |
|---|---|
| Neurons bill at $0.011/1,000 | `apps/worker/src/pricing.ts` |
| Gates: 1,200/request, 25,000/day (10k free + 15k billable), 460,000/month, kill switch | `pricing.ts`, `do/budget.ts` |
| Hard maximum $10.06/month | `docs/COST-MODEL.md` |
| Quality-gated build ≈ 16 steps × ~145 neurons + 1–2 critiques ≈ 2,300 neurons ($0.025) | task brief, **measured** |
| Stone full build+verify 511 neurons; Rune 297; Clay question 37–43; critique 63–72; memory ~21; embed 1 | **measured** |
| Free = 60 Sparks/day, 1 Spark = 30 neurons = 1,800 neurons/day | `pricing.ts` |
| ~30 successful requests/minute sustained; 3021 is the rate-limit code | **measured**, `docs/COST-MODEL.md` |
| p95 17.3s under 6 concurrent, 2.0s median; 20-user test, zero inference errors | **measured** |
| Prefix caching verified working on kimi-k2.5, verified **not surfaced** on glm-5.3-flash | **measured** |
| No Queue, no cron, `fetch` is the only exported handler | `apps/worker/src/index.ts` (`export default app`), `wrangler.jsonc` |

Public pricing and plan allowances are **not** changed by anything in this document. The hard
ceiling does not move.

---

## 0. What the system actually does today

Read from the code, not from the docs.

```
browser WS ──"chat"──► SessionDO.startRun()
                          │  QuotaDO.spend(1 Spark)          ← refuse if empty
                          │  put('agent', AgentState)         ← the entire continuation
                          └─ setAlarm(now + 10ms)
                                    │
                          ┌─────────▼─────────┐
                          │  alarm()          │  ← one alarm == one agent step
                          │   runStep()       │
                          │    llmChat() ─────┼──► BudgetDO.reserve → env.AI.run → BudgetDO.settle
                          │    runTool() ×≤4 ─┼──► execStudioOp: push opQueue (persisted)
                          │                   │                  await in-memory Promise, 30s timeout
                          │                   │                  ◄── plugin long-poll resolves it
                          │   setAlarm(+10ms) │
                          └─────────┬─────────┘
                                    │  step > maxSteps, or no tool calls, or stop
                                    ▼
                              finishRun() → message row, broadcast, waitUntil(updateMemory)
```

Five things follow from this, and they are the whole reason v2 exists:

1. **There is no queue and no scheduler.** `QuotaDO` and `BudgetDO` are *admission gates*, not
   schedulers: they answer yes/no at the instant of the call. Concurrency is whatever arrives.
2. **A "no" destroys work.** `BudgetError` and `RateLimitedError` both land in `alarm()`'s catch
   and call `finishRun(agent, 'quota'|'error')`. The run *ends*. The user is told to send another
   message. Under load, Golem drops work rather than deferring it.
3. **Tool waits live in memory.** `opQueue` is persisted (`storage.put('opQueue', …)`), but
   `opWaiters` is a plain `Map` on the instance. If the DO restarts between the op being queued and
   the plugin returning its result, the result arrives at `handlePluginPoll`, finds no waiter, and
   is **silently discarded**. The step then blocks for its full 30s timeout and the run degrades.
   This is a live correctness bug, not a scaling concern.
4. **Crash recovery aborts, it does not resume.** `STEP_STALE_MS` (180s) only fires *if an alarm
   happens to run*, and when it does it writes "the run was interrupted" and finishes. A run whose
   alarm is lost has no other actor that will ever look at it.
5. **`AgentState` is already a complete, serialisable, provider-independent continuation.**
   Messages, structured tool calls, step counter, neurons spent, traits, nudges. This is the single
   most valuable property in the codebase and every part of v2 leans on it.

---

## 1. Durable job → queue → scheduler → execution → tool wait → resume → completion

### 1.1 The shape

```
POST /chat ──► JobRecord (SessionDO SQLite, durable)   state=queued
                    │
                    ├──► SchedulerDO.offer(jobRef, score)      ← policy lives here
                    │        ready-set, sorted by score
                    │        admits ≤ maxInFlight globally
                    │
                    └◄──  SchedulerDO.admit(jobRef)
                             │
                    SessionDO.setAlarm()  state=running
                             │
                    ┌────────▼────────┐
                    │  step           │  llmChat → tool calls
                    │   needs Studio? │──yes──► write op to opQueue, persist
                    │                 │         state=waiting_tool, wait_op_id=…
                    │                 │         RETURN from the alarm (no blocking)
                    └────────┬────────┘
                             │
        plugin poll returns result ──► persist to op_results ──► setAlarm(+0)
                             │                                       │
                             └───────────── resume: read op_results ─┘
                                            state=running
                             │
                    completion ──► SchedulerDO.release()  ← frees an in-flight slot
```

### 1.2 What each Cloudflare primitive is actually for

| Concern | Primitive | Why this one |
|---|---|---|
| Durable job record | **SessionDO SQLite** — new `jobs` table | The job mutates the project's transcript and checkpoints. Storing it anywhere else means a two-phase commit against the DO you were trying to avoid. SQLite is already open in the constructor. |
| Ordering / admission policy | **New `SchedulerDO` singleton** | Ordering must be globally consistent and single-threaded. That is precisely what a DO is. `BudgetDO` already proves the pattern. |
| Waking without a request | **Cron trigger, `* * * * *`** | The only thing in Workers that runs when nobody is calling. Needed for: stale-job sweep, deferred-job release, day rollover, lease reclaim. There is no `scheduled` handler today. |
| Step execution | **DO alarm** (unchanged) | Correct as-is. Alarms are the right primitive for "resume this exact continuation later." |
| Tool wait / resume | **Persisted `op_results` + a fresh alarm** | Replaces the in-memory `opWaiters` Map. |
| At-least-once transport, retry, DLQ | **Cloudflare Queues** — *deferred, see §5* | Real value, wrong time. |

### 1.3 The precise deltas from today

| Today | v2 | Why it matters |
|---|---|---|
| `startRun()` writes `agent` and sets an alarm immediately | `startRun()` writes a `JobRecord` with `state='queued'` and offers it to `SchedulerDO`; the alarm is only set when the scheduler admits it | Nothing else can be prioritised, deferred, or counted until a run exists as a *record* rather than as a side effect |
| `BudgetError('daily_cap')` → `finishRun(agent,'quota')` | → `state='deferred'`, `retry_after = next UTC midnight`, user sees "queued for tomorrow, position N" | The work survives. The cap does not move; only the failure mode changes |
| `RateLimitedError` (3021) → run ends | → `state='deferred'`, `retry_after = now + backoff`, and `SchedulerDO` halves `maxInFlight` | 3021 costs nothing (nothing was billed, per `gateway.ts`), so ending the run throws away work for free |
| `execStudioOp` blocks the alarm on an in-memory Promise for up to 30s | Step returns; result is persisted by `handlePluginPoll` into `op_results`, which sets an alarm; the next alarm resumes | Survives eviction and deploys. Also stops one alarm holding a DO resident for 30s per Studio op |
| `STEP_STALE_MS` checked only when an alarm fires | Cron sweeper scans `jobs` where `state IN ('running','waiting_tool') AND updated_at < now-180s` | A lost alarm is currently unrecoverable |
| No record of refused work | `jobs` table with `attempts`, `last_error`, `deferred_reason` | You cannot tune a scheduler you cannot see |

The `jobs` table, concretely:

```sql
create table if not exists jobs(
  id text primary key,
  user_id text not null,
  mode text not null,
  state text not null,            -- queued|admitted|running|waiting_tool|deferred|done|failed
  score real not null default 0,
  enqueued_at integer not null,
  admitted_at integer,
  updated_at integer not null,
  attempts integer not null default 0,
  retry_after integer,
  wait_op_id text,
  est_neurons integer,
  actual_neurons integer default 0,
  deferred_reason text,
  last_error text
);
create index if not exists jobs_state on jobs(state, retry_after);
```

`AgentState` stays exactly where it is (`storage.get('agent')`). The job record is *about* the run;
`AgentState` *is* the run. Keeping them separate means the scheduler never has to deserialise a
transcript to make a decision.

### 1.4 What it costs on the current plan

Throughput is capped by the neuron budget long before it is capped by anything else. The daily
ceiling is 25,000 neurons, so:

- 25,000 ÷ 2,300 (quality-gated build) = **10.8 builds/day**
- 25,000 ÷ 511 (Stone build+verify) = **48.9 builds/day**

So the system can never process more than ~11–49 build jobs per day, plus questions. Call it 200
jobs/day as a generous ceiling including Clay questions. **6,080 jobs/month.**

| Resource | v2 usage/month | Paid allowance | Cost |
|---|---|---|---|
| SchedulerDO requests | 6,080 jobs × ~4 calls (offer/admit/release/sweep) = 24,320 | 1M included | **$0.00** |
| Cron invocations | 43,200 (1/min) — Worker requests | 10M included | **$0.00** |
| Cron CPU | 43,200 × ~5ms = 216,000 CPU-ms | 30M CPU-ms included | **$0.00** |
| SchedulerDO duration | 43,200 wakes × ~5ms × 0.128 GB ≈ **28 GB-s** | 400,000 GB-s included | **$0.00** |
| New SQLite rows written | ~6,080 jobs × ~6 updates = 36,480 | 50M included | **$0.00** |

**The entire v2 control plane costs $0.00/month**, because the AI budget throttles it to a
throughput at which no Cloudflare meter notices. That is not a lucky accident — it is the reason
this is the right time to build it.

**Cloudflare Queues and the plan question.** The task brief states Queues requires a paid plan.
This repo's own research (`docs/research/cf-free-limits.md` §8) states the opposite — Free plan,
10,000 operations/day, 24h fixed retention; Paid, 1M ops/month then $0.40/M. **I cannot verify
either claim from here without network calls, and I did not make any.** What I *can* verify from
the repo:

- Production runs `@cf/zai-org/glm-5.3-flash`, and `docs/research/spend-caps.md` records
  Cloudflare's verbatim statement that this model "require[s] a paid billing method … either the
  Workers Paid plan or prepaid AI Gateway credits."
- `wrangler.jsonc` binds Vectorize, which the same research records as "currently only available
  on the Workers paid plan."

So the account **almost certainly has Workers Paid or prepaid gateway credits** — otherwise
production would not run at all. That is a strong inference, not a verification. If it is Workers
Paid, Queues is covered either way and the cost is $0.00: 6,080 jobs × ~4 ops (producer write +
consumer read + delete, plus retries) = **24,320 ops/month against 1M included**. Confirm the plan
in the dashboard before writing any `queues` binding into `wrangler.jsonc`.

### 1.5 One cost the current model does not include

`docs/COST-MODEL.md` states non-AI resources sit "far inside the allowances." That was concluded
from a 30-user *load test* — short-lived. It does not cover a Studio plugin left open all day.

`handlePluginPoll` returns `waitMs: 2500` when idle. **Estimate**, with the arithmetic:

- 86,400 s/day ÷ 2.5 s = 34,560 polls/day per connected plugin
- Cloudflare evicts an idle DO after roughly 10 s of inactivity (documented behaviour, **assumption**
  — not measured here). A 2.5 s poll interval never reaches that threshold, so the SessionDO stays
  resident continuously.
- A DO pinned in memory for 24 h at the 128 MB billing unit = **11,059 GB-s/day** (this figure is
  taken from `docs/research/cf-free-limits.md` §3) = **336,194 GB-s/month**
- Paid includes 400,000 GB-s/month. **One always-connected plugin consumes ~84% of it.**
- Two such users: (672,388 − 400,000) × $12.50/M = **$3.40/month** of overage the $10.06 model does
  not contain. Ten: **$36/month.**

This is the largest un-modelled cost in the system and it has nothing to do with AI. Fix in §5.1.

---

## 2. Scheduling policy

### 2.1 The scoring function

Higher score runs first. Every constant is anchored to a measured number; the anchors are stated.

```ts
function score(job: JobRecord, now: number, stats: UserStats): number {
  const agedMin = (now - job.enqueued_at) / 60_000;

  return (
      120 * (job.tier === 'pro' ? 1 : 0)      // tier
    +   6 * agedMin                            // aging — no cap. This is the anti-starvation term.
    -   job.est_neurons / 25                   // expected cost
    -   job.est_seconds / 10                   // expected duration
    -  30 * stats.activeJobs                   // fairness: your own concurrent work
    -  40 * stats.hourlyNeuronShare            // fairness: 0..1 share of the last hour's spend
    -  200 * (job.abuse_flag ? 1 : 0)          // abuse
    +  50 * (job.interactive ? 1 : 0)          // Clay: ≤3 steps, sub-10s expectation
  );
}
```

`est_neurons` and `est_seconds` are not guesses. `BudgetDO.spend(day, model, kind, neurons, calls)`
already records spend keyed by `kind = "${mode}:step:${effort}"`. So:

```
est_neurons = meanNeuronsPerStep(mode)  ×  STEP_LIMITS[mode]  ×  0.6
```

where 0.6 is the fraction of the step ceiling a run actually uses — **an assumption**, to be
replaced by the measured mean from the `jobs` table within a week of it existing. `est_seconds`
comes from the same table once `admitted_at`/`updated_at` are recorded; until then, seed with
measured medians (2.0 s/step, 17.3 s/step under 6-way concurrency).

### 2.2 Worked examples — does it actually order things sensibly?

| Job | tier | aging | cost | duration | fairness | interactive | **score** |
|---|---|---|---|---|---|---|---|
| Free Clay question (40n, 8s) | 0 | 0 | −1.6 | −0.8 | 0 | +50 | **+47.6** |
| Pro gated build (2,300n, 240s) | +120 | 0 | −92 | −24 | 0 | 0 | **+4.0** |
| Pro Stone build (511n, 60s) | +120 | 0 | −20.4 | −6 | 0 | 0 | **+93.6** |
| Free gated build (2,300n, 240s) | 0 | 0 | −92 | −24 | 0 | 0 | **−116.0** |
| Free build, user's 2nd concurrent | 0 | 0 | −92 | −24 | −30 | 0 | **−146.0** |
| Free build, flagged abusive | 0 | 0 | −92 | −24 | 0 | 0 | **−316.0** |

Three properties fall out, and they are the ones worth having:

1. **A free user's question beats a Pro user's build** (+47.6 vs +4.0). Correct. The question costs
   1/57th as much and finishes in 8 s; making the Pro build wait 8 s is invisible, making the
   question wait 4 minutes is the entire product experience.
2. **Pro always beats an identical Free job** by exactly 120 points, at every cost and duration.
   The tier weight is the whole Pro implementation — no separate lane, no reserved capacity.
3. **Cheap beats expensive within a tier**, so the day's neuron budget buys the most completed
   work per neuron.

### 2.3 Starvation is prevented by arithmetic, not by a special case

Aging is +6/minute, uncapped. A Free gated build starts at −116:

- to overtake a fresh Pro gated build (+4.0): (4.0 + 116) / 6 = **20.0 minutes**
- to overtake a fresh Clay question (+47.6): (47.6 + 116) / 6 = **27.3 minutes**
- to overtake a fresh Pro Stone build (+93.6): (93.6 + 116) / 6 = **34.9 minutes**

So the guarantee is: **no job sits behind newly-arriving work for more than ~35 minutes**, whatever
its tier, whatever the arrival rate. That is a checkable property of the constants, not a promise.

Two backstops, because a constant can be mistuned:

- **Hard floor.** Any job with `now - enqueued_at > 45 min` is admitted at the head of the ready-set
  unconditionally, ahead of scoring. Asserted in the cron sweeper, so it fires even if the scoring
  path is broken.
- **Deferred jobs age too.** A job parked by `daily_cap` keeps its original `enqueued_at`, so
  yesterday's deferred work is at the front tomorrow morning, ahead of everything that arrives
  fresh. Without this, a heavy-day user is permanently behind a light-day user.

### 2.4 Provider health is a concurrency gate, not a score term

Health belongs on the size of the ready-set, not on the ordering. Sizing it from the two measured
numbers, via Little's Law:

```
inFlight = throughput × latency = (30 req/min ÷ 60) × 17.3 s  =  8.65
```

So **`maxInFlight` base = 6, ceiling = 8.** Above ~8 you are not adding throughput, you are moving
your queue inside Cloudflare's rate limiter, where it converts into 3021 errors instead of waits.

AIMD, driven by the signal the code already distinguishes:

| Event | Response |
|---|---|
| `RateLimitedError` (3021) | `maxInFlight = max(1, floor(maxInFlight / 2))` |
| 60 s with no 3021 | `maxInFlight = min(8, maxInFlight + 1)` |
| Circuit breaker open on the primary model (§3) | `maxInFlight = 2` while degraded |
| `BudgetError('daily_cap')` | `maxInFlight = 0`; all new work defers |

Critically: **3021 must never trip the circuit breaker.** `gateway.ts` already separates
`RateLimitedError` ("the request never reached the model and NOTHING was billed") from
`inference failed`. Conflating them would open the breaker under healthy load and fail over to a
model that costs 2.3× more — the exact opposite of the correct response.

### 2.5 SLA targets

Targets, not measurements. Nothing here has been observed; each is what the design is aimed at, so
that missing one is a bug report rather than an opinion.

| Class | p50 queue wait | p95 queue wait | Hard cap |
|---|---|---|---|
| Clay question (any tier) | < 200 ms | ≤ 5 s | 45 min (hard floor) |
| Pro build | < 2 s | ≤ 60 s | 45 min |
| Free build, normal day | < 5 s | ≤ 10 min | 45 min |
| Free build, budget-constrained day | — | — | deferred to next UTC day, position shown |

### 2.6 Abuse

Signals that already exist in the code, promoted into `abuse_flag`:

- `ipLimited(user:…, 240/min)` in `index.ts` trips → flag for 1 hour
- ≥3 runs in the last hour finishing with `agent.mutated === false` (paid for, changed nothing) —
  this is exactly the failure `MAX_NUDGES` was added to detect
- `seenCalls` duplicate-refusal fires more than 5× in one run
- projects created faster than 1/minute per account

A flagged job is not refused — refusal is indistinguishable from a bug to a legitimate user who
tripped a heuristic. It scores −200, which puts it behind everything, and it ages out of the flag in
an hour. It still consumes their own Sparks, so the flag costs the service nothing to be wrong
about.

---

## 3. Multi-provider resilience and task-state-preserving failover

### 3.1 Where the system is now

One provider. `env.AI.run` is the only inference call in the codebase, and `gateway.ts` hardcodes
`provider: 'workers-ai'` in the response. ADR-002's "optional opportunistic providers behind a
gateway with circuit breakers" is not present in the current code. Today's failure behaviour:

- 3021 → up to 3 bounded waits (1.2 s / 2.4 s / 3.6 s) → `RateLimitedError` → **run ends**
- anything else → `inference failed` → after step 1, **run ends** with "send another message"

The project state survives (it was already mutated in Studio; `AgentState` is on disk). The *run*
does not. That is the gap.

### 3.2 Why failover here is cheap

`AgentState.llm` is a complete OpenAI-shaped transcript with structured `toolCalls`. Continuing on a
different model is one line — swap `cfg.id`. Two things genuinely need work:

1. **Tool-call encoding.** `gateway.ts` already has a full prompted-tool fallback for models with
   `nativeTools: false` (`promptedToolPreamble` / `parsePromptedToolCalls`, plus the
   assistant-tool_calls-to-fences rewrite). The transcript is portable *because that path exists*.
   It is currently unexercised in production — every model in `DEFAULT_MODELS` is
   `nativeTools: true`. **It must be tested against a real second model before it is relied on**,
   and testing it costs inference, so it is a deliberate, budgeted experiment, not a deploy.
2. **Accounting.** `neuronsFor()` costs unknown models at the most expensive rate in the table — a
   safe default that quietly becomes wrong for a non-Cloudflare provider, which is not billed in
   neurons at all. Any real second *vendor* requires `BudgetDO` to gate on USD with neurons as a
   Workers-AI-specific unit. That is the actual work of multi-vendor, and it is why §5 defers it.

### 3.3 The ladder — all inside Workers AI, no new vendor

| Tier | Model | $/M in / out | Eval | Role |
|---|---|---|---|---|
| A | `@cf/zai-org/glm-5.3-flash` | 0.15 / 0.50 | 98.9 | Production. Everything. |
| B | `@cf/openai/gpt-oss-120b` | 0.35 / 0.75 | 97.6 | Failover. Native tools. Authoring-capable. |
| C | `@cf/qwen/qwen3-30b-a3b-fp8` | 0.051 / 0.335 | 88.2 | **Degraded mode only** — questions and inspection. Never authoring. |

Tier C's restriction is not caution, it is a recorded measurement: `router.ts` documents that
routing a post-inspection step to qwen3 changed the outcome — "the cheap model read the project tree
and declared the task finished instead of building it."

### 3.4 The cost guard, which is the part that matters

Tier B is roughly 2.3× the input price and 1.5× the output price of Tier A. **Estimate**: a
145-neuron GLM step becomes ~330 neurons on gpt-oss-120b, so a 16-step gated build goes from
**2,300 → ~5,300 neurons**, and the 25,000-neuron day buys **4–5 gated builds instead of 10–11**.

Failing over is therefore a decision to spend the day's capacity faster. So it is capped:

> **Failover may consume at most 25% of the day's remaining budget.** Past that, the service
> degrades to Clay-only on Tier A rather than burning the month on a backup model.

The daily and monthly ceilings are untouched. Failover cannot raise the bill — it can only
redistribute the same capped budget toward fewer, more expensive completions, and this rule bounds
how much of it goes that way.

### 3.5 Breaker mechanics

State lives in `BudgetDO`, because every inference call already round-trips there for `reserve`.
Zero additional latency, zero new objects.

```
per model: { consecutiveFailures, openUntil, failoverNeuronsToday }

open        after 3 consecutive non-rate-limit failures
half-open   60 s later — admit exactly 1 probe
close       on probe success; re-open (120 s, then 240 s) on probe failure
3021        NOT a failure. Feeds §2.4's maxInFlight instead.
```

Failover is per-step and mid-run. The step that failed over records `modelUsed` in its
`ToolTraceEntry`, so a degraded run is visible in the admin report rather than being an invisible
quality regression. A system note is appended to `agent.llm` only on a tier change, so the model
knows its own context may have shifted.

---

## 4. Multi-region, progressive deployment, capacity planning

### 4.1 Multi-region: one real bottleneck, and it exists today

`SessionDO` is `idFromName(projectId)`, so its home region is wherever the project was first opened
— already regional in the only sense that matters. The problem is the opposite:

> **`BudgetDO.idFromName('singleton')` is consulted twice by every single inference call**
> (`reserve` before, `settle` after), from one object in one region.

For a user whose nearest colo is far from that object, that is ~2 × RTT added to every step. At
300 ms RTT and 16 steps: **~9.6 s of pure latency tax per build** — larger than the median step
time. **Estimate**, from the RTT and the call count in `gateway.ts`.

The fix that preserves the ceiling exactly is **hierarchical budget leasing**:

```
BudgetDO (global)  ──lease(2,000 neurons, TTL 120s)──►  budget:eu / budget:apac / budget:wnam
                                                          reserve/settle locally against the lease
                   ◄──return unused / expire ─────────────
```

The correctness argument, stated precisely because it is the only thing that could break the $10.06
guarantee: *the global object never issues leases summing to more than the cap, so the cap is
preserved exactly.* What changes is float — up to (regions × lease size) neurons may be reserved but
unspent at any instant. 4 regions × 2,000 = **8,000 neurons = $0.088** of float. Leases expire in
120 s and the cron sweeper reclaims them, so a dead region cannot hold budget hostage.

**Do not build this now.** It is worthless with one region of users, and it weakens the strongest
property the system has: one single-threaded object owns the cap. Build it the week there is
measured cross-region latency pain, not before.

### 4.2 Progressive deployment

Workers gradual deployments (percentage rollout) work with Durable Objects, with one sharp edge that
this codebase already half-knows about. `AgentState` is written by one version and read by whichever
version handles the next alarm. `session.ts` has the right instinct in a comment — *"All optional: a
run persisted by an older deployment deserialises unchanged"* — so make it a rule:

> **Every field added to `AgentState`, `PendingOp`, or `JobRecord` is optional with a defined
> default, for at least two consecutive deploys.** A required field is a mid-run crash for every
> user with work in flight.

Procedure:

1. Deploy at **10%** for 15 minutes.
2. Watch, in `AdminDO` counters: `rate_limited`, `agent_error`, `deferred`, and 3021 rate. Any
   increase over baseline → roll back.
3. Go to 100%.
4. Rollback = redeploying the previous version. In-flight runs survive **because they are in storage,
   not memory** — with exactly one exception, which is `opWaiters`. That Map is the reason §5.1 item
   1 is first on the build list: until op results are persisted, *every deploy silently kills every
   run currently waiting on a Studio op.*

### 4.3 Predictive capacity planning

No ML, no forecasting library. The volume does not support one and the data is already sitting in
`BudgetDO.spend(day, model, kind, neurons, calls)`.

**Burn-rate projection**, one SQL query, zero inference:

```
projectedDay = dayNeurons × (86400 / secondsElapsedTodayUTC)
```

Acted on with real thresholds:

| Condition (after 06:00 UTC) | Action |
|---|---|
| projected > 20,000 (80% of ceiling) | `maxInFlight → 4`; warn in admin report |
| projected > 25,000 (the ceiling) | Defer new **Free-tier builds**; Clay questions and Pro builds continue |
| projected > 32,000 | Defer all builds; questions only |

This changes *who is served on a heavy day*, not how much is spent. Today's behaviour is
first-come-first-served straight into the wall, after which everyone gets "at capacity" — which is
the worst possible allocation of a fixed budget, because the expensive builds that arrived first
consumed the capacity that a hundred cheap questions could have used.

**Hour-of-day profile**, also free: 30 days of `spend` rows give a per-hour mean. An hour is "hot"
if actual > 1.5 × its trailing-30-day mean, which pre-emptively lowers `maxInFlight` before the
3021s start rather than after. That is the entire forecasting story, and it is proportional to the
data that exists.

---

## 5. What to build now, and what must wait

Constraint: **under ~$25/month before revenue.** Every item in §5.1 is $0.00 marginal.

### 5.1 Build now — all free

Ordered by value per line of code.

**1. Persist tool-wait state.** New `op_results` table; `handlePluginPoll` writes the result and
sets an alarm; the resumed step reads it. Delete the in-memory `opWaiters` Map.
*Why first:* it is a live bug (dropped op results on eviction), and it is the precondition for safe
progressive deployment (§4.2). ~60 lines. **$0.00.**

**2. `jobs` table in SessionDO.** A run becomes a record, including runs that were refused.
*Why:* nothing in §2 can be scheduled, deferred, counted, or tuned until this exists. **$0.00.**

**3. Defer instead of refuse.** `BudgetError('daily_cap')` and `RateLimitedError` set
`state='deferred'` with a `retry_after` rather than calling `finishRun`.
*Why:* the single largest user-visible improvement on the list. A 3021 costs nothing — ending a run
because of one throws away real work for free. **$0.00.**

**4. `SchedulerDO` + the §2.1 scoring function + AIMD `maxInFlight`.**
*Why:* this is the whole scheduling win, and it needs **no Queue at all** — a singleton DO with an
alarm *is* a scheduler. **~24,000 DO requests/month against 1M included = $0.00.**

**5. Cron trigger, 1/minute.** Stale-job sweep (fixes §0 item 4), deferred-job release, day
rollover, hard-floor promotion. Five cron triggers exist even on the Free plan; 250 on Paid.
**43,200 invocations + ~216,000 CPU-ms/month, both far inside included. $0.00.**

**6. Circuit breaker in `BudgetDO` + Tier B failover, capped at 25% of remaining daily budget.**
Uses an existing model on the existing `AI` binding. **$0.00 unless it fires**, and when it fires it
spends *within* the existing cap.

**7. Burn-rate projection + tiered deferral thresholds.** One SQL query against a table that already
exists. **$0.00.**

**8. Observability for all of the above.** `modelUsed` per trace entry; `deferred` / `failed_over` /
`3021` counters in `AdminDO`; queue depth and oldest-job-age in the admin report.
*Why:* a scheduler you cannot see is a scheduler you cannot tune, and every constant in §2.1 is a
guess until it is measured. **$0.00.**

**9. Idle poll backoff — the only item that saves money.** When no run is active **and** no browser
WebSocket is attached, return `waitMs: 20000` instead of `2500`. Keep 2,500 ms whenever a browser is
attached, so the trade-off (up to 20 s before the first Studio op of a cold run) only applies when
the user is not even looking at the app.
*Arithmetic* (**estimate**, same assumptions as §1.5): 34,560 → 4,320 polls/day; the DO can now
reach the ~10 s eviction threshold, so resident time drops from continuous to roughly 1 s per wake:
4,320 × 1 s × 0.128 GB = **553 GB-s/day = 16,800 GB-s/month**, down from ~336,000. **A ~95%
reduction**, which is the difference between one always-connected user consuming 84% of the included
allowance and consuming 4%.

### 5.2 Wait for revenue — and be honest about why

**Cloudflare Queues.** *Cost is not the reason.* At ≤200 jobs/day a `SchedulerDO` with an alarm
provides the same at-least-once and retry guarantees in ~100 lines. Queues adds a second failure
domain, a consumer Worker to deploy and version, a 128 KB message limit, and (per this repo's own
research) a 24 h retention floor on the Free plan. **Trigger to build it:** sustained backlog above
~200 jobs/day — which requires roughly 4× today's AI budget, which requires revenue by definition.
Also: confirm the account's plan in the dashboard first (§1.4).

**Regional budget leasing / multi-region.** Worthless with one region of users, and it trades away
the cleanest property in the system (one object owns the cap) for latency nobody has measured yet.
**Trigger:** measured p50 step latency in a second region exceeding the first by >200 ms.

**A second AI vendor** (Groq, HF, Together, anyone). Each one needs a card, a key in the Worker, a
second price table, and a second billing surface that `BudgetDO` structurally cannot gate because it
counts neurons. The entire failover story in §3 is achievable inside Workers AI on the existing
binding. Adding a vendor before revenue converts one hard $10.06 ceiling into two ceilings, one of
which you do not control. **This is the most tempting item on the list and the most expensive
mistake available.**

**Prepaid AI Gateway credits** to lift the RPM ceiling. This is the documented lever
(`docs/COST-MODEL.md`) and it is a purchase. It stays documented and unbought. §2.4's AIMD is the
free substitute: it converts 3021s into waits instead of errors, which is most of the value.

**R2 for checkpoints.** Still needs a card (ADR-009). DO SQLite works; the 12 MB checkpoint cap is a
product limit, not a scaling wall.

**Any real forecasting** — ARIMA, Prophet, an ML model, a metrics vendor. There is nothing to
autoscale: Workers AI capacity is not a knob you own, and the only lever the projection feeds is
`maxInFlight`, which a ratio-against-a-mean sets perfectly well. Buying observability before there
is anything to observe is the classic pre-revenue mistake.

**Pro-tier infrastructure beyond the 120-point constant.** A dedicated queue, reserved capacity, or
a separate worker for Pro is subsidising a plan nobody is paying for yet. The tier weight *is* the
Pro implementation until Pro has customers.

---

## 6. What this does NOT solve

Stated plainly, because a scale document that only lists wins is a sales document.

**It does not create capacity.** The daily ceiling is 25,000 neurons and stays there. Deferring is
not capacity — on a heavy day the last user is still told to come back tomorrow. The scheduler makes
that message honest, ordered, and survivable. It does not make it go away. Only money does.

**It does not fix the free-plan arithmetic.** One quality-gated build is ~2,300 neurons; a Free day
is 1,800 neurons (60 Sparks × 30). A gated build still does not fit in a Free day, and public
pricing is not changing. The scheduler makes the shortfall visible and ordered rather than sudden.

**It barely helps with RPM.** 30 req/min ÷ ~16 calls per build = ~1.9 builds/minute of rate
capacity, or ~2,700 builds/day — two orders of magnitude above what the neuron budget allows. So the
binding constraint is the budget, and 3021 only bites in *bursts* (more than ~8 users pressing build
in the same minute). §2.4 smooths bursts. Nothing in this document raises sustained throughput.

**It does not make a wrong build right.** The visual gate (ADR-012/015) catches some of it.
Scheduling catches none of it. A perfectly scheduled grey slab is still a grey slab.

**It does not parallelise a single project.** One `SessionDO` per project, one alarm, one run. Two
collaborators on one project still serialise, and v2 does not change that — it is arguably the
correct behaviour, but it is a limit and it should be named.

**It does not solve the always-connected-plugin cost.** §5.1 item 9 is a 95% mitigation of a cost
that is real and currently un-modelled, and it is an **estimate** resting on an unverified eviction
threshold. The right next step is to *measure* DO duration from the Cloudflare dashboard with one
plugin connected for an hour — a measurement that costs nothing and would replace the whole of §1.5
with a fact.

**It does not survive the primary model being withdrawn.** Tier B failover handles an outage. It
does not handle `@cf/zai-org/glm-5.3-flash` being deprecated, repriced, or having its paid-billing
requirement changed. That is a business risk with an engineering mitigation (the ladder in §3.3 and
the untested prompted-tool path in `gateway.ts`), and the mitigation is untested. Testing it costs
inference and is therefore a decision, not a task.

**It does not validate prefix caching.** Caching is verified *not surfaced* on the production model.
The `x-session-affinity` header is already sent, so the discount applies automatically if Cloudflare
ever enables it for GLM. Until then, every step re-prefills ~5,200 tokens from cold and all the cost
arithmetic above assumes that. Do not budget for a saving that does not exist today.

---

### Note on verification

No TypeScript was written, so `npx tsc --noEmit` was not run — this document is the only file
produced, and the worker source is untouched. Nothing here was deployed, no inference was run, no
`wrangler` command was executed, and no Cloudflare resource was created or modified.
