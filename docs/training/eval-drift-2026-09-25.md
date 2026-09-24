# Local LoRA evaluation drift

Measured 2026-09-25 from the raw, pinned 38-row files
`packages/training/runs/eval-v5-on-v5set.json` and
`packages/training/runs/eval-v11-on-v5set.json`:

- Both name `unsloth/Llama-3.2-3B-Instruct` and contain the same 38 row IDs.
- The base-model answer differs on **19 of 38** rows, despite greedy decoding. The cause is not
  established. The v11 base scored 1/23 tool trajectories versus v5's 0/23; both scored 0/8 game
  logic and 4/7 finish.
- The v11 adapter scored 18/38, but that is not a valid comparable improvement or regression
  against the historical v5 result. The supervisor correctly marked it `eval_invalid` and did not
  promote or publish it.

Before accepting v20 or later, evaluate the candidate and current best on the **same pinned rows,
model runtime and scorer** near one another. Check that their base answers match; if they do not,
the comparison is invalid and the cause needs diagnosis. Keep the pinned holdout out of training
and report per-track counts rather than calling 20/38 a frontier result.
