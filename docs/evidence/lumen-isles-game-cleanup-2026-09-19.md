# Lumen Isles Game cleanup — local source and Luau harness evidence

Date: 2026-09-19

## Scope

This note records the focused `Game.server.luau` cleanup for a player who leaves while
`Profile.load` is still in flight. It covers the checked-in source plus the standalone Luau/mock
harness in `apps/experiences/lumen-isles/tests/gameplay.test.mjs`.

It does not establish Roblox engine scheduling, publication behavior, live Studio behavior, or
production DataStore durability.

## Counterexample

`Profile.load` may yield and later return `nil` after creating its unsaveable cache entry. If the
player left during that yield, the old Game branch released only when both `ok` and `data` were
truthy. A normal `nil` return therefore skipped cleanup and left the late unsaveable Profile cache
entry resident after removal.

The focused regression models that sequence by yielding the load, removing the player, then
resuming a normal `nil` result.

## Source change

The stale/removed post-load branch in `apps/experiences/lumen-isles/Game.server.luau` now releases
after every normal `Profile.load` return:

```luau
if player.Parent ~= Players or profiles[player] ~= entry then
    if ok then Profile.release(player) end
    return
end
```

`Profile.release` is safe for the failed-load entry because that entry is marked unsaveable; the
release clears the cache and refuses a persistence write.

## Focused validation

The regression added to `apps/experiences/lumen-isles/tests/gameplay.test.mjs` is:

`a player removed while a failed Profile.load yields clears the late unsaveable session`

Red-first was observed by temporarily restoring the old `if ok and data` condition: that targeted
test failed on `late failed Profile.load left its unsaveable cache entry behind after removal`.

After restoring the fix, the focused Lumen gameplay file passed 8/8 local tests, including replay,
server distance, failed-save invisibility/replay, saved-checkpoint respawn, Profile lock-loss pause,
removed-player cleanup, and invalid-save refusal.

A later focused recheck ran only the failed-load removal regression with
`node --test --test-name-pattern='failed Profile.load' apps/experiences/lumen-isles/tests/gameplay.test.mjs`;
that check passed 1/1.

Observed source fingerprints after that run:

- `GameState.luau`: `d631fb92d1fc5fa58aade0edf1d4ffd4ae5f1ead6cde9d8b0dc887d5f22c0132`
- `Game.server.luau`: `9c1fd94613752bb74c23d8bfa891fe6b957e2f295cbfdd2fcb6669d3ef1b94fc`
- `tests/gameplay.test.mjs`: `5b309b9ff0c7a5229c1a486a2d4345f97878c86f1f1c59a83d414ce04dd8668f`

These fingerprints and test results describe the local source/harness state observed in this pass.
