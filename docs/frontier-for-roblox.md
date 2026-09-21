# MAKING THE MODEL FRONTIER FOR ROBLOX — measured at the customer's end, not at the shortlist

**Measured:** 2026-09-20, against `apple.moshe-barami111.workers.dev`, the deployed Worker.
**Scored by:** execution. Every produced module is RUN against that example's own exhaustive checks
(`scoreGameLogic` in `packages/training/src/score-eval.mjs`, the scorer eval-v4 and eval-production
already use). No similarity to a reference answer is computed anywhere. A fluent wrong answer
scores zero.

---

## 1. WHY THIS EXISTS

Four parallel workflows improved RETRIEVAL on the same eighty customer-phrased queries: shipped 61%
top-1, then 75%, 81.3%, 82.5% and 91%. Every one of those is a fact about a **shortlist**.

None of them is a fact about the Luau a customer ends up with. Between the shortlist and the
customer stands the thing nobody measured: the model still has to write the module, and
`eval-production.mjs` records it getting that wrong on a third to a half of the curriculum **with
the library sitting right there**.

That is this repository's own failure shape one level up — something PRESENT that is never REACHED —
so this work measures arms end to end, in the only unit a customer can feel.

**One unit for everything.** Every one of the eighty verified modules passes the curriculum's own
checks for its own id: 80/80, established by `compare-generation-arms.mjs` RUNNING all eighty, not
by citing the build script. So a policy of "retrieve, then hand the top hit over" is correct exactly
when retrieval's top-1 is correct. Its end-to-end score therefore **equals top-1**, and the
retrieval numbers become directly comparable to the generation numbers.

---

## 2. WHAT WAS BUILT

`packages/training/src/generation-arms.mjs` — seven arms over one slice of the game-logic
curriculum, all through `/api/admin/model-test` at the production resolution for the **apple lane in
Agent mode**: gateway `stone`, served `@cf/zai-org/glm-5.3-flash`, effort `high` (a floor), base
4400, requested 5500, ceiling 5600, nothing clamped.

> **Those five fields were production on 2026-09-20 and three of them are not production now.**
> Commit `8b61c91` moved `high` from ×1.25 to ×2 and stone's ceiling from 5600 to 6500, so the
> product sends requested **8800**, ceiling **6500**, effective **6500**, **clamped**. Every number
> in §4 and §5 was taken at effective 5500 and is left at 5500, because a table that silently
> restates itself under new settings is worse than a dated one.
>
> **How much of the table that can move, measured rather than estimated.** `maxTokens` is binding
> only when a call stops at `length`. Across all 560 arm-prompts in the seven runs that happened 6
> times, and in the four SINGLE-CALL arms — `baseline`, `fewshot`, `fewshotcustomer`,
> `fewshotrandom`, 320 prompts — it happened **zero** times. So the budget change cannot move those
> four rows at all, and can touch at most 3 of 560 elsewhere. The harness no longer carries the
> numbers by hand: it derives them from `production-settings.mjs`, which
> `production-settings.test.mjs` holds against `apps/worker/src` field by field.

| arm | what it does | model calls |
|---|---|---|
| `baseline` | the shipped system prompt, one call | 1 |
| `fewshot` | + 3 verified modules as worked examples, retrieved with the CONTRACT's words | 1 |
| `fewshotcustomer` | same, retrieved with the CUSTOMER's words (the production door) | 1 |
| `fewshotrandom` | same, 3 modules chosen without looking at the request — **the control** | 1 |
| `secondpass` | generate, then re-read your own answer against the contract. No execution — **the control for repair** | 2 |
| `specrepair` | generate the module AND the assertions that would catch it being wrong; RUN them; repair from the one that failed | 1–2 |
| `oracle` | generate, run against the HIDDEN eval checks, repair from their error — **a ceiling, not shippable** | 1–2 |

### The two ideas, stated plainly

**Idea 1 — spec-first self-repair.** The model is asked for the module *and* for the assertions
that would catch it being wrong. The assertions are executed against the module. If one fails, the
failure text goes back and the module is rewritten; the rewrite is executed again and is only
adopted if it now passes. The signal is the model's **own** assertions — never the eval's checks.

This is not a new capability. `apps/worker/src/spec-runner.ts` already runs model-authored Luau
assertion cases in Studio and returns the error text of the ones that failed; `run_spec` is already
in `VERIFIER_TOOLS`. What is new is **who drives it**: the worker orchestrates the loop after a
code-writing step rather than waiting for the model to remember the tool. That matters, because a
peer measured the model reaching its knowledge tools 0% of the time on the first turn and 42% in a
real loop — a tool the model does not call is knowledge it does not have.

**Idea 2 — verified modules as worked examples, leave-one-out.** Three modules from the library are
put in the system prompt as worked examples of how this codebase writes and validates one.

### Leave-one-out is enforced, not promised

The eighty verified modules and the eighty curriculum examples are the **same eighty things**:
`verified-modules.json[i].id === curriculum[i].id`, and the module's `source` IS the reference
answer. Handing a model its own answer as an "example" scores ~100% and measures nothing.
`exemplarsFor` removes the target and throws if it ever survives; a test asserts it for all eighty,
and a second test asserts that the id overlap which makes the guard necessary still holds — a guard
whose premise has quietly changed is a guard that guards nothing.

### The fidelity gate

`generation-arms.mjs` refuses to spend a neuron unless its copy of the baseline system prompt is
byte-identical to the `system` recorded in `eval-production-apple-agent-armA-shipped.json`, and its
gateway and effective token budget match that run's settings. The gate was falsified before it was
trusted: the test corrupts the string, the budget and the gateway in turn and requires each to go
red, and requires a missing recorded run to read as a refusal rather than as agreement.

---

## 3. THE MEASUREMENT ENVIRONMENT, INCLUDING WHAT WENT WRONG

**The gateway caches chat completions, and this was measured rather than assumed.** A unique
nonce-bearing prompt at production settings: first call 4,342 ms / 586 chars, second 121 ms, third
117 ms, all three byte-identical (SHA-1 `3d23e3aa`), with the same reported neuron count each time.
`gateway.ts:623` passes `cacheTtl: 0`, so this is the AI Gateway's own cache, not the code's.

Three consequences, all of which shape the numbers below:

1. Re-running an arm replays what it already answered and only retries what bounced, at no new
   spend. That is how the holes described next were closed.
2. A neuron figure taken from a replayed run is the cost the call *would* have, not new spend on the
   account. Both are stated in §5.
3. An arm is deterministic on replay, so the differences between arms are differences in the answers
   the model produced, not resampling noise on the same answers.

**The bounce, and why it had to be closed rather than reported around.** Under load the gateway
answers `HTTP 500 — "Apple is handling a burst of requests right now. Nothing was charged"` at
around 7.9 s. The first attempt at this measurement ran three arms concurrently and lost prompts to
exhausted retries. A prompt that was never answered is not a prompt the model got wrong — and worse,
**the losses land wherever the burst fell, not at random**, so a run with holes is a biased slice
rather than a smaller one. The retry ladder was lengthened from four attempts to six (the error says
nothing was charged, so a retry costs attempts and no neurons), the arms were moved to run one at a
time, and each arm was re-swept until it reported `notMeasured: 0`.

---

## 4. RESULTS

**Measured 2026-09-20T20:14Z → 2026-09-20T22:40Z.** Seven arms, the **full eighty-example**
game-logic curriculum (`curriculum[0..79]`), every arm against
`https://apple.moshe-barami111.workers.dev` — the worker the product serves. The two `*-pilot.json`
runs still on disk were taken against `golem.moshe-barami111.workers.dev`, the pre-rename
deployment (see commit `e246924`), and are n=3; nothing below uses them, and
`compare-generation-arms.mjs` excludes them by name.

Every arm returned `notMeasured: 0`, so no arm is a biased slice. Every arm passed the fidelity gate
and ran byte-identical settings — gateway `stone`, effort `high`, base 4400, requested 5500, ceiling
5600, nothing clamped, served `@cf/zai-org/glm-5.3-flash` — compared field by field across all seven
run files rather than trusted because the same flag was typed.

`library sanity: 80/80 verified modules pass the curriculum's own checks when executed`, RUN by the
comparator. That is what makes the retrieval rows below commensurable with the generation rows
instead of merely adjacent to them.

## 4.1 Every approach in one unit — does the customer end up with Luau that passes its own checks

| arm | passes | vs baseline | McNemar p | calls | neurons/prompt | ms/prompt |
|---|---|---|---|---|---|---|
| `fewshot` — 3 examples retrieved with the CONTRACT's words | **74/80 — 92.5%** | +24 / −3 | <0.0001 | 1 | 35.4 | 8,405 |
| `fewshotcustomer` — 3 examples retrieved with the CUSTOMER's words | 68/80 — 85% | +18 / −3 | 0.0015 | 1 | 34.9 | 9,036 |
| **`fewshotrandom` — 3 examples chosen WITHOUT looking at the request — the control** | **67/80 — 83.8%** | +17 / −3 | 0.0026 | 1 | 34.9 | 8,497 |
| `oracle` — repair from the HIDDEN eval checks — **CEILING, NOT SHIPPABLE** | 63/80 — 78.8% | +12 / −2 | 0.0129 | 1.32 | 35.3 | 12,136 |
| `secondpass` — re-read your own answer against the contract — control for repair | 62/80 — 77.5% | +14 / −5 | 0.0636 | 2 | 42.4 | 14,767 |
| `specrepair` — write assertions, RUN them, repair from the one that failed | 58/80 — 72.5% | +8 / −3 | 0.2266 | 1.9 | 110.4 | 37,877 |
| `baseline` — the shipped system prompt | 53/80 — 66.3% | — | — | 1 | 17.1 | 7,679 |

The retrieval work restated in the same unit — no generation, **zero model calls** — correct exactly
when top-1 is correct, because every library module passes its own checks:

| policy | end to end | model calls |
|---|---|---|
| **retrieve-then-hand-over, the shipped door TODAY (`need-index-search.ts`)** | **73/80 — 91.3%** | **0** |
| retrieve-then-hand-over, need-index BM25F as the peer workflow measured it | 73/80 — 91.3% | 0 |
| retrieve-then-hand-over, the embedding index, int8 in the bundle | 69/80 — 86.3% | 0 |
| retrieve-then-hand-over, the door AS RECORDED at 11:23 — superseded, kept for history | 49/80 — 61.3% | 0 |

## 4.2 The control is the result, and it refutes the idea it was built to test

**Idea 2 works, and not for the reason it was proposed.** Three worked examples take the model from
53/80 to 67/80 — and those three were **chosen without looking at the request**. `+17 / −3`, exact
McNemar p = 0.0026. The effect is large and it is real.

What does not survive is the claim that *which* examples matter:

| comparison | flips | exact McNemar p | reading |
|---|---|---|---|
| the production door vs random picks | +9 / −8 | **1.0** | no detectable difference whatsoever |
| contract-phrased retrieval vs random picks | +11 / −4 | 0.1185 | not significant |
| contract-phrased vs customer-phrased retrieval | +10 / −4 | 0.1796 | not significant |

`fewshotcustomer` IS the production door: the customer's own words, through the retriever that now
answers 91.3% top-1. Against three modules picked by a seeded hash it scores **+9 / −8, p = 1.0**.
§2 asked this exact question and pre-committed to the reading — *"If the two arms score the same,
retrieval accuracy does not reach the customer's Luau."* They score the same.

**Why a better retriever could not have helped HERE — a fact about the experiment, not about
retrieval.** Leave-one-out removes the target module from the exemplars, and it must. But measured
against the live scorer, **the customer's query returns the target as the #1 hit in 73 of 80
cases**. So in 73 of 80 cases leave-one-out deletes precisely what retrieval found, and the arm is
handed hits #2–#4 — the nearest non-answers. An arm built this way cannot convert retrieval accuracy
into generation accuracy however good the retriever becomes. The exemplar-proximity counts say it
from the other side: `fewshotcustomer`'s exemplars share an id token with the target 13 times in 240
against `fewshotrandom`'s 2 — **more** related, and one point **lower**.

So the honest statement of what three worked examples buy is *a demonstration of how this codebase
writes and validates a module*. House style, not task knowledge. It is the largest single effect in
this table. It is not a retrieval result.

## 4.3 Idea 1 fails, and its own cross-tab says exactly why

`specrepair` scores **58/80 — below its own control**, `secondpass` at 62/80 (+5 / −9 against it,
p = 0.424), and is not distinguishable from the plain baseline (p = 0.2266) while costing **110.4
neurons and 37.9 seconds per prompt, 6.5× the baseline**, to get there.

The model's own assertions ran on 79 of 80. What they reported:

| | count |
|---|---|
| fired, and the answer really was wrong | 21 |
| **fired, though the answer was right** | **51** |
| silent, though the answer was wrong | 0 |
| silent, and the answer was right | 7 |

**The detector fires on 72 of 79.** Its recall is perfect only because it accuses nearly everything;
its precision is 21/72 = 29%. Fifty-one times it condemned a module that was correct, and every
condemnation triggers a rewrite of working code — which is how an arm with a repair loop lands below
an arm without one. `secondpass` shows the same hazard in miniature: it rewrote its own answer 26
times, and those rewrites fixed 6 and broke 3.

Idea 1's premise was that the model's own assertions carry signal. Measured, they are close to a
constant, and a constant carries none. The one thing the loop does deliver is the row
`SILENT though the answer was wrong: 0` — there is no failure it never looked at. The problem is not
blind spots. It is that it cannot tell right from wrong once it is looking.

**And the ceiling settles it.** `oracle` is handed the HIDDEN eval checks — the true failure text,
which no shippable system can have — and reaches 63/80. That is *below* three randomly chosen worked
examples (67/80; +8 / −12 against it, p = 0.5034) and **significantly below** `fewshot` at 74/80
(+2 / −13, p = 0.0074). A perfect error signal is worth +10 over baseline. Three worked examples are
worth +14. **On this curriculum the demonstration is worth more than the diagnosis**, and every
repair architecture in this table is bounded by a ceiling that few-shot has already passed.

## 4.4 What this says about being frontier AT ROBLOX

The best thing the product can do with this curriculum is **not generate the module at all**:
retrieve it and hand it over. 73/80 — 91.3%, zero model calls, no output tokens, no latency past the
lookup. Every shippable generation arm is below it — `fewshotcustomer` 68/80 at 34.9 neurons and
~9 s a prompt, `secondpass` 62/80 for two calls, `specrepair` 58/80 for 110 neurons — and the only
arm above it, `fewshot` at 74/80, retrieves with the *contract's* words, which a customer does not
have and never types.

That is the concrete form of the instruction to find a better method than the obvious one. The
obvious method was to make the model write better Luau. The better method is to stop asking it to on
the eighty requests where a verified, executed answer already exists, and to spend the model on the
requests that fall outside the library.

Two caveats, stated because they bound the numbers and are invisible inside them:

- **Eighty is the whole curriculum AND the whole library.** Every one of these requests has a
  verified module. A request that does not is a request where retrieve-then-hand-over scores zero
  and the generation arms are all there is. This table measures the covered case. It says nothing
  about coverage — and coverage is where the remaining work is.
- **The arms resample, so the flips are not all signal.** §3 established that the gateway replays an
  identical request byte-identical, and that reproduced here: three identical calls returned SHA-1
  `616f3afa` at 4,119 ms, then 279 ms, then 201 ms. It does **not** hold across an hour.
  `secondpass`'s first call is identical in construction to the entire `baseline` arm, yet of the 54
  prompts where the second pass changed nothing, only **5** produced the same answer length as
  `baseline` had an hour earlier. So the cache is short-lived, every arm above is real spend rather
  than replay, and part of every flip count is resampling. That is exactly why this table is read
  with a paired McNemar over the same prompts instead of by subtracting two percentages.

## 4.5 What it cost

**24,834 neurons across the seven arms**, all genuine spend (see the resampling note above), against
the 90,000/day billable cap — 27.6% of one day. Per arm: baseline 1,364 · fewshot 2,835 ·
fewshotcustomer 2,792 · fewshotrandom 2,791 · secondpass 3,395 · specrepair 8,830 · oracle 2,827.
`specrepair` alone is 36% of the bill and it is the worst-performing arm.

A further 12.2 neurons went on the retrieval re-measurement and ~33 on the cache probe quoted above.

---

## 5. COST AND LATENCY

Measured per arm over the same eighty prompts, as reported by the gateway on every call. "Neurons"
is Workers AI's own billing unit and the account's cap is 90,000/day billable.

| arm | calls/prompt | neurons/prompt | total neurons | ms/prompt | passes |
|---|---|---|---|---|---|
| `baseline` | 1 | 17.1 | 1,364 | 7,679 | 53/80 |
| `fewshotrandom` | 1 | 34.9 | 2,791 | 8,497 | 67/80 |
| `fewshotcustomer` | 1 | 34.9 | 2,792 | 9,036 | 68/80 |
| `fewshot` | 1 | 35.4 | 2,835 | 8,405 | 74/80 |
| `oracle` (ceiling) | 1.32 | 35.3 | 2,827 | 12,136 | 63/80 |
| `secondpass` | 2 | 42.4 | 3,395 | 14,767 | 62/80 |
| `specrepair` | 1.9 | 110.4 | 8,830 | 37,877 | 58/80 |
| **retrieve-then-hand-over** | **0** | **0** | **0** | lookup only | **73/80** |

**Three worked examples double the per-prompt cost and buy +14 points.** That is the good trade in
this table: 17.1 → 34.9 neurons for 53/80 → 67/80.

**`specrepair` is the bad one, in both directions at once.** 110.4 neurons and 37.9 seconds per
prompt — 6.5× the baseline cost and 4.9× its latency — for 58/80, which is below the 62/80 its own
two-call control reaches for 42.4. It is 36% of everything this study spent and it is the arm that
scored worst of the six non-baseline arms.

**The cheapest policy in the table is also the second-best one.** Retrieve-then-hand-over answers
73/80 for zero model calls, zero output tokens and no generation latency. On the covered curriculum
the model's cheapest useful contribution is to not be called.

---

## 6. WHAT WAS NOT MEASURED

Stated as gaps rather than left for a reader to infer:

- **Coverage.** All eighty curriculum requests have a verified module, so retrieve-then-hand-over is
  measured only where it can win. How often a real request falls outside the library is still
  unmeasured and is still the single largest missing number on this page. What is no longer
  unmeasured is the *other* half of that sentence — "its score on a request the library does not
  cover is zero" was an assertion when this was written, and §7 now reports it as 0/80, executed.
- **The Apple MAX lane.** Every arm ran the **apple** lane in Agent mode — gateway `stone`, 5,500
  tokens. MAX in Agent/Super Agent resolves to `rune` at 6,500. None of these arms were run there,
  so nothing here supports or refutes any claim about MAX, including the recorded observation in
  `eval-production-SUMMARY.json` that MAX in Super Agent went net −2 of 22 against the free lane.
- **Held-out prompts.** The eighty customer phrasings in `customer-queries.mjs` are one session's
  judgement of how a person asks, by that file's own admission, not sampled traffic. Every
  percentage here inherits that.
- **Combinations.** `fewshot` + a repair loop was not run. Since the oracle ceiling (63/80) is below
  `fewshot` alone (74/80), a repair loop on top of few-shot looks unpromising, but "looks
  unpromising" is not a measurement and this page does not claim it as one.
- **Whether the few-shot gain survives outside game logic.** Only the game-logic curriculum was
  scored. UI generation, world layout and tool trajectories were not touched by these arms.
- **How many exemplars.** k=3 throughout. k=1, k=5 and k=10 were not measured, so the shape of the
  curve between "no examples" and "three examples" is unknown — including whether one would do.
- **A quantisation evaluation of the local adapters.** Out of scope here and still open; see
  `docs/model-serving-reality.md` for why no locally-trained adapter can reach the production model
  at all.

---

## 7. THE POLICY THIS TABLE IMPLIES, AND THE TWO NUMBERS IT WAS MISSING

**Measured 2026-09-21.** `packages/training/src/measure-library-abstention.mjs`, written for this
section, run against `apple.moshe-barami111.workers.dev` at `buildSha 3236f91-dirty`. **Zero model
calls** — everything below is the shipped ranker plus the local Luau interpreter.

### 7.1 "Its score on an uncovered request is zero" was an assertion. It is 0/80.

§4.4 rests on retrieve-then-hand-over scoring 73/80, and §6 conceded that on a request the library
does not cover it "is zero". Nobody had run that. The run is simple: strike a request's own answer
out of the ranking — the library no longer contains it — hand over whatever the door returns
instead, and EXECUTE that module against the request's own exhaustive checks.

**0 of 80 pass.** All eighty came back `fails_own_checks`, which is a verdict the interpreter
produced. That distinction is load-bearing: a missing `luau` binary would have produced the identical
headline having executed nothing, so the test reads the *reasons*, not the count, and a mutation that
replaces the execution with an unavailable-harness stub turns that test red while leaving the 0/80
untouched. Being unable to look is not the same as having looked.

### 7.2 The door cannot tell a request it covers from one it does not — and now it can

`askVerifiedModule({need})` returned five candidates and no confidence of any kind. So on a request
outside the library it returned five confident wrong modules, which `verified-modules.ts`'s own
comment already calls the worst outcome available. The only reason its "an uncovered need SAYS so"
test passed is that its query, *render a volumetric cloud shader*, happens to score zero hits. Ask
for a DataStore save and BM25F returns five logic modules with a straight face: on the sixteen
engine-facing tasks in `roblox-frontier-tasks.mjs` — DataStores, RemoteEvents, tweens, mobile UI,
none of which this library has a module for — **16 of 16 were handed one**.

**The separating statistic is RELATIVE, and that is the finding, not a detail.**

| set | n | median top-1 SCORE | median relative margin |
|---|---|---|---|
| covered, top-1 right | 73 | 18.9 | **0.45** |
| covered, top-1 wrong | 7 | 10.4 | 0.07 |
| uncovered (answer struck out) | 80 | 8.8 | 0.15 |
| off-corpus (16 engine-facing tasks) | 16 | **20.1** | 0.11 |

Read the third column against the fourth. A BM25 total is a sum over the query's terms, so it grows
with the length of the query — and those sixteen uncovered prompts score **higher** on it than the
eighty the library actually covers. **Any policy keyed on the absolute score waves through exactly
the requests it exists to stop.** `(top1 − top2) / top1` divides the length out and the populations
separate. This is the trap a reasonable engineer walks into, so it is stated before the result.

### 7.3 The hybrid, joined prompt by prompt against the recorded arms

Hand over iff the relative margin clears `t`, otherwise generate. Every abstained prompt is scored by
what that arm's recorded run **actually did on that prompt** — never an average multiplied by a count.

| `t` | covered: hands / right | uncovered handed | off-corpus handed | with `baseline` (shipped fallback) | with `fewshotrandom` (not shipped) |
|---|---|---|---|---|---|
| **0.00 — the door as it ships** | 80 / 73 | **80/80** | **16/16** | **73/80** | **73/80** |
| 0.10 | 70 / 67 | 50/80 | 9/16 | 75/80 | 76/80 |
| **0.15 — shipped today** | 66 / 63 | 39/80 | 6/16 | **75/80** | **76/80** |
| 0.20 | 63 / 61 | 29/80 | 5/16 | 75/80 | 76/80 |
| 0.25 | 58 / 56 | 23/80 | 2/16 | 71/80 | 74/80 |
| 0.40 | 46 / 46 | 9/80 | 0/16 | 68/80 | 76/80 |
| 1.00 — never hand over | 0 / 0 | 0/80 | 0/16 | 53/80 | 67/80 |

The `t = 1.00` row is an anchor, not a candidate: it must reproduce each arm's own total, and it does
— 53 / 74 / 68 / 67 / 62 / 58 / 63, the seven numbers in §4.1. A mutation that credited every
abstention as a success reddened nothing until that row was added, which is how it came to exist.

**0.15 is shipped, and it is not the best cell in the grid.** The two populations overlap; there is
no clean separating value, and the sweep is over the same eighty queries it is scored on, so its peak
is a measurement of the grid. What sets the number is the **fallback**. An abstention sends the model
back to writing the module, and the *shipped* prompt writes it right 66% of the time against the
door's 91% — so abstaining pays only while the floor stays at or under 0.20, and by 0.40 the lost
hand-overs cost more than the avoided wrong ones. With three worked examples in the fallback the
whole band 0.10–0.40 wins instead. **The way to raise this floor is to make the fallback better
first**, which is §4.2's result waiting to be shipped.

### 7.4 What §4.4 becomes

§4.4 concluded that the best thing the product can do is not generate at all. That holds **on the
covered curriculum**, and 7.1 shows it is worth exactly zero off it. The policy that survives both is
neither pure arm:

> Retrieve. If the top hit is clearly ahead of the runner-up, hand it over — 0 model calls, and it is
> right. If it is not, say so and generate, because the runner-up passes 0 of 80.

That is what ships. It beats the always-hand-over door on the covered set (75/80 against 73/80 with
today's fallback) and, unlike the door, it does not collapse to zero on a request the library has
never seen.

### 7.5 How much of §4 is resampling — the number §4.5 said it did not have

Re-recording the shipped baseline at today's budget produced a paired re-run of an **identical arm**:
same 24 prompts, byte-identical system prompt, same model, same gateway, and `finishReason: stop` on
all 24 in both runs, so the budget was never binding in either and nothing but sampling differed.

**16/24 → 14/24. Four of twenty-four prompts flipped, +1 / −3.** Exact McNemar p = 0.625, so the
*difference* is noise — but the *size* of the noise is the finding. Scaled to n=80 that is roughly 13
discordant pairs from resampling alone, which puts `specrepair`'s +8/−3 (p = 0.2266) inside the null
and `secondpass`'s +14/−5 (p = 0.0636) at its edge. It does not touch `fewshot` (+24/−3, p < 0.0001)
or `fewshotrandom` (+17/−3, p = 0.0026).

This also retires §3's third consequence — "an arm is deterministic on replay, so the differences
between arms are differences in the answers the model produced, not resampling noise". The cache is
real but short-lived; across an hour it is not, and §4.5 already said so. One paired re-run at n=24
is a crude estimate of the noise floor and is labelled as one; the honest reading is that any flip
count in §4.1 below roughly ±13 should be treated as indistinguishable from nothing.

### 7.6 Still not measured after this section

- **How often real traffic falls outside the library.** Unchanged, and still the largest hole. 7.1
  fixes the *severity* of an uncovered request (zero), not its *frequency*.
- **The eighty customer phrasings** remain one session's judgement, by `customer-queries.mjs`'s own
  admission. The threshold is read off them.
- **The sixteen off-corpus prompts are in contract voice and are long.** That makes them the stress
  case for an absolute-score policy, which is why they are here, but they are not a register-matched
  sample of how a person asks.
- **Whether the floor helps a real build.** It is verified live in the deployed bundle
  (`CONFIDENCE_FLOOR = 0.15` is in the bytes Cloudflare serves) but `get_verified_module` is
  deliberately excluded from the MCP surface, so nothing short of a full agent run with a connected
  Studio exercises it end to end. That run has not been done.

---

## 8. THE ENGINE-FACING BENCHMARK, RUN FOR THE FIRST TIME — and what it changed

### 8.1 It had never produced a number

Everything in §4 through §7 is the **game-logic** curriculum: eighty pure, engine-independent
modules. Not one of them saves to a DataStore, fires a RemoteEvent or filters a player's text. §6
names that as a gap — *"whether the few-shot gain survives outside game logic"* — and
`roblox-frontier-bench.mjs` is the file written to close it: sixteen tasks where the tempting answer
and the correct answer use the same vocabulary, each decided by **running** the model's Luau under
`frontier-harness.luau` and reading the recording, never by matching text.

**It had never measured anything.** The three runs on disk before tonight read `notMeasured: 16`,
`notMeasured: 1`, `notMeasured: 1` and `neurons: 0` — every call on 2026-09-20 came back
`HTTP 500 Apple has reached today's shared building capacity`, the retry ladder and the pacing were
added in response, and the bench was never re-run. A benchmark that has produced no number is
indistinguishable, on a shelf, from one that produced a good one.

### 8.2 The arithmetic was wrong before the first number was read

The first run that completed printed **`9/13 items fully correct (69.2%)`** over sixteen items. Two
of the three missing items were answers the Luau compiler **rejected**:

```
Players.PlayerRemoving:(function(player)                       -- no method name
HttpService:CreateRequestHeadersAndEncodeData and HttpService:JSONEncode(...)   -- not an expression
```

Both are the model's own bytes — the harness prologue ends at line 1013 and both compiler messages
point past line 1029 — and a customer who pastes either into Studio gets a red underline and no
game. `tally` counted the denominator as `outcome === 'checked'` alone, so both left it and the
headline rose. That is this repository's observation-failure pattern running backwards: not a
failure to observe rendered as an observation, but **the most decidable observation a code benchmark
can make, rendered as a failure to observe**.

`checked`, `does_not_compile` and `no_code_block` are now in the denominator; `runtime_error` and
`harness_unavailable` stay out, unchanged and for the unchanged reason — in that same run
`look-raycast` threw `attempt to index nil with 'Connect'` on `mouse.Button1Down`, which the shim
genuinely does not implement, and counting that against the model would score the harness. Corrected,
that run is **9/15 — 60%**, and `excluded` is now printed beside `measured`.

### 8.3 Replicates that were replays

Six runs were taken to beat the sampling noise §7.5 measured. Comparing them **answer by answer**
before averaging anything:

| pair | byte-identical answers |
|---|---|
| neutral r2b vs r2c | **16 of 16 — r2c is a replay, discarded** |
| house-rules r2 vs r2b | 13 of 16 |
| neutral r2 vs r2b | 2 of 16 |
| house-rules-plus p1 vs p2 vs p3 | **0 of 16 — three genuinely independent samples** |

A replicate that is a replay is not a replicate. Averaging six runs here would have reported a
precision that does not exist, and no total below includes the discarded one.

**And the pattern is a measurement in its own right.** Ordered by the gap between the two runs:

| gap between runs | answers byte-identical |
|---|---|
| ~2 min (neutral r2b → r2c) | 16 of 16 |
| ~3.5 min (house-rules r2 → r2b) | 13 of 16 |
| ~5 min (neutral r2 → r2b) | 2 of 16 |
| ~9 min (house-rules-plus p1 → p2 → p3) | 0 of 16 |

Monotonic decay with the time gap is **a cache with a TTL of roughly five minutes**. It is not
determinism — determinism would be 16 of 16 at every gap. `/api/admin/model-test` calls `llmChat`
with no options at all, so `opts.cacheTtl ?? 0` sends `cacheTtl: 0`; this worker asked for no
response cache and got replays anyway. **Where the cache lives is not established here** and this
page does not guess, because the only thing measured is the effect.

What is established is the bill. `gateway.ts` computes neurons locally from the returned usage, so
the two runs two minutes apart were charged **207 neurons each for one generation**. §4.4 already
observed that the gateway replays an identical request and that the effect does not survive an hour;
this brackets it, and the comment in `apps/worker/src/providers/workers-ai.ts` now records that
sending `cacheTtl: 0` is not the same claim as nothing being replayed.

### 8.4 What production's own Roblox rules were buying: nothing measurable

Two arms, identical but for the system prompt. `neutral` says how to answer and nothing about
Roblox — it measures the **model**. `house-rules` carried production's IDENTITY rules verbatim.

| axis | `neutral` | `house-rules` |
|---|---|---|
| modern-api | 9/10 — 90% | 15/18 — 83% |
| server-authority | 6/10 — 60% | 9/15 — 60% |
| datastore-safety | **2/10 — 20%** | **5/15 — 33%** |
| **overall** | 17/30 — 56.7% | 29/48 — 60.4% |

The per-arm spread (neutral 53.3–60.0%, house-rules 50.0–68.8%) is **wider than the gap between the
arms**, so nothing here is a prompt effect. What is not noise is the item-level structure: **five of
sixteen items failed in every independent sample of both arms.**

And four of those five are things production's prompt **never said**. What it did say — `task.*`,
`Instance.new`'s parent argument, RemoteEvent placement, never trust the client — is the modern-api
axis, which both arms already passed 9/10 and 15/18. **The live prompt's Roblox guidance landed
where the model was already right and was silent where it was reliably wrong.**

### 8.5 Writing down the four things it never said

`house-rules-plus` is `house-rules` plus exactly four sentences, one per permanently-failing check,
each compressed from that check's own `cite`. A guard proves the arm is its control byte-for-byte
plus four bullets and nothing else, so a difference in score has one candidate cause.

| item | `neutral` | `house-rules` | `house-rules-plus` |
|---|---|---|---|
| `save-survives-throttle` | FAIL FAIL | FAIL FAIL FAIL | **PASS PASS PASS** |
| `failed-load-no-wipe` | FAIL FAIL | FAIL FAIL FAIL | **PASS PASS PASS** |
| `pet-rename` | FAIL FAIL | FAIL FAIL FAIL | FAIL **PASS** FAIL |
| `atomic-add` | FAIL FAIL | FAIL FAIL FAIL | FAIL FAIL FAIL |
| `shop-debit` | FAIL FAIL | FAIL FAIL FAIL | FAIL FAIL FAIL |

| axis | `house-rules` | `house-rules-plus` |
|---|---|---|
| modern-api | 15/18 — 83% | 15/18 — 83% |
| server-authority | 9/15 — 60% | 10/15 — 67% |
| **datastore-safety** | **5/15 — 33%** | **12/15 — 80%** |
| **overall** | 29/48 — 60.4% | **37/48 — 77.1%** |

**Two items that were deterministic failures in five independent samples are deterministic passes in
three.** `pet-rename` moved 0/3 → 1/3 and all three answers now call `FilterStringAsync`, which none
of the five prior answers ever did — the rule is read and obeyed, and sometimes obeyed wrongly.

The four rules were shipped into `apps/worker/src/prompts.ts` IDENTITY and deployed. They are in the
bytes Cloudflare serves (one occurrence each in `workers/scripts/apple/content/v2`, with a
never-shipped control string at zero), and every one of the composer's seven shipped variants is now
read for all four by a guard that goes red when one is dropped.

### 8.6 What did not move, and the statistics stated honestly

- **`atomic-add` fails `reported-total-is-real` in all eight samples across all three arms.** The
  UpdateAsync rule was obeyed — all three intervention answers use `UpdateAsync` and none uses
  `SetAsync`, and the concurrency check they used to fail now passes — and the item still fails, on
  a fourth check about the number the function **returns** matching the number in the store. It is
  the clearest single entry left on the work queue and no rule here addresses it.
- **`shop-debit` fails everywhere and should not be read as a server-authority result.** Its two
  failing checks fail because the model keys its item table on `"Sword"` while the probe fires the
  prompt's own spelling, `"sword"`; it passes both checks on that item that are actually about
  authority. It is deliberately not addressed, because a rule written to fix it would be a rule
  about matching strings and the arm would be measuring the benchmark's phrasing.
- `anim-emote` and `round-countdown` each slipped 3/3 → 2/3. One sample each, inside this suite's
  demonstrated noise, and named rather than netted away.
- **The sign test over the sixteen items is p = 0.2891** (6 up, 2 down) and is **not significant**.
  Pairing by (item, sample index) gives +10 / −2 and exact McNemar p = 0.0386, but sample 1 of one
  arm is not a matched condition of sample 1 of another, so that pairing is weaker than it looks.
  The claim this section rests on is neither: it is two items that were deterministic failures in
  five independent samples and are deterministic passes in three.

### 8.7 The number any public claim has to be written against

§4 reports **91.3%** — retrieve-then-hand-over on the eighty game-logic requests. Every one of those
eighty has a verified module, and §7 measured what happens to a request that does not: **0/80**.

This section is the other kind of request. Sixteen engine-facing tasks, no library entry for any of
them, scored by running the Luau in a Roblox shim. The best arm measured is **37/48 — 77.1%**, and
before tonight's four rules it was 60.4%.

So the honest pair of numbers is **91.3% where the library has the answer, 77.1% where it does
not** — and the second one is the one a sentence like *"the best-trained Roblox model"* would have
to be written against, because a customer's request does not know which set it is in. Nothing
user-facing carries such a claim today; `/docs/modes` says the two lanes run the same third-party
foundation model and that none of it was trained here, which was checked against the live page
tonight (the false sentence 0 occurrences, the corrected one 1, a control phrase present).

### 8.8 Still not measured after this section

- **Sixteen items is a small suite.** One item is 6.25 points. Every percentage here inherits that,
  and the per-sample spread in 8.4 is the honest width of the instrument.
- **Whether the four rules cost anything elsewhere.** They add roughly 120 tokens to every request
  and the two modern-api slips in 8.6 are the only evidence either way, which is not enough.
- **Whether the rules reach a real build.** They are provably in the served bundle and in all seven
  composed variants, but `/api/admin/model-test` takes the system prompt from the caller, so no
  measurement here went through the composer on the live worker. A real agent run with a connected
  Studio has not been done — the same limit §7.6 records for `CONFIDENCE_FLOOR`.
- **The Apple MAX lane.** Unchanged from §6: every arm here ran `apple` / Agent. `stone` and `rune`
  are the same model at the same ceiling, so nothing here supports or refutes a claim about MAX.
- **The eighty-vs-sixteen split is not a random split of one population.** The two sets were written
  for different purposes, so 91.3% and 77.1% are two measurements, not two arms of one experiment.
