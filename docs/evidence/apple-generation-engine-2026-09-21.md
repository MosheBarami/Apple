# Apple GenerationService — real Studio observation, 2026-09-21

This closes the engine/provider half of the generation proof. It deliberately does not claim the pixel-level visual gate.

## Frozen artifact

- Place: `apps/apple-plugin/release/apple-generation-engine-proof.rbxl`
- SHA-256: `7ad12cd49ab929adaa68dfaea96fcbb8f71722b5c87cc71e7f825e4c48b4be7a`
- Mode: local unpublished place (`PlaceId == 0`), Roblox Studio Edit mode.
- Frozen prompt: `a small low-poly wooden shipping crate with simple bevels, clean proportions, and no text`
- The proof contains no HTTP, asset insertion, upload, or publication path.

## Real Engine result

Observed in `~/Library/Logs/Roblox/0.739.0.7390687_20260921T191118Z_Studio_23b72_last.log`.

Studio emitted `APPLE_GENERATION_ENGINE_PROOF {"ok":true,...}` and the marker-gated local runner repeated the returned report as `APPLE_AUTO_GENERATION_RESULT {"ok":true,...}`.

The visible live report records the capability probe as DynamicGeneration, method GenerateModelAsync, available true, and sessionScoped true. Its structural-QC object records verdict pass, verdictScope structural_only, detached true, visualJudgementRequired true, visualVerdict unreviewed, scripts 0, one anchored generated part in the visible prefix, and finite bounds with a largest part axis beginning at approximately 1.9178 studs.

The frozen proof source makes top-level `ok:true` contingent on these executable groups succeeding:

1. `generation_capability_probe`.
2. `one_generation_detached_qc_single_recording` — successful command result, detached structural QC, one generated Model, exactly one ChangeHistory recording start and one committed finish.
3. `generation_recording_undo_redo` — the generated Model is removed by Undo and restored by Redo.
4. `visual_review_handoff` — the redone Model exists and the report names the manual visual review still required.
5. `generation_command_teardown` — the command engine is destroyed and later work is refused.

Because the emitted top-level result is `ok:true`, none of those measured blocks threw.

## Why the visual verdict is still open

The temporary proof runner framed the generated Model with the Studio camera, then called the current Plugin-Security capture API without requesting upload, save, or share. `StudioCaptureService:CanCaptureScreenshot()` returned through a successful API call, and the same fresh Studio log emitted `APPLE_AUTO_CAPTURE_CAPABILITY {"canCapture":false,"callOk":true,...}`.

The runner intentionally did not call `RequestScreenshotPermissionAsync()` because that opens an interactive permission flow. This Chat On Steroids session independently receives `SCREEN_PERMISSION_REQUIRED` for macOS Screen Recording and `ACCESSIBILITY_PERMISSION_REQUIRED` for macOS Device Control/Accessibility. Those two facts prevent a truthful pixel inspection through the available desktop tools.

No screenshot capture, capture upload, generated-model upload, asset publication, or place publication was performed. The current Roblox API references checked for this boundary were:

- `https://create.roblox.com/docs/reference/engine/classes/StudioCaptureService`
- `https://create.roblox.com/docs/reference/engine/classes/StudioScreenshotCapture`
- `https://create.roblox.com/docs/reference/engine/enums/StudioCaptureScreenshotFormat`

The generated model therefore remains `visualVerdict: "unreviewed"` until a human or a future session with screenshot permission inspects the actual Studio viewport.

## Disposable automation

To run the proof without touching the owner's existing `Place1.rbxl`, this session built a small local-only plugin gated on the proof marker. The final capture-capability variant had SHA-256 `4b270050cfb6b2dfdca8fd6ce3aefb16e6ad718c069ddb43c14440018fc3a8ed`.

It was installed only in the local Studio Plugins directory, did nothing in unmarked places, and is removed after this evidence is recorded. It is not a product artifact and is not committed.
