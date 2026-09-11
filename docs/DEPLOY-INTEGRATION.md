# Deployment paths — one controlled path, by decision

Owner decision, 2026-08-31: **one controlled deployment path.** The redundant
Cloudflare Git build/deploy integration is removed; GitHub stays the
source-control / PR / CI system and deploys nothing.

## The canonical path (unchanged)

```
cd apps/worker && pnpm exec wrangler deploy     # API, from apps/worker/wrangler.jsonc
node infra/deploy-static.mjs                    # site + app -> D1 static store
```

`apps/worker/wrangler.jsonc` is the only wrangler config in the repository and
remains canonical. It was not moved and no root copy was created.

## What was removed, and why it mattered more than the red check

The Cloudflare Workers Builds Git integration was connected to
`MosheBarami/golem` and configured like this:

| setting | value |
|---|---|
| repository | `MosheBarami/golem`, branch **`main`** |
| production build command | `pnpm run build` |
| **production deploy command** | **`npx wrangler deploy`** |
| production root directory | `/` |
| previews enabled | `false` |
| preview deploy command | `npx wrangler versions upload` |
| preview root directory | `/` |

The failing PR check was the visible symptom — `root_directory: "/"` has no
wrangler config, so the deploy step died with `Missing entry-point`. The real
problem was underneath it: **production was wired to `npx wrangler deploy` on
every push to `main`.** Not a preview upload — a full production deploy, against
live D1, KV, Vectorize and five Durable Object namespaces, carrying the migration
tags in `wrangler.jsonc`.

It had never fired only because the root directory was wrong. Correcting that one
setting to make the check green — the obvious fix, and the one requested twice by
automation — would have silently armed automatic production deployment from Git.
That is why the check was left red rather than "fixed".

The build configuration was deleted via
`DELETE /accounts/{account_id}/builds/workers/{script_tag}`.

## Restoring it, if it is ever wanted

Recreate with `POST /accounts/{account_id}/builds/workers`, script tag for the
`golem` Worker, using the table above **with these corrections**:

- `root_directory` must be `apps/worker`, not `/`
- reconsider `deploy_command`: `npx wrangler versions upload` uploads a version
  without shifting traffic; `npx wrangler deploy` promotes immediately

The build token UUID is deliberately not recorded here — it is account
credential material and belongs in the dashboard, not in a repository.

## GitHub Actions: audited, deploys nothing

Both workflows were inspected against the invariant
*feature PR → tests/build/security/review → no production mutation*:

| workflow | triggers | jobs | deploys? |
|---|---|---|---|
| `ci.yml` | `push: [main]`, `pull_request: [main]`, `workflow_dispatch` | typecheck-and-test, build, plugin, static-checks, security | **no** |
| `plugin-release.yml` | `workflow_dispatch` **only** | plugin artifact | **no** — and it stops at the human publish step |

`grep` for `wrangler`, `deploy`, `secrets.` and `CLOUDFLARE` across
`.github/workflows/` returns **nothing**. `ci.yml`'s own header states no job is
given repository secrets, deliberately: a workflow with no credentials cannot
leak them and cannot spend anything.

So no GitHub Actions path mutates production, and none ever did. The only
automatic production path that existed was the Cloudflare integration above,
and it is now gone. Production deployment is a deliberate human command.
