# Game 1, round 1: causes (from the agent's own tool trace, 90 calls)

Evidence: `/api/admin/session-messages` for the run (stopped at call 89 by me). The calls in order are listed in the
session log.

| # | What went wrong | Evidence in the trace | Kind of cause |
|---|---|---|---|
| C1 | The game composer failed three times, and the agent then improvised everything | calls 1–3 `compose_game` "Could not build the game", no detail recorded; it has only 3 templates (tycoon, plot-sim, lane-defense) | capability + observability: the failure reason is not even kept |
| C2 | No real assets: crystals, rocks and cave pieces came out as plain Parts | `find_library_model` returned 0 Creator Store results for "glowing crystal cluster" and "rock boulder gem". The owner library returned an unrelated javelin. `insert_asset` was refused twice ("not authorized") | capability: asset search and insert path |
| C3 | The researched knowledge was never consulted | 0 calls to `search_docs`, `search_creation_skills` or `read_creation_skill` across 90 calls. Only the auto-pushed cards could have reached it | agent behaviour: knowledge is passive and optional |
| C4 | The world breaks the building research: a perfect symmetric grid of 32 identical clusters, slab walls and roof, no terrain, and caves placed outside the outer wall | `create_instances` + `clone_instances`, the workspace listing (CrystalNode_1..32 on a mirrored grid; Jade/Void caves at z -160/-220 beyond CaveWall z -150) | knowledge unused (21-building-craft, 05) + no layout check |
| C5 | UI: duplicate Upgrades buttons and Rebirth in the middle of the play area | `build_studded_ui` (top/bottom) then `add_upgrades` added its own Upgrades button, and neither checked the other | tool behaviour: composers do not share one layout |
| C6 | The visual check came last and nothing was fixed after it | `look` at call 87 reported "no cave walls visible", "crystals on open flat ground" | agent behaviour: look too late, no fix loop |
| C7 | 36 of 90 calls went on reading and re-editing scripts | read_script ×16, edit_script ×9, search_scripts ×7, get_instance ×9 | efficiency: no plan for systems, so it worked by trial |

## Critique flaws → causes → product fix
| Flaws (critique #) | Cause | Product fix (not a hand-edit of this game) |
|---|---|---|
| 4, 6, 10, 24, 28: blob crystals, flat slabs, one-note materials | C2 no real assets | F2: real Creator Store search (Open Cloud Toolbox API: verified, no scripts, meshes) + an insert path that works for free assets; the owner library searched by meaning |
| 1, 2, 9, 12, 23: no caves, flat field, mirrored grid, horizon seams | C4 building knowledge unused | F1: researched skills pushed into each plan step automatically; F3 composition check flags grids, missing enclosure, objects outside bounds |
| 3: near-black lighting | knowledge unused (05 looks) | F1 + set_mood must reach a readable exposure; the look checks brightness |
| 13–20: duplicate buttons, modal overlap, wrong currency icon, rebirth without info, mobile zones | C5 UI tools that do not share a layout | F4: one layout per screen; add_upgrades reuses the existing button; centre and hotbar zones kept clear; modal dims the backdrop; currency icon from the subject |
| 5, 7, 8, 21, 22, 26: no mining interaction or feedback, camera/spawn, no objective | knowledge unused (03, 07, 10, 12) | F1 + F5: an in-product blind critique of the final screenshots with the same rubric, then a fix pass, before the agent answers |
| (observability) | C1 compose_game failure reason lost | F6: every failed tool keeps its error text in the trace |
