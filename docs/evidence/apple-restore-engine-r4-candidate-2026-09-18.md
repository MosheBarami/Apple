# Apple restore r4 measured Engine pass — 2026-09-18

This file began as the local r4 candidate record. The exact frozen candidate was subsequently run
once in Roblox Studio and passed all seven restore-proof checks. The actual Engine report and run
identity are separate immutable evidence files listed below.

## Frozen candidate

- Artifact: `apps/apple-plugin/release/apple-restore-engine-proof-r4.rbxl`
- Artifact SHA-256: `cc20a9cbfdb1bc6158a981cb3d7771b95c231d24e3381eb36f4cd89641caf355`
- Artifact size: 64,378 bytes
- `Commands.luau` SHA-256: `fd5b80f0304035725ec6152d40924cae87483fd4328ecb9124230646d6b67a3d`
- `AppleRestoreEngineProof.luau` SHA-256: `c225a9d2bc71adea26c426bff9667d75a3d5f50674716e6db238ce12c4cc216c`
- Restore builder SHA-256: `3168ac4e13166274bda35c19c9680a078c8f79980d639fb82c734f91e01b1717`
- RunScript runner SHA-256: `2e2e6e4d0206954a7a3a2b055877f716b2d49a0930d5d1411377bba03dfcf2d1`

The previous r3 artifact remains frozen separately at
`0c28fdad64979136ede955458e9ab92e4eb8a397ef2609d7173d3326b457c65c`.
Its actual 5/7 Engine observation and source identity are preserved in
`apple-restore-engine-r3-2026-09-18.json`,
`apple-restore-engine-r3-identity-2026-09-18.json`, and
`apple-restore-engine-r3-investigation-2026-09-18.md`.

## Change under test

r4 changes only the restore removal lifecycle that r3 falsified. `clearRestoreRoot()` no longer calls
`Instance:Destroy()` on authored instances while a ChangeHistory recording is active. It sets
`child.Parent = nil` instead, which leaves the exact instance available for ChangeHistory Undo/Cancel.
All snapshot validation, protected-content checks, source hashes, structure/count assertions, and the
restore proof's exact state comparisons remain in place.

Focused red/pass evidence:

- Before the source fix, `restore removal stays undoable for ChangeHistory` failed because
  `clearRestoreRoot()` contained `child:Destroy()`.
- After the source fix, that focused test passes.

## Local validation

- `node --test --test-concurrency=1 apps/apple-plugin/tests/*.test.mjs`: 26 passed, 0 failed.
- Luau parse gate: 5 files checked, 0 `SyntaxError`.
- `inspect-plugin-build.py` on r4: clean; no credentials, private hosts, or developer paths.
- Independent Rojo rebuild to `/tmp/apple-restore-engine-proof-r4-verify.rbxl` produced the same
  SHA-256 `cc20a9cbfdb1bc6158a981cb3d7771b95c231d24e3381eb36f4cd89641caf355`.

## Actual Engine observation

- Report: `docs/evidence/apple-restore-engine-r4-2026-09-18.json`
- Report SHA-256: `2aaf31328517451ebaa1c9d2aa55cd246ea27f6d5326655767a833c00e2b04a2`
- Run identity: `docs/evidence/apple-restore-engine-r4-identity-2026-09-18.json`
- Run identity SHA-256: `2c05013801f9c69cee53e5d8bb7acb9563b4dd0ab45afb28b037783323b704eb`
- Run count: 1
- Published: false
- Report: `ok=true`, `engineObserved=true`, 7/7 checks passed

Measured restore details from that report:

- Default-place checkpoint: `coverage="supported-subset"`, `restorable=true`, `protectedCount=6`,
  `skipped=[]`.
- Commit path: exactly one restore recording start/finish; Undo and Redo names both identify
  `Apple restore restore-proof-commit`.
- Undo exact readback: part expected/observed `0.8999999761581421`; extra expected/observed
  `0.4000000059604645`.
- Source-integrity refusal: tampered script source was refused before a recording opened.
- Forced mid-restore failure: `cancelled=true`, `rolledBack=true`, one recording start/finish.
- Cancel exact readback: part expected/observed `0.800000011920929`; guard expected/observed
  `0.6000000238418579`.
- Checkpoint identity and explicit edit consent refusal passed; fixture cleanup passed.

The authoritative success criterion remains the report's own top-level `ok` field. Process exit 0 or
a completion-substring match alone is insufficient; r3 demonstrated that those can coexist with a
failed report.

## Claim boundary

This measured pass establishes the bounded checkpoint-restore behavior exercised by the isolated,
unpublished restore proof: snapshot coverage classification, protected identities, source integrity,
one-recording commit/Undo/Redo, failure Cancel rollback, identity/consent refusal, and cleanup. It does
not prove the remaining UI Play flow, plugin native-widget behavior, end-to-end visual acceptance,
installation/distribution, Creator Store approval, provider behavior, or publication. No such broader
claim should be derived from this restore proof.
