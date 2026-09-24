# Apple Studio 1.4 upload, distribution pending

Observed in Roblox Studio signed in as Shahar474 on 2026-09-24 at about 22:23 UTC:

- Imported `apps/apple-plugin/release/apple-studio-1.4.0.rbxm` through File → Import Roblox Model. Local SHA-256: `50fc250291fac769a972b3314b7094939dd42cbb8e5250b8ea5305b0388bf649`.
- With the imported Apple Studio script selected, Plugins → Publish as Plugin → Overwrite an existing asset → Apple Studio. Studio displayed **Successfully submitted!** and asset ID `107230158271368`.
- Immediately afterward, `https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=107230158271368` returned 404. The same endpoint returned 200 for listed controls `6415005344` and `4725618216`. The public Creator Store page rendered **404 Page Not Found** in a different signed-in Roblox account.

The upload is verified. Public distribution, installed bytes, and the 1.4.0 runtime are **not** verified. Do not bump `LATEST_PLUGIN_VERSION` or close F-059 until those checks pass. Recheck the listing, then install from the Store in Studio and run the asset-source question flow.
