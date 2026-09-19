# apps/plugin — NOT THE PRODUCT

**The Studio plugin this product ships is `apps/apple-plugin`.** Nothing in this directory is
submitted to the Creator Store, installed by a user, or linked from any page. Do not develop the
shipped plugin here, and do not add a capability here expecting a user to get it.

This file exists because there were two Studio plugins in this repository for a while and nothing
said which one was real — so both looked maintained, `README.md` pointed at this one, and the
worker's own comments cite its files as the thing they must match. That ambiguity is resolved here.

Decided 2026-09-19. The runbook for the one that ships is `docs/PLUGIN-RELEASE.md`.

## Why this one cannot ship

`handlers.run_code` (`src/Ops.luau:521`) builds a `ModuleScript` out of text that arrived over HTTP
and calls `require` on it:

```luau
module.Source = header .. "\n" .. (op.code or "") .. "\n" .. footer
local ok, result = pcall(require, module)
```

That is remote code execution in plugin context. The Creator Store asset requirements prohibit it,
and the asset built from this source **was removed by Roblox for "Misusing Roblox Systems"** — the
exact triggering code was never identified, but this is the pattern the requirements name. There is
also `handlers.insert_asset`, which pulls a remote asset into the user's place.

Neither is a bug. Both are load-bearing for the legacy design, and `run_code` is what twelve worker
tools are built on. That is precisely why this plugin cannot be the public one: the capability and
the prohibition are the same line of code. `apps/apple-plugin` refuses both by name, and the worker
withholds the dependent tools and says so — see `docs/PLUGIN-RELEASE.md` for the exact list.

## Why it is still here, rather than deleted

It is the reference implementation for five things that are checked against it by tests owned
elsewhere in the repository, and deleting it would turn all of them red:

| Depends on | What it reads |
| --- | --- |
| `packages/evals/src/asset-qc.test.mjs:815` | `src/Generation.luau` — parses it and asserts the QC thresholds match `apps/worker/src/assets.ts` |
| `packages/evals/src/asset-content-gate.test.mjs:31` | `src/*.luau` by name |
| `apps/worker/tests/studio-op-parity.test.mjs:39` | `src/Ops.luau` — every `StudioOp` must have a handler |
| `apps/worker/tests/op-failure.test.mjs:113` | `src/Ops.luau` |
| `apps/worker/tests/companion-selection.test.mjs:245` | `src/Ops.luau` |

And two more where it is the definition rather than the subject:

- `apps/worker/src/composition.ts:38` — `SKY_RGB`/`GROUND_RGB` "must match the rasteriser in
  `apps/plugin/src/Render.luau`".
- `packages/evals/src/render-scene.mjs` — the Node twin of that rasteriser, which the eval suite
  grades stored scenes with.

`src/Render.luau` is also the **source** of `apps/apple-plugin/src/Render.luau`. The port is held to
this file by `apps/apple-plugin/tests/render-parity.test.mjs`, which runs `tests/render.spec.luau`
and `tests/rasteriser.spec.luau` — unmodified, from this directory — against the ported copy. So the
specs here are live evidence about the shipped plugin, not dead weight.

## If you are changing something

- A change to the **shipped** plugin goes in `apps/apple-plugin/src`.
- A change to `src/Render.luau` must keep the port in step, or `render-parity.test.mjs` goes red —
  which is the point. Change both, or neither.
- `node tests/run.mjs` runs the 250 Luau specs here. They still pass and are expected to.
