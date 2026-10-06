# Library categories 1, 2, 3, 17: props, modular sets, maps, templates (deep research, 2026-10-07)

Deep-research workflow: 101 Opus agents (5 search angles, fetch, 3-vote adversarial verification).

## Question

Build a source ledger for StudPilot's asset library (a Roblox Studio co-pilot that places assets into OTHER creators' commercial Roblox games). Categories: (1) props and 3D models across 40+ themes (target 10,000 items); (2) modular building sets: walls, floors, roofs, paths, fences, bridges, stairs (target 150 families / 5,000 parts); (3) complete maps and environments (target 300); (17) game templates and starter places (target 50).
Rules:
- Every item must be HUMAN-MADE (no AI-generated) and LICENSED for use in other people's commercial games and redistribution by a tool: CC0, CC-BY 3.0/4.0, or Roblox Creator Store public/Open Use by ID.
- Banned: NC, ND, "personal use", "no redistribution", Mixamo, unknown licences.
- Starting points (verify each and EXPAND beyond them): Kenney 3D kits (CC0: City, Nature, Castle, Pirate, Space, Racing, Holiday, Furniture, Food, Platformer, Survival, Graveyard, Train, Tower Defense, Fantasy Town, Car, Watercraft, Building, Mini Dungeon); Quaternius (CC0: Ultimate Nature, Stylized Nature MegaKit, Medieval Village, Fantasy Props, Modular Sci-Fi, Platformer, Cyberpunk, Pirate, Space, Farm, Food); KayKit by Kay Lousberg (CC0: Dungeon, City Builder, Forest, Halloween, Holiday, Furniture, Restaurant, Space Base); Poly Haven models; Sketchfab and OpenGameArt filtered to CC0/CC-BY; Roblox official templates and sample places; Roblox Creator Store.
For each source report:
- the URL;
- the exact licence and licence URL;
- the number of models or parts (count them from the pack pages);
- the formats (FBX/GLB/OBJ);
- the style family (low-poly, stylized, realistic);
- evidence it is human-made (author, date before generative 3D or a known studio);
- whether bulk download is allowed.
Finish with a table of sources by category, the total estimated eligible items against each target, and the gap.

## Summary

Only a thin slice of the ledger is verified: Kenney's Platformer Kit (CC0, author states no generative AI) and Quaternius's Medieval Village MegaKit (CC0, modular grid-based building set, about 176 free-tier models on OpenGameArt) are confirmed eligible. Quaternius lists five MegaKits with stated counts of 110+ to 300+ (about 1,180 nominal items), but their licences, formats and free-tier counts are unverified. Sketchfab can be filtered to CC0/CC-BY, but it permits AI-generated models, so it needs the CreatedWithAI tag plus author and date checks. Roblox's 23 official templates (7 to 10 of them map or building kits) state no licence on the templates page, and Roblox's Creator Store rules block distributing composites with Restricted dependencies. Against the targets (10,000 props, 150 families and 5,000 modular parts, 300 maps, 50 templates), the verified eligible total is only a few hundred items, so the gap is more than 95% in every category. Kenney's other kits, other Quaternius packs, KayKit and Poly Haven were not verified in this run.

## Verified findings

### Kenney Platformer Kit is eligible: CC0 1.0 Universal (licence URL https://creativecommons.org/publicdomain/zero/1.0/), commercial use explicitly allowed, and the author states 'No generative AI was used'. Kenney has published CC0 packs since about 2010 and the kit predates generative 3D. Formats are OBJ, FBX and glTF. Kenney's support page says all assets on its asset pages are CC0. Redistribution inside a tool is covered by CC0 itself rather than by explicit Kenney wording. The model count is unresolved: the itch page says 'over 140 models', kenney.nl lists 150 files, and search snippets say 70+ objects. The claim of about 140 models was refuted 0-3, so the ledger should use a conservative 70 to 150 until the zip is counted. Style is low-poly. Bulk download is the free zip (about 3 MB) on itch.io and kenney.nl.

- **Confidence:** high (vote 3-0 (licence and human-made); 0-3 (the 140-model count))
- **Evidence:** 3-0 votes on CC0, commercial use and no-generative-AI. The 'over 140 models' count claim was refuted 0-3, and sources disagree between 70+, 140+ and 150 files. The author's no-AI note is a self-attestation, though corroborated by the kit's age and Kenney's long history.
- **Sources:** https://kenney-assets.itch.io/platformer-kit, https://kenney.nl/assets/platformer-kit, https://kenney.nl/support

### Quaternius Medieval Village MegaKit is eligible and counts toward Category 2 (modular building sets). It is CC0 (v1.0), free for personal, educational and commercial use, and the itch.io page says no generative AI was used. It is modular and grid-snapping, covering walls, floors, stairs, roofs, doors, windows and vines, in a stylized low-poly medieval style. Formats are FBX, OBJ, glTF (and Blend on the author's site). It is published on quaternius.com, itch.io and OpenGameArt node 174568 (submitted 16 Apr 2025, licence link creativecommons.org/publicdomain/zero/1.0/). Quaternius is a long-established CC0 author and the pack is a 2025 release. The free CC0 download is the Standard tier, which the OGA page and search snippets put at 176 models (the itch page says 170). The headline '300+/304 models' includes the paid Source tier. The ledger should count 176 until verified.

- **Confidence:** high (vote 3-0 (licence, modularity, style); 0-3 (304 count, 176 exactness, free fraction))
- **Evidence:** Votes were 3-0 on CC0, modular/grid-based and OGA publication. Claims that the pack has 304 models and a January 2025 release, and about the free-tier fraction, were refuted 0-3. Even the 'exactly 176 free' claim was refuted 0-3, so the free count is genuinely unsettled (176 on OGA, 170 on itch, 304 headline). The Quaternius page and itch page also disagree on which tiers are free. Redistribution terms for paid-tier shader and source files were not checked.
- **Sources:** https://quaternius.com/packs/medievalvillagemegakit.html, https://opengameart.org/node/174568, https://quaternius.itch.io/medieval-village-megakit

### Quaternius's itch.io page lists 31 packs, five of them large MegaKits: Downtown City MegaKit 300+ (guest author Atapataco, not Quaternius himself), Medieval Village MegaKit 300+, Modular Sci-Fi MegaKit 270+, Fantasy Props MegaKit 200+ and Stylized Nature MegaKit 110+ (about 116). The nominal total is about 1,180 items, mostly props and modular parts. These are the author's own N+ figures, and free-tier counts will be lower. The listing gives no licence, formats or dates, so each pack page must be checked. Individual pages for Stylized Nature show CC0 with FBX, OBJ and glTF and tiers of Standard free, Pro $9.99 and Source $14.99. The Modular Sci-Fi pack is reported as CC0 by secondary coverage. Licences for Downtown City, Fantasy Props and the other 25 packs were not individually verified.

- **Confidence:** medium (vote 3-0)
- **Evidence:** The counts were verified 3-0 on the creator page, which is a secondary listing. The negative claim that the page lacks licence, format and date information was also 3-0. Licence and format facts come only from search snippets for a few packs.
- **Sources:** https://quaternius.itch.io/, https://quaternius.itch.io/stylized-nature-megakit, https://quaternius.com/packs/stylizednaturemegakit.html

### Sketchfab can be filtered to CC0 and CC-BY only. A 19 April 2021 blog post introduced licence filters letting users include only chosen free or paid licence types (CC0, CC BY, CC BY-NC, CC BY-ND, CC BY-SA, Standard, Editorial). A search restricted to CC0 plus CC BY is therefore possible. NC, ND and SA are separate options, so they are excluded by selecting only CC0 and CC BY. A claim that the filter must exclude NC/ND/SA explicitly was refuted 0-3, presumably because the filter is opt-in. Sketchfab's store closed when Fab launched in October 2024. Only CC BY and Standard models migrate to Fab, and CC0, BY-SA, BY-NC and BY-ND models remain on Sketchfab and downloadable until free licensing is removed. No sunset date has been given. The filter does not verify human-made origin and does not make bulk download allowed.

- **Confidence:** medium (vote 3-0 (filter exists); 0-3 (must-exclude wording))
- **Evidence:** The feature claim was verified 3-0 on Sketchfab's own post. The long-term availability points come from a verifier's side research, not from claims that went through voting.
- **Sources:** https://sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters

### Sketchfab does not ban AI-generated models, so CC0/CC-BY results can include AI-made items. From 23 March 2023, creators must apply the CreatedWithAI tag to redistributable (including Creative Commons) models made with generative AI. The policy was confirmed as still current by a Sketchfab help article dated 4 Aug 2026. The tag is self-reported, so AI models may still appear as Human Created if unflagged. The tag is necessary but not sufficient as a human-made filter. StudPilot should add provenance checks: a known author or studio, and an upload date before 2023, since pre-March-2023 models predate the tagging rule and are unlikely to be generative anyway.

- **Confidence:** high (vote 3-0)
- **Evidence:** Both claims passed 3-0 against Sketchfab's own blog post, with the 2026 help article corroborating. The date-based provenance suggestion is an inference.
- **Sources:** https://sketchfab.com/blogs/community/introducing-the-noai-createdwithai-tags/, https://help.sketchfab.com/en/articles/16152133

### Roblox Asset Privacy (Restricted versus Open Use) controls only the default state of Images, Decals and Meshes on creation. Audio, Video, Models, MeshParts, Animations and Packages have independent creation defaults, so Open Use cannot be assumed for models and props and must be verified for each asset. The privacy page says Open Use is irreversible. The claim that exactly two access levels exist, and the claim that StudPilot must re-check Open Use at every insertion (not only at ingest), were both refuted 0-3, so the re-check cadence is not established by this research.

- **Confidence:** high (vote 3-0 (scope); 0-3 (two levels; re-check at insertion))
- **Evidence:** 3-0 on scope and independent defaults. The per-asset conclusion is an inference from the docs and is hedged appropriately. Two other privacy-model claims were refuted 0-3.
- **Sources:** https://create.roblox.com/docs/en-us/projects/assets/privacy

### Roblox composite assets can be distributed only if their dependencies are Open Use or were uploaded by the distributor. A Restricted dependency from another creator blocks distribution, so models and building sets built from sub-meshes, textures or decals need every dependency checked. This rule is written for Creator Store listers, not for a third-party tool, so applying it to StudPilot is an extrapolation. Several related claims were refuted 0-3: that only the original uploader can publish free items, that third-party packs reuploaded by someone else do not qualify, and that this rule is the permission basis for a tool redistributing Open Use assets. Whether re-uploading Kenney or Quaternius CC0 assets to Roblox is allowed is therefore unresolved here (CC0 itself would permit it).

- **Confidence:** medium (vote 3-0 (dependency rule); 0-3 (uploader-only, third-party reupload, permission basis, Restricted blocks all))
- **Evidence:** The composite-dependency rule was verified 3-0 against the current Roblox docs. The 'every dependency must be checked' sentence is an operational inference. Four neighbouring claims were refuted 0-3.
- **Sources:** https://create.roblox.com/docs/en-us/production/creator-store, https://create.roblox.com/docs/production/publishing/selling-on-the-creator-store

### Roblox's official templates page lists 23 templates (not 24). About 7 to 10 are environment, building or map kits: Modern City (modular walls, windows and doors), Village, Castle, Suburban, Pirate Island, Racing, Classic Obby, Flat Terrain and Baseplate. The rest are gameplay-system templates such as Platformer, FPS, Laser Tag, Capture the Flag and Combat. Roblox calls them 'uncopylocked games'. The page states no CC0, CC-BY or Open Use licence and no redistribution terms, so their eligibility for third-party redistribution is not established. Without explicit licence confirmation, the eligible count for Category 17 (target 50) and the template-derived share of Category 3 stays at 0 to 23.

- **Confidence:** medium (vote 2-1 (count and categories); 3-0 (no licence stated))
- **Evidence:** The 23-count claim passed 2-1 (one dissent). The 'no licence stated' claim passed 3-0 and is a narrow absence claim about this page only. Roblox's general Terms or Creator Store terms may cover template use, but that was not checked.
- **Sources:** https://create.roblox.com/docs/en-us/resources/templates, https://create.roblox.com/docs/resources/templates.md

### Source table by category, with verified or conservative eligible items. (1) Props and 3D models, target 10,000: Kenney Platformer Kit (CC0, about 70 to 150, OBJ/FBX/glTF, low-poly), plus Quaternius Fantasy Props 200+ and Stylized Nature about 116 (nominal, licence unverified for Props). Verified eligible is about 70 to 150, with up to about 470 more if the Quaternius packs confirm CC0. (2) Modular building sets, target 150 families and 5,000 parts: Quaternius Medieval Village (176 free, CC0, 1 family), plus nominal Modular Sci-Fi 270+ and Downtown City 300+ (unverified). Verified is 176 parts and 1 family, with up to about 746 parts if the other two are confirmed. (3) Complete maps and environments, target 300: Roblox templates (about 7 to 10 candidates, licence unestablished). Verified is 0. (17) Game templates and starter places, target 50: Roblox templates (about 13 gameplay templates, licence unestablished). Verified is 0. Cross-category: Sketchfab CC0/CC-BY (filterable, but unbounded, needs AI-provenance screening, count not measured). Gap, verified only: roughly 9,850 to 9,930 props short (more than 98%), at least 4,824 modular parts and 149 families short (more than 96%), 300 maps short, and 50 templates short. Even with every nominal Quaternius pack confirmed, the total is well under 2,000 items, so Kenney's other kits, KayKit, Poly Haven and Sketchfab and OpenGameArt mining are required to approach the targets.

- **Confidence:** low (vote )
- **Evidence:** Derived by aggregating the verified findings above. The nominal counts are the authors' N+ figures, the free-tier counts are disputed, and the Roblox licences are unestablished. The totals are therefore estimates of the gap, not measured counts.
- **Sources:** https://kenney-assets.itch.io/platformer-kit, https://quaternius.itch.io/, https://opengameart.org/node/174568, https://create.roblox.com/docs/en-us/resources/templates, https://sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters

## caveats

Coverage is thin. Only Kenney's Platformer Kit, Quaternius's Medieval Village and creator page, Sketchfab policy, and Roblox privacy and Creator Store documentation passed verification. The other Kenney kits (City, Nature, Castle and so on), the other Quaternius packs, KayKit, Poly Haven and OpenGameArt generally were not verified, so their licences, counts, formats and bulk-download terms are unknown. Nine claims were refuted 0-3. These cover the Platformer Kit and Medieval Village counts and free-tier fractions, the two-level Roblox privacy model, the re-check-at-insertion rule, and the reading that only original uploaders can publish free items. Free-tier counts are therefore unsettled (176 on OpenGameArt, 170 on itch, 304 headline). Human-made evidence rests on author self-attestation (Kenney and Quaternius state no generative AI), author history and release dates, not on independent forensic proof. Sketchfab's CreatedWithAI tag is self-reported. Bulk-download permission was never explicitly confirmed for any source; the free zips are available, but no API or bulk terms were checked. The Roblox Creator Store rules are written for Creator Store listers, not third-party redistribution tools, and the Roblox templates page states no licence. Time sensitivity: Sketchfab's free licensing may be removed after the Fab transition, tier and price structures on itch.io can change, and the check date is 2026-10-07.

## refuted

[
 {
  "claim": "Kenney Platformer Kit contains over 140 3D models, so it counts as roughly 140 props/modular parts toward the library targets.",
  "vote": "0-3",
  "source": "https://kenney-assets.itch.io/platformer-kit"
 },
 {
  "claim": "The Quaternius Medieval Village MegaKit contains about 304 models, released January 2025 (before any known generative-3D contamination concerns for Quaternius, a long-established human artist).",
  "vote": "0-3",
  "source": "https://quaternius.com/packs/medievalvillagemegakit.html"
 },
 {
  "claim": "Only part of the pack is free: the Standard tier is about 60-70% of the models, with the remaining 30-40% in paid Pro/Source tiers. The free, bulk-downloadable eligible count is therefore roughly 180-215 models, not 304. Paid tiers carry the full set, and their redistribution terms need checking.",
  "vote": "0-3",
  "source": "https://quaternius.com/packs/medievalvillagemegakit.html"
 },
 {
  "claim": "The free standard version contains 176 models; a paid Source version has 300+ models. Only the 176 are CC0 and downloadable from OpenGameArt.",
  "vote": "0-3",
  "source": "https://opengameart.org/node/174568"
 },
 {
  "claim": "Roblox asset privacy has exactly two access levels, Restricted and Open Use; Open Use assets can be used by any creator or game, which is the mechanism that makes by-ID use in other creators' games possible.",
  "vote": "0-3",
  "source": "https://create.roblox.com/docs/en-us/projects/assets/privacy"
 },
 {
  "claim": "Composite assets may be redistributed if their dependencies are Open Use, even when created by others; this is the permission basis for a tool redistributing Open Use Creator Store assets.",
  "vote": "0-3",
  "source": "https://create.roblox.com/docs/production/publishing/selling-on-the-creator-store"
 },
 {
  "claim": "Assets with Restricted dependencies not uploaded by the distributor cannot be distributed, so only Open Use assets (verified by ID) are eligible for the library.",
  "vote": "0-3",
  "source": "https://create.roblox.com/docs/production/publishing/selling-on-the-creator-store"
 },
 {
  "claim": "The filter covers five Creative Commons licenses: CC0, CC BY, CC BY-NC, CC BY-ND and CC BY-SA. Because NC and ND appear alongside the usable ones, a CC0/CC-BY-only filter must exclude NC, ND and SA explicitly.",
  "vote": "0-3",
  "source": "https://sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters"
 },
 {
  "claim": "Roblox Creator Store lets a creator freely distribute Models, Plugins, MeshParts, Decals and audio only if they created and uploaded the asset to their own inventory. So only the original uploader can legitimately publish an item as free. Third-party packs such as Kenney or Quaternius reuploaded by someone else do not qualify.",
  "vote": "0-3",
  "source": "https://create.roblox.com/docs/en-us/production/creator-store"
 },
 {
  "claim": "Roblox uses an Open Use versus Restricted permission model. A Restricted asset has its permissions checked every time it loads into a game or a creator acts on it. So StudPilot must check Open Use status per asset ID at insertion time, not once at ingest.",
  "vote": "0-3",
  "source": "https://create.roblox.com/docs/en-us/production/creator-store"
 }
]

## unverified

[]

## sources

[
 {
  "url": "https://kenney-assets.itch.io/platformer-kit",
  "quality": "primary",
  "angle": "Kenney/Quaternius/KayKit pack counts",
  "claimCount": 5
 },
 {
  "url": "https://quaternius.com/packs/medievalvillagemegakit.html",
  "quality": "primary",
  "angle": "Kenney/Quaternius/KayKit pack counts",
  "claimCount": 5
 },
 {
  "url": "https://quaternius.itch.io/",
  "quality": "secondary",
  "angle": "Kenney/Quaternius/KayKit pack counts",
  "claimCount": 5
 },
 {
  "url": "https://itch.io/c/5146693/kaykit",
  "quality": "secondary",
  "angle": "Kenney/Quaternius/KayKit pack counts",
  "claimCount": 5
 },
 {
  "url": "https://80.lv/articles/a-free-modular-asset-pack-with-over-270-game-ready-models/",
  "quality": "secondary",
  "angle": "Kenney/Quaternius/KayKit pack counts",
  "claimCount": 4
 },
 {
  "url": "https://opengameart.org/node/174568",
  "quality": "primary",
  "angle": "Kenney/Quaternius/KayKit pack counts",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/en-us/projects/assets/privacy",
  "quality": "primary",
  "angle": "Roblox Creator Store licensing and Open Use",
  "claimCount": 5
 },
 {
  "url": "https://devforum.roblox.com/t/how-to-use-roblox-api-toolbox-service-to-get-audios-from-creator-store/3676957",
  "quality": "forum",
  "angle": "Roblox Creator Store licensing and Open Use",
  "claimCount": 4
 },
 {
  "url": "https://create.roblox.com/docs/production/publishing/selling-on-the-creator-store",
  "quality": "primary",
  "angle": "Roblox Creator Store licensing and Open Use",
  "claimCount": 4
 },
 {
  "url": "https://poly.pizza",
  "quality": "secondary",
  "angle": "CC0/CC-BY repositories beyond the starting list",
  "claimCount": 5
 },
 {
  "url": "https://gamefromscratch.com/poly-pizza-a-replacement-to-google-poly/",
  "quality": "blog",
  "angle": "CC0/CC-BY repositories beyond the starting list",
  "claimCount": 5
 },
 {
  "url": "https://sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters",
  "quality": "primary",
  "angle": "CC0/CC-BY repositories beyond the starting list",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/en-us/resources/templates",
  "quality": "primary",
  "angle": "Complete maps, environments and game templates",
  "claimCount": 5
 },
 {
  "url": "https://sketchfab.com/blogs/community/introducing-the-noai-createdwithai-tags/",
  "quality": "primary",
  "angle": "Licence pitfalls: CC-BY redistribution, AI-generated and Mixamo risk",
  "claimCount": 5
 },
 {
  "url": "https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/m-p/13234775",
  "quality": "forum",
  "angle": "Licence pitfalls: CC-BY redistribution, AI-generated and Mixamo risk",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/en-us/production/creator-store",
  "quality": "primary",
  "angle": "Licence pitfalls: CC-BY redistribution, AI-generated and Mixamo risk",
  "claimCount": 5
 },
 {
  "url": "https://www.cgchannel.com/2023/02/sketchfab-introduces-noai-and-createdwithai-tags/",
  "quality": "secondary",
  "angle": "Licence pitfalls: CC-BY redistribution, AI-generated and Mixamo risk",
  "claimCount": 5
 },
 {
  "url": "https://blog.flippednormals.com/objaverse-raises-concerns-about-ethics-of-scraping-3d-content/",
  "quality": "unreliable",
  "angle": "Licence pitfalls: CC-BY redistribution, AI-generated and Mixamo risk",
  "claimCount": 0
 },
 {
  "url": "https://app.cinevva.com/fr/guides/free-3d-model-sites",
  "quality": "blog",
  "angle": "Licence pitfalls: CC-BY redistribution, AI-generated and Mixamo risk",
  "claimCount": 5
 }
]

## stats

{
 "angles": 5,
 "sourcesFetched": 19,
 "claimsExtracted": 87,
 "claimsVerified": 25,
 "confirmed": 15,
 "killed": 10,
 "unverified": 0,
 "afterSynthesis": 9,
 "urlDupes": 2,
 "budgetDropped": 9,
 "agentCalls": 101
}
