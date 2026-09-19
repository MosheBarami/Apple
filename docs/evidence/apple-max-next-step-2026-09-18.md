# Apple MAX: evidence-based next step — 2026-09-18

## Decision

Keep both adapters **not promoted**. Do not repeat training merely with more iterations. The saved outputs have reproducible semantic/input-validation errors, not a format-only failure that can be repaired by relaxing extraction. The useful change in this pass is an executable, offline evaluation-gap audit: three deliberately wrong reference variants pass the frozen checks but are rejected by separately verified counterexample assertions. The original 0/2 results remain valid and unchanged.

This pass made no model inference, weight reload, training, downloads, provider requests, uploads, permission changes, or production/frontend edits. New expense is $0. The existing ledger remains a $20 cap with $0.06 reserved; reservation is not an invoice measurement.

## Inputs actually inspected

Read the three prior reports: `local-model-pilot-2026-09-18.md`, `local-model-failure-audit-2026-09-18.md`, and `local-model-iteration-ablation-2026-09-18.md` in this directory. Checked the saved manifests, completed records, adapter bytes, replay responses, before/after generations, frozen dataset files, existing checker, and curriculum. No private customer conversations were read.

Both `packages/training/data/local-pilot-2026-09-18-v2/manifest.json` and `local-pilot-2026-09-18-64steps/manifest.json` bind the SAME **20-example v2** dataset: 16 training, 2 validation, 2 test. Their dataset digest is:

`23744a69e86879f88d116f30a7585a168bcfd91463558ddd74b289c0ec37aba8`

The current reviewed 24-example card is a different, untrained dataset with 18/3/3 splits and digest `d86ce53e2b261e92780385bfb76808a0499e9b1069f0c3ec407ac9e9e1b3d263`. Its lineage preserves the prior 20 family assignments. It must not be described as the dataset used for either trained pilot.

The inherited `config.data = "mlx-community/WikiSQL"` label is not evidence of WikiSQL training: `local_pilot.py` passes the hash-verified local `LiteralDataset` train/validation objects directly. The saved `tokenLengths` values 197–640 describe complete prompt-plus-target-plus-EOS sequences, as `verify_tokens` actually computes, not target-only lengths. Neither metadata clarification changes a behavior score.

The two adapters remain 5,249,791 bytes each:

| Iterations | Saved adapter SHA-256 | Rerun original before / after |
| --- | --- | --- |
| 16 | `6dac23b2fbb7cb659398a5a15d2e06132beae36628c1928561121c6f1dcdd8ff` | 0/2 / 0/2 |
| 64 | `2273d824e1caf554540a5bdb2a8f998f8677d05ff0d078c0930119f73bc11dbc` | 0/2 / 0/2 |

The pre-training response hashes are identical across both pilots. Recorded fresh-process replay response strings and adapter hashes match the saved after responses. This pass verified those saved records; it did **not** reload or generate from the model again.

## Why each after-training 0/2 failed

The assertions below were recovered from the actual frozen checker failure locations during this pass. Check-line numbers are relative to the `checks` string, not a temporary wrapper file. The implementations and assertions are in `game-logic-curriculum-extension.mjs`; generated answers remain in their respective `after-*.json` files.

| Run / task | First failed frozen assertion | Observed defect |
| --- | --- | --- |
| 16 / weighted-selection | Check line 4: `candidate(weights, 1) == 2`, with `weights = {1, 2, 3}` | Returns bucket 1 rather than 2. `cumulative >= ticket` incorrectly includes the boundary in the previous bucket. |
| 16 / team-balance | Check line 11: `candidate({[1] = 1, [3] = 2}, 4) == nil` | Accepts the sparse array instead of rejecting it. The implementation uses length/ipairs traversal without validating the complete plain-array shape. |
| 64 / weighted-selection | Check line 3: `candidate(weights, 0.999) == 1` | Returns nil for a valid fractional ticket. The new integer validator wrongly narrows the requested finite-number domain. |
| 64 / team-balance | Check line 3: `candidate({4, 4}, 4) == nil` | Returns team 1 although every team is full. The minimum-load selection omits the below-capacity eligibility condition. |

Both before-training tasks fail at the same boundary/sparse-array assertions as the 16-iteration after responses.

Additional observed defects matter because the composite checker stops at its first failure. The 16-iteration weighted output also accepts a ticket equal to the total, returns a result when a later weight is NaN, and throws on a string ticket because comparison precedes type validation. The 64-iteration weighted output rejects fractional weights and valid large finite weights, retains the inclusive-boundary bug, and uses `not type(weights) == "table"`, which does not perform the intended inequality guard. Invalid non-table inputs can reach the length operator. The 64-iteration team output additionally accepts fractional loads and unsafe numeric domains. Some metatable/type cases improve, but these local improvements do not establish general improvement or offset the failed complete contracts.

All eight saved responses have accepted fenced source; the executed probes establish the function-return shape on their ordinary calls. No format/data defect was validated as the cause of these failures. The previous literal-target/template repair was already present before the inspected runs. Token counts and generation stop reasons were not saved, so this is not a token-level proof that generation never approached a limit.

## Validated evaluation defect and the fix

The frozen checks are useful but incomplete. The new files `packages/training/src/pilot-evaluation-gap-audit.mjs` and `pilot-evaluation-gap-audit.test.mjs` execute the following falsifications without rewriting any reference, training row, held-out check, or saved output:

| Deliberate reference mutation | Counterexample | Reference | Mutant under frozen checks | Mutant under new assertion |
| --- | --- | --- | --- | --- |
| Reject fractional weights, while leaving ticket validation unchanged | `pick({0.5, 1.5}, 0.25)` must return 1 | Pass | Pass: coverage gap | Reject: observed nil |
| Remove the plain-array metatable rejection | `pick(setmetatable({1, 2}, {}), 0)` must return nil | Pass | Pass: coverage gap | Reject: observed 1 |
| Validate capacity's type only, not safe-integer membership | `chooseTeam({0, 1}, 3.5)` must return nil | Pass | Pass: coverage gap | Reject: observed 1 |

There are **3/3 measured coverage gaps and 3/3 assertion-detected mutations**, with passing reference controls for both original and supplemental checks. Fractional TICKETS already occur in the frozen weighted checks; fractional WEIGHTS were the missing domain example. Do not confuse those two findings.

The audit fails closed on unavailable execution, timeout, resource limit, refusal, malformed result, parse/runtime error, an inert/nonunique mutation, or an unrelated failing assertion. A mutant must fail through the named wrong-result assertion. A later improvement to the original evaluator is allowed: the tests do not require the frozen checker to continue missing a defect.

This fixes diagnostic coverage, **not the trained weights**. It cannot retroactively turn either original failure into a pass. The counterexamples are already exposed development-family material; they must remain outside training and outside an independent promotion benchmark.

## Measured diagnostic replay

The concurrently supplied `diagnose-local-pilot.mjs` was invoked read-only through its CLI. The captured runner SHA-256 was `3f2b4e60b3de2eadc4fe2c692cdfc9ac5d08d44d51bdf4ca988144a53659edf2`. This worker did not author or overwrite that shared runner.

The reference controls passed all 57 selected cases: 32 weighted-selection and 25 team-balance. These include assertion continuation plus supplemental probes. Counts below describe selected diagnostic cases, some intentionally overlapping; they are **not** independent-task accuracy, model capability, or promotion scores.

| Saved output | Failed selected cases before | Failed selected cases after |
| --- | ---: | ---: |
| 16 / weighted-selection | 11/32 | 15/32 |
| 16 / team-balance | 8/25 | 6/25 |
| 64 / weighted-selection | 11/32 | 17/32 |
| 64 / team-balance | 8/25 | 11/25 |

Each complete pilot diagnostic was repeated and compared byte-for-byte: both were deterministic. Initial local CLI measurements were 229 ms for the 16-iteration artifacts and 211 ms for the 64-iteration artifacts on this machine, including reference controls. These are diagnostic replay times, not model inference/training times or a performance promise.

Captured local outputs, intentionally outside the repository and historical artifact directories:

- `/tmp/apple-max-worker2-diagnosis-16.json`: SHA-256 `c6c49801ba0e007a7f6032b2a83f5fe7b70b81690da973fd04738fbcff513190`.
- `/tmp/apple-max-worker2-diagnosis-64.json`: SHA-256 `d9ca96b5064368fd59cae32592e04bccc40d63a74c377d6f6e26e2282d78623b`.
- `/tmp/apple-max-worker2-gap-audit.json`: SHA-256 `a3c08e33e68ef8cf1d0be33d69e6285d44afadb019878b6faaf5c4e524249d39`.

Reproduction from the repository root requires only the already installed Node/Luau runtimes:

```sh
node --test packages/training/src/pilot-evaluation-gap-audit.test.mjs
node packages/training/src/pilot-evaluation-gap-audit.mjs
node packages/training/src/diagnose-local-pilot.mjs packages/training/data/local-pilot-2026-09-18-v2 packages/training/data/game-logic-seeds-v2
node packages/training/src/diagnose-local-pilot.mjs packages/training/data/local-pilot-2026-09-18-64steps packages/training/data/game-logic-seeds-v2
```

## Validation and shared-checkout limitation

The new audit's focused suite passed **11/11 tests**, 389.977 ms reported by Node. It includes real Luau reference/mutant execution and byte-deterministic repeated reports, with fetch trapped to reject network calls. The resource-limit failure-path tests use injected results, not newly launched infinite loops.

The full training suite was also attempted: **133 passed, 1 failed, 134 total**, 2,371.248 ms. The failure is a concurrently created `diagnose-local-pilot.test.mjs` importing `diagnoseCandidate` and `inspectPilotInputs`, which the captured runner did not export. Another implementation had replaced that runner during this shared checkout. The prime was notified with the exact missing exports. This worker preserved the shared runner/tests rather than overwriting someone else's work. The full suite is therefore **not claimed green** by this evidence record.

An earlier focused attempt exposed the same concurrent-interface problem through a removed `stableDiagnosticResult` export. The audit was decoupled from all new shared diagnostic modules; it now imports only the pre-existing curriculum and local checker. Its successful focused run above follows that correction.

A before/after SHA-256 snapshot covered **47 files** across both pilot directories, v2 and reviewed-v3 dataset directories, and the spend ledger. All 47 remained byte-identical. No held-out family moved, no historical result was overwritten, and no budget allocation was added.

## Next step, without another blind training run

First reconcile the shared diagnostic source/test interface so the complete training suite is green; retain this independent mutation audit as a regression gate. Use the saved-output diagnostic and named counterexamples to review whether a proposed change fixes a specific obligation rather than merely reducing loss.

For any later, separately authorized data experiment, pre-register the single change and the expected failure class before spending compute. Review unexposed training-family material for explicit contrasts between finite-number and safe-integer domains, validation-before-use, plain/dense table validation, and boundary eligibility. Do not move weighted-selection, team-balance, or the reviewed UI holdout into training, and do not copy their repaired solutions or these counterexamples into SFT rows.

A two-family exposed development set cannot establish production Apple MAX quality. Even an eventual pass here would still require untouched independent tasks and real Studio/agent evidence. This pass supplies executable diagnosis and validated evaluator-coverage repair; it does not supply a promoted model or evidence justifying another iteration-only run.
