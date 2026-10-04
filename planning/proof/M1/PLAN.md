# M1 execution plan: rename to StudPilot (written 2026-10-04, before any M1 change)

Source of truth: `planning/rename-inventory.md` and handoff §M1. This file records the order, the check
and the rollback of each step. Every step's result is appended to `planning/proof/M1/LOG.md` as it runs.

## Two facts measured on throwaway Workers before planning (2026-10-04)

1. **A Worker can be renamed in place.** `PATCH /accounts/{acct}/workers/workers/{id}` with `{"name": ...}`
   kept the Worker id, its SQLite Durable Object data, its secret and its vars. The new
   `<name>.moshe-barami111.workers.dev` host served at once, and the old host answered 404 (error 1042).
   A later `wrangler deploy` under the new name kept the data and accepted the existing migration
   history. The DO namespace keeps its internal name (`<old>_<Class>`); Cloudflare has no rename for it.
   (Workers `sp-ren-a` → `sp-ren-b`, created and deleted the same hour.)
2. **A Durable Object class can be moved to another Worker with its data.** A `transferred_classes`
   migration (`from_script`) moved SQL and KV storage of two objects intact, and the source Worker's
   old binding forwarded to the destination. (Workers `sp-xfer-src` → `sp-xfer-dst`, deleted after.)

So the production Worker is **renamed, not rebuilt**. The throwaway test measured that this keeps its
Durable Objects, secrets and vars, so no secret has to be re-entered (Wrangler cannot read secret values
back). It did not measure the cron, the queue consumer, the custom domain or the Workflow; step 1.3f
checks each of those on the renamed Worker.

## The old addresses

Every published Studio plugin hard-codes `https://apple.moshe-barami111.workers.dev` and POSTs to
`/api/studio/*` with `X-Golem-*` headers. A 301 would turn those POSTs into GETs and drop the body, so
the old hosts keep **answering the API** and redirect only page loads:

- `apple` (a new, small Worker, created after the rename frees the name): `/api/*`, `/v1/*`, `/ws*`,
  `/auth/*` and every non-GET request are passed through unchanged to `https://studpilot.app`; any other
  GET returns 301 to the same path on `https://studpilot.app`. Kept 90 days, to 2027-01-02.
- `golem`: the same proxy code, deployed over the old `golem` Worker after its Durable Objects are moved
  out (below). Kept 90 days.

## Order

| Step | What | Check | Rollback |
|---|---|---|---|
| 1.1 | Counts before (done: `counts-before.json`, `session-fingerprint-before.json`) | file exists | n/a |
| 1.2 | Code rename, one PR (packages, env names with fallbacks, copy, wire `studpilot.v1` accepting apple and golem spellings, docs, guard). The wrangler config is renamed to `wrangler.studpilot.jsonc` with `"name": "studpilot"`; resource names change in the step that creates each resource. Not deployed by itself. | all suites, plugin build, `check-old-names.mjs` 0 violations | revert the PR |
| 1.3a | Create D1 `studpilot-corpus`; copy with the migrator Worker (`infra/migrate-studpilot/migrator`), table by table, FTS5 tables included | per-table row counts equal | binding still on `golem-corpus`; delete the copy |
| 1.3b | Create Vectorize `studpilot-docs` (384, cosine); `copy-vectorize.mjs` | vector count equal; one query returns the same top hit from both | binding unchanged; delete the copy |
| 1.3c | Create R2 `studpilot-media`; migrator `/r2` | object count and bytes equal | binding unchanged; delete the copy |
| 1.3d | Create queue `studpilot-notifications`, AI Gateway `studpilot` (same settings as `golem`) | listed | delete |
| 1.3e | KV: title `golem-kv` → `studpilot-kv` (same id) | same id, new title, key count equal | title back |
| 1.3f0 | Before anything moves (added 2026-10-04 after the coupling review): export golem's SessionDO transcripts outside the repo (runbook C2a), record golem's spend and every mapped session's `agentStatus`, re-freeze the object-id sets of every namespace, apply Supabase 0014 (golem outbox consumer off) | exported = `session-info` count; 0 pending golem rows | 0014: set the row back to enabled |
| 1.3f | **Rename the Worker** `apple` → `studpilot` (API PATCH), then at once create the `apple` stand-in (`infra/legacy-proxy`) on the freed name | `studpilot.app/api/health` answers; the cron, queue consumer, custom domain and Workflow name the renamed script; a published-plugin poll on the apple host reaches studpilot; the gap is measured | PATCH the name back; delete the stand-in |
| 1.3g-A | **Deploy A** (commit "cutover A"): name `studpilot`, the six golem classes transferred into `Archive*`, `LEGACY_QUOTA_DO` → `ArchiveQuotaDO`, the retention cron, the custom domain; the OLD stores | `buildSha` = A; object-id sets: `apple_*` unchanged, golem's now under studpilot; billing wiring reports the replica bound | none across a Durable Object migration (Cloudflare refuses that rollback), so A carries nothing else: fix forward |
| 1.3h | Deploy the stand-in over `golem` | on the golem host a poll reaches studpilot and a page GET answers 301 | none back to the old golem Worker: after deploy A its classes belong to studpilot (its old code would get 410s). The fallback is redeploying the stand-in |
| 1.3i | Reconcile: D1 row by row (migrator `/diff` + `/fix`), R2 by etag (`/r2/sync`), Vectorize re-run; record the digest of every old D1 table | 0 differences left | n/a |
| 1.3g-B | **Deploy B** (commit "cutover B"): the copied stores | `buildSha` = B; every old D1 table's digest is unchanged since 1.3i, so nothing was written between the reconcile and the switch | `wrangler rollback` to A (no migration between them); the old stores were not written after the switch |
| 1.3j | Live check: an old project with history opens on `studpilot.app`; the plugin pairs; a chat run completes | measured | as 1.3g-B |
| 1.4 | Supabase name, Auth site URL and redirect list; Sentry; GitHub repo rename; Discord app and bot | API output saved in `platforms/` | each is renamed back by the same call |
| 1.5 | Domain follow-through (CORS, Turnstile hostnames, plugin API base with fallback) | 4 sign-in methods on studpilot.app | config back |
| 1.6 | Local folder rename: asks the owner (STALLED.md) | owner answer | n/a |
| +7 days | Delete `golem-corpus`, `golem-docs`, `apple-media`, `apple-notifications`, `apple-cf-probe` and its queue, gateway `golem`, workflow `apple-model-upload`, after re-checking counts; listed in `deletions.md` | counts re-checked first | none after deletion: that is why it waits 7 days |

## Allowed leftovers (each with a reason in `planning/rename-allowlist.txt`)

- DO namespace internal names (`apple_SessionDO`, `golem_SessionDO` ...): not renamable.
- The two proxy Workers `apple` and `golem` for 90 days (they keep published plugins working).
- Wire spellings the worker still accepts (`X-Golem-*`, `X-Apple-*`, `golem.v1`, `apple.v1`) until the
  legacy counters stay at zero after the renamed plugin is published (owner action X7).
- The Creator Store listing title "Apple Studio" until the owner renames it (deferred).
