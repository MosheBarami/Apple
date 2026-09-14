
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
