## The whole matrix is green except one CI step, the GATES.md ledger lint, which fails at HEAD too

**What was measured.** Every suite was run in sequence against the working tree between 17:44:40Z and 17:53:54Z on 2026-09-22. That tree is HEAD `bd6ab34` plus peers' uncommitted work: 359 porcelain entries (247 modified, 17 deleted, 95 untracked, nothing staged).

**Nothing changed while the suites ran:**
- The tree fingerprint (`scripts/lib/tree-fingerprint.mjs`) was `8f6fab46e3d1bf39` before and after every run. It never changed.
- HEAD stayed `bd6ab34` throughout.
- `git status --porcelain` at the start and end are byte-identical (`diff` of `git-status-start.txt` and `git-status-end.txt` came back empty).

So every number below describes one tree.

**Where the output is:**
- Logs: `/private/tmp/claude-501/-Users-moshe-Desktop-RbxAI/97464f8d-2373-4986-8891-45b9c35e572d/scratchpad/understand/baseline/<name>.log`
- Per-run records: `results.jsonl` in the same folder
- Runner script: `.../scratchpad/understand/run.sh`. It records exit code, duration and the fingerprint before and after each run.

**Environment**
- node v26.8.1, pnpm 11.13.0.
- `luau`, `luau-analyze`, `lune` and `rojo` are all present.

### Safety checks before running (measured)
- **Paid-provider flags: none.**
  - Across all offline test files, the only env vars read are `GOLEM_SANDBOX_SENTINEL`, `LUAU_BIN` and `NODE_V8_COVERAGE`. Found by grepping `process.env.*` over the `*.test.mjs` files plus `selftest.mjs`.
  - The worker's one `process.env.CLOUDFLARE_API_TOKEN` hit is a string literal in a fixture, not a read (`apps/worker/tests/sandbox-contract.test.mjs:275`).
  - The shell has no provider, spend or live variable set. The only related names are the harness's own `ANTHROPIC_BASE_URL`, `API_TIMEOUT_MS` and `CLAUDE_CODE_MESSAGING_TOKEN`.
  - `packages/evals/src/selftest.mjs:1-4` describes itself as "Offline self-test ... No network".
- **Nothing writes into the repo.**
  - The plugin, apple-plugin and crystal-canyon test and mutation scripts write only under `mkdtempSync(tmpdir())`, for example `apps/plugin/tests/mutation-check.mjs:436` and `apps/plugin/tests/run.mjs:845`.
  - `gate-check --lint` exits at `scripts/gate-check.mjs:726`, before any `writeFileSync`. Its header (line 29) says "parse only, execute nothing".
- I did not run `infra/supabase/tests/rls-isolation.mjs`, any e2e/Playwright suite, any deploy, or any install.

### How the gate is built (read from `scripts/gate-suite.mjs`)
- **Parts, in order** (lines 116-214):
  1. `check-module-resolution`
  2. `check-workspace-coverage`
  3. `check-escape-hatches`
  4. `check-deadends --gate`
  5. `check-rebrand --offline`
  6. `check-copy`
  7. `check-proof-figures`
  8. `check-api-base`
  9. `check-ci-references`
  10. `check-schema-drift`
  11. `check-unstyled-classes`
  12. `npx astro build` in apps/site
  13. `npx vite build` in apps/web. This is vite only; unlike the package's `build` script, it runs no `tsc`.
  14. `pnpm -r test`
  15. `node --test tests/*.test.mjs`, which is 39 files.
- **Verdict:** `SUITE GREEN` requires three things (lines 216-280):
  - every part exits 0;
  - no `fail N>0` or `SELFTEST FAIL` anywhere in the output;
  - an unchanged tree fingerprint.
- **Count:** it sums only lines of the form `pass N` / `fail N` (lines 282-285). So Luau spec counts, mutation counts and selftest `ok` lines are not in its total (inferred from the regex).
- **CI steps it does not run** (`.github/workflows/ci.yml`):
  - `pnpm -r typecheck` (line 91)
  - `gate-check.mjs --lint` (line 133)
  - `check-site-links` (164), `check-credit-figures` (171), `check-site-semantics` (177), `check-dispositions` (185)
  - `check-app-bundle` (191), `check-landing-budget` (199), `check-asset-wall` (208)
  - `pnpm --filter @golem/evals check` (281)
  - I ran all of these separately, below.

### Results table

| suite | command (cwd) | exit | passed | failed | duration | notes |
|---|---|---|---|---|---|---|
| web typecheck | `pnpm run typecheck` = `tsc --noEmit` (apps/web) | 0 | – | 0 | 5s | |
| web test | `pnpm run test` = `node --test` (apps/web) | 0 | 2072 | 0 | 4s | 2072 `✔` lines; 0 hits for `simple` in the log |
| web build | `pnpm run build` = `tsc --noEmit && vite build` (apps/web) | 0 | – | – | 7s | `dist/assets/index-BSdMW2lW.js 477.85 kB │ gzip 144.76 kB`; no warnings |
| worker typecheck | `tsc --noEmit` (apps/worker) | 0 | – | 0 | 2s | no tsbuildinfo, so not incremental |
| worker test | `node --test` (apps/worker) | 0 | 3706 | 0 | 13s | |
| site test, before build | `node --test tests/*.test.mjs` (apps/site) | 0 | 246 | 0 | 5s | 13 site tests read `dist/`, which at that point was from 20:15 local time |
| site build | `astro build` (apps/site) | 0 | – | – | 3s | 20 pages built |
| site test, after build | same (apps/site) | 0 | 246 | 0 | 5s | green against the fresh build too |
| site typecheck | `astro check` (apps/site) | 0 | – | 0 errors / 0 warnings | 4s | 43 files, 2 hints: `addListener` deprecated at `src/sound/interface-sound.js:397` |
| training | `node --test src/*.test.mjs` | 0 | 588 | 0 | 8s | |
| sdk | `node --test` | 0 | 90 | 0 | 7s | |
| evals (offline default) | `node src/selftest.mjs && node --test src/*.test.mjs tasks-visual/*.test.mjs` | 0 | selftest 43 ok + 1415 tests | 0 | 20s | `SELFTEST PASS`, 27 suites, 0 `FAIL` lines |
| evals check | `pnpm run check` (28 × `node --check`) | 0 | – | 0 | 2s | CI step |
| root tests | `node --test tests/` (repo root) | 0 | 526 | 0 | 74s | 39 root files; the slowest part |
| plugin test | `node tests/run.mjs && node --test tests/companion.test.mjs && node tests/mutation-check.mjs` | 0 | 250 Luau spec cases (11 specs) + 1 node test | 0 | 3s | **mutation-check: all 56 mutations caught** |
| plugin typecheck | `node tests/syntax-check.mjs` (luau-analyze) | 0 | 8 files parse | 0 | 1s | |
| apple-plugin test | `node --test tests/*.test.mjs` | 0 | 41 | 0 | 1s | its package defines no mutation check |
| crystal-canyon (benchmark) | `node --test … && run.mjs && mutation-check.mjs` | 0 | 4 node + 124 Luau cases (9 specs) | 0 | 1s | mutation-check: all 35 caught |
| lumen-isles | `node --test tests/*.test.mjs` | 0 | 8 | 0 | 0s | |
| corpus | `node --test "src/**/*.test.mjs"` | 0 | 282 | 0 | 1s | typecheck (`node --check`) exit 0 |
| design | `node --test src/*.test.mjs` | 0 | 80 | 0 | 0s | typecheck exit 0 |
| shared typecheck | `tsc --noEmit` | 0 | – | 0 | 0s | the package has no test script |
| git diff --check | `git diff --check` (+ `--cached --check`, + `HEAD --check`) | 0 / 0 / 0 | – | – | 0s | no whitespace errors; nothing staged |
| **gate suite** | `node scripts/gate-suite.mjs` (root, run last) | **0** | **9059** | **0** | **122s** | `SUITE GREEN`; fingerprint unchanged |
| **CI: ledger lint** | `node scripts/gate-check.mjs --lint` | **1** | – | **12 problems** | 0s | `LEDGER MALFORMED — 44 gates, 12 problem(s)`; see Failures |
| CI: app bundle | `node scripts/check-app-bundle.mjs` | 0 | – | – | 0s | entry 141.4 kB gzipped; eager graph 283.2 kB across 4 files |
| CI: landing budget | `node scripts/check-landing-budget.mjs` | 0 | – | – | 0s | markup + CSS 16535 B gz / 19000; JS 28520 / 36000; images 29617 / 40000 |
| CI: site links | `check-site-links.mjs` | 0 | – | – | 0s | 812 internal links across 20 pages, all resolve |
| CI: credit figures | `check-credit-figures.mjs` | 0 | – | – | 0s | |
| CI: dispositions | `check-dispositions.mjs` | 0 | – | – | 0s | `DISPOSITIONS SOUND — 33 examined, 0 findings` |
| CI: asset wall | `check-asset-wall.mjs` | 0 | – | – | 0s | no library section, which is the recorded state since 2026-09-20 |
| CI: site semantics | `check-site-semantics.mjs` | 0 | – | – | 0s | 20 pages sound |

**The gate total matches my separate runs exactly.** The `pnpm -r test` members add up to 8533: 41 + 4 + 8 + 1 + 246 + 2072 + 3706 + 282 + 80 + 1415 + 90 + 588. Adding the 526 root tests gives 9059, the gate's own `tests passed: 9059`. So the gate measured the same tests I did. The gate's checker parts all exited 0, because `SUITE GREEN` requires that; their success output isn't printed.

### Failures

**The only red: `gate-check --lint` exits 1.** The output is:
- `gate-check: G-S1: evidence is missing git-sha= — write it with --approve rather than by hand`
- the same message for `tree-clean=` and `at=`;
- the same three missing fields on **G-SEC-1, G-ORACLE-7 and G90**;
- that makes 4 gates × 3 fields = 12 problems.

Where it comes from:
- **It is already broken at HEAD.** I ran `git show HEAD:GATES.md` to a scratch copy and linted it with `--file`. The result was the same 12 problems and exit 1, so this is not from the uncommitted GATES.md edits (`git diff --stat -- GATES.md`: 16 insertions, 1 deletion).
- **The ledger says why.** G90's note (GATES.md, around lines 382-389) says two recorders write evidence in different shapes:
  - `gate-check --lint` requires `git-sha=` + `tree-clean=` + `at=`;
  - unlazy's `evidenceFor()` writes only `exit/shell/cwd/path/EXPECT/output-sha256/output-bytes`;
  - `check-escape-hatches` accepts either shape.
  - The G90 EVIDENCE line at GATES.md:437 is the short shape. I read that one line; I did not open the other three gates' evidence lines.
- **Classification: none of (a), (b) or (c).** It is a ledger/checker contract disagreement that the ledger itself documents as open. No code regressed. It is not environmental, and the ledger reads "LEDGER MALFORMED" the same way on every machine.
- **Inferred:** CI's "Ledger is well-formed" step (`ci.yml:133`) would go red on it.

**Everything else passed: 0 failing tests in any suite.** No failures needed (a)/(b)/(c) classification.

### Tommy's historic `diff: 'simple'` failure
- **It does not reproduce.** apps/web test is 2072 pass, 0 fail, and `grep simple web-test.log` returns nothing. The gate suite also had 0 failures.
- **The phrase names no test.** I wrote a scratch probe outside the repo (`scratchpad/understand/probe/p.test.mjs`) with a failing `assert.equal` and a failing `assert.match`. Node v26.8.1 printed `diff: 'simple'` as the last property of both AssertionError dumps. Any failing assertion ends that way.
- **The only record in the repo is commit `cf17dc7`** (2026-09-21 13:49 +0300, "SUITE RED named the part and not the test, twice in one night"). It quotes `old -> diff: 'simple' | }`, which is what gate-suite used to print as the tail of a failing `node --test` part. That incident was in **root tests (38 files)**, not apps/web: "9,051 passed, 1 failed", then re-run by hand at 521/521 and attributed to a race with another lane editing the tree. Commits `cf17dc7` and `82fcd58` changed gate-suite to hoist the `✖ <name>` lines and the error reason lines instead (`gate-suite.mjs:223-247`).
- **I could not identify which apps/web test Tommy's instance was.** I searched the repo, `~/.claude/projects/**/*.jsonl` (all RbxAI project directories, including worktrees) and `~/Library/Application Support/Claude`, with both an exact and a loose pattern. There were zero matches outside `cf17dc7`. Which test it was is unknown; I did not find the original output.

### Stale documentation and contradictions (measured by reading)
- **AGENTS.md:81-82 test totals are stale.** The file still reads "worker 3,184 · web 1,799 · evals 1,328 · site 34". HEAD has the same lines, so no peer is editing them. Every suite has grown:

| suite | AGENTS.md says | measured now |
|---|---|---|
| worker | 3,184 | 3706 |
| web | 1,799 | 2072 |
| evals | 1,328 | 1415 |
| site | 34 | 246 |

  - The file counts are stale in the same direction: worker 265, web 176, evals 98, root 39 and site 46 `.mjs` files, against the claimed 199, 136, 96, 28 and 8.
  - This is type (b): the documentation lags behind code that grew.
- **G90 contradicts itself.** The box is `- [x] G90` at both HEAD (line 357) and the working tree (line 372), while its note says "THE GATE IS STILL UNTICKED". The note's two remaining reasons no longer hold:
  - It says gate-suite includes check-app-bundle and check-landing-budget. The current `gate-suite.mjs` names neither; they are CI steps (`ci-parity.mjs:122-123`, `ci.yml:191,199`), and both pass now.
  - It gives `SUITE RED — check-proof-figures` as the third reason. check-proof-figures passes inside today's green gate suite.
  - What still holds is the lint failure above: G90's evidence line lacks `git-sha`, `tree-clean` and `at`.

### Environment observations
- **An orphaned test process from an earlier session is still running.**
  - PID 68740, PPID 1, started Mon Sep 21 14:46:41 2026: `node --test tests/demo-stages-fit.test.mjs` with cwd `apps/site`.
  - It has been idle at 0% CPU for about 30 hours.
  - It listens on 127.0.0.1:65529, a port the OS assigned (`demo-stages-fit.test.mjs:72` uses `listen(0)`), so it cannot collide with other runs.
  - It is not mine and I left it alone. Inference: it hung after launching Chromium or its server.
- **There are 34 Finder-style duplicate directories named `* 2` inside `node_modules`.** Examples: `apps/web/node_modules/react 2`, `apps/worker/node_modules/@golem 2`, `apps/worker/node_modules/.bin 2`, `apps/site/node_modules/@astrojs/check 2`. Node resolves exact names, and `check-module-resolution` passed inside the gate. My guess is file-sync or copy conflict copies on ~/Desktop; I did not verify the cause.

### Measured versus inferred
- **Measured:** every exit code, count and duration in the table (tee'd logs), the fingerprint and status invariance, the HEAD-copy lint, the node v26 `diff: 'simple'` behaviour, and the orphan process with its socket.
- **Inferred:**
  - that `cf17dc7`'s race explanation is right. I did not re-run that historical state.
  - that gate-suite's total excludes Luau, mutation and selftest counts. This is from reading the regex, and it matches the arithmetic.
  - that CI would be red on the ledger lint. I did not look at GitHub Actions.
  - the cause of the `* 2` duplicates.

## KEY FACTS
- Whole matrix measured in sequence 17:44:40Z–17:53:54Z against HEAD bd6ab34 plus 359 uncommitted peer paths. The tree fingerprint stayed 8f6fab46e3d1bf39 before and after every run, and git status was byte-identical start to end.
- node scripts/gate-suite.mjs: exit 0, 'tests passed: 9059 failed: 0', SUITE GREEN, 122s. 9059 is exactly the sum of the separate runs: 8533 from pnpm -r test members plus 526 root tests.
- apps/web: typecheck exit 0 (5s); test 2072 pass / 0 fail (4s); build exit 0 (7s), entry chunk 477.85 kB / 144.76 kB gzip.
- apps/worker: typecheck exit 0; test 3706 pass / 0 fail (13s).
- apps/site: test 246/0 both before and after a fresh astro build (13 site tests read dist/); build exit 0, 20 pages; astro check 0 errors, 0 warnings, 2 deprecation hints at src/sound/interface-sound.js:397.
- packages: training 588/0, sdk 90/0, evals SELFTEST PASS (43 ok) + 1415/0, corpus 282/0, design 80/0; shared typecheck exit 0. No paid-provider env flags are read by any offline test or set in the shell.
- Root: node --test tests/ gives 526/0 in 74s, the slowest single part.
- apps/plugin: 250 Luau spec cases + 1 node test pass; mutation-check 'all 56 mutations caught'. apps/apple-plugin 41/0 and defines no mutation check. crystal-canyon: 4 node + 124 Luau cases, mutation-check 35/35 caught. lumen-isles 8/0.
- git diff --check, git diff --cached --check and git diff HEAD --check all exit 0; nothing is staged.
- The only red anywhere is the CI step 'node scripts/gate-check.mjs --lint': exit 1, 'LEDGER MALFORMED — 44 gates, 12 problem(s)'. G-S1, G-SEC-1, G-ORACLE-7 and G90 EVIDENCE lines each lack git-sha=, tree-clean= and at=. HEAD's GATES.md fails identically, so it predates the uncommitted edits. It is the documented recorder-shape disagreement, not a code regression.
- Tommy's diff: 'simple' failure does not reproduce (web 2072/0, no 'simple' in the log). Node v26.8.1 prints diff: 'simple' as the last line of every AssertionError (scratch probe), so it names no test. The only repo record, commit cf17dc7, concerns root tests (38 files), which re-ran 521/521 and were attributed to a race. The specific apps/web test could not be identified.
- AGENTS.md:81-82 test totals are stale, and every suite grew: worker 3,184 → 3706, web 1,799 → 2072, evals 1,328 → 1415, site 34 → 246.
- GATES.md G90 is ticked [x] at HEAD line 357 and working-tree line 372 while its note says 'STILL UNTICKED'. The note's stated reasons (bundle budgets, check-proof-figures) no longer hold; its evidence-shape lint failure does.
- An orphaned apps/site 'node --test tests/demo-stages-fit.test.mjs' (PID 68740, PPID 1, started 2026-09-21 14:46) is still alive, idle, on an OS-assigned port. It is harmless to results and was left untouched.
- 34 Finder-style '* 2' duplicate directories exist under workspace node_modules (e.g. apps/web/node_modules/react 2, apps/worker/node_modules/@golem 2). check-module-resolution still passes.

## OPEN QUESTIONS
- Which apps/web test was Tommy's historic diff: 'simple' failure? No local transcript or repo text records it beyond cf17dc7, which describes a root-tests incident rather than apps/web.
- Should the gate-check --lint versus unlazy evidenceFor() evidence-shape disagreement be settled, by re-recording G-S1, G-SEC-1, G-ORACLE-7 and G90 with --approve or by changing the lint? Until then the CI 'Ledger is well-formed' step stays red.
- Should G90's [x] tick and its 'STILL UNTICKED' note be reconciled, since the note's bundle-budget and check-proof-figures reasons no longer hold?
- Should the orphaned demo-stages-fit.test.mjs process (PID 68740) be killed by its owning lane? It points to a site test that can hang after launching Chromium or its server.
- Are the 34 '* 2' duplicate directories in node_modules (for example from ~/Desktop file sync or a copy conflict) a risk to module resolution later, even though check-module-resolution passes today?
- gate-suite's 'build web' part runs 'npx vite build' without tsc, unlike the package's own build script (tsc --noEmit && vite build). Is that intended, given CI runs pnpm -r typecheck separately?