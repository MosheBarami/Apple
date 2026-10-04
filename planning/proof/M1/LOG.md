# M1 log (one entry per step, measured)

## 0. Starting point (2026-10-04 16:16 UTC)
- `origin/main` = `2f77a1f4` (M0 summary). Deployed with `node infra/deploy-worker.mjs apple` from a clean
  clone at `2f77a1f4`; `/api/health` on `studpilot.app` answered `"buildSha":"2f77a1f4"`, `compat: wire-both`.
- Counts before any M1 change: `counts-before.json` (Durable Objects, D1, Vectorize, R2, KV, Supabase) and
  `session-fingerprint-before.json` (201 projects, 980 messages).

## 1.2 Code rename (2026-10-04)
- PR #25 (`studpilot/m1-rename`): commits `da7db9c0` … `fbf9c760`, plus `71313c4d` moving CI to Node 26. CI's
  Node 22 cannot compile the `(?i:...)` tokens, so it reported 255 allowlist lines as problems and
  `check-rebrand.mjs` exited 2.
- Fresh clone of `fbf9c760`: `check-old-names.mjs` CLEAN; `check-rebrand.mjs --offline` "REBRAND COMPLETE IN
  SOURCE" (850 files); guard and rebrand tests 26/26; secret scan "current tree is clean" (6 historical hits,
  all on the register).

## 1.3 Data copies, before the switch (2026-10-04, 17:00–18:00 UTC)
- **Vectorize** `golem-docs` → `studpilot-docs`: 9527 = 9527 vectors (both `info`). Three stored vectors
  (first, middle and last listed id) queried against both indexes: 3/3 identical top-5 ids and scores.
- **R2** `apple-media` → `studpilot-media`: 38 = 38 objects, 5,871,824 = 5,871,824 bytes (migrator `/r2/counts`).
- **D1** `golem-corpus` → `studpilot-corpus`: copied by the migrator Worker. `wrangler d1 export` refuses a
  database with virtual tables (3 FTS5 tables), so `INSERT OR REPLACE` keeps rowids, page by page. Large
  `static_chunks` rows need pages of 40 or fewer. Counts are in the next entry.
- **Stand-in for the old hosts** (`infra/legacy-proxy`), tested on a throwaway Worker against live
  `studpilot.app`, then deleted:
  - page GET `/pricing?x=1` → 301 to `https://studpilot.app/pricing?x=1`;
  - `GET /api/health` → 200 with the origin's body;
  - the published plugin's `POST /api/studio/poll` with `X-Golem-Token` → 401, as the origin answers;
  - a WebSocket upgrade with `golem.v1` → 401, as the origin answers.

## 1.3 Before the switch: what the former `golem` Worker holds (2026-10-04, 18:00–19:00 UTC)
- **Correction to entry 0.** `session-fingerprint-before.json` says 201 of 201 projects are initialized. That
  is wrong. `/api/admin/session-info` answers HTTP 200 with `{"error":"session not initialized"}`, and the tool
  counted any 200 as initialized. The probe also instantiated an empty SessionDO for every project that had
  none: `apple_SessionDO` went from 188 objects (186 with stored data) in `counts-before.json` to 211 (209).
  No project was created after 12:00 UTC. `counts-after` is therefore compared with a baseline re-frozen
  immediately before the switch, not with `counts-before.json`, for that namespace.
- **Which golem objects belong to which project.** A throwaway Worker computed `idFromName(projectId)` in both
  namespaces for the 201 projects (computing an id creates nothing) and was deleted. Then the ids were
  intersected with the namespaces' object lists.
  - 77 `golem_SessionDO` objects: 29 belong to a current project, and every one of those 29 projects also has an
    `apple_SessionDO` object. 48 are orphans that no current project maps to, so no route reaches them today.
  - Of the 29, 14 hold messages in golem. For 12 of those 14, golem has more messages than apple.
  - Those 14 projects belong to the owner's account (4) and to 7 test-like accounts (10). There is no third
    party. Their golem-era history has not been shown anywhere since the web moved to the `apple` Worker.
  - **Disposition: kept, not shown.** All six golem classes move into `studpilot` as `Archive*` classes, with
    their storage (migration v4). Nothing is deleted. Showing the owner's 4 old histories again would need an
    import into the live SessionDO; that is offered to the owner, not done. Deleting the 48 orphans is the
    owner's call, listed in `deletions.md`.
- **Membership outbox.** Consumers `apple` and `golem` both enabled, 0 pending rows each. Migration 0014
  disables `golem` before golem stops running its cron. `apple` stays: it is the stored consumer id the
  `studpilot` Worker drains as.
- **Client IP through a stand-in.** `/cdn-cgi/trace` fetched through a throwaway Worker with `fetch()` showed a
  Cloudflare egress address (`2a06:…`), not the client's. That would put every old-host plugin in one per-IP
  bucket (10 claims a minute, 400 polls). Through a service binding the origin saw the client's own address,
  the POST method and the rewritten host `studpilot.app`. The stand-in uses a service binding. All three test
  Workers were deleted.
- **Not carried over:** golem's var `ROBLOX_CREATOR_USER_ID`, which `apple` never had either, so uploads behave as
  they do today. Adding it would aim uploads at the owner's Roblox account, so it is the owner's decision.
- **Analytics Engine:** events go to `studpilot_product_events`. The admin readback needs a
  `CF_ANALYTICS_TOKEN` secret that the Worker does not have (secret names listed), so nothing reads either
  dataset today. The old dataset keeps its events until they expire.

## 1.3 Before the switch: reconcile, review, export (2026-10-04, 18:00–19:30 UTC)
- **D1 row by row.** The migrator's `/diff` hashes every row (SHA-256 of its values) on both sides, page by page.
  Result: all 25 tables equal row for row, with 0 missing, 0 changed and 0 extra (18:03–18:23 UTC). That
  includes `asset_library` and `asset_library_fts`, 511,208 rows each. Each old table's digest is kept in
  `reconcile-first.json` (scratchpad) for the freeze check.
- **R2.** `/r2/sync` (copy missing or changed by etag, delete extras): 38 objects, nothing to do. Lifecycle
  rules are identical on both buckets (incomplete uploads aborted after 7 days, `attachment/` deleted after
  90 days, `audio/` after 365 days); neither bucket has CORS.
- **golem's sessions exported** (runbook C2a) to `~/Developer/RbxAI-archive/golem-sessions-2026-10-04/`
  (outside the public repo, mode 700). The manifest holds sha256 prefixes of project ids, counts and file
  hashes only.
  - 29 sessions read. 14 had messages, and 128 messages were exported, each project's count equal to what
    `session-info` reports.
  - `agentStatus`: 28 idle; 1 "session not initialized". No run is in flight.
  - golem's spend ledger this month: 0 billable neurons, so nothing is lost by archiving its BudgetDO.
- **Independent review of the cutover diff** (4 lenses, 2 skeptics per finding). Two findings survived, and
  both are fixed:
  - the archive classes and five of the six transfers had no test;
  - the stand-in turned plain-HTTP API calls into HTTPS and so bypassed the origin's 308.

  Also fixed:
  - `workers_dev` set explicitly, because declaring `routes` turns it off;
  - the deploy preflight now reports any failure other than Cloudflare's 10007 as itself;
  - the billing e2e drives `ArchiveQuotaDO` as the replica;
  - tests pin the stand-in's prefixes, migration 0014 and the config-to-code names;
  - the plan's false rollback for the golem stand-in is corrected.

  Each new test was run red (a mutation) and green.
- **Known consequence of archiving:** account erasure purges only the live `SessionDO`. Archived golem
  transcripts of a person who deletes their account are not erased, and the erasure receipt does not mention
  them. This gap existed before for the golem namespace; whether to delete the archive is in `deletions.md`.
- **Not run here:** `infra/supabase/tests/membership-access-outbox.mjs` needs Docker, which this machine does
  not have, and CI does not run it. It now applies migrations up to 0013, so its two-consumer fixture stays
  valid.
- **Location-dependent test:** two `tests/check-pixels.test.mjs` cases fail in any clone under the session
  scratchpad, including one of `2f77a1f4` (M0), and pass in `~/Developer/RbxAI-ci` and in CI.
