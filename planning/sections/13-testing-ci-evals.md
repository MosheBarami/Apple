# 13. Testing, CI and evaluation infrastructure

Scope: what Apple tests, what its CI blocks, and how it measures whether the product is good. Source tree is branch `research-feed` (`/Users/moshe/Developer/RbxAI-feed`, commit `2ffd22db`, identical to `fix-r3`) unless a path says `RbxAI/` (main repo, used for `research/` and `docs/autonomy/`).

How to read the evidence labels in this section:

- **Measured** means I ran a quick read-only command or script in this checkout today (2026-10-04).
- **Reported** means a figure from the dossier brief or from a log or doc in the repo that I did not re-run.
- **Inferred** means my reading of the code.

I ran no suite and no browser. Pass counts below are reported unless they say measured.

## 13.0 Summary for planners

1. **The mechanism is heavily guarded, the outcome is barely measured.** About 8,000 tests across the workspace pass (worker alone: 5,388 pass / 0 fail on 2026-10-04, reported). The same commit, built from one line ("mine glowing crystals…"), was scored 2/10, 1.5/10 and 1.5/10 by three fresh blind critics (`RbxAI/research/roblox/phase-t/t1-round{1,2,3}/critique.md`). The suite proves the harness behaves; it says nothing about whether the games are good. The round-4 preparation log states it plainly: "Local passing checks and deployment are not game acceptance."
2. **The two evaluation instruments the owner built have each run once or not at all.** The owner benchmark (30 requests) ran once, on 2026-10-02, before most of the current agent existed. The held-out bank (21 requests) has no result file. The Phase T bank (5 games) has one game in four rounds and no scored result file (`research/roblox/phase-t-results.md` does not exist).
3. **The judge and the builder are the same model.** The `vision` role (benchmark judge, `look`, blind critique) is `@cf/zai-org/glm-5.3-flash`, the same model that builds (`apps/worker/src/gateway.ts:93`). `research/roblox/phase-t/MODEL-COMPARISON.md` keeps it that way on purpose "so the checks are equal". Nobody has calibrated that judge against a human.
4. **A source-text ratchet sits at the center of the agent's context budget.** Measured today: `toolDefs(true)` is 122 tool definitions, 125,953 serialised characters, and the Apple agent's transcript budget is 60,012 characters. A test requires it to stay above 60,000. **Twelve more characters of tool-definition text turns the worker suite red.** Details in 13.2.3.
5. **CI is deterministic and secret-free, and its cost is a business constraint.** Six parallel jobs, a merge ruleset requiring all six, no model calls, no secrets. On the private repo it exhausted the free quota (2,044 of 2,000 minutes by 2026-09-23) and every job was refused until the owner made the repo public on 2026-09-24 (`RbxAI/docs/autonomy/OWNER_QUEUE.md` Q-001).
6. **The acceptance machinery is in two states at once.** `GOAL.md` (untracked, 2026-10-04) retires "the fixed meter, the V3 scope and `ACCEPTANCE.json` gates, the frontier benchmark loop and the generalize-not-patch test protocol". `CLAUDE.md` in the same repo still says the locked scope is V3 and completion is gates G01–G16. The scripts, the ledger and the tests of that machinery still run in CI (the gate-check lint and the root tests). The planners must decide which one governs.

## 13.1 Test suites

### 13.1.1 Inventory

Counts of `test(`/`it(` call sites are measured by `grep` and undercount parameterised or looped tests. Pass counts are the figures given in the brief or in the repo's validation logs.

| Suite | Path | Command | Files | `test()` sites (measured) | Latest pass count (reported) |
|---|---|---|---|---|---|
| Worker | `apps/worker/tests/` | `cd apps/worker && node --test` | 410 | 5,301 | 5,388 pass / 0 fail, 2026-10-04 (brief). The round-4 log at the same commit says 5,413 run, 5,407 pass, 6 skipped, 0 fail. About 3 minutes. |
| Root cross-app | `tests/` | `node --test tests/*.test.mjs` | 46 | 614 | 614 pass (630 run, 16 skipped, 0 fail per the round-4 log) |
| Evals | `packages/evals/` | `pnpm test` (selftest, then `node --test`) | 63 | 1,247 | 1,474 pass (selftest checks and subtests make up the gap) |
| Web SPA | `apps/web/` | `node --test` | 222 | 2,334 | not in the brief; count by grep only |
| Site (Astro) | `apps/site/tests/` | `node --test tests/*.test.mjs` | 50 | 255 | CI comment cites 272 tests, 47 of them over the built site |
| Studio plugin (shipped) | `apps/apple-plugin/tests/` | `node --test tests/*.test.mjs` | 24 | 79 | 79 |
| Corpus | `packages/corpus/src/**/*.test.mjs` | `pnpm test` | 20 | 286 | 286 |
| Design library | `packages/design/` | pnpm test | 3 | 80 | not reported |
| SDK | `packages/sdk/tests/` | pnpm test | 11 | 89 | not reported |
| Asset library | `packages/asset-library/` | pnpm test | 3 | 22 | not reported |
| Components (Luau, behaviour) | `packages/components/tests/` | `node --test tests/*.test.mjs` | 4 | 6 | not reported |
| Crystal Canyon benchmark game | `apps/benchmark/crystal-canyon/tests/` | `node tests/run.mjs` plus mutation check | 8 Luau specs plus a manifest test | 4 | Luau specs run under `luau` |
| Legacy plugin (fixtures only) | `apps/plugin/tests/` | `node tests/run.mjs` | 11 Luau specs | 1 | still run, because worker and eval tests read its files |
| Playwright smoke | `tests/e2e/*.spec.ts` | `pnpm exec playwright test` | 2 | 32 specs times 3 viewport projects | no count reported |
| Security regression | `packages/evals/src/security.test.mjs` | inside evals | 1 (3,523 lines) | 56 | 56 pass in 14 s (round-4 log) |

Totals: 97,662 lines of worker test code against 105,266 lines of worker source (measured). Worker source is 248 files. The two largest files are `apps/worker/src/do/session.ts` (7,790 lines) and `apps/worker/src/tools.ts` (6,934 lines).

### 13.1.2 What each suite covers

**Worker (`apps/worker/tests/`).** Almost every behaviour of the backend, grouped roughly as:

- *Agent run loop and its traps*: `run-loop-traps.test.mjs`, `run-flow`, `run-unstick`, `loop-guard-names-the-loop`, `stop-signal`, `single-flight`, `busy-refusal`, `tool-recovery`, `plan-never-traps`. These drive a real `SessionDO` through a harness.
- *Self-check and judges*: `self-check-*`, `blind-critique`, `claim-audit*`, `client-judge*`, `composed-answer-gates`, `look-*`.
- *Billing, credits and quota*: `billing-*` (about 15 files, including Stripe API shape, webhook authority, test key refused in production), `quota-*`, `budget-admission`, `spend-ratchet`, `retry-does-not-multiply-the-bill`, `run-refund`.
- *Studio ops and plugin contract*: `studio-*`, `plugin-capabilit*`, `pairing`, `op-attribution`.
- *Building tools and composers*: `compose*`, `prefabs*`, `terrain-*`, `ui-*`, `world-building-*`, `genre-kit-*`, `tycoon`, `plot-sim*`, `verified-modules`.
- *Collaboration, notifications, membership, Discord, support, export, retention, analytics, Sentry*.
- *Prompt and tool hygiene*: `prompt-*`, `no-subject-literals`, `tool-contract`, `tool-permissions`, `reply-style-rules`, `english-output`.

**Root `tests/`.** Tests of the repo's own checkers and cross-app claims: `check-*.test.mjs` (every checker has a test that makes it fail), `gate-check`, `no-golem-guard`, `rebrand-enforced`, `release-rules`, `rollback-*`, `promises-match-the-product`, `model-claims-are-measured`, `playbook-claims`, `ui-references`, `template-curation`. Some of these test the retired autonomy tooling (`autonomy-harness`, `owner-autonomy-hooks`, `owner-autonomy-lifecycle`).

**Evals.** Three different things share the package, and the name hides it:

1. *Offline unit tests of eval machinery and static analysers*: the Luau AST, dataflow, flow, graph and symbol tools (`luau-*.test.mjs`), the Roblox anti-pattern rules, the grader, scoring, leaderboard, history, retrieval eval, plus `selftest.mjs`.
2. *The security regression suite* (13.2.4).
3. *Runners that cost money and are never run in CI* (13.4.5).

**Web.** Largest test count in the repo: models, API client, auth flows, usage meter, activity model, collaboration, accessibility and so on. These are mostly model/logic tests; UI rendering is covered by the site's Chromium-based tests, not by the SPA.

**Site.** Claim-integrity tests: published pricing against the worker's charge, privacy claims, onboarding copy, contrast, type system, "recorded run is evidence", "proof is evidence". Three of them decode real pixels from a rendered page, which is why CI installs Chromium (`built-screen-pixels`, `demo-stages-fit`, `rendered-typography`).

**Plugin (`apps/apple-plugin/tests`, 79).** Node tests over the Luau sources and a mock Studio (`studio-mock.mjs`): `property-allowlist`, `protocol-coverage`, `worker-capability-contract`, `render-parity`, `ops-*`, `studio-compile`, `studio-engine-proof`, `restore-engine-proof`, `generation-engine-proof`. The shipped plugin is not run inside real Studio by any test in CI; the "engine proofs" are Luau files run by hand in Studio (`scripts/run-apple-*-proof.luau`). CI's only look at the built artifact is `apps/apple-plugin/scripts/verify-artifact.py` over the `.rbxm` bytes.

**Crystal Canyon and legacy plugin Luau specs.** Real Luau, run under the `luau` binary in CI (pinned 0.663), with a **mutation check** (`tests/mutation-check.mjs`) that injects known bugs and demands the suite go red. This is the most rigorous test design in the repo, and it covers the smallest amount of code.

**Corpus (286).** Chunking, packing, index plan, API signatures, and since Phase R the research-to-chunks path (`research-chunks.test.mjs`) and skill-card chunks. `GOAL.md` says these format tests are the only checks Phase R runs.

**Playwright smoke.** `landing.spec.ts` (25) and `atmosphere-on-every-route.spec.ts` (7), against a static `astro preview` of the built site at desktop, laptop and Pixel 7 sizes. No worker, Supabase or model is involved.

### 13.1.3 Live and deployed probes (not CI)

`infra/smoke.mjs`, `infra/e2e.mjs`, `infra/loadtest.mjs` (30 real users), `infra/store-validation.mjs` (drives the Creator-Store-installed plugin in the owner's Studio), `infra/healthcheck.mjs` (post-deploy check with rollback), `infra/checkpoint-test.mjs`, `infra/real-chat.mjs`, and `scripts/critical-flows.mjs` (four SaaS flows against production, with three verdicts: pass, fail, **unknown**). They need the owner's credentials in `.env` and cost credits. The brief's rule stands: live builds, pairing and the benchmark run only on the owner's Mac.

## 13.2 The checks that shape development

### 13.2.1 Source-text pinning

A large share of the worker suite does not run the code; it reads the source file and asserts on its text.

| Measure (worker tests) | Count |
|---|---|
| Test files that `readFileSync` a `src` path | 139 of 410 (34%) |
| `assert.match(src\|code\|source…)` calls | 116 |
| Files that bundle real code with esbuild and import it | 300 |
| Files that use the real-SQLite `SessionDO` harness (`session-harness.mjs`) | 28 |
| `-live` route tests (real Hono app, fake env) | 26 |

Typical shape: slice `SESSION.slice(SESSION.indexOf('private refuseAbusive('), SESSION.indexOf('private captureProvenance('))` and require a call inside a character window (`abuse-attribution.test.mjs` uses `indexOf(...) + 220`). The brief's `CLAUDE.md` warns the same way: "A pure move or reorder can fail them; run the whole suite, not just the file you touched."

The repo knows the cost. `.claude/skills/rbxai-working-rules/SKILL.md` §2, "Guards that fail when the code gets better", says this happened eight times in one session, e.g. a refusal pinned to an exact call that then gained a safer third argument. The newer tests use brace-matching (`braceBlock` in `security.test.mjs`) and behavioural harnesses instead of neighbour landmarks, and the test author's own comments call the real-SQLite harness the fix for "a database that accepts every write and answers every read with nothing".

### 13.2.2 No-subject and banned-words tests

Owner directive "generalize-not-patch" (2026-10-02): the first benchmark failed because the harness held the subjects of earlier benchmarks as code (a knife for a treasure chest, a Doge head for a robot pet).

- `apps/worker/tests/no-subject-literals.test.mjs` scans every worker `.ts` and component `.luau` file, comments stripped but strings and prompts kept, for 19 banned words (laundry, pizza, piano, donut, crown, duck, tomato, pumpkin, `Doge`, and others) and four raw strings. It also checks the run loop is structurally free of a forced tool, a pre-model library step and a "best" fallback, and tests the scanner on in-memory fixtures so the scanner is seen to fail. Its allowlist (`no-subject-literals.allow.json`) is a **tripwire that may only shrink**; entries are things like Roblox's own `Enum.UserInputType.Keyboard`.
- `prompt-no-subjects.test.mjs` scans what the model actually receives: the assembled system prompt, craft cards, every tool definition and the creator skills.
- Adjacent text guards: `reply-style-rules` (the prompt must tell the agent to reply in plain words to a young creator), `english-output`, `mode-names-are-the-product`, `check-copy.mjs` (rejects the sentence shapes of four competitor pages).

This family guards a real failure but also freezes a policy ("the harness may not know any subject") that the Phase R and Phase T direction partly reverses: `GOAL.md` wants deep game-design knowledge fed into the agent. The banned-word list is test-bank-derived, so it protects the old bench, not the new bank.

### 13.2.3 The tool-definition context budget (the 12-character margin)

The test: `apps/worker/tests/run-loop-traps.test.mjs`, "the context budget a step reports is derived from the model the step is sent to". It asserts `budget.maxChars === promptBudgetForKey('agent', defsChars).maxChars` and `budget.maxChars > 60_000`, where `defsChars` is `JSON.stringify(toolDefs(true).map(…)).length`.

How the number falls out (`apps/worker/src/prompt-budget.ts`): the transcript budget is the tightest of three ceilings (gateway reservation, context window, storage), minus `fixedChars`, the tool definitions that ride on every step. For Apple's agent model the **reservation** binds, so each character of tool definition removes exactly one character of transcript budget.

Measured today with a throwaway script (esbuild bundle of `tools.ts` and `prompt-budget.ts`, nothing written to the repo):

| Quantity | Value |
|---|---|
| `toolDefs(true)` count | 122 |
| Serialised definition characters | 125,953 |
| Apple agent transcript budget (`maxChars`) | **60,012** |
| `limitedBy` | reservation |
| Budget at +12 characters of definitions | 60,000 (test needs strictly more) |
| Budget at +13 characters | 59,999 (red) |

This confirms the brief's "margin about 12 chars on `fix-r3`".

Why it matters:

- The floor 60,000 is the old hand-written constant that "round 4 of the gauntlet" (2026-09-23) cut Apple MAX at, dropping 23 turn groups. The test keeps the derived budget above the old bad value.
- `toolDefs(true)` with no filter is the **whole registry**, not what a given step offers (deferred tools and mode filters shrink the real list). So this is a ratchet on registry size, and any new tool or any longer description trips it.
- The registry nearly doubled from 69 tools / 66,784 characters on 2026-09-23 (`docs/autonomy/CUSTOMER_FINDINGS.md`, F-019) to 122 tools today (inferred: Phase A to R additions).
- `prompt-budget.test.mjs` still assumes `TOOLS_CHARS = 70_000` ("the order of the full tool-definition payload"), now stale by about 56,000 characters. That test proves the arithmetic; the run-loop test is the only one tied to the real registry.
- A related guard keeps the cost down: `more-tools-by-need.test.mjs` and a `CREDITS:` test require that `more_tools {names}` unlocks only the named deferred tools and costs under a quarter of the full lift. The "Hi" test (F-019) requires a greeting be sent no tool definitions at all.

Planner implication: the current tool architecture (one flat registry of 122 definitions, all charged against the transcript) has no headroom left. A final product that adds capabilities has to change how tools are exposed (retrieval by need, grouped lifts, a smaller core), or move the floor deliberately. Do not add a tool without re-deciding this number.

### 13.2.4 Security tests (A1 to A9)

`packages/evals/src/security.test.mjs`. It bundles the worker's Hono app with esbuild, serves a JWKS, mints real ES256 JWTs, replaces `fetch` with a router that records every outbound URL, and asserts behaviour (real 401/403/404) plus labelled static checks where the Cloudflare runtime is needed. Sentinel credentials are fabricated and only variable names are ever printed.

| Group | Property | Tests |
|---|---|---|
| A1 | Provider credentials never reach the browser (`/api/providers`, routing, `/api/me`, `/api/health`, error text, tool errors) | 12 |
| A2 | `tool_end.detail` egress: no credential, JWT or pairing token; `run_state` and `resume` replay only whitelisted fields; size cap drops, never truncates | 9 |
| A3 | Tenant isolation: un-owned project is a 404 and creates no Durable Object; caller JWT reaches PostgREST so RLS decides; every project route goes through `withOwnedProject` | 7 |
| A4 | Admin auth: `/api/admin/*` refused without the key and fails closed; wrong key never accepted; `raw-probe` reserves and settles like any model call; no route outside the exempt list is unauthenticated | 8 |
| A5 | Prompt and tool injection: every tool result entering the transcript is fenced as untrusted; the non-tool transcript injections are "the known, reviewed set"; a model-written plan title reaches a user-role steer only inside its own quotation | 4 |
| A6 | Reserve precedes the model call, settle follows; a refused reservation spends nothing | 9 |
| A7 | Restore and checkpoint routes are ownership-gated and project-scoped | 2 |
| A8 | Plugin pairing token: shape, hash-only storage, TTL, constant-time compare; one pairing cannot address another project's DO | 4 |
| A9 | Every outbound request was answered by the stub; the host list is pinned (no provider or Roblox host reached) | 1 |

Companion tests: `injection-defence.test.mjs` (fence tag built only from a safe tool name, per-run secret id), `prompt-fence`, `secret-redaction`, `luau-ingress`, `net-policy`, `https-only`, `sandbox-network`, `billing-origin-authority`, `billing-test-key-in-production`, and `scripts/secret-scan.py` (full git history, with its own tests and a JWT-role-aware allow for the Supabase anon key).

This is the best-designed part of the testing: behavioural where possible, enumerating (every registered tool must have an argument fixture, so the enumeration cannot silently go stale), and falsified (the round-4 log shows the authors removing a fence to watch a real-`SessionDO` assertion fail). Known limits it states itself: A4 "PRE-EXISTING FINDING" that admin routes carry no user identity and bypass RLS; Durable Object internals are checked by static assertion only.

### 13.2.5 The `check-*` scripts

25 scripts in `scripts/` (6,512 lines). "CI" means invoked directly by `.github/workflows/ci.yml` (verified by grep). "Suite" means in `scripts/gate-suite.mjs`, the full local suite. Every one also has a test in root `tests/` that proves it can fail.

| Script | One line | CI | Suite |
|---|---|---|---|
| `check-api-base.mjs` | Every unattended tool points at the host the product lives on, not the pre-rename worker | no | yes |
| `check-app-bundle.mjs` | Web app first-load bundle budget (built `dist`) | yes | no |
| `check-asset-wall.mjs` | The landing's "N of them" count equals the cards rendered, and every image resolves | yes | no |
| `check-backlog.mjs` | `FEATURES.json` rows cost something to close (cited evidence floor) | no | no (gate G-ORACLE) |
| `check-ci-references.mjs` | Every script CI invokes exists | yes | yes |
| `check-committed-imports.mjs` | No committed file imports an uncommitted one | no | no (root test) |
| `check-copy.mjs` | Site copy avoids the competitor sentence shapes the owner rejected | no | yes |
| `check-credit-figures.mjs` | Published credit prices and "requests per free day" equal what `pricing.ts` charges | yes | no |
| `check-deadends.mjs` | Lists code that is tested but reached by nobody; `--gate` fails on an entry with no disposition | **no** | yes |
| `check-dispositions.mjs` | Dispositions on backlog rows are earned, not pasted (no sentence reused on more than 20 rows) | yes | no |
| `check-escape-hatches.mjs` | Detects the cheap ways to turn red green (`\|\| true`, `.skip`, emptied tests, mass status edits) | **no** | yes |
| `check-landing-budget.mjs` | Landing payload budget: markup and CSS, JavaScript, images, each separately | yes | no |
| `check-module-resolution.mjs` | Workspace links point into this checkout (the F-68 worktree failure) | no | yes (first) |
| `check-no-golem.mjs` | The old product name does not come back (13.2.6) | yes | yes |
| `check-offer.mjs` | Plan price, grant, serving cost and daily capacity agree with each other | **no** | no (G-ORACLE-3) |
| `check-pixels.mjs` | Deployed pages measured by pixels in Chromium | no | no (G-ORACLE-7) |
| `check-proof-figures.mjs` | The three landing numbers recomputed from the data they claim to come from | no | yes |
| `check-rebrand.mjs` | Product called Apple in source string literals (`--offline` in CI; `--deployed` belongs on the deploy path) | yes | yes |
| `check-resolution.mjs` | The code under test is the code you think it is (no in-repo worktree masquerade) | no | no |
| `check-schema-drift.mjs` | Every column the client asks Postgres for exists in the migrations | **no** | yes |
| `check-site-links.mjs` | Every internal link on the 19-page site resolves (577 links) | yes | no |
| `check-site-semantics.mjs` | Heading hierarchy and landmarks | yes | no |
| `check-template-freshness.mjs` | Harvested Luau checked for removed or deprecated Roblox APIs | no | no |
| `check-unstyled-classes.mjs` | Every class the app draws with has a CSS rule | no | yes |
| `check-workspace-coverage.mjs` | Every workspace package is reachable from `pnpm -r test` | yes | yes |

Also in `scripts/`: `gate-check.mjs` (13.2.7), `gate-suite.mjs` (one success-only token for "the whole suite passed", labelled per part), `gate-typecheck.mjs`, `assert-tests.mjs` (a **floor of passing tests**, because `fail 0` is satisfiable by deleting the test), `verify-worktree.mjs` (builds the throwaway clean checkout the full-suite gate runs in), `ci-parity.mjs` (13.3.4), `clean-test-tmp.mjs` (a `pretest` hook; on 2026-10-02 test temp dirs reached 33,903 folders and about 140 GB and stopped every shell), `critical-flows.mjs`.

Noteworthy: **several guards run only on the owner's machine.** `check-deadends`, `check-escape-hatches`, `check-schema-drift`, `check-offer` and `check-unstyled-classes` are not invoked by `ci.yml`. Their own unit tests do run in CI's "Root tests" step, but a violation in the live tree is caught only if someone runs `gate-suite`. The dead-end checker's own header describes the failure it exists for: `critic.ts`, nine hundred lines with a full test suite, "zero bytes of it reached the deployed bundle".

### 13.2.6 `check-no-golem` and its allowlist

Owner decision 2026-10-02: the old name is wiped from every aspect of the product. `scripts/check-no-golem.mjs` scans the **contents and path names of every tracked file** (binary bytes too), against `scripts/golem-allowlist.json`.

- 29 allowlist entries (measured). Each carries a reason and a removal condition. Each has an **exact count** (`max`): a new use fails, and *fewer* hits than `max` also fails so the entry must be lowered. An entry that matches nothing fails. `token: "*"` is allowed only for recorded history and the checksummed database migrations.
- Largest entries by count: legacy deployment identity (130), pending old wire spellings in the compatibility window (144), compat tests (82 worker, 7 web), cloud resource names (62), recorded data (43).
- `node scripts/check-no-golem.mjs --count` prints 0 violations in this checkout (measured).
- `--local` also scans untracked surfaces (settings, memory directories, variable names in `.env*`). CI runs the tracked-only mode.

Tension for planners: `CLAUDE.md` says "Infrastructure names stay `golem`… Renaming breaks live sessions", while the owner's 2026-10-02 decision and the guard say the opposite and schedule removal (runbook phases C and D). The allowlist is in effect the migration plan: wire literals such as `golem.v1`, header names `X-Golem-*`, the worker host `golem.moshe-barami111.workers.dev`, KV and D1 names. Until the phase C and D steps run, at least 701 counted hits stay allowed (the history and migration entries are uncounted wildcards).

### 13.2.7 The dead-ends and dispositions ledger, and `gate-check`

- `docs/backlog/DEADENDS.md` (907 lines): every module that is tested and has no importer needs a disposition: **WIRE**, **DELETE** (with a dated owner statement) or **STRUCTURALLY-BLOCKED**. The checker reports and never fails on the list itself, "because failing on the list would train people to widen the exception list until it was empty". Deleting source to go green is declared a violation.
- `docs/backlog/FEATURES.json` (7,745 lines): the backlog ledger, with `check-backlog.mjs` and `check-dispositions.mjs` making closure expensive (the origin story: `sed -i 's/"not-started"/"done"/g'` once closed 1,249 rows while every check passed).
- `GATES.md` and `scripts/gate-check.mjs`: each gate has a `CHECK:` command and an `EXPECT:` token; a gate counts as met only when the command exits zero **and** the token matches. Modes: verify; `--approve` (rewrite checkbox and evidence from what was measured); `--reverify` (re-run met gates and unmark one whose output hash no longer reproduces, whose tree was dirty, or whose check names a path not in `git ls-files`); `--falsify` (record a **red-first** `FALSIFIED:` line: the gate must be seen failing at a named commit); `--lint` (shape only, runs in CI). Evidence lines record exit code, shell, cwd, git sha, tree-clean, output hash, Node, Luau and Playwright versions, and time. 40 gates ticked, 4 open (`G-S1`, `G-SEC-1`, `G-ORACLE-7`, `G90` "The full suite passes").
- CI runs only `gate-check --lint` (seconds). The gates themselves are not run in CI; the ledger's evidence is local.
- `docs/autonomy/ACCEPTANCE.json` (V3 gates G01–G16, every status `not_evaluated`, `readiness_percent: null`) is a separate, newer ledger enforced by `scripts/autonomy-review-gate.py`, now retired by `GOAL.md`.

## 13.3 CI

### 13.3.1 Workflows

Three workflows in `.github/workflows/` (945 lines).

**`ci.yml` (448 lines)** runs on push to `main`, on **every** pull request (including stacked PRs) and on manual dispatch. `concurrency: cancel-in-progress` per ref, `permissions: contents: read`, **no job is given any secret and none can deploy or call a paid provider** (policy header, "Do not add a deploy step to this file"). Node 22, pnpm 11.13.0.

| Job (required check name) | Timeout | What it does |
|---|---|---|
| `Typecheck and tests` | 20 min | install, pinned Luau 0.663 toolchain, `pnpm -r typecheck`, build the site, install Chromium, `pnpm -r test`, root `node --test tests/*.test.mjs`, `gate-check --lint` |
| `Build site and web` | 12 | build site and web; `check-site-links`, `check-credit-figures`, `check-site-semantics`, `check-dispositions`, `check-app-bundle`, `check-landing-budget`, `check-asset-wall`; upload `site-dist` |
| `Build and verify the Studio plugin (apps/apple-plugin)` | 8 | Luau and pinned Rojo 7.7.0; `apps/apple-plugin/scripts/build.mjs` (parse every source, refuse unbundled requires, rojo build, secret scan, then verify the built bytes); upload `apple-studio-pr-unverified` |
| `Static checks` | 8 | eval script syntax check, `check-workspace-coverage`, `check-rebrand --offline`, `check-no-golem`, `check-ci-references`, Prettier drift (**report only**) |
| `Secrets and dependencies` | 10 | secret scanner's own tests, **full-history** secret scan, assert no `.env` is tracked, `pnpm audit` (**advisory**) |
| `Playwright smoke` | 15 | Chromium, build site, run Playwright against `astro preview` (retries 1 in CI) |

**`plugin-release.yml` (345 lines)**, manual dispatch only: builds and verifies `apps/apple-plugin`, produces a candidate `.rbxm`. It deliberately stops at a human step: Open Cloud cannot update a Plugin asset, so a person in Studio must "Overwrite an existing asset" on the Creator Store plugin "Apple Studio" (asset 107230158271368). No secrets.

**`publish-packages.yml` (152 lines)**: dry-run on push, publish to GitHub Packages only on manual dispatch with "publish" ticked, from `main` or a `packages-v` tag.

Other repo-level controls: `.github/rulesets/main.json`, `.github/CODEOWNERS`, `.github/dependabot.yml` (the pnpm overrides in `pnpm-workspace.yaml` cite a 2026-10-03 Dependabot round), PR template.

### 13.3.2 What blocks a merge

`.github/rulesets/main.json` (applied by `scripts/github/apply-rulesets.mjs`, which refuses to apply when a required check is not green on `main`, and when a required name is not a job `name:` in `ci.yml`):

- no deletion or force-push of `main`;
- a pull request is required, **zero approving reviews**, merge or squash;
- all six jobs above are required status checks, with `strict_required_status_checks_policy: false` (the branch need not be up to date);
- the admin repository role may bypass, in pull-request mode.

Not blocking: Prettier drift, `pnpm audit`, and every check listed "no" in 13.2.5. Nothing in CI runs a model, the benchmark, Phase T, or a real Studio. A green CI says the deterministic code is consistent; it says nothing about game quality or about the deployed product.

### 13.3.3 The cost concern

| Fact | Source |
|---|---|
| Private repo, free plan, 2,000 Actions minutes a month | brief; `RbxAI/docs/autonomy/OWNER_QUEUE.md` Q-001 (measured 2026-09-23: 2,044 of 2,000 used) |
| 2026-09-21 02:58 every job was refused ("recent account payments have failed"), `steps: []`, 1–7 s each | `docs/backlog/CI-IS-BLOCKED-ON-GITHUB-BILLING-2026-09-21.md` |
| 15 runs created on 2026-09-21, 11 cancelled by the next push; cancelled runs still bill what they used | same |
| Two steps added that night (site build and Chromium) cost about 75 s per run | same |
| About 30–40 billable minutes per push (six parallel jobs, minutes are summed per job) | brief; consistent with the job timeouts (73 min ceiling in total) and the CI comment's own timings (install 40 s, typecheck 63 s, tests reach `@apple/web` at 1:13 into the step) |
| Arithmetic: 2,000 / 30–40 is roughly 50 to 66 pushes a month, shared by every lane and every PR update | inferred |
| Resolution: repo made public 2026-09-24, CI ran again (run 35936312090); public repos run Actions free | OWNER_QUEUE Q-001 |

I could not confirm today that the repo is still public: this clone's remotes are local paths and `gh` has no GitHub host here. The memory note `golem-github-remote.md` still says "PRIVATE" (written 2026-08-31), and it also states the rule "never create a public repo… without his approval". Public visibility has consequences the planners must weigh (full git history, including `research/` and the recorded benchmark material, is visible; `check-no-golem` and `secret-scan.py` scanning history become more important, not less).

A subtler cost: a red or refused CI looks identical to a failing test in the GitHub UI. The billing note's rule: "`steps=0` on every job means the run was refused". The same file names the failure mode this repo keeps finding, "a failure to observe rendering as an observation".

### 13.3.4 Local CI scripts

- `scripts/ci-parity.mjs`: clones HEAD to a scratch directory outside the repo and runs the commands from `ci.yml` that can run without an install; each skipped command is **printed by name with the reason**, and a command in `ci.yml` that matches no rule exits 2 ("zero checks out of zero is not a pass"). `--with-build` installs and builds in the clone (minutes, network). Exit 0 covered checks passed, 1 failed, 2 the instrument could not run. It measures HEAD, not the working tree, by design, and its output says it is not a green CI run. Origin: four times in one night a test passed locally and failed on the runner because the local tree carries build output, secrets and other lanes' uncommitted edits.
- `scripts/verify-worktree.mjs`: builds the clean worktree the full suite runs in.
- `scripts/gate-suite.mjs`: the full local suite as one token, including checks CI does not run.
- `scripts/check-committed-imports.mjs`: finds a committed file that imports an uncommitted one (red in every clone but yours).
- `scripts/clean-test-tmp.mjs`: removes temp dirs by known mkdtemp prefix, as a `pretest`.

One mismatch worth testing: `ci.yml` pins **Node 22**, while `CLAUDE.md` says Node 26 runs the `.ts` sources directly and several tests import `../src/*.ts` without a bundler (e.g. `injection-defence.test.mjs`). `ci-parity` does not install or run those tests. I did not verify that this works on the runner's Node (inferred risk, unverified).

## 13.4 Evaluation

Two layers exist and are often confused. **Offline evaluation** is run by the owner, spends credits, and produces a report. **In-product evaluation** runs inside every agent run as a gate (13.4.6). Most of the quality-checking effort of the past two weeks went into the second.

### 13.4.1 The owner benchmark (`packages/evals/owner-bench/`)

Written 2026-10-02 as "the owner's measure of the product".

| File | Role |
|---|---|
| `requests.json` | Bank `owner-30-v1`, frozen 2026-10-02: 30 items. Categories: object 6, silly 5, modify 4 (two-turn), map 4, system 4, ui 3, game 4. Items such as "make me a treasure chest that opens when you touch it", "build a hot air balloon", "make a zombie survival game". "Never edit an item after seeing its score; version the bank instead." |
| `heldout-v1.json` | `owner-heldout-v1`: 21 items, three per category, "written blind by an agent that had not seen requests.json, prompts or skills"; 11 items too close to the main bank were replaced before freezing. Prompts must stay out of skills, RAG, system prompts, tests and fixes. |
| `runner.js` | Pasted into the signed-in owner's browser tab; uses his session. |
| `run.mjs` | The headless equivalent: reset, restore the `bench-baseline` checkpoint, send each turn over the project socket (25 minutes per turn then `/stop`), evaluate, count credits. `--dry-run`, `--max-credits N` (hard budget across invocations), `--only`, `--from`, resume by run name, quota stop. Needs Studio paired and `APPLE_BENCH_JWT` or `APPLE_E2E_*` in `.env`. 359 lines of tests. |
| `score.mjs` | Per-criterion and per-category means, and the product-meter domains by a fixed formula. |
| `review.mjs` | The human pass: writes `review.md`, and `apply` may only **lower** a score, with a reason (keeps `originalScores`). |
| `BASELINE.md`, `results/2026-10-02-baseline.json` | The only result in the repo. |

Per-item protocol: `POST /bench/reset` (conversation and memory go, pairing stays), restore the clean-Baseplate checkpoint, run the turns, `POST /bench/evaluate`.

**The rubric** (`apps/worker/src/owner-bench.ts`, `benchEvaluate`, `judgePrompt`): nine criteria scored 0, 1 or 2: `works`, `professional`, `matches`, `polished`, `noErrors`, `performance`, `sound`, `animation`, `fx`; total out of 18. 0 is bad or absent, 1 acceptable amateur, 2 "what a professional Roblox studio would ship". Evidence given to the judge: a census of the place (parts, scripts, sounds, animations, effects, screens, lights), four real Studio screenshots at fixed camera angles round the bounding box of what was built (front, three-quarter, side, close), one 8-second `play_check`, and the agent's own final answer (first 600 characters). The judge is the `vision` role at high reasoning effort, instructed "You are a harsh senior Roblox game reviewer". Judge output is parsed from the last JSON object that holds `works`, clamped to 0–2. The harness never builds or fixes anything and the agent never sees it.

**Meter formula** (`score.mjs`, from owner memory `frontier-meter-every-turn`): agent 25% (mean of works, matches, noErrors), library 20%, visual 15% (mean `professional` over object, silly, modify, map, game), ui 10% (`polished` over ui and game), sensory 10% (mean of sound, animation, fx), website 20%. Library and website are not measurable by the bench and are **filled with estimates** (15 and 10).

**The one measured result** (`BASELINE.md`, worker `76c30935`, the code before phase 1):

- 28 rows, 26 judged; mean total 7.27/18; 3,423 credits; meter total 27.8%.
- Criterion means (0–2): works 1.19, professional 0.42, matches 0.81, polished 0.38, noErrors 1.58, performance 1.85, sound **0.08**, animation 0.62, fx 0.35.
- By category (mean /18): object 6.33, silly 8.00, modify 6.75, map 5.33, system 8.50, ui 9.67, game 5.00.
- Not measured: p19, g28 (runner lost), g29 and g30 (not run).
- Maps cost 430–584 credits and about 25 minutes each.
- No human review happened (photos expire after one hour; `review.mjs` was written afterwards).
- Eight framework-level causes were derived from the critiques (a pre-model library step took the first name match, a rule forbade building, a harness nudge posed as the user, and so on). These led to the integration-branch work.

The README says a "next run uses the same bank plus `heldout-v1.json`". Neither the integrated-code re-run nor any held-out run has a checked-in result.

### 13.4.2 The Phase T bank and the blind-critic protocol

`research/roblox/phase-t-v1.json` (`RbxAI/`, frozen 2026-10-04): five one-line game ideas, one per genre family, each in a fresh project and chat on a clean Baseplate.

| id | Prompt |
|---|---|
| t1 | "a game where you mine glowing crystals, upgrade your pickaxe and rebirth to unlock deeper caves" |
| t2 | "a 30-stage lava and ice obby with checkpoints, a timer and stages that get harder" |
| t3 | "a co-op tower defense on a jungle path with 20 waves, 5 towers and a boss" |
| t4 | "a short co-op horror run through an abandoned hospital, room by room, with a monster you hide from" |
| t5 | "a bakery tycoon where you buy ovens and conveyors, hire helpers and expand the shop" (only if credits allow) |

**Quality bar** (`research/roblox/PHASE-T.md`): 12 criteria, each 0, 1 or 2, total out of 24, each tied to a research file: core loop end to end; first minute (reward within 30 seconds); progression and economy; saving survives a rejoin; server authority and validated remotes; world art; UI (mobile-safe, 44 px targets, every number real); sound; VFX and feel; monetisation hooks placed correctly; a clean 5-minute run with no Output errors; policy and honesty (the reply claims only what exists). The main judge is Claude inspecting the built place through the Studio tools, with scores to go in `research/roblox/phase-t-results.md` (not yet created).

**Blind critic loop** (owner, 2026-10-04), every game, every round:

1. Capture screenshots: an overview, three or more eye-level views, every UI screen open, play-mode views, into `phase-t/<game>-round<N>/`.
2. Launch a **fresh agent with no context**: only the images and the one-line idea, no transcript, no intent. It scores each area, ties every flaw to a screenshot, and describes "the top-studio version".
3. Each flaw goes to its cause (knowledge unused, knowledge missing, capability missing, agent behaviour). The fix lands in the product (corpus, skills, prompt, tools, plugin), never as a hand-edit of that game.
4. Rebuild from the same one line; a new blind critic judges round N+1.
5. Stop only when no severe flaw remains and every area scores at least 8/10.

**What it has produced** (game t1 only):

| Round | Product state | Blind critic overall | Credits / time | Cause summary |
|---|---|---|---|---|
| 1 | before fixes | 2/10, 28 flaws | stopped by hand at call 89 | composer failed 3 times (reason not kept), no real assets, 0 calls to `search_docs` or skills in 90 calls, grid layout, duplicate UI |
| 2 | fixes F1–F6 | 1.5/10 | | owner-play frames saved in `t1-round2/owner-play/` |
| 3 | worker `42697f17` | 1.5/10 | 192 credits, 298 s, 44 calls | 4 real crystals inserted but stacked at origin; model read 30 steps and built nothing; read-stall guard ended the run |
| 4 | `2ffd22db`, prepared | no critique in the checkout | 2,000-credit allowance, local WebSocket wrapper stops the run at 1,800 | local gates all green; Studio baseline `e70a1555…` |

Round-3 cause E4: "Model ceiling: 3 rounds, each fix exposes the next failure of multi-step building by GLM 5.3 Flash." A model comparison (`glm-5.3`, `deepseek-v4-pro-0813`, `kimi-k2.7-code`) was cancelled by the owner with no completed run, and the two commits it needed were reverted.

Observations on the method:

- **Strength:** the critic sees what a player would; it is the first instrument in the repo that is hard for the builder to flatter. Its output is concrete and actionable (round 1 flaws 2 and 4 name exact fixes).
- **Strength:** the cause taxonomy forces fixes into reusable product channels, and several critic-led changes have already landed in the agent (the in-product blind critique, the layout check, a "look then fix" gate).
- **Weakness:** n = 1 critic per round, no repeat on the same screenshots, no estimate of variance. The scores 2, 1.5, 1.5 are too low to show direction; the instrument is measuring the floor.
- **Weakness:** the 12-criterion rubric and the critic's 8-area rubric are different instruments. The 12 criteria include things a screenshot cannot show (saving, server authority, ProcessReceipt). Those need code and play checks, not a critic.
- **Weakness:** each full round costs credits and the owner's budget is finite (about 7,700 of 10,000 left at planning time, reported in `PHASE-T.md`).
- **Weakness:** the stop rule (every area at 8/10 or more from a critic told to judge at "top-100-game standard") has no calibration anchor. Nothing shows that a human would also give those scores.

### 13.4.3 The owner-bench and Phase T together

| | Owner bench | Phase T |
|---|---|---|
| Question | Does the agent handle varied small requests? | Can it make a complete, publishable game from one line? |
| Items | 30 frozen plus 21 held-out | 5 frozen |
| Judge | Vision model (GLM 5.3 Flash), 9 criteria, 0–2 | Fresh blind agent (screenshots only) plus Claude's own inspection, 12 criteria, 0–2 |
| Cost per pass | 3,423 credits for 26 items | about 190–2,000 credits per game round |
| Status under `GOAL.md` | Retired ("the frontier benchmark loop") | Active, after Phase R |
| Runs checked in | 1 (2026-10-02) | 0 scored; 4 rounds of one game as notes |

### 13.4.4 The other eval packages

All under `packages/evals/` unless stated:

| Component | Purpose | Notes |
|---|---|---|
| `src/run.mjs` + `tasks/*.json` | Single-turn Luau and Roblox knowledge eval, sent through the worker's admin gateway (`POST /api/admin/model-test`) | 91 tasks in 14 files (README still says 84 tasks in 12 categories, stale). Checks: contains, regex, `luau_syntax` (real `luau-analyze`), `no_antipattern` (static Roblox rules). Scripting tasks weigh 3–4. A hand-written reference answer exists for every scripting task and a test requires it to score exactly 1.0. Spends money; never run in CI. Results in `results/` are from 2026-08-30/31. |
| `src/metrics.mjs`, `score.mjs`, `compare.mjs`, `leaderboard.mjs`, `regression.mjs`, `history.mjs` | Offline scorecards, ranking, Elo, diffs and promote or rollback gates | Free, offline. |
| `src/visual-bench.mjs`, `tasks-visual/` (`grade-visual.mjs`, `rubric.json`) | Pixel-based scene grader. Rubric: 0–4 per dimension, `prompt_fidelity` is only 6 of 100 weight so a scene cannot pass on object existence; hard-fail conditions (bare baseplate, one material, default lighting, no props, no landmark) cap the total at 1.4/4 against a 2.6/4 pass | Drives real builds in Studio. Pre-dates the GLM-judge approach. |
| `src/critic.mjs` and `apps/worker/src/critic.ts` | Adversarial multi-lens visual critic ("a panel of prosecutors"): evidence must be a region, a harness-measured number, or a view; stated measures are checked against the harness's own number | The worker half was the dead-end that triggered `check-deadends`; now wired (`critic-wiring.test.mjs`). |
| `frontier-studio/` | Product benchmark: 12 genres by 3 fresh-place attempts = 36 full-game runs per lane, plus a distinct cartoon bank (`missions-cartoon-v2.mjs`, frozen 2026-09-25) with a blind-verdict visual gate; `make-baseplate.mjs` produces a clean `.rbxlx` with a SHA-256 baseline | A predecessor of Phase T with a richer protocol (trace must show `propose_plan`, library find, insert, `play_check`, `inspect_visually`). Needs human audit per asset role. |
| `src/acceptance.mjs`, `success-metrics.mjs` | The owner's 20 release-acceptance scenarios (section 60 of `docs/backlog/CHECKLIST-V2.md`) as runnable checks, and 20 analytics measures as a report, "a report, not a gate" | Tied to the old checklist. |
| `src/retrieval-eval.mjs`, `data/retrieval-gold.json` | Recall, MRR and precision@1 against a labelled gold set (the library search at 86% top-3 is reported in `GOAL.md`) | Refuses to score without naming what the index contains. |
| `src/economics.mjs` | Internal plan-economics simulator ("does not set, change or publish pricing") | Pairs with `check-offer.mjs`. |
| `src/design-checks.mjs`, `playbook-checks.mjs`, `props.mjs`, `layout-metrics.mjs`, `roblox-antipatterns.mjs` | Executable design and Luau rules over model output; completeness, not only violations | Mostly feed the eval tasks. |
| `src/train-gate-overlap.mjs`, `qa-overlap.mjs`, `robloxqa-gate.mjs` | Train-versus-test overlap gates | Training is cancelled (V3 §2); `packages/training` is no longer a workspace member. |
| `docs/gauntlet/` and `scripts/gauntlet-verdict.mjs` | The earlier blind-critic design: a separate fresh critic puts the built piece beside a fetched real reference (Pet Simulator 99 UI) with labels stripped, picks one and names the biggest gap. `--gate` refuses a piece whose critic never once picked the reference ("a critic that agrees every time is not judging") | The conceptual ancestor of the Phase T critic, with anti-sycophancy rules that Phase T's protocol does not have. |

### 13.4.5 What is run, by whom, at what cost

| Instrument | Where it runs | Model spend |
|---|---|---|
| Worker, root, evals, web, site, plugin suites | CI and local | none (every HTTP test injects `fetchImpl`) |
| `run.mjs` (task eval), `visual-bench.mjs`, `grade-visual.mjs` | owner's machine only | real, via admin gateway; CI header forbids them |
| Owner bench | owner's Mac, Studio paired | about 130 credits per item average |
| Phase T round | owner's Mac | about 190–2,000 credits |
| `infra/*` probes | owner's machine against production | credits and rate limits |

### 13.4.6 `judge_game`, the client judge rules and `composed-judge` (in-product evaluation)

These are not offline evals; they run **inside the product during a user's run** and gate what the agent says. They are the closest the product has to its own acceptance test, and they are all unit-tested.

| Piece | File | What it does |
|---|---|---|
| `judge_game` tool | `apps/worker/src/client-judge.ts` (671 lines), registered at `tools.ts:3999` | After building, scores the place "the way a paying client would": reads the place with existing Studio ops, plays up to three Test sessions (real clicks via VirtualInput, a walk onto collectables, leaderstats before and after), and returns `{verdict: "ready" or "not ready", score 0–100, criteria[], forUser, fixes, notVerified}`. Score is **capped at 79 while any question is a no**. A part that could not be observed is never a yes. |
| Client judge rules | `client-judge-rules.ts` (879), `client-judge-ui.ts` (498) | Seven client questions as named criteria with evidence and a fix: `placeholders` (default or fake text, someone else's Robux products), `ui_coherence` (nothing on top of anything, one set of menu buttons, one look), `buttons_work`, `progression` (can the player earn and spend), `errors`, `construction` (on the ground, near the start, a floor under the spawn), `fit_uniqueness` (anything not asked for, anything there twice, a source game's name still showing). Screen geometry is approximate for layout-object UIs and says what it left out. |
| `composed-judge` | `composed-judge.ts` (196) | The judge for a composed game, built after the owner said the old judge "measured the wrong things" (2026-09-30): fails a copied world, an unbuilt "twist", a creature that does not move, assets that fail to load; and requires a loop where a player can buy and place, a wave comes and beating it pays. It holds no noun list of its own. |
| Judge gate | `judge-gate.ts` | A run does not answer while its own latest verdict is "not ready": sent back at most twice with the judge's findings, then the answer carries what is still not ready. Created because in t1 round 2 "judge_game answered not ready yet (79/100) and the run answered anyway". |
| Look gate and `look` | `look-gate.ts`, `look-tool.ts`, `studio-look.ts` | A run that changed the viewport-visible place cannot answer before one look; a vision call returns observations (seen, not seen, cannot tell), never a score. |
| Claim audit | `claim-audit.ts` (514), `claim-audit-judge.ts`, `evidence-ledger.ts` | Concrete claims in the reply (a colour, visible text, a count, a behaviour) are checked against the run's evidence ledger: supported, contradicted or unsupported (reported as "not checked", never as wrong). It never rewrites the agent's words. An optional cheap text judge can only add findings. |
| Blind critique | `blind-critique.ts` (235) | Before answering a build, a vision call sees only the user's request and the frames (the `CriticInput` type has no field for plan, reply or paths); a `severe` flaw sends the agent back once. Born from t1 round 1. |
| Switch | `self-check.ts` | `SELF_CHECK` Worker var (off, default, full) and `SELF_CHECK_CRITIC`; bounded loops (`SELF_CHECK_LIMITS`). |

Design strengths: every judge says what it did not observe; every loop is bounded; the model-written text is fenced as untrusted before it re-enters the transcript (A5). Weaknesses: the judges run on the same model family as the builder; the 100-point `judge_game` score has a "79 cap" heuristic with no correlation study against human opinion; and `judge_game` costs up to about 3 minutes of Studio time and credits on every build.

## 13.5 Strengths and weaknesses for a solo owner

### 13.5.1 Is it guarding the right things?

**Strong where it counts, and shaped by real incidents.** Nearly every guard has a dated incident behind it:

- Money and abuse: billing authority, test key never accepted in production, reserve-before-spend and settle-after, refunds, per-step caps, retry does not multiply the bill.
- Trust boundary: tenant isolation, admin auth, credential egress, prompt-injection fencing, plugin pairing tokens, outbound host pinning.
- Honesty: published prices equal charged prices, privacy and "never trains on your work" copy equals the product, no "most trained model" claim without a number, the agent's claims are audited against its own evidence.
- Instrument honesty: `fail 0` needs a floor of passing tests, every checker has a test that makes it fail, three-valued verdicts (`unknown` is not a pass), gates must be seen failing before they count.

**Weak on the thing the owner's goal is about.** `GOAL.md` is "know Roblox game-making as deeply as a top studio, then prove it by building real, complete games". The proof instrument for that is the Phase T loop, and it has produced 2/10, 1.5/10 and 1.5/10 on one game. Unit tests cannot move that number directly. The question "can a new designer build a good version from what the agent can read" (the Phase R exit test) is answered by self-review, not by an instrument.

What appears under-guarded:

- **Plugin on real Studio.** CI never runs the plugin inside Studio. The proofs are hand-run Luau. The shipped asset is updated by hand. The capability allowlist is checked as text.
- **Live agent behaviour.** Nothing in CI measures a model's tool choices. The only regression instrument for agent behaviour is the owner bench or Phase T, both run by hand with credits.
- **Knowledge retrieval quality.** One gold set (`retrieval-gold.json`, 86% top-3 on the library search per `GOAL.md`); the research feed has format tests only, by design in Phase R. Whether the agent actually uses the knowledge is observed (t1 round 1: 0 knowledge calls in 90) but not tested.
- **Cost per build.** There is a reservation cap per step and per-run refund logic, but no regression test that a typical build stays under N credits. The costs seen (192, 584, 2,000 credits) come from live runs.
- **Multi-model behaviour.** The model comparison was cancelled; the suite runs against one model.

### 13.5.2 Does it slow change?

Yes, measurably, in three ways, and each is a deliberate trade.

1. **Coupling by text.** 34% of worker test files read source, 116 `assert.match` on source text. A reorder fails tests; the working-rules skill spends a section teaching agents not to write them and not to bump them. Simple refactors need a full-suite run (about 3 minutes, plus worker `pretest` cleanup).
2. **Ratchets with almost no headroom.** The 12-character tool-definition margin, the allowlist tripwires that only shrink, exact-count entries in `golem-allowlist.json`, `assert-tests --floor N`, the no-subject allowlist, the bundle and landing budgets. Every added capability must renegotiate one of them. For a team of one that is real friction, and for the 122-tool registry it is already binding.
3. **Process machinery.** 25 `check-*` scripts, 907 lines of dead-end dispositions, 7,745 lines of backlog JSON, a falsification ledger, a three-valued oracle culture. This was built when many agent lanes edited one tree and "reported something they did not observe" (the repo's recurring failure). With one owner and a research phase, much of it is overhead; but it is also the thing that catches an agent that says "done" falsely.

Offsetting speed: 14 seconds for the 56-test security suite, tests need no build step, and the full worker suite is about 3 minutes locally.

### 13.5.3 Documentation and state drift in the test layer (examples)

- `packages/evals/README.md` says 84 tasks in 12 categories; the folder has 91 in 14 files (measured).
- `owner-bench/BASELINE.md` header says "26 of 30 measured"; its detail line says "Judged 26 of 28" (28 rows exist).
- `prompt-budget.test.mjs` uses a 70,000-character tool payload; the registry is 125,953 (measured).
- `ci.yml` header comment says "@apple/site's 272 tests"; the grep count of test sites is 255.
- `CLAUDE.md` (repo) says the V3 gates are the completion definition; `GOAL.md` retires them.
- The memory index says the GitHub repo is private; OWNER_QUEUE says it was made public on 2026-09-24.
- Round-4 log counts the worker suite as 5,413 tests with 6 skipped; the brief says 5,388 pass.

None of these is serious alone. Together they show that the repo's own rule (a number in prose is a claim, so measure it) is applied to the product's marketing claims and not yet to its internal docs.

### 13.5.4 What the final product's acceptance tests should be (proposal for planners)

The following is a recommendation, not a decision. It keeps what already works (the guards that protect money, tenants and honesty) and adds the missing outcome-level tests. Thresholds are proposals for the owner to set.

| # | Acceptance test | Where it runs | Cost | Pass rule (proposed) |
|---|---|---|---|---|
| A | **Deterministic gate** (keep): worker, root, evals, web, site, plugin, corpus suites, typecheck, all six CI jobs, `check-no-golem` at 0, security A1–A9 | CI | free | all green, no skipped test added since the last release |
| B | **Fresh-install smoke**: new account, install the Creator Store plugin, pair, build "a red cube that spins" on a clean Baseplate, stop, resume, restore a checkpoint | owner's Mac with a scripted driver (`infra/e2e.mjs`, `store-validation.mjs`) | small | all steps complete, no console error, credits within the quote |
| C | **Phase T bank, frozen**: t1 to t5 (and a v2 bank of other genres, kept secret from prompts and skills), each in a fresh project | owner's Mac | 2,000 credits per game ceiling | game is playable end to end by an automated play check and by a human; 12-criterion score at or above an owner-set total (for example 18/24) and no 0 on criteria 1, 4, 5, 11 |
| D | **Blind panel, not one critic**: three fresh critics with different model families on the same screenshots, plus one human on a sample | cloud agents | low | median area score at or above 8; spread between critics reported; the human agrees within 1 point on the sample |
| E | **Held-out rotation**: run `heldout-v1` once per release, never fixed against | owner's Mac | about 2,500 credits | no category below its baseline; trend reported |
| F | **Judge calibration set**: 30 built places that a human scored, kept as a fixture, re-scored by `judge_game` and the bench judge on every judge change | cloud plus saved screenshots | small | rank correlation above a stated floor; disagreements listed |
| G | **Cost and time per build**: median and 90th-percentile credits and wall time for the Phase T bank, with a regression test on the median | derived from C | none extra | within the plan's daily allowance; no run above the per-run ceiling |
| H | **Plugin in real Studio**: a scripted `store-validation` run per plugin release (every op family, play-check, restore) | owner's Mac | small | all ops succeed; capability list matches the worker's |
| I | **Knowledge-use probe**: for a fixed set of prompts, assert the run called `search_docs` or a creation skill before building, and cited it in the plan | CI with a replayed model trace, plus live spot check | free to small | at least one knowledge call per build step that needs one |
| J | **Honesty probe**: for each Phase T run, the final reply is compared to the evidence ledger; zero contradicted claims | in-product (claim audit) plus review | free | 0 contradicted, "not checked" lines listed |
| K | **Release truth**: deployed `buildSha` equals the tested commit; `critical-flows` all `pass` (no `unknown`); `check-rebrand --deployed` and `check-pixels` clean | deploy path | free | all pass |

The point of C to F together: the final acceptance test is a **small, frozen, human-calibrated set of whole games**, with the in-product judges treated as development aids rather than as the acceptance oracle.

## 13.6 Open questions this section raises for the planners

1. **Which acceptance regime governs?** `GOAL.md` retires V3 gates, the meter and the benchmark loop; `CLAUDE.md`, `AGENTS.md`, `ACCEPTANCE.json`, `GATES.md` and several root test files (`autonomy-*`, `owner-autonomy-hooks`, `gate-check`) still encode them. Retire the machinery deliberately (and delete the checkers that test only it), or reconcile it with Phase T?
2. **What is the numeric exit for "Phase T done"?** The protocol says "no severe flaw and every area at or above 8/10 from a blind critic". Is that the owner's bar, and who calibrates a critic that has never been compared with a human?
3. **Should the judge be a different model from the builder?** Today `vision` and `agent` are both GLM 5.3 Flash. Accept the shared-bias risk, or budget a second family for the acceptance judge?
4. **Is the 122-tool registry the right architecture?** The context-budget test leaves 12 characters of headroom. Does the final product move to need-based tool exposure, a smaller core, or a raised floor, and who owns that number?
5. **How many credits is acceptance allowed to cost?** One owner-bench pass was 3,423 credits, one Phase T round 190 to 2,000. With about 7,700 credits left (reported), how many full acceptance runs can the product afford, and does the product's own pricing model make an acceptance run affordable for customers' equivalent?
6. **Public or private repo, and where does CI run?** CI works because the repo is public (per the owner queue); is that permanent? If private again, the 30 to 40 minutes per push means roughly 50 to 66 pushes a month. Options: trim the job set, run the deterministic gate only on PRs to `main`, or self-host.
7. **Which guards must run in CI?** `check-deadends`, `check-escape-hatches`, `check-schema-drift`, `check-offer` and `check-unstyled-classes` run only in the local suite. Is that intended?
8. **Does a source-text guard belong in the final suite?** About 139 worker test files assert on source text. Convert the high-churn ones to behavioural tests, or accept the friction as the price of cheap, fast guards?
9. **Node version:** CI pins Node 22, development uses 26 and tests import `.ts` directly. Should CI run the same Node as the owner, and has anyone seen it green on 22 since the rename?
10. **What happens to the owner bank?** It is frozen, its prompts are barred from skills and tests, its banned-subject words still shape the worker, and its held-out half has never run. Keep as a regression bank, retire, or re-run once on the current code to get a second data point after the 2026-10-02 baseline?
11. **Who scores the 12 criteria that a screenshot cannot show?** Saving, server authority, monetisation correctness and a clean 5-minute run need code inspection and play, not a critic. Is that an automated static and play check (extend `judge_game`) or a human read?
12. **Is `golem` a test-suite concern or a migration plan?** At least 701 counted allowlisted hits, with a phase C and D runbook not yet executed. Should the final product's acceptance include "allowlist is empty", and does `CLAUDE.md`'s "infrastructure names stay golem" still stand?
