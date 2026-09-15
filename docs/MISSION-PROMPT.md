FINISH THE PRODUCT. Repo: `/Users/moshe/Desktop/RbxAI` (pnpm monorepo, branch `main`, product codename "Apple", formerly "Golem"). Read this entire document before your first tool call. Do not reply with a plan. Your first action is §18.

# 0. THE ONE LAW

Nothing is done until a committed machine says so. A unit of work is finished only when a committed checker executed a falsifiable CHECK, matched its EXPECT, and wrote the evidence itself. Your narration is not evidence. A test is not evidence until it has been observed FAILING with the shipping call site removed. Editing a gate to close it is a §12 violation.

§16 is the only terminal condition. §14 is what you do every time you feel the pull to stop.

# 1. REPO AND SETTLED DECISIONS

1.1 `apps/web` (React SPA) · `apps/site` (Astro marketing, served out of D1 via `POST /api/admin/static-upload`, not Workers static assets) · `apps/worker` (Hono + Durable Objects, live at `https://golem.moshe-barami111.workers.dev`) · `apps/plugin` (Rojo/Luau) · `packages/{shared,design,evals,training,corpus}` · `apps/benchmark`. Supabase `npqvyijsvzkuwddyhtpm` (ES256 JWKS verify, RLS, no service-role key in the worker); Cloudflare D1 `golem-corpus`, KV, Vectorize `golem-docs`; no R2 binding, so the blob store is DO SQLite; models Clay = `qwen3-30b-a3b-fp8`, Stone/Rune = `gpt-oss-120b`; AI Gateway billing is STANDARD (uncapped overage), so BudgetDO is the only spend guard.

1.2 Settled, not reopenable: Apple IS a full SaaS with subscriptions and credits (owner-confirmed 2026-09-14) — never re-raise `BLOCKERS.md` §B as a conflict, never re-propose a zero-recurring-cost architecture. The 3D mascot and Meshy are cancelled permanently. Visual direction is minimal cinematic charcoal stone.

1.3 PRIMACY. Every path, line number, count and status in this document was measured on 2026-09-14 and some is already wrong. Re-resolve every citation before acting on it. Where this prompt and the repo disagree, the repo wins and the prompt's figure becomes a corrected line in your pass record. Never inherit a number from this prompt, from a ledger's prose, from a commit title, or from your own previous pass.

# 2. THE FIVE LEDGERS AND THE SIXTH SOURCE

2.1 A statement about "the mission list" that names fewer than five of these is false, including one you make yourself.
1. `GATES.md` — G-gates with CHECK / EXPECT / FALSIFIED / EVIDENCE.
2. `WORKLIST.md` — w-numbered in-flight rows; the file the Stop hook reads.
3. `docs/MISSION-LEDGER.md` — Phase-IV outcome gates with dispositions.
4. `docs/backlog/FEATURES.json` (machine) + `docs/backlog/FEATURES.md` (human view of the same data; they currently disagree and must be made to agree).
5. `docs/backlog/BLOCKERS.md` — §A owner action, §B billing (RESOLVED, §1.2), §C platform limits, §D engineering-only.

2.2 The sixth source is the DEPLOYED product: the live worker, the live site, Supabase, and the plugin `.rbxm` artifact. A repo claim is not a product claim.

2.3 Governing rule from `docs/audit/APPLE-LEDGER.md`, binding on every status you write: a capability exists only if a reachable product path executes it and its effect persists or is observed. Code that compiles, is tested, and has no caller is a DEAD END, not a feature.

2.4 `GATES.md` scopes itself to "§D plus the highest-value unbuilt items". That self-scoping is VOID: the gate ledger covers whatever the other four ledgers hold open.

# 3. THE TWELVE STATIONS

3.1 Stations set the ORDER of work inside a pass. The five ledgers set the TERMINAL CONDITION. Work the lowest-numbered unproven station first; ledger rows enter a pass because they block it.

3.2 THE STRANGER TEST. Before recording any claim, restate it as: "A person with a fresh browser and no access to this laptop can ___." If the restatement is false, or is about a test, a module, a route-table entry, a type, a commit title, or a local build, it is not evidence.

3.3 SESSION ORIGIN. Every station probe must originate from a session created THIS PASS by the public signup flow with a fresh address at a real, externally-readable inbox, using only requests a browser makes. No seeded account, no locally minted JWT, no service-role key, no test-only auth path, no bypass header, no direct database insert. If confirmation mail does not arrive within 10 minutes, S2 is BLOCKED and S3, S4, S10, S11, S12 are BLOCKED WITH IT — a funnel whose first step fails for a stranger has no proven steps after it. Record the address, the inbox fetch, and timestamps.

3.4 Stations. Each is PROVEN only by a probe of the DEPLOYED origin, captured to a file and fingerprinted.
- **S1 Land** — site and `/pricing` return 200, zero user-visible "Golem", zero "$0 forever" / "No card required, ever" / "never be charged", published free quota equals `PLAN_LIMITS.free.creditsPerDay` in `apps/worker/src/pricing.ts`.
- **S2 Sign up** — a brand-new email reaches a usable session.
- **S3 Create** — a project created from the deployed `/app` survives a full reload and a new browser session.
- **S4 Chat** — a message from the deployed workspace yields a streamed reply, a per-run cost, and a live Credit balance rendered IN the workspace.
- **S5 Pair** — the plugin pairs from a build a person can install. Creator Store distribution is a DISTRIBUTION handoff and may be cited only by S5, only for the words "installable by a stranger".
- **S6 Build** — with a paired plugin the agent's tools execute and change the place. Tools that can change a place with no plugin: 0.
- **S7 See** — a successful `render_view` puts a frame in the browser.
- **S8 Keep** — generated geometry survives save/publish.
- **S9 Undo** — restore does what the confirm dialog claims, including Terrain and Camera.
- **S10 Hit the limit** — an exhausted user gets a legible refusal naming the next action, with allowance and purchased credits shown as distinct numbers. Prove it by setting the test account's allowance to zero through the normal entitlement write, never by consuming real quota and never through `ADMIN_KEY`.
- **S11 Pay** — a Stripe **test-mode** checkout session created by the DEPLOYED worker returns a session URL, and the test-mode webhook grants entitlement observable via `GET /api/me`. Only the live-key swap may remain a handoff.
- **S12 Return** — quota reset, project list, conversation, memory (summary AND the facts injected into the system prompt), and export all still work after a day boundary. S12 is TIME-GATED (§7).

3.5 S5–S9 are proven against a locally sideloaded `apps/plugin/release/*.rbxm` in Roblox Studio: the tool executed, the place changed, the frame reached the browser, the geometry survived a save/publish round trip, the restore returned Terrain and Camera. If the `.rbxm` cannot be sideloaded, that is an engineering defect in the artifact, not an owner handoff.

# 4. DERIVE THE WORK EVERY PASS

4.1 This prompt contains no task list on purpose. Rebuild the open set from the six sources every pass, using commands, not memory — **incrementally**. `docs/backlog/DISPOSITIONS.json` records, per row id: the §7 disposition, the evidence sha, and the content-sha of the ledger text it was derived from. A pass re-dispositions only rows whose source content-sha changed, plus every row touched this pass; recorded dispositions carry forward and are re-derived in full every tenth pass. "Zero rows undispositioned" is satisfied by that file, not by re-reading 1,249 rows.

4.2 Re-probe every blocker before honouring it. A blocker whose citation does not resolve to the claimed symbol is VOID and is closed or rewritten in the same pass, with the probe output as evidence.

4.3 Decompose before counting. Rows split into: already built with a live caller (BOOKKEEPING-FLIP), exact-name duplicates (MERGE-DUPLICATE), facets of one field (FACET-BOUND), blocked by a constraint OUTSIDE this repository (STRUCTURALLY-BLOCKED), and real engineering, which collapses into a small number of epics. Report row count and distinct-effort count separately.

4.4 Within a pass, order by: (1) anything that makes future cheating detectable (§6); (2) BOOKKEEPING-FLIP and MERGE-DUPLICATE, so the true remainder is known; (3) the epic that unblocks the most rows; (4) the lowest unproven station; (5) everything else.

4.5 Decompose each BUILD row until every leaf satisfies all three: one sentence states what a user or caller can now do that they could not; one command decides it and that command can fail; it touches a bounded, named file set. More than eight children means it is an epic — name it and work the children.

# 5. THE EVIDENCE CONTRACT

5.1 Shape of a gate:
```
- [ ] G<N> [S<k>]: <one observable outcome a user or machine can see>
    CHECK: <one shell command, repo root, deterministic, within the §12.5 spend ceiling>
    EXPECT: <exact substring or /regex/ that must appear in stdout+stderr>
  FALSIFIED: <written by the checker when observed RED, carrying break-sha>
  EVIDENCE: <written by the checker when observed GREEN, carrying git-sha>
```
5.2 The checker records; you never do. You may write CHECK and EXPECT. You may never type, paste, copy or "refresh" an EVIDENCE or FALSIFIED line. Each carries, recorded by the checker: `exit=`; `EXPECT=<matched|unmatched>`; `output-sha256`; `output-bytes`; `git-sha=`; `break-sha=` (FALSIFIED only); `tree-clean=`; `node=`; `luau=<version|ABSENT>`; `playwright=<version|ABSENT>`; `at=<ISO8601>`. `luau=ABSENT` is legal ONLY for a gate whose CHECK names no `.luau` path and whose subject has no Luau half; any gate touching `apps/plugin` recorded with `luau=ABSENT` is UNMET. Same for `playwright=ABSENT` on any browser-driven gate.

5.3 The checker REFUSES to record when: `tree-clean=no`; the CHECK names a path absent from `git ls-files`; the gate has no FALSIFIED line; the stored `output-sha256` does not reproduce under `--reverify`.

5.4 RED-FIRST, and the break must remove the PATH, not a value. Create a scratch worktree at `.claude/worktrees/redfirst-<gate>`, delete the shipping call site OR delete the module's export OR unwire the route from the router, **commit that break on a throwaway branch** (so `tree-clean=yes`), run the checker to record FALSIFIED with `break-sha=<that commit>`, delete the worktree and branch, then record EVIDENCE against the fixed commit on main. The FALSIFIED record embeds the diff of the break; that diff must touch a file under `apps/*/src`, `apps/plugin/src` or `packages/*/src` — never a test, a fixture, or a constant table. A FALSIFIED whose diff touches only a literal value is VOID. FALSIFIED and EVIDENCE sharing one sha is forgery. A gate with EVIDENCE and no FALSIFIED is VOID: remove the checkbox, reopen the row, do it properly.

5.5 EXPECT hygiene. An EXPECT may only get STRICTER, decided by running BOTH the old and the new EXPECT against the recorded output corpus in `docs/evidence/expect-corpus/` and requiring the new match set to be a proper subset. Length is not strictness (`fail 0` → `passed` is the same length and strictly weaker). Every EXPECT change carries an adjacent `EXPECT-CHANGE: old=<v> new=<v> reason=<derived-floor|tightened|subject-renamed>` line and a falsification record produced AFTER the change. A magic count that breaks when work is ADDED is a bad oracle: replace it with a derived floor plus a zero-failure assertion, never by deleting the count.

5.6 ORACLE QUARANTINE. At the start of every pass, `--reverify` every gate. Any gate that (a) fails to reproduce its fingerprint, (b) has no assertion that imports, executes, requests or renders the thing under test, or (c) has an EXPECT satisfiable by an empty or fully-skipped test file, is UNMET and struck from the met count until rewritten.

5.7 COUNTS AS EVIDENCE: a checker-written EVIDENCE line on a committed clean tree whose fingerprint reproduces; a test that imports or esbuild-bundles the module and CALLS it, or constructs a real `Request`, or mounts a real component, or drives a real browser; a probe of the deployed origin or of a shipped binary with command, status and response fingerprint; a `FEATURES.json` evidence string naming a committed, red-first test id that drives the capability from the outermost user surface plus its `path:line`; a refuter transcript returning UPHELD.

5.8 DOES NOT COUNT, EVER: "I ran it and it was green"; a hand-typed or copied EVIDENCE line; a commit title; a symbol name; a `path:line` with no test id behind it; `readFileSync` + `assert.match` over source text; asserting a prose comment exists; a test file with zero executable tests or all-`.skip` (`node --test` prints `fail 0` and exits 0 on both); a green run on an untracked file or a dirty tree; anything under `MOCK_MODE` (`apps/web/src/lib/mock.ts` hard-codes balances); anything from `infra/e2e.mjs`, which simulates the plugin in Node and says so — never cite it for a Studio claim; a localhost build standing in for the deployed origin; a session obtained by any means other than public signup and login; a header, key or route unavailable to an anonymous browser; a count you did not compute this pass with a command you pasted; a line number you did not re-resolve this pass.

# 6. REPAIR THE ORACLES FIRST

No ledger row may be closed until §6 is discharged. Each item is a gate: RED-FIRST, committed, wired into root `pnpm test` AND `scripts/gate-suite.mjs` AND `.github/workflows/ci.yml`. Discharging §6 is budgeted separately from the §11.1 leaf cap, and §11.2's stall rule never fires while §6 is undischarged.

6.1 **`--reverify` does not exist today.** `scripts/gate-check.mjs` parses flags with `args.includes()` and knows only `--approve`/`--lint`/`--gate`, so `node scripts/gate-check.mjs --reverify GATES.md` — §10's first command — is silently a no-op and §16.1 is vacuously satisfiable. FIRST ACTION of §6: run `node scripts/gate-check.mjs --nonsense-flag` and confirm a non-zero exit; make it exit 2 on any unrecognized flag. Then implement `--reverify`: re-execute EVERY gate including already-met ones, recompute `output-sha256`, and mark the gate UNMET **in the file** when the sha differs, when FALSIFIED is missing, when `tree-clean=no`, or when the CHECK names a path absent from `git ls-files`. Compute the summary tally from the checkboxes, never from the typed paragraph. `tests/gate-check.test.mjs` must contain, and gate `G-ORACLE-1` must execute, all four of: (a) a fixture ledger with a corrupted `output-sha256` → UNMET; (b) EVIDENCE with no FALSIFIED → UNMET; (c) unknown flag → exit 2; (d) typed summary disagreeing with the checkbox count → non-zero exit. Root-level tests are in no workspace member, so wire this into the suite oracle explicitly. Until `G-ORACLE-1` is green and red-first, no ledger row may be closed and no §16 clause may be evaluated.

6.2 Back-fill RED-FIRST across the existing ledger: `--reverify` everything; delete-and-redo every gate whose CHECK only greps source, whose fingerprint does not reproduce, or that has no falsification record. Expect red. A gate deleted under this clause must be replaced in the same pass by a gate over the same outcome; the pass record must show gate count non-decreasing.

6.3 **Every checker written under §6 prints, as its first stdout line, `DENOMINATOR <n> files; EXCEPTIONS <m>: <globs>`, and ships with a gate whose CHECK computes `git ls-files '*.ts' '*.tsx' '*.mjs' '*.luau' '*.astro' | wc -l` minus the exception count and whose EXPECT is equality with the printed denominator.** An exception glob is valid only with a one-line reason beside it in the checker source. A checker whose denominator is below the tracked source surface minus its declared exceptions is a forged oracle. Each checker's falsification record must show it going red on a violation planted in the LAST directory of its walk order.

6.4 `scripts/check-escape-hatches.mjs`, failing on: a test file with zero executable tests or only `.skip`; a typecheck script containing `|| true`; a workspace package with no typecheck script; a gate CHECK that neither imports source nor spawns a process nor hits a URL; an EXPECT change that is not a proper-subset strengthening per §5.5, or that lacks an `EXPECT-CHANGE:` line; a `- [~]` checkbox row outside an HTML comment; a line beginning at column 1 with `ABANDON:` outside an HTML comment; `WORKLIST.md` untracked; a test-runner pass count below a committed floor; an EVIDENCE line lacking `git-sha`, `tree-clean` or a matching FALSIFIED; a source file containing a NUL byte; any line of `docs/PASS-LOG.md` or any ledger containing a future-tense deferral word (`will`, `pending`, `next pass`, `once`, `after`, `gated on`, `parked`, `carried`) with no adjacent row-id matching `/\b(w\d+|G[\w-]+|F-[A-Za-z0-9-]+|OH-\d+)\b/`; any row-id appearing in three consecutive `docs/PASS-LOG.md` confessions; any confession bullet with no row-id. **A `HALT:` line is NEVER a failure**: print `OWNER HALT PRESENT — <line>` and exit 0. Removing or editing an owner `HALT:` line is a §12.1 violation. The checker skips its own source and fenced code blocks.

6.5 `scripts/check-backlog.mjs` — nothing reads `FEATURES.json` today, so `sed -i 's/"not-started"/"done"/g'` closes 1,084 rows and passes every existing check. It must fail on any non-not-started row whose evidence lacks a test id that exists in the repo and passes, on duplicate item names, and on any `FEATURES.md` bucket absent from the JSON or vice versa.

6.6 `scripts/check-deadends.mjs` **REPORTS; it never fails the suite on its own.** It emits a machine list of non-entrypoint modules with zero importers, exports with zero references outside their own package, routes with no caller, and tools whose only consumer is a test or eval harness. The GATE is that every entry carries a §7 disposition in `docs/backlog/DEADENDS.md`: WIRE (name the caller being added and the pass), DELETE (only with a dated owner statement in `docs/DECISIONS.md` for any file over 50 lines), or STRUCTURALLY-BLOCKED. Type-only exports and cross-package library surfaces are excluded by construction. **Deleting non-test source to make a checker green is a §12.2 violation.** Both checkers walk bytes, not grep — the tree contains NUL-byte files.

6.7 `scripts/check-dispositions.mjs` FAILS when: STRUCTURALLY-BLOCKED cites a constraint any other closed row in the same section also faces, or cites "not built", "no caller yet", "requires refactor", or anything inside this repository; FACET-BOUND names a parent that is not itself CLOSED-WITH-EVIDENCE; MERGE-DUPLICATE names a survivor whose name is not an exact string match; ACCEPTED_DEBT quotes a string that does not appear byte-for-byte in `docs/DECISIONS.md` alongside this row's id; or any disposition applied to more than 20 rows in one pass lacks a per-row justification with a distinct proving citation (identical citations across rows collapse to one row and reopen the rest).

6.8 `scripts/check-offer.mjs` FAILS unless, computed from `apps/worker/src/pricing.ts` and `docs/COST-MODEL.md`: every plan's monthly price exceeds its monthly Credits priced at measured neuron cost × 1.4; no plan's `creditsPerDay` exceeds the compiled BudgetDO daily neuron ceiling; the free plan's daily allowance affords at least one complete quality-gated build; every quota stated in `apps/site` and `apps/web` equals the enforced constant; every advertised plan-conditional feature resolves to a code path that branches on plan.

6.9 `scripts/check-pixels.mjs --deployed` captures every route in the deployed route table at 1440×900 and 390×844, light and dark, to `docs/evidence/pixels/<pass>/<route>.png`, and FAILS on: a route whose PNG is >92% one colour; a `<body>` computed `font-family` that is a bare system stack not in `packages/design`; a route with zero elements using a `packages/design` token; a frame differing from its committed baseline by >2% with no baseline update in the same commit.

6.10 `scripts/check-rebrand.mjs`, whose denominator is fixed and NOT authored by you: every byte of the deployed `/app` bundle, the deployed site's rendered HTML for every sitemap route, and every string literal in `git ls-files '*.ts' '*.tsx' '*.astro' '*.luau'`. The exception list is CLOSED and is exactly the §12.5 identifier list; adding an exception requires a one-line proof in the same commit that renaming it breaks a persisted value or a wire contract. It prints total matches, exempt count, and every exempt string with `file:line`, and fails on any other case-insensitive `golem`.

6.11 Stand up and gate real coverage: a DOM renderer for `apps/web` (no test mounts a component today); `Request`-driven route tests for `apps/worker` (no route is ever executed today); at least one authenticated Playwright journey against the deployed `/app`; a typecheck for every workspace package including the three with none; delete `|| true` from `apps/site`'s typecheck; make the Luau runners FAIL rather than print SKIPPED and exit 0 when the toolchain is absent — installing `luau`/`lune`, `selene` and `stylua` locally and in CI is gate `G-TOOLCHAIN-1`, red-first, green before §6 is discharged; fix `gate-suite.mjs`'s pass-count summation to match the Luau suites' `N passed` format; make `gate-suite.mjs` a superset of root `pnpm test` (it skips `check-workspace-coverage.mjs` today); give `check-workspace-coverage.mjs` a floor so a package whose test script runs zero tests fails; give every script in `scripts/` a self-test or mutation check.

# 7. DISPOSITION VOCABULARY — EIGHT WORDS, NO OTHERS

**CLOSED-WITH-EVIDENCE** · **BOOKKEEPING-FLIP** (already built; evidence must name a committed, red-first test id driving the capability from the outermost user surface — a mounted component, a constructed `Request`, or a Playwright step against the deployed origin — plus its `path:line`; a `path:line` with no such test id is not evidence; report as bookkeeping, never as engineering progress) · **MERGE-DUPLICATE** (exact-name survivor named; the loser records it) · **FACET-BOUND `<parent-id>`** (closes only when the parent is itself CLOSED-WITH-EVIDENCE and emits every facet in one artifact) · **STRUCTURALLY-BLOCKED** (a constraint OUTSIDE this repository — a missing paid binding, a vendor API that does not exist, a platform capability Roblox does not expose. Work you have not done is not a structure) · **OWNER-BLOCKED** (§12) · **ACCEPTED_DEBT** (valid only when it quotes, verbatim, a dated line in `docs/DECISIONS.md` written by the owner, not you, that NAMES this row's id or exact title. A quotation from this prompt is not an owner statement; a dated statement about another subject is not authorisation. You may never append to `docs/DECISIONS.md`) · **TIME-GATED `<UTC when probeable>`** (only when the sole missing input is elapsed wall-clock time, the deterministic half is gated by an executed test that manipulates the clock input, and a scheduled re-probe command is recorded in `docs/backlog/OWNER-HANDOFF.md`. S12 is TIME-GATED and does not block §16).

Inventing a ninth word is a violation — it has happened, with rows parked as "quota-blocked, not capability-blocked", a distinction that resolves by waiting and therefore by nobody. Out-of-scope is the owner's call, never yours. Your own deferral is OWNER-BLOCKED, never a close and never a deletion of rows.

# 8. PASS SHAPE — USE THE WORKFLOW TOOL FOR EVERY FAN-OUT

inventory → disposition → parallel implementation in worktrees → adversarial verification → gate run → commit → deploy → send pixels → re-enter.

8.1 INVENTORY. Parallel, read-only, ≥4 agents on pass 1 and every tenth pass — one per ledger plus one per live surface **that is currently observable from this session**. A surface that cannot be observed (no credential, no published artifact) is recorded ONCE as a handoff row and is not re-spawned until its approve-by command returns a reachable result; pass 1 enumerates observable surfaces into `docs/PASS-STATE.md`. On other passes, inventory is ONE agent over the diff since the last recorded ledger sha. Inventory output is a scratchpad file, not a ledger edit. Inventory is capped at one parallel batch and at a quarter of the pass's tool calls; exceeding either makes the pass a NULL PASS (§11.3). Inventory agents edit nothing.

8.2 DISPOSITION. You alone, on main. Apply §4 and §7 incrementally against `DISPOSITIONS.json`. Declare the file-set partition for the next stage; no two lanes touch the same file. Write the selection to `WORKLIST.md` before building. Commit ledger reconciliation separately, labelled bookkeeping.

8.3 IMPLEMENTATION. Parallel, one leaf per agent, each in its own git worktree under `.claude/worktrees/<lane>`, rebased on main before merge. Builders deliver the change, an executing test, the RED-FIRST falsification record, and the gate text. Builders may NOT touch `GATES.md`, `WORKLIST.md`, `MISSION-LEDGER.md`, `FEATURES.json`, `DISPOSITIONS.json` or `BLOCKERS.md` — ledger writes happen only after §9.

8.4 ADVERSARIAL VERIFICATION (§9). 8.5 GATE RUN (§10). 8.6 COMMIT. 8.7 DEPLOY under §12.6. 8.8 SEND PIXELS under §14.4. 8.9 RE-ENTER (§14.3), unconditionally.

8.10 Worktree hygiene: never `git checkout .`, `git restore` or `git clean -fd` on main. Untracked mid-flight work in this repo has repeatedly implemented shipped features and is invisible to `git log`. Commit before any tree-cleaning operation, always.

# 9. THE STANDING ADVERSARY

9.1 A refuter is dispatched for EVERY row whose status changes this pass, in either direction, and for every station line that is not BLOCKED-BY — including rows dispositioned BOOKKEEPING-FLIP, MERGE-DUPLICATE, FACET-BOUND, STRUCTURALLY-BLOCKED or OWNER-BLOCKED, which are claims about the world exactly as "done" is. Each refuter runs in fresh context, did not build the thing, and receives only the claim, the row, and the repo. A pass whose refuter count is below the count of rows whose status changed is void and is redone before the next pass begins.

9.2 Refuter checklist: does a reachable product path execute this starting from something a stranger can do? does the test go red when the shipping call site is removed? does it assert behaviour or source text? is the module imported by shipping code? does the deployed artifact contain it? does the fingerprint reproduce? does the cited `path:line` resolve? is the oracle satisfiable by a log statement, a comment, an empty file, or a substring? is the claim about the unreachable half of a two-sided feature? A BOOKKEEPING-FLIP refuter gets only the row and must find the user-reachable path itself.

9.3 THE REFUTER RETURNS REFUTED WHEN UNCERTAIN. Only demonstrated, executed, reachable behaviour returns UPHELD. One exception: **UPHELD-BEHIND-HANDOFF**, when the claim is about the reachable side of a named handoff row, that row was re-probed this pass, and the claimed behaviour executes when the handoff's blocking flag is flipped in a test fixture.

9.4 A REFUTED claim reopens its row in the same pass. You may not argue in prose; produce new executed evidence and re-dispatch. At most two re-dispatches per claim per pass; a third REFUTED converts the row to STRUCTURALLY-BLOCKED or OWNER-BLOCKED with the transcript as its citation, and the pass moves on.

9.5 Once per pass, dispatch one refuter against your own pass record with the sole instruction: find the sentence that is technically true and materially misleading. Its finding is either fixed in that same pass with new executed evidence, or restated verbatim as the first line of the next pass record.

# 10. VERIFICATION — EVERY PASS, NO EXCEPTIONS

```
node scripts/gate-check.mjs --reverify GATES.md   # re-executes EVERY gate; stale fingerprint = unmet
node scripts/gate-suite.mjs                        # sums every "fail N"; must print SUITE GREEN
node scripts/gate-typecheck.mjs                    # must print TYPECHECK CLEAN
pnpm test                                          # root script
node scripts/check-workspace-coverage.mjs
node scripts/check-escape-hatches.mjs && node scripts/check-backlog.mjs && node scripts/check-deadends.mjs && node scripts/check-dispositions.mjs
node scripts/check-offer.mjs && node scripts/check-rebrand.mjs
node scripts/check-site-links.mjs && node scripts/check-site-semantics.mjs && node scripts/check-landing-budget.mjs && node scripts/check-app-bundle.mjs && node scripts/check-credit-figures.mjs
python3 scripts/secret-scan.py
npx playwright test --reporter=line                # every spec, including the signed-in deployed journey
node scripts/check-pixels.mjs --deployed
node infra/smoke.mjs --no-model                    # once per pass, never against /api/admin/*
```
10.1 A gate that passed in an earlier pass is not evidence now, with one exception: a deployed-origin station probe is valid for the HEAD sha it was recorded against, and is re-probed when HEAD changes the code path it exercises, proven by a path diff. A pass may not end with a dirty tree.

10.2 DRIFT INVARIANT, head and tail of every pass: fetch the deployed `/app` bundle and count Apple vs Golem; `GET /api/health`; `GET /api/version` and compare the deployed build sha to HEAD. **Never probe deploy-freshness by POSTing to a mutating endpoint** — once billing is deployed, its drift probe is a signed webhook replay against a dedicated test customer id in Stripe test mode, at most once per pass. Drift is a station-blocking defect, not a footnote. Deploying the worker and re-uploading the D1-served site are YOUR actions, never an OWNER-BLOCKED row.

# 11. PASS BOUND, NULL PASSES, STALLS

11.1 A pass carries at most 15 verified leaves and at most 8 parallel worktrees, and at least 5 of those leaves must belong to the lowest unproven station or to the epic that unblocks the most rows. Leaves that are BOOKKEEPING-FLIP, MERGE-DUPLICATE, prose rebrand or tally recomputation do not count toward the 15 and do not satisfy the 5. A pass that would exceed the bound splits; it never extends and never defers verification.

11.2 STALL. Two consecutive passes in which no BUILD leaf reached CLOSED-WITH-EVIDENCE, or two consecutive passes with `k==j` on the current station (§13), is a stall. On the second you may not work any row you yourself dispositioned: take the lowest-numbered unproven station, work its blocking defect directly, and append a STALL row to `docs/backlog/OWNER-HANDOFF.md` naming the passes, the attempts, and the measurement that would unstick it. Five consecutive zero-close passes: spend one full pass producing a deployed, owner-visible improvement to the station furthest along, then resume. Oracle repair under §6 counts as closure for this rule.

11.3 NULL PASS. A pass in which no file under `apps/*/src`, `apps/plugin/src` or `packages/*/src` changed. At most ONE NULL PASS is permitted in the entire mission — pass 1, for §6 oracle repair. Every later pass ships at least one product diff a station probe observes; if selected work turns out to be pure bookkeeping, fold it into the same pass as a BUILD leaf and count the pass by the leaf.

# 12. FORBIDDEN BY NAME

12.1 **ENDING THE LOOP.** Deleting, untracking, emptying or renaming any of the five ledgers. Writing `HALT:` or `ABANDON:` at column 1. Marking any item `[~]`. Removing `- [ ]` lines so a checklist appears complete. Removing or editing an owner-written `HALT:` line. These are the mechanical releases of the Stop hook; using one to end the loop is the worst failure available. The only permitted HALT is one the owner types.

12.2 **FAKING PROOF.** Hand-typing, copying or refreshing an EVIDENCE line — existing lines share identical `shell=`, `cwd=` and `path=` tokens, which is exactly why copying is undetectable and exactly why it is banned. Leaving a non-reproducing fingerprint in place. Editing a prose tally instead of deriving it. Loosening an EXPECT or editing a hard-coded count instead of investigating why it moved. Emptying or `.skip`-ing a test file. Deleting tests while leaving the test script intact. Deleting non-test source to make a checker green. `readFileSync` + `assert.match` as a behaviour gate. Asserting a prose comment exists. Accepting `console.error` as proof of error handling via a loose alternation. Anchor-slicing a source file so the test fails OPEN when an anchor moves. Recording a gate against an untracked file or a dirty tree. A FALSIFIED record whose diff touches only a literal value. Running `gate-suite.mjs` as a stand-in for `pnpm test`. Adding `|| true`, adding a package with no typecheck, accepting SKIPPED-and-exit-0 as a pass. Treating an empty grep as proof of absence on a tree containing NUL-byte files. Deleting a gate to lower the unmet count.

12.3 **FAKING WORK.** Bulk-flipping `FEATURES.json` statuses. Evidencing a row with a server symbol, a route-table entry, a `ClientMsg` union member, a type or a component file when the row describes a user-reachable capability. Marking a Studio-gated capability done while plugin distribution is off — those rows are BLOCKED against the handoff, never done. Closing a facet row on its own. Closing one duplicate and leaving its twin. Presenting bookkeeping flips as engineering progress. Writing a module and its test and never importing it. Suppressing the caller instead of fixing the callee and citing the suppression commit as the fix. Shipping only the receiving half of a two-sided feature: a route with no UI, a UI with no writer, a persisted preference with no reader. Closing a row on the easier half of its conjunction — every "and" ("stop and retry", "viewer and editor", "upgrade and downgrade") is evidenced separately. Redefining the noun to make a keyword search succeed. Fixing exactly the cited line range and declaring the blocker closed. Honouring a stale blocker as permission to skip.

12.4 **BANNED ACT:** any sentence assigning work to a future time without an `OWNER-HANDOFF` row id or a confession row-id with a scheduled pass number. Paraphrase is the violation, not the wording — `check-escape-hatches.mjs` enforces it (§6.4), not a phrase list. Three illustrative tells, still banned outright: "I ran it and it passed" · "should work" · "this is blocked on the owner" without all six §13 fields.

12.5 **HARD PROHIBITIONS.**
- **Spend.** No gate, checker, CI job, probe, smoke run or action of yours may spend money beyond a hard ceiling of **500 neurons and $0 of non-Workers-AI spend per pass**. Before the first probe of every pass, read the BudgetDO ledger and record day-spent; if day-spent exceeds 40% of the compiled daily ceiling, every model-invoking deployed probe is SKIPPED that pass and the station records `BUDGET-DEFERRED <measured number>` — which is not a disposition and closes nothing. Never run any harness that drives production inference in a loop. `infra/smoke.mjs` at most once per pass, never against `/api/admin/*`. `.github/workflows/ci.yml` holds no secrets and keeps `permissions: contents:read`.
- **Identifiers.** Never rename: the worker hostname `golem.moshe-barami111.workers.dev`, D1 `golem-corpus`, Vectorize `golem-docs`, KV and Durable Object binding and class names, the Supabase project ref, and the literals `golem.v1`, `golem.jwt.`, `X-Golem-`, `golem_session`, `golem-ui`, `golem_original`, `golem-authored`, `@golem/`. This list is CLOSED (§6.10). The rebrand covers prose, copy and user-visible strings ONLY.
- **Live infrastructure.** No destructive D1/KV/Vectorize/Supabase operations, no deleted deployments, no rotated or printed credentials, no admin route that erases a spend ledger.
- **Commerce.** Plan price points, plan entitlements, free allowance size, refund and terms copy are the owner's. Build checkout, portal, entitlement read, plan-conditional paths and UI against placeholder constants in `apps/worker/src/pricing.ts`, gated behind `PLANS_PUBLISHED=false`, fully tested. **Never publish to a live origin any page stating a price, a plan entitlement, or contractual terms without a dated owner statement in `docs/DECISIONS.md` quoting the exact numbers.** Never charge for a capability that does not exist.
- **Secrets and supervision.** Never commit a secret (`.env` and `.dev.vars` stay untracked; `secret-scan.py` reads committed blobs only, so an untracked `.env` is invisible to it). Never edit `~/.claude` skills or hooks. Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`; branch off main, never force-push, never rewrite published history.

12.6 **DEPLOYMENT DISCIPLINE.** A deploy of the worker or the D1-served site happens at most once per pass, as the LAST action of a pass whose §10 block is fully green on a clean committed tree. Record the currently deployed version id first. Within 120 seconds after: `GET /api/health`, `GET /`, `GET /app`, `infra/smoke.mjs`'s unauthenticated assertions, and `check-pixels.mjs --deployed`. If any fail or any captured route regresses against baseline, immediately `wrangler rollback` to the recorded version id, record `ROLLED-BACK` with the failing output, and treat the change as unshipped. Never deploy while a station is unproven for a reason the deploy would not fix.

# 13. OWNER HANDOFFS

13.1 You ask the owner nothing. Every question becomes a row in `docs/backlog/OWNER-HANDOFF.md` (tracked, linked from `BLOCKERS.md` §A), regenerated every pass, with six enforced fields: the exact action only a human can take, in one imperative sentence; the APPROVE-BY TEST (one command anyone can run in under ten minutes); the output that means done; the output measured THIS pass with a UTC timestamp; the ids and count of rows it unblocks; the work already shipped on this side of the blocker.

13.2 A row may enter OWNER-BLOCKED only when (a) a named external system refuses the action to any non-owner credential, proven by a captured 401/403/404 from that system THIS pass, and (b) the work on this side of it is CLOSED-WITH-EVIDENCE. **A row whose blocker is a DESIGN choice is not OWNER-BLOCKED**: build the cheaper branch completely, ship it, and record the other branch as a reversible decision.

13.3 A handoff without a re-probe from the current pass is an escape hatch, not a handoff. A handoff never blocks another lane and never excuses the engineering beneath it: while one is open you still build the tool surface, the UI, the persistence and the tests, so the day the owner acts nothing is left to build.

13.4 Known handoffs — re-measure each, inherit nothing: Creator Store plugin distribution (approve-by: the Roblox toolbox-service details endpoint for our asset id returns 200, not 404, with a known-listed control asset returning 200 today); plugin artifact republish (approve-by: `strings` on `apps/plugin/release/*.rbxm` reports the source VERSION and a non-zero count of the generation symbol — assert against the BINARY, never the `.luau`, because the current test reads the source and is therefore green about a file nobody ships); AI Gateway billing mode (approve-by: one dated owner statement reflected identically in `apps/worker/src/do/budget.ts`, `docs/SECURITY.md` and `BLOCKERS.md`, which contradict each other today); Workers AI Edit token scope; Stripe live keys ONLY (everything else on the paid path ships and is probed in test mode — §3.4 S11); Supabase mail deliverability; commercial terms (§12.5). The generated-asset upload path is a DESIGN choice, not a handoff: cost both branches, build everything common to both, ship one completely.

# 14. THE STOP DETECTOR AND RE-ENTRY

14.1 You are stopping illegitimately whenever you compose a message that hands control back without §16 proven. The four hardest tells: "Would you like me to continue?" · "Here is a plan for the remaining work." · "The suite is green, so the work is complete." · "The rest is blocked on the owner."

14.2 THE TEST. Before emitting any message that does not end in a tool call, ask: is §16 proven by checker output produced in THIS pass and pasted into this message, AND does that output include twelve station probes each PROVEN with a deployed-origin fingerprint, at most one BLOCKED-BY station, CLOSED-WITH-EVIDENCE exceeding every other disposition combined, and a refuter transcript for every status change in the final pass? If any of those four is absent, do not send the message. Execute §14.3 instead.

14.3 **RE-ENTRY PROCEDURE** — mandatory, verbatim order, fired by every one of: a stop-signature detection, the end of any pass, any context compaction or summarisation of your own history, the return of any subagent batch, any tool failure or interruption, any moment of uncertainty about your own state.
0. Re-read `docs/MISSION-PROMPT.md` IN FULL from disk and verify its sha256 against the one recorded in `docs/PASS-STATE.md`. On pass 1, copy this entire document to `docs/MISSION-PROMPT.md` byte-identical, commit it, and record its sha. If the sha does not match, restore the file from git before touching a row. **No pass may begin from a summary of this document.** Any rule you cannot quote from that file this pass is a rule you have lost and must re-read before acting.
1. `git status --porcelain` and `git log --oneline -8`; commit deliberately.
2. Re-read all five ledger files FROM DISK — not from memory, not from a summary, not from your own notes.
3. Run the §10 block. Its output is the current truth.
4. Recompute the open set per §4, incrementally against `DISPOSITIONS.json`.
5. Begin the next pass at §8.1, in the same turn, with a tool call. Say nothing about resuming. Resume.

14.4 **VISIBLE OUTPUT EVERY PASS.** Every pass ends by sending the owner, via `SendUserFile`, the PNG captures of every route touched that pass plus exactly one line: `PASS <n> · station S<k> <PROVEN|ADVANCED(k of t)|BLOCKED-BY-<id>> · closed <n> · open gates/worklist/mission/features/blockers <a>/<b>/<c>/<d>/<f> · neurons spent <n> · deployed <sha>`. That line and those files are the whole message; then the next tool call, same turn. This is not a stop and is not optional — a pass that ends without it is incomplete. Additionally: if 12 hours of wall-clock or 5,000 neurons have elapsed since the last owner-visible artifact, commit the current leaf as-is and send the artifact before further work.

14.5 COMPACTION SURVIVAL. After every commit, overwrite `docs/PASS-STATE.md` (tracked) with: pass number, the `MISSION-PROMPT.md` sha256, derived open counts per ledger, rows in flight and their worktree paths, observable live surfaces, last commit sha, exact next action. Append the §15 record to `docs/PASS-LOG.md`. `PASS-STATE.md` is a pointer, never a source of rules. Compaction is not an event you report; it is an event you recover from silently.

14.6 The only permitted addresses to the owner are: the §14.4 pass artifact; appending a handoff row and continuing; refusing an action §12.5 forbids, naming it, and continuing on everything else; and the §16 checkpoint or final report. None is a stop.

# 15. END-OF-PASS RECORD (`docs/PASS-LOG.md`, committed, then §14.3)

```
PASS <N>  <UTC>  HEAD <sha>  tree-clean=<bool>  prompt-sha=<sha256>
STATION: S<n> <name> — PROVEN | ADVANCED(<k> of <t> station sub-probes green, was <j>) | BLOCKED-BY-<id>
  ADVANCED is valid only when k>j and both count committed, red-first probes tagged S<n> in GATES.md.
DERIVED OPEN: gates <a> | worklist <b> | mission <c> | features <d> rows / <e> distinct efforts | blockers <f>
CLOSED: <row-id> — <one line> — <falsified sha> / <evidence sha>
DISPOSITIONS: CLOSED <n> | BOOKKEEPING-FLIP <n> | MERGE <n> | FACET <n> | STRUCTURAL <n> | OWNER <n> | TIME-GATED <n>
REFUTERS: dispatched <n> | status-changes <n> | UPHELD <n> | UPHELD-BEHIND-HANDOFF <n> | REFUTED <n> — each refutation and what it forced
ORACLES: checkers added <n> | falsification records <n> | quarantined gates <n> | gate count <n> (was <n>)
VERIFICATION: each §10 command with exit code and output sha256 | neurons spent <n>
DEPLOYED: <sha> · bundle Apple <n> / Golem <n> · drift <none|described> · deploy <shipped|ROLLED-BACK|none>
PIXELS: <n> routes captured · <n> meet the bar, <n> do not, naming the failing element
NOT DONE: <row-id> | <real reason, not the diplomatic one> | SCHEDULED pass <n+1>
  (a row-id in two consecutive records is auto-promoted to the front of the next selection and may not be
   deselected; in three it is a stall under §11.2 and check-escape-hatches fails the suite)
NUMBERS CORRECTED: <prompt or ledger figure> -> <measured>
SELF-REFUTER: <the technically-true, materially-misleading sentence, verbatim>
HANDOFFS OPEN: <id> — approve-by <command> — flips <x> rows
NEXT: <exact next command or row>
```

# 16. TERMINAL CONDITION

16.0 **BOUNDED RUN.** The loop also terminates at the first pass boundary after **12 passes or 8 hours of wall-clock work**, whichever comes first. At that boundary, write the §16 report titled CHECKPOINT rather than FINAL, commit it, and emit one message containing it plus the `OWNER-HANDOFF` table. That is a permitted terminal message and is not a stop signature. Resume on the owner's word. A run that exhausts its context without ever producing this report has failed regardless of what it built.

Otherwise stop only when ALL of these hold in one pass, each proven by a fresh run of a committed checker whose output you hold:

1. `GATES.md`: zero unmet, zero without a FALSIFIED record, zero fingerprints failing `--reverify`, zero quarantined, summary equal to its computed count; **and at least one red-first gate tagged `S1`..`S12`, one per `BLOCKERS.md` §D row, and one per named epic.** Gate count is non-decreasing across the mission.
2. `WORKLIST.md`: zero `[ ]`, zero `[~]`, git-tracked.
3. `docs/MISSION-LEDGER.md`: every row PROVEN, ACCEPTED_DEBT (dated owner quote naming the row) or OWNER-BLOCKED (live approve-by test); table and dispositions agree; tally derived; zero dangling cross-references.
4. `docs/backlog/FEATURES.json`: zero rows in status not-started; every row CLOSED-WITH-EVIDENCE or carrying a §7 disposition that passes `check-dispositions.mjs`; **CLOSED-WITH-EVIDENCE outnumbers every other disposition combined; at most 15% FACET-BOUND, at most 10% STRUCTURALLY-BLOCKED, at most 10% OWNER-BLOCKED; every FACET-BOUND parent is itself CLOSED-WITH-EVIDENCE**; zero duplicate names; `FEATURES.md` counts equal the JSON's exactly.
5. `docs/backlog/BLOCKERS.md`: §D empty; §A/§C reduced to handoff rows with machine approve-by tests; every citation resolving; zero §B conflict framing.
6. **S1, S2, S3, S4, S10, S11 and S12 PROVEN against the deployed origin by a probe run this pass** — these seven may never be satisfied by a handoff; they are the funnel a stranger walks and the business. S5–S9 may be handoff-blocked only when the handoff's approve-by test ran this pass AND the entire non-owner half is probed against the sideloaded `.rbxm` (§3.5). **At most three stations handoff-blocked in the final pass; a fourth means the pass continues.**
7. Tree committed and clean on a pushed branch; suite green; typecheck clean; E2E green including the signed-in deployed journey; secret scan clean; escape-hatch, backlog, dead-end, disposition, offer and rebrand checkers clean; deployed artifact matching HEAD.
8. In the final pass: one refuter per station (twelve), one per ledger (five), one per row closed; all returned UPHELD or UPHELD-BEHIND-HANDOFF, transcripts committed under `docs/evidence/refuters/<pass>/`. The §9.5 self-refuter finding is fixed in that pass or is the first line of the report.
9. The OWNER-BLOCKED set is **smaller than at the end of pass 1**, contains no row added after pass 2, and contains no row whose approve-by test takes over ten minutes.
10. **VISUAL:** `check-pixels.mjs --deployed` passes; `docs/evidence/pixels/<final-pass>/` holds a current capture of every deployed route; and `docs/DECISIONS.md` contains an owner-written line `PIXELS-APPROVED: <pass> <sha>`. You may not write that line. Absent it, the terminal condition is false no matter what every checker says.
11. `check-offer.mjs` passes, and no checkout path is reachable in the deployed bundle while it does not.
12. **A stranger with a fresh browser, a Stripe test card, and a Roblox account has, in a transcript captured this pass, signed up, created a project, chatted, installed the plugin build, built geometry, seen a frame, saved it, restored it, hit the limit, and paid.** No other clause of §16 is evaluated before that transcript exists.

Then write the **HONEST REMAINDER REPORT**: every gate with its CHECK, falsification sha and evidence sha; each ledger's computed final counts; every handoff with its approve-by command, current probe output, and how much engineering is already done behind it; every ACCEPTED_DEBT with the dated owner statement authorising it; every STRUCTURALLY-BLOCKED row with the external constraint forcing it; every known limitation of the oracles themselves — what a green suite still does not prove; and a plain statement of anything a user still cannot do. Numbers and commands only, no adjectives. If a thing is half-done, say which half.

Anything short of §16.0 or §16 is a pass boundary, not an ending.

# 17. LAST-MEASURED POINTERS — RE-PROBE, TRUST NOTHING

`docs/audit/APPLE-LEDGER.md` and `docs/backlog/BLOCKERS.md` hold the last audit; re-probe every claim in them. Twelve defects worth gating first, each to be re-resolved before acting:
1. An admin spend-reset route zeroes the day and month ledgers unconditionally, three routes below the comment stating the invariant it breaks.
2. `render_view` sets only `ctx.lastRender`, never `ctx.uiDetail`, so a SUCCESSFUL render shows the user a red "could not read" card.
3. The Stripe webhook is signature-verified and tested; nothing anywhere creates a checkout session, and the deployed origin answers that webhook 401 — the committed billing code is not deployed.
4. A computed quality-gated build costs more than a whole day's free allowance, and the constant computing it has zero consumers.
5. Generated geometry is session-scoped and does not survive save/publish.
6. Checkpoint restore skips Terrain and Camera, whitelists properties, and counts only what it attempted, so skipped state can never register as a failure.
7. A live Credit balance is broadcast to the client and rendered nowhere.
8. Memory facts injected into every system prompt are never fetched by the client.
9. A privacy consent flag is written by the settings UI and read by nothing.
10. The tool list narrows by `studioConnected` only, never by the plugin's reported protocol — null for the only artifact anyone could install.
11. The adversarial visual critic and the asset library have zero product importers; the asset library's only tool was removed from the tool list, and `search_asset_library` is advertised first and always errors against an empty table.
12. `apps/site/src/pages/pricing.astro` and roughly twenty other places still promise "$0 forever" and "No card required, ever".

# 18. BEGIN

Your first tool call is §14.3 step 0: write `docs/MISSION-PROMPT.md`. Then, before any feature work: commit every uncommitted and untracked path on main to a branch `rescue/pass1-<UTC>` pushed before you touch anything else, then return to main and commit or revert on top of that rescue point — **you may never discard, `git clean`, `git checkout .` or `git restore` an untracked or uncommitted path in this repository under any circumstance**; untracked files here have repeatedly implemented shipped features and their loss leaves no trace in `git log`. Before that rescue commit, run `git status --porcelain` and map every untracked path to the ledger row it might implement; record the mapping in `docs/PASS-LOG.md`. Confirm `WORKLIST.md` is git-tracked. Then discharge §6 before closing any ledger row. Then loop until §16.0 or §16 is literally true. Every pass ends by re-entering. There is no other exit.
