# Embedding retrieval for the knowledge layer

> ## SUPERSEDED IN ITS CONCLUSION — re-measured 2026-09-20T20:16Z
>
> **The gain this page reports is real and no longer worth taking.** Everything below compares an
> embedding index against a shipped lexical scorer that stood at **49/80 (61.3%)**. That scorer no
> longer exists. Commit `21231d9` — *"the door was the problem, not the knowledge: customer-phrased
> retrieval 61% -> 91%"* — shipped `apps/worker/src/need-index-search.ts`, which indexes generated
> paraphrases of the NEED each module serves beside its contract. On the **same 80 recorded customer
> queries**, re-run through the same harness against the Worker's own bundled code:
>
> | | customer top-1 | customer in-top-5 | contract top-1 | cost per request |
> |---|---|---|---|---|
> | shipped lexical **as recorded in Sept, the baseline below** | 49/80 — 61.3% | 67/80 | 80/80 | none |
> | **shipped lexical TODAY** (`need-index-search.ts`) | **73/80 — 91.3%** | 79/80 — 98.8% | 80/80 | **none** |
> | `apps/worker/src/embedding-retrieval.ts`, re-measured | 69/80 — 86.3% | 79/80 — 98.8% | 80/80 | one embed call |
>
> **The embedding module is now four queries WORSE than the free thing already in production.** RRF
> of the two was 72/80, also below 73. So the honest verdict is that the paraphrase-the-corpus route
> won this outright, it won without a request-time call, and no arm of the embedding route beats it
> here. Nothing on this page should be used to argue for wiring the index into the ranking path.
>
> The harness said so itself rather than being caught: it re-runs the shipped scorer first and
> prints `DOES NOT REPRODUCE — stop and find out why` when the recorded baseline and the live one
> disagree. `packages/training/runs/embedding-retrieval.json` records
> `harness.reproducesRecordedBaseline: false` with both numbers side by side.
>
> **Two things did change for the better.** The module named in the table below **did not exist**
> when that table was written — it was absent from the working tree and from every branch in git,
> so the harness that imports it could not run and nobody could have reproduced the 82.5%. It now
> exists, with `apps/worker/tests/embedding-retrieval.test.mjs` behind it. And the UI half still
> earns its place: see *The UI construction lookup*, where the floor has been re-aimed from 0.55 to
> **0.60** against a UI corpus that has grown from 21 rows to 29.
>
> **Not measured this run:** the quantisation cost. The non-sweep run scores one float32 variant
> (`bge-m3`) and the shipped index is `bge-base-en-v1.5`, so `quantisationCostTop1` came back
> `null`. It is not "free" in this run; it is **unmeasured** in this run. The earlier sweep that
> reported 0 is still on the page below.

Measured 2026-09-20. Reproduce with:

```
node packages/training/src/measure-embedding-retrieval.mjs --model @cf/baai/bge-m3 --latency 20
```

Sweep every model and every document variant with `--sweep`. Rebuild the index with
`node scripts/build-module-embeddings.mjs`.

---

## The result, in one table

All figures: the **same 80 customer-phrased queries** and the **same 80 contract-phrased queries**
read verbatim out of `packages/training/runs/knowledge-reach.json`, limit 5, no model in the loop,
nothing generated. The harness bundles `apps/worker/src` with the repo's own esbuild and reproduces
the recorded baseline exactly — 49/80, 67/80, 80/80 — which is the check that it is measuring the
shipped program and not a retyped imitation of it.

| | customer top-1 | customer in-top-5 | contract top-1 |
|---|---|---|---|
| shipped `searchVerifiedModules` (baseline) | **49/80 — 61.3%** | 67/80 — 83.8% | 80/80 |
| ceiling of a pure scoring fix (per the diagnosis) | 59/80 — 74% | 70/80 — 88% | — |
| **`apps/worker/src/embedding-retrieval.ts`, as it would ship** | **66/80 — 82.5%** | **75/80 — 93.8%** | **80/80** |

> The baseline row above is dead: see the SUPERSEDED block at the top of this
> file. Against the lexical scorer actually in production today (73/80) this row is a LOSS,
> not a 17-query gain. The row is kept rather than edited because the measurement was real —
> what changed is the thing it was measured against.

Recall of the candidate stage: **96.3% at depth 10**, 100% at depth 20. There is no separate
candidate stage in the shipped path — 80 dot products is the whole search — so this is reported
only as the headroom a reranker would have.

The contract set is a guard, not a trophy: it stays at 80/80, so the customer number was not bought
by breaking the phrasing that already worked.

**This clears the 74% ceiling the diagnosis put on any pure scoring fix**, which was the specific
claim worth testing. The six VOCABULARY-ABSENT failures are the reason: `interval-overlap` scores
exactly zero under the keyword scorer on *"check if two time slots clash"* because clash, slots and
time are nowhere in its contract. An embedding does not score tokens, so it is not subject to that
floor.

### Cost and latency

| | |
|---|---|
| model | `@cf/baai/bge-m3`, 1024 dims |
| price | $0.0118 per million input tokens (read live from the account's own model catalogue) |
| **per request** | **~$0.0000003** — a 25-token query, the median of the 80 benchmark queries |
| build cost, paid once | 22,174 input tokens / 23.8 neurons, measured |
| index in the Worker bundle | **141 KB** (80 modules + 21 UI rows, int8) |
| **added latency, in-Worker** | **~170 ms p50** (141–211 ms across four runs; see below) |
| added latency, repeat query | ~0 — AI Gateway caches embeddings for 86,400 s |

**~170 ms is measured, not estimated, and here is exactly what it is.** The Worker already embeds:
`gateway.ts` exports `embed()`, `rag.ts` calls it on every documentation lookup, and
`/api/admin/rag-test` drives that path on the deployed production build. Timing it (n=20, against
`apple.moshe-barami111.workers.dev`):

```
/api/admin/rag-test, uncached   p50 580 ms
/api/admin/rag-test, cached     p50 412 ms     <- identical code, embedding served from cache
/api/health, same origin        p50  73 ms
```

Uncached minus cached is the embedding call with *everything else held constant* — same Vectorize
query, same D1 FTS5 query, same fusion, differing only in whether AI Gateway served the vector.
That is the 168 ms in the recorded run. Cached minus health (339 ms) is the two database round
trips, which **this design does not make at all**: after the query is embedded, the search is 80 dot products over an
`Int8Array` already resident in the isolate.

Two things this number is not. It was measured on `@cf/baai/bge-small-en-v1.5`, the model
`gateway.ts` uses, not on the larger `bge-m3` indexed here — a like-for-like figure needs a deploy.
And a p50 over twenty probes from one machine on one afternoon is not a distribution: four runs of
this loop gave 141, 168, 169 and 211 ms, so treat it as ~150–200 ms rather than as a constant.

**An attempted measurement that failed, recorded rather than dropped.** The first latency
decomposition timed the embed call from this laptop and subtracted a control request to the same
API. The control came back *slower than the embedding itself* — 279 ms against 183 ms — which makes
the subtraction negative. A negative model-compute time is not a fast model, it is a failed
measurement. `latency.fromLaptop.modelComputeEstimateMs` is `null` with the reason attached rather
than carrying a number, and the in-Worker figure above is what replaced it.

---

## What was measured, and what the numbers do not cover

**The model, the document text, the query instruction and the similarity floor were all chosen by
looking at the same 80 queries they are reported on.** There is no held-out split. The headline
figure is therefore selection-optimistic and should be read as an upper estimate.

The robust claim underneath it is that the *approach* wins regardless of that choice. All six
embedding models on this account, with no per-model tuning at all — id + family + contract, no
query instruction — scored:

| model | customer top-1 | customer in-top-5 |
|---|---|---|
| `@cf/google/embeddinggemma-300m` | 73/80 | 80/80 |
| `@cf/qwen/qwen3-embedding-0.6b` | 70/80 | 80/80 |
| `@cf/baai/bge-large-en-v1.5` | 68/80 | 75/80 |
| `@cf/baai/bge-m3` | 66/80 | 75/80 |
| `@cf/baai/bge-base-en-v1.5` | 66/80 | 78/80 |
| `@cf/baai/bge-small-en-v1.5` | 65/80 | 75/80 |

The worst of the six beats the shipped 49/80 by sixteen queries. The spread between them is worth
eight. Full grid, including the `doc=contract` variants and the query-instruction variants, in
`packages/training/runs/embedding-retrieval-sweep.json`.

### Why `bge-m3` and not the top scorer

`embeddinggemma-300m` scored highest at 73/80 and is not shippable here: it is flagged **beta** on
the account's own listing and publishes **no price**, so its cost line would be a guess.

The deciding constraint is `apps/worker/src/pricing.ts`. Its `MODEL_PRICES` table contains
`bge-small-en-v1.5` and `bge-m3` and nothing else in this family, and `neuronsFor` falls back to
*the most expensive entry in the table* for an unknown model — `qwen2.5-coder-32b-instruct` at
$0.66/M, **fifty-five times** bge-m3's price. Shipping `bge-base` or `qwen3-embedding` without
adding a row there would reserve and settle every query embedding at the coder-32b rate against a
daily neuron ceiling that this repository's notes call the only spend guard it has. That is not a
billing rounding error; it is a guard being fed a wrong number.

`bge-m3` is also the **only** embedding model on this account that returns a per-call meter
(`meta.neurons` and `meta.cost_metric_value_1`). The other five return the tensor shape and nothing
else, so their cost can only be computed from the catalogue price, never observed. `gateway.ts`
already states the preference: *"Cloudflare returns the exact neuron cost on models that support it;
use it when present."*

`apps/worker/tests/embedding-retrieval.test.mjs` asserts the shipped model is in `pricing.ts`, so
swapping in a better scorer without pricing it is a red test rather than a silent 55× reservation.

### Fusing with the keyword scorer: mostly worse, marginally better in one narrow band

Reciprocal-rank fusion of the embedding ranking with `searchVerifiedModules`: **62/80**, four worse
than the embedding alone. RRF is rank-only, so it throws away how confident the embedding was and
gives a ranking that is 61% accurate the same voice as one that is 82% accurate.

A weighted sum — cosine plus `w` times the lexical rank decay — was then swept, and the result does
**not** support the flat claim that fusion hurts:

| w | customer top-1 | customer in-top-5 |
|---|---|---|
| 0 (pure embedding, shipped) | 66/80 | 75/80 |
| 0.05 | **68/80** | 75/80 |
| 0.1 | 67/80 | **77/80** |
| 0.2 | 56/80 | 76/80 |
| 0.4 / 0.8 | 49/80 | 75/80 |

A light lexical weight is worth about +2 top-1, and past w≈0.2 the keyword scorer takes over and
drags the whole thing back to its own 49/80.

**The shipped module does not fuse, and the 66/80 headline is the un-fused number.** Two plus on a
benchmark of eighty is roughly one standard error, the winning weight was picked by looking at the
same eighty queries it is scored on, and `searchVerifiedModules` does not expose its scores — the
sweep had to stand in rank decay for them. Buying a noise-sized gain with a tuned constant and an
approximation is how a number becomes unreproducible. It is written down here so that whoever wants
it later can take it deliberately.

### Quantisation is free

The shipped index is int8, one scale per vector, over the L2-normalised float. Against the float32
vectors of the same model on the same queries the difference in top-1 is **0** — measured, reported
by the harness as `quantisationCostTop1`, not assumed. It buys a 4× smaller bundle: 141 KB of index rather than the same
vectors at float32.

---

## The UI construction lookup

Separate problem, separate numbers: 45 of the 53 recorded lookups are one or two words ("hud",
"rpg", "chat") rather than sentences, and the model that wins on modules is not the one that wins
here — `qwen3-embedding-0.6b` takes modules at 70/80 and then adds **nothing whatsoever** over the
deterministic resolver on the UI lookups.

**Two answer keys, because the recorded one was too harsh.** The recorded run decided coverage by
id and called 29 of the 53 "no row at all". The rows' own `label` fields contradict that for nine
of them — `simulator`'s label ends "/ clicker", `obby`'s is "Obby / parkour", `screen-rewards` is
"The DAILY REWARDS / login-streak screen". Both keys are computed and the nine judgement calls are
listed with the quoted label evidence in the output, so they can be disputed instead of trusted.

**Credit where it is due: the underscore bug was fixed by another workflow while this was being
measured.** `ui-construction-guide.ts` now canonicalises both sides, and its lexical resolver alone
answers **25 of the 33** covered lookups with zero confident wrong answers — up from 18. Embedding
is not a replacement for that and claiming it as one would be taking credit for somebody else's fix.
It is the layer underneath, and it only runs when stage one returns a miss:

| floor | covered answered | invented rows (of 20 uncovered) | answered by embedding |
|---|---|---|---|
| lexical only | 25 / 33 | 0 | — |
| 0.40 | 32 / 33 | 20 | 28 |
| 0.50 | 31 / 33 | 9 | 15 |
| 0.55 | 29 / 33 | 2 | 6 |
| 0.60 | 25 / 33 | 0 | 0 |

At 0.60 the embedding stops contributing entirely, so every useful floor accepts some risk. At 0.55
it adds `clicker`→simulator, `fighting`→anime_battle, `parkour`→obby, `tower_defence`→tower_defense
and `daily rewards`→screen-rewards — all five covered by the target row's own label — and invents
`trading`→tycoon (0.552) and `loading screen`→racing (0.594).

**Which is why a stage-two hit must not wear a stage-one boolean.** `suggestUIByVector` returns
`recordedMatch: false` and a note naming the row it actually found, so those two inventions arrive
as *"the closest thing anyone inspected is tycoon"* rather than as sourced construction for a
trading screen. The module's inherited contract is *a miss must SAY it is a miss*; two inventions in
twenty would break it if they came back looking like matches.

One of the two fixes itself: another workflow is adding `screen-trading` to the corpus, at which
point "trading" is a covered query and that inversion disappears.

---

## Staleness, which is the failure mode that matters

An index built from an older corpus still loads, still returns five confident candidates, and says
nothing. That is this repository's own shape — present and never checked.

So `scripts/build-module-embeddings.mjs` writes a SHA-256 of the exact strings it embedded into the
index, and `apps/worker/tests/embedding-retrieval.test.mjs` recomputes that hash from the corpus on
disk and fails on a mismatch with the command to fix it. **The guard was falsified before it was
trusted**: corrupting the stored hash turns the test red with
`the verified-module corpus has changed since the embedding index was built. Run: node
scripts/build-module-embeddings.mjs`, and restoring it turns it green.

This will fire soon and legitimately. Eight new screen reference files are on disk in
`packages/corpus/data/ui-references/` and are not yet in `ui-construction.json`; when that workflow
rebuilds the bundle, the UI half of this index goes stale and must be rebuilt with it.

---

## What is NOT done

- **Nothing is wired in, and after the 2026-09-20T20:16Z re-measurement the module ranking path
  should stay that way.** `askVerifiedModule` and `getUIConstruction` are untouched; production
  behaviour is unchanged. The module lane lost to `need-index-search.ts`, 69/80 against 73/80. Three other approaches to the same defect were being built in parallel and
  the point was that all four could be measured on the same 80 queries before one is chosen.
- **CONFIRMED 2026-09-21: "nothing is wired in" now means "not in the deployed bundle".** Checked
  rather than inferred — every export of `apps/worker/src/embedding-retrieval.ts`
  (`searchModulesByVector`, `suggestUIByVector`, `resolveUIByIdentity`, `EMBEDDING_MODEL`, …) appears
  in that file and its own test and nowhere else in `apps/worker/src`, so esbuild drops it. The bytes
  Cloudflare serves for `apple` at `buildSha 3236f91-dirty`, fetched from the account's own
  `workers/scripts/apple/content/v2`, contain **0** occurrences of `EMBEDDING_MODEL` — against 2 for
  `CONFIDENCE_FLOOR`, a symbol added the same day that IS wired, which is the instrument check that
  makes the 0 mean something. The file is live source only in the sense that git holds it.
- **The UI lane is a TRADE, not the win it can be read as.** `layered` (the shipped
  `getUIConstruction` first, embedding only on its miss) at floor 0.6 answers 29 of the 34
  label-covered queries against the shipped route's 27 — and it does so by answering **4** queries
  that are not covered at all, where the shipped route's `falseConfidence` is **0**. On the module
  lane the same session measured what a confident wrong answer is worth: a near-miss handed over
  from the verified library passes the request's own executed checks **0 times in 80**
  (`docs/frontier-for-roblox.md` §7.1). Two more right answers bought with four confident wrong ones
  is the wrong side of that trade, and it is the reason this lane stays unwired too — a reason, now,
  rather than an omission.
- **No in-Worker deploy.** The 141 ms is measured on the deployed build's *existing* embedding path,
  with a smaller model. A like-for-like figure for `bge-m3` needs this module deployed.
- **No fallback path is written.** `embedQuery` returns `null` on a provider fault and the caller is
  supposed to fall back to the keyword search and say which one answered. The caller does not exist
  yet.
- **80 queries authored in one session.** `packages/training/src/customer-queries.mjs` says this
  about itself already: they are one session's judgement of how a person asks, not sampled traffic.
  Every number on this page inherits that limit.
- **14 of the 80 module queries still fail at rank 1**, and 5 are outside the top five entirely.
  The diagnosis says most of the remaining gap is a generation question — does the model pick
  correctly from a shortlist that already contains the answer — and this work does not touch that.
