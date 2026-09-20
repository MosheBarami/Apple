# The retrieval bake-off — what won, what lost, and why the losers were deleted

**Measured 2026-09-20** on the same 80 verified modules, retrieval only, limit 5, no model in the
loop except where a row says otherwise. Every number below came from running the code, not from
reading it.

## The problem

`packages/training/runs/knowledge-reach.json`, measured against the Worker's own bundled code:

| query phrased like | top-1 | in top-5 |
|---|---:|---:|
| the module's own CONTRACT | 80/80 — 100% | 100% |
| the way a CUSTOMER talks | **49/80 — 61%** | 84% |

31 of 80 customer-phrased needs returned the wrong module first; 13 never appeared in the five at
all. *"when a player buys something take the coins off them but only if they can afford it and do
not already own it"* did not return `purchase-transaction` anywhere — it returned
`trade-offer-check` and `cooldown-clock`.

The knowledge was never missing. 80 executed modules and 2,353 sourced claims sat behind a door
that failed on the way people actually write.

## The four candidates, measured against the same set

| approach | customer top-1 | in top-5 | cost per request | shipped |
|---|---:|---:|---|---|
| better lexical scoring — stemming, IDF, length normalisation | 59/80 — 74% | 88% | none | no |
| hybrid recall + a 70B model reranking the candidates | 71/80 — 89% | 95% | one LLM hop | no |
| precomputed Workers AI embeddings | 70/80 — 87% | 100% | one embed call | no |
| **paraphrase the data and index that too** | **73/80 — 91%** | **99%** | **none** | **yes** |

The winner attacks the CORPUS rather than the algorithm: every module carries generated phrasings
of the NEED it serves, in the words a person would use, indexed beside its contract. It is also the
only candidate that costs nothing at request time, and it holds contract-phrased queries at 80/80 —
nothing was traded away for the gain.

Verified through the PUBLIC function after wiring: `searchVerifiedModules` now returns 73/80 and
79/80. The measurement harness refused to run until its baseline was updated, which is the harness
working: *"BASELINE DRIFT — the shipped code no longer reproduces knowledge-reach.json."*

## Why the three losers were deleted rather than kept

They were imported by nothing. This repository's central defect is a thing that exists and is never
reached — a hero effect that shipped without running, a guard that read the wrong file, a keyframe
that never won the cascade. Three unreachable retrieval implementations sitting in `apps/worker/src`
would be that defect in its purest form: they would rot against a moving corpus, fail the suite for
code no customer can reach, and tempt somebody into weakening a guard to make them green. The
embedding index was already stale within an hour, because eight new screen files landed in the
corpus while the comparison was being run.

What is kept is the part with lasting value: the numbers above, the per-run JSON under
`packages/training/runs/`, and `docs/knowledge-retrieval-diagnosis.md`, which names the six failure
modes of the original scorer with counts. A future attempt starts from the measurement, not from
the abandoned code.

`ui-construction-lookup.ts` was deleted for a different reason: the bug it fixed — genre ids
containing an underscore (`tower_defense`, `fps_arena`, `pet_simulator`, `anime_battle`) being
unreachable because the caller's string was normalised and the stored ids were not — had already
been fixed in the live `ui-construction-guide.ts`. Verified by calling the bundled live module: all
four resolve. A second implementation of a fix that already shipped is a fork waiting to disagree.

## What is still true and unfixed

In-top-5 moves from 84% to 99%, but the gap between 61% top-1 and 84% in-top-5 on the ORIGINAL
scorer was mostly an ordering problem the model could already recover from by reading the five
contracts it was handed. The 13 queries that returned nothing usable were the unrecoverable ones.
Those are now 1. Whether the MODEL then picks correctly from a good shortlist is a separate
question this bake-off did not measure.
