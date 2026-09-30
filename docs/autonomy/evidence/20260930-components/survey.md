# Component survey for the orchard defense idea (2026-09-30)

Read-only survey of `$HOME/Library/Application Support/Apple/owner-library` (565 games). Machine-readable twin: `survey.json` (every item carries the full 64-hex game id, the library path, and the `library_extract.luau extract <sourceFile> "<path>" self <out.rbxm>` import command; `preExtracted` names an existing `extract/<id>.rbxm` when one exists). Game ids below are shortened to 12 hex; full ids are in the JSON.

Method: a one-off Lune scanner (not committed) reused the loader and path convention of `packages/owner-corpus/library_extract.luau` over all sources; systems and UI come from `knowledge/*.json`, `ui.json`, `assets.json` plus a reading of the actual script sources. Not verified (no network/Studio): mesh/texture id loadability, real skin weights of bone-rigged MeshParts, server->client replication of `Bone.Transform`.

## Key findings

- Rig-bearing models: 8234 records (21887 instances). Creature-like: 7354 records; of these 4779 are Humanoid R6/R15 characters/dummies (325 games) and 2575 are non-humanoid creatures in only 38 games.
- Non-humanoid creatures: **Bone-skinned 1830 records (6122 instances, 20 games)**, Motor6D 617 (1208 instances, 33 games), static 128. So ~71% are skinned; Motor6D bodies that accept fruit meshes exist but are the minority.
- Animations: creature Animation ids are creator uploads (1186 of 1207 distinct ids are >= 1e10, none in the Roblox default pack). Procedural Motor6D/Bone posing is the only route.
- Fruit/vegetables: 47 distinct fruit/vegetable words with a usable model (table below), plus 28 rigged fruit/vegetable bodies and 24 fruit-named enemy rigs from the Plants-vs-Brainrots files.
- Systems: only Easy Plot System and the ProfileService `Core/Data` wrapper are standalone. The best semi-standalone donor for the whole loop is **plants vs brainrots modded (f3ac50e43d68)**; the PvB core and grow_a_garden are whole-map entangled.
- UI: 5 kits ranked; none has a true enemy wave counter, only countdown/banner widgets to retext.

## 1. Creature rigs

### Counts (creature-like, rig-bearing; records = deduped per game, instances include copies)

| Group | records | instances | distinct designs | games |
|---|---|---|---|---|
| Humanoid-bearing (R6/R15 characters, dummies) | 4779 | 12953 | 3629 | 325 |
| Non-humanoid creatures | 2575 | 7471 | 1711 | 38 |
| Static, creature-named, no joints/controller (noisy) | 4193 | 14306 | 2223 | 136 |

### By rig kind (all creature-like, then non-humanoid only)

| Kind | all records | all instances | non-humanoid records | non-humanoid instances | non-humanoid games |
|---|---|---|---|---|---|
| (a) Motor6D jointed | 2452 | 4328 | 617 | 1208 | 33 |
| (b) Bone skeleton (skinned MeshParts) | 1850 | 6142 | 1830 | 6122 | 20 |
| (d) Static (no Motor6D, no Bone) with Humanoid/AnimationController | 3052 | 9954 | 128 | 141 | 7 |

### (c) Controller cross-tab (creature-like, all)

| kind / controller | records | instances | games |
|---|---|---|---|
| a-motor6d / Humanoid | 1835 | 3120 | 193 |
| a-motor6d / AnimationController | 552 | 1135 | 25 |
| a-motor6d / neither | 65 | 73 | 18 |
| b-bone / Humanoid | 20 | 20 | 6 |
| b-bone / AnimationController | 1827 | 6119 | 20 |
| b-bone / neither | 3 | 3 | 2 |
| d-static / Humanoid | 2924 | 9813 | 256 |
| d-static / AnimationController | 128 | 141 | 7 |

Humanoid-without-joints records are R6 dummies saved with no Motor6D/Weld/Motor instances (decor, or joints built at runtime; not verified). Every modern creature uses AnimationController (+Animator); 68 older ones have neither.

### By category (records / instances)

| category | Motor6D | Bone | static |
|---|---|---|---|
| brainrot | 203 / 233 | 584 / 2436 | 78 / 78 |
| pet | 4 / 5 | 10 / 687 | 48 / 74 |
| enemy/mob | 139 / 507 | 108 / 468 | 90 / 214 |
| animal/creature | 65 / 141 | 725 / 1262 | 117 / 305 |
| plant-defender | 65 / 206 | 1 / 5 | 10 / 77 |
| npc | 1751 / 2953 | 21 / 21 | 2673 / 9159 |
| other | 225 / 283 | 401 / 1263 | 36 / 47 |

Category is from path keywords (brainrot, pet, enemy/mob/zombie..., animal/dragon/pokemon..., plant/seed/tower) else `npc` when a Humanoid is present; `other` holds un-keyworded folders such as AssetModels.

### Typical joints

- **Motor6D, R6 standard (6):** Neck, Left Shoulder, Right Shoulder, Left Hip, Right Hip, RootJoint. 1133 rigs (1883 instances, 1063 with Humanoid).
- **Motor6D, R15 standard (15):** Root, Waist, Neck, LeftShoulder, LeftElbow, LeftWrist, RightShoulder, RightElbow, RightWrist, LeftHip, LeftKnee, LeftAnkle, RightHip, RightKnee, RightAnkle. 246 rigs.
- **Motor6D, semantic creature:** Head, Torso, Tail, Tail1..n, LeftArm, RightArm, LeftLeg, RightLeg, L_Wing, Ears, Jaw, Body (91 non-humanoid rigs). **Generic chains:** Part1..PartNNN, MeshPartN, CubeN, SphereN, <Mesh>.001 (Blender export names) (422 non-humanoid rigs). Joint count median 13, p10 2, p90 106; median rig 22 parts, median longest side 7.7 studs.
- **Bone:** median 19.0 bones, 11.0 parts. One invisible/anchored "Root" (or "HumanoidRootPart"/Hitbox) Part carrying a Bone chain (CupMaster > Bone > Arm.L/Arm.R/Leg.L/Leg.R ...), 1..N MeshParts each attached to Root by a Motor6D named "<MeshName>Motor6D" (Studio 3D-importer rig layout); or a single MeshPart with Bone children (Blender/Mixamo skinned mesh). Bone naming is Blender style (Bone, Bone.001, Arm.L.001, Leg.R.002) or Mixamo (Hips, LeftArm, LeftUpLeg).
  - Top bone names: Bone.001 (954), Bone (850), Bone.002 (806), Bone.003 (670), Bone.004 (592), Bone.005 (560), Leg.L (528), Leg.R (511), Bone.006 (476), Bone.007 (443), Leg.L.001 (434), Leg.R.001 (424), Leg.L.002 (403), Arm.L (395)
  - With Motor6D rigid attach: 1359 records; bone-only: 471; Bone as child of a MeshPart: 472.
  - Caveat: Whether a MeshPart is truly skinned is stored inside the uploaded mesh asset (weights), not in the place file. Bone-rigged bodies therefore keep the original mesh; fruit meshes can only be attached rigidly (Motor6D/Weld to a rigid body part), not re-skinned.

### Animation / AnimationId references

- Library: 5486 unique Animation entries (23868 instances) in 241 games; id formats {'http://www.roblox.com/asset/?id=': 2648, 'rbxassetid://': 2659, 'empty': 31, 'other/hash': 148}. The 11 most referenced ids (180426354, 180435571, 125750702, 178130996, 182393478, 180436334, 180435792, 180436148, 125749145, 125750544, 183521609, each in 200-1800 entries) sit under Animate scripts/folders: they are the classic Roblox default R6/R15 Animate pack (walk/run/idle/jump/climb/fall/sit/tool), published by Roblox, so these load anywhere; everything else is creator-specific.
- Creature/plant/brainrot/pet animations: 1389 entries (2551 instances), 1207 distinct ids, 1373 as `rbxassetid://`, 1186 ids >= 1e10 (2023+ uploads), 0 in the default pack; names {'Walk': 679, 'Idle': 580, 'Attack': 55, 'Swim': 30, 'Animation': 21, 'Sit': 2, 'SitR15': 2, 'Fly': 2}. Creature/plant/brainrot Animation instances are rbxassetid uploads from the original creators (1186 of 1207 distinct ids are >= 1e10, i.e. 2023+ uploads); none are from the Roblox default pack. They are the ones that fail to load for a different account: procedural animation is mandatory.
- Usually NOT inside the rig: (a) ReplicatedStorage/Assets/Animations/<Brainrots|Plants>/<Name>/{Walk,Idle,Attack} (PVB core), (b) <Model>/Animations/Walk (PVB variants, loaded client-side by EnemyClient/PlantClient), (c) ReplicatedStorage/Animations/Animals/<Name>/Idle|Walk. 428 of 2575 non-humanoid creature rigs carry an Animation instance inside the model itself.
- Animation clips drive Motor6D.Transform (rigid) or Bone.Transform (skinned). Both are plain writable properties, so a script can pose a rig each frame (RunService.Heartbeat) without any Animation asset. Client-side writes are the normal route; server-side Bone/Motor6D Transform replication should be verified once in Studio.

### Examples (a) Motor6D

| model | game | path | parts (mesh) | size | joints / controller | joint names |
|---|---|---|---|---|---|---|
| MythicNPC | plants vs brainrots modded (f3ac50e43d68) | `/ReplicatedStorage/Assets/Enemies/Normal/MythicNPC` | 7 (0) | 4x5x1 | 6m/0b AnimationController | Head, Left Hip, Left Shoulder, Neck, Right Hip, Right Shoulder |
| Penguin | place 107778070777162 Stea (4ba7759f7d19) | `/ReplicatedStorage/AssetModels/Penguin` | 21 (19) | 1.87x4.41x1.75 | 10m/0b AnimationController | Black_Back, Head, L_Arm, L_Foot, L_Leg, R_Arm, R_Foot, R_Leg |
| Bear | place 107778070777162 Stea (4ba7759f7d19) | `/ReplicatedStorage/AssetModels/Bear` | 24 (21) | 3.5x7.63x6.94 | 7m/0b AnimationController | Head1, LeftLeg1, LeftLeg2, RightLeg1, RightLeg2, Tail1, Torso |
| Dog | place 107778070777162 Stea (4ba7759f7d19) | `/ReplicatedStorage/AssetModels/Dog` | 19 (17) | 2.11x5.01x5.15 | 11m/0b AnimationController | Head, LLArm, LLLeg, LUArm, LULeg, RLArm, RLLeg, RUArm |
| Chicken | place 107778070777162 Stea (4ba7759f7d19) | `/ReplicatedStorage/AssetModels/Chicken` | 14 (11) | 2x5.22x2.96 | 4m/0b AnimationController | Cube.003, Cube.005, Head, Torso |
| Sammy | steal_a_brainrot (437ed93a5e99) | `/Workspace/Events/FatSammy/Model/Sammy` | 23 (15) | 2.54x5.69x3.77 | 15m/0b AnimationController | LeftAnkle, LeftElbow, LeftHip, LeftKnee, LeftShoulder, LeftWrist, Neck, RightAnkle |
| Noobini Bananini | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Brainrots/Noobini Bananini` | 18 (2) | 1.05x5.55x3.6 | 16m/0b AnimationController | Part23 x2, Cube4, Part18, Part18.001, Part19, Part20, Part21, Part22 |
| Eggplant | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Eggplant` | 22 (4) | 2x5.67x2 | 22m/0b AnimationController | Cube2 x2, Cube3 x2, Part316 x2, Part318 x2, Body, Cube1, Part317, Part318e |
| Mr Carrot | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Mr Carrot` | 62 (2) | 8.33x12.48x11.04 | 59m/0b AnimationController | MeshPart x2, Part280, Part281, Part282, Part283, Part284, Part285, Part286 |
| Pumpkin | exo PVB V1 (84e0e1e046cc) | `/ReplicatedStorage/Assets/Plants/Pumpkin` | 6 (0) | 4.87x5.5x7.11 | 3m/0b AnimationController | Body1, PumpkinTail, Tail |
| Yellow | CashgrabBridgeEU (60ae3b4adcee) | `/ReplicatedStorage/Pets/Yellow` | 6 (4) | 4.11x8.7x5.11 | 4m/0b neither | BodyMotor6D, EyesMotor6D, LowerTeethMotor6D, UpperTeethMotor6D |
| Dog_SMALL | G (6e5d1a52cc7f) | `/Folder/Lighting/_Morphs/Dog_SMALL` | 8 (0) | 2x3.15x2.82 | 7m/0b neither | DogTail, Left Hip, Left Shoulder, Neck, Right Hip, Right Shoulder, RootJoint |

### Examples (b) Bone skeleton

| model | game | path | parts (mesh) | size | joints / controller | joint names |
|---|---|---|---|---|---|---|
| Brr Brr Patapim | ETFB By A DEV STUDIO BEST  (6cb6bea315c6) | `/ReplicatedStorage/Assets/Brainrots/Rare/Brr Brr Patapim` | 16 (13) | 5.37x9.36x4.9 | 13m/14b AnimationController | Bone, CupArmBot.L, CupArmBot.R, CupArmTop.L, CupArmTop.R, CupHand.L, CupHand.R, CupMaster |
| Los Mr Carrotitos | exo PVB V1 (84e0e1e046cc) | `/ReplicatedStorage/Assets/Enemies/Normal/Los Mr Carrotitos` | 10 (8) | 9.96x9.01x6.58 | 8m/54b AnimationController | foot.L, foot.L.002, foot.L.003, foot.R, foot.R.002, foot.R.003, shin.L, shin.L.001 |
| Las Capuchinas | steal_a_brainrot (437ed93a5e99) | `/ReplicatedStorage/Models/Animals/Las Capuchinas` | 15 (9) | 11.26x5.48x4.75 | 9m/141b AnimationController | Arm.L, Arm.L.001, Arm.L.002, Arm.L.003, Arm.L.004, Arm.L.005, Arm.L.006, Arm.L.007 |
| Cupitron Consoletron | [Clover Event Map] Escape  (1acc26696bc4) | `...licatedStorage/Assets/Brainrots/Infinity/Cupitron Consoletron` | 3 (1) | 7.78x13.36x10.62 | 0m/77b AnimationController | Arrow, BigEyeHeart.L, BigEyeHeart.R, BigHeart, BigHeartBeatLower.L, BigHeartBeatLower.R, BigHeartBeatUpper.L, BigHeartBeatUpper.R |
| Strawberry Elephant | ETFB By A DEV STUDIO BEST  (6cb6bea315c6) | `/ReplicatedStorage/Assets/Brainrots/Divine/Strawberry Elephant` | 3 (1) | 13.89x11.04x7.74 | 0m/20b AnimationController | Back Leg.001.L, Back Leg.001.R, Back Leg.002.L, Back Leg.002.R, Back Leg.L, Back Leg.R, Bone, Bone.001 |
| Onionello Penguini | OP FILE ESCAPE TSUNAMI FOR (36feffbe8030) | `/ReplicatedStorage/Assets/Brainrots/Secret/Onionello Penguini` | 3 (1) | 8.72x11.82x8.72 | 0m/31b AnimationController | Arm.001.L, Arm.001.R, Arm.002.L, Arm.002.R, Arm.003.L, Arm.003.R, Arm.004.L, Arm.004.R |
| Brainrot | [Clover Event Map] Escape  (1acc26696bc4) | `...torage/Assets/Brainrots/Secret/Los Tungtungtungcitos/Brainrot` | 1 (1) | 3.61x4.74x2.91 | 0m/13b AnimationController | Arm.L, Arm.L.001, Arm.L.002, Arm.R, Arm.R.001, Arm.R.002, Leg.L, Leg.L.002 |
| Spinosaurus | Lift An Egg [TEMPLATE] (d89bd8af8f4f) | `/Workspace/Bases/3/Spinosaurus` | 1 (1) | 15.89x8.96x20.13 | 0m/27b AnimationController | Head_Nub, Jaw_1, Jaw_End, L_Elbow, L_Feet, L_Hand, L_Hock, L_Knee |
| PipeMan | Spin a Card (1) (f4edab0c9b15) | `/ReplicatedStorage/Items/PipeMan` | 1 (1) | 3.84x7.92x1.46 | 0m/20b AnimationController | Hips, LeftArm, LeftFoot, LeftForeArm, LeftHand, LeftLeg, LeftShoulder, LeftToeBase |
| Mecha Crawler | place 107778070777162 Stea (4ba7759f7d19) | `/ReplicatedStorage/AssetModels/Mecha Crawler` | 15 (12) | 11.06x9.23x43.38 | 12m/77b AnimationController | Antenna1.L, Antenna1.R, Antenna2.L, Antenna2.R, Body1, Body10, Body11, Body12 |
| Carnivourita Tralalerita | exo PVB V1 (84e0e1e046cc) | `...licatedStorage/Assets/Enemies/Normal/Carnivourita Tralalerita` | 8 (6) | 11.89x8.07x6.85 | 6m/15b AnimationController | foot.R, front_foot.L, front_foot.R, front_shin.L, front_shin.R, front_thigh.L, front_thigh.R, shin.R |

### Examples (c) controllers: Humanoid / AnimationController / neither

| model | game | path | parts (mesh) | size | joints / controller | joint names |
|---|---|---|---|---|---|---|
| Dummy | Murder Mystery 2 (Hallowee (5961f4a17051) | `/ServerStorage/Dummy` | 7 (0) | 1x5x4 | 6m/0b Humanoid R6 | Left Hip, Left Shoulder, Neck, Right Hip, Right Shoulder, Root Hip |
| R15 Dummy | Drill For LuckyBlocks (73c34af3bf37) | `/ServerStorage/R15 Dummy` | 16 (14) | 4x5x1 | 15m/0b Humanoid R15 | LeftAnkle, LeftElbow, LeftHip, LeftKnee, LeftShoulder, LeftWrist, Neck, RightAnkle |
| Penguin | place 107778070777162 Stea (4ba7759f7d19) | `/ReplicatedStorage/AssetModels/Penguin` | 21 (19) | 1.87x4.41x1.75 | 10m/0b AnimationController | Black_Back, Head, L_Arm, L_Foot, L_Leg, R_Arm, R_Foot, R_Leg |
| Yellow | CashgrabBridgeEU (60ae3b4adcee) | `/ReplicatedStorage/Pets/Yellow` | 6 (4) | 4.11x8.7x5.11 | 4m/0b neither | BodyMotor6D, EyesMotor6D, LowerTeethMotor6D, UpperTeethMotor6D |

### Examples (d) static / no joints

| model | game | path | parts (mesh) | size | joints / controller | joint names |
|---|---|---|---|---|---|---|
| Chicleteira Bicicleteira | ETFB UNCOPYLOCKED [v1.0] ( (ecd35e58f32e) | `/ReplicatedStorage/Brainrots/Chicleteira Bicicleteira` | 33 (30) | 3.22x5.77x4.71 | 0m/0b AnimationController | - |
| Los Combinasionas | GOOD FILE DONT LEAK JK (0aa317e87fa7) | `/ReplicatedStorage/Brainrots/Los Combinasionas` | 23 (14) | 11.98x9.94x4.15 | 0m/0b AnimationController | - |
| Huntmaster Sedore | Hunter's Life V4 JULY 4 UP (88ab6f741cc8) | `/SavedGameModules/Workspace/Huntmaster Sedore` | 15 (0) | 4.76x5.39x4.35 | 0m/0b AnimationController | - |
| OP_2 | Eat food simulator (1) (22ab351e9e15) | `/ReplicatedStorage/Assets/Pet/Star2/OP_2` | 6 (6) | 9.88x5.45x8.68 | 0m/0b none | - |
| Model | Eat food simulator (1) (22ab351e9e15) | `...rterGui/Shop/Main/Inv/LimitedPet/Frame/4/Pet/WorldModel/Model` | 6 (6) | 10.72x6.94x10.72 | 0m/0b none | - |
| Speical_4 | Eat food simulator (1) (22ab351e9e15) | `/ReplicatedStorage/Assets/Pet/Star/Speical_4` | 6 (6) | 5.44x6.94x9.72 | 0m/0b none | - |
| Los Burritos | steal_a_brainrot (437ed93a5e99) | `/ReplicatedStorage/Models/TraitsPerAnimal/:3/Los Burritos` | 6 (3) | 9.91x1.42x3.74 | 0m/0b none | - |
| W or L | steal_a_brainrot (437ed93a5e99) | `/ReplicatedStorage/Models/TraitsPerAnimal/Meowl/W or L` | 6 (6) | 6.95x4.85x3.5 | 0m/0b none | - |
| Los Gattitos | steal_a_brainrot (437ed93a5e99) | `/ReplicatedStorage/Models/TraitsPerAnimal/Skibidi/Los Gattitos` | 6 (6) | 9.72x3.02x3.97 | 0m/0b none | - |
| Rosey and Teddy | steal_a_brainrot (437ed93a5e99) | `/ReplicatedStorage/Models/TraitsPerAnimal/Meowl/Rosey and Teddy` | 6 (6) | 6.31x5.65x4.75 | 0m/0b none | - |
| Los Hotspotsitos | steal_a_brainrot (437ed93a5e99) | `/ReplicatedStorage/Models/TraitsPerAnimal/:3/Los Hotspotsitos` | 6 (3) | 8.4x1.42x2.54 | 0m/0b none | - |

### Recommended bodies for a vegetable enemy

1. **R15 Dummy** - Drill For LuckyBlocks (73c34af3bf37) `/ServerStorage/R15 Dummy`: 16 parts (14 MeshParts), 15 Motor6D, Humanoid R15, size 4x5x1. Stock R15: 15 Motor6D with standard names (Root, Waist, Neck, L/R Shoulder/Elbow/Wrist/Hip/Knee/Ankle), every part a MeshPart that can be swapped for a fruit/vegetable MeshPart, Humanoid available for MoveTo/health or use AnimationController instead. Procedural animation is a solved problem on this joint naming.
2. **Penguin** - place 107778070777162 Steal An Egg (4ba7759f7d19) `/ReplicatedStorage/AssetModels/Penguin`: 21 parts (19 MeshParts), 10 Motor6D, AnimationController, size 1.87x4.41x1.75. Semantic biped/quadruped family (Penguin, Bear, Dog, Chicken, Dream Axolotl, Galaxy Gecko, ~80 more in the same game) with named Torso/Head/Arm/Leg/Tail Motor6D on an AnimationController and ~20 parts: easiest to map fruit bodies, limbs and leaves onto by name.
3. **MythicNPC** - plants vs brainrots modded (f3ac50e43d68) `/ReplicatedStorage/Assets/Enemies/Normal/MythicNPC`: 7 parts (0 MeshParts), 6 Motor6D, AnimationController, size 4x5x1. 7-part R6-named enemy rig from the PVB-variant enemy pipeline (AnimationController + Animations.Walk slot); lane-walking contract already matches (Hitbox-less, PrimaryPart anchored, client tween). Use it for the most minimal "vegetable with legs".

Also: Eggplant (PVB FULLY WORKING (2), `/ReplicatedStorage/Assets/Plants/Eggplant`): Already a rigged vegetable, but joints are Part### names: animate by depth/position, not by name.; Noobini Bananini (PVB FULLY WORKING (2), `/ReplicatedStorage/Assets/Brainrots/Noobini Bananini`): Already a banana enemy with walk-ready hierarchy (RootPart>Part28>...); generic names.

## 2. Fruit and vegetable models

name-token match over Model/MeshPart/Union/Tool/Part/Accessory across all 565 games; one primary + up to 2 alternates per fruit from different games; builtFrom says whether the model carries MeshIds (MeshPart or Part+SpecialMesh) or is primitive Parts/Unions. Sizes are studs AABB.

| fruit | best (name, class) | game (id) | library path | parts | mesh | built from | size | alternates |
|---|---|---|---|---|---|---|---|---|
| carrot | Carrot (Model) | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Gears/Carrot Launcher/Carrot` | 2 | yes (2) | MeshPart/SpecialMesh ids | 1.79x0.58x0.65 | steal_a_radioactiv `...rage/Models/Events/Sleepy/Plants/Carrot` 4p mesh; Swordburst Onlin F `...ReplicatedStorage/Database/Items/Carrot` 2p mesh |
| tomato | Tomato (Model) | lifelike [v0.6] MID-SUMM (1540eb1e7df2) | `/SavedGameModules/Workspace/Tomato#4` | 2 | yes (1) | MeshPart/SpecialMesh ids | 1.34x1.16x1.35 | G `/Folder/Lighting/_Tools/Tomato` 2p mesh; PVB FULLY WORKING  `...age/Assets/Plants/Tomade Torelli/Tomato` 1p mesh |
| eggplant | Eggplant (Model) | grow_a_garden (21394d8b357d) | `/ReplicatedStorage/Fruit_Spawn/Eggplant` | 9 | no | primitive Parts | 1.22x2.82x1.4 | grow_a_garden `...licatedStorage/Fruit_Spawn_OLD/Eggplant` 1p; PVB FULLY WORKING  `...catedStorage/Assets/Seeds/Eggplant Seed` 1p |
| pumpkin | Pumpkin (MeshPart) | TOM__JERRY_BARRYS_PRISON (c047d7a2d6c5) | `/ReplicatedStorage/Pumpkin/body/Pumpkin/Pumpkin` | 1 | yes (1) | MeshPart/SpecialMesh ids | 3.64x2.66x3.69 | Meepcity `/ServerStorage/Assets/299/Pumpkin` 2p mesh; Murder Mystery 2 ( `/Workspace/Lobby/Lobby/Pumpkin#10` 4p mesh |
| potato | Potato (Model) | Swordburst Onlin F1 (e947028497cc) | `/GameModules/ReplicatedStorage/Database/Items/Potato` | 1 | yes (1) | MeshPart/SpecialMesh ids | 1.08x0.4x1.08 | Welcome to the Tow `/Lighting/Potato` 1p mesh; Medievalville 0.6. `/GameModules/Lighting/Potato` 1p mesh |
| onion | Onion (Tool) | G (6e5d1a52cc7f) | `/Folder/Lighting/_Tools/Onion` | 3 | yes (2) | Part+SpecialMesh ids (Tool Handle) | 0.6x0.61x0.95 | G `/Folder/Workspace/Three_pizza/Onion` 9p mesh; Expedition 2.1 `/ReplicatedStorage/Items/Onion` 1p |
| corn | Corn (Model) | grow_a_garden (21394d8b357d) | `/ReplicatedStorage/Fruit_Spawn/Corn` | 9 | no | primitive Parts | 2.83x1.6x2.83 | G `/Folder/Lighting/_Tools/Corn` 4p mesh; DUSK Survival, Alp `/SavedGameModules/Workspace/Corn#2` 1p |
| pepper | Pepper (Model) | grow_a_garden (21394d8b357d) | `/ReplicatedStorage/Models/Pepper/Fruits/Pepper#2` | 8 | no | primitive Parts | 0.81x1.93x1.71 | Urbis [Beta] `...icatedStorage/ItemDirectory/Soda/Pepper` 1p |
| broccoli | Broccoli (Tool) | G (6e5d1a52cc7f) | `/Folder/Lighting/_Tools/Broccoli` | 3 | yes (3) | MeshPart/SpecialMesh ids | 0.5x0.2x0.76 |  |
| cabbage | Cabbage (Model) | A Pirates Life (3315bcc47c00) | `...246956/Workspace/SeasonStuff/Temp/RedCabbage/Cabbage#11` | 2 | yes (1) | MeshPart/SpecialMesh ids | 2x3.2x2 | a `/Lighting/Objects/Plants/Cabbage` 10p mesh; G `/Folder/Lighting/_Tools/Cabbage` 7p mesh |
| cauliflower | Cauliflower (Tool) | G (6e5d1a52cc7f) | `/Folder/Lighting/_Tools/Cauliflower` | 2 | yes (2) | MeshPart/SpecialMesh ids | 0.6x0.42x0.6 |  |
| lettuce | Lettuce (MeshPart) | Brookhaven (ddc224866377) | `...pace/WorkspaceCom/001_Cooler/BottledWaterfake#2/Lettuce` | 1 | yes (1) | MeshPart/SpecialMesh ids | 0.51x0.39x0.5 | lifelike [v0.6] MI `/SavedGameModules/Workspace/Lettuce#16` 3p mesh; Welcome to the Tow `/Lighting/Lettuce` 1p mesh |
| cucumber | Cucumber (Tool) | G (6e5d1a52cc7f) | `/Folder/Lighting/_Tools/Cucumber` | 3 | no | primitive Parts | 0.34x0.34x1.1 | G `/Folder/Workspace/Groceria/Cucumber` 2p; Piri Piri Chicken  `...kspace/Model#31/fakefood/Whole Cucumber` 1p |
| celery | Celery (Tool) | G (6e5d1a52cc7f) | `/Folder/Lighting/_Tools/Celery` | 7 | yes (7) | MeshPart/SpecialMesh ids | 0.5x0.46x1.3 |  |
| chili | Chili (Model) | RoCitizens (1fae1780d724) | `/GameModules/Workspace/Ingredients/Chili#2` | 2 | no | primitive Parts | 0.8x0.8x0.8 | steal_a_brainrot `...Models/TraitsPerAnimal/:3/Chillin Chili` 2p mesh; steal_a_radioactiv `...ls/TraitsPerAnimal/Spider/Chillin Chili` 1p mesh |
| jalapeno | Jalapeno (Model) | steal_a_brainrot (437ed93a5e99) | `.../Events/Mexico/Map/Nature/Cacti/JalapenoCactus/Jalapeno` | 10 | yes (1) | MeshPart/SpecialMesh ids | 14.44x15.66x9.96 | steal_a_radioactiv `.../Mexico/Map/Nature/Cacti/JalapenoCactus` 31p mesh |
| strawberry | Strawberry (Model) | steal_a_brainrot (437ed93a5e99) | `/ReplicatedStorage/Models/Traits/Strawberry` | 3 | yes (3) | MeshPart/SpecialMesh ids | 4.33x1.28x4.33 | lifelike [v0.6] MI `/SavedGameModules/Workspace/Strawberry#10` 3p mesh; [NEW CODE] Farmula `...ce/Map/CropShopShelfItems/Strawberry#22` 1p mesh |
| apple | Apple (Model) | RobloxHighSchool (d71efe44c35a) | `/ReplicatedStorage/Shops/Sunblox Cafe/Apple` | 1 | yes (1) | MeshPart/SpecialMesh ids | 0.48x0.63x0.55 | RoCitizens `...eModules/Workspace/Ingredients/Apple#12` 1p mesh; Welcome to Bloxbur `...ReplicatedStorage/ItemModels/Food/Apple` 3p mesh |
| banana | Banana (MeshPart) | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Projectiles/Banana` | 1 | yes (1) | MeshPart/SpecialMesh ids | 1.23x0.76x0.27 | Swordburst Onlin F `...ReplicatedStorage/Database/Items/Banana` 1p mesh; [NEW] MeepCity `...ules/Lighting/Worlds/14/Model#15/Banana` 1p mesh |
| watermelon | Watermelon (Part) | Breakout (5a22c4fab0c7) | `/ReplicatedStorage/Map1/Watermelon` | 1 | yes (1) | MeshPart/SpecialMesh ids | 1x1x0.8 | G `/Folder/Workspace/Watermelon` 1p mesh; grow_a_garden `/ServerStorage/Collectables/Watermelon` 5p |
| orange | Orange (Tool) | G (6e5d1a52cc7f) | `/Folder/Lighting/_Tools/Orange` | 2 | yes (1) | Part+SpecialMesh ids (Tool Handle) | 0.61x0.73x0.6 | Complete_Fishing_s `...in_ServerStorage/Rods/StarterRod/Orange` 1p mesh |
| lemon | Lemon (MeshPart) | Please Donate Fully Scri (d3db77787ba9) | `/StarterGui/ScreenGui/main/BoothModels/LemonadeBooth/Lemon` | 1 | yes (1) | MeshPart/SpecialMesh ids | 1.5x1.1x0.17 | Pokemon Adventures `...e/Gym Leaders/Eugene/Person/Model/Lemon` 1p mesh; grow_a_garden `/ReplicatedStorage/Fruit_Spawn_OLD/Lemon` 1p |
| grape | Grapes (Tool) | One piece (28ec4cbf274f) | `/Lighting/Foods/Grapes` | 1 | yes (1) | MeshPart/SpecialMesh ids | 1.37x1.02x1.37 | grow_a_garden `/ReplicatedStorage/Fruit_Spawn/Grape` 2p; Urbis [Beta] `...ts/TheNest/JobAssets/Shared/Shots/Grape` 1p |
| pear | Pear (Tool) | G (6e5d1a52cc7f) | `/Folder/Workspace/Pear` | 1 | yes (1) | MeshPart/SpecialMesh ids | 0.83x1.01x1.04 | grow_a_garden `/ReplicatedStorage/Fruit_Spawn_OLD/Pear` 4p; Piri Piri Chicken  `...Modules/Workspace/Model#44/Model/Pear#2` 1p |
| peach | Peach (Model) | grow_a_garden (21394d8b357d) | `/ReplicatedStorage/Fruit_Spawn_OLD/Peach` | 6 | no | primitive Parts | 1.7x1.71x1.7 | super mario `...ss stairs/Stairs/Pictures/Peach/Peach#2` 1p; Survival 303 Versi `...icles/Trawler/Supplies/Canned Peaches#6` 1p |
| pineapple | Pineapple (Part) | Welcome to Bloxburg [BET (2137d275799d) | `...e/ItemModels/Kitchen Items/Icebox Fridge/Food/Pineapple` | 1 | yes (1) | MeshPart/SpecialMesh ids | 1.68x1.36x1.55 | G `/Folder/Lighting/_Tools/Pineapple` 2p mesh; The Candle Den Dan `/SavedGameModules/Lighting/Pizza/Pineapple` 1p |
| coconut | coconut (Part) | Baldi's Basics in Educat (94f01f6b1462) | `/Workspace/Model#4/Leaves/coconut#2` | 1 | yes (1) | MeshPart/SpecialMesh ids | 1.4x1.3x1.38 | grow_a_garden `/ReplicatedStorage/Fruit_Spawn_OLD/Coconut` 2p; Isolation ORIGINAL `/SavedGameModules/Workspace/Coconut#2` 1p |
| mango | Mango (Tool) | G (6e5d1a52cc7f) | `/Folder/Lighting/_Tools/Mango` | 1 | yes (1) | MeshPart/SpecialMesh ids | 0.4x0.6x0.4 | grow_a_garden `/ReplicatedStorage/Fruit_Spawn_OLD/Mango` 1p; Piri Piri Chicken  `...Storage/FoodItems/Mango & Avocado Salad` 18p mesh |
| kiwi | Kiwi (Accessory) | My Happy City [Beta] (7fd1db0dbff6) | `/Workspace/Core/Assets/#2/Kiwi` | 1 | yes (1) | MeshPart/SpecialMesh ids | 1.02x1x1.02 | steal_a_brainrot `.../Models/TraitsPerAnimal/Meowl/Pipi Kiwi` 3p mesh; Twisted Murderer `...atedStorage/Shop/KnifeSkins/Kiwi Kutter` 1p mesh |
| avocado | Pipi Avocado (Model) | steal_a_brainrot (437ed93a5e99) | `/ReplicatedStorage/Models/TraitsPerAnimal/:3/Pipi Avocado` | 2 | yes (1) | MeshPart/SpecialMesh ids | 3.46x1.21x1.12 | steal_a_radioactiv `...dels/TraitsPerAnimal/Meowl/Pipi Avocado` 3p mesh; ETFB By A DEV STUD `.../Uncommon/Pipi Avocado/Pipi avocado.002` 1p mesh |
| blueberry | Blueberry (Model) | [🔮UPDATE!] +1 Tongue Esc (21f840017f78) | `/ReplicatedStorage/Assets/Tongues/Blueberry` | 9 | yes (9) | MeshPart/SpecialMesh ids | 1.57x4.52x1.85 | grow_a_garden `/ReplicatedStorage/Fruit_Spawn/Blueberry` 5p; Urbis [Beta] `...oseTap/JobAssets/Shared/Shots/Blueberry` 1p |
| raspberry | Raspberry (Model) | grow_a_garden (21394d8b357d) | `/ServerStorage/OldGrowing/Raspberry` | 1 | no | primitive Parts | 1x1x1 | Starbucks cafe `/Workspace/Raspberry` 9p; Cold Stone Homesto `/Workspace/Cold stone Milkshake -Raspberry` 19p |
| cranberry | Cranberry (Model) | grow_a_garden (21394d8b357d) | `/ReplicatedStorage/Fruit_Spawn/Cranberry` | 2 | yes (1) | MeshPart/SpecialMesh ids | 1x1.17x1 |  |
| cherry | Cherry (Model) | grow_a_garden (21394d8b357d) | `/ReplicatedStorage/Fruit_Spawn_OLD/Cherry` | 1 | no | primitive Parts | 1.99x1.99x1.99 | LumberTycoon2 `/Workspace/TreeModels/Cherry` 4p; Club solaris `/ServerStorage/Solar Cherry` 5p mesh |
| dragonfruit | Dragonfruit (Model) | Swordburst Onlin F1 (e947028497cc) | `/GameModules/ReplicatedStorage/Database/Items/Dragonfruit` | 2 | yes (2) | MeshPart/SpecialMesh ids | 1.14x1.02x1.35 | exo PVB V1 `...Storage/Assets/VFX/DragonfruitShotStart` 1p; Plants Vs Brainrot `...catedStorage/Assets/VFX/DragonfruitShot` 1p |
| papaya | Papaya (Model) | grow_a_garden (21394d8b357d) | `/ReplicatedStorage/Fruit_Spawn_OLD/Papaya` | 2 | yes (1) | MeshPart/SpecialMesh ids | 2.12x1x2.12 |  |
| durian | Durian (Model) | grow_a_garden (21394d8b357d) | `/ReplicatedStorage/Fruit_Spawn/Durian` | 16 | no | primitive Parts | 2.89x5.41x3.1 |  |
| passionfruit | Passionfruit (Model) | grow_a_garden (21394d8b357d) | `/ReplicatedStorage/Fruit_Spawn/Passionfruit` | 2 | no | primitive Parts | 2x2x1 |  |
| fig | Fig1 (Model) | Pokemon Adventures By Il (2335d1276098) | `...rkspace/Map/Viridian Forest/Trees/Fancy/FancyTrees/Fig1` | 2 | yes (1) | MeshPart/SpecialMesh ids | 6x9.9x6 | lifelike [v0.6] MI `/SavedGameModules/Workspace/MALL/fig3` 6p |
| olive | Olive (Model) | G (6e5d1a52cc7f) | `/Folder/Workspace/Three_pizza/Olive` | 9 | yes (7) | MeshPart/SpecialMesh ids | 2.86x0.4x6.93 | The Crust By TheOn `/GameModules/Workspace/Toppings#4/Olive#4` 1p; TA Silah Sistem `/ReplicatedStorage/lol/Olive Vest` 21p mesh |
| melon * | Melon (Tool) | One piece (28ec4cbf274f) | `/Lighting/Foods/Melon` | 1 | yes (1) | MeshPart/SpecialMesh ids | 1.37x1.02x1.37 | Mad Games (v2.22) `...Modules/Workspace/Lobby/SummerDec/Melon` 1p mesh; ETFB By A DEV STUD `...rots/Epic/Pi Pi Watermelon/monkey melon` 1p mesh |
| pickle | Pickle (UnionOperation) | The Crust By TheOnlyYaY (67a308412e53) | `/GameModules/Workspace/Toppings/Pickle#25` | 1 | no | Union(s) | 0.51x0.05x0.53 | Sophos Nightclub `...dules/Workspace/Model#83/Model#2/pickle` 9p; Sizzleburger V1.2 `...odules/Workspace/Model#35/Pickle  Giver` 1p |
| grapefruit | Grapefruit (Tool) | Welcome to the Town of R (d73348e2aeab) | `/Lighting/Grapefruit` | 1 | no | primitive Parts | 1x1x1 |  |
| gourd | Gourd (Model) | Naruto Ninja legacy (d84d881e876e) | `/Workspace/Kazekage Room/Gourd Giver/Gourd` | 19 | no | primitive Parts | 5.26x6.51x5.08 |  |
| mushroom * | Mushroom (Model) | Difficulty_Chart_Obby (95af168cd6ff) | `/Workspace/SpawnArea/Mushrooms/Mushroom#3` | 14 | yes (14) | MeshPart/SpecialMesh ids | 5.38x4.91x5.48 | G `/Folder/Workspace/Three_pizza/Mushroom` 9p mesh; Welcome to Bloxbur `...ge/ItemModels/Plants/Mushrooms/Mushroom` 1p mesh |
| sprout | Sprout (Model) | Meepcity (97e0df11a8ec) | `/ServerStorage/Assets/237/Sprout` | 6 | yes (3) | MeshPart/SpecialMesh ids | 1.86x2.94x1.69 |  |
| berry * | Berry (Part) | EGB City of London (c8f7f4c3b53d) | `/SavedGameModules/Workspace/AppleTree#19/Berries/Berry` | 1 | yes (1) | MeshPart/SpecialMesh ids | 1.28x1x1.28 | Survival 303 Versi `...e/Farming/Infertile Small Compost/Berry` 2p; Survival Infinity! `...dGameModules/Lighting/Agriculture/Berry` 7p |

`*` = note in JSON (fungus or generic name). MeshPart vs Part+SpecialMesh: `meshParts` and `meshIdCount` are in the JSON; clean single mesh models are the ones with parts 1-3 and mesh yes (apple, banana, carrot, potato, tomato, lemon, pumpkin, strawberry, papaya, cranberry, dragonfruit, lettuce). grow_a_garden `Fruit_Spawn` models are clean, correctly sized and named but built from primitive Parts (no MeshId).

### Rigged fruit/vegetable bodies (Plants-vs-Brainrots files, leanest variant per name)

Fruit/vegetable turrets from the four Plants-vs-Brainrots library files (321e74b79cd7 core with 29 heavy versions, f3ac50e43d68 / 84e0e1e046cc / 75a308cbb526 with 10-ish lean versions). One entry per plant name = its LEANEST variant (fewest parts), other variants listed. All are Motor6D rigs on AnimationController with PrimaryPart Hitbox (+ AttackOrigin), generic or Body/Tail joint names. Usable as whole vegetable bodies for enemies.

| plant | game (id) | path | parts (mesh) | Motor6D | size |
|---|---|---|---|---|---|
| Eggplant | Plants Vs Brainrots Mi (75a308cbb526) | `/ReplicatedStorage/Assets/Plants/Eggplant` | 5 (0) | 2 | 3x7.22x3.34 |
| Pumpkin | Plants Vs Brainrots Mi (75a308cbb526) | `/ReplicatedStorage/Assets/Plants/Pumpkin` | 6 (0) | 3 | 4.87x5.5x7.11 |
| Cocotank | Plants Vs Brainrots Mi (75a308cbb526) | `/ReplicatedStorage/Assets/Plants/Cocotank` | 8 (0) | 3 | 4.66x8.57x10.85 |
| Cactus | Plants Vs Brainrots Mi (75a308cbb526) | `/ReplicatedStorage/Assets/Plants/Cactus` | 10 (0) | 6 | 4.1x6.5x6.54 |
| Watermelon | Plants Vs Brainrots Mi (75a308cbb526) | `/ReplicatedStorage/Assets/Plants/Watermelon` | 11 (0) | 4 | 4.78x5.23x4.46 |
| Dragon Fruit | Plants Vs Brainrots Mi (75a308cbb526) | `/ReplicatedStorage/Assets/Plants/Dragon Fruit` | 12 (0) | 10 | 8.48x9.41x8.48 |
| Strawberry | Plants Vs Brainrots Mi (75a308cbb526) | `/ReplicatedStorage/Assets/Plants/Strawberry` | 12 (0) | 6 | 3.74x6.84x6.1 |
| Mr Carrot | Plants Vs Brainrots Mi (75a308cbb526) | `/ReplicatedStorage/Assets/Plants/Mr Carrot` | 14 (0) | 7 | 17.01x21.1x14.63 |
| Sunflower | Plants Vs Brainrots Mi (75a308cbb526) | `/ReplicatedStorage/Assets/Plants/Sunflower` | 18 (0) | 7 | 8.29x11.45x4.48 |
| Carnivorous Plant | exo PVB V1 (84e0e1e046cc) | `/ReplicatedStorage/Assets/Plants/Carnivorous Plant` | 23 (0) | 11 | 9.23x12.05x10.11 |
| Mango | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Mango` | 28 (17) | 50 | 6.79x3.86x6.02 |
| Pine-a-Painter | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Pine-a-Painter` | 49 (10) | 47 | 5.26x6.88x7.16 |
| Skullflower | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Skullflower` | 49 (11) | 47 | 3.08x7.72x4.7 |
| Troll Mango | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Troll Mango` | 49 (16) | 48 | 6.79x3.86x6.02 |
| Starfruit | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Starfruit` | 54 (30) | 52 | 4.56x7.07x7.5 |
| Cursed Pumpkin | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Cursed Pumpkin` | 65 (3) | 46 | 6.97x4.7x4.65 |
| Copuccino | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Copuccino` | 69 (8) | 67 | 5.57x5.64x7.58 |
| Aubie | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Aubie` | 71 (5) | 69 | 4.79x5.95x2.45 |
| Tomade Torelli | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Tomade Torelli` | 73 (7) | 71 | 3.86x7.44x5.66 |
| Commando Apple | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Commando Apple` | 80 (20) | 77 | 8.1x5.86x8.01 |
| King Limone | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/King Limone` | 80 (13) | 78 | 5.31x4.39x7.88 |
| Hallow Tree | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Hallow Tree` | 85 (13) | 83 | 5.69x9.7x15.91 |
| Tomatrio | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Tomatrio` | 95 (37) | 93 | 5.39x8.77x5.55 |
| Grape | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Grape` | 96 (21) | 94 | 5.69x8.84x7.47 |
| Sinister Grape | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Sinister Grape` | 96 (21) | 94 | 5.69x8.84x7.47 |
| Don Fragola | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Don Fragola` | 109 (10) | 107 | 4.88x4.73x2.84 |
| Sunzio | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Sunzio` | 109 (13) | 107 | 4.16x8.78x5.22 |
| Shroombino | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Plants/Shroombino` | 114 (3) | 112 | 5.25x4.33x4.62 |

Fruit/vegetable-named enemy rigs in the same files:

| enemy | game (id) | path | parts | Motor6D | bones | size | kind |
|---|---|---|---|---|---|---|---|
| Dragonfrutina Dolphinita | exo PVB V1 (84e0e1e046cc) | `...ge/Assets/Enemies/Normal/Dragonfrutina Dolphinita` | 10 | 9 | 54 | 8.87x8.98x7.05 | b-bone |
| Elefanto Cocofanto | exo PVB V1 (84e0e1e046cc) | `...dStorage/Assets/Enemies/Normal/Elefanto Cocofanto` | 10 | 9 | 41 | 4.31x4.12x7.02 | b-bone |
| Los Mr Carrotitos | exo PVB V1 (84e0e1e046cc) | `...edStorage/Assets/Enemies/Normal/Los Mr Carrotitos` | 10 | 8 | 54 | 9.96x9.01x6.58 | b-bone |
| Noobini Cactusini | exo PVB V1 (84e0e1e046cc) | `...edStorage/Assets/Enemies/Normal/Noobini Cactusini` | 10 | 8 | 6 | 4.8x7.76x2.67 | b-bone |
| Eggplantini Burbalonini | exo PVB V1 (84e0e1e046cc) | `...age/Assets/Enemies/Normal/Eggplantini Burbalonini` | 12 | 10 | 22 | 7.58x4.73x4.1 | b-bone |
| Cocotanko Giraffanto | exo PVB V1 (84e0e1e046cc) | `...torage/Assets/Enemies/Normal/Cocotanko Giraffanto` | 13 | 11 | 12 | 4.42x8.23x3.17 | b-bone |
| Trulimero Trulicina | exo PVB V1 (84e0e1e046cc) | `...Storage/Assets/Enemies/Normal/Trulimero Trulicina` | 13 | 12 | 46 | 3.14x3.96x6.39 | b-bone |
| Orangutini Strawberrini | exo PVB V1 (84e0e1e046cc) | `...age/Assets/Enemies/Normal/Orangutini Strawberrini` | 15 | 13 | 26 | 3.04x6.52x7.2 | b-bone |
| Noobini Bananini | exo PVB V1 (84e0e1e046cc) | `...tedStorage/Assets/Enemies/Normal/Noobini Bananini` | 18 | 16 | 0 | 1.05x5.55x3.6 | a-motor6d |
| Bombardilo Watermelondrilo | exo PVB V1 (84e0e1e046cc) | `.../Assets/Enemies/Normal/Bombardilo Watermelondrilo` | 22 | 20 | 36 | 7.9x4.02x9.29 | b-bone |
| Brr Brr Sunflowerim | exo PVB V1 (84e0e1e046cc) | `...Storage/Assets/Enemies/Normal/Brr Brr Sunflowerim` | 36 | 35 | 43 | 11.81x7.15x4.39 | b-bone |
| Pipi Kiwi | exo PVB V1 (84e0e1e046cc) | `/ReplicatedStorage/Assets/Enemies/Normal/Pipi Kiwi` | 38 | 37 | 40 | 5.53x4.26x2.87 | b-bone |
| Bananita Dolphinita | exo PVB V1 (84e0e1e046cc) | `...Storage/Assets/Enemies/Normal/Bananita Dolphinita` | 48 | 47 | 0 | 8.76x8.32x7.42 | a-motor6d |
| Pumpkino Camelo | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Brainrots/Pumpkino Camelo` | 72 | 69 | 0 | 5.02x8.67x3.18 | a-motor6d |
| Armadillo Watermelondrilo | PVB FULLY WORKING (2) (321e74b79cd7) | `...torage/Assets/Brainrots/Armadillo Watermelondrilo` | 75 | 73 | 0 | 8.38x6.74x10.39 | a-motor6d |
| La Tomatoro | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Brainrots/La Tomatoro` | 81 | 76 | 0 | 11.83x11.44x9.28 | a-motor6d |
| Orangutini Ananassini | exo PVB V1 (84e0e1e046cc) | `...orage/Assets/Enemies/Normal/Orangutini Ananassini` | 83 | 81 | 0 | 3.86x7.29x9.71 | a-motor6d |
| Svinino Pumpkinino | exo PVB V1 (84e0e1e046cc) | `...dStorage/Assets/Enemies/Normal/Svinino Pumpkinino` | 93 | 91 | 0 | 7.36x5.84x4.19 | a-motor6d |
| Cocolini Crabelo | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Brainrots/Cocolini Crabelo` | 97 | 95 | 0 | 6.74x5.01x6.19 | a-motor6d |
| Mangolodon | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Brainrots/Mangolodon` | 110 | 108 | 0 | 12.3x9.3x6.28 | a-motor6d |
| Troll Mangolodon | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Brainrots/Troll Mangolodon` | 112 | 107 | 0 | 12.3x9.3x6.28 | a-motor6d |
| Kiwissimo | PVB FULLY WORKING (2) (321e74b79cd7) | `/ReplicatedStorage/Assets/Brainrots/Kiwissimo` | 114 | 112 | 0 | 3.31x5.9x4.6 | a-motor6d |
| Pumpkinino Reaperina | PVB FULLY WORKING (2) (321e74b79cd7) | `...atedStorage/Assets/Brainrots/Pumpkinino Reaperina` | 119 | 117 | 0 | 5.32x8.11x15.1 | a-motor6d |
| Strawberry Camaleonte | PVB FULLY WORKING (2) (321e74b79cd7) | `...tedStorage/Assets/Brainrots/Strawberry Camaleonte` | 130 | 127 | 0 | 26.48x19.9x14.33 | a-motor6d |

## 3. Systems for the orchard idea

### Plot / planting / growth

**1. Modded PvB lane plot + plant placement (Plot class, PlotServiceServer, PlantService, Plant class, PlacementService, PlantClient)** - plants vs brainrots modded (`f3ac50e43d68e198334031753e4050ec36e311ad8291b2fe3a4080ce19dc7a89`) - **semi-entangled**
- Scripts: `/ServerScriptService/Classes/Plot`; `/ServerScriptService/Classes/Plant`; `/ServerScriptService/Services/PlayerSetUpService/PlotServiceServer`; `/ServerScriptService/Services/PlantService/PlantService`; `/ReplicatedStorage/Shared/Services/PlacementService`; `/ReplicatedStorage/Shared/Classes/PlantClient`; `/ReplicatedStorage/Shared/Classes/PlotClient`; `/ReplicatedStorage/Shared/Modules/Data/Plants`; `/ReplicatedStorage/Shared/Configuration`
- Needs workspace: Workspace.Map.Plots.PlotTemplate (cloned per player); Workspace.Map.PlotLocations (one slot per plot; attributes PlotIndex, Occupied); Plot model children read by name: Lanes.Lanes.Lane1..7 (Waypoints Enter/Exit attachments, X must match placement within +-3 studs), Lanes.LanesButtons, Lanes.LawnMowerLocations, Plants (Folder), Enemies (Folder), EnemySpawn.Waypoints, OwnerBillboard.BillboardGui{NameLabel,ImageLabel}, OwnerSpawnPoint (Attachment), Platforms.Platforms.PlatformN, Platforms.Placement, Monetization, container
- Needs replicatedStorage: Shared/Configuration (PlotCount, MaxPlantsPlacedPerLane=5, PlantAttackSpeed=1, EnemySpawnIncrement=2, MutationMode); Shared/Modules/Data/{Plants,Enemies,Mutations,Rarity,PlatformCosts,LaneCosts,Rebirths,Products}; Shared/Modules/{SharedUtils,ApplyModelModifications,EffectsHandler,getModelFromMouseRaycast}; Assets/Enemies (65 rigged enemy models: 26 Motor6D, 39 Bone), Assets/Plants (10 lean rigged fruit/veg turrets), Assets/Extra/{EnemyOverhead,CostUI}; Packages/{Networker,Zone(Janitor,Signal),Timer,Promise,ReplicaClient,DataAggregation}
- Needs remotes: Networker channels "PlantService" (place), "EnemySpawn", "SeedShop", "Sell" (created by Networker, no RemoteEvent instances to pre-create)
- Needs tags: plant; seed; enemy; npcTool; platformNPC; growingPart
- Needs attributes: plant/plantNumber/multiplier/mutation/timePlaced/damage on tools and plant models; laneNumber, playerName
- Needs modules: ServerScriptService/Modules/{ServerUtils,SignalBank,StockController,CollisionGroups,TypeValidation/*}; ServerScriptService/Packages/{ProfileStore,ReplicaServer}
- Needs dataStoreKeys: ProfileStore via PlayerDataModule; "GameProgressDataStore" in GameDataStore script
- Gives: PlantService:place(player, plantName, position, laneNumber, tool?) server-validated (lane unlocked, X inside lane, inventory, MaxPlantsPlacedPerLane*LanesUnlocked); Plot.GetFromOwner(player), Plot._attackEnemiesInLane(lane) (each plant hits enemies[1] every PlantAttackSpeed, 0.2 s delay); Plant class: damage = data.damage*size*mutation multiplier; plant grows over data.timeToGrow (timePlaced attribute, growingPart tag) - growth is visual time-to-ready, not a crop cycle. Data: Data/Plants {timeToGrow, damage, rarity, price, stockChance, maxStockAmount, seedColor}
- Notes: Small (100 non-package scripts) class/service architecture, the cleanest plot+placement code in the library. Needs a map template with the exact plot children above; everything else is data modules + 6 shared packages. Notes: no separate crop-growth cycle (plants are turrets). Needs animations slot Animations.Attack/Walk on models (creator-owned ids) -> replace with procedural. Verdict: BEST base for a lane defense placement loop; port the Plot template names, drop Robux/Products.

**2. Grow a Garden crop growth (Plant_Module, PlantHandler/*, Item_Module, SeedData, FarmService, EventHandler Plant_RE)** - grow_a_garden (`21394d8b357d0aedba7d1081a40dfc1bb64ef0b300c520ef2392e1dba4a1a82e`) - **entangled**
- Scripts: `/ServerScriptService/EventHandler`; `/ServerScriptService/Init`; `/ReplicatedStorage/Plant_Module`; `/ReplicatedStorage/Item_Module`; `/ReplicatedStorage/Data/SeedData`; `/ServerStorage/PlantHandler/* (51 scripts)`; `/ServerStorage/Collectables (29 crop models)`; `/ServerStorage/TurnToTool`; `/ReplicatedStorage/Fruit_Spawn`; `/ReplicatedStorage/Seed_Models`
- Needs workspace: Workspace.Farm.Farm<n> plots, Important/Plant_Locations with Can_Plant beds (resolved by ReplicatedStorage/Modules/GetFarm); Workspace.Dirt_VFX
- Needs replicatedStorage: GameEvents (57 RemoteEvents: Plant_RE, Remove_Item, Water_RE, Sprinkler_RE, BuySeedStock, Sell_*...); Data/{SeedData,DefaultData,QuestData,...}; Modules/{MutationHandler,CalculateToolValue,PlayerLuck,Maid,RetryPcall,DataService,ReplicationClass}; Plant_Module, Item_Module, Scale_Module, Data_Module
- Needs serverStorage: PlantHandler/<Crop> (Script + FruitHandler), Collectables/<Crop> Model (NumberValues Weight/Item_Seed/Plant_Down/Variance, Folder Grow{Grow_Rate,Age,Item_Speed_Mult}, numbered stage Parts), PlayerData (module), TurnToTool, Plants
- Needs tags: PlantGenerated; Mutatable
- Needs attributes: Owner, PlantedOn, PlantedOnOffset, UUID, ITEM_UUID, ItemType, GrowRateMulti, GrowTickTime, MaxAge, FruitSpawnCF
- Needs modules: ServerScriptService/Modules/{ProfileService,CurrencyService,SeedService,GearService,QuestsService,GameEvents,FarmService,WeatherService}
- Needs dataStoreKeys: PlayerDataRESET (ProfileService, key PLAYER_<userId>); PlantsNFruitsRESET (key <userId>Plants); Sheckles_LeaderboardRESET
- Gives: Seed tool -> Plant_RE(position) -> server clones Collectables/<Crop>, registers Grow/Age, ticks Age += Grow_Rate*Item_Speed_Mult every GrowTickTime s, stage = ceil(age) matching numbered part names, ripe at MaxAge; trees keep spawning fruit; harvest via ProximityPrompt -> TurnToTool -> fruit Tool with Weight/Variant attributes; state serialised to DataStore on leave. Data: one crop = 6 places that must agree by name (SeedData, Item_Module, Collectables, PlantHandler, Seed_Models, Fruit_Spawn)
- Notes: Growth model is the only true crop cycle in the library but it is monolithic (Init 684 lines, EventHandler 670 lines), tied to Workspace.Farm via GetFarm and to ServerStorage/PlayerData; 534 of 1248 scripts are empty server stubs in the dump. Use as reference for the stage/ripen/fruit-weight design; re-implement. Reads: 29 crops include carrot, strawberry, blueberry, tomato, corn, eggplant, pumpkin, watermelon, apple, dragon fruit, mango, pepper... Verdict: REFERENCE for growth; do not import whole.

**3. Easy Plot System (plot claim + sign)** - Easy Plot System (`0d42080541ab55cf8cf9b8070ac28b82f6d78d0b8f7a700ef6cf0653296437cd`) - **standalone**
- Scripts: `/PlotSystem/Ungroup in ServerScriptService/PlotLoader (58 lines, only script)`
- Needs workspace: Workspace.Map.Plots.<1..6> each with Part "teleport" and Sign.PlayerDisplay.SurfaceGui{PlayerName TextLabel, PlayerIcon ImageLabel}
- Needs replicatedStorage: creates ReplicatedStorage.PlotHolders Folder at runtime
- Gives: PlayerAdded: first free number 1..6 -> ObjectValue in PlotHolders, player.PlotNumber IntValue, teleport on CharacterAdded, headshot thumbnail sign; 7th player is kicked; PlayerRemoving frees the plot. Data: none
- Notes: Fully standalone but tiny and brittle (no nil checks, kicks when full). Good as the plot-assignment step only; growth/planting must come from elsewhere. No growth or planting. Verdict: Use for per-player plot assignment, rewrite the kick.

### Lane / path / wave enemy spawner

**1. Modded PvB enemy pipeline (SpawnService, Enemy class, EnemyClient, Enemies data)** - plants vs brainrots modded (`f3ac50e43d68e198334031753e4050ec36e311ad8291b2fe3a4080ce19dc7a89`) - **semi-entangled**
- Scripts: `/ServerScriptService/Services/EnemySpawnService/SpawnService`; `/ServerScriptService/Services/EnemySpawnService/Modules/RegularPickRandom`; `/ServerScriptService/Classes/Enemy`; `/ReplicatedStorage/Shared/Classes/EnemyClient`; `/ReplicatedStorage/Shared/Modules/Data/Enemies`; `/ReplicatedStorage/Shared/Modules/Data/Rarity`; `/ReplicatedStorage/Shared/Modules/Data/Mutations`
- Needs workspace: Plot model: Lanes.Lanes.Lane<N>.Waypoints.{Enter,Exit}, EnemySpawn.Waypoints.{<side>Spawn,<side>Exit}, Enemies folder (server parent of clones)
- Needs replicatedStorage: Assets/Enemies/<Name> Model (or Assets/Enemies/<Mutation>/<Name> in Manual mode): PrimaryPart (anchored by server), optional Humanoid (EvaluateStateMachine=false) OR AnimationController with Animator, child folder "Animations" with Animation "Walk" (creator id; replace), ReplicatedStorage.Assets.Extra.EnemyOverhead BillboardGui {Title,Rarity{RarityColor},Mutation,Health{Amount,Filler}}; ServerLuck.{TimeBought,Luck} NumberValues; Shared/Configuration (EnemySpawnIncrement=2)
- Needs remotes: Networker "EnemySpawn" (new enemy broadcast), "Sell"
- Needs tags: enemy
- Needs attributes: maxHealth, playerName, name, laneNumber, plotNumber, mutation on the enemy model
- Needs modules: Plot class (enemiesInLanes[lane]), PlayerDataModule (Lanes[], EnemiesSpawned, Tutorial, AutoSell, Inventory), ServerUtils.addNPCTool, SharedUtils.calculateSellPrice
- Gives: Per player: waits until >=1 plant placed and no enemies alive, then spawns math.random(1,max(1,EnemiesSpawned/100)) passes over all unlocked lanes at EnemySpawnIncrement, rarity-weighted (guaranteed Legendary every 100, Mythic every 500); enemy registers in plot.enemiesInLanes[lane] after 10 s and self-destructs after 20 s more; client tweens it Spawn->Enter (3 s)->Exit (20 s); death drops a sellable tool or auto-sells; no lose condition, no discrete wave number. Data: Data/Enemies {baseHealth, rarity, baseSellPrice, baseMoneyPerSecond}
- Notes: Continuous spawner, not waves: we must add wave index/counter, wave composition tables and a leak-damage (orchard health) rule. Movement is a client tween between lane waypoints: trivial to keep; replace EnemyClient walk AnimationTrack with procedural Motor6D/Bone animation. Enemy rig contract is AnimationController (or Humanoid) + PrimaryPart; matches the recommended bodies. Verdict: Best starting point for lane spawner + damage loop.

**2. PvB core brainrot spawner (Brainrots [Server], Attacks [Server], BezierPath)** - PVB FULLY WORKING (2) (`321e74b79cd7024aa48f516fdf96d21afa727a33e40402e5f39bd38d33c4faa1`) - **entangled**
- Scripts: `/ServerScriptService/Server/Brainrots [Server] (771 lines)`; `/ServerScriptService/Server/Attacks [Server]`; `/ReplicatedStorage/Modules/Utility/BezierPath`; `/ReplicatedStorage/Modules/Registries/BrainrotRegistry`; `/ReplicatedStorage/Modules/Library/{Chances,BrainrotMutations,BossParams,BossTrack}`; `/ServerScriptService/Server/Bosses [Server]`
- Needs workspace: Workspace.Plots.<1..6> (hard-coded `for plot = 1, 6` with WaitForChild at require time); Plots.<n>.Paths.{1,2} = Folders of Parts named 1..N (Bezier control points); Plots.<n>.Rows.<r>.{BrainrotWalkto,BrainrotEnd,MowerSpawn}; Plots.<n>.{Brainrots,Spawner,SpawnerUI.Main}; Workspace.ScriptedMap.Brainrots
- Needs replicatedStorage: Assets/Brainrots/<Name> (PrimaryPart Hitbox, AnimationController>Animator, Motor6D rig, attributes Rarity/Health/Icon); Assets/Animations/Brainrots/<Name>/{Walk,Idle} (creator ids, loaded on the SERVER); Remotes (186 instances, looked up by name): SpawnBrainrot, DeleteBrainrot, UpdateHealth, PushBrainrotToStart, ChangeBrainrotStat, SpawnBrainrotDamageEffect
- Needs serverStorage: BrainrotPositions; SpawnerModels (Tier1-7)
- Needs remotes: SpawnBrainrot; DeleteBrainrot; UpdateHealth; PushBrainrotToStart; SpawnTutorialBrainrot; FinishTutorial
- Needs tags: Brainrot; Plant; SineObjects
- Needs attributes: Health, MaxHealth, Rarity, Mutation, Boss, Plot, Progress, Frozen, Stunned, StunnedType, SpeedyGame (Workspace)
- Needs modules: ServerPlayerData, ServerUtil, Util, LootPlan, BridgeNet2, LuckService [Server], Bosses [Server], CardUpdateEvent/CardMethods stubs (hard requires), BiomeRegistry
- Gives: Server simulates each creature along a BezierPath(points from row BrainrotWalkto/BrainrotEnd, Progress attribute), rarity/mutation/size/health rolls, boss pity tracker, per-row random owned row; plants in the same row shoot the nearest. Data: BrainrotRegistry / Chances / BiomeRegistry / BossTrack
- Notes: Hard-requires ~10 sibling modules (cards, bosses, luck, biome) and the 6-plot Workspace tree; 128 creature models and 186 remotes. Adopt the ideas (bezier lane walking, rarity roll, boss pity), not the code. Server-side walk animation load will slide in T-pose without owner-owned Animation ids. Verdict: Reference only.

**3. Guest Defense WaveScript (legacy numbered waves)** - Guest Defense (`4eee4550291b3766b12ebf085a1db85403148e5adc8749369ad3788063110dfc`) - **entangled**
- Scripts: `/ReplicatedStorage/WaveScript (148 lines)`; `/ReplicatedStorage/WaveScriptSurvival`; `/Workspace/Check Last Enemy`; `/Workspace/ChooseNextRound`; `/Workspace/Enemys/Script`
- Needs workspace: NumberValues Workspace.Wave, Enemys, SpawnedEnemys, Boss, Enemyskilled, Win; Parts Workspace.Spawn, Spawn2, Spawn3 (Fire children animate), Workspace.Enemys folder, Workspace.ActivateFireworks script, Workspace.Statue (defended core)
- Needs replicatedStorage: enemy templates under ReplicatedStorage (ArcherGuest AI scripts: Follow, Death, SwordCarrier, Load AI Stats)
- Gives: Wave counter Value (Workspace.Wave.Value) incremented per round with enemy count scaling, boss flag, win at last wave; legacy Script style (ContentProvider preload, wait()). Data: hard-coded in script
- Notes: 2010s-era script with globals in Workspace and unfiltered client-facing assumptions; the only place with an explicit numeric wave counter + win condition, so worth reading for the shape (Wave/Enemys/SpawnedEnemys/Killed/Win values) and re-writing. Low quality, no public API. Verdict: Shape reference for a wave counter; rewrite.

### Tower / defender placement and damage

**1. Modded PvB placement + lane damage** - plants vs brainrots modded (`f3ac50e43d68e198334031753e4050ec36e311ad8291b2fe3a4080ce19dc7a89`) - **semi-entangled**
- Scripts: `/ReplicatedStorage/Shared/Services/PlacementService (client ghost + raycast)`; `/ServerScriptService/Services/PlantService/PlantService`; `/ServerScriptService/Services/PlantService/PickupService (shovel)`; `/ServerScriptService/Classes/Plant`; `/ServerScriptService/Classes/Plot (_attackEnemiesInLane)`; `/ReplicatedStorage/Shared/Classes/PlantClient`; `/ReplicatedStorage/Shared/Modules/EffectsHandler`
- Needs workspace: Plot Lanes.Lane<N> pivots, Plants folder
- Needs replicatedStorage: Plant models with PrimaryPart, MODEL.Animations.Attack (creator id) on AnimationController.Animator, EffectsHandler["<Plant>Attack"] functions, SoundService.SFX.PlantAttack.<Plant>
- Needs remotes: Networker "PlantService"
- Needs tags: plant; seed
- Needs attributes: name, damage, laneNumber, mutation, multiplier, timePlaced
- Needs modules: Data/Plants; Configuration.MaxPlantsPlacedPerLane; Shovel tool StarterPack "Shovel [Pick up plants]"
- Needs dataStoreKeys: Profile.Data.Plants (saved placements)
- Gives: place/pickup, lane-based damage (enemies[1] of the plant lane, flat damage * size * mutation), client-side attack animation + projectile VFX via EffectsHandler per plant name. Data: Data/Plants.damage, Configuration.PlantAttackSpeed
- Notes: Damage resolution is server-authoritative but the "attack" visuals are per-plant functions in EffectsHandler (264 lines) and an Attack Animation: our orchard defenders need new effects and procedural attack poses. Same Animation-id caveat. Verdict: Base for lane defenders; swap turret models for orchard towers.

**2. PvB core plant attacks (Planting [Server], Attacks [Server], Attacks/<Name> modules)** - PVB FULLY WORKING (2) (`321e74b79cd7024aa48f516fdf96d21afa727a33e40402e5f39bd38d33c4faa1`) - **entangled**
- Scripts: `/ServerScriptService/Server/Planting [Server]`; `/ServerScriptService/Server/Attacks [Server]`; `/ReplicatedStorage/Attacks/<PlantName> (one ModuleScript per plant)`; `/ReplicatedStorage/Modules/Registries/PlantRegistry`; `/ReplicatedStorage/Modules/Library/PlantAnimationDelay`; `/StarterPlayer/StarterPlayerScripts/Client/Modules/{Planting [Client],Attacks [Client],ProjectileManager}`
- Needs workspace: Plots.<n>.{Rows,Plants,Hitboxes}, Grass tiles (Tag Grass) 6x0.4x6
- Needs replicatedStorage: Assets/Plants/<Name> (PrimaryPart Hitbox, AttackOrigin part, Motor6D rig, AnimationController); Assets/Animations/Plants/<Name>/{Idle,Attack}; Assets/Projectiles; Remotes: PlaceItem, RemoveItem, DeletedPlants, ProjectileManager/*
- Needs remotes: PlaceItem; RemoveItem; UseItem; EquipItem
- Needs tags: Grass; Plant
- Needs attributes: Owner, CanPlace, IsPlant, TotalDPS, Uses, ID, Plant
- Needs modules: PlantRegistry {Damage,Cooldown,GrowTime,Icon,Rarity,Range}; General.MaxPlantsPerRow=5; Plants [Server] (4-line stub others require); CardMethods hooks (OnPlantHit)
- Gives: click-to-plant on Grass tiles; only plants in the same row shoot; per-plant WindUp/TravelTime; upgrade levels via EXP; 29 plant models (22-114 parts) with fruit/vegetable themes. Data: PlantRegistry / SeedRegistry / SeedStocks
- Notes: Same 6-plot/186-remote/card-hook entanglement as the core. Its 29 rigged fruit/vegetable plant models are the main asset value (see rigged fruit bodies). Verdict: Content source for models; not code.

**3. Plants vs Zombies fan game (design + client UI only)** - Roblox Plants vs. Zombies (`cd8cee81efc44ae7c4efc12b2841e36ef7d7a6f4c5944071f64e082d2c53062b`) - **entangled**
- Scripts: `/SavedGameModules/ReplicatedStorage/{Morph,WasteSun,UpgradeStat,PurchaseHouseStuff}`; `/SavedGameModules/Workspace/TheDeletableMap/ZombieSpawns (12 lane spawn pads)`; `/SavedGameModules/Workspace/{Wave,TotalWaveZombies,Zombies}`
- Needs workspace: 12 spawn pads, NumberValues Wave/TotalWaveZombies/Message, folders Zombies, Bots
- Needs replicatedStorage: RemoteFunctions Morph, WasteSun, UpgradeStat, PurchaseHouseStuff; RemoteEvents Spawn, Respawn
- Needs remotes: Morph; WasteSun; UpgradeStat; PurchaseHouseStuff; Spawn; Respawn
- Needs modules: Zombie model contract: R6 + Humanoid "Zombie" + IntValue Health + Configuration AI{Intelligence,Focused,Damage,Sun}
- Gives: none runnable (zero server scripts). Data: plant roster (18), Sun costs, zombie stat schema, 12-lane layout
- Notes: Server half missing; players morph into plants. Use only for design (sun economy, upgrade rows) and its R6 zombie contract. Verdict: Design reference only.

### Shop / buy

**1. Modded PvB seed shop (SeedShop server + StockController + SeedShopFrame UI)** - plants vs brainrots modded (`f3ac50e43d68e198334031753e4050ec36e311ad8291b2fe3a4080ce19dc7a89`) - **semi-entangled**
- Scripts: `/ServerScriptService/Services/UIService/Modules/SeedShop (47 lines)`; `/ServerScriptService/Modules/StockController (125 lines)`; `/ReplicatedStorage/UIController/Menus/SeedShopFrame`; `/ReplicatedStorage/Shared/Modules/Data/Plants`
- Needs replicatedStorage: Packages/Networker; Shared/Modules/Data/Plants {price, stockChance, maxStockAmount}; StarterGui SeedShop frame (names read by UIController/Menus/SeedShopFrame)
- Needs remotes: Networker "SeedShop".purchaseSeed(plantName)
- Needs modules: PlayerDataModule (Money, SeedShopInfo.{LastRestock,StockInfo}, Set/SetValues); ServerUtils.addSeedTool; SignalBank.PLAYER_DATA_LOADED
- Needs dataStoreKeys: profile.Data.SeedShopInfo
- Gives: purchaseSeed returns "Out of stock"/"Not enough cash", deducts Money, gives seed tool, decrements stock; per-player stock re-rolled every 300 s from stockChance. Data: Data/Plants
- Notes: Tiny and readable; relies on the PlayerDataModule profile shape. TODO in source: restock event not pushed to client. Verdict: Best shop skeleton.

**2. PvB core Seeds [Server] shop** - PVB FULLY WORKING (2) (`321e74b79cd7024aa48f516fdf96d21afa727a33e40402e5f39bd38d33c4faa1`) - **entangled**
- Scripts: `/ServerScriptService/Server/Seeds [Server]`; `/ReplicatedStorage/Modules/Registries/SeedRegistry`; `/ReplicatedStorage/Modules/Library/SeedStocks`; `/StarterGui/Main/Seeds`; `/StarterPlayer/StarterPlayerScripts/Client/Modules/Seeds [Client]`
- Needs replicatedStorage: Assets/Seeds/<Plant> Tool (Stock attribute written every 300 s); Modules/{LootPlan,BridgeNet2}; Remotes
- Needs remotes: BuyItem (BridgeNet2 bridge "BuyItemBridge"); UpdStock; UpdatePlantStocks; Notification
- Needs attributes: Stock, NextSeedRestock, SeedsRestockSeed
- Needs modules: ServerPlayerData, ServerUtil, UpdateTimeRegistry (client); CardPack stubs
- Gives: global (not per-player) stock restock every 300 s with luck-skewed RNG, price from SeedRegistry (overrides tool attribute), Robux product ids inside entries. Data: SeedRegistry + SeedStocks
- Notes: Needs the PvB data/remote skeleton. Verdict: Reference.

**3. Grow a Garden seed/gear shop (SeedStockHandler, EventHandler BuySeedStock, SeedShopController)** - grow_a_garden (`21394d8b357d0aedba7d1081a40dfc1bb64ef0b300c520ef2392e1dba4a1a82e`) - **entangled**
- Scripts: `/ServerScriptService/SeedStockHandler`; `/ServerScriptService/GearStockHandler`; `/ServerScriptService/EventHandler (BuySeedStock, BuyGearStock)`; `/ReplicatedStorage/Data/{SeedData,GearData,SeedShopData,GearShopData}`; `/ReplicatedStorage/Modules/{SeedShopController,GearShopController}`; `/StarterGui/Seed_Shop`; `/StarterGui/Gear_Shop`
- Needs workspace: NPC Josh stall (Workspace.NPCS)
- Needs replicatedStorage: GameEvents.{BuySeedStock,BuyGearStock,UpdateStock,DataStream}; Data/SeedData {SeedName,SeedRarity,StockChance,StockAmount,Price,PurchaseID,LayoutOrder}
- Needs remotes: BuySeedStock; BuyGearStock; UpdateStock; UpdateGearStock; DataStream
- Needs modules: ServerStorage/PlayerData; CurrencyService; SeedService; DataService client mirror
- Needs dataStoreKeys: profile.Data.SeedStock/GearStock
- Gives: per-player stock in profile pushed via DataStream every 5 min; server checks Sheckles then SeedService:Add. Data: SeedData / GearData
- Notes: Shop UI reads replicated profile through DataService/ReplicationClass (custom), so UI and server move together. Robux PurchaseID fields everywhere. Verdict: Reference for restock timers UI.

### Sell

**1. Modded PvB sell (SellStuff + SharedUtils.calculateSellPrice)** - plants vs brainrots modded (`f3ac50e43d68e198334031753e4050ec36e311ad8291b2fe3a4080ce19dc7a89`) - **semi-entangled**
- Scripts: `/ServerScriptService/Services/UIService/Modules/SellStuff (97 lines)`; `/ReplicatedStorage/Shared/Modules/SharedUtils`; `/ServerScriptService/Modules/ServerUtils (addNPCTool/addSeedTool/removeTool)`; `/ServerScriptService/Services/UIService/Modules/AutoSell`; `/ReplicatedStorage/UIController/Menus/AutoSellFrame`
- Needs replicatedStorage: Networker "Sell" channel; Data/Enemies.baseSellPrice, Data/Plants price
- Needs remotes: Networker "Sell": sellAllNPCs, sellAllPlants, sellHoldingItem
- Needs tags: npcTool; seed
- Needs attributes: npc, plant, plantNumber, multiplier, mutation on Tools
- Needs modules: PlayerDataModule Money
- Gives: sum sell price of every tagged tool in Backpack/character, remove tools, add Money; auto-sell on kill by mutation/rarity toggles. Data: price = base * multiplier * mutation
- Notes: Drop-in once the tool attribute contract (tags npcTool/seed + attributes) exists; our vegetables can reuse npcTool tools. Verdict: Best sell skeleton.

**2. PvB core Barry [Server] (ItemSell, CheckWorth, AutoSell)** - PVB FULLY WORKING (2) (`321e74b79cd7024aa48f516fdf96d21afa727a33e40402e5f39bd38d33c4faa1`) - **entangled**
- Scripts: `/ServerScriptService/Server/Barry [Server] (164 lines)`; `/ReplicatedStorage/ServerUtil (GetBrainrotWorth)`; `/ReplicatedStorage/Modules/Library/General`; `/ServerScriptService/Server/Misc [Server] (AutoSellBridge, FavoriteItemBridge)`
- Needs workspace: Workspace.ScriptedMap (Barry sell stall, client-side NPC moved into plot)
- Needs replicatedStorage: BridgeNet2 bridges ItemSell, CheckWorth, AutoSell, FavoriteItem; SeedRegistry, PlantRegistry, PlantMutations, LootPlan
- Needs remotes: ItemSell; CheckWorth; AutoSell; FavoriteItem
- Needs tags: Plant; Brainrot
- Needs attributes: ID, Value
- Needs modules: ServerPlayerData; ServerUtil
- Gives: worth = floor(Health/4 x mutation) x size x tier; sell one/all; income platforms pay worth/10 per second. Data: General.*, BrainrotMutations
- Notes: PlotNPCs exist only client-side after Misc [Client] moves them; server cannot see the stall. Verdict: Reference.

**3. Grow a Garden sell (Sell_Inventory/Sell_Item + CalculateToolValue + NPC dialogue)** - grow_a_garden (`21394d8b357d0aedba7d1081a40dfc1bb64ef0b300c520ef2392e1dba4a1a82e`) - **semi-entangled**
- Scripts: `/ServerScriptService/EventHandler (Sell_Item, Sell_Inventory)`; `/ReplicatedStorage/Modules/CalculateToolValue`; `/ReplicatedStorage/Modules/MutationHandler`; `/Workspace/NPCS/Cedric/HumanoidRootPart/ProximityPrompt/SellScript`; `/ReplicatedStorage/{Top_Text,NPC_MOD,NPC_UIS}`
- Needs workspace: Workspace.NPCS.Cedric with ProximityPrompt (client SellScript, 306 lines)
- Needs replicatedStorage: GameEvents.Sell_Item, Sell_Inventory; Item_Module (value per kg); Top_Text/NPC_MOD dialogue modules
- Needs remotes: Sell_Item; Sell_Inventory
- Needs attributes: Item_String, Variant, Weight, mutation flags on fruit Tools
- Needs modules: CurrencyService:Add; QuestsService
- Gives: value = valuePerKg x mutation x variant x (weight/baseWeight)^2 x 1.5 (VIP x2), paid in Sheckles. Data: Item_Module table
- Notes: Self-contained NPC dialogue (Top_Text/NPC_MOD) is reusable on its own; server selling is inside EventHandler. Verdict: Good weight/variant value formula reference.

### Currency / leaderstats

**1. Modded PvB PlayerDataModule (Money via Replica + leaderstats mirror)** - plants vs brainrots modded (`f3ac50e43d68e198334031753e4050ec36e311ad8291b2fe3a4080ce19dc7a89`) - **semi-entangled**
- Scripts: `/ServerScriptService/Services/PlayerSetUpService/Modules/PlayerDataModule (242 lines)`; `/ServerScriptService/Services/PlayerSetUpService/PlayerSetupServer`; `/ServerScriptService/Services/PlayerSetUpService/PlayerSetupServer/DATA_TEMPLATE`; `/ReplicatedStorage/UIController/HUD/MoneyLabel`
- Needs replicatedStorage: Packages/{Promise,ReplicaClient}
- Needs modules: ServerScriptService/Packages/{ProfileStore,ReplicaServer}; Modules/SignalBank; player.leaderstats Folder must exist (PlayerSetupServer creates it)
- Needs dataStoreKeys: ProfileStore (name set in PlayerSetupServer)
- Gives: PlayerDataModule.Get/WaitFor(player) -> {Profile, Set(path,value), SetValues, UpdateLeaderstat}; RegisterStat(path, statName, transform) mirrors a data path to leaderstats; replicates to clients. Data: DATA_TEMPLATE.Money=200
- Notes: Couples currency with save and replication (good). Needs the two packages and SignalBank. Verdict: Best integrated currency+save core.

**2. Grow a Garden CurrencyService + leaderstats mirror** - grow_a_garden (`21394d8b357d0aedba7d1081a40dfc1bb64ef0b300c520ef2392e1dba4a1a82e`) - **entangled**
- Scripts: `/ServerScriptService/Modules/CurrencyService (22 lines)`; `/ServerScriptService/Init (leaderstats creation)`; `/ReplicatedStorage/Comma_Module`; `/StarterGui/Sheckles_UI`
- Needs replicatedStorage: GameEvents (SheckleUpdate)
- Needs remotes: SheckleUpdate; DataStream
- Needs modules: ServerStorage/PlayerData; QuestsService; GameEvents module
- Needs dataStoreKeys: profile.Data.Sheckles
- Gives: CurrencyService:Add(player, amount) is the only mutation point; Init mirrors to leaderstats.Sheckles. Data: DefaultData.Sheckles=20000
- Notes: 22-line wrapper over the custom PlayerData store; fine as a pattern only. Verdict: Pattern reference.

**3. DailyReward1.0 Leaderstats script (standalone Cash leaderstat)** - DailyReward1.0 (1) (`0ef1487595a2e6a0cb35efc641a52d1f5fc6e03a67bca7e2e298333ab374ce71`) - **standalone**
- Scripts: `/DailyReward1.0/Ungroup in ServerScriptService/Leaderstats [DONT DRAG IF YOU HAVE THIS ALREADY] (33 lines)`
- Needs dataStoreKeys: DataStore "Cash" (raw GetAsync/SetAsync on every Changed)
- Gives: creates leaderstats.Cash IntValue = saved or 10000. Data: none
- Notes: Works alone but saves on every value change (will hit DataStore throttles) and duplicates the save: use only as a stub and never together with ProfileService data. Verdict: Stub only.

### Save / DataStore

**1. Persistence wrapper over ProfileService (Core/Data)** - CashgrabBridgeEU (`60ae3b4adcee287c7cd0a1d97fc86a4d87b6f5940af6aa08af25a9eb3a1fb7b2`) - **standalone**
- Scripts: `/ServerScriptService/Core/Data (27 lines)`; `/ServerScriptService/Core/Data/Persistence (180 lines, "Persistence 0.2.0")`; `/ServerScriptService/Core/Data/Persistence/ProfileService (2417 lines)`; `/ServerScriptService/Core/Data/Persistence/UserData (template)`
- Needs modules: none besides its own children
- Needs dataStoreKeys: ProfileStore name = Data.initializeData constant "TEST-PLACE" (rename); ProfileService uses "____PS" key prefix internally
- Gives: Data.initializeData(); Data.registerPlayer(p) / deregisterPlayer(p); Data.awaitData(p, field) (yields until loaded); Data.set(p, field, value); Persistence.get(p, field), Persistence.bindToChange(field, cb). Data: UserData.PlayerData template table (edit fields; Reconcile adds new keys)
- Notes: Fully standalone, server-only, zero Workspace/Remote references. Kicks the player if the profile cannot load. Mock store in Studio without API access. Only needs a template table. Verdict: FIRST CHOICE for save. Wire leaderstats/currency on top of bindToChange.

**2. ProfileStore + ReplicaService data core (PvB variants)** - plants vs brainrots modded (`f3ac50e43d68e198334031753e4050ec36e311ad8291b2fe3a4080ce19dc7a89`) - **semi-entangled**
- Scripts: `/ServerScriptService/Packages/ProfileStore (2243 lines)`; `/ServerScriptService/Packages/ReplicaServer (1029)`; `/ReplicatedStorage/Packages/ReplicaClient (957)`; `/ServerScriptService/Services/PlayerSetUpService/PlayerSetupServer (+DATA_TEMPLATE)`; `/ServerScriptService/GameDataStore`
- Needs workspace: Workspace.Characters (folder), Shovel tool in StarterPack
- Needs replicatedStorage: ReplicaShared/{Maid,RateLimit}; Packages/Promise
- Needs remotes: Replica creates its own
- Needs modules: SignalBank (PLAYER_DATA_LOADED); Plot class (plot load on data load)
- Needs dataStoreKeys: ProfileStore template DATA_TEMPLATE; GameProgressDataStore
- Gives: PlayerDataModule.Get/WaitFor(player).Profile.Data + replicated Set paths; client reads ReplicaClient. Data: DATA_TEMPLATE (Money, Lanes, Plants, Inventory, SeedShopInfo, AutoSell...)
- Notes: Better client replication than the wrapper above, but tied to SignalBank/Plot and the game template. Verdict: Use if client-side live data binding is wanted.

**3. Drill For LuckyBlocks DataManager (ProfileStore + ReplicaServer)** - Drill For LuckyBlocks (`73c34af3bf37f1ced18974770d6dc907ae868bb9938084022f9b26afc5e67a87`) - **entangled**
- Scripts: `/ReplicatedStorage/Modules/Services/DataManager (309 lines)`; `/ReplicatedStorage/Modules/Services/DataManager/ProfileStore (2243)`; `/ServerScriptService/Packeges/ReplicaServer (1021)`
- Needs replicatedStorage: Modules/Storage/ProfileSettings; Configs/PickaxeConfig; Modules/Packages/Observers; Modules/Utils/{Format,Types}
- Needs attributes: DataLoaded, Power, EquippedPickaxe, Fuel, MaxFuel, multiplier ...
- Needs modules: leaderstats folder, Pickaxes folder
- Needs dataStoreKeys: ProfileStore via ProfileSettings
- Gives: profile load + replica + per-player attributes/leaderstats. Data: ProfileSettings template
- Notes: Game-specific (pickaxes, fuel); ProfileStore itself is reusable. Verdict: Reference.

## 4. UI kits (bright cartoony, money HUD + shop + wave-counter-like)

| # | kit id | look / style | money HUD | shop panel | wave counter candidate |
|---|---|---|---|---|---|
| 1 | `plants-vs-brainrots-005e26` (Plants vs Brainrots) | studded-modern; glossy image-skinned: dark strokes, rounded, muted green/teal, gradients, image-skinned, Comic Neue | `/StarterGui/Main/Bottom` (Plants vs Brainr 321e74b79cd7; looks only; 5 objs)<br>`/StarterGui/Main/CashPerSecond` (Plants vs Brainr 321e74b79cd7; looks only; 3 objs) | `/StarterGui/Main/Seeds` (Plants vs Brainr 321e74b79cd7; looks only; 23 objs)<br>`/StarterGui/Main/Shop` (Plants vs Brainr 321e74b79cd7; yes; 413 objs) | `/StarterGui/Main/Right/ImminentAttackTimer` (Plants vs Brainr 321e74b79cd7; yes; 24 objs)<br>`/StarterGui/Main/Boss` (Plants vs Brainr 321e74b79cd7; looks only; 8 objs)<br>`/StarterGui/Main/DefeatCounter` (Plants vs Brainr 321e74b79cd7; yes; 2 objs) |
| 2 | `escape-tsunami-for-brainrots-2341b1` (Escape Tsunami for brainrots) | studded-modern; glossy image-skinned: thick dark strokes, slightly rounded, saturated orange/purple, gradients, image-skinned, Gotham | `/StarterGui/ScreenGui/Cash` (ETFB UNCOPYLOCKE ecd35e58f32e; yes; 7 objs) | `/StarterGui/Tabs/Shop` (ETFB UNCOPYLOCKE ecd35e58f32e; yes; 131 objs)<br>`/StarterGui/GearShop` (ETFB UNCOPYLOCKE ecd35e58f32e; looks only; 226 objs) | `/StarterGui/BottomRight` (ETFB UNCOPYLOCKE ecd35e58f32e; yes; 2 objs) |
| 3 | `lift-an-egg-115de2` (Lift An Egg) | studded-classic; glossy image-skinned: thick dark strokes, square corners, saturated yellow/red, gradients, image-skinned, Montserrat | `/StarterGui/MainGui3` (Lift An Egg d89bd8af8f4f; yes; 36 objs)<br>`/StarterGui/MainGui3/CashChange` (Lift An Egg d89bd8af8f4f; yes; 3 objs) | `/StarterGui/MainGui/ShopFrame` (Lift An Egg d89bd8af8f4f; yes; 13 objs)<br>`/StarterGui/MainGui/SlotsFrame` (Lift An Egg d89bd8af8f4f; yes; 27 objs) | `/ReplicatedStorage/Assets/Guis/CountdownGui` (Lift An Egg d89bd8af8f4f; looks only; 6 objs) |
| 4 | `grow-a-garden-c920ba` (Grow a Garden) | studded-modern; image-skinned: dark strokes, square corners, muted green/pink, image-skinned, Comic Neue | `/StarterGui/Sheckles_UI` (Grow a Garden 21394d8b357d; looks only; 2 objs) | `/StarterGui/Seed_Shop` (Grow a Garden 21394d8b357d; looks only; 30 objs)<br>`/StarterGui/Gear_Shop` (Grow a Garden 21394d8b357d; looks only; 31 objs)<br>`/StarterGui/Shop_UI` (Grow a Garden 21394d8b357d; looks only; 69 objs) | `/StarterGui/Bottom_UI` (Grow a Garden 21394d8b357d; yes; 21 objs)<br>`/StarterGui/DailyQuests_UI` (Grow a Garden 21394d8b357d; looks only; 21 objs) |
| 5 | `eat-food-simulator-f39276` (Eat food simulator) | flat; glossy image-skinned: thick dark strokes, pill-shaped, saturated yellow, image-skinned, Fredoka One | `/StarterGui/HUD/Right/Coins` (Eat food simulat 22ab351e9e15; yes; 4 objs)<br>`/StarterGui/HUD/Tophud` (Eat food simulat 22ab351e9e15; yes; 15 objs) | `/StarterGui/HUD/Right/List` (Eat food simulat 22ab351e9e15; yes; 35 objs)<br>`/StarterGui/FreePack` (Eat food simulat 22ab351e9e15; yes; 102 objs) | `/StarterGui/HUD/Bottom` (Eat food simulat 22ab351e9e15; yes; 20 objs)<br>`/StarterGui/HUD/Boosts` (Eat food simulat 22ab351e9e15; yes; 17 objs) |

- **plants-vs-brainrots-005e26**: Garden/defense kit: HUD money + cash/s, seed shop with restock timer, attack-countdown "Battle!" timer, boss HP bar, defeat counter. Bright cartoon (glossy image-skinned, Comic Neue, black 2px strokes, rarity gradients). Also has Index, Rebirth, Settings, Stats, Backpack, NPC dialogue. Caveats: All demo texts are baked in ($299,999, Herbert, 12:25:00): rewrite every TextLabel; Main is driven by StarterPlayerScripts/Buttons: panels it lists must exist; Shop (Robux) panels carry original creator product ids; Looks-only for most panels in the dump (scripts live in Client/Modules); ImminentAttackTimer is the only wave-ish element and belongs to the dead Brainrot_Invasion feature.
- **escape-tsunami-for-brainrots-2341b1**: Saturated orange/purple/blue studded-modern kit, 233 screens. BottomRight reads "spawning in 1:23 / RAINBOW TSUNAMI": a ready-made "next wave in mm:ss" counter. Cash panel shows money and speed; Tabs/Shop and GearShop are full shop panels; Tabs also has Sell, Rebirth, Index, Spin, Gifts. Caveats: Gotham/Comic Neue mix; Shop cards carry brainrot names and R$ prices; Tabs is one 501-object hub: extract sub-panels by path.
- **lift-an-egg-115de2**: Very bright yellow/red studded-classic kit with thick strokes: MainGui3 is a compact money HUD (+$ popups, x1 multiplier, Shop/Index/Rebirth buttons), ShopFrame + SlotsFrame, Index, Rebirth. CountdownGui is a surface countdown ("Legendary Block in 0:00") reusable as a wave timer. Caveats: ShopFrame is small (13 objects): expect to build item cards; Wave candidate is a SurfaceGui, re-host in a ScreenGui.
- **grow-a-garden-c920ba**: Garden-themed Comic Neue kit with brown-outline panels: Sheckles money HUD, Seed_Shop and Gear_Shop with restock timers ("New seeds in 2:12"), Bottom_UI banner (WEATHER EVENT / THUNDERSTORM with timer) usable as wave banner, DailyQuests, PlaytimeRewards, teleport bar, confirm popups. Caveats: Muted green/pink palette (less saturated than ranks 1-3); Money label is tiny (2 objects): restyle; Stroke colour dark brown differs from PvB kit (do not mix).
- **eat-food-simulator-f39276**: Glossy yellow pill-shaped cartoon kit, every listed screen marked works=yes and clean. HUD/Right/Coins + Tophud = money; HUD/Right/List = Shop/Rebirth/Pets/Weapon menu; HUD/Bottom (RUSHTIME + LEVEL bar) and HUD/Boosts (countdown chips 01:19:02) can be retexted as wave number + wave timer. Caveats: Shop is a menu list plus pack popups, not a seed-style catalog; Text is placeholder "HC★" currency glyph.

## 5. Blockers and risks

- **[high] Skinned Bone rigs dominate creature rigs**: Among non-humanoid creature rigs, 1830 of 2575 records (71%) and 6122 of 7471 instances (82%) are Bone rigs, concentrated in 20 games (brainrot/animal games). 472 have Bones inside a MeshPart and ~all have 1..N MeshParts attached to a Root part. Fruit meshes cannot be re-skinned onto them: either keep their original mesh or attach fruit as rigid children. Motor6D bodies exist (617 non-humanoid records in 33 games, 1835 Humanoid R6/R15 records in 193 games) and are the route for "rig + fruit meshes". This is a constraint, not a blocker.
- **[high] Creature animations are creator-owned**: 1186 of 1207 distinct creature Animation ids are >= 1e10 rbxassetid uploads; none belong to the Roblox default pack. Plan on 100% procedural Motor6D/Bone animation (confirmed design).
- **[medium] Most Motor6D creature joint names are generic**: 422 of 617 non-humanoid Motor6D creatures use Part###/MeshPart### names (Blender/Studio import); only 104 use stock R6/R15 names and 91 semantic names. Procedural animation must derive limbs from hierarchy/position, or start from the stock R6/R15/semantic bodies recommended.
- **[medium] Mesh/texture ids are external**: Fruit and creature meshes are rbxassetid references (no bytes in the library for these). Several best clean fruit/veg sources (grow_a_garden Fruit_Spawn) are built from primitive Parts/Unions with NO MeshId, which is self-contained but not "real mesh". Loadability of referenced mesh ids is unverified.
- **[medium] No system has a real wave counter**: Enemy spawners are continuous (PvB) or legacy globals (Guest Defense); we must write WaveService (index, composition tables, leak/lose rule, counter UI). UI kits supply only countdown-shaped elements.
- **[low] Whole-map entanglement**: PvB core needs Plots 1..6 tree + 186 remotes + ~10 hard-required sibling modules; grow_a_garden needs Workspace.Farm + ServerStorage.PlayerData; only Easy Plot System and the Persistence wrapper are truly standalone. The modded PvB variant is the best semi-standalone donor (needs Map/Plots/PlotTemplate).

## 6. Importing an item

```sh
# every item has game (64 hex) + path; the source file is sources/<game>.rbxl|.rbxlx|.rbxm
lune run packages/owner-corpus/library_extract.luau extract "$HOME/Library/Application Support/Apple/owner-library/sources/<game>.rbxl" "<path>" self out.rbxm
```
Paths use the library convention (`#n` suffix for repeated sibling names, `%2F` for a slash in a name).
