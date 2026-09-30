# Whole-library pieces index (self-contained flag)

Generated offline with lune by `packages/owner-corpus/library_pieces.luau` (one source at a time, paths use the library_extract convention). Data: `pieces.json` (array, one object per piece).

Selection rule: assets.json entries with k in (model, tool), 1 <= parts <= 400, scripts == 0; plus k == ui ScreenGuis and panel Frames (all script counts recorded). `selfContained` = no non-empty content id other than `rbxasset://` (MeshId/MeshContent, TextureID, SpecialMesh MeshId/TextureId, Decal/Texture, SurfaceAppearance maps, Image of ImageLabel/Button, particle/beam/trail textures, Sky faces, any other Content/ContentId property except sounds, animations, fonts, Tool.TextureId icon, and UnionOperation data). The parts count of every piece matched the assets.json value exactly (26998/26998 resolved).

## Totals

- Sources processed: 565 of 566 files in sources/ (565 have an entries/*.assets.json; the 1 source without one, 5eb6468b...rbxm, was skipped; 0 parse failures); sources with at least one model/tool piece: 454
- Model/tool pieces: **26998** (models 26604, tools 394)
- selfContained: **13771** (51.0%), in 413 games
- selfContained AND no MeshPart/SpecialMesh-with-file (plain Part/Wedge/Union only): **13679** (92 self-contained pieces still hold a MeshPart or FileMesh SpecialMesh with an empty id, which render nothing; candidate lists below exclude them)
- selfContained with parts 3..80: 10091; with Motor6D>=1: 238
- Pieces with meshParts>0: 5712; with surfaceAppearances>0: 1355; unions>0: 6268

### Part-count buckets (all / selfContained)

| parts | all | selfContained |
|---|---|---|
| 1-2 | 6000 | 2503 |
| 3-10 | 9529 | 4992 |
| 11-40 | 7122 | 3925 |
| 41-80 | 2018 | 1174 |
| 81-200 | 1692 | 886 |
| 201-400 | 637 | 291 |

## Best self-contained candidates by category (parts 3..80, meshParts=0, no file SpecialMesh; max 2 per game; names unique)

Columns: name, class, parts, dominant material, top colours, game(first 8 of hash) + path. Import with the full game hash from pieces.json.

### Trees (267 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Pine | Model | 33 | Plastic | #f2f3f3,#7c5c46 | e9945a3b `/Workspace/Pines/Pine` |
| Tree | Model | 21 | Plastic | #287f47,#d7c59a,#694028 | 13d8b194 `/Workspace/Trees/Tree` |
| Tree | Model | 12 | Grass | #27462d,#694028 | 13f343b4 `/Workspace/Tree` |
| Tree | Model | 13 | Grass | #27462d,#694028 | 13f343b4 `/Workspace/Tree#2` |
| Tree | Model | 31 | Slate | #789082,#957977 | 1eaa4bb4 `/GameModules/Workspace/Tree` |
| Tree | Model | 28 | Slate | #789082,#957977 | 1eaa4bb4 `/GameModules/Workspace/Tree#2` |
| Tree | Model | 40 | Plastic | #287f47,#aa5500 | 403d69c7 `/GameModules/Workspace/Tree#11` |
| Tree | Model | 6 | Grass | #2c651d,#564236 | 4376aceb `/Workspace/Tree` |
| Tree | Model | 30 | Slate | #789082,#957977 | 5b501392 `/GameModules/Workspace/Tree#3` |
| Tree | Model | 23 | Slate | #287f47,#957977 | 5b501392 `/GameModules/Workspace/Tree#4` |
| tree | Model | 17 | Concrete | #e29b40,#a1c48c,#d5733d | 5f9e13dc `/Workspace/tree` |
| Tree | Model | 19 | Slate | #a1c48c,#957977 | 78c71a62 `/GameModular/Workspace/Tree#6` |
| Tree | Model | 24 | Slate | #287f47,#957977 | 78c71a62 `/GameModular/Workspace/Tree#7` |
| Tree | Model | 7 | Grass | #be6862,#7c5c46 | 7e2b83de `/SavedGameModules/Workspace/Tree` |
| Tree | Model | 38 | Slate | #287f47,#4b974b,#7c5c46 | 89edbe41 `/GameModules/Workspace/Trees/Tree#37` |

### Fruit trees (39 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Apple Tree | Model | 8 | Plastic | #c4281c,#4b974b,#694028 | 96d2df64 `/SavedGameModules/Lighting/Plants/Apple Tree` |
| Apple Tree | Model | 12 | Grass | #287f47,#5a4c42 | b9ad059e `/SavedGameModules/Workspace/Trees/Apple Tree#3` |
| BananaTree | Model | 15 | Grass | #4b974b,#f5cd30,#694028 | 85364cd3 `/SavedGameModules/Lighting/Resources/BananaTree` |
| BananaTree2 | Model | 25 | Plastic | #475415,#583d2c,#614430 | 4ba7759f `/Workspace/__OBJECTS/Build/Props/Zone11Props/BananaTrees/BananaTree2` |
| BananaTree2 | Model | 33 | Plastic | #475415,#583d2c,#614430 | 4ba7759f `/Workspace/__OBJECTS/Build/Props/Zone11Props/BananaTrees/BananaTree2#2` |
| Coconut Tree | Model | 10 | Grass | #c1be42,#7c5c46 | b9ad059e `/SavedGameModules/Workspace/Trees/Coconut Tree` |
| CoconutTree | Model | 14 | Grass | #4b974b,#694028 | 85364cd3 `/SavedGameModules/Lighting/Resources/CoconutTree` |
| Apple Tree | Model | 3 | Plastic | #4b974b,#c4281c | a75e00ce `/SavedGameModules/Workspace/Apple Tree#2` |
| Orange Tree | Model | 3 | Plastic | #a05f35,#da8541 | 49ae7a61 `/CreatorId=715577 ___ PlaceId=3138584/Lighting/Game Blocks/Halloween/Orange Tree` |
| sapling_coconuttree | Model | 11 | Sand | #a05f35,#27462d,#7c5c46 | 11fc7f4c `/ReplicatedStorage/Plants/sapling_coconuttree` |
| sapling_orangetree | Model | 23 | Concrete | #694028,#3a7d15,#ffaf00 | 11fc7f4c `/Workspace/sapling_orangetree` |

### Bushes / flowers (123 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
|  Flower | Model | 6 | Plastic | #ff0000,#62a545,#dada2f | c4307f31 `/Workspace/ Flower` |
| Bush | Model | 9 | Slate | #7f8e64 | 10abe6a3 `/Workspace/Bush` |
| Bush | Model | 8 | Plastic | #287f47 | 6e5d1a52 `/Folder/Lighting/_Morphs/Bush` M6D=7 |
| Flower | Model | 8 | Grass | #c4281c,#4b974b,#f5cd30 | 18712521 `/Workspace/Flower` |
| Flower | Model | 10 | Slate | #8c5b9f,#789082,#7f8e64 | 6f4b7e33 `/Workspace/Flower` |
| Flower | Model | 19 | Plastic | #9ff3e9,#3a7d15,#da8541 | b4208b3e `/Workspace/Flower` |
| Flower 1 | Model | 13 | Plastic | #55aa00,#cacaca,#ffffff | b4208b3e `/Workspace/Flower 1` |
| Grass | Model | 8 | Sand | #f8f8f8,#a3a2a5 | 4a05c557 `/Workspace/ScriptedBuildings/SWATHQ/Grass` |
| Grass | Model | 12 | Grass | #789082,#a1c48c | a16a5b16 `/Workspace/HospitalModels/Grass` |
| Grass | Model | 16 | Plastic | #4b974b | c4307f31 `/Workspace/Grass` |
| Grass | Model | 6 | Plastic | #597a00 | f4edab0c `/Workspace/Map/Misc/Grass` |
| Plant | Model | 21 | Plastic | #27462d | a65ff6dc `/Workspace/Trees/Plant` |
| Plant | Model | 36 | Plastic | #2c651d,#a3a2a5,#503b2d | ab4e34ed `/Workspace/Stud Asset pack/Plants/Plant` |
| Sunflower | Model | 18 | Plastic | #ff9501,#1b6417,#298820 | 75a308cb `/ReplicatedStorage/Assets/Plants/Sunflower` M6D=7 |
| Bush | Model | 5 | Plastic | #f8f8f8,#4b974b,#694028 | 96d2df64 `/SavedGameModules/Workspace/Regen/CornIslandResources/Bush#19` |

### Fences (60 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Fence | Model | 7 | Wood | #7c5c46,#694028 | 03f10a9d `/Workspace/Fence` |
| Fence | Model | 9 | Wood | #7c5c46 | 2722995d `/SavedGameModules/ReplicatedStorage/Constructs/Fence` |
| Fence | Model | 11 | Neon | #00ffff,#111111,#a3a2a5 | 60ae3b4a `/Workspace/Fence` |
| Fence | Model | 10 | Wood | #f8f8f8 | d8958b67 `/SavedGameModules/Workspace/Fence` |
| Fence | Model | 6 | Wood | #694028 | f5ce8893 `/Workspace/Fence` |
| Gate | Model | 7 | WoodPlanks | #957977,#7c5c46,#c7ac78 | 9111357d `/ReplicatedStorage/Buildings/Gate` |
| Gate | Model | 12 | Metal | #69665c,#5b5d69 | ae41a4b4 `/SavedGameModules/Workspace/Mineshaft/Base/Gate` |
| Gate1 | Model | 31 | Concrete | #002060 | fe48292d `/SavedGameModules/Workspace/Gate1` |
| Gate2 | Model | 31 | Concrete | #002060 | fe48292d `/SavedGameModules/Workspace/Gate2` |
| Railing | Model | 29 | Metal | #7d7d7d,#635f62 | 47bc5bcb `/Workspace/Railing` |
| Railing | Model | 6 | Plastic | #1b2a35 | aa62032f `/Workspace/RegenFurniture/Railing` |
| Railing | Model | 34 | Plastic | #c4281c,#f5cd30 | aa62032f `/Workspace/RegenFurniture/Railing#2` |
| Fence | Model | 4 | Wood | #7c5c46 | 4376aceb `/Lighting/Engineers/Structs/Fence` |
| Fence | Model | 5 | Wood | #694028 | a050d9f5 `/GameModular/Workspace/Fence#2` |
| Fence | Model | 80 | Wood | #da8541 | e297ebfe `/GameModules/Workspace/Decor/Fence` |

### Rocks (169 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Cliff | Model | 39 | Plastic | #694028,#624732 | 44cdda80 `/Workspace/Cliff` |
| Cliff | Model | 30 | Slate | #cc8e69 | b3cc1700 `/GameModules/Workspace/Cliff` |
| Cliff | Model | 8 | Slate | #7c5c46 | b3cc1700 `/GameModules/Workspace/Cliff#3` |
| Rock | Model | 8 | Concrete | #635f62,#6c584b | 11fc7f4c `/Workspace/Ruin Stone Island/The Island - Made By PaulWolfe/Rock#2` |
| rock | Model | 25 | Plastic | #348e40,#0878b4,#297133 | 75a308cb `/Workspace/Map/Deco/Rocks/rock` |
| Rocks | Model | 6 | Ice | #80bbdb | 7178b3d3 `/Workspace/Rocks` |
| Stone | Model | 9 | Slate | #564236,#6c584b | 9111357d `/Workspace/Rocks/Stone` |
| Boulder | Model | 4 | Slate | #635f62 | 96d2df64 `/SavedGameModules/Workspace/Regen/Regen/Boulder` |
| Rock | Model | 4 | Plastic | #5b5d69,#635f62,#f5cd30 | 1eaa4bb4 `/GameModules/ReplicatedStorage/AptStats/Items/Rock` |
| Rock | Model | 49 | Plastic | #0f611b,#266b99,#2e7bb6 | 321e74b7 `/Workspace/Map/Rocks/Rock` |
| Rock | Model | 3 | Plastic | #7c7c7c,#9a9a9a,#a1a1a1 | da7342d0 `/Workspace/Map/Rock` |
| Rock1 | Model | 49 | Plastic | #0f611b,#266b99,#2e7bb6 | 321e74b7 `/Workspace/Map/Rocks/Rock1` |
| Rock1 | Model | 4 | Plastic | #635f62 | cf86935d `/Workspace/Map_Objects/Rock1` |
| Rocks | Model | 4 | Slate | #a3a2a5 | 723a46ee `/SavedGameModules/Workspace/Rocks` |
| Rocks | Model | 44 | Slate | #635f62,#a3a2a5 | e297ebfe `/GameModules/Workspace/Decor/Rocks` |

### Buildings / houses / barns / huts (332 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Building | Model | 16 | Plastic | #635f62,#a3a2a5 | 458b5e7e `/Workspace/Non Regen/Layer 6/Building` |
| Building | Model | 12 | Brick | #966766,#aba89e | 62b08e72 `/SavedGameModules/Workspace/Buildings/Building` |
| Building | Model | 7 | Brick | #966766,#aba89e | 62b08e72 `/SavedGameModules/Workspace/Buildings/Building#2` |
| House | Model | 32 | SmoothPlastic | #d3be96,#7c5c46,#957977 | 5da7109c `/GameModules/Workspace/House#3` |
| House | Model | 31 | Plastic | #694028,#6e99ca,#f8f8f8 | 730eb288 `/Workspace/House` |
| House | Model | 15 | Wood | #7c5c46 | a1783e65 `/Workspace/House` |
| House | Model | 13 | Plastic | #694028,#957977,#f8f8f8 | e7a636d4 `/Workspace/House` |
| House2 | Model | 32 | SmoothPlastic | #d7c59a,#7c5c46 | 5da7109c `/GameModules/Workspace/House2` |
| Hut | Model | 20 | WoodPlanks | #7c5c46,#bc9b5d,#afddff | 9111357d `/ReplicatedStorage/Buildings/Hut` |
| Hut | Model | 6 | Plastic | #0d69ac,#694028 | 9ca1a1b8 `/Workspace/Hut` |
| Hut | Model | 23 | Plastic | #cc8e69,#957977 | a65ff6dc `/Workspace/Hut` |
| Hut | Model | 27 | WoodPlanks | #7c5c46,#bc9b5d,#c7ac78 | b9ad059e `/SavedGameModules/Workspace/Hut` |
| Shop | Model | 10 | Plastic | #04afec,#a6a6a6,#f86366 | 7979acb8 `/ReplicatedStorage/Buildings/Normal/Shop` |
| Shop | Model | 25 | Plastic | #70533f,#7c5c46,#c4281c | ab4e34ed `/Workspace/Stud Asset pack/Other/Shop` |
| Shop | Model | 35 | Plastic | #2f4671,#999999,#8a6346 | da7342d0 `/Workspace/Map/Shop` |

### Boats / rafts / ships (36 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Boat | Model | 33 | Wood | #694028 | 4427c72d `/Workspace/Boat` |
| Raft | Model | 17 | WoodPlanks | #6c584b,#5b5d69,#f1e7c7 | bd58a93f `/Workspace/Raft` |
| Raft | Model | 4 | Wood | #7c5c46 | 641062c5 `/SavedGameModules/Workspace/Raft` |
| Sailboat | Model | 77 | Wood | #7c5c46 | efa61f2c `/SavedGameModules/Workspace/Sailboat` |
| Boat_{15369FA6-6600-449C-AB5A- | Model | 9 | CorrodedMetal | #635f62 | 66d2a577 `/SavedGameModules/Workspace/BoatContainer/Boat_{15369FA6-6600-449C-AB5A-A5DEB7901862}` |
| Boat_{53097A9B-A4F0-4862-BD92- | Model | 37 | Wood | #7c5c46 | 66d2a577 `/SavedGameModules/Workspace/BoatContainer/Boat_{53097A9B-A4F0-4862-BD92-5C07EB79BABB}` |
| CarDealershipDesk | Model | 9 | SmoothPlastic | #635f62,#a3a2a5,#cacbd1 | 42714e31 `/ReplicatedStorage/Objects/Visual/CarDealershipDesk` |
| Crafted Desk | Model | 23 | Fabric | #ffcc99,#7c5c46 | d49638b7 `/Workspace/Model#66/Crafted Desk` |
| Crafting Table | Model | 20 | WoodPlanks | #c7ac78,#6c584b,#564236 | 9111357d `/Workspace/Buildings/Crafting Table` |
| DealershipPillars | Model | 6 | SmoothPlastic | #a3a2a5,#cacbd1 | 42714e31 `/ReplicatedStorage/Objects/Visual/DealershipPillars` |
| old crafting table | Model | 28 | Wood | #a34b4b,#6c584b,#c7ac78 | b9ad059e `/SavedGameModules/Workspace/old crafting table` |
| Rafter | Model | 10 | Wood | #69665c | bd58a93f `/Workspace/Model#356/Rafter` |
| ShippingContainer | Model | 15 | Plastic | #635f62,#348e40 | 3a06b8a8 `/SavedGameModules/Workspace/ShippingContainer` |
| AircraftCarrier | Model | 66 | Plastic | #a3a2a5,#f8f8f8,#1b2a35 | 1d0b8da5 `/Lighting/AircraftCarrier` |
| DeployableItem_CraftingTable | Model | 3 | Wood | #635f62,#7c5c46,#ffcc99 | 57d720fd `/Workspace/DeployableInstances/DeployableItem_CraftingTable` |

### Planks / wood / crates / barrels (217 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Barrel | Model | 36 | Wood | #694028,#635f62 | 3a06b8a8 `/SavedGameModules/ReplicatedStorage/Furniture/Barrel` |
| Barrel | Model | 20 | Plastic | #74869d | b28b1adc `/Workspace/Barrel` |
| Board | Model | 25 | Plastic | #635f62,#f8f8f8,#0d69ac | 1fae1780 `/GameModules/Workspace/Board` |
| Board | Model | 13 | Metal | #5b5d69,#aba89e | bd58a93f `/Workspace/Board` |
| Box | Model | 19 | Plastic | #7c5c46,#956e54 | ab4e34ed `/Workspace/Stud Asset pack/Other/Box` |
| Chest | Model | 10 | CorrodedMetal | #635f62,#7c5c46 | 6f4b7e33 `/Workspace/Chest` |
| Chest | Model | 26 | Metal | #a3a2a5,#5a4c42,#111111 | 9e333fed `/SavedGameModules/Lighting/Database/Models/ChestMap/Chest` |
| Chest | Model | 27 | Metal | #a3a2a5,#5a4c42,#111111 | 9e333fed `/SavedGameModules/Lighting/Database/Models/Chest` |
| crate | Model | 13 | Wood | #694028 | 20a3bc24 `/GameModules/Lighting/assets/crate` |
| Crate | Model | 6 | Wood | #694028,#7c5c46 | 2722995d `/SavedGameModules/ReplicatedStorage/Constructs/Crate` |
| Crate | Model | 25 | Metal | #838383,#ac998a | ad8a2797 `/Workspace/Abandoned Hallways Horror Map/Crates/Crate#2` |
| Crate | Model | 24 | Plastic | #635f62,#957977 | b28b1adc `/Workspace/Crate` |
| Crate | Model | 37 | Wood | #7c5c46,#a3a2a5 | e9470284 `/GameModules/Workspace/Crate` |
| Log | Model | 9 | Plastic | #7c5c46 | 1fae1780 `/GameModules/Workspace/Log` |
| Log | Model | 16 | Plastic | #bfa274,#7c5c46,#e5c690 | f4edab0c `/Workspace/Map/Misc/Log` |

### Water / beach / palm (163 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Dock | Model | 39 | WoodPlanks | #7c5c46 | 25373818 `/SavedGameModules/Workspace/Inyola Fort/Dock` |
| Dock | Model | 38 | WoodPlanks | #7c5c46 | 25373818 `/SavedGameModules/Workspace/Inyola Fort/Dock#3` |
| Dock | Model | 21 | Plastic | #694028 | a75e00ce `/SavedGameModules/ReplicatedStorage/Structures/Dock` |
| Dock | Model | 19 | Wood | #6c584b,#564236 | efa61f2c `/SavedGameModules/ReplicatedStorage/Deployables/Dock` |
| Fountain | Model | 12 | Plastic | #fdea8d,#635f62,#80bbdb | 1540eb1e `/SavedGameModules/Workspace/Fountain` |
| Island1 | Model | 33 | Grass | #287f47,#eab892 | 7280aee8 `/SavedGameModules/Workspace/World/Island1` |
| Pond | Model | 21 | Plastic | #4b974b,#0d69ac,#a3a2a5 | 8c33f738 `/Workspace/Pond` |
| Sand | Model | 30 | Asphalt | #111111 | b70106eb `/Workspace/Sand` |
| Sand1 | Model | 26 | Pebble | #c7ac78,#d7c59a | 9111357d `/Workspace/Sand1` |
| shell | Model | 7 | SmoothPlastic | #111111,#c4281c | 1525be37 `/Workspace/Old EC Weapons/Salvo/shell` |
| Water | Model | 32 | Sand | #d7c59a,#008f9c | 3f8ba737 `/Workspace/Water` |
| Water | Model | 22 | Sand | #008f9c,#d7c59a | 6c0b4abb `/Workspace/Water` |
| Water | Model | 31 | Plastic | #0d69ac,#7c5c46 | a75e00ce `/SavedGameModules/Workspace/Water` |
| Water | Model | 16 | Pebble | #74869d,#cabfa3,#002060 | bd58a93f `/Workspace/Water` |
| Dock 2 | Model | 76 | DiamondPlate | #a3a2a5,#694028 | f5ce8893 `/Workspace/Dock 2` |

### Towers / turrets / cannons (37 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| bunker | Model | 23 | Slate | #d7c59a | 1a7a6c41 `/Workspace/bunker` |
| Tower | Model | 11 | Plastic | #694028,#4b974b | a75e00ce `/SavedGameModules/ReplicatedStorage/Structures/Tower` |
| Ballista | Model | 5 | SmoothPlastic | #111111,#0989cf | 1525be37 `/Workspace/Old EC Weapons/Ballista` |
| Bunker | Model | 73 | SmoothPlastic | #7f8e64,#a3a2a5,#d7c59a | 733cee03 `/Workspace/Anchored Objects/Towns%2FCities/Bunker` |
| Cannon | Model | 4 | SmoothPlastic | #f8f8f8,#00ffff | 31f681af `/Workspace/Cannon` |
| Mortar | Model | 3 | SmoothPlastic | #00ff00,#ffff00 | 25373818 `/SavedGameModules/ReplicatedStorage/CraftingProps/Mortar` |
| Tower | Model | 57 | Wood | #7c5c46,#a3a2a5 | 5da7109c `/GameModules/Workspace/Tower` |
| Tower | Model | 55 | Wood | #f8f8f8 | 723a46ee `/SavedGameModules/ReplicatedStorage/Structures/Tower` |
| Turret | Model | 5 | Plastic | #c4281c,#694028 | 7d66a903 `/GameModules/Workspace/Turret` |
| AtlasCannon | Model | 6 | SmoothPlastic | #f8f8f8,#00ffff | 31f681af `/ReplicatedStorage/AtlasCannon` |
| BunkerFrame | Model | 32 | Brick | #635f62,#1b2a35,#a3a2a5 | 4a05c557 `/Workspace/ScriptedBuildings/SWATHQ/BunkerFrame` |
| ControlTower | Model | 30 | SmoothPlastic | #1b2a35,#635f62,#74869d | 3a06b8a8 `/SavedGameModules/Workspace/ControlTower` |
| DiamondTechTower | Model | 18 | Plastic | #00a0b8,#006777 | 7979acb8 `/ReplicatedStorage/Buildings/Diamond/DiamondTechTower` |
| Fire Mortars | Model | 36 | CorrodedMetal | #635f62,#111111 | 4f8f0381 `/Workspace/Fire Mortars` |
| GoldenTechTower | Model | 18 | Plastic | #ffb000,#be8200 | 7979acb8 `/ReplicatedStorage/Buildings/Golden/GoldenTechTower` |

### Vegetables (94 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Corn | Model | 6 | Grass | #27462d,#ffff00 | 85364cd3 `/SavedGameModules/Lighting/Agriculture/Corn` |
| Corn | Model | 8 | Plastic | #4b974b,#ffff00 | a75e00ce `/SavedGameModules/ReplicatedStorage/Farming/Large Compost/Corn` |
| Corn | Model | 22 | Plastic | #287f47,#7c5c46 | e297ebfe `/GameModules/Workspace/CropStorage/Corn` |
| Lettuce | Model | 6 | Plastic | #27462d,#7c5c46 | e297ebfe `/GameModules/Workspace/CropStorage/Lettuce` |
| Onion | Model | 6 | Plastic | #4b974b,#d7c59a | a75e00ce `/SavedGameModules/ReplicatedStorage/Farming/Small Compost/Onion` |
| Onion | Model | 15 | Grass | #b1e5a6,#94be81 | b9ad059e `/SavedGameModules/Workspace/Plants/Onion` |
| Onion | Model | 30 | Grass | #b1e5a6,#94be81 | b9ad059e `/SavedGameModules/Workspace/Plants/Onion#4` |
| Pumpkin | Model | 6 | Plastic | #d5733d,#7c5c46 | 1fae1780 `/GameModules/ReplicatedStorage/Models/Pumpkin` |
| Tomato | Model | 11 | Plastic | #ff0000,#4b974b | 85364cd3 `/SavedGameModules/Lighting/Agriculture/Tomato` |
| Eggplant | Model | 5 | Plastic | #f8f8f8,#1b6417,#9b2eb6 | 75a308cb `/ReplicatedStorage/Assets/Plants/Eggplant` M6D=2 |
| Pumpkin | Model | 5 | Plastic | #d5733d,#7c5c46 | 1fae1780 `/GameModules/Workspace/Ingredients/Pumpkin` |
| BakedPotatoesServingDish | Model | 32 | Plastic | #ffffcc,#694028,#6e99ca | aa9aefb5 `/SavedGameModules/Workspace/BakedPotatoesServingDish` |
| Chopped Potato | Model | 14 | SmoothPlastic | #fdea8d | 5df8a036 `/GameModules/ReplicatedStorage/FoodItems/Chopped Potato` |
| Corndogg | Model | 6 | Slate | #a3a2a5 | 489f3e7d `/Workspace/Corndogg` |
| Corner | Model | 7 | Plastic | #a3a2a5 | 7280aee8 `/SavedGameModules/ReplicatedStorage/Structures/Corner` |

### Fruits (118 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Apple | Model | 10 | Plastic | #c4281c,#4b974b,#694028 | 85364cd3 `/SavedGameModules/Lighting/Agriculture/Apple` |
| Apple | Model | 8 | Plastic | #c4281c,#4b974b,#694028 | a75e00ce `/SavedGameModules/ReplicatedStorage/Farming/Large Compost/Apple` |
| Banana | Model | 6 | SmoothPlastic | #7c5c46,#f5cd30 | 1540eb1e `/SavedGameModules/Workspace/Banana` |
| Berry | Model | 7 | Plastic | #6b327c,#4b974b,#694028 | 85364cd3 `/SavedGameModules/Lighting/Agriculture/Berry` |
| Berry | Model | 11 | Plastic | #6b327c,#4b974b,#694028 | a75e00ce `/SavedGameModules/ReplicatedStorage/Farming/Small Compost/Berry` |
| Pineapple | Model | 10 | SmoothPlastic | #27462d,#a05f35 | 1fae1780 `/GameModules/Workspace/Ingredients/Pineapple` |
| Pineapple | Model | 11 | SmoothPlastic | #27462d,#a05f35 | 1fae1780 `/GameModules/ReplicatedStorage/Models/Pineapple` |
| Raspberry | Model | 11 | Plastic | #c62b50,#59443c | 21394d8b `/ReplicatedStorage/Fruit_Spawn/Raspberry` |
| Watermelon | Model | 11 | Plastic | #185f16,#f8f8f8,#335914 | 75a308cb `/ReplicatedStorage/Assets/Plants/Watermelon` M6D=4 |
| Watermelon | Model | 14 | Ice | #111111,#348e40,#c4281c | e3dd3175 `/SavedGameModules/Workspace/globalcontainer/figurines/Tot3m/Watermelon` |
| Apple | Model | 4 | Plastic | #287f47,#754d2b,#7c5c46 | 21394d8b `/ReplicatedStorage/Fruit_Spawn/Apple` |
| Apple Tree | Model | 8 | Plastic | #c4281c,#4b974b,#694028 | 96d2df64 `/SavedGameModules/Lighting/Plants/Apple Tree` |
| Apple Tree | Model | 12 | Grass | #287f47,#5a4c42 | b9ad059e `/SavedGameModules/Workspace/Trees/Apple Tree#3` |
| Apple TV Remote | Model | 6 | SmoothPlastic | #1b2a35,#cdcdcd | 32b32b3a `/Workspace/Apple TV Remote` |
| ApplePiePlate | Model | 15 | SmoothPlastic | #cc8e69,#a34b4b,#6e99ca | aa9aefb5 `/SavedGameModules/ReplicatedStorage/Models/ApplePiePlate` |

### Creatures / characters / NPC (Motor6D) (192 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| R6 | Model | 7 | Plastic | #a3a2a5,#635f62 | 21394d8b `/ServerScriptService/R6` M6D=6 hum |
| A280 | Model | 20 | SmoothPlastic | #111111,#1b2a35,#5b5d69 | 4c2ef2a4 `/GameModules/Lighting/inven/A280` M6D=19 |
| e11 | Model | 20 | SmoothPlastic | #111111,#1b2a35 | 4c2ef2a4 `/GameModules/Lighting/inven/e11` M6D=19 |
| Battledroid | Model | 33 | SmoothPlastic | #635f62,#1b2a35,#a3a2a5 | 4f01045a `/GameModules/Lighting/oldthings/Battledroid` M6D=35 hum |
| Celebration | Model | 28 | Plastic | #a3a2a5 | 81a5f924 `/SavedGameModules/ReplicatedStorage/Celebration` M6D=24 hum |
| Character | Model | 7 | Plastic | #f2f3f3,#111111 | e1748e31 `/SavedGameModules/ReplicatedStorage/Resource/Character` M6D=1 hum |
| custo dummy | Model | 6 | Plastic | #ffcc99,#0d69ac,#cc8e69 | 20a3bc24 `/GameModules/Workspace/custo dummy` M6D=1 hum |
| Dab | Model | 7 | Plastic | #a3a2a5 | 81a5f924 `/SavedGameModules/ReplicatedStorage/Celebration/Dab` M6D=6 hum |
| DarkRagdoll | Model | 12 | SmoothPlastic | #111111 | d5b298bc `/ServerStorage/DarkRagdoll` M6D=1 hum |
| droid | Model | 21 | SmoothPlastic | #f1e7c7,#1b2a35,#a3a2a5 | 4f01045a `/GameModules/Lighting/animator/droid` M6D=20 hum |
| Dummy | Model | 7 | Plastic | #a3a2a5 | 1525be37 `/Workspace/Dummy` M6D=6 hum |
| Dummy2 | Model | 7 | Plastic | #f5cd30,#a4bd47,#0d69ac | 5961f4a1 `/ServerStorage/Dummy2` M6D=1 hum |
| DummyOne | Model | 7 | Plastic | #a3a2a5 | 8df0689a `/ReplicatedStorage/DummyOne` M6D=6 hum |
| DummyTwo | Model | 7 | Plastic | #a3a2a5 | 8df0689a `/ReplicatedStorage/DummyTwo` M6D=6 hum |
| Ghost | Model | 12 | SmoothPlastic | #cacbd1 | d5b298bc `/ServerStorage/Ghost` M6D=1 hum |

### Lamps / torches (133 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Bonfire | Model | 7 | Wood | #694028 | 723a46ee `/SavedGameModules/Workspace/Bonfire` |
| Campfire | Model | 11 | Wood | #a0844f | 25829a2e `/SavedGameModules/Workspace/Campfire` |
| Campfire | Model | 7 | Wood | #7c5c46 | 641062c5 `/SavedGameModules/Workspace/Campfire` |
| Candle | Model | 8 | Neon | #6225d1,#ff66cc | 321e74b7 `/StarterPlayer/StarterPlayerScripts/Client/Modules/EventManager [Client]/Events/HalloweenE` |
| Candle | Model | 12 | Neon | #e29b40,#ff5930,#ff6038 | 321e74b7 `/StarterPlayer/StarterPlayerScripts/Client/Modules/EventManager [Client]/Events/HalloweenE` |
| Fire Pit | Model | 12 | Wood | #564236,#bbb3b2,#5a4c42 | 2137d275 `/CopiedGameOpen/ReplicatedStorage/ItemModels/Decorations/Fire Pit` |
| FirePit | Model | 6 | Grass | #694028,#1b2a35,#ff0000 | a050d9f5 `/GameModular/Workspace/FirePit` |
| FirePit | Model | 8 | Brick | #635f62,#1b2a35,#694028 | e297ebfe `/GameModules/ReplicatedStorage/FirePit` |
| Lamp | Model | 8 | Plastic | #e5e4df,#ffff00 | 49ae7a61 `/CreatorId=715577 ___ PlaceId=3138584/Lighting/Game Blocks/Decorations/Lamp` |
| Lamp | Model | 40 | CorrodedMetal | #635f62,#a3a2a5,#89888b | ad8a2797 `/Workspace/Abandoned Hallways Horror Map/Props/Lamp` |
| Lamp | Model | 14 | Wood | #694028,#f2f3f3,#111111 | d54b0cf3 `/Workspace/Lamp` |
| Lamp | Model | 16 | Plastic | #1b2a35,#cdcdcd | d9a60bca `/Workspace/Lamp` |
| Lamp | Model | 24 | DiamondPlate | #635f62,#7c5c46,#c4281c | ebaa9448 `/SavedGameModules/Workspace/Redcliff_Keep/Redcliff_Keep/Lamp` |
| Lamp | Model | 39 | DiamondPlate | #635f62,#c4281c,#7c5c46 | ebaa9448 `/SavedGameModules/Workspace/Redcliff_Keep/Redcliff_Keep/Lamp#2` |
| Lantern | Model | 9 | Metal | #00ff00,#ffff00,#dfdfde | 25373818 `/SavedGameModules/ReplicatedStorage/CraftingProps/Lantern` |

### Signs (70 self-contained matches)

| name | class | parts | material | colours | game / path |
|---|---|---|---|---|---|
| Banner | Model | 15 | Plastic | #e29b40,#fdea8d,#27462d | 6f4b7e33 `/Workspace/Banner` |
| Sign | Model | 8 | Wood | #957977,#635f62 | 1eaa4bb4 `/GameModules/Workspace/Sign#7` |
| Sign | Model | 7 | Wood | #957977,#635f62 | 1eaa4bb4 `/GameModules/Workspace/Sign#8` |
| Sign | Model | 21 | Plastic | #f8f8f8 | 1fae1780 `/GameModules/Workspace/HospitalSign/Sign` |
| Sign | Model | 12 | Glacier | #192551,#5b9a4c,#1b2a35 | 321e74b7 `/Workspace/ScriptedMap/AdminChest/Sign` |
| Sign | Model | 13 | Plastic | #a3a2a5 | d73348e2 `/Workspace/Sign` |
| Sign | Model | 10 | Plastic | #111111,#a3a2a5 | d73348e2 `/Workspace/Sign#2` |
| SIGNS | Model | 34 | Plastic | #f2f3f3,#287f47,#7f8e64 | 9fcb4623 `/SavedGameModules/Workspace/Unorganized Models/SIGNS` |
| Sign | Model | 3 | Plastic | #a3a2a5 | 0d420805 `/PlotSystem/Ungroup in Workspace/Map/Plots/1/Sign` |
| Sign | Model | 5 | Wood | #957977,#635f62 | 5b501392 `/GameModules/Workspace/Sign#6` |
| Sign | Model | 4 | Wood | #e29b40 | e297ebfe `/GameModules/Workspace/Decor/Sign` |
| AirportSign | Model | 13 | SmoothPlastic | #a3a2a5 | 3a06b8a8 `/SavedGameModules/Workspace/AirportSign` |
| Boho sign | Model | 8 | SmoothPlastic | #69665c,#dfdfde | bd58a93f `/Workspace/Boho sign` |
| BohoSign | Model | 8 | Metal | #8aab85,#965555 | bd58a93f `/Workspace/BohoSign` |
| CommunitySign | Model | 10 | Marble | #f2f3f3,#d7c59a,#7c5c46 | 3a06b8a8 `/SavedGameModules/Workspace/CommunitySign` |

## UI (k == ui)

- ScreenGui / top-level Frame entries indexed: 9654 (ScreenGuis 3695, top-level Frames 5959); in 426 games
- imageFree (no image/content ids anywhere inside): **4987** (51.7%); imageFree ScreenGuis 1755, imageFree Frames 3232
- imageFree with scripts==0 inside: 2635

### 20 largest imageFree UI screens (by GuiObject count; Frames whose ScreenGui is already imageFree skipped; identical copies folded)

| name | class | GuiObjects | TextLabels | TextButtons | scripts inside | game / path |
|---|---|---|---|---|---|---|
| Allhats | ScreenGui | 943 | 0 | 925 | 19 | b18d8af6 `/StarterGui/Allhats` |
| PostGame | ScreenGui | 883 | 3 | 212 | 0 | 81a5f924 `/SavedGameModules/ReplicatedStorage/Guis/PostGame/PostGame` |
| Hats | ScreenGui | 522 | 0 | 513 | 9 | b18d8af6 `/StarterGui/Allhats/Hats` |
| shop | Frame | 380 | 181 | 9 | 0 | 5c88148b `/StarterGui/GUI/shop` |
| shop | Frame | 350 | 169 | 6 | 0 | 36653121 `/StarterGui/GUI/shop` |
| Inventory | ScreenGui | 334 | 216 | 22 | 111 | 0cfd3899 `/Lighting/Inventory` |
| Keno | ScreenGui | 307 | 261 | 43 | 2 | 4dc477e7 `/SavedGameModules/Lighting/Guis/Keno` |
| OpenEffect | Frame | 303 | 0 | 0 | 0 | 81a5f924 `/SavedGameModules/ReplicatedStorage/Guis/Lobby/LobbyGui/OpenEffect` |
| PlayerListContainer | Frame | 299 | 74 | 74 | 0 | c5773abb `/SavedGameModules/CoreGui/RobloxGui/PlayerListContainer` |
| ViewContents | ScreenGui | 294 | 191 | 0 | 98 | 0cfd3899 `/StarterGui/ViewContents` |
| QuentyGuiAdminCommands | ScreenGui | 280 | 14 | 103 | 109 | 17477987 `/Workspace/Model#61/Model/QuentyAdminCommands/QuentyGuiAdminCommands` |
| Leaderboard | Frame | 265 | 218 | 46 | 1 | 17b672b7 `/StarterGui/WepGui/Leaderboard` |
| Mint | ScreenGui | 262 | 40 | 197 | 192 | eef48ad1 `/SavedGameModules/PlayerGui/Mint` |
| XMenu | ScreenGui | 261 | 92 | 74 | 0 | ccab4d67 `/SavedGameModules/ReplicatedStorage/XBOX/XMenu` |
| Mint | ScreenGui | 253 | 40 | 188 | 183 | 66d2a577 `/SavedGameModules/PlayerGui/Mint` |
| Mint | ScreenGui | 252 | 40 | 187 | 182 | d92d0754 `/SavedGameModules/PlayerGui/Mint` |
| Mint | ScreenGui | 244 | 40 | 179 | 174 | cd8cee81 `/SavedGameModules/PlayerGui/Mint` |
| Mint | ScreenGui | 243 | 40 | 178 | 173 | 5b36e9ce `/SavedGameModules/PlayerGui/Mint` |
| PlayerListContainer | Frame | 233 | 80 | 40 | 0 | 3a06b8a8 `/SavedGameModules/CoreGui/RobloxGui/PlayerListContainer` |
| PlayerListContainer | Frame | 230 | 87 | 29 | 0 | eef48ad1 `/SavedGameModules/CoreGui/RobloxGui/PlayerListContainer` |

## Notes

- Bounding size in pieces.json is the visible-parts (Transparency < 0.95) box in studs, rotated parts by their enclosing box; colours are top 3 Color3 hex by visible part count.
- Name matching is a keyword heuristic over the piece name only; check the path before relying on a category. Copies of one asset are folded by the library index (field `copies`).
- BillboardGui/SurfaceGui entries are not in the UI set (only ScreenGui and top-level panel Frames).
