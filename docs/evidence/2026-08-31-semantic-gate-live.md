# Semantic gate and rebuild trigger — live validation on real Studio geometry

Date: 2026-08-31. Project: E2E Obby. Plugin: paired and polling (the local
`.rbxm` build — see the Creator Store report for why the Store build could not
be used). Path: the real deployed worker calling the real `check_composition`
tool against real geometry read out of Studio.

**Cost: 0 neurons.** Measured by differencing the BudgetDO ledger across the run.
The gate is arithmetic, not inference, and this confirms it on the live path.

Prior status: the semantic gate was proven at TOOL level against captured
fixtures. It had never been exercised end to end through production against
geometry that was actually standing in a Studio place. It has now.

---

## Scenario B — interior requested, exterior built. GATE FIRES. ✅

Blockout: an 80x80 ground plane, a 14x16x14 cottage sitting on it, a roof, two
trees. Intent passed to the gate: *"a cozy tavern interior with a bar counter
and tables"*.

    intentMatch: requested interior; 6% of the floor is covered at 16 studs,
                 footprint 80x80 studs

    failure:     the request asked for an INTERIOR but this is built as an
                 exterior: only 6% of the floor has anything above head height
                 (want at least 35%). An interior is a space the player stands
                 INSIDE — walls enclosing a floor with a ceiling over it, and
                 the room itself should be most of the scene rather than a
                 building sitting on open ground.

    guidance:    STOP. You are not building the thing that was requested. Do not
                 add detail and do not correct this in place — the layout itself
                 is the wrong shape. Clear what you built and lay out the right
                 kind of space.

This is the failure the gate was built for, and it produced the STOP guidance
rather than letting the agent pay for detailing the wrong building.

## Scenario A — interior requested, interior built. SEMANTIC PASSES. ✅
## …but COMPOSITION FALSELY REJECTS IT. ❌

Blockout: a 40x40 floor, four walls, a ceiling, a bar counter and a table —
a correct, if plain, tavern interior blockout.

    intentMatch: requested interior; 100% of the floor is covered at 12 studs,
                 footprint 41x41 studs      <-- semantic gate: correct, passes

    failure:     no vertical variation: the tallest part is 1.002x the median
                 part height (want at least 2x) — adding more parts at the same
                 height cannot fix this

    guidance:    These are structural… Change the LAYOUT: give one element clear
                 dominance in height and mass and let everything else step down
                 beneath it.

**The semantic axis is right and the composition axis is wrong.** The walls of a
room are all about the same height as each other — that is what a room IS — so
`heightHierarchy` reads ~1.0 and the gate demands a landmark that an interior
has no reason to contain. The advice it gives is actively wrong: the layout is
correct and the agent is being told to change it.

This is the enclosed-scene false-reject measured in
`tasks-visual/composition/generalization` (68.8% on enclosed families, 0% on
open ones), now confirmed on REAL geometry through the production path rather
than on synthetic fixtures. The synthetic study and the live observation agree.

### Why this is not fixed by scoping alone

Counterfactual D in the generalization harness scoped the landmark rules away
from enclosed scenes using this same enclosure signal. Measured:

    production        false-reject 36.7%   false-pass  6.7%   accuracy 78.3%
    enclosure-scoped  false-reject 26.7%   false-pass 20.0%   accuracy 76.7%

It trades the two errors ~1:1 and accuracy falls, because nothing replaces the
removed rules — the pixel half of the gate still cannot see inside a roofed
scene, since the framing camera renders it as a lid. The render contract needs
an interior camera FIRST. That work is not done.

## Status of the §19 scenarios

| | scenario | status |
|---|---|---|
| A | interior request -> interior blockout -> semantic pass | **semantic PROVEN**; composition false-rejects (defect above) |
| B | interior request -> exterior blockout -> semantic failure -> STOP | **PROVEN live** |
| C | major visual failure -> repeated low-value passes -> rebuild trigger | tool-level only |
| D | byte-identical correction -> trigger detects no change | tool-level only |
| E | parts +15% with no score gain -> trigger | tool-level only |
| F | three visual passes in one point -> trigger | tool-level only |

C–F remain proven at tool level against fixtures. They need a full autonomous
Rune run that actually degrades, which costs real neurons and needs a scene
built for the purpose; that has not been done and is not claimed.
