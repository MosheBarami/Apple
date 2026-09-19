# edit_script saved project file bridge — 2026-09-19

Scope: local worker source and focused tests only. No deployment, provider call, remote SQL, credential use, upload, or Studio execution was performed.

## Contract exercised

- `edit_script` accepts exactly one of `source`, non-empty `edits`, or `source_file`.
- `source_file` is `{ path, version }`, project-scoped through `kvWorkspace(env.KV, projectId)`.
- The path must pass the workspace path validator and end in `.lua` or `.luau`.
- Version is a positive integer and is read with `readVersion(path, version)` exactly; no current/latest fallback exists.
- Persisted rows above the workspace 48 KiB limit are refused before Studio.
- The fetched body then follows the existing Studio target read, base-hash conflict check, syntax check, typed `edit_script` mutation, diff, and review path.
- Saved-file Luau is passed through the existing asset-ingress refusal before a Studio mutation.
- Success returns bounded source provenance (`path`, `version`, `project_workspace_version`) and does not echo the source body.

## Red-first observation

Command:

`cd apps/worker && node --test tests/edit-script-source-file.test.mjs`

Before production changes: 6 tests ran, 1 passed and 5 failed. `source_file` calls were rejected by the old "pass either source or edits" branch, and the ambiguous inline `source` + `edits` call was silently accepted. This established that the new assertions were observing missing behavior rather than an already-green path.

## Green validation

Focused bridge suite:

`cd apps/worker && node --test tests/edit-script-source-file.test.mjs`

Result: **8 passed, 0 failed**. Cases cover exact archived version selection, creation of a missing Studio script, inline source/edits compatibility, ambiguous inputs, invalid path/version, oversized legacy persisted rows, project isolation, missing/deleted/renamed paths, base-hash conflict, syntax refusal, asset-loader refusal, and no source echo in the result.

Existing affected behavior:

`cd apps/worker && node --test tests/luau-review.test.mjs tests/plugin-capabilities.test.mjs tests/tool-contract.test.mjs`

Result: **73 passed, 0 failed**.

Whitespace/error check:

`git diff --check -- apps/worker/src/tools.ts apps/worker/tests/edit-script-source-file.test.mjs`

Result: exit 0.

Worker typecheck reached one existing peer-owned error and reported no error in `tools.ts`:

`src/do/session.ts(790,11): error TS6133: 'terminalMetadataFor' is declared but its value is never read.`

