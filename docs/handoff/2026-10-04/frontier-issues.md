# Framework issues seen in benchmark 2026-10-04 (self-check on). Fix after the run, then re-test (>=3 unseen per category).
1. [FIXED 494c19df, not deployed] Self-check repair rounds append a restated answer: reply shows the same paragraph 2-3x (o01).
2. [OPEN] o02 robot pet: Studio output "AppleBehave:793: target not found" for behaviour bob2 on Workspace.RobotPetPlacement.
   The behaviour config names a target path that does not resolve at runtime (model renamed/moved after add_behaviour? holder settle?).
   Expect: add_behaviour verifies each target exists at write time and the runtime resolves targets relative to the model.
3. [WATCH] critique themes: basic-block builds (cube pet, segmented donut ring), no sound in sound-worthy objects, unstyled billboard prompts.
4. [FIXED cc3de8de, not deployed] add_behaviour/model_anatomy refused game.Workspace["Name With Spaces"] (prefix check) — o05, 3 wasted steps.
5. [FIXED 42d0f762, not deployed] create_instances className Script: plugin refusal named no way forward — now answered pre-Studio naming edit_script.
6. [OK, by design] run_and_check refuses when the checkpoint cannot capture UnionOperation/BlockMesh exactly; points to play_check (agent followed).
7. [OPEN, minor] preview_library_models: "inserted as several pieces" -> previews nothing for multi-piece library models.
8. [OPEN] insert_library_model (owner library) lands as game.Workspace["X"]["X"] (asset wrapped in a same-named container); agent spends rename+move to unnest.
9. [WATCH] o04 sword: 100 steps (cap?) / 458 credits for a plain-block sword — need its trace (watcher started at o05).
10. [FIXED 25955635, not deployed] Sound/animation 0 on most objects (o01,o03,o04,o06,s07): prompt principle "a thing is alive as it naturally would be, unasked"; add_behaviour no longer "asked-for" only.
11. [FIXED d505cd29, not deployed] build_object text face "front" (lowercase) failed the whole build (s07).
12. [WATCH] self-check repairs did not fix what the look reported (s07 paws hidden, o06 floating 0.5 stud) — look limit hit at 6 in o06.

## s08 (2/18, 107 steps)
- rename_instance on the floor (Baseplate -> LavaFloor) left a server script that still looks up 'Baseplate', so the mechanic is dead. Fix: a rename should report scripts that reference the old name (read_script grep) or refuse until they are updated.
- Claimed a duck, a marshmallow and a hot dog cart were "verified in viewport"; none were visible. The self-check claim audit missed it.
- The lava material didn't read as lava (flat pink). It needs Neon/CrackedLava plus an emissive look.
- propose_plan was sent invalid JSON (`"title": }`).

## s10 (7/18, 13 steps)
- Stopped early: the exercise wheel is a flat slab with no spin, and there's no sound or FX. The undeployed "alive" prompt bullet (25955635) targets exactly this.
- Scale ignored: "for a hamster" was built at human scale, with no props a hamster needs (bowl, bottle, bedding). Fix: a scale cue in the prompt, so a request naming a small creature builds at that creature's scale.

## s11 (8/18, 24 steps)
- insert_asset failed 3 times with asset IDs the user wasn't authorised for (622859100, 4351690232, 700927340); were the IDs guessed from memory? Fix: refuse insert_asset IDs that didn't come from find_verified_asset or the library this run.
- edit_script: the path's parent (ServerScriptService) didn't match create.parent (the Workspace cloud). The model sent both.
- Again, no sound, animation or FX. The "alive" rule is undeployed.
