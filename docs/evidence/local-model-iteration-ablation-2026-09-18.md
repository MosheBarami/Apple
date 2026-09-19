# Controlled local iteration experiment and UI curriculum — 2026-09-18

## What actually ran

Root trained a second local Qwen3-4B-2507 4-bit LoRA, with the same cached foundation revision,
seed, learning rate, rank, layer selection and frozen 20-example v2 dataset as the prior run.
Only training iterations changed, **16 → 64**, plus the required new artifact directory.
Both before-training responses were byte-identical to the prior experiment. Input file hashes
and dataset digest were identical. This isolates iteration count; the new UI dataset below was
deliberately NOT used in this experiment.

Actual run: `packages/training/data/local-pilot-2026-09-18-64steps`.
Saved adapter: 64 tensors, 5,249,791 bytes; SHA256
`2273d824e1caf554540a5bdb2a8f998f8677d05ff0d078c0930119f73bc11dbc`.
Peak MLX memory: 3,705,807,456 bytes. Explicit offline/cached-model mode, 12 GiB memory cap,
15-minute wall deadline, local Trackio, no model download/Hub push/provider charge.

The driver now accepts an explicitly bounded `--iterations` parameter (1–128), retaining 16 by
default. Invalid/noninteger/unbounded values are rejected before MLX imports or training.

## Actual outcome: rejected again

Fresh-process adapter replay reproduced **2/2** after-training responses exactly. Executed Luau
holdout scoring remained **0/2 before and 0/2 after**. A training-loss decrease is not a pass.
Final train loss was 0.068; validation loss was 0.274, versus 0.246 after the earlier 16 steps.

Additional executed diagnostics reproduced these concrete defects in the 64-step responses:

- Weighted selection rejects a valid fractional ticket (`{1,2,3}`, `0.5`) by imposing an
  integer-only constraint that the requested finite-number contract does not have.
- Team selection assigns a team even when every team is at capacity (`{3,3}`, capacity 3).

The original two held-out families are now known development failures; neither this experiment
nor selecting hyperparameters on them would establish independent production quality. No model
was promoted, no production route changed, and neither trained artifact is called Apple MAX.
More iterations alone did not repair these failures. Do not scale this tiny dataset into a paid
GPU run on the strength of loss or save/reload success.

Logs: `/tmp/apple-local-pilot-64steps.log`, `/tmp/apple-local-pilot-64steps-replay.log`,
`/tmp/apple-local-pilot-64steps-score.json`. The run directory holds the immutable manifest,
responses, adapter, replay, behavior report and `diagnostic-regressions.json`.

## Verified data expansion, not a trained capability

Root authored four first-party UI logic families: aspect fitting, visible scrolling rows,
responsive grid capacity and safe RichText escaping. Every answer executed in Luau and every
semantic mutant failed its behavioral assertions. No engine/rendering claim is made.

The reviewed artifact is `packages/training/data/game-logic-seeds-v3-reviewed`: **24 examples,
18 train / 3 validation / 3 test**, all 20 previous families preserved in their original splits.
The new viewport-window family is test-only, RichText escaping validation-only, and aspect/grid
families train-only. This remains a small development curriculum, not independent promotion data
or consented real Studio trajectories. The initial untrained `game-logic-seeds-v3` artifact was
superseded during numeric-bound review; do not use it for training. The reviewed aspect task
explicitly bounds dimensions to [1,1000000], avoiding unsupported subnormal-size arithmetic.

Root reproduced a real split-contamination risk: naively repartitioning the enlarged set moves
`team-balance` from test into train and `weighted-selection` from test into validation. The new
previous-card preservation guard prevents this; CLI use now requires choosing a prior card or
explicitly requesting a fresh partition. Existing families cannot be reassigned or dropped.
The v3-reviewed card records the prior digest and 20 preserved families.

## Verification / limits

- Entire training suite **112/112 passed**, `/tmp/apple-training-v3-suite.log`.
- Current root tests excluding the slow unchanged pixel suite: **466/466 passed**,
  `/tmp/apple-root-without-pixels.log`.
- The preceding full root run passed 477/478, including all 12 pixel checks, but contained the
  pre-fix scorer CLI-manifest failure documented in the asset-repair evidence. It is not
  represented as a fully green run. The scorer manifest was fixed and its focused gate rerun.
- `git diff --check` passed. No worker/static deployment, paid request or Studio change.
- Native Studio access was rechecked through the installed app: the Mac remains locked. No
  bypass was attempted; real UI/engine verification still requires the owner to unlock it.
- Training/serving budget unchanged: $0.06 allocated / $19.94 unallocated against $20 total;
  no new provider expense. Latest Codex snapshot: 92% weekly used, 8% remaining.

Whole-product coverage remains the previously recomputed 59.3% checklist measure, not readiness.
The real goals—excellent Studio results, strong distinct serving models, public installation,
billing availability, and independent customer approval—remain incomplete.
