# Genre-reference visual-gap follow-through — 2026-09-18

This pass started from the measured external visual-reference matrix in
`packages/corpus/data/genre-references.json`. Official Creator Hub implementation coverage was
already complete at 80/80 genre/aspect pairs. The remaining problem was narrower: 11 canonical
genre/aspect queries had no visually inspected external observation.

The research stayed below the 30-page cap. Eighteen distinct DevForum candidate topics were opened
or checked during the bounded follow-through; nine met the genre-specific visual bar and were
retained. Representative visuals were inspected for every retained source. No source media, code,
or page prose was copied into the corpus; the corpus stores only the source URL, provenance, and new
project-authored observations.

## Result

| previously missing pair | result | retained visual reference |
|---|---|---|
| `horror/shop` | closed | [Feedback on Main Menu for upcoming horror game](https://devforum.roblox.com/t/feedback-on-main-menu-for-upcoming-horror-game/2400908) |
| `horror/inventory` | **still a real gap** | none retained |
| `obby/inventory` | closed | [Feedback on GUI for my glider obby?](https://devforum.roblox.com/t/feedback-on-gui-for-my-glider-obby/3542439) |
| `tycoon/ui_hud` | closed | [Feedback for a sandbox tycoon HUD](https://devforum.roblox.com/t/feedback-for-a-sandbox-tycoon-hud/801982) |
| `tycoon/shop` | closed | [Tycoon Kit UI Showcase](https://devforum.roblox.com/t/tycoon-kit-ui-showcase/3273680) |
| `tycoon/inventory` | closed | [Feedback for a sandbox tycoon HUD](https://devforum.roblox.com/t/feedback-for-a-sandbox-tycoon-hud/801982) |
| `racing/shop` | closed | [How to fix THIS racing gui?](https://devforum.roblox.com/t/how-to-fix-this-racing-gui/2844419) |
| `racing/materials` | closed | [Racing livery feedback](https://devforum.roblox.com/t/racing-livery-feedback/4571443) |
| `fps_arena/shop` | closed | [Feedback on my in-development FPS game, Freefire!](https://devforum.roblox.com/t/feedback-on-my-in-development-fps-game-freefire/1933730) |
| `fps_arena/lighting` | closed | [I need some feedback on my low-poly fps map!](https://devforum.roblox.com/t/i-need-some-feedback-on-my-low-poly-fps-map/610085) |
| `survival/shop` | closed | [Survive The Disasters Ultra](https://devforum.roblox.com/t/survive-the-disasters-ultra/1001124) |

After the additions the manifest has **45 external references, 177 authored external observations,
79/80 external visual genre/aspect pairs, 25 exact local Creator Hub documents, and 80/80 official
implementation links**. The remaining external visual gap is exactly `horror/inventory`.

## What was visually retained

The additions were intentionally narrow. They do not turn a generic UI screenshot into evidence for
an unrelated genre.

| topic | creator/date verified from live topic JSON | inspected visual use |
|---|---|---|
| `2400908` | Carl_Weezer13 · 2023-06-01 | Horror main-menu Shop entry: discoverability without replacing the dark scene with a bright commerce surface. |
| `3542439` | 2octos · 2025-03-09 | Glider-obstacle UI: inventory is visibly separated from shop cards and leaves the route visible around the overlay. The creator calls it WIP, which is recorded as a caution. |
| `3273680` | ShotgunRound · 2024-11-25 | Tycoon store cards: repeated offer hierarchy, visible benefit/price, and one predictable purchase target. |
| `801982` | novaseer · 2020-10-02 | Sandbox-tycoon HUD/inventory: persistent economy counters remain separate from a larger management grid. Desktop-only proportions are recorded as a caution. |
| `2844419` | KrimsonWoIf · 2024-02-19 | Racing garage: Shop is a first-level destination beside Play/Garage while the selected car remains the visual focus. The source is used for shop discoverability, not as proof of an unseen catalogue. |
| `4571443` | The_AceCrafter · 2026-04-12 | Racing livery: broad dark body material plus restrained bright panels, preserving glass/tire/trim separation and distance readability. |
| `1933730` | bostnm · 2022-08-22 | FPS lobby: Shop is a large top-level action in the same navigation grammar as Play while the avatar/arena remain visible. The observations do not claim an unseen catalogue design. |
| `610085` | Gamingidu · 2020-06-04 | Low-poly FPS container arena: bright sky fill/directional light preserves cover edges and saturated landmark separation; the page's dark-interior concern is recorded as a caution. |
| `1001124` | Wintremourn · 2021-01-23 | Survival-disaster shop: compact item rail, selected-item detail/progression, and a fixed exit path suitable for returning quickly to hazards. |

## The gap that was deliberately not padded

`horror/inventory` remains open. The closest candidate topics did not meet the evidence bar. One
asked for horror UI design ideas and showed an inspiration image from another game; another asked how
to make a custom horror inventory and likewise relied on an external inspiration example. Those pages
can motivate future research, but they are not creator-owned horror inventory proof, so neither was
added merely to turn the matrix green.

The resolver test now derives all external visual pairs from the authored observation records and
then executes `queryGenreReferences` for every canonical genre/aspect pair. It expects exactly the
reviewed `horror/inventory` gap. This is an intentional review tripwire: a future source should change
the expected list only after its visual provenance has been inspected and documented.

## Rights and provenance

Every retained page remains `reference_only`, with `licence.status =
unverified_reference_only` and `copyPermission = false`. No download URL, reusable asset, source
code, or source-page instructions were added. The Worker guide's rights projection sets
`trainingData: false` for these external references; this manifest keeps the existing schema rather
than inventing a second training-rights field.

The official implementation records were not edited. The corpus test still verifies every official
document URL and every stored chunk ID against `packages/corpus/data/chunks.jsonl`, so the existing
25-document / 80-link join remains exact.

## Verification and hand-off

Current source-manifest SHA-256 after formatting:

`482787e6fe202531f332daab1f2bd37fa24046c7f8194f354f657ab0fa163921`

Validation run in this checkout:

| check | measured result |
|---|---|
| `node --test packages/corpus/src/genre-references.test.mjs` | **9 passed, 0 failed** after the final JSON formatting pass |
| `node --check packages/corpus/src/genre-references.mjs` | passed |
| parsed coverage measurement | 45 external refs · 177 observations · 79/80 visual pairs · only `horror/inventory` missing · 25 official docs · 80 implementation links |
| `node --test apps/worker/tests/genre-reference-guide.test.mjs` | **6 passed, 1 failed exactly at the manifest-hash guard**: Worker still carries the previous `8c332bcfb2fb7bcd087cf690a2c6108b28e44e53192e46740d5341ec9d2e3fae` SHA and expects regeneration/update by the integration owner |

The Worker helper is outside this worker's edit scope. Its embedded/runtime source hash must be
updated from the old SHA to `482787e6fe202531f332daab1f2bd37fa24046c7f8194f354f657ab0fa163921`
after this corpus change is accepted. The hash guard is currently doing the intended job by refusing
to describe the old projection as current.
