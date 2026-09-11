# The activity vocabulary becomes canonical, and stops being three tables

**Date:** 2026-09-01 · **Mission §16.1 Board C (C01–C18), Phase H.**

## What was actually there

Three copies of one tool table:

| table | file | entries |
|---|---|---|
| `TOOL_KIND` | `ws/activity-model.ts` | 24 |
| `STEP_LABEL` | `ws/activity-model.ts` | 24 |
| `TOOL_LABEL` | `ws/thinking-model.ts` | 23 |

The two label tables were word-for-word identical across all 23 shared entries. A
fourth, `phaseForTool`, lives in `packages/shared` under a comment saying it is kept
there "so both sides cannot drift".

They had drifted in both directions a copy can:

- **Missing.** None of the three web tables knew `generate_image`. A run that
  generated one rendered the underscore-stripped fallback — `generate image` — beside
  steps that read as written sentences. `phaseForTool` did not know it either, so the
  workspace announced phase `building` for it, from the `default` arm. That happened
  to be the right phase, which is why it survived: a correct answer nobody had chosen.
- **Phantom.** Two web tables carried `visual_critique`, which is not a tool at all —
  it is the name of a JSON schema in `apps/worker/src/vision.ts`. Vocabulary for a
  tool that cannot run reads exactly like coverage from the inside.

## What changed

`apps/web/src/components/ws/tool-vocabulary.ts` is now the single table, and both
models import it. `ACTIVITY` carries the canonical Board C identifier on every entry.

Three C-series activities existed in the reference set but had been collapsed into
their neighbours, and all three are separable from the event stream:

- **C04 Searching knowledge** — `search_docs` was reported as "Inspecting project".
  It reads Roblox's documentation, which is not in the user's place at all.
- **C06 Reading scripts** — `read_script`, `list_scripts`, `search_scripts` were also
  "Inspecting project". The instance tree and the code answer different questions.
- **C08 Editing project** — `set_properties` and `delete_instances` were "Building
  world". Changing what exists is not the act of building it.

Two are declared as **not modelled**, with reasons, in `ACTIVITY_NOT_MODELLED`:

- **C10 Creating UI** — no signal exists. `tool_start` carries a tool name and a
  free-text summary and *no arguments*, so nothing distinguishes creating a ScreenGui
  from creating a wall. Matching on the summary string would be a guess wearing a
  canonical label. It needs class names on the wire first.
- **C12 Connecting Studio** — not an activity in a run. Pairing happens outside the
  agent loop and has its own surface (`connect-studio.tsx`, states M04/M05).

## What it looks like now

The Foundry Tycoon transcript's phase headings, read out of the live DOM:

```
Inspecting project | Saving project | Building world | Editing project |
Writing Luau | Playtesting | Evaluating | Inspecting project | Writing Luau |
Rendering | Evaluating | Editing project | Playtesting | Evaluating
```

`Building world → Created instances` and `Editing project → Set properties` are now
two rows. Before this change both were `building`, and adjacent same-kind steps merge
into one phase — so the second step was drawn *inside* the first heading, and the
transcript claimed Golem was building the world while it was recolouring a floor.

## Guards

`apps/worker/tests/phase-coverage.test.mjs` (3) and
`apps/web/tests/tool-vocabulary.test.mjs` (6) both read the worker's `TOOLS` registry
off disk and check it against the tables in **both** directions. Each suite first
asserts its own parse found something, so it cannot pass vacuously on an empty set.

Four mutations, each restoring one of the real historical defects:

| mutation | caught by |
|---|---|
| drop `generate_image` from `phaseForTool` | `these tools fall through to default: 'building'` |
| drop `generate_image` from the web table | `these would render as raw tool names` |
| re-add `visual_critique` to the web table | `vocabulary for tools that cannot run` |
| remove the C10 explanation | `C-series entries neither implemented nor explained` |

All four failed the suite. Restored, all green.

## Suite

`pnpm -r test`: web 232, worker 147, corpus 231, design 80, evals 1026, benchmark 4,
plugin 168 specs + 40 mutations all caught. No failures.
