# Failures

Mission §V: the internal knowledge base must carry *every confirmed Golem failure*,
every accepted and rejected experiment. Mission §AK: a plausible metric can be
useless or actively misleading, so the falsifications matter as much as the fixes.

Newest first. Each entry: what was believed, what was true, how it was caught.

---

## 2026-09-01

### F-12 · A comment was load-bearing, and it was wrong
**Believed:** "Every Cube mesh carries a texture, so `Color` has no effect on it" —
written into `Build.luau` as a fact about the world.
**True:** `TextureID` is a writable property on the clone. Cleared, the same mesh
takes `Color` normally.
**Cost of the error:** three separate rejections downstream — Frost Hollow's
crystals fell back to flat slabs, three generated mesas were rejected as
unfixable, and the Glacier Heart was built from boxes *because* a crystal there
would have fallen back to boxes.
**Caught by:** an A/B — same four meshes, both copies set to pure red, differing
only in `TextureID`. Evidence: `evidence/2026-09-01-detexture-ab.md`.

### F-13 · De-texturing the mesas fixed the cited defect and still failed
**Believed:** stripping the texture removes the candy-stripe banding the mesas were
rejected for, so they become usable.
**True:** it does remove the banding, and what is left is a smooth featureless
column. The banding had been doing all the geological work.
**Rule this produced:** de-texturing only helps where the GEOMETRY already carries
the form. A crystal's facets survive the strip; a mesa's do not exist.
**Caught by:** rendering them against the real canyon wall at `cliff` tier before
wiring them in. `cliff_module` is now 7 of 9 generations rejected.

### F-14 · `stoneDais` laid its ashlar blocks radially, not tangentially
**Believed:** the comment promised "there is no elevation from which it reads as a
stack of squares."
**True:** `CFrame.Angles(0, -ang, 0)` maps a block's chord axis onto the radial
direction, so eight blocks made a pinwheel of spokes. Correct yaw is `-(ang + π/2)`.
**Compounding bug:** the chord was computed from the OUTER radius while the blocks
stand on `radius - dep/2` — a 20.1-stud chord on a 118-stud circumference, so they
overlapped and threw corners past one another.
**Scope:** shared function. BOTH landmarks were wrong.
**Caught by:** isolating the Glacier Heart (everything else `Transparency = 1`) once
the crystals stopped being the worst thing in frame.

### F-15 · "Three faceted shafts" were three rotated cubes
**Believed:** in-source description of the Glacier Heart core.
**True:** a rotated cube has no facets. Seven boxes.
**Caught by:** the owner's pixel review naming the object, then reading the code
that built it.

### F-16 · A module was written, committed, and never installed
**Believed:** `Icons.luau` shipped. It is 356 lines, committed, and referenced by two
consumers.
**True:** it was absent from `world/Install.luau`, the only supported path into a
place, so it did not exist at runtime. `Hud` waits BOUNDED and degrades visibly;
`Panels` waits UNBOUNDED and never finishes loading — so SHOP, UPGRADES, CODES and
ZONES were dead in **every** playtest since the module landed, while the HUD kept
drawing and screenshots kept looking fine.
**Caught by:** reading Studio's console during a playtest instead of only looking at
it. `Infinite yield possible on ... WaitForChild("Icons")`.
**Now asserted by:** `packages/evals/src/install-manifest.test.mjs`, which was
verified against the real bug by removing the row again and watching two of its
five assertions fail by name.

### F-17 · The HUD overlapped itself, and viewport height decided whether you saw it
**Believed:** the left column was fine; it reviewed fine.
**True:** `Wallet` is pinned to the top and `Nav` is centred on the screen, and
neither position refers to the other. At 698px of usable height that is a 97×73px
collision sitting on the shard gauge. A tall viewport hides it entirely; a short
landscape phone makes it worse.
**Caught by:** measuring `AbsolutePosition`/`AbsoluteSize` rather than judging the
screenshot.

### F-18 · Two probes that produced confident wrong answers about motion
Recorded because both are re-runnable mistakes, not one-offs:
1. **`require()` in the MCP command context returns a DIFFERENT module instance.**
   Calling `Panels.open("shop")` on a freshly-required copy hits an empty panel
   table and returns silently. Read naively: "motion is broken."
2. **Captured GUI references go stale.** `CrystalCanyonUI` is `ResetOnSpawn = true`,
   so a respawn destroys and rebuilds it. A sampler holding pre-respawn references
   reported 240 consecutive frames of "no panel visible" while the panel was on
   screen.
**Rule:** drive UI with real input, and re-resolve the GUI tree every frame.

---

## Inherited (earlier passes, kept for the record)

- **F-11** · The curated allowlist matched on display name, not asset id, so NOTHING
  matched and the world rebuilt entirely from primitives — 1287 parts, 0 mesh clones.
  It verified clean in a stub harness because the fixture was named the way the table
  expected.
- **F-10** · A plugin-set camera CFrame keeps its position and silently DROPS its
  rotation unless `CameraType` is `Scriptable` first, so every "blocked by geometry"
  render was facing +Z whatever it asked for.
- **F-09** · Three Cube mesas accepted on their own thumbnails, rejected once rendered
  in the world: strata banding read as candy stripe.
- **F-08** · A visual metric can pass while the pixels are clearly poor; see
  `COMPOSITION.md` for the enclosure-scoped gate that was measured and then rejected.
