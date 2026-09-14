
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

--------------------------------------------------------------------------------
PASS 2  2026-09-14T17:14:09Z  HEAD 64096c8  tree-clean=false  prompt-sha=6428cb9e38a43e198554a593416b64a1940af7886ac32ea1a3c35984b4f83ecd

STATION: none PROVEN. No deployed-origin probe ran. S1 advanced in the repo only — two
  contractual terms removed from the pricing page — which is not a station claim and is
  not recorded as one.

DERIVED OPEN: gates 4 met / 31 open of 35 | worklist 6
  | features 1084 not-started of 1249

CLOSED:
  G-CRITIC-1  — the critic cannot report clean for checks it never ran — a50e9d2 / e0ba958
  G-ORACLE-2  — the escape-hatch checker, 22 detectors each driven by a planted violation — 61768ab / (recorded)
  G-ORACLE-3  — the offer checker, measuring four numbers a plan must reconcile — e3f864b / (recorded)

OPEN AND HONESTLY RED:
  G-OFFER-1 [S1] — blocked on OH-1 and OH-2, which are numbers §12.5 reserves to the owner.
    Not abandoned, not deferred: the checker exists, is red, and names what is wrong.

WHAT PASS 2 FOUND, measured not inherited:
  - THE FREE PLAN CANNOT FINISH ONE BUILD. PLAN_LIMITS.free.sparksPerDay is 60 and
    SPARKS_PER_BUILD is 77, so buildsPerDay('free') is literally 0. A free tier that
    completes nothing is not a trial; it demonstrates the product not working.
  - TWO PLANS PROMISE MORE THAN THE SERVICE CAN SERVE. team grants 1,500 Sparks/day and
    enterprise 6,000, against DAILY_NEURON_CEILING of 25,000 neurons = 833 Sparks for
    EVERY USER COMBINED. One Team subscriber exhausts the day for everyone. That is not a
    pricing mistake; it is a promise that fails when someone uses what they bought.
  - THE PRICING PAGE CARRIED TWO CONTRACTUAL TERMS the owner never authorised: "No card
    required, ever" and "You will never be charged". Removed; replaced with what is true
    today and no promise about tomorrow.
  - THE CRITIC COULD NOT SAY "I DID NOT LOOK". applyMetricRules skipped a rule whose
    metric was missing, silently, so a partial metric set produced a short defect list
    indistinguishable from a clean build. Reported now, attributed to lens and subject,
    and the caveat prints ABOVE the tally because the tally is the sentence a reader
    forms an opinion from.
  - apps/site's typecheck was behind || true and therefore could not fail. Removed and
    proven: a planted type error gives 3 errors, restoring the file gives 0.
  - EVERY GENERATED IMAGE IS BILLED AND DISCARDED. storeImage writes image:<uuid> to KV,
    generate_image returns the key, and nothing in apps/worker/src, apps/web/src or
    packages reads it back. Live, billed, output never seen. Contract for the fix agreed
    with rbxai-a3; the route is mine. SCHEDULED pass 3.

DISPOSITIONS: CLOSED 3 | BOOKKEEPING-FLIP 0 | MERGE 0 | FACET 0 | STRUCTURAL 0 | OWNER 2 (OH-1, OH-2) | TIME-GATED 0

REFUTERS: dispatched 2 of 3 status changes, results not yet returned at the time this
  record was written. This is an incomplete discharge of §9.1 and is recorded as such
  rather than as a pass. G-ORACLE-3's refuter is the missing one. SCHEDULED pass 3.

ORACLES: checkers added 2 (check-escape-hatches, check-offer) | falsification records 3
  | gate count 35 (was 31) | OWNER-HANDOFF.md created with 4 rows

VERIFICATION:
  gate-check.mjs --lint          exit 0   LEDGER WELL-FORMED — 35 gates, 0 problems
  gate-suite.mjs                 exit 0   SUITE GREEN, 2206 passed, 0 failed
  gate-typecheck.mjs             exit 0   TYPECHECK CLEAN
  check-escape-hatches.mjs       exit 0   CLEAN, 421 files examined
  check-offer.mjs                exit 1   INCOHERENT, 3 problems — the honest state
  neurons spent 0

DEPLOYED: not probed, not deployed. §10.2 drift invariant outstanding for a second pass.

PIXELS: 0 routes captured. check-pixels.mjs still does not exist (§6.9).

NOT DONE:
  §6.2 back-fill  | 31 gates still have no falsification record | SCHEDULED pass 3
  §6.5 check-backlog.mjs | not written | SCHEDULED pass 3
  §6.6 check-deadends.mjs | not written | SCHEDULED pass 3
  §6.7 check-dispositions.mjs | not written | SCHEDULED pass 3
  §6.9 check-pixels.mjs | not written | SCHEDULED pass 3
  §6.10 check-rebrand.mjs | not written | SCHEDULED pass 3
  §10.2 drift | deployed origin unprobed for two passes | SCHEDULED pass 3
  image leak | route is mine, contract agreed | SCHEDULED pass 3

NUMBERS CORRECTED:
  pass 1 said 31 gates -> 35 now
  suite 2163 -> 2206
  prompt §17 lists 12 defects; a 13th is now measured — the billed-and-discarded image path

SELF-REFUTER: not dispatched. §9.5 debt carried from pass 1, SCHEDULED pass 3. The sentence
  I expect it to find is "3 gates CLOSED this pass": true, and materially misleading, because
  all three are gates on ORACLES rather than on product behaviour a user could notice. The
  product diff this pass is real but small — one critic fix, two copy lines, four escaped
  control bytes — and calling three oracle closures progress toward a shippable product
  overstates what changed for anyone using it.

HANDOFFS OPEN: OH-1 free-plan allowance — approve-by node scripts/check-offer.mjs — flips 1 row
               OH-2 team/enterprise daily grant vs service ceiling — same command — flips 1 row
               OH-3 Stripe live keys — NOT PROBED this pass, opening balance only
               OH-4 Creator Store distribution — NOT PROBED this pass, opening balance only

NEXT: node scripts/check-rebrand.mjs does not exist; write it red-first (§6.10), then probe
  the deployed origin for §10.2 before anything else claims a station.
