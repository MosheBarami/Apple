# Apple garden crop repair: an asset miss exposed a script-edit gap

2026-09-25, isolated unpublished Studio place `/private/tmp/apple-codex-gauntlet-place.rbxl`.

The visible buy–plant–harvest–sell loop had already been observed, but the crop itself was invisible. Two bounded Apple MAX repair runs were made against that measured defect.

The first run was stopped prematurely because the live session-info oplog included operations from older runs. Its persisted run trace showed only five read-only calls and no edit. It cost 52 Credits. No result is attributed to that run.

In the second run, `find_library_model` searches for `carrot crop plant` and `carrot` returned zero matches. Apple then read `GardenMain`, made two successful `edit_script` writes, ran one successful `play_check`, and repeatedly called `get_project_tree` before Stop. It cost 79 Credits. The edits appended a `CropVisual` Model built from a Cylinder and three Part leaves, scaled during growth, with a neon ready marker. No library model was inserted. This violated the owner's asset-first rule even though it was functional code. The run ended `stopped` and the project returned idle.

The procedural crop block was removed from `GardenMain` in the isolated place by exact marker boundaries and the place was saved. The source length returned from 9,339 to 6,414 characters. The previously tested economic loop remains, while its visual crop remains absent. Nothing was published or uploaded to Roblox.

The source gap was `edit_script`: `run_luau` and `create_instances` had model rules, but a generated game script could still make a detailed Model from Parts at runtime. Draft [PR #10](https://github.com/MosheBarami/Apple/pull/10), commit `9490677`, adds a guard for newly introduced procedural props to `edit_script`, while permitting unrelated changes to legacy scripts and cloning existing verified models. Focused tests failed on the old behavior, then passed with zero Studio edit calls for a refused crop. Worker TypeScript and the full suite passed locally (4,198 pass, 0 fail, 4 skip). This guard is **not deployed** until review and checks complete.

The current rights-checked index has 481 Creator Store models and no entry whose name contains carrot, crop, farm, plant or vegetable. It has one `Flowers` model and several trees, but none is evidence of a fitting carrot crop. F-059 and F-064 remain open. A new bounded run must show a suitable verified crop asset, visible planting/growth/harvest, complete requested features, and independent visual review before either finding can close.

## Live guard verification, approximately 21:16 UTC

PR #10 passed all seven reported checks, including a corrected nonproduction Cloudflare Workers Build that typechecked the Worker and uploaded a version without routing production traffic. It was squash-merged as `84c7303`. A clean archive of that merged commit passed Worker TypeScript and 4,198 tests (0 fail, 4 skip). `infra/deploy-worker.mjs` deployed it and verified `/api/health` answered `buildSha: 84c7303`.

Through the live admin `run-tool` route on the already paired isolated test project, I asked `edit_script` to create a new inert `ModuleScript` that assembled a named Carrot Model from a Part. The live tool answered `ok: false` with `Refused (D-MODELLIB-2)`. `read_script` answered `instance not found` before and after the attempt. No probe script was written. This verifies the specific bypass at the live tool boundary; it does not verify a new agent-run game or visible crop.
