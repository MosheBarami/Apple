# Supabase

Postgres plus Auth. The worker holds no auth secrets: Supabase issues ES256 JWTs and the worker verifies them
against the JWKS; row-level security decides what a user can read.

| | |
|---|---|
| Project | `AppleAI`, ref `npqvyijsvzkuwddyhtpm`, region eu-central-1, Postgres 17 (read from the account 2026-10-02) |
| Edge functions | none deployed |
| URL and publishable key | `SUPABASE_URL`, `SUPABASE_ANON_KEY` in `apps/worker/wrangler.apple.jsonc` (the publishable key is public by design) |
| Web app | `apps/web/src/lib/supabase.ts` |

## What is here

| Path | What |
|---|---|
| `migrations/0001_init.sql` ... `0013_product_modes_only.sql` | numbered schema migrations, applied by hand |
| `migrate.mjs` | the runner: `--status`, `--verify --url postgres://...` (diffs the live catalogue against the files), `--apply` |
| `tests/` | RLS isolation, schema hardening, export completeness, outbox and ledger-security checks (need a local Postgres / Docker; CI does not run them yet) |
| `provision-outbox-token.mjs` | provisions the membership outbox token (name only: `MEMBERSHIP_OUTBOX_TOKEN`) |

## Applied state: run `--verify`, do not trust prose

The remote migration ledger holds 8 timestamped entries (the first is named `init_golem_schema`); the repo has
13 numbered files and `migrate.mjs` keeps its own checksum ledger. The two namings differ, so which migrations
are applied is answered by `node platforms/supabase/migrate.mjs --verify`, not by this file.

## The old root `supabase/` folder

It held only Supabase CLI scratch (`.temp/cli-latest`, `linked-project.json`). It was removed and
`supabase/.temp/` is git-ignored. Migrations are applied with `migrate.mjs`, not the CLI.

## Names needed

`SUPABASE_URL`, `SUPABASE_ANON_KEY` (public). No service-role key appears in the worker's `Env` (`apps/worker/src/env.ts`).
