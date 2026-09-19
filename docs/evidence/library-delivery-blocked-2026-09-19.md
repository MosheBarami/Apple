# The asset library delivers nothing, and I measured exactly why

w21's open criterion is licensed insertion observed end to end in Studio. It was recorded as
"unobserved". It is stronger than that: **the product as shipped cannot do it at all**, and the
reason is a deliberate, build-enforced decision rather than a gap.

## What the library actually contains

Every one of the 81,648 live-insertable rows is one of two Roblox asset types:

```sql
SELECT substr(id, instr(id,'/')+1, instr(substr(id, instr(id,'/')+1), '/')-1) AS t,
       COUNT(*) FROM asset_library WHERE status='active' GROUP BY t;

  decal     59,938
  meshpart  21,710
  ---------------
            81,648
```

The classification is right. Checked against Roblox rather than trusted: `578157972` is genuinely
`AssetTypeId 40` (MeshPart) and `4969855485` is genuinely `AssetTypeId 13` (Decal).

## The refusal, and the gate behind it

`apps/apple-plugin/src/Commands.luau` lists `insert_asset` in `UNSUPPORTED`: *"no remote asset
loader is exposed through the command bridge."* The worker therefore withholds the tool, and the
library's headline number buys a user nothing.

That is not a stray string. `scripts/verify-artifact.py` **fails the build** on any artifact
containing `GetService("InsertService")`, in a FORBIDDEN list beside `loadstring(`,
`pcall(require,` and `:GetObjects(` — the call shapes behind the legacy plugin's removal for
"Misusing Roblox Systems". Someone decided the shipped plugin loads no remote content of any kind
and enforced it in the build.

## I implemented it, then reverted it

I wrote `handleInsertAsset` using `InsertService:LoadAsset`, guarded harder than the danger it was
refused for: it searches the loaded tree for any `LuaSourceContainer` **before** parenting anything
and destroys-and-refuses an asset carrying even one script, so the plugin inserts geometry and
never code. It also checks every child against `destinationRefusal` before parenting any, so a
multi-part asset cannot leave half of itself behind.

The build refused it, correctly, and I reverted rather than weakening the gate. Overriding a
peer's enforced invariant — on a plugin whose predecessor was removed by Roblox — is not a call to
make silently at 2am in a commit nobody asked for.

## Then I looked for a way that needs no loader, and there isn't one

The hypothesis was good: a MeshPart is geometry and a Decal is an image, so both ought to be
placeable by creating an instance and setting a property. No loader, no scripts, nothing on the
FORBIDDEN list. **Tested in Studio, and it fails both ways:**

| attempt | result |
|---|---|
| `Instance.new("MeshPart")` then `MeshId = "rbxassetid://578157972"` | `The current thread cannot write to this property` |
| `AssetService:CreateMeshPartAsync("rbxassetid://578157972")` | `Failed to load mesh asset` |
| `Decal.Texture = "rbxassetid://4969855485"` on three different decal ids | placed, rendered **blank white** |

The reason is the same in all three: the library stores **Creator Store container asset ids**
(AssetTypeId 40 and 13), not the underlying mesh and image ids those containers point at.
`CreateMeshPartAsync` wants a mesh id; `Decal.Texture` wants an image id. Neither accepts the
container, and the container is what a Creator Store search returns.

So there is no property-assignment path. **Delivering this library requires a loader.**

## The decision, stated so it can be made

Two options, and they are the owner's, not mine:

1. **Ship `insert_asset`.** Restore the implementation, remove `GetService("InsertService")` from
   FORBIDDEN, keep the no-scripts guard. The library starts working. The cost is that the plugin
   loads remote content again, on a product whose previous asset Roblox removed.
2. **Keep the minimal surface.** The plugin stays clean, the appeal on the old asset is argued from
   the strongest position, and the asset library remains a number on a page that delivers nothing.

There is a third thing worth doing under either: **re-harvest the underlying mesh and image ids**
alongside the container ids. A MeshPart asset's mesh id and a Decal's image id would both be
placeable with no loader at all, and that would move most of 81,648 items inside the existing
invariant. It is a corpus change, not a plugin change, and nobody has to choose between safety and
the feature to do it.

## Not verified

- Whether `InsertService:LoadAsset` would actually succeed on these ids — the implementation was
  reverted before it ever ran against one. The refusal is upstream of that question.
- Whether Roblox's removal of the old asset was about the `require`-over-HTTP pattern at all. That
  remains the strongest candidate and is not a finding.
- The third option's premise: that the Creator Store search results expose the inner mesh/image
  ids. Not checked.
