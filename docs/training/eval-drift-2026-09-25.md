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

The paired measurement tool is `packages/training/src/paired-eval.mjs`. After v20 finishes and its
best checkpoint exists, run it from `packages/training` with:

```sh
npm run eval-paired -- --candidate adapters/apple-v20-best --best adapters/apple-v5-best --out runs/eval-v20-paired.json
```

It generates base, candidate and v5 answers in one process, scores candidate and v5 through the
same executable checker, verifies the pinned set and counts, and writes a report. It does not
promote or upload a model. This command has **not** been run on v20 yet.

## Later paired runs of v22 (2026-09-25)

The v22 answer was identical in the saved v22, v23, v24, v25, v26 and v27
38-row evaluations, and the paired v22 score was 24/38 in v23–v27. In v28,
the same named v22 adapter scored 21/38 (trajectory 14/23 instead of 17/23),
while the base-model text changed on 19/38 rows. The v22 adapter text changed
on 17/38 rows. Each compared file contains the same row IDs, and v28's
candidate and v22 were generated and scored in the same batch. This is
measured generation drift, not proof that v22 lost learned ability.

The local base cache has a single snapshot `006f5dcd1393c3add266de40994ba96225e9689d`;
the MLX and tokenizer package directories predate v22. Neither observation
establishes the cause. A future promotion must exceed the paired best by
more than the observed repeated-best spread; commit `5d17448` implements that
margin, but the already-running supervisor loaded older code. Until it safely
restarts, independently audit any promotion it announces. Do not compare a
later absolute score with 24/38 as if the runtime were deterministic.
