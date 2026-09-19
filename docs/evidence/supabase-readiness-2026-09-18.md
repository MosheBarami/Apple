# Supabase live readiness audit — 18 September 2026

Read-only MCP queries against verified project `npqvyijsvzkuwddyhtpm` (AppleAI),
reported `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.166. No customer records, secrets,
credentials or transcripts were fetched. No DDL, policy, auth or billing settings changed.

## Observed catalogue, not assumed from migrations

- Ten public tables, all ten with RLS enabled; no public views/materialized views.
- Nine tables have policies. `studio_pairings` has none: this is default-deny for
  ordinary RLS-bound callers, not a finding that pairing rows are publicly readable.
- Profile update checks the same caller ID before and after the write. Inspected
  policies use `auth.uid()` ownership/membership, not editable user metadata.
- Archive, pinning, tags, membership expiry/revocation/suspension, and
  `profiles.training_opt_in` columns exist in the live catalogue.
- Supabase migration history lists seven entries through membership lifecycle.
  Pinning/tags are present despite not being listed there. The repository runner's
  separate ledger is absent; its `--status` creates a table, so it was NOT run in
  this read-only audit.
- Executed repository `schemaFromSql` / `diffSchema` against the fetched catalogue:
  ten expected/actual tables, zero unreadable statements, one difference:
  `usage_events.credits` absent. Live storage still calls it `sparks`.
  `user-export.ts` asks for `credits`; this indicates an export compatibility defect.
  No real account export was downloaded to reproduce the request in this audit.
  A later zero-row PostgREST probe (`limit=0`, nil owner UUID, public publishable key)
  reproduced HTTP400 / `42703` for `select=credits`; `select=credits:sparks`
  returned HTTP200 / `[]`. No customer row was retrieved in either probe.

The schema comparison covers names/columns/RLS, not types/defaults/indexes or a
fresh live cross-tenant attack test. It is not blanket security certification.

## Advisor findings, qualified by function inspection

- [`force_project_id` mutable search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable):
  confirmed no fixed search path. Function is invoker, returns trigger, and uses
  `gen_random_uuid()` plus `auth.uid()`. Hardening remains open; no exploit demonstrated.
- [Anonymous SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  and [authenticated execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable):
  `handle_new_user`, `protect_profile_fields`, `project_role`. First two return
  `trigger`, so an execute grant is not proof they are callable as ordinary RPCs.
  `project_role` deliberately bypasses recursive membership RLS, has empty fixed
  search path, scopes both branches to `auth.uid()`, and checks membership lifetime.
  Authenticated access is required by existing policies. Anonymous execute is
  broader than the repository migration intends; review/revoke that grant without
  breaking authenticated policy evaluation. No function was invoked against users.
- [Leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection):
  provider advisor reports disabled. No plan upgrade or setting change attempted.
- Broad legacy table grants exist for anon/authenticated including TRUNCATE/TRIGGER.
  These deserve least-privilege hardening; they do not establish a reachable Data API
  truncate endpoint. No destructive test attempted.

## Remaining work

Fix usage export compatibility without renaming historical storage, rehearse SQL
hardening and tenant-isolation tests before applying any migration, and reconcile
migration history deliberately rather than replaying already-present columns.
Consent history needed for trustworthy training exports does not exist yet.

The worker compatibility repair now retries only HTTP400 plus the exact missing
credits-column error, selecting `credits:sparks` with the same owner filter and
caller JWT. Four behavioral tests cover new/legacy schemas and auth/outage/non-400
refusals; root reran all four and the full 3,243-test worker suite, all passed.

The Supabase changelog was fetched before inspection. Relevant Data API exposure
changes reinforce checking actual grants; no new table was created in this audit.
