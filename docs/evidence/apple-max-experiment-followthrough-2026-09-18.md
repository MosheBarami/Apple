# Apple MAX experiment follow-through — 2026-09-18

## Decision

One bounded, offline data intervention was trained and evaluated. The saved LoRA adapter is
reproducible, but it **did not improve executable behavior**: the frozen five-family score was
**1/5 before training and 1/5 after training**. It failed the promotion criteria registered before
the run and is rejected. No production route, deployment, model name, Studio place, or account was
changed.

This is a custom adapter over the shared cached
`mlx-community/Qwen3-4B-Instruct-2507-4bit` foundation. It is not a distinct foundation model and
must not be presented as Apple MAX. It is not ready to serve.

## Why this experiment was run

The two earlier pilots used the same 20-example v2 data and the same cached Qwen foundation:

| Pilot | Iterations | Before | After | Adapter SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `local-pilot-2026-09-18-v2` | 16 | 0/2 | 0/2 | `6dac23b2fbb7cb659398a5a15d2e06132beae36628c1928561121c6f1dcdd8ff` |
| `local-pilot-2026-09-18-64steps` | 64 | 0/2 | 0/2 | `2273d824e1caf554540a5bdb2a8f998f8677d05ff0d078c0930119f73bc11dbc` |

The saved-output audit showed concrete contract failures: half-open boundaries, finite-number versus
safe-integer domains, dense-array validation, and eligibility checks. More iterations alone did not
repair them. This run therefore changed data coverage once, while leaving the base revision,
optimizer, learning rate, seed, LoRA shape, generation settings, and executable scorer fixed.

## The single intervention

`packages/training/src/contract-generalization-curriculum.mjs` adds four first-party,
engine-independent Luau families:

| Family | Split | Purpose |
| --- | --- | --- |
| `half-open-time-window` | train | Fractional finite numbers and a half-open interval without copying weighted selection. |
| `dense-sample-mean` | train | Validate a plain dense array before length or iteration without copying team selection. |
| `fractional-band-classification` | test | Transfer check for fractional numeric domains and boundary classification. |
| `dense-filter-preservation` | test | Transfer check for dense-array validation, invalid-element refusal, order, and fresh output. |

Every reference answer executed under the local Luau CLI, and a unique semantic mutation failed an
assertion. All 24 families from `game-logic-seeds-v3-reviewed` kept their existing split and exact
row. In particular, `weighted-selection`, `team-balance`, `ui-viewport-window`, and the two new
transfer families never entered training.

The generated v4 artifact is `packages/training/data/game-logic-seeds-v4-contract`:

- 28 examples: 20 train, 3 validation, 5 test.
- Dataset digest:
  `1dbac25f80c5f0852d5a196d601f7dc48a8ce62bbd31528e9b992d8ef4f22e75`.
- `dataset-card.json` SHA-256:
  `8788d8ce668c315a18fbaf97df10628fae39d2d4a2fce56143c3f6db7a314339`.
- `train.jsonl` SHA-256:
  `87775d8fc701ff9e70beb2f59e55a740d65e5bd2f4b1c3daf094104e5b45f6f5`.
- `val.jsonl` SHA-256:
  `0181d36b3a19ac028ecc81259ee79288539645ea0e9bae7ae462caabc4a1124a`.
- `test.jsonl` SHA-256:
  `da852b465d7eb6ba22d0da0ac2673ab666ee356af77d7df89e8127832235b62b`.

Exact token preflight covered all 28 rows: 197–640 tokens, below the 2,048-token training limit.

## Criteria frozen before training

`packages/training/data/apple-max-contract-v4-preregistration-2026-09-18.json` was written while the
run directory did not exist. It binds the foundation, all dataset files, all five held-out rows,
their prompts, reference answers and checks, and the training configuration. Its SHA-256 is
`9722df13b4a55bd26696bd0d60369edb5915351bb19a5bb5a718d1445f7a25a5`.

The registered development-candidate gate required all of the following:

| Criterion | Required | Observed | Result |
| --- | --- | --- | --- |
| Fresh-process adapter reload | yes | yes | pass |
| Reloaded responses equal in-memory responses | 5/5 | 5/5 | pass |
| New transfer families after training | 2/2 | 1/2 | fail |
| Preserved development families after training | 3/3 | 0/3 | fail |
| Total after-training behavior | 5/5 | 1/5 | fail |
| Improvement over the base sample | after > before | 1 = 1 | fail |
| Format, syntax, context, or runtime failures | 0 | 3 after-training failures in these classes | fail |
| Production promotion | always false | false | retained |

The dataset and budget hashes still matched the preregistration after scoring.

## The one local training run

- Foundation revision: `50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b`.
- Foundation `model.safetensors` SHA-256:
  `2a73c6c248601ab904e035548abd8e6abb65ea27dcb5f342fb0a8910eb44173f`.
- Foundation bytes: 2,263,022,417.
- Offline/cached mode: Hub and Transformers offline, no download, upload, or provider request.
- 20 iterations for 20 training rows, preserving the prior single-pass exposure policy.
- Batch 1, seed `20260918`, AdamW, learning rate `5e-5`, last 8 layers, rank 8, scale 16,
  prompt masking, gradient checkpointing, and 2,048-token maximum.
- Trainable parameters: 1.311 million of 4,022.468 million, or 0.033%.
- Peak MLX memory: 3,541,553,208 bytes.
- Final train loss: 0.294895.
- Validation loss: 1.519588 before updates, 0.625719 near step 8, 0.460640 near step 16,
  then 0.497545 at the end. The late rise and lower loss are not behavior passes.

Run directory: `packages/training/data/local-pilot-2026-09-18-contract-v4`.

The final adapter contains 64 tensors, is 5,249,791 bytes, and has SHA-256
`07aef432a9f34abbfe05ce1addc70e4bc49fdf3aefeb559daf03579719ea52b3`.
The run manifest SHA-256 is
`1e08e913a147e406eb0c67bd316feb701eb50c739175cabc3afe694eafe5cadf`;
`completed.json` is
`e473bd43682a4e07aea6598a7450a7c330cf9005faea21f0353f00237e5e0dbe`;
and `metrics.jsonl` is
`710169b17a892aa78d86596a2dafcf9166ceb027b9b9a50ac87a78472796cde2`.

## Fresh-process replay and executable behavior

A separate Python process loaded the saved adapter and regenerated all five held-out responses.
Every response matched the corresponding in-memory post-training response exactly. `replay.json`
has SHA-256 `4f3f590d0f6dd41b5579020a12551c4400b23a24af1fe14b2792a8fcc0c56115`.

The unchanged `score-local-pilot.mjs` then executed each accepted module under the local Luau
sandbox. `behavior-report-reloaded.json` has SHA-256
`64502768694486379475f1881b6b8b6654d745d9a908a5fb11cfba13641adc0d`.

| Held-out family | Status | Before | After | Observed after-training defect |
| --- | --- | --- | --- | --- |
| `weighted-selection` | preserved development | fail | fail | The generated `finite` helper calls itself recursively and reaches stack overflow before contract execution. |
| `team-balance` | preserved development | fail | fail | The generated temporary table stores load values but later treats them as indices, producing `attempt to compare nil < nil`. |
| `ui-viewport-window` | preserved development | fail | fail | Generation consumed exactly 1,600 tokens and ended mid-condition without a closing code fence; the scorer rejected the incomplete format. |
| `fractional-band-classification` | test-only transfer | pass | pass | It passes the frozen assertions. Post-score source inspection found its helper excludes zero with `math.abs(value) > 0`, although zero is a valid finite value in the prompt; the frozen checks contain no valid-zero case, so this pass does not prove the full written contract. |
| `dense-filter-preservation` | test-only transfer | fail | fail | Invalid elements are skipped with `continue` instead of making the call return `nil`; the `{1, -1}` assertion fails. It also lacks full dense-array key validation. |

Formal frozen result: **1/5 before, 1/5 after**. The intervention produced no measured improvement.
The valid-zero observation does not rewrite the frozen score; it makes the sole pass weaker, not
stronger.

After-response SHA-256 values:

| Response | SHA-256 |
| --- | --- |
| `after-weighted-selection.json` | `ef0f9eba2820e11ab598d6adef9b67bd66a1558473ed1bfae459ac874763937b` |
| `after-team-balance.json` | `d4541fadda6e3d410572ebb8d9a7f22a6e70ec47d56973ec87efb9c8c7d720dc` |
| `after-visible-ui-rows.json` | `8fb3633142656920317f2452f455b901a37074a6e4aed012b107dc33a516327b` |
| `after-meter-band.json` | `fb5fba1caa47e2b05ad434e23967b114805117b85d9fb7d4f2a38ce9a21af332` |
| `after-compact-under-ceiling.json` | `d300df9ce5c2c355207de97a0c0f6d1acbeac42362750a2f9cbdb063fc9d281c` |

## Verification and historical reconciliation

At the start of this follow-through, the complete current training suite passed **188/188** after
the previously reported working-directory/interface repair. Four tests were added for the new
curriculum, split preservation, train/test separation, and preregistration hashes. The final suite
passed **192/192**, with zero failures. `git diff --check` also passed.

This does not alter the earlier `apple-max-next-step-2026-09-18.md` record that captured 133/134 at
its point in time while a concurrently replaced diagnostic runner lacked expected exports. That
historical failure was real for that checkout state. The current 192/192 run is the later
follow-through, not a retroactive claim that the earlier run was green.

The 16- and 64-iteration adapter hashes remain unchanged, and their 0/2 before/after conclusions
remain rejected. The reviewed v3 dataset remains the immutable parent of v4; it was not silently
repartitioned or represented as having trained either historical pilot.

## Cost, promotion, and serving readiness

The local run and replay record provider spend of **$0**. The canonical ledger remains byte-identical
at SHA-256 `8292ebaa917972a43946edd065b376cb53b3cdf8d8040e1ff8e4690fb83647f6`:
$0.06 reserved against the $20 cap and $19.94 unallocated. Reservations are not invoice evidence.
No allocation was added for this offline run.

Serving readiness is **false**:

- The preregistered executable behavior gate failed.
- The output is an MLX LoRA adapter dependent on the shared Qwen foundation, not a standalone model.
- No serving conversion, request-path integration, production route, deployment, or live-engine check occurred.
- No Roblox Studio, rendering, networking, tool-use, full-game, latency, safety, or whole-agent quality was measured.
- The data remains a 28-example synthetic development curriculum with zero consented Studio trajectories.

The concrete result is a reproducible rejected adapter and a measured boundary for this small local
approach. It is evidence against promoting or branding the artifact, not evidence that Apple MAX is
complete.
