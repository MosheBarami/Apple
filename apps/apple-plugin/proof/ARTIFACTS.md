# Local proof artifacts (2026-09-18)

All files below are local and unpublished. Building them does not install the plugin
or run the provider.

| File | SHA-256 | Evidence state |
|---|---|---|
| `release/apple-studio-engine-proof.rbxl` | `58944ee805fa17689e94552b6ca469a21b5dc6ca4a27ef5db8f2f47bbc145532` | Local general Engine-proof build, 58,227 bytes. This exact SHA is not cited as a successful current restore observation. |
| `release/apple-generation-engine-proof.rbxl` | `7ad12cd49ab929adaa68dfaea96fcbb8f71722b5c87cc71e7f825e4c48b4be7a` | Separate one-shot generation proof, 58,342 bytes. A live Studio result has not been observed. |
| `release/apple-restore-engine-proof.rbxl` | `0c28fdad64979136ede955458e9ab92e4eb8a397ef2609d7173d3326b457c65c` | Frozen restore r3, 64,112 bytes. Actually run once in Studio: 5/7 checks, failed Undo/Cancel because restore used `Destroy()` on instances ChangeHistory needed to recover. Failed evidence only. |
| `release/apple-restore-engine-proof-r4.rbxl` | `cc20a9cbfdb1bc6158a981cb3d7771b95c231d24e3381eb36f4cd89641caf355` | Frozen restore r4, 64,378 bytes. **Actual one-shot Studio Engine pass: 7/7.** Undo restored the captured Engine readbacks exactly; forced-failure Cancel rolled back the live structure; default-place coverage was `supported-subset` with 6 protected Engine-owned objects and no skipped authored content. This proves the isolated restore proof only, not the whole plugin UI/Play flow, native widget behavior, visual quality, installability, or publication. |
| `release/apple-studio.rbxm` | `5a7a4086b89be19448f2439991d954272a7aefa189532ab4f7390a232780110d` | Current inspected local preview, 81,610 bytes, rebuilt after the edit/test lifecycle fence (`init.server.luau` SHA-256 `317372edf3a57ed71c89c2750588476d0ecfd1a8456ab763da4ca64c94431920`). The previously installed/native-observed preview remains `5adf58f824b6ac1efdb3525e6f77e6d9cffdb3101c6984720b023907644f3ca9`; this replacement has not been installed or run in Studio. Build inspection alone is not UI Play/native-widget/visual acceptance. |

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
