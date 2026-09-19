# What the shipped plugin actually withholds — measured, not counted from a grep

Round 2 of the fresh-context customer review named this as blocking defect #2:

> **Pricing sells "quality-gated builds" as the allowance unit; the shipping plugin withholds the
> gate.** That withholds nine tools, including **four of the five** `VERIFIER_TOOLS`.

Two of those three claims are right. The headline is wrong, and it is wrong in the direction that
would have had me delete a true sentence from the pricing page.

## The count, from the registry rather than from a search

`tools.ts` bundled and imported, every tool's `studioOps` intersected with the plugin's
`UNSUPPORTED` table (`Commands.luau:3438-3442`: `run_code`, `run_mode`, `inspect_model`):

```
total tools: 59 | studio tools: 35
withheld by the three shipped refusals: 11

  run_luau, run_and_check, set_mood, add_effect, audit_build, run_spec,
  remove_effect, check_composition, inspect_model, design_sound, assign_sounds

VERIFIER_TOOLS withheld : run_and_check, run_spec, audit_build, check_composition
VERIFIER_TOOLS surviving: inspect_visually
```

**Eleven, not nine** — the review undercounted by two (`design_sound`, `assign_sounds`), because
counting call sites of a name is not the same as resolving the dependency.

Four of five verifiers withheld: correct.

## But the gate itself survives, and it ran

`inspect_visually` — the thing the product calls the quality gate — requires `render_view`, and
`render_view` is **not** in `UNSUPPORTED`. The plugin reports it unsupported only when the renderer
module is absent from the build (`Commands.luau:3672-3676`), and `scripts/verify-artifact.py`
REQUIRES `rasterTri` ×3 and `Render.capture` in the shipped bytes, so it is present.

Source reading is how the last version of this claim went wrong, so it was run instead. Against the
live product, over the pairing from this evening, with **edits off**:

> Render the current camera view and run the visual critique on it. Do not change anything.

It worked, and it did not need edit consent — rendering is a read:

```
Project stage · 6 diagnostic renders
"Diagnostic render from Studio — geometry only, not a viewport"
game.Workspace · eye · 288×180
```

and the critique came back with measured numbers, not adjectives:

```
Score 1/10 — FAILS the quality gate
  edge density        0.043
  colourfulness       1.45   (gate wants > 12)
  mass concentration  0.615
  materials           100% Plastic
```

The scene was one grey `ConsentProbe` part, so 1/10 is the right answer, and a gate that returns
1/10 for a grey slab is a gate that discriminates. **"Quality-gated builds" on the pricing page is
a claim the shipped plugin can keep.**

## What was actually wrong, and is now fixed

`/changelog` advertised two withdrawn capabilities with nothing to tell a reader they were gone —
`run_and_check` in the tool trace, and "Starts and stops run mode" in the plugin list — while
`/docs/plugin` correctly said the plugin refuses both. A changelog records what shipped on a date
and must not be rewritten, so both now carry the page's existing dated-forward `release__since`
annotation, as Super Agent already did. The stale `GLM-XXXXXX` pairing format got the same
treatment: codes are six characters with no prefix, which is what the pairing dialog handed over
tonight (`ZSZC8D`).

## Not verified

- Whether the eleven withheld tools are withheld *in practice* for a paired session.
  `filterToolsForPlugin` is what does it (`do/session.ts:4393`) and its behaviour here was read, not
  exercised; what was exercised is that a tool needing `render_view` ran.
- Whether the 77-Credit build figure still matches a build made with eleven fewer tools. It was
  measured at 511 neurons on a run that had them. That number is now suspect in the cheap direction
  and is worth re-measuring before anyone quotes it as a ceiling.
- Any critique score other than one, on one scene. A gate that says 1/10 for a grey slab has been
  shown to discriminate at one end only.
