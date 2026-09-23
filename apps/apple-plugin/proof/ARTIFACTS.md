# Local proof artifacts (2026-09-18)

All files below are local and unpublished. Building them does not install the plugin
or run the provider.

| File | SHA-256 | Evidence state |
|---|---|---|
| `release/apple-studio-engine-proof.rbxl` | `58944ee805fa17689e94552b6ca469a21b5dc6ca4a27ef5db8f2f47bbc145532` | Local general Engine-proof build, 58,227 bytes. This exact SHA is not cited as a successful current restore observation. |
| `release/apple-generation-engine-proof.rbxl` | `7ad12cd49ab929adaa68dfaea96fcbb8f71722b5c87cc71e7f825e4c48b4be7a` | **Actual one-shot Studio Engine/provider pass on 2026-09-21: `ok:true`.** DynamicGeneration was available; the real `GenerateModelAsync` path returned a detached Model that passed structural QC, committed in exactly one ChangeHistory recording, and survived Undo/Redo. The generated model remains structurally accepted but visually **unreviewed**: the marker-gated local capture probe called `StudioCaptureService:CanCaptureScreenshot()` successfully and got `false`, while this session also lacks macOS Screen Recording/Accessibility permission. No screenshot permission prompt, upload or publication was attempted. Evidence: `docs/evidence/apple-generation-engine-2026-09-21.md`. |
| `release/apple-restore-engine-proof.rbxl` | `0c28fdad64979136ede955458e9ab92e4eb8a397ef2609d7173d3326b457c65c` | Frozen restore r3, 64,112 bytes. Actually run once in Studio: 5/7 checks, failed Undo/Cancel because restore used `Destroy()` on instances ChangeHistory needed to recover. Failed evidence only. |
| `release/apple-restore-engine-proof-r4.rbxl` | `cc20a9cbfdb1bc6158a981cb3d7771b95c231d24e3381eb36f4cd89641caf355` | Frozen restore r4, 64,378 bytes. **Actual one-shot Studio Engine pass: 7/7.** Undo restored the captured Engine readbacks exactly; forced-failure Cancel rolled back the live structure; default-place coverage was `supported-subset` with 6 protected Engine-owned objects and no skipped authored content. This proves the isolated restore proof only, not the whole plugin UI/Play flow, native widget behavior, visual quality, installability, or publication. |
| `release/apple-restore-engine-proof-r5-current.rbxl` | `3c51c756e6a48600485c01a49ca08688cd646f43e45dddf4d9033b9f53e8cff7` | Fresh **unrun** restore proof for the present plugin source, 75,161 bytes. It bundles `Commands.luau` SHA-256 `00af28e7aeb9a612527df2897abf304ef0c1dada805d9894f02776c487d24189` and the same restore runner SHA used by r4 (`c225a9d2bc71adea26c426bff9667d75a3d5f50674716e6db238ce12c4cc216c`). The current Commands source has changed since measured r4, so r4's 7/7 pass is historical mechanism evidence, not proof of this exact current build. |
| `release/apple-studio.rbxm` | `fcf5684216ab90a50194dbf2fa2b896a8a32a455adf233eeba83f581051c600a` | Local preview rebuilt 2026-09-22 21:19 IDT by `node apps/apple-plugin/scripts/build.mjs`, 120,575 bytes, **PLUGIN_VERSION 1.1.0**, 6 scripts (StudioCapture included), each byte-identical to the working tree at that minute (`init.server.luau` `c23dbed97612…`, `Commands.luau` `57984c0bda28…`, `Bridge.luau` `fbe81ef4b677…`). `verify-artifact.py` exit 0; `inspect-plugin-build.py --expect-version 1.1.0` clean. The working tree was uncommitted, so no commit reproduces these bytes. **Not installed, not run in Studio, not published.** It is NOT the Creator Store build: asset 107230158271368 serves the 1.0.0 build uploaded 2026-09-19 (5 scripts, no StudioCapture), whose bytes are not recorded here. Superseded: `5a7a4086…` (81,610 B, 2026-09-18) and `96f7cfe1…` (120,179 B, 1.0.0, 2026-09-22 20:21). The previously installed/native-observed preview remains `5adf58f824b6ac1efdb3525e6f77e6d9cffdb3101c6984720b023907644f3ca9`. Build inspection alone is not UI Play/native-widget/visual acceptance. |

Build the current preview and generation proof:

```sh
node apps/apple-plugin/scripts/build.mjs
node apps/apple-plugin/scripts/build-generation-engine-proof.mjs
```

For the separate Studio proof, open `release/apple-generation-engine-proof.rbxl` in
Edit mode and run this once from the Command Bar:

```luau
require(game.ServerScriptService.AppleGenerationEngineProof).run()
```

The evidence line begins with `APPLE_GENERATION_ENGINE_PROOF`. Inspect the redone
model under `Workspace/AppleGenerationProofDestination` before accepting its visual
quality.

## Restore Engine proof history

The previous frozen restore artifact `ed42c17834f41981c44a179b682bec12407ae0689a41d51c2e0e4df86936d9f4`
was actually run in Studio and failed; its observed result is recorded at
`docs/evidence/apple-restore-engine-2026-09-18.json`. Do not cite it as restore evidence.

The replacement `82888a846057972dc4cffb40d3f014a56a1f88451f5d17c51f4486971043c50e`
was also run in Studio. It established that default-place checkpoint coverage is now a restorable
supported subset (`protected=6`, no skipped content) and passed five of seven checks, but the proof
still compared float32 `Transparency` readback to source-code decimal literals. Its observed result
is `docs/evidence/apple-restore-engine-r2-2026-09-18.json`; it is also failed evidence, not a restore
pass. The r3 proof captures the committed Engine readback before restore and requires exact equality
to that captured value after Undo/Cancel.

The r3 artifact `0c28fdad64979136ede955458e9ab92e4eb8a397ef2609d7173d3326b457c65c`
was run exactly once. It again passed five of seven checks, but the failures moved from float scalar
comparison to missing pre-restore instances after both Undo and Cancel. The observed report is
`docs/evidence/apple-restore-engine-r3-2026-09-18.json`; its run identity is
`docs/evidence/apple-restore-engine-r3-identity-2026-09-18.json`. The production restore path was
calling `Instance:Destroy()` inside the ChangeHistory recording. `Destroy()` locks `Parent`, so
ChangeHistory cannot put the same instance back. r4 changes only that restore removal to `Parent = nil`.

The frozen r4 artifact `cc20a9cbfdb1bc6158a981cb3d7771b95c231d24e3381eb36f4cd89641caf355`
was then run exactly once in the same disposable unpublished proof context. Its authoritative report
is `docs/evidence/apple-restore-engine-r4-2026-09-18.json` (SHA-256
`2aaf31328517451ebaa1c9d2aa55cd246ea27f6d5326655767a833c00e2b04a2`) and its run identity is
`docs/evidence/apple-restore-engine-r4-identity-2026-09-18.json`. The report has top-level `ok=true`,
`engineObserved=true`, and all seven checks passed. The restore commit opened/finished one recording;
Undo restored the captured Engine float readbacks exactly (`0.8999999761581421` and
`0.4000000059604645`), Redo returned to the checkpoint, the tampered source hash was refused before
recording, and the forced mid-restore failure was cancelled and rolled back with exact captured
readbacks (`0.800000011920929` and `0.6000000238418579`). Default-place snapshot coverage remained
honest `supported-subset` coverage with six protected Engine-owned objects and an empty skipped set.

Do not rerun or replace the measured r4 artifact. A later restore-source change needs a newly named
proof artifact and a fresh one-shot Engine observation. This pass is evidence for the bounded restore
path exercised by this disposable proof; it does not establish the remaining UI Play proof, native
widget behavior, whole-plugin visual acceptance, installation, Creator Store eligibility, or publication.

The older post-r4 candidate `release/apple-restore-engine-proof-r5-current.rbxl` is now stale because
`Commands.luau` changed again after it was built. Do not use r5 to claim the current source was measured.

The present-source candidate is `release/apple-restore-engine-proof-r6-current.rbxl`, built directly
from the same restore project into a new filename so the measured r4 artifact remained byte-for-byte
untouched. It bundles `Commands.luau` SHA-256
`f431cf341ec12ed04fe592a7fa585a7d7ff0361ac1d72b4b139b6be9979e4ec3` and
`AppleRestoreEngineProof.luau` SHA-256
`c225a9d2bc71adea26c426bff9667d75a3d5f50674716e6db238ce12c4cc216c`.
Artifact: 86,887 bytes, SHA-256
`94d11cb2dc9a066de8d62a3a5970cc465dae983444650aeafef72f0701715bcd`.
It has not been opened or executed in Studio. Its exact one-shot command is:

```luau
require(game.ServerScriptService.AppleRestoreEngineProof).run()
```

Current checkpoint coverage is substantially broader than r4-era coverage. `Decal`, `Texture`,
`SurfaceAppearance`, `Sound`/sound effects, image UI, prompts/click detectors, particles/beams/trails,
ordinary remotes, value objects, forces/velocities, constraints and the listed post effects are now
restorable. `Sky` under `Lighting` is preserved as protected coverage because Apple deliberately does
not rewrite its external content ids.

Coverage remains deliberately bounded. `MeshPart` is the highest-impact remaining class outside
`RESTORE_CLASSES`: a checkpoint that already contains one is `coverage="incomplete"`,
`restorable=false`, and names `MeshPart` in `skipped`. A `MeshPart` added *after* an eligible checkpoint
is delete-only and may be removed during restore without claiming Apple could reconstruct its mesh.
Other ordinary examples still outside `RESTORE_CLASSES` include `UnionOperation`, `SpecialMesh`,
`Tool`, `Humanoid`, `Animator`, `Animation`, `Motor6D`, `Weld`, `ViewportFrame`, clothing/accessory
classes, and authored `Sky` outside `Lighting`. These are safe refusals rather than silent data loss,
but they remain a product limitation for arbitrary real-world project checkpoints.

## 2026-09-22 — the local 1.1.0 build that passed real-Studio acceptance (not published)

`release/apple-studio.rbxm` (gitignored, rebuilt by `scripts/build.mjs`) sha256
`56ec11d327b07d452ca8df185455f49fb510e968183ecd186c2efba339be896d`, installed at
`~/Documents/Roblox/Plugins/AppleStudio.rbxm`. Two defects are fixed in it relative to the store's 1.0.0 and to
the first 1.1.0 candidate (`7e8d692e…`): Commands.luau compiled over Luau's 200-local limit at Studio's -O0
(F-018), and the plugin could not stop the playtest it started, because `RunService:IsRunMode()` is false
for a `Run()` simulation and `IsEdit()` stays true under it (F-020). Measured in real Studio on the
Apple-Acceptance place: run 5316f52b started and stopped two playtests, 0 failed ops. Publishing it to the
Creator Store (asset 107230158271368) is the owner's action.

Superseded the same evening by sha256 `1e04e884de46143248116b8396cbf35db313676d05da1e71151eb36b2fedaa99`, which also stops
ending a Studio session after 256 operations (F-034): acknowledged replay entries are evicted oldest-first.

Superseded 2026-09-23 03:07 IDT by sha256 `6db6b47a91621ae14b09843552572467bdffd4c398d00a6bc750b26dfaab63d0`
(installed locally; per D-STORE-2 no store publish until the final build, which is then appealed). It fixes
two things measured on the Coin Rush place (F-044): a checkpoint no longer refuses the TouchTransmitters
Roblox creates under touched parts (24 of them had blocked every protective checkpoint, so the playtest was
refused), and edit consent survives the test-state flicker right after Apple stops its own playtest (the panel
had read "inspect only" after run c71b89a9's successor). Tests: commands "a TouchTransmitter Roblox created…",
entry-runtime "a test-state flicker after Apple stopped…", each red with its fix removed; plugin 43/0.

Superseded 2026-09-23 ~03:25 IDT by sha256 `4e9d104523dc57b8b4ca2373b7d2acda9e9c4a8aec9fbe65095b45e52ab2136a`
(installed locally, loaded at the next Studio launch): decision D-PLUGIN-2 — a test the person starts pauses
Apple's edits instead of revoking them; the settle window of the previous build is no longer needed and was
removed. Plugin 43/0, the pause red-first.


Superseded 2026-09-23 04:27 IDT by sha256 `b979b6d34b20bafe1832c7f01bcaa15e562edea08c8070739b9ca84ac211b839`
(installed locally, loaded at the next Studio launch): a checkpoint captures the `ColorGradingEffect` Studio's
Voxel Lighting migration adds to a place it converts. Measured on a fresh baseplate at 04:20: the first run's
checkpoint was refused ("could not capture those objects exactly: ColorGradingEffect x1"), so a brand-new
customer started without an undo point (F-051). Commands "a ColorGradingEffect from Studio's lighting
migration…" red with the class removed; plugin 46/0.
