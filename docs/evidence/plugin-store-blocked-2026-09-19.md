# The Creator Store step was never "not done" — Roblox refused it

`docs/PLUGIN-RELEASE.md` records blocker **A1** as a step nobody had performed: go to the Creator
Dashboard, switch on *Distribute on Creator Store*, save. Every downstream item — the liveness
probe, `STUDIO_PLUGIN_STORE_LIVE`, the landing copy — waits on that being ticked.

It is ticked. It has been ticked. Roblox is refusing.

## What the dashboard actually says

`create.roblox.com/dashboard/creations/store/132128477945417/configure`, signed in as
**Herobrine583522** (the account that owns the asset — confirmed independently through
`economy.roblox.com/v2/assets/132128477945417/details`, which names it and reports the asset as
`Golem`, created 2026-08-31):

> **Distribution**
> To maintain community safety, Roblox may terminate accounts that publish spam or assets with
> malicious or obfuscated code.
>
> ⚠️ **Not distributed on Creator Store**
> This asset may be in violation of Roblox Community Standards. Please review *Creator Store
> requirements*, and update the asset. If you believe this content decision was in error, you can
> appeal.  **[Appeal]**
>
> **[✔] Distribute on Creator Store**   — the toggle is ON
> 9 Store shares left through Sep 30, 2026

The toggle is on and the asset is still not distributed. This is a content decision, not a missing
click, and no amount of re-toggling changes it. The 404 the liveness probe returns for
`toolbox-service/v1/items/details?assetIds=132128477945417` is that decision, observed from the
outside.

## Publishing a NEW plugin also fails, three times

Before finding the banner, a fresh publish was attempted end to end from Studio:

1. Built the artifact — `apps/apple-plugin/release/apple-studio.rbxm`, version 1.0.0, verified by
   `scripts/verify-artifact.py` against the decompressed bytes: `rasterTri` ×3, `Render.capture`,
   `GenerateModelAsync` ×7, the capability schema and the poll path all present, no credentials.
2. Reconstructed the plugin tree inside Studio through the Command Bar (a local JSON server over
   `127.0.0.1`, since Studio's Open/Save panel is a separate process this session may not drive).
   `ServerStorage.Apple Studio` with its four ModuleScripts — confirmed in Explorer.
3. **Plugins → Publish as Plugin → Save → "Submission failed."** No further detail.
4. Studio was showing *Restart to update*; restarted, it updated, redid steps 2–3. **Failed again.**
5. Chose *Overwrite an existing asset…* instead. **The list of the account's own plugins came back
   empty** — while the website lists one.

Three symptoms, one shape: Studio's authenticated asset calls fail (it also could not fetch the
baseplate template — "We could not open the place [95206881]") while the website works perfectly
on the same machine, same account. Note that Studio reported **Mr_NoAmX** on first launch and
**Herobrine583522** after the restart, which is consistent with a Studio session token that does
not match the account the UI is showing.

Not pursued further, deliberately: the remedy is re-authenticating Studio, which risks leaving the
owner signed out and may ask for a password. Entering his password is not something an agent does.

## So the real blocker, stated plainly

**Roblox has made a moderation decision against this asset.** Two things can move it and neither is
a configuration change:

1. **Update the asset so it complies.** The substantive work is already done and is the reason
   `apps/apple-plugin` was chosen as the product over `apps/plugin`: `apps/plugin/src/Ops.luau:521`
   builds a `ModuleScript` from an HTTP response body and `require`s it — executing code fetched at
   runtime, which is squarely what "malicious or obfuscated code" and the original *Misusing Roblox
   Systems* removal are about. `apps/apple-plugin` does not do this, and refuses `run_code`,
   `run_mode`, `insert_asset` and `inspect_model` by name.
2. **Appeal**, via the button on that page.

The appeal is a statement to Roblox about intent, made in the owner's name, and this session does
not send it unilaterally. Renaming the listing from *Golem* to *Apple Studio* — which the
no-Golem-branding rule wants anyway, and which is also literally "update the asset" — was attempted
and refused by this session's own permission boundary as a public-surface edit.

## What is NOT true, and was in the docs

- ~~"Nobody has enabled Creator Store distribution."~~ It is enabled.
- ~~"The remaining steps are Studio and Dashboard actions the owner can perform."~~ He can perform
  them; performing them does not publish the plugin, because Roblox is declining to distribute it.

`PLUGIN-RELEASE.md` step 2 should be read as *appeal or re-submit a compliant asset*, not as a
checkbox.

## Not verified

- No claim about WHY Roblox flagged it. The banner says "may be in violation" and names no rule.
  The `require`-from-HTTP pattern in the old source is the strongest candidate and is a hypothesis,
  not a finding.
- Nothing was published. The account gained no new asset from this session; the `Apple Studio` tree
  built in Studio lives in an unsaved place and the save prompt was declined.
- Whether a compliant re-submission would be accepted is unknown until one is accepted.
