# Owner-listed Studded UI: live isolated-game integration

2026-09-26, approximately 06:00–06:05 UTC. This is a measured slice, not a complete game.

Source #4: https://rblx-essentials.itch.io/studded-ui. Original RBXM 144,433 bytes, SHA-256 ca352ae9dc383842a0ce010950ef4955cab2e6285f6aaa577d769792e7eb655e. Author permits modification and integration in own free/commercial games, prohibits standalone redistribution. No downloaded code ran.

Operator prepared a 95-descendant, zero-script shop subset for this local game only. Temporary RBXM SHA-256 a4fe8ded178a8fb08e12995adf7d41523d9dc9f3d2124a0fe925f327fedbfb7b. Native File > Import Roblox Model imported it into the isolated place. Explorer cut/paste initially landed in Workspace rather than StarterGui; this was corrected through Apple, not silently counted as successful UI placement.

Apple run e698c3a4-e438-4434-aa93-9592703c51c5 made exactly move_instances and set_properties, both successful, automatically done, 8 Credits. Actual native screenshot showed clipped cards. A second requested two-property sequence stopped incomplete with zero calls; 5 Credits refunded. Operator used two scoped set_properties calls to reset scroll canvas and row position/size, both succeeded. This layout repair was operator assistance, not agent autonomy proof.

Apple run aa72fe77-3f94-4cc0-93f9-c30487893902 made exactly read_script and edit_script, both succeeded, automatically done, 11 Credits. Independent source readback confirms GardenClient prefers imported GUI, retains old shop fallback, disables old window while using new one, and hides Sell while the panel is open, restoring it on close. No other scripts changed in this run.

Native Play: initial HUD60; Shop opens red studded Garden Seeds panel with Tulip10/Tomato25/Pumpkin60 labels; Sell hidden. Click Tulip button: visible HUD50. Close: panel disappears, Sell returns. Screenshots: apple-studded-live-20260926/purchase-50.png and close-restores-sell.png. Full growth loop was previously tested; not repeated here. Other crop purchases/mobile/resizing were not tested. All seed artwork remains missing; this is not commercial visual completion.

Stopped Play, saved /private/tmp/apple-codex-gauntlet-place.rbxl locally, disabled review ScreenGui in edit mode (client enables it at runtime), returned Apple plugin to inspect-only. No permanent Roblox upload, paid dependency, downloaded script execution, or owner experience-setting change. This proves manual local UI import and game binding, not distributable Apple backend library readiness or autonomous ingestion. F-059/F-064 and 0/3 independent reviews remain open.

Fresh CI on prior head2a7a2b6: run36222029515 completed success. Sole CPU supervisorPID35962 remains; v31 entered paired evaluation, final score/upload/successor not yet verified.
