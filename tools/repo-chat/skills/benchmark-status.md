---
name: benchmark-status
description: Report the owner benchmark (30-request bank, held-out bank, baseline run and later runs) - what it is, how it is scored, and what the results show.
---
# Benchmark status

Use for "what is the owner benchmark", "what did the baseline show", "how is it scored", "what is the held-out bank".

1. Call `bench_results` first. It returns the bank sizes and categories, every run in `packages/evals/owner-bench/results/`, means per criterion and category, credits, items not run, and excerpts of `README.md` and `BASELINE.md`.
2. Read `packages/evals/owner-bench/BASELINE.md` with `read_file` for the validity notes (items that were not measured and why, the judge-only caveat). Do not quote scores without these caveats.
3. For protocol and scoring (9 criteria, 0-2 each, 18 max, judge first pass, humans may only lower), use the README excerpt; for the runner, `read_file` the top of `run.mjs`, and `score.mjs` for how the meter is computed.
4. For the current plan status (what was run after the baseline, what is next), `search_knowledge` "owner benchmark baseline held-out" and check `HANDOFF.md` and `docs/autonomy/CURRENT_STATE.md`; then `git_log` with path `packages/evals/owner-bench` (n=10) to date the latest changes.
5. Answer with: what it is in two sentences; the headline numbers (judged items, mean total /18, weakest and strongest criteria, credits); the caveats; where the rows live. Cite `path:line`. If results files do not exist or are unreadable, say so.
