# Roblox Studio acceptance — `Place1.rbxl`, 2026-09-22

**Session:** `5d1aafd5-11c0-4eab-a75e-004ea7c8d618` — `Place1.rbxl`, Edit mode, Edit DataModel.

**What this is:** the plugin's documented premises and the data contract the agent depends on,
verified against a **live Studio session**, read-only. Every value below was returned by Studio, not
read out of a file.

**What this is not:** a paired end-to-end run. Pairing needs the plugin installed in Studio and a
signed-in session, and neither was available. The claim "the agent built something in Studio" is
**not** made here and should not be inferred. See "What remains unproven".

---

## 1. §H/§I describe a component that does not exist, and cannot

The brief asks for a `StudioCapture` built on `CurrentCamera.ViewportSize`, a full-viewport
`CaptureSize`, `OutputSize` and `ResamplerMode`, with a software-render fallback. There is **no
`StudioCapture`** anywhere in `apps/plugin`. `apps/plugin/src/Render.luau` opens by saying why:

> Roblox gives Studio plugins no way to read the rendered viewport. ThumbnailGenerator is not a valid
> service for plugins and CaptureService's callback never fires in edit mode (**both verified against
> real Studio**).

That parenthetical was re-verified on this session rather than taken on trust:

```
game:GetService('ThumbnailGenerator')
  → error: 'ThumbnailGenerator' is not a valid Service name

game:GetService('CaptureService')
  → CaptureService, and .CaptureSaved exists as a member
```

So the first half of the premise is **true on this Studio version**: a plugin cannot obtain
`ThumbnailGenerator`. The renderer is therefore a **software rasteriser** — perspective projection,
per-pixel depth buffer, lambert shading, per-material response — and that is a design the platform
forces rather than a shortcut.

## 2. §I's operative requirement is met: the software render identifies itself

The clause that matters in §I is *"software-render fallback must identify itself"*. It does, on every
path that emits a frame:

| producer | value |
|---|---|
| `do/session.ts:4762` | `source: 'software_render' as const` |
| `tools.ts:694` | `source: 'software_render'` |
| `frame-bus.ts:291,301` | `source: input.source ?? 'software_render'` |
| `web/routes/studio-preview.tsx:44` | `source:'software_render'` |

`StudioFrame.source?: 'studio_viewport' | 'software_render'` is optional, and its doc says
*"Absent means a legacy software-render frame"* — the same backward-compatibility reasoning as
`encoding?: 'rgb24' | 'rle24'`. Absence implying software is a **correct** inference here because
software is the only renderer that has ever existed; `'studio_viewport'` appears **nowhere** in the
repository. The direction that would be dishonest — presenting a software render as a real capture —
requires a value nothing produces.

The UI holds the same line in prose that reads like it was written by someone who had been burned
(`web/src/lib/playtest-view.ts`):

> A STALE FRAME IS STILL SHOWN, AND STILL LABELLED. Hiding it would throw away the last thing we
> actually know. Showing it unmarked would be a lie.

> WHAT IS DELIBERATELY ABSENT: any notion of "live video", any frame interpolation, any smoothing
> between frames, and any placeholder image. The plugin rasterises geometry on demand — there is no
> video stream at any price, so a card that implied one would be dressing periodic stills up as
> something they are not.

That is §H's "native snapshots are periodic, not video" requirement, enforced in the renderer, the
wire type and the card.

## 3. Bounded, aspect-preserving output — the real numbers

`Render.capture(rootPath, view, width, height)` clamps what it is given:

```luau
local w = math.clamp(width, 48, 320)
local h = math.clamp(height, 32, 240)
```

and `renderView` derives `local aspect = width / height` from those clamped values and uses it in
the projection. So the output is bounded and the aspect is whatever the caller asked for, never
assumed.

**The live viewport is not 16:9**, which is why the assumption would have been wrong to bake in:

```
workspace.CurrentCamera.ViewportSize → 1531, 755        (2.028:1)
```

The brief's §H asks for a padded 16:9 capture. That is the right rule for a *viewport capture*, and
this is not one — the output size is an explicit clamped parameter and the camera supplies the
framing. The requirement's intent (bounded, aspect-preserving, never stretched) is satisfied; the
mechanism differs because the platform forbids the one the brief describes.

## 4. §J confirmed on real data: geometry is readable per node

```
workspace.Baseplate   Position 0, -8, 0   Size 2048, 16, 2048   Material Plastic
BaseParts in workspace: 3      with Vector3 Position and Size: 3
top level: Camera, Terrain, Part:Baseplate, Folder:Checkpoints, SpawnLocation
```

Every BasePart exposes real `Vector3` geometry, which is what `Ops.luau:173` serialises and what the
agent reasons about. And the sample validates a guard in the renderer that would otherwise look
arbitrary:

```luau
-- Anything this big in plan is a baseplate-style ground plane. It is drawn, but excluded from
-- framing maths so a 2048-stud Baseplate cannot dominate the camera fit.
local GROUND_PLANE_STUDS = 600
```

The place contains **exactly** a 2048-stud Baseplate. `Render.bounds` (line 117) and
`Render.layoutSummary` (line 348) both skip parts above 600 studs, so the camera fits the scene
rather than the ground. `layoutSummary` additionally bounds itself at `MAX_PARTS = 1500`.

## 5. What remains unproven

Stated plainly, because the rest of this document is measurements and this is the absence of one.

- **The paired loop was not exercised.** Plugin → `SessionDO` long-poll → agent → Studio, end to
  end, needs the plugin installed in Studio and a signed-in session. Without it, nothing here shows
  that a prompt produces a build. The `propose_plan`/verifier property (§P) was verified as code and
  as a passing guard (`apps/worker/tests/propose-plan.test.mjs`, 32/32 with `run-plan.test.mjs`) —
  which proves the trap is closed in the implementation, **not** that a real run survives it.
- **`CaptureService.CaptureSaved` was not observed failing to fire.** The service and the callback
  exist on this version; the claim that the callback never fires *in edit mode* would need a live
  subscription and a wait. The half of the premise that decides the architecture —
  `ThumbnailGenerator` being unobtainable — was verified directly.
- **No rendered image was produced.** Running the rasteriser requires the module loaded in the
  DataModel with its `Paths` dependency, i.e. the plugin installed. Loading a modified copy to make
  it run would have measured the copy, not the product.

---

## Correction, appended 2026-09-22 ~21:35 IDT (release-path pass). The text above is left as written.

**This document evaluated the wrong plugin.** Every source reference above — `apps/plugin/src/Render.luau`,
`Ops.luau:173`, "no `StudioCapture` anywhere in `apps/plugin`" — is to the **legacy** plugin. The plugin
this product ships is **`apps/apple-plugin`** (decided in `f6ad60a`, 2026-09-19; `apps/plugin/README.md`
opens "NOT THE PRODUCT"), published on the Creator Store as "Apple Studio", asset 107230158271368.
The Studio measurements themselves (§1's `GetService` results, §3's `ViewportSize`, §4's Baseplate
geometry) are observations of Studio and stand; the conclusions drawn from the legacy source do not.

What changes, measured against the working tree at ~21:30 IDT:

- **§1 — `StudioCapture` does exist**, in the shipped plugin: `apps/apple-plugin/src/StudioCapture.luau`
  (9,328 B, created 03:36 IDT today, uncommitted), which calls `StudioCaptureService` and reads
  `CurrentCamera.ViewportSize`; `Commands.luau` requires it. It is in the built artifact:
  `apps/apple-plugin/scripts/verify-artifact.py` on the 21:19 build of
  `apps/apple-plugin/release/apple-studio.rbxm` finds `StudioCaptureService` ×7 and
  `StudioCaptureScreenshotFormat` ×2 (exit 0), and `apps/apple-plugin/tests/studio-capture.test.mjs`
  passes. It existed for ~16 hours before this document was written (at 20:07 IDT).
- **§2 — `'studio_viewport'` is produced**, in the working tree: `StudioCapture.luau` emits
  `source = "studio_viewport"`, `apps/worker/src/frame-bus.ts` defaults PNG frames to it, and
  `apps/web/src/components/ws/playtest-card.tsx` branches on it. "Appears nowhere in the repository"
  was true only of the last commit (`git grep studio_viewport HEAD` finds nothing), not of the tree.
  §2's honesty property — a software render is labelled `software_render` — is unaffected.
- **§3 and §4 carry over to the shipped port**: `apps/apple-plugin/src/Render.luau` has the same
  `math.clamp(width, 48, 320)` / `math.clamp(height, 32, 240)` and `GROUND_PLANE_STUDS = 600`; the
  serialiser the agent reads is `apps/apple-plugin/src/Commands.luau`, not `Ops.luau`.
- **What customers have today is narrower still.** The Creator Store serves the 1.0.0 build uploaded
  2026-09-19 (toolbox-service: 5 scripts, never updated), which predates `StudioCapture`. So for a store
  user, "no native capture" is — inferred from the script count, the published bytes were not inspected
  — true today; for the source it is false. The source now reports itself as 1.1.0
  (`apps/apple-plugin/src/Bridge.luau`) so the two cannot be confused.

Not re-measured by this correction: anything in Studio. No pairing, capture or render was run.
