# Auditing for exported code nothing calls, and what it found

**Date:** 2026-09-01. Prompted by the attribution ledger, which had 500 lines, 20 tests
and no producer. That is not a one-off shape — it is what happens when a module is
written, tested, and then the wiring is left for later. So the same question was asked
of every export in the worker and the web app.

## Method

For every `export function` / `export const` in `apps/worker/src` and `apps/web/src`,
count references across `apps/worker/src`, `apps/web/src`, `apps/plugin/src` and
`packages/shared/src` — excluding the defining line. Names shorter than five characters
were skipped as too noisy. **38** names came back with zero references.

Most are false positives and were confirmed as such: `runCriticPanel` and `getAdapter`
are exercised by `packages/evals`, which is the offline harness and a legitimate caller;
`formatBytes`, `STATUS_PATH` and similar are small helpers kept deliberately. The audit
is a question generator, not a verdict.

Two answers were real.

## 1. `exportProjectAttribution` — I had duplicated it hours earlier

`provenance.ts` already had the composition point: read the assets once, build both
reports and the rendered credits text. The endpoint written earlier the same day
re-derived all of it inline.

Fixed by calling it. The endpoint now also returns `credits` — the worker-rendered
document — and the browser pastes **that** rather than reassembling its own version. The
client-side `creditsText` is gone.

This matters more than tidiness. `renderAttribution` prints a loud
`INCOMPLETE — these assets have no provenance record and could not be credited:`
section. A client-side copy that forgot it would hand someone a credits file that
quietly claims to be complete — which is the same failure the whole feature exists to
prevent, reintroduced one layer up.

## 2. The curated asset library has never existed

`asset-library.ts` has a complete read path, a validator, and a 20-entry
`SEED_MANIFEST`. Its entire **write** path — `ensureAssetTables`, `upsertAssets`,
`recordVerification`, `staleAssets`, `markHealth` — has no caller anywhere in `apps/`,
`packages/`, `scripts/` or `.github/`.

The tables were therefore never created. Confirmed against production D1
`golem-corpus`:

```
tables: _cf_KV, chunks, chunks_fts*, sqlite_sequence, static_assets, static_chunks
```

No `asset_library`. Running the read path's own query against it:

```
7500 no such table: asset_library_fts: SQLITE_ERROR
```

The system prompt instructs the model to prefer this tool **first**. Every one of those
calls has failed in production for the life of the deployment, handing the model a raw
SQLite string.

`staleAssets` is documented as feeding "the nightly health-check cron". `wrangler.jsonc`
has no cron trigger and `index.ts` has no `scheduled` handler.

### The fix, and the fix that was refused

`search_asset_library` now recognises the missing-table case and says so plainly,
naming `find_verified_asset` and `create_instances` as the deliberate alternatives.
Anything that is not that case still throws.

Calling `ensureAssetTables` lazily was considered and **rejected**. It would create the
tables, the search would return `[]`, and the model would read "the curated library has
nothing like that" — a confident claim about a table nobody has ever filled. That is
precisely the attribution-ledger defect: an empty store producing a clean answer. It
would also be harder to find the second time, because there would no longer be an error
to notice.

Populating the library is HUMAN_BLOCKED and recorded in `BLOCKERS.md` §4b with steps.
Every seed entry is a pre-ingest candidate with `robloxAssetId: null`, and ingest
requires downloading third-party binaries and uploading them to Roblox under Golem's own
account — an outward-facing operation on a real account, not one to take unilaterally.

The blocker also offers the honest alternative: delete the read path and the seed
manifest, and let `find_verified_asset` be the only asset route. About 1,000 lines
would go, and nothing that works today would stop working.

### Guard against the note going stale

`apps/worker/tests/asset-library-availability.test.mjs` (5 tests) pins the honest error,
pins that nothing lazily creates the tables, and **walks the tree for a write-path
caller**. The moment an ingest is wired up, that test fails — which is the signal to
rewrite the blocker rather than leave it contradicting the code.

Two of its assertions failed when first written, both my own fault and both worth
recording: the lazy-creation guard matched the explanatory comment that names
`ensureAssetTables` in order to say why it is absent (fixed by matching a call, `\(`,
not a mention), and the tree walk used `require` inside an ES module.

## Does this change the rock-palette conclusion?

No. `evidence/2026-09-01-rock-palette-supply.md` searched the Creator Store directly via
`search_asset`; it never went through the curated library, so its finding about free
rock supply stands on its own. What it did not notice is that the library it was being
compared against did not exist.

## Suite

`pnpm -r test`: worker 156, evals 1029, web 239, corpus 231, design 80, benchmark 4,
plugin 168 + 40 mutations. No failures. `pnpm -r typecheck` clean.
