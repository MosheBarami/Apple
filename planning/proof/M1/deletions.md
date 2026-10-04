# M1 deletions: what the cutover left behind, and when each may go

Handoff 1.3: old resources are deleted **7 days after their replacement is verified**, with the counts re-checked
first. Nothing below has been deleted yet unless its row says so. The earliest date for a 7-day item is
**2026-10-11** (the switch to the copies, deploy B, is logged in `LOG.md`).

| Resource | Replaced by | Re-check before deleting | Earliest | Who decides |
|---|---|---|---|---|
| D1 `golem-corpus` (32c9471e…) | `studpilot-corpus` | per-table row diff (migrator `/diff`) shows the old one unchanged since the switch | 2026-10-11 | consent given (M1 hold) |
| Vectorize `golem-docs` | `studpilot-docs` | vector count, 3-query top-5 comparison | 2026-10-11 | consent given |
| R2 `apple-media` | `studpilot-media` | object count, bytes, etags (`/r2/sync` copies nothing) | 2026-10-11 | consent given |
| Queue `apple-notifications` | `studpilot-notifications` | no consumer left and no backlog | 2026-10-11 | consent given |
| Workflow `apple-model-upload` | `studpilot-model-upload` | no running instance | 2026-10-11 | consent given |
| AI Gateway `golem` | `studpilot` | `studpilot`'s logs show the model calls | 2026-10-11 | consent given |
| Analytics Engine `apple_product_events` | `studpilot_product_events` | none: it expires on its own (3 months) | n/a | nothing to do |
| Worker `apple-cf-probe`, queue `apple-cf-probe-q`, Workflow `apple-cf-probe-wf` | nothing (a probe) | not referenced by any config | 2026-10-11 | consent given |
| Worker `studpilot-migrator` (holds the migrator token secret) | nothing (one-time tool) | after the old D1 and R2 are deleted | with them | consent given |
| Supabase: the `golem` rows in `membership_access_outbox` and `membership_outbox_consumers` (its secret cascades) | nothing (0014 disabled it) | 0 pending rows for `golem` | 2026-10-11 | consent given |
| Stand-in Workers `apple` and `golem` (`infra/legacy-proxy`) | `studpilot.app` | the published plugin no longer uses the apple host (owner action X7 publishes one that does not); Stripe and Discord endpoints repointed | 2027-01-02 | the owner, with X7 |
| Supabase Auth redirect entries for the old hosts | the `studpilot.app` entries | as the stand-ins | 2027-01-02 | the owner |
| `Archive*` Durable Objects in `studpilot` (golem's: 77 SessionDO, 32 QuotaDO, 1 each Admin, Pairing, Budget) | nothing (owner decisions D-1, D-2: delete) | the object-id sets still equal `do-ids-before-cutover.json` (nothing was written to them) | 2026-10-11 | decided: delete |
| `~/Developer/RbxAI-archive/golem-sessions-2026-10-04/` (14 transcripts, 128 messages, outside the repo) | nothing | none | never | decided: keep as the backup (D-1) |

## How the golem archive is deleted (owner decisions D-1, D-2), on or after 2026-10-11

1. **Retire the billing replica.** This is a code change, in one PR, before the migration. `ArchiveQuotaDO` is
   the class that `LEGACY_QUOTA_DO` delivers to, and the Stripe webhook refuses to run without it (`index.ts`, the
   `BILLING_WORKER_NAME`/`LEGACY_QUOTA_DO` gate). Remove the binding, the replica write and its checks
   (`billing-origin-authority.ts` `replicaBound`), as runbook C1 describes, and restate
   `billing-webhook-authority.test.mjs` and `billing-wiring-report.test.mjs` to "one authority, no replica".
2. **Re-check before deleting:** the five archive namespaces' id-set hashes equal the frozen ones (77, 32, 1, 1,
   1 objects).
3. **Delete:** migration v5 `{"deleted_classes": ["ArchiveSessionDO", "ArchiveQuotaDO", "ArchivePairingDO",
   "ArchiveAdminDO", "ArchiveBudgetDO", "ArchiveDiscordDO"]}`. In the same commit, remove `src/do/archive.ts`,
   its exports, its test and the `Archive*` lines in AGENTS.md.
4. **Verify:**
   - The namespaces are gone from `GET /workers/durable_objects/namespaces`.
   - Every live namespace's id set is unchanged.
   - Billing wiring reports the authority bound.
5. **Record** the deletion here with the date and the measured counts. Deleting the archive also ends the
   erasure gap: no golem-era transcript is left outside the live namespaces.
