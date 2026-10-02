# Cloudflare

The whole backend is one Cloudflare Worker (`apple`) plus the storage it binds. Read from the account on
2026-10-02 (read-only list calls); the config of record is `apps/worker/wrangler.apple.jsonc`.

## What exists on the account

| Product | Resource | Notes |
|---|---|---|
| Workers | `apple` (the product, modified 2026-10-02) | `wrangler.apple.jsonc` |
| Workers | `golem` (legacy, last modified 2026-09-21) | still owns six live Durable Object namespaces (`SessionDO`, `AdminDO`, `PairingDO`, `QuotaDO`, `BudgetDO`, `DiscordDO`); `apple` binds the old `QuotaDO` as `LEGACY_QUOTA_DO` (`script_name: golem`). Deleting the worker deletes that storage. Its page routes redirect to `apple`. |
| Workers | `apple-cf-probe` | probe leftover from 2026-09-23, not referenced by the repo |
| Workers | `fizzy-game-ai`, `spinrewriter-bridge`, `dry-salad-ac0b` | not this product, not referenced by the repo; leave alone |
| D1 | `golem-corpus` (1.26 GB), binding `CORPUS` | the RAG corpus and the static site store. The 2026-09-21 figure was 531 MiB; nothing in the repo tracks the growth |
| KV | `golem-kv`, binding `KV` | |
| R2 | `apple-media`, binding `MEDIA` | |
| Vectorize | `golem-docs` (384 dimensions), binding `VEC` | |
| Queues | `apple-notifications`, binding `NOTIFY_QUEUE` | declared in `wrangler.apple.jsonc` |
| Workflows | `apple-model-upload`, binding `MODEL_UPLOAD_WORKFLOW` | declared in `wrangler.apple.jsonc` |
| Analytics Engine | dataset `apple_product_events`, binding `PRODUCT_EVENTS` | |
| Workers AI, Images | bindings `AI`, `IMAGES` | |
| AI Gateway | `golem` (var `AI_GATEWAY_ID`) | `cache_ttl: 0` is deliberate; a gate asserts agent calls are never cached |

Not measured here: Pages project `spin` (not this product), and any product the API token could not read
(Stream, Browser Rendering, Calls, Email Routing). A missing permission is not an absence.

## Config files

Both live in `apps/worker/` and **stay there**: wrangler resolves `main: src/index.ts` relative to the config
and seven worker tests read them by path.

| File | Worker name | Use |
|---|---|---|
| `wrangler.apple.jsonc` | `apple` | the product |
| `wrangler.jsonc` | `golem` | the legacy worker; kept so its Durable Objects stay addressable |

They are no longer identical: `wrangler.apple.jsonc` adds the `LEGACY_QUOTA_DO` binding to script `golem`.
Committed `vars` include a billing test-admin email and the account id; moving them out changes deployed vars
and is an owner decision (see `docs/operations/REPO-CLEANUP-PENDING.md`).

## Deploy (`deploy/`)

| Script | Does |
|---|---|
| `deploy-worker.mjs [apple\|golem]` | wrangler deploy with `BUILD_SHA` stamped from git (a dirty tree is named, not refused) |
| `deploy-static.mjs [--only web\|site]` | uploads the built site and web app into the D1 static store, then fetches what it deployed |
| `deploy-showcase.mjs` | publishes the showcase gallery |
| `rollback-static.mjs`, `capture-rollback.mjs` | capture and restore the static store |

Decision of 2026-08-31 (owner): **one controlled deployment path.** The Cloudflare Workers Builds Git
integration was removed because it was wired to `npx wrangler deploy` on every push to `main`. If it is ever
recreated: `root_directory` must be `apps/worker`, and prefer `wrangler versions upload` (no traffic shift)
over `wrangler deploy` (promotes immediately). GitHub Actions deploys nothing.

## Verify (`verify/`)

Checks that run against the DEPLOYED worker, not the code: `smoke.mjs` (`--no-model` is free), `e2e.mjs`,
`healthcheck.mjs`, `loadtest.mjs`, `real-chat.mjs`, `store-validation.mjs`, `pair-helper.mjs`,
`checkpoint-test.mjs`, `critical-flows.mjs`. Some spend real credits; read the header of each before running.

## Secret names on the worker (`wrangler secret put <NAME>`, never values here)

`ADMIN_KEY`, `MEMBERSHIP_OUTBOX_TOKEN`, `ROBLOX_API_KEY`, `SENTRY_DSN`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BUILDER`, `STRIPE_PRICE_STUDIO`, `STRIPE_PORTAL_CONFIGURATION`,
`DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `ROBLOX_CREATOR_USER_ID`, `ROBLOX_CREATOR_GROUP_ID`. The authoritative
list is the `Env` interface in `apps/worker/src/env.ts`. Four of these (`ADMIN_KEY`, `MEMBERSHIP_OUTBOX_TOKEN`,
`ROBLOX_API_KEY`, `SENTRY_DSN`) were also seen set on the legacy `golem` worker.

## Local

`apps/worker/.dev.vars` (untracked) holds local secrets; `wrangler dev` reads it.
