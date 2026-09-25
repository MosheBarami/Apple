# F-064: progress between duplicate streaks

Measured 2026-09-25, before a new live Studio gauntlet.

In the old worker, a run that built a requested part between two duplicate-call walls still spent its two per-run move-ons. On the third wall it ended with requested parts open. The new integration test drives the real `SessionDO` alarm loop with a scripted Studio result: after `Lighthouse`, `WoodenPier`, and `FishingBoat` are built between walls, it expects the run to reach `Tavern` instead of ending as stuck. A control makes unrelated Lighting changes between walls and expects the original bound to end the run.

- **Red before the fix:** A clean archive of `a56e7bf` with only the new integration test overlaid ran 30 tests: 29 passed, 1 failed. The failing assertion said a run that built a requested part between every streak was ended as stuck (`1 !== 0`).
- **Green after the fix:** A clean archive with only the four staged F-064 files ran 39 focused tests, all passed. TypeScript typecheck passed. The full clean-export worker suite reported 4,173 passed, 0 failed (4,175 total, 2 skipped).
- **Mechanism:** At a duplicate wall, the run counts open plan steps, game gaps, and requested parts. A decrease since the last move-on resets the allowance; no decrease leaves the allowance spent. The existing two-move-on limit still stops a run making no requested progress.
- **Isolation:** `apps/worker/src/do/session.ts` also had an unrelated uncommitted `openPlace` change. It was excluded from the staged patch and from commit `e1453fa`.
- **Live boundary:** This is a clean-export integration proof, not a Studio result. The known round-7 project reported `agentStatus: idle` and `queuedOps: 0` before deployment. F-064 remains open until a new Studio run reaches and completes the listed parts.

Deployment at 2026-09-25 01:23 UTC: GitHub Actions run `36081078529` passed all six jobs for
`e1453fa`. `infra/deploy-worker.mjs apple --build-sha e1453fa` was run from a clean archive;
its own verifier and an independent `/api/health` read both returned build `e1453fa`.
