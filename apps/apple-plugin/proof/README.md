# Disposable Studio engine proof

Build the isolated local place:

```sh
node apps/apple-plugin/scripts/build-studio-engine-proof.mjs
```

Open `apps/apple-plugin/release/apple-studio-engine-proof.rbxl` in Roblox Studio,
stay in **Edit** mode, then run this one-line Command Bar expression:

```luau
require(game.ServerScriptService.AppleStudioEngineProof).run()
```

The runner refuses published places (`PlaceId ~= 0`) and places without its marker.
It uses no HTTP, asset insertion, upload, publication, provider or account operation.
The Output line begins with `APPLE_STUDIO_ENGINE_PROOF` and contains the measured
JSON result. A built place or a green local mock is not an observed Studio pass.

This original proof intentionally contains no provider work. Even a green run does
not prove `restore` or the live generation path. Its artifact remains separate and
unchanged.

Build the one-shot GenerationService proof separately:

```sh
node apps/apple-plugin/scripts/build-generation-engine-proof.mjs
```

Open `apps/apple-plugin/release/apple-generation-engine-proof.rbxl` in Studio, stay
in **Edit** mode, then run exactly once:

```luau
require(game.ServerScriptService.AppleGenerationEngineProof).run()
```

It refuses published or unmarked places and contains no HTTP, AssetService, upload
or publication path. The run requests one low-poly proof model, verifies detached
structural QC and one ChangeHistory commit, exercises Undo/Redo, then leaves the
redone model in `Workspace/AppleGenerationProofDestination` for visual review. A
built `.rbxl` alone is not live engine evidence.
