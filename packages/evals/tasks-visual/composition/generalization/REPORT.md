# Composition gate: generalization beyond the plaza

Fixtures: **SYNTHETIC**, generated from fixed seeds by `composition-families.mjs`. Not captured scenes.
Ground truth: fixture-author design intent, NOT an independent blind jury. Weaker than the twelve-rung ladder, whose labels came from six blind critics.
Subject under test: apps/worker/src/composition.ts (bundled from source, not mirrored)

## Sets (disjoint by FAMILY, seeded)

disjoint: **true** — 60/60 fixtures covered, 0 id collisions, 0 family collisions

| set | fixtures | good/bad | families |
|---|---|---|---|
| CALIBRATION | 20 | 10/10 | cave, monument, obby, small-house, tavern |
| VALIDATION | 20 | 10/10 | horror-corridor, lobby, outdoor-garden, plaza, simulator-hub |
| REGRESSION | 20 | 10/10 | fantasy-area, industrial, interior, sci-fi-room, shop |

## Gate outcome

| set | false-reject (good rejected) | false-pass (bad accepted) | accuracy |
|---|---|---|---|
| ALL | 36.7% | 6.7% | 78.3% |
| CALIBRATION | 40.0% | 10.0% | 75.0% |
| VALIDATION | 40.0% | 0.0% | 80.0% |
| REGRESSION | 30.0% | 10.0% | 80.0% |

Structural half alone (no render): false-reject 36.7%, false-pass 6.7%.

## Per family

| family | set | good rejected | bad accepted | verdict |
|---|---|---|---|---|
| cave | CALIBRATION | 2/2 | 0/2 | **rejects everything — no discriminative power** |
| fantasy-area | REGRESSION | 0/2 | 0/2 | separates |
| horror-corridor | VALIDATION | 2/2 | 0/2 | **rejects everything — no discriminative power** |
| industrial | REGRESSION | 0/2 | 0/2 | separates |
| interior | REGRESSION | 0/2 | 1/2 | partial |
| lobby | VALIDATION | 2/2 | 0/2 | **rejects everything — no discriminative power** |
| monument | CALIBRATION | 0/2 | 0/2 | separates |
| obby | CALIBRATION | 0/2 | 0/2 | separates |
| outdoor-garden | VALIDATION | 0/2 | 0/2 | separates |
| plaza | VALIDATION | 0/2 | 0/2 | separates |
| sci-fi-room | REGRESSION | 1/2 | 0/2 | partial |
| shop | REGRESSION | 2/2 | 0/2 | **rejects everything — no discriminative power** |
| simulator-hub | VALIDATION | 0/2 | 0/2 | separates |
| small-house | CALIBRATION | 2/2 | 0/2 | **rejects everything — no discriminative power** |
| tavern | CALIBRATION | 0/2 | 1/2 | partial |

## Metric AUC on independent families

Signs are pre-declared in `composition-calibration.mjs` and imported, never re-fitted here.
With 10 good / 10 bad per set the standard error on a true-0.5 AUC is about 0.12; treat gaps under ~0.15 as noise.

| metric | status | ladder AUC | AUC all | CALIB | VALID | REGR |
|---|---|---|---|---|---|---|
| `structure.verticalDominance` | KEPT (ladder) | 1 | 0.787 | 0.73 | 0.82 | 0.81 |
| `structure.heightHierarchy` | KEPT (ladder) | 1 | 0.729 | 0.66 | 0.755 | 0.81 |
| `structure.verticalElements` | KEPT (ladder) | 1 | 0.431 | 0.56 | 0.27 | 0.45 |
| `interiorEdgeDensity` | KEPT (ladder) | 0.889 | 0.398 | 0.4 | 0.37 | 0.345 |
| `occupancyGini` | KEPT (ladder) | 0.833 | 0.55 | 0.545 | 0.63 | 0.465 |
| `silhouettePeakProminence` | KEPT (ladder) | 0.833 | 0.623 | 0.5 | 0.85 | 0.49 |
| `silhouetteRoughness` | KEPT (ladder) | 0.833 | 0.592 | 0.67 | 0.655 | 0.49 |
| `energyGini` | FALSIFIED (ladder) | 0.5 | 0.669 | 0.605 | 0.7 | 0.56 |
| `energyEntropy` | FALSIFIED (ladder) | 0.444 | 0.666 | 0.61 | 0.65 | 0.68 |
| `maskedColorfulness` | FALSIFIED (ladder) | 0.5 | 0.426 | 0.4 | 0.5 | 0.33 |
| `structure.massHierarchy` | FALSIFIED (ladder) | 0.333 | 0.496 | 0.34 | 0.6 | 0.55 |
| `occupiedCellShare` | FALSIFIED (ladder) | 0.306 | 0.47 | 0.55 | 0.355 | 0.53 |
| `coverage` | FALSIFIED (ladder) | 0.25 | 0.445 | 0.43 | 0.32 | 0.595 |
| `centroidOffset` | FALSIFIED (ladder) | 1 | 0.556 | 0.315 | 0.75 | 0.605 |
| `structure.volumeGini` | FALSIFIED (ladder) | — | 0.75 | 0.75 | 0.82 | 0.9 |
| `structure.heightBandEntropy` | FALSIFIED (ladder) | — | 0.851 | 0.88 | 0.7 | 0.92 |
| `structure.landmarkShare` | FALSIFIED (ladder) | — | 0.567 | 0.66 | 0.5 | 0.55 |
| `structure.footprintOccupancy` | FALSIFIED (ladder) | — | 0.517 | 0.61 | 0.45 | 0.435 |
| `structure.massCount` | FALSIFIED (ladder) | — | 0.596 | 0.64 | 0.6 | 0.55 |
| `figureGroundContrast` | FALSIFIED (ladder) | — | 0.528 | 0.565 | 0.5 | 0.55 |
| `silhouetteRange` | FALSIFIED (ladder) | — | 0.673 | 0.68 | 0.75 | 0.55 |
| `control.partCount` | CONTROL | — | 0.46 | 0.56 | 0.48 | 0.4 |
| `control.materialCount` | CONTROL | — | 0.599 | 0.72 | 0.52 | 0.54 |
| `control.colourCount` | CONTROL | — | 0.454 | 0.44 | 0.5 | 0.32 |

## Which rule fires

| rule | fires on good (false reject) | fires on bad (correct) | as the whole gate: FR / FP |
|---|---|---|---|
| nothing-stands-up | 0 | 2 | 0.0% / 93.3% |
| no-landmark | 11 | 26 | 36.7% / 13.3% |
| no-vertical-variation | 0 | 2 | 0.0% / 93.3% |
| greyscale | 6 | 5 | 20.0% / 83.3% |

Of the 11 false rejections, 2 are fixtures written on purpose to be hostile to a landmark rule (sci-fi-room/good/v0, lobby/good/v0) and **9 are plain, unremarkable scenes**: shop/good/v0, shop/good/v1, horror-corridor/good/v0, horror-corridor/good/v1, lobby/good/v1, cave/good/v0, cave/good/v1, small-house/good/v0, small-house/good/v1.

### The mechanism behind most of the false rejections

verticalElementHeights clusters parts in plan at a 3-stud gap. In an enclosed or wall-adjacent scene the shell chains through every prop that touches it, so the whole build collapses to ONE vertical element. verticalDominance then returns its 1.0 "nothing dominates" sentinel and the gate reports "no landmark" on a scene that has no landmark tier to measure in the first place.

Fixtures collapsing to <= 1 vertical element: **19/60** (good: 9, bad: 10).
Share of all false rejections explained by it: **81.8%**.

### Enclosed scenes: the camera never gets inside

The framing camera orbits the geometry bounding box, so on a roofed scene every viewpoint sees the OUTSIDE of a lidded box. See sheets/interior.png: a fully furnished room renders as a beige lid. The pixel half of the gate therefore never sees interior composition at all, and its greyscale floor is applied to a roof.

| | enclosed (roofed) | open |
|---|---|---|
| fixtures | 32 | 28 |
| mean maskedColorfulness | 14.488 | 33.986 |
| mean interiorEdgeDensity | 0.152 | 0.325 |
| false-reject rate | 68.8% | 0.0% |
| false-pass rate | 12.5% | 0.0% |

## Threshold counterfactuals (chosen on CALIBRATION only)

Recommendations, not changes: `apps/worker/src/composition.ts` is owned by another workstream and was not edited.

| rule set | ALL FR / FP | CALIBRATION FR / FP | VALIDATION FR / FP | REGRESSION FR / FP |
|---|---|---|---|---|
| production (unchanged) | 36.7% / 6.7% | 40.0% / 10.0% | 40.0% / 0.0% | 30.0% / 10.0% |
| A: skip the landmark rule when verticalElements === 1 | 23.3% / 23.3% | 20.0% / 40.0% | 40.0% / 0.0% | 10.0% / 30.0% |
| B: verticalDominance floor 1.25 -> 1.05 | 33.3% / 6.7% | 40.0% / 10.0% | 40.0% / 0.0% | 20.0% / 10.0% |
| C: colourfulness floor 12 -> 8 | 36.7% / 6.7% | 40.0% / 10.0% | 40.0% / 0.0% | 30.0% / 10.0% |
| A+C | 6.7% / 26.7% | 0.0% / 40.0% | 10.0% / 0.0% | 10.0% / 40.0% |
| D: skip the landmark rules whenever the enclosure metric says the scene is enclosed | 26.7% / 20.0% | 40.0% / 20.0% | 40.0% / 0.0% | 0.0% / 40.0% |

## Camera sensitivity

The structural half of the gate reads SceneLayout geometry and never sees a camera, so it is camera-invariant BY CONSTRUCTION. Only the pixel half (maskedColorfulness in the gate; the rest reported to the critic) can move with the camera.

Fixtures whose gate decision changes with the camera: **6 / 60**

| view metric | median range across cameras | median range / median value | worst |
|---|---|---|---|
| `coverage` | 0.248 | 0.62 | 1.173 |
| `maskedColorfulness` | 9.155 | 0.516 | 4.847 |
| `interiorEdgeDensity` | 0.177 | 0.801 | 3.356 |
| `figureGroundContrast` | 0.192 | 0.625 | 1.868 |
| `energyGini` | 0.229 | 0.326 | 1.352 |
| `occupancyGini` | 0.235 | 0.396 | 0.792 |
| `energyEntropy` | 0.3 | 0.424 | 1.382 |
| `occupiedCellShare` | 0.25 | 0.459 | 1.002 |
| `centroidOffset` | 0.186 | 1.243 | 1.805 |
| `silhouetteRange` | 0.416 | 0.945 | 4.701 |
| `silhouettePeakProminence` | 0.161 | 2.064 | 8.176 |
| `silhouetteRoughness` | 0.003 | 1 | 4 |

| single camera | false-reject | false-pass |
|---|---|---|
| hero | 43.3% | 6.7% |
| front | 43.3% | 3.3% |
| side | 50.0% | 3.3% |
| top | 46.7% | 6.7% |
| eye | 46.7% | 6.7% |
| all five (production) | 36.7% | 6.7% |

