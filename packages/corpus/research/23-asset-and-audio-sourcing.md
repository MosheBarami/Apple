# Asset and audio sourcing: Creator Store search, licensing, privacy, textures and what an AI builder may fetch
_Researched 2026-10-04 by deep-research agent (topic 23). Sources: 63._

Method note. Creator Docs pages were read from the Roblox/creator-docs GitHub repository (the source of create.roblox.com/docs) on 2026-10-04, including the OpenAPI JSON files for the Toolbox Service, Assets, Asset Permissions and Cloud v2 APIs, so API field names below come from the specs and not from memory. DevForum posts were fetched and summarised; each post's author and date are given. A few help-centre pages (Roblox Help, Creator Store Terms) returned HTTP 403, so those are cited from search-result text and marked "snippet". Trade-press items about music deals are third-party reporting and are labelled. This note builds on `09-tools-ecosystem.md` [S61] (Creator Store safety, sandboxing, MCP) and does not repeat it; read that note for the backdoor-vetting recipe. Today is 2026-10-04.

## Key facts

### A. What the Creator Store is and where you reach it
- The Creator Store (formerly Toolbox marketplace) is reachable on the Creator Hub (create.roblox.com/store) and inside Studio's Toolbox. Its categories are 3D Assets, Visual Effects, 2D Assets, Gameplay, Plugins and Audio. Models, decals, meshes, audio, plugins, videos and fonts are the asset types it carries. [S1][S2]
- 2026-04-29 (staff Kairomatic, Creator Store team): the Store layout changed. The old catch-all "Models" category was split, adding "Gameplay" and "Visual Effects" categories. The search bar was reworked to search inside a subcategory and to search other categories (Audio, Plugins) from anywhere. Planned next: plugin subcategories, an asset-classification feedback button, tags and more subcategories, and "automatic sandboxing on assets with scripts". Community feedback in the thread complained about browser-based toolbox performance. [S37]
- The Toolbox has four sections: Creator Store, Inventory, Recent and Creations. Inventory holds things you or your groups published plus things you took from the Store; Recent filters recent use; Creations is what you published, and only there can you right-click "Edit Asset". The Toolbox runs in a web view (WebView2 on Windows, WebKit on Mac). [S2]
- Free assets you insert in Studio without acquiring them do not appear in your Inventory. Cross-publishing works for models you inserted earlier, but copy-paste workflows do not. Roblox recommends acquiring every asset you want to keep. [S1]
- Every asset detail page shows: the distributing account, a video and up to five images, asset type, created and updated dates, description, technical details (triangle count, vertex count, script count), and ratings with reviews. [S1]
- Sellers can price a Model between USD 2.99 and 49.99 and a Plugin between USD 4.99 and 249.99. Prices are USD only (no Robux), only individual accounts (not groups) can sell or buy, and a 30-day escrow applies. Buyers get a licence to use the asset in Studio and experiences. [S1][S59]

### B. Search: filters, verification, ranking signals
- Advanced Filter (web and Studio) lets you sort by relevance or rating, filter creators by verification status and username, set price parameters, and restrict to results that contain specific asset types. In Studio the filter also offers audio file length. [S1][S2]
- 2024-06-25 (californiainus): Studio added five filters for 3D models. Triangle count (bucketed "ultra high" to "ultra low"; bucket edges are not published and may change), Contains (object types, for example scripts, MeshParts, audio), Visual style (for example anime or realistic), Graphics (physically based rendering) and Holidays. Within one filter category choices are OR; across categories they are AND. At the time they were Studio-only. [S38]
- Default trust filter: on 2022-08-27 press reported Marketplace results default to ID-or-phone-verified creators, with unverified creators visible only if the user opts in. [S50] Today (docs read 2026-10-04) verification means an age check or government ID; phone numbers no longer count. [S1] The Open Cloud search parameter `includeOnlyVerifiedCreators` defaults to true. [S4]
- Verification is an identity bar, not a safety guarantee. ID-verified accounts uploaded malicious models in 2025 and 2026 (details in [S61] and below). [S61][S41]
- Open Cloud Toolbox search (below) exposes the real ranking controls: `sortCategory` (Relevance, Trending, Top, AudioDuration, CreateTime, UpdatedTime, Ratings), `sortDirection`, `facets` (extra keywords), `categoryPath`, price in cents, and for audio `audioTypes` (Music, SoundEffect), min and max duration, artist, album, `includeTopCharts` and `musicChartType` (None, Current, Week, Month, Year). [S4]
- Studio's MCP `search_asset` tool (observed in this workspace, not from docs) searches in a waterfall: universe inventory, then the owning group, then the user's inventory, then the Creator Store. It takes `assetType` (Model, Audio, Mesh, MeshPart, Image, Decal, Video, Package), `scope` (auto, creator_store, user, group, universe), `priceFilter` (free, paid, all), min and max price in cents, `verifiedCreatorsOnly`, `facets`, `tags`, `audioMinDuration`, `audioMaxDuration`, `maxResults` 1 to 20 (default 5), and supports `+` for multi-term and quotes for an exact phrase. [S60]

### C. Roblox-owned and Roblox-licensed material
- Roblox's own account publishes basic building packs and meshes that show up under filtered Creator Store search (community statement, 2024-02). [S39] The `InsertService:GetFreeModelsAsync` reference example shows `CreatorName = "Roblox"` in a result. [S13] The Marketplace catalog docs use `CreatorTargetId=1` with `CreatorType=User` as the example for "created by Roblox" (this is for avatar items on catalog.roblox.com, not for Studio assets). [S3] Whether the Toolbox Service honours `userId=1` the same way is unverified; try it and read `creator.verified` and `creator.name` in the response. [S4]
- The engine's own base-material textures are Roblox-owned asset IDs listed in the Materials guide: for example Brick uses ColorMap 9920482813, Normal 9438453152 and Roughness 9438453413 (no Metalness map). The same page lists IDs for about 40 base materials, including terrain-material tables. These are safe, permitted sources for building custom `MaterialVariant`s. [S18]
- Audio: the Creator Store "contains more than 100,000 professionally-produced sound effects and music tracks from top audio and music partners", free to use. [S7][S8] In March 2022 the audio team named the exempt, still-public sources as Roblox-uploaded audio plus APM, Monstercat, Pro Sound Effects, Nettwerk Music Group and Position Music; Pro Sound Effects supplied over 100,000 SFX, searchable then as "[name] (SFX)". [S26][S27] These are 2022 facts and the partner list has since grown (below).
- Music partners over time: Monstercat (announced 2020-07-28, first label partner, 51 tracks to start; press) [S52]; APM Music (hundreds of thousands of tracks, royalty free on Roblox, Roblox handles sync, master, mechanical and performance licences; help article, snippet, undated) [S58]; DistroKid (announced at RDC 2024, September 2024, catalogue of independent artists; press says over 180,000 tracks) [S51][S48]; Clippsly and BSlick named alongside APM and Monstercat in the 2024-09-19 music post [S31][S30]; Too Lost (announced 2026-07-28, thousands of tracks by artists such as The All-American Rejects and Teddy Swims; trade press) [S48][S49].
- Terms attached to Roblox-licensed music: APM tracks are capped at 250 distinct tracks live in one experience (including boombox tracks); the cap is APM-specific and other licensors may impose their own; licensed tracks may be used on Roblox only and may not be downloaded; an experience may be a game where music plays but not a pure music player or library; derivative edits via Studio sound properties are allowed inside the game. [S58][S30] Music in the DistroKid and similar catalogues is "solely used on Roblox"; if gameplay video goes to YouTube or TikTok the platform's own copyright system applies. [S31]
- Artist pay for the DistroKid catalogue: in beta, artists are paid only if they own 100% of publishing and have no PRO registration (Music Ally, 2024); the Too Lost deal is described as "gratis" with exposure instead of per-play royalties, and one trade source says ISRC restrictions were removed (single source, unverified). [S51][S48] An independent-artist outlet notes public reporting does not spell out payment, opt-in or takedown terms. [S49] None of this changes what a game builder may do, but it explains why catalogue rules can shift.

### D. Licensing and permissions
- Licence scope. The Creator Store Terms (snippet) grant buyers and users a licence to use an asset in Roblox Studio and in experiences on the Services under the Roblox User and Creator Terms. Community consensus (DevForum, 2024-12-22; no staff reply in the thread) is that free Store assets are for Roblox use only; use elsewhere needs the creator's permission. [S59][S45]
- Every distributed asset must follow Community Rules, Terms of Use and IP guidelines. Doing something copyright-infringing is still infringement if you credited the author, did not monetise, or downloaded it from the internet. [S1][S24]
- Free external assets can be uploaded to Roblox if the licence allows it. CC0 sources: Poly Haven (CC0, commercial use, no attribution; its terms of service prohibit scraping) [S54], ambientCG (CC0 1.0, commercial use, attribution optional) [S55], Kenney (CC0, commercial use, do not use the Kenney logo) [S56]. Freesound mixes CC0, CC-BY (credit required) and CC-BY-NC (not allowed in commercial games). [S57] CC-BY has a practical Roblox problem: a 2020-05-21 thread (still discussed in July 2023) notes attribution needs a link while Roblox restricts off-site links; no fix was announced in that thread. Prefer CC0. [S46]
- Generative AI. 2024-03-19 Roblox IP guidance for Material Generator, Assistant and Texture Generator: do not prompt with brand names or logos; raw AI output is not reliably protectable, while substantial human modification earns rights; you remain responsible for what you upload. [S47] Roblox also notes output filters on Cube. [S61]
- AI data sharing: free Creator Store assets are shared with Roblox for AI enhancement by default with no way to disable; paid assets and games published after 2024-07-10 default to sharing on; opting out later removes data from training sets within 30 days. [S25]

### E. Asset privacy, permissions and the Asset Manager (timeline)
- 2022-03-09 (BitFist, Roblox Audio Team): from 2022-03-22 all new audio uploads are private and existing audio longer than 6 seconds becomes private. Audio shorter than 6 seconds, Roblox-uploaded audio and licensed partner music stay public. Uploads became free, replacing Robux fees with monthly limits. [S26]
- 2022-03-16 (BitFist): music is the target, SFX get different treatment; default monthly import limit 10, 100 with ID verification (these numbers are 2022, since superseded); edit-access holders can grant an experience permission to use audio from their account, avoiding re-uploads to a group. [S27]
- 2023-12-01 (FlankaTank): private audio and video can be shared with friends from Creator Hub; an Experience Permissions page lists which assets an experience can use; sharing does not insert anything, and the friend must insert the asset into their experience to grant that experience access. Revoking later does not stop already-inserted use. [S28]
- 2025-05-07 (FlankaTank): sharing expanded from audio and video to images, decals, meshes, MeshParts, models and packages, with group sharing (needs "Manage development item permissions"). A package shared with a group can only be set to "use". Inserting a restricted asset into a collaborator's experience auto-shares it with the experience owner. [S35]
- 2025-09-11 (FlankaTank): beta opt-in "Privacy for newly-created Image, Mesh and Decal assets". Default stays Open Use unless you opt in. Existing assets are not changed. [S33]
- 2026-03-30 (MajesticCatss): Revamped Asset Manager beta (File > Beta Features, restart Studio, Window > Asset Manager): bulk share up to 50 assets at a time, "Make Open Use" in bulk for meshes, images and decals, Quick Share for up to 10 collaborators or experiences, Recents, asset-ID and query search, version history for Models and Packages, Find in Explorer, CSV export. [S36]
- 2026-05-05 (FlankaTank): full release. New accounts and groups now have Asset Privacy enabled by default; existing accounts are unaffected; Creator Store distribution is unaffected (both Restricted and Open Use assets can be listed); Avatar Marketplace items need meshes and images set to Open Use. [S34]
- Current rules (docs read 2026-10-04): asset access is Restricted or Open Use. Open Use is irreversible. Asset Privacy only governs the default for new Images, Decals and Meshes; audio, video, models, MeshParts, animations and packages have their own defaults and are not affected by it. A Decal can only be Open Use if its Image is. Restricted assets are always permission-checked at load and on actions such as insert or listing. Without permission the asset cannot load in Studio, and a clickable Output error lets a permitted creator grant the experience access. Metadata such as name and description stays visible. [S5]
- Granting: to a collaborator the grantee must be your friend (individual) or you must have "Edit experiences" in the group; to an experience, enter universe IDs on the asset's Permissions page, or add asset IDs on the experience's own Permissions page. Game grants are permanent and cannot be revoked; revoking a collaborator does not touch games already using the asset; unfriending does not auto-revoke. For model and package assets, access can be Use or Edit. [S5]
- The Open Cloud Asset Permissions API (beta, scope `asset-permissions:write`, 100 requests a minute per key owner) does `PATCH /asset-permissions-api/v1/assets/permissions` with `subjectType` (User, Group, GroupRoleset, All, Universe), `subjectId`, `action` (Edit, Use, Download, CopyFromRcc, UpdateFromRcc), and `requests` (each with `assetId`, optional `grantToDependencies`, `parentVersionNumber`). The spec says it is not callable from HttpService with an API key. [S11]
- Asset Manager (docs): manages images, meshes, packages, audio, models, animations, decals, fonts, videos, plugins and places; folders (up to 50,000 per account, 100 child folders per folder, 20,000 assets per folder, 20 levels of nesting); bulk import with moderation before approval; a query language that filters by asset ID, creation date, creator name and audio type. Cross-inventory transfers are not supported. [S6]
- Roadmap (2026 posts, plans only): "Asset Manager - Game Inventory" (upload to an experience's inventory, late 2026), "Discover creator-uploaded songs" (mid 2026), a new texture generation tool (late 2026), material layering (mid 2027). [S43][S44]

### F. Audio import, distribution and playback
- Import limits (audio docs, read 2026-10-04): .mp3, .ogg, .wav or .flac; single track; under 20 MB and 7 minutes; sample rate up to 48 kHz; mono or stereo, 2.0, 3.0 or 5.1. ID-verified creators can import 2,000 free audio assets per 30 days, unverified 100. Studio transcodes on import; older tools sometimes write bad headers. Imported audio is private by default and sits in a moderation queue first. [S7]
- Conflict: the Open Cloud assets guide says audio upload is up to 100 per month if ID-verified and 10 if not, and that audio cannot be updated. The audio page's numbers (2,000 and 100) look newer, but the guide is not dated. Do not assume either; read the live quota with `GET /cloud/v2/users/{user_id}/asset-quotas` (beta, scope `asset:read`, quota types RATE_LIMIT_UPLOAD and RATE_LIMIT_CREATOR_STORE_DISTRIBUTE). [S7][S9][S12]
- Classification: uploads are auto-classified as sound effect or song. Songs can appear on the experience details page if they pass moderation and copyright checks, meet duration and play-count thresholds, have an appropriate title, and the uploader is ID-verified and accepted the Audio Upload License terms. [S7]
- Distributing your own SFX (2024-05-23, AZKOolKAt): creators 13 or older, ID-verified, good standing, a one-time Audio Distributor application; the sound must be under 10 seconds with no music or speech; it must pass copyright detection, SFX classification and moderation; moderation of SFX is not appealable; moderated sounds vanish from the Store and from experiences using them. [S29]
- Creator Store distribution caps per 30 days: verified 100 audio (200 each for mesh, image, model, 10 plugins); unverified 10 audio (10, 10, 10, 2 plugins). First-time audio distributors must accept legal agreements. [S1]
- Uploaded private audio cannot be played in other developers' experiences. On 2025-10-13 staff (complexlint) answered a request to let a user's own uploads play anywhere (for example in boomboxes) with "we intentionally do not support" it and do not plan to; the suggested routes are the Creator Store, the DistroKid partnership, or working with the music's creators. [S32]
- Troubleshooting, community (undated, several threads): "Failed to load sound" usually means the experience (universe) lacks permission on a private asset, the audio is moderated, or it was removed from sale; grant the universe permission or re-insert from the Toolbox. [S63]
- Playback objects. Clicking an audio asset in the Toolbox inserts a `Sound`; the audio docs say `Sound` lacks the dynamic features of `AudioPlayer`, so the recommended path is Copy Asset ID then set `AudioPlayer.Asset`. `AudioPlayer.AssetId` is deprecated in favour of `Asset`. `AudioPlayer` loads on assignment when `AutoLoad` is true and sets `IsReady`. [S7][S16]
- Experience rules for music: a community developer (jackjenningsdev, 2024-12) says an experience that is solely a music player is not allowed, a game where music plays is; up to 250 APM tracks at once. [S30]

### G. Programmatic access: what code can do (and limits)
- `InsertService:LoadAsset(assetId)` and `LoadAssetVersion` need the LoadOwnedAsset capability and only load assets that are created or owned by the experience creator, shared by the owner, or owned by Roblox (plus benign OpenUse types such as shirts, pants, t-shirts and accessories). Wrap in pcall. [S13]
- `AssetService:LoadAssetAsync(assetId)` is the modern replacement; it needs LoadUnownedAsset. With `AssetService.AllowInsertFreeAssets` false (default, set via Experience Settings "Allow Loading Third Party Assets") it has the same ownership rule as above; true additionally allows any public free Creator Store asset. [S14]
- `InsertService:GetFreeModelsAsync(searchText, pageNum)` and `GetFreeDecalsAsync` (AssetRead capability, yield) return a wrapped results table (the docs example says `TotalCount` is always 21) and are a thin legacy search; `GetLatestAssetVersionAsync` gets a version id. Many older InsertService methods (`Insert`, `ApproveAssetId`, `GetFreeModels`, `AllowInsertFreeModels`) are deprecated and no-ops. [S13]
- `AssetService:SearchAudioAsync(AudioSearchParams)` returns `AudioPages`; AssetRead capability; usable in live experiences; "low HTTP request limit" so it can return HTTP 429; a filtered keyword raises "Unexpected type for data, expected array got null". `AudioSearchParams` fields: SearchKeyword, Title, Artist, Album, Tag, MinDuration, MaxDuration, AudioSubType (default Music, so set SoundEffect for SFX). Results carry Title, Artist, AudioType, Tags, Id, IsEndorsed, Description, Duration and creator info. `AssetService:GetAudioMetadataAsync(idList)` returns Title, Artist and AssetId for audio IDs. [S14][S15]
- `AssetService:CreateAssetAsync` (types Model, Plugin, Mesh from EditableMesh, Image from EditableImage) works only in locally loaded plugins and in Open Cloud Luau Execution (where CreatorId and CreatorType are required) and uploads without prompting. `CreateAssetVersionAsync` and `SavePlaceAsync` share the AssetCreateUpdate capability. Players can create Package assets in an experience through `AssetService:PromptCreateAssetAsync`; packages with scripts or private assets (audio, video, nested packages) are blocked, and creations are attributed to your experience until the player edits them in Studio. [S14][S23]
- `AssetService:ComposeDecalAsync` layers up to 8 PBR texture sets (ColorMap required in each, alpha blends) onto a Decal. [S14]
- Open Cloud Toolbox Service (beta, `GET https://apis.roblox.com/toolbox-service/v2/assets:search` and `GET .../assets/{id}`; API key scope `creator-store-product:read`; 1,000 requests a minute per key owner; the search is flagged usable from HttpService with an API key). Required parameter `searchCategoryType`: Audio, Model, Decal, Plugin, MeshPart, Video or FontFamily. Others: `query`, `modelSubTypes` and `excludedModelSubTypes` (Ad, MaterialPack, Package), `includedInstanceTypes` (Script, MeshPart, Decal, Animation, Audio, Tool), `userId` or `groupId` (one only), `maxPageSize` (1 to 100, default 25), `pageToken` or `pageNumber` (0-based; not both), `searchView` (IDs, Core, Full; lighter views are faster and more reliable). Response: `creatorStoreAssets[]`, `nextPageToken`, `totalResults`, `queryFacets`, `filteredKeyword`. Each item has `asset` (id, name, description, assetTypeId, previewAssets, createTime, updateTime, categoryPath), `creator` (name, userId or groupId, `verified`), `voting` (upVotes, downVotes, upVotePercent, voteCount), `creatorStoreProduct` (purchasePrice, purchasable) and typed details: Model has `hasScripts`, `scriptCount`, `objectMeshSummary.triangles` and `.vertices`, `instanceCounts` (script, meshPart, animation, decal, audio, tool); Audio has `durationSeconds`, `audioType`, `artist`, `title`; Music adds album and genre; SoundEffect adds category and subcategory; MeshPart has `meshId` and `textureId`. [S4][S3]
- Open Cloud Assets API (all beta): create, get, update, archive, restore, list versions, get version, rollback, and `GET /v1/operations/{id}` to poll. Create and update take one asset per call, up to 20 MB. Types: Animation (.rbxm/.rbxmx), Audio (.mp3/.ogg/.wav/.flac, 7 minutes, not updatable), Decal and Image (.png/.jpeg/.bmp/.tga, under 8000x8000, not updatable), Mesh (Roblox-only mesh data downloaded from Asset Delivery; use the Importer otherwise), Model (.fbx/.gltf/.glb/.rbxm/.rbxmx, uploaded as packages), Video (.mp4/.mov, 5 minutes, 4096x2160, 3.75 GB, 20 a day for 13+ ID-verified). Only .fbx content can currently be updated. Auth: API key with the `assets` permission or OAuth `asset:read` and `asset:write`. Results show a moderation state (for example approved). [S9][S10]
- `POST /cloud/v2/universes/{universe_id}:generateSpeechAsset` (beta; scopes `asset:read`, `asset:write`, `universe:write`) creates an English speech MP3 asset from text with `voiceId`, `pitch` and `speed`, and returns `remainingQuota` for the calendar month. [S12]
- Studio MCP asset tools (observed): `search_asset`, `insert_asset` (by numeric id; types Model, Package, Mesh, MeshPart, Image, Decal, Audio, Video, Animation; Image and Decal both insert as a Decal; the tool says it loads, validates and places the asset), `generate_material`, `generate_texture`, `generate_mesh`, `upload_image` (images from an http server to the asset server, returns rbxassetid URIs), `store_image` (local png or jpg, max 5 MB, returns an IMAGEID URI for other tools), and a docs-only `http_get`. [S60]

### H. Textures, materials, MaterialVariants
- Textures: `.png`, `.jpg`, `.tga`, `.bmp`; up to 4096x4096; engine streams low quality first. Guidance: 256x256 for a 5x5 stud object, 512x512 for 10x10, 1024x1024 for 20x20. Default parts show a 1024x1024 texture on an 8x8 stud face; terrain 512x512 across 8x8 studs. A mesh can have only one material. For PBR `SurfaceAppearance`: albedo RGB, normal map RGB in OpenGL tangent-space format only, roughness, metalness and emissive mask single-channel 8-bit grayscale; about 256x256 per 2x2x2 unit space, maximum 1024x1024 for an 8x8x8 asset; UVs in 0 to 1 with one UV set. [S19]
- Mesh import: a single mesh cannot exceed 20,000 triangles; geometry must be watertight and have volume; skinned meshes allow at most 4 bone influences per vertex. [S21]
- `Texture` repeats (StudsPerTileU and V, OffsetStudsU and V); `Decal` stretches. Texture streaming covers MeshPart, SurfaceAppearance, Texture, Decal and MaterialVariant; prefer separate textures over atlases because one high-resolution request streams the whole atlas. [S22]
- `MaterialVariant` properties: BaseMaterial, ColorMap, NormalMap, MetalnessMap, RoughnessMap (plus the Content-typed `*MapContent` forms), StudsPerTile (larger values make the texture look larger and repeat less), MaterialPattern (Regular or Organic), AlphaMode, EmissiveMaskContent, EmissiveStrength, EmissiveTint, CustomPhysicalProperties. A variant only works as a descendant of `MaterialService`. A variant named like a built-in material inside MaterialService overrides it globally; `BasePart.MaterialVariant` (a name string, not a reference) selects it per part. [S17]
- Adaptive behaviour: because parts reference the variant by name, models keep their look across places only if the MaterialVariant instances are in MaterialService; copy any MaterialVariant that arrives inside an inserted model into MaterialService. Terrain can only take a custom material through a material override, and terrain materials are global per place. Renaming a variant after applying it detaches parts that used the old name. Use PascalCase names starting with the base material (GrassWet, GrassDry). [S18]
- Creator Store "Materials" category holds "material packs": models that contain only MaterialVariant, TerrainDetail, Folder and Model instances. In the API this is `modelSubTypes=MaterialPack`. A material pack carries no scripts by construction, so it is the lowest-risk model class. [S18][S4]
- Material Generator (Studio window, text prompt, a "Generate" button, an Organic toggle to reduce visible repetition, Studs Per Tile slider, pick a Base Material for physics, then Save and Apply). Tips: add "close up", "top down" or "texture"; "simple", "pattern", "symmetrical", "flat"; "grayscale" to leave room to tint. The MCP `generate_material` tool takes a base material (40 allowed values such as Brick, Concrete, WoodPlanks, Grass, Fabric), a description, an id and a pattern (Regular or Organic) and returns the BaseMaterial and the MaterialVariant name to set on parts. `generate_texture` re-textures an existing mesh from a text prompt and replaces the source in place. [S20][S60]

### I. Security status of Creator Store insertions (delta to [S61])
- 2026-05-13 (Kairomatic and riddlemasta): Studio sandboxes Creator Store insertions, blocking LoadUnownedAsset, LoadAsset, LoadString and CapabilityControl and restricting getfenv and setfenv; HD Admin, Kohl's Admin and Adonis are exempt. New detail beyond [S61]: Roblox paused auto-sandboxing of Models and Folders while keeping it for script containers; the rule is Studio-only and does not change `LoadAssetAsync` in live games. [S40]
- 2026-05 (riddlemasta): the `SandboxedInstanceMode` setting only controls whether the sandbox UI is shown, it does not turn the sandbox off; sandboxed assets that need to load unowned assets (admin loaders) break unless exempted. [S42]
- 2026-06-13 (Fe_ct): new viruses bypass the sandbox because UI access is not blocked: they show fake error dialogs that coax the developer into pasting obfuscated code. Staff (EarnestError) advised disabling UI capabilities on inserted assets and promised improvements; the poster said in August 2026 that new viruses kept appearing and the thread was closed. [S41]
- Roblox's third-party-asset guidance: read all scripts; watch for whitespace-hidden code and conditional triggers; do not grant Network, DataStore, AssetRequire, CapabilityControl or LoadString to untrusted assets; popularity is not safety. [S53]
- Implication: assets with no script instances (audio, meshes, decals, images, material packs) remain the only low-risk classes. [S61][S4]

## How to apply it (rules for an AI builder)

### What the agent may fetch and insert on its own
- DO prefer, in this order: (1) audio from the Creator Store; (2) material packs and base-material textures; (3) meshes, MeshParts and decals; (4) models with `scriptCount` 0 and `hasScripts` false; (5) generated content from Studio's own tools. Each step down adds risk or ambiguity. [S4][S18][S60]
- DO search Audio with `assetType: "Audio"`, `audioMaxDuration` for SFX (distributed SFX are under 10 seconds [S29]) and `audioMinDuration` for loops (for example 60 or more seconds for background music). [S60][S29]
- DO set `verifiedCreatorsOnly: true` and `priceFilter: "free"` on `search_asset` with `scope: "creator_store"` for every Store search. [S60]
- DO check the result before inserting: asset type, creator name and `verified`, vote percentage, triangle count (`objectMeshSummary.triangles`), `scriptCount`, `instanceCounts`. Skip models with `scriptCount` above 0 unless the owner approves the specific asset. [S4]
- DO keep a provenance log (asset id, name, creator, source, date, licence, where used) for every external asset; the owner needs it for the licensing recipe below. [S1][S24]
- DO use `AudioPlayer` with `Wire` and `AudioDeviceOutput` (or `AudioEmitter` for 3D) rather than `Sound` when the sound needs effects, routing or control. [S7][S16]
- DO use texture sizes from the spec: 256 for 5x5 studs, 512 for 10x10, 1024 for 20x20; keep meshes under 20,000 triangles each (generated-mesh default cap is 10,000 [S61]). [S19][S21]
- DO put every `MaterialVariant` in `MaterialService` and name it BaseMaterial plus suffix. [S17][S18]
- DO wrap `SearchAudioAsync`, `GetAudioMetadataAsync`, `LoadAssetAsync` and every Open Cloud call in pcall or error handling and back off on HTTP 429. [S14]

### What the agent must not do on its own (owner required)
- DON'T insert Plugins ever, models with Script, LocalScript or ModuleScript children without owner sign-off, or packages with AutoUpdate from unknown creators. See [S61] for vetting. [S61][S40]
- DON'T buy assets. Paid assets are USD purchases by individual accounts. Ask the owner. [S1]
- DON'T grant asset permissions to an experience, set Open Use, distribute to the Creator Store or change Asset Privacy without explicit owner consent in chat. Game grants and Open Use cannot be undone. [S5]
- DON'T upload external files (CC0 packs, stock audio) without the owner confirming rights, licence and account; uploads are made under the owner's identity and quota. The agent may prepare files and a provenance list. [S7][S24]
- DON'T enable `AllowInsertFreeAssets` or `LoadStringEnabled` for runtime loading of Store assets. Runtime `LoadAssetAsync` of unowned assets bypasses Studio's sandbox. [S14][S40]
- DON'T use copyrighted music or SFX just because an asset id plays. Roblox moderation replaces flagged music and the uploader of non-owned music has violated the Terms. [S58]
- DON'T build a game that is only a music player or sells access to specific licensed tracks. [S30]
- DON'T prompt generative tools with brand names, logos, real people or franchise characters; keep prompts to neutral props (see also the moderation anecdote in [S61]). [S47][S61]
- DON'T embed an API key in a Script or commit one. Open Cloud search and upload keys belong in the owner's environment; the key permission lists are per scope. [S9][S4]

### Audio policy rules of thumb
- Background loops: pick Music from Roblox-listed partner catalogues; keep to fewer than 250 APM tracks and avoid a jukebox that effectively replaces a music service. [S58][S30]
- SFX: prefer short, specific SFX with exact phrase queries and `audioTypes=SoundEffect`; Roblox says SFX are classified separately from songs. [S4][S7]
- Never rely on private audio you uploaded being usable in someone else's experience; grant permission to your own universe instead. [S32][S5]
- If audio fails with a load error, check permissions and moderation before replacing the id. [S63]

## Recipes (each becomes a skill)

### Search the Creator Store for one prop safely (MCP)
When to use: the plan calls for a specific prop (barrel, lamp post, tree) and the agent has Studio MCP.
Steps:
1. Call `list_roblox_studios`, take the `studio_id`.
2. Call `search_asset` with `scope: "creator_store"`, `assetType: "MeshPart"` first (script-free), `query` as a specific phrase such as `"low poly+barrel"`, `verifiedCreatorsOnly: true`, `priceFilter: "free"`, `maxResults: 10`. [S60]
3. If nothing fits, repeat with `assetType: "Model"`; add `facets` (for example `wooden`, `stylized`) to refine. [S60][S4]
4. Rank candidates: higher `upVotePercent`, plausible triangle count (props: aim for 2,000 or fewer triangles), creator name, `verified` true. [S4]
5. Reject any model with scripts; insert the shortlisted asset into a scratch place first, not the production place. [S61]
6. `insert_asset` with `assetId`, `assetName` and `parentPath`; then `search_game_tree` or `inspect_instance` on the result and count descendants and scripts (a prop with hundreds of children is suspect). [S60][S61]
7. Log the asset id, creator and licence line in the provenance file.
Pitfalls: `search_asset` defaults to `scope: "auto"`, which looks in the user's inventories before the Store; use `creator_store` when you want market results. A Decal found as type Image is the usual type for newly uploaded textures. [S60]

### Search Open Cloud directly and filter out scripts (backend tool)
When to use: the worker or a CLI needs to shortlist assets in bulk without Studio.
Steps:
1. The owner creates an API key with the Creator Store product read permission (scope `creator-store-product:read`) and stores it as a secret. The agent never prints it. [S4]
2. Query models that are not scripted:
```bash
curl -sG 'https://apis.roblox.com/toolbox-service/v2/assets:search' \
  -H "x-api-key: $ROBLOX_API_KEY" \
  --data-urlencode 'searchCategoryType=Model' \
  --data-urlencode 'query=low poly barrel' \
  --data-urlencode 'includeOnlyVerifiedCreators=true' \
  --data-urlencode 'maxPageSize=50' \
  --data-urlencode 'searchView=Full'
```
Array parameters (for example `modelSubTypes`) are repeated query keys under standard OpenAPI style; this encoding is unverified against the live service, so test one call. [S4]
3. Filter client-side: keep items where `model.hasScripts == false` and `scriptCount == 0`, `objectMeshSummary.triangles` under your budget, `creator.verified == true`.
4. Page with `nextPageToken` (do not mix `pageToken` and `pageNumber`). Respect 1,000 requests a minute per key owner. [S4]
Pitfalls: the endpoint is beta and field names can change; a `filteredKeyword` in the response means your query was altered by moderation. [S4]

### Find and wire in background music
When to use: any game that needs a loop (lobby, level, menu).
Steps:
1. `search_asset` with `assetType: "Audio"`, `query` of mood plus genre ("calm ambient"), `audioMinDuration: 60`, `verifiedCreatorsOnly: true`. [S60]
2. Prefer results whose creators are the known partners (APM, Monstercat, DistroKid-delivered artists, Too Lost); read the artist and title via `AssetService:GetAudioMetadataAsync` if unsure. [S31][S15]
3. Create an `AudioPlayer` in a folder in `SoundService`, set `Asset = "rbxassetid://<id>"`, `Looping = true`, `Volume` 0.3 to 0.5; add an `AudioDeviceOutput` and a `Wire` from player to output (see snippet). [S16]
4. Count APM-origin tracks in the place (keep under 250) and make sure the experience is a game, not a jukebox. [S30]
5. Add a mute or volume setting in the UI.
Pitfalls: clicking an audio asset in the Toolbox inserts a `Sound`, which lacks `AudioPlayer`'s routing; both work but pick one scheme. A `Wire` with no output is silent. [S7]

### Build an SFX kit for game feel
When to use: first polish pass (hit, pickup, UI click, win, lose).
Steps:
1. For each needed event run `search_asset` with `assetType: "Audio"`, `audioMaxDuration: 3` (or at most 10) and an exact-phrase query such as `"coin pickup"`. [S60][S29]
2. Or in-game/plugin code: `AssetService:SearchAudioAsync` with `AudioSubType = Enum.AudioSubType.SoundEffect` and `MaxDuration = 3` (default subtype is Music). [S15]
3. Choose at least two variants per event to avoid repetition; store ids in a ModuleScript table keyed by event name.
4. Play through `AudioPlayer` pooled per event or `Sound` with `PlayOnRemove` for tiny one-shots; keep volumes in `SoundGroup` or `AudioFader` buses (verify the object exists in your target Studio build before relying on it).
Pitfalls: SFX distributed by creators can be moderated and removed with no appeal; centralising ids in one module makes replacement a one-line change. [S29]

### Own audio: upload, permission, and verify
When to use: the owner supplies original audio or licensed stock they hold rights to.
Steps:
1. Check format and size: single track, mp3/ogg/wav/flac, under 20 MB, 7 minutes, up to 48 kHz. [S7]
2. Owner imports via Asset Manager, Creator Dashboard (Development Items > Audio > Upload Asset) or the Assets API (owner's key). Verify remaining quota with `GET /cloud/v2/users/{id}/asset-quotas`. [S7][S12]
3. Wait for moderation (the operation or dashboard shows approved). [S10]
4. The audio is private. If the audio belongs to the owner's account and the experience is theirs, it plays there; for group-owned experiences or another account's universe, grant the universe permission on the asset's Permissions page or via the Asset Permissions API with `subjectType: Universe`, `action: Use`. This grant is permanent. [S5][S11]
5. Test in a published private server; Studio sometimes fails to play audio even when permission exists (2023 known issue note). [S28]
Pitfalls: the audio will not play in other people's experiences even if you want it to, and Roblox does not plan to change this. [S32]

### Grant a universe access to many restricted assets (owner-approved batch)
When to use: assets were uploaded under one account and the experience is owned by another account or group.
Steps:
1. Ask the owner for explicit consent, because universe grants cannot be revoked. [S5]
2. Collect asset ids (an audit script below helps) and the target universe id.
3. Owner runs, with a key that has `asset-permissions:write`:
```bash
curl -X PATCH 'https://apis.roblox.com/asset-permissions-api/v1/assets/permissions' \
  -H "x-api-key: $ROBLOX_API_KEY" -H 'Content-Type: application/json' \
  -d '{"subjectType":"Universe","subjectId":"<universeId>","action":"Use","requests":[{"assetId":111},{"assetId":222}]}'
```
(Body fields from the spec; the 100 requests a minute limit applies.) [S11]
4. Or use the revamped Asset Manager beta to bulk-share up to 50 assets at a time. [S36]
5. Re-run the audit and re-test in a live server.
Pitfalls: the spec says this endpoint cannot be called from in-experience HttpService with an API key; Decal-to-Image and dependency grants may need `grantToDependencies`. [S11][S5]

### Audit a place's asset provenance and permissions
When to use: before publishing, after importing a template, or when sounds and images fail to load.
Steps:
1. Run the audit snippet below from the command bar; it lists every referenced asset id, its type and its creator.
2. Review rows whose creator is neither the owner nor a known partner. Look up the Store page for each unknown audio id and read its licence context.
3. For failures ("Failed to load sound" or images not loading), check permissions on the owner's asset or replace with a licensed asset. [S63][S5]
4. Write the result to the provenance log.
Pitfalls: `MarketplaceService:GetProductInfoAsync` is rate limited; the snippet sleeps between calls and uses pcall. Models loaded at runtime from ids in scripts are invisible to this scan, so grep scripts for `rbxassetid`.

### Create a custom material (MaterialVariant) from base-material textures
When to use: you want a distinct look for floors or walls without importing textures, or need a variant of an engine material.
Steps:
1. Pick the base material (for example `Enum.Material.Brick`) so physics match. [S18]
2. In Studio use the Material Manager (Create Material Variant) or, for scripts, create the instance in `MaterialService` as in the snippet. Texture IDs can come from the Materials guide table (Brick ColorMap 9920482813, Normal 9438453152, Roughness 9438453413) or from a generated material. [S18][S17]
3. Set `StudsPerTile` (try 6 to 12 for floors and walls; larger means bigger texture) and `MaterialPattern = Regular`, or Organic to hide tiling. [S17][S20]
4. Apply: set `Part.Material` to the base material and `Part.MaterialVariant` to the variant name. Re-apply if you rename. [S18]
5. Optional: set `MaterialService` override via the Material Manager "Set as Override" so all parts and terrain of that base material take the variant (terrain: global per place). [S18]
Pitfalls: a MaterialVariant outside `MaterialService` does nothing; adaptive naming means a variant with the same name from an inserted model silently changes the look of your parts. [S17][S18]

### Generate a material or retexture with Studio tools
When to use: you need a themed surface and want Roblox-generated assets.
Steps:
1. `generate_material` with `baseMaterial`, a short `materialDescription` ("mossy cobblestone, top down, texture"), a unique `materialId`, and `materialPattern` Regular or Organic. [S60][S20]
2. Set the returned BaseMaterial on `Part.Material` and the returned Name on `Part.MaterialVariant`. [S60]
3. For a mesh, `generate_texture` with the `uniqueId` of the MeshPart or Model and a text prompt; it replaces the source in place, so duplicate the original first. [S60]
4. Do not mention brands, logos or real people in prompts. [S47]
Pitfalls: generation is non-deterministic (each Generate gives different results); AI output is not reliably protectable IP. [S20][S47]

### Texture sizing and import checklist for external assets
When to use: the owner provides external textures or meshes (CC0 packs, Blender export).
Steps:
1. Confirm licence: CC0 or equivalent; record URL and licence text (Poly Haven, ambientCG and Kenney are CC0; Freesound varies; avoid CC-BY-NC). [S54][S55][S56][S57]
2. Resize textures to the budget: 256 (5x5 studs), 512 (10x10), 1024 (20x20); PBR maps single-channel for roughness and metalness; normal maps OpenGL tangent space. [S19]
3. Keep meshes under 20,000 triangles, watertight, one UV set within 0 to 1, one material per mesh. [S21][S19]
4. The owner imports with the Importer or uploads via the Assets API (Model as .fbx or .glb; images up to 8000x8000). [S9]
5. Create `SurfaceAppearance` on the MeshPart or a `MaterialVariant` for tileables; log provenance.
Pitfalls: CC-BY credit requires a link that Roblox may not allow; avoid it. Textures streamed from atlases waste memory. [S46][S22]

### Handoff checklist for the owner
When to use: whenever the agent reaches an action marked owner-only.
Steps:
1. State the action (grant, upload, buy, distribute, make Open Use), the exact asset ids and the target (universe id, group).
2. State irreversibility (universe grants and Open Use cannot be undone). [S5]
3. State cost and quota (purchases in USD; upload quotas; Creator Store distribution caps of 100 audio per 30 days when verified). [S1][S7]
4. Provide the ready-to-run command or UI path, with the key read from the environment.
5. Wait for an explicit yes in chat before running anything.

## Luau reference snippets

Search audio (the default `AudioSubType` is Music, so SFX must be set explicitly; every call can throw):
```lua
local AssetService = game:GetService("AssetService")

local function searchAudio(keyword: string, subType: Enum.AudioSubType, maxSeconds: number?)
	local params = Instance.new("AudioSearchParams")
	params.SearchKeyword = keyword
	params.AudioSubType = subType
	if maxSeconds then
		params.MaxDuration = maxSeconds
	end
	local ok, pages = pcall(function()
		return AssetService:SearchAudioAsync(params)
	end)
	if not ok then
		warn("SearchAudioAsync failed (rate limit or filtered keyword):", pages)
		return {}
	end
	local results = {}
	for _, item in pages:GetCurrentPage() do
		table.insert(results, item) -- fields include Id, Title, Artist, Duration, AudioType, Tags
	end
	return results
end

for _, item in searchAudio("coin pickup", Enum.AudioSubType.SoundEffect, 3) do
	print(item.Id, item.Title, item.Artist, item.Duration)
end
```
[S14][S15]

Read titles and artists for known ids:
```lua
local AssetService = game:GetService("AssetService")
local ok, meta = pcall(AssetService.GetAudioMetadataAsync, AssetService, { 1234567890 })
if ok then
	for _, m in meta do
		print(m.AssetId, m.Title, m.Artist)
	end
end
```
[S14]

Play a looping music asset through the Audio API (non-spatial; use an `AudioEmitter` for 3D):
```lua
local function playMusic(parent: Instance, assetId: number): AudioPlayer
	local player = Instance.new("AudioPlayer")
	player.Asset = "rbxassetid://" .. assetId
	player.Looping = true
	player.Volume = 0.4
	player.Parent = parent

	local output = Instance.new("AudioDeviceOutput")
	output.Parent = parent

	local wire = Instance.new("Wire")
	wire.SourceInstance = player
	wire.TargetInstance = output
	wire.Parent = parent

	player:Play()
	return player
end
```
[S16] (Wire and AudioDeviceOutput are Audio API objects listed in [S8]; confirm their property names in your Studio build.)

Create and apply a MaterialVariant (Studio edit context; ids from the Materials guide table):
```lua
local MaterialService = game:GetService("MaterialService")

local variant = Instance.new("MaterialVariant")
variant.Name = "BrickWorn"
variant.BaseMaterial = Enum.Material.Brick
variant.ColorMap = "rbxassetid://9920482813"
variant.NormalMap = "rbxassetid://9438453152"
variant.RoughnessMap = "rbxassetid://9438453413"
variant.StudsPerTile = 8
variant.MaterialPattern = Enum.MaterialPattern.Organic
variant.Parent = MaterialService

local part = workspace:FindFirstChild("Wall") :: BasePart?
if part then
	part.Material = Enum.Material.Brick
	part.MaterialVariant = "BrickWorn" -- by name
end
```
[S17][S18]

Asset provenance audit (command bar; read-only; creators are fetched with GetProductInfoAsync, so it is slow and rate limited):
```lua
local MarketplaceService = game:GetService("MarketplaceService")

local function idFrom(content: string): number?
	local n = string.match(content, "%d+")
	return n and tonumber(n) or nil
end

local found: { [number]: { string } } = {}
local function note(id: number?, where: string)
	if not id then return end
	found[id] = found[id] or {}
	table.insert(found[id], where)
end

for _, inst in game:GetDescendants() do
	if inst:IsA("Sound") then
		note(idFrom(inst.SoundId), inst:GetFullName())
	elseif inst:IsA("AudioPlayer") then
		note(idFrom(inst.Asset), inst:GetFullName())
	elseif inst:IsA("Decal") or inst:IsA("Texture") then
		note(idFrom(inst.Texture), inst:GetFullName())
	elseif inst:IsA("MeshPart") then
		note(idFrom(inst.MeshId), inst:GetFullName())
		note(idFrom(inst.TextureID), inst:GetFullName())
	end
end

for id, places in found do
	local ok, info = pcall(MarketplaceService.GetProductInfoAsync, MarketplaceService, id, Enum.InfoType.Asset)
	if ok then
		print(id, info.Name, info.Creator.Name, info.Creator.CreatorTargetId, #places, "uses")
	else
		warn(id, "lookup failed or restricted:", info)
	end
	task.wait(0.3)
end
```
(`GetProductInfoAsync` returns a table with `Name` and `Creator`; very new or restricted assets may fail. (`MarketplaceService:GetProductInfoAsync` is a standard API whose signature was not re-fetched in this pass.)) Creator id 1 is the Roblox account in the catalog docs example [S3]; treat rows owned by neither the owner nor a recognised partner as items to review.

Runtime load of an owned or shared model (only for assets you own; unowned loads need `AllowInsertFreeAssets` and are not recommended):
```lua
local AssetService = game:GetService("AssetService")
local ok, model = pcall(function()
	return AssetService:LoadAssetAsync(257489726)
end)
if ok and model then
	model.Parent = workspace
else
	warn("load failed", model)
end
```
[S14]

## Open questions / unverified
- Audio import quota: the audio page says 2,000 (verified) and 100 (unverified) per 30 days; the Open Cloud guide says 100 and 10 per month. Neither page is dated; read live quota from the asset-quotas endpoint. [S7][S9][S12]
- Does the Studio MCP `insert_asset` tool apply the Creator Store sandbox, and does `search_asset` default to verified creators when `verifiedCreatorsOnly` is omitted? Not stated in the tool schemas; assume not and set both explicitly. [S60]
- Whether the Open Cloud Toolbox search honours `userId=1` as "Roblox-owned" and how array query parameters must be encoded; untested (no API key used in this pass). [S4]
- Whether Roblox still publishes a stable "Roblox-created" asset list; the 2024 community thread is the only evidence. APM, Monstercat, DistroKid, Clippsly and BSlick are named in 2024 sources; Too Lost in 2026 trade press. No Roblox first-party post about Too Lost was found. [S39][S31][S48]
- The "ISRC restrictions removed" claim appears in one trade source only. [S48]
- Group acquisition of audio ("groups cannot acquire audio", 2024-09-19) may be outdated; not rechecked. [S31]
- Whether Models and Folders sandboxing resumed after the May 2026 pause; no later staff post found. [S40]
- The name of the Roblox Help article numbers for licensed music and Creator Store Terms returned 403; content comes from search snippets only. [S58][S59]
- Creator Store AI features such as scene generation and any sound-generation tool in Studio: Roblox Build (2026-07) is said by press to generate sound, but no Studio sound-generation API or licence terms were found. [S61]

## Sources
[S1] Creator Store, Roblox Creator Docs (Roblox/creator-docs `production/creator-store.md`), read 2026-10-04, https://create.roblox.com/docs/production/creator-store
[S2] Toolbox, Roblox Creator Docs (`projects/assets/toolbox.md`), read 2026-10-04, https://create.roblox.com/docs/projects/assets/toolbox
[S3] Creator Store queries (Marketplace catalog API), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/projects/assets/api
[S4] Toolbox Service OpenAPI (`reference/cloud/toolbox-service/v1.json`), Roblox/creator-docs, read 2026-10-04, https://github.com/Roblox/creator-docs/blob/main/content/en-us/reference/cloud/toolbox-service/v1.json
[S5] Asset privacy, Roblox Creator Docs (`projects/assets/privacy.md`), read 2026-10-04, https://create.roblox.com/docs/projects/assets/privacy
[S6] Asset Manager, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/projects/assets/manager
[S7] Audio assets, Roblox Creator Docs (`audio/assets.md`), read 2026-10-04, https://create.roblox.com/docs/audio/assets
[S8] Audio overview, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/audio
[S9] Usage guide for assets (Open Cloud), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/cloud/guides/usage-assets
[S10] Assets API OpenAPI (`reference/cloud/assets/v1.json`), Roblox/creator-docs, read 2026-10-04, https://github.com/Roblox/creator-docs/blob/main/content/en-us/reference/cloud/assets/v1.json
[S11] Asset Permissions API OpenAPI (`reference/cloud/asset-permissions-api/v1.json`), Roblox/creator-docs, read 2026-10-04, https://github.com/Roblox/creator-docs/blob/main/content/en-us/reference/cloud/asset-permissions-api/v1.json
[S12] Cloud v2 OpenAPI (`reference/cloud/cloud.docs.json`: asset-quotas, generateSpeechAsset, creator-store-products), Roblox/creator-docs, read 2026-10-04, https://github.com/Roblox/creator-docs/blob/main/content/en-us/reference/cloud/cloud.docs.json
[S13] InsertService class reference, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/InsertService
[S14] AssetService class reference, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/AssetService
[S15] AudioSearchParams class reference, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/AudioSearchParams
[S16] AudioPlayer class reference, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/AudioPlayer
[S17] MaterialVariant class reference, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/MaterialVariant
[S18] Materials guide (custom materials, adaptive materials, base-material asset IDs), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/parts/materials
[S19] Texture specifications, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/art/modeling/texture-specifications
[S20] Material Generator, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/studio/material-generator
[S21] General modeling specifications, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/art/modeling/specifications
[S22] Textures and decals (incl. texture streaming), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/parts/textures-decals
[S23] In-experience asset creation, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/projects/assets/in-experience-asset-creation
[S24] Intellectual Property Guidelines, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/production/publishing/ip-guidelines
[S25] AI data sharing, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/ai-data-sharing
[S26] BitFist (Roblox Audio Team), "[Action Needed] Upcoming Changes to Asset Privacy for Audio", DevForum, 2022-03-09, https://devforum.roblox.com/t/action-needed-upcoming-changes-to-asset-privacy-for-audio/1701697 (2022, may be stale)
[S27] BitFist, "[Update] Changes to Asset Privacy for Audio", DevForum, 2022-03-16, https://devforum.roblox.com/t/update-changes-to-asset-privacy-for-audio/1715717 (2022, may be stale)
[S28] FlankaTank, "New Asset Privacy and Permissions Features for Audio and Video", DevForum, 2023-12-01, https://devforum.roblox.com/t/new-asset-privacy-and-permissions-features-for-audio-and-video/2725248 (pre-2024, may be stale)
[S29] AZKOolKAt (Annie, Roblox DevRel), "Public Sound Effects Upload Are Now Available for Creators", DevForum, 2024-05-23, https://devforum.roblox.com/t/public-sound-effects-upload-are-now-available-for-creators/2980704
[S30] "Music on Roblox TOS Rule", DevForum thread (jackjenningsdev, Abroxus replies), 2024-12-14 to 2024-12-29, https://devforum.roblox.com/t/music-on-roblox-tos-rule/3305661 and https://devforum.roblox.com/t/music-on-roblox-tos-rule/3305661/11 (community posters, not staff)
[S31] BigBroGreg (Roblox Music Team), "Amplify Your Experiences with New Music", DevForum, 2024-09-19 (updated 2025-02-13), https://devforum.roblox.com/t/amplify-your-experiences-with-new-music/3164792
[S32] weselito request and complexlint (Roblox staff) reply, "Allow Users to Play Uploaded Audio In-Experience", DevForum, 2025-10-03 and 2025-10-13, https://devforum.roblox.com/t/allow-users-to-play-uploaded-audio-in-experience/3974730
[S33] FlankaTank, "[Beta] Privacy for Newly-Created Image, Mesh, and Decal Assets", DevForum, 2025-09-11 (update 2025-10-15), https://devforum.roblox.com/t/beta-privacy-for-newly-created-image-mesh-and-decal-assets/3930210
[S34] FlankaTank, "[Full Release] Privacy for Newly-Created Image, Mesh, and Decal Assets", DevForum, 2026-05-05, https://devforum.roblox.com/t/full-release-privacy-for-newly-created-image-mesh-and-decal-assets/4620416
[S35] FlankaTank, "Expanded Sharing for Assets", DevForum, 2025-05-07, https://devforum.roblox.com/t/expanded-sharing-for-assets/3641687
[S36] MajesticCatss, "Beta Updates to Revamped Asset Manager", DevForum, 2026-03-30, https://devforum.roblox.com/t/beta-updates-to-revamped-asset-manager/4548832
[S37] Kairomatic (Kero, Creator Store team), "New Creator Store Layout and Search", DevForum, 2026-04-29, https://devforum.roblox.com/t/new-creator-store-layout-and-search/4603900
[S38] californiainus (Chimpanzini), "Filtering to Find 3D Models in the Studio Toolbox!", DevForum, 2024-06-25, https://devforum.roblox.com/t/filtering-to-find-3d-models-in-the-studio-toolbox/3039587
[S39] "Where i can find free meshes/models?", DevForum Game Design Support, 2024-02, https://devforum.roblox.com/t/where-i-can-find-free-meshesmodels/2828086 (community answers, low trust)
[S40] Kairomatic and riddlemasta, "Protect Your Games with Script Capabilities Sandboxing", DevForum, 2026-05-13, https://devforum.roblox.com/t/protect-your-games-with-script-capabilities-sandboxing/4634642
[S41] Fe_ct (reporter) with staff reply EarnestError, "New Creator Store viruses completely bypass sandboxing, running obfuscated code", DevForum, 2026-06-13 (follow-up August 2026), https://devforum.roblox.com/t/new-creator-store-viruses-completely-bypass-sandboxing-running-obfuscated-code/4681322
[S42] riddlemasta (staff), "Models inserted from toolbox have Sandboxing enabled even if sandboxing is disabled in the place", DevForum, 2026-05-09 to 2026-05-26, https://devforum.roblox.com/t/models-inserted-from-toolbox-have-sandboxing-enabled-even-if-sandboxing-is-disabled-in-the-place/4627153
[S43] Creator Roadmap 2026: Fall Update, DevForum, post-RDC 2026 (September 2026; exact post date not captured), https://devforum.roblox.com/t/creator-roadmap-2026-fall-update/4880208
[S44] Creator Roadmap 2026: Spring Update, DevForum, 2026, https://devforum.roblox.com/t/creator-roadmap-2026-spring-update/4625473
[S45] "Can free Roblox marketplace assets be used outside Roblox?", DevForum (answer by Jezzie, no staff reply), 2024-12-22, https://devforum.roblox.com/t/can-free-roblox-marketplace-assets-be-used-outside-roblox/3315235
[S46] "Better guidelines or support for uploading licensed assets that require appropriate credit", DevForum, 2020-05-21 (latest reply 2023-07-03), https://devforum.roblox.com/t/better-guidelines-or-support-for-uploading-licensed-assets-that-require-appropriate-credit/587565 (older than 2024, may be stale)
[S47] Roblox, "Protecting Intellectual Property When Using Generative AI", DevForum, 2024-03-19, https://devforum.roblox.com/t/protecting-intellectual-property-when-using-generative-ai/2881851
[S48] Soundstock, "Too Lost Partners with Roblox to Offer Independent Music Catalog to Game Creators", 2026-07-29 (deal dated 2026-07-28; trade press, third-party), https://www.soundstock.com/news/2026-07-29-too-lost-partners-with-roblox-to-offer-independent-music-catalog-to-game-creators
[S49] Velveteen, "Too Lost Music Is Now in Roblox. Check the Game-Licensing Path Before You Switch Distributors.", 2026-07 (trade commentary, third-party), https://www.velveteen.fm/news/too-lost-roblox-independent-music-catalog
[S50] PCGamesN, "Roblox Creator Marketplace will prioritise verified creators", 2022-08-27, https://www.pcgamesn.com/roblox/roblox-creator-marketplace (2022, may be stale; phone verification has since been dropped per [S1])
[S51] Music Ally, "Roblox moves into music discovery with charts and DistroKid", 2024-09-09 (and CelebrityAccess 2024-09-09; read via search-result text, third-party), https://musically.com/2024/09/09/roblox-moves-into-music-discovery-with-charts-and-distrokid/
[S52] Business Wire / EDM.com, Monstercat and Roblox partnership, 2020-07-28 (search-result text; pre-2024, may be stale), https://www.businesswire.com/news/home/20200728005353/en/Roblox-Developers-Expected-Earn-250-Million-2020
[S53] Vulnerabilities from third-party assets, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/scripting/security/third-party-vulnerabilities
[S54] Poly Haven, License (CC0), read 2026-10-04, https://polyhaven.com/license
[S55] ambientCG, License (CC0 1.0), read 2026-10-04, https://docs.ambientcg.com/license/
[S56] Kenney, Support / asset license (CC0), read 2026-10-04, https://kenney.nl/support
[S57] Freesound, FAQ (licences CC0, CC-BY, CC-BY-NC), read 2026-10-04, https://freesound.org/help/faq/
[S58] Roblox Help, "Using Licensed Music on Roblox" / "Licensed Music Availability" (APM, 250-track limit; page returned 403, cited from search-result text, undated), https://en.help.roblox.com/hc/articles/360000927163
[S59] Roblox Help, "Creator Store Terms" (page returned 403; cited from search-result text), https://en.help.roblox.com/hc/en-us/articles/21308223046932-Creator-Store-Terms
[S60] Studio MCP tool schemas for search_asset, insert_asset, generate_material, generate_texture, upload_image, store_image, http_get, observed in this Claude Code session on 2026-10-04 (not from public docs; may differ by Studio build)
[S61] Internal note `research/roblox/09-tools-ecosystem.md` (2026-10-04), including its sources on the Creator Store virus wave and sandboxing
[S62] Creator Store (Toolbox search, products, saves) endpoints, Cloud API reference, Roblox Creator Docs, https://create.roblox.com/docs/cloud/reference/features/creator-store (read 2026-10-04; confirms beta status of Creator Store search and product endpoints)
[S63] DevForum community threads on "Failed to load sound" (for example https://devforum.roblox.com/t/sounds-failing-to-load/2458118 and https://devforum.roblox.com/t/audio-constantly-fails-to-load/2622687), read via search-result text, 2023 (older than 2024, may be stale)
