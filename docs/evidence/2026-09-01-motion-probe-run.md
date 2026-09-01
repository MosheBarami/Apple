# The motion probe, actually run

`world/MotionProbe.luau` exists so that motion claims come from frames rather than from
`TweenInfo`. Master Mission §O: *"Do not claim motion quality from tween code alone."*

An independent audit found that **it had no recorded execution**, that only 6 of the 14 motion
categories had a per-frame time series behind them, and that **no raw frame data was persisted
anywhere** — so the samples that did exist could not be re-derived. Gate 6 was PROVEN on the
sentence "all 12 applicable categories measured", where *measured* was doing three different jobs.

This is a real run, against the three objective-chip motions built this session.

## Method

The probe was installed unmodified and driven the way its own header demands: targets resolved
**by function every frame** (the ScreenGui is `ResetOnSpawn`, so a cached reference becomes an
orphan), and the motions driven **through the real `Sync` remote** rather than by poking the
module under test.

```
save:coins  →  SWAP → buy:pack  →  COLLAPSE  →  APPEAR → unlock:frost
```

## What it measured — and the bug it found first

The first run reported **`posTravel = 0.0 px` across 451 frames** of a motion whose entire
vocabulary is a horizontal slide.

`posTravel` measured `pos.Y` alone. The objective chip's `transition` and `swap` slide it out to
the left and back in from the right, so **none of its travel was vertical and the probe returned a
confident zero.** `moved` is computed from these totals, so a purely horizontal animation could
have been reported as no animation at all — the exact class of silently-wrong answer this module's
own header was written about.

Both axes are measured now. The same motion, re-run:

| | before the fix | after |
|---|---|---|
| `posTravelX` | *not measured* | **1109.7 px** |
| `posTravelY` | 0.0 px | 0.0 px |
| `posTravel` | **0.0 px** | **1109.7 px** |

## The series

497 frames over 45 s. Every 4th sample, trimmed to the interesting window:

```
t_ms    pos_x   size_x  scale     what
10434   490.4   278.1   1.0000    at rest, "REACH 2,500 COINS"
10699   417.0   278.1   1.0000    SWAP begins — sliding out
10967   660.5   344.0   1.0000    re-entering from the right, new width
11232   457.5   344.0   1.0000    settled, "BUY PACK SIZE"
13370  -383.8   344.0   1.0000    COLLAPSE — slid off-screen left
13635   520.2   191.1   1.0000    APPEAR — back in, narrower text
15769   542.7   173.6   0.9017    the collapse shrink, caught mid-flight
18300     —       —     1.0160    APPEAR's Back-ease overshoot peak
```

Three motions, each visible as travel, width change and scale.

## The honest limit

**The probe samples at the render rate, and Studio play mode on this scene renders at ~15 fps**
(497 frames over 45 s ≈ 67 ms per frame). The motions are 180–300 ms. So a slide is resolved by
**about three samples**.

That is enough to establish that a motion happened, how far it travelled, and roughly where its
peak was. It is **not** enough to characterise an easing curve, and no claim of that kind should
be made from this data. A 60 fps capture would be needed for that, and Studio did not provide one
here.

Raw series: 497 rows of `t_ms, pos_x, pos_y, size_x, size_y, scale, transparency`, decimated
above. This is the first motion frame data the repository has kept.
