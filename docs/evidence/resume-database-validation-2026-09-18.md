# Resume database validation — 2026-09-18

## Scope and result

This lane resumed the database-hardening state already present in the shared checkout. It did not
replay or alter migrations, access Supabase remotely, read credentials or customer rows, or perform
deployment/account changes. The only new file from this lane is this report.

Fresh local validation is green against the current 0009/0010 and migration-runner bytes:

- PostgreSQL schema hardening: **50 assertions passed**.
- Migration-ledger security: **passed**, including a fixture with broad Supabase-style default table
  grants that proves the existing/new ledger is repaired in place, RLS is enabled, direct
  PUBLIC/anon/authenticated grants are removed, unprivileged read/write/truncate are refused, and the
  privileged runner still applies and re-reads a migration.
- RLS isolation: **43 checks passed** after applying all ten repository migrations to a disposable
  database, including the deliberate RLS falsification and restoration.
- Export completeness: **passed** with every Postgres export field accounted for, plus its deliberate
  undeclared-column falsification and restoration.
- Membership access outbox: **22 checks passed** for atomic sequencing, tenant scope, per-consumer
  credentials, claim/ack boundaries, KV-only lifecycle delivery, and no-consumer rollback.
- Migration/collaboration source contracts: **49/49 tests passed** with Node test concurrency fixed at
  one.

The fresh schema-hardening fixture reported **PostgreSQL 16.15**. All requested database fixtures use
the existing local `postgres:16-alpine` image; no image was installed or downloaded for this lane.

## Commands executed now

```bash
node infra/supabase/tests/schema-hardening.mjs
node infra/supabase/tests/migration-ledger-security.mjs
node infra/supabase/tests/rls-isolation.mjs
node infra/supabase/tests/export-completeness.mjs
node infra/supabase/tests/membership-access-outbox.mjs
node --test --test-concurrency=1 \
  tests/migration-runner.test.mjs \
  apps/worker/tests/collab-migration.test.mjs \
  apps/worker/tests/membership-migration.test.mjs \
  apps/worker/tests/membership-access-outbox-migration.test.mjs
```

Every command above exited 0 in this lane. These are fresh local observations, not repeated counts
copied from an older report.

## Current source fingerprints

Repository HEAD while this validation ran:
`6d7a5bec3a741de9cbe97459bcc82e760bd3e089`.
The checkout is shared and dirty, so these SHA-256 values identify the exact bytes validated more
precisely than HEAD alone.

| File/value | SHA-256 |
|---|---|
| `infra/supabase/migrations/0009_membership_access_outbox.sql` | `cf7d6e8e199e642fef47a9f394ab166f7b6e108f297860674e69db91daf4a6aa` |
| `infra/supabase/migrations/0010_schema_hardening.sql` | `cf033d4df2b0c4b5d70f1fda6faa8a2d20060f35f7aa594cc13c62ed30cedb43` |
| `scripts/lib/migration-runner.mjs` | `e39cea67b9caaf2191c3b5c441990f4590ff59671ed52a5ebbab6443840ee04c` |
| exported `LEDGER_DDL` string value | `dc4a7c9e6a718579015a001aee6d79f910b77420810c08b96a58c4b72cc22b8c` |
| `tests/migration-runner.test.mjs` | `9e3a9bc1782decba4a5316a028bc48f60bf1572a530fc81389ca9c33bdded60a` |
| `infra/supabase/tests/migration-ledger-security.mjs` | `a3c71aec25763192eaa0f84356d0bf8a9f0ebbf6d6aa436c4b7071b03753b223` |
| `infra/supabase/tests/schema-hardening.mjs` | `004291e33684cf190d9f9841142060184557f39c3329e1a10922f8bafe266de1` |
| `infra/supabase/tests/rls-isolation.mjs` | `4a2002800af179dbb7fb36750f18a604b41723831464d2ecab8fd39b0e5c83d7` |
| `infra/supabase/tests/export-completeness.mjs` | `0f0c9aecec9afa4bed1e4ddcf1e6c877a77cd51ec6d42d429903aa98cff2104a` |
| `infra/supabase/tests/membership-access-outbox.mjs` | `46811065c0f3e44c8ddc0bbb0a22c3397d8fd2f46ed5ea8aa6927082e6b0e36b` |
| `apps/worker/tests/collab-migration.test.mjs` | `0127194a25120055e80d44d6de6c138c93d1d76a83b0eb287baaf13e80599826` |
| `apps/worker/tests/membership-migration.test.mjs` | `dac71a9530f93faf5a01789834721b2aae116ed94d78b5266fb3d7317570346c` |
| `apps/worker/tests/membership-access-outbox-migration.test.mjs` | `b32801556c50299665b00da95dbf0af9b84d61a9ad1d9c580f2a3a6c228356fe` |

The current `LEDGER_DDL` creates/repairs `public.schema_migrations` inside one transaction, enables
RLS, revokes PUBLIC privileges, conditionally revokes anon/authenticated privileges when those roles
exist, and commits. `readLedger()` runs that same DDL, so status/apply/adopt also repair a ledger
created before the hardening. The real-Postgres ledger fixture reproduced broad default grants before
running this DDL and kept a later control table exposed, proving the fixture did not accidentally
disable the condition being tested.

## Recovered prior rollout evidence

The following artifacts already existed before this lane and were inspected only as recorded
evidence. They were not regenerated and are not fresh remote observations:

| Artifact | SHA-256 |
|---|---|
| `docs/evidence/supabase-hardening-followthrough-2026-09-18.md` | `9d5954437030d7929344be0f41462f8ac8d6d9fd390564a1e247bc0d4b4cec53` |
| `docs/evidence/supabase-rollout-2026-09-18/manifest.json` | `934eab5ddd69c172346ac2f21b3e0ea1264503b06e4dfa37bd808c39f90ff19a` |
| `docs/evidence/supabase-rollout-2026-09-18/00-secure-ledger.sql` | `f41fd29e111b46167e168c357ad04e9e0dd350f7cbbb1af446af22b4262e7d9a` |
| `docs/evidence/supabase-rollout-2026-09-18/02-postflight.sql` | `35ba4957ace79e80ab3b2a143832134bb83b231e68c185a53b175138edb16f60` |
| `docs/evidence/supabase-rollout-2026-09-18/postflight-before-consumer-config.json` | `b708cf6ac3015c49cc893a1d5d227e9a4e302c9098042aee9b16adc056e15822` |

That recorded postflight contains ledger rows for `0001_init.sql` through
`0010_schema_hardening.sql`, with 0009/0010 checksums equal to the current repository files. It
records RLS enabled on `schema_migrations`, and its Data API privilege list contains no
`schema_migrations` grant for PUBLIC/anon/authenticated. It also records all application tables with
RLS enabled, matching `credits` and `sparks` integer columns with zero mismatches, both outbox
consumers enrolled, zero pending deliveries, and no consumer secrets configured at the
`before-consumer-config` point.

Those statements describe the contents of the existing postflight artifact only. This lane did not
re-query production. The main agent's direct Supabase `execute_sql` read was safety-blocked, and
this lane intentionally did not try another remote SQL or credential path.

## Blockers and limits

There is **no local validation blocker** in the requested scope: all requested local tests passed
against the fingerprints above.

The only unresolved observation boundary is current production state after the recorded
`postflight-before-consumer-config.json`. Because remote SQL was explicitly out of scope here, this
report does not claim that consumer secrets, queues, grants, or migration rows are unchanged since
that recorded postflight. Any production-current claim still needs an authorized read path handled
by the main agent.
