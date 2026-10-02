# Apple

Apple is an AI builder for Roblox Studio. You describe a game or a scene in a chat, and Apple builds it in
Studio through a plugin. Behind it sits a Cloudflare Worker with a single model engine, a web app (the Studio
chat) and a marketing and proof site.

Live: https://apple.moshe-barami111.workers.dev

## Where things are

| You want to... | Go to |
|---|---|
| Understand the product and scope | `docs/autonomy/v3/Apple_RbxAI_HANDOFF_V3.md`, then `docs/autonomy/MISSION.md` |
| See what is happening now | `docs/autonomy/CURRENT_STATE.md`, `docs/autonomy/NEXT_ACTION.md` |
| Read all docs | `docs/README.md` |
| Change the worker (chat, billing, tools, Durable Objects) | `apps/worker` |
| Change the Studio web app | `apps/web` |
| Change the marketing and proof site | `apps/site` |
| Change the Roblox Studio plugin | `apps/apple-plugin` |
| Work with Cloudflare, Supabase, Sentry, Stripe, Discord, Roblox, GitHub | `platforms/README.md` |
| Shared libraries, corpora, evals, SDK | `packages/` |
| Run repo checks and generators | `scripts/` |
| Rules for agents and contributors | `AGENTS.md`, `CLAUDE.md` |

Also in the tree: `apps/plugin` (the legacy plugin, kept only as test fixtures), `apps/benchmark/crystal-canyon`
(a frozen benchmark project) and `apps/experiences/lumen-isles`.

## Run it

```sh
pnpm install                       # once
pnpm -r typecheck
pnpm test                          # workspace coverage check, then every package's tests
node --test tests/*.test.mjs       # repo-level tests
pnpm e2e                           # Playwright smoke (needs a built site and web app)
pnpm --filter @golem/web dev       # local Studio chat
```

`@golem/*` is the workspace package scope, still the old name.

## Test

CI runs `pnpm -r test`, the root `tests/*.test.mjs`, the `scripts/check-*.mjs` checks, `scripts/checks/secret-scan.py` and
the plugin build. `node scripts/ci-parity.mjs` runs what it can of the same steps against a clean clone of HEAD.
After a test run, `node scripts/clean-test-tmp.mjs` removes leftover temp directories.

## Deploy

Deploys are manual and owner-approved; GitHub Actions deploys nothing. See `platforms/cloudflare/README.md`
(worker and static assets), `platforms/supabase/README.md` (migrations) and `docs/operations/PLUGIN-RELEASE.md`
(the plugin).

## Secrets

Copy `.env.example` to `.env` (never commit it). Worker secrets live in Cloudflare; their names are listed in
`platforms/cloudflare/README.md`.
