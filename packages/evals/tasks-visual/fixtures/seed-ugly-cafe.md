# Seed scene — `vis-12-polish-ugly-scene`

The polish task needs a deliberately ugly starting scene so the run measures *finishing*,
not building. Build this seed once, save it as a `.rbxm` beside this file, and load it into
`game.Workspace.Cafe` before the task prompt is sent.

The point of the seed: **every object the user could name already exists.** A grader that
scores object existence would give the untouched seed full marks. The visual rubric gives it
close to zero. That gap is the entire thesis of this suite.

## Contents (all `Plastic`, all `Medium stone grey`, all anchored)

| Object | Parts | Size (studs) | Position notes |
| --- | --- | --- | --- |
| Floor slab | 1 | 40 x 1 x 30 | sits directly on the default Baseplate, no border |
| Walls | 3 | 40 x 12 x 1 / 30 x 12 x 1 | flat slabs, no skirting, no cornice, open fourth side |
| Window opening | 1 | 8 x 6 x 1 | a `Transparency 0.5` slab flush in the wall, no frame |
| Counter | 1 | 12 x 4 x 2 | single box, no front panel, no lip |
| Tables | 4 | 5 x 3 x 5 | single box each, no rim, no leg detail |
| Chairs | 8 | 2 x 3 x 2 | single box each, no back, no seat separation |
| Menu board | 1 | 6 x 4 x 0.5 | blank slab on the wall, no text, no frame |
| Door opening | 1 | 5 x 8 x 1 | hole in the wall, no jamb, no door |

Total: **20 parts. One material. One colour. Nothing under 2 studs. Lighting untouched.**

## Required seed telemetry

The capture of the untouched seed must report exactly this, so the "before" row of the
regression pair is unambiguous:

```json
{
  "boundsSize": [40, 12, 30],
  "materials": [{ "material": "Plastic", "parts": 20 }],
  "ground": { "isDefaultBaseplate": true, "parts": 1, "materials": ["Plastic"], "recoloured": false },
  "lighting": { "changedProperties": [], "lightInstances": 0, "effects": [] },
  "parts": { "total": 20, "unanchored": 0, "smallPropCount": 0, "tallestStuds": 12, "medianHeightStuds": 3 }
}
```

Graded untouched, the seed fires four hard fails — `bare-baseplate`, `single-material`,
`default-lighting`, `no-detail-props` — capping it at 0.65/4 while `prompt_fidelity` scores 3.

## What the task is allowed to change

The prompt says *"don't move stuff around"*. `forbidGeometryMove: true` on the task means the
polish pass may:

- reassign materials and colours on existing parts
- **add** parts (trim, skirting, counter lips, window frames, small dressing props)
- add and configure lights, and change `Lighting` service properties

and may **not** move, delete or resize the 20 seed parts. A run that rearranges the cafe
should be scored down on `prompt_fidelity` even if the result is prettier, because the user
gave an explicit constraint.
