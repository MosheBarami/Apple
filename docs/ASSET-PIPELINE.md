# The asset pipeline

Golem's instinct, left alone, is to search the toolbox for a tree. That instinct is wrong in almost
every row of the table below, and in two rows it is actively dangerous: free Roblox *Models* are
the classic delivery vehicle for backdoor scripts.

This document describes the machinery that decides **where a piece of a scene comes from**, and
the two gates that stand between "an id appeared somewhere" and "that geometry is now in a
customer's place".

Evidence base: [`research/3d-asset-pipeline.md`](./research/3d-asset-pipeline.md) and
[`research/asset-strategy.md`](./research/asset-strategy.md). Everything marked *verified* below was
tested against a live Studio edit-mode DataModel or read off a live page, not inferred from docs.

---

## 1. The shape of the system

```
┌─ Layer 0  PROCEDURAL          Luau the agent writes. Zero assets. Zero cost. Wins almost everywhere.
├─ Layer 1  GOLEM KIT           Mesh + Image asset IDs uploaded once from CC0 sources.
│                               Open Use by default → every customer can reference them by id.
├─ Layer 2  GENERATED           GenerationService:GenerateModelAsync in the user's own Studio.
│                               Free, ~20s, session-scoped, 10 req/min.
├─ Layer 3  CREATOR STORE       Third-party ids, discovered and vetted at runtime. Last resort.
└─ Layer 4  BUILD-TIME GEN      Meshy / open models on the owner's machine. NEVER runtime. See §6.
```

The insight that makes Layer 1 free: **Golem stores Roblox asset IDs and metadata, never asset
bytes.** Roblox already hosts and CDN-serves the geometry. A provenance row is ~1.5 KB, so a
400-asset library is ~1.5 MB of D1. R2 is not needed and its absence is not a blocker.

Two rules follow, and both are enforced in code:

1. **The library is keyed on Mesh and Image/Decal ids, never Model ids.** Images, Decals and Meshes
   are created *Open Use* by default; Models are not, and Models are the container type that can
   carry scripts.
2. **Golem never re-hosts asset bytes.** If a thing cannot be referenced by a Roblox asset id, it
   does not go in the library.

### Files

| File | What it is |
|---|---|
| `apps/worker/src/assets.ts` | Decision table, QC thresholds, scale envelopes, Creator Store search + verification gate |
| `apps/worker/src/asset-library.ts` | Provenance record, licence registry, D1 schema, hybrid search, seed manifest |
| `apps/plugin/src/Generation.luau` | `GenerateModelAsync` wrapper, the single `GetObjects` adapter, and `Generation.inspect()` — the QC gate |
| `packages/evals/src/asset-qc.test.mjs` | 75 `node --test` tests over all of the above's pure logic |

---

## 2. The decision table, as built

`chooseAssetSource(need)` returns an ordered list of `{ source, rationale, verification }`.
Sources are `procedural | library | generation_service | creator_store | terrain | builtin`.

| Need | 1st | 2nd | 3rd | 4th | Notes |
|---|---|---|---|---|---|
| **ground** | `terrain` | `builtin` | `library` | — | Roblox Terrain beats any slab a model will author |
| **building** | `procedural` | `library` | `generation_service` | — | **Creator Store excluded** — that is where script-bearing models live |
| **prop** | `library` | `procedural` | `generation_service` | `creator_store` | Creator Store is genuinely last |
| **foliage** | `library` | `generation_service` | `creator_store` | — | **`procedural` absent entirely** |
| **character** | `builtin` | `library` | `generation_service` | — | **`procedural` and `creator_store` both absent** |
| **vehicle** | `generation_service` | `library` | `procedural` | — | `PredefinedSchema = "Car5"` exists for exactly this |
| **ui_icon** | `library` | `procedural` | `builtin` | — | Kenney UI sheets as Image assets |
| **texture** | `builtin` | `library` | — | — | `Enum.Material` is already PBR and free |
| **particle** | `procedural` | `library` | — | — | The look lives in the numbers, not the sprite |
| **lighting** | `procedural` | — | — | — | Only single-option row; highest quality-per-effort in the table |

**The two facts this table exists to encode:**

- **Foliage and characters are the only rows where procedural loses outright.** Parts-and-wedges
  trees and humanoids look bad at any part count, so `procedural` is not offered for either. This
  is where the library budget should be spent. Tests pin both.
- **Buildings and characters never reach the Creator Store.** Architecture is regular and
  rectilinear — exactly what procedural geometry is good at — and Creator Store characters
  reliably carry scripts.

Lighting and materials are free and move perceived quality more than geometry does. If Golem does
one thing on a scene, it should be: set `Material` correctly on every part, and configure
`Atmosphere` plus the six `Lighting` properties.

---

## 3. "Never guess asset IDs" — the verification gate

`verifyCreatorStoreAsset(env, assetId, opts)` in `assets.ts`. Runs in the **Worker**, never in the
plugin: `HttpService` in a plugin cannot call `apis.roblox.com` without an `x-api-key`, and a
plugin has no safe way to hold one.

### Step 0 — provenance, checked before any request is made

`opts.provenance` must be `search_result`, `library` or `user_supplied`. `model_output` and
`unknown` are refused as `fail_bad_provenance` **without touching the network**, and `unknown` is
the default, so a caller has to state where the id came from. An id that only ever appeared in
generated text is never inserted.

### Steps 1–3 — resolve and gate

Discovery is `searchCreatorStore()`: the documented, key-gated
`POST https://apis.roblox.com/toolbox-service/v2/assets:search` when `ROBLOX_API_KEY` is set,
falling back to the unauthenticated `toolbox-service/v1/marketplace/{typeId}?keyword=` otherwise.
A missing key is reported in `note` and is never an error. `robloxOnly` adds
`creatorTargetId=1&creatorType=1` to restrict results to Roblox-authored assets.

Resolution is `GET toolbox-service/v1/items/details?assetIds=<id>` (no auth). Assertions, in
evaluation order — the **first** failure names the verdict, but **every** failure is reported:

| # | Assertion | Verdict on failure |
|---|---|---|
| 0 | Provenance is a real discovery | `fail_bad_provenance` |
| 1 | `hasScripts == false` **and** `scriptCount == 0` | `fail_has_scripts` |
| 2 | `capabilities.shouldSandbox == false` | `fail_sandboxed` |
| 3 | `typeId` ∈ {1 Image, 13 Decal, 40 MeshPart}; **10 Model is explicitly refused** | `fail_wrong_type` |
| 4 | `fiatProduct.isFree` and `purchasable` | `fail_not_free` |
| 5 | `visibilityStatus == 1` | `fail_moderated` |
| 6 | `creator.id == 1` ∨ `isVerifiedCreator` ∨ `isEndorsed` | `fail_unverified_creator` |
| 7 | `upVotePercent ≥ 70` **and** `voteCount ≥ 20` (skipped when `creator.id == 1`) | `fail_low_rating` |
| 8 | Triangles fit the remaining scene budget | `fail_too_many_triangles` |

**Assertion 1 is ordered first on purpose.** A model that is script-bearing *and* the wrong type
*and* not free reports `fail_has_scripts`, because that is the fact a human reading the audit log
needs to see. The other two still appear in `reasons`.

**Assertion 3 refuses Models in favour of the Mesh or Image they wrap**, and the refusal message
says so, because "this asset is a Model" is useless without "use the Mesh instead".

Network failure, a non-200, malformed JSON and an empty `data` array are all *refusals*
(`fail_network` / `fail_not_found`). Nothing in the gate throws — a verification that crashes is a
verification that gets skipped.

`assetThumbnailUrl(id)` returns the public no-auth render. Metadata lies; renders do not. Showing
it to a vision check or to the user before insertion is the intended step 3b.

### Step 5 — insertion

Only through `Generation.insertAsset()` in the plugin, which is the **single** call site of
`game:GetObjects("rbxassetid://…")`. `InsertService:LoadAsset` **fails from a plugin** even for
free public-domain assets ("User is not authorized to access Asset."). `GetObjects` returns an
**array** of top-level instances, not a container Model; the adapter preserves that rather than
collapsing to `[1]` and silently dropping geometry. A test asserts there is exactly one call site,
so the eventual deprecation of `GetObjects` is a one-function fix.

---

## 4. The provenance record

Exact schema, in `asset-library.ts`. Every field is required; a nullable field is explicitly
`| null` with a documented null meaning, so "we do not know" is never confused with "we did not
fill it in".

| Field | Type | Meaning |
|---|---|---|
| `id` | `string` | Namespaced lowercase slug, `kenney/nature-kit/tree-pine-01` |
| `name` | `string` | Display name as printed by the source |
| `kind` | `AssetKind` | `ground`\|`building`\|`prop`\|`foliage`\|`character`\|`vehicle`\|`ui_icon`\|`texture`\|`particle` |
| `source` | `AssetSourceSite` | `kenney`\|`quaternius`\|`ambientcg`\|`poly_pizza`\|`opengameart`\|`roblox_official`\|`creator_store`\|`generated_roblox`\|`generated_meshy`\|`procedural` |
| `sourceUrl` | `string` | The exact page the asset was obtained from (https only) |
| `licence` | `string` | **Verbatim** licence name as printed on the source page. Never normalised, never inferred |
| `licenceUrl` | `string` | The page that string was read from |
| `commercialUse` | `boolean` | Cross-checked against the licence registry; a mismatch is a validation error |
| `attributionRequired` | `boolean` | Same cross-check |
| `author` | `string` | `"unknown"` is not acceptable provenance |
| `retrievedAt` | `string` | ISO 8601 |
| `robloxAssetId` | `number \| null` | null until imported into Studio. The **only** thing the plugin ever inserts |
| `triangles` | `number \| null` | null when not yet measured |
| `textureResolution` | `number \| null` | Square edge in px; capped at Roblox's 1024 guidance |
| `boundsStuds` | `[number,number,number] \| null` | At scale 1; every axis ≥ 0.05 studs |
| `tags` | `string[]` | Lowercase slugs. Non-empty — retrieval and style coherence both depend on it |
| `sha256` | `string \| null` | 64 lowercase hex. **Required once `robloxAssetId` is set** — we must know what we uploaded |

D1 additionally tracks operational state that is *not* provenance: `status`
(`pending_ingest`\|`active`\|`quarantined`\|`retired`), `health_ok`, `last_health_check`,
`created_at`, `updated_at`.

### Licences

`validateProvenance()` resolves the verbatim string through `normaliseLicence()` to a canonical id
and then cross-checks the record's booleans against the registry.

| Canonical | In library? | Why |
|---|---|---|
| `CC0-1.0` | yes | Public domain dedication. The v1 policy |
| `CC-BY-4.0` / `CC-BY-3.0` | yes, flagged | Usable, but the credit line must be plumbed into every generated place — a product feature that does not exist yet. `cc0Only: true` rejects it |
| `CC-BY-SA-4.0` | **no** | Share-alike cannot be discharged inside a Roblox place; a customer would inherit an obligation they never agreed to |
| `GPL-3.0` | **no** | Source-distribution obligation is undischargeable here |
| `ROBLOX-TOU`, `ROBLOX-GENERATED`, `MESHY-PREMIUM`, `NONE-PROCEDURAL` | yes | First-party, user-generated, owner-owned, or no third-party material at all |

`normaliseLicence()` checks share-alike and copyleft **first**, so `"CC BY-SA 4.0"` cannot be
matched as `"CC BY"`. An unrecognised string is rejected, never guessed at.

### Audit log

`asset_verification_log` is append-only, one row per check, pass or fail, with the raw response
truncated to 8 KB. This is what makes "never guess asset IDs" *provable* after the fact rather than
merely asserted.

### D1 sizing

Verified 2026-08-31 against <https://developers.cloudflare.com/d1/platform/limits/>:

| Limit | Value | How it is respected |
|---|---|---|
| Max database size | 10 GB paid / 500 MB free | A 400-asset library is ~1.5 MB |
| Max row / string / BLOB | 2,000,000 bytes | Raw responses truncated to 8 KB |
| Max SQL statement | 100,000 bytes | Single-statement DDL, batched inserts |
| **Max bound parameters per query** | **100** | `rowsPerStatement()` = `floor(100 / columns)` = 5 rows per insert; id lists paged at 100 |
| Max columns per table | 100 | `asset_library` has 23 |
| Max query duration | 30 s | Indexed lookups only on the read path |

D1 is single-threaded per database, so the library is **read-mostly**: bulk-ingest offline, serve
reads through indexed lookups, never write on the hot path.

### Semantic search

`searchAssetLibrary()` mirrors `searchDocs()` in `rag.ts` exactly — Vectorize top-K plus D1 FTS5,
merged by reciprocal rank fusion — deliberately, so there is one retrieval pattern in the product
rather than two. Vectors are namespaced `asset:` with metadata `{ ns, status, kind }`, so they can
share the existing `VEC` index until a dedicated `VEC_ASSETS` binding exists.

On top of RRF there is a deterministic rerank, multiplicative so it reorders within the fused set
rather than inventing relevance the retrievers never found:

| Signal | Multiplier | Why |
|---|---|---|
| Exact `kind` match | ×1.6 | |
| Shares the project's style tags | ×(1 + shared/wanted), capped ×2 | **Style coherence is the thing that actually matters.** A Kenney house next to a photoreal rock looks worse than two grey boxes |
| No shared style tags | ×0.5 | |
| Comfortably inside the triangle budget | ×1.1 | |
| Attribution required | ×0.9 | Usable, but it costs a credit line |

---

## 5. The QC gate — `Generation.inspect()`

> "Do not assume a generated model is good because generation succeeded."

`GenerateModelAsync` returns a Model ~20 s later and reports success. That tells you nothing about
whether it is 3 studs tall or 300, whether its pivot is at its base or its centroid, whether it is
textured or a grey blob, whether it is lying on its side, or whether somebody slipped a Script into
it.

`Generation.inspect(model, opts)` returns a structured verdict — `ok`, `verdict`
(`pass`\|`warn`\|`fail`), per-check `{ name, status, detail, remediation }`, a flat `failures` list,
a flat `remediation` list, and raw `measurements`. Every measurement is wrapped in `pcall`; a check
that cannot run reports `skip`, never a fabricated pass. **It never throws** — a QC gate that
throws is worse than none, because the caller's error handling will read the crash as "generation
failed" and retry the identical prompt.

### The checks and their thresholds

| # | Check | Threshold | Why that number |
|---|---|---|---|
| 1 | **scripts** | any descendant `LuaSourceContainer` → **fail** | Untrusted-code injection vector. Checked first: nothing else matters if the model carries one |
| 2 | **geometry** | 0 BaseParts → fail | An empty container that reported success |
| 2b | **part_count** | > 200 → warn | A single generated "prop" above this is a scene. A `Model` above ~2,000 parts becomes slow to manipulate and replicate |
| 3 | **bounds** | any axis < 0.05 studs → fail | Roblox's minimum part dimension; below it the measurement is degenerate, not geometry |
| 4 | **scale** | per-intent envelope (§5.1) | A "chair" 40 studs tall is a fail against a 5-stud avatar |
| 4b | **orientation_aspect** | `tallest` intents where height < largest dimension → fail | A generated tree that comes back 30 wide × 5 tall fell over |
| 5 | **pivot** (vertical) | `abs(pivotY − bboxBaseY) > max(0.5, height × 0.05)` → fail | 0.5 studs is below the visible threshold at Roblox's 0.05-stud grid; 5% keeps the rule meaningful for both a 2-stud crate and a 60-stud tree. A centroid pivot on a 30-stud tree is 15 studs out — placed at a ground position, the model buries half of itself |
| 5b | **pivot** (lateral) | `> max(0.5, max(x,z) × 0.10)` → warn | The model will not rotate about itself; a warning because it is a placement nuisance, not a visual break |
| 6 | **orientation** | `up · Vector3.yAxis < 0.85` → fail | cos(~32°). Past that a "standing" object reads as fallen rather than artfully leaning. Skippable with `expectUpright = false` for rugs and road sections |
| 7 | **surface** | 100% untextured **and** ≤ 1 distinct colour **and** 100% factory grey (163,162,165 ± 12/255) → fail | That combination is a blob, not a model |
| 7b | **surface** | no textures and > 70% default plastic → warn | Weaker than the fail above because a deliberately untextured stylised prop is legitimate; `vision.ts hardFailChecks` uses 90% for a whole scene, which is a different unit |
| 8 | **triangles** | 0 → fail · over `triangleBudget` → fail · > 20,000 → fail · > 6,000 → warn | 20,000 is EditableMesh's documented hard ceiling (60,000 verts / 20,000 tris) — past it the mesh cannot be read back at all. 6,000 is the measured figure that produced a good textured prop; above it we pay for detail Roblox will not show |
| 9 | **collision** | zero `CanCollide` parts → fail | Players walk straight through a solid prop |
| 9b | **collision fidelity** | any MeshPart on `PreciseConvexDecomposition` → warn | The most expensive option, rarely needed for a prop; `Box`/`Hull` is right for decoration |
| 10 | **anchoring** | any unanchored part → fail (warn when `physicsAssembly = true`) | Unanchored decorative geometry is a simulated physics body; the scene collapses the moment the place runs |

Triangle counting reads geometry back through `AssetService:CreateEditableMeshAsync(MeshContent)`
→ `GetTriangles()`, because `MeshPart` exposes no triangle count. It is **best-effort by design**:
`CreateEditableMeshAsync` only loads content owned by or shared with the Studio user, and returns
`nil` when a memory budget is exhausted. A library MeshPart owned by someone else simply will not
measure — and unmeasured is reported as `skip` with "triangle cost is UNKNOWN, not zero", never as
a passing 0.

### 5.1 Scale envelopes

Derived from `worldbuilding.ts PROPORTIONS` and widened at both ends, because the job is to catch
the *implausible* (a chair 40 studs tall), not the merely unfashionable (a chair 5.5 studs tall).
28 intents; a free-text intent resolves by exact key, then **longest** substring ("a wooden lamp
post" → `lamp`), then a generic `prop` envelope.

Examples, in studs, against the 5-stud R15 avatar:

| Intent | Height | Max any dim | Must be tallest |
|---|---|---|---|
| `chair` | 1.5–7 | 8 | no |
| `table` | 1.5–6 | 16 | no |
| `door` | 6–14 | 14 | **yes** |
| `lamp` | 8–24 | 26 | **yes** |
| `tree` | 10–70 | 70 | **yes** |
| `character` | 3.5–9 | 9 | **yes** |
| `car` | 2.5–10 | 26 | no |
| `building` | 10–250 | 350 | no |
| `prop` (fallback) | 0.3–16 | 24 | no |

A failing scale check reports a `suggestedScale` that lands the model in the middle of its
envelope.

### 5.2 Why the table lives in two places

The canonical envelope table and every QC threshold live in **TypeScript**
(`assets.ts` → `SCALE_ENVELOPES`, `QC_THRESHOLDS`). `Generation.luau` carries a mirror, because the
gate has to run offline inside Studio with no worker round-trip.

`asset-qc.test.mjs` **parses the Luau source** and asserts the two agree — the scale table
element-by-element, and each named constant against `QC_THRESHOLDS`. The mirror cannot silently
drift; a change to one side fails the test suite.

---

## 6. Meshy is BUILD-TIME ONLY

Stated explicitly because it is the constraint most likely to be eroded by convenience.

- Meshy is a **premium** plan on the owner's account (the owner owns the outputs), with roughly
  **2,180 credits** remaining.
- Those credits are a **build-time creative resource**: making the marketing website more
  impressive, and generating 20–40 hero props on the owner's own machine that are then imported to
  Studio and enter Layer 1 as ordinary library rows with
  `source = 'generated_meshy'`, `licence = 'MESHY-PREMIUM'`.
- **Meshy must never become a per-user runtime dependency.** No worker code calls Meshy. No agent
  tool exposes Meshy. There is no code path from a customer prompt to a Meshy credit, and adding
  one would turn a fixed asset into an uncapped per-user variable cost.
- No additional credits or services are to be purchased without the owner's approval.

The runtime generation story is `GenerationService`, which is first-party, free while in beta,
rate-limited at 10/min, and carries **zero marginal cost per user**. That is the whole reason it
wins over every self-hosted or per-generation open model, all of which are ~10× over the $10–25/mo
budget, an uncapped variable cost, or legally unusable.

---

## 7. Implemented vs designed-not-built

### Implemented and tested

- `chooseAssetSource()` / `assetDecisionTable()` — the full decision table.
- `verifyCreatorStoreAsset()` / `verifyCreatorStoreAssets()` / `judgeAssetDetails()` — the full
  gate, injectable fetch, never throws.
- `searchCreatorStore()` — v2 with a key, v1 fallback without, graceful "not configured".
- `findVerifiedAssets()` — search-then-verify, with provenance set in one place so an unverified id
  cannot structurally reach insertion.
- `SCALE_ENVELOPES`, `checkScale()`, `scaleRuleFor()`, `pivotToleranceStuds()`, `QC_THRESHOLDS`.
- `AssetProvenance`, `LICENCES`, `normaliseLicence()`, `validateProvenance()`.
- `ensureAssetTables()`, `upsertAssets()`, `recordVerification()`, `staleAssets()`, `markHealth()`.
- `searchAssetLibrary()` with hybrid retrieval and the style-coherence rerank.
- `SEED_MANIFEST` — 20 CC0 packs from Kenney, Quaternius and ambientCG with full provenance.
- `Generation.generateModel()`, `Generation.insertAsset()`, `Generation.inspect()`,
  `Generation.verdictToText()`, `Generation.generateAndInspect()`.
- 75 `node --test` tests: `node --test packages/evals/src/asset-qc.test.mjs`.

### Designed, not built

- **Nothing is wired into the agent yet.** No tool in `tools.ts` calls any of this, no op in
  `Ops.luau` routes to `Generation.luau`, and `env.ts` has no `ROBLOX_API_KEY` binding. The patches
  needed are listed in §9.
- **The ingest step does not exist.** `SEED_MANIFEST` records metadata and URLs only; no binaries
  have been downloaded, so every seed row has `sha256`, `triangles`, `boundsStuds` and
  `robloxAssetId` null and lands with `status = 'pending_ingest'`. Turning them into insertable rows
  is a one-day owner task: download the packs, import through Studio's 3D Importer, capture the
  resulting Open Use asset ids and measurements, re-read each licence live, write the rows,
  embed and upsert to Vectorize.
- **Persisting generated geometry.** `GenerateModelAsync` output is `Content{SourceType=Opaque}` and
  does **not** survive save/publish. `Generation` reports this honestly via `sessionScoped: true`,
  but the round trip through `AssetService:CreateEditableMeshAsync` → `CreateAssetAsync` is designed
  in the research and not implemented here.
- **The nightly health check.** `staleAssets()` and `markHealth()` exist; no cron calls them.
- **Attribution plumbing.** CC-BY is representable but there is no code that emits a credits object
  into a generated place, which is why v1 policy is CC0-only.
- **Thumbnail confirmation (step 3b).** `assetThumbnailUrl()` exists; nothing feeds it to the vision
  critic yet.
- **A dedicated `VEC_ASSETS` Vectorize index.** Asset vectors currently namespace into the shared
  `VEC` index.

---

## 8. Limitations, honestly

1. **The Creator Store details endpoint is undocumented.** `toolbox-service/v1/items/details` and
   `toolbox-service/v1/marketplace/{typeId}` work today and return exactly the fields the gate needs,
   but they are unofficial and may change or vanish without notice. The documented v2 search needs
   an API key that is not yet configured. Every parse in `assets.ts` is defensive, and a shape change
   degrades to a refusal rather than a crash — but it degrades to *refusing everything*.
2. **No endpoint returns a licence field.** Creator Store verification establishes *free, public,
   script-free, from a trusted creator*. It does **not** establish redistribution rights. That is why
   the library's licence provenance is read off source pages by hand and stored verbatim.
3. **`Generation.inspect()` has never run against a live generated model.** It is written against
   verified API shapes and analyses clean under `--!strict` with the Roblox definitions, but the QC
   thresholds themselves are reasoned from the research and `PROPORTIONS`, not tuned against a
   corpus of real generations. Expect the surface and triangle thresholds in particular to move once
   real output is measured.
4. **Triangle measurement is best-effort.** `CreateEditableMeshAsync` only reads content owned by or
   shared with the Studio user. For third-party library meshes it will usually fail, so triangle
   budgeting works for generated geometry and not much else.
5. **The generation timeout cannot cancel anything.** `GenerateModelAsync` is a yielding engine call
   with no cancellation. On timeout the wrapper stops waiting and reports failure; the underlying
   call may still complete and its result is discarded. The rate-limit slot is still consumed.
6. **The rate limiter is per-plugin-session, in memory.** It resets when Studio restarts, and two
   Studio instances on one account can together exceed 10/min. Roblox's own 429 is the real limit;
   ours only makes hitting it less likely.
7. **The style-coherence rerank is untested against real retrieval**, because the library is empty.
   The multipliers are judgement, not measurement.
8. **Scale envelopes are per-object, not per-scene.** A correctly-sized chair next to a correctly-
   sized building can still compose badly. That is `vision.ts`'s job, and the two gates are
   complementary: `Generation.inspect()` measures one object's geometry before it enters the scene;
   `inspect_visually` judges the whole composition in pixels afterwards. Neither replaces the other.
9. **`fail_low_rating` will reject a lot of legitimate new assets.** 70% approval on ≥20 votes is a
   deliberately conservative bar that a good asset published last week cannot clear. That is the
   right trade for auto-insertion, but it means the Creator Store layer is narrow in practice —
   another reason it sits last in every row that includes it.
10. **`upsertAssets()` writes FTS rows one statement at a time.** Correct, but slow for a bulk
    ingest; D1's single-threaded write path makes this an offline-only operation, which is how it
    is intended to be used.

---

## 9. Patches needed in files this work did not touch

None of the following are applied. They are the wiring, listed so the change set is explicit.

1. **`apps/worker/src/env.ts`** — add the optional `ROBLOX_API_KEY` binding. Until it exists,
   `searchCreatorStore()` degrades to the unauthenticated v1 endpoint, which works.
2. **`apps/worker/src/tools.ts`** — register `search_asset_library`, `verify_asset` and
   `choose_asset_source`, and tighten `insert_asset`'s description so the model cannot reach it
   without a verified id.
3. **`apps/plugin/src/Ops.luau`** — route a `generate_model` op to `Generation.generateAndInspect`,
   an `inspect_model` op to `Generation.inspect`, and replace the existing `insert_asset` body with
   `Generation.insertAsset` so there is one adapter rather than two.
4. **`packages/shared/src/index.ts`** — add the `generate_model` and `inspect_model` variants to
   `StudioOp`.
5. **`packages/evals/package.json`** — add `"test:assets": "node --test src/asset-qc.test.mjs"`.
6. **Infra** — a Vectorize metadata index on `ns` (and optionally `kind`) so the asset filter works,
   or a dedicated `golem-assets` index bound as `VEC_ASSETS`.

---

## 10. Running the checks

```
npx tsc --noEmit -p apps/worker
node --test packages/evals/src/asset-qc.test.mjs
luau-lsp analyze --no-strict-dm-types --definitions=apps/plugin/globalTypes.d.luau \
  apps/plugin/src/Generation.luau
```
