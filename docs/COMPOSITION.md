# Composition: what was measured, what works, and what was thrown away

Every number here came from `node packages/evals/src/composition-calibration.mjs --write` or from the
live Roblox Studio session of 2026-08-31. Nothing is estimated.

---

## 1. The finding that started this

**The shipped visual gate could not fire.**

`pixelHardFails` in `apps/worker/src/pixel-stats.ts` checks whole-frame colourfulness against a
threshold of 12. Run against all twelve ladder fixtures:

| fixture | whole-frame colourfulness | whole-frame edge density | hard fails raised |
|---|---|---|---|
| `grey-plate` — literally one flat grey slab | **46.2** | 0.042 | **none** |
| `real-baseline` — the scene the owner rejected | 48.4 | 0.053 | **none** |
| `tiled-mush` — 255 uniformly tiled cubes | 49.3 | 0.296 | **none** |
| …all nine others | 46–50 | 0.076–0.30 | **none** |

**Zero of twelve.** Sky and ground fill most of every frame and are themselves strongly coloured, so
whole-frame colourfulness never approaches the floor no matter what was built. The check could only
fire on a synthetic buffer with no sky and no ground — which is exactly what its unit test feeds it.
The test passed for the whole life of the check while the check did nothing.

The edge-density threshold has the same shape: it is 0.02, and the rejected baseline measures 0.053.
The existing test asserts only that `improved > baseline`, never that `baseline` fails.

Restricted to the geometry mask, that same grey slab reads **1.705** and the floor fires correctly.

## 2. The geometry mask is free

`pixel-stats.ts` already recorded that masking would fix this and had not been done. It costs nothing
and needs no change to the plugin, the payload, or the wire format: the rasteriser fills background
with exactly two constants — sky `159,199,232` above the horizon, ground `110,122,99` below — and
every geometry pixel is fog-blended toward a third colour. A pixel is geometry iff it is neither
constant.

Validated against the renderer's own depth buffer across all five views of a real capture: the
derived mask agrees with `subjectCoverage` to **under 1% of the frame** (`composition.test.mjs`). It
also works on renders captured weeks ago, because it reads only RGB that was already stored.

## 3. The ladder

Twelve fixtures. Most are **derived** — named composition transformations applied to one real scene,
the 219-part plaza a production agent actually built — so part count, material count and colour count
stay near-constant and a metric cannot pass by secretly tracking part count.

Four are adversarial, built to make the new metrics look good on scenes that are bad: `tiled-mush`
(the 725-part failure in miniature), `one-blob-void`, `confetti`, `lopsided`.

**Ground truth is not the author's labels.** Six independent critics scored the anonymised contact
sheets 1–10, each under a different lens (environment artist, level designer, hostile art director,
photographer, 13-year-old player, architect), with no access to labels, metrics, or how the scenes
were made. Consensus (`tasks-visual/composition/blind/jury.json`):

| fixture | jury mean | sd | author's prior |
|---|---|---|---|
| real-improved | 8.00 | 0.58 | 5 |
| hierarchised | 7.83 | 0.69 | 7 |
| blockout | 5.67 | 0.75 | 5 |
| lopsided | 4.50 | 0.96 | 3 |
| levelled | 4.00 | 0.58 | 4 |
| equalised | 3.17 | 0.37 | 3 |
| real-baseline | 3.00 | 0.82 | 2 |
| flattened | 2.67 | 0.75 | 3 |
| tiled-mush | 2.00 | 0.00 | 2 |
| one-blob-void | 1.50 | 0.50 | 3 |
| grey-plate | 1.17 | 0.37 | 1 |
| confetti | 1.00 | 0.00 | 2 |

The critics named the intended failure modes unprompted — *"competing verticals destroy the focal
point"* (levelled), *"the eight identical verticals compete with the central monument"*
(real-improved), and several identified `lopsided` as *"the difference … is purely where the built
objects sit relative to the paving"* without being told which fixture it was.

**A negative result on the author's own work.** `hierarchised` — the transformation written to
demonstrate that composition can be fixed without adding parts — scored 7.83 against the untouched
original's 8.00. It is **not** an improvement. It is within noise, and the claim that it improved the
scene is withdrawn.

## 4. Metric ranking

AUC is the probability a randomly chosen good fixture (jury ≥ 5.5) outranks a randomly chosen bad one
(jury ≤ 3). 0.5 is a coin flip. **Direction is declared a priori**, never fitted — an early run that
fitted the sign to the data produced a spurious "AUC 1.000", which is precisely the trap this
exercise exists to avoid.

### Kept

| metric | AUC | rho | what it detects |
|---|---|---|---|
| `structure.verticalDominance` | **1.000** | 0.653 | tallest vertical element ÷ second tallest, clustered in plan — landmark dominance |
| `structure.heightHierarchy` | **1.000** | 0.746 | tallest part ÷ median part height |
| `structure.verticalElements` | **1.000** | 0.770 | how many distinct things stand up at all |
| `interiorEdgeDensity` | 0.889 | 0.657 | surface detail, counting only edges whose whole neighbourhood is geometry |
| `occupancyGini` | 0.833 | 0.566 | mass concentrated into structures rather than smeared |
| `silhouettePeakProminence` | 0.833 | 0.524 | landmark dominance measured in image space |
| `silhouetteRoughness` | 0.833 | 0.471 | how varied the skyline is |
| `layout.neighbourSpacingCV` | 0.833 | 0.651 | fence-post regularity (pre-existing, now calibrated) |
| `layout.rotationEntropy` | 0.778 | 0.512 | props all facing the same way (pre-existing, now calibrated) |

`verticalDominance` is the one that matters. It is exactly 1.000 on every fixture where nothing
dominates, and it is free: no render, no model call, pure arithmetic over geometry the plugin already
sends.

### Rejected, with the reason

| metric | AUC | why it failed |
|---|---|---|
| `energyGini` | 0.500 | **The central hypothesis of this work, refuted.** Gini of visual energy across a 6×6 grid was meant to separate focal composition from uniform mush. It does not: a composed scene and a tiled carpet distribute edge energy almost identically once both fill the frame. |
| `energyEntropy` | 0.444 | the same idea inverted; same failure, and the measured direction contradicts the declared one |
| `maskedColorfulness` | 0.500 | does not GRADE palette — baseline 20.1 vs improved 19.2, the bad scene scoring higher. Kept only as a floor against total greyness, where it does work: 1.7 on a grey slab against a threshold of 12. |
| `structure.massHierarchy` | 0.333 | volume clustering at a 1-stud gap fuses a paved scene into one mass, returning "infinitely dominant" for a uniform plate and a real plaza alike. Replaced by `verticalDominance`. |
| `occupiedCellShare`, `coverage` | 0.306, 0.250 | direction refuted — filling more of the frame is *worse* here, because the bad fixtures are the ones that fill it |
| `centroidOffset` | 1.000 | **Kept out of the gate despite a perfect score.** Its stated purpose is balance, but the framing camera follows the geometry bounding box, so a uniform translation cancels exactly — the first `lopsided` fixture rendered bit-identical and proved nothing. It is meaningful only in the top-down view, and its class margin is 0.191 vs 0.225. Reported, never gated. |
| `layout.latticeScore` | 0.583 | direction refuted. Pre-existing `[PROV]` metric: it scores the real rejected baseline as a *perfect* grid clone (1.0) and a deliberately tiled grid as 0.282. |
| `layout.propDensity` | 0.389 | direction refuted; its own source already warns it is "SENSITIVE TO CLASSIFICATION, treat as a hint" |
| `structure.volumeGini`, `heightBandEntropy`, `landmarkShare`, `footprintOccupancy`, `massCount`, `figureGroundContrast`, `silhouetteRange`, `layout.symmetryX` | 0.44–0.78 | did not separate reliably, or false-positived on the adversarial fixtures |

### The controls — the project's own null hypothesis, falsified

| control | AUC |
|---|---|
| part count | 0.611 |
| material count | 0.528 |
| colour count | 0.667 |

All three are near coin-flip. **More parts, more materials and more colours do not predict a better
scene.** This is asserted as a test (`composition.test.mjs`) so it cannot quietly stop being true.

## 5. The gate

```
verticalElements   == 0     -> nothing stands up; it is a plate
verticalDominance  < 1.25   -> no landmark
heightHierarchy    < 2.0    -> no vertical variation
maskedColorfulness < 12     -> the geometry is effectively greyscale
```

Fires on **every** fixture the jury scored ≤ 4.0 and on **none** it scored ≥ 4.5 — no false
positives, no false negatives on this ladder, against a previous gate that fired on none of them.

Scoped to `scene` subjects. A prop has no landmark tier, so applying these to a trophy would reject
correct work.

`interiorEdgeDensity` was **dropped from the gate** rather than shipped: at the only threshold that
looked reasonable it never fired on any fixture, and shipping another inert check is the disease this
document is about. It is still reported to the critic.

## 6. Live Studio validation, 2026-08-31

Built directly in a live Studio place, captured through `SceneLayout`, judged by the production gate.

| | parts | materials | colours | `verticalDominance` | gate |
|---|---|---|---|---|---|
| six lamp posts as tall as the monument | 64 | 4 | 5 | **1.000** | **FAIL** — "no landmark" |
| monument raised, lamp ring stepped down | 64 | 4 | 5 | **2.833** | **PASS** |

Nothing was added. Not one part, material or colour changed — only the height relationship.

Renders: `packages/evals/tasks-visual/composition/live/{before-competing-verticals,after-landmark-dominant}.png`.

Note the contrast with the pre-existing rubric check `tallestStuds < 1.5 × medianHeightStuds`: on the
failing scene that ratio is **13**, so the old check passes it comfortably. `verticalDominance`
catches it because it compares the landmark to the *other landmarks* rather than to the paving.

## 7. Honest limits

- Twelve fixtures derived from one real scene is a **calibration set, not a validation set**. The
  thresholds will need revisiting against genuinely independent scenes.
- The good end is thin: three fixtures above 5.5, and the two best are the same scene.
- The rasteriser draws no meshes, terrain, decals, textures, particles or shadows, so every image
  statistic under-represents a mesh-heavy scene.
- `heightHierarchy < 2.0` would fire on a legitimately flat design — a race circuit, a floor plan.
  That is a known false positive, and it is why these cap the score rather than refusing the build.
- The jury is six language models, not six humans. They agree with each other tightly (sd ≤ 0.96) and
  with the author's independent prior at Spearman 0.942. That is evidence of consistency, not of
  correctness against human taste.
