# Model transforms keep pivots aligned — 2026-09-26

## Measured defect and fix

The live imported Tulip placement recorded in `apple-imported-flower-placement-2026-09-26.md`
moved three MeshParts while its model origin remained at the source kit's old location.
The existing `transform_instances` handler also wrote only part CFrames and sizes.

Apple Studio 1.4.3 now precomputes the same translation/rotation/scale for the selected
model's pivot and descendant model pivots without PrimaryParts. It preserves deliberately
offset pivots. Models with PrimaryParts follow their transformed part and receive no
WorldPivot write. Unselected models remain unchanged. All reads/calculations precede writes;
part and pivot writes share the existing single undo recording and failure cancellation.
This does not make arbitrary individual `set_properties_bulk` writes update ancestor pivots.
Use `transform_instances` on the model for spatial assembly transforms.

## Verification

- Regression failed before the fix: offset pivot expected X=16, observed X=12.
- Commands executable suite: 61 Luau specifications passed after the fix.
- Plugin plus version tests: 74 Node tests passed, zero skipped/failures.
- Full local binary build, parse, decompressed security scan and capability verification passed.
- Local preview 1.4.3: 184,200 bytes, SHA-256
  `0f53ec6151e0b16dab2836bf0ef8fe17fa9ddd0b1b34a140937a6137f2a894bd`.
- Copied to `/Users/moshe/Documents/Roblox/Plugins/AppleStudio.rbxm`;
  previous binary backed up in `/private/tmp/AppleStudio-before-1.4.3.rbxm`.

### Actual Studio engine observation

Disposable unpublished marked proof place; no provider call, network operation, third-party
asset insertion or publication by the proof. Built proof: 100,560 bytes, SHA-256
`4b8dde3b19077831b3730887ab44c9ddceaf9f90d49a4e1813664466436b9635`.

At 04:34:00 UTC the Output report's
`model_transform_pivots_rotation_scale_undo_redo` check returned `ok:true`, parts=2,
pivots=2, rotation=[20,40,60] degrees, scale=2, undoRedo=true, unselectedUnchanged=true.
The check compared all twelve CFrame components for part, offset root/nested pivots and
PrimaryPart pivot; real Undo restored prior geometry/pivots and Redo reapplied them.
Fixture cleanup returned clean=true and no recording remained open.

The first direct Command Bar run failed because the native Command Bar itself held an undo
recording. Scheduling the owned runner after 0.1s closed that recording; build instructions now
print this scheduler boundary. The second overall report remained `ok:false`: root snapshot
exceeded the existing 240,000-character source cap (the embedded Commands module has grown),
and the dependent restore observation was unavailable. These are **not** claimed passing.
The proof windows were closed without saving their disposable edits.

## Limits

This is a local engine proof and local plugin update, not a Creator Store release, live Apple
agent insertion, full game completion or commercial visual review. After reopening the saved isolated garden, the dock visibly showed 1.4.3 and Connected,
with access inspect-only. The worker session-info independently reported connected=true,
pluginVersion=1.4.3, idle and queuedOps=0. A fresh agent transform run remains separate.
F-059/F-064 and independent reviews remain open. CI for previous head 5403c97 passed;
this change requires its own CI result.
