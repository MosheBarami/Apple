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

## A correction: the first measurement targeted the wrong objects

The A/B below replaces an earlier one. That first harness gathered its hop targets by
matching parts whose parent name contained "crystal", which caught **`CrystalOutcrop`
decorations** — scenery — rather than the collectibles. The player was hopping between rocks,
and awards happened only when a rock chanced to sit within the 7-stud magnet radius of a real
crystal. It reported 1.95 → 0.08 crystals/s.

Caught by a different failure: the pack gauge would not move during a later motion
measurement, and the nearest "crystal" to a player standing on one turned out to be **10.4
studs away** against a 7-stud magnet. The collectibles are in `Workspace.Canyon.Crystals.<zone>`,
one Model each — 18 in Sunny Meadow and 16 in Frost Hollow, matching `Config.CrystalCount`
exactly.

The direction of the old result held. Its magnitude was measured against scenery.

## A/B: the same harness, the same world, only `Collect` swapped

The harness hops between the **18 real collectibles** in Sunny Meadow at 0.12 s intervals —
just slower than the 10 Hz sweep, so the server sees the player standing on each one — selling
whenever the pack approaches full so capacity never becomes the limit. The walking runs follow
a nearest-neighbour route through the same 18, on foot via `Humanoid:MoveTo`.

Only `Collect.luau` differs between the two builds: the pre-fix copy is taken from `7c4bc07^`
and still contains the H1 locked-zone notice, so the movement guard is the single variable.

| `Collect` | teleport-hopping | walking on foot |
|---|---|---|
| **pre-fix** (`7c4bc07^`) | **3.50 crystals/s** (43 awards, 84 hops, 3 sells / 12.3 s) | **0.34 crystals/s** (5 awards / 14.6 s) |
| **fixed** | **0.17 crystals/s** (2 awards, 90 hops / 12.0 s) | **0.40 crystals/s** (5 awards / 12.5 s) |

Three things fall out of that table, and the third is the one that matters:

1. **The exploit was worth 10.3×.** 3.50 against a walking player's 0.34 — which lands on the
   critic's estimate of "~6-8×" from the other side, and confirms the comment's claim of "the
   same rate as walking" was wrong by an order of magnitude.
2. **The fix removes 20.6× of it.** 3.50 → 0.17. The two remaining awards are ticks with no
   previous sample to compare against, which is allowed by design.
3. **Teleporting now earns LESS than walking** — 0.17 against 0.40. The exploit is no longer a
   shortcut; it is a penalty. That is the property the economy actually needs, and it is
   stronger than merely narrowing the gap.

**Walking is unaffected.** 0.34 → 0.40 across the change, five awards in both runs; the
difference is route timing within a 12-second window, not the guard.

## The control: does it cost a legitimate player anything?

Walking with 53 jumps thrown in — the fast vertical moves most likely to fool a naive check —
sampled server-side at 10 Hz and scored offline with the real `Movement` module:

```
samples:                           202
flagged as impossible:             2 (0.99%)
fastest observed horizontal speed: 78.8 studs/s
the guard's sustainable limit:     33.6 studs/s
```

Two flagged ticks in 19 seconds, costing 0.2 s of collection in total, and at least one of
them is the harness's own repositioning teleport rather than gameplay.

## Residual, recorded rather than smoothed over

The 78.8 studs/s peak during ordinary walking is well above the 33.6 studs/s the guard treats
as sustainable, so the 1 % is not noise — legitimate play does briefly exceed the limit,
presumably on slopes and jump landings. That is acceptable at 0.1 s per occurrence and is the
reason the penalty is a skipped tick rather than anything harsher. If the guard is ever made
to bite harder, this number has to come down first.

## Reproducing

```bash
cd apps/benchmark/crystal-canyon && python3 -m http.server 8777 --bind 127.0.0.1
```

Install via `world/Install.luau` in Edit mode, press Play, and drive the harness from the
client command bar. To reproduce the A/B, serve a copy of `7c4bc07^`'s `Collect.luau` and set
the installed `Collect`'s `Source` to it between runs — nothing else changes.

**Take the hop targets from `Workspace.Canyon.Crystals.<zone>`**, one Model per crystal. Do
not match on names containing "crystal": `CrystalOutcrop` is scenery, and a harness aimed at
it measures the scenery's spacing rather than the exploit.

The policy itself needs none of this: `Movement` is pure, and `tests/movement.spec.luau`
covers it in 12 tests, including that a cheater who steps just under the threshold every tick
is still bounded by a sustained speed rather than a per-step one.
