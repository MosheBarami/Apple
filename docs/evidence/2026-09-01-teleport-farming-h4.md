# H4 — teleport farming, measured against the pre-fix code

**Date:** 2026-09-01 · **Place:** Golem Visual Benchmark (`116648235878426`) · **Studio A/B**

## The finding

> **H4** Teleport farming works. `MaxPerTick` caps the instantaneous pickup, not the round
> trip, and there is no server-side movement validation — a ~6-8× economy advantage against
> the comment's claim of "the same rate as walking".

The comment H4 disputes, in `Collect.luau`:

> MaxPerTick is the teleport guard ... capping the awards per tick means such a jump pays out
> at the same rate as walking, so the exploit buys position, never currency.

The second half does not follow from the first. A per-tick cap bounds collection *per tick*.
What bounds a walking player is travel time: crystals are scattered at least 9 studs apart, so
at 16 studs/s a walker arrives at roughly 1.8 a second. A teleporting client pays no travel
time and banks `MaxPerTick` on every tick — 3 × 10 Hz = 30/s. The cap was never the binding
constraint for the exploit it is named after.

## The fix

`src/server/Movement.luau` — a pure function answering whether a step was physically possible,
given the walk speed the **server** believes the player is entitled to (from their upgrades,
never `Humanoid.WalkSpeed`, which the client owns and could inflate to widen its own
allowance). `Collect` zeroes that tick's award budget when the step was impossible.

Horizontal distance only: falling is vertical and legitimately far faster than any walk.

The penalty is deliberately tiny. The crystals are left standing, so a false positive costs a
legitimate player one tenth of a second. Making it severe would invert the trade — the cheat
is repeated and survives a few misses, while a laggy player only has to be wrong once.

## The exploit reaches the server

Sampled server-side at 20 Hz while the client hopped between crystal positions:

```
largest single step:      151.2 studs
fastest apparent speed:   2252 studs/s
samples over 16 studs/s:  85 of 294 (29%)
total ground covered:     2220 studs in 10s
```

Worth stating plainly because it is the premise: a client setting its own `HumanoidRootPart`
CFrame is visible to the server as exactly that, and nothing rejected it.

## A/B: the same harness, the same world, only `Collect` swapped

The harness hops between the 27 distinct crystal sites in Sunny Meadow at 0.12s intervals —
just slower than the 10 Hz sweep, so the server sees the player standing on each one — selling
whenever the pack approaches full so capacity never becomes the limit.

| `Collect` | hops | awards | window | rate |
|---|---|---|---|---|
| **pre-fix** (`HEAD`) | 76 | 24 | 12.3s | **1.95 crystals/s** |
| **fixed** | 91 | 1 | 12.1s | **0.08 crystals/s** |

A **24× reduction**. The single remaining award is the first tick, which has no previous
sample to compare against and is allowed by design.

**The pre-fix number understates the exploit**, and honestly so: Sunny Meadow holds 27
crystals on a 4-second respawn, which caps *any* strategy at 6.75/s no matter how fast the
player moves. The measurement bounds what this world can demonstrate, not what the exploit is
worth in general. What it does establish is the direction and the size of the change.

## The control: does it cost a legitimate player anything?

Walking the same route with the fix in place, on foot via `Humanoid:MoveTo`, with 53 jumps
thrown in — the fast vertical moves most likely to fool a naive check:

```
samples:                          202 (10 Hz, server-side)
flagged as impossible:            2 (0.99%)
fastest observed horizontal speed: 78.8 studs/s
the guard's sustainable limit:     33.6 studs/s
```

Two flagged ticks in 19 seconds, costing 0.2s of collection in total. At least one of them is
the harness's own repositioning teleport at the start of the run, not gameplay.

And the outcome that matters for the economy: **walking (0.15 crystals/s) now out-earns
teleporting (0.08 crystals/s)**. The exploit no longer pays better than playing.

## Residual, recorded rather than smoothed over

The 78.8 studs/s peak during ordinary walking is well above the 33.6 studs/s the guard treats
as sustainable, so the 1% is not noise — legitimate play does briefly exceed the limit,
presumably on slopes and jump landings. That is acceptable at 0.1s per occurrence and is the
reason the penalty is a skipped tick rather than anything harsher. If the guard is ever made
to bite harder, this number has to come down first.

## Reproducing

```bash
cd apps/benchmark/crystal-canyon && python3 -m http.server 8777 --bind 127.0.0.1
```

Install via `world/Install.luau` in Edit mode, press Play, and drive the harness from the
client command bar. To reproduce the A/B, serve a copy of `HEAD`'s `Collect.luau` and set the
installed `Collect`'s `Source` to it between runs — nothing else changes.

The policy itself needs none of this: `Movement` is pure, and `tests/movement.spec.luau`
covers it in 12 tests, including that a cheater who steps just under the threshold every tick
is still bounded by a sustained speed rather than a per-step one.
