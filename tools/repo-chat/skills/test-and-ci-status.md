---
name: test-and-ci-status
description: Explain how tests and CI are organised, which commands run them, what counts are claimed passing, and what is known to be flaky or unmeasured.
---
# Test and CI status

Use for "how do I run the tests", "what does CI do", "do tests pass", "what is covered".

1. Commands: `read_file` the root `package.json` scripts (`test`, `typecheck`, `build`, `e2e`, check scripts) and `pnpm-workspace.yaml`; per-package scripts are in each `apps/*/package.json` and `packages/*/package.json` (use `search_code` `"test":` with glob `**/package.json`).
2. CI: `read_file` `.github/workflows/ci.yml` (jobs, triggers, the cost policy that forbids paid calls and secrets) and `plugin-release.yml`.
3. Latest claimed numbers: `search_knowledge` "tests passing worker plugin" and read `docs/autonomy/CURRENT_STATE.md` / `HANDOFF.md` lines that quote counts (for example "worker 4,576/0"). Treat them as dated claims, not live results: you cannot run tests. Say when they were written.
4. Guards that gate work: `scripts/check-workspace-coverage.mjs` (a test file must belong to a package), `scripts/check-dispositions.mjs`, `scripts/check-backlog.mjs` - `read_file` the header comment of any you mention.
5. Known gaps: `search_knowledge` "not yet seen live unit-tested" and `docs/FAILURES.md` for tests that proved nothing; the repo distinguishes "unit-tested" from "seen live".
6. Answer with the commands, what CI runs, the latest claimed results with dates, and honest limits (read-only: nothing was executed now). Cite `path:line`.
