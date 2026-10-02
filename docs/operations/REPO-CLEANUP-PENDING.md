# Repo clean-up: what is done, and what still needs the owner's yes

Written 2026-10-02 alongside the reorganisation (`scripts/reorg-repo.mjs`, plan in `scripts/reorg/plan.json`).
**Nothing in sections 2 to 6 has been executed.** Each needs the owner's explicit yes, because it deletes
something that git cannot restore, changes an external system, or removes something another lane may use.

Sizes were measured on 2026-10-02 with `du` on the main checkout unless a row says otherwise.

## 1. Done in the branch (all recoverable from history)

- P1 deletions (QA screenshots, stale builds, one-shot scripts, a dead skill), P2 docs organisation and pruning
  (`docs/architecture`, `design`, `operations`, `training`; 117 unreferenced evidence files), P3 `platforms/` (absorbs `infra/` and
  `supabase/`; a README per service), P4 `scripts/` subfolders (`checks`, `generate`, `harvest`, `dev`, `studio-proof`, `lumen-isles`):
  `node scripts/reorg-repo.mjs --list` prints every entry and `git log --diff-filter=D` finds any deleted file.
- The script is re-runnable on a newer `main` (`--phase P1,P2,P3,P4`, dry run by default, `--check` afterwards); see `scripts/reorg/README.md`.

Left in place on purpose, with the reason:

| Item | Why it stays |
|---|---|
| `docs/autonomy/archive/pre-v3/`, `docs/autonomy/HANDOFF.md`, `docs/autonomy/SESSION_HANDOFF_2026-09-30.md` | six live pointers (`ACCEPTANCE.json`, `CURRENT_STATE.md`, `DECISIONS.md`, `MISSION.md`, `NEXT_ACTION.md`, `README.md`) and a "read it first" row in `docs/autonomy/README.md` name them, those files change every day in other lanes, and the root `HANDOFF.md` that supersedes the handoffs is untracked. Retire them in the same change that tracks `HANDOFF.md` |
| `docs/audit/*` | cited by code comments (`scripts/harvest/harvest-hf.mjs`, a web test) and by `docs/training/model-serving-reality.md` |
| `docs/design/DESIGN-SPEC.md` | already says "superseded", but three code comments cite it; moved into `docs/design/` instead of deleted |
| `docs/WORLD-BUILDER-HISTORY.md` | cited seven times by the frozen Crystal Canyon benchmark source |
| `wrangler.jsonc`, `wrangler.apple.jsonc` | wrangler resolves `main` relative to the config; seven worker tests read them by path |
| `.claude/launch.json` entries `design-examples`, `ds-bundle`, `run-dashboard` (point at `~/Downloads` and `/private/tmp`) | the file was modified and uncommitted in the main checkout by someone else; editing it here would block the merge |
| `.codex/hooks.json` | points at stop-hooks outside the repo, which contradicts "no hooks" in `CLAUDE.md`. Owner decision |
| `scripts/owner-dashboard/cc/folders.json` keys `infra`, `supabase`, `graphify-out` | `repo.test.mjs` demands a description for every top-level directory of `origin/main`; remove the three keys after this branch is on `origin/main` |
| `docs/autonomy/NEXT_ACTION.md`, `vision-status.json` "FRONTIER" wording | rewritten daily by other lanes; the file is parsed every minute by the dashboard |
| `AGENTS.md` figures other than the layout block and the sizes in section 2 | measured by other lanes; `tests/playbook-claims.test.mjs` guards them |

## 2. Owner-gated tracked deletions (the "FINISH THE PRODUCT" cluster, P5)

Delete together or not at all. `scripts/checks/check-escape-hatches.mjs` makes deleting `GATES.md` and friends a failure
("may not be deleted"), and CI runs `gate-check.mjs --lint` and `check-dispositions.mjs`.

- Docs: `GATES.md`, `WORKLIST.md`, `docs/MISSION-PROMPT.md`, `MISSION-LEDGER.md`, `PASS-LOG.md`, `PASS-STATE.md`,
  `FINISH-REPORT.md`, `FINISH-REPORT-100.md`, `CHECKPOINT.md`, `CHECKPOINT-2026-09-20.md`, `BLOCKERS.md`;
  `docs/backlog/{CHECKLIST-V2.*, FEATURES.*, BLOCKERS.md, GATES-RERUN-2026-09-21.md, OWNER-HANDOFF.md, OWNER-ONE-STEP-VISUAL-BENCH.md}`;
  `docs/evidence/gate-deps/`.
- Scripts: `scripts/gate-check.mjs`, `gate-suite.mjs`, `assert-tests.mjs`, `gate-typecheck.mjs`, `probe-s1.mjs` and, in `scripts/checks/`,
  `check-escape-hatches`, `check-backlog`, `check-dispositions`, `check-api-base`, `check-schema-drift`,
  `check-module-resolution`, `check-unstyled-classes`; tests `tests/{gate-check,check-escape-hatches,check-backlog,check-dispositions,probe-s1}.test.mjs`.
- Edits that must go with it: drop the `ci.yml` steps "Ledger is well-formed" (`gate-check.mjs --lint`) and
  `scripts/checks/check-dispositions.mjs`; drop root `package.json` scripts `check:dispositions` and `check:backlog`; drop the
  `docs/BLOCKERS.md` entries in `known-fixtures.json` and `known-exposures.json`; `scripts/rebrand-literals.mjs` only after the rename merges.
- `docs/BLOCKERS.md` once held credentials. Deleting it does not remove them from history; rotation is the owner's call.

## 3. Owner-gated training prune (P6)

`packages/training` is not a workspace member (V3 section 2 cancelled training; keep one recoverable archive).
Candidates, tracked only: `lora-apple-v1..v35.yaml` with their two config tests, `mlxdata-apple-v4/`, `mlxdata-apple-v5/`,
`mlxdata-llama/`, `hf-space/`, `forever-hypotheses.json`, `holdouts/storage-transfer-v1.jsonl`, `prompts/ui-safe-area.txt`.
Keep the import closure of `build-verified-modules.mjs` and `build-module-embeddings.mjs`, `consent-staging.mjs`,
`runs/knowledge-reach.json` and the `data/*-seeds-*` files. Separate decisions: `discovery/v2/*.jsonl` (16 MB, the largest
tracked blob set), the roughly 160 other `src/*.mjs`, the `packages/langflow` training flow, and 63 tracked-but-ignored
files under `packages/training/runs/` (`git rm --cached` would remove them from the tree only).

## 4. Untracked files (not recoverable; delete only after the owner agrees)

Do not touch: `.claude/worktrees/*`, the two worktrees under `/private/tmp`, `node_modules/`, `.env`,
`apps/worker/.dev.vars`, `apps/web/.env.local`, `packages/owner-corpus/`, `docs/evidence/owner-corpus-20260926/`,
`packages/asset-library/{models-store,sfx-store,vfx-store,review}`.

| Path | Size | Why it is a candidate |
|---|---:|---|
| `.tmp-*.png`, `.tmp-*.b64` (15 files) | about 7 MB | Studio screenshot scratch; the dashboard media view would show empty |
| `.playwright-mcp/` | 1.4 MB | MCP console and screenshot dumps |
| `handoff/` | 5.8 MB | 2026-09-14 graph copy |
| `graphify-out/` | 16 MB | stale generated graph; `graphify update .` rebuilds it |
| `claude-autonomy-research-pack/` | 116 KB | foreign agent pack; `docs/autonomy/RESEARCH-REPORT.md` is the tracked version. Diff for unique content first |
| `.workbuddy-ai/` | 28 KB | tool scratch, contents not inspected |
| `orgsweep.tsv`, `WORKLIST.log` | 28 KB, 64 KB | one-off output, no reader |
| `evidence/`, `youtube-mcp/`, `test-results/` (repo root) | 0 to 8 KB | empty or Playwright output |
| `apps/worker/dist/` | 0.8 MB | old build output labelled "golem"; nothing references it |
| `apps/site/dist/`, `apps/site/.astro/` | 2.5 MB | rebuildable |
| `apps/web/dist/` | 27 MB | the freshest build; `check-app-bundle.mjs` and `ci-parity` need it, so only if a rebuild is acceptable |
| `apps/apple-plugin/release/apple-studio-1.4.0*.rbxm` | about 360 KB (sweep figure) | old local builds. Keep `apple-studio.rbxm` |
| `packages/training/.venv/` | 535 MB | rebuildable with `uv` |
| `packages/training/runs/forever-dry/`, `runs/forever/` | 293 MB, 14 MB | training run output |
| `packages/training/data/local-pilot-2026-09-18-*` (3 dirs) | 45 + 15 + 15 MB | pilot data |
| `packages/training/mlxdata/`, `mlxdata-text/` | 0.4 MB each | derived data |
| `docs/evidence/pixels/{12,41,probe,unpassed,blankprobe,tokenprobe,test-*}` | about 71 MB (sweep figure) | local interim captures; `.gitignore` says a frame someone is reviewing may be there, so ask first |
| `__pycache__/`, `.pytest_cache/`, `.DS_Store` | small | caches |

Owner decision, not a default delete:

| Path | Size | Note |
|---|---:|---|
| `packages/training/adapters/` | 1.29 GB | LoRA weights, expensive to recreate; V3 says keep one recoverable archive |
| `packages/training/data/roblox-research-v1-20260920/` | 515 MB | raw research data; V3 calls it usable corpus |
| `.backups/supabase-2026-09-23T17-58-45-633Z/` | 124 KB | production table dump with user data (`profiles.json`) and `membership_outbox_secret.json`. **Do not delete.** Move it out of the working tree (for example `~/Documents/Apple-backups/`); the dashboard's `supabase.mjs` and its test read this path, so update them if moved |
| `.env.release-golem-20260918.json` | 4 KB | has a `MEMBERSHIP_OUTBOX_TOKEN` entry. A wipe candidate for the golem removal, but it may hold the only copy; confirm the secret is live in Cloudflare first |
| `.env.release-apple-20260918.json`, `.env.sentry-release-20260918` | 4 KB each | same shape; the Sentry file holds public DSNs only; probably still used for release builds |
| `HANDOFF.md` (repo root, 24 KB) | | untracked. Track it (and then retire `docs/autonomy/HANDOFF.md` and the 2026-09-30 handoff), or keep it local |

## 5. GitHub (`MosheBarami/Apple`, public): read with `gh api` GET on 2026-10-02, nothing changed

1. The description still says "Golem — the AI builder for Roblox Studio..." and topics are empty. Set the Apple wording and topics
   (`roblox`, `roblox-studio`, `cloudflare-workers`, `ai`, `supabase`).
2. Delete the 9 remote branches that are fully merged into `main` (ahead 0 at measurement time):
   `agent/final-web-redesign-20260922`, `checkpoint/pre-refoundation` (the tag `checkpoint-pre-refoundation` keeps it),
   `codex/live-thirdparty-dashboard`, `feature/golem-product-experience`, `feature/roblox-creation-intelligence`,
   `fix/live-schema-drift-export-contract`, `hotfix/provider-smoke-contract`, `hotfix/supabase-publishable-key`,
   `rescue/pass1-20260914T163534Z`.
3. Do not delete without review: `codex/cartoon-assets-loader` (5 ahead), `codex/crop-script-guard` (1 ahead),
   `credits-waste-cut` (7 ahead) and `design-ember-rail` (5 ahead). The last two appeared after the earlier sweep.
4. Keep the 5 tags (`prod-glm-stable`, `overnight2-baseline`, `mission3-baseline`, `checkpoint-pre-refoundation`,
   `checkpoint-pre-overnight-2`) as restore points.
5. Secret scanning, push protection and Dependabot security updates are all `disabled` on a public repository. Enable them.
6. `delete_branch_on_merge` is `false`. Turn it on. `main` CI was red on 2026-10-01 and 10-02 per the earlier sweep ("Tests", "Smoke tests",
   "Web app bundle budget"; not re-measured); fix that, then add branch protection.
7. No licence is set (`license: null`); decide on a LICENSE and on whether the repo stays public.
8. Actions secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` exist, but no workflow references `secrets.*` and `ci.yml` says no job gets
   secrets. They look unused: remove them if so (the token is a standing credential for nothing).
9. Add `.github/CODEOWNERS`, `dependabot.yml` and PR and issue templates once the owner decides their content.
10. `docs/BLOCKERS.md` once held credentials and stays in history; rotate if any were live.

## 6. Cloud side (raise with the owner; none of it is a repo script)

- Cloudflare leftovers: the worker `apple-cf-probe` (created 2026-09-23). The earlier sweep also named `apple-cf-probe-q` and `apple-cf-probe-wf`; the
  listing tools available here cover workers, D1, KV and R2 only, so those two were not re-checked.
  Three unrelated workers (`fizzy-game-ai`, `spinrewriter-bridge`, `dry-salad-ac0b`) are not referenced by this repo.
- The `golem` worker must stay until its Durable Object namespaces are migrated; deleting it deletes their storage.
- Physical `golem-*` resources (`golem-corpus` D1, `golem-kv`, `golem-docs` Vectorize, the `golem` AI Gateway) need recreate-and-migrate, not a text edit.
- Supabase: run `node platforms/supabase/migrate.mjs --verify --url <db url>` before documenting which migrations are applied: the remote ledger has 8
  timestamped entries (the first `init_golem_schema`), the repo has 13 numbered files.
- `apps/worker/wrangler.apple.jsonc` commits `BILLING_TEST_ADMINS` (a personal email) and `CF_ACCOUNT_ID` in a public repo. Moving them out changes deployed vars.
- Owner-dashboard cuts (Groq, Vercel, Hugging Face pages touch about nine registry files each) are not scripted: ask whether a Vercel account exists first.
