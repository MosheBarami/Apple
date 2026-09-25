# Roblox-only model library correction (2026-09-25)

The owner clarified that a model merely compatible with Roblox is out of scope. Apple may catalogue and offer only models created specifically for Roblox. General 3D marketplaces and general game-asset packs do not qualify, even when their files are free, CC0, low-poly, or convertible to `.rbxm`.

The model builder now admits a downloaded file only when its source pack explicitly records `robloxSpecific: true`. No existing downloaded pack has that proof. The generated manifest contains 51,133 Roblox Creator Store IDs and **zero downloaded model files**. The agent index contains 481 candidates, all Roblox-owned Creator Store IDs. The model downloader refuses every pack without the same explicit field before network access. The Poly Haven ingestion command was removed.

The owner's source list remains visible on the local dashboard, but 11 general-purpose 3D portals (priorities 134–144) are marked out of scope and contribute zero to acquisition progress. The ZeroDev Roblox UI file remains a local rights-review copy; its licence does not permit Apple to redistribute it. No Roblox-specific model file from the owner's list has yet been admitted. This is the honest baseline for further acquisition.

Seven Poly Haven models ingested in error were removed from the source registry and moved out of the active local model store to `/private/tmp/apple-general-models-quarantine-t3y2it1m`. Before deletion, the private D1 static store held exactly seven paths under `/model-library/models-store/polyhaven/` and 20 chunks. After targeted deletion, a remote D1 query returned **0 assets and 0 chunks** for that prefix. No customer Roblox account was involved.

Verification: the new scope guard went red against the old index and downloader, then passed (3/3). The worker model suite passed 16/18 with two explicit skips for file upload checks that require an admitted Roblox-native file pack. The dashboard suite passed 39/39, and worker TypeScript compilation passed.

Reversal: only after a source pack's original page is checked to establish that it was made for Roblox, add a documented `robloxSpecific: true` to that pack, fetch it through the existing licence and safety gates, rebuild the manifest, and run the scope tests. Do not mark a generic pack just because a converter can import it into Roblox.
