# M4 decisions

## Stage 2 (handoff 4.2): the owner library removed

### Removed
- The thirteen tools: `browse_owner_library`, `import_owner_library`, `install_owner_system`, `recreate_owner_game`, `plan_game`,
  `build_game`, `query_owner_catalog`, `query_owner_assembly`, `read_owner_component`, `read_owner_media`,
  `list_owner_original_strings`, `read_owner_original_string`, `insert_owner_component`; from `tools.ts`, the shared phase and
  permission tables, `mcp.ts`, `router.ts`, `run-idle.ts`, the web tool and op vocabularies, the prompt text.
- The owner tiers of `find_library_model` (the local corpus, the cloud owner components) and the `{ gameId, path }` form of
  `insert_library_model`, `preview_library_models`, `dress_object` and `previewLibraryModels`. The Creator Store tiers and their
  fail-closed vetting are untouched.
- Worker modules: `owner-corpus.ts`, `owner-corpus-routes.ts` (the `/api/owner-corpus` routes), `owner-evidence.ts`,
  `local-owner-corpus.ts` (the gateway client), `game-plan.ts`, `library-assemble.ts`; and, dead once those went, `menu-binder.ts`
  and `private-audio.ts`. `placeImportedOwner`, `annotateModels`, `copyBlocker`, `plainName`, `plainLibraryThing`.
- The gateway address (`127.0.0.1:63747`), the `localOwnerGateway` run flag, the plugin's gateway fields and probe.
- Request-word routing to the owner library (`isOwnerRecreateRequest`, `isOwnerLibraryOnlyRequest`, `startsOwnerRecreate`,
  `staysInOwnerLibrary`, the `ownerRecreate` / `ownerLibraryOnly` / `keepOwnerOriginal` / `builtGame` run state, the `plannedGame` key).
- The wire ops `query_owner_local|exact|assembly|media|library`, `import_owner_local|library|component`; the plugin families
  `OwnerCorpus` and `LocalOwnerCorpus`; the `AppleLibraryGame` attribute exemptions in the audit and the scene flags.
- Workspace: `packages/owner-classify`, `packages/training`, `packages/langflow`, `apps/plugin`, `apps/benchmark`,
  `apps/experiences`. `pnpm-workspace.yaml` and the lockfile updated (`pnpm install --lockfile-only`, this clone only).
- Scripts that served the removed routes: `scripts/ingest-owner-corpus.mjs`, `scripts/prepare-owner-components.py` and its test.

### Kept, and why
- `buildApproved` (the pre-launch account gate) lived in `owner-corpus.ts`. It gates who may start a build, nothing to do with the
  library, so it moved to `src/account-gate.ts` with its env names (`OWNER_USER_IDS`, `RELEASE_LIBRARY_OWNER_ID`,
  `LIBRARY_APPROVED_USER_IDS`); `env.ts` says what they do now.
- The D1 table `owner_corpus_components` is still in the data export registry (`user-export.ts`): the table exists until it is dropped by
  hand, and an export registry must not claim less than exists. Deleting data waits 7 days after its replacement (handoff M1); it is
  the owner's call. The `CORPUS` binding is shared with other tables and stays.
- `packages/training` was not only training. Four live things stood on it and were moved, byte for byte except the former name
  `Apple` -> `StudPilot` in comments and identifiers:
  - the consent gate `consent-staging.mjs` (+ its test) -> `scripts/` (the privacy-claims tests and `tests/promises-match-the-product`
    assert the gate stays closed; their paths were updated);
  - `build-showcase-gallery.mjs` -> `infra/` (`infra/deploy-showcase.mjs` runs it);
  - the verified-module generators (`build-game-logic`, the four curricula, `tool-trajectory-verify`, `audit-dataset`, `build-dataset`,
    `workers-ai-embed`) -> `packages/corpus/src/generators/` (`scripts/build-verified-modules.mjs --check` and
    `scripts/build-module-embeddings.mjs` import them; the worker's verified-modules and embedding tests run them);
  - the recorded measurements `knowledge-reach.json`, `embedding-retrieval.json` -> `packages/corpus/data/measurements/`
    (`tests/need-index-search.test.mjs` pins its floor to them).
- `apps/plugin` was also the oracle for the shipped plugin's render port. The unmodified specs and the harness (`run.mjs`,
  `harness.luau`, `render.spec.luau`, `rasteriser.spec.luau`, `src/Paths.luau`) moved to
  `apps/studpilot-plugin/tests/legacy-oracle/` (`render-parity.test.mjs` and `packages/sdk/tests/luau.test.mjs` read them). The
  Roblox engine type dump `globalTypes.d.luau` moved to `apps/worker/tests/fixtures/` for `sound-design.test.mjs`.
- `terrain_edit` was added to the worker's `MUTATING_OPS` (`op-failure.ts`): the shipped plugin records it as a mutation, the worker
  list did not (the old test compared against the legacy plugin and hid it). A timed-out `terrain_edit` is therefore no longer
  re-sent. See the ledger.
- `scripts/owner-dashboard/` (owner-Mac dashboard, including the games page and the langflow page) is owner tooling outside the
  product: left as it is, except the langflow page no longer imports `packages/langflow/sync.mjs` (no examples now).
- `packages/evals/owner-bench/` and `apps/worker/src/owner-bench.ts` (the bench reset the admin routes call) are not in this
  stage's list and were left (AGENTS.md section 2 says the plan drops the old owner benchmark without naming a step).
- `packages/components/proof/compose-proof.mjs` and the `compose*.ts` recipe composers (`LibRef`, the `import` step) still name
  library pieces by game and path; since stage 1 they have no executor. They are stage 1 residue, not deleted here.

### For the owner
- The LaunchAgent `com.moshe.apple.owner-gateway` on the Mac is not touched. The owner can unload it (`launchctl bootout
  gui/$UID/com.moshe.apple.owner-gateway`); nothing in the product calls it any more. `packages/owner-corpus` stays on disk (git-ignored).
- The old `/api/owner-corpus/*` routes are gone with the next deploy; the table `owner_corpus_components` and any R2 objects under
  `owner-corpus/` are data: drop them by hand when the 7-day wait is over.

### What `git grep` shows now
`git grep -n -i -E "owner[_-]?(library|corpus|catalog|gateway|component)|63747|recreate_owner|install_owner_system|plan_game|build_game"`
outside `planning/`, `docs/` and `packages/asset-library/` (third-party catalogue data) leaves only:
`.gitignore` (the two ignore lines for the on-disk data); `AGENTS.md` and `CLAUDE.md` (they describe the removal); `user-export.ts`
(the table, above); `scripts/inspect-plugin-build.py` (a guard that the built plugin does NOT carry the gateway bytes);
`scripts/owner-dashboard/games.py` and `scripts/check-workspace-coverage.mjs` (owner tooling and a comment about the ignored folder);
`packages/components/proof/compose-proof.mjs` (above); `packages/evals/owner-bench/results/*.json` (a recorded measurement);
`packages/design`'s path skip lists (they skip the ignored folder); `infra/migrate-studpilot` (the rename tool names old words on
purpose); the guard `apps/worker/tests/no-owner-library.test.mjs`, which names what must not come back; and test comments that say
the subject was removed.
