# G11 live checkpoint restore — 2026-09-29 (UTC 03:36–03:37)

Production `apple.moshe-barami111.workers.dev` (worker 9c776d41), plugin 01c91e39 built from `apps/apple-plugin`
and installed in the owner's local Studio Plugins folder, place `CandyGarden_v2_studded.rbxl` (project 2b3cbdae, Candy
Garden v2, built by Apple).

1. `POST /api/projects/:id/checkpoints {label:"G11 live test 5"}` → 200, id adebac49-b627-4053-bbd3-1bc3cdc0d7fe,
   306 instances, 6 scripts, coverage supported-subset, 7 preserved engine objects.
2. Studio Command Bar signature before (Workspace):
   `59 [BarSlab(0),Baseplate(1),Camera(0),Flower 3(8),FrontPlate(0),Ground(0),HarvestStation(12),Lamp(8),Lamp(8),
   PathPlots(0),PathShop(0),Plaza(0),Plots(0),SellPad(0),ShopFloor(0),ShopWallBack(0),ShopWallLeft(0),ShopWallRight(0),
   SpawnLocation(1),Terrain(0),TopSlab(0)] lampPP=Smooth Block Model#1|Smooth Block Model#1 meshes=8 cur=Workspace.Camera`
3. Deleted one `Lamp` and `Flower 3` → 41 Workspace descendants.
4. Permission: restore while the connection was inspect-only → 409 "writes require explicit edit consent" (op log
   03:18:17, failure `refused`). Nothing changed in the place.
5. Edits allowed in the plugin; `POST /api/projects/:id/restore {checkpointId}` → 200
   `{"instancesCreated":304,"scriptsRestored":6,"scriptsExpected":6,"failedInstances":0,"failedScripts":0,"failedProperties":0}`
   note "7 protected engine objects are preserved rather than rolled back".
6. Signature after restore: identical to step 2 (59 descendants, same children and counts, both Lamp PrimaryParts are
   Smooth Block Model #1, 8 SpecialMeshes, CurrentCamera Workspace.Camera).
7. Failed restores on the way (op log 03:19–03:33) each reported ok=0 with the reason and the place was rolled back
   by one ChangeHistory cancel (verified: place back at 41 descendants). Causes fixed in the plugin: f57aa293,
   1fcb0682, a94d5392, 01c91e39 (each with a spec that failed first).

Not yet shown: a follow-up Apple run continuing after the restore (needs GLM capacity; reset 00:00Z).
