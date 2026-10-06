# M3 baseline: summary (owner: stop at the 20 scored pieces, 2026-10-06)

**The baseline is the 20 pieces scored by a critic and a claim audit: U01-U15 and S01-S05. 0 of 20 pass.**
Rubric v1 (planning/critic-rubric.md), one critic per piece (owner token rule, 2026-10-05), the product's old SessionDO
agent. The figures below are measured (`node scripts/eval/baseline.mjs M3`; the full output, which also counts the
unscored folders, is `baseline-all-folders.md`).

| Category | Delivers | Visual | Layout | UI/UX | Life | Polish | Pieces |
|---|---|---|---|---|---|---|---|
| UI | 3.67 | 4.77 | 3.87 | 3.63 | 2.57 | 3.67 | 15 |
| Systems | 5.80 | 6.30 | 6.10 | 6.00 | 4.30 | 5.60 | 5 |
| All | 4.20 | 5.15 | 4.43 | 4.22 | 3.00 | 4.15 | 20 |

Why they failed (a piece has several reasons): every piece is below 8 in visual, layout, UI, life and polish; 19 in
delivers; 17 have unsupported claims; 16 a severe flaw 1 (the subject missing or hidden: mostly a panel never opened
for the picture, which the style bible's proofOpen hook now fixes); play-test errors in S01, U08.

Not in the baseline, recorded for honesty:
- S06, S09, S10 were run and judged from their Studio viewports by the orchestrating session (owner, 2026-10-06:
  "capture the viewports and judge them yourself"); all three fail (`critic-a.json` in each folder).
- S07's start request had no answer and the run started late; S08's capture recorded it, so neither is scored
  (`S08/INVALID.md`); the harness now catches a late start (#67).
- S11 was stopped when the owner ended the baseline. The P and Z folders and S12-S15 are from runs the daily quota
  stopped before the batch reached them again; they hold no scored build.

What M3 taught (STYLE-BIBLE.md §1): the UI pieces are about 93 % grey against the references' 8 %; the panels were often
never seen open; the replies claimed what the pictures did not show. The next measurement is M5a: U01-U15 through the
Studio agent with StudKit and rubric v2.
