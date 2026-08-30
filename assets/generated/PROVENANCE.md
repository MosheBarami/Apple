# Generated asset provenance and QC log

Every 3D asset generated for Golem is recorded here with its source, licence, cost, QC verdict and
— critically — whether it was **accepted or rejected**, with the reason. An asset a generator
returned successfully is not an asset that is usable.

## Licence position

Meshy is on a **Premium** plan for this account. Meshy's terms grant asset ownership to premium
subscribers ("If you are on a premium plan, you own all assets"), as against the free tier which
grants only CC BY 4.0. Assets below are therefore owned outright and need no attribution.
Confirmed by the owner on 2026-08-31.

Meshy is a **build-time resource only**. It is never called at runtime, never on a user's behalf,
and no user action can cause a credit to be spent. Nothing in `apps/worker` or `apps/plugin`
references it.

## Credit ledger

| # | Task | Model | Credits | Running balance |
|---|---|---|---|---|
| — | opening balance | — | — | 2,180 |
| 1 | `golem-hero` preview | meshy-6 text-to-3d | 20 | 2,160 |
| 2 | `golem-hero` texture refine (PBR, 2K) | meshy-6 refine | 10 | 2,150 |
| 3 | `golem-blocks` preview (retry after reject) | meshy-6 text-to-3d | 20 | 2,130 |
| 4 | `barrel` preview (capability probe) | meshy-6 text-to-3d | 20 | 2,110 |

**Spend stopped at 70 credits of 2,180 (3.2%).** Three generations were enough to establish where
this tool wins and where it does not; spending more before that question was answered would have
been waste, not thoroughness.

## Assets

### `golem-hero` — REJECTED (visual quality)

- Tasks: `01a054b9-2df3-736b-92a0-027e71268183` (preview), `01a054bd-09a0-76ae-99aa-a310b9795c15` (refine)
- Prompt asked for: *"friendly stone golem carved from warm honey-coloured limestone blocks, blocky
  humanoid form, deep chisel marks, glowing amber rune in the chest, moss in the crevices"*
- Files: `golem-hero-preview.glb` (6.57 MB), `golem-hero-textured.glb` (18.02 MB + 7.35 MB PBR maps)

**Structural QC** — `node packages/evals/src/glb-inspect.mjs … --profile web_hero --height 2.0`:

| check | verdict | detail |
|---|---|---|
| triangles | **FAIL** | 365,226 (max 60,000). `target_polycount: 18000` was ignored because `should_remesh` defaults to false on meshy-6 |
| file_size | **FAIL** | 18.02 MB (max 3.50 MB) |
| texture_size | **FAIL** | 7.35 MB of PBR maps (max 2.50 MB) |
| origin_at_base | **FAIL** | bounds base at y = −0.951, so the pivot is at the model's **centre** and it would sink halfway through the floor. `origin_at: 'bottom'` only takes effect when `auto_size: true` — my error, now documented |
| has_material / textured | ok | 1 material, base colour present after refine |
| triangulated / not_degenerate | ok | all TRIANGLES, bounds 1.57 × 1.90 × 0.80 |
| scale_plausible | ok | 1.90 against an intended 2.0 (ratio 0.95) |

**Visual QC** — rendered from four angles and inspected. This is the check that actually decided it:

> The model is an organic **skeletal** figure: a grinning skull face with hollow eye sockets,
> anatomically human hands with fingers, bare feet with individual toes, smooth pale bone-ivory
> surfaces. There are no chisel marks, no block construction, and no carved rune — the chest feature
> reads as a small orange smear. It is unsettling rather than friendly, which inverts the brand.

**Verdict: rejected.** Not shipped anywhere. Kept only as evidence.

**What this demonstrates:** every structural check except size passed on an asset that is completely
unusable. Polygon counts cannot tell you a model looks wrong. This is the 3D counterpart of the
scene-quality problem — *"do not assume a generated model is good because generation succeeded"* —
and it is why the pipeline has a visual step and not only a metrics step.

**Lessons folded back into the pipeline:**

1. Pass `should_remesh: true` alongside `target_polycount`, or the count is silently ignored.
2. `origin_at` requires `auto_size: true`; otherwise the pivot lands at the centre. Verify the pivot
   on every import rather than trusting the request.
3. "Golem" reads to the generator as a fantasy creature. Character prompts must state the negative
   space explicitly (no face, no fingers, no toes) and describe construction, not personality.
4. A generated character is not automatically better than a good procedural one. The site's
   hand-built three.js golem is on-brand, weighs nothing and is animatable; a generated mesh has to
   beat that, not merely exist.

### `golem-blocks` — REJECTED (prompt adherence)

- Task `01a054c1-0026-7353-98b5-edd1a7c0182a`, file `golem-blocks-preview.glb` (0.77 MB)
- Retry with the negative space stated as explicitly as the 600-character limit allows:
  *"NO FACE: the head is a plain rectangular stone block, no eyes, no mouth, no skull, no features…
  blunt mitts with no fingers… flat rectangular feet with no toes… like carved building blocks, not
  a creature."*

**Structural QC: everything passed except materials** (it is an untextured preview) —
20,800 triangles, 0.77 MB. `should_remesh: true` worked: 365k → 20.8k, a 17× reduction.

**Visual QC: rejected.** The output is an anatomically muscular human male — defined pectorals and
abdominals, a **face with eyes, nose and mouth**, hands with **individual fingers**, feet with
**individual toes** — wearing a stone loincloth. Every negative instruction was ignored.

**Finding: text-to-3D does not honour negative prompts, and "humanoid" attracts hard toward human
anatomy.** Two attempts with progressively more explicit negation both produced organic humans. This
is a property of the tool, not a bad roll, and it means **stylised blocky characters are not
reachable by text-to-3D** at this quality bar.

**Consequence for the asset strategy:** the site keeps its hand-built procedural three.js golem. It
is on-brand, weighs nothing, animates, and is driven by a state machine — a generated mesh would
have to beat all of that, and neither attempt came close to matching even its silhouette.

### `barrel` — REJECTED for shipping, ACCEPTED as evidence

- Task `01a054c3-23e4-7647-ba08-a1591244710f`, file `barrel-preview.glb` (0.17 MB)
- Generated with `auto_size: true` + `origin_at: 'bottom'` + `should_remesh: true`.

**Structural QC passed the geometry checks** — 2,931 triangles, 0.17 MB, and critically
**`boundsMin.y = 0.00`: the pivot is exactly at the base.** This confirms the `golem-hero` pivot
diagnosis: `origin_at` is ignored unless `auto_size: true` is also set. The fix works.

**Visual QC: the form is correct — bulging staves, three hoop bands, a chipped rim — but the
execution is crude.** At a Roblox-appropriate 2.9k triangles the stave separations became jagged
triangular gashes rather than clean grooves, and a small detached fragment floats beside the barrel
in two of four views.

**Finding: for simple rotationally-symmetric props, procedural geometry BEATS generation.** A barrel
from a cylinder plus three thin hoop cylinders is cleaner, sharper, cheaper, has no stray geometry,
and is trivially recolourable. Generation earns its place on irregular and organic forms — foliage,
rock formations, curved vehicle bodywork — which is exactly what the decision table in
`docs/ASSET-PIPELINE.md` already says.

## What 70 credits bought

Three concrete, reusable findings rather than three assets:

1. `should_remesh: true` is mandatory alongside `target_polycount`, else the count is ignored
   entirely (365,226 triangles against a requested 18,000).
2. `origin_at` requires `auto_size: true`, or the pivot silently lands at the model's centre.
   Verified in both directions: broken without it, exactly 0.00 with it.
3. Text-to-3D ignores negative prompts and pulls hard toward organic human anatomy. Blocky and
   stylised characters are out of reach; organic and irregular forms are where it earns its keep.

All three are folded into `docs/ASSET-PIPELINE.md` and enforced by
`packages/evals/src/glb-inspect.mjs`, which caught every one of these failures automatically except
the two that required looking at the render.
