# Crystal Canyon — playtest 01

Run in Roblox Studio (`Place1`), 2026-08-31, against the build at the commit that
carries this file. Every line is a value read back out of the running game, not a
description of what the code should do.

## Boot

```
[CrystalCanyon] PERSISTENCE DEGRADED — profiles are in-memory only for this
  session and will be lost when the server stops. Nothing will be written to the
  DataStore. Reason: GetDataStore failed: You must publish this place to the web
  to access DataStore.
[CrystalCanyon] CRYSTAL CANYON v1.0.0 server online
```

The degradation notice is the designed Studio path, not a failure: an unpublished
place has no DataStore, and the alternative to an in-memory profile is an
unplayable game. It announces itself loudly and refuses to write, which is the
behaviour that matters — **a live server never takes this path**, it is gated on
`RunService:IsStudio()`.

Persistence across a real server restart is therefore **NOT yet proven**. It needs
a published place. Recorded as an open gap, not a pass.

## HUD, read out of the running client

Viewport 1257x698. Every element carries a `UIStroke`; font is FredokaOne
throughout.

| element | text | position | note |
|---|---|---|---|
| Shards counter | `0` | (56, 23) | top-left |
| Coins counter | `0` | (56, 80) | top-left |
| Pack bar | `0 / 25` | (36, 137) | under the counters |
| SHOP | icon button | (6, 214) | left edge |
| UPGRADES | icon button | (6, 299) | left edge |
| CODES | icon button | (6, 385) | left edge |
| ZONES | icon button | (6, 470) | left edge |
| SELL SHARDS | pill | (989, 275) | right edge |
| objective chip | `COLLECT 25 SHARDS  0/25` | (515, 25) | top-centre |
| version | `CRYSTAL CANYON  v1.0.0` | (14, 608) | bottom-left |

§6's hard rule holds: everything sits at a screen edge and the centre is empty
apart from the objective chip in the top band. All four panel backdrops read
`Visible = false` at rest.

## The core loop

Walked from spawn into Sunny Meadow, collecting.

```
pos=(-0,94)    shards 1    pack 1 / 25    sell preview +2 COINS
pos=(29,136)   shards 7    pack 7 / 25    sell preview +14 COINS    objective 7/25
```

Collection is server-decided; the client never claimed a pickup. The sell preview
is `shards x Config.Sell.CoinsPerShard` and tracked correctly at every step. The
objective chip advanced, which is the fix for it having been pinned at `0/25`.

Walked to the gold pad and sold:

```
before sell : 9 shards | 0 coins  | 9 / 25 | +18 COINS
after  sell : 0 shards | 18 coins | 0 / 25 | +0 COINS
```

9 x 2 = 18. Exact.

## Economy integrity

Every one of these is the server refusing something, verified by the coin balance
not moving.

| action | result | balance |
|---|---|---|
| buy `pack` (50) holding 18 coins | refused | 18 |
| redeem `welcome` (lowercase) | accepted, "Welcome to the canyon!" | 18 → 268 |
| redeem `WELCOME` again, inside cooldown | refused, "Slow down a moment." | 268 |
| redeem `WELCOME` again, after cooldown | refused, **"You already used that code."** | 268 |
| redeem `NOPE-NOT-A-CODE` | refused, "That code isn't valid." | 268 |
| buy `pack` (50) holding 268 | accepted | 268 → 218 |
| buy `nonexistent` | refused, "UNKNOWN UPGRADE" | 218 |
| buy `12345` (a number, not a string) | silently dropped by `Net`'s type check | 218 |
| unlock `frost` (2,500) holding 218 | refused, "NEED 2,500 COINS" | 218 |

The lowercase redeem proves server-side normalisation. The purchase took effect:
the pack bar changed from `0 / 25` to **`0 / 40`** (25 base + 15 per level).

### The race

`Purchase("pack")` fired **40 times in a single frame**:

```
coins 218 -> 10
```

Exactly two purchases settled — 80 then 128, the correct prices for levels 1 and
2 — followed by `NOT ENOUGH COINS`. No double-spend. This is the case
`Economy.spendCoins` is written for: it checks and debits with no yield between,
so two purchases dispatched in the same frame cannot both pass the balance check.

## Errors

**Zero Crystal Canyon errors in the console** across the whole session —
collection, selling, four code paths, seven purchase paths, a 40-call burst,
wrong-typed arguments and two refused unlocks.

The only console errors belong to unrelated third-party Studio plugins
(`Workspace.GolemPlugin`, `AgileBootstrap`) that were already in the place.

Per §24 a clean log is not on its own a pass — but gameplay was independently
verified above by reading state back, so the clean log is meaningful here rather
than vacuous.

## What this run did NOT prove

- **Persistence across a restart.** Studio has no DataStore for an unpublished
  place, so the save/load path, the session lock and the stale-lock takeover ran
  only against the in-memory fallback. Needs a published place.
- **A second player.** Single-client session only, so cross-player isolation and
  the per-player rate-limit buckets were not exercised concurrently.
- **Rejoin.** Not testable without persistence.
- **Mobile layout.** Verified by arithmetic in review, not by rendering at 390px.
- **The pack cap under load.** Never filled the pack, so the "pack full, do not
  consume the crystal" branch in `Collect` is unexercised.

## Tooling note

`screen_capture` cannot photograph a running playtest — it captures the edit-time
viewport and returned solid magenta during play. After the playtest it began
timing out entirely, so the UI screenshots for this run are missing; the HUD table
above is read directly out of the live `PlayerGui` instead. World renders taken
before the playtest are unaffected.
