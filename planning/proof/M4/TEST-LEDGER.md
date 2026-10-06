# M4 test ledger

Stage 2 (owner library). "Deleted with subject" = the test's only subject was removed on purpose. "Restated" = a live property kept its
guard, rewritten against what still exists (never weakened). Red-first = the new or restated guard was seen to fail on the broken input.

## Deleted with subject (whole files)
- worker: `game-plan`, `library-assemble`, `local-owner-corpus`, `owner-corpus`, `owner-evidence`, `owner-original-strings`,
  `owner-library` (browse/import/recreate/deps), `owner-library-namespace` (its two account-gate tests were restated, below),
  `menu-binder` (module dead once `connectMenus` went). `.test.mjs` each.
- plugin: `local-owner-corpus`, `owner-corpus`, `owner-library` (the removed op families).
- evals: `asset-content-gate` (reads the removed legacy plugin's Paths/Serializer/Ops; the shipped plugin's allowlists are covered by
  `property-allowlist`, `commands`, `content-preload`), `plugin-lifecycle` (the legacy init script), `install-manifest` (the
  benchmark game's installer).
- owner dashboard: `cc/langflow.test.mjs` (the removed flows package).

## Deleted with subject (single tests)
- `request-scope`: "a request to recreate an uploaded owner game...", "a game built only from owner library parts...".
- `build-audit`: three tests of the `AppleLibraryGame` exemption (and the helpers only they used).
- `scene-flags`: the tagged-original assertion inside "an unreadable tree is null..." (title shortened).
- `creator-store-live`: "an owner-library row that matched only in a path is held back...".
- `library-insert-failure`: "a local owner import accepts position/scale...", "placeImportedOwner leaves a multi-piece import...".
- `library-object`: "copyability is annotated per row...", "a models search through browse_owner_library...", "insert_library_model
  places an owner-library piece by { gameId, path }...".
- `run-loop-traps`: "a library asset brings what it needs, once per run..." (the `deps` import of owner assets).
- `run-idle`: "what a library import brought is named the way the game shows it..." and three `buildsHud` owner assertions.
- `studio-place-poll`: "a run that recreated an owner game keeps its original names...", "a game built by build_game may rename...".
- `design`: nine tests that read the removed benchmark game's client source as a corpus (`checks.test`: safe-area x2, Smooth, shipping
  client, tween gate, wait contract; `playbooks.test`: real code passes, Hud z-order, press step). The rules and their synthetic cases stay.
- `evals`: `roblox-antipatterns` "this repository's own DataService..." (the removed game's file); `asset-qc` section 6 (four tests parsing
  the legacy plugin's `Generation.luau`); `train-gate-overlap` section 1 (pins the removed `build-dataset` tail in `packages/training`).
- `studpilot-plugin/worker-capability-contract`: "the legacy plugin is marked as not-the-product" (the plugin is gone); the legacy half of
  "the shipped plugin refuses the pattern the removed Creator Store asset contained" removed, the shipped half kept.
- `owner-dashboard/cc/cc.test`: "the Langflow page lists only flow exports...".

## Restated
- `account-gate.test.mjs` (new, from `owner-library-namespace`): `buildApproved` for owner, other owner, approved, stranger, no owner
  configured; the release id is trimmed; every run-start path in the session DO consults the gate (source-text window kept). Red-first:
  the gate moved modules and the old test imported the deleted module (failed on import); the new file passes on `src/account-gate.ts`.
- `op-failure` "the worker MUTATING set matches the plugin table": was compared against the legacy `apps/plugin/src/Ops.luau`; now against
  the shipped `Commands.luau` MUTATING table. Red-first: against the shipped plugin the first assertion failed on `terrain_edit`
  (the plugin mutates it, the worker list did not) -> `terrain_edit` added to `MUTATING_OPS`; the reverse assertion failed on
  `generate_model` and `run_code` (worker-only) -> they are named in the test with the reason, any other extra still fails.
- `companion-selection`: the plugin-side handler list is read from the shipped `HANDLERS` + `DEFERRED_MUTATING` (+ `restore`,
  `undo_waypoint`, dispatched by name) instead of the legacy `Ops.luau`.
- `tools-for-mode` "generate_model stays Studio-backed...": asserted against the shipped plugin (`Commands.luau`, `GenerationService.luau`).
- `plugin-capabilities`: owner ops dropped from the fixtures and the opt-in list; "native insertion capability alternatives..." restated on
  a made-up tool (the mechanism stays, its only user was removed). Red-first: with the owner ops gone from the opt-in set the first
  version (unreported ops) kept the tool; fixed by using opt-in ops for the alternatives.
- `library-object`: the candidate, preview, placing and size tests run on Creator Store candidates (`{ id }`); the Creator Store insert
  gate is replaced by one `insert_asset` op so staging/placing is what is measured (the gate itself stays covered by
  `library-insert-failure`). `candidateOf` refuses `{ gameId, path }`.
- `run-loop-traps` "a stopped run tells a young creator what they got, and names no tool": same property, built from `create_instances`.
- `run-idle` "a built game with nothing on screen...": the game is "made" edit_script + create_instances + build_object (the `builtGame`
  flag is gone); `buildsHud` test keeps the UI-tool and ScreenGui cases.
- `admin-studio-ops`, `legacy-host`, `benchmark-replay`, `studio-op-parity`, `request-scope`: owner ops/paths dropped from fixtures and lists.
- `studpilot-plugin`: `entry-runtime` capture-fence mutant now replaces `op.op == "capture_studio_viewport"` with `false` (the owner
  ops left the read fence; the capture still is fenced by the pairing alone); `surface`, `protocol-coverage`: comments.
- `render-parity`, `packages/sdk/tests/luau`: read the moved oracle in `apps/studpilot-plugin/tests/legacy-oracle/`.
- `sound-design`: reads the moved `globalTypes.d.luau`. `need-index-search`: reads the moved measurement file.
- `apps/site`: `build-from-source-target` premise now asserts the legacy plugin is gone and the page names the only plugin;
  `panel-quotes-match-shipped` no longer reads the legacy plugin (the stale strings must still be absent from the shipped artifact);
  `privacy-claims`: the gate's path.
- `tests/promises-match-the-product`: the gate's path.

## New guard
- `no-owner-library.test.mjs` (six tests): none of the thirteen tools is registered, offered, governed or MCP-listed; the ops are not in
  the wire type nor in `Commands.luau`, the two plugin families are gone; the modules are gone and the gateway address/name appear in no
  production source; `find_library_model` has no owner tier or parameter; no request-word rule or run state for the owner library.
  Red-first: appending the gateway address to a worker source file made the guard fail; reverted.
