# Cloudflare Workers Builds — why the PR check is red

`Workers Builds: golem` fails on **every** commit to the PR, including commits
that change only a Markdown file. It is a build-configuration problem, not a
code problem, and it cannot be fixed by pushing to the branch.

## What actually happens

The build itself succeeds — `pnpm install`, `pnpm -r build`, the Astro site and
the web app all complete. Only the deploy step fails:

```
Executing user deploy command: npx wrangler versions upload
✘ [ERROR] Missing entry-point to Worker script or to assets directory
```

`wrangler` reads its config from the current working directory. The integration
runs at the **repository root**, and this repo has exactly one wrangler config:

```
./apps/worker/wrangler.jsonc      <- the only one
```

There is no root config, so wrangler finds nothing to upload.

## The fix is one dashboard setting

In the Cloudflare dashboard, under the Worker's **Builds** settings, either:

- set the build's **root directory** to `apps/worker`, or
- change the **deploy command** to
  `npx wrangler versions upload --config apps/worker/wrangler.jsonc`

Either resolves it. Both are dashboard state; neither lives in this repository.

## Why a root `wrangler.jsonc` was NOT added instead

That would make the default deploy command work, and it is the wrong fix.

`apps/worker/wrangler.jsonc` carries five Durable Object bindings and their
**migration tags** (`v1` creating `SessionDO`/`QuotaDO`/`PairingDO`/`AdminDO`,
`v2` adding `BudgetDO`). A second config duplicating those is a second source of
truth for migration state. The day the two drift, a deploy either fails or
applies the wrong migration to a live Durable Object namespace — and DO
migrations are not something you undo.

A red check on a Draft PR is a much smaller problem than that, so the check stays
red until the dashboard setting is corrected.

## The repo's own deploy path is unaffected

`README.md` documents the real one, and it works:

```
cd apps/worker && pnpm exec wrangler deploy     # API
node infra/deploy-static.mjs                    # site + app -> D1 static store
```

The Workers Builds Git integration is a **second, redundant** deploy path.
Correcting it is worthwhile so the check is honest, but nothing depends on it.

## One real bug this surfaced, now fixed

`apps/worker/package.json` declared:

```json
"deploy:api": "node ../../infra/deploy.mjs"
```

`infra/deploy.mjs` has never existed in this repository — `git log --all` on that
path returns nothing. The script has been dead since it was written. It now runs
`wrangler deploy`, matching the documented runbook.
