# Resume integrated Worker tests — 2026-09-18

## Scope

Read-only verification of the integrated Worker runtime after the billing-authority and creator-skill
work landed in the shared checkout. No Worker source or Worker test file was edited in this lane.
The only repository write from this lane is this evidence file.

The full Worker test set and Worker package typecheck were run locally. No paid/model call, external
network/account action, deployment, credential read, or package install was requested by this lane.
The billing HTTP tests exercise the in-process Worker app and stubbed Durable Object/provider
transports.

Repository HEAD during the run:

`6d7a5bec3a741de9cbe97459bcc82e760bd3e089`

The shared checkout was already dirty before this verification. The source aggregates below are the
boundary for claims about movement during this test window.

## Before/after Worker aggregates

For each set, files were sorted by relative path, each file was SHA-256 hashed, the manifest rows were
`<sha256>  <relative-path>`, and the SHA-256 of that complete newline-terminated manifest is the
aggregate.

| Set | Files before | Aggregate before | Files after | Aggregate after | Movement during run |
|---|---:|---|---:|---|---|
| `apps/worker/src/**` | 151 | `52e5497b3ff99c3559e3428b38c769386b6db441e8b45af7e9184439af543c19` | 151 | `52e5497b3ff99c3559e3428b38c769386b6db441e8b45af7e9184439af543c19` | none observed |
| `apps/worker/tests/**` | 240 | `ec1f57da91c1920d72648aa4592e66fe982bc9439ba00bf931ac8c0f4c9ed24d` | 240 | `ec1f57da91c1920d72648aa4592e66fe982bc9439ba00bf931ac8c0f4c9ed24d` | none observed |
| Worker package/config: `package.json`, `tsconfig.json`, `wrangler.jsonc`, `wrangler.apple.jsonc` | 4 | `d3770d8686499a0501357dad0d29b753bbcf34873b2aeaa298910b2643feb65b` | 4 | `d3770d8686499a0501357dad0d29b753bbcf34873b2aeaa298910b2643feb65b` | none observed |

There were 230 recursive `*.test.mjs` files under `apps/worker/tests`; all 230 were top-level and all
were passed explicitly to the Node test runner. Therefore the suite did not silently omit nested
tests, audio, billing, or previously failing files.

No claim is made about plugin source or the separate UI proof-builder/client fixture while their
other workstreams were active; those paths were outside these Worker aggregates.

## Full Worker suite

The child process ran from `apps/worker` with bounded test concurrency:

```bash
node --test --test-concurrency=2 tests/*.test.mjs
```

The shell glob was materialized by the watchdog from the sorted current directory contents rather
than by a hand-maintained allowlist: 230 test files.

An external Python parent launched Node in a new process session, waited up to 900 seconds, and would
`SIGKILL` the whole child process group and reap it on timeout. This boundary also catches a
synchronous JavaScript infinite loop such as the previously investigated WAV walker, which an
in-process Node test timeout cannot reliably interrupt.

Observed watchdog result:

- timed out: **false**
- child return code: **1**
- Node-reported duration: **22305.237166 ms**
- log SHA-256: `fd9e7145e5ec2255306ac00ea79bb33b647bf8937b97a693a52c1a9a454d68af`
- process-table check immediately after the suite: no matching Worker `node --test` child remained

Exact Node summary:

| Counter | Result |
|---|---:|
| tests | **3429** |
| suites | 0 |
| pass | **3423** |
| fail | **6** |
| cancelled | 0 |
| skipped | **0** |
| todo | 0 |

### Billing and audio were included

The corrected billing-route authority tripwire ran and passed:

`the public route cannot bypass the acknowledged billing authority with a direct event grant`

The new real-HTTP/in-process SQLite billing-authority file
`apps/worker/tests/billing-webhook-authority.test.mjs` contains 11 tests and was part of this run.
Observed passes include:

- `signed subscription uses current Stripe state and converges both named SQLite namespaces`
- `replica failure keeps HTTP failed; retry completes without granting either namespace twice`
- `response loss after replica commit remains retryable and does not duplicate money`
- `cancellation and expired-period snapshots revoke entitlement while preserving the purchased tier record`

The audio DSP file contains 46 tests and also ran. The log includes passing hostile-WAV and DSP
guards such as:

- `a chunk whose declared size overruns the buffer is clamped, not read past`
- `SILENCE IS NOT SPEECH — the guard the whole detector hangs on`
- `THE CEILING IS A GUARANTEE: a transient 30 dB over the bed comes back under it`

There were no skipped tests.

## Six observed failures

No failure was excluded or rewritten in this verification.

### 1. `tests/asset-policy-wiring.test.mjs`

`choose_asset_source NARROWS its list to what the policy allows`

Observed assertion: `it must stop discarding its context`, with `true !== false`.

Current source inspection shows the `choose_asset_source` implementation itself is
`run: async (ctx, a)` and calls `allowedSources(ctx.assetSources)`. The test slices from
`choose_asset_source` all the way to `search_asset_library`; creator-skill/reference tools are now
inserted inside that wider slice, so an unrelated `run: async (_ctx...)` can satisfy the test's
negative regex. This failure is a stale source-slice tripwire; the property it names is present in
the current `choose_asset_source` body.

### 2. `tests/export-inventory.test.mjs`

`every table the worker creates outside Postgres is exported or named as a store that is not`

Observed assertion:

`Durable Object table billing_authority_replays (src/do/quota.ts) is in no inventory`

`src/do/quota.ts` creates `billing_authority_replays`, and the full-suite inventory scanner found
no corresponding exported/non-exported store declaration. This is an actual integration inventory
gap surfaced by the new billing authority storage.

### 3. `tests/mcp.test.mjs`

`every tool in the agent registry is classified: allowed, or excluded with a reason`

Observed unclassified tools:

```text
search_creation_skills
read_creation_skill
get_genre_references
```

All three exist in the integrated agent registry. The MCP allow/exclude inventory has not yet made an
explicit decision about them. This is an actual integration classification gap.

### 4. `tests/memory-personalisation.test.mjs`

`tool permissions NARROW the mode toolset, they do not replace it`

Observed assertion says `promptBaseTools` is not the mode's own toolset. Current source shows:

```ts
const promptBaseTools = toolsForMode(mode, studioConnected, toolNames());
const promptUserTools = applyToolPermissions(promptBaseTools, ...);
```

and the run loop separately uses:

```ts
const base = toolsForMode(agent.mode, studioConnected, toolNames());
const userAllowed = applyToolPermissions(base, agent.toolPermissions);
```

The source assertion accepts only a declaration using the literal `agent.mode`, so it rejects the
prompt path's equivalent `mode` binding. The narrowing property remains visible in current source;
this is a stale/over-specific source tripwire.

### 5. `tests/studio-place-poll.test.mjs`

`the oplog gains its failure column, and a second boot survives the duplicate`

Observed error: `duplicate column name: failure`.

The production `alter table oplog add column failure text` is still wrapped in `try/catch`, as are
the nearby `run_id`, checkpoint-author, and checkpoint-description migrations. The test's
`sqlThrowsOnAlter` fixture throws the same duplicate-column error for **every** `ALTER TABLE`.
New checkpoint coverage/preserved-object ALTERs are guarded by real
`pragma_table_info('checkpoints')` results rather than by `try/catch`; the test stub always returns
an empty column list, so its broad throw now escapes through an unrelated later ALTER. The failure is
in the old fixture's simulation boundary, not evidence that the oplog failure-column catch vanished.

### 6. `tests/tool-recovery.test.mjs`

`STATIC CHECK — the run loop consults recovery before it reads the model text`

Observed assertion expects the call substring to contain the literal `toolNames()`. Current source
builds the same registry once:

```ts
const knownTools = new Set(toolNames());
...
recoverToolCall(res.text, allowed, knownTools);
```

The call still receives the registry and remains before the visible-text path. This is a stale
source-expression tripwire that rejects a named binding carrying the same/stricter registry.

## Worker typecheck

The authoritative package-script run used the Worker package's existing script:

```json
"typecheck": "tsc --noEmit"
```

and was invoked from `apps/worker` as:

```bash
npm run typecheck --silent
```

It ran under a separate external 300-second process-group watchdog.

Observed result:

- timed out: **false**
- return code: **0**
- typecheck diagnostics: **none**
- process-table check immediately afterward: no `tsc --noEmit` or typecheck child remained

An earlier `pnpm --filter @golem/worker typecheck` invocation also returned 0, but its local pnpm
wrapper printed workspace lockfile/preflight output before `tsc --noEmit`. The clean
`npm run typecheck` result above is the final package-script typecheck observation and required no
package installation command.

## Relevant file fingerprints

These hashes were taken after the run; the aggregate comparison above proves the Worker source/test
sets had the same bytes before and after the suite/typecheck window.

| File | SHA-256 |
|---|---|
| `apps/worker/src/index.ts` | `e69ff33d3938f20c8f7626a2904f25600168df7c85cea0b696062b4730042359` |
| `apps/worker/src/do/quota.ts` | `0b1db760c00c0afb77eb46d9c6159c80c3c11b00c8771834209cf2bb5e749eb5` |
| `apps/worker/src/do/session.ts` | `c8ae924df0e5128a5e14fedb6724f28ef5074b74902c54f0f87993b8c547426b` |
| `apps/worker/src/tools.ts` | `84f2f4c6e5b722713e72fdc0ee2b40901a6b50b76f49749296792421ad0ba7c9` |
| `apps/worker/src/creator-skills.ts` | `0a74aff69dab9c3a9ba20551719d262ca3cb07c4ee881c6f481042e3f5c96d4c` |
| `apps/worker/src/mcp.ts` | `85f83ad3dd9b80e3f4d18e8473cae11b027a06297de252e2ace7b15a4bf067bb` |
| `apps/worker/src/user-export.ts` | `8794348bce9e45a09d94751322abf818ba498e2e85cfb26e23cebdcbb0505a9f` |
| `apps/worker/tests/billing-route.test.mjs` | `baee49b1e4512dd77d577a4a07ef556b04fe57fba72cc0eabd838e41c72604b3` |
| `apps/worker/tests/billing-webhook-authority.test.mjs` | `eaf3486f2922cd3201842621c69628d1120821fc1d07036e81ad4c2bf92370c4` |
| `apps/worker/tests/creator-skills.test.mjs` | `a514d53c9366e279dcdcb092bd433109d2c3147ac5be67efe8ed9c9cca4701f7` |
| `apps/worker/tests/creator-skills-tools.test.mjs` | `22fc5f99d8f20b2da2cdca5cb6fd6a0c9f79da6eb6b1a83429d4334cfa1bd1fa` |

## Verification boundary

The integrated Worker is type-correct, and 3423 of 3429 full-suite tests passed with zero skips. The
suite is **not green** because the six failures above are real observed failures in this exact
snapshot. Source inspection indicates four are stale source/harness assertions and two are current
integration inventory/classification gaps, but no fix was made here because this lane was explicitly
read-only.

The source/test/config aggregates were identical before and after the run, so no overlapping Worker
runtime change occurred during this verification window. That statement is limited to the Worker
sets fingerprinted above.

## Follow-through: billing authority replay export inventory

After the read-only integrated run above, the previously reported
`billing_authority_replays` inventory gap was taken as a focused follow-through.

The table is **personal billing data** because each row belongs to one account's QuotaDO and stores
the normalized subscription/credit mutation selected by the canonical billing authority. It is also
**service-internal replay state**, not an additional user-facing billing record: its purpose is to
make a webhook retry reuse the exact source event, authority sequence and normalized decision after a
partial delivery. `QuotaDO.storeAuthorityReplay()` persists `JSON.stringify(mutation)`, not the raw
Stripe event/provider payload, and prunes it with `RETENTION.quotaLedgerDays`.

That classification means the correct export behavior is to inventory it explicitly as
`personal: true`, tell the account export that it is not a separate download, and point the person
to `GET /api/billing/history` for the current subscription and billing change history that the
product actually exposes. Creating a second replay-cache export would surface authority sequence and
retry bookkeeping that are not a distinct billing fact and would duplicate the canonical billing
history. No QuotaDO runtime export endpoint was therefore added.

Focused source changes:

- `apps/worker/src/user-export.ts`: added `billing_authority_replays` as a personal
  `QUOTA_DO` store with an explicit description that it contains normalized billing mutations and
  no raw Stripe payload or credentials.
- `apps/worker/src/account-export.ts`: added an explicit availability answer: the cache is not a
  separate download; user-facing billing data is available through `GET /api/billing/history`.
- `apps/worker/tests/export-inventory.test.mjs`: proves the table is classified as personal
  per-user QuotaDO state, the availability answer exists, replay persistence stores
  `JSON.stringify(mutation)` rather than `JSON.stringify(event)`, and the cache remains bounded by
  `RETENTION.quotaLedgerDays`.

The QuotaDO authority source was **not edited** and remains:

`apps/worker/src/do/quota.ts`
`0b1db760c00c0afb77eb46d9c6159c80c3c11b00c8771834209cf2bb5e749eb5`

Fresh focused validation under an external process-group watchdog:

```bash
node --test --test-concurrency=1 \
  tests/export-inventory.test.mjs \
  tests/account-data-routes-live.test.mjs \
  tests/billing-origin-authority.test.mjs
```

Result: **55/55 passed**, 0 failures, 0 skipped/cancelled/todo,
`746.470666 ms` Node-reported duration, watchdog timeout false, return code 0. The focused log
SHA-256 is
`cc6a8252fe75c9e484d099150efdfab3acc97b3c326c704a2b793a5d39b6bef8`.

The inventory file was also run alone under its own external watchdog after that combined check:
**13/13 passed**, 0 failures/skips, `103.958916 ms`, timeout false, return code 0. Its log SHA-256 is
`0a76f7f63e8591f95acaf94649c37819cdbcbf9953bce109ee59846155c031a7`.

Worker package typecheck was then rerun with the existing
`npm run typecheck --silent` / `tsc --noEmit` script under its own external watchdog: timeout
false, return code 0, no diagnostics. No test/typecheck child remained afterward.

Current follow-through fingerprints:

| File | SHA-256 |
|---|---|
| `apps/worker/src/do/quota.ts` | `0b1db760c00c0afb77eb46d9c6159c80c3c11b00c8771834209cf2bb5e749eb5` |
| `apps/worker/src/user-export.ts` | `4dd07023948b2c72414ee8435041ac8d1c2d936c0cdc558d2e546336dccb6928` |
| `apps/worker/src/account-export.ts` | `07f73c24b604012c04ef97902009742586d1ecbc29a9c010c97d6b4d51999db4` |
| `apps/worker/tests/export-inventory.test.mjs` | `ee248b9d86c6908b31b97be1ee0498a537d287d82b8b37b1462253b414f5c131` |

The earlier full-suite count remains the last full-suite observation. This focused follow-through
closes one of its two integration gaps, but no full Worker suite was rerun in this step.

## Final integrated Worker verification

After all six findings from the earlier `3423/3429` run were repaired by their owners, the complete
Worker suite was rerun from the current shared checkout. The earlier red result above is retained as
the historical observation for that earlier snapshot; this section is the later final observation.

### Exact pre-run fingerprint

The final run started from:

| Set | Files | Aggregate SHA-256 |
|---|---:|---|
| `apps/worker/src/**` | 151 | `6c6b02188cdf4c3ea8b62b8640a3461811a6db045588b7b8c790a3668410350d` |
| `apps/worker/tests/**` | 240 | `72398f6b979f71dc5470e91aa8fb43417b1633a1658145eec5e28ca9dff0fa33` |
| Worker package/config: `package.json`, `tsconfig.json`, `wrangler.jsonc`, `wrangler.apple.jsonc` | 4 | `d3770d8686499a0501357dad0d29b753bbcf34873b2aeaa298910b2643feb65b` |

There were **230 recursive `*.test.mjs` files** under `apps/worker/tests`; there were no nested
test files outside that set and no file was excluded.

### Final full suite

Every one of those 230 files was passed explicitly to:

```bash
node --test --test-concurrency=2 <all 230 recursive test files>
```

The Node process ran in its own process group under an external 900-second kill-and-reap watchdog.

Observed result:

- watchdog timeout: **false**
- process return code: **0**
- tests: **3434**
- pass: **3434**
- fail: **0**
- skipped: **0**
- cancelled: **0**
- todo: **0**
- suites: 0
- Node-reported duration: **22963.7455 ms**
- full-suite log SHA-256:
  `19947cbaace55ae85cbe8f7b282de6c886284273ecec70200f799e3023552622`

An immediate process-table check found no remaining Worker `node --test` child.

The six tests that were red in the earlier integrated run were all observed green in this final run:

- `choose_asset_source NARROWS its list to what the policy allows`
- `every table the worker creates outside Postgres is exported or named as a store that is not`
- `every tool in the agent registry is classified: allowed, or excluded with a reason`
- `tool permissions NARROW the mode toolset, they do not replace it`
- `the oplog gains its failure column, and a second boot survives the duplicate`
- `STATIC CHECK — the run loop consults recovery before it reads the model text`

The suite also visibly exercised the previously sensitive boundaries rather than passing by
omission. The log includes passing hostile-WAV/audio guards, the real in-process billing-authority
HTTP/SQLite path, and the new UI proof-server path, including
`proof server validates item and uses its own price, not client arguments` and
`proof source refuses execution outside Studio before creating its remote`.

### Final Worker typecheck and diffcheck

The Worker package's existing typecheck script was run under a separate external 300-second
process-group watchdog:

```bash
npm run typecheck --silent
```

It completed with timeout false, return code 0, and no TypeScript diagnostics. The captured stdout
log is empty, whose SHA-256 is the standard empty-file digest:
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

A scoped whitespace/error check over Worker source, Worker tests, Worker package/config and this
evidence file also returned 0:

```bash
git diff --check -- apps/worker/src apps/worker/tests \
  apps/worker/package.json apps/worker/tsconfig.json \
  apps/worker/wrangler.jsonc apps/worker/wrangler.apple.jsonc \
  docs/evidence/resume-integrated-worker-tests-2026-09-18.md
```

No test or typecheck child remained after these checks.

### Exact post-run fingerprint

The same manifests were recomputed after the full suite, typecheck and diffcheck:

| Set | Files | Aggregate SHA-256 | Compared with pre-run |
|---|---:|---|---|
| `apps/worker/src/**` | 151 | `6c6b02188cdf4c3ea8b62b8640a3461811a6db045588b7b8c790a3668410350d` | identical |
| `apps/worker/tests/**` | 240 | `72398f6b979f71dc5470e91aa8fb43417b1633a1658145eec5e28ca9dff0fa33` | identical |
| Worker package/config | 4 | `d3770d8686499a0501357dad0d29b753bbcf34873b2aeaa298910b2643feb65b` | identical |

No Worker source, test, or config byte changed during the final verification window. The final
`3434/3434` result therefore applies to the same fingerprint captured before execution.
