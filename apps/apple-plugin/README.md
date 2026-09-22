# Apple Studio — the Studio plugin this product ships

**This is the product.** Decided 2026-09-19: `apps/plugin` is the legacy build and is
not submitted to anything — `apps/plugin/README.md` says why it stays in the tree, and
`docs/PLUGIN-RELEASE.md` is the runbook for getting this one onto the Creator Store.

New source and package, separate from `apps/plugin` and the removed Creator Store
asset. This is not a re-upload or renamed binary. Nothing here changes the existing
installation or its public asset identifier.

**On the Creator Store as "Apple Studio", asset 107230158271368.** Published 2026-09-19 as
version 1.0.0 (5 scripts, no `StudioCapture`), removed by moderation the same day, and distributed
again as of 2026-09-22 — `STUDIO_PLUGIN_STORE_LIVE` in `packages/shared` is `true`. This source is
**1.1.0** (`PLUGIN_VERSION` in `src/Bridge.luau`): it adds native viewport capture, Run-mode control
and model inspection that the store build does not have, and it is **not published**. Customers who
install from the store today get 1.0.0. The worker's `LATEST_PLUGIN_VERSION` stays `1.0.0` until the
owner publishes this build. Nothing in this repository uploads to Roblox; publishing is a human step
in Studio and is not automated anywhere — see the runbook.

## Safety contract

- Opens disconnected; credentials are held in memory only.
- Pairing explicitly discloses inspection of place objects and scripts, the current
  selection, and Studio Output messages while the connection is live.
- Edits default off. The user must enable them for the current connection.
- Entering Run mode or disconnecting clears edit permission.
- Typed commands only, bounded work, explicit failure for unsupported operations.
- No asset loaders, hidden code, remote `require`, plugin-context code execution,
  publishing, asset uploads, or automatic test starts.
- Bundled source is readable; no binary-only dependencies.

The current typed surface implements place/tree/script reads, pushed selection and
Output events, create/set/delete/move/transform/clone/group/ungroup/rename,
lock/visibility, selection/camera controls, source-hash-protected script edits,
bounded `root = "game"` snapshots, and explicit undo waypoints. Every operation in
the shared `StudioOp` union has either a handler or a named refusal; none silently
falls through as an unknown backend command.

`run_code`, remote asset insertion and automatic Run mode remain fail-closed.
**Rendering does not.** `src/Render.luau` is the bounded software rasteriser, ported
from `apps/plugin/src/Render.luau` — Studio exposes no viewport readback to a plugin
(ThumbnailGenerator is not a valid service and CaptureService's callback never fires in
edit mode, both measured against live Studio), so drawing the scene ourselves is the
only way the agent can look at its own work. It performs no HTTP, loads no asset,
evaluates no received text and writes nothing to the place: it reads geometry and
returns base64 RGB. It requires no edit consent and opens no undo recording, and the
target it renders is resolved by the same allowlisted resolver every other read uses.

The port is held to its original by `tests/render-parity.test.mjs`, which runs
`apps/plugin/tests/render.spec.luau` and `rasteriser.spec.luau` — unmodified — against
this copy, and proves it can go red by mutating the measured framing distance. That
matters because the worker's critic, `apps/worker/src/composition.ts` and
`packages/evals/src/render-scene.mjs` were all calibrated against those exact pixels.

If the module is ever dropped from the bundle, the capability report says `render_view`
is unsupported, the worker withholds `render_view`, `compose_thumbnail` and
`inspect_visually`, and the run ends "Rendered appearance was not verified". A check
that did not run must never read as a check that passed.

Bounded checkpoint snapshot restore is implemented behind the
same edit-consent and checkpoint-integrity fences as the command surface; the exact
restore path was measured in the disposable r4 Studio proof described below. The local preview now has a current
`GenerationService:GenerateModelAsync` path for `generate_model`. It accepts the
documented text prompt, `MaxTriangles`, texture generation, and `Body1`/`Car5`
predefined schemas exposed by the existing wire. Image conditioning, `Size`, custom
schema definitions and provider options are refused instead of being guessed.

Generation runs only with this connection's live edit consent. The engine result is
detached until bounded structural QC has checked its type, scripts, part/descendant
counts, positive finite dimensions, bounds and the requested triangle cap. The
current public `MeshPart` API has no readable triangle-count property, so the result
states whether triangles were actually measured and never reports an unknown count
as zero. Only a passing detached result is placed, in one ChangeHistory recording.
Timeout, disconnect, Run mode and teardown retire the request; a late result is
detached and destroyed. Structural QC deliberately reports that visual judgement is
still required. No procedural substitute, asset upload or publication path exists.

The transport retains existing internal HTTP header names so the current Apple
backend can understand it. This is protocol compatibility, not dependency on the
old plugin implementation. Do not rename live backend bindings or wire literals.

## Local development

With the repository's existing Luau and Rojo installations:

```sh
node --test apps/apple-plugin/tests/*.test.mjs   # 41 on 2026-09-22
node apps/apple-plugin/scripts/syntax-check.mjs  # the parse gate; also `pnpm -r typecheck`
node apps/apple-plugin/scripts/build.mjs
node apps/apple-plugin/scripts/build-studio-engine-proof.mjs
node apps/apple-plugin/scripts/build-generation-engine-proof.mjs
```

Tests execute source under mocked Roblox APIs. They do not prove live Studio
permissions, undo behavior or Creator Store eligibility. `build.mjs` ends by reading the
BUILT artifact rather than the source (`scripts/verify-artifact.py`): the legacy build
once shipped `VERSION = "0.1.0"` with zero occurrences of `GenerateModelAsync` while its
source had generation, and every test was green because every test read the `.luau`.

The binary `build.mjs` writes is a local build of THIS source, not the one the store serves.
Do not hand it to customers as "the plugin": they install from the Creator Store. CI builds and
verifies the same artifact on every PR (`.github/workflows/ci.yml`, artifact
`apple-studio-pr-unverified`), and `plugin-release.yml` produces the release candidate.

The disposable proof build creates
`release/apple-studio-engine-proof.rbxl`. Open that local unpublished place in
Studio **Edit** mode and run this exact Command Bar expression:

```luau
require(game.ServerScriptService.AppleStudioEngineProof).run()
```

The proof refuses a published or unmarked place and performs no HTTP, generation,
asset insertion, upload, or publication. Its `APPLE_STUDIO_ENGINE_PROOF` JSON line
measures ChangeHistory cancel rollback, command commit→Undo→Redo, edit consent and
disconnect gating, source hash conflict preservation, the full-place snapshot,
restore/generation refusal, teardown, and fixture cleanup. A successful local build
is not an observed Studio pass. Restore now has separate measured Engine evidence:
the frozen r4 restore proof passed 7/7 in one unpublished Studio run, including exact
Undo readback, forced-failure Cancel rollback, source-integrity refusal, checkpoint
identity/consent gates, and supported-subset coverage with six protected Engine-owned
objects and no skipped authored content. That result establishes this bounded restore
path only; it does not establish the remaining UI Play flow, native-widget behavior,
whole-plugin visual acceptance, installation/distribution, Creator Store approval, or
publication.

The earlier asset was removed for “Misusing Roblox Systems”; its exact triggering
code has not been identified. The new design avoids the remote-execution/loading
patterns prohibited by the current Creator Store requirements, but this alone
does not establish Roblox approval or resolve the original moderation decision.

Official references reviewed on 2026-09-18:

- https://create.roblox.com/docs/production/creator-store#asset-requirements
- https://create.roblox.com/docs/reference/engine/classes/Plugin
- https://create.roblox.com/docs/reference/engine/classes/RunService
- https://create.roblox.com/docs/reference/engine/classes/GenerationService/GenerateModelAsync
- https://create.roblox.com/docs/reference/engine/classes/ChangeHistoryService

The generation proof is a separate unpublished place:
`release/apple-generation-engine-proof.rbxl`. Open it in Studio **Edit** mode and run
this exact Command Bar expression once:

```luau
require(game.ServerScriptService.AppleGenerationEngineProof).run()
```

Its `APPLE_GENERATION_ENGINE_PROOF` JSON line records the capability probe, detached
QC, exactly one ChangeHistory start/commit, Undo, Redo and the visual-review handoff.
The redone model remains under `Workspace/AppleGenerationProofDestination` for the
owner to inspect. Building the place does not call GenerationService, and a local
build is not an observed live pass.
