# Local Tulip gameplay proof — 2026-09-26

## Scope and provenance

Source #41: https://devforum.roblox.com/t/free-low-poly-simulator-kit-and-map/1147111 (SpiralAPI, MIT notice dated 2022). Original kit export: 93,878 bytes, SHA-256 072c974fb3702dd3adf748661d2721dcbfdd618083cfbd1d9e08abc32e436de5. Operator extracted the three existing flower MeshParts, retained the MIT notice/source attributes, and imported the derived data-only template into ServerStorage through native Studio. No downloaded scripts ran. This was operator preparation, not autonomous Apple asset ingestion or a new original download. Referenced mesh/texture rights are not independently verified; local review only.

Derived template /private/tmp/GardenTulipTemplate.rbxm: SHA-256 ea9dd8f6fa5077e0cbd87972141bccb9e02ce925005f0ed9d317f42dc305b605, three MeshParts, zero scripts. The product calls this crop Tulip, although its visible source geometry resembles a generic purple flower.

## Real product runs

After deploying f3cd64a, run 778446c2-5e9d-4f6d-b911-d50f9e8d2483 made one plan, two reads, two successful edits, and one inspect_visually despite the explicit no-inspection instruction. 57 Credits; six recorded model calls totaling 1,686 neurons. Operator stopped it. GardenMain clones the existing template, anchors it, disables collision/query/touch, places its stem foot at the pad surface, grows it from .35 to 1, and removes it on harvest/leave. GardenClient buys/selects Tulip and handles readiness feedback.

Repair run 322b3b0d-7a8c-4a38-b789-8c05b886d9af successfully added sendState at readiness and limited flower geometry to Tulip. It then repeated completion text and continued tools despite an explicit one-read/one-edit limit. Its persisted trace has 27 calls: read_script 2, edit_script 2, inspect_visually 1, propose_plan 1, get_project_tree 3, search_instances 4, get_instance 14. 160 Credits; 28 model-call events, 4,773 neurons. Manually stopped; this is a measured agent termination/limit failure, not compliant bounded autonomy.

## Native Play observations

Roblox Studio 1.4.3 paired to the isolated saved /private/tmp/apple-codex-gauntlet-place.rbxl. Native Play, mouse interactions and screenshots in the computer tool transcript showed:

- HUD starts at 60; Tulip seed purchase costs 10 and changes it to 50.
- Clicking an empty soil pad creates a small existing purple/yellow flower; after growth it is visibly larger with its stem foot at the pad surface.
- Clicking that pad harvests and removes the geometry; Sell changes 50 to 68.
- The same sequence worked after the readiness/conditional repair. Further cycles bought seeds and grew flowers.
- Readiness toast was not observed in repeated captures, including a timed capture. Its source was repaired but visible success is unproven; keep this gap open.
- No Tomato/Pumpkin visual was independently tested. Source condition now restricts flower cloning to Tulip.

Stopped Play and left the plugin visibly connected in inspect-only mode. The Apple run is stopped. No permanent Roblox upload or Experience Setting change occurred.

## Limits / next work

This proves a local functional crop slice using a listed-source model. It does not prove autonomous ingestion, a full commercial game or a passed independent review. The world remains sparse on a flat green baseplate; shop tiles show generic G icons and the Sell button overlaps the shop close area. F-059/F-064 and 0/3 reviews remain open. Owner-listed library builder-ready count remains zero; review receipts remain 429. Next: fix repeated completion/tool execution from this persisted trace, repair visible readiness feedback, and improve the UI with the owner's listed Roblox packs.

## Backend validation

f3cd64a read_script completeness repair: four targeted regressions and full worker suite 4,207 passed, zero failed, four skipped; TypeScript passed. Deployed through infra/deploy-worker.mjs with independent live read proof. GitHub Actions 36219649531 completed success on f3cd64a571e148d69d8770d031f2f471da750520.
