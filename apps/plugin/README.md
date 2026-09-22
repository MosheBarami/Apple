# apps/plugin — NOT THE PRODUCT (legacy reference fixtures, not shipped)

**The Studio plugin this product ships is `apps/apple-plugin`**, published on the Creator Store as
**Apple Studio, asset 107230158271368**. Nothing in this directory is submitted to the Creator
Store, installed by a user, built by CI into an artifact, or linked from any page. Do not develop the
shipped plugin here, and do not add a capability here expecting a user to get it.

What this directory is now: **test fixtures and reference data** that other suites read. Its own
Luau specs still run under `pnpm -r test` (`node tests/run.mjs`, the companion test and the mutation
check), because several of them are live evidence about the shipped plugin — see below.

This file exists because there were two Studio plugins in this repository for a while and nothing
said which one was real — so both looked maintained, `README.md` pointed at this one, and the
worker's own comments cite its files as the thing they must match. That ambiguity is resolved here.

Decided 2026-09-19 (commit `f6ad60a`). The runbook for the one that ships is `docs/PLUGIN-RELEASE.md`.

## Retired, and not to be used

- **`release/apple-plugin.rbxm`** is a stale historical build (last committed `8cea583`,
  2026-09-15; its `Paths.luau` already differs from `src/`). Do not install it, do not publish it.
  The shipped artifact is `apps/apple-plugin/release/apple-studio.rbxm`, built by
  `node apps/apple-plugin/scripts/build.mjs`.
- **Asset 132128477945417 ("Golem")** was built from this source and removed by Roblox. It answers
  404 on toolbox-service. Never publish to it.
- **CI and the release workflow no longer build this directory** (retargeted 2026-09-22):
  `.github/workflows/ci.yml` and `plugin-release.yml` build and verify `apps/apple-plugin`.
- **`src/Version.luau` is not the product's version.** The version customers report is
  `PLUGIN_VERSION` in `apps/apple-plugin/src/Bridge.luau`; the worker's
  `LATEST_PLUGIN_VERSION` follows the Creator Store build.

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

Neither is a bug. Both are load-bearing for the legacy design, and `run_code` is what the worker's
Luau tools were built on. That is precisely why this plugin cannot be the public one: the capability
and the prohibition are the same line of code. `apps/apple-plugin` refuses `run_code` by name, and
the worker withholds the dependent tools and says so — see `docs/PLUGIN-RELEASE.md`.

## Why it is still here, rather than deleted

Other suites read its files, and deleting it would turn all of them red. Measured 2026-09-22 with

```sh
grep -rnE "(join|resolve|URL)\([^)]*['\"]plugin['\"]|\.\./\.\./plugin/|apps/plugin/(src|tests|globalTypes)" \
  apps/*/tests packages/*/src packages/*/tests --include='*.mjs'
```

sixteen test files read it at runtime:

| Reader | What it reads |
| --- | --- |
| `apps/apple-plugin/tests/render-parity.test.mjs` | `tests/run.mjs`, `tests/render.spec.luau`, `tests/rasteriser.spec.luau`, `src/Paths.luau` — runs the original specs against the **shipped** rasteriser |
| `apps/apple-plugin/tests/worker-capability-contract.test.mjs` | this README, `src/Ops.luau` |
| `apps/site/tests/build-from-source-target.test.mjs` | this README, `src/Ops.luau` |
| `apps/site/tests/panel-quotes-match-shipped.test.mjs` | `src/init.server.luau` |
| `apps/worker/tests/companion-selection.test.mjs`, `luau-review.test.mjs`, `op-failure.test.mjs` | `src/Ops.luau` |
| `apps/worker/tests/tools-for-mode.test.mjs` | `src/Generation.luau`, `src/Ops.luau` |
| `apps/worker/tests/poll-residency.test.mjs`, `legacy-host.test.mjs` | `src/init.server.luau` |
| `apps/worker/tests/restore-fidelity.test.mjs` | `src/Serializer.luau` |
| `apps/worker/tests/sound-design.test.mjs` | `globalTypes.d.luau` — reference data that lives only here |
| `packages/evals/src/asset-content-gate.test.mjs` | `src/*.luau` by name |
| `packages/evals/src/asset-qc.test.mjs` | `src/Generation.luau` |
| `packages/evals/src/plugin-lifecycle.test.mjs` | `src/init.server.luau` |
| `packages/sdk/tests/luau.test.mjs` | `tests/harness.luau` |

And two places where it is the definition rather than the subject:

- `apps/worker/src/composition.ts` — `SKY_RGB`/`GROUND_RGB` cite the rasteriser in
  `src/Render.luau` (the constants themselves now come from `@golem/design/pixels`).
- `packages/evals/src/render-scene.mjs` — the Node twin of that rasteriser, which the eval suite
  grades stored scenes with.

`src/Render.luau` is also the **source** of `apps/apple-plugin/src/Render.luau`. The port is held to
this file by `apps/apple-plugin/tests/render-parity.test.mjs`, which runs `tests/render.spec.luau`
and `tests/rasteriser.spec.luau` — unmodified, from this directory — against the ported copy. So the
specs here are live evidence about the shipped plugin, not dead weight.

Retiring this directory means moving that reference material (the render specs, `run.mjs`'s
`buildChunk`, `harness.luau`, `globalTypes.d.luau`) somewhere the readers can still find it and
re-deciding what each reader above should assert. Until then it stays.

## If you are changing something

- A change to the **shipped** plugin goes in `apps/apple-plugin/src`.
- A change to `src/Render.luau` must keep the port in step, or `render-parity.test.mjs` goes red —
  which is the point. Change both, or neither.
- `node tests/run.mjs` runs the Luau specs here (250 on 2026-09-22). They still pass and are
  expected to.
