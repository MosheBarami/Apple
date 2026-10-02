# Removing the old name from the cloud: runbook (phases B-deploy, C, D)

**Status: NOTHING IN THIS FILE HAS BEEN EXECUTED.** Written 2026-10-02 by the `apple rename:` workflow. Owner decision of the same
day: the old name is wiped out of every aspect of the product. Phases A and B (the repository, and the
backward-compatible wire/storage code) are in the git branch that carries this file. This file is the plan for
everything that touches a live system. Every step below needs the owner's approval, is run by the orchestrator one step at a
time, and has a verification and a rollback. Do not run two steps in one sitting.

This file names the old name on purpose, in the open. It is allowlisted by `scripts/check-no-golem.mjs` as a record of the removal and is
deleted with the last step.

## 0. What was measured, and what was not

Measured read-only on 2026-10-02 (Cloudflare MCP list calls; no write of any kind):

| Resource | Name today | Evidence |
|---|---|---|
| Workers | `apple` (modified 2026-10-02T13:04Z), `golem` (created 2026-08-30, last modified 2026-09-21T20:52Z), `apple-cf-probe` (2026-09-23), plus three that are not this product (`fizzy-game-ai`, `dry-salad-ac0b`, `spinrewriter-bridge`) | `workers_list` |
| D1 | `golem-corpus`, id `32c9471e-a7d7-49ee-a8fe-0a7def2c68bd`, `file_size` 1,263,108,096 bytes | `d1_databases_list` |
| KV | `golem-kv`, id `cc341a7db4d748139f161fdc292e6e84` | `kv_namespaces_list` |
| R2 | `apple-media` (already renamed) | `r2_buckets_list` |

NOT measured, and each is a precondition below: Vectorize index `golem-docs` vector count (the sweep before this workflow said 4,350, 384 dimensions,
cosine); AI Gateway `golem` settings (the sweep's token could not read them); the Stripe webhook endpoint URL; Sentry projects and
release names (no Sentry tool was available); the Supabase dashboard (auth redirect allow-list, email templates, webhooks); GitHub repo
metadata beyond what the sweep reported; fetch-only request traffic of the `golem` worker by host and path.

## 1. Order of operations, end to end

1. **Merge phases A and B1** (everything in the branch up to the commit named `apple rename: B1 ...`). Nothing client-facing changes: the worker now
   accepts both wire spellings. The orchestrator merges by re-running `node scripts/rename-golem.mjs --phase A` on the newer `main`
   if it moved (the codemod is re-runnable and idempotent; do not hand-merge renames), then runs `pnpm install` once (the workspace packages
   were renamed `@golem/*` to `@apple/*`) and the full suites.
2. **After the live benchmark has finished**, deploy `apple`: `node infra/deploy-worker.mjs apple`. It stamps BUILD_SHA and fetches what it deployed.
3. **Verify B1 is live**: `curl -s https://apple.moshe-barami111.workers.dev/api/health` must contain `"compat":"wire-both"` and a `legacyWire` object.
4. **Only then merge B2** (the commits named `apple rename: B2 ...`): clients send the new spellings. `node scripts/rename-golem.mjs --phase B2` refuses to run
   unless step 3 holds (`--force` overrides, do not use it).
5. **Owner's call (D6): build and publish plugin 1.1.0** from the B2 sources (`node apps/apple-plugin/scripts/build.mjs`, then the Creator Store upload
   the owner already knows). Building and publishing the artifact is not part of this workflow.
6. Phase C steps below, in order, each with approval.
7. Phase D when the counters allow it.

Why B2 must wait: a client that sends `apple.v1` / `X-Apple-*` to the currently deployed (old) worker is rejected, and the current deploy is what
the benchmark is running against. `infra/smoke.mjs`, `infra/e2e.mjs` and the owner-bench runner are such clients.

## 2. Phase C: the cloud, one step at a time

Conventions: `ACC` is the Cloudflare account id; `wrangler` is run from `apps/worker`; every step first records its rollback pointer in the
orchestrator's log. Secrets are never printed. "Verify" lists observations, not hopes: state what you measured.

### C0. Preconditions for the whole phase

- The benchmark has finished (the owner says so).
- B1 is deployed and `/api/health` says `compat: wire-both`.
- Fetch-only traffic of the `golem` worker has been measured by host and path (Workers Analytics, or `wrangler tail golem --format json` for a sampling window). The
  arithmetic from the cron triggers (`* * * * *` is 1,440 invocations a day) explains part of its roughly 2,900 requests a day, not all: do not assume the rest is cron.
- The Stripe webhook endpoint is READ (Stripe dashboard, Developers, Webhooks) and its URL recorded. `docs/GO-LIVE.md` says the billing webhook
  requires the legacy worker because every billing mutation is replicated into its `QuotaDO`. If the endpoint still points at the `golem` host, it
  must be moved to the `apple` host (a Stripe dashboard change, owner's account) BEFORE C1.
- Rollback pointers recorded: `apple` current deployment id (`wrangler deployments list --name apple`), `golem` deployment `3e5e5071...` / BUILD_SHA `89becd9`
  (from the pre-workflow sweep; re-read it with `wrangler deployments list --name golem`).

### C1. Remove the billing replica code and the `golem` deploy target (repo change, then deploy `apple`)

Repo (run `node scripts/rename-golem.mjs --phase C-repo` for the mechanical part, then these by hand with tests, red-first):

- delete `LEGACY_QUOTA_DO` from `apps/worker/src/env.ts` and `wrangler.apple.jsonc`; delete the replica write in `apps/worker/src/index.ts` (the block around
  `BILLING_REPLICA_WORKER`) and `apps/worker/src/billing-origin-authority.ts`' replica constant; delete the billing-replica tests
  (`billing-webhook-authority.test.mjs` replica cases, `billing-wiring-report.test.mjs`, the `LEGACY_QUOTA_DO` cases in `billing-test-admins.test.mjs`);
- remove the `golem` target from `infra/deploy-worker.mjs`, delete `apps/worker/wrangler.jsonc` (the old worker's config), and the legacy-host redirect
  (`LEGACY_PRODUCT_HOST` in `packages/shared/src/index.ts` and its use in `apps/worker/src/index.ts`, `apps/worker/tests/legacy-host.test.mjs`);
- remove the `MEMBERSHIP_OUTBOX_CONSUMER`/`BILLING_WORKER_NAME` handling that distinguishes the two deployments only after C3 (the outbox consumer rows).

Deploy: `node infra/deploy-worker.mjs apple`.

Verify: a Stripe test-mode webhook delivery (Stripe dashboard, "Send test webhook") answers 2xx and the plan/credits mutation lands once; `/api/health` is green
and shows the new BUILD_SHA; plugin poll and a project socket still work (`node infra/smoke.mjs`).

Rollback: `wrangler rollback --name apple <previous deployment id>` (recorded in C0). Nothing in this step is irreversible.

### C2. Retire the `golem` worker (IRREVERSIBLE)

Pre: C1 verified for at least one full billing cycle of traffic; C0's fetch-only traffic measurement shows no real client on the `golem` host; the `SENTRY_DSN`
secret has been deleted from `golem` first (`wrangler secret delete SENTRY_DSN --name golem`) so its errors stop arriving in the product's Sentry (`docs/GO-LIVE.md`
records that legacy `golem` events reached `apple-worker`).

Do: `wrangler delete --name golem`. This removes the `golem.moshe-barami111.workers.dev` host (it 404s afterwards, there is no redirect: a workers.dev host exists only
while a worker of that name exists), its 77 `golem_SessionDO` objects and its six `golem_*` Durable Object namespaces.

Verify: `curl -sI https://golem.moshe-barami111.workers.dev/` is not 200 (404 or 1042); `apple` health, billing webhook test and plugin poll are green.

Rollback: re-deploy the recorded `golem` version (`wrangler versions deploy` is not available once the worker is deleted, so this is a fresh `wrangler deploy` of the
tree at the commit that built BUILD_SHA `89becd9`, using the removed `wrangler.jsonc`). The Durable Object storage is NOT recoverable. This is why C2 waits.

### C3. Supabase: remove the `golem` outbox consumer (new migration `0014`; do NOT edit `0009`)

`0009_membership_access_outbox.sql` seeded `values ('golem'), ('apple')` and the migration runner checksums applied migrations, so it is never edited.

Pre (read-only): `select consumer, count(*) from public.membership_access_outbox group by consumer;` must show 0 pending rows for `golem`; and `select consumer, enabled from public.membership_outbox_consumers;`.

Do, as `infra/supabase/migrations/0014_retire_legacy_outbox_consumer.sql` (apply with `node infra/supabase/migrate.mjs`, the repo's ledgered runner):

```sql
-- Step 1 (one release earlier, if you want a soft landing): stop fanning out to the old consumer.
update public.membership_outbox_consumers set enabled = false where consumer = 'golem';

-- Step 2 (once step 1 has run for a cycle and nothing is pending for it):
delete from public.membership_access_outbox where consumer = 'golem';        -- the FK has no cascade; must be empty or cleared first
delete from public.membership_outbox_consumers where consumer = 'golem';     -- cascades membership_outbox_secret
```

Verify: `select consumer from public.membership_outbox_consumers;` returns only `apple`; the `apple` consumer keeps draining (`membership_access_outbox` has no growing backlog; the
worker `scheduled` log shows acknowledgements).

Rollback: `insert into public.membership_outbox_consumers (consumer) values ('golem') on conflict do nothing;` then
`node infra/provision-outbox-token.mjs --consumer golem --worker golem` (only meaningful if a `golem` worker exists, i.e. before C2).

### C4. KV: `golem-kv` to `apple-kv`

Do: `wrangler kv namespace create apple-kv`; copy every key including its expiration (list with `wrangler kv key list --namespace-id cc341a7db4d748139f161fdc292e6e84`,
then `wrangler kv bulk put` per batch; keys with a TTL must be re-put with `--expiration`); switch `kv_namespaces[0].id` in `wrangler.apple.jsonc` to the new id; deploy `apple`;
keep the old namespace one full cycle.

Prefixes that matter (from `apps/worker/src/user-export.ts`, the erasure/export contract): `ws:`, `wsv:`, `wst:`, `image:`, `audio:`, `share:link:`, `share:grant:`, `idem:`, `config:models`.

Verify: key counts match per prefix before the switch; a real export and a real erase round trip on a throwaway account cover the new namespace.

Rollback: put the old id back in `wrangler.apple.jsonc` and redeploy. Do not delete the old namespace until a full cycle of TTLs has passed.

### C5. Vectorize: `golem-docs` to `apple-docs`

Pre: read the index (`wrangler vectorize info golem-docs`): record dimensions (384) and vector count. UNVERIFIED: whether wrangler's list/get/upsert path preserves per-vector
metadata; the safe route is to REBUILD rather than copy: `wrangler vectorize create apple-docs --dimensions=384 --metric=cosine`, bind it as `VEC`, deploy `apple`, then run the
corpus upload against it with `node packages/corpus/src/upload.mjs --full` (it embeds with the same model; spends neurons, so get the owner's approval for the cost).

Also update the name in `apps/worker/src/user-export.ts` (the `vectorize` row) and `scripts/owner-dashboard/collect.mjs`.

Verify: vector count equals the old index; `packages/evals` retrieval gold test (`apps/worker/tests/retrieval-gold.test.mjs` for the shape, plus the live gold query set) returns the same top hits.

Rollback: set `index_name` back to `golem-docs` and redeploy.

### C6. AI Gateway `golem` to `apple`

Pre: read the gateway's settings with a token that has the scope (the sweep's token could not): `GET /accounts/$ACC/ai-gateway/gateways/golem`. The repo's own contract (`docs/CLOUDFLARE-SURFACE.md`)
says logs on, `cache_ttl: 0`, rate limit 200; confirm, do not assume.

Do: create `apple` with the same settings (`POST /accounts/$ACC/ai-gateway/gateways`), then set the worker var `AI_GATEWAY_ID` to `apple` in `wrangler.apple.jsonc` and deploy.

Verify: one real model call through the product appears in the new gateway's logs; none in the old one.

Rollback: set `AI_GATEWAY_ID` back and redeploy; delete the old gateway only after a full day of clean logs on the new one.

### C7. D1 `golem-corpus` to `apple-corpus` (the large one)

Size: 1.26 GB, 40 tables, `asset_library` about 511,208 rows (sweep figures; re-count first). The corpus half is rebuildable, but the user data in it is not (`generated_images`,
`project_branding`, the static site tables, memory, notifications...), so this is a copy with a snapshot first.

Pre: maintenance window agreed with the owner (the worker's writes must stop or the copy is stale); take a restore point: `wrangler d1 time-travel info golem-corpus` (record the bookmark).

Do: `wrangler d1 create apple-corpus`; export and import in chunks (`wrangler d1 export golem-corpus --remote --output corpus.sql`, then `wrangler d1 execute apple-corpus --remote --file corpus.sql`; at this size the
export may need to be split by table, `--table`, because of D1 per-request limits; this is UNVERIFIED for 1.26 GB, so do a dry run on a throwaway database first); switch
`d1_databases[0].database_name` and `database_id` in `wrangler.apple.jsonc`; deploy.

Verify: per-table row counts match old to new for every table (`select name from sqlite_master where type='table'` then `select count(*)` each); `/api/health`, a project load, the static site
(`/` and `/pricing`), an image read.

Rollback: switch the binding back to `golem-corpus` (kept untouched) and redeploy; if data was written to the new database in between, reconcile before switching back (this is why the window exists).

### C8. `apple-cf-probe` and its queue/workflow

Probe leftovers from 2026-09-23. Owner confirms they are not used, then `wrangler delete --name apple-cf-probe` and delete the queue and workflow that probe created (`wrangler queues list`,
`wrangler workflows list`). Verify they no longer list. Rollback: none (they are scratch).

### C9. Secrets and environment variable names

The scripts read `APPLE_*` first and fall back to `GOLEM_*` (`scripts/lib/env-compat.mjs`). Add the new names alongside the old in the owner's `.env` and in CI:
`node scripts/rename-golem.mjs --phase A --local` does the `.env` part (names only; values are copied byte for byte and never printed) and the memory/`.claude` parts; run it with the owner present.

Variables: `GOLEM_ADMIN_KEY`, `GOLEM_E2E_EMAIL`, `GOLEM_E2E_PASSWORD`, `GOLEM_LOAD_PASSWORD` become `APPLE_*` (plus `GOLEM_BENCH_JWT`, `GOLEM_BENCH_REFRESH_TOKEN`, `GOLEM_TOKEN`, `GOLEM_API_URL` where set).
The untracked file `.env.release-golem-20260918.json` may hold secrets: rename it only with the owner's consent and never print or commit it.

Verify: a script run with ONLY `APPLE_*` set (`env -i APPLE_ADMIN_KEY=... node infra/healthcheck.mjs`) passes. Remove the old names only in phase D.
Worker secrets are not renamed (the worker's own secret is `ADMIN_KEY`).

### C10. Sentry

No Sentry tool was available to the workflow; project names (`apple-worker`, `apple-web`) come from repo docs only. Do: in the Sentry UI/API, (1) delete or resolve issues that came from the `golem` worker; (2) check alert
rules, release names and project/team slugs for the old name; (3) confirm `SENTRY_DSN` is gone from `golem` (done in C2) and present on `apple`. Verify: a deliberate test error from `apple` arrives in `apple-worker`. Rollback: n/a.

### C11. GitHub (writes)

The repo is `MosheBarami/golem` today. Rename with `gh repo rename apple` (GitHub redirects the old name; update the Cloudflare Workers Builds / Git integration if one is configured: it is not measured, check the
dashboard). Update the description and topics (`gh repo edit --description ... --add-topic ...`), retitle PR #5 and issue #5 (`gh pr edit 5 --title ...`), and delete the merged branch
`feature/golem-product-experience` (`git push origin --delete feature/golem-product-experience`; PR #5 is merged). Offer the other merged branches to the owner; do not touch unclassified ones (`rescue/*`, `checkpoint/*`, `agent/*`,
`codex/live-thirdparty-dashboard`, `fix/live-schema-drift-export-contract`). Update `docs/DEPLOY-INTEGRATION.md` (lines naming the repo) in the same change.
Verify: `gh api repos/MosheBarami/apple` shows the new values (GET). Rollback: `gh repo rename golem`.

### C12. Supabase dashboard (the MCP cannot see these)

Auth: the Site URL and the redirect allow-list (the docs say it is clean of the old host; the dashboard was not read), email template text and sender name, webhooks, Vault entries. The load-test users
`load*@golem.internal` (Q-011; the count in `auth.users` is unverified): delete them and then drop the `@golem\.internal` alternative from `scripts/owner-dashboard/cc/platforms/business.mjs`.
The ledger name `init_golem_schema` in the migration history table is cosmetic; rename it only if the owner wants it gone (one metadata update, no runtime effect).
Verify: owner confirms in the dashboard. Rollback: n/a.

## 3. Phase C-repo: the repository half of C, in one commit after C1 to C7

`node scripts/rename-golem.mjs --phase C-repo` swaps the cloud-bound names in the tree: `golem-corpus`, `golem-docs`, `golem-kv`, `golem-assets`, `golem-gw`, `GolemPalette`
(after the benchmark's world file is changed too: it resolves `ServerStorage.GolemPalette` by name, so make it resolve `ApplePalette` first and the old name second, build, and only then run this), the
quoted worker name, `MosheBarami/golem`, and the hosts. Then delete the allowlist entries it makes redundant (the guard fails on an entry that matches nothing, which is how removal is enforced).

## 4. Phase D: remove the compatibility

Preconditions: plugin 1.1.0 published and adopted; the `legacyWire` counters from `/api/health` (and the `[legacy-wire] first use ...` log lines in Workers Logs) have read zero for the window the owner
agrees; the owner accepts that an old plugin then stops pairing.

1. `node scripts/rename-golem.mjs --phase D` lists every shim due (each is an allowlist entry whose removal says phase D).
2. Delete `packages/shared/src/legacy-wire.ts` and every use (the readers fall back to nothing), `scripts/lib/env-compat.mjs`'s fallback, `scripts/lib/legacy-name.mjs` and its importers, the legacy halves of the tests, and the
   `GolemBaseVolume` read in `sound-design.ts`/`audio-tools.ts` (but see the caveat: places already built keep the old attribute until a pass rewrites it; the generated Luau clears it on the first pass).
3. Remove the `GOLEM_*` names from `.env`/CI. Remove the `golem.memory.v1` legacy import format only if the owner decides users' old export files no longer need importing (they may never be removable).
4. Optionally re-hash content (`packages/corpus/src/intake/contenthash.mjs` domain separators): changes every stored content hash, so only if they can all be regenerated. Where they are stored is not measured.
5. Delete this runbook and the codemod. The guard stays; its allowlist should shrink to third-party names, `docs/evidence/**` and the applied migrations.

## 5. Rollback summary

| Step | Reversible | How |
|---|---|---|
| B1/B2 deploy | yes | `wrangler rollback`; B1 changes nothing for old clients |
| C1 | yes | redeploy previous `apple` |
| C2 | NO (DO storage lost) | rebuild from the recorded commit |
| C3 | yes | re-insert the consumer, reprovision the token |
| C4, C5, C6, C7 | yes while the old resource is kept | switch the binding back |
| C8 to C12 | mostly n/a / GitHub rename reversible | as stated |
