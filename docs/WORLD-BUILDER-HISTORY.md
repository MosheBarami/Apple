# The world builder's revision history

`world/Build.luau` carried this at the top of the file. It was moved here on 2026-09-01 for a
reason that is not tidiness: **Studio refuses to assign a `Source` longer than 200 000
characters from a script**, and the builder had reached 190 kB with roughly 119 kB of that in
comments. The facet rewrite (F-39) pushed it over, and the loader stopped being able to install
the file at all.

So the narrative moved and the contracts stayed. What is still in the file is what someone has
to read before changing it: the idempotency rule, the single-seeded-stream rule, and the
per-system notes that sit on the code they describe. What is here is why the world looks the way
it does, which is worth keeping and is not worth 25 kB of the budget.

---

--[[
Crystal Canyon — deterministic edit-time world builder.

Run this as a plain chunk from the Studio command bar (or a build plugin) in
EDIT mode. It is not a ModuleScript and returns nothing; it does its work on
execution and prints a summary — including the four-way part split, which is
the number successive revisions of this file are measured against.

---
WHAT CHANGED, AND WHY — REVISION 4, THE GENERATED-GEOMETRY PASS
---

Revision 3 (the style-coherence pass, documented in full below) was reviewed
and two failures survived it. Both are failures of GEOMETRY rather than of
palette or placement, and both were unfixable with the vocabulary revision 3
had, which was `box`, `wedge` and a curated shelf of third-party props:

  E. THE PRIMARY LANDMARK. "tall rectangular crystal columns + stacked
     rectangular pedestal … still resembles a primitive blockout. It is the
     PRIMARY landmark and needs the highest visual quality in the map."
  C. THE CANYON WALLS. "visibly constructed from repeated rectangular blocks
     … still reads as prototype terrain. Do NOT solve by merely adding more
     bricks."

E is answered with a mesh this project GENERATED — Roblox GenerationService
(Cube), prompted for this world. C is answered with curated rock meshes,
AFTER the generated answer to it was rejected in-world.

That split is the finding of this revision, and it is worth stating plainly:
generation is not the constraint, STYLE COHERENCE is. Six of nine Cube
generations were rejected in total — three on their own render, three more
once they were seen standing in the world. A Cube mesh arrives textured, and
a textured mesh cannot be tinted into a flat-shaded palette, so it either
happens to already be in the world's language or it cannot be made to be.
The geode happens to be. The mesas were not. See § "THE CUBE FAMILIES".

  E. The crown of the monument is the accepted giant crystal geode — one
     silhouette, every shard growing from one rocky base. The dais underneath
     stays, because a stepped octagonal drum of radial ashlar is a plinth and
     that half of the criticism was already answered. The collar of authored
     box shards around it becomes the cyan Cube collectible. The monument is
     still the tallest thing in the map by a clear margin, and the summary now
     MEASURES that ratio off the built geometry instead of asserting it.
  C. The large masses along the canyon wall are BOULDER MASSES: two or three
     curated low-poly rock meshes at a new `cliff` scale tier, standing
     against the outward face with the tallest carrying the silhouette. Such
     a segment spends FEWER authored parts than a plain one, not more: the
     slabs are demoted to sealing the ring at ground level and connecting one
     mass to the next, which is what they are actually good at.

     THIS WAS CUBE CLIFF MODULES FIRST, AND THEY WERE REJECTED IN-WORLD.
     Three generated mesas were accepted on their own renders and failed the
     moment they stood in the canyon: strata banding that reads as geology at
     asset scale reads as a candy stripe against flat-shaded vertex-coloured
     rock, and a barber-pole tower on a block wall answers "reads as
     prototype terrain" worse than the wall did. A textured mesh also cannot
     take the biome tint, which is why that version had to be meadow-only and
     left the frost wall untouched. The rock mesh is untextured, so it tints,
     so BOTH walls get the relief. See CUBE_FAMILIES for the full rejection.

  Also: the upgrade pad finally has an upgrade KIOSK, which was one of the
  five families the Creator Store search came back empty on.

Two rules govern every Cube placement, and both follow from the fact that a
generated mesh is TEXTURED and so cannot be tinted:

  * THEY GO WHERE THEIR OWN COLOURS ALREADY BELONG. The geode and the cyan
    crystal read as crystal accents and are correct in either half of the
    map. Nothing else generated survived this rule: it is what disqualified
    the rust mesas, which could only ever have been canyon-only, and it is
    the reason a Cube asset can be right for a landmark and wrong for a
    hundred metres of wall. Contamination is prevented by placement here
    rather than by paint, because paint is not available.
  * THEY ARE NOT ON THE CURATED ALLOWLIST AND MUST NOT BE. `CURATED` decides
    which results of a keyword search may stand in this world; these were
    commissioned for it and vetted by rendering. Worse, `curatedFor` reads a
    name's trailing digits as a Creator Store asset id, and these are named
    `<family>_cube_1..3` — they would match ids 1, 2 and 3, be culled, and be
    reported as unvetted acquisitions. The allowlist is untouched and still
    governs the eight third-party families.

---
WHAT CHANGED, AND WHY — REVISION 3, THE STYLE-COHERENCE PASS
---

Revision 1 built 608 primitives and was rejected as a blockout. Revision 2
replaced the props with a curated Creator Store palette; that was accepted as
a real improvement and rejected again for a DIFFERENT reason:

    "the world reads too much like multiple unrelated free assets placed
     into one map"

The failure moved from "no asset vocabulary" to "no style coherence", and the
named hard fails were specific: giant green slabs at eye height, lime-green
trees standing in the snow, a canyon wall of repeated rectangles, red spheres
on the cliff tops, a blockout landmark, props that disagree about scale, and
raw grey imported meshes.

Each of those is answered here by a STRUCTURE, not by a convention, because a
convention is what failed: the previous file had the right intentions written
in comments and still put a lime tree in the snow, because any call site
could pass its own `tint` and its own `scale`.

  1. BIOME ART BIBLES (§ "BIOME ART BIBLES" below). Two biomes are declared as
     data: allowed vegetation families, a tint per material role, and the
     cliff tones. `biomeAt(x, z)` resolves one from position, and it is the
     ONLY path — `pick()` resolves the family through the biome and `place()`
     takes the tint from the biome. There is no `tint` parameter on any prop
     call any more, and `tree_round` is not an allowed family in the frost
     biome, so it is substituted for a pine before a clone is ever drawn.
     Writing one more prop() call cannot put a warm-green tree in the snow.

  2. PLAYER-RELATIVE SCALE TIERS. Placements ask for a NAMED TIER — micro,
     small, player, large, sapling, tree, landmark — expressed in studs of
     finished height, and the builder solves the scale factor from the clone's
     own extents. No call site sets a raw scale factor. A rock and a crate
     that both ask for `player` come out the same height whatever their source
     mesh measured, which is the direct fix for "trees, rocks, fences, crates
     disagree strongly in scale".

  3. EVERY CLONE IS TINTED INTO ITS BIOME. MeshPart.Color only takes effect
     where TextureID is empty, so a textured mesh cannot be recoloured. The
     loader measures that per member (`isTintable`) and each biome declares,
     per family, whether a textured member is admissible. Frost admits none —
     a texture authored for a temperate tree is off-palette in snow. The
     canyon admits textured FOLIAGE only, because green-on-brown foliage art
     is already the canyon's palette; every hard-surface family (rock, fence,
     sign, crate, crystal) is tintable-only in both biomes, which is what
     makes a raw grey imported fence impossible rather than merely unlikely.

  4. GUIDANCE IS PAINTED, NOT FLOWN. The floating slab arrows are deleted.
     Route reading is now chevrons painted flat ON the road, a lit edge trim
     along both verges, and low marker posts at ~6 studs. See § 9.

  5. CANYON WALLS ARE MASSIFS. Fewer, longer masses; a sealing base course
     with irregular offset courses above it; every stack ramp-capped; eroded
     saddles cut deliberately into the run; talus AND biome vegetation at the
     foot so the wall never meets the ground in a straight seam. The ball
     "crowns" that read as red eggs on the skyline are gone.

  6. THE LANDMARK IS BUILT, NOT BLOCKED OUT. The pedestal is a stepped
     octagonal dais of radial ashlar segments with a chamfer course, not two
     squares per tier; the spire is a seven-level tapering faceted shaft with
     a twist per level, not three rectangular columns. The Glacier Heart uses
     the same dais builder so the two landmarks read as one civilisation.

  7. THE PALETTE IS CULLED, HARD. 26 members down to 15, curated by an
     explicit allowlist in this file (so the cull survives whatever happens to
     ServerStorage) and recorded with a reason per exclusion in
     assets/palette.json. Fewer and coherent beats more and mixed.



---

# Narratives moved out of the builder

Each of these sat on the code it describes. The code kept a two-line pointer.

## The crown is a mesh

```
--[[ =====================  THE CROWN IS A MESH  =====================

	 THE NAMED HARD FAIL: "tall rectangular crystal columns + stacked rectangular
	 pedestal … still resembles a primitive blockout. It is the PRIMARY landmark
	 and needs the highest visual quality in the map."

	 The previous answer gave the shaft a taper and a 9-degree twist per level.
	 That made it a better-shaped stack of boxes, and it was still a stack of
	 boxes, because `box` was the only vocabulary available to it. The pedestal
	 was rebuilt properly at the same time — a stepped octagonal drum of radial
	 ashlar with a chamfer course — and that half of the criticism is answered:
	 it reads as masonry from every elevation, so the dais STAYS. A monument
	 stands on a plinth.

	 The crown does not stay. It is replaced by the accepted `landmark` Cube
	 generation: ONE giant crystal geode, every shard growing from a single rocky
	 base. That single-silhouette property is exactly what the REJECTED spire
	 generation lacked — three pieces that did not cohere, a grey block, a
	 floating diamond and a separate purple cluster — and it is why this one was
	 re-prompted and this one was accepted.

	 =====================  HEIGHT DISCIPLINE  =====================

	 The monument must stay the tallest thing in the map by a clear margin: the
	 composition gate measures verticalDominance (tallest ÷ second tallest) and
	 fails below 1.25, and docs/COMPOSITION.md records a live run scoring exactly
	 1.000. Everything else is held down for it — cliffs and their boulder masses top
	 out around 50 (which is why the `cliff` tier stops there), tall pines at 34,
	 the secondary landmarks around 52.

	 A mesh cannot simply be told to be 68 studs tall, because its FOOTPRINT
	 scales with it, and the source geode is roughly as wide as it is high: at 68
	 studs of uniform scale it would be about 90 studs across, swallowing the
	 dais it stands on, the crystal apron around it and part of the spawn
	 approach. So the fit is stated as BOTH numbers — the footprint is capped at
	 the dais's own diameter, and only the height left over is made up by a
	 bounded vertical stretch.

	 That stretch is a licence granted to exactly one asset. A crystal extended
	 along its growth axis reads as longer shards, which is a thing crystals do;
	 the same stretch on a kiosk or a rock would read as a modelling error. It is
	 a parameter here and is passed nowhere else in this file.

	 The achieved top and the live dominance ratio are printed in the summary, so
	 this is a measured claim rather than an intended one. ]]
```

## The green slabs at eye height

```
--[[ HARD FAIL, and the loudest one: "long green slabs cross the world at player
	 eye height and look BROKEN. These are the guidance arrows. At eye level they
	 read as giant floating green rectangular beams, not arrows."

	 That is exactly what they were. Each arrow was a 26-stud shaft plus two
	 18-stud heads, 7 studs wide and 2.5 thick, hanging unsupported at y = 17.
	 An arrow drawn flat and viewed from a camera at y = 6 presents its 7 x 26
	 EDGE, so the chevron shape a top-down mock-up shows is never the shape a
	 player sees: from the ground it is a beam. Six of them crossed the map.

	 They are deleted. The replacement is three devices, and the reason for
	 choosing this set over the alternatives is that NONE OF THEM CAN EVER BECOME
	 FLOATING GEOMETRY — the failure mode is designed out rather than tuned down:

	 1. CHEVRONS PAINTED ON THE ROAD. Two flat bars per chevron, 0.3 studs thick,
	    sitting 0.2 studs proud of the road surface. A player walking a corridor
	    is looking down it, so a mark on the ground is in the centre of frame at
	    the distance that matters; and because it is part of the road it cannot
	    obstruct anything or read as broken. This is the primary device.
	 2. A LIT EDGE TRIM along both verges in the biome accent, flush with the
	    road. It gives the route a continuous read at eye level between chevrons,
	    which is what a painted mark alone cannot do on a long straight.
	 3. LOW MARKER POSTS at the verge, ~6 studs to the top of the board. Tall
	    enough to be a vertical the eye catches at distance, short enough that it
	    can never dominate a player-eye view, and it stands ON THE GROUND, which
	    is the property the floating arrows lacked. The board carries the §2 thick
	    near-black outline and a chevron in the accent hue.

	 Considered and not used: floating stylised chevrons. Small floating geometry
	 is still floating geometry, and the failure being answered is specifically
	 that this world put unsupported slabs in the player's eyeline. ]]
```

## The frost payoff

```
--[[ The frost zone's payoff, placed square on the road's axis past the end of
	 the path so it is the thing you walk toward from the moment the gate opens.
	 That axial placement is why the composition works from the canonical
	 "secondary zone" camera: it is the only object on the centre line.

	 It stands on the SAME stepped octagonal dais as the monument, in ice tones —
	 which is the point. Two landmarks built by two different methods is the
	 "unrelated assets" failure expressed in authored geometry; one masonry
	 language in two materials is a world.

	 ~52 studs against the monument's ~84.

	 =====  WHY THE CUBE GEODE IS NOT USED HERE, DELIBERATELY  =====

	 The obvious move, once the monument's crown became the generated geode, is
	 to put the same geode here at 60% scale in ice tones. It is not done, for
	 two reasons and the second is the real one:

	   1. IT CANNOT BE PUT IN ICE TONES. The geode is textured, so `Color` has no
	      effect on it — the same mechanism that culled a textured pine from the
	      frost biome. Its own cyan and violet are at least defensible in snow,
	      so this alone would not settle it.
	   2. THERE IS EXACTLY ONE `landmark` MEMBER. Dropping it here uniformly
	      scaled makes the map's two landmarks the same sculpture at two sizes.
	      This section already refuses that move in its own authored geometry —
	      the core is two stout levels against the monument's seven "so the
	      silhouette is a different shape, not a smaller copy" — and reaching for
	      a mesh is not a reason to stop meaning it. One asset used as both the
	      primary and the secondary landmark IS the "unrelated free assets placed
	      into one map" complaint, inverted into its other failure mode.

	 So the frost payoff keeps its authored core, and what it gains from this
	 pass is the wall behind it: the boulder masses are untextured rock, so they
	 take this biome's cool stone and break the south wall's silhouette exactly
	 as they break the canyon's. (The rejected Cube mesas could not have: warm
	 rust cannot be tinted, so they would have left this half in plain slabs.
	 That asymmetry is most of why they lost.) If a second landmark generation is
	 ever accepted — an
	 ice-toned one, prompted for this position — it drops in exactly where the
	 monument's does, and the note above is the acceptance test it has to pass. ]]
```

## Frost Hollow: empty, then contaminated

```
--[[ The zone the first review called visibly empty and the second review called
	 contaminated. Both are addressed, and the second one structurally: every
	 placement below resolves through `biomeAt`, and everything south of
	 z = GATE_Z + 2 is the frost biome, so there is no argument any of these call
	 sites could pass that would put a warm-green tree or a warm-tinted rock in
	 the snow. Note what is absent from this whole section compared with the last
	 revision: not one `tint =`, and not one `cold = true`.

	 What makes it a different place, concretely:
	   * Composition: the cold half is EMPTIER at the edges and denser at three
	     points, so it feels like a hollow rather than a field. The meadow is the
	     reverse.
	   * Colour: violet crystals, cool blue-grey stone (the cliffs too, not just
	     the props), deep desaturated pine foliage, and NO round trees at all —
	     the biome substitutes them, so a sub-alpine tree line is guaranteed
	     rather than probable.
	   * Snow: white caps on rock and crate tops, drifts on the floor, ice
	     shelves. This is the identity cue that survives a textured mesh, which
	     is why it exists — though frost now admits no textured members anyway.
	   * Storytelling: the outpost is ABANDONED — a tipped crate, a leaning sign,
	     a broken fence — where the meadow's camp is in use.

	   z  -66..-100  THRESHOLD    dense — the abandoned outpost past the gate
	   z -100..-136  OPEN         snowfield; drifts and two lone ice spikes
	   z -136..-176  FROZEN GROVE dense — cold copses either side
	   z -176..-206  ICE SHELF    low, wide, sparse: a change of texture, not mass
	   z -206..-244  GLACIER HEART the reward at the end of the road ]]
```
