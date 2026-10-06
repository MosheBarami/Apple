# M3 baseline

Measured numbers only, written by `scripts/eval/baseline.mjs` from the piece folders in this directory. Nothing here is rounded up.

## Pass rate (plan 4.3)

- **Passing / attempted: 0 / 60 (0.0%)**
- failing 20, not evaluable 0, awaiting critics 40
- **One critic, not two:** 20 of 20 scored pieces were scored by a single critic (owner token rule, 2026-10-05), so "the lower of the two critics" is that critic's score. That is a weaker test than the plan's two independent critics.
- attempted = pieces whose agent run was made. Dry runs not counted: 0. Not run (harness stopped first): 0.
- Conversation: 60 of 60 attempted pieces ran in a FRESH conversation (the project's chat, the memory it produced and the build ledger were cleared just before the run, by POST /api/admin/conversation-reset).
- **Passing, with the functional-check clause waived: 0 / 60 (0.0%)**. This is NOT the plan's pass rate. Per-request scripted functional checks do not exist before M5, so the strict rate above cannot be above 0 by construction; this line says how many pieces satisfy the other four clauses (critics, severe flaws, play test, claim audit).

Why pieces did not pass (a piece can have several reasons):

- 20 x visual: lower score below 8
- 20 x layout: lower score below 8
- 20 x ui: lower score below 8
- 20 x life: lower score below 8
- 20 x polish: lower score below 8
- 20 x functional checks not defined (they arrive in M5)
- 19 x delivers: lower score below 8
- 17 x unsupported claims
- 16 x severe flaw 1
- 6 x severe flaw 2
- 4 x severe flaw 5
- 3 x run did not end normally (incomplete)

Awaiting critics (run write-verdicts): P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14, P15, S06, S07, S08, S09, S10, S11, S12, S13, S14, S15, Z01, Z02, Z03, Z04, Z05, Z06, Z07, Z08, Z09, Z10, Z11, Z12, Z13, Z14, Z15

## Mean of the lower critic score, per area and category

Scores are 0 to 10. Each cell is the mean over the pieces that both critics scored in that area (an area both marked N/A is left out); the count of pieces is in brackets.

| Category | Delivers the request | Visual quality and art direction | Layout, composition and scale | UI/UX clarity | Feedback and life | Polish | Pieces |
|---|---|---|---|---|---|---|---|
| UI | 3.67 (15) | 4.77 (15) | 3.87 (15) | 3.63 (15) | 2.57 (15) | 3.67 (15) | 15 |
| Systems | 5.80 (5) | 6.30 (5) | 6.10 (5) | 6.00 (5) | 4.30 (5) | 5.60 (5) | 5 |
| Props | n/a | n/a | n/a | n/a | n/a | n/a | 0 |
| Zones | n/a | n/a | n/a | n/a | n/a | n/a | 0 |
| **All** | 4.20 (20) | 5.15 (20) | 4.43 (20) | 4.22 (20) | 3.00 (20) | 4.15 (20) | 20 |

## Cost and time per piece

- Credits per piece (as the app shows them, 58 pieces measured): mean 0.70, max 6.03, total 40.43.
- Agent-run minutes per piece (60 measured): mean 3.22, max 15.06, total 193.07.
- Whole-harness minutes per piece (run plus reset, captures and play test, 60 measured): mean 3.48, max 15.35.

## Workers AI spend

- Before the first run: month $3.92 (356540 billable neurons), today 0 neurons
- After the last run: month $5.97 (542382 billable neurons), today 195842 neurons
- Change in the month's estimate: $2.0443 (the figure counts every caller, not only these runs).

## Play test

Pieces with play-test errors: S01 (1), S06 (1), S09 (2), U08 (1).

## Pieces

| Id | Category | Status | delivers | visual | layout | ui | life | polish | Severe | Play errors | Unsupported claims | Credits | Run min | Ended |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P01 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P02 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P03 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P04 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P05 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P06 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P07 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P08 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P09 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P10 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P11 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P12 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P13 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P14 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| P15 | props | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| S01 | systems | fail | 6.0 | 6.0 | 6.5 | 6.0 | 6.5 | 6.0 | 0 | 1 | 5 | 2.10 | 8.19 | done |
| S02 | systems | fail | 5.0 | 5.5 | 6.0 | 5.5 | 3.0 | 5.0 | 2 | 0 | 3 | 0.53 | 2.80 | done |
| S03 | systems | fail | 6.5 | 7.0 | 6.5 | 6.5 | 5.5 | 6.0 | 0 | 0 | 2 | 6.03 | 15.06 | timeout |
| S04 | systems | fail | 5.5 | 6.5 | 6.0 | 6.0 | 2.5 | 6.0 | 0 | 0 | 1 | 1.01 | 7.59 | incomplete |
| S05 | systems | fail | 6.0 | 6.5 | 5.5 | 6.0 | 4.0 | 5.0 | 0 | 0 | 5 | 1.75 | 6.98 | done |
| S06 | systems | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 1 | n/a | 1.12 | 7.05 | done |
| S07 | systems | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0.50 | start-failed |
| S08 | systems | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 1.50 | 10.13 | done |
| S09 | systems | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 2 | n/a | 1.95 | 15.06 | timeout |
| S10 | systems | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 1.19 | 8.03 | incomplete |
| S11 | systems | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 4.31 | interrupted |
| S12 | systems | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| S13 | systems | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| S14 | systems | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| S15 | systems | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| U01 | ui | fail | 2.0 | 4.0 | 2.5 | 2.0 | 2.0 | 3.0 | 2 | 0 | 0 | 2.69 | 13.91 | incomplete |
| U02 | ui | fail | 7.0 | 6.0 | 5.0 | 6.0 | 2.5 | 4.0 | 0 | 0 | 6 | 1.51 | 5.12 | done |
| U03 | ui | fail | 7.5 | 6.5 | 7.0 | 6.5 | 3.0 | 6.5 | 0 | 0 | 4 | 0.74 | 2.40 | done |
| U04 | ui | fail | 3.0 | 5.0 | 4.0 | 3.0 | 2.5 | 2.0 | 2 | 0 | 0 | 3.06 | 9.22 | incomplete |
| U05 | ui | fail | 5.0 | 6.5 | 3.0 | 5.0 | 3.0 | 4.0 | 2 | 0 | 4 | 1.53 | 6.24 | done |
| U06 | ui | fail | 2.0 | 3.0 | 2.0 | 2.0 | 2.0 | 3.0 | 2 | 0 | 3 | 1.47 | 4.86 | done |
| U07 | ui | fail | 2.0 | 5.0 | 3.5 | 2.0 | 2.5 | 3.0 | 2 | 0 | 0 | 1.95 | 9.81 | done |
| U08 | ui | fail | 1.5 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2 | 1 | 3 | 1.35 | 4.62 | done |
| U09 | ui | fail | 3.0 | 5.0 | 3.5 | 3.0 | 2.0 | 3.5 | 2 | 0 | 4 | 1.71 | 7.77 | done |
| U10 | ui | fail | 2.0 | 4.5 | 2.5 | 2.0 | 2.0 | 3.0 | 2 | 0 | 3 | 1.22 | 7.42 | done |
| U11 | ui | fail | 2.5 | 4.0 | 4.0 | 3.0 | 1.5 | 3.0 | 4 | 0 | 4 | 1.11 | 3.76 | done |
| U12 | ui | fail | 5.0 | 5.5 | 5.0 | 6.0 | 4.0 | 5.0 | 0 | 0 | 8 | 0.57 | 3.99 | done |
| U13 | ui | fail | 2.0 | 3.5 | 3.0 | 2.0 | 2.0 | 2.5 | 4 | 0 | 5 | 1.23 | 7.82 | done |
| U14 | ui | fail | 2.5 | 4.0 | 4.0 | 3.0 | 2.0 | 4.0 | 2 | 0 | 4 | 2.28 | 12.74 | done |
| U15 | ui | fail | 8.0 | 7.0 | 7.0 | 7.0 | 5.5 | 6.5 | 0 | 0 | 4 | 0.83 | 4.27 | done |
| Z01 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z02 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z03 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.11 | quota |
| Z04 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z05 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z06 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z07 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z08 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z09 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z10 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.11 | quota |
| Z11 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z12 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z13 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z14 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |
| Z15 | zones | awaiting critics | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 | n/a | 0.00 | 0.10 | quota |

## Provenance

- Rubric: version v1, sha256 c74de28ae18f
- Dev set sha256: 466afbf7d0ce
- Deployed build (from /api/health at each run): d3d68c71, d5cdb0d2 (the build changed during the batch)
- Place baseline sha256: 3faad99a431b
- API base: https://studpilot.app
