# Resume Worker test-contract repairs — 2026-09-18

## Scope

This pass repaired four stale Worker tests identified by the bounded full-suite run recorded in
`docs/evidence/resume-integrated-worker-tests-2026-09-18.md`. No Worker production source was edited,
no full Worker suite was rerun, and no network, account, deploy, paid-model, credential, or remote-data
operation was performed.

Owned files only:

- `apps/worker/tests/asset-policy-wiring.test.mjs`
- `apps/worker/tests/memory-personalisation.test.mjs`
- `apps/worker/tests/studio-place-poll.test.mjs`
- `apps/worker/tests/tool-recovery.test.mjs`
- this additive evidence file

The source observed by these tests at final verification had SHA-256:

```text
84f2f4c6e5b722713e72fdc0ee2b40901a6b50b76f49749296792421ad0ba7c9  apps/worker/src/tools.ts
c8ae924df0e5128a5e14fedb6724f28ef5074b74902c54f0f87993b8c547426b  apps/worker/src/do/session.ts
```

## Confirmed starting state

The prior integrated Worker report records **3429 tests, 3423 pass, 6 fail, 0 skip** with log SHA-256
`fd9e7145e5ec2255306ac00ea79bb33b647bf8937b97a693a52c1a9a454d68af`. Four of those six failures
were the stale contracts assigned here; the export-inventory and MCP-classification gaps are separate
integration work and were not touched in this lane.

Before changing these four files, the exact scoped command was rerun:

```text
node --test tests/asset-policy-wiring.test.mjs tests/memory-personalisation.test.mjs tests/studio-place-poll.test.mjs tests/tool-recovery.test.mjs

tests 64
pass 60
fail 4
cancelled 0
skipped 0
todo 0
```

The four reproduced failures matched the integrated report exactly:

1. `asset-policy-wiring.test.mjs` read from `choose_asset_source` through the later
   `search_asset_library` marker. New creation/reference tools now live between those entries, so an
   unrelated `run: async (_ctx, ...)` falsely looked like `choose_asset_source` discarded its context.
2. `memory-personalisation.test.mjs` required every `applyToolPermissions` base declaration to spell
   its mode as `agent.mode`. The prompt path correctly derives `promptBaseTools` from
   `toolsForMode(mode, studioConnected, toolNames())`; `mode` is the already-selected run mode used to
   construct the agent.
3. `studio-place-poll.test.mjs` configured its fake SQL layer to throw `duplicate column name:
   failure` on every `ALTER TABLE`. That was originally meant to simulate the expected second-boot
   duplicate of `oplog.failure`, but newer checkpoint ALTERs correctly use pragma-driven existence
   checks and were being failed by the over-broad fixture.
4. `tool-recovery.test.mjs` required the `recoverToolCall(...)` call expression itself to contain
   `toolNames()`. Production now materialises `const knownTools = new Set(toolNames())` once and passes
   that registry binding to recovery, which preserves the fixed-vocabulary security boundary.

## Contract repairs and falsification

### Asset-policy wiring

The test now isolates the single top-level `choose_asset_source` registry entry by its own registry
terminator. It asserts that the tool keeps `ctx`, resolves `allowedSources(ctx.assetSources)`, filters
the chosen recommendations through that allowed set, and uses the same caller policy when explaining
a refusal.

The guard is falsified inside the test by replacing only
`allowedSources(ctx.assetSources)` with `allowedSources(undefined)`. The property checker must throw.
This proves an unrelated `_ctx` tool elsewhere in the registry can neither satisfy nor fail this guard.

### Personalisation tool narrowing

The test now checks dataflow rather than one spelling. Every binding passed as the first argument to
`applyToolPermissions` must be a binding produced by `toolsForMode(mode, ...)` or
`toolsForMode(agent.mode, ...)`. It also asserts that plugin capability filtering occurs after user
permission narrowing on both the prompt and executable paths, that `toolDefs` receives the
capability-filtered offered set, and that post-inference execution intersects the offered set with the
latest capability report.

The guard is falsified by synthetically replacing the prompt's mode-derived base with
`new Set(toolNames())`. The checker rejects it as a permission base not derived from `toolsForMode`.
Thus a user preference cannot replace or widen the mode gate, and capability gates remain downstream.

### Studio oplog migration fixture

The fake SQL option was renamed to describe what it actually simulates:
`duplicateOplogFailureColumn`. It now throws only for
`ALTER TABLE oplog ADD COLUMN failure text`. The test confirms that exact duplicate ALTER was attempted,
then confirms a later checkpoint coverage migration also executed and the second-boot SessionDO still
serves `/studio/link` successfully.

The injected duplicate is the falsification/control: if production stops swallowing the expected
second-boot oplog duplicate, construction fails. Unrelated checkpoint migration behavior is no longer
malformed by the fixture.

### Tool-recovery registry boundary

The static wiring checker now finds bindings materialised as `new Set(toolNames())`, requires the
third `recoverToolCall(res.text, allowed, <binding>)` argument to be one of those registry-derived
bindings, and retains the existing ordering checks: recovery must happen before final text assignment
and delta broadcast, and only when the model produced no real tool call.

The guard is falsified by synthetically passing `allowed` as the third argument. It rejects that value
because it is the run's narrowed permission set, not the fixed registry used to decide which model-
supplied names are safe to interpolate into the transcript.

## Green verification

The same four-file command after the repairs:

```text
node --test tests/asset-policy-wiring.test.mjs tests/memory-personalisation.test.mjs tests/studio-place-poll.test.mjs tests/tool-recovery.test.mjs

tests 64
pass 64
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 211.801125
```

Adjacent behavioral suites were then run without invoking the full Worker suite:

```text
node --test \
  tests/asset-policy.test.mjs \
  tests/asset-source-policy.test.mjs \
  tests/asset-policy-enforcement.test.mjs \
  tests/preferences.test.mjs \
  tests/memory-store.test.mjs \
  tests/studio-place.test.mjs \
  tests/plugin-capabilities.test.mjs \
  tests/plugin-capability-session.test.mjs

tests 168
pass 168
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 491.983583
```

`git diff --check` over the four repaired tests also exited 0.

Final repaired-test SHA-256 fingerprints:

```text
c2cd2314b30c61d25bcd11937ec5247a74c22ec355387b1ede022b862624ea40  apps/worker/tests/asset-policy-wiring.test.mjs
933a71ebce9849fa1c94c29cc492b53ad40adb4f14937892b06b21dadc6820d7  apps/worker/tests/memory-personalisation.test.mjs
5ebc6ce2efe671fc66e309ad37943a21c49c5b24d4c2e9c1baa1aa7110c10e18  apps/worker/tests/studio-place-poll.test.mjs
3cb9aedc98016831d9902be02808af4deb35805374035bf802811235e4c8d485  apps/worker/tests/tool-recovery.test.mjs
```

This evidence establishes the four assigned stale contracts and their adjacent behavioral suites are
green against the current shared source. It does not claim the full Worker suite is green; that run was
explicitly left to the prime after the concurrently owned UI/inventory/classification gaps settle.
