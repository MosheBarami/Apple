# "81,648 usable without upload" is wrong, and the control proves why

The asset library's headline number counts rows that carry a `robloxAssetId` and calls them
insertable. Measured in Studio today: **they are not**. Roblox refuses them, and the reason is not
the asset type, the API, or the plugin's capability surface. It is ownership.

## The measurement, with its control

`InsertService:LoadAsset` called from the Studio command bar, signed in as Shahar474:

| asset | what it is | result |
|---|---|---|
| `107230158271368` | the Apple Studio plugin, **owned by this account** | **OK** |
| `578157972` | `GingerBread tree`, AssetTypeId 40, `status='active'` in the library | **User is not authorized** |
| `519096177` | `Dead Tree`, AssetTypeId 40, `status='active'` | load failed |
| `4969855485` | `palm trees`, AssetTypeId 13, `status='active'` | load failed |

The owned asset is the control, and it is what makes this a finding rather than a broken probe.
`LoadAsset` works. The plugin's code is fine. The library's assets are refused because **this
account does not own them**.

## What that means, plainly

"Free on the Creator Store" is free to **take**, not free to **load**. Taking is an explicit act
by a signed-in user, per asset, through the Toolbox — which is exactly why the Toolbox can insert
these and a script cannot. The library's licence column is correct and irrelevant to this: Roblox
is not enforcing a licence here, it is enforcing an inventory.

So the product's delivery story for 81,648 assets was never going to work through
`insert_asset`, however the plugin was written. This was not visible from the database, from the
licence rows, or from reading Roblox's docs. It took calling the API with a control beside it.

## What was ruled out on the way

Four paths, all tested in Studio, all failing for different reasons:

```
MeshPart.MeshId = "rbxassetid://578157972"        -> the current thread cannot write to this property
AssetService:CreateMeshPartAsync(same)            -> Failed to load mesh asset
Decal.Texture = "rbxassetid://4969855485"         -> placed, renders blank white
ContentProvider:PreloadAsync on that same Decal    -> SUCCEEDS, and Texture is still set
InsertService:LoadAsset(578157972)                -> User is not authorized      <- the real one
```

The decal case is the nastiest of the four, because it does not fail. `PreloadAsync` returns
without error, the `Texture` property keeps its value, and the surface renders blank — a silent
failure with no error to catch and nothing in the object to inspect. Anything that checked "did
the assignment stick" would report success. Only looking at the pixels says otherwise.

The first three are about container ids: the library stores Creator Store **container** assets
(AssetTypeId 40 and 13), while `CreateMeshPartAsync` wants an inner mesh id and `Decal.Texture`
wants an inner image id. The fourth is about inventory and applies no matter which id is used.

## The correction the numbers need

`index.json`'s `liveMeasurement.active` — 81,648 — means *"carries a robloxAssetId"*. It does not
mean *"a user can insert this"*, and `AGENTS.md` and the site both read it as the latter. The
honest figure for what the product can place into a place today, through the plugin, is **zero**,
and it stays zero until one of these is true:

1. **The assets are taken into an inventory.** A signed-in user takes them once; from then on
   `LoadAsset` works for that user. That is a real product flow — "add these 200 assets to your
   inventory" — and it is per-user, not something the library can do once centrally.
2. **The inner mesh and image ids are harvested.** A MeshPart asset's mesh id and a Decal's image
   id are placeable with no loader and no ownership check: `MeshPart` built by
   `CreateMeshPartAsync` on the inner mesh, `Decal.Texture` on the inner image. This is a corpus
   change, it needs no plugin capability at all, and it is the only path that does not require the
   user to acquire anything.
3. **Roblox-owned or self-uploaded assets.** Both are outside what the library currently holds,
   and uploading is forbidden here for good reason.

Option 2 is the one worth building. It is also the one that makes the FORBIDDEN list argument
moot: with inner ids, the plugin needs no remote loader to deliver the library.

## What the plugin work still bought

`insert_asset` is implemented, supported and shipped, with a guard that scans a loaded tree for any
`LuaSourceContainer` before parenting anything and refuses the whole asset if it finds one. The
build now REQUIRES that guard rather than forbidding the loader, which is a stronger invariant:
"no loader" is satisfied by a plugin that inserts nothing; "no insertion without the code refusal"
cannot be satisfied by deleting the guard.

It will work for any asset the user owns — including everything they upload or take themselves —
and it refuses the rest honestly with Roblox's own words. That is worth having. It is not the
library.

## Not verified

- Whether *every* library row is unowned. Four were tested, three failed, one class (`decal`) was
  only tested through `Decal.Texture` and `LoadAsset`. The pattern is consistent and the sample is
  small.
- Whether taking an asset once makes `LoadAsset` work for that account afterwards. That is the
  documented behaviour and was not tested, because taking assets into the owner's inventory is not
  something to do without asking.
- Whether the Creator Store search API exposes the inner mesh/image ids that option 2 needs.
