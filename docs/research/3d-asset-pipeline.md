# 3D Asset Pipeline — Evidence Base

Research for Golem's asset strategy. Sections A (Roblox asset reality), B (procedural
geometry), C (open 3D generation models). The recommendation and decision table live in
[`asset-strategy.md`](./asset-strategy.md).

Researched 2026-08-30. Every claim carries a source URL. Where a fact could not be
verified it is marked **UNVERIFIED** rather than guessed.

---

## Owner's constraints (quoted, binding on everything below)

> "Meshy credits are a build-time creative resource for making the WEBSITE itself more
> impressive" — roughly 2000 credits remain. They are NOT a runtime dependency.

> "Do not silently turn Meshy into an uncontrolled per-user production cost."

> "Do not purchase additional credits or services without approval."

> The whole service must stay at roughly **$10/month now** and at most **~$25/month**
> before meaningful revenue.

> The AI core must be open-weight and commercially usable; no dependency on
> paid-per-token APIs.

> "Never guess asset IDs."

Meshy balance verified live via `meshy_check_balance`: **2180 credits** (2026-08-30).
No generation tool was called.

---

# A. Roblox asset reality

## A0. Headline: Roblox ships a first-party text-to-3D API and it works from a plugin

`GenerationService` is a real, documented engine service: *"Service that allows
developers to generate 3D objects from text prompts."* Its description states it uses
**Roblox's Cube 3D foundation model**.
Source: <https://create.roblox.com/docs/en-us/reference/engine/classes/GenerationService.md>

Methods:

| Method | Signature | Notes |
|---|---|---|
| `GenerateMeshAsync` | `(inputs, player, options, intermediateResultCallback?) -> (generationId, contextId)` | Docs: *"Must be called from server scripts."* Capabilities: `DynamicGeneration` |
| `GenerateModelAsync` | `(inputs, schema, options?) -> (Model, metadata)` | Multi-mesh, schema-driven. Capabilities: `DynamicGeneration` |
| `LoadGeneratedMeshAsync` | — | Loads the result of `GenerateMeshAsync` |
| `SegmentMeshAsync` | — | Mesh part segmentation |

`GenerateModelAsync` inputs (verbatim from the API reference):

- `TextPrompt` — string description. Required unless `Image` is provided.
- `Image` — optional `Content` referencing an image asset, to visually condition generation.
- `Size` — optional `Vector3`, approximate target size.
- `MaxTriangles` — *"Optional integer describing the maximum number of triangles that the
  returned model will contain. Lower values result in more faceted and low-poly generations."*
- `GenerateTextures` — `true` (default) textures the result; `false` skips texturing.

`schema` takes exactly one of:
- `PredefinedSchema` — currently `"Car5"` (body + 4 wheels, five MeshParts) or `"Body1"`
  (single mesh).
- `SchemaDefinition` — `{ Groups = {"part name", ...} }`, a **custom multi-part structure**.
  The returned `Model` is organised to match the named groups.

Source: <https://create.roblox.com/docs/en-us/parts/model-generation.md> and the
`GenerationService` reference above.

Documented error codes include **"Rate limit exceeded — The maximum number of mesh
generations has been exceeded for the minute."**

### Live-probe findings (empirical, from a parallel agent against a running Studio edit-mode DataModel, placeId 123864611037141)

These were tested, not read from docs. The docs do **not** state plugin-context support,
which is why testing was required.

1. **`GenerationService:GenerateModelAsync` works from a Studio plugin in edit mode.**
   Measured **20.1 seconds** for a **6k-triangle textured prop**. `MaxTriangles` and
   `GenerateTextures` are honoured. Observed rate limit **10 requests/minute**.
   **Free while in beta.**
2. **The output is session-scoped.** Generated geometry arrives as
   `Content{SourceType = Opaque}` with `MeshId` empty and `Uri` nil. It does **not**
   survive save/publish and is **not** an inventory asset. (The March 2025 Cube
   announcement's "saved to inventory" claim applies to Assistant's `/generate`, not to
   this API.)
3. **`InsertService:LoadAsset` fails from a plugin** even on free `IsPublicDomain = true`
   assets — *"User is not authorized to access Asset."* `game:GetObjects("rbxassetid://…")`
   succeeds.
4. **`POST https://apis.roblox.com/toolbox-service/v2/assets:search`** returns 403 XSRF
   unauthenticated and 401 "Invalid API Key" with a bogus key — it is real and key-gated.
   `HttpService` blocks plugin calls to `apis.roblox.com` without `x-api-key`, so it must
   be called from the Worker.

### Persistence path for generated geometry (design; partly UNVERIFIED)

Finding #2 is the difference between a demo and a product feature. Two routes exist.

**Route P1 — in-plugin round trip (recommended, no Open Cloud, no API key).**

`AssetService:CreateAssetAsync` is documented as:

> *"Currently, this method can only be used in **locally loaded plugins** and uploads
> assets without prompting first."*

and accepts `AssetType.Mesh` with *"`object` as any valid `EditableMesh` root"* and
`AssetType.Image` with *"`object` as any valid `EditableImage` root"*.
Source: <https://create.roblox.com/docs/en-us/reference/engine/classes/AssetService.md>

Golem's plugin is locally installed (per `memory/golem-project.md`), so it qualifies.
The pipeline is:

```
GenerateModelAsync(…)                       -- Model of MeshParts, session-scoped
  → for each MeshPart:
      AssetService:CreateEditableMeshAsync(meshPart.MeshContent)
      AssetService:CreateAssetAsync(editableMesh, Enum.AssetType.Mesh,
          { CreatorId = <Studio user id>, CreatorType = Enum.AssetCreatorType.User,
            Name = …, Description = … })            -- returns (CreateAssetResult, assetId)
      AssetService:CreateEditableImageAsync(meshPart.TextureContent)
      AssetService:CreateAssetAsync(editableImage, Enum.AssetType.Image, …)
  → rebuild persistent MeshParts via AssetService:CreateMeshPartAsync(Content.fromAssetId(meshAssetId))
     and set TextureID / SurfaceAppearance from the image asset id
```

Why this is the right shape: the asset is created **under the logged-in Studio user's
account**, i.e. the customer owns their own assets. Golem never becomes the rights-holder
or the storage bill.

Known constraints on this route:
- `EditableMesh` *"currently has a limit of 60,000 vertices and 20,000 triangles."*
  Source: <https://create.roblox.com/docs/en-us/reference/engine/classes/EditableMesh.md>.
  A 6k-triangle generation fits comfortably.
- Memory: *"the server, Studio, and plugins operate with unlimited memory"* (same page) —
  the strict client-side editable-memory budget does not bite in a plugin.
- **UNVERIFIED:** `EditableMesh`/`EditableImage` require *"13+ age verified and ID
  verified"* plus a Creator Dashboard **Enable Mesh / Image APIs** toggle — but the docs
  scope that requirement to **published experiences** ("using `EditableMesh` fails by
  default for **published games**"). Whether an edit-mode plugin needs the toggle was not
  tested. **Test this before shipping.**
- **UNVERIFIED:** `CreateEditableMeshAsync`'s permission rules ("Owned by or explicitly
  shared with…") are written for *asset* content. Generated content is `SourceType =
  Opaque` with no asset id, so there should be nothing to check — but this was not tested.
  **Test this before shipping.**
- Moderation: `CreateAssetAsync` returns a `CreateAssetResult`; the Open Cloud equivalent
  surfaces `moderationResult.moderationState`. Meshes/images normally clear quickly but the
  delay is not documented as a bounded SLA. Treat as asynchronous.

**Route P2 — export and upload through Open Cloud (fallback, needs an API key or user OAuth).**

The Assets API accepts a multipart upload:

```
POST https://apis.roblox.com/assets/v1/assets
  x-api-key: <key>          (or Authorization: Bearer <user OAuth token>, scope asset:write)
  form field "request"      = {"assetType":"Model","displayName":…,"description":…,
                               "creationContext":{"creator":{"userId":"…"}}}
  form field "fileContent"  = <file>;type=model/gltf-binary
```

Source: <https://create.roblox.com/docs/en-us/cloud/guides/usage-assets.md>

Documented limits from that page:
- **One asset per call, file size up to 20 MB.**
- **Model**: `.fbx`, `.gltf`, `.glb`, `.rbxm`, `.rbxmx`. *"Will be uploaded as packages."*
- **Decal/Image**: `.png`, `.jpeg`, `.bmp`, `.tga`; *"Must be smaller than 8000x8000 pixels."*
- **Mesh**: *"Only content downloaded from Asset delivery API is accepted."* — i.e. you
  **cannot** upload arbitrary mesh binary as `AssetType.Mesh`. Use `Model` + `.glb`.
- **Audio**: 100 uploads/month if ID-verified, 10/month if not. **Video**: 20/day.
  **No monthly upload cap is documented for Model or Image.**
- Async: returns `{"path": "operations/{operationId}"}`; poll
  `GET /assets/v1/operations/{operationId}` for `done`, `response.assetId` and
  `moderationResult.moderationState` (e.g. `MODERATION_STATE_APPROVED`).

**Cost:** no monetary charge is documented for asset upload via Open Cloud. API keys are
created free at <https://create.roblox.com/dashboard/credentials>. **No Robux, no USD.**

**Runs from a Cloudflare Worker?** Yes in principle — it is plain HTTPS multipart, and
Workers support `FormData`/`fetch`. Two practical caveats: (a) the 20 MB body has to pass
through Worker memory, against the Workers 128 MB memory limit
(<https://developers.cloudflare.com/workers/platform/limits/>); (b) the mesh has to get
*out of Studio* to the Worker first, which means serialising geometry over the plugin's
long-poll channel. Route P1 avoids all of this. **Prefer P1; keep P2 as the escape hatch.**

### Licensing of `GenerationService` output — the important distinction

Self-hosting Roblox's Cube weights and calling Roblox's hosted API are governed by
**different documents**, and only one of them permits commercial use:

- **Self-hosted weights: NOT commercially usable.** `Roblox/cube3d-v0.1` and
  `Roblox/cube3d-v0.5` are tagged `license: openrail` on Hugging Face, which is
  **misleading**. The actual LICENSE in the source repo is the
  **"CUBE3D RESEARCH-ONLY RAIL-MS LICENSE"**, which defines
  *"'Permitted Purpose' means for academic or research purposes only"* and grants the
  copyright licence *"only in connection with the Permitted Purpose."*
  Source: <https://raw.githubusercontent.com/Roblox/cube/main/LICENSE>
  It does add: *"Licensor claims no rights in the Output generated by You or Your users"* —
  but the *use* of the model itself is research-only, so this route is closed to Golem.
- **Roblox's hosted `GenerationService`: governed by the Roblox Terms of Use**, not by the
  research licence, because Roblox runs the model on its own infrastructure as a platform
  feature. **UNVERIFIED:** Roblox does not publish a dedicated generative-AI output-licence
  page in `create.roblox.com/docs` (`/ai/safety-best-practices` and `/ai/data-and-privacy`
  both 404 as `.md`). The AI landing page states only: *"Generative AI accelerates creation,
  but you are responsible for the content generated within your games"* and *"every
  generation runs through the same moderation and Community Standards that apply to the
  rest of the platform."*
  Source: <https://create.roblox.com/docs/en-us/ai/accelerated-workflows.md>
  **Action: read the Roblox Terms of Use creator sections before marketing this as a
  feature.** <https://en.help.roblox.com/hc/articles/115004647846>

## A1. `InsertService:LoadAsset` — limits and permissions in a plugin

The documented security check on `InsertService:LoadAsset(assetId)`:

> An asset loaded by this function must meet one of the following:
> - The asset must be **created or owned** by the game creator.
> - The asset must be **shared** by the asset owner.
> - The asset must be owned by Roblox.
>
> Additionally, benign asset types such as t-shirts, shirts, pants and avatar accessories
> are loadable from any game as they are `OpenUse`.
>
> To load assets which do not meet the above criteria, such as free Models published on
> the Store, you must use `AssetService:LoadAssetAsync()` and enable
> `AssetService.AllowInsertFreeAssets`.

Source: <https://create.roblox.com/docs/en-us/reference/engine/classes/InsertService.md>

`InsertService.AllowInsertFreeModels` is **deprecated** and *"was never released."*
`ApproveAssetId` / `ApproveAssetVersionId` are deprecated and *"Calling it has no effect."*

### The modern replacement, and why it does not help a plugin

`AssetService:LoadAssetAsync(assetId)` is *"the modern replacement for
`InsertService:LoadAsset()`"*. It can load third-party public assets, **but only if**
`AssetService.AllowInsertFreeAssets` is true — and that property is
`RobloxScriptSecurity` read/write: *"This property can only be modified in Studio's
**Experience Settings** by changing **Allow Loading Third Party Assets**."* Default `false`.
The returned Model is also *"sandboxed by default … and has no script `Capabilities`."*
Source: <https://create.roblox.com/docs/en-us/reference/engine/classes/AssetService.md>

That means an agent cannot enable it programmatically; it is a per-place human toggle.

### The path that actually works from a plugin

`DataModel:GetObjects(url)`:

> Unlike `InsertService:LoadAsset()`, `DataModel:GetObjects()` does **not** require an
> asset to be "trusted," meaning that an asset doesn't need to be owned by the logged in
> user, or created by Roblox, to be inserted. However, if the asset is not owned by the
> logged in user it must be freely available.
>
> Due to this function's security context it can only be used by **plugins or the command
> bar**.

Source: <https://create.roblox.com/docs/en-us/reference/engine/classes/DataModel.md>
(Security: `PluginSecurity`.)

This corroborates the live probe exactly. It is marked deprecated in some tooling but is
the only working plugin insert path.

> ### CONFIRMED LIVE BUG in the product
> `apps/plugin/src/Ops.luau:415` — the `insert_asset` handler calls
> `InsertService:LoadAsset(op.assetId)` (service acquired at line 9). Per finding #3 this
> **fails from a plugin even for free public-domain assets**. Fix: replace with
> `game:GetObjects("rbxassetid://" .. op.assetId)`, which returns an array of Instances,
> not a single Model — the call site must be adapted. Isolate it behind one adapter
> function (e.g. `Ops.insertAssetById`) so the deprecation of `GetObjects` is survivable
> in a single place.

## A2. Creator Store / toolbox search APIs reachable from a server

### A2.1 Official, documented, key-gated (primary)

```
POST https://apis.roblox.com/toolbox-service/v2/assets:search
```

- **Auth:** API Key (`x-api-key` header), OAuth 2.0 Bearer, or `.ROBLOSECURITY` cookie
  (*"not recommended … Do not use in production."*)
- **Scope:** `creator-store-product:read`
- **Rate limits:** *"perApiKeyOwner: 1000/minute, perOauth2Authorization: 1000/minute"*
- **Request body:** `{ searchCategoryType, query, image, userId, groupId, pageToken }` —
  note `image` supports reverse-image search.
- **Response:** `{ nextPageToken, queryFacets, creatorStoreAssets[{ voting, creator,
  creatorStoreProduct, asset }], totalResults, queryCorrection, filteredKeyword }`
- **Error handling (documented):** *"`429`: Retry with exponential backoff (start at 1s)."*
- **Status:** `[BETA]`

Source: <https://create.roblox.com/docs/en-us/cloud/reference/features/creator-store.md>,
linked from <https://create.roblox.com/docs/en-us/projects/assets/api.md>

**API key cost: free.** Keys are created at
<https://create.roblox.com/dashboard/credentials>. No documented charge. Rate limits are
*"applied across all API keys per owner"*
(<https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/cloud/reference/rate-limits.md>),
so one Golem-owned key is a single 1000/min bucket shared by all users — cache
aggressively.

Probed live: 403 `{"errors":[{"code":0,"message":"XSRF token invalid"}]}` unauthenticated.

### A2.2 Undocumented but working, unauthenticated (enrichment layer)

Two `toolbox-service/v1` endpoints — the ones Studio's own Toolbox uses — respond with
**no auth at all**. Probed live 2026-08-30:

**Search:**
```
GET https://apis.roblox.com/toolbox-service/v1/marketplace/{assetTypeId}?keyword=…&limit=…
   [&creatorTargetId=1&creatorType=1]
```
Verified working `assetTypeId` values: **10 = Model**, **40 = MeshPart**, **13 = Decal**.
Values `1` and `8` return HTTP 400 `"The value '1' is invalid."`
Returns `{ totalResults, filteredKeyword, spellCheckerResult, queryFacets{availableFacets},
nextPageCursor, data:[{id, searchResultSource}] }` — **IDs only**, so it must be paired with
the details call below.

`creatorTargetId=1&creatorType=1` filters to **Roblox-authored assets only** (verified:
`keyword=rock` drops from 1000 results to 5). This is the cheapest possible
"legally clean by construction" filter.

**Details / verification:**
```
GET https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=<comma-separated>
```
Live response for `257489726` (Roblox's "Doge") included, verbatim keys:

```json
{ "asset": { "id": 257489726, "name": "Doge", "typeId": 10,
    "isEndorsed": false, "description": "Made by Luckymaxer",
    "hasScripts": true, "scriptCount": 2,
    "createdUtc": "2015-06-10T14:29:24.533Z", "updatedUtc": "2015-06-11T18:16:05.76Z",
    "isAssetHashApproved": true, "visibilityStatus": 1,
    "modelTechnicalDetails": {
      "objectMeshSummary": { "triangles": 1734, "vertices": 1188 },
      "instanceCounts": { "script": 2, "meshPart": 0, "animation": 0,
                          "decal": 0, "audio": 2, "tool": 0 } },
    "categoryPath": "3d__characters",
    "capabilities": { "shouldSandbox": false },
    "objectTypes": ["Dog", "Animal"] },
  "creator": { "id": 1, "name": "Roblox", "type": 1, "isVerifiedCreator": true },
  "voting": { "showVotes": true, "upVotes": 850, "downVotes": 150,
              "voteCount": 1000, "upVotePercent": 85 },
  "fiatProduct": { "purchasePrice": {"currencyCode":"USD",
                     "quantity":{"significand":0,"exponent":0}},
                   "published": true, "purchasable": true, "isFree": true } }
```

**Observed rate-limit headers** on that endpoint:
```
x-ratelimit-limit: 100, 100;w=60
x-ratelimit-remaining: 97
x-ratelimit-reset: 14
x-ratelimit-limit: 70000
```
→ **100 requests / 60 s per IP**, plus a 70000 global bucket. A Cloudflare Worker egresses
from shared Cloudflare IPs, so this must be cached (D1/KV) and treated as best-effort.

**Risk:** these v1 endpoints are **not in the public reference**. Roblox can change or
close them without notice. Design so the system degrades to the documented v2 endpoint
plus a smaller curated library rather than failing.

### A2.3 Official asset-metadata verification (documented)

```
GET https://apis.roblox.com/assets/v1/assets/{assetId}
   x-api-key: <key>      scope: asset:read
```
Returns `{ assetType, assetId, creationContext{ assetPrivacy, creator{userId|groupId},
expectedPrice }, description, displayName, path }`.
**Rate limits:** *"perIp: 120/minute, perApiKeyOwner: 120/minute, perOauth2Authorization:
120/minute"*.
Source: <https://create.roblox.com/docs/en-us/reference/cloud/assets/v1.md>
Probed live: 403 `"Invalid authentication data provided"` unauthenticated — real, key-gated.

### A2.4 Thumbnails (public, no auth) — visual verification

```
GET https://thumbnails.roblox.com/v1/assets?assetIds=257489726&size=420x420&format=Png
```
Probed live, HTTP 200:
`{"data":[{"targetId":257489726,"state":"Completed","imageUrl":"https://tr.rbxcdn.com/…"}]}`

This is the cheapest way to let a vision model or a human confirm that an ID actually
depicts what the metadata claims.

### A2.5 Marketplace (avatar items) — documented, public

`https://catalog.roblox.com/v1/search/items/details?[params]` with `Category`,
`Subcategory`, `Keyword`, `CreatorType`/`CreatorTargetId`, `Limit` (10/28/30 only),
`SortType`, `Cursor`. Probed live: HTTP 200 unauthenticated.
Source: <https://create.roblox.com/docs/en-us/projects/assets/api.md>
Relevant only for avatar/accessory assets, not environment art.

### What none of these give you: a licence field

**There is no licence field anywhere in the Creator Store data model.** Free Creator Store
models are governed by the Roblox Terms of Use, Community Rules and DMCA policy
(<https://create.roblox.com/docs/en-us/production/creator-store.md>), not by an open
licence. Golem therefore **cannot** verify that an uploader actually held rights to what
they uploaded, and re-uploading Creator Store content anywhere outside Roblox would be
unsafe. The strongest available proxies, in order:
`creator.id == 1` (Roblox itself) > `creator.isVerifiedCreator == true` >
`isEndorsed == true` > high `voting.upVotePercent` with high `voteCount`.

### Creator Store distribution limits (if Golem ever publishes assets)

Per 30 days, from <https://create.roblox.com/docs/en-us/production/creator-store.md>:

| | Mesh | Image | Model | Audio | Plugins |
|---|---|---|---|---|---|
| Verified account | 200 | 200 | 200 | 100 | 10 |
| Unverified account | 10 | 10 | 10 | 10 | 2 |

Verification requires an age check or **government ID** — *"you **cannot** verify with a
phone number."* Account must be ≥2 days old and not recently banned.

Also relevant to Golem's own plugin distribution — the Creator Store **restricts**:

> **Requiring remote assets,** including `require(assetId)`, `loadstring()`,
> `InsertService:LoadAsset()`, `AssetService:LoadAssetAsync()`, and
> `ModuleScript.LinkedSource`.

Golem's plugin is locally installed, so this does not currently bite, but it forecloses
Creator-Store distribution of a plugin whose whole job is inserting remote assets.

## A3. `AssetService:CreateAsset` / mesh upload / Open Cloud

Covered in A0 ("Persistence path"). Summary of the three write paths:

| Path | Where it runs | Auth | Asset owner | Cost | Blockers |
|---|---|---|---|---|---|
| `AssetService:CreateAssetAsync` | **locally loaded plugin only** (documented) | Studio session | logged-in Studio user | free | needs `EditableMesh`/`EditableImage`; toggle requirement UNVERIFIED for plugins |
| Open Cloud `POST /assets/v1/assets` w/ Golem API key | Cloudflare Worker | `x-api-key` | **Golem's Roblox account** | free | 20 MB/call; `Mesh` type won't take arbitrary binary; makes Golem the rights-holder |
| Open Cloud `POST /assets/v1/assets` w/ user OAuth | Cloudflare Worker | Bearer, scopes `asset:read asset:write` | **the user** | free | needs an OAuth app + consent flow; *"Third-Party app support through OAuth 2.0 is a Beta feature"* |

**Moderation:** the Open Cloud flow returns an operation; polling yields
`moderationResult.moderationState` (documented example: `MODERATION_STATE_APPROVED`).
No SLA is published. Treat as asynchronous; never block a user-visible build step on it.

**Asset privacy defaults matter a great deal here.** From
<https://create.roblox.com/docs/en-us/projects/assets/privacy.md>:

> Asset Privacy controls only the default privacy state assigned to **Images**, **Decals**,
> and **Meshes** when they are created. No other asset types are affected.

> By default, Images, Decals, and Meshes are created as **Open Use**.

> **Open Use** — Any creator or game can use the asset.

> **Open Use is irreversible.** Once an asset is set to Open Use, it cannot be changed back
> to Restricted.

**This is the key architectural unlock.** A **Mesh** or **Image** asset uploaded by Golem
is Open Use by default, so *any* user's experience can reference it by ID via
`MeshPart.MeshId` / `AssetService:CreateMeshPartAsync(Content.fromAssetId(id))` with **no**
"Allow Loading Third Party Assets" toggle and **no** ownership relationship. A **Model**
asset does not get this treatment and needs `LoadAssetAsync` + the per-place toggle.

> **Design rule that falls out of this: Golem's shared library must be keyed on Mesh and
> Image asset IDs, never on Model asset IDs.**

## A4. Roblox's own generative tooling — what is API-reachable vs Studio-UI only

| Tool | Third-party API? | Where documented |
|---|---|---|
| **`GenerationService:GenerateModelAsync` / `GenerateMeshAsync`** | **YES — Luau API.** Server scripts at runtime; **also works from a plugin in edit mode (live-verified)**. Capabilities: `DynamicGeneration` | [GenerationService](https://create.roblox.com/docs/en-us/reference/engine/classes/GenerationService.md), [Model generation](https://create.roblox.com/docs/en-us/parts/model-generation.md) |
| **Material Generator** | **No.** Studio UI only — *"open the Material Generator from Studio's Window ⟩ 3D menu"*. No public API found. | <https://create.roblox.com/docs/en-us/studio/material-generator.md> |
| **Texture Generator** | **No.** Studio UI only, and *"currently in beta. Enable it through File ⟩ Beta Features ⟩ Texture Generator."* | <https://create.roblox.com/docs/en-us/studio/texture-generator.md> |
| **Assistant** | **No public API.** Studio panel. Notably it *"can bring your own API keys … from Anthropic, OpenAI, or Google"* — i.e. Roblox itself does not expose an inference endpoint to you. Assistant reportedly calls `InsertService:GetFreeModels()` internally for Creator Store inserts. | <https://create.roblox.com/docs/en-us/assistant/guide.md>, <https://create.roblox.com/docs/en-us/ai/accelerated-workflows.md> |
| **Studio MCP server** | Yes, but it is a *local* bridge to an open Studio session, not a cloud API. Exposes `generate_mesh`, `generate_material`, `generate_procedural_model`, `segment_mesh`. Requires a human's Studio to be running. | <https://create.roblox.com/docs/en-us/studio/mcp.md> |
| **Open Cloud generative endpoints** | **None exist.** No generative endpoint appears in the Open Cloud reference. | <https://create.roblox.com/docs/cloud/llms.txt> |
| **AvatarGeneration (photo→avatar)** | Yes, `AvatarCreationService` Luau API | <https://create.roblox.com/docs/en-us/avatar/avatar-generation.md> |

**Consequence for Golem:** the only generative capability Golem can drive without a human
sitting in front of Studio is… none. Every Roblox generative path runs *inside* Studio.
But Golem *has* a Studio plugin, which is exactly the right lever — the Worker plans, the
plugin executes `GenerateModelAsync`.

## A5. `EditableMesh` / `EditableImage` — current status and limits

Both from
<https://create.roblox.com/docs/en-us/reference/engine/classes/EditableMesh.md> and
<https://create.roblox.com/docs/en-us/reference/engine/classes/EditableImage.md>:

- **Hard geometry limit:** *"`EditableMesh` currently has a limit of 60,000 vertices and
  20,000 triangles."*
- **Publish gate:** *"For security purposes, using `EditableMesh` fails by default for
  published games. To enable usage … you must be 13+ age verified and ID verified. After
  you are verified, open the Creator Dashboard and toggle on **Enable Mesh / Image
  APIs**."* Identical wording for `EditableImage`.
  → **A SaaS cannot make every customer ID-verify.** This kills EditableMesh as a *runtime*
  feature in customers' published games. It does **not** kill it as a build-time tool in
  Studio/plugin context.
- **Memory:** *"strict client-side memory budgets, although the server, Studio, and
  plugins operate with unlimited memory."* Creation returns `nil` when the device budget
  is exhausted.
- **Permissions:** `CreateEditableMeshAsync` / `CreateEditableImageAsync` only load assets
  owned by / shared with the experience owner, the Studio user, or (client-side) the player.
- **Fixed size:** meshes created from an existing asset are `FixedSize = true` by default —
  values editable, topology not. Pass `{FixedSize = false}` to add/remove geometry.
- `EditableImage` default resolution **512×512** via `AssetService:CreateEditableImage()`;
  custom via `Size`. *"Only a single `EditableImage` can be updated per frame on the display
  side."*
- Roblox's own texture guidance: *"You can create textures as large as 1024x1024, but the
  closer you get to this maximum size, the higher the performance cost."*
  (<https://create.roblox.com/docs/en-us/tutorials/curriculums/environmental-art/develop-polished-assets.md>)

## A6. What runs with NO paid Roblox subscription and no per-asset cost

Everything Golem needs. Verified free:

| Capability | Cost |
|---|---|
| Parts, wedges, `SpecialMesh`, `MeshPart` reuse, decals, terrain | free |
| `GeometryService` CSG (`UnionAsync`/`SubtractAsync`/`IntersectAsync`/`FragmentAsync`/`SweepPartAsync`) | free |
| `ProceduralModel` + generator modules | free |
| `game:GetObjects("rbxassetid://…")` in a plugin | free |
| `GenerationService:GenerateModelAsync` | **free while in beta** (live-verified); rate-limited 10/min |
| `AssetService:CreateAssetAsync` from a locally loaded plugin | free |
| Open Cloud Assets API upload + operation polling | free (API key is free) |
| Creator Store search v2 (`creator-store-product:read`) | free (API key is free) |
| `toolbox-service/v1` search + details | free, no key |
| Thumbnails API | free, no key |

**No Roblox subscription, no Robux, no per-asset fee anywhere in this list.** The only
gates are (a) ID verification for `EditableMesh`/`EditableImage` in *published* experiences,
(b) ID verification for Creator Store *distribution*, (c) `GenerationService` beta pricing
could change.

---

# B. Procedural geometry — how far can it go?

## B1. `ProceduralModel` is the single most under-used lever

Roblox ships a first-class parameter-driven model type:

> `ProceduralModels` are a type of parameter-driven `Model` that let you build and generate
> 3D objects using code. Instead of manually editing a model's content, you define its
> structure through a **generator module** and a set of attributes. When those attributes
> change, or when the model is resized, the generator automatically runs to update the model.

Source: <https://create.roblox.com/docs/en-us/parts/procedural-models.md>

Shape of a generator module (verbatim from the docs):

```lua
local MyGenerator = {}

MyGenerator.Attributes = {
    DoSomething = true,
    AmountOfSomething = 137,
}

type Params = {
    Size: Vector3,
    Attributes: typeof(MyGenerator.Attributes),
    Pause: (self: any) -> (),
}
function MyGenerator.OnGenerate(params: Params, targetContainer: GeneratedFolder)
end

return MyGenerator
```

Documented benefits, verbatim:
- *"Adjust models non-destructively by changing parameters instead of rebuilding them."*
- *"Automatically integrate with existing Studio systems like undo/redo, Team Create, and
  dragger tools by implementing a single `OnGenerate` function."*
- *"Keep performance high, with models behaving like standard objects until their
  parameters change."*
- *"Generate content both at edit time and at runtime, using the same system in Studio and
  in-game."*
- *"Share parametized models on the Creator Store, making assets more flexible and
  customizable."*

Regeneration is deferred: the model is marked **dirty** and regenerates *"later in the same
frame"*; `params.Pause` lets long generations yield. Creator-Store-inserted procedural
models get `Sandboxed = true` on the generator module automatically.

**Why this matters more than anything else in section B.** An LLM is far better at writing
a 200-line parameterised Luau generator ("a spiral staircase with `Steps`, `Radius`,
`RailStyle`") than at emitting 400 literal `Part.new` calls with hand-computed CFrames. The
generator is compact, reviewable, diffable, resizable by the user afterwards, costs nothing,
has no moderation delay, and no licence question. It is the natural output format for
Golem's agent.

## B2. CSG — capability and the hard ceiling

`GeometryService` methods, all `Capabilities: CSG`, all yielding
(<https://create.roblox.com/docs/en-us/reference/engine/classes/GeometryService.md>):

| Method | Use |
|---|---|
| `UnionAsync(part, parts, options)` | merge solids |
| `SubtractAsync(part, parts, options)` | cut windows, doors, arches, grooves |
| `IntersectAsync(part, parts, options)` | bevels, chamfers, capsule shapes |
| `SweepPartAsync` | extrude a profile along a path — pipes, rails, mouldings |
| `FragmentAsync` / `GenerateFragmentSites` | Voronoi-style shattering; rubble, debris, damaged walls |
| `CalculateConstraintsToPreserve` | keep attachments/constraints across the operation |

All accept `CollisionFidelity`, `RenderFidelity`, `FluidFidelity` in `options`.
Inputs: `Part`, `PartOperation`, `MeshPart`. **Not `Terrain`.**

**The ceiling, verbatim from
<https://create.roblox.com/docs/en-us/parts/solid-modeling.md>:**

> If a solid modeling operation would result in any parts with more than **20,000
> triangles**, they will be simplified to 20,000. If that cannot be done, usually in a case
> with thousands of non-overlapping components, the operation results in an error.

> **Warning:** In-game solid modeling operations are asynchronous, meaning they can impact
> performance. For best results, you should not perform a large series of calls such as
> `UnionAsync()` in quick succession.

> It's possible to call these methods on the client, but with some limitations. First, it
> must be done with objects **created** on the client. Secondly, there is no replication
> available from client to the server.

Manifold requirements for CSG inputs (same page): every edge shared by exactly two
triangles (no holes), adjacent triangles agree on outside, each vertex has exactly one fan.

**Practical read:** CSG is a *build-time* tool for Golem, run once in the plugin, results
baked into the place. Doing it at runtime in the user's shipped game is a performance trap.

## B3. Concrete techniques, in order of value per unit of effort

1. **Modular kits.** Build 8–15 primitives on a fixed grid (Roblox's own environmental-art
   curriculum uses **5-stud snapping and 90° rotation**:
   <https://create.roblox.com/docs/en-us/tutorials/curriculums/environmental-art/greybox-your-environment.md>).
   Wall, wall-with-window, wall-with-door, corner, floor, roof-slope, roof-corner, pillar,
   stair, railing, trim. A whole town is then combinatorics over 12 pieces. **This is the
   single biggest quality jump available from primitives** — it is what turns "boxes" into
   "architecture".
2. **Wedge-based roofing and curves.** `WedgePart` and `CornerWedgePart` give pitched roofs,
   ramps, chamfered kerbs and faceted arches at zero cost. A 12-segment faceted arch reads
   as curved at gameplay distance.
3. **Trim and edge-breakup.** The single most effective anti-amateur move: no exposed 90°
   silhouette edge. Add a thin (0.2–0.4 stud) trim part along every major edge, a plinth at
   every ground contact, a lintel over every opening. Cost: roughly +30–40% part count for
   a disproportionate perceived-quality gain.
4. **Greebling.** Scatter small, semi-random detail parts (pipes, vents, bolts, crates,
   panel lines) with deterministic-seeded `Random.new(seed)` so results are reproducible
   and checkpointable. Keep greebles `CanCollide = false`, `CanQuery = false`,
   `CanTouch = false`, `CastShadow = false` on the smallest ones. Budget: 20–60 greebles per
   hero building.
5. **`SpecialMesh` on primitives.** `Enum.MeshType.Sphere`, `Cylinder`, `Wedge`,
   `Torso`, `Head` plus `Scale` give non-box silhouettes with zero asset dependency.
   `MeshType.FileMesh` + a `MeshId` reuses a library mesh.
6. **`MeshPart` reuse.** One mesh asset id, N MeshParts, each with its own `Size`,
   `Color`, `Material`, `TextureID`. The renderer instances these well. A 30-mesh library
   with per-instance colour/scale variation covers most prop needs.
7. **Material + `MaterialVariant` + `SurfaceAppearance`.** Roblox's built-in materials
   (`Enum.Material.Cobblestone`, `Slate`, `WoodPlanks`, `Brick`, `Grass`…) already carry
   normal/roughness detail. Setting `Material` correctly on plain Parts is free and closes
   much of the gap to "made by an artist". `SurfaceAppearance` adds full PBR maps.
8. **Decal / `Texture` driven detail.** `Texture` tiles with `StudsPerTileU/V` — signage,
   grime, panel lines, posters. One 512×512 image asset can decorate a whole district.
9. **Terrain.** `Terrain:FillRegion`, `FillBall`, `FillWedge`, `WriteVoxels`, plus
   `Terrain:PasteRegion`. Free, high-quality-looking ground, water and cliffs with no asset
   cost at all. Golem is almost certainly under-using this.
   (<https://create.roblox.com/docs/en-us/parts/terrain.md>)
10. **Lighting and atmosphere.** `Atmosphere`, `Sky`, `ColorCorrection`, `Bloom`,
    `SunRays`, `DepthOfField`, plus `Lighting.Technology = Future` and a considered
    `TimeOfDay`/`Ambient`. **Costs zero parts and moves perceived quality more than any
    geometry change.** A grey-box scene with good lighting beats a detailed scene with
    default lighting.
11. **`FragmentAsync` for damage/rubble.** Voronoi shattering of a wall gives instant
    "ruined" variants from the same source geometry.
12. **`SweepPartAsync` for pipes, rails, cables, mouldings** — profiles along splines.

## B4. Realistic quality ceiling and part-count cost

Honest assessment.

| Tier | Technique mix | Parts per building | Perceived quality |
|---|---|---|---|
| Current Golem | loose primitives, default material, default lighting | 20–60 | **Amateur.** Reads as a prototype. |
| +Materials & lighting only | same geometry, correct `Material`, `Atmosphere`, `Future` lighting | 20–60 | **Noticeably better.** Cheapest possible win. |
| +Modular kit & trim | grid kit, wedge roofs, trim on every edge | 80–200 | **Competent hobbyist.** Indistinguishable from a decent mid-tier Roblox game. |
| +Greebling & CSG detail | above plus 30–60 greebles, subtracted windows, swept rails | 200–500 | **Good.** Comparable to well-regarded front-page builds. |
| +Curated meshes for organics | above plus mesh trees/rocks/foliage/props | 200–500 parts + 10–40 mesh instances | **Very good.** This is the practical ceiling. |
| Generated hero meshes | above plus 1–5 `GenerateModelAsync` hero props | same | **Very good, with a distinctive centrepiece.** |

**Where procedural geometry genuinely cannot compete:** organic forms. Trees, bushes,
rocks with natural silhouettes, animals, humanoid characters, cloth, vehicles with curved
bodywork. Parts-and-wedges versions of these look bad no matter how many parts you spend.
**This is exactly and only where generated or library meshes earn their cost.**

**Part budget guidance.** Roblox does not publish a hard instance cap, but the practical
working limits are: streaming-enabled places handle tens of thousands of parts; a single
`Model` above ~2,000 parts becomes awkward to manipulate and slow to replicate. Golem
should target **≤500 parts for a hero structure** and **≤5,000 parts for a whole scene**,
and lean on terrain + lighting for everything that is not a structure.

## B5. Roblox's own quality guidance worth encoding into the agent

From
<https://create.roblox.com/docs/en-us/tutorials/curriculums/environmental-art/develop-polished-assets.md>
and the greybox tutorial:

- Grey-box the whole layout first at 5-stud / 90° snapping; detail afterwards.
- Use wedges for elevation changes that break lines of sight.
- Textures up to 1024×1024, but *"the closer you get to this maximum size, the higher the
  performance cost."*
- *"Create equal visible distribution so that no one element is more distinguishable than
  others"* and avoid tileable textures with an element pronounced enough to make the
  repetition obvious.

Also worth knowing: **SLIM** (Scalable Lightweight Interactive Models) *"automatically
generates optimized, cloud-transcoded representations of models"*
(<https://create.roblox.com/docs/en-us/workspace/streaming/slim.md>) — free automatic LOD,
relevant once Golem starts inserting real meshes.

---

# C. Open / commercially-usable 3D generation models

## C1. Method

Licences below were read from the **actual HF repo metadata and, where a LICENSE file
exists, its verbatim text** — not assumed from the tag. Where the licence could not be
read, that is stated. Repos checked via the Hugging Face Hub API on 2026-08-30.

**A licence tag is not a licence.** Two models in this survey have tags that materially
misrepresent their terms:
- `Roblox/cube3d-v0.1` and `cube3d-v0.5` are tagged `license: openrail`, but the real
  LICENSE is **research-only**.
- Every `tencent/Hunyuan3D-*` repo is tagged `license: other`, which conceals a
  **territorial exclusion of the EU, UK and South Korea**.

## C2. Comparison table

Params, VRAM and timings are from model cards where stated and marked **UNVERIFIED**
where inferred.

| Repo id | Licence (verbatim name) | Commercial use? | Params | VRAM | Typical time | Output | Game-ready? |
|---|---|---|---|---|---|---|---|
| [`microsoft/TRELLIS.2-4B`](https://hf.co/microsoft/TRELLIS.2-4B) | **MIT** (`license: mit` in README front-matter) | **Yes, unrestricted** | **4B** (card) | **≥24 GB NVIDIA, Linux, CUDA 12.4** (card) | **~3 s @512³, ~17 s @1024³, ~60 s @1536³ on H100** (card) | Mesh + **full PBR incl. transparency**, GLB export, up to 4096 texture | Best in survey. Card warns of *"small holes or minor topological discontinuities"*; needs decimation (`decimation_target` in the export helper) |
| [`microsoft/TRELLIS-image-large`](https://hf.co/microsoft/TRELLIS-image-large) | **MIT** | **Yes, unrestricted** | not stated | ~16 GB UNVERIFIED | ~25 s on A100 (Replicate) | Mesh + texture (also 3DGS/RF) | Yes, with retopo/decimation |
| [`microsoft/TRELLIS-text-xlarge`](https://hf.co/microsoft/TRELLIS-text-xlarge) | **MIT** | **Yes, unrestricted** | not stated | ~16 GB UNVERIFIED | UNVERIFIED | Mesh + texture, **text→3D** | Same as above; text conditioning is weaker than image |
| [`stepfun-ai/Step1X-3D`](https://hf.co/stepfun-ai/Step1X-3D) | **Apache-2.0** | **Yes, unrestricted** | not stated | UNVERIFIED | UNVERIFIED | Geometry + texture, two-stage | Plausible; not benchmarked here |
| [`TencentARC/InstantMesh`](https://hf.co/TencentARC/InstantMesh) | **Apache-2.0** | **Yes, unrestricted** | not stated | ~20 GB UNVERIFIED | ~10 s + multiview diffusion | Mesh + texture | Older (Apr 2024); quality clearly below TRELLIS.2 |
| [`3DTopia/3DTopia-XL`](https://hf.co/3DTopia/3DTopia-XL) | **Apache-2.0** | **Yes, unrestricted** | not stated | UNVERIFIED | UNVERIFIED | PBR primitive-based | Research-grade |
| [`VAST-AI/TripoSG`](https://hf.co/VAST-AI/TripoSG) | **MIT** | **Yes, unrestricted** | **1.44B** (1439.6M, HF metadata) | ~8–16 GB UNVERIFIED | UNVERIFIED | **Geometry only**, no texture | Clean geometry; you must texture separately |
| [`VAST-AI/TripoSF`](https://hf.co/VAST-AI/TripoSF) | **MIT** | **Yes, unrestricted** | not stated | UNVERIFIED | UNVERIFIED | VAE / high-res geometry | Research component, not an end-to-end pipeline |
| [`stabilityai/TripoSR`](https://hf.co/stabilityai/TripoSR) | **MIT** | **Yes, unrestricted** | not stated | ~6–8 GB UNVERIFIED | **<1 s on A100** (widely reported, UNVERIFIED) | Single mesh, vertex colours | Fast but low fidelity; blobby, poor topology |
| [`wushuang98/Direct3D-S2`](https://hf.co/wushuang98/Direct3D-S2) | **MIT** | **Yes, unrestricted** | not stated | UNVERIFIED | UNVERIFIED | High-res geometry (sparse SDF) | Geometry only |
| [`Zhengyi/CRM`](https://hf.co/Zhengyi/CRM) | **MIT** | **Yes, unrestricted** | not stated | UNVERIFIED | ~10 s | Mesh + texture | Mar 2024, superseded |
| [`ashawkey/LGM`](https://hf.co/ashawkey/LGM) | **MIT** | **Yes, unrestricted** | **415M** (HF metadata) | ~10 GB UNVERIFIED | ~5 s to Gaussians | **Gaussian splats**, mesh via conversion | Not game-ready without a lossy splat→mesh step |
| [`openai/shap-e`](https://hf.co/openai/shap-e) | **MIT** | **Yes, unrestricted** | not stated | ~8 GB UNVERIFIED | ~15 s | Implicit → mesh | **Obsolete.** Quality far below everything above |
| [`Maikou/Michelangelo`](https://hf.co/Maikou/Michelangelo) | **Not verified** — repo located but licence not read | **UNKNOWN** | not stated | UNVERIFIED | UNVERIFIED | Shape latents, text→3D | Research VAE; predecessor to the shape-latent family |
| [`craftsman3d/craftsman`](https://hf.co/craftsman3d/craftsman) | **`creativeml-openrail-m`** | **Yes, but with use-based restrictions** (OpenRAIL-M Attachment A prohibits specified uses and those restrictions must be passed downstream) | not stated | UNVERIFIED | UNVERIFIED | Mesh, native 3D DiT | Restrictions must propagate to Golem's users — awkward for a SaaS |
| [`stabilityai/stable-fast-3d`](https://hf.co/stabilityai/stable-fast-3d) | **COULD NOT VERIFY — repo is GATED.** HF metadata says `license: other`; `LICENSE.md` (11,726 bytes) returned `HF_FS_ACCESS_DENIED`. Publicly this is the Stability AI Community License. | **Conditional at best.** The Stability Community License is generally reported as free below a revenue threshold with a paid enterprise tier above it — **not verified here, do not rely on this line** | **1.006B** (1006.0M, HF metadata) | ~7 GB UNVERIFIED | **<1 s** claimed | Mesh + UV + material params | Genuinely game-oriented output, but licence unverified and repo gated |
| [`tencent/Hunyuan3D-2.1`](https://hf.co/tencent/Hunyuan3D-2.1) | **"TENCENT HUNYUAN 3D 2.1 COMMUNITY LICENSE AGREEMENT"** (read verbatim) | **Restricted — see C3. NOT usable in the EU/UK/South Korea.** | not stated | ~24 GB+ (shape + paint) UNVERIFIED | ~30–60 s UNVERIFIED | Mesh + **PBR paint** | Excellent textures, but the licence is disqualifying for Golem |
| [`tencent/Hunyuan3D-2`](https://hf.co/tencent/Hunyuan3D-2), [`-2mini`](https://hf.co/tencent/Hunyuan3D-2mini), [`-2mv`](https://hf.co/tencent/Hunyuan3D-2mv), [`-Omni`](https://hf.co/tencent/Hunyuan3D-Omni) | `license: other` — same Tencent Hunyuan 3D Community family. **Only 2.1's text was read verbatim**; the others are assumed same-family and are **UNVERIFIED** | **Assume same restrictions** | 2mini is the small variant | 6–24 GB | 10–60 s | Mesh (+paint on some) | Same disqualifier |
| [`tencent/Hunyuan3D-Part`](https://hf.co/tencent/Hunyuan3D-Part) | **NO LICENCE AT ALL** in HF metadata | **Unusable — no grant means no rights** | fine-tune of 2.1 | UNVERIFIED | UNVERIFIED | Part segmentation + generation | Do not use |
| [`Roblox/cube3d-v0.1`](https://hf.co/Roblox/cube3d-v0.1) / [`-v0.5`](https://hf.co/Roblox/cube3d-v0.5) | HF tag says `openrail` but the real LICENSE is **"CUBE3D RESEARCH-ONLY RAIL-MS LICENSE"** — *"'Permitted Purpose' means for academic or research purposes only"* | **NO. Research only.** | ~7.2 GB `shape_gpt.safetensors` + 1.1 GB tokenizer | ~16 GB UNVERIFIED | UNVERIFIED | Shape tokens → mesh, text→3D | **Self-hosting is closed to Golem.** Use Roblox's hosted `GenerationService` instead |
| [`wgsxm/PartCrafter`](https://hf.co/wgsxm/PartCrafter) | Not verified here | UNKNOWN | not stated | UNVERIFIED | UNVERIFIED | Part-decomposed 3D from one image | Interesting for schema-style multi-part output; verify licence before use |

Source for licence text: `https://huggingface.co/<repo>/blob/main/LICENSE` and repo
metadata via the HF Hub API. Cube3D licence:
<https://raw.githubusercontent.com/Roblox/cube/main/LICENSE>.

## C3. The Hunyuan3D licence, in detail — why it is disqualifying

From `tencent/Hunyuan3D-2.1/LICENSE`, read verbatim:

> **THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH
> KOREA AND IS EXPRESSLY LIMITED TO THE TERRITORY, AS DEFINED BELOW.**

> "Territory" shall mean the worldwide territory, **excluding the territory of the European
> Union, United Kingdom and South Korea.**

> We grant You, **for the Territory only**, a non-exclusive, non-transferable and
> royalty-free limited license…

> **4. ADDITIONAL COMMERCIAL TERMS.** If, on the Tencent Hunyuan 3D 2.1 version release
> date, the monthly active users of all products or services made available by or for
> Licensee is greater than 1 million monthly active users in the preceding calendar month,
> You must request a license from Tencent…

Plus mandatory downstream obligations: ship a copy of the agreement to third parties, a
`Notice` text file, prominent change notices, and an explicit disclosure that
*"Tencent is not affiliated with, associated with, sponsoring, or endorsing"* the service.

Golem's own infrastructure includes a Supabase project in **eu-central-1**, and its users
are worldwide including the EU and UK. **Hunyuan3D is out.** This is despite it being
arguably the best-textured open model available — a good example of why the licence column
had to be filled from the actual text.

## C4. Training-data provenance — the caveat nobody's licence covers

MIT/Apache on the *weights* does not settle the provenance of the *training data*, and
none of these licences make a warranty about output. Concretely:

- `stabilityai/TripoSR`, `stabilityai/stable-fast-3d`, `tencent/Hunyuan3D-Part` all declare
  `dataset: allenai/objaverse` / `objaverse-xl` in their HF metadata. Objaverse is itself a
  mix of licences (predominantly CC-BY, requiring attribution).
- The Cube3D licence explicitly states *"The Data is not licensed under this License."*
- Whether AI-generated 3D geometry is copyrightable, and by whom, is unsettled in both the
  US and EU.

**Practical consequence:** generated meshes are fine as *Golem's own* build-time marketing
and library content, where Golem accepts the residual risk. They are a materially larger
risk if Golem asserts to paying customers that it grants them clean title. Golem should
never make an IP warranty about generated geometry.

## C5. Could any of this run inside $10–25/month? Honest answer: no.

### C5.1 Cloudflare Workers AI has no 3D model

Checked the full Workers AI catalogue
(<https://developers.cloudflare.com/workers-ai/models/index.md> and
`llms-full.txt`): **no text-to-3D or image-to-3D task type exists.** Golem's existing free
inference budget cannot be extended to 3D. Any 3D model means a *new* vendor and a *new*
bill.

### C5.2 Self-hosting on a rented GPU

RunPod on-demand pricing (<https://www.runpod.io/pricing>, fetched 2026-08-30):

| GPU | VRAM | Community | Secure |
|---|---|---|---|
| RTX 4090 | 24 GB | $0.34/hr | $0.74/hr |
| L4 | 24 GB | $0.44/hr | $0.49/hr |
| L40S | 48 GB | $0.79/hr | $0.99/hr |
| A100 PCIe | 80 GB | $1.19/hr | $1.39/hr |
| H100 PCIe | 80 GB | $1.99/hr | $2.89/hr |

TRELLIS.2-4B needs **≥24 GB**, so the floor is an RTX 4090 at $0.34/hr community.

- Always-on: $0.34 × 24 × 30 = **$245/month.** ~10× the entire budget ceiling.
- 1 hour/day: **~$10/month** — the whole budget, for one GPU that is cold most of the time.
  Container cold start for a 4B model with CUDA extensions is minutes, not seconds, so a
  scale-to-zero serverless GPU gives a first-request latency users will not tolerate.
- The model weights alone are multiple GB and must be pulled or kept on a network volume,
  which is an additional storage charge.

**Verdict: self-hosting is out by an order of magnitude.**

### C5.3 Pay-per-generation APIs

Verified prices (fetched 2026-08-30):

| Provider | Model | Price | Hardware / time |
|---|---|---|---|
| fal.ai | TRELLIS | *"Your request will cost $0.02 per generation."* (<https://fal.ai/models/fal-ai/trellis>) | — |
| Replicate | `firtoz/trellis` | *"approximately $0.034 to run … or 29 runs per $1"* (<https://replicate.com/firtoz/trellis>) | *"Nvidia A100 (80GB)"*, *"Predictions typically complete within 25 seconds"* |

At $0.02/generation the **entire** $10–25 monthly budget buys **500–1,250 generations per
month, total, across all users** — and that is with $0 left for anything else. With even
100 active users that is 5–12 meshes each per month, and it is a **per-user variable cost
with no natural cap**, which is precisely the failure mode the owner ruled out:

> "Do not silently turn Meshy into an uncontrolled per-user production cost."

The same objection applies to fal, Replicate, Meshy or anything else billed per generation.
The pricing model is wrong, independent of the vendor.

### C5.4 Free / near-free serverless

- **Hugging Face Spaces / ZeroGPU.** Every major model here has public demo Spaces
  (TRELLIS.2 has 88+). These are free to *use interactively*. They are **not** an API
  contract: per-user quotas, queueing, cold starts, and no uptime guarantee. Calling
  someone else's Space as a production backend is both fragile and abusive. ZeroGPU
  priority requires HF PRO at **$9/month**, which would consume most of the budget for a
  still-unguaranteed service.
- **HF Inference Providers.** No image-to-3D or text-to-3D provider route was found for
  these repos; the deployment surface is Spaces and dedicated Inference Endpoints, and
  endpoints are billed by GPU-hour (same arithmetic as C5.2).
- **Meshy free tier.** 100 credits/month, and critically: *"If you are on a free plan, we
  grant you a CC BY 4.0 license instead"* — attribution required —
  whereas *"If you are on a premium plan, you own all assets you create with Meshy."*
  (<https://www.meshy.ai/pricing>). **UNVERIFIED which plan the 2180 remaining credits sit
  under; this determines whether Golem owns those outputs or must attribute them.** Resolve
  before publishing anything made with them.

### C5.5 The one exception that changes the answer

**Roblox's own `GenerationService` is free, first-party, and live-verified working from
Golem's plugin.** 20.1 s for a 6k-triangle textured prop; 10 requests/minute; no external
hosting; no per-token or per-generation cost; no new vendor; and its output is subject to
Roblox's own moderation rather than Golem's liability. It is not open-weight — but the
owner's open-weight constraint is about **the AI core** ("no dependency on paid-per-token
APIs"), and `GenerationService` is neither paid nor per-token. It is a free platform
capability of the platform Golem already targets, in the same category as `GeometryService`.

**Answer to the key question:** runtime 3D generation is affordable and good enough today —
but **only through `GenerationService`**, not through any self-hosted or per-generation
open model. Every open-weight route is either 10× over budget (self-hosting), an uncapped
per-user variable cost (fal/Replicate/Meshy), or legally unusable (Hunyuan3D in the EU/UK,
Cube3D research-only, Hunyuan3D-Part unlicensed).

## C6. What the open models are still good for

Build-time only, on the owner's own machine or with the existing Meshy credits:

- Seeding the curated library (section D) with 30–100 stylistically consistent meshes,
  generated once, uploaded once, reused by every user forever. Amortised cost per use → 0.
- Making the marketing site impressive, which is exactly what the owner said the Meshy
  credits are for.
- Never as a runtime dependency.

---

## Sources

**Roblox engine & Open Cloud**
- InsertService — <https://create.roblox.com/docs/en-us/reference/engine/classes/InsertService.md>
- AssetService — <https://create.roblox.com/docs/en-us/reference/engine/classes/AssetService.md>
- DataModel (`GetObjects`) — <https://create.roblox.com/docs/en-us/reference/engine/classes/DataModel.md>
- GenerationService — <https://create.roblox.com/docs/en-us/reference/engine/classes/GenerationService.md>
- GeometryService — <https://create.roblox.com/docs/en-us/reference/engine/classes/GeometryService.md>
- EditableMesh — <https://create.roblox.com/docs/en-us/reference/engine/classes/EditableMesh.md>
- EditableImage — <https://create.roblox.com/docs/en-us/reference/engine/classes/EditableImage.md>
- Model generation — <https://create.roblox.com/docs/en-us/parts/model-generation.md>
- Procedural models — <https://create.roblox.com/docs/en-us/parts/procedural-models.md>
- Solid modeling — <https://create.roblox.com/docs/en-us/parts/solid-modeling.md>
- Meshes — <https://create.roblox.com/docs/en-us/parts/meshes.md>
- Asset privacy — <https://create.roblox.com/docs/en-us/projects/assets/privacy.md>
- Creator Store — <https://create.roblox.com/docs/en-us/production/creator-store.md>
- Creator Store queries — <https://create.roblox.com/docs/en-us/projects/assets/api.md>
- Creator Store Open Cloud reference — <https://create.roblox.com/docs/en-us/cloud/reference/features/creator-store.md>
- Assets API v1 reference — <https://create.roblox.com/docs/en-us/reference/cloud/assets/v1.md>
- Assets usage guide — <https://create.roblox.com/docs/en-us/cloud/guides/usage-assets.md>
- Open Cloud rate limits — <https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/cloud/reference/rate-limits.md>
- Material Generator — <https://create.roblox.com/docs/en-us/studio/material-generator.md>
- Texture Generator — <https://create.roblox.com/docs/en-us/studio/texture-generator.md>
- Assistant — <https://create.roblox.com/docs/en-us/assistant/guide.md>
- AI on Roblox — <https://create.roblox.com/docs/en-us/ai/accelerated-workflows.md>
- Greybox tutorial — <https://create.roblox.com/docs/en-us/tutorials/curriculums/environmental-art/greybox-your-environment.md>
- Polished assets — <https://create.roblox.com/docs/en-us/tutorials/curriculums/environmental-art/develop-polished-assets.md>

**Models & licences**
- Cube3D LICENSE — <https://raw.githubusercontent.com/Roblox/cube/main/LICENSE>
- Hunyuan3D-2.1 LICENSE — <https://huggingface.co/tencent/Hunyuan3D-2.1/blob/main/LICENSE>
- TRELLIS.2-4B — <https://huggingface.co/microsoft/TRELLIS.2-4B>
- (remaining repo links inline in the C2 table)

**Pricing & infrastructure**
- RunPod pricing — <https://www.runpod.io/pricing>
- fal.ai TRELLIS — <https://fal.ai/models/fal-ai/trellis>
- Replicate TRELLIS — <https://replicate.com/firtoz/trellis>
- Meshy pricing — <https://www.meshy.ai/pricing>
- Cloudflare D1 limits — <https://developers.cloudflare.com/d1/platform/limits/>
- Cloudflare Vectorize limits — <https://developers.cloudflare.com/vectorize/platform/limits/>
- Cloudflare Workers limits — <https://developers.cloudflare.com/workers/platform/limits/>
- Workers AI catalogue — <https://developers.cloudflare.com/workers-ai/models/>

**CC0 asset sources** — verified in [`asset-strategy.md`](./asset-strategy.md) §D2.
