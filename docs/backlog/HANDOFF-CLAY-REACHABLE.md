# HANDOFF — `clay` is reachable, and a run that reaches it is recorded as the lane that does not

**Found 2026-09-21 by the model track, while resolving a disagreement between two committed docs.
Not fixed here: `apps/worker/src/do/session.ts` was dirty with another session's work at the time
(`git status --porcelain` on it was non-empty), so this is written instead of edited.**

## What was executed, not read

`apps/worker/src/do/session.ts` was bundled with esbuild (`--alias:cloudflare:workers=` a two-line
DurableObject shim, the same way `apps/worker/tests/effort-applied.test.mjs` does it) and
`gatewayModelFor` was called over every combination:

| `productModel` | `mode` | gateway key |
|---|---|---|
| `'apple'` | `clay` / `stone` / `rune` | `stone` / `stone` / `stone` |
| `'apple-max'` | `clay` / `stone` / `rune` | `stone` / `stone` / `rune` |
| **`undefined`** | **`clay`** / `stone` / `rune` | **`clay`** / `stone` / `rune` |

## The defect

Two symbols, both in `apps/worker/src/do/session.ts`:

```ts
function asProductModel(x: unknown): ProductModel | undefined | null {
  if (x === undefined || x === null) return undefined;       // <- omitted means undefined, not a default
  return x === 'apple' || x === 'apple-max' ? x : null;
}

export function gatewayModelFor(mode: GolemMode, productModel?: ProductModel): string {
  if (productModel === 'apple') return 'stone';
  if (productModel === 'apple-max') return mode === 'clay' ? 'stone' : mode;
  return mode;                                                // <- undefined falls through to the mode
}
```

and a third that disagrees with the second:

```ts
/** Legacy specialist requests keep their old meaning; new requests carry this model explicitly. */
function effectiveProductModel(mode: GolemMode, requested?: ProductModel): ProductModel {
  return requested ?? (mode === 'clay' ? 'apple' : 'apple-max');
}
```

`effectiveProductModel` maps a missing product model on mode `clay` to **`apple`**, and is used when
the run is remembered (`this.rememberProductModel(agent.msgId, agent.productModel ?? effectiveProductModel(agent.mode))`).
`gatewayModelFor` is given `agent.productModel` directly and maps the same missing value to the
**`clay`** gateway key.

So a run started with `mode: 'clay'` and no `productModel`:

- is **served** by `@cf/qwen/qwen3-30b-a3b-fp8` (the `clay` key; model id confirmed live through
  `/api/admin/model-test` in `docs/evals/FINDINGS.md`), and
- is **recorded** as product model `apple`, the lane whose model is `@cf/zai-org/glm-5.3-flash`.

Both copies of `asProductModel` behave this way — `apps/worker/src/do/session.ts` and the identical
one in `apps/worker/src/index.ts`, which serves `POST /v1/projects/:id/runs`. An SDK or API caller
that omits `productModel` takes this path.

## What has NOT been measured

Whether any live run actually omits `productModel`. The web app's own send path was not traced. The
API surface plainly allows it; that is a reachability argument, not an observation of traffic. Do
not upgrade this to "customers are hitting qwen" without a log.

## What the fix probably is (for whoever owns session.ts)

One of:

1. `gatewayModelFor(mode, effectiveProductModel(mode, productModel))` at the call site, so the two
   functions stop disagreeing about what a missing product model means; or
2. `asProductModel` returns the default instead of `undefined`, so the missing case never travels.

Either way the guard that belongs with it is a test that the key `gatewayModelFor` returns and the
product model `rememberProductModel` stores name the **same** served model for every input,
including `undefined`. That property is false today and nothing covers it, which was checked file by
file rather than assumed:

- `apps/worker/tests/lane-budget.test.mjs` does not call the function at all — it regex-matches the
  `productModel === 'apple'` line out of the source text, so the `undefined` branch is invisible to
  it.
- `apps/worker/tests/effort-applied.test.mjs` enumerates five `[mode, productModel]` pairs, all of
  them `'apple'` or `'apple-max'`.
- `apps/worker/tests/free-lane-output-budget.test.mjs` **does** pass `undefined` — and only asks
  whether the resulting budget clears a floor. `budget('clay', undefined, 'high')` resolves through
  the `clay` config and passes, because a token ceiling is not the question. No test anywhere
  compares the served model against the recorded product model.

## Documents this corrects

- `docs/evals/FINDINGS.md` — its top table annotates `clay` as "reached by Plan". No named lane
  reaches `clay`. Corrected in place with the executed table.
- `docs/model-serving-reality.md` §2 — "no product lane routes here any more" reads as
  unreachable. It is reachable by a run with no product model.
