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
  measured only where it can win. Its score on a request the library does not cover is zero, and
  nothing here measures how often that happens in real traffic. This is the single largest missing
  number on this page.
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
