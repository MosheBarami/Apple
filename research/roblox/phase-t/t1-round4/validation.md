# Round 4 preparation — 2026-10-04

Product source: `research-feed` and `fix-r3` at `2ffd22db`.

- Worker: 5,413 tests, 5,407 passed, 6 skipped, 0 failed.
- Root: 630 tests, 614 passed, 16 skipped, 0 failed.
- Security: all 56 passed, including A5.
- `pnpm typecheck`: exit 0 across the workspace.
- `check-no-golem`: 0 violations.
- Fence falsification: removing the world-step fence failed the new real SessionDO assertion; source restored, 20 focused tests passed.
- Existing selected-asset policy fixture now explicitly refuses absent Studio reads; all 13 policy tests passed.
- Studio was closed on takeover. Opened a fresh local Place1, paired Owner benchmark (E2E), enabled the authorized edit connection. MCP confirmed Edit mode and only Camera, Baseplate, Terrain and SpawnLocation in Workspace.
- Clean baseline: `e70a1555-ab8c-4208-a306-3b5444754352`, 10 instances, 0 scripts.

Deployment verified: health serves `2ffd22db-dirty`, version `f037aa63-1505-4a7c-a69f-3dceb9d9b004`. The deploy clone has untracked earlier benchmark records; tracked source is the tested commit. No plugin source changed or Creator Store publication occurred.

Round uses GLM 5.3 Flash, the original one-line t1 request and a 2,000-credit allowance. The runner's existing cap is between items; a local WebSocket wrapper additionally stops the active build at 1,800 measured credits, reserving room for its final call and evaluation.

Local passing checks and deployment are not game acceptance.
