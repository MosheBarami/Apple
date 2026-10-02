# platforms/

Everything that touches an external service lives here, one folder per service. Application code stays in
`apps/` and `packages/`; this folder holds the scripts, migrations, probes and the one-page "how it is wired" for
each platform.

| Folder | Service | What is in it |
|---|---|---|
| [`cloudflare/`](cloudflare/README.md) | Workers, Durable Objects, D1, KV, R2, Vectorize, Queues, Workflows | `deploy/` (the one deploy path, rollback), `verify/` (smoke, e2e, load, health checks against the deployed worker) |
| [`supabase/`](supabase/README.md) | Postgres, Auth (project `AppleAI`) | numbered migrations, the migration runner, RLS and schema tests |
| [`sentry/`](sentry/README.md) | Error monitoring | how the worker and the browser report, what is and is not sent |
| [`stripe/`](stripe/README.md) | Billing | secret names, webhook route, where the tests are |
| [`discord/`](discord/README.md) | Bot and community server | the server provisioning script |
| [`roblox/`](roblox/README.md) | Open Cloud, Creator Store, Studio plugin | pointers to the plugin release runbook |
| [`github/`](github/README.md) | Source control and CI | the two workflows, what CI may and may not do |

## The one deploy path

Deploys are manual and owner-approved. No GitHub Actions job deploys anything (`ci.yml` is given no secrets).

```sh
node platforms/cloudflare/deploy/deploy-worker.mjs apple        # worker, BUILD_SHA stamped from git
node platforms/cloudflare/deploy/deploy-static.mjs --only web   # or --only site: static assets into the D1 store
node platforms/supabase/migrate.mjs --verify                    # migrations: verify first, apply by hand
```

## Names, never values

Each README lists the environment variable and secret NAMES a platform needs. Values live in Cloudflare secrets,
the git-ignored `.env`, `apps/worker/.dev.vars` and `apps/web/.env.local`. `.env.example` at the repo root is the
template (names only). Never commit a value; `python3 scripts/checks/secret-scan.py` scans the whole history.

## Naming note

The product is **Apple**. Some physical resources still carry the old name (`golem-corpus`, `golem-kv`,
`golem-docs`, the `golem` worker and AI Gateway). They are renamed by recreating and migrating, not by editing
text; the per-platform READMEs say which is which.
