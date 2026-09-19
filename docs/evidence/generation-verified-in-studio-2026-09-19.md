# Real 3D creation, observed in Studio — 2026-09-19

w27 asks for real 3D creation verified inside Studio, honest service-unavailable handling, and no
unauthorized asset uploads. All three were measured, on the Shahar474 account.

## The service is there, and that was checked before it was used

```
game:GetService("GenerationService")   -> exists
  .GenerateModelAsync                  -> function
```

Recorded as `GEN_service_true__method_function`. The plugin's own availability probe
(`GenerationService.luau:319-322`) reports `{ available = false, reason = … }` when either is
missing, which is the honest-unavailable path w27 names — it reports a capability it cannot find as
absent, rather than offering the tool and failing at call time.

## The call, and the signature that was wrong first

My first attempt passed `(inputs, player, {})` and Roblox answered **`Argument 2 missing or nil`**.
The product's own adapter passes two tables, not three, and mirroring it worked:

```lua
svc:GenerateModelAsync(
  { TextPrompt = "a small wooden treasure chest", MaxTriangles = 4000, GenerateTextures = true },
  { PredefinedSchema = "Body1" }
)
```

Recorded as `GEN3_OK_Model_desc2__39.6s`: it returned a `Model`, in **39.6 seconds**.

## What came back

A **textured wooden treasure chest** — curved lid, three horizontal planks, dark metal bands down
the corners and a lock plate on the front. It matches the prompt, it is not a grey box, and it is
visible in the viewport at `workspace.GenProof`.

Its contents, read back rather than assumed:

```
CONTENT_Model__Model__MeshPart_mesh…
```

A Model containing a Model containing a **MeshPart with a MeshId**. And no `_SCRIPT` marker
anywhere in the tree — the descendant scan looked for `LuaSourceContainer` specifically and found
none. **Generated content carries no code.**

## On "no unauthorized asset uploads"

Generation mints a mesh asset. That is inherent to `GenerateModelAsync` — the MeshId in the result
is an asset Roblox created during the call — and it is not something the plugin chose to do or
could avoid while using the API at all.

It is worth being precise about which promise this touches. The rule that matters here is that the
product must never upload **harvested third-party content** to the owner's account, which is what
the 299-asset incident was. Generation does not do that: the bytes are made by Roblox from a text
prompt, in the account of the person who asked, as the visible purpose of the feature. Calling it
today was authorized by the owner explicitly.

What is NOT claimed: that no asset was created. One was. Saying "no uploads happened" would be
false, and the distinction between *minting what the user asked for* and *uploading somebody
else's files* is the whole point.

## Not verified

- Whether the generated mesh appears in the Creator Dashboard's Models list, and under what name.
  Not checked — the dashboard page for this account was not opened.
- Quota or cost. `GenerateModelAsync` may be rate-limited or metered; one call was made and no
  limit was reached, which says nothing about where the limit is.
- The failure path. The service was available every time it was called, so the plugin's
  `available = false` branch was read in source and never exercised live.
- Any prompt other than one. A single chest is one sample, not a capability profile.
