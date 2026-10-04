# 12. Repository map, operations and tooling

*Written 2026-10-04 by a read-only survey of `/Users/moshe/Developer/RbxAI` (the "main checkout"), its sibling clones, `~/.claude`, and the live health endpoints. Every fact carries a path or the command that produced it. Where a fact is my inference rather than something I observed, it says "inferred". No secret values appear anywhere in this section; environment variables are named, never quoted.*

**How to read this section.** Part 12.1 is the map of the tree. Part 12.2 is the true state of branches and the many checkouts (this is where the repo is most misleading). Part 12.3 is how the product is deployed and operated. Part 12.4 is the owner's Claude Code tooling. Part 12.5 is hazards and housekeeping debt. Part 12.6 lists open questions for the planners.

## 12.0 Headline findings (read these first)

| # | Finding | Evidence |
|---|---|---|
| 1 | **There is no single repo.** The "repo" is one main checkout plus 15 sibling directories under `~/Developer/`, in three separate `.git` object stores. The newest code lives in a sibling, not in the main checkout. | `ls /Users/moshe/Developer`; `git rev-parse --git-common-dir` in each (12.2.1) |
| 2 | **What is deployed to production is not on GitHub.** `/api/health` reports `buildSha: 2ffd22db-dirty`. Commit `2ffd22db` (branch `research-feed`, also called `fix-r3` in that store) is in no GitHub ref. GitHub `main` is `f8991a96`, 158+ commits behind it. | `curl https://apple.moshe-barami111.workers.dev/api/health`; `git ls-remote origin` (12.2.3) |
| 3 | **The Phase R research itself is committed nowhere.** `GOAL.md`, `research/` (23 notes, about 2 MB) and `planning/` are untracked files in the main checkout. They are in no commit, no branch, no GitHub ref. Only the *distilled output* (corpus, skills, prompt) is committed on `research-feed`. | `git status --short`; `git log --all -- research` is empty; `git -C /Users/moshe/Developer/RbxAI-feed ls-files research` is empty |
| 4 | **The 2026-10-04 handoff kit is git-ignored.** `docs/handoff/2026-10-04/` (restore prompts for the four parked branches, `design-language-v4.md`, `frontier-issues.md`) exists only on disk, because `.gitignore:250` (`handoff/`) matches it. The 2026-10-02 sibling folder was force-added and is tracked. | `git check-ignore -v docs/handoff/2026-10-04/design-language-v4.md`; `git ls-files docs/handoff` |
| 5 | **`AGENTS.md` and `CLAUDE.md` are substantially stale** on sizes, versions, names and counts (table in 12.1.9). Both were edited today (uncommitted) only in their first lines, to point at `GOAL.md`. | `git diff AGENTS.md CLAUDE.md` |
| 6 | **The GitHub repo is PUBLIC**, while the owner's memory says "private repo ... keep it private". | `gh repo view --json visibility` returned `"PUBLIC"`; `~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/golem-github-remote.md` |
| 7 | **The repo's own `.env`-read protections were removed in the owner's uncommitted edit** of `.claude/settings.json` (the `deny` list is now empty), while `.env` is world-readable and holds broad-scope tokens (names in 12.5). | `git diff .claude/settings.json`; `stat -f "%Sp" .env` |
| 8 | **The rename "golem to apple" is already done in the working lineage** (packages are `@apple/*`, 12 "golem" hits left in worker source versus 120 on `main`), but `main`, `AGENTS.md`, `CLAUDE.md`, CI filters and the README still describe the old world. The owner's standing consent of 2026-10-02 overrides the "never rename" rule. | `grep -h '"name"' package.json apps/*/package.json` in `RbxAI-feed`; `owner-standing-consent-2026-10-02.md` |
| 9 | Disk: the main checkout is **13 GB**, of which `.claude/worktrees/` is 5.1 GB; the sibling checkouts add roughly 16 GB, mostly duplicated `node_modules`. | `du -sh .` and `du -sh` per directory |
| 10 | Production is healthy: `/api/health` answers `ok:true`; the legacy `golem` worker still answers and still serves `/api/*` while page routes 308 to `apple`. CI on GitHub `main` is green. | `curl` (12.3.1); `gh run list` (12.3.8) |

---

## 12.1 A guided map of the whole repo

### 12.1.1 Which checkout holds what

Measured with `git worktree list` (in the main checkout and in `RbxAI-rename`), `git rev-parse --abbrev-ref HEAD`, `git log --oneline -1`, `du -sh`, `git status --short | wc -l` per directory.

| Directory | Own `.git`? | Branch / HEAD | Size | Role | Dirty files |
|---|---|---|---:|---|---:|
| `/Users/moshe/Developer/RbxAI` | yes (330 MB; worktree host) | `main` @ `f8991a96` | 13 G | **Main checkout.** Tracks `origin/main` on GitHub. Holds `GOAL.md`, `research/`, `planning/` (untracked). | 9 entries |
| `/Users/moshe/Developer/RbxAI-feed` | worktree of `RbxAI-rename/.git` | `research-feed` @ `2ffd22db` | 1.2 G | **The most current code; what is deployed** (health `buildSha` prefix matches). Plugin source is 1.5.0 here. | 0 |
| `/Users/moshe/Developer/RbxAI-fix-r3` | worktree of `RbxAI-rename/.git` | `fix-r3` @ `2ffd22db` | 1.2 G | Same commit as `research-feed`. The finished form of "round 3" (the main repo's `handoff/fix-r3` at `3a32d523` is its WIP sibling). | 0 |
| `/Users/moshe/Developer/RbxAI-ci` | yes (own `.git`, `origin` is the main checkout's path) | detached HEAD (FETCH_HEAD) @ `2ffd22db` | 1.6 G | **The local CI / deploy / bench clone.** 15 untracked bench result files make the tree "dirty", which is why health says `-dirty` (inferred: the deploy was run from here). Scripts in `docs/handoff/2026-10-04/scripts/` `cd` into it. | 15 untracked |
| `/Users/moshe/Developer/RbxAI-rename` | yes (primary store for the siblings below) | `fixes-0410` @ `80565282` | 1.6 G | Home of the golem-to-apple rename and the worker "fixes" line. Its `origin` and `src` remotes are the main checkout's path. | 0 |
| `/Users/moshe/Developer/RbxAI-fix-agent`, `-fix-assets`, `-fix-r2`, `-fix-ui` | worktrees of `RbxAI-rename/.git` | `fix-agent` @ `eb7bbbdb`, `fix-assets` @ `ae6f7c36`, `fix-r2` @ `42697f17`, `fix-ui` @ `b3b86133` | 1.2 G each | Earlier fix rounds. All four are ancestors of `research-feed` (`git merge-base --is-ancestor`). Finished, now redundant. | 0 |
| `/Users/moshe/Developer/RbxAI-site-v4` | worktree of `RbxAI-rename/.git` | `site-v4` @ `6782c88a` | 1.2 G | Parked website redesign (Astro), WIP snapshot, not tested. Not an ancestor of `research-feed`. | 0 |
| `/Users/moshe/Developer/RbxAI-web-v4` | worktree of `RbxAI-rename/.git` | `web-v4` @ `5d167867` | 1.3 G | Parked app redesign (React), WIP snapshot, not tested. | 0 |
| `/Users/moshe/Developer/RbxAI-reorg` | yes (own `.git`) | `repo-reorg` @ `3faec570` | 1.5 G | Parked repository reorganisation clone (WIP, "NOT tested"). | 0 |
| `/Users/moshe/Developer/RbxAI-search` | yes (own `.git`) | `search-90` @ `e57f63d9` | 628 M | Parked owner-library search work (76% to 90% top-3 target). | 0 |
| `/Users/moshe/Developer/RbxAI-integration` | worktree of main's `.git` | `integration/giant` @ `25955635` | 399 M | The integration branch (99 commits ahead of `main`). One untracked `node_modules`. | 1 |
| `/Users/moshe/Developer/RbxAI-caps` | worktree of main's `.git` | `integration/caps` @ `5174017b` | 331 M | Earlier integration of the capability tracks; ends with a revert of "Ember Rail" (owner rejected that design direction). | 0 |
| `/Users/moshe/Developer/RbxAI-design2` | worktree of main's `.git` | `design/round-2` @ `f0ab5be6` | 403 M | WIP "website round 2 (stopped mid-work, NOT verified)". | 5 untracked |
| `/Users/moshe/Developer/apple-objects.git` | bare repo | tip `9ababa90` "keep the private owner library and training runs out of the public repo" | 271 M | Purpose not documented anywhere I found. Looks like an object store from a history-filtering step. Inferred, unverified. | n/a |
| `/Users/moshe/Developer/iCloud-Recovered` | n/a | n/a | not measured | Not examined; not part of the product repo. | n/a |

Two worktree records in the main checkout are dead: `/private/tmp/claude-501/-Users-moshe-Desktop-RbxAI/22eb5619-.../scratchpad/wt` and `/private/tmp/claude-501/deploy-wt`. `git worktree list` marks both `prunable`; the second path no longer exists on disk.

### 12.1.2 Top level of the main checkout

`git ls-files | wc -l` is **11,065** tracked files. Per top-level folder (`git ls-files | awk -F/ '{print $1}' | sort | uniq -c`): `packages` 7,722, `apps` 1,722, `docs` 1,106, `scripts` 283, `tools` 118, `tests` 48, `infra` 34, everything else under 5 each. Sizes from `du -sh`.

| Path | Size | Tracked? | What it is | Status |
|---|---:|---|---|---|
| `GOAL.md` | 3 KB | **untracked** | The only active goal (set 2026-10-04): research then feed the agent, no benchmark loops, then Phase T real games. | **ACTIVE** |
| `research/` | 6.6 M | **untracked** | Phase R research: 23 notes, `BRIEF.md`, `PIPELINE.md`, `PHASE-T.md`, `phase-t/`, `phase-t-v1.json`, two helper scripts. See 12.1.8. | **ACTIVE** |
| `planning/` | 24 K | **untracked** | This dossier's `sections/` (sections 02 and 15 exist alongside this one). | ACTIVE |
| `apps/` | 171 M | yes | Seven application folders (12.1.3). | mixed |
| `packages/` | 4.7 G | yes (7,722 files) | Libraries, corpora, training archive (12.1.4). | mixed |
| `docs/` | 179 M | yes | 67 top-level entries; 139 MB is `docs/evidence/` (12.1.5). | mostly history |
| `scripts/` | 4.7 M | yes | 79 entries, 24 `check-*.mjs` guards (12.1.6). | LIVE |
| `infra/` | 384 K | yes | Deploy, health, smoke, Supabase migrations (12.3). | LIVE |
| `tests/` | 732 K | yes | 47 cross-app test files plus `e2e/` and `fixtures/` (12.1.6). | LIVE |
| `tools/repo-chat/` | 1.4 G (mostly `node_modules`) | yes (118 files) | Local read-only AI chat about the repo (12.4.5). | LIVE (dev tool) |
| `supabase/` | 8 K | 2 files | Only `.temp/linked-project.json` and `cli-latest` (Supabase CLI link). | minor |
| `.github/` | 52 K | 2 workflows on `main` | `ci.yml`, `plugin-release.yml`. More on `research-feed` (12.3.8). | LIVE |
| `.claude/` | **5.1 G** | 4 files tracked + `skills/` | Project settings, launch config, the working-rules skill; `worktrees/` (5.1 GB) is git-ignored. | mixed |
| `.agents/`, `.codex/`, `.design-sync/` | tiny | yes | Codex skills (`apple-os`, `apple-owner-autonomy`, `rbxai-working-rules`), Codex config (`hooks.json` is now empty), Claude-Design link config. | minor |
| `.mcp.json` | 172 B | yes | One MCP server: `@playwright/mcp@latest`. | minor |
| `FINISH-THE-PRODUCT.md`, `GATES.md`, `WORKLIST.md` (and ignored `WORKLIST.log`), `CHANGELOG.md` | 52 KB, 65 KB, 41 KB, 3 KB | yes | The September "finish the product" ledgers. Superseded by `GOAL.md`. | **HISTORY** |
| `README.md` | 2.5 KB | yes | **Stale**: names `golem.moshe-barami111.workers.dev` as the live URL and describes gpt-oss-120b / Qwen3-30B as the models. | STALE |
| `AGENTS.md`, `CLAUDE.md` | 14 KB, 7 KB | yes (modified today) | The agent maps (12.1.9). | LIVE but stale in places |
| `HANDOFF.md` | n/a | tracked, **deleted in the working tree** | The 2026-10-02 evening handoff; recoverable via `git show HEAD:HANDOFF.md`. | HISTORY |
| `.env`, `.env.release-apple-20260918.json`, `.env.release-golem-20260918.json`, `.env.sentry-release-20260918` | 3 KB, 205 B x2, 399 B | ignored | Secrets (12.5.6). | SECRET |
| `.backups/supabase-2026-09-23T17-58-45-633Z/` | 124 K | ignored | A JSON export of 15 Supabase tables, including `profiles.json` and `projects.json` (user data) and `membership_outbox_secret.json`. | SENSITIVE |
| `node_modules/` | 1.2 G | ignored | pnpm workspace root. | build |
| `graphify-out/`, `handoff/`, `youtube-mcp/`, `claude-autonomy-research-pack/` | 16 M, 5.8 M, 8 K, 116 K | mostly ignored | One-off analysis dumps: a code graph of 2026-09-14, zero-inbound-reference file lists (`handoff/zero-inbound-files.tsv`, 325 lines), a graphify report, a synthesized "autonomy research pack". Dead-code analysis input, not product. | DEAD/ARCHIVE |
| `.playwright-mcp/`, `.tmp-*.png/.b64` (14 files), `test-results/`, `evidence/` (empty), `orgsweep.tsv`, `.DS_Store` | 5.6 M plus small | ignored | Screenshot and log litter from 2026-09-22 Studio UI work. | LITTER |
| `.workbuddy-ai/memory/` | 28 K | ignored | A single 2026-09-22 note from another tool. | LITTER |
| `playwright.config.ts`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json` | | yes | Workspace root. `package.json` still names the root package `golem` and pins `pnpm@11.13.0`; `pnpm-workspace.yaml` excludes `packages/training` and lists overrides for four Dependabot-pinned transitive deps. | LIVE |

### 12.1.3 The seven apps

Sizes are `du -sh` (including ignored `node_modules`/`dist`); file counts are `git ls-files`.

| App | Size | Tracked | What it is | Status |
|---|---:|---:|---|---|
| `apps/worker` | 12 M | 602 | **The whole backend.** Hono router `src/index.ts` (7,398 lines), `src/tools.ts` (5,945 lines, the agent tool registry), `src/prompts.ts` (568), `src/do/session.ts` (7,482, the per-project Durable Object and agent loop). 226 tracked files under `src/`, 7 Durable Object files in `src/do/` (`admin`, `budget`, `collab-store`, `discord`, `pairing`, `quota`, `session`). 358 test files in `tests/` (410 on `research-feed`). Two wrangler configs: `wrangler.jsonc` (worker `golem`) and `wrangler.apple.jsonc` (worker `apple`). | **LIVE** |
| `apps/web` | 139 M (87 M `node_modules`, 27 M `dist`) | 733 | React + Vite SPA served at `/app`. 221 test files. Env: `apps/web/.env.local` holds `VITE_SENTRY_DSN` only. | **LIVE** |
| `apps/site` | 8.6 M | 229 | Astro marketing site and docs, served at `/`. Built into `apps/site/dist` then uploaded to D1. | **LIVE** |
| `apps/apple-plugin` | 2.4 M | 72 | **The Studio plugin customers install.** `src/`: `Bridge.luau` (864 lines), `Commands.luau` (5,404, holds the class/property allowlists), `GenerationService.luau`, `PlayCheck.luau`, `Render.luau`, `StudioCapture.luau`, `init.server.luau`, plus `src/ops/*.luau` (Compose, Content, Fx, Joints, LocalOwnerCorpus, OwnerCorpus, Physics, Query, Rig, Surface and more). Version `PLUGIN_VERSION` is **1.4.3 on `main`**, 1.4.3 on `integration/giant`, **1.5.0 on `research-feed`**. | **LIVE** |
| `apps/plugin` | 8.2 M | 31 | **LEGACY, test fixtures only.** Not built, not shipped, not installable. Its README says ~16 test files elsewhere read its source. Its Creator Store asset 132128477945417 ("Golem") was removed and returns 404; never publish to it. | LEGACY |
| `apps/benchmark/crystal-canyon` | 988 K | 49 | An old model-comparison harness (`ARCHITECTURE.md`, `src/`, `evidence/`). | DEAD-ish (workspace member, `pnpm-workspace.yaml` lists `apps/benchmark/*`) |
| `apps/experiences/lumen-isles` | 88 K | 6 | A sample Roblox experience scaffold built by `scripts/build-lumen-isles.mjs`. | ARCHIVE |

### 12.1.4 The packages

| Package | Size | Tracked | What it is | Status |
|---|---:|---:|---|---|
| `packages/shared` | 200 K | 7 | The wire contract between worker, web and plugin: types, mode tables, plan limits. Tool phases and permission labels live in `src/index.ts`; `STUDIO_PLUGIN_ASSET_ID` and `STUDIO_PLUGIN_STORE_LIVE` also live here. Named `@golem/shared` on `main`, `@apple/shared` on `research-feed`. | **LIVE** |
| `packages/corpus` | 13 M | 93 | The knowledge base feeding `search_docs` and the skill cards. `data/` (12 MB): `content.json`, `chunks-witness.json`, `skill-cards.json`, `genre-references.json`, `kit-pins.json`, `need-index.json`, `verified-modules.json`, `ui-construction.json`, `mechanic-library.json` and others. `raw/` is now only 68 K (`AGENTS.md` still says 316 M and 41 repos). | **LIVE** |
| `packages/evals` | 11 M | 321 | Eval and security suites; `owner-bench/` (frozen 30-request bank, `runner.js`, `score.mjs`, `review.mjs`, `BASELINE.md`, `results/`); `tasks-visual/`; `frontier-studio/`. The benchmark loop is retired by `GOAL.md` but the harness remains and CI runs its tests. | LIVE (loop retired) |
| `packages/components` | 352 K | 46 | Luau building blocks (`animate`, `boot`, `creatures`, `defenders`, `economy`, `fx`, `gameui`, `machines`, `motion`, `shop`, `tycoon`, `upgrades`, `waves`) that `node scripts/gen-components.mjs` turns into `apps/worker/src/components.generated.ts`. | **LIVE** |
| `packages/sdk` | 404 K | 38 | Public `/v1` API clients (JS, Python, Luau, CLI). | LIVE (secondary) |
| `packages/design` | 304 K | 11 | Roblox design-rule tokens. Not a UI library (per `.design-sync/config.json` note). | minor |
| `packages/langflow` | 368 K | 15 | Offline flows for the owner's local Langflow app (`127.0.0.1:7860`). Nothing in the worker calls them. | ARCHIVE |
| `packages/asset-library` | **1.9 G** | **6,876** | An asset manifest and store: `packs` (5,838 tracked files), `sfx` (774), `vfx` (222), `models`, `ui-store`, plus `models-store` (768 M), `sfx-store` (529 M), `vfx-store` (289 M), `review` (233 M), mostly git-ignored. **Not mentioned in `AGENTS.md`**, which says the asset library was deleted on 2026-09-20 (that was a different, 510,014-row harvest). | LIVE data (unclear consumer) |
| `packages/training` | **2.7 G** | 315 | LoRA/MLX training archive: `adapters` 1.3 G (ignored), `data` 593 M, `runs` 315 M, ~30 `lora-apple-vN.yaml` configs. LoRA was cancelled (V3 section 2); `OWNER_DISABLED.json` exists; excluded from the pnpm workspace. | **ARCHIVE/DEAD** |
| `packages/owner-corpus` | 3.6 M | **0 (ignored by `.gitignore:296`)** | The owner's Roblox library tooling: `gateway.py` (the local gateway), `archive_decoder.py`, `corpus.py`, `library_*.py`, `start-gateway.sh`, many `*.md` designs. Exists only in this checkout. | LIVE, local-only |
| `packages/owner-classify` | not in main | tracked on `research-feed` (19 files) | Phase 2 classification and semantic search over the owner library (`classify.py`, `index.py`, `embed.py`, `eval50.py`). Writes only to `~/Library/Application Support/Apple/owner-classify/`. | LIVE on feed, parked improvements on `search-90` |

### 12.1.5 The `docs/` tree, organised for a planner

`docs/` holds 67 top-level entries (1,106 tracked files; `docs/evidence/` is 139 MB across 371 entries). `GOAL.md` is the only active goal; **`docs/autonomy/` is history** (V3 scope, `ACCEPTANCE.json` gates G01 to G16, retired 2026-10-04 by `GOAL.md`; 4.0 M, with `v3/`, `archive/`, `evidence/`).

**The 20 most useful documents for a planner** (line counts from `wc -l`, dates from `git log -1 --format=%ad`; untracked files have no git date):

| # | Path | Lines | Why a planner needs it | Standing |
|---|---|---:|---|---|
| 1 | `GOAL.md` | 49 | The active goal, Phase R then Phase T, exit criteria, parked work. | **ACTIVE** (untracked) |
| 2 | `research/roblox/BRIEF.md` | ~100 | Coverage map of research topics, source-trust order, file format. | ACTIVE (untracked) |
| 3 | `research/roblox/PIPELINE.md` | ~50 | How knowledge reaches the agent: channel, storage, search, budget per channel (search_docs, skill cards, creator skills, prompt, genre references). | ACTIVE |
| 4 | `research/roblox/PHASE-T.md` and `phase-t/MODEL-COMPARISON.md`, `phase-t/t1-round1..4/{critique,causes}.md` | | The five target games, the 24-point quality bar, blind-critic results (game 1 scored 2, 1.5, 1.5 out of 10), the cancelled build-model comparison. | ACTIVE |
| 5 | `AGENTS.md` | 247 | The repo map (stale in places; corrected in 12.1.9). | LIVE, stale |
| 6 | `CLAUDE.md` | 93 | Commands, architecture in one screen, the Karpathy principles, the recap rule. | LIVE |
| 7 | `.claude/skills/rbxai-working-rules/SKILL.md` | 217 | The working method; the one idea "a failure to observe must not render as an observation". Its START HERE banner still points at `docs/autonomy/` (stale). | LIVE (banner stale) |
| 8 | `docs/DECISIONS.md` | 717 (2026-09-21) | ADRs. Read before changing architecture. | LIVE |
| 9 | `docs/FAILURES.md` | 2,131 (2026-09-21) | Experiments that failed, newest first. Read before repeating one. | LIVE |
| 10 | `docs/COST-MODEL.md` | 352 (2026-10-01) | Where every Credit figure on the site derives from. | LIVE |
| 11 | `docs/PLUGIN-RELEASE.md` | 298 (2026-09-28) | The Creator Store runbook and why publishing cannot be automated. Version facts inside are stale (says source 1.1.0). | LIVE, stale numbers |
| 12 | `docs/GO-LIVE.md` | 373 (2026-09-21) | Payments, Sentry, Discord, Stripe wiring: what is dark and what lights it. | LIVE |
| 13 | `docs/SECURITY.md`, `docs/MONITORING.md` | 54, 98 | Trust boundaries; Sentry setup. | LIVE |
| 14 | `docs/handoff/2026-10-04/` (`frontier-issues.md`, `design-language-v4.md`, `agent-prompts/*.md`, `scripts/*`, `work/traces/*`) | 30, 84 | Open framework bugs from the 2026-10-04 benchmark and the restore prompts for the four parked branches. **Git-ignored, disk only.** | ACTIVE for parked work |
| 15 | `docs/operations/GOLEM-REMOVAL-RUNBOOK.md`, `docs/operations/GITHUB.md` | | Cloud-side rename plan ("NOTHING IN THIS FILE HAS BEEN EXECUTED" at writing) and GitHub rulesets/packages plan. **Exist on `research-feed`/`integration/giant`, not on `main`.** | LIVE (unexecuted plans) |
| 16 | `packages/owner-corpus/README.md`, `gateway-README.md`; `packages/owner-classify/README.md` | | The owner-library gateway contract and classification pipeline. | LIVE |
| 17 | `packages/evals/owner-bench/README.md`, `BASELINE.md` | | The frozen 30-request bank and its baseline; retired as a loop but still the only measured baseline. | LIVE as reference |
| 18 | `docs/THINKING-UX.md`, `docs/VISUAL-LOOP.md` | 332, 161 | The run surface and the visual gate. | LIVE |
| 19 | `docs/frontier-for-roblox.md`, `docs/research/model-pricing.md`, `docs/research/competitors.md`, `docs/research/roblox-plugin-caps.md` | 913, 301, 165, 193 | Competitive, pricing and plugin-capability background (2026-08-30 to 09-28). Dated; verify before use. | background |
| 20 | `docs/CLOUDFLARE-SURFACE.md`, `docs/SCALE-V2.md` | 70, 650 | Which Cloudflare products are used and the scale plan. | background |

**Historical or superseded** (do not treat as current direction): `docs/autonomy/**`; `GATES.md` (44 gates, falsification records); `docs/backlog/CHECKLIST-V2.md` (3,536 lines, "list of record" until 2026-09-16) and the rest of `docs/backlog/` (including `CI-IS-BLOCKED-ON-GITHUB-BILLING-2026-09-21.md`, an incident that is now over); `FINISH-THE-PRODUCT.md`; `WORKLIST.md`; `docs/MISSION-PROMPT.md`, `MISSION-LEDGER.md`, `PASS-LOG.md`, `PASS-STATE.md`, `FINISH-REPORT*.md`, `CHECKPOINT*.md`; `docs/sgsd/` (archived orchestrator); `docs/training/` and `docs/audit/TRAINING-V1-REPORT.md` (LoRA, cancelled); `docs/apple-os/`; `docs/superpowers/plans/`; `docs/handoff/2026-10-02/` (workflow scripts and results of the 13 `wf_*` workflows, mapped in 12.2.4); `docs/releases/v0.1.0.md`, `v0.2.0.md`.

**The evidence folder.** `docs/evidence/` (371 entries, 139 MB) is recorded product runs; when a claim needs proof something happened, it is here. `docs/gauntlet/` (29 MB) holds the blind-critic and visual-gauntlet docs (`gauntlet/visual/BLIND_CRITIC.md`, `GAUNTLET.md`).

### 12.1.6 Scripts, infra, tests, tools, `.github`

**`scripts/`** (79 entries, 4.7 M). Grouped:

| Group | Files | Used by |
|---|---|---|
| Guards run in CI (24 `check-*.mjs`) | `check-app-bundle`, `check-asset-wall`, `check-backlog`, `check-ci-references`, `check-committed-imports`, `check-copy`, `check-credit-figures`, `check-deadends`, `check-dispositions`, `check-escape-hatches`, `check-landing-budget`, `check-module-resolution`, `check-offer`, `check-pixels`, `check-proof-figures`, `check-rebrand`, `check-resolution`, `check-schema-drift`, `check-site-links`, `check-site-semantics`, `check-template-freshness`, `check-unstyled-classes`, `check-workspace-coverage`, `check-api-base` | `.github/workflows/ci.yml` "Build site and web", "Static checks" jobs |
| Secrets | `secret-scan.py` (scans every blob on every ref; allowlist in `known-exposures.json`, fixtures in `known-fixtures.json`), `test_secret_scan.py` | CI "Secrets and dependencies" |
| Gates (September ledger) | `gate-check.mjs`, `gate-suite.mjs`, `gate-typecheck.mjs`, `assert-tests.mjs`, `autonomy-gate.sh`, `autonomy-review-gate.py`, `autonomy-supervisor.py`, `autonomy/` | Historical (V3 era) |
| Build and generation | `gen-components.mjs`, `make-brand-assets.mjs`, `build-*.mjs` (lumen isles, UI construction, verified modules, embeddings, chunk witness), `rebuild-ui-embeddings-local.mjs` | corpus and plugin proofs |
| Corpus and harvest | `harvest-hf.mjs`, `harvest-roblox-knowledge.mjs`, `harvest-templates.mjs`, `curate-templates.mjs`, `ingest-owner-corpus.mjs`, `prepare-owner-components.py`, `probe-kit-pins.mjs`, `probe-s1.mjs` | owner/corpus pipelines |
| Operations | `release.mjs`, `ci-parity.mjs`, `critical-flows.mjs`, `clean-test-tmp.mjs` (pretest plus hourly LaunchAgent), `land-worktrees.mjs`, `verify-worktree.mjs`, `prepare-supabase-rollout-2026-09-18.mjs` | |
| Owner dashboard | `owner-dashboard/` (`server.mjs`, `collect.mjs`, `index.html`, `games.py`, `limits.json`) launched on port 4777 by `.claude/launch.json` | local only |
| Apple OS | `apple-os/` (voice, kokoro, whisper, vault, routing CLI) | local only |
| Luau engine proofs | `run-apple-*-engine-proof.luau`, `open-lumen-authoring.luau` | plugin proof builds |

**`infra/`** (384 K, 34 tracked files): `deploy-worker.mjs`, `deploy-static.mjs`, `deploy-showcase.mjs`, `rollback-static.mjs`, `capture-rollback.mjs`, `healthcheck.mjs`, `smoke.mjs`, `e2e.mjs`, `loadtest.mjs`, `real-chat.mjs`, `pair-helper.mjs`, `checkpoint-test.mjs`, `store-validation.mjs`, `provision-outbox-token.mjs`, `discord-server.mjs`, and `supabase/` (`migrate.mjs`, `migrations/0001` to `0013`, five tests in `tests/` including `rls-isolation.mjs`).

**`tests/`** (47 files plus `e2e/`, `fixtures/`): cross-app tests such as `check-*.test.mjs` (one per guard), `rebrand-enforced`, `release-rules`, `rollback-rules`, `migration-runner`, `genre-references`, `promises-match-the-product`, `model-claims-are-measured`, `workspace-coverage`, `tree-fingerprint`, `known-issues`, `autonomy-*`.

**`tools/repo-chat/`**: see 12.4.5.

**`.github/`**: `workflows/ci.yml` (439 lines), `workflows/plugin-release.yml` (345). On `research-feed`/`integration/giant`: also `dependabot.yml`, `CODEOWNERS`, `pull_request_template.md`, `ISSUE_TEMPLATE/*`, `rulesets/main.json`, `workflows/publish-packages.yml` (`git -C RbxAI-feed ls-files .github`). Per `docs/operations/GITHUB.md`, none of that has been applied to GitHub.

### 12.1.7 `research/` and `planning/` (the active workspace)

`research/roblox/` (6.6 M): 23 topic notes named in `BRIEF.md`'s coverage map (total 1,986,877 bytes; largest `20-systems-cookbook.md` 152 KB, `03-genre-design.md` 122 KB, `15-defense`, `16-horror`, `17-pvp` about 105 KB each).

| Notes | Topic family |
|---|---|
| `01-viral-hits`, `02-discovery-growth`, `03-genre-design` | what makes hits and how games are discovered |
| `04-luau-architecture`, `20-systems-cookbook` | code architecture and reusable systems |
| `05-world-visuals`, `19-visual-study-top-games`, `21-building-craft` | world, art and building craft |
| `06-ui-ux`, `07-anim-audio-vfx` | UI, animation, audio, VFX |
| `08-monetization-policy`, `09-tools-ecosystem`, `11-rdc-2026-and-roadmap` | monetisation and policy, tools, platform direction |
| `10-from-scratch-playbook`, `22-player-psychology-audience`, `23-asset-and-audio-sourcing` | playbook, audience, sourcing |
| `12` to `18` genre notes | simulator, tycoon, obby, defense, horror, PvP, social/roleplay |

Also: `PIPELINE.md` (channels by which knowledge reaches the agent; plan for feeding Phase R; capability gaps found, such as the plugin allowlist lacking the new Audio API, Animator and Explosion), `PHASE-T.md` (five games and the 24-point bar), `phase-t/` (rounds 1 to 4 of game 1, `MODEL-COMPARISON.md`, validation logs), `phase-t-v1.json`, and two helper scripts (`tools-add-witness-docs.mjs`, `tools-docids.sh`; they reference `/Users/moshe/Developer/RbxAI-ci`). Note `PIPELINE.md` was "mapped on the renamed tree `/Users/moshe/Developer/RbxAI-rename`", so line references in it (for example `tools.ts ~5461`) are to that tree, not `main`.

`planning/sections/` currently holds `02-owner-directives-and-session-history.md` (about 1,580 words), `15-open-decisions-risks-planning-frame.md` (about 1,500 words) and this file. `AGENTS.md` and `CLAUDE.md` (working tree) already point at a `planning/APPLE-PLANNING-DOSSIER.md` that does not yet exist.

### 12.1.8 What `main` lacks compared with the deployed lineage

`git diff --shortstat main handoff/research-feed` (the pre-round-3 deployed commit `f598acb8`): **805 files changed, 64,414 insertions, 10,791 deletions.** Largest changed areas: `apps/worker` 288 files, `apps/web` 73, `packages/evals` 50, `packages/corpus` 27, `apps/apple-plugin` 19, `packages/owner-classify` 18, `packages/components` 18, `docs/research` 18, `scripts/owner-dashboard` 14, `packages/sdk` 14. Anyone reading `main` for "how the agent works today" is reading something materially behind what customers hit. **For code questions, read the worktree `/Users/moshe/Developer/RbxAI-feed`.** For plans and research, read the main checkout.

### 12.1.9 Corrections to `AGENTS.md` (and `CLAUDE.md`)

Compared against measurements taken today. `AGENTS.md` itself says its numbers are dated 2026-09-16 or 09-22.

| `AGENTS.md` / `CLAUDE.md` says | Measured 2026-10-04 | Source |
|---|---|---|
| ".claude/worktrees: 58 abandoned worktrees, 15 G" | 13 registered worktrees, **5.1 G** | `git worktree list \| grep -c wf_`; `du -sh .claude/worktrees` |
| "packages/corpus 770 M; raw/ 316 M, 41 repositories; chunks.jsonl 10 M, 8,326 chunks" | `packages/corpus` is **13 M**; `raw/` is 68 K; there is **no `chunks.jsonl`** (data is `content.json`, `chunks-witness.json` and others). The live corpus is in D1. | `du -sh packages/corpus/raw`; `ls packages/corpus/data` |
| "packages/training 752 M" | **2.7 G** (adapters 1.3 G) | `du -sh packages/training/*` |
| "the 18 GB" / "docs 91 M, evidence 88 M, 49 runs" | main checkout 13 G; docs 179 M; evidence **139 M, 371 entries** | `du -sh .`; `ls docs/evidence \| wc -l` |
| "apps/worker 137 TypeScript files" | 226 tracked files under `src/` | `git ls-files apps/worker/src \| wc -l` |
| "apple-plugin: 6 Luau files in src/ ... source is 1.1.0 and unpublished" | 7 top-level Luau files plus `src/ops/`; source is **1.4.3** on main, **1.5.0** on `research-feed`; store build presumed 1.0.0 (inferred in `docs/PLUGIN-RELEASE.md`) | `grep PLUGIN_VERSION apps/apple-plugin/src/Bridge.luau` |
| "five applications" | seven app folders (`apple-plugin`, `plugin`, `benchmark`, `experiences`, `site`, `web`, `worker`) | `ls apps` |
| Test files: worker 266, web 175 | worker **358** (410 on feed), web **221** | `ls apps/worker/tests/*.test.mjs \| wc -l` |
| Package list omits `asset-library`, `owner-corpus`, `owner-classify`, `langflow` | all exist (the last two are local-only or on the feed branch) | `ls packages` |
| "Infrastructure names stay `golem` ... renaming breaks live sessions" (also CLAUDE.md) | Owner's standing consent of 2026-10-02 permits removing golem; packages are already `@apple/*` on the feed lineage. The legacy-compatible spellings (`golem.v1`, `X-Golem-`, D1 `golem-corpus`, KV, Vectorize `golem-docs`) still exist in live bindings. | `owner-standing-consent-2026-10-02.md`; `wrangler.apple.jsonc` |
| CLAUDE.md (HEAD): "36 function-hook mods" | **38** mods (CLAUDE.md working tree says 38) | `ls ~/.claude/mods \| wc -l` |
| README.md: "Live: https://golem.moshe-barami111.workers.dev" | The golem host 308-redirects page routes to `apple`; canonical is `apple.moshe-barami111.workers.dev` | `curl -w "%{redirect_url}"` |
| "Memory ... `~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/MEMORY.md`" | Two memory folders exist and differ (12.4.4) | `diff <(ls ...) <(ls ...)` |
| `.claude/skills/rbxai-working-rules/SKILL.md` banner: "START HERE docs/autonomy/" | Retired by `GOAL.md` | file head |

---

## 12.2 Branches and worktrees: the true state

### 12.2.1 Why this is confusing

Three object stores exist: (a) the main checkout `.git` (which also hosts `RbxAI-caps`, `-design2`, `-integration` and the 13 `.claude/worktrees/wf_*`), (b) `RbxAI-rename/.git` (hosts `-feed`, `-fix-*`, `-site-v4`, `-web-v4`), (c) four independent clones with their own `.git`: `RbxAI-ci`, `RbxAI-reorg`, `RbxAI-search`, `RbxAI-rename` itself. Their `origin` points at the **main checkout's filesystem path**, not at GitHub. GitHub's remote is `https://github.com/MosheBarami/Apple.git` and is configured only in the main checkout. The commit `2ffd22db` is a valid object in `RbxAI-rename` and `RbxAI-ci` but `git cat-file -t 2ffd22db` in the main checkout answers "Not a valid object name".

### 12.2.2 The key branches

`git log main..<branch> --oneline | wc -l` is "ahead of main"; `git log <branch>..main` was 0 for all but two, noted below.

| Branch (store) | Tip | Ahead of `main` | Merged into `main`? | On GitHub? | Deployed? | What it holds |
|---|---|---:|---|---|---|---|
| `main` (main store) | `f8991a96` 2026-10-04 "check-deadends: exempt the standalone repo-chat app and docs/" | 0 | n/a | **Yes, same SHA**; last CI run on it (2026-10-03T21:09Z) was green | **No** (not what is running) | Green-CI baseline. The Dependabot clean-up, repo-chat, bench-reset hardening. |
| `integration/giant` (main store) | `25955635` "agent: a finished thing moves, lights up and sounds ..." | 99 | No | **Behind**: GitHub has `6aa3c4bc`; local is ahead of remote (remote tip is its ancestor). Does not include everything after. | Superseded | The big integration of the capability tracks, the golem-to-apple rename phases A and B1, owner-library classification. `handoff/integration-giant` is the same SHA. |
| `research-feed` (RbxAI-rename store; worktree `RbxAI-feed`) | `2ffd22db` "give composed worlds concrete build steps before answering", 2026-10-04 13:59 | 163 vs the stale `origin/main` there | **No** | **No** | **Yes** (health `2ffd22db-dirty`) | The newest code: giant + `fixes-0410` + fix-agent/assets/r2/ui + round-3 fixes (E1 placement, E3 billboards, E2 build steps) + Phase R feed (23 notes distilled to corpus and skills). 60 commits beyond `fixes-0410`, 83 beyond `integration/giant`. |
| `fix-r3` (RbxAI-rename store; worktree `RbxAI-fix-r3`) | `2ffd22db` | 163 | No | No | Yes (same commit as `research-feed`) | Identical tip to `research-feed`. |
| `handoff/fix-r3` (main store) | `3a32d523` "WIP (handoff to Codex): round 3 E2 ... NOT tested" | 163 | No | **No** | No | The **unfinished WIP sibling** of `2ffd22db` (same parent `87e7992d`, same minute). `2ffd22db` is the completed version; prefer it. |
| `handoff/research-feed` (main store) | `f598acb8` "Revert pricing: catalog prices for glm-5.3, ..." | 158 | No | No | Was the deployed commit before round 3 (inferred from the history: `2ffd22db` is 5 commits after it) | Backup ref saved at handoff; it is **not** the current feed tip. |
| `handoff/fixes-0410` / branch `fixes-0410` | `80565282` "agent: build at the scale of whoever it is for" | 103 | No | No | Included in `research-feed` (ancestor) | The worker fixes line of 2026-10-04 (claim audit, rename_instance, scale). Listed in `GOAL.md` as parked, although its content already shipped inside `research-feed`. |
| `site-v4` / `handoff/site-v4` | `6782c88a` WIP, "NOT tested" | 101 | No | No | No | Parked Astro redesign (Geist tokens, Nav, Footer, docs restyle, new `/catalog` page). Not an ancestor of `research-feed`. |
| `web-v4` / `handoff/web-v4` | `5d167867` WIP, "NOT tested" | 101 | No | No | No | Parked app redesign (tokens, layout, studio atmosphere). |
| `search-90` / `handoff/search-90` | `e57f63d9` WIP, "NOT tested" | 91 | No | No | No | Owner-library semantic search to 90% top-3 (baseline 38/50 = 76% on `eval50.py`). Held-out sets `eval_heldout.json` (54 queries) and `eval_heldout2.json` (50) built. |
| `repo-reorg` / `handoff/repo-reorg` | `3faec570` WIP, "NOT tested" | 107 | No | No | No | Repository reorganisation: phases P1 to P4 applied (deletions, docs restructure, `platforms/`, `scripts/` subfolders). Would move paths named by `CLAUDE.md`; must be re-verified before anyone relies on it. |
| `integration/caps` | `5174017b` revert of Ember Rail | 80 | No | **No** (GitHub has `design-ember-rail`, `cap-*`) | No | Earlier capability integration; ends on a revert. Largely contained in giant. |
| `design/round-2` | `f0ab5be6` "WIP website round 2 (stopped mid-work, NOT verified)" | 33 (and 16 behind) | No | Yes, same SHA | No | Abandoned website round 2. |
| `golem-rename-b2` | `e4b0fd96` "apple rename: guard allowlist for the A+B1+B2 tree" | 18 (and 17 behind) | No | Yes, same SHA | No | Phase B2 of the rename (clients sending the new wire spellings); intentionally **not** merged into giant yet (`docs/operations/GOLEM-REMOVAL-RUNBOOK.md` section 1). |

### 12.2.3 What is and is not on GitHub

`git ls-remote origin` returned 45 refs: 22 branches, 5 tags, plus `refs/pull/*`. Remote branches: `main` plus `agent/final-web-redesign-20260922`, `cap-behaviour`, `cap-dup-names`, `cap-self-check`, `checkpoint/pre-refoundation`, `codex/cartoon-assets-loader`, `codex/crop-script-guard`, `codex/live-thirdparty-dashboard`, `credits-waste-cut`, two Dependabot branches, `design-ember-rail`, `design/round-2`, `feature/golem-product-experience`, `feature/roblox-creation-intelligence`, `fix/live-schema-drift-export-contract`, `golem-rename-a-b1`, `golem-rename-b2`, `hotfix/provider-smoke-contract`, `hotfix/supabase-publishable-key`, `integration/giant` (stale at `6aa3c4bc`), `repo-organize`, `rescue/pass1-20260914T163534Z`. Tags: `checkpoint-pre-overnight-2`, `checkpoint-pre-refoundation`, `mission3-baseline`, `overnight2-baseline`, `prod-glm-stable`. PRs 1 to 14 exist as `refs/pull/*`.

**NOT on GitHub** (checked by name and by SHA): `research-feed`, `fix-r3`, `fixes-0410`, `fix-agent`, `fix-assets`, `fix-r2`, `fix-ui`, `site-v4`, `web-v4`, `search-90`, `repo-reorg`, `integration/caps`, all eight `handoff/*` refs, and the current tip of `integration/giant`. In other words **every commit made since roughly 2026-10-03 21:00Z, plus all parked work, exists only on this one Mac** (one disk, with copies split across the three object stores in 12.2.1). The owner's meter says "Integration not pushed" (`~/.claude/apple-product.json`, domain `ops`).

### 12.2.4 The 13 `.claude/worktrees/wf_*` worktrees

These are the isolated worktrees of the 2026-10-02 fleet workflows; the scripts and results are in `docs/handoff/2026-10-02/{workflow-scripts,workflow-results}/` (the `wf_` id appears in each script file name). Total about 5.1 GB. Checked with `git rev-list --count main..<tip>`, `git merge-base --is-ancestor <tip> integration/giant`, `git status --short`, and a SHA search in `git ls-remote origin`.

| Worktree | Workflow (from script name) | Tip subject (abridged) | Ahead of main | In giant? | Dirty | GitHub ref holding the tip |
|---|---|---|---:|---|---:|---|
| `wf_1cadd7fe-3c0-6` | wipe-golem | runbook: gate golem worker deletion on what its DOs hold | 16 | no | 0 | `golem-rename-a-b1` |
| `wf_369225d7-1ee-4` | phase 2 library classification and search | measured colour/size pass, proxy thumbnails | 3 | yes | 1 | none |
| `wf_3d85181d-498-2` | bench-infra headless and held-out | owner bench: review sheet, lower-only score adjustments | 2 | **no** | 0 | none |
| `wf_446213df-e2e-7` | phase 6 website design rebuild | ember-landing Rail test waits for the observer | 5 | yes | 2 | `design-ember-rail`, PR 12 |
| `wf_604cc6a7-8d3-5` | phase 1 strip request-specific | revert the falsification faults; guard green | 9 | yes | 1 | none |
| `wf_643f1768-06e-5` | credits and speed | unpaired-prompt guard asserts the property | 7 | yes | 3 | `credits-waste-cut`, PR 11 |
| `wf_73a32ca7-af0-6` | repo-organize-max | fix plugin build after scripts/ move | 9 | **no** | 0 | `repo-organize` |
| `wf_805b9897-0e2-2` | github-platform | Codespaces, package publishing, rulesets as code | 1 | yes | 0 | none |
| `wf_90b4b7a1-0cd-1` | giant PR capabilities (track 1: asset order) | D-MODELLIB-3 supersedes D-MODELLIB-2 | 4 | **no** | 3 | none |
| `wf_90b4b7a1-0cd-2` | giant PR capabilities (track 2: self-check) | run-idle.ts names the look as a check | 14 | yes | 2 | `cap-self-check` |
| `wf_90b4b7a1-0cd-3` | giant PR capabilities (track 3: dup names) | clone_instances makes N copies | 2 | yes | 4 | `cap-dup-names` |
| `wf_90b4b7a1-0cd-4` | giant PR capabilities (track 4: behaviour) | behaviour: remove an unused export | 10 | yes | 0 | `cap-behaviour` |
| `wf_952a3c4c-35e-6` | (no matching script file) | skill cards and prompt teach build-once-then-repeat | 7 | yes | 4 | none |

Four tips are **not contained in `integration/giant`**: `wf_1cadd7fe` (rename), `wf_3d85181d` (bench review sheet), `wf_73a32ca7` (repo-organize), `wf_90b4b7a1-0cd-1` (asset order docs). Whether their content was superseded by later work is not established here. Eight carry uncommitted changes in their worktrees (1 to 4 files each). They are safe to keep, and they are the housekeeping debt in 12.5.3.

---

## 12.3 Deploy and operations

### 12.3.1 Production and health (all read-only, checked 2026-10-04 about 11:37Z)

| Probe | Result |
|---|---|
| `GET https://apple.moshe-barami111.workers.dev/api/health` | `{"ok":true,"version":"0.1.0","buildSha":"2ffd22db-dirty","compat":"wire-both","legacyWire":{"header X-Apple-Token":372,"header X-Apple-Plugin-Version":372,"header X-Apple-Plugin-Protocol":372}, ...}`: 372 requests so far used the legacy `X-Apple-*` header spellings alongside the new wire. |
| `GET /` on `apple` | 200 in 0.34 s |
| `GET https://golem.moshe-barami111.workers.dev/api/health` | 200, `buildSha: 89becd9` (an old build). `GET /app` on golem answers **308 to `https://apple.moshe-barami111.workers.dev/app`**. Page routes redirect; `/api/*` and `/v1` deliberately still answer on `golem` (`golem-project.md`). |
| Owner gateway `http://127.0.0.1:63747` | A Python process is listening (`lsof -iTCP:63747`); a probe returned `{"error":"node not indexed"}`, i.e. alive and answering. |

The `-dirty` suffix is by design: `infra/deploy-worker.mjs` stamps `BUILD_SHA` from git at deploy time and appends `-dirty` when `git status --porcelain` is non-empty ("A DIRTY TREE IS NAMED, NOT REFUSED"). A clean deploy from `RbxAI-feed` would not carry the suffix, so the deploy came from a tree with untracked files, consistent with `RbxAI-ci` (inferred, not proven).

### 12.3.2 The Cloudflare resources

From `apps/worker/wrangler.apple.jsonc` and `docs/operations/GOLEM-REMOVAL-RUNBOOK.md` section 0 (a read-only Cloudflare listing of 2026-10-02):

| Resource | Name | Notes |
|---|---|---|
| Workers | `apple` (canonical), `golem` (legacy, still deployed), `apple-cf-probe` | Three other workers in the account are not this product. The two share data. |
| Durable Objects | `SessionDO`, `QuotaDO`, `PairingDO`, `AdminDO`, `BudgetDO`, `DiscordDO` | `apple` binds `LEGACY_QUOTA_DO` to `golem`'s `QuotaDO`. `BudgetDO` keeps its ledger in DO storage; it does not travel, which is why golem must stay until traffic and ledgers have moved. Migrations v1 to v3 are in the wrangler file. |
| D1 | `golem-corpus` | About 1.26 GB at 2026-10-02. Holds the docs corpus (`chunks`, `chunks_fts`), the **static site and SPA** (`static_assets`, `static_chunks`), and 511,208 now-unused asset-library rows (per `AGENTS.md`). |
| KV | `golem-kv` | Also holds `config:models` (model-role override; reset to `{}` after the cancelled model comparison). |
| Vectorize | `golem-docs` (bge-small, 384 dimensions) | Docs search. Also optional `VEC_ASSETS` binding. |
| R2 | `apple-media` | Generated images, audio and chat attachments keyed `<kind>/<projectId>/<id>`. |
| Apple-only extras | Analytics Engine `PRODUCT_EVENTS`, queue `NOTIFY_QUEUE`, Workflow `MODEL_UPLOAD_WORKFLOW`, Images binding `IMAGES`, `AI` (Workers AI via AI Gateway) | Optional in `env.ts` so `golem` still runs. |

### 12.3.3 Deploying the worker

```
node infra/deploy-worker.mjs apple|golem [--build-sha <hex>] [--secrets-file <ignored file>]
```
Source: `infra/deploy-worker.mjs`. It runs `apps/worker/node_modules/.bin/wrangler deploy --config wrangler.apple.jsonc|wrangler.jsonc --var BUILD_SHA:<stamp>`, then **verifies by asking `/api/health`** that the new build answers. A bare `wrangler deploy` in `apps/worker` hits the `golem` worker because `wrangler.jsonc` is named `golem` (`golem-project.md`), and loses the `BUILD_SHA` stamp. `--secrets-file` must name a git-ignored file, enforced by `git check-ignore`. Credentials: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the repo `.env`. The `deploy-verifier` mod (12.4.2) checks the health `buildSha` against `HEAD` after a deploy.

### 12.3.4 Deploying the static site and the SPA

```
cd apps/site && npx astro build   # or: pnpm --filter @golem/site build
node infra/deploy-static.mjs [--only site|web]
node infra/deploy-static.mjs --file <local> <remote>    # the rollback path
```
Source: `infra/deploy-static.mjs`, `docs/GO-LIVE.md` line 180. There is no CDN origin: files are POSTed one by one to **`/api/admin/static-upload`** (header `X-Admin-Key`, base64 body, `append:true` for chunking) and stored in D1. Upload order is deliberate: content-addressed assets first, pages last. The upload is **not transactional**, so a failure part-way leaves a mixed site. Needs `API_BASE` and `GOLEM_ADMIN_KEY` (read from `.env` if absent from the environment). Rollback: `infra/capture-rollback.mjs` captures pages; `infra/rollback-static.mjs` restores. `deploy-showcase.mjs` deploys the showcase. The worker serves `/app/*` with fallback to `/app/index.html`, and everything else falls back to `/404.html`.

### 12.3.5 The Studio plugin: build, local install, Creator Store

| Step | Command or location | Who |
|---|---|---|
| Build and verify | `node apps/apple-plugin/scripts/build.mjs`: parse with `luau-analyze`, compile every source with `luau-compile --null -O0` (the way Studio compiles; an earlier build that parsed fine failed in Studio with "Out of local registers"), `rojo build default.project.json -o release/apple-studio.rbxm`, `scripts/inspect-plugin-build.py`, then `apps/apple-plugin/scripts/verify-artifact.py` over the **built bytes**. Prints "not installed or published". Tools live in `~/.rokit/bin` (`luau`, `luau-analyze`, `luau-lsp`, `rojo`, `lune`, `selene`, `stylua`, `wally`). | agent or owner |
| Local install | Copy the `.rbxm` to `~/Documents/Roblox/Plugins/AppleStudio.rbxm`. That file exists: 253,562 bytes, modified 2026-10-04 12:14. The release file in the main checkout is 248,405 bytes (2026-10-02), so the installed copy was built from a different tree (inferred: `research-feed`, plugin 1.5.0, matching the owner's meter note "1.5.0 + free-model insert fix built and installed locally"). The build script itself never installs. | owner / agent |
| Creator Store | Asset **107230158271368**, "Apple Studio", under a user account (the runbook names the account). **Publishing is a human step in Roblox Studio** (Plugins, Publish as Plugin, overwrite the existing asset). Open Cloud cannot update plugin assets; see the long comment in `.github/workflows/plugin-release.yml`. `docs/PLUGIN-RELEASE.md` is the runbook. The owner decides when. | **owner** |
| CI | `plugin-release.yml` (`workflow_dispatch` only) builds and records an artifact; `ci.yml` job "Build and verify the Studio plugin" builds on every push or PR and uploads `apple-studio-pr-unverified`. Neither has secrets and neither publishes. | CI |

Version facts to keep straight: store build presumed **1.0.0** (inferred); worker constant `LATEST_PLUGIN_VERSION = '1.0.0'` in `apps/worker/src/plugin-version.ts` on both `main` and `research-feed`; source **1.4.3** (`main`, giant) and **1.5.0** (`research-feed`). `STUDIO_PLUGIN_STORE_LIVE` is `true` in `packages/shared` since 2026-09-22. The 2026-09-19 upload was removed once for "Misusing Roblox Systems" and appealed; the trigger was never identified (`docs/PLUGIN-RELEASE.md`). The meter says a "GetObjects decision" about publishing 1.5.0 is pending with the owner. Research note `PIPELINE.md` states that new capabilities (the Audio API classes, Animator, Explosion) need an allowlist extension in `Commands.luau`, which is a plugin release.

### 12.3.6 Supabase

Auth and the project registry run on Supabase (RLS on every table; the worker forwards the caller's JWT, so RLS decides; no service-role key in the worker, per `golem-project.md`). Migrations are **applied by hand**: `infra/supabase/migrations/0001` to `0013` (the last: `0013_product_modes_only.sql`). The runner `infra/supabase/migrate.mjs` supports `--status`, `--apply --yes`, `--adopt`, `--verify` and **never guesses a database**: `--url` or `--docker` is mandatory. `--verify` diffs the live catalogue against the schema parsed from the files and reports RLS-off first. `infra/supabase/tests/rls-isolation.mjs` proves the files in a throwaway Postgres (the other four tests cover the outbox, ledger security, export completeness and schema hardening). Two migrations once sat unapplied while dependent code shipped, giving permanent loading skeletons (`AGENTS.md` section 4): "if a query 400s on a missing column, look here first." A Supabase MCP server is available in agent sessions (`apply_migration`, `execute_sql`, `list_tables`, advisors); using it against production is the owner's call. A data export of 2026-09-23 is in `.backups/` (12.5.6).

### 12.3.7 Secrets and environment names (names only)

| Where | Names | Notes |
|---|---|---|
| Repo-root `.env` (ignored, mode `-rw-r--r--`) | `GOLEM_ADMIN_KEY`, `API_BASE`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN_WRITE_ALL`, `GOLEM_E2E_EMAIL`, `GOLEM_E2E_PASSWORD`, `GOLEM_LOAD_PASSWORD`, `ROBLOX_PLUGIN_ASSET_ID`, `ROBLOX_CREATOR_TOKEN`, `GH_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `HF_TOKEN`, `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_INVITE_URL`, five `DISCORD_WEBHOOK_*` (ANNOUNCEMENTS, CHANGELOG, STATUS, MODEL_UPDATES, ALERTS), `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_BASE`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `RESEND_API_KEY`, `VERCEL_TOKEN`, `OWNER_EMAIL` | Read by `infra/*.mjs` and the `env-loader` mod. Clerk, Vercel and Resend variables look like leftovers from other projects (no code reference checked; unverified). |
| `apps/worker/.dev.vars` (ignored) | `ADMIN_KEY` | The same admin secret as `GOLEM_ADMIN_KEY`, under the worker's name. |
| `apps/web/.env.local` (ignored) | `VITE_SENTRY_DSN` | Public ingestion DSN. |
| `.env.release-apple-20260918.json`, `.env.release-golem-20260918.json` (mode 600) | `MEMBERSHIP_OUTBOX_TOKEN`, `SENTRY_DSN` | Passed to `deploy-worker.mjs --secrets-file`. |
| `.env.sentry-release-20260918` (mode 600) | `SENTRY_DSN`, `VITE_SENTRY_DSN` | Public DSNs. |
| Worker bindings declared in `apps/worker/src/env.ts` | `ADMIN_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MEMBERSHIP_OUTBOX_TOKEN`, `MEMBERSHIP_OUTBOX_CONSUMER`, `SENTRY_DSN`, `AI_GATEWAY_ID`, `OWNER_USER_IDS`, `RELEASE_LIBRARY_OWNER_ID`, `LIBRARY_APPROVED_USER_IDS`, `CREDENTIAL_KEY`, `ROBLOX_CREATOR_USER_ID`, `ROBLOX_CREATOR_GROUP_ID`, `ROBLOX_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BUILDER`, `STRIPE_PRICE_STUDIO`, `STRIPE_PORTAL_CONFIGURATION`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `HF_TOKEN`, `TURNSTILE_SECRET`, `WEB_TOOL_ALLOWLIST`, `SEARCH_API_URL`/`KEY`, `SCREENSHOT_API_URL`/`KEY`, `GITHUB_TOKEN`, `GITHUB_REPO_ALLOWLIST`, `CF_ACCOUNT_ID`, `CF_ANALYTICS_TOKEN`, `BUILD_SHA`, `ENVIRONMENT` | Most are optional. Stripe checkout is dark until the keys exist (`docs/GO-LIVE.md`). |
| Other scripts | `GOLEM_SANDBOX_SENTINEL`, `APPLE_BASE_URL`, `APPLE_OWNER_ORIGIN`, `APPLE_OWNER_JWT`, `APPLE_OWNER_BATCH_SIZE`, `APPLE_OWNER_SKIP_COMPONENTS`, `APPLE_DASH_GAMES_DIR`, `APPLE_OS_VAULT`, `APPLE_OS_WHISPER_MODEL`, `APPLE_OS_KOKORO_ROOT`, `APPLE_OWNER_CLASSIFY` | |

**GOLEM_* versus APPLE_*.** Counting `process.env.GOLEM_*|APPLE_*` references in `infra`, `scripts`, `apps/worker/src`, `packages/evals/src`, `tests`: `GOLEM_ADMIN_KEY` 18, `GOLEM_E2E_*` 7+7, `GOLEM_SANDBOX_SENTINEL` 5, `GOLEM_LOAD_PASSWORD` 1; `APPLE_*` names are all in owner-library and local tooling. The deploy and evaluation scripts on `main` still require the `GOLEM_`-prefixed spelling; the `scripts/rename-golem.mjs` / `check-no-golem.mjs` pair on the feed lineage governs what the rename may still touch (`scripts/golem-allowlist.json`).

### 12.3.8 CI and GitHub

`.github/workflows/ci.yml` runs on **push to `main`, every pull request, and manual dispatch**; concurrency cancels superseded runs; **no job receives secrets** and none may call a paid provider (the header comment bans the eval runners `run.mjs`, `visual-bench.mjs`, `grade-visual.mjs`). Jobs and their `timeout-minutes`:

| Job | Timeout (min) | What it does |
|---|---:|---|
| Typecheck and tests | 20 | `pnpm install --frozen-lockfile`; Luau toolchain; `pnpm -r typecheck`; builds the site and installs Chromium (the site tests need them); `pnpm -r test`; root `node --test tests/*.test.mjs`; `gate-check.mjs --lint`. |
| Build site and web | 12 | builds `@golem/site` and `@golem/web`; `check-site-links`, `check-credit-figures`, `check-site-semantics`, `check-dispositions`, `check-app-bundle`, `check-landing-budget`, `check-asset-wall`; uploads `site-dist`. |
| Build and verify the Studio plugin | 8 | installs Luau and Rojo from pinned upstream releases, runs `build.mjs`, uploads `apple-studio-pr-unverified`. |
| Static checks | 8 | evals syntax check, `check-workspace-coverage`, `check-rebrand --offline`, `check-ci-references`, a report-only prettier check. |
| Secrets and dependencies | 10 | `test_secret_scan.py`, `secret-scan.py` over full history, asserts no env file is tracked, `pnpm audit` (warning only). |
| Playwright smoke | 15 | builds the site, installs Chromium, `pnpm exec playwright test`. |

Worst-case sum of the timeouts is **73 runner-minutes per run** (20+12+8+8+10+15); jobs run in parallel, so wall time is bounded by the 20-minute job. Measured wall times are in comments only for the first job (install 40 s, Luau 9 s, typecheck 63 s, tests reaching `@golem/web` at 1:13). **Actual Actions-minute consumption is not documented anywhere I found.** What is documented: on 2026-09-21 GitHub refused to start any job ("recent account payments have failed or your spending limit needs to be increased", `docs/backlog/CI-IS-BLOCKED-ON-GITHUB-BILLING-2026-09-21.md`), when the repository was private. The repository is now public (12.0 #6), and public repositories do not draw down paid minutes (general GitHub behaviour, my inference, not documented in the repo). Latest runs (`gh run list`): CI on `main` `f8991a96` **success** (2026-10-03T21:09Z); the three CI runs before it on `main` (2026-10-02 and 2026-10-03) failed; GitHub-managed "Dependabot Updates" runs succeeded. `plugin-release.yml` is dispatch-only (15-minute timeout).

### 12.3.9 Admin API used for operations

Every `/api/admin/*` call passes `app.use('/api/admin/*', ...)` (`apps/worker/src/index.ts` line 731): header `X-Admin-Key`, **failed attempts are rate-limited**, each call is audited into `AdminDO` with the action (`METHOD route`) and the acted-on subject. `grep -c "/api/admin/" index.ts` gives 55 mentions and 41 distinct routes. Purposes below are read from route names and neighbouring comments, not from running them; treat them as hints.

| Group | Routes |
|---|---|
| Read-only health and state | `GET stats`, `analytics`, `product-analytics`, `logs`, `models`, `model-routing`, `spend`, `billing-reconcile`, `billing-wiring`, `corpus-census`, `corpus-manifest`, `recovery-requests`, `static-list`, `session-info/:id`, `session-messages/:id`, `account/:userId` |
| Verify after a deploy | `POST model-test` (models `clay`/`stone`, `tools:true` exercises native tool-calling), `rag-test`, `raw-probe`, `critique`, `vision-critique`, `spend-probe`, `spend-simulate` (`golem-deploy-workflow.md`) |
| Spend and plan control (change money or limits) | `POST kill-switch`, `spend-limits`, `spend-reset`, `quota-reset`, `grant-credits`, `set-plan`, `config` (writes the `config:models` role map in KV) |
| Corpus | `POST corpus-init`, `corpus-prune`, `embed-batch` (spends Workers AI embedding calls) |
| Per-project operations (cross-tenant, gated by the key) | `POST agent-run/:id` (the same run loop a chat message uses), `agent-stop/:id`, `bench-reset/:id` (a fresh chat on a benchmark project only; hardened in commit `8fb6f79c`), `run-tool/:id`, `studio-op/:id`, `recovery-requests/:id` |
| Content | `POST static-upload` (site and SPA into D1), `discord/register-commands` |

The admin key is one static secret granting cross-tenant access to any project's Durable Object (comment at index.ts:731), so it is the highest-value secret in the repo.

### 12.3.10 The owner-library gateway on the Mac

A Python gateway, `packages/owner-corpus/gateway.py`, serves the owner's Roblox library (565 games, about 97,000 assets per the 2026-10-02 `HANDOFF.md`, `git show HEAD:HANDOFF.md`) on **`127.0.0.1:63747`** (loopback only). It is kept alive by the LaunchAgent `~/Library/LaunchAgents/com.moshe.apple.owner-gateway.plist` (`KeepAlive`, `RunAtLoad`, runs `packages/owner-corpus/start-gateway.sh`, log at `~/Library/Logs/apple-owner-gateway.log`). It opens SQLite read-only, serves original bytes from a content-addressed store on disk, and guards access with a **bearer key regenerated each start** and kept in a `0600` file in a `0700` directory (`gateway-README.md`). Data lives in `~/Library/Application Support/Apple/` (`owner-corpus`, `owner-library`, `owner-classify` and variants, `owner-gateway-cache`, `gateway-backups`, `owner-dashboard`); I did not measure its size (a `du` over it did not finish in two minutes). The plugin and the worker reach it only on this Mac, so **live builds, pairing and the benchmark cannot run in CI or in the cloud**. A second LaunchAgent, `com.rbxai.clean-test-tmp`, runs `scripts/clean-test-tmp.mjs --older-than 60` hourly. `scripts/autonomy/owner-launchagent.plist` exists in the repo but no matching agent is installed.

---

## 12.4 The owner's Claude Code tooling

### 12.4.1 How the mods load

`~/.claude/settings.json` sets `env.CLAUDE_CODE_PLUGIN_DIRS` to a colon-separated list of **38 paths** `/Users/moshe/.claude/mods/<name>`, plus `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` (live reload). Other relevant settings in that file: `CLAUDE_CODE_BYPASS_PERMISSIONS=true`, `permissions.defaultMode: bypassPermissions`, `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`, `ENABLE_TOOL_SEARCH=true`, `effortLevel: high`, hooks registered for `Notification`, `PostToolUse`, `SessionEnd`, `SessionStart`, `Stop` and `UserPromptSubmit`. Each mod is a directory with `.claude-plugin/plugin.json` (name, version 0.1.0, author Moshe Barami, description) and `hooks/hooks.json` plus `hooks/register.tsx` (`{"modules": ["./register.tsx"]}`). `~/.claude/dev-mods/b6bbbfc6-...` is a per-session dev copy. Backups of settings: `settings.json.bak*` (four files, 2026-10-03 and 10-04). Mods show state and fix calls in place; they **approve nothing** (`CLAUDE.md`).

### 12.4.2 The 38 mods (one line each, from `plugin.json`)

| # | Mod | Description |
|---:|---|---|
| 1 | `stop-card` | Why-it-stopped band with Continue, plus a push when you are away |
| 2 | `bash-watchdog` | Times every Bash call, warns at 3 min, ends a hung turn at 20 min |
| 3 | `background-pane` | Pane of running agents, workflows and background Bash with age and silence |
| 4 | `usage-meter` | Status line with 5h/week limits, context fill and cost; toasts at 80/90% |
| 5 | `pinned-directive` | `/directive` pins the owner directive into every session and dedupes re-pastes |
| 6 | `handoff-kit` | `/handoff` writes `HANDOFF.md` from the fixed template; resume card at start |
| 7 | `repo-snapshot` | Git state at session start as a band and a context block |
| 8 | `secret-catcher` | Moves API keys pasted in prompts into `.env` and hides them from the model |
| 9 | `gate-meter` | Band with the V3 acceptance gates G01-G16 (obsolete since `GOAL.md`) |
| 10 | `deploy-verifier` | After a deploy, checks `/api/health` `buildSha` against `HEAD` |
| 11 | `studio-chip` | Status chip: Roblox Studio running, owner gateway up |
| 12 | `golem-leak` | Toast when an edit adds "golem" to user-facing text |
| 13 | `bg-typecheck` | Typechecks the packages a turn edited, in the background; `/suite` runs tests |
| 14 | `spawn-preview` | Toast per agent spawn with model and how many run |
| 15 | `compact-checkpoint` | Saves a checkpoint before compaction and tells the summarizer what to keep |
| 16 | `workflow-resume` | Records workflow runs; lists interrupted ones at the next session |
| 17 | `disk-chip` | Status chip with free disk space |
| 18 | `studio-compare` | Sends each new Studio comparison image into the chat |
| 19 | `consent-ledger` | Logs standing consents you grant and lists them each session |
| 20 | `path-fixer` | Rewrites stale `Desktop/RbxAI` paths and worktree-isolation path errors |
| 21 | `limit-resume` | Resumes the work once the usage limit resets |
| 22 | `false-stop` | Nudges once when a turn says it is continuing but ends with nothing running |
| 23 | `question-relay` | Pushes questions to your phone; answers Recommended when you are long away |
| 24 | `context-guard` | Band with context size per step; offers a fresh session past 300k |
| 25 | `agent-runs` | `/runs` pane: the Apple agent steps of a project, from the worker API |
| 26 | `review-gate` | Skips automated security reviews whose changes are data files only |
| 27 | `shell-fixer` | Rewrites macOS/zsh pitfalls: `timeout`, unquoted globs, `==` |
| 28 | `tool-preloader` | Keeps the browser, computer-use and Studio tools loaded |
| 29 | `screenshot-shrink` | Halves screenshot size unless a scale is given |
| 30 | `companion-files` | Reminds which companion files a change needs |
| 31 | `env-loader` | Loads `.env` for Bash commands that use its variables |
| 32 | `peer-roster` | `/peers` pane: other sessions and agents, with a message box |
| 33 | `skill-kits` | `/kit` puts a saved set of skills into the prompt |
| 34 | `worktree-janitor` | `/worktrees` pane: stale worktrees with size and a Remove button |
| 35 | `file-outline` | Outline tool: functions and classes of a file with line numbers |
| 36 | `peer-safety` | Warns on `git stash/reset/checkout/add -A` (never blocks) |
| 37 | `progress-meter` | Apple's completion out of 100%: the owner's fixed meter as a live progress pane and status line |
| 38 | `product-total` | Apple's TOTAL completion out of 100%: an always-visible animated bar, a detail pane (`/product`) and a status line |

Slash commands named in `CLAUDE.md`: `/bg /directive /handoff /gates /suite /consents /runs /peers /kit /worktrees /preload`, plus `/product`; the `mcp__file-outline__outline` tool lists a file's functions with line numbers. The `/gates` and `gate-meter` pair is obsolete under `GOAL.md`. The `worktree-janitor` (`/worktrees`) is the sanctioned way to remove the stale worktrees in 12.2.4.

### 12.4.3 The meter files

| File | Written by | Read by | Current content (2026-10-04) |
|---|---|---|---|
| `~/.claude/apple-meter.json` | the agent | mod #37 `progress-meter` | Phase R meter: 23 research domains, each weighted about 4.35% (sum 100.05), **every one at value 90** ("committed, tests green"; 100 means deployed). Live label: "Phase R complete in code: 23 notes, 994 passages live, 23 cards, 519 skills, awaiting deploy decision". Credits 0. |
| `~/.claude/apple-product.json` | the agent | mod #38 `product-total` | Title "Apple: product finished, completely"; "values move only on evidence"; games count only when a fresh blind critic scores every area 8/10 or higher with no severe flaw. Six weighted domains (`games` 30% at **3**, `capability` 20% at **45**, `knowledge` 15% at **90**, `website` 15% at **15**, `plugin` 10% at **50**, `ops` 10% at **50**); by my arithmetic that totals about **35.7 out of 100**. Its `next` field: stay on GLM 5.3 Flash, fix the build stall, game 1 round 4, blind critic. |
| `docs/handoff/2026-10-04/apple-meter.json` and `progress-meter-mod/` | | | Snapshot copies of the meter and mod source in the (git-ignored) handoff folder. |

Note the two meters disagree about "done": the Phase R meter reads 90 everywhere (research fed and committed), while the product total reads 35.7 (games 3, capability 45). `GOAL.md` says the fixed meter is retired; both files are still written and displayed.

### 12.4.4 Memory folders

`CLAUDE.md` names `~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/MEMORY.md`; the 2026-10-02 `HANDOFF.md` names `-Users-moshe-Developer-RbxAI/memory/`. **Both exist and differ** (`diff <(ls ...) <(ls ...)`; `diff -q` on `MEMORY.md`):

| Folder | Entries | Only here |
|---|---:|---|
| `~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/` | 20 | `owner-library-v2.md` (library store and what the safety classifier refused, 2026-09-30), `usage-economy.md` (owner ordered aggressive Claude usage reduction, 2026-09-29) |
| `~/.claude/projects/-Users-moshe-Developer-RbxAI/memory/` | 19 | `owner-standing-consent-2026-10-02.md` (standing consent to delete untracked files, delete GitHub branches, change Cloudflare/Supabase/Sentry, and remove "golem" autonomously) |

Shared entries, from the index: `golem-project`, `golem-deploy-workflow`, `visual-quality-bar` (Moshe rejects technically correct but ugly output), `golem-github-remote` (says **private**, now contradicted), `apple-zero-cost-architecture` (subscriptions plus credits; BudgetDO is the only spend guard), `apple-training-hardware`, `golem-two-agent-lanes`, `observation-failure-pattern`, `falsification-technique`, `claude-design-login`, `browser-use-chrome`, `owner-question-rounds`, `desktop-1-background-only`, `owner-consent-v3-live`, `research-first-goal` (the GOAL.md pointer). Project directories under `~/.claude/projects/` also include about 40 `-Users-moshe-Desktop-RbxAI--claude-worktrees-*` session folders and `-Users-moshe-Developer-RbxAI{,-apps-web,-apps-worker}`. `golem-project.md` still describes models (Qwen3-30B, GLM-4.7-flash) that the code has since replaced ("read DEFAULT_MODELS in gateway.ts, not this note" is in the note itself). A planner should treat memory notes as dated: the older ones say Desktop paths that no longer exist.

### 12.4.5 `tools/repo-chat`

A local, read-only Next.js 16 app (Tailwind 4, shadcn/ui, Vercel AI SDK v7 with the OpenRouter provider) that answers questions **only** about this repo, grounded in the repo itself. It binds `127.0.0.1:4790`, is **not** a pnpm workspace member, is not deployed, and has its own `node_modules` (1.4 GB; do not use pnpm there). Run: `cd tools/repo-chat && npm install && npm run dev`; the `repo-chat` entry in `.claude/launch.json` starts it for the Claude preview (uncommitted). It needs `OPENROUTER_API_KEY`, `REPO_CHAT_MODEL` (default `stealth/space-bunny-alpha`, 1M context) and `REPO_ROOT` in `tools/repo-chat/.env.local` (ignored; only `.env.example` is tracked). Server-side tools (zod-validated, capped, redacted): `repo_map`, `search_code` (ripgrep; excludes `node_modules`, `.git`, `.claude/worktrees`, `packages/corpus/raw`, secrets), `read_file` (400 lines or 60 KB per call), `list_dir`, `git_log`, `git_show`, `git_branches`, `git_worktrees`, `search_knowledge` (BM25 over a knowledge base), `bench_results`. It reads the owner's memory folder (default the `Developer` one) and ships ten "skills" in `tools/repo-chat/skills/` (`architecture-overview`, `benchmark-status`, `deploy-and-release`, `explain-a-decision`, `golem-rename-status`, `phase-status`, `test-and-ci-status`, `trace-a-tool-call`, `what-changed-recently`, `where-is-it-implemented`). Tests: `npm test` (vitest; `guard`, `knowledge`, `safety`). It spends OpenRouter money per question (a paid provider, outside CI). Commit `bd150441` and the check-deadends exemption (`f8991a96`) exist because the repo's guards flagged it.

Note: planners given only the folder will find answers faster in `AGENTS.md` plus this section than by running repo-chat, since repo-chat reads the main checkout and `main` is behind the deployed code (12.1.8).

---

## 12.5 Hazards and housekeeping debt

### 12.5.1 Uncommitted state of the main checkout

`git status --short` at survey time:

| Entry | State | Consequence |
|---|---|---|
| `.claude/launch.json` | modified, +46 lines | Adds `owner-dashboard` (port 4777), `new-design-site` (4331, serves `RbxAI-integration/apps/site/dist`), `new-design-app` (5183, Vite from `RbxAI-integration`), `repo-chat` (4790). The owner's own edit. |
| `.claude/settings.json` | modified, 172 lines changed | The `permissions.deny` list (`Read(**/.env)`, `Read(**/.dev.vars)`, `Read(~/.ssh/**)`, `Edit(**/.env)`, many MCP server denials, `Artifact`, `CronCreate`, ...) is **emptied**; `deniedMcpServers` is empty; plugins `chrome-devtools-mcp`, `ui-ux-pro-max`, `hf-cli`, `mcp-builder`, `cloudflare`, `supabase` are switched **on**. `Bash`, `Read`, `Edit`, `Write`, `WebFetch` are allowed. Combined with `bypassPermissions` in `~/.claude/settings.json`, nothing technical stops an agent reading `.env`. |
| `.codex/hooks.json` | modified, now 0 bytes | The two Codex stop hooks (`unlazy`, `nonstop`) were removed. |
| `AGENTS.md`, `CLAUDE.md` | modified | Only the START HERE banner and the mod count (36 to 38). |
| `HANDOFF.md` | deleted in the working tree | Still in `HEAD`. |
| `GOAL.md`, `planning/`, `research/` | untracked | See 12.0 #3. |

These were not authored by the survey and **must not be reverted or committed on the owner's behalf**.

### 12.5.2 Ignored big folders and clutter in the main checkout

`git status --ignored`: `.claude/worktrees/` (5.1 G), `node_modules/` (1.2 G), `tools/repo-chat/node_modules`, `packages/training/adapters` (1.3 G), `packages/training/data` (593 M), `packages/asset-library/*-store` and `review` (about 1.8 G), `apps/*/dist`, `apps/*/node_modules`, `.playwright-mcp/` (47 files), 14 `.tmp-*.png/.b64` screenshots at the root (several 1 to 1.6 MB), `WORKLIST.log`, `orgsweep.tsv`, `claude-autonomy-research-pack/`, `handoff/`, `graphify-out/`, plus the Studio-built `apps/apple-plugin/release/*.rbxm` (three) and `*.rbxl` proof places. `packages/owner-corpus/` (ignored) contains a `__pycache__`. None of this is wrong, but it dilutes any "give the planner the whole folder" handoff: **a Cowork copy of the main checkout would be about 13 GB, of which the planning-relevant text is under 400 MB.** Recommended exclusion list for a planner copy: `.claude/worktrees`, all `node_modules`, `packages/training`, `packages/asset-library/*-store`, `tools/repo-chat/node_modules`, `.playwright-mcp`, `.tmp-*`, `.env*`, `.backups`.

### 12.5.3 Abandoned or redundant worktrees

* 13 `.claude/worktrees/wf_*` (5.1 GB, 12.2.4); 4 tips not in giant; 8 with uncommitted files; none of the 13 are in use by a running agent that I could verify (I did not check processes; the `peer-roster` mod does). The `worktree-janitor` mod (`/worktrees`) exists to remove them. A rule from `golem-two-agent-lanes.md`: never delete a worktree a running agent uses; ask first.
* Four finished fix worktrees `RbxAI-fix-agent`, `-fix-assets`, `-fix-r2`, `-fix-ui` (about 1.2 GB each; all ancestors of `research-feed`).
* Two prunable records under `/private/tmp/claude-501/` (`git worktree prune` clears them).
* Duplicate `node_modules` in every sibling (the siblings total roughly 16 GB).
* `RbxAI-design2`, `RbxAI-caps`: not needed unless someone wants their WIP.
* `AGENTS.md` and the working-rules skill warn: never `git add -A`, `checkout`, `switch`, `stash`, `reset` in the shared checkout; never `pnpm install` there (it rewrites symlinks); commit with `git commit -F <msg> -- <pathspec>`. The `peer-safety` mod warns on the same commands.

### 12.5.4 The golem names that must stay (for now)

Per `AGENTS.md` section 1 and 7 and `wrangler.apple.jsonc`: D1 `golem-corpus`, KV `golem-kv`, Vectorize `golem-docs`, the worker `golem`, wire literals `golem.v1`, `X-Golem-`, `golem_session`, and on `main` the `@golem/*` package scope. The owner overrode "rename neither" on 2026-10-02 but live sessions and stored rows still depend on them, and the rename is **only partly executed**: phases A and B1 are in `integration/giant`, B2 is parked on `golem-rename-b2`, and the cloud steps in `docs/operations/GOLEM-REMOVAL-RUNBOOK.md` ("NOTHING IN THIS FILE HAS BEEN EXECUTED") were not run; the health endpoint's `compat:"wire-both"` and its 372 legacy-header counter show both spellings are live. Guards: `scripts/check-rebrand.mjs` (user-visible names), and on the feed lineage `scripts/check-no-golem.mjs` with `scripts/golem-allowlist.json`, plus the `golem-leak` mod. A planner should not propose renaming a binding or wire literal without reading that runbook (verification and rollback per step; "do not run two steps in one sitting").

### 12.5.5 Tests that pin source text

`grep -lE "readFileSync\([^)]*(src|\.ts)" apps/worker/tests/*.test.mjs`: **111 of 358** worker test files read source text and assert on it (`CLAUDE.md` says so too: a call must sit inside a guard's character window; a literal must not appear). Consequences: a pure move or reorder can fail them; whole-suite runs are required (about 3 minutes, about 4.7k tests per `CLAUDE.md`); `phase-coverage.test.mjs` fails if a new agent tool is not registered in `packages/shared/src/index.ts`, `src/mcp.ts` and `src/run-idle.ts`; `prompt-no-subjects` and `no-subject-literals` ban subject words in the prompt, skill cards, creator skills and tool definitions (`PIPELINE.md`), so a content-feeding change can fail a format test; plugin allowlist (`Commands.luau` `X = true,` lines) must contain every class and property a composer writes. For Phase R work the only tests `GOAL.md` permits are the format-guarding unit tests. The `repo-reorg` branch would move many of these paths, which is why it is parked unverified.

### 12.5.6 Secrets hygiene

* **Never print or commit secret values.** All secret files are git-ignored (`git check-ignore -v` confirmed `.env`, `apps/worker/.dev.vars`, `apps/web/.env.local`, `.env.release-*`); `git ls-files | grep -iE "\.env|dev\.vars"` shows only `tools/repo-chat/.env.example`.
* `.env` is mode `-rw-r--r--` (world-readable on the Mac) while the release files are `600`. It holds a Cloudflare token plus a second one named `*_WRITE_ALL`, a GitHub token (`GH_TOKEN`), a Supabase access token, a Hugging Face token, a Roblox creator token, Discord bot and webhook credentials, a Sentry auth token, and Clerk, Vercel and Resend credentials that look unrelated to this product (unverified). One compromised agent session with `bypassPermissions` and an empty deny list could reach all of them.
* `scripts/secret-scan.py` scans every blob on every ref (CI "Secrets and dependencies"). It fails closed on new history findings; accepted old ones are in `scripts/known-exposures.json` keyed by blob SHA with no values. The Supabase anon key is legitimately committed (publishable, RLS-gated).
* The `secret-catcher` mod (#8) moves keys pasted into prompts into `.env` and hides them from the model; the `env-loader` mod loads `.env` for Bash.
* `.backups/supabase-2026-09-23T17-58-45-633Z/` holds `profiles.json` (5.5 KB), `projects.json` (65 KB) and `membership_outbox_secret.json`: user data and a secret in an ignored plain-JSON folder inside the repo directory. Treat it as sensitive; a Cowork copy of the folder would include it.
* `apps/worker/.dev.vars` is the same admin secret as `GOLEM_ADMIN_KEY`: one key grants cross-tenant access (12.3.9).
* The GitHub repo being **public** means the entire committed history is world-readable; `apple-objects.git`'s tip subject mentions keeping the owner library "out of the public repo". Whether public was a deliberate choice is unknown (12.6).
* Owner-library bytes, the Roblox account upload rule ("never upload to the owner's account": 299 permanent Image/Decal assets once made without permission, `AGENTS.md` section 7), and the CI rule "never call a paid provider" are the other standing constraints.

### 12.5.7 Other debt worth a line

* `research/` and `GOAL.md` uncommitted (12.0 #3); `docs/handoff/2026-10-04/` ignored (12.0 #4).
* Two competing "START HERE" statements remain in tracked files (`.claude/skills/rbxai-working-rules/SKILL.md`, `.agents/skills/*`) pointing at `docs/autonomy/`.
* `packages/shared`'s `LATEST_PLUGIN_VERSION` is `'1.0.0'` in the worker while three newer plugin versions exist.
* `README.md` and `docs/PLUGIN-RELEASE.md` carry stale facts (12.1.9).
* Owner-bench result files are untracked in `RbxAI-ci` (15 files, 2026-10-04) and nowhere else; these are the only records of the game-1 comparison runs (`packages/evals/owner-bench/results/2026-10-04-*`), apart from the summary in `research/roblox/phase-t/`.

---

## 12.6 Open questions this section raises for the planners

1. **Where should the single source of truth live, and who consolidates it?** The deployed code is a commit that exists in two sibling object stores and on no remote. Should the next action be a push of `research-feed` (and the parked branches) to GitHub, or a consolidation into one clone? (The owner's meter lists "Integration not pushed" and "giant PR and rulesets not done".)
2. **Should `GOAL.md`, `research/`, `planning/` and `docs/handoff/2026-10-04/` be committed**, on which branch, and should `.gitignore:250` (`handoff/`) be narrowed so restore kits stop being ignored?
3. **Is the public GitHub repository intended?** The owner's memory says private; the API says public. If intended, what is the secret-scan and history-exposure position (`scripts/known-exposures.json`), and does `apple-objects.git` hold a pre-filter history that must never be pushed?
4. **Which line is "main" going forward?** `main` (green CI, 158+ commits behind what runs in production), `integration/giant` (stale remote), or `research-feed`? Does the planner want one fast-forward or a PR series, given CI cannot run on unpushed branches?
5. **What does the parked work cost to resume, and in what order?** `site-v4`, `web-v4`, `search-90` and `repo-reorg` are WIP snapshots "NOT tested"; `repo-reorg` moves paths the docs and tests name. Is the reorganisation still wanted before Phase T, or after?
6. **Plugin 1.5.0:** store build is presumed 1.0.0, local install is 1.5.0, the worker nags for 1.0.0, and Open Cloud cannot publish plugins. Who publishes, when, and does the planner want the version constant and `STUDIO_PLUGIN_*` flags revisited? What is the Creator Store review risk (the prior removal's trigger was never identified)?
7. **Cloud-side rename and legacy `golem`:** run or abandon `GOLEM-REMOVAL-RUNBOOK.md`? `apple` depends on `golem`'s `QuotaDO` (via `LEGACY_QUOTA_DO`) and on `golem-corpus`/`golem-docs`/`golem-kv` names. What is the sequencing and the rollback owner?
8. **The admin key and the broad `.env`:** is it acceptable that one world-readable file, one static admin key and an emptied deny list guard everything under `bypassPermissions`? Should `.claude/settings.json`'s deny list be restored, `.env` narrowed to `600`, the unrelated tokens (Clerk, Vercel, Resend, the `WRITE_ALL` Cloudflare token) rotated or removed, and `.backups/` moved out of the repo directory?
9. **Which CI is the real one?** GitHub Actions is green on `main` but sees none of the unpushed code; `RbxAI-ci` runs the same steps locally (`docs/handoff/2026-10-04/scripts/ci-local.sh`). Is local CI on the feed lineage the gate for deploys, and is Actions-minute cost a concern now that the repo is public?
10. **Disposition of the 13 wf worktrees and four fix worktrees** (about 11 GB combined): four wf tips are not in giant. Has anyone confirmed their content is superseded? The `/worktrees` mod can remove them, subject to the owner's rule against deleting in-use worktrees.
11. **Memory and doc drift:** which memory folder is canonical (`Desktop` or `Developer`), and should `AGENTS.md`, `CLAUDE.md`, `README.md`, the working-rules skill and `docs/PLUGIN-RELEASE.md` be corrected as in 12.1.9? Should the retired `gate-meter`/`/gates` mods and the older `progress-meter` be removed, given that `GOAL.md` retires the fixed meter and the two meter files disagree (90 versus 35.7)?
12. **`packages/asset-library` (1.9 GB, 6,876 tracked files) and `packages/training` (2.7 GB):** what consumes the asset-library store today (my search found no consumer named in `AGENTS.md`), and should either be excluded from the planner's copy or archived off the repo?
13. **`apps/benchmark/crystal-canyon`, `apps/experiences/lumen-isles`, `packages/langflow`, `claude-autonomy-research-pack/`, `graphify-out/`, `handoff/` (root):** dead or archive. Delete, archive, or keep as reference? (The `check-deadends` guard and the `handoff/zero-inbound-*.tsv` lists exist to answer this.)
14. **Actions and platform costs are undocumented:** there is no ledger of Actions minutes, Cloudflare spend by resource (D1 is about 1.26 GB with 511,208 unused rows), OpenRouter spend for repo-chat, or Workers AI credit burn outside the product's own BudgetDO. Does the planner need that measured before pricing decisions in the dossier's economics section?
