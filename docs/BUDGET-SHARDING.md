# BudgetDO sharding — analysis, design, and the trigger to act on

**Verdict: do not shard. The provider rate limit binds ~200× before the Durable Object does, and
the spend ceiling binds before that.** This document derives that number, records the design that
would be correct *if* the trigger ever fires, and states the single measurement that should cause
someone to revisit it.

Everything below is derived from the code in `apps/worker/src/do/budget.ts`,
`apps/worker/src/gateway.ts`, and `apps/worker/src/pricing.ts` as of this writing. Numbers marked
**MEASURED** come from `docs/COST-MODEL.md` and `docs/LOAD-TEST.md`. Numbers marked **ESTIMATE**
are arithmetic on stated assumptions and have not been measured — the arithmetic is shown so the
assumption can be attacked.

---

## 1. What the current design actually does per request

`BudgetDO` is a singleton (`env.BUDGET_DO.idFromName('singleton')`, `gateway.ts:budgetStub`). Every
inference call in the product passes through it twice:

| Step | Endpoint | Storage work |
|---|---|---|
| before inference | `POST /reserve` | 4 × `storage.get` (`killed`, `killedReason`, `budget`, `limits`), 1 × `storage.put` |
| after inference | `POST /settle` | same 4 gets, 1 × `storage.put`, 2 × `sql.exec` (spend upsert + 62-day retention delete) |
| on provider failure | `POST /release` | 4 gets, 1 × `storage.put` |

So: **2 BudgetDO requests and 4 durable writes per inference call.** The four `storage.get`s are
served from the DO's in-memory cache after the object is warm, so they are not the cost centre; the
writes and the single-threaded dispatch are.

This is exactly why the guarantee holds. A Durable Object is globally unique and single-threaded, so
`/reserve` calls are totally ordered. `projectedDay = dayNeurons + dayPending + want` is computed
against a state no concurrent request can be halfway through mutating. Two requests cannot both see
"room for one more" and both be admitted.

---

## 2. At what rate does a single DO become the bottleneck?

Three independent bounds. They are listed weakest-binding to strongest-binding.

### Bound C — single-DO service rate (ESTIMATE)

Per `/reserve`: parse a <100-byte JSON body, four cache-warm `storage.get`s, roughly twenty
arithmetic operations, one `storage.put`, one JSON response. That is a fraction of a millisecond of
CPU. The uncertainty is entirely in how much of the durable commit is serialised into the request's
critical path (the runtime coalesces concurrent writes, which helps under exactly the load we care
about).

Take a deliberately pessimistic **5 ms of serialised wall time per DO request** — an order of
magnitude above the plausible CPU cost, assuming essentially no write coalescing:

```
1000 ms / 5 ms          = 200 BudgetDO requests/second
200 / 2 requests per call =  100 inference requests/second
100 × 60                =  6,000 inference requests/minute
```

At an absurdly pessimistic **20 ms**: 1,500 inference requests/minute.

### Bound A — the provider ceiling (MEASURED)

Measured sustained throughput with retry handling: **~30 successful inference requests/minute**
(error 3021 is the rate-limit code). That is 0.5 inference requests/second, which is

```
0.5 × 2 = 1.0 BudgetDO request/second
0.5 × 4 = 2.0 durable writes/second
```

**Headroom, pessimistic estimate vs. measured provider ceiling: 6,000 / 30 = 200×.**
Using the absurd 20 ms figure it is still **50×**.

The provider limit binds first, by two orders of magnitude. **Sharding is premature.**

### Bound B — the ledger caps its own workload (MEASURED constants)

This is the strongest argument and it is structural rather than empirical. `BudgetDO` refuses work
once the day's neurons are gone, so the object's maximum daily workload is a function of its own
ceiling:

```
daily ceiling = FREE_NEURONS_PER_DAY 10,000 + BILLABLE_NEURONS_PER_DAY 15,000 = 25,000 neurons
```

| step cost | max steps/day the ledger will admit | BudgetDO requests/day |
|---|---|---|
| 145 neurons (MEASURED, gated-build step) | 172 | 344 |
| 37 neurons (MEASURED, cheapest Clay question) | 675 | 1,350 |
| 1 neuron (docs-search embedding, the floor) | 25,000 | 50,000 |

Even the pathological case is bounded. And the pathological case is not reachable by one actor:
every path into `BudgetDO` is preceded by a per-user Spark debit in that user's own `QuotaDO`
(`SessionDO.quotaSpend` for agent runs, `/api/docs/search` for embeddings). At 1 Spark per search
and 60 Sparks/day on Free, driving 25,000 embeddings in a day needs **417 distinct users** — about
14× the largest concurrency actually tested (30 users, zero inference errors).

The realistic burst is the interesting figure. If an entire day's allowance were consumed inside a
single minute at the measured 145 neurons/step:

```
172 steps/minute = 2.9 steps/second = 5.7 BudgetDO requests/second
```

That is **35× below** even the pessimistic 200 req/s estimate — and it is a burst that, by
construction, cannot repeat until the next UTC day.

### Conclusion

The order of binding constraints is: **spend ceiling → provider rate limit → Durable Object.**
The DO is third by a factor of 35–200×. Nothing about the current traffic shape argues for sharding.

### What *would* degrade first, and it is not throughput

If a problem shows up here it will be **latency, not saturation** — specifically geographic latency.
The singleton lives in one Cloudflare colo. A user far from that colo pays two DO round trips per
agent step; across a ~16-step build that is 32 round trips of pure coordination. That is a real
cost, and **the fix is not sharding — sharding a global ceiling does not reduce round trips, it only
moves where they land.** The fixes are in §6, and they are all cheaper and safer than sharding.

### One present-day defect worth fixing regardless

A reservation is only released by `/settle` or `/release`. If the Worker isolate is evicted between
`reserve()` and the settle — a long build, a client disconnect, an unhandled path — `dayPending`
stays inflated until the UTC rollover clears it in `load()`. That **fails closed** (the day's
capacity shrinks, spend cannot escape), so it is an availability bug, not a spend bug. The fix is
to stamp each reservation with an `expiresAt` and sweep expired pending entries on the next
`load()`. Do this whether or not sharding ever happens; a sharded design needs it anyway (§4.5).

---

## 3. The invariant any sharded design must satisfy

If sharding ever happens, this is the property that must be provable, not merely tested:

> **At every instant, and in every partial-failure state, the sum of neurons that all shards are
> collectively permitted to spend today is ≤ the global daily ceiling.**

The design that achieves it is a **lease (escrow) hierarchy**, and its correctness rests on one
decision:

> **A lease is a debit at the moment it is issued, not at the moment it is reported.**

The root deducts the full lease from its pool when it hands the lease out. Shards can only ever
*spend down* or *return* budget; they can never create it. Every failure mode — a lost report, a
wedged shard, a dropped network call — therefore leaks budget in the **under-spend** direction.
Over-spend is not a race that can be lost; it is arithmetically unreachable.

---

## 4. The design (only if the trigger in §7 fires)

### 4.1 Topology

- **Root**: `BUDGET_DO.idFromName('budget:root')`. Owns the calendar, the ceiling, the kill switch,
  the runtime limits, the `unleased` pool, and the lease table. It is today's object with lease
  endpoints added.
- **Shards**: `budget:shard:0 … budget:shard:N-1`. Each holds a lease and runs today's exact
  reserve/settle arithmetic against it.
- **Routing**: `shard = hash(userId) % N`. **Hash by user, never by request.** A single user's
  16 steps then land on one shard, so their spend is contiguous, their lease churn is minimal, and
  the shard assignment matches the existing `QuotaDO` partitioning (`idFromName(userId)`).

### 4.2 Root state and the ceiling proof

```
ceiling      = FREE_NEURONS_PER_DAY + limits.billableNeuronsPerDay
headroom     = N × maxInFlightPerShard × limits.maxNeuronsPerRequest   // never leasable
unleased     = ceiling − headroom − Σ(outstanding leases) − Σ(settled overdraft)
```

Root issues a lease of size `L` only if `unleased ≥ L`, and decrements `unleased` by `L` in the same
single-threaded turn. Therefore:

```
Σ(outstanding leases) + unleased + headroom = ceiling                       (invariant)
Σ(what all shards may spend) ≤ Σ(outstanding leases) + headroom ≤ ceiling   (what we must prove)
```

`headroom` exists because settlement can legitimately exceed its reservation: `/settle` today does
`s.dayNeurons += spent` with no clamp, deliberately — the provider's reported neurons are billing
truth and must never be under-recorded. A shard's spend can therefore overshoot its lease by at most
`maxNeuronsPerRequest` per in-flight request. `headroom` is permanently withheld from `unleased` so
that even simultaneous maximum overdraft on every shard stays inside the ceiling. **Any sharded
implementation that omits `headroom` is wrong**, and it is wrong in the direction that costs money.

### 4.3 Lease sizing, and why it is fatal today

A lease must be at least `maxNeuronsPerRequest`, or a shard cannot admit even one maximum-size
request. So the floor on budget committed to shards is `N × maxNeuronsPerRequest`, and any of it
sitting on an idle shard is stranded for the rest of the day.

With today's constants (`ceiling = 25,000`, `maxNeuronsPerRequest = 1,200`):

```
ceiling / maxNeuronsPerRequest = 20.8
worst-case fragmentation at N=4:  4 × 1,200 / 25,000 = 19% of the day stranded
worst-case fragmentation at N=8:  8 × 1,200 / 25,000 = 38% of the day stranded
```

**Sharding a ceiling that is only ~21 maximum-size requests wide throws away a fifth to two-fifths
of the budget to buy throughput headroom of 35–200×.** That is not a trade-off; it is a loss on
both sides. This is an independent, arithmetic reason not to shard, and it converts into a hard
precondition in §7.

Refill policy, when the precondition is eventually met: hold one active lease and request the next
when the active one drops below 25% remaining, so refill overlaps with work instead of blocking it.

### 4.4 Race-free reservation and settlement

**Reservation** is unchanged *inside* a shard: a shard is still a single-threaded, globally unique
DO, so its reserves are still totally ordered against its own lease. The only new race is lease
acquisition, and that is serialised at the root, which is off the hot path (once per ~8 agent runs
rather than twice per step).

**Settlement** stays entirely local: decrement `pending`, add `actual` to `leaseSpent`, write the
`spend` row. No root round trip. Overdraft (`leaseSpent > lease`) is carried on the shard and
deducted from `unleased` by the root at the next lease request, *before* granting. Reporting is
therefore always the safe direction: a lost overdraft report means the root believes it has less
budget than it does.

**The `spend` reporting table** (`day, model, kind, neurons, calls`) is a per-shard SQLite table
after sharding. `/report` becomes a root fan-out that merges N result sets. This is a read path with
no correctness role — it must never be used for admission control.

### 4.5 Reconciliation drift

| Drift source | Direction | Handling |
|---|---|---|
| Lost lease-return / overdraft report | under-spend | Accepted. Lease is a debit at issue; reports only return budget. |
| Shard settles more than it reserved | over-spend, bounded | Covered by `headroom` (§4.2). |
| Reservation stranded by isolate eviction | under-spend | `expiresAt` on each reservation, swept on next `load()` (§2). |
| Clock skew across shards at UTC rollover | either | **Root owns the calendar.** Each lease carries `day`; a shard refuses to spend a lease whose `day ≠ today` and treats it as expired. Root resets `unleased` on its own rollover only. |
| Silent divergence | either | Root polls each shard every 60 s for `{leaseId, leaseSpent, pending}`. Any shard where `leaseSpent + pending > lease + maxNeuronsPerRequest` is **fenced**: root refuses it further leases and raises an alert. The audit is observability and quarantine only — it never grants budget. |

### 4.6 A shard dies holding reservations

A Durable Object does not lose durable storage on eviction, so "dead" means unreachable, wedged, or
never re-woken. Consequences, in order:

1. **The ceiling is never exceeded.** Unreturned lease budget is simply unspent. The system fails
   closed, which is the required behaviour.
2. **Capacity degrades** by up to the stranded lease size. This is the cost of sharding, and it is
   why leases must be small relative to the ceiling.
3. **Reclaim is conservative.** Root reclaims an expired lease into `unleased` **only** when it can
   prove the shard can no longer spend it — i.e. either the shard has acknowledged the lease closed,
   or the lease's `day` has rolled over, at which point the shard's own `day` check (§4.5) refuses
   it. **Never reclaim on a timeout alone.** A timeout means "no answer", not "not spending", and
   reclaiming on a timeout is precisely how a lease gets double-spent. Accept the stranded budget
   until the day rolls.
4. **In-flight requests on a wedged shard** fail closed at the gateway: `reserve()` throws, and
   `chat()` surfaces a `BudgetError`. No inference runs unreserved. If a shard is fenced, route its
   users to a neighbouring shard *for the next day*, not mid-day — mid-day rerouting means a user's
   pending reservations live on a shard nobody is settling against.

### 4.7 The kill switch — the hardest part, and the strongest argument against sharding

Today the kill switch is one `storage.get('killed')` inside the one object that admits all spend. It
is instant and total.

Sharded, it cannot be. Be honest about this: **sharding converts the kill switch from instantaneous
and absolute into "bounded by outstanding leases".** The design that bounds it tightly:

- Kill is **lease revocation**, not flag propagation. Root sets `killed = true`, sets
  `unleased = 0`, and fans out `POST /kill` to all N shards (N is small and enumerable). Each shard
  sets `killed` and zeroes its remaining lease.
- Every lease carries a short **`maxAge`** (e.g. 60 s). A shard refuses to open a *new* reservation
  against a lease older than `maxAge` without revalidating with the root. So even if fan-out fails
  completely, the blast radius is bounded by time as well as by budget.
- Worst case after pressing kill: `min(Σ outstanding leases, spend achievable in maxAge)` extra
  neurons. Both terms are design parameters you choose, and both must be small enough that the
  worst case is a rounding error against the monthly ceiling.

If you cannot make that worst case acceptable, **that alone is sufficient reason not to shard.**

### 4.8 What is preserved, and how

| Guarantee | Today | After sharding |
|---|---|---|
| Hard global daily/monthly ceiling | single-DO serialisation | root lease arithmetic + `headroom` (§4.2); provable, not tested-into |
| Race-free reservation | single-threaded DO | unchanged within a shard; lease acquisition serialised at root |
| Settlement on provider-reported neurons | `/settle` | unchanged, local to shard |
| Per-request cap `maxNeuronsPerRequest` | checked in `/reserve` *and* pre-checked in `gateway.chat` against the compiled constant | unchanged — keep both checks; the double check is why lowering the runtime limit is enforced and raising it is not (both fail closed) |
| Per-user limits | `QuotaDO` per user | untouched — already sharded by user, and routing budget by `hash(userId)` keeps the two aligned |
| Per-tier limits (`PLAN_LIMITS`) | `QuotaDO` | untouched |
| Admin kill switch | instant, total | bounded by `Σ leases` and `maxAge` (§4.7) — **a real regression, priced explicitly** |
| Runtime limit override (`POST /limits`) | one object | root only; shards receive limits inside the lease and never hold their own copy |

---

## 5. Migration path — zero-downtime and reversible

Every phase satisfies the §3 invariant, including mid-rollback. `SHARD_COUNT` lives in KV and is
read with a short cache (the `getModels` 60 s pattern in `gateway.ts` is the precedent), so a change
takes effect within ~60 s without a deploy.

**Phase 0 — instrument (do this now, independent of any sharding decision).**
Add reservation `expiresAt` + sweep (§2). Record Worker-side wall clock for the `/reserve` round
trip as `budget_reserve_ms`. Without this metric the trigger in §7 cannot be evaluated, so the
decision would be made on vibes. No behaviour change.

**Phase 1 — introduce the root, `SHARD_COUNT = 1`.**
`budget:root` *is* today's object; `idFromName('singleton')` keeps resolving to the same storage, so
there is no data migration. Add the lease endpoints. Critically, **reframe the root's own spend as a
self-lease now**, so root accounting is uniform before any second shard exists. `SHARD_COUNT = 1`
means shard 0 is the root and the lease path is a no-op fast path. Externally observable behaviour
is identical.

**Phase 2 — `SHARD_COUNT = 2`.**
The gateway begins routing by `hash(userId) % 2`. Shard 1 starts empty and acquires its first lease
on its first reserve. Root's `unleased` already accounts for everything shard 0 has spent, because
Phase 1 made that a self-lease. Flip at UTC rollover to avoid splitting a day's in-flight state.

**Phase 3 — raise `N` gradually**, re-checking the §4.3 fragmentation arithmetic at each step.
**Never change `N` mid-day.** A user's shard assignment would move and their pending reservations
would strand on the old shard — harmless (fails closed) but wasteful of a scarce ceiling.

**Rollback — one KV write.** Set `SHARD_COUNT = 1`; all traffic returns to root within the cache
TTL. Outstanding leases on retired shards are reclaimed at the day rollover per §4.6.3, not before.
Worst case is under-spending for the remainder of that day. There is no window, in either direction,
where the ceiling can be exceeded — because the lease-is-a-debit rule makes every intermediate state
satisfy the same invariant.

---

## 6. Do these first — all cheaper and safer than sharding

In order. Each reduces BudgetDO load without touching the ceiling.

1. **Reserve once per agent run, not once per step.** A gated build is ~16 steps; one run-level
   reservation cuts BudgetDO traffic by ~16×. It *over*-reserves, which makes the ceiling
   **tighter**, not looser. This is the single highest-leverage change and it strictly improves the
   safety property.
2. **Collapse `settle(n)` + `reserve(n+1)` into one `POST /settle-and-reserve`.** The agent loop is
   sequential within a run, so these two calls are always adjacent. One round trip instead of two:
   **2× reduction, zero semantic change**, and it becomes atomic, which is marginally stronger than
   today.
3. **Move `/settle` off the critical path** via `ctx.waitUntil`. Caveat, and it is not small: settle
   must still land *before* the next reserve, or the ledger transiently under-counts. Safe only in
   combination with (2), which makes the ordering explicit rather than hoped-for.
4. **Only then shard**, per §4.

Items 1 and 2 together are a ~32× reduction in BudgetDO traffic — comparable to what sharding to
N=32 would buy, with none of the fragmentation, none of the kill-switch regression, and no new
failure modes.

---

## 7. The trigger

Shard only when **all three** of the following hold. Any one alone is insufficient.

### T1 — Precondition (arithmetic; check this first, it is free)

```
dailyCeiling ≥ 100 × maxNeuronsPerRequest × N
```

Keeps worst-case idle-shard fragmentation (§4.3) under 1%. For `N = 2` and today's
`maxNeuronsPerRequest = 1,200`:

```
required ceiling  = 100 × 1,200 × 2 = 240,000 neurons/day
billable          = 240,000 − 10,000 free = 230,000 neurons/day
                  = 230,000 × $0.000011  = $2.53/day
                  = $2.53 × 30.4         ≈ $77/month
```

**Sharding is arithmetically unjustifiable until the monthly ceiling exceeds roughly $77/month** —
about 7.6× today's hard maximum of $10.06. Today's ratio is `25,000 / 1,200 = 20.8`, against a
required 200. It fails by ~10×.

The hard monthly ceiling is $10.06 and is not moving. **T1 therefore cannot be satisfied today, and
that settles the question without needing T2 or T3.**

### T2 — Queueing, not saturation (the real signal)

> **p95 of `budget_reserve_ms`, measured at the Worker, exceeds 250 ms sustained over one hour,
> while the DO's own per-request CPU time stays under 5 ms.**

The gap between the two is queueing at the object, which is the precise definition of "the DO is the
bottleneck". A high `budget_reserve_ms` with *high* DO CPU is a different problem (the endpoint got
expensive) and sharding will not fix it. A high `budget_reserve_ms` with low CPU and low request
rate is geographic latency, and §6 fixes it more cheaply.

Requires Phase 0 instrumentation. **This metric does not exist yet.**

### T3 — Throughput

> **Sustained BudgetDO request rate above 100/second for five continuous minutes.**

That is 50 inference req/s = 3,000/minute = **100× the measured provider ceiling of 30/minute**.
If this is observed, the first hypothesis should be that something is looping, not that the service
grew — check that before doing anything structural.

### Where the numbers stand today

| Signal | Threshold | Today |
|---|---|---|
| T1 `ceiling / maxNeuronsPerRequest` | ≥ 200 (for N=2) | **20.8** — fails by ~10× |
| T1 monthly ceiling | ≥ ~$77/month | **$10.06/month** (hard, not moving) |
| T2 p95 `budget_reserve_ms` | > 250 ms, low DO CPU | **not instrumented** (Phase 0) |
| T3 BudgetDO request rate | > 100/s sustained | **~1.0/s** at the measured provider ceiling |
| Realistic worst-case burst | — | **5.7/s** (a whole day's allowance inside one minute) |

**The number to watch is T2's `budget_reserve_ms`.** Everything else is already answered.

---

## Appendix — observations made while reading the code

Not defects in the spend guarantee; recorded because a sharded implementation would have to
reproduce or fix them.

- `/settle` (`budget.ts:251`) and the `killed` branch of `/reserve` (`budget.ts:198`) call
  `this.view(s, killed, killedReason)` without the `limits` argument, so the returned
  `dayRemainingFraction` and `freeRemainingToday` are computed against `DEFAULT_LIMITS` rather than
  any runtime override. **Reporting only — admission control always passes the live limits.** A
  sharded `/report` merge would inherit this inconsistency if copied verbatim.
- `gateway.chat` pre-checks the estimate against the *compiled* `MAX_NEURONS_PER_REQUEST` while
  `/reserve` checks the *runtime* `limits.maxNeuronsPerRequest`. The asymmetry is benign in both
  directions: lowering the runtime limit is still enforced by the DO, and raising it is still capped
  by the gateway. Both fail closed. Keep both checks.
- `/simulate-usage` is additive-only by explicit design, so an admin key cannot erase spend to slip
  past a cap. A sharded design must preserve that property at the **root**, and must not expose an
  equivalent write to shards.
