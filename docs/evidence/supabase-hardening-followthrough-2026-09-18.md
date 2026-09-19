# Supabase schema hardening follow-through — 2026-09-18

## Result

Migration `0010_schema_hardening.sql` closes the remaining reproducible Supabase schema and privilege
drift without replacing live function bodies or renaming historical usage data. It is paired with an
executable PostgreSQL fixture that exercises a clean `credits` database, the production-observed
`sparks` database, conflicting and unidentified legacy schemas, and an out-of-order database where
0009 has not run.

No remote migration, SQL write, provider configuration, credential read, customer-row read, Worker
deployment, payment action, or account mutation was performed in this work. Connected Supabase reads
were limited to migration metadata and `pg_catalog` / `information_schema` / policy definitions.

Files owned by this follow-through:

- `infra/supabase/migrations/0010_schema_hardening.sql`
- `infra/supabase/tests/schema-hardening.mjs`
- `docs/evidence/supabase-hardening-followthrough-2026-09-18.md`

## Fresh live catalogue state

Read-only inspection of connected project `npqvyijsvzkuwddyhtpm` (`AppleAI`) reconfirmed the rollout
starting point:

- The repository runner ledger `public.schema_migrations` does not exist.
- Supabase's separate `supabase_migrations.schema_migrations` history has seven rows ending with
  `0006_membership_lifecycle`.
- All four 0009 tables are absent:
  `membership_outbox_consumers`, `membership_outbox_secret`, `membership_access_state`, and
  `membership_access_outbox`.
- `usage_events` has `sparks integer not null default 0` and no `credits` column.
- `force_project_id()` has no fixed `search_path` and is executable through PUBLIC-derived and
  explicit Data API role grants.
- `handle_new_user()` and `protect_profile_fields()` are `SECURITY DEFINER`, use
  `search_path=public`, and are directly executable by PUBLIC/anon/authenticated.
- `project_role(uuid)` already has an empty `search_path`; authenticated execution is required by
  RLS, while anonymous execution is broader than the repository migration intended.
- Live base-table ACLs give anon/authenticated the full legacy table privilege set, including
  `TRUNCATE`, `TRIGGER`, `REFERENCES`, and PostgreSQL 17's `MAINTAIN`. RLS is enabled, so ordinary DML
  remains policy-bound; `TRUNCATE` is still a distinct capability that RLS does not filter.

The connected project reports PostgreSQL `17.6.1.166`. The local executable tests below ran on
PostgreSQL `16.15`; a PostgreSQL 17 image was not present locally and was not downloaded. The
migration deliberately uses `REVOKE ALL PRIVILEGES` rather than naming a version-specific
`MAINTAIN` privilege, and the post-apply live catalogue check below remains required.

## Pinning and tags need ledger adoption, not schema repair

Migration 0007 and 0008 effects were compared field-for-field with the current live catalogue:

| Repository claim | Live catalogue |
|---|---|
| `projects.pinned_at timestamptz` nullable | exact match |
| `projects_owner_pinned_idx` btree on `(owner_id, pinned_at desc)` where `pinned_at is not null` | exact match |
| `projects.tags text[] not null default '{}'` | exact match |
| `projects_tags_idx` GIN on `tags` | exact match |
| projects RLS enabled | enabled |

There is no corrective DDL to insert between 0008 and 0009. Replaying 0007/0008 is unnecessary.

The repository ledger is absent, so adopting only 0007 and 0008 would be wrong: the runner would see
0001–0006 as unapplied files below an applied head and refuse the plan. The truthful repository-runner
baseline is a contiguous adoption of 0001–0008 after the catalogue preflight. This records their
current file checksums without executing them. Two known historical differences are handled
explicitly:

1. Live 0001 stored the usage integer as `sparks`; 0010 reconciles it to the current `credits`
   contract while preserving `sparks` and every row.
2. A later live hotfix changed `protect_profile_fields()`. Migration 0010 uses `ALTER FUNCTION` for
   configuration and ACL changes, so it preserves the installed body rather than restoring old 0001
   text.

The repository ledger and Supabase's timestamped migration history are separate systems. Running
`migrate.mjs --adopt` creates and fills `public.schema_migrations`; it does not fabricate timestamped
rows in `supabase_migrations.schema_migrations`.

## Migration 0010 contract

### Enforced preconditions

The migration fails before changing schema unless all of these are true:

- Relations from 0001–0009 exist, including all four outbox tables.
- The installed signatures exist for `force_project_id()`, `handle_new_user()`,
  `protect_profile_fields()`, and `project_role(uuid)`.
- `usage_events` has at least one of `credits` or `sparks`.
- Every present accounting column is a non-generated PostgreSQL `integer`.
- When both columns already exist, no stored row has unequal non-null values.

The repository runner wraps the file and its ledger row in one transaction. The focused test also
applies 0010 directly inside a transaction and proves that order/type/conflict refusals leave the
input schema and rows unchanged.

### Usage compatibility

On a clean database built from 0001–0009:

- `credits` remains the only accounting column.
- No compatibility trigger is installed on `usage_events`.
- Existing rows and current export schema remain unchanged.

On the production-observed legacy database:

- `sparks` is retained in place.
- `credits integer not null default 0` is added.
- Existing values are copied without changing row identity or deleting any field.
- A validated equality constraint keeps the two stored values equal.
- A `BEFORE INSERT OR UPDATE` trigger accepts old-only and new-only writers and mirrors the changed
  value. Unequal non-zero dual writes are rejected instead of choosing a side.
- Direct execution of the trigger function is revoked from PUBLIC, anon, and authenticated.

The current account-export compatibility retry remains valid during rollout. After 0010, the normal
`credits` query succeeds; the historical `sparks` column remains available to old callers.

### Function hardening

The migration changes configuration and ACLs without replacing function source:

| Function | Final `search_path` | Direct Data API execution |
|---|---|---|
| `force_project_id()` | empty | none |
| `handle_new_user()` | empty | none |
| `protect_profile_fields()` | empty | none |
| `project_role(uuid)` | empty | authenticated only |
| `sync_usage_event_credit_columns()` | empty | none |

`handle_new_user`, `protect_profile_fields`, and `project_role` retain `SECURITY DEFINER` because their
trigger/RLS behavior needs it. `force_project_id` remains invoker-rights. PostgreSQL trigger execution
continues after direct EXECUTE is revoked; the database fixture proves signup bootstrap, profile field
protection, and forced project identity still work under the intended roles.

### Table grants and RLS

0010 re-enables RLS on all fourteen application tables, revokes all PUBLIC/anon/authenticated table
privileges, then restores only caller-proven authenticated operations:

| Table | Authenticated operations |
|---|---|
| `profiles` | `SELECT`, `UPDATE` |
| `projects` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| `messages` | `SELECT` |
| `checkpoints` | `SELECT` |
| `usage_events` | `SELECT` |
| `feedback` | `SELECT`, `INSERT` |
| `waitlist` | `SELECT`, `INSERT` |
| `project_members` | `SELECT`, `INSERT`, `UPDATE` |
| `membership_events` | `SELECT`, `INSERT` |
| `membership_access_state` | `SELECT` |
| `studio_pairings` and outbox internals | none |

`project_members.DELETE` is deliberately absent. Product removal and suspension routes update the
audit-bearing lifecycle row; no current Worker or web caller deletes it. Service-role/owner
maintenance privileges are not changed. Table DML grants do not override RLS, and the focused fixture
proves an authenticated stranger still reads zero project/usage rows despite holding `SELECT`.

## Executed validation

All commands ran from `/rbxai` against the final migration content recorded below.

### Focused hardening database test

Command:

```bash
node infra/supabase/tests/schema-hardening.mjs
```

Result: **50/50 assertions passed** on PostgreSQL 16.15. The test executed:

- a clean 0001–0009 `credits` schema;
- the live-observed `sparks` schema, including the live hotfixed profile-trigger body;
- a broad-grant precondition that really gives anon/authenticated `TRUNCATE` before 0010;
- row preservation and old/new insert/update compatibility;
- function body fingerprints before/after `ALTER FUNCTION`;
- signup, profile-protection, project-id, and `project_role` behavior after direct EXECUTE revocation;
- exact Data API ACL output and RLS on all fourteen tables;
- owner/member/stranger boundaries and direct `TRUNCATE`/membership-delete/outbox refusals;
- conflicting dual-column and unknown-bigint rollback fixtures;
- an out-of-order 0001–0008 fixture proving 0010 refuses before 0009 and changes nothing.

### Existing database and migration suites

Commands:

```bash
node infra/supabase/tests/rls-isolation.mjs
node infra/supabase/tests/export-completeness.mjs
node infra/supabase/tests/membership-access-outbox.mjs
node --test \
  tests/migration-runner.test.mjs \
  apps/worker/tests/collab-migration.test.mjs \
  apps/worker/tests/membership-migration.test.mjs \
  apps/worker/tests/membership-access-outbox-migration.test.mjs
```

Measured results:

- RLS isolation: all ten migrations applied; 43 checks passed, including the harness's deliberate RLS
  break and restoration.
- Export completeness: passed on the clean final schema; `usage_events` still has the nine expected
  clean-schema columns and no undeclared legacy-only column.
- Membership outbox database test: 22 checks passed for atomic state/outbox sequencing, per-consumer
  credentials, tenant scope, bounded claim, acknowledgement, and no-consumer rollback.
- Node migration/collaboration contracts: **48/48 tests passed**.
- `node --check` and `git diff --check` passed for the new migration/test files.

These tests do not claim that production has been migrated. No full Worker suite was rerun because
this scope changed no Worker or web source.

## Tested fingerprints

Repository HEAD during the final run was `6d7a5bec3a741de9cbe97459bcc82e760bd3e089` in the shared dirty
checkout.

| File | SHA-256 |
|---|---|
| `0001_init.sql` | `8f995af09676f1f8141fe68b206aec7adcbddf901ccc3c5e8f049bf0d3856230` |
| `0002_waitlist_policy.sql` | `efbc94539510918ce02aeea3a988742243f477a408eebba853f44add3abc3991` |
| `0003_security_hardening.sql` | `c710b084b3673504dcf168b2c63939bc64c089f48fab800b4024ec8b4060b671` |
| `0004_project_archive.sql` | `428a5774a72c5eea5183cf1d9b2cdd0eb08716b775165be26e42517fbcd10763` |
| `0005_collaboration.sql` | `c4f1fdcbe540426a78a60b4dc3be33fb01057777ed80ce5d8ca1f521eed50366` |
| `0006_membership_lifecycle.sql` | `d369975cfbc038bee82d125aff9f7cb22aae2b17a5110a428c075503aef2182d` |
| `0007_project_pinning.sql` | `63236036927b1edf8bbf86774a5634c238118e7574b4423f68441b5adfe2a331` |
| `0008_project_tags.sql` | `1d164203532c35faf999eb9b4f1aea58c6e1d4c1ed1457542d5e72a14c93351f` |
| `0009_membership_access_outbox.sql` | `cf7d6e8e199e642fef47a9f394ab166f7b6e108f297860674e69db91daf4a6aa` |
| `0010_schema_hardening.sql` | `cf033d4df2b0c4b5d70f1fda6faa8a2d20060f35f7aa594cc13c62ed30cedb43` |
| `schema-hardening.mjs` | `004291e33684cf190d9f9841142060184557f39c3329e1a10922f8bafe266de1` |

The SHA-256 of the ordered text manifest produced by
`for f in infra/supabase/migrations/*.sql; do shasum -a 256 "$f"; done` is
`bbcb359059ed0366d4a12f22aff7123fbf6db20ad8566bca3390152db17ee2ac`.

Any change to 0009 or 0010 after this report invalidates the measured snapshot and requires at least
the focused hardening, RLS, export, and outbox database tests again.

## Exact production sequence for the main agent

Use an authorized direct database URL through the repository runner. Keep the URL in an environment
variable; do not put it in shell history, tracked files, output, or this report.

1. Recheck the catalogue-only preconditions: repository ledger absent, 0009 objects absent,
   `usage_events` has only integer `sparks`, all 0007/0008 fields/indexes still match, and the two file
   hashes above are unchanged.
2. Adopt the contiguous already-present baseline. This creates the repository ledger and records
   checksums; it executes none of 0001–0008:

   ```bash
   node infra/supabase/migrate.mjs --adopt \
     0001_init.sql \
     0002_waitlist_policy.sql \
     0003_security_hardening.sql \
     0004_project_archive.sql \
     0005_collaboration.sql \
     0006_membership_lifecycle.sql \
     0007_project_pinning.sql \
     0008_project_tags.sql \
     --url "$SUPABASE_DATABASE_URL" --yes
   ```

3. Read the plan and require exactly eight applied entries and two pending files, in this order:

   ```bash
   node infra/supabase/migrate.mjs --status --url "$SUPABASE_DATABASE_URL"
   node infra/supabase/migrate.mjs --apply --dry-run --url "$SUPABASE_DATABASE_URL"
   ```

   Expected pending set: `0009_membership_access_outbox.sql`, then
   `0010_schema_hardening.sql`. Stop if there is any checksum, numbering, or unknown-ledger problem.

4. Apply through the runner:

   ```bash
   node infra/supabase/migrate.mjs --apply --url "$SUPABASE_DATABASE_URL" --yes
   ```

   Each file and its ledger row runs in its own transaction. If 0010 refuses after 0009 succeeds, do
   not deploy the Worker. The ledger will truthfully show 0009 applied and 0010 pending; diagnose the
   reported precondition and rerun the same command after review.

5. Verify the required schema:

   ```bash
   node infra/supabase/migrate.mjs --verify --url "$SUPABASE_DATABASE_URL"
   ```

   The expected result is fourteen described/actual application tables with RLS enabled and no
   missing required column. The verifier intentionally tolerates the preserved historical `sparks`
   column because it checks required columns, not destructive absence of compatible legacy storage.

6. Perform a catalogue-only postcheck before configuring tokens or deploying:

   - `public.schema_migrations` contains 0001–0010 with the exact file hashes above.
   - All four outbox tables and their 0009 RPCs exist.
   - `usage_events.credits` and `usage_events.sparks` are integer, non-null, default zero.
   - `usage_events_credit_columns_match` is present and validated; exactly one compatibility trigger
     is installed.
   - The four target functions have `search_path=""`; their installed source bodies still match the
     pre-apply fingerprints.
   - PUBLIC/anon have no direct EXECUTE on the target functions; authenticated has only
     `project_role(uuid)` among them.
   - All fourteen tables have RLS on; PUBLIC/anon/authenticated hold exactly the table-grant map in
     this report, with no `TRUNCATE`, `TRIGGER`, `REFERENCES`, or `MAINTAIN`.

7. Continue the 0009 rollout only after that schema postcheck: enroll distinct per-consumer token
   digests, set each Worker's matching raw secret and consumer name, deploy through the repository
   deploy script, exercise owner-controlled membership changes, verify both queues drain, and rerun
   Supabase advisors/RLS evidence. Raw tokens must never appear in SQL history, logs, git, or this
   report.

Leaked-password protection remains a Supabase Auth account setting and is outside migration 0010.
