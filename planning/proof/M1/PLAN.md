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

So the production Worker is **renamed, not rebuilt**. That keeps every Durable Object, secret, cron,
queue binding and the `studpilot.app` custom domain in place. No secret has to be re-entered, which
matters because Wrangler cannot read secret values back.

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
| 1.3f | **Rename the Worker** `apple` → `studpilot` (API PATCH) | `studpilot.app/api/health` answers; DO object counts unchanged | PATCH the name back |
| 1.3g | Deploy `studpilot` from the renamed config: bindings to the new D1, Vectorize, R2, queue, gateway, Analytics Engine `studpilot_product_events`, Workflow `studpilot-model-upload`; `transferred_classes` brings the six `golem` DO classes in as `Archive*` classes; `studpilot.app` declared as a custom domain | health `buildSha` = HEAD; DO counts = before for apple and golem namespaces; D1/Vectorize/R2 counts = before | `wrangler rollback` to the version before; bindings point back at the old stores, which were never written to after the copy |
| 1.3h | Create the `apple` proxy Worker on the freed name; deploy the proxy code over `golem` | published-plugin request (`POST /api/studio/poll` with `X-Golem-*`) on the apple host reaches studpilot; a page GET answers 301 | delete the proxy |
| 1.3i | Reconcile D1 rows written between the copy and the switch | per-table counts = old (frozen) + new writes | n/a |
| 1.3j | Live check: an old project with history opens on `studpilot.app`; the plugin pairs; a chat run completes | measured | as 1.3g |
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
