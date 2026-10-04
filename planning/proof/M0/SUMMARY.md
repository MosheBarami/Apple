# M0 summary: safety and one repo (2026-10-04)

All figures below were measured on 2026-10-04 and say where they came from.

1. **Deployed code on `main`:** `2ffd22db` (production, branch `research-feed`) is an ancestor of GitHub `main`. It came in through #15 as a merge commit (`6fd0f019`). `git rev-list --count research-feed..main` = 0, so no `main` commit needed cherry-picking.
2. **Health = `main` HEAD:** after `node infra/deploy-worker.mjs apple` from a clean clone at `71aa6776`, `/api/health` on both `studpilot.app` and `apple.moshe-barami111.workers.dev` reported `"buildSha":"71aa6776"`, with no `-dirty`, while `origin/main` was `71aa6776`. Each later commit to `main` (#24, then the commit adding this file) is redeployed the same way; the check at the commit that adds this file is the first entry of `planning/proof/M1/LOG.md`.
3. **CI green on `main`:** CI passed on `main` at `6fd0f019` and at `71aa6776`. In between, owner-merged Dependabot #20 (TypeScript 7) turned `main` red. #23 fixed it: site and web back on TypeScript 5, and the sdk fixtures no longer use the removed `baseUrl`.
4. **Planning committed, GOAL replaced:** `GOAL.md` now points at `planning/STUDPILOT-FINAL-PLAN.md`. `git ls-files research planning | wc -l` = 92. `git check-ignore docs/handoff/2026-10-04/design-language-v4.md` prints nothing.
5. **Spend caps restored:** `/api/admin/spend` limits are 150,000 billable neurons a day ($1.65) and 2,270,000 a month ($24.97), with `maxMonthlyUsd` 24.97, down from 1,000,000,000 and 30,000,000,000. `tests/spend-caps.test.mjs` asserts that monthly × $0.011/1000 ≤ $25.
   - **Handoff error:** the handoff's neuron figures (150,000,000 and 2,270,000,000) were 1,000× its own dollar figures, so the dollar figures were used.
   - **Pending:** owner approval (X3).
6. **Stored caps fixed:** a stored runtime cap can no longer outlive a lower compiled cap (`BudgetDO.limits`). Red-first was shown.
7. **Secrets hygiene:** `.env` and `apps/worker/.dev.vars` are `-rw-------`. `.claude/settings.json` (the owner's file) changed only by adding the three deny entries `Read(**/.env)`, `Read(**/.dev.vars)`, `Edit(**/.env)`. `.backups/` moved to `~/StudPilot-backups/`. `scripts/secret-scan.py` on a clean clone of `main`: 29,350 blobs, current tree clean, 6 historical exposures, all on the register.
8. **Worktrees:** 4 fix worktrees and 9 merged `wf_*` worktrees were removed. 4 `wf_*` worktrees with unmerged commits were kept (`worktrees.md`).
9. **Tests (local, after the TypeScript 7 fixes, all 0 failures):**
   - worker 5,419 (5,415 pass, 4 skipped); web 2,451; evals 1,479 (1,474 pass); site 311; corpus 286; sdk 89; plugin 79; root 630 (614 pass).
   - **Exception:** `packages/asset-library` fails 2 tests on this Mac only, because its local, gitignored media store is partial. CI has no store and skips those 2.
10. **Spend:** 356,384 billable neurons ($3.92) this month at both the start and the end of M0. No AI calls were made for M0 (`planning/proof/ops/spend.md`).

**Also done:** the live `/pricing` page had claimed "about 33,333,666 Credits of building a day". The site was rebuilt and redeployed, and it now reads 5,333 (from the restored ceiling).
- **Regression found:** the first redeploy shipped five text regressions from the compiler update ("include.Paid", "and6", "up to1", two "&amp;" headings).
- **Fix:** fixed and redeployed within minutes. #24 adds a guard that reads the built pages; it was shown red against the bad build and green against the fixed one.
- **Rollback copy:** 73 of 73 pre-deploy paths in `~/StudPilot-backups/static-rollback-2026-10-04`.

**Not done or not verified:**
- **X1:** the Codex app is still open. Its only RbxAI session was aborted at 14:37, and no foreign commits landed on my branches.
- **Workers Builds:** its `main` trigger (`npx wrangler deploy` from the repo root) fails on every push. It has deployed nothing, but it is a loose end.
- **Dependabot:** PRs #16–#19 are open, including Vite 8. Merging them unreviewed is what broke CI once already.
