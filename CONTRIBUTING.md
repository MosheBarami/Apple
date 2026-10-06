# Contributing to StudPilot

How work gets done in this repository. Read it once at the start of every session.

- **Who builds:** Claude Code is the only builder.
- **Who decides:** the owner (Moshe), a non-technical solo founder. He decides by looking at results.
- **Where this file sits:** it sets **how** to work. **What** to build is set by the plan, the handoff and the owner's decisions.
- **When documents disagree on how to work, this file wins.** That includes `CLAUDE.md`, `AGENTS.md`, `GATES.md`, `WORKLIST.md`, `FINISH-THE-PRODUCT.md` and the PR template.
- **The owner's latest message in chat wins over everything.**

Last updated: 2026-10-06.

---

## 1. What matters right now

**The one number that matters is the pass rate on the dev test set.** On 2026-10-06 the M3 baseline was **0 of 20**: U01–U15 and S01–S05 all failed. Every hour should move that number, or remove something that stops it from moving.

**Work order** (do not reorder without the owner):

1. **Style:** finish the StudKit work from `planning/STYLE-BIBLE.md`, then re-run **U01–U15** and report every area, including "style".
2. **Web rebuild:** `planning/WEB-REBUILD.md`, started only after step 1 has been reported.
3. **Blocks:** M5b–d (systems, props, zones) with the world kit.
4. **Pricing:** M6 (cost and pricing). Checkout stays off until X5 is done.
5. **Final proof:** M7, which includes the hidden test set (X8).

Anything not on this path goes to `planning/proof/LATER.md` as one line, unless it blocks the path.

## 2. Sources of truth

| Question | File |
|---|---|
| Why, the quality bar, the milestones | `planning/STUDPILOT-FINAL-PLAN.md` |
| Build order and steps | `planning/STUDPILOT-HANDOFF.md` |
| How output must look | `planning/STYLE-BIBLE.md` |
| The website and app rebuild | `planning/WEB-REBUILD.md` |
| The owner's answers | `planning/proof/OWNER-DECISIONS.md` |
| Waiting on the owner | `planning/proof/BLOCKED.md` |
| Not blocking, fix later | `planning/proof/LATER.md` |
| Tried and failed; don't retry | `docs/backlog/DEADENDS.md` |
| The 60 frozen dev requests | `planning/STUDPILOT-TEST-SET-DEV.md` |
| Repo map, names, bindings | `AGENTS.md` |

- **History only, never instructions:** `docs/autonomy/`, the old `/goal`, the bench loop, the old meter, SGSD.
- **When the code and a document disagree,** trust the code, and fix the document in the same PR.

## 3. Speed rules

These exist because about 51 hours (2026-10-04 to 10-06) produced 48 PRs and 198 CI runs:

- 43 of the CI runs failed and 58 were cancelled;
- a typical PR took about 15 minutes from open to merge, mostly waiting for CI;
- the product's pass rate did not move.

**The rules:**

1. **Batch the work.** One PR per milestone step, or per coherent slice of a step. Not one PR per small change. **Aim for ≤ 8 PRs a day.**
2. **Never sit idle waiting for CI.** Open the PR, then start the next task. Come back when CI has finished.
3. **One fix cycle.** If a gate fails after one honest fix attempt:
   - write the failure to `STALLED.md` (in the milestone's proof folder) or `LATER.md`;
   - move on.

   Don't loop.
4. **No multi-agent reviews.** No reviewer swarms, skeptic agents or checker chains. A self-review of the diff is enough; CI does the rest.
5. **Run tests locally only where the change is.** Run the affected package, or the specific test files. Run the whole suite only before closing a milestone.
6. **Deploy once per batch,** not once per PR. See §7.
7. **Keep replies to the owner short.** See §13.
8. **Gold-plating is forbidden.** Build what the step asks for, nothing more. Ideas go to `LATER.md`.

## 4. Branches, PRs and merging

### 4.1 What the ruleset enforces
`main` is protected by `.github/rulesets/main.json`:
- every change lands **through a PR**;
- no force-push, no deleting `main`.

These 6 checks must pass:
- Typecheck and tests;
- Build site and web;
- Build and verify the Studio plugin;
- Static checks;
- Secrets and dependencies;
- Playwright smoke.

### 4.2 Branches
- **Name:** `<milestone>/<short-slug>`, e.g. `m5a/studkit-window`, `w/opennext-spike`.
- Branch from `main`. Keep it under a day old. Rebase or merge `main` in before opening the PR.

### 4.3 PR title and description
- **Title:** `<Milestone> <step>: <what changes, in plain words>`, e.g. `M5a 5.3: StudKit window and card components`.
- **Description: at most 15 lines,** in this shape:

```
What: one or two sentences, user-visible.
Why: the plan or decision it serves (e.g. STYLE-BIBLE §3.4, W-plan §2).
Measured: the number you measured live, and how — or "nothing measured live".
Risk: what could break; how to roll back.
Owner action: none / see BLOCKED.md <id>.
```

Update `.github/pull_request_template.md` to this shape. The old template's "3 unseen requests per category, including whole game" no longer applies: the whole-game path is removed.

### 4.4 Merging
- **Squash merge.** The commit message is the PR title.
- **Docs-only PRs** (only `*.md`, `planning/**`, `docs/**`) use the fast path in §5.3. Merge as soon as it is green.

## 5. CI

### 5.1 What CI is for
CI is a safety net against breaking production. It is not a place to prove things. It must never:
- call a paid model;
- hold secrets;
- deploy.

These three rules come from the cost policy at the top of `ci.yml` and they stay.

### 5.2 Time budget
**Measured (2026-10-06):** a passing CI run takes **about 9.4 minutes** (median), up to 19.

| Target | Time |
|---|---|
| Code PR | **≤ 5 minutes** |
| Docs-only PR | **≤ 1 minute** |

Report CI time before and after every change to CI.

### 5.3 The docs-only fast path
**Do not** use `paths-ignore` on the workflow. The 6 checks are *required*. A skipped workflow never reports, so the PR waits forever.

Instead:
1. Add a first job, `changes`, that detects whether anything outside `*.md`, `planning/**` and `docs/**` changed (`dorny/paths-filter` or a short `git diff --name-only` script).
2. Every required job runs as normal, but when `changes` says docs-only, its steps are skipped (`if:` on the steps). The job then **succeeds in seconds**, and the required check is satisfied.

### 5.4 Shrinking the suite
At the time of writing the repo has **949 test files** (about 10 MB) and **710 Markdown files**. CI is slow mostly because of this. In order:

1. **Retire guards on words.** Tests whose only job is to check the wording of documents (proof figures, legal-claim cites, backlog dispositions, "restated sheet" tests) are removed from CI.
   - Keep the guards that protect users or money: secrets, the old-names guard, credit figures matching what the worker charges, spend caps.
2. **Source-text tests.** Many worker tests assert on source text, for example "this call sits within N characters of that guard".
   - When one breaks on a refactor, rewrite it to test the **behaviour**, or delete it if the behaviour is covered elsewhere. **Never weaken a test just to get green.**
   - Don't write new source-text tests.
3. **Remove the old apps' tests with the W-plan switch.** When `apps/www` goes live (W-plan step 7), these leave the required checks and CI, and are deleted at W-plan step 8:
   - the tests and build steps of `apps/site` and `apps/web`;
   - the old site's Chromium/Playwright steps.
4. **Flaky tests.** A test that fails without a code change:
   - is quarantined (skipped with a `LATER.md` line naming it) **the first time**;
   - is fixed or deleted within the milestone.

   Never re-run CI just to hope it passes.

### 5.5 Other automation
- **Dependabot:** off until M7. Set `open-pull-requests-limit: 0` for both ecosystems in `.github/dependabot.yml`.
  - Close the open Dependabot PRs.
  - Security alerts stay on (a repository setting, not this file).
- **Code scanning and AI findings on every PR:** move to once a week. Turning off the per-PR AI findings is a repository setting; if no token can reach it, add it to `BLOCKED.md` as an owner click.

## 6. Tests: how to write them
- **Test behaviour, not text.** Assert what the user or the API sees, not how the source is spelled.
- **Red first, for bug fixes only.** See the new test fail for the stated reason, then fix.
- **No tests for documents.** Markdown is not tested, except link checks on the live website.
- **No real network or paid calls in tests.** Inject `fetchImpl`, as the existing tests do.
- **Local commands** (see `CLAUDE.md` for the full list):

  ```bash
  cd apps/worker && node --test tests/<file>.test.mjs   # one file
  cd apps/worker && pnpm typecheck                      # one package
  pnpm -r typecheck && pnpm -r test                     # everything: before closing a milestone only
  ```

## 7. Deploying
- Deploy only with these scripts, from a clean tree, after the PR is merged:

  ```bash
  node infra/deploy-studio.mjs     # the Studio worker (before deploy-worker when both change)
  node infra/deploy-worker.mjs studpilot
  node infra/deploy-static.mjs     # site + SPA (until the W-plan switch)
  ```

- **After a deploy:** `https://studpilot.app/api/health` must show the `buildSha` of the merged `main` HEAD. If it doesn't, the deploy failed. Roll back or fix before anything else.
- **Deploy once per batch.** Docs-only changes are never deployed.

## 8. Quality and evaluation

### 8.1 The bar (plan §4.3 and STYLE-BIBLE §7; rubric v2)
A test build passes only if **all** of these are true:
- **every area ≥ 8 out of 10:** delivers, visual, layout, ui, life, polish and **style** (style is judged against the fixed reference board);
- no severe flaw;
- no style signature "missing";
- **0 play-test errors;**
- **0 false claims** (the claim audit);
- the block's functional checks pass;
- the colour gate and the kit lint pass (STYLE-BIBLE §6);
- the UI shots show every panel **open** (the `proofOpen` hook).

### 8.2 Critics
- **During development:** one fresh critic per test build. Label it "single critic" in the report.
- **When closing a milestone and at M7:** two fresh critics, and the lower score counts.
- A critic sees only:
  - the request line;
  - the screenshots;
  - for "style", the reference board.

  It never sees the reply, the code or earlier scores.

### 8.3 Test sets
- `planning/STUDPILOT-TEST-SET-DEV.md` is **frozen**. Never edit a request after seeing its score. New requests go in a new `dev-v2` file.
- **The hidden set** comes from the owner at M7 only (X8). Never ask for it earlier. It is never committed.

### 8.4 Reporting
Every evaluation report starts with:
- the pass count ("U01–U15: 3 of 15 pass");
- the median of each area;
- the worst three flaws.

The raw files follow, in `planning/proof/<milestone>/`.

### 8.5 Spend
- **Workers AI caps:**
  - 300,000 billable neurons a day (about $3.30);
  - 2,270,000 a month (about $25);
  - see `apps/worker/src/pricing.ts`.
- **Test spend:** at most $20 a month (the harness's `--max-month-usd`).
- **One test build** costs about 8,000 neurons (about $0.09).
- If a run would cross a cap, stop. Never raise a cap without the owner.

## 9. Product rules (never break these)
1. **No vision in the product,** and no owner library. No whole-game path (`compose_game`, `plan_game`, `build_game`). Don't re-add any of them.
2. **One build model,** GLM 5.3 Flash, behind one switch.
3. **The model picks a reviewed block and fills its parameters; the system runs it.** The system never picks a block from the request's words.
4. **Kit-only visuals.** GLM may set text, numbers, colour-token *names*, icon names from the pack, and counts. A plan with raw `Color3`, `Font`, `UIStroke`, `UICorner`, gradient or size values for UI is rejected. Custom code is allowed for logic, never for visuals.
5. **No visual claims in replies.** Never write "verified", "looks", "beautiful" or "matches" about how something looks. Only the critic judges visuals.
6. **At most one question** before building. Best effort, with any gaps listed.
7. **Users are 13 and up.** Refuse requests that break Roblox rules, and mature content. Compliance gaps are warn-only.
8. **Roblox data:**
   - uploads go to **each user's own Roblox account** (OAuth);
   - `ROBLOX_CREATOR_USER_ID` is **never set**;
   - never upload to the owner's account;
   - no AI training on Roblox data, and it must be wipeable if API access is lost.

## 10. Style
- `planning/STYLE-BIBLE.md` is the law for how output looks. A build that works but doesn't look like the references fails.
- **The reference images never go in the repo** (it's public, and they are other people's games). They live in a git-ignored `private/style-refs/` folder and in private R2 (`studpilot-media/style-refs/`).
- The style is built **once, by hand, in the StudKit.** Claude Code compares its own Studio captures with the references. GLM never designs.

## 11. The website and app rebuild (W-plan summary)
- **A new app in a new folder:** `apps/www`, from the vercel/chatbot template (pinned commit and license recorded in `apps/www/TEMPLATE.md`). Chat parts come only from `npx ai-elements@latest add …`.
- **`apps/www` must not import:**
  - `@studpilot/design`;
  - `apps/web`, `apps/site` or the `apps/studio` UI;
  - the old CSS, fonts or tokens.

  CI fails the build on any such import.
- **Old words are banned.** "Untitled piece", "piece", "Public Studio installation", "Engine", "Showcase".
- **The layout:** no dashboard (sign in → chat). A playful website, a clean app.
- **Owner preview:** stop at W-plan step 5 and wait for the owner's yes on 4 screenshots.
- **After 3 days live,** delete the old front-ends.

## 12. Security, secrets and licenses
- **The repo is public.** Never print, paste, commit or screenshot a secret value: in code, tests, logs, PR text or replies.
- **`.env`:** agents may read and write it (owner consent). Its values are never echoed or logged.
- **`.dev.vars`:** stays denied.
- **The owner's personal email address never goes in the repo.** Use support@studpilot.app.
- **Third-party code:**
  - MIT and Apache-2.0 are fine; list each in `THIRD_PARTY_NOTICES.md`;
  - **AGPL (e.g. madebyshaurya/stud): ideas only, no code;**
  - check the license before copying anything.

## 13. Money, deletions and owner actions

### Needs the owner's "yes" first
- any money: a new paid plan, a Supabase custom domain, an extra Cloudflare product, a paid asset pack;
- raising a spend cap;
- anything on the owner's Roblox account;
- owner-only actions **X4, X5, X7, X8, X9** and **N2, N5, N9**.

### Already allowed (handoff ground rule 6)
- changing or deleting Cloudflare, Supabase and Sentry resources;
- deleting branches and untracked files;
- removing old names.

**Deleting data** waits **7 days** after its replacement is verified (see `planning/proof/M1/deletions.md`).

### When blocked
Add an entry to `planning/proof/BLOCKED.md`:
- what is needed;
- why;
- the exact clicks, in plain words.

Then **continue with everything that doesn't depend on it.**

## 14. Documentation
- **One `SUMMARY.md` per milestone** in `planning/proof/<milestone>/`, at most one page.
- **Other proof files** only when a gate needs them: verdicts, screenshots (downscaled), manifests.
- **`LATER.md`:** one line per item. **`DEADENDS.md`:** one paragraph per dead end.
- **No new top-level documents.** Update an existing one, or put it in `planning/`.
- **Don't write documents nobody will read.** If a document isn't linked from §2 or a milestone summary, it probably shouldn't exist.

## 15. Talking to the owner
- **Plain words, short paragraphs.** Explain any technical term in one line, or don't use it.
- **Say "test build"**, never "piece". Say "automatic checks" before "CI" the first time.
- **Status messages:**
  1. what changed for the product;
  2. the pass count;
  3. what is blocked, with the exact owner action;
  4. what's next.

  At most 10 lines.
- **Honesty:**
  - Keep measured facts, estimates and opinions separate.
  - Say "unknown" when it is.
  - Never say "done", "works" or "verified" without the evidence linked.
- **Questions to the owner:** multiple choice, 2–4 options, the recommendation first, batched.

## 16. Session hygiene (to save the owner's Claude quota)
- **Model:** Sonnet for routine edits, tests and docs. Opus only for hard design or debugging.
- **One session per milestone step.** Start a new one when the context is large.
- **Reading files:**
  - read the map (`AGENTS.md`) and the file outline, not whole large files;
  - when reading logs, read the end (`tail -n 100`), not the whole log.
- **No new mods or plugins.** The owner-approved mods stay, but don't add more.
- **The Recap block** from `CLAUDE.md` goes only on the final message of a step, not on every reply.
