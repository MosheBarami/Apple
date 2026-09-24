# Apple Studio 1.4 upload, distribution pending

Observed in Roblox Studio signed in as Shahar474 on 2026-09-24 at about 22:23 UTC:

- Imported `apps/apple-plugin/release/apple-studio-1.4.0.rbxm` through File → Import Roblox Model. Local SHA-256: `50fc250291fac769a972b3314b7094939dd42cbb8e5250b8ea5305b0388bf649`.
- With the imported Apple Studio script selected, Plugins → Publish as Plugin → Overwrite an existing asset → Apple Studio. Studio displayed **Successfully submitted!** and asset ID `107230158271368`.
- Immediately afterward, `https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=107230158271368` returned 404. The same endpoint returned 200 for listed controls `6415005344` and `4725618216`. The public Creator Store page rendered **404 Page Not Found** in a different signed-in Roblox account.

The upload is verified. Public distribution and a fresh Creator Store installation are **not** verified. Do not bump `LATEST_PLUGIN_VERSION` or close F-059 until those checks pass. Recheck the listing, then install from the Store in Studio and run the asset-source question flow.

Local runtime check, separate from Store distribution: the existing file at
`/Users/moshe/Documents/Roblox/Plugins/AppleStudio.rbxm` was backed up under `/tmp` and replaced
with the verified 1.4.0 artifact. After quitting and relaunching Studio, the Apple dock footer read
`Apple Studio · 1.4.0 · independent preview`. This proves that Studio loaded the local 1.4.0 plugin;
it does not prove that customers can install 1.4.0 from the Creator Store. The public details
endpoint still returned 404 at about 22:38 UTC while listed control assets returned 200.

Owner-inventory check, 2026-09-24 about 23:28 UTC: Studio's Toolbox → Inventory → My Plugins
showed **Apple Studio** by **Shahar474** with an Install button. Installing it changed the button
to **Installed**, added a second Apple Studio entry to Studio's Plugins menu, and Plugin Management
showed Apple Studio as enabled, “Up to date,” last updated **9/25/2026**. This proves that the
publishing account can install its own asset through its inventory. It does **not** identify the
installed build's internal version, nor prove distribution to a different account. Clicking
Plugin Management → Details opened the public Creator Store URL in Chrome signed in as another
account; it still rendered **404 Page Not Found**. At the same time the unauthenticated toolbox
details endpoint still returned 404 for this asset and 200 for the listed Rojo control.
