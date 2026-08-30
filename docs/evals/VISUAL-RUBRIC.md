# Visual quality rubric

The coding eval suite (`packages/evals`) scores 98.9%. It measures whether Golem writes
correct Luau, and it is completely blind to the fact that the scenes that Luau builds look
like untextured block-outs — flat platforms, primitive poles, arbitrary colours, no
composition.

This rubric is the other half. It looks at rendered pixels and asks a different question:
**would a Roblox creator ship this?**

> The rule everything below exists to enforce, in the owner's words:
> *"Do not give a high score simply because every requested object exists."*

- Rubric data: `packages/evals/tasks-visual/rubric.json`
- Tasks: `packages/evals/tasks-visual/tasks.json` (12 build tasks)
- Grader: `packages/evals/tasks-visual/grade-visual.mjs`
- Evidence layout: `packages/evals/tasks-visual/regression/README.md`

---

## 1. How a scene is graded

Each task is built in Studio, then captured from several viewpoints (`hero`, `front`, `side`,
`top`, `eye`) by the plugin's software renderer, which returns real pixels plus structural
telemetry. Two independent streams of evidence come out:

| Stream | Source | Used for |
| --- | --- | --- |
| **Pixels** | rendered screenshots | the 20 rubric dimensions, judged by a vision model |
| **Structure** | scene probe + renderer metadata | the hard-fail conditions, judged by arithmetic |

Splitting them is deliberate. The vision model can be generous, inconsistent or wrong. The
structural checks cannot be talked out of anything: if `ground.isDefaultBaseplate` is `true`,
the ground is a baseplate, and no amount of enthusiasm in the critique changes that.

The vision model must return, for every one of the 20 dimensions, an integer 0–4 **and** an
observed justification of at least 25 characters naming what it saw and in which view. A
critique with a missing dimension, a fractional score, or a justification like "looks fine"
is rejected outright and the run is graded `invalid` — never passed.

---

## 2. The 20 dimensions

Weights sum to 100. They are concentrated in the things that separate a professional build
from a first-pass block-out.

| # | Dimension | Weight | What it measures |
| --- | --- | ---: | --- |
| 1 | `focal_point` | **8** | Does the eye land somewhere? Is there a landmark, and does the rest support it? |
| 2 | `composition` | **7** | Arranged with intent — balance, grouping, rhythm — vs distributed on a grid |
| 3 | `lighting_setup` | **6** | Lighting service properties and placed light instances, configured for *this* scene |
| 4 | `surface_detail_density` | **6** | Detail at multiple scales vs bare expanses |
| 5 | `ground_treatment` | **6** | Is the floor designed, or still a baseplate? |
| 6 | `prompt_fidelity` | **6** | **The only dimension that scores object existence** |
| 7 | `proportion_scale` | 5 | Believable against a ~5-stud character, and internally consistent |
| 8 | `material_coherence` | 5 | Materials communicate what things are made of, consistently |
| 9 | `material_variety` | 5 | How many materials carry meaningful surface area |
| 10 | `palette_discipline` | 5 | A deliberate limited palette vs arbitrary per-part BrickColors |
| 11 | `value_structure` | 5 | Light/dark organised so the image reads in greyscale |
| 12 | `edge_trim_finish` | 5 | Junctions finished with trim vs raw 90° seams |
| 13 | `vertical_variation` | 5 | Uses height vs living on one plane |
| 14 | `silhouette` | 4 | Identifiable from outline alone |
| 15 | `atmosphere_mood` | 4 | Fog, sky, colour temperature serving the requested mood |
| 16 | `prop_layering` | 4 | Architecture / furniture / dressing as distinct layers |
| 17 | `spatial_flow` | 4 | Can a player read where to go, and get there |
| 18 | `scene_cohesion` | 4 | Everything belongs to one world and one theme |
| 19 | `negative_space` | 3 | Emptiness used deliberately |
| 20 | `technical_hygiene` | 3 | Anchoring, collisions, naming, part budget |

### Why `prompt_fidelity` is only 6

This is the load-bearing design decision.

A perfect 4/4 on `prompt_fidelity` contributes `6 × 4 / 100 = 0.24` of the 4.0 scale — **6% of
the total**. The pass threshold is 2.6/4. So a scene that contains every single requested
object and does nothing else well cannot get within shouting distance of passing.

The grader enforces this beyond the weight itself. Tasks may adjust dimension weights via
`dimensionEmphasis`, but:

- multipliers are clamped to `[0.5, 2.0]`;
- `prompt_fidelity` may be **de-emphasised but never emphasised** (a multiplier above 1 is
  refused and warned about);
- after the per-task weights are renormalised back to 100, `prompt_fidelity` is clamped again
  so renormalisation cannot sneak its share upward, with the surplus redistributed across the
  other dimensions.

There is a unit test asserting this invariant holds for all 12 tasks.

---

## 3. Hard-fail conditions

These are the failure modes Golem currently exhibits. Each is checked against structural
telemetry, not opinion. **Any hard fail caps the total score regardless of every other
dimension.**

| id | Fires when | Why it is disqualifying |
| --- | --- | --- |
| `bare-baseplate` | `ground.isDefaultBaseplate === true`, or the ground is a single unrecoloured Plastic part | The loudest possible signal that nothing was designed |
| `single-material` | Fewer than 2 distinct materials have ≥2 parts | Material variety is the cheapest quality signal there is |
| `default-lighting` | 0 changed Lighting properties **and** 0 light instances **and** 0 lighting effects | Every mood in the task set requires touching lighting |
| `no-detail-props` | `parts.smallPropCount === 0` (nothing under 2 studs) | No trim, no fittings, no dressing were built |
| `no-landmark` | Task expects a landmark **and** (`focal_point` ≤ 1, or tallest part < 1.5× median height) | A scene with no hierarchy has nowhere for the eye to go |
| `nothing-rendered` | No view reports `partsVisible > 0` with `subjectCoverage ≥ 0.02` | The build or the framing is broken; there is nothing to grade |
| `flat-slab` | Height < 3 studs across a footprint > 40 studs | The literal "flat platforms" failure |

Note that `default-lighting` requires *all three* signals to be absent. Placing real
`PointLight`s counts as a lighting pass even if the Lighting service was left alone — the
condition targets scenes with no lighting work at all, not scenes that did it differently.

`no-landmark` only applies to tasks with `landmarkExpected: true`. Three of the twelve
(`vis-04-obby-section`, `vis-07-forest-clearing`, `vis-12-polish-ugly-scene`) legitimately
have no single hero object — the route, the clearing and the existing furniture are the
subject — so the condition is switched off for them.

### The cap ladder

One hard fail caps the score at **1.4/4 (35%)**. Each additional fail lowers the cap by 0.25,
never below a floor of 0.4:

| Hard fails | Cap | As % |
| ---: | ---: | ---: |
| 0 | — | — |
| 1 | 1.40 | 35.0% |
| 2 | 1.15 | 28.7% |
| 3 | 0.90 | 22.5% |
| 4 | 0.65 | 16.2% |
| 5+ | 0.40 | 10.0% |

The rubric loader **refuses to load a rubric where `hardFailCap ≥ passThreshold`**. That makes
"a hard fail can never pass" a structural property of the config, not a coincidence of the
numbers.

### The critical-dimension floor

Separately from the hard fails: any dimension with a base weight ≥ 6 that scores **0** fails
the run outright, even if the weighted total clears the threshold. A zero on `focal_point`,
`composition`, `lighting_setup`, `surface_detail_density`, `ground_treatment` or
`prompt_fidelity` is a structural defect, not a rounding error.

---

## 4. The scoring maths

```
1. effective weight per dimension
      wᵢ = base_weightᵢ × clamp(emphasisᵢ, 0.5, 2.0)
      renormalise so Σwᵢ = 100
      clamp prompt_fidelity to its base weight; redistribute surplus proportionally

2. raw score (0–4 scale)
      raw = Σ(wᵢ × scoreᵢ) / Σwᵢ

3. cap
      cap    = max(0.4, 1.4 − (hardFailCount − 1) × 0.25)      [if hardFailCount > 0]
      total  = min(raw, cap)

4. gate
      PASS  ⟺  no validation errors
             ∧ hardFailCount == 0
             ∧ no critical-dimension floor violation
             ∧ total ≥ 2.6
```

### Why the threshold is 2.6/4 (65%)

The anchors define 2 as *"acceptable amateur"* and 3 as *"good"*. A creator would rework
anything at 2. So the bar sits clearly above amateur but below uniformly-good: a passing scene
averages between "acceptable" and "good" across 20 weighted dimensions, which in practice
means mostly 3s with a few 2s and a few 4s.

It is also deliberately reachable. `fixtures/critique-good-plaza.json` describes a real but
imperfect plaza — several 2s, mostly 3s, one 4 — and scores **76.6%**. The gate is a bar, not
a wall.

### Three worked totals

| Scene | Raw | Hard fails | Final | Verdict |
| --- | ---: | ---: | ---: | --- |
| Blockout, judged by a maximally generous critic (**every dimension 4/4**) | 100.0% | 4 | **16.3%** | FAIL |
| Blockout, judged realistically (`prompt_fidelity` 2 — everything exists) | 15.5% | 5 | **10.0%** | FAIL |
| Good plaza | 76.6% | 0 | **76.6%** | PASS |

The first row is the whole point. A vision judge that loved everything, plus perfect prompt
fidelity, still lands at 16.3% — because the ground is a baseplate, one material is in use,
Lighting is untouched and nothing is smaller than 2 studs. There is a unit test named
`THE EXISTENCE-ONLY CHEAT CANNOT PASS` that will fail loudly if this ever stops being true.

---

## 5. Worked anchors for the five heaviest dimensions

For each: what a 0, a 2 and a 4 actually look like.

### `focal_point` — weight 8

- **0** — A town square where the fountain, the lamp posts and the benches all top out around
  14 studs. Asked "what is this a picture of?", you cannot answer from the image. Nothing is
  bigger, brighter or more detailed than anything else.
- **2** — The fountain is genuinely the tallest thing and reads as the subject. But nothing
  else in the scene knows it exists: no path leads to it, no lighting picks it out, the paving
  pattern ignores it, and the benches face outward. It is dominant by accident of size alone.
- **4** — The fountain is twice the height of anything near it, sits on a third rather than
  dead centre, is framed by an arch on the approach, is the brightest object in the scene, has
  the densest detail, and four radial paths in the paving converge on it. Secondary interest
  (a clock over the arch) and tertiary interest (a notice board) give the eye somewhere to go
  next.

### `composition` — weight 7

- **0** — Top view shows props on a regular 20-stud grid. Every bench is equidistant from
  every other bench. Moving any object to any other grid cell would change nothing. This is
  what "placed by a loop" looks like from above.
- **2** — Benches are grouped in pairs near the planters and the lamps line the edges, so
  there is a front and a back. But the balance is flatly symmetrical, the spacing is uniform
  within each group, and only the hero angle holds together — the side view is a mess.
- **4** — Asymmetric balance: a dense cluster of seating and planting on one side answered by
  the fountain's mass on the other. Repeated rhythms (lamp, lamp, tree, lamp, lamp, tree) that
  break deliberately at the entrance. Sightlines that frame the centrepiece from each of the
  four approaches. A screenshot from almost anywhere is usable.

### `lighting_setup` — weight 6

- **0** — Studio defaults untouched. No `PointLight`, `SpotLight` or `SurfaceLight` anywhere.
  The lamp heads are Neon spheres that emit nothing. A "dark dungeon" rendered at flat noon.
- **2** — `ClockTime` set to evening and `Brightness` turned down, with a `PointLight` dropped
  into each lamp head. Light exists where light sources are, which is the basic requirement.
  But every light is the same white at the same range, and nothing is lit *because* it matters.
- **4** — Warm 2700K lamp lights against a cool blue ambient, ranges tuned so pools of light
  and shadow alternate along the path, `Ambient` and `OutdoorAmbient` set for the hour, a
  brighter fill on the fountain making it the luminance peak of the frame, and shadows that
  fall where the composition wants them.

### `surface_detail_density` — weight 6

- **0** — The plaza floor is a single 118-stud part. The walls are single slabs. Nothing in the
  entire scene is smaller than 2 studs. There is no trim, no bolt, no panel line, no cup on a
  table.
- **2** — The floor is subdivided into paving bands and the walls into panels, and there are a
  handful of small props on the benches. Detail exists at two scales, spread thinly and evenly
  — every surface gets the same treatment whether the eye goes there or not.
- **4** — Three scales working together: silhouette-scale masses, mid-scale panelling and
  course lines, and micro-scale fittings (bolts, joints, litter, worn paving). Density is
  highest around the fountain where the eye lands and deliberately sparse in the open floor so
  the composition can breathe. None of it is noise added for its own sake.

### `ground_treatment` — weight 6

- **0** — Studio's stock Baseplate, visible unmodified past the edge of whatever was built on
  it. Or one flat part in a default colour spanning the whole scene. This is the single most
  common Golem failure and the reason it is also a hard fail.
- **2** — A purpose-built floor: a distinct part with a chosen material and colour, and a
  border defining where it ends. It is no longer a baseplate, and it is still one uniform
  plane with nothing happening on it.
- **4** — Slate paving with a radial inlay ring around the centrepiece, a contrasting border
  course, Grass planting beds cut into it with a raised kerb at the transition, worn cobbles
  along the desire line between the two busiest entrances, and a threshold change of material
  at each approach.

---

## 6. What this rubric cannot measure

Being honest about the boundaries, because a number that is trusted beyond its evidence is
worse than no number.

**It cannot see motion.** Everything is judged from still frames. Animation quality, particle
behaviour, moving-platform timing, whether a flickering light flickers convincingly — all
invisible. A scene that looks static-good and moves badly scores the same as one that does
both well.

**It cannot play the game.** `spatial_flow` is judged from a top view and an eye-level frame,
not from walking the space. Whether a jump is actually landable, whether a corner catches the
camera, whether the route is fun — none of that is here. The coding suite does not cover it
either. This is the biggest gap in the pair.

**It is only as consistent as the vision judge.** The structural hard fails are deterministic;
the 20 dimension scores are not. The same scene judged twice may move by a point on subjective
dimensions like `atmosphere_mood` or `scene_cohesion`. Treat single-run deltas under ~0.3 as
noise, and prefer hard-fail transitions and multi-task means as your signal. Storing critiques
verbatim in `regression/` is what makes judge drift detectable at all.

**It cannot check the ground truth of what the judge claims to see.** If the model says
"benches grouped in threes" and there are four, nothing catches it. The justification
requirement makes hallucination *visible on review* rather than *impossible*.

**Taste is encoded, and the encoding is opinionated.** The anchors describe a particular
competent-Roblox-environment-art style. A deliberately minimal, flat-shaded, or brutalist
aesthetic would be marked down for low `surface_detail_density` and thin `material_variety`
even if it were a strong, coherent artistic choice. This rubric measures distance from a
default professional style, not artistic merit in general.

**It cannot measure performance honestly.** `technical_hygiene` reads part counts and
anchoring, which is a proxy. Real frame-rate cost on a mid-range mobile device — draw calls,
transparency overdraw, light count, mesh complexity — is not measured. A scene can score well
here and run badly.

**It does not know what the user actually wanted.** `prompt_fidelity` is judged against the
literal prompt plus the task's authored expectations. A user with a specific unstated picture
in their head can get a 4/4 scene they dislike. Intent beyond the words is out of scope.

**It cannot score novelty or delight.** The rubric rewards competence and coherence. A scene
that is technically unremarkable but genuinely charming, funny or surprising has no dimension
to score that on — and neither does a scene that is flawlessly executed and completely
forgettable. Both land in the same place.

**Small-N.** Twelve tasks, one scene each. A single lucky or unlucky build moves the suite
mean by more than 8%. Use it to detect large regressions and large improvements, not to
adjudicate close calls between two prompt variants.
