# Original Luau seed curriculum and bounded live baseline

Root authored and executed this work on 2026-09-18. This is not an independent
promotion evaluation, production training dataset, trained Apple MAX, or Studio proof.

## Data

Ten original engine-independent game-logic examples live in
`packages/training/src/game-logic-curriculum.mjs`. Each complete module was executed
with property/boundary assertions under Luau; each semantic mutant failed an assertion.
The builder refuses unknown evaluation overlap status, duplicate IDs/answers, dependent
source, invalid code, failing behavior, and mutants that merely crash or time out.

Generated directory: `packages/training/data/game-logic-seeds-v1`.
Eight training, one validation, one test row; whole semantic families remain separate.
No detected eight-word overlap against the 88-task evaluation guard. That heuristic is
not proof against every form of semantic contamination. No harvested or customer code,
no customer data, no Studio trajectories. Existing historical dataset was not overwritten.

Dataset digest: `1692622f9ceddd6b1d0e954a56c134ff725cbec137b59abb2d6e0904d5365ee0`.

## Live baseline

Explicit opt-in `evaluate-game-logic.mjs --live` made ten requests through Apple's
existing authenticated model-test endpoint. Preflight and every response identified
`@cf/zai-org/glm-5.3-flash`. Tools and RAG were off; output cap1600; no retries.
Only the original task prompts and format instruction were sent, not reference solutions
or check code. Local candidate execution used the existing resource-limited Luau process;
this is not an OS jail or Roblox engine.

Results: **7/10 exact contracts passed**. Purchase transaction, finite normalization,
and stable leaderboard returned tables instead of the requested function, failing on
invocation. Those were not silently adapted or rescored. Their business logic was not
separately certified. Sample size and domain are too narrow for product-quality claims.

Responses, usage, errors and report:
`packages/training/data/game-logic-baseline-2026-09-18`.

Budget: owner approved **$20 total**, not recurring. This run reserved at most **$0.05**.
Observed token counts at published uncached rates yield **$0.00128995 estimated**;
zero requests have unknown usage. This is not an invoice reconciliation. Conservatively
retain $0.05 allocation, leaving $19.95 unallocated. No GPU, HF top-up, subscription,
repository upload or training job was started.

## Total-budget guard added after the baseline

Canonical local allocation ledger:
`packages/training/data/spend-budget-2026-09-18.json`.
It carries the original $0.05 reservation against the owner's $20 total authorization.
Future baseline CLI calls require this existing ledger via `--budget`; creating a new
output folder no longer resets the available budget. Reservations are persisted before
inference, with exclusive writer locking, integer micro-dollar accounting, no automatic
refunds, and no uncertain retries. Missing/corrupt/locked ledgers fail closed.

This guards this local evaluator, not provider billing or unrelated live-app traffic.
Future GPU jobs, prepaid purchases or other serving probes must first reserve their full
bounded exposure in the same ledger; this does not authorize a recurring subscription.
No additional network inference, purchase or training was performed during this change.
The exhausted-budget, missing-ledger and uncertain-request regressions failed before the
integration and passed afterwards. Local training suite passed97/97 at this stage.

## Expanded seed curriculum (v2 artifact)

The builder now combines the original ten with ten newly authored independent families:
weighted selection, interval overlap, range merging, dependency ordering, crafting batches,
seeded shuffle, turn rotation, damage mitigation, terrain route cost and team balancing.
Root review caught a missing-ingredient arithmetic crash and under-specified shape/overflow
and shuffle contracts; these were corrected with executable regression cases before export.

Generated `packages/training/data/game-logic-seeds-v2`:20 examples,16train/2val/2test,
20 family-disjoint groups,88 evaluation tasks checked for eight-word overlap.
Digest:`23744a69e86879f88d116f30a7585a168bcfd91463558ddd74b289c0ec37aba8`.
The original v1 artifact and baseline evidence were not overwritten or rescored.
Root's final full training suite passed98/98, including the two-run shared-budget test.
These are small synthetic engine-independent seeds, not verified Studio trajectories,
not a production-scale training set and not a trained or promoted model. No further spend.

## Validation

- New evaluator tests:7/7, including semantic mutation, runaway timeout, unsafe require,
  missing usage, no-spend default, routed-model mismatch and no uncertain retries.
- Combined current training/site tests:125/125 after fixing the test import harness.
- Original training seeds must not be used as a final model promotion test.
- More varied original training data and an untouched independent evaluation are still
  required before spending on training or claiming model improvement.
