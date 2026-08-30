# Golem Asset Strategy — Recommendation

Sections D (curated asset library design) and E (decision). Evidence, source URLs and the
model licence table live in [`3d-asset-pipeline.md`](./3d-asset-pipeline.md).

Written 2026-08-30. **This is a design, not an implementation.** Nothing here was built.

---

## Owner's constraints (binding — quoted)

> "Meshy credits are a build-time creative resource for making the WEBSITE itself more
> impressive" — roughly 2000 credits remain (**verified: 2180**). They are NOT a runtime
> dependency.

> "Do not silently turn Meshy into an uncontrolled per-user production cost."

> "Do not purchase additional credits or services without approval."

> The whole service must stay at roughly **$10/month now** and at most **~$25/month**
> before meaningful revenue.

> The AI core must be open-weight and commercially usable; no dependency on
> paid-per-token APIs.

> "Never guess asset IDs."

---

## Headline recommendation

**Procedural geometry first, Roblox's free first-party `GenerationService` for the things
procedural geometry cannot do, and a small verified library for everything else.**

The nuance that changes the usual answer: runtime 3D generation **is** viable — but only
through `GenerationService`, which is free, first-party, live-verified working from
Golem's plugin (20.1 s, 6k triangles, 10 req/min), and carries **zero marginal cost per
user**. Every *self-hosted or per-generation open model* route is either ~10× over budget,
an uncapped per-user variable cost, or legally unusable. See
[`3d-asset-pipeline.md` §C5](./3d-asset-pipeline.md#c5-could-any-of-this-run-inside-1025month-honest-answer-no).

---

# D. Curated asset library

## D0. The core insight that makes this free

Golem stores **Roblox asset IDs and metadata, never asset bytes.**

Roblox already hosts and CDN-serves the geometry and textures. Golem's job is to remember
*which ID is which thing*, *where it came from*, and *whether it is safe to use*. That is
a few kilobytes per asset — which is why **R2 is not needed** and its absence is not a
blocker.

The second unlock, from
[`3d-asset-pipeline.md` §A3](./3d-asset-pipeline.md#a3-assetservicecreateasset--mesh-upload--open-cloud):

> By default, Images, Decals, and Meshes are created as **Open Use**.
> **Open Use** — Any creator or game can use the asset.
> — <https://create.roblox.com/docs/en-us/projects/assets/privacy.md>

So a **Mesh** or **Image** asset uploaded once under Golem's Roblox account is usable by
*every* customer's experience, by ID, with no ownership relationship and **without** the
per-place "Allow Loading Third Party Assets" toggle. A **Model** asset does not get this
treatment.

> **Design rule #1: the library is keyed on Mesh (`typeId 40`) and Image/Decal asset IDs.
> Never Model IDs.**
>
> **Design rule #2: Golem never re-hosts asset bytes. If it cannot be referenced by a
> Roblox asset ID, it does not go in the library.**

## D1. Layers of the system

```
┌─ Layer 0  PROCEDURAL          Luau generator modules. Zero assets. Zero cost.
│                               Ships as ProceduralModel + generator, or as plain build code.
├─ Layer 1  GOLEM KIT           ~150–400 Mesh + Image asset IDs uploaded once by the owner
│                               from CC0 sources, under Golem's Roblox account.
│                               Open Use → every customer can reference them.
├─ Layer 2  GENERATED           GenerationService:GenerateModelAsync in the user's Studio.
│                               Free, session-scoped, persisted to the *user's* account.
├─ Layer 3  CREATOR STORE       Verified third-party IDs, discovered + vetted at runtime.
│                               Last resort. Highest risk. Strict verification gate.
└─ Layer 4  BUILD-TIME GEN      Meshy / open models on the owner's own machine.
                                Feeds Layer 1 and the marketing site. NEVER runtime.
```

## D2. Where legally-clean CC0 assets come from — verified

I checked each licence claim myself. Results:

| Source | Licence — **verified how** | Commercial | Attribution | Content | Trust |
|---|---|---|---|---|---|
| **Kenney** — <https://kenney.nl> | **CC0.** Read directly off a live asset page (`kenney.nl/assets/city-kit-suburban`), which states **"License: Creative Commons CC0"** | Yes | **Not required** | Low-poly modular kits: city, nature, castle, space, platformer, prototype textures, UI icons. ~14 pages of packs. | **Highest.** Single known author, consistent style, no third-party uploads. |
| **Quaternius** — <https://quaternius.com> | **CC0.** Read off a live pack page (`quaternius.com/packs/ultimatemodularwomen.html`), which renders **"License: CC0"** | Yes | Not required | Low-poly characters (animated), nature, buildings, medieval, sci-fi, vehicles, FPS. | **Highest.** Single author, game-ready topology, FBX/OBJ/glTF. |
| **ambientCG** — <https://ambientcg.com> | **CC0.** Site states verbatim: *"All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances."* | Yes | **Not required** | PBR surfaces, decals, atlases, HDRIs, substances, some 3D models, terrain. | **Highest.** Best source for `SurfaceAppearance` / `MaterialVariant` maps. |
| **Poly Pizza** — <https://poly.pizza> | **MIXED — CC0 *and* CC-BY.** Homepage advertises *"10,600+ free models"*. Licence terms are **per-model**, not site-wide; I could not read the API docs page (SPA) and the API returned `401 {"error":"You need an API key to do that dingus"}`, so **the licence field name and per-model split are UNVERIFIED**. | Per model | **Per model — CC-BY items require credit** | Low-poly models, largely rescued Google Poly archive. | **Medium.** Must filter to CC0 per item and record the licence with each asset. |
| **OpenGameArt** — <https://opengameart.org> | **MIXED and self-declared.** FAQ confirms multiple licences (CC0, CC-BY, CC-BY-SA, GPL, OGA-BY) chosen per submission, and states *"Yes, you can use any of the art submitted to this site. Even in commercial projects. Just be sure to adhere to the license terms."* It also has a *"Someone uploaded my art here without my permission. Can you take it down?"* FAQ entry. | Per item | Per item; the FAQ says *"you should assume that all work contained on OpenGameArt requires it unless otherwise specified"* | Mostly 2D; some 3D. | **Lowest.** Uploader-declared licences + a takedown process implies mislabelling happens. **Use CC0-only, and only for textures.** |

**Rules that follow:**

1. **Kenney, Quaternius and ambientCG are the backbone.** All three are single-author,
   uniformly CC0, verified at source. They alone can supply a complete stylistically
   coherent kit.
2. **CC-BY is allowed but must be tracked**, because attribution has to survive into
   whatever Golem builds. If a CC-BY asset is used, Golem must emit a credits object into
   the generated place (a `StringValue`/`ModuleScript` in `ReplicatedStorage`, plus a
   line in the place description). Simpler alternative: **exclude CC-BY entirely from v1**
   and take only CC0. Recommended for v1.
3. **CC-BY-SA and GPL are excluded outright.** Share-alike and source-distribution
   obligations cannot be discharged coherently inside a Roblox place.
4. **OpenGameArt is CC0-only, textures-only, and hand-reviewed.**
5. Re-verify every source licence at ingest time and store the fetched licence string
   verbatim — never a remembered value. Licences change; sites get redesigned.

## D3. Provenance record — exact schema

Two D1 tables plus one Vectorize index. This is the authoritative record for every asset
Golem can reference.

```sql
-- ============================================================
-- Every asset Golem is allowed to reference, with full provenance.
-- Storage: metadata only. No geometry, no textures, no bytes.
-- ============================================================
CREATE TABLE asset_library (
  -- Identity --------------------------------------------------
  id                TEXT PRIMARY KEY,       -- 'kenney/city-kit/building-a-01' — stable, human-readable
  roblox_asset_id   INTEGER NOT NULL,       -- the ONLY thing the plugin ever inserts
  roblox_asset_type TEXT    NOT NULL,       -- 'Mesh' | 'Image' | 'Decal' | 'Model'
                                            --   'Model' is DISCOURAGED: needs the per-place
                                            --   third-party-asset toggle. See design rule #1.
  roblox_texture_id INTEGER,                -- companion Image asset id, if any
  roblox_owner_id   INTEGER NOT NULL,       -- Roblox user/group that owns roblox_asset_id
  roblox_owner_type TEXT    NOT NULL,       -- 'User' | 'Group'
  asset_privacy     TEXT    NOT NULL,       -- 'OpenUse' | 'Restricted' | 'Unknown'
                                            --   Restricted assets MUST NOT enter the library.

  -- Provenance: where the geometry actually came from ----------
  source_kind       TEXT NOT NULL,          -- 'cc0_pack' | 'roblox_official' | 'creator_store'
                                            -- | 'generated_roblox' | 'generated_external' | 'procedural'
  source_site       TEXT,                   -- 'kenney.nl' | 'quaternius.com' | 'ambientcg.com'
                                            -- | 'poly.pizza' | 'opengameart.org' | 'meshy.ai' | NULL
  source_url        TEXT,                   -- exact page the asset was obtained from
  source_pack       TEXT,                   -- 'City Kit (Suburban)'
  source_author     TEXT,                   -- 'Kenney' | 'Quaternius' | Roblox username
  source_retrieved_at TEXT NOT NULL,        -- ISO 8601, when we downloaded/observed it

  -- Licence: recorded verbatim, never inferred ------------------
  licence_id        TEXT NOT NULL,          -- 'CC0-1.0' | 'CC-BY-4.0' | 'ROBLOX-TOU'
                                            -- | 'MESHY-PREMIUM' | 'MESHY-FREE-CCBY4'
                                            -- | 'ROBLOX-GENERATED' | 'NONE-PROCEDURAL'
  licence_text_seen TEXT NOT NULL,          -- verbatim string read off the source page,
                                            --   e.g. 'License: Creative Commons CC0'
  licence_url       TEXT,                   -- page the above string was read from
  licence_verified_at TEXT NOT NULL,        -- ISO 8601, when a human/script last read it
  licence_verified_by TEXT NOT NULL,        -- 'owner' | 'ingest-script-v1'
  attribution_required INTEGER NOT NULL DEFAULT 0,   -- 0/1
  attribution_text  TEXT,                   -- exact credit line to emit if required
  redistribution_ok INTEGER NOT NULL DEFAULT 0,      -- may this be re-uploaded to Roblox?

  -- Semantics: what it IS --------------------------------------
  category          TEXT NOT NULL,          -- 'ground'|'building'|'prop'|'foliage'|'character'
                                            -- |'vehicle'|'ui_icon'|'texture'|'particle'
  subcategory       TEXT,                   -- 'house'|'tree_conifer'|'crate'
  style_tags        TEXT NOT NULL,          -- JSON array: ["lowpoly","flat-shaded","cartoon"]
  keywords          TEXT NOT NULL,          -- JSON array, for FTS5
  description       TEXT NOT NULL,          -- one sentence; also the embedding input

  -- Technical --------------------------------------------------
  tri_count         INTEGER,
  vert_count        INTEGER,
  bbox_studs        TEXT,                   -- JSON [x,y,z] at scale 1
  pivot_hint        TEXT,                   -- 'base_center' | 'centroid' | 'unknown'
  has_texture       INTEGER NOT NULL DEFAULT 0,
  grid_module       REAL,                   -- 4.0 = snaps to a 4-stud modular kit grid

  -- Safety -----------------------------------------------------
  has_scripts       INTEGER NOT NULL DEFAULT 0,   -- MUST be 0 for anything auto-inserted
  script_count      INTEGER NOT NULL DEFAULT 0,
  should_sandbox    INTEGER NOT NULL DEFAULT 0,
  moderation_state  TEXT,                   -- 'APPROVED'|'PENDING'|'REJECTED'|'UNKNOWN'

  -- Lifecycle --------------------------------------------------
  status            TEXT NOT NULL DEFAULT 'active',  -- 'active'|'quarantined'|'retired'
  last_health_check TEXT,                   -- ISO 8601 — last time the ID was re-verified live
  health_ok         INTEGER NOT NULL DEFAULT 1,
  notes             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_asset_roblox_id ON asset_library(roblox_asset_id);
CREATE INDEX idx_asset_cat   ON asset_library(category, subcategory, status);
CREATE INDEX idx_asset_lic   ON asset_library(licence_id, status);
CREATE INDEX idx_asset_health ON asset_library(status, last_health_check);

-- FTS5 keyword search, mirroring the pattern already used by golem-corpus
CREATE VIRTUAL TABLE asset_library_fts USING fts5(
  id UNINDEXED, description, keywords, style_tags, subcategory,
  content='asset_library', content_rowid='rowid'
);

-- ============================================================
-- Append-only audit log. Never updated, never deleted.
-- This is what makes "never guess asset IDs" auditable after the fact.
-- ============================================================
CREATE TABLE asset_verification_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  roblox_asset_id   INTEGER NOT NULL,
  checked_at        TEXT    NOT NULL,       -- ISO 8601
  check_source      TEXT    NOT NULL,       -- 'toolbox_v1_details'|'assets_v1'|'toolbox_v2_search'
                                            -- |'thumbnail'|'manual'
  http_status       INTEGER,
  resolved_name     TEXT,
  resolved_type_id  INTEGER,
  resolved_creator_id INTEGER,
  resolved_is_verified_creator INTEGER,
  resolved_is_free  INTEGER,
  resolved_has_scripts INTEGER,
  resolved_tri_count   INTEGER,
  verdict           TEXT NOT NULL,          -- 'pass'|'fail_not_found'|'fail_wrong_type'
                                            -- |'fail_has_scripts'|'fail_not_free'
                                            -- |'fail_unverified_creator'|'fail_moderated'
  raw_response      TEXT,                   -- truncated JSON, ≤ 8 KB (D1 row cap is 2 MB)
  requested_by      TEXT                    -- session/project id that triggered the check
);
CREATE INDEX idx_verif_asset ON asset_verification_log(roblox_asset_id, checked_at DESC);
```

**Why every field earns its place:** `licence_text_seen` + `licence_url` +
`licence_verified_at` mean a future dispute can be answered with *"here is the exact string
we read, on this page, on this date"* rather than *"we thought it was CC0."*
`asset_verification_log` is append-only so the "never guess IDs" rule is provable, not just
asserted.

## D4. Semantic search

Golem already runs hybrid RAG (Vectorize `golem-docs` + D1 FTS5, bge-small 384d). Reuse it
verbatim — no new technology.

- **New Vectorize index `golem-assets`**, 384 dimensions (bge-small, already wired).
- **Embedding input:** `"{category} {subcategory}: {description}. Style: {style_tags}.
  {keywords}"` — one vector per asset.
- **Vector metadata** (Vectorize allows 10 KiB/vector; keep it small): `{ id, category,
  licence_id, tri_count, attribution_required, status }`. Filter on `category` and
  `status` at query time so retrieval never surfaces quarantined assets.
- **Hybrid:** run Vectorize top-K (max 50 with metadata) and D1 FTS5 in parallel, merge by
  reciprocal rank fusion — identical to the existing docs pipeline.
- **Rerank cheaply** by a deterministic score: exact-category match, `grid_module`
  compatibility with the scene's grid, `tri_count` inside the remaining scene budget,
  style-tag agreement with the project's declared style.
- **Style coherence is the thing that actually matters.** Retrieval must strongly prefer
  assets sharing the project's `style_tags`. A Kenney house next to a photoreal rock looks
  worse than two grey boxes. Encode the project's chosen style once at project creation and
  hard-filter on it.

## D5. How big can this get on D1? Comfortably bigger than needed.

Verified limits (<https://developers.cloudflare.com/d1/platform/limits/>):

| Limit | Value |
|---|---|
| Maximum database size | **10 GB (Workers Paid) / 500 MB (Free)** — *"the 10 GB limit of a D1 database cannot be further increased"* |
| Maximum storage per account | 1 TB (Paid) / 5 GB (Free) |
| Maximum string, BLOB or table row size | **2,000,000 bytes (2 MB)** |
| Maximum SQL statement length | 100,000 bytes |
| Maximum bound parameters per query | **100** |
| Maximum columns per table | 100 |
| Rows per table | Unlimited (within storage) |
| Queries per Worker invocation | 1000 (Paid) / 50 (Free) |
| Maximum SQL query duration | 30 seconds |

Sizing `asset_library`: a row is roughly **1.2–2 KB** (mostly `description`, `keywords`,
`licence_text_seen`). With FTS5 index overhead, budget **~4 KB per asset**.

| Library size | D1 storage | % of 10 GB | % of 500 MB free |
|---|---|---|---|
| 500 assets | ~2 MB | 0.02% | 0.4% |
| 5,000 assets | ~20 MB | 0.2% | 4% |
| 50,000 assets | ~200 MB | 2% | 40% |
| 500,000 assets | ~2 GB | 20% | over |

**Conclusion: D1 is not a constraint.** The realistic library — 150–400 curated assets —
uses ~1.5 MB. Even a 50,000-asset Creator Store cache fits inside 2% of a paid D1.

The *real* constraint is D1's single-threaded write path (*"Each individual D1 database is
inherently single-threaded, and processes queries one at a time"*), so keep the library
read-mostly: bulk-ingest offline, serve reads with indexed lookups, and never write to it
on the hot path. Note also **max 100 bound parameters per query** — batch inserts must be
chunked.

Vectorize (<https://developers.cloudflare.com/vectorize/platform/limits/>): 20M vectors per
index, 1536 max dimensions, 10 KiB metadata/vector, topK 50 with metadata. A 5,000-asset
library at 384d is **0.02%** of one index.

## D6. Seeding the library (a one-time owner task, not a runtime feature)

1. Pick **one** visual style. Recommendation: **Kenney + Quaternius low-poly flat-shaded**,
   because both are CC0, single-author, and mutually coherent.
2. Download the relevant CC0 packs. Target ~150–400 assets covering:
   modular building kit (~40), nature/foliage (~40), props (~60), vehicles (~20),
   characters (~15), ground/terrain textures + PBR sets from ambientCG (~40),
   UI icons (~40).
3. **Import into Studio** via the 3D Importer (glTF/FBX). This is the reliable path — the
   Open Cloud `Mesh` type explicitly *"Only content downloaded from Asset delivery API is
   accepted"*, so arbitrary mesh binaries cannot be pushed through it. Importing produces
   Mesh + Image assets under the importing account, **Open Use by default**.
4. Capture the resulting asset IDs, triangle counts, bounding boxes and pivots.
5. Write the `asset_library` rows with **verbatim** licence strings and source URLs.
6. Generate embeddings, upsert to Vectorize.

Estimated effort: **one focused day** for ~200 assets. Estimated cost: **$0.**

Optional Layer-4 enrichment with the existing **2180 Meshy credits**: generate 20–40 hero
props on the owner's machine, import them the same way, and mark them
`source_kind='generated_external'`, `source_site='meshy.ai'`. **Blocked pending
verification of the Meshy plan** — see §E4.

---

# E. Decision

## E1. Decision table

For each need: first / second / third choice, and the verification step that gates use.

| Need | 1st choice | 2nd choice | 3rd choice | Verification gate |
|---|---|---|---|---|
| **Ground / terrain** | **Roblox `Terrain`** (`FillRegion`, `FillBall`, `FillWedge`, `WriteVoxels`) — free, no assets, looks good | Large Parts with a correct built-in `Material` (`Grass`, `Slate`, `Ground`) | Library `MaterialVariant` / `SurfaceAppearance` from ambientCG | None for terrain/materials (no asset IDs involved). For library textures: §E2 steps 1–3. |
| **Building / architecture** | **Procedural: modular kit on a 4- or 5-stud grid + wedge roofs + trim on every edge**, emitted as a `ProceduralModel` generator | Library modular kit meshes (Kenney City/Castle) | `GenerateModelAsync` for one hero structure only | Procedural: none. Library: §E2. Generated: §E3 (persistence). **Never** Creator Store for buildings — they carry scripts. |
| **Prop (crate, barrel, lamp, sign)** | Library mesh (Kenney/Quaternius) | Procedural CSG (`SubtractAsync` / `SweepPartAsync`) for simple regular forms | `GenerateModelAsync` for anything genuinely bespoke | Library: §E2. Generated: §E3. |
| **Foliage (trees, bushes, grass)** | **Library mesh — mandatory.** Procedural foliage always looks amateur | `GenerateModelAsync` for one signature species | Creator Store, `creatorTargetId=1` (Roblox-authored) only | §E2 / §E3 / §E4. |
| **Character / NPC** | **Roblox default rig / `HumanoidDescription`** — free, animated, moderated, familiar | Library character mesh (Quaternius, already rigged) | `GenerateModelAsync` **only** for static statues/mannequins — it does not rig | Library: §E2 + confirm rig compatibility. Generated: static only. **Never** Creator Store characters (scripts). |
| **Vehicle** | **`GenerateModelAsync` with `PredefinedSchema = "Car5"`** — this is exactly what the schema exists for, and the docs ship a retargetable `CarBehavior` module | Library vehicle mesh + hand-written constraints | Procedural box-car (looks bad; last resort) | §E3. |
| **UI icon** | **Library CC0 icon sheet** (Kenney UI packs) uploaded once as Image assets | Procedurally drawn `Frame`/`UIStroke`/`UICorner` shapes — free, sharp, no assets | Roblox built-in icons | §E2. |
| **Texture / material** | **Roblox built-in `Enum.Material`** — free, already PBR, zero assets | Library ambientCG PBR set → `MaterialVariant` / `SurfaceAppearance` | Studio **Material Generator** (human, in Studio — no API) | Library: §E2. Material Generator: human-in-the-loop only. |
| **Particle effect** | **Procedural `ParticleEmitter` / `Beam` / `Trail` config** — pure property values, zero assets | Library sprite Image asset + procedural emitter config | — | Sprite: §E2. Emitter config: none needed. |
| **Lighting / atmosphere** | **Procedural: `Atmosphere`, `Sky`, `ColorCorrection`, `Bloom`, `Lighting.Technology = Future`** | — | — | None. **Highest quality-per-effort in the whole table — do this first.** |

**Two rules that fall out of the table:**

1. **Foliage and characters are the *only* categories where procedural loses outright.**
   Everything else has a good procedural or built-in answer. This is where the library
   budget should be spent.
2. **Lighting and materials are free and move perceived quality more than geometry.**
   If Golem does only one thing, it should be: set `Material` correctly on every part and
   configure `Atmosphere` + `Future` lighting on every place.

## E2. Verification procedure — "never guess asset IDs"

**The invariant: an asset ID may only be inserted if it came out of a search response and
passed verification within the last 24 hours, with the check recorded in
`asset_verification_log`. An ID that appears in an LLM's output text and nowhere else is
never inserted.**

Runs **in the Worker**, never in the plugin (`HttpService` blocks plugin calls to
`apis.roblox.com` without `x-api-key`).

**Step 0 — Provenance gate.** Where did this ID come from?
- From `asset_library` → skip to step 4 (periodic health check only).
- From a Creator Store search response in this session → continue.
- **From model output text, a cached prompt, or anywhere else → REJECT. No exceptions.**
  Log `verdict='fail_not_found'` with `check_source='manual'` and move on.

**Step 1 — Discover, don't invent.** Official, key-gated:
```
POST https://apis.roblox.com/toolbox-service/v2/assets:search
     x-api-key: <ROBLOX_API_KEY>        scope: creator-store-product:read
     { "searchCategoryType": …, "query": "<term>", "pageToken": … }
```
1000 req/min per key owner. Free key from
<https://create.roblox.com/dashboard/credentials>. Supports `includeOnlyVerifiedCreators`
and `maxPriceCents` — **set both**. On 429: exponential backoff from 1 s (documented).

Undocumented fallback, no key, cache aggressively (100 req/min per IP observed):
```
GET https://apis.roblox.com/toolbox-service/v1/marketplace/{10|40|13}?keyword=…&limit=…
    [&creatorTargetId=1&creatorType=1]      ← Roblox-authored only
```

**Step 2 — Resolve the ID to a real object.**
```
GET https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=<ids>
```
No auth. Rate limit headers observed: `x-ratelimit-limit: 100, 100;w=60`. Returns
`asset.name`, `asset.typeId`, `asset.hasScripts`, `asset.scriptCount`,
`asset.modelTechnicalDetails.objectMeshSummary.{triangles,vertices}`,
`asset.capabilities.shouldSandbox`, `asset.visibilityStatus`, `asset.isEndorsed`,
`creator.{id,name,isVerifiedCreator}`, `voting.upVotePercent`,
`fiatProduct.{isFree,purchasable,published}`.

**Step 3 — Apply the hard gate.** Every one of these must hold, or reject:

| # | Assertion | Field |
|---|---|---|
| 1 | The ID resolves at all | HTTP 200, non-empty `data` |
| 2 | Type is what we asked for | `asset.typeId` ∈ {10 Model, 40 MeshPart, 13 Decal} and matches intent |
| 3 | It is actually free | `fiatProduct.isFree == true` **and** `fiatProduct.purchasable == true` |
| 4 | It is publicly visible | `asset.visibilityStatus == 1` |
| 5 | **No scripts** | `asset.hasScripts == false` **and** `asset.scriptCount == 0` |
| 6 | Not sandbox-flagged | `asset.capabilities.shouldSandbox == false` |
| 7 | Trusted creator | `creator.id == 1` (Roblox) **or** `creator.isVerifiedCreator == true` **or** (`asset.isEndorsed == true`) |
| 8 | Community signal | `voting.upVotePercent ≥ 70` **and** `voting.voteCount ≥ 20` (skip if `creator.id == 1`) |
| 9 | Within budget | `objectMeshSummary.triangles ≤ remaining scene triangle budget` |
| 10 | Depicts the right thing | thumbnail fetched and confirmed — see step 3b |

**Assertion 5 is non-negotiable.** Free Roblox models are the classic vector for backdoor
scripts. Golem must never auto-insert an asset containing a script. If a script-bearing
asset is genuinely wanted, it goes to a human.

**Step 3b — Visual confirmation.** Fetch
`https://thumbnails.roblox.com/v1/assets?assetIds=<id>&size=420x420&format=Png` (public,
no auth, verified live) and confirm the render matches the intent — either via a vision
check or by surfacing it to the user before insertion. Metadata lies; renders do not.

**Step 4 — Record.** Write one `asset_verification_log` row per check, pass or fail, with
`raw_response` truncated to ≤8 KB. Never write a `verdict='pass'` row without the
underlying HTTP response.

**Step 5 — Insert.** Only now, and only via the plugin adapter:
```lua
-- CORRECT: works from a plugin (PluginSecurity), verified live
local objects = game:GetObjects("rbxassetid://" .. assetId)

-- WRONG: fails from a plugin even for free public-domain assets —
-- "User is not authorized to access Asset."
-- local model = InsertService:LoadAsset(assetId)
```

> ### CONFIRMED LIVE BUG — fix required
> `apps/plugin/src/Ops.luau:415` currently calls `InsertService:LoadAsset(op.assetId)`
> inside the `insert_asset` handler (service acquired line 9). This **fails from a plugin**.
> Replace with `game:GetObjects("rbxassetid://" .. op.assetId)` — note it returns an
> **array of Instances**, not a single Model, so the call site changes. Wrap it in one
> adapter function so the eventual deprecation of `GetObjects` is a one-line fix.

**Step 6 — Health check.** Nightly cron over `asset_library` where
`last_health_check < now - 7 days`: re-run steps 2–3. On failure set
`status='quarantined'`, `health_ok=0`. Assets get moderated, deleted and privated after the
fact; a library that never re-checks will rot.

## E3. Persistence procedure for generated geometry

`GenerateModelAsync` output is `Content{SourceType=Opaque}` with no `MeshId` and does
**not** survive save/publish. Without this step the capability is a demo.

```
1. plugin: GenerateModelAsync({TextPrompt=…, MaxTriangles=6000, GenerateTextures=true},
                              {PredefinedSchema="Body1"})        ~20 s, free, 10/min
2. plugin: show the result to the user; only proceed on acceptance
   (this also puts a human in the loop before anything is uploaded)
3. plugin, per MeshPart:
     em  = AssetService:CreateEditableMeshAsync(part.MeshContent)
     ok, res, meshId  = pcall(AssetService.CreateAssetAsync, AssetService, em,
                              Enum.AssetType.Mesh,
                              {CreatorId = <Studio user id>,
                               CreatorType = Enum.AssetCreatorType.User,
                               Name = …, Description = "Generated by Golem"})
     ei  = AssetService:CreateEditableImageAsync(part.TextureContent)
     ok, res, imgId   = pcall(AssetService.CreateAssetAsync, AssetService, ei,
                              Enum.AssetType.Image, {…same…})
4. plugin: rebuild a persistent MeshPart —
     AssetService:CreateMeshPartAsync(Content.fromAssetId(meshId))
     …and wire imgId as TextureID / SurfaceAppearance
5. worker: record in asset_library with
     source_kind='generated_roblox', licence_id='ROBLOX-GENERATED',
     roblox_owner_id=<the user>, moderation_state='PENDING'
6. worker: poll moderation asynchronously. Never block the build step on it.
```

**Cost: $0.** `GenerationService` is free in beta; `CreateAssetAsync` is free; no Robux, no
API key, no Open Cloud round trip.

**Moderation delay:** not documented as a bounded SLA. Treat as asynchronous; the geometry
is visible in the user's own place immediately and only the *shareable asset* is gated.

**Assets are created under the customer's own Roblox account**, which is the correct
ownership model — Golem never becomes the rights-holder, never carries the storage, and
never has to warrant title.

**Two things to test before relying on this** (both flagged UNVERIFIED in
[`3d-asset-pipeline.md` §A0](./3d-asset-pipeline.md#persistence-path-for-generated-geometry-design-partly-unverified)):
1. Does an edit-mode plugin need the Creator Dashboard **Enable Mesh / Image APIs** toggle
   (and therefore ID verification)? The docs scope that requirement to *published
   experiences*, but it was not tested.
2. Do `CreateEditableMeshAsync`'s ownership rules bite on `SourceType=Opaque` content that
   has no asset ID? They should not, but it was not tested.

If either test fails, fall back to Open Cloud upload with user OAuth (`asset:write`) — same
$0 cost, more engineering, and it needs an OAuth app registration.

## E4. Cost analysis

### Recurring monthly cost of the recommendation

| Item | Cost | Basis |
|---|---|---|
| Cloudflare Workers Paid | **$5.00** | already being paid |
| D1 storage (library ~20 MB) | **$0.00** | 5 GB included on Paid (<https://developers.cloudflare.com/d1/platform/pricing/>) |
| D1 reads (library lookups) | **$0.00** | 25 billion rows read/month included |
| D1 writes (verification log) | **$0.00** | 50 million rows written/month included |
| Vectorize `golem-assets` — 5,000 vectors × 384d stored | **$0.00** | 1.92M stored dims vs 10M included on Paid |
| Vectorize queries — 100,000 searches/month | **$0.00** | `(100,000 + 5,000) × 384 = 40.3M` queried dims vs **50M included** |
| Workers AI (embeddings, bge-small) | **$0.00** | inside existing allocation |
| Roblox Open Cloud API key | **$0.00** | free to create |
| Creator Store search v2 | **$0.00** | free, 1000 req/min |
| `toolbox-service/v1` search + details | **$0.00** | free, no key |
| Thumbnails API | **$0.00** | free, no key |
| `GenerationService:GenerateModelAsync` | **$0.00** | **free while in beta** (live-verified) |
| `AssetService:CreateAssetAsync` | **$0.00** | free |
| CC0 asset packs (Kenney/Quaternius/ambientCG) | **$0.00** | CC0 |
| **Total recurring** | **$5.00/month** | |

**Headroom: $5/month against the $10 target, $20/month against the $25 ceiling.**

Vectorize headroom before any charge: **~200,000 asset searches/month** on Workers Paid.
Beyond that the overage is $0.01 per million queried dimensions — i.e. **1,000,000 extra
searches ≈ $3.90/month**. Even a runaway search pattern stays inside the ceiling.

### What the rejected options would have cost

| Option | Monthly cost at low volume | Verdict |
|---|---|---|
| Self-host TRELLIS.2-4B, RTX 4090 always-on | **$245** ($0.34/hr × 720) | **~10× the ceiling.** Out. |
| Self-host, 1 hr/day scale-to-zero | **~$10** | Consumes the entire budget for a service with minutes-long cold starts. Out. |
| fal.ai TRELLIS @ $0.02/generation | $10–25 buys **500–1,250 generations/month total** | Uncapped per-user variable cost. Explicitly ruled out by the owner. Out. |
| Replicate TRELLIS @ ~$0.034/run | $10–25 buys **294–735 runs/month total** | Same objection, worse rate. Out. |
| Meshy Pro | **$20/month** for 1,000 credits ≈ 33–50 textured image-to-3D | Would consume 80% of the ceiling and reintroduce exactly the per-user cost the owner forbade. Out as a *runtime* dependency. |
| HF PRO for ZeroGPU priority | **$9/month** | Buys priority on a service with no uptime guarantee and no API contract. Out. |
| **`GenerationService`** | **$0** | **In.** |

### Meshy credits — build-time only

2180 credits, verified live. Per the MCP server's published cost table: text-to-3D 5–20,
image-to-3D 20–35 (meshy-7 with texture = 30), retexture 10, remesh 5, convert 1.
So 2180 credits ≈ **~70 fully-textured image-to-3D generations** or **~430 cheap
text-to-3D**.

Allocation, consistent with the owner's stated intent:
- **Marketing site hero assets** — the stated purpose. Priority.
- **20–40 library seed props** where no CC0 equivalent exists.
- **Zero runtime use. Zero per-user use. No auto-spend path in any code path.**

> **BLOCKER — resolve before publishing anything made with these credits.**
> Meshy's pricing page states: *"If you are on a free plan, we grant you a CC BY 4.0
> license instead"* versus *"If you are on a premium plan, you own all assets you create
> with Meshy."* (<https://www.meshy.ai/pricing>). **Which plan the 2180 credits sit under
> is UNVERIFIED.** If free-plan, every Meshy asset shipped on the marketing site or in the
> library requires visible CC BY 4.0 attribution. Check the account before use.

### Guardrail to implement regardless

Hard-code a per-project and per-day cap on `GenerateModelAsync` calls (the observed
platform limit is 10/min; Golem should sit well under it, e.g. 3 per project, 30/day
account-wide), enforced in the Worker's Sparks/Quota DO. Free today ≠ free forever;
the cap means a pricing change is a config edit, not an incident.

## E5. Implementation order (highest value first)

1. **Fix `apps/plugin/src/Ops.luau:415`** — `InsertService:LoadAsset` →
   `game:GetObjects`. Confirmed broken.
2. **Lighting + materials pass.** Make every generated place set `Lighting.Technology =
   Future`, an `Atmosphere`, a considered `TimeOfDay`, and a correct `Enum.Material` on
   every part. **Zero assets, zero cost, biggest visible improvement available.**
3. **Modular-kit procedural generators.** Teach the agent to emit `ProceduralModel`
   generator modules on a 4–5 stud grid, with wedge roofs and trim on every edge.
4. **Seed the CC0 library** (one day, $0) and wire the hybrid search.
5. **`GenerationService` integration** behind the E3 persistence flow and the E4 cap, with
   the two UNVERIFIED items tested first.
6. **Creator Store fallback** behind the full E2 gate — last, because it carries the most
   risk for the least differentiation.

---

## What would require the owner's money or approval

Nothing in the recommendation requires either. Everything below is **out of scope until
explicitly approved**:

1. **Buying Meshy credits, or any Meshy plan upgrade.** Not needed; 2180 remain and they
   are build-time only. *(Note: if the account is on the free plan, upgrading is the only
   way to get ownership rather than CC BY 4.0 on outputs — that is a decision for the
   owner, not an implementation detail.)*
2. **Any pay-per-generation 3D API** — fal.ai, Replicate, Tripo, Meshy API, or similar.
   Rejected on cost model, not just price.
3. **Renting a GPU** (RunPod, Modal, Lambda, HF Inference Endpoints) to self-host TRELLIS
   or any open 3D model. $245/month always-on; ~$10/month with unusable cold starts.
4. **Hugging Face PRO** ($9/month) for ZeroGPU priority.
5. **Cloudflare R2** — deliberately not needed. The design stores IDs, not bytes.
6. **A Roblox Creator Store seller account**, or Creator Store distribution of Golem's
   library. Requires government-ID verification and a Stripe onboarding, and is not needed
   because Mesh/Image assets are Open Use by default.
7. **Roblox ID verification for the Golem account** — would only be needed to (a) raise
   Creator Store distribution limits from 10 to 200 per 30 days, or (b) enable
   `EditableMesh`/`EditableImage` in *published* experiences. Neither is required by the
   recommended design, but (b) becomes relevant if the E3 UNVERIFIED tests fail.
8. **Registering a Roblox OAuth 2.0 application** (fallback persistence path). Free, but it
   is a public-facing registration in the owner's name and needs a decision.
9. **Legal review of two things**, if Golem ever makes IP warranties to paying customers:
   - the Roblox Terms of Use position on ownership of `GenerationService` output
     (Roblox publishes no dedicated page; `/ai/safety-best-practices` and
     `/ai/data-and-privacy` both 404);
   - whether AI-generated geometry can be warranted as clean title at all, given
     Objaverse-derived training data and unsettled copyright law.
10. **Any use of Hunyuan3D, Cube3D weights, or Hunyuan3D-Part.** Not a money question — a
    licence one. Hunyuan3D's licence **excludes the EU, UK and South Korea**; Cube3D's real
    licence is **research-only** despite its `openrail` tag; Hunyuan3D-Part has **no
    licence at all**. All three are off the table without written permission from the
    rights-holders.

---

*Evidence and source URLs: [`3d-asset-pipeline.md`](./3d-asset-pipeline.md).*
