# Apple MAX base gate controls and live preflight — 2026-09-18

## Decision

The bounded-run controls and the gateway finish-reason fix are implemented and pass offline
verification. The 88-task Qwen base run did **not** start. The stop happened before the local
`$0.25` reservation and before any inference request because two live prerequisites are absent:

1. neither deployed worker exposes the diagnostic `appleMaxBase` model key;
2. both deployed source revisions still discard the provider's decoded finish reason and report
   `stop` for every non-tool response. The local fix has not been deployed, so a live `length`
   truncation cannot yet be observed by the harness.

The product budget itself is sufficient. The primary Apple worker had **24,783 neurons** available
against the registered **20,258-neuron** full-suite estimate, with zero pending and the kill switch
off. The stop is therefore a model-routing/deployment prerequisite, not a budget shortage.

No model call, provider probe, download, training job, fine-tune upload, subscription, deployment,
credential mutation, budget increase, spend simulation, or budget reset occurred in this pass. The
canonical local training ledger remains `$0.06` allocated and `$19.94` unallocated under its `$20`
cap.

## Controls added to the existing harness

`packages/evals/src/transport.mjs` now accepts an optional positive-integer `maxTokens`, sends it to
`POST /api/admin/model-test`, and retains `finishReason` alongside the provider model id, token usage,
settled neurons, tool calls, and text. Omitting `maxTokens` keeps the existing endpoint-default
behaviour.

`packages/evals/src/run.mjs` now provides these opt-in controls:

- `--max-tokens 2400` sends the registered ceiling explicitly;
- `--one-attempt` suppresses the runner's compatibility retry;
- `--base-gate` binds the run to `appleMaxBase`, base-only/no-RAG execution, all 88 tasks, the frozen
  task weights and byte digest, one attempt, and a 2,400-token ceiling;
- a provider `length` finish is stored as incomplete and ungraded, with usage and neurons retained;
- an unexpected resolved model id or missing finish reason is stored as incomplete and ungraded;
- each result stores every task-file digest plus the runner, transport, grader, and metrics digests;
- the output includes a seven-criterion `baseGate` verdict and exits non-zero when any criterion
  fails. A pass is labelled `foundationEligibilityOnly`.

The seven recorded criteria exactly implement the preregistration:

1. 88 unique, gradable, first-attempt jobs from the expected provider model id;
2. overall task-weighted score at least 90%;
3. combined scripting score at least 85%, with every scripting category at least 75%;
4. every executed `luau_syntax` check passes;
5. every executed `no_antipattern` check passes;
6. every finish reason is present and none is `length`;
7. every task remains in the denominator and records token usage plus settled neurons.

`apps/worker/src/gateway.ts` now keeps the adapter's normalized `length`, `stop`, and `error` result
for non-tool output. A retained native or prompted tool call still reports `tool_calls`; a provider
`tool_calls` marker with no retained structured call keeps the established compatibility fallback.
This is the missing connection between the already-correct Workers AI decoder and the admin route.

## Offline verification

| Check | Result |
|---|---:|
| `node --test packages/evals/src/base-gate-controls.test.mjs` | 10/10 pass |
| focused controls + grader + metrics + scripting curriculum | 78/78 pass |
| `node --test apps/worker/tests/gateway-finish-reason.test.mjs` | 2/2 pass |
| existing provider architecture suite | 36/36 pass |
| final combined selected suites | 116/116 pass |
| `node packages/evals/src/selftest.mjs` | `SELFTEST PASS` |
| `pnpm --filter @golem/evals check` | exit 0 |
| `pnpm --filter @golem/worker typecheck` | exit 0 |
| deliberate `2399`-token base-gate invocation | refused before network access, exit 2 |

The self-test reconfirmed **88 tasks**, **165 total task weight**, a real local Luau checker, and
**89/165** weight in the four scripting categories. The scripting-curriculum suite rechecked every
reference answer against the real graders.

Focused tests prove that:

- the request body carries `maxTokens: 2400` only when opted in;
- the provider finish reason, model id, usage, and neurons survive transport normalization;
- `length` is never graded even when the partial text would otherwise satisfy a check;
- a truncated response is never retried;
- `--one-attempt` suppresses a retryable transport retry;
- ordinary runs preserve the previous one-retry default;
- changed task bytes or any registered run setting refuse the base gate before inference;
- a synthetic complete result passes all seven criteria, while one truncated record rejects the
  gate and the complete denominator.

## Frozen input identity

The source decision recorded task digest
`ca57b588f6601aee74d6cd0165d0a3a32ad6d83c02f087098f92a4d6b23221b8`, but did not record the
aggregation algorithm that produced it. That aggregate cannot be independently reconstructed from
the digest alone. The task files are git-clean, their latest task commit predates the decision, the
88/165/89 suite identity still matches, and the pre-edit runner/grader/metrics/transport hashes
matched the decision exactly.

The updated runner removes the ambiguity by recording each file separately and defining the new
aggregate as:

```text
sha256(JSON.stringify(sorted { filename: sha256(file bytes) }))
```

The resulting frozen aggregate is
`a1d0b5d260cc466ea4c57d6eff04b438531a9aa0793e6c2523373dd1ed758835`.

| Task file | SHA-256 |
|---|---|
| `api-knowledge.json` | `57bb568b5e9ec7ddee5b7562b365e96b9a0eee49f390739a9b3868760a4b51ec` |
| `debugging.json` | `de1c1bab343d9af0cf9703b890aa54fb179100d4f794d2f8bc7b3688e4b0729e` |
| `door-mechanic.json` | `6eba72b07b90a7c38e66b3018ede3fb4d9f05873596eb94faba35e78afd17bcf` |
| `failure-recovery.json` | `86091944c02eeb0c8f5defac8eadcc7071c706c17028aea8a7ee53643e0a4891` |
| `luau-correctness.json` | `137b74fef1ded2677b1267ba853304d033cad42aa66f4a5b580c2bbd7ceca4ef` |
| `multi-file.json` | `940ac069008a2dc8bb9cb0603f4e306380a1454102d95a2e9cc5a56db0c61cc7` |
| `project-comprehension.json` | `b29332282cb25ecee3f6bc2ff80dcd0e73a42cf4479823152d418a5e1790148a` |
| `scripting-gameplay.json` | `e46ebd80a3a5e3080dac03badbb0e3e6be22d3ffb57020ca81bbe8478f868c62` |
| `scripting-persistence.json` | `f3e799567fae4213e6173b8237989eae6a229ee91e496c428265de39012a5f86` |
| `scripting-security.json` | `95117982811ac4a50d1a81da5df04ba9f4fcaa5afde8ff535778708572339586` |
| `scripting-systems.json` | `5c6b6a3c1f8c088f4f40b0dedd7003fdf87e052b94a617fb5be9bd287b722703` |
| `tool-selection.json` | `431380626c51209a4a6d141f2b2ec4295ec6ef1540f0cd33fa3a4c2d5fbd8fa0` |
| `ui-implementation.json` | `b8923cdcede9c17c4c78df48e7400a21b892dbf3c1f859a4e407fb06e34d74ed` |

Updated source hashes at evidence time:

| Source | SHA-256 |
|---|---|
| `packages/evals/src/run.mjs` | `1adfa10a759575e2b6177bd68553f1026fe2cd73f8c14edc2aee9103c00df50a` |
| `packages/evals/src/transport.mjs` | `1a34d4ed5270607ea54b9cd42edc6d4476dbba1cb9ae2be44e5fbe108f0d2d3d` |
| `packages/evals/src/grade.mjs` | `de703323c352221abcca786d429e93f0a1d9a613d5514def7fd3cd82fece9a16` |
| `packages/evals/src/metrics.mjs` | `39d78a17bb2762fc43a0604badb53261ed98f34aab8d8e0edf1cc7c3d6339978` |
| `apps/worker/src/gateway.ts` | `733ef51b741133646be0e3ac16b733123d1a06ddfc24035da69cdefe6326335b` |

## Authenticated live observations

Reads were made at `2026-09-18T17:14+03:00` with the existing local admin credential. The credential
was neither printed nor persisted. Only `GET /api/health`, `GET /api/admin/models`, and
`GET /api/admin/spend` were called.

| Host | Build | Diagnostic key | Day used / pending | Available today | Killed | 20,258 capacity |
|---|---|---|---:|---:|---|---|
| Apple product worker | `6d7a5be-dirty` | absent | 217 / 0 | 24,783 | false | pass |
| Golem infrastructure worker | `e0926cf` | absent | 0 / 0 | 25,000 | false | pass |

Both `/api/admin/models` responses contained only `clay`, `memory`, `rune`, `stone`, and `vision`.
Neither contained `appleMaxBase`.

The commit behind `e0926cf` and the base commit behind `6d7a5be-dirty` both decode the provider
response and then return:

```ts
finishReason: toolCalls.length ? 'tool_calls' : 'stop'
```

The Workers AI adapter already normalizes a provider `length` reason correctly. The gateway return
above replaces that normalized value, so the deployed admin route cannot supply trustworthy
truncation evidence yet.

## Prerequisite matrix

| Prerequisite | State |
|---|---|
| Explicit `maxTokens=2400` | PASS |
| One runner attempt | PASS |
| Finish reason retained by eval transport | PASS |
| Truncated output rejected and preserved | PASS |
| Frozen 88-task/no-RAG/config tripwire | PASS |
| Seven preregistered result criteria | PASS |
| Local gateway propagation of `length`/`error` | PASS; offline tested |
| Authenticated daily capacity ≥20,258 | PASS on both workers |
| Product kill switch off | PASS on both workers |
| Local `$20` ledger has `$0.25` free | PASS; `$19.94` unallocated |
| Live `appleMaxBase` mapping | **FAIL — absent** |
| Live gateway preserves decoded finish reason | **FAIL — local fix awaits deployment** |
| Atomic `$0.25` reservation | NOT TAKEN because earlier prerequisites fail |
| Paid 88-task run | NOT STARTED |

## Exact handoff before the authorized run

The remaining live work belongs to the main agent:

1. Review and deploy the local gateway fix to the intended Apple worker.
2. Write only the temporary diagnostic model configuration through the existing authenticated route:

```http
POST /api/admin/config
Content-Type: application/json
X-Admin-Key: <existing admin credential>
```

```json
{
  "key": "config:models",
  "value": {
    "appleMaxBase": {
      "id": "@cf/qwen/qwen2.5-coder-32b-instruct",
      "nativeTools": false,
      "maxTokens": 2400,
      "ctx": 32768,
      "temperature": 0.2
    }
  }
}
```

`POST /api/admin/config` replaces the raw `config:models` value. The authenticated effective model
read currently shows no valid custom keys, so this exact value yields the same five source defaults
plus only `appleMaxBase`; it does not rewrite `clay`, `stone`, `rune`, `memory`, or `vision`. The model
map is cached in-process for up to 60 seconds, so deployment/configuration must be followed by a fresh
authenticated read before spend.

The resulting effective diagnostic entry must be:

```ts
appleMaxBase: {
  id: '@cf/qwen/qwen2.5-coder-32b-instruct',
  nativeTools: false,
  maxTokens: 2400,
  ctx: 32768,
  temperature: 0.2,
}
```

After deployment/configuration, re-read `/api/admin/models` and `/api/admin/spend`. The exact model
id must be present, the kill switch must remain off, at least 20,258 neurons must still be available,
and the per-request limit must remain at least the registered 258-neuron maximum. Then atomically
reserve `$0.25` in `packages/training/data/spend-budget-2026-09-18.json` with the existing
`reserveSpend()` helper before the first request.

The one authorized invocation is:

```bash
node packages/evals/src/run.mjs \
  --models appleMaxBase \
  --max-tokens 2400 \
  --one-attempt \
  --base-gate \
  --tag apple-max-base-2026-09-18
```

`API_BASE` and `ADMIN_KEY` must point to the newly verified Apple deployment. No `--rag`, category
filter, task limit, replacement job, or retry belongs in this invocation. The local `$0.25`
reservation remains consumed if usage is missing or the process outcome is uncertain; that is the
conservative settlement rule. Even a full gate pass authorizes only the next foundation experiment.
It is not a production, fine-tuning, serving, Studio, visual-quality, or promotion result.
