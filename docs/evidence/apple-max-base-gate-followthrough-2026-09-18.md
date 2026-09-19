# Apple MAX base-gate followthrough — 2026-09-18

## State

The existing Apple MAX base-gate harness is ready for the one bounded Qwen2.5-Coder-32B run, but
the paid run is still **not authorized to start from this worker**. I made no inference request and
did not take the `$0.25` local reservation. The remaining trigger is an explicit main-agent
greenlight after the deployed Apple worker has the gateway finish-reason fix and the temporary
`appleMaxBase` diagnostic key, followed by fresh authenticated model/spend reads.

This followthrough does not change the gate, tasks, holdouts, model defaults, converter, training
configuration, or any serving route.

## Re-verified offline preconditions

All checks below were run from `/Users/moshe/Desktop/RbxAI` against the current shared checkout.

| Check | Observed result |
| --- | --- |
| Node runtime | `v26.8.1` |
| Eval self-test | `SELFTEST PASS` |
| Luau checker | `luau-lsp (PATH)`, CLI version `1.69.0` |
| Base-gate + metrics + spend-ledger + converter tests | `45/45` pass |
| Task count | `88` |
| Total task weight | `165` |
| Four scripting categories | `89` weight |
| Frozen bundle SHA-256 | `a1d0b5d260cc466ea4c57d6eff04b438531a9aa0793e6c2523373dd1ed758835` |
| Registered bundle SHA-256 | same |
| Canonical local spend cap | `$20.00` |
| Already allocated | `$0.06` |
| Unallocated before this run | `$19.94` |
| Ledger lock | absent at inspection time |

The local training venv also remains installed for the later, separately approved capacity work:
Python `3.12.13`, `mlx 0.32.2`, `mlx-lm 0.31.3`, `transformers 5.17.0`,
`huggingface-hub 1.31.0`, and `safetensors 0.8.0`. None of these packages is needed for the hosted
base-only gate itself.

The byte freeze is enforced by `validateBaseGateConfig()` before the first provider request. It
requires exactly `appleMaxBase`, no category/limit/RAG change, `maxTokens=2400`, one attempt, the
88/165/89 suite identity, and the bundle digest above.

The main agent repaired the metrics closed-set handling while this followthrough was being prepared,
so I re-read the shared checkout instead of carrying forward the earlier source fingerprint. The
current recorded harness hashes are:

| Harness source | SHA-256 |
| --- | --- |
| `packages/evals/src/run.mjs` | `1adfa10a759575e2b6177bd68553f1026fe2cd73f8c14edc2aee9103c00df50a` |
| `packages/evals/src/transport.mjs` | `1a34d4ed5270607ea54b9cd42edc6d4476dbba1cb9ae2be44e5fbe108f0d2d3d` |
| `packages/evals/src/grade.mjs` | `de703323c352221abcca786d429e93f0a1d9a613d5514def7fd3cd82fece9a16` |
| `packages/evals/src/metrics.mjs` | `d1f55c57ac5a1f43d23482bde081cad1eb6fcecaa37e20f50e579bbd6fecedd0` |

After that concurrent repair, `node packages/evals/src/selftest.mjs` still returned
`SELFTEST PASS`, all 45 focused tests above passed, and the task-bundle digest still exactly
matched the registered base gate.

## Cost and reservation audit

The current route-aware reservation arithmetic reproduces the preregistered value exactly.
`transport.mjs` folds every task's system text into the user prompt. `/api/admin/model-test` then
adds its 38-character default system message, `You are a helpful assistant. Be brief.`. Across the
frozen 88 tasks that produces:

```text
input characters sent into the gateway estimate: 58,865
conservative input-token estimate:              16,864
maximum output tokens:                    88 × 2,400
full-suite pessimistic reservation:             20,258 neurons
USD equivalent at $0.000011/neuron:              $0.222838
largest single request reservation:                    258 neurons
hard per-request ceiling:                             1,200 neurons
```

The pricing source still lists `@cf/qwen/qwen2.5-coder-32b-instruct` at `$0.66/M` input and
`$1.00/M` output. The canonical local ledger is independent of the product's BudgetDO and still
has `$19.94` free, so the approved `$0.25` reservation fits and would leave `$19.69` unallocated.

`reserveSpend()` is atomic through an exclusive `.lock`, validates the fixed `$20` cap before and
after appending, writes through a temporary file, and refuses duplicate reservation ids. There is no
automatic refund. If the paid run starts and its usage or outcome becomes uncertain, keep the
reservation consumed.

## Exact post-greenlight sequence

Before these commands, main must re-read the deployed Apple worker and confirm all of the following:

- `appleMaxBase.id === '@cf/qwen/qwen2.5-coder-32b-instruct'`;
- `appleMaxBase.maxTokens === 2400`, `nativeTools === false`, `ctx === 32768`;
- the deployed gateway contains the reviewed finish-reason propagation fix;
- kill switch is off;
- at least `20,258` neurons remain available for the complete day reservation;
- the per-request ceiling remains at least `258` neurons.

Only after the explicit main-agent greenlight, reserve exactly `$0.25` once with the existing helper:

```bash
node --input-type=module - <<'NODE'
import { reserveSpend } from './packages/training/src/spend-ledger.mjs';

const result = reserveSpend('./packages/training/data/spend-budget-2026-09-18.json', {
  id: 'evaluation:apple-max-base-gate-2026-09-18',
  usd: 0.25,
});
console.log(JSON.stringify(result, null, 2));
NODE
```

Then run the existing harness exactly once, with `API_BASE` and `ADMIN_KEY` already pointing at the
freshly verified Apple deployment:

```bash
node packages/evals/src/run.mjs \
  --models appleMaxBase \
  --max-tokens 2400 \
  --one-attempt \
  --base-gate \
  --tag apple-max-base-2026-09-18
```

Do not add `--rag`, `--categories`, `--limit`, a replacement job, or a second attempt. The harness
will refuse registered-setting or task-byte drift before inference and exits non-zero if any of the
seven preregistered base-gate criteria fail.

## Redacted result collection

The runner does not persist `ADMIN_KEY`, but its per-task records contain response previews. For the
handoff, collect only run identity, hashes, gate criteria, aggregate scores, and task-level billing /
completion metadata. This command reads the newest exact-tag result and deliberately omits
`responsePreview`, raw provider bodies, and credentials:

```bash
node --input-type=module - <<'NODE'
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = './packages/evals/results';
const name = readdirSync(dir)
  .filter((entry) => /^apple-max-base-2026-09-18-\d{8}-\d{6}\.json$/.test(entry))
  .sort()
  .at(-1);
if (!name) throw new Error('no apple-max-base result found');

const run = JSON.parse(readFileSync(join(dir, name), 'utf8'));
const runMeta = {
  tag: run.runMeta.tag,
  startedAt: run.runMeta.startedAt,
  models: run.runMeta.models,
  categories: run.runMeta.categories,
  limit: run.runMeta.limit,
  taskCount: run.runMeta.taskCount,
  jobCount: run.runMeta.jobCount,
  concurrency: run.runMeta.concurrency,
  attempts: run.runMeta.attempts,
  maxTokens: run.runMeta.maxTokens,
  rag: run.runMeta.rag,
  baseGate: run.runMeta.baseGate,
  expectedModelId: run.runMeta.expectedModelId,
  luauChecker: run.runMeta.luauChecker,
  transport: run.runMeta.transport,
  sourceHashes: run.runMeta.sourceHashes,
};
const taskTelemetry = run.perTask.map((r) => ({
  taskId: r.taskId,
  category: r.category,
  model: r.model,
  modelId: r.modelId,
  ok: r.ok,
  complete: r.complete,
  truncated: r.truncated,
  attempts: r.attempts,
  ms: r.ms,
  usage: r.usage,
  neurons: r.neurons,
  finishReason: r.finishReason,
  score: r.score,
  scored: r.scored,
  ungradedReason: r.ungradedReason,
}));

console.log(JSON.stringify({
  file: name,
  runMeta,
  baseGate: run.baseGate,
  overall: run.overall,
  perCategory: run.perCategory,
  taskTelemetry,
}, null, 2));
NODE
```

For the final evidence, also read the canonical spend ledger after the run and report the `$0.25`
allocation separately from provider-settled neurons. The local reservation is an authorization
ceiling, not invoice evidence.

## Current Cloudflare LoRA compatibility constraint

Cloudflare primary documentation checked on 2026-09-18 establishes two facts that currently do not
form a complete Qwen adapter-upload contract:

1. The model page and the LoRA-filtered model catalogue mark
   `@cf/qwen/qwen2.5-coder-32b-instruct` as Cloudflare-hosted and **LoRA-capable**, with a 32,768-token
   context. Cloudflare's pricing page lists `$0.66/M` input and `$1.00/M` output.
2. The current LoRA upload documentation says supported LoRA bases must not be quantized, adapter
   rank must be at most 32, the adapter must be under 300 MB, and the two files must be named
   `adapter_config.json` and `adapter_model.safetensors`. The same page requires
   `adapter_config.json.model_type` to be one of only `mistral`, `gemma`, or `llama`.

The repository's `packages/training/src/mlx_to_peft.py` emits the correct PEFT filenames, checks
rank/size, and proves tensor conversion equivalence, but it currently emits no `model_type`. Its
existing converter tests pass `4/4`; that does not resolve the missing Qwen value because Cloudflare
does not document one on the upload page. Therefore a future Qwen LoRA upload needs either a
Cloudflare-documented Qwen-compatible `model_type` or a guarded account-side validation before the
converter is changed or any adapter is uploaded. Guessing `qwen`, `llama`, or another value would
turn an undocumented provider contract into production behavior.

Primary sources:

- https://developers.cloudflare.com/workers-ai/models/qwen2.5-coder-32b-instruct/
- https://developers.cloudflare.com/workers-ai/models/?capabilities=LoRA
- https://developers.cloudflare.com/workers-ai/features/fine-tunes/loras/
- https://developers.cloudflare.com/workers-ai/platform/pricing/

This LoRA upload constraint does not block the current base-only gate, which calls Cloudflare's
hosted base model without an adapter. It blocks claiming that a future locally trained Qwen adapter
is already upload-ready.
