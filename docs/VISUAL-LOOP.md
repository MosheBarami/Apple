# The visual intelligence loop

Golem used to decide a scene was finished by reading object properties. That is how it built a flat
grey slab with four primitive poles and a three-cylinder "trophy", verified that every requested
object existed, and reported success. Properties cannot tell you a scene is ugly.

This document describes the machinery that makes it **look**.

## The problem: Studio will not give a plugin pixels

Verified empirically against live Roblox Studio (placeId 123864611037141, edit mode) rather than
read from documentation:

```
game:GetService('ThumbnailGenerator')     NO  — 'ThumbnailGenerator' is not a valid Service name
game:GetService('CaptureService')         OK  — the service exists
CaptureService:CaptureScreenshot(cb)      callback never fires in edit mode (4s timeout, contentId nil)
AssetService:CreateEditableImage          OK  — returns EditableImage
EditableImage:ReadPixelsBuffer            OK  — returns buffer
```

The Studio MCP's own `screen_capture` also times out in edit mode, independently confirming it.

So pixel *readback* exists, but there is no way to get the rendered viewport into a buffer. There is
no supported path from a plugin to a screenshot.

## The answer: rasterise the scene ourselves

`apps/plugin/src/Render.luau` is a software renderer running inside the plugin:

- 8 unit-cube corners per part, transformed by `CFrame:PointToWorldSpace(corner * Size)`
- projected through `camCF:PointToObjectSpace` with `tanHalf`/`aspect`
- 6 faces × 2 triangles, backface-culled by `n:Dot((faceCentre - camPos).Unit) < 0`
- per-pixel barycentric coverage with **perspective-correct 1/z depth interpolation**
- Lambert shading against a fixed sun, plus a per-material response curve so materials read tonally
- distance fog, so depth ordering stays legible in a flat-shaded image
- output packed as base64 RGB (11 ms for a 176×112 frame, measured in Studio)

The Worker turns those bytes into a real PNG in `apps/worker/src/png.ts` using
`CompressionStream('deflate')`, which emits exactly the zlib stream a PNG `IDAT` chunk needs. The
plugin has no zlib; the Worker does. Each chunk's CRC32 was verified against Python's `zlib.crc32`.

`packages/evals/src/render-scene.mjs` is the same algorithm in Node, so the eval suite can grade
stored scenes with no Studio attached. The two agree: on the same scene they produced identical
material histograms, 7 distinct colours each, and subject coverage of 0.11 against 0.110.

## Camera presets

One angle hides most composition problems, so the default is multi-view:

| view | what it is for |
|---|---|
| `hero` | three-quarter establishing shot — the most informative single angle |
| `front` / `side` | orthogonal reads of silhouette and proportion |
| `top` | layout, spacing and negative space, which perspective flattens |
| `eye` | roughly player eye height — what someone standing in the scene sees |

Framing sits at **1.35×** the subject radius. It was 2.1×, which put scenes at 8–11% of frame; the
critic correctly called that "a postage stamp in a void", and it was a fault in the renderer rather
than in any scene.

## The critique

`apps/worker/src/vision.ts` sends up to three frames to GLM-5.3-flash with a structured-output
schema and gets back a score, a summary, and named defects, each carrying the view it was seen in,
what was observed, and a specific buildable fix.

Two properties matter.

**Hard-fail checks cannot be flattered.** They are computed from geometry and lighting properties,
never from the model's opinion, and any one of them caps the score at 3:

- only one material used across the scene
- over 90% of parts still on default `Plastic`
- the whole scene is a single colour
- the subject fills under 4% of every frame
- no geometry visible from any camera
- `Lighting` entirely untouched (Brightness 3, ClockTime 14.5, no lights, no Atmosphere)

**Lighting is judged from configuration, not from pixels.** The rasteriser draws one fixed sun with
no shadows, `PointLight`s, Neon glow or post-processing. A critic asked to judge lighting from those
images marks every scene down identically no matter what the builder did — a constant, not a signal.
So the render carries the real `Lighting` state alongside it, and the critic prompt says explicitly:
*"'There are no shadows' and 'the lamps emit no light' are properties of the renderer. Reporting them
is a false finding — do not."*

## The agent-facing tools

| tool | what it does |
|---|---|
| `render_view` | renders one or more angles, returns metrics only — images are ~60 KB and tool results are re-sent on every later step |
| `inspect_visually` | renders all angles, runs the critique, returns score, defects and fixes |

`inspect_visually` failing sets `visualDefectsFound` on the run, which the adaptive reasoning policy
reads to escalate the next step to high effort: the model's own judgement was wrong, so buy better
judgement rather than repeat the same cheap attempt.

## Failure semantics

A critique that cannot be parsed returns `unavailable: true` with a **null** score, not zero. Scoring
a tooling fault as 0 would send the agent off "fixing" work that may be fine, and would let an
infrastructure problem masquerade as a quality verdict. The parser also salvages a response
truncated by the output budget rather than discarding the whole call.

## What it costs

A critique is 63–72 neurons ($0.0007–0.0008), measured. See `docs/COST-MODEL.md` for the effect on
per-build cost and daily capacity.

## What it cannot do

- **Only boxes.** `MeshPart`s, `SpecialMesh`es, `Terrain`, decals, textures and particles are not
  drawn. A scene built largely from meshes is under-represented in its own critique. This is the
  single biggest gap.
- **No shadows or light transport**, hence the configuration-based lighting judgement above.
- **No text.** `SurfaceGui`/`TextLabel` content is invisible to the renderer, so signage legibility
  cannot be judged from pixels.
- **One model's taste.** The hard-fail checks are objective; the 0–10 score is not, and has not been
  calibrated against human ranking at scale.

## Visual self-correction as production behaviour

Having the tools is not the same as using them. A model that *can* look at its work will still
sometimes declare success without looking, so the gate fires on its own.

When a run in Stone or Rune has changed the project, the request was classified as visual work,
Studio is connected, and the agent is about to reply without ever having inspected the result, the
session runs `inspect_visually` itself. If the gate fails, the critique is pushed back into the
conversation as work to do and the loop continues, exactly as if a user had said "this doesn't look
right, here's what's wrong".

It is charged **once per run** (`autoCritiqued`) and only fires with steps still in hand, so it can
neither loop nor surprise the budget. Cost is one critique, 63–75 neurons.

There is a second guard alongside it. A build request that ends in prose with no tool call has
failed, whatever the prose claims — measured, the model replied *"One part is still Plastic —
finding and fixing it, then a visual inspection:"* and stopped, announcing work it never did. When a
builder-mode run is about to end without having changed anything, it is steered back to act rather
than allowed to report success. Bounded by `MAX_NUDGES = 2`.

## What the loop actually cost to get working

Four real defects were found and fixed by running it, none of which were visible from reading code:

1. **Output truncation.** Raising the quality bar in the prompt made the model emit a 5,326-character
   `run_luau` build script. At 2,400 output tokens that was guillotined mid-JSON
   (`finish_reason: "length"`), the tool call was unparseable, and **the agent silently built
   nothing while reporting "Done."** Budgets are now sized for what a build costs to express
   (Stone 4,400 base, ceiling 5,600) and the prompt tells the model to build in staged calls.
2. **Step limits.** Stone allowed 8 steps, which the visual loop consumes on its own — build,
   render, critique, fix, re-render. A lamp-post build hit the ceiling mid-work, left scaffolding
   in the scene and never finished its detail pass. Now 16 for Stone, 24 for Rune.
3. **Narration instead of action**, fixed by the nudge above.
4. **A harness bug of my own**: the benchmark did not wait for the agent to be idle before starting
   the next task, so an entire ladder run reported "a run is already in progress" on all four tasks
   — errors that had nothing to do with any scene.

The measured effect of (1) and (2) on one task: a lamp post went from a 4-part grey stick to
**86 parts across 4 materials with glass mullions and a light**, and the critic's complaints moved
from "there is a stray concrete slab and no mullions" to "the column does not taper and the base
lacks ornament" — a strictly deeper class of problem.
