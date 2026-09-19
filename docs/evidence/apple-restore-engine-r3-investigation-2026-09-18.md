# Apple restore r3 investigation — 2026-09-18

This note freezes the failed r3 Engine observation before any restore implementation change.
It is evidence of a failure, not a restore pass.

## Frozen r3 identity

- Artifact: `apps/apple-plugin/release/apple-restore-engine-proof.rbxl`
- Artifact SHA-256: `0c28fdad64979136ede955458e9ab92e4eb8a397ef2609d7173d3326b457c65c`
- `Commands.luau` SHA-256: `bb7550b0227901634bfcfe5c98a5de63dea591c9bb9422f39c31b24df046ea77`
- `AppleRestoreEngineProof.luau` SHA-256: `c225a9d2bc71adea26c426bff9667d75a3d5f50674716e6db238ce12c4cc216c`
- RunScript runner SHA-256: `2e2e6e4d0206954a7a3a2b055877f716b2d49a0930d5d1411377bba03dfcf2d1`
- Engine report: `docs/evidence/apple-restore-engine-r3-2026-09-18.json`
- Engine report SHA-256: `e7f9c35109c944867ff5c31b5806453ef6ccbd287f04a49d8f5fb4cb60862863`
- Run identity: `docs/evidence/apple-restore-engine-r3-identity-2026-09-18.json`
- Run identity SHA-256: `9e01438487fe0bf072599c7e51b0807afe6c9d3b657671dcd3e5144772eb4f2d`

The actual single r3 Studio run completed 5/7 checks. The two failures were structural:

- Undo: `commit live part exists (expected=true observed=false)` at proof line 332.
- Cancel: `rollback live part exists (expected=true observed=false)` at proof line 419.

The failures are not float-comparison failures. The proof captured the pre-restore Engine values and
then could not find the pre-restore instances after ChangeHistory Undo/Cancel.

## Cause established from source and Engine behavior

The r3 production restore path removes every recreatable current child in `clearRestoreRoot()` by
calling `child:Destroy()` while the restore ChangeHistory recording is open. `Instance:Destroy()`
locks the instance Parent to `nil`, so ChangeHistory cannot reparent that same instance during Undo
or `FinishRecording(..., Cancel)`.

Roblox staff confirmed this is intended behavior and that undoable plugin editing should remove an
instance by setting `Parent = nil` instead of calling `Destroy()`:

- https://devforum.roblox.com/t/changehistoryservice-cannot-restore-instances-removed-with-instancedestroy/3980341
- https://devforum.roblox.com/t/recordings-in-change-history-service/2512500

This matches both r3 failures: the live part is removed by `Destroy()` during restore and is therefore
not available for ChangeHistory to restore on either Undo or Cancel.

## Runner result interpretation

`processExitCode: 0` and the run-wrapper `completed` field are not restore success criteria. The
authoritative r3 proof report has top-level `ok: false`. Promotion requires the exact frozen candidate
report itself to contain top-level `ok: true`; process exit or a completion-substring observation is
insufficient.
