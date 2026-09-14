
================================================================================
PASS 1  (mission prompt adopted)  prompt-sha=6428cb9e38a43e198554a593416b64a1940af7886ac32ea1a3c35984b4f83ecd

§18 UNTRACKED/UNCOMMITTED MAP — every path present at pass start, mapped to the ledger
row it might implement. Recorded BEFORE the rescue commit.

  ?? apps/web/src/components/plans.tsx
       -> WORKLIST.md w12 "Plans and credits surfaced in the product, not only in the
          webhook". Mid-flight: renders PLAN_COPY/PLAN_LIMITS from @golem/shared. NOT yet
          imported by any route, so by §2.3 it is a DEAD END until wired.
  ?? docs/MISSION-PROMPT.md
       -> no ledger row; this is §14.3 step 0 itself.
   M GATES.md
       -> gate id collision repair (a second G25 had been introduced); renumbered to G26.
   M apps/worker/src/pricing.ts
       -> w12. PLAN_LIMITS/PLAN_IDS/isPlanId/SPARKS_PER_BUILD moved to @golem/shared and
          re-exported, so the plan page and the QuotaDO ledger read one table.
   M packages/shared/src/index.ts
       -> w12. PLAN_LIMITS + PLAN_COPY + buildsPerMonth/buildsPerDay added.

  WORKLIST.md: git-tracked (verified with `git ls-files --error-unmatch`).

--------------------------------------------------------------------------------
PASS 1  2026-09-14T17:04:54Z  HEAD 1012feb  tree-clean=yes  prompt-sha=6428cb9e38a43e198554a593416b64a1940af7886ac32ea1a3c35984b4f83ecd

STATION: none probed. Pass 1 is §6 oracle repair and §11.3 permits exactly one NULL
  PASS for it. No station claim is made, because no deployed-origin probe ran.

DERIVED OPEN: gates 1 met / 30 open | worklist 6 | mission not re-derived this pass
  | features 1084 not-started of 1249 | blockers not re-derived this pass

CLOSED:
  G-ORACLE-1 — the gate checker can now say no — falsified 30cda94 / evidence cd075ec

WHAT §6.1 ACTUALLY FOUND, measured not inherited:
  - `gate-check.mjs --reverify GATES.md` was a SILENT NO-OP. Flags were parsed with
    `args.includes()`, so an unrecognised flag fell through to an ordinary verify and
    printed a green summary. Every pass that believed it had re-verified fingerprints
    had not. §16.1 was vacuously satisfiable. Unknown flags now exit 2, proven by an
    executed test, and by the red-first break that removed that exact branch.
  - The typed ledger summary said 26 gates / 26 met. The file had 30 boxes, all ticked.
    The tally is now computed from the checkboxes and `--lint` fails on disagreement.
  - `output-sha256` was taken over raw output containing per-test durations, so NO test
    gate's fingerprint could ever reproduce. The first real --reverify quarantined all
    31 gates for a reason unrelated to the code. Fixed by normalising noise and proven
    to still discriminate: a changed command, test set or assertion message each move
    the sha; two runs of an unchanged gate now agree.
  - Four tracked source files were BINARY to grep. `grep -c e` over
    apps/web/src/lib/commands.tsx printed nothing and exited 1 — read by every
    grep-based check as "no matches" rather than "I could not look". One was written
    earlier in this same session by a heredoc emitting a raw byte instead of an escape.
  - TWO EVAL SUITES WERE REPORTING THE NETWORK. asset-qc and provenance shelled to
    `npx esbuild` from a package that does not declare esbuild, so npx fetched it from
    the registry: green on a warm machine, red on a clean one. Both also used
    --platform=neutral, which defaults mainFields to EMPTY and cannot resolve a
    workspace package at all. Seven files had the shape; all fixed.
  - `gate-suite.mjs` was NOT a superset of root `pnpm test`: it skipped
    check-workspace-coverage.mjs, so it could print SUITE GREEN while a package had
    dropped out of the recursion — the exact defect that checker exists to catch.

DISPOSITIONS: CLOSED 1 | BOOKKEEPING-FLIP 0 | MERGE 0 | FACET 0 | STRUCTURAL 0 | OWNER 0 | TIME-GATED 0

REFUTERS: dispatched 0 | status-changes 1 | NOT RUN — this is a §9.1 debt, scheduled pass 2.
  The one status change is G-ORACLE-1, whose red-first record is its own adversary: it was
  observed failing at break-sha 30cda94 with the shipping path removed. That does not
  discharge §9.1 and I am not calling it discharged.

ORACLES: checkers added 1 (assert-tests.mjs) | gate-check.mjs rewritten | falsification
  records 1 | quarantined gates 30 | gate count 31 (was 30)

VERIFICATION:
  gate-check.mjs --reverify GATES.md    exit 1   31 gates, 1 met, 30 unmet
  gate-suite.mjs                        exit 0   SUITE GREEN, 2163 passed, 0 failed
  gate-typecheck.mjs                    exit 0   TYPECHECK CLEAN
  neurons spent 0 — no model-invoking probe ran this pass

DEPLOYED: not probed, not deployed. Drift unmeasured — a §10.2 debt, scheduled pass 2.

PIXELS: 0 routes captured. check-pixels.mjs does not exist (§6.9 NOT STARTED).

NOT DONE:
  §6.2 red-first back-fill | 30 gates have no falsification record; each needs a worktree,
    a break of its shipping path, and a recorded red. This is the bulk of §6. | SCHEDULED pass 2
  §6.3-§6.10 checkers | none written | SCHEDULED pass 2
  §9.1 refuters | not dispatched this pass | SCHEDULED pass 2
  §10.2 drift invariant | deployed origin not probed | SCHEDULED pass 2

NUMBERS CORRECTED:
  prompt §6.1 "knows only --approve/--lint/--gate" -> it also knew --status, --timeout, --file
  ledger typed summary "26 gates, 26 met" -> 30 boxes, now 31 gates / 1 met
  suite 2138 passed -> 2163, because two suites that were silently failing now run

SELF-REFUTER: not dispatched. §9.5 debt, scheduled pass 2. The sentence I would expect it to
  find is "SUITE GREEN — 2,163 passed": true, and materially misleading, because 30 of the 31
  gates that suite backs have never been observed failing, so the number measures how much runs,
  not how much is proven.

HANDOFFS OPEN: none re-probed this pass. OWNER-HANDOFF.md not yet written — §13.1 debt.

NEXT: node scripts/check-escape-hatches.mjs does not exist; write it red-first (§6.4).
