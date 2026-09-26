# Apple reads imported cartoon assets — spatial evidence repair

2026-09-26, isolated paired garden place.

## Live baseline

Run `5fd6f76d-fae2-4324-aa52-0cbd4187e7ef` finished after exactly three calls: two successful `get_project_tree` reads (Monk pack and GardenPaths), then one refused `get_instance` on three same-named Tree siblings. No mutation tool ran. The visible reply cost 16 Credits; the build and three model-call records sum to 479 neurons. No provider dollar invoice was measured.

The model correctly refused to guess positions. However, the full Studio wire trees already contained 38 Position fields. `treeOutline` intentionally removed every typed property to avoid truncated replies, so those fields never reached the model. Tree/Rock sibling names also made their displayed paths ambiguous.

## Repair and local validation

The compact tree now includes only measured finite Position/Size vectors and an actual Anchored boolean when supplied. It warns about duplicate sibling names instead of presenting them as usable unique paths. It keeps the serialized reply cap and explains omitted nodes; it does not synthesize a Model pivot or a new object identifier.

The new spatial test failed against the previous implementation, then passed. All five tree-outline tests pass, worker TypeScript passes, and the complete isolated worker suite passes 4,203 tests with four skips (4,207 total). This does not yet prove deployed agent placement. A deployment and bounded live repeat remain required.

Manual local Monk import was proved separately in [the import evidence](owner-monk-local-studio-import-2026-09-26.md). Apple-agent insertion, appropriate placement, visual game quality and full-game completion remain unproven. F-059/F-064 and three fresh independent reviews remain open.
