# AGENTS.md: what this repository is, where everything is, and what will bite you

You are almost certainly an agent. This file is the map. Read it before the first edit, together
with `.claude/skills/rbxai-working-rules/SKILL.md`, which is the **method** and loads automatically.

> **START HERE: `GOAL.md`.** It points at the current goal, `planning/STUDPILOT-FINAL-PLAN.md` (what StudPilot
> is, the quality bar, the milestone table M0 to M7). The build order is `planning/STUDPILOT-HANDOFF.md`. Proof of
> each milestone goes to `planning/proof/<milestone>/`; the newest folder there shows where the work stands. The
> research-first goal and `docs/autonomy/` (V3, ACCEPTANCE gates) are history only. Ask the owner for consent on
> destructive, paid or external actions that the handoff does not already cover; `CLAUDE.md` says what it covers.

Every number below was measured on 2026-10-04 unless the line gives another date. Where a number will
drift, the command that produced it is beside it. A figure taken from the plan says so.

---

## 1. The product

**StudPilot** (https://studpilot.app) is an AI co-pilot for Roblox Studio. In the web app you ask for a piece of
your game: a shop screen, a pet system with eggs, a chest that opens, a lava zone. A Studio plugin, paired to
the project by a 6-character code, builds it in the user's own place and checks it. **Apple and Golem are former
names of StudPilot.**

What the plan says it is (`planning/STUDPILOT-FINAL-PLAN.md` section 1). This is the design, not a measured result:

- For Roblox creators aged 13 and up, PC first, English only. Pieces, not whole games: any custom UI, game
  system, interactive prop or map area. Version 1 is tuned for simulator and tycoon games on new or small places.
- The user sees a live step list and Studio screenshots. The AI never looks at them: **there is no vision in the
  product.**
- A build is put together from reviewed building blocks, plus custom code where no block fits. It is checked
  without vision: play test, button presses, layout check, audit, claim check.
- The reply says only what the evidence ledger proves, and lists the gaps. "Not verified" is an allowed answer.
- AI: GLM 5.3 Flash on Cloudflare Workers AI, behind one switch (`apps/worker/src/gateway.ts`).
- Money (target; the code still holds the old plan limits until M5): credits charged by real AI usage, free
  5 a day and at most 30 a month, Pro $9.99 for 100, Max $24.99 for 300, a $4.99 pack for 50. Free until every
  build type passes the bar and an adult holds the Stripe account; checkout stays off, test mode only. Source:
  `planning/pricing-2026-10-04.md`.

Status: pre-launch, private beta, free. Most of what the plan adds (the block engine, the prompt and tool
diet, the evaluation harness) is not built yet; each milestone's `SUMMARY.md` in `planning/proof/` says what is.

The owner is one person, non-technical, who reads Hebrew and reads neither `docs/` nor code. Report in short plain
sentences with measured numbers. Their top frustrations (handoff ground rule 1): false success claims, endless
testing with no progress, and redesigns that change nothing.

---

## 2. The names

**One name: StudPilot.** A rename never flips a name in one step: a binding, a storage key or a wire literal is
renamed WITH backward compatibility (read both, write the new one), because the published Studio plugin and open
browser tabs still speak the old spellings.

`node scripts/check-old-names.mjs` is the guard. It scans the content and the path of every tracked file for the
two former names. A leftover is allowed only by a line in `planning/rename-allowlist.txt` that gives a reason and
an exact count, so the list cannot grow silently. `scripts/check-rebrand.mjs` is the deployed-artefact half.

### 2.1 What still carries an old name, and why

| Kept | Examples | Why | When it changes |
|---|---|---|---|
| Names written into users' Roblox places | `AppleEconomy`, `AppleHUD`, `AppleLibraryGame`, `__AppleStudioHidden*`, `ApplePlayCheck*`, `AppleBaseVolume`; the Luau files in `packages/components/` keep their `Apple*.luau` names | The agent and the plugin find them by name in games people already saved | M4, when blocks write new names and read the old ones |
| Stored identifiers | the bare id `apple` (product model id, search author id, outbox consumer), `apple-max`, `apple-studio-snapshot-v1`, `apple.account-export.v*`, `apple.memory.v*`, `apple-skill-cards-v1`, `apple.owner-corpus.*`, `apple-authored`, `apple_library`, `appleUserId`, `appleMaxBase`, ledger kinds `apple:...`, browser keys `apple-theme`, `apple.prefs.v1`, `apple.<x>` | Already written into user data, stores and browsers; renaming orphans them | Only with code that reads both |
| Cloud-bound names | the table in 2.2 | The resource is renamed in its own step | Handoff step 1.3 |
| Wire spellings the worker still accepts | the `apple.*` and `golem.*` forms of the WebSocket subprotocol, the token prefix, the `X-<Brand>-*` headers, the capability schema, the generated-UI fence | The published Studio plugin sends the oldest spelling and changes only when a user clicks Update | When the legacy counters stay at zero after the renamed plugin is published (owner action X7) |
| Third-party text | `-apple-system`, `apple-touch-icon`, Apple Inc., Apple Silicon, grapple, pineapple | Not ours | Never |
| The word golem | compatibility shims and records only | Old data and old clients | With the shim it belongs to |

The wire names the product speaks today are `studpilot.v1`, `studpilot.jwt.`, `X-StudPilot-*`,
`studpilot.studio-ops.v1` and `studpilot-ui`. The browser, the plugin, the SDK and the infra scripts send them. The
worker accepts the two former spellings, which `legaciesOf()` derives, and counts every use of one; `/api/health`
reports the counters. The Node scripts read environment variables as `STUDPILOT_`, then `APPLE_`, then `GOLEM_`,
because the owner's `.env` still carries an old prefix. The shims live in `packages/shared/src/legacy-wire.ts`,
`scripts/lib/env-compat.mjs` and `scripts/lib/legacy-name.mjs`. Do not edit them casually: they are how old plugins
and old `.env` files keep working.

Recorded history is not renamed, because rewriting a record falsifies it: `docs/evidence/`, `docs/autonomy/`, the
decision and failure logs (`docs/DECISIONS.md`, `docs/FAILURES.md`), `planning/`, `research/`, and the applied
migrations in `infra/supabase/migrations/` (the runner checksums them).

**A known bug class from the rename codemod.** An unquoted object key or property access (`apple:` or `.apple`)
that indexes a protected stored id was rewritten to `studpilot:` or `.studpilot` while the id itself stayed
`'apple'`. A lookup then misses silently. Where the key IS the stored id, it must still say `apple`. A field that
is new and is renamed on both its writer and its reader may say `studpilot`; read both where an older published
client may still send the old one.

### 2.2 Cloud and platform names

This tree uses the right column. The cutover (handoff step 1.3) is recorded step by step in
`planning/proof/M1/LOG.md`; read it to know whether production has caught up with the tree.

| Resource | Name before step 1.3 | Name after |
|---|---|---|
| Production Worker | `apple` | `studpilot` (config `apps/worker/wrangler.studpilot.jsonc`), renamed in place, so its Durable Objects, secrets and the `studpilot.app` domain stay |
| Legacy Worker | `golem` | a proxy (`infra/legacy-proxy`); its Durable Objects moved into `studpilot` as `Archive*` classes (migration v4) |
| D1 | `golem-corpus` | `studpilot-corpus` |
| Vectorize | `golem-docs` | `studpilot-docs` |
| KV | `golem-kv` | `studpilot-kv` (title only; same id) |
| R2 | `apple-media` | `studpilot-media` |
| Queue | `apple-notifications` | `studpilot-notifications` |
| Workflow | `apple-model-upload` | `studpilot-model-upload` |
| Analytics Engine dataset | `apple_product_events` | `studpilot_product_events` |
| AI Gateway id | `golem` | `studpilot` |
| Durable Object namespaces | `apple_SessionDO` and the other `apple_*` and `golem_*` names | the `apple_*` names are unchanged (Cloudflare has no rename for them); the `golem_*` ones belong to `studpilot` now |
| Old hosts | `apple.moshe-barami111.workers.dev` and the `golem` host | proxy API calls and 301 page loads for 90 days (the `apple` host to 2027-01-02) |
| Supabase project | `AppleAI` (the URL never changes) | `StudPilot` (step 1.4) |
| GitHub | `MosheBarami/Apple` | `MosheBarami/StudPilot` (step 1.4) |
| Local folder | `~/Developer/RbxAI` | `~/Developer/StudPilot`, only after asking the owner (step 1.6) |

The old resources are deleted 7 days after their replacement is verified by counts (handoff M1). Binding names in
code (`CORPUS`, `KV`, `VEC`, `MEDIA` and the rest of section 4) never change; only the resources behind them do. The
plugin's API base is still the old `workers.dev` host until step 1.5, which moves it to `studpilot.app` and keeps
the old base as a fallback. The Creator Store listing keeps the title "Apple Studio" until the owner retitles it
(deferred).

---

## 3. The code

```
apps/
  worker/           the whole backend: Hono on Cloudflare Workers. 260 TypeScript files in src/
                    (git ls-files apps/worker/src | grep -c '\.ts$'). index.ts is the router (~7.4k lines);
                    do/ holds the 7 Durable Object files; tools.ts is the agent's tool registry (~6.9k lines).
  web/              the app SPA: React + Vite. Routes in src/routes, the workspace in src/components/ws
                    (chat, thinking card, composer, panels).
  site/             the marketing site and docs: Astro, static, served from D1.
  studpilot-plugin/ THE Roblox Studio plugin, the one customers install. 21 Luau files in src/ (7 scripts plus
                    14 op modules in src/ops/). `node apps/studpilot-plugin/scripts/build.mjs` builds and
                    verifies the artefact; CI's `plugin` job runs the same command. Runbook: docs/PLUGIN-RELEASE.md.
  plugin/           LEGACY: test fixtures only. Not built, not shipped. Removed in M3.
  benchmark/        model comparison harness. Dropped by the plan; removed in M3.
  experiences/      dropped by the plan; removed in M3.

packages/
  shared/           the wire contract: types, mode tables, plan limits, legacy-wire.ts. Both sides import it.
  components/       Luau components (economy, shop, machines, upgrades, tycoon, waves, defenders ...). They stay
                    and become system blocks. scripts/gen-components.mjs compiles them into the worker.
  corpus/           the Roblox docs corpus and the seed data (section 5).
  asset-library/    openly licensed (CC0) UI and icon packs with a generated manifest, plus fx, sound and model
                    stores.
  evals/            the eval and security suites. security.test.mjs is the standing proof of the trust
                    boundaries.
  sdk/              the public /v1 API client.
  design/           design tokens. NOT a UI library.
  owner-classify/, training/, langflow/   dropped by the plan; removed from the workspace in M3.
  owner-corpus/     the owner's game library data. Git-ignored; stays on disk; leaves the product in M3.

infra/              deploy and operations. deploy-static.mjs and deploy-worker.mjs both verify what they
                    deployed: do not bypass them with bare wrangler. migrate-studpilot/ holds the rename tools.
scripts/            the checkers (check-old-names, check-copy, check-deadends, check-backlog,
                    check-credit-figures, check-dispositions, gate-check and others) and lib/ shims.
tests/              repository-level tests that cross app boundaries.
planning/           the plan, the handoff, the dev test set, the critic rubric, pricing and per-milestone proof.
research/           background notes and recorded runs. Records: do not rewrite.
tools/repo-chat/    a local read-only repo chat for the owner. Not a workspace member, not deployed.
```

Planned and not in the tree yet: packages/blocks (the block library, M4) and scripts/eval/run-piece.mjs (the
capture runner, M2). Do not describe them as existing.

### Present today, dropped by the plan

These are in the tree and in the tests now. The plan drops them, and handoff M3 removes the first three. **Do not
build on them, and do not re-add what M3 removes.**

| What | Where it lives today | Removed by | What stays |
|---|---|---|---|
| Vision | tools `look`, `inspect_visually`, `judge_game`; `blind-critique.ts`, `client-judge*.ts`, `world-pass.ts`, `world-steps.ts`; the `vision` role in `gateway.ts` | handoff 3.1 | `evidence-ledger.ts`, `claim-audit.ts`, `scene-flags.ts`, `audit_build`, `check_ui_layout`, `check_composition`, `play_check`, `play_check_ui` |
| The owner library | the `*_owner_*` tools, `owner-corpus.ts`, `local-owner-corpus.ts`, `owner-corpus-routes.ts`, the plugin ops `LocalOwnerCorpus` and `OwnerCorpus`, and a gateway on the owner's Mac at `127.0.0.1:63747` that exists nowhere else | handoff 3.2 | nothing |
| The whole-game path | `compose_game`, `plan_game`, `build_game`, `compose-tool.ts`, `compose-run.ts`, `composed-judge.ts` | handoff 3.3 | `packages/components/`, the geometry helpers in `compose-tycoon.ts` and `compose-plotsim.ts`, and `compose-lane.ts`, as source material for blocks |
| The old owner benchmark | `packages/evals/owner-bench/`, `owner-bench.ts` | plan section 10 drops it; no handoff step names its deletion | nothing; the new evaluation is the dev set and the blind critic (plan section 4) |

The agent today has 122 tools (92 offered at step 1, about 85k characters of schemas) and a 28.6k-character system
prompt (plan section 2). M3 cuts them to 25 tools or fewer and 10,000 characters or fewer, each guarded by a test.

### The shape the plan builds

Intake picks blocks from a menu (model call 1). Plan fills each block's typed parameters, validated by JSON Schema
(call 2). The harness runs each block's recipe through the existing plugin ops and checks every step, with at most
two re-runs. Custom Luau is written only where no block fits. The reply is assembled from the evidence ledger.

**The rule that replaces "the agent decides every step":** the system may execute a block the model selected in
this run. The system may never pick a block from request words. Blocks are keyed by structure (UI panel,
currency system, zone), never by subject (pizza, laundry); the subject-word scan on prompts, blocks and hints stays.

### Evaluation (built in M2)

The dev set is the 60 frozen requests in `planning/STUDPILOT-TEST-SET-DEV.md`; never edit one after seeing its score.
Each piece is scored by two fresh blind critics who see only the request and the screenshots, using
`planning/critic-rubric.md`. The pass rule is plan section 4.3. Report the real pass rate at every milestone and never
round it up. The owner holds a second, hidden set; never ask for it before M7 (owner action X8).

### Tests

Test files (`git ls-files <dir> | grep -E '\.(test|spec)\.(mjs|ts|js)$' | wc -l`): worker 411, web 222, evals 63,
site 51, root `tests/` 48, studpilot-plugin 24, corpus 20, sdk 11.

Totals, measured by `planning/proof/M0/SUMMARY.md` before the M1 rename: worker 5,419 (5,415 pass, 4 skipped), web
2,451, evals 1,479 (1,474 pass), site 311, corpus 286, sdk 89, plugin 79, root 630 (614 pass), all with 0 failures.
`packages/asset-library` fails 2 tests on the owner's Mac only, because its local media store is partial; CI has no
store and skips them. Re-run the suites rather than quoting this.

### Where the bytes are

`du -sh .claude node_modules packages docs .git apps`, on the owner's Mac: `.claude` 1.2 GB (`.claude/worktrees/`
is 1.2 GB of it), `node_modules` 1.2 GB, `packages` 4.7 GB (`training` 2.7 GB, `asset-library` 1.9 GB, mostly
pack images and local stores), `docs` 179 MB (`docs/evidence/` 139 MB), `.git` 318 MB, `apps` 173 MB. If you are
looking for something and finding gigabytes, you are in a training adapter, an asset store or a worktree.

---

## 4. The live system

**One Worker.** `studpilot` is production and serves `studpilot.app`. The former hosts (`apple` and `golem` on
workers.dev) are proxies until 2027-01-02: API calls pass through to `studpilot`, page loads get a 301. The static site and the SPA
live in D1 tables `static_assets` and `static_chunks` and are served by the worker; there is no CDN origin to deploy
to. Section 2.2 says what changes in step 1.3.

**Durable Objects**, one class each: `SessionDO` (one per project: WebSocket to the browser, long-poll queue for
the plugin, the agent run loop), `QuotaDO`, `BudgetDO`, `PairingDO`, `AdminDO` (analytics sink), `DiscordDO`. The
Workflow class is `ModelUploadWorkflow`. The former `golem` Worker's objects live on, with their storage, as
`ArchiveSessionDO`, `ArchiveQuotaDO`, `ArchivePairingDO`, `ArchiveAdminDO`, `ArchiveBudgetDO` and `ArchiveDiscordDO`
(`src/do/archive.ts`). Nothing serves them except `ArchiveQuotaDO`, the billing replica behind `LEGACY_QUOTA_DO`.

**Bindings:** `AI` (Workers AI through AI Gateway), `CORPUS` (D1), `KV`, `VEC` (Vectorize), `MEDIA` (R2: generated
images, generated audio and chat attachments, keyed `<kind>/<projectId>/<id>`, so a project's bytes are one
`list({ prefix })` from deletion). `MEDIA` is optional: `mediaStore()` answers `null` where it is unbound and the
caller keeps its KV path. Optional in `env.ts`: `PRODUCT_EVENTS` (Analytics Engine, product events with no person in
them), `NOTIFY_QUEUE` (notifications written by a queue consumer with retries), `MODEL_UPLOAD_WORKFLOW` (finishes a
slow 3D upload and tells the user) and `IMAGES` (display-sized WebP copies of generated images).

**Auth and data:** Supabase Postgres with RLS on every table. The worker forwards the caller's own JWT to
PostgREST, so **RLS is the thing deciding**, not the worker. `infra/supabase/tests/rls-isolation.mjs` proves tenants
cannot read each other, and it is the strongest evidence in the repo.

**Migrations are applied by hand.** `infra/supabase/migrations/` holds them; `infra/supabase/migrate.mjs` runs
them. Two once sat unapplied while the code that needed them shipped, and the dashboard showed loading skeletons
forever. **If a query 400s on a missing column, look here first.**

**Spend caps.** `apps/worker/src/pricing.ts` caps billable neurons at 150,000 a day and 2,270,000 a month (about
$1.65 and $24.97), restored in M0 and asserted by `apps/worker/tests/spend-caps.test.mjs`. The figures wait for the
owner's approval (X3). Workers AI spend for testing stays at or below $20 a month; read `/api/admin/spend` before
and after a test batch and log it to `planning/proof/ops/spend.md`.

**Deploy** only through `infra/deploy-worker.mjs studpilot` from a clean
tree, so `/api/health` reports a `buildSha` equal to the `main` HEAD with no `-dirty`.

---

## 5. The data

**The asset catalogue is gone, removed by the owner on 2026-09-20.** The harvest under `packages/corpus/data/`
held 510,014 rows from several free-asset sources; the directory, its pipelines, the `search_asset_library` tool and
the `/api/assets/*` routes were deleted. The reason was not size: every upload that pipeline could make was an Image
or a Decal, Roblox refuses to archive either, so each one was permanent in somebody's real account, and the
catalogue held rows named after other companies' properties under one blanket licence claim. The last measurement
(`docs/evidence/library-requires-ownership-2026-09-19.md`) put the number insertable by the product at **0 of
511,208**. Those rows were still in the live `CORPUS` database at the removal; this was not re-measured on
2026-10-04.

What to reach for instead: `find_verified_asset` (the Roblox Creator Store, live, verified per id), `insert_asset`
for an id the model found there or the user pasted, `generate_image` for a texture or icon drawn into the
customer's own account, `generate_model` for geometry in their own Studio session, and `create_instances` for
everything parts can build. The plan adds a curated pack of hand-checked Creator Store models (planned as
packages/blocks/assets/pack.json: ids plus measured sizes, no binaries) and uploads through Roblox OAuth (M4c).

`packages/asset-library` is a different thing: CC0 UI and icon packs for the agent and the site. An asset needs its
licence recorded. That provenance is the product's argument, so **never add an asset without one**.

**`packages/corpus/data/kit-pins.json`** records what Roblox's details endpoint said about the fifty audio ids the
genre kits pin, on a recorded date. `apps/worker/tests/genre-kit-pins.test.mjs` checks every pin against it.
Regenerate with `node scripts/probe-kit-pins.mjs`.

**`packages/corpus/data/chunks.jsonl`** is the Roblox creator-docs corpus, the RAG source behind `search_docs`. It is
a build output of `packages/corpus` (`pnpm --filter @studpilot/corpus chunk` writes it from `raw/`), it is not in
git, and a fresh clone has none. **This is the current API.** Do not answer Roblox questions from memory; the
model's training data is older than the platform.

**`packages/corpus/raw/`** holds harvested community Luau projects (ProfileService, Knit, Fusion and others). Only
its manifests are tracked; `pnpm --filter @studpilot/corpus bootstrap` re-fetches the checkouts at pinned commits.
Read-only reference. **Their code is not ours**: a scanner that reports findings in here is scoped wrongly. The
plan keeps the 519 creator skills in `packages/corpus` as reference for block authors and stops pushing them into
every agent step (M3).

**`docs/evidence/`** (139 MB) holds recorded product runs and proofs. When a claim needs proof that something
really happened, it is here. It is a record: do not rewrite it.

---

## 6. The documents that matter, and when

Read these in this order.

| Read | When |
|---|---|
| `GOAL.md`, `planning/STUDPILOT-FINAL-PLAN.md`, `planning/STUDPILOT-HANDOFF.md` | **before anything: they say what to build and in what order** |
| `.claude/skills/rbxai-working-rules/SKILL.md` | **before your first edit, always** |
| `planning/proof/<milestone>/` (`SUMMARY.md`, `LOG.md`, `PLAN.md`) | to see what a milestone measured and what it left open |
| `planning/rename-inventory.md` | before touching a name (section 2) |
| `planning/STUDPILOT-TEST-SET-DEV.md`, `planning/critic-rubric.md` | before running or scoring an evaluation |
| `docs/playbook/` | you want the worked example behind a rule |
| `docs/FAILURES.md` | before repeating an experiment. About 2,100 lines, newest first. F-58 first. |
| `docs/DECISIONS.md` | before changing architecture. ADR-017 is why the Creator Store is the install path. |
| `docs/PLUGIN-RELEASE.md` | before anything about publishing the plugin (a human step; owner decision X7) |
| `docs/operations/GOLEM-REMOVAL-RUNBOOK.md` | history of the earlier golem-to-apple rename, and what it left in the cloud |
| `docs/SECURITY.md`, `docs/MONITORING.md` | trust boundaries; Sentry |
| `docs/THINKING-UX.md` | the run surface. `docs/VISUAL-LOOP.md` describes the vision loop that M3 removes. |
| `docs/COST-MODEL.md` | the credit model before M5, which replaces it with `planning/pricing-2026-10-04.md` |
| `GATES.md`, `docs/backlog/CHECKLIST-V2.md`, `docs/BLOCKERS.md` | older ledgers. CI still lints the shape of `GATES.md`. The plan's milestone acceptance tests, not these, say what is done now. |

Where an older document and the plan disagree, the plan and the handoff win. The plan itself says to trust the code
over its own background sections (`planning/sections/`).

---

## 7. What will bite you

**The shared checkout.** Several agents may edit one tree. `git commit` writes the whole **index**, so staging
explicit paths does not protect you: use `git commit -F <msg> -- <pathspec>` and read `git diff --cached --stat`
first. Never `git add -A`, `git add -u`, `checkout`, `switch`, `stash` or `reset`. Never `pnpm install` inside an
in-repo worktree (F-68: it rewrites the main checkout's workspace symlinks). Never `cp` a whole-file backup over a
source file: a peer may edit it in between. One agent per branch. Codex is paused (owner action X1); leave its
`.codex/` files alone. If you see recent commits from another agent on your branch, stop and write `STALLED.md`.

**Never upload to the owner's Roblox account.** 299 assets were once uploaded without permission and Roblox
refuses to delete Images and Decals. They are permanent. Uploads through the user's own Roblox OAuth connection (M4c)
are the user's, not the owner's, and only with that connection.

**Never print, commit or paste a secret.** The repo is public. `.env` and `apps/worker/.dev.vars` are untracked,
mode 600, and stay that way. Read secrets only through the loaders in `infra/`. `scripts/secret-scan.py` is the
scanner.

**CI must never call a paid provider.** Anything that spends is opt-in and skipped by default.

**Tests that pin source text will break on refactors.** The handoff counts about 111 such worker test files (ground
rule 8). Rewrite them to assert the property, never the text, and never weaken one to get green. If a test went red
because the code got worse, fix the code. See F-58 and `docs/playbook/GUARDS.md`.

**A failure to observe must not render as an observation.** Say what you measured separately from what you infer.
Never report a test as passing that you did not just run.

**Do not rename** D1, KV, Vectorize or Durable Object bindings, or the stored identifiers and wire literals in
section 2. Their resources change in step 1.3, not their names in code.

**Look up library APIs rather than recalling them.** Use Context7. Two earlier defects came from writing an API from
memory: a Stripe field that does not exist on that object, and a Cloudflare method that exists and does nothing.

---

## 8. Ten minutes to orientation

```bash
cat GOAL.md                                    # points at the plan
ls planning/proof                              # one folder per milestone
git log --oneline -20                          # commit subjects here say what was FOUND
node --test tests/*.test.mjs                   # the cross-cutting suite
curl -s https://studpilot.app/api/health       # what is really running: buildSha and the legacy-spelling counters
```

Then open the product. Every finding worth having came from looking at the deployed page or a real Studio place,
not from reading the source.

**Commit messages here are the real changelog.** They state what was believed, what was true, and how it was
caught. `git log` is faster than any document in `docs/`.
