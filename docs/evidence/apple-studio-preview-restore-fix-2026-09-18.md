# Apple Studio local preview after restore r4 pass — 2026-09-18

This records the local full-plugin preview rebuilt after the restore lifecycle fix was measured in
the isolated r4 Engine proof. It is build/inspection evidence only. The preview was not installed,
published, uploaded, or executed in Studio during this work.

## Full preview identity

- Artifact: `apps/apple-plugin/release/apple-studio.rbxm`
- Artifact SHA-256: `5adf58f824b6ac1efdb3525e6f77e6d9cffdb3101c6984720b023907644f3ca9`
- Artifact size: 81,022 bytes
- Existing build script: `apps/apple-plugin/scripts/build.mjs`
- Build script SHA-256: `af12d0d6eaa57ffcb72a19cebf9f70838d6047f5f5ffc5fe24909b7802a8ee93`

Source identities included by the current project build:

- `Bridge.luau`: `b4f931a25d9744ab8e292168220d32bc4d606707f3dccf6d618eda3d813b38ed`
- `Commands.luau`: `fd5b80f0304035725ec6152d40924cae87483fd4328ecb9124230646d6b67a3d`
- `GenerationService.luau`: `02739a488da8ad19ea807caf2b198a5a304ee4fc7552dd2797b125253bddb1b7`
- `init.server.luau`: `5afa7f8c381cab60317a137cfe843b598c01223e824c211b557fbea36f448249`

The previous local preview SHA `11fef09488936852bd682d1b3d0305ac1308ec0bf0ee09a3d3d5358ca837a15e`
predated the measured restore lifecycle correction and is stale for current source.

## Build and inspection

`node apps/apple-plugin/scripts/build.mjs` completed successfully. Its Luau parse gate reported no
`SyntaxError`, Rojo built the full plugin model, and `inspect-plugin-build.py` reported the 81,022-byte
artifact clean with no credentials, private hosts, or developer paths.

`node --test --test-concurrency=1 apps/apple-plugin/tests/*.test.mjs` then passed 26/26 tests with
0 failures, including the focused ChangeHistory restore-removal contract and the measured r4 evidence
metadata guard.

`node --test --test-concurrency=1 apps/apple-plugin/tests/*.test.mjs` then passed 26/26 tests with
0 failures, including the focused ChangeHistory restore-removal contract and the measured r4 evidence
metadata guard.

The restore proof artifacts were not rebuilt by the full-plugin build and retained their frozen
identities:

- r3 failed evidence: `0c28fdad64979136ede955458e9ab92e4eb8a397ef2609d7173d3326b457c65c`
- r4 measured 7/7 pass: `cc20a9cbfdb1bc6158a981cb3d7771b95c231d24e3381eb36f4cd89641caf355`

## Claim boundary

The r4 Engine report establishes the bounded restore behavior exercised by the disposable restore
proof. This rebuilt `.rbxm` establishes that the current full local plugin artifact contains the same
`Commands.luau` restore fix and passes local build inspection. It does not prove the remaining UI Play
flow, native-widget behavior, visual acceptance, installation behavior, Creator Store eligibility, or
publication. Those require their own observations.
