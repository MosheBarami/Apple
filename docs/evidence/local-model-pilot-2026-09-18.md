# Local model pilot — trained, reloaded, rejected

2026-09-18. This is a completed development experiment, **not a production Apple MAX release**.
No production routing, deployed weights, or live Studio place changed in this experiment.

## Observed artifacts

- Base: cached `mlx-community/Qwen3-4B-Instruct-2507-4bit`, revision
  `50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b`. This small local base is not a frontier-quality claim.
- Data: `packages/training/data/game-logic-seeds-v2`: 20 original synthetic Luau examples,
  16 train / 2 validation / 2 test, separated by semantic family. Reference answers and semantic
  mutants were executed before training; no customer conversations or Studio trajectories were used.
- Dataset digest: `23744a69e86879f88d116f30a7585a168bcfd91463558ddd74b289c0ec37aba8`.
- Driver: `packages/training/src/local_pilot.py`, explicit `--run`, cached local weights only,
  no Hub upload, local Trackio SQLite, finite time/memory/iteration bounds.
- First attempt stopped before training because the completed-chat template injected a thinking
  prefix into the target. The corrected driver masks the actual generation prefix and appends
  the literal assistant target plus EOS; token round-trip and truncation guards are tested.
- Successful run: `packages/training/data/local-pilot-2026-09-18-v2`, 16 iterations, rank 8,
  last 8 layers, 1.311 million trainable parameters, 3,452 target tokens, 3.706 GB peak MLX memory.
- Adapter: `adapter/adapters.safetensors`, 64 tensors, 5,249,791 bytes, SHA256
  `6dac23b2fbb7cb659398a5a15d2e06132beae36628c1928561121c6f1dcdd8ff`.
- A separate process reloaded the saved adapter and reproduced both post-training answers exactly.
  See `replay.json` and `behavior-report-reloaded.json` in the run directory.

## Actual behavior, not training loss

| Held-out family | Before | After |
| --- | --- | --- |
| Weighted selection | Failed executable contract | Failed executable contract |
| Team balance | Failed executable contract | Failed executable contract |

The post-training weighted selection answer mishandled zero-weight/ticket boundaries; team balance
failed a sparse-array case. Both reports preserve assertion failures. **0/2 before, 0/2 after.**
Validation loss fell from 1.520 to 0.246; this did not establish behavioral improvement.
The adapter was rejected for production promotion. `completed.json` records training completion
and its then-pending scoring; the later behavior report records the failed verdict and reload proof.

Two bounded GLM-5.3 Flash reference calls passed 1/2 of these contracts. Their system prompt differs
from the local pilot's training prompt, so this is not a controlled head-to-head superiority test.
Report: `packages/training/data/game-logic-holdout-frontier-2026-09-18/report.json`.

## Verification and spending

- Entire training test suite: **106 passed, 0 failed**, `/tmp/apple-training-pilot-final.log`.
  Tests include literal-target masking, truncation, evidence/hash validation, failed-result
  preservation, artifact tampering and replay-answer comparison. Dummy test artifacts are not
  represented as trained models.
- Actual training and fresh-process replay both exited 0. Actual Luau scoring intentionally reports
  failed behavior. No Roblox engine, rendering, networking, or full-agent quality was verified.
- Local training/replay provider spend: $0. Two reference calls reserve $0.01; estimated token cost
  $0.00041255, no uncertain calls. Combined with the earlier $0.05 reservation, **$0.06 is reserved
  against the $20 total cap; $19.94 remains unallocated**. Estimates are not reconciled invoices.
- The canonical allocation ledger is `packages/training/data/spend-budget-2026-09-18.json`.
  Its protection covers these evaluation scripts, not unrelated provider/account spending.
- Codex weekly snapshot: 83% consumed, 17% remaining. No weekly ceiling currently applies.

## Next gate

Do not scale this tiny dataset into a paid GPU run or promote this artifact because loss decreased.
Expand verified, varied training tasks and obtain consented actual Studio trajectories; keep a new
independent holdout, since these two failures are now known. Serving conversion and a stronger
production model remain unimplemented. The broad product goal and WORKLIST w22 remain open.
