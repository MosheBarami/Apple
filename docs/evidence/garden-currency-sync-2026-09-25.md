# Isolated garden Play test: currency HUD repaired, crop loop verified

2026-09-25, approximately 20:21 UTC. Tested the Apple-generated garden in the isolated, unpublished Studio place `/private/tmp/apple-codex-gauntlet-place.rbxl`. This was a bounded local Play session; it did not write a DataStore or publish the place.

- The on-screen currency pill showed **0** throughout the test. The Garden Shop opened and listed Carrot for **10**, Tomato for **25**, and Pumpkin for **60**.
- A read-only client Command Bar probe of the replicated `Players.LocalPlayer.leaderstats.Coins.Value` returned **60** before buying. The generated `Profile` source also declares a default of **60** coins and uses a memory-only profile when DataStore is unavailable in the unpublished place.
- Clicking the Carrot purchase button once changed the replicated coin value to **50**. The on-screen currency pill still showed **0**. The purchase reached the server and deducted the expected price; the displayed balance did not track it.
- The Play session was stopped afterward. The isolated place was saved before this test. No seed inventory, planting, growth, harvest, sale, persistence, or full-game visual quality was established by this test.

This corrects the earlier tentative inference that zero visible coins meant the first purchase could not work. The measured defect is a currency display synchronization failure. F-064 remains open because the complete requested game loop is still unproven; F-059 remains open for visual quality and asset coverage.

## Follow-up, approximately 20:35–20:43 UTC

The bounded Apple repair run ended idle after an admin Stop. It changed `StarterPlayer.StarterPlayerScripts.GardenClient` to wait for the `Coins` child, but a fresh native Studio Play test still showed **0** while a read-only client probe found balance **60** and the script-updated label text **60**. A read-only inspection of `PlayerGui.GardenCoins` showed two overlapping labels: `GardenCoins.Value` was **60**, while the front `GardenCoinsHUD.Value` was **0**. The agent's first repair had bound the rear label.

In the isolated, unpublished place only, I changed the one `coinsLabel` binding in `GardenClient` to `GardenCoinsHUD.Value`, with an exact-one-match assertion, and saved the place. On a fresh Play session the visible pill showed **60**; clicking the Carrot buy button showed **50**. This confirms the visible number follows the authoritative replicated balance in both directions tested. This change is saved in the local `.rbxl` place, not shipped as a reusable product fix or a published Roblox experience.

I then observed one normal UI-driven economic loop. The `State` remote, monitored read-only in the Studio client, reported Carrot seeds **1** after purchase; clicking `Pad4` changed seeds to **0** and set its crop to `Carrot`; clicking it after the eight-second growth interval changed harvested Carrots to **1** and cleared the pad; clicking Sell changed the balance from **50** to **68** and holding from **1** to **0**. The on-screen pill also showed **68**. No DataStore was written in this unpublished place.

The planted crop and its growth were not visibly rendered on the pad during this test, even while the server state progressed. The scene remains sparse and unlike the commercial Roblox visual reference. This verifies a minimal buy–plant–harvest–sell mechanic in one local session. It does **not** verify a complete game, its other requested features, persistence, or commercial visual quality. F-059 and F-064 remain open; three independent reviews remain outstanding.
