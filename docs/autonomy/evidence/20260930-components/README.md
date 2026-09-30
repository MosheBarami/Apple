# Components, 2026-09-30: survey and the first component (AppleMotion)

## Library survey (`survey.json`, `survey.md`)

Read-only scan of all 565 owner-library games for the idea "defend your orchard from vegetables that come in waves".

- **Creature animations:** every creature Animation id is a creator upload (1,186 of 1,207 distinct ids), so procedural animation is required.
- **Non-humanoid creatures:** 2,575, in 38 games.
  - 71% are Bone-skinned.
  - 617 are Motor6D rigs, and 422 of those name their joints `PartNNN`.
- **Fruit and vegetables:** 47 models, 28 rigged fruit/veg bodies and 24 fruit-named enemy rigs.
- **Systems:** only Easy Plot System and a ProfileService wrapper are standalone. PvB modded (`f3ac50e43d68`) is the best donor for the defense loop. No wave counter exists anywhere, so we write our own.

## AppleMotion proof in Studio (throwaway place, not the owner's)

Setup: `packages/components/motion/proof/build-proof.py` builds `studio-proof.luau`. The command bar fetched and ran it from a local server, and then the place was played with a player.

Probe output, 60 samples of every joint's Transform over 6 s of play:

```
APPLEMOTION PROBE Biped: 15 of 15 joints moved, largest swing 1.62
APPLEMOTION PROBE Tomato: 1 of 1 joints moved, largest swing 1.31
APPLEMOTION PROBE Quadruped: 7 of 7 joints moved, largest swing 0.74
```

- **Biped:** a default R15 avatar from `CreateHumanoidModelFromDescription`. Its limbs are AnimationConstraints (physics joints), not Motor6Ds: 15 AnimationConstraints, 14 BallSocketConstraints and 1 Motor6D. On the first run only its one Motor6D moved. `prepare` now converts them to Motor6Ds.
- **Quadruped:** built from parts, with joints named `PartNNN` like the library.
- **Tomato:** two parts and no joints; `prepare` gave it a root and one joint.

`motion-strip.png` shows four frames: the biped mid-stride (no T-pose), the quadruped's diagonal gait, the tomato, and an idle pose. The test was stopped afterwards and Studio returned to edit mode.

Not proven yet:
- a Bone-skinned library rig;
- a library creature imported through the product;
- two players seeing the same creatures (each client animates its own copy).
