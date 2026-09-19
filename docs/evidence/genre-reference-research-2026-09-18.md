# Genre reference research — 2026-09-18

## Outcome

This research produced a curated, queryable reference layer for the **10 genre IDs already owned by**
`apps/worker/src/genre-kits.ts`. It does not create a second genre taxonomy.

The shipped data contains:

| measured item | count |
|---|---:|
| candidate DevForum topic records reviewed in the finite research batch | 56 |
| retained external visual-reference pages | 36 |
| unique retained external URLs | 36 |
| representative source images inspected | 144 |
| transferable visual observations | 150 |
| unique official Creator Hub documents reused from the local corpus | 25 |
| exact genre × aspect implementation links | 80 |
| official implementation rules | 160 |
| total authored observations and rules | 310 |
| unique official documents already present in `chunks.jsonl` | 2193 |

No source image, paid asset, proprietary model, or third-party implementation was copied into the
product. The result is source metadata plus project-authored observations and rules.

## Method

1. Read `GENRE_KIT_IDS` from the existing worker source and kept its order and spelling:
   `horror`, `obby`, `tycoon`, `simulator`, `racing`, `roleplay`, `tower_defense`, `fps_arena`, `anime_battle`, `survival`.
2. Searched the Roblox Developer Forum through its search endpoint, then fetched candidate topics
   through their direct topic JSON endpoints. Generic SEO pages, uninspectable links, title-only
   matches, unrelated hiring posts, duplicates, and sources without useful visual evidence were
   excluded. 36 of 56 candidate topic records
   remained.
3. Read the first post and representative media for every retained source. The manifest records
   `visual_inspected` only where media was actually viewed and stores the measured media
   count per source. Long posts were sampled for the relevant project sections; they are not claimed
   to have every image exhaustively classified.
4. Converted visible composition, hierarchy, lighting, material, prop, and interaction patterns into
   specific project-authored observations. A title or popularity count alone was not accepted as an
   observation.
5. Scanned the existing local Creator Docs corpus instead of downloading it again. Every official
   document is identified by the real `docSlug` and complete list of existing vector chunk
   IDs from `packages/corpus/data/chunks.jsonl`.
6. Wrote one official implementation link for every one of the 80 genre × aspect pairs. Each link
   has a genre-specific rationale and two concrete implementation rules.

The retained set deliberately includes several older examples when they show a still-useful layout,
greybox, or information pattern. Their cautions say when the skin, density, or fidelity should not be
treated as the current target. A high-fidelity survival example remains only for inventory hierarchy,
landmark composition, and atmosphere; its record explicitly says not to transfer its asset density
into the requested low-poly target.

## Coverage

External-reference aspect coverage is reported honestly rather than padded with weak links. Official
implementation coverage is complete for every genre, so each missing external visual aspect still has
an exact local Creator Docs implementation source.

| genre | visual refs | genre-specific visual observations | visual aspects | missing visual aspects | official aspects |
|---|---:|---:|---:|---|---:|
| `horror` | 4 | 16 | 6/8 | `shop`, `inventory` | 8/8 |
| `obby` | 3 | 12 | 7/8 | `inventory` | 8/8 |
| `tycoon` | 3 | 12 | 5/8 | `ui_hud`, `shop`, `inventory` | 8/8 |
| `simulator` | 7 | 27 | 8/8 | — | 8/8 |
| `racing` | 3 | 12 | 6/8 | `shop`, `materials` | 8/8 |
| `roleplay` | 3 | 12 | 8/8 | — | 8/8 |
| `tower_defense` | 4 | 16 | 8/8 | — | 8/8 |
| `fps_arena` | 4 | 16 | 6/8 | `shop`, `lighting` | 8/8 |
| `anime_battle` | 3 | 12 | 8/8 | — | 8/8 |
| `survival` | 4 | 17 | 7/8 | `shop` | 8/8 |

## External visual-reference sources

Every row below was rechecked on 2026-09-18 through the topic JSON endpoint. The live response had to
match the stored topic ID, title, first-post author, and publication date. All 36
of 36 passed.

| genre(s) | source | author | published | inspected aspect(s) | representative media viewed |
|---|---|---|---|---|---:|
| `horror` | [Feedback on Horror Map](https://devforum.roblox.com/t/feedback-on-horror-map/1733278) | Vothern | 2022-03-26 | `map_composition`, `low_poly_props`, `lighting`, `interaction` | 1 |
| `horror` | [Horror Mansion Showcase (Future Lighting)](https://devforum.roblox.com/t/horror-mansion-showcase-future-lighting/1300078) | GunsBullets | 2021-06-19 | `map_composition`, `materials`, `lighting`, `interaction` | 4 |
| `horror` | [Devlog #1: Making a cinematic horror game](https://devforum.roblox.com/t/devlog-1-making-a-cinematic-horror-game/2646883) | varenst | 2023-10-14 | `ui_hud`, `map_composition`, `lighting`, `interaction` | 8 |
| `horror` | [[UPDATE] I like to make scary monsters. How can I make them more horrific and nightmare fueling without a drop of blood?](https://devforum.roblox.com/t/update-i-like-to-make-scary-monsters-how-can-i-make-them-more-horrific-and-nightmare-fueling-without-a-drop-of-blood/632924) | CRAZYDIAMONDDOO | 2020-06-19 | `low_poly_props`, `materials`, `lighting`, `interaction` | 4 |
| `obby` | [[Low-Poly] Obby: Poison valley](https://devforum.roblox.com/t/low-poly-obby-poison-valley/488251) | Rikk_YT | 2020-03-19 | `map_composition`, `low_poly_props`, `materials`, `lighting`, `interaction` | 4 |
| `obby` | [Techy's Obby System - All your obby needs in one! [Includes Stage Selector]](https://devforum.roblox.com/t/techys-obby-system-all-your-obby-needs-in-one-includes-stage-selector/785271) | 0Techy | 2020-09-24 | `ui_hud`, `shop`, `interaction` | 3 |
| `obby` | [Realistic Obby Testing and Feedback](https://devforum.roblox.com/t/realistic-obby-testing-and-feedback/1524246) | Its_TylerM | 2021-10-25 | `ui_hud`, `map_composition`, `materials`, `lighting` | 2 |
| `tycoon` | [Creator Spotlight: How Ultraw’s Love for Food Became a Trending Tycoon](https://devforum.roblox.com/t/creator-spotlight-how-ultraw%E2%80%99s-love-for-food-became-a-trending-tycoon/3840933) | frecklesnspectacles | 2025-07-25 | `map_composition`, `low_poly_props`, `materials`, `interaction` | 4 |
| `tycoon` | [Tycoon Map and Assets](https://devforum.roblox.com/t/tycoon-map-and-assets/2188535) | goalmwo | 2023-02-19 | `map_composition`, `low_poly_props`, `materials`, `interaction` | 4 |
| `tycoon` | [Thoughts on LowPoly Medieval tycoon map](https://devforum.roblox.com/t/thoughts-on-lowpoly-medieval-tycoon-map/424915) | LuciferVonhart | 2020-01-04 | `map_composition`, `low_poly_props`, `materials`, `lighting` | 4 |
| `simulator` | [Feedback on Cartoony Simulator UI!](https://devforum.roblox.com/t/feedback-on-cartoony-simulator-ui/748589) | SoaringKeyy | 2020-08-30 | `ui_hud`, `shop`, `inventory`, `interaction` | 1 |
| `simulator` | [Feedback on my Simulator UI Part 2?](https://devforum.roblox.com/t/feedback-on-my-simulator-ui-part-2/1562998) | Jumpathy | 2021-11-24 | `ui_hud`, `shop`, `materials`, `interaction` | 1 |
| `simulator` | [Feedback on my Simulator UI](https://devforum.roblox.com/t/feedback-on-my-simulator-ui/1005789) | vdw0 | 2021-01-25 | `ui_hud`, `shop`, `inventory`, `interaction` | 3 |
| `simulator` | [Tried to make a simulator map](https://devforum.roblox.com/t/tried-to-make-a-simulator-map/850158) | 81001 | 2020-11-01 | `map_composition`, `low_poly_props`, `materials`, `interaction` | 4 |
| `simulator` | [Low poly moon simulator map, Feedback?](https://devforum.roblox.com/t/low-poly-moon-simulator-map-feedback/1040598) | Zelt3q | 2021-02-11 | `map_composition`, `low_poly_props`, `materials`, `interaction` | 4 |
| `simulator` | [Hows my simulator map?](https://devforum.roblox.com/t/hows-my-simulator-map/988944) | Roros_World | 2021-01-17 | `map_composition`, `low_poly_props`, `lighting`, `interaction` | 4 |
| `racing` | [Behind The Games: Midnight Racing: Tokyo, Dress to Impress, and Michael’s Zombies](https://devforum.roblox.com/t/behind-the-games-midnight-racing-tokyo-dress-to-impress-and-michael%E2%80%99s-zombies/3131289) | frecklesnspectacles | 2024-08-23 | `ui_hud`, `map_composition`, `lighting`, `interaction` | 4 |
| `racing` | [Horizon Highway the demo (WIP)](https://devforum.roblox.com/t/horizon-highway-the-demo-wip/1627000) | Ben3657 | 2022-01-14 | `ui_hud`, `map_composition`, `lighting`, `interaction` | 3 |
| `racing` | [Redline: Overdrive Devlog #1](https://devforum.roblox.com/t/redline-overdrive-devlog-1/1501202) | Ben3657 | 2021-10-09 | `inventory`, `map_composition`, `low_poly_props`, `interaction` | 4 |
| `roleplay` | [Feedback on a showcase/role-play city map I made](https://devforum.roblox.com/t/feedback-on-a-showcaserole-play-city-map-i-made/818496) | aryoseno11 | 2020-10-13 | `map_composition`, `low_poly_props`, `lighting`, `interaction` | 3 |
| `roleplay` | [[Army Roleplay Map] Developer Log No.1](https://devforum.roblox.com/t/army-roleplay-map-developer-log-no1/2040314) | so_fx | 2022-11-01 | `map_composition`, `low_poly_props`, `materials`, `interaction` | 4 |
| `simulator`, `roleplay`, `anime_battle` | [Chenami : User Interface Portfolio (UI/UX)](https://devforum.roblox.com/t/chenami-user-interface-portfolio-uiux/455344) | chenami | 2020-02-11 | `ui_hud`, `shop`, `inventory`, `interaction` | 16 |
| `tower_defense` | [Creator Spotlight: BelowNatural’s Journey Building Paradoxum Games](https://devforum.roblox.com/t/creator-spotlight-belownatural%E2%80%99s-journey-building-paradoxum-games/3027035) | Bluff_006 | 2024-06-17 | `map_composition`, `low_poly_props`, `lighting`, `interaction` | 4 |
| `tower_defense` | [A Tower Defense Game](https://devforum.roblox.com/t/a-tower-defense-game/1425825) | TurboGoStu | 2021-08-20 | `ui_hud`, `shop`, `inventory`, `interaction` | 3 |
| `tower_defense` | [Tower Defense Map - Upcoming Game](https://devforum.roblox.com/t/tower-defense-map-upcoming-game/2641709) | RagnarokConstruct | 2023-10-11 | `map_composition`, `low_poly_props`, `materials`, `lighting` | 2 |
| `tower_defense` | [Tower Defense Map Feedback](https://devforum.roblox.com/t/tower-defense-map-feedback/3568468) | coderluau | 2025-03-24 | `ui_hud`, `map_composition`, `low_poly_props`, `interaction` | 3 |
| `fps_arena` | [What Do You Think Of My FPS Game?](https://devforum.roblox.com/t/what-do-you-think-of-my-fps-game/1537443) | icecatz | 2021-11-06 | `ui_hud`, `map_composition`, `low_poly_props`, `interaction` | 4 |
| `fps_arena` | [FPS Game Devlog \| #28 - A Fresh Start](https://devforum.roblox.com/t/fps-game-devlog-28-a-fresh-start/1274373) | iceking_gfx | 2021-06-05 | `ui_hud`, `inventory`, `map_composition`, `interaction` | 4 |
| `fps_arena` | [FPS Game Devlog \| #26 - Gun Game, Map Update and more](https://devforum.roblox.com/t/fps-game-devlog-26-gun-game-map-update-and-more/1185888) | iceking_gfx | 2021-04-24 | `ui_hud`, `map_composition`, `materials`, `interaction` | 4 |
| `fps_arena` | [FPS Game Devlog \| #27 - Rank Unlock Guns, new round system, new map voting system, inspect animations, new guns, and more!](https://devforum.roblox.com/t/fps-game-devlog-27-rank-unlock-guns-new-round-system-new-map-voting-system-inspect-animations-new-guns-and-more/1214995) | iceking_gfx | 2021-05-09 | `ui_hud`, `inventory`, `map_composition`, `interaction` | 4 |
| `anime_battle` | [[DevLog - Update 2] The Abyss : Scripting takes a lot of time](https://devforum.roblox.com/t/devlog-update-2-the-abyss-scripting-takes-a-lot-of-time/893890) | Lord_Monever | 2020-11-28 | `map_composition`, `low_poly_props`, `materials`, `lighting` | 4 |
| `anime_battle` | [Feedback on some Icons, UIs and Logos I've made](https://devforum.roblox.com/t/feedback-on-some-icons-uis-and-logos-ive-made/1203043) | RxnClash | 2021-05-04 | `ui_hud`, `shop`, `materials`, `interaction` | 4 |
| `survival` | [The biggest upcoming open world survival game of 2021](https://devforum.roblox.com/t/the-biggest-upcoming-open-world-survival-game-of-2021/969921) | OG_Netflix | 2021-01-08 | `ui_hud`, `inventory`, `map_composition`, `materials`, `lighting` | 12 |
| `survival` | [3D Main Menu Feedback](https://devforum.roblox.com/t/3d-main-menu-feedback/2018681) | TopHatRBLX | 2022-10-11 | `ui_hud`, `materials`, `lighting`, `interaction` | 1 |
| `survival` | [New Survival Game](https://devforum.roblox.com/t/new-survival-game/3029230) | Ace_Max01 | 2024-06-19 | `ui_hud`, `inventory`, `low_poly_props`, `interaction` | 2 |
| `survival` | [Creating my unique weapon-style RPG game within 2.5 years progress. This is what I got](https://devforum.roblox.com/t/creating-my-unique-weapon-style-rpg-game-within-25-years-progress-this-is-what-i-got/1099499) | Gabe163 | 2021-03-12 | `map_composition`, `low_poly_props`, `lighting`, `interaction` | 4 |

## Official implementation sources already in the corpus

These are not newly downloaded pages. The manifest resolves them to the exact local `docSlug`
and all corresponding `vecId` values. A live HTTPS HEAD check also passed for
25 of 25 stored Creator Hub URLs on 2026-09-18.

The local corpus does not provide authoritative publication dates for these pages. The manifest stores
`publicationDate: null` and `dateStatus: not_available_in_local_corpus` instead of
inventing dates.

| corpus document ID | source | kind | local chunks |
|---|---|---|---:|
| `api-proximityprompt` | [ProximityPrompt (Class)](https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt) | `api` | 2 |
| `docs-art-modeling-surface-appearance` | [PBR textures](https://create.roblox.com/docs/art/modeling/surface-appearance) | `guide` | 15 |
| `docs-environment-atmosphere` | [Atmospheric effects](https://create.roblox.com/docs/environment/atmosphere) | `guide` | 2 |
| `docs-environment-lighting` | [Global lighting](https://create.roblox.com/docs/environment/lighting) | `guide` | 4 |
| `docs-environment-post-processing-effects` | [Post-processing effects](https://create.roblox.com/docs/environment/post-processing-effects) | `guide` | 4 |
| `docs-input-input-action-system` | [Input Action System](https://create.roblox.com/docs/input/input-action-system) | `guide` | 27 |
| `docs-parts` | [Parts](https://create.roblox.com/docs/parts) | `guide` | 9 |
| `docs-parts-materials` | [Materials](https://create.roblox.com/docs/parts/materials) | `guide` | 26 |
| `docs-parts-meshes` | [Meshes](https://create.roblox.com/docs/parts/meshes) | `guide` | 8 |
| `docs-players-tools` | [In-game tools](https://create.roblox.com/docs/players/tools) | `guide` | 9 |
| `docs-production-game-design-contextual-purchases` | [Contextual purchases](https://create.roblox.com/docs/production/game-design/contextual-purchases) | `guide` | 6 |
| `docs-production-monetization-developer-products` | [Developer Products](https://create.roblox.com/docs/production/monetization/developer-products) | `guide` | 15 |
| `docs-production-monetization-passes` | [Passes](https://create.roblox.com/docs/production/monetization/passes) | `guide` | 12 |
| `docs-production-monetization-shop` | [Shop](https://create.roblox.com/docs/production/monetization/shop) | `guide` | 4 |
| `docs-production-publishing-adaptive-design` | [Adaptive design guidelines](https://create.roblox.com/docs/production/publishing/adaptive-design) | `guide` | 6 |
| `docs-tutorials-curriculums-core-building-greybox-a-playable-area` | [Greybox a playable area](https://create.roblox.com/docs/tutorials/curriculums/core/building/greybox-a-playable-area) | `guide` | 10 |
| `docs-tutorials-curriculums-environmental-art-construct-your-world` | [Construct your world](https://create.roblox.com/docs/tutorials/curriculums/environmental-art/construct-your-world) | `guide` | 78 |
| `docs-tutorials-curriculums-environmental-art-greybox-your-environment` | [Greybox your environment](https://create.roblox.com/docs/tutorials/curriculums/environmental-art/greybox-your-environment) | `guide` | 27 |
| `docs-tutorials-use-case-tutorials-lighting-create-flickering-lights` | [Create flickering lights](https://create.roblox.com/docs/tutorials/use-case-tutorials/lighting/create-flickering-lights) | `guide` | 8 |
| `docs-tutorials-use-case-tutorials-lighting-enhance-indoor-environments` | [Enhance indoor environments with realistic lighting](https://create.roblox.com/docs/tutorials/use-case-tutorials/lighting/enhance-indoor-environments) | `guide` | 28 |
| `docs-tutorials-use-case-tutorials-lighting-enhance-outdoor-environments` | [Enhance outdoor environments with realistic lighting](https://create.roblox.com/docs/tutorials/use-case-tutorials/lighting/enhance-outdoor-environments) | `guide` | 15 |
| `docs-tutorials-use-case-tutorials-modeling-assemble-modular-environments` | [Assemble modular environments](https://create.roblox.com/docs/tutorials/use-case-tutorials/modeling/assemble-modular-environments) | `guide` | 12 |
| `docs-tutorials-use-case-tutorials-ui-create-hud-meters` | [Create HUD meters](https://create.roblox.com/docs/tutorials/use-case-tutorials/ui/create-hud-meters) | `guide` | 23 |
| `docs-ui-grid-table-layouts` | [Grid and table layouts](https://create.roblox.com/docs/ui/grid-table-layouts) | `guide` | 4 |
| `docs-workspace-raycasting` | [Raycasting](https://create.roblox.com/docs/workspace/raycasting) | `guide` | 5 |

## Schema and resolver boundary

`packages/corpus/data/genre-references.json` has three joined record types:

- **External references**: genre IDs, aspects, canonical URL, original publisher/author/date,
  verification and inspection evidence, scoped visual observations, cautions, and an explicit
  reference-only licence boundary.
- **Official documents**: one normalized document record per existing corpus `docSlug`, with
  canonical URL, kind, and every local chunk ID.
- **Implementation links**: one genre and one aspect, pointing to an official document ID, with an
  authored rationale and implementation rules.

`packages/corpus/src/genre-references.mjs` exposes:

- `loadGenreReferenceManifest()`
- `listGenreReferenceGenres()`
- `listGenreReferenceAspects()`
- `queryGenreReferences({ genre, aspect, kinds, inspectedOnly, limit })`
- `getGenreReferenceCoverage()`

Queries are synchronous and offline. An external URL is returned as evidence metadata; the resolver
does not fetch it, execute its content, or treat it as instructions. The default result limit is
8, and any larger requested limit is clamped to
20. Returned data is cloned so callers cannot mutate the shared
manifest.

## Rights boundary

Every external row has:

- `referenceUse: reference_only`
- `licence.status: unverified_reference_only`
- `licence.copyPermission: false`

A public forum post is evidence that a visual was shown, not evidence that its media, assets, code, or
design may be copied. No permissive licence was inferred from availability, a download link, the word
“free,” or an author description. The source URLs exist so a human can inspect provenance and context;
they are not ready-to-use assets or training data.

## Validation

The checks were run against the final owned files:

| command/check | result |
|---|---|
| `node --check packages/corpus/src/genre-references.mjs` | passed |
| `node --test packages/corpus/src/genre-references.test.mjs` | 8 tests passed, 0 failed |
| `node --test packages/corpus/src/*.test.mjs` | 49 tests passed, 0 failed |
| finite live topic verification | 36/36 external topic records passed ID/title/author/date checks |
| finite live official-link verification | 25/25 Creator Hub URLs returned successful HTTPS HTML responses |

The new tests derive genre IDs from the real worker source, validate URL structure and truthful
inspection/licence metadata, join every official document to the real local chunks, require all 80
genre × aspect pairs, prove the resolver works with network access disabled, exercise invalid inputs,
verify the 20-result cap, and confirm defensive copies.

This work has not been deployed and does not change the Studio UI or any customer data.

## Worker runtime integration

`apps/worker/src/genre-reference-guide.ts` now exposes the curated corpus to the Worker without a
runtime filesystem read or network request. The module statically imports
`packages/corpus/data/genre-references.json`, so the bundler embeds the source data, then returns a
bounded projection rather than the full manifest. Its embedded source SHA-256 is:

`8c332bcfb2fb7bcd087cf690a2c6108b28e44e53192e46740d5341ec9d2e3fae`

`apps/worker/tests/genre-reference-guide.test.mjs` recomputes that hash from the source bytes. A
manifest edit therefore fails the Worker test until the runtime projection is reviewed against the
new source. The test also bundles with `platform=browser` and rejects Node filesystem dependencies.

The integration surface for the main worker is:

```ts
import {
  getGenreReferenceGuide,
  GENRE_REFERENCE_GUIDE_ASPECT_IDS,
} from './genre-reference-guide';

const result = getGenreReferenceGuide({
  genre: args.genre,
  aspect: args.aspect,
  maxChars: 2700,
});
```

The exported call is
`getGenreReferenceGuide(input?: { genre?: string; aspect?: string; maxChars?: number })`.
Genre is required and checked against the real `GENRE_KIT_IDS`; aspect is optional and checked
against the eight manifest aspects. Missing or unknown filters return an explicit `noMatch` result
with the known IDs and do not reflect the rejected text.

Every successful result includes:

- scoped project-authored visual observations and their exact source URLs, authors and dates;
- a scoped official Creator Hub implementation source and authored rules at the default budget;
- `reference_only`, `copyPermission: false`, `externalUrls: evidence_only`, and
  `trainingData: false` rights metadata;
- the exact external and official aspect coverage plus real missing-aspect lists;
- matched, returned and omitted counts for sources, observations and rules, with an explicit
  `truncated` value;
- `createdGame.visuallyVerified: false` and `studioVisualPass: required_after_build`.

The helper does not claim that inspecting a source proves the generated Studio result. The result
must still pass the live Studio visual gate after a build.

### Measured runtime payloads

The default 2,700-character budget was measured across all 90 canonical queries: ten broad genre
queries and all 80 genre × aspect queries.

| measurement | observed |
|---|---:|
| serialized result range | 1,484–2,700 characters |
| sources returned per result | 1–3 |
| visual observations returned | 0–3 |
| official rules returned | 1–2 |
| results with explicit truncation | 43/90 |
| aspect queries reporting a real visual-reference gap | 11 |
| valid queries returning no source | 0 |

The zero-observation results are the 11 documented visual-reference gaps. Each still returns an
official implementation source and marks `requestedExternalStatus: gap`; no weak external link is
invented to fill the space.

### Runtime validation

| command/check | result |
|---|---|
| `node --test apps/worker/tests/genre-reference-guide.test.mjs` | 7 passed, 0 failed |
| guide tests plus worker6 creator-skills catalogue/tool tests | 20 passed, 0 failed |
| `pnpm --filter @golem/worker typecheck` | passed |
| hash-guard falsification | changing only the embedded SHA made the hash-specific test fail; restoring it returned the full suite to green |

No tool registration, router, prompt, genre-kit, UI, deployment, provider, account or customer-data
file was changed in this integration step.
