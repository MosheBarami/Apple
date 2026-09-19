# Local model failure audit — 2026-09-18

## Verdict

The `0/2 before` and `0/2 after` result in
`packages/training/data/local-pilot-2026-09-18-v2/behavior-report-reloaded.json` is an
executable semantic failure in the generated Luau. It is not explained by output truncation,
the module return shape, or a scorer/template rejection. The adapter did not improve either of
the two tested contracts; this tiny holdout does not establish why, or make a production claim.

## Evidence observed

- The run manifest identifies a 20-example, family-disjoint development set and records target
  token lengths of 197–640 (count 20), below the 2048 preflight limit. The held-out input hash is
  `f71a497df486f0c5cbbc1ef9ccc5dfea3654e5bc1e80474f2622ad3ffd662d2f`.
- All four captured responses end with a complete code fence and a function return. Their source
  sizes are 1110/735 bytes (weighted selection, before/after) and 967/723 bytes (team balance,
  before/after). `score-local-pilot.mjs` accepted each fence and standalone source, then reached
  the executable Luau contract; each result is `reason: "exit"`, `exitCode: 1`, rather than a
  format or context-dependency rejection.
- Replaying the saved adapter in a fresh process verified the adapter hash and reproduced both
  post-training responses exactly (`matchesInMemory: true` for both). Thus the after failures are
  reproducible from the saved artifact, not a mismatched response file.

## Exact failures

I reran each captured module with the unchanged v2 checks under the local Luau CLI and mapped the
first assertion reported by the scorer:

| Contract | Before | After | Cause in both outputs |
| --- | --- | --- | --- |
| `weighted-selection` | `assert(candidate(weights, 1) == 2)` | same assertion | Both generated selectors use a `cumulative >= ticket` boundary. For the required half-open cumulative intervals, ticket `1` must select bucket 2; the generated code selects bucket 1. |
| `team-balance` | `assert(candidate({[1] = 1, [3] = 2}, 4) == nil)` | same assertion | Both generated selectors accept a sparse table as an array. The contract requires a plain dense array and therefore requires `nil`. |

These are algorithm/contract defects in the returned source. The reports short-circuit at the
first assertion, so they do not prove that no later defects exist; they do prove the first
failure for each example.

## Why the other explanations do not fit

- **Truncation:** `local_pilot.py` checks training targets for truncation before training, and the
  generated artifacts consumed by the scorer are complete fenced modules ending in `return pick`
  or `return chooseTeam`. There is no recorded generation token count/stop reason, so a token-level
  proof is unavailable, but the observed failure is a semantic assertion in complete source, not
  an incomplete parse or missing fence.
- **Wrong return shape:** each response returns the requested function. The scorer's wrapper calls
  `candidate(...)` successfully far enough to hit the contract assertions; a table/nil/wrong
  module shape would fail before the reported assertion.
- **Template/evaluator problem:** training and sampling use the generation prefix from
  `messages[:-1]` (`local_pilot.py`), while `completion_tokens` masks only that prefix and appends
  the literal target plus EOS. The scorer accepts either `luau` or `lua` fences and executes the
  same holdout checks in a local Luau process. The v2 reference answers carry local execution and
  mutation-rejection evidence for these checks. A two-example holdout and short-circuiting checks
  still limit confidence about generality, but they do not account for these concrete boundary
  failures.

Training loss fell (validation 1.520 to 0.246), but that metric did not translate into behavior:
`beforePassed: 0`, `afterPassed: 0`, and `studioVerified: false`. The artifact records
`productionPromotion: false` and provider spend `0` for the local run.

## One bounded next experiment

Run one fresh local pilot with the planned expanded training split, keeping the cached base
revision, seed, optimizer/iteration settings, chat template, deterministic sampler, scorer, and
the untouched v2 test hash fixed. Train only on the expanded training rows (never the v2 test
answers or checks), then score the same two v2 test modules and require fresh-process replay before
comparing. Pre-register the narrow outcome as: do both weighted-boundary and sparse-array
contracts pass after reload? If they still fail at those assertions, stop treating loss or
format changes as progress and classify the issue as insufficient algorithmic coverage/capability;
if they pass, inspect the saved source and per-assertion diagnostics before any broader claim.
This is a local, bounded experiment and is not a production promotion test.

## Verification run

Read-only audit checks run on 2026-09-18:

```text
node --test packages/training/src/local-pilot.test.mjs packages/training/src/score-local-pilot.test.mjs
8 passed, 0 failed
```

