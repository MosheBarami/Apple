# Profile release after a completed cross-server takeover — 2026-09-19

Status: narrow production-source repair, executed generated-Luau regressions and Worker
typecheck passed. Not deployed, installed into an existing game, or verified against a live
Roblox DataStore. This does not claim every possible load/commit/release interleaving is solved.

## Reproduction before changing production

The existing `runProfile` harness now wraps the actual
`PREFABS.profile_store.source` in a callable factory. A second invocation therefore creates a
separate instance of the same shipping module, with a separate local cache and captured server
identity, rather than manually simulating the second server's persistence code.

The first regression loads server A's profile, changes its local balance to 40, and suspends
its release before the UpdateAsync transform. After advancing the existing test clock beyond
the 900-second lease period, server B loads through its own module, commits balance 900, then
releases normally. Storage now contains 900 and no lock. Resuming A previously wrote 40 over
that completed B session because an absent lock was accepted as permission to save.

The second regression removes the controlled datastore record after a successful load. The old
release recreated that missing record despite having no remaining stored proof of ownership.

Red-first command:

```sh
node --test --test-reporter=tap --test-name-pattern='a stale release cannot overwrite a different server|a release cannot recreate a datastore record' apps/worker/tests/prefabs-behaviour.test.mjs
```

Observed: 2 tests, 0 passed, 2 failed, exit 1. The first assertion specifically reported
`stale A release overwrote the newer completed B session`; the second reported
`missing stored ownership must refuse release`. Log:
`profile-cross-server-release-red-2026-09-19.log`.

## Minimal repair

Only the release ownership predicate and its warning changed in `apps/worker/src/prefabs.ts`:

```luau
local lock = stored and stored.lock or nil
if lock == nil or lock.serverId ~= SERVER_ID then
    return nil
end
```

An unlocked record is not evidence that this older session still owns it. Normal release still
has the lock acquired by load. Existing failed-load no-save behavior, retries, double-release
handling, the local release-in-flight fence, and the earlier commit identity fence remain.
The warning now says ownership was lost rather than claiming another server necessarily
still holds the lock. No persistence schema, new queue, dependency or lock format was added.

## Green verification

```sh
node --test --test-reporter=tap --test-name-pattern='profile|load|lock|commit|release|transient' apps/worker/tests/prefabs-behaviour.test.mjs
pnpm -C apps/worker typecheck
git diff --check -- apps/worker/src/prefabs.ts apps/worker/tests/prefabs-behaviour.test.mjs
```

Observed: 27 selected prefab/consumer tests passed, zero failed/skipped/cancelled/todo;
Worker typecheck exit 0 and scoped diff check exit 0. Session 48470 completed and printed
`RESULT tests=0 typecheck=0 diff=0`. This is a focused set, not the full Worker suite.

The cross-server regression also verifies an honest subsequent load reads 900, establishing
that the refused release did not leak its local release-in-flight marker. The earlier normal
release, failed-load, foreign-lock, stale-commit and retry cases remain covered in the selected
run. Already-overlapping load and heartbeat interleavings are not newly claimed by these cases.

```text
ad28c11f307bc0a6147df56717cf47717be04dcdf30185ff08f2d87c347ce1ba  apps/worker/src/prefabs.ts
3c350bb8d4d33561733d2d67577c84db1cd2828ab7c1e95f4641f38a917e9b01  apps/worker/tests/prefabs-behaviour.test.mjs
c03f9046f120a8b3162b29f6fd4a5910ea4d7196efb01ed512bb151060cc417d  docs/evidence/profile-cross-server-release-red-2026-09-19.log
75b0052f46082d13ab8eabeabfe64aa9ce3e243df786ece384095417f5b34281  docs/evidence/profile-cross-server-release-green-2026-09-19.log
```

## Separate measurement receipt

The existing offline success reporter was run after these repairs at
2026-09-19T13:31:10.108Z. Its unchanged checklist arithmetic is
`(413 + 511 * 0.5) / 1127 * 100 = 59.3167701863354%`: 413 marked done, 511 partial,
203 not found, and 73 owner-excluded out of 1200. No checklist status was changed here.

Its 20 acceptance mechanisms produced 19 passes and one explicit organization-tenancy skip.
The current source checklist section 60, lines 3480–3536, confirms that organization journey
is excluded under ADR-021; project sharing is a separate included item. No scenario-name drift
was established. Every passing mechanism still states the customer behavior it did not check.
Neither 19/20 nor the weighted checklist is a whole-product customer-readiness percentage.

Receipt: `product-success-metrics-after-repairs-2026-09-19.json`, SHA256
`6dfa2584d20fdb7b2c558f83891c409a56948b657e0538f8901e18fd9738aec1`.
The full current specification/evidence reconciliation required for an exact overall accepted
percentage remains incomplete; local repairs and blocked deployment do not establish it.
