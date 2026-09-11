# The attribution ledger had 500 lines, 20 tests, and no producer

**Date:** 2026-09-01 · **Mission Phase I.** Closes ledger item 3 under
"Next-highest-value unblocked work": *"Asset provenance ledger — the logic is tested;
nothing populates it yet."*

## The shape of the defect

`apps/worker/src/provenance.ts` answers two questions a customer needs answered before
they publish: **what must I credit**, and **can this ship commercially**. It is 500
lines, and `packages/evals/src/provenance.test.mjs` had 20 tests covering every
function in it.

Every one of those tests fed it assets by hand. `recordAssetUse` had **no caller
anywhere in the worker** — verified by searching `apps/worker/src`, `apps/web/src` and
the test trees for all five exported entry points. On the real product path the table
was always empty.

An empty table produces a clean report. So the feature's failure mode was to answer
"you owe nothing", confidently, every time — and there was no way for a customer, or
for us, to tell that apart from a genuinely compliant project.

This is the class of defect a good test suite makes *more* likely to survive, not
less. The logic was well covered, so every signal said the feature was in good shape.
Nothing checked whether anything called it.

## The producer

`insert_asset` is the tool that puts a third-party asset into a customer's place, so
it is where a use begins. It now records one, **after** `insertAndProveClean` and
**after** the refusal guard: an insertion that was refused is not a use, and recording
before the proof would tell a customer they owe a credit for an asset that never
reached their place.

`AgentCtx` gained an optional `projectId`, cached on the session DO at `/init` and
refreshed whenever the binding is read. It is optional because two callers genuinely
have no project — the eval harness and the admin `/run-tool` route build a context
directly to exercise one tool. Those record nothing, because there is nothing to
attribute to, which is a different thing from failing to record.

Write failures are swallowed deliberately. An attribution row is a record *about* a
build; losing one must not undo a placement that succeeded. And the failure degrades
safely, because of the key space:

## The key space, which is the part that could have gone quietly wrong

The report LEFT JOINs usage rows onto `asset_library` by id. Library ids are
namespaced slugs — `kenney/city-kit-suburban/building-a-01` — governed by `ID_RE` in
`asset-library.ts`. A Creator Store asset that was never ingested has no library row
and therefore no key.

Inventing one that *looks* like a library id would be worse than having none:
`roblox/123` satisfies `ID_RE`, so the day someone ingests assets under a `roblox`
namespace the join would start matching and credit the wrong author. Unaccounted
assets are keyed `unaccounted:roblox:<id>` instead — the colon makes it
unrepresentable as a library id, so the join always misses and the report renders it
as provenance-unknown. That is the state `provenance: null` exists to express, and the
report already names it.

## The consumer

`GET /api/projects/:id/attribution`, owner-scoped through `withOwnedProject`,
returning both reports from one read of the same asset set — because a caller asking
"can I publish this?" and one asking "what do I credit?" are asking about the same
assets, and answering from two requests invites them to disagree.

An unaccounted asset does not 500. A project can genuinely contain one, and the honest
response is to name it. Failing the request would leave the customer thinking nothing
is owed, which is the exact bug this change exists to fix.

## Guards

`apps/worker/tests/provenance-wiring.test.mjs` (4, structural) and three runtime tests
added to `packages/evals/src/provenance.test.mjs`. The split is because `provenance.ts`
imports `asset-library.ts` extensionlessly and must be bundled before node can load
it; evals already has that toolchain.

Three mutations, each restoring a real or nearly-made mistake:

| mutation | caught by |
|---|---|
| remove the `recordPlacedAsset` call — the original bug | `insert_asset must both prove and record` |
| record *before* the clean proof | `the proof has to come first` |
| key unaccounted assets as `roblox/<id>` | `insert_asset must key unaccounted assets with the sentinel` |

All three failed the suite; restored, all green. One runtime test asserts the empty
ledger *is* clean, so the pass is on the record: that report is indistinguishable from
a compliant project's, which is why the producer matters.

## Suite

`pnpm -r test`: worker 151, evals 1029, web 232, corpus 231, design 80, benchmark 4,
plugin 168 + 40 mutations. No failures. `pnpm -r typecheck`: clean.

## Not done

`generate_model` and `generate_image` produce Golem-authored assets, which the report
already classifies separately (`original` / `userGenerated`). They are not recorded
yet — the licence obligations that motivated this work attach to third-party assets,
and scope was kept to the path that carries them.
