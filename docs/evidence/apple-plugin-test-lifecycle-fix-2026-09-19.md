# Apple independent plugin edit/test lifecycle fix — 2026-09-19

This is local source, mock-runtime, and build evidence only. The replacement preview was not installed,
opened in Studio, uploaded, published, or deployed during this work. Native Test → Stop behavior still
requires a separate observation after installation by the main operator.

## Trigger and boundary

The previously installed preview was SHA-256
`5adf58f824b6ac1efdb3525e6f77e6d9cffdb3101c6984720b023907644f3ca9` (81,022 bytes). The reported
native symptom was that edit access remained allowed after starting a Studio Test and then stopping it.
The old entry source watched `RunService.RunState` and trusted `RunService:IsEdit()` before allowing a
write. A focused regression reproduced the relevant disagreement: `StudioTestService.EditModeActive`
was `false` while the mocked `RunService:IsEdit()` remained `true`, and the old source still passed
`allowEdits=true` into command execution.

The red-first failure was:

`execute fence must reject after StudioTestService leaves edit mode even before a signal`

Official API reference reviewed for the property:
https://create.roblox.com/docs/reference/engine/classes/StudioTestService
(`StudioTestService.EditModeActive: boolean`, Plugin Security).

## Source change

Only the independent plugin lifecycle entry was changed in production source:
`apps/apple-plugin/src/init.server.luau`.

- Previous source SHA-256: `5afa7f8c381cab60317a137cfe843b598c01223e824c211b557fbea36f448249`
- Current source SHA-256: `317372edf3a57ed71c89c2750588476d0ecfd1a8456ab763da4ca64c94431920`

When `StudioTestService` is present, `EditModeActive` is now part of the live edit-state gate. A present
service whose property cannot be read as `true` fails closed. Its `EditModeActive` property signal and
the existing `RunState` signal both clear `allowEdits` and `confirmingEdits` when Edit mode is left.
Every write-consent evaluation also checks the current edit state directly before execution, so a
missed or delayed signal cannot preserve write permission. Returning to Edit mode does not restore the
permission; the user must perform the two-step consent again.

If `StudioTestService` is genuinely unavailable, the source keeps the existing `RunService:IsEdit()`
compatibility fallback. That fallback is covered only for its explicit RunState behavior and is not
treated as proof that a native Play/Test transition was observed.

## Focused regression coverage

`apps/apple-plugin/tests/entry-runtime.test.mjs` now uses property-specific mock signals instead of a
generic manually-fired `Changed` signal. Its current SHA-256 is
`09ba03e7307b1568ae8d68f11da0f601f82f9cad3c41d9e3fdd956166c34a368`.

The runtime test covers:

- `EditModeActive=false` while `RunService:IsEdit()==true`, including direct execution before any signal.
- leaving Edit mode between the first and second consent clicks, which retires the confirmation.
- returning to Edit mode without restoring prior write permission.
- a present StudioTestService with an unknown edit-state value failing closed before bridge creation.
- the explicit missing-service RunService fallback, including RunState clearing and no automatic regrant.
- disconnect and plugin teardown, including disconnection of the property-state signal.

Validation run after the source change:

- `node --test apps/apple-plugin/tests/entry-runtime.test.mjs apps/apple-plugin/tests/surface.test.mjs`:
  5 passed, 0 failed.
- `node --test --test-concurrency=1 apps/apple-plugin/tests/*.test.mjs`:
  26 passed, 0 failed.

These are mocked Roblox API tests. They establish the source contract and regression behavior, not a
native Studio transition.

## Replacement local preview

The unchanged build script SHA-256 is
`af12d0d6eaa57ffcb72a19cebf9f70838d6047f5f5ffc5fe24909b7802a8ee93`.
`node apps/apple-plugin/scripts/build.mjs` completed successfully: the Luau parse gate found no syntax
error, Rojo built the plugin, and `inspect-plugin-build.py` reported the artifact clean with no
credentials, private hosts, or developer paths.

- Previous preview SHA-256: `5adf58f824b6ac1efdb3525e6f77e6d9cffdb3101c6984720b023907644f3ca9`
  (81,022 bytes).
- Replacement local preview SHA-256: `5a7a4086b89be19448f2439991d954272a7aefa189532ab4f7390a232780110d`
  (81,610 bytes).

The replacement preview is local only. No statement in this record should be read as an installed
native pass; the concrete remaining check is to install this exact SHA, pair it, enable edits with the
two-step consent, start Test, confirm access drops to inspect-only while Test is active, Stop, and
confirm permission stays off until explicitly granted again.

## Native acceptance status after guarded install attempt

**OPEN / BLOCKED.** Main attempted a guarded local installation of the exact replacement preview
`5a7a4086b89be19448f2439991d954272a7aefa189532ab4f7390a232780110d`, intending to preserve the
previous installation, but the tool safety gate blocked the action before execution. The installed
preview therefore remains the older
`5adf58f824b6ac1efdb3525e6f77e6d9cffdb3101c6984720b023907644f3ca9` build, and the native
Test → Stop lifecycle bug remains unverified as fixed. No retry, repackaging, reload, alternate install
route, or other bypass was attempted from this worker. The separate R2 Lumen native build/install path
also remains blocked from the earlier attempt; no bypass was attempted here. Local source/tests/build
evidence above remains valid, but it must not be upgraded to native acceptance evidence.
