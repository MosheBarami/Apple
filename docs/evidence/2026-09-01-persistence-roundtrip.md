# Persistence, proven across a real restart

**Date:** 2026-09-01
**Place:** Golem Visual Benchmark — PlaceId `116648235878426`, GameId `10764643912`,
PlaceVersion 2. Studio API services enabled.
**Closes:** DoD 11, *"Persistence is tested in a real published-private benchmark
context when available."* It was available.

---

## Why this was thought to be blocked

The PR checklist carried `Persistence proven across a restart (needs a published
place)` as unchecked. A probe settles it: `DataStoreService:GetDataStore(...)`
followed by `SetAsync` + `GetAsync` succeeds in this place, so API services are on
and the place is published privately. Nothing was blocking the test.

## Method — the real path, not a stub

1. **Play.** Server comes up: `[CrystalCanyon] CRYSTAL CANYON v1.0.0 server online`.
2. **Earn through gameplay.** The character was moved onto six meadow crystal nodes
   in turn. Collection is decided by the server's own 10 Hz proximity sweep — there
   is no "I collected this" remote to forge — so standing on a node is the genuine
   input. HUD read **SHARDS 8**, gauge `8 / 25`, and the sweep kept awarding while
   the character stood among the nodes.
3. **Stop play.** Server shutdown runs the save path.
4. **Read the DataStore directly** from Edit mode — ground truth, not the game's own
   report of itself.
5. **Play again** and read the HUD.

## Result

Stored at `CrystalCanyon_Profile_v1` / `plr_11279664020`:

```
profile:
  shards = 11          coins = 0
  stats:      collected = 11   sold = 0   playtime = 945
  objectives: collect = 11     sell = 0   upgrade = 0
  upgrades:   magnet = 0   pack = 0   speed = 0
  zones:      meadow = true    frost = false
  version = 1
  codes: (empty)
```

On restart the HUD read **SHARDS 11**, gauge `11 / 25`. The value earned, the value
stored and the value restored all agree.

## Two properties worth naming

- **The session lock was released.** The stored envelope contains `profile` and no
  lock field. `DataService` keeps the lock *inside the same value* as the profile so
  a single `UpdateAsync` is atomic across servers; a lock left behind here would
  strand the player behind the 180 s stale timeout on their next join. It was not.
- **The schema stamped its version.** `version = 1` matches `Profile.Version`. There
  is deliberately no migration path — a breaking change bumps the store name suffix
  for a clean slate instead — so a version mismatch would be visible rather than
  silently coerced.

## What this does NOT prove

- One player, one server. No cross-server lock contention, and no two-servers-at-once
  race.
- No crash path: this was a clean shutdown, so `BindToClose` ran. The
  `SessionLockStaleSeconds = 180` abandonment path is still unexercised.
- No `UpdateAsync` failure/retry path: `MaxRetries = 4` never fired because nothing
  failed.
