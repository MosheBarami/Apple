# M4 summary: stages 1 and 2 (measured 2026-10-06)

Merged as #38 (ded593ed), deployed: https://studpilot.app/api/health serves ded593ed.
Details: `DECISIONS.md` (what was removed, what moved, why) and `TEST-LEDGER.md` (each deleted or restated test).

## Done
- Stage 1: vision (`look`, the blind critique, the client judge, the `vision` model role) and the whole-game
  path (`compose_game`, `build_scene`, the world pass) removed.
- Stage 2: the 13 owner-library tools, the owner tiers of `find_library_model`, the gateway to the owner's Mac
  (127.0.0.1:63747), the plugin `OwnerCorpus` and `LocalOwnerCorpus` ops, and six workspace packages
  (owner-classify, training, langflow, apps/plugin, apps/benchmark, apps/experiences) removed.
- Guards: `no-vision`, `no-whole-game-path` and `no-owner-library` tests in apps/worker (each shown failing first).

## `git grep` after the merge (apps/worker/src, packages/shared/src, apps/studpilot-plugin/src)
- Owner-library pattern: 2 hits, both a comment in `user-export.ts` that records the removal and that rows of
  `owner_corpus_components` may still be in D1 (owner drops them 7 days after verification).
- Vision pattern: 2 hits. `RETIRED_MODEL_KEYS = ['vision']` (refuses the old key) and a provider-capability
  message in `providers/registry.ts`. Neither offers vision.

## Measured in CI on the merge
All checks green except CodeQL, which re-surfaced pre-existing alerts on unchanged lines (planning/proof/LATER.md).
Root tests had hung on Linux: a spawn of `check-escape-hatches` printed its verdict and never exited (strace on two
debug runs). The test now retries a timed-out spawn (3 x 100 s, same budget), and CI's root tests have a 240 s per-test ceiling.

## Moved to the rebuild (planning/REBUILD-PLAN.md)
- Stage 3 (instructions at 10,000 characters or fewer) and stage 4 (25 tools or fewer per run) apply to the new
  Flue agent: today it has 6 tools and an instruction of about 450 characters.
- Acceptance item 5 (a 5-request smoke test against the M3 baseline) waits for the M3 baseline, which waits for
  Studio to be paired (the Mac's screen was locked on 2026-10-06).

Not done: the owner can unload the LaunchAgent `com.moshe.apple.owner-gateway` on their Mac.
