# Visual regression evidence

Every visual eval run leaves a complete, self-contained evidence trail on disk: the pixels
that were judged, the metrics that were measured, the critique that was returned, and the
score that came out. Nothing here is derived at read time — if a score changes six months
from now you can open the two runs side by side and see exactly which screenshot and which
justification moved.

This matters more for visual grading than for the coding suite. A Luau check is
reproducible from the task file alone; a visual judgement is not, because it depends on a
render and a vision model. So we keep the evidence.

## On-disk layout

```
regression/
├── README.md
├── _template/                      copy this to start a run by hand
│   ├── run.json
│   └── <taskId>/
│       ├── metrics.json
│       ├── critique.json
│       └── screenshots/.gitkeep
│
└── <runId>/                        one directory per run — see "Run ids" below
    ├── run.json                    run-level metadata (model, commit, timestamp, gate)
    ├── summary.json                every task's score, written after grading
    ├── vis-01-lamppost/
    │   ├── screenshots/
    │   │   ├── hero.png
    │   │   ├── front.png
    │   │   ├── side.png
    │   │   └── eye.png
    │   ├── metrics.json            structural capture (see schema below)
    │   ├── critique.json           what the vision judge returned, verbatim
    │   ├── score.json              gradeVisual() output for this task
    │   └── notes.md                optional human commentary
    ├── vis-02-bedroom/
    │   └── ...
    └── vis-12-polish-ugly-scene/
        ├── before/                 polish tasks capture the seed scene too
        │   ├── screenshots/
        │   └── metrics.json
        └── after/
            ├── screenshots/
            ├── metrics.json
            ├── critique.json
            └── score.json
```

### Run ids

`<YYYY-MM-DD>-<label>` — for example `2026-08-30-baseline-clay`, `2026-09-02-materialpass-clay`.
The label names the *change under test*, not the date of the idea. Keep the model key in the
label when comparing models rather than prompt changes.

A before/after comparison is two run directories with the same task ids. There is no separate
"before" concept at the run level: the earlier run *is* the before.

## File schemas

### `run.json`

```json
{
  "runId": "2026-08-30-baseline-clay",
  "startedAt": "2026-08-30T21:04:11.000Z",
  "model": "clay",
  "gitCommit": "a1b2c3d",
  "judgeModel": "iris",
  "rubricVersion": "1.0.0",
  "gate": { "passThreshold": 2.6, "hardFailCap": 1.4 },
  "notes": "baseline before the material-selection prompt change"
}
```

### `metrics.json`

The structural capture, produced by the Studio plugin's software renderer
(`apps/plugin/src/Render.luau` → `Render.capture`) plus a scene probe for the blocks the
renderer does not see. The grader accepts the renderer's shape directly and lifts
`views[].meta` for you.

```json
{
  "taskId": "vis-03-plaza",
  "subject": "game.Workspace",
  "boundsSize": [124.0, 31.5, 121.0],
  "views": [
    { "name": "hero", "image": "screenshots/hero.png",
      "meta": { "width": 320, "height": 240, "partsConsidered": 946, "partsVisible": 612,
                "partsOffCamera": 41, "subjectCoverage": 0.52, "distinctColours": 34,
                "materials": [{ "material": "Slate", "parts": 188 }] } }
  ],
  "materials": [{ "material": "Slate", "parts": 210 }],
  "distinctColours": 36,
  "ground":   { "isDefaultBaseplate": false, "parts": 84, "materials": ["Slate", "Grass"], "recoloured": true },
  "lighting": { "changedProperties": ["ClockTime", "Ambient"], "lightInstances": 14, "effects": ["Atmosphere"] },
  "parts":    { "total": 946, "unanchored": 0, "anchoredPct": 1.0, "smallPropCount": 311,
                "tallestStuds": 31.5, "medianHeightStuds": 2.4 }
}
```

`ground`, `lighting` and `parts` are **required**. They are what the hard-fail rules read, and
a capture missing them is graded `invalid` rather than passed — a broken probe must never be
able to launder an ugly scene into a PASS.

`image` paths are relative to the directory holding `metrics.json`.

### `critique.json`

Exactly what the vision judge returned, unedited. Every rubric dimension, an integer 0-4, and
an observed justification of at least 25 characters naming what was seen and in which view.

```json
{
  "taskId": "vis-03-plaza",
  "dimensions": {
    "composition": { "score": 3, "justification": "Top view shows the fountain off-centre on a third..." }
  },
  "defects": [{ "id": "untrimmed-junctions", "where": "eye", "detail": "bench legs meet paving with no trim" }],
  "observedLandmark": "the tiered stone fountain",
  "summary": "Two sentences: what it looks like, and the biggest thing wrong."
}
```

Keep it verbatim even when it is wrong. A judge that hallucinates is itself a finding, and you
can only see that by diffing critiques across runs.

### `score.json`

The `gradeVisual()` result object, written as-is. Contains `pass`, `rawTotal`, `total`, `cap`,
`hardFails[]` with evidence strings, `criticalFloorViolations[]`, `dimensions[]` with per-
dimension weights and contributions, plus any `errors` and `warnings`.

## Workflow

```sh
cd packages/evals/tasks-visual

# 1. capture — build each task in Studio, then render + probe into a run directory
#    (driven by the plugin; each task writes screenshots/ + metrics.json)

# 2. critique + grade, live
API_BASE=https://<worker-host> ADMIN_KEY=... \
  node grade-visual.mjs --task vis-03-plaza \
    --metrics regression/2026-08-30-baseline-clay/vis-03-plaza/metrics.json \
    --model iris --json > regression/2026-08-30-baseline-clay/vis-03-plaza/score.json

# 3. re-grade an existing run offline — no model call, fully deterministic
node grade-visual.mjs --dry-run --run regression/2026-08-30-baseline-clay

# 4. grade a single canned pair (what the unit tests do)
node grade-visual.mjs --dry-run --task vis-03-plaza \
  --metrics fixtures/metrics-blockout-plaza.json \
  --critique fixtures/critique-all-fours.json
```

`--dry-run --run <dir>` re-scores every task in a run from its stored `critique.json`. Use it
after a rubric or weighting change to see how existing evidence re-scores without paying for
another judging pass — that is the cheapest way to sanity-check a rubric edit.

Exit code is `0` only if every graded task passed, `1` if any failed, `2` on a usage or
evidence error.

## Comparing two runs

Grade both, then diff the `score.json` files. The fields worth watching, in order:

1. **`hardFails[]`** — a hard fail appearing or disappearing is the single biggest signal.
   Going from four hard fails to zero is a bigger win than any dimension score change.
2. **`total`** — the capped score. This is the headline number.
3. **`rawTotal` vs `total`** — a large gap means the cap is doing the work; the scene is
   still structurally broken even if the judge liked it.
4. **Per-dimension `score` deltas** — where the improvement actually landed. Expect
   `ground_treatment`, `material_variety` and `lighting_setup` to move first, since those are
   the cheapest fixes.
5. **`defects[]`** — defect ids that persist across runs are your standing backlog.

Do not compare `pct` across rubric versions. `rubricVersion` is recorded in every `score.json`
for exactly this reason: a weight change invalidates cross-version comparison, and re-grading
the old evidence under the new rubric (step 3 above) is the correct way to compare.

## What to commit

Commit `metrics.json`, `critique.json`, `score.json`, `run.json` and `summary.json` — they are
small, they diff usefully, and they are the actual record.

Screenshots are the bulky part. Commit them for **baseline runs and runs that changed a
conclusion**; for routine runs, keep them locally or in object storage and leave a
`screenshots/SOURCE.txt` naming where they went. A score with no recoverable pixels behind it
is an assertion, not evidence — so never delete the screenshots for a run you are still
citing.
