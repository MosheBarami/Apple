# Owner-listed Studded UI: live isolated-game integration

2026-09-26, approximately 06:00–06:05 UTC. This is a measured slice, not a complete game.

Source #4: https://rblx-essentials.itch.io/studded-ui. Original RBXM 144,433 bytes, SHA-256 ca352ae9dc383842a0ce010950ef4955cab2e6285f6aaa577d769792e7eb655e. Author permits modification and integration in own free/commercial games, prohibits standalone redistribution. No downloaded code ran.

Operator prepared a 95-descendant, zero-script shop subset for this local game only. Temporary RBXM SHA-256 a4fe8ded178a8fb08e12995adf7d41523d9dc9f3d2124a0fe925f327fedbfb7b. Native File > Import Roblox Model imported it into the isolated place. Explorer cut/paste initially landed in Workspace rather than StarterGui; this was corrected through Apple, not silently counted as successful UI placement.

Apple run e698c3a4-e438-4434-aa93-9592703c51c5 made exactly move_instances and set_properties, both successful, automatically done, 8 Credits. Actual native screenshot showed clipped cards. A second requested two-property sequence stopped incomplete with zero calls; 5 Credits refunded. Operator used two scoped set_properties calls to reset scroll canvas and row position/size, both succeeded. This layout repair was operator assistance, not agent autonomy proof.

Apple run aa72fe77-3f94-4cc0-93f9-c30487893902 made exactly read_script and edit_script, both succeeded, automatically done, 11 Credits. Independent source readback confirms GardenClient prefers imported GUI, retains old shop fallback, disables old window while using new one, and hides Sell while the panel is open, restoring it on close. No other scripts changed in this run.

Native Play: initial HUD60; Shop opens red studded Garden Seeds panel with Tulip10/Tomato25/Pumpkin60 labels; Sell hidden. Click Tulip button: visible HUD50. Close: panel disappears, Sell returns. Screenshots: apple-studded-live-20260926/purchase-50.png and close-restores-sell.png. Full growth loop was previously tested; not repeated here. Other crop purchases/mobile/resizing were not tested. All seed artwork remains missing; this is not commercial visual completion.

Stopped Play, saved /private/tmp/apple-codex-gauntlet-place.rbxl locally, disabled review ScreenGui in edit mode (client enables it at runtime), returned Apple plugin to inspect-only. No permanent Roblox upload, paid dependency, downloaded script execution, or owner experience-setting change. This proves manual local UI import and game binding, not distributable Apple backend library readiness or autonomous ingestion. F-059/F-064 and 0/3 independent reviews remain open.

Fresh CI on prior head2a7a2b6: run36222029515 completed success. Sole CPU supervisorPID35962 remains; v31 entered paired evaluation, final score/upload/successor not yet verified.

## Sourced Tulip viewport, 06:11–06:20 UTC

Operator prepared a zero-script ViewportFrame containing three existing Tulip MeshParts from owner source #41, SpiralAPI MIT2022, preserving the license notice. Temporary file /private/tmp/GardenTulipViewport.rbxm: 59,509 bytes, SHA-256 4f6c6f87abebec83120cec06bcdc1c2fc14996476ed448999e9971cdbf93d2a5. Native Import placed it under StarterGui.GardenStuddedShopReview. Apple run41c45ae7-5bd8-487a-85f5-60444a04d020 moved it to the Item1 card, exactly one successful move, auto done,5Credits. No new detailed geometry or downloaded scripts.

Initial native Play rendered blank. Apple runc85659e3-f929-4879-b184-91c9aac5deed read/edited GardenClient exactly once each,10Credits, binding existing PreviewCamera. It remained blank. Readback found the imported camera pose incorrect; a subsequent requested pose edit made zero calls,2Credits refunded. Operator camera property write first refused nonallowlisted FieldOfView, then a CFrame-only write succeeded, but Play still blank. A client-camera fallback run72ed5b01-0827-47cf-bdd2-c652c805e386 read once, then failed edit_script due empty find text;7Credits refunded and no write. Operator then read current baseHash and made one exact find/replace, adding a local Camera fallback and Roblox CFrame.lookAt. This was operator assistance, not agent autonomy. Camera replication loss is a hypothesis, not a proven root cause.

Final native Play visibly rendered the pink sourced flower in Tulip card. Click10Coins: HUD60→50 while artwork stayed visible. Screenshot apple-studded-live-20260926/tulip-preview-purchase-50.png. Tomato/Pumpkin artwork remains absent; mobile/layout not tested. Stopped Play, saved local place, plugin visibly inspect-only. No permanent Roblox uploads. Source4 still cannot be redistributed as a standalone library.

CI36222749393 passed on46c3cf7. Sole supervisor35962 completed v31 paired38-row evaluation:19/38 versus v29 freshly paired23/38, not promoted. Private Hub API confirmed adapter and candidate score upload; comparator score was missing. Operator uploaded only the paired comparator file in commitb65a6c0efe8821a51b82def6402d7f031bbe548f and verified remote/local SHA-25619dc38dc89e4cc4813dc1ca2d5d3f1c886a959a3142b615303b3fbd3c5d2d168, repository private=true. Supervisor automatically began CPUv32 at06:20:09UTC, without interruption/duplication. Publication evidence omission remains a supervisor follow-up; local scores are not Frontier proof. F059/F064,0/3reviews remain.
