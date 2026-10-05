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

## 1.2 deployed (2026-10-04, 18:35–18:45 UTC)
- PR #25 merged as `d45da5da` (merge commit). CI was green except "Workers Builds: apple", which also fails on
  main.
  - CI runs on Node 24: Node 22 cannot compile the guard's `(?i:...)` tokens, and on Node 26 the escape-hatch
    checker hung past 300 s once in each of two runs.
- Worker deployed with `node infra/deploy-worker.mjs apple` from a clean clone at `d45da5da` (version
  `c07b6b33`). `studpilot.app/api/health`: `"buildSha":"d45da5da","compat":"wire-all"`.
- With an invalid token, a published plugin's request with `X-Golem-Token`, the new `X-StudPilot-Token` and a
  `golem.v1` WebSocket upgrade each answer 401, as before.
- Site and SPA rebuilt and uploaded (`infra/deploy-static.mjs`, 853 files). It verified that every page serves
  the uploaded bytes; a rollback of 73 paths was captured first.
- `node scripts/check-rebrand.mjs --deployed`: "REBRAND COMPLETE — 850 source files, the deployed bundle and 21
  rendered route(s) carry no user-visible former name".

## 1.3f0–1.3h done (2026-10-04, 18:45–19:05 UTC)
- **0014 applied** through the Management API, with its ledger row in `public.schema_migrations` (sha256
  `f9969f97…`, the file's own hash, the same rule as 0013's row): `golem` enabled false, `apple` enabled true, 0
  pending rows each.
- **Object-id sets frozen** (`do-ids-before-cutover.json` in the scratchpad: count, count with data, and the
  SHA-256 of the sorted ids, per namespace).
- **1.3f rename.** `PATCH /workers/workers/efccd939…` `{"name":"studpilot"}` took 1.6 s and kept the id. The
  `apple` stand-in was deployed 8.5 s later. The apple host answered a plugin poll the same way again (401)
  11.5 s after the rename began; that was the whole gap.
  - Checked on the renamed Worker: the custom domain `studpilot.app`, the `apple-notifications` consumer, the
    minute cron and the `apple-model-upload` Workflow all name `studpilot`.
  - All three hosts serve `d45da5da`. The apple host gives a 301 for pages and a 308 for plain HTTP.
- **1.3g-A** (`865300f4`, version `09ce3dbc`): `studpilot.app` serves `865300f4`, with the custom domain, both
  crons and the workers.dev host up.
  - **Every object survived, compared by id set, not by count.** golem's five namespaces that hold objects are
    now `studpilot_Archive*` with identical id-set hashes (77/77, 1/1, 1/1, 32/32, 1/1; Discord 0). Every
    `apple_*` namespace's id set is unchanged (SessionDO 211/209, QuotaDO 35/35, Admin, Budget, Pairing,
    Discord).
  - `/api/admin/billing-wiring`: `isAuthority: true`, `replicaBound: true`.
- **1.3h:** the stand-in was deployed over `golem` (version `afebfc14`). The golem host: health via studpilot
  (`865300f4`), plugin poll 401, page load 301 to `studpilot.app`, no cron schedules. golem's four leftover
  secrets (`ADMIN_KEY`, `MEMBERSHIP_OUTBOX_TOKEN`, `ROBLOX_API_KEY`, `SENTRY_DSN`) were deleted; `studpilot`
  keeps all 12 of its own.
- **Before B:**
  - R2 `/r2/sync`: 38 = 38, nothing to do.
  - Vectorize: 9527 = 9527, and the old index's last processed write is at 08:07 UTC, before the copy.
  - AI Gateway `studpilot` set identical to `golem`: rate limit 200/60 s sliding, logs on, cache TTL 0, and
    now `cache_invalidate_on_update` too.

## 1.3i and 1.3g-B: the final reconcile and the switch to the copies (2026-10-04, 19:12–19:40 UTC)
- **Final D1 reconcile** (19:12–19:37 UTC, row by row). Every table was already equal except the two the 18:40
  static deploy had written to the old database:
  - `static_assets`: 93 missing, 661 changed, fixed;
  - `static_chunks`: 858 missing, 762 extra, fixed.
  - Result: "ALL 25 TABLES EQUAL ROW FOR ROW". Comparing old-table digests with the first pass (18:03), only
    those two tables had changed.
  - The first attempt stopped on an HTTP 500 from `/fix`: D1 binds at most 100 parameters per statement and the
    fix asked for 200. Batches are now 90 rows, or 10 for heavy chunks with a one-row fallback.
- **Deploy B** (`8fc5e840`, version `4a90efbe`, 19:38 UTC); `studpilot.app` serves `8fc5e840`.
  - Bindings as read back from Cloudflare: D1 `4534b1cf…` (studpilot-corpus), R2 `studpilot-media`, Vectorize
    `studpilot-docs`, queue `studpilot-notifications` (producer and consumer `studpilot`), Workflow
    `studpilot-model-upload`, Analytics Engine `studpilot_product_events`, `AI_GATEWAY_ID` `studpilot`,
    `LEGACY_QUOTA_DO` → `ArchiveQuotaDO`.
  - The old `apple-notifications` queue keeps `studpilot` as its consumer and has no producer, so anything left in
    it drains.
- **Retrieval** (`/api/admin/rag-test`, two queries, before and after B): the same 5 passages in the same order;
  scores within 0.0001 (the query is embedded afresh each call).
- **Static store from the new D1:** `/`, `/pricing`, `/privacy`, `/app` and the app's main asset are
  byte-identical (SHA-256) to the build that was deployed.
- **A chat run completes on the new stores:** `/api/admin/agent-run` on a test-account project, "In one short
  sentence: what does a RemoteEvent do…".
  - Answered in 12 s; the session went back to idle with 4 messages.
  - Cost: 152 billable neurons (month $3.9203 → $3.9219).
  - The new gateway's logs show the GLM call and both embedding calls.
- **Old projects keep their history:** the corrected fingerprint over all 201 projects.
  - 200 have exactly the same message count as before; the test project has +2 (the run above); none has fewer.
  - Total messages 980 → 982. Corrected split: 178 initialized, 23 empty (the objects the first probe created).
- **The plugin pairs: not verified end to end** (BLOCKED B6: minting a code needs a signed-in account). The
  pairing and poll routes answer the published plugin's requests on the old host as the origin does.
- **`counts-after.json`:** all 12 Durable Object namespaces hold the identical object-id sets. D1, Vectorize, R2,
  KV and Supabase match, and each difference is explained there (the static deploy, 1 new notification written
  to the new D1 after the switch, 1 new sign-up, the 0014 ledger row).
- **1.3e KV:** title `golem-kv` → `studpilot-kv`, same id `cc341a7d…`, 9 keys before and after with the same
  prefixes.

## 1.4 Platforms (2026-10-04, 19:24–19:26 UTC; API output in `platforms/`)
- **Sentry:** `apple-worker` → `studpilot-worker` and `apple-web` → `studpilot-web` (ids unchanged, so the DSNs
  are unchanged). The org is the owner's personal `moshe` and carries no former name.
- **Discord:**
  - The interactions endpoint is now `https://studpilot.app/api/discord/interactions`; Discord accepted it after
    its signed PING.
  - The bot username is now "StudPilot".
  - The application name stays "AppleAI": the API ignores `name` (BLOCKED B1).
- **Supabase:**
  - The project is renamed "StudPilot".
  - The Auth site URL is now `https://studpilot.app/app`, and the allow-list gained `studpilot.app/app/**`,
    `/app` and `/**`, with the old entries kept for 90 days.
  - Only email sign-in is enabled (BLOCKED B2). No custom SMTP, so no sender name (BLOCKED B3).
- **Turnstile:** the widget lacks `studpilot.app` and the token cannot edit it (BLOCKED B10).
- **Stripe:** owner-only (BLOCKED B4). **GitHub repo rename:** after the cutover PR merges.

## Owner decisions D-1 to D-9 applied (2026-10-04, `planning/proof/OWNER-DECISIONS.md`)
- **D-1, D-2:** the whole golem archive (the 5 inert `Archive*` classes and `ArchiveQuotaDO`) is deleted after
  the 7-day hold, which closes the erasure gap; the owner's 4 old histories are not imported. The steps and the
  earliest date (2026-10-11) are in `deletions.md`. The local export in
  `~/Developer/RbxAI-archive/golem-sessions-2026-10-04/` stays as the backup.
- **D-3:** `ROBLOX_CREATOR_USER_ID` is never set. It is absent from `wrangler.studpilot.jsonc` and from the
  Worker's secrets (measured after deploy B). Uploads will go to each user's own account through Roblox OAuth.
- **D-4:** the spend caps deployed in M0 are approved (owner action X3 closed): 150,000 billable neurons a day
  and 2,270,000 a month, about $1.65/day and $25/month.
- **D-5:** the free-user pool of $5/month is an M6 task, noted there.
- **D-6:** the local folder is renamed to `~/Developer/StudPilot` as the last step of M1.
- **D-7:** the unused `.env` keys (Clerk, Vercel, Resend) stay.
- **D-8:** no Supabase custom auth domain.
- **D-9:** agents have full `.env` access, and values are never printed or committed.
- **`CF_ANALYTICS_TOKEN`:** I tried to create it through the API first. The main token has no token-management
  permission (403, code 9109), and `CLOUDFLARE_API_TOKEN_WRITE_ALL` is rejected as invalid by both the user and
  the account verify endpoints (code 1000). It is listed in `BLOCKED.md` with steps.

## 1.3 Freeze proof: the old D1 did not change across the switch (2026-10-04, 19:39–20:10 UTC)
- A check-only pass after deploy B recomputed every old-database table's digest: the SHA-256 of the per-page
  SHA-256 of every row, with the same page sizes as before. **All 25 digests equal those of the final reconcile
  (19:37 UTC)**, and every table has the same row count.
- So nothing was written to the old D1 between the reconcile and the switch, and the new D1 started from an
  exact copy.
- The only difference between the two databases is `notifications`: 1 row in the new database that the old one
  lacks, written after the switch, which shows writes now go to the new database.

## Merge and deploy of the cutover (2026-10-04, 20:50 UTC)
- PR #26 merged as `3be704ca` (CI green except "Workers Builds", fixed below). Deployed with
  `node infra/deploy-worker.mjs studpilot` from a clean clone (version `7f6ca0b9`): `studpilot.app` serves
  `3be704ca` = main HEAD, with no `-dirty`.
- **Workers Builds** (the Cloudflare Git integration), read through its API:
  - The branch trigger named the deleted `wrangler.apple.jsonc`, which is why it failed on every PR; it now
    names `wrangler.studpilot.jsonc`.
  - The production trigger on `main` ran `npx wrangler deploy` from the repository root, bypassing
    `deploy-worker.mjs` and its stamp. It was deleted.
  - Proof: `platforms/workers-builds.json`. `docs/DEPLOY-INTEGRATION.md` updated.

## 1.5 deployed (2026-10-05, about 07:30 UTC)
- PR #27 merged as `2cf1e5c1`, the first PR with every check green: 8 of 8, including "Workers Builds:
  studpilot" after its trigger fix.
- Worker deployed from a clean clone (version `e469d123`): `studpilot.app` serves `2cf1e5c1` = main HEAD.
- Site and app rebuilt and uploaded: 853 files, every page verified; a rollback of 73 paths was captured first.
  The landing's canonical link is now `https://studpilot.app/`, and the sitemap and the home page contain no
  workers.dev host.
- `check-rebrand --deployed`: "REBRAND COMPLETE — 851 source files, the deployed bundle and 21 rendered
  route(s) carry no user-visible former name".
- **The escape-hatch hang** (one checker run past 300 s in three CI runs).
  - #27 sets `gc.auto=0` and `maintenance.auto=false` in the test fixture; its CI then passed with no hang.
  - A local run in a clone without that change hung once in the same file.
  - That fits the auto-gc hypothesis but does not prove it. The fixture now also reports the git and node
    processes still alive if a timeout recurs.

## 1.4 GitHub (2026-10-05)
- `gh repo rename`: `MosheBarami/Apple` → `MosheBarami/StudPilot`, now with a StudPilot description and the
  homepage `https://studpilot.app`. The old URL answers 301 to the new one.
- The shared checkout, the deploy clone and every work clone point at the new URL, and fetching through it
  works. Proof: `platforms/github.json`.

## 1.6 Local folder (owner decision D-6, 2026-10-05)
- Renamed `~/Developer/RbxAI` → `~/Developer/StudPilot`. A symlink at the old path keeps running sessions and
  stale references working; remove it once nothing uses it.
- The hand-written memory (17 files) was copied to `~/.claude/projects/-Users-moshe-Developer-StudPilot/memory/`.
- In the owner's uncommitted `.claude/launch.json`, only the paths inside the repo were rewritten; the
  `RbxAI-integration` entries are untouched.
- **Sibling clones:**
  - 8 clean ones (`RbxAI-caps`, `-feed`, `-fix-r3`, `-rename`, `-reorg`, `-search`, `-site-v4`, `-web-v4`) had
    no uncommitted files or stashes when measured. Their 133 branch and tag refs were fetched into the main repo
    under `refs/archive/siblings/<name>/`, and every tip was then referenced (0 unreferenced). Only then were
    they deleted.
  - **One lapse, recorded:** `-site-v4` and `-web-v4` were worktrees of a sibling deleted earlier in the same
    loop, so their final `git status` failed and was read as clean. No work was lost: the measurement taken
    while they were valid showed 0 dirty files and 0 stashes, and their refs had already been archived. The
    guard should have stopped on a failing status; it was not used again.
  - Kept: `RbxAI-design2` (untracked `docs/evidence/ember-rail-round2/`), `RbxAI-integration` (the owner's
    `launch.json` runs a dev server from it), `RbxAI-ci` (the deploy clone) and `RbxAI-archive` (the golem
    export).
