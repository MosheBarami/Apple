# apple-v4: what the training actually bought — measured against its own base

w22 asks for a dataset, an **isolated evaluation**, and a saved model with **verified serving**.
All three exist now. The evaluation is the part worth reading, because it says both what worked
and what did not.

## The number

Held-out set: 21 rows, families disjoint from training by construction (`build-mlx-dataset.mjs`
refuses a build where a family appears on both sides). Base and adapter, same prompts, temperature
0, same harness, in one run.

| track | base | apple-v4 |
|---|---|---|
| tool trajectory | **0 / 13 (0%)** | **8 / 13 (62%)** |
| game logic | 0 / 8 (0%) | 0 / 8 (0%) |

Nothing here is scored by similarity to a reference answer. A produced Luau module is **run**
against its own example's exhaustive checks; a produced tool call is handed to the product's
**live registry** and must survive its schema. A fluent wrong answer scores zero.

## What the misses say, which is more than the totals

```
base     trajectory:  tool_does_not_exist x5   no_tool_call x4   arguments_rejected x4
apple-v4 trajectory:  arguments_rejected x2    no_tool_call x3
```

**The base invented five tool names. apple-v4 invented none.** That is the exact defect
`apps/worker/src/tool-recovery.ts` was built to contain — a whole module, an allowlist and a
security boundary standing where a training gap was. This is the first evidence that the gap can
be closed at the source instead of patched at the transcript.

## What it did NOT do, stated as plainly as the 62%

**Game logic went 0/8 to 0/8. Training bought nothing there.** Both models produce Luau that
parses and is standalone and then fails the property tests — `fails_own_checks` 8 times for the
base, 7 plus one `not_standalone` for the adapter. A 3B model does not write exhaustively-correct
game logic, and 80 authored examples did not change that. Anyone reading the 62% as "the model got
better" should read this line as well: it got better at ONE of the two things it was trained on.

Also not established:
- **Nothing about the product's real quality.** This is a held-out slice of the same authored
  curriculum, not customer traffic. It is a development benchmark, not a promotion gate.
- **Recovery is untested and untrained** — no seed contains a failed tool result, because none was
  ever recorded. The dataset card says so.
- **21 rows.** 8/13 has a wide interval. The direction is clear; the value is not precise.

## Training

`lora-apple-v4.yaml` on `mlxdata-apple-v4` (233 rows, 110 families, 233/233 usable, 0.0%
context-dependent, 153 trajectories, verdict READY_FOR_PRODUCT_SFT).

```
Iter   1: Val 3.225
Iter  25: Val 1.246
Iter  50: Val 1.072
Iter  75: Val 1.065
Iter 100: Val 0.982   <- best, and the checkpoint used
Iter 125: Val 1.085
Iter 150: Val 1.086
Iter 175: Val 1.032
```

**The checkpoint evaluated is iter 100, not the last one.** Validation loss turns at 100 and never
returns; on 187 training rows that is overfitting, and taking the final adapter because it is the
one the trainer leaves behind would have shipped a worse model for no reason.

The run did not reach its 300 iterations — it died at `[METAL] Command buffer execution failed:
Impacting Interactivity`, the macOS GPU watchdog, the same fault that killed the first attempt at
`batch_size: 2`. Since the best checkpoint is at 100 and everything after it is worse, the crash
cost nothing measurable, but the run is truncated and that is not the same as complete.

## Verified serving

```
apple-v4  ->  ddde8377-8a76-4240-b083-b9e59cd38031  on @cf/meta/llama-3.2-3b-instruct
converter: delta-W equivalence on 112 projections, max relative error < 1e-5
           224 tensors, rank 8, alpha 160.0, q/k/v/o + gate/up/down, 27.8 MB

serving-probe.sh:
  base       success=True sha=64b598f6fa6ca049
  base again success=True sha=64b598f6fa6ca049     <- deterministic, so a difference is the adapter
  with lora  success=True sha=b1e084349019fb26     <- different
  bogus lora success=False code 5033               <- the id is genuinely resolved
  SERVED
```

## Not wired into the product, and why that is a decision not an omission

`stone`, `rune` and `vision` route to GLM; `clay` and `memory` to Qwen3. All five answer **5005
LoRA unsupported** — measured, see `docs/evidence/lora-serving-verified-2026-09-19.md`. A
specialised Apple adapter can only ever be an ADDED lane on a Llama-3.2-3B base, never a
replacement for the models the product runs on today. Whether a 3B adapter that is better at tool
calling and no better at logic earns a lane is a product decision, and this document does not make
it.

## The 0/8 was re-measured on 2026-09-20, because two identical zeroes prove nothing on their own

Game logic came back `0 / 8` for the base and `0 / 8` for the adapter. Those two figures have two
possible causes and the totals cannot tell them apart: either both models genuinely fail, or
`scoreGameLogic` cannot report a pass at all. A scorer that always says no produces exactly this
table. Until it had been seen going green, the zero was not evidence of anything about training —
it was a number whose meaning had not been established.

`packages/training/src/score-eval.test.mjs` settles it, on the real curriculum rather than a
fixture. Every one of the eight held-out examples' **own reference source**, fenced exactly as a
model emits it, scores `ok`. A pass is reachable. The `0 / 8` is the models.

The same test was then attacked twice, and each mutation was caught by the assertion aimed at it:

| mutation | what it imitates | result |
|---|---|---|
| `scoreGameLogic` returns `{ ok: true }` unconditionally | a scorer that cannot say no | 2 tests RED — the refusal-reachability pair |
| the harness wrapper binds `candidate = nil` | a harness that cannot see a pass — the `0/8` lookalike | 1 test RED — the reference-source assertion |

Both reverted; the suite is green on the unmutated file. So the conclusion in the section above —
*it got better at ONE of the two things it was trained on* — is now measured from both sides rather
than read off a total.

**What the misses look like up close, which the counts hide.** apple-v4 on `honest-percent`:

```luau
local function finite(value)
    return type(value) == "number" and value == value and math.abs(value) < math.huge
end
return function(value, maximum)
    if not finite(value) or not finite(maximum) or maximum <= 0 then return nil end
    return math.min(100, math.max(0, (value - 0) / (maximum - 0) * 99))
end
```

The house style is learned completely — the finite guard, the nil refusal, the clamp, the returned
closure. The arithmetic is wrong by one constant. On `remap-range` it is worse than a constant: the
function takes four parameters where the contract has five, so there is no input value to remap and
the body cannot be right at any constant. That is the shape of the remaining gap. The training
taught the model what these modules LOOK like and not what they must COMPUTE, which is consistent
with 80 authored examples and a 3B base, and it says where the next dataset has to push: the
checks, not the silhouette.
