# Conditional cartoon model candidates — 2026-09-25

This is a **catalog and visual sample**, not an insertion or full-game result. The owner narrowed Apple to colorful cartoon Roblox games. The existing bundled search had 481 Roblox-owned models, with no house or fountain by name and only a few trees. A read-only Creator Store harvest held more trusted, script-free third-party ids, but `InsertService:LoadAsset` refused 20/20 of the sampled third-party ids in Studio. The new `AssetService:LoadAssetAsync` fallback remains unproved in a published experience with third-party loading enabled.

I inspected three real Creator Store listing previews in the browser:

| Asset | Visible preview | Catalog decision |
|---|---|---|
| [Cartoony Tree (Low Poly), id 10556335077](https://create.roblox.com/store/asset/10556335077/Cartoony-Tree-Low-Poly) | Green low-poly canopy and brown branching trunk; appropriate for a bright cartoon scene. | Conditional candidate. |
| [Cartoon House, id 12468173054](https://create.roblox.com/store/asset/12468173054/Cartoon-House) | Blue roof, warm walls, simple bright shapes; appropriate for a cartoon village. | Conditional candidate. |
| [Waterfall Fountain, id 3241261980](https://create.roblox.com/store/asset/3241261980/Waterfall-Fountain) | Gray stone and muted water; visually unlike the intended colorful cartoon style. | Excluded from conditional search. |

The catalog generator now offers 158 conditional third-party candidates **only on explicit opt-in search**. Their names must include a cartoon, stylized, low-poly or similar style term, in addition to the existing trusted, script-free, unbranded and ≤100,000-triangle checks. The 481 Roblox-owned rows remain the default search and the only ones used by the hand-built-prop guard. A conditional row is visibly labeled in the three-option preview, and the person must still choose it. Names and a three-item visual sample do not certify the other 156 candidates' visual quality or prove that a place can load them.

No model file was downloaded, uploaded, placed, or published as part of this catalog update. The live worker and Creator Store plugin are unchanged; this is a draft PR pending enabled-place Studio proof, CI and independent visual review.
