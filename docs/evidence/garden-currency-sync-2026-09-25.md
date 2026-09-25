# Isolated garden Play test: currency HUD is stale

2026-09-25, approximately 20:21 UTC. Tested the Apple-generated garden in the isolated, unpublished Studio place `/private/tmp/apple-codex-gauntlet-place.rbxl`. This was a bounded local Play session; it did not write a DataStore or publish the place.

- The on-screen currency pill showed **0** throughout the test. The Garden Shop opened and listed Carrot for **10**, Tomato for **25**, and Pumpkin for **60**.
- A read-only client Command Bar probe of the replicated `Players.LocalPlayer.leaderstats.Coins.Value` returned **60** before buying. The generated `Profile` source also declares a default of **60** coins and uses a memory-only profile when DataStore is unavailable in the unpublished place.
- Clicking the Carrot purchase button once changed the replicated coin value to **50**. The on-screen currency pill still showed **0**. The purchase reached the server and deducted the expected price; the displayed balance did not track it.
- The Play session was stopped afterward. The isolated place was saved before this test. No seed inventory, planting, growth, harvest, sale, persistence, or full-game visual quality was established by this test.

This corrects the earlier tentative inference that zero visible coins meant the first purchase could not work. The measured defect is a currency display synchronization failure. F-064 remains open because the complete requested game loop is still unproven; F-059 remains open for visual quality and asset coverage.
