// rules.mjs — the design intelligence itself.
//
// WHY THIS EXISTS. §G: "Golem must STOP defaulting to inventing every Roblox GUI
// and every visual primitive from a blank canvas." §K says what to do instead:
// extract the GRAMMAR from good work, then build original primitives from it —
// explicitly NOT paste third-party UI into generated games.
//
// The corpus classification made that instruction load-bearing rather than
// stylistic. Of the 24 free cartoon UI kits and low-poly world packs in the seed
// manifest, ZERO can prove a licence about themselves — every one is a DevForum
// thread, and §H is explicit that a thread is a claim, not a licence. So for
// exactly the categories this library most needs, ingestion is not available and
// grammar extraction is not a preference, it is the only lawful route.
//
// WHAT A RULE IS. Not a number. A number without its reason cannot be applied to
// a different genre, a different screen size or a different component, and will be
// cargo-culted the first time it does not fit. Every rule therefore carries:
//
//   rule      the imperative, stated so it can be followed
//   because   the reasoning that makes it transferable
//   prevents  the NAMED failure it exists to stop — usually one a review found
//   provenance where it came from and whether it has been seen to work
//
// PROVENANCE IS A LICENCE BOUNDARY, NOT A CITATION STYLE.
//
//   golem-authored   written for Crystal Canyon, owned outright, safe to reproduce
//   learned-pattern  a general grammar observed in a licence-clear source
//   reference-only   observed in a source we may READ but may not copy
//
// A `reference-only` rule may carry an imperative and a reason. It may never carry
// `tokens` — concrete reproducible values — because that is the line between
// learning a pattern and copying an asset. `assertLicenceSafety` enforces it and a
// test drives the violation.
//
// WHERE THE SECOND SOURCE COMES FROM. The first pass drew 25 of 26 rules from one
// game, which §L names as a risk: a library that only knows one simulator will make
// every genre look like that simulator. The way out is not to invent the missing
// genres — §AK — it is to find a source that can prove a licence and read it. The
// corpus classification found exactly one that suits art direction:
// `Roblox/creator-docs`, CC-BY-4.0, already vetted, already checked out. It cannot
// teach taste, but it documents ENGINE FACTS that decide whether an art direction is
// even achievable — which surface flags still do anything, what a colour becomes when
// it is converted, which axis a page layout quietly takes away from the player.
//
// §M asks for STUDS / CLASSIC as a first-class art language rather than a texture
// checkbox, and that is where this pays: the classic look is mostly a set of engine
// behaviours that were never re-documented as style, so guessing at them produces
// builds that are wrong in ways a screenshot will not show.

export const COMPONENTS = Object.freeze([
  'panel', 'modal', 'button', 'icon-button', 'currency-pill', 'nav', 'toast',
  'card', 'counter', 'gauge', 'tab', 'icon', 'layout', 'motion', 'typography',
]);

export const STYLE_FAMILIES = Object.freeze([
  'cartoon-simulator', 'tycoon', 'incremental', 'pets-collection', 'rpg',
  'fantasy', 'sci-fi', 'horror', 'minimalist', 'modern', 'studs-classic',
  'retro-roblox', 'obby', 'tower-defence', 'battleground-fps', 'social',
  'driving', 'farming', 'inventory-heavy', 'progression', 'dialogue-story',
  'mobile-first', 'controller-first',
]);

export const PROVENANCE_KINDS = Object.freeze(['golem-authored', 'learned-pattern', 'reference-only']);

// A rule that claims a platform it was not written for is the same dishonesty as
// a rule that claims a genre it was not written for, so the vocabulary is closed.
// `gamepad` is separate from `desktop`: a controller on a PC still navigates by
// selection graph rather than by pointer, and that is the whole of the difference.
export const PLATFORMS = Object.freeze(['desktop', 'mobile', 'gamepad']);

const CC = (file) => ({
  kind: 'golem-authored',
  source: `apps/benchmark/crystal-canyon/src/client/${file}`,
  validated: 'rendered and reviewed in Studio, 2026-09-01',
});

/**
 * `Roblox/creator-docs` is one of only two CC-BY-4.0 repositories in the whole
 * seed manifest, and the corpus intake already vetted it. That makes it a
 * LICENCE-CLEAR source, so a rule learned from it is `learned-pattern`, not
 * `reference-only`: it may state the grammar AND carry the engine facts the
 * document records. The attribution CC-BY requires is the file path itself, so
 * every such rule names the exact file it was read from rather than the repo.
 *
 * `validated` says "documented" rather than "rendered" on purpose. A documented
 * behaviour has been WRITTEN DOWN by the engine's authors; it has not been seen
 * to work in a Golem fixture. `retrieve` gives its +2 only to rules that have,
 * so these correctly rank below the ones that shipped.
 */
const DOCS = (file) => ({
  kind: 'learned-pattern',
  source: `Roblox/creator-docs content/en-us/reference/engine/${file} (CC-BY-4.0)`,
  validated: 'documented engine behaviour; not yet built in a Golem fixture',
});

/** Same source, same licence, but a prose guide rather than the API reference. */
const GUIDE = (file) => ({
  kind: 'learned-pattern',
  source: `Roblox/creator-docs content/en-us/${file} (CC-BY-4.0)`,
  validated: 'documented engine behaviour; not yet built in a Golem fixture',
});

/** @type {ReadonlyArray<object>} */
export const RULES = Object.freeze([
  // ---------------------------------------------------------------- layout
  {
    id: 'layout.cluster-origin-agreement',
    component: 'layout',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'mobile-first'],
    platforms: ['desktop', 'mobile'],
    rule: 'Two HUD clusters on the same screen edge must be positioned from the SAME origin, or one must be positioned relative to the other.',
    because: 'A cluster pinned to the top and a cluster centred on the screen have no relationship, so whether they collide is decided by viewport height alone — which means it is decided by the reviewer\'s monitor.',
    prevents: 'A 97x73px overlap of the nav rail on the currency gauge, invisible on a tall viewport and worse on a short landscape phone.',
    provenance: CC('Hud.luau'),
    tokens: { collisionGapPx: 12 },
  },
  {
    id: 'layout.step-down-on-collision',
    component: 'layout',
    styleFamilies: ['mobile-first', 'cartoon-simulator'],
    platforms: ['mobile'],
    rule: 'When a centred element would overlap a pinned column at small widths, step it DOWN below the column rather than shrinking it.',
    because: 'Both elements have a legibility floor. Scaling to fit crosses that floor before the overlap resolves, so the collision is traded for unreadable text.',
    prevents: 'A 300px-minimum objective chip overlapping a 250px-minimum wallet column at 390px wide.',
    provenance: CC('Hud.luau'),
  },
  {
    id: 'layout.touch-floor-from-smallest-target',
    component: 'layout',
    styleFamilies: ['mobile-first'],
    platforms: ['mobile'],
    rule: 'Derive the minimum UI scale from the SMALLEST touch target, not from the average, and state the arithmetic where the scale is defined.',
    because: 'Scale is global but touch comfort is per-control. Only the smallest control decides whether the floor holds.',
    prevents: 'A HUD that scales below a 44px touch target on a phone while every larger control still looks fine.',
    provenance: CC('Hud.luau'),
    tokens: { minTouchPx: 44, exampleTilePx: 68, exampleMinScale: 0.72 },
  },
  {
    id: 'layout.safe-area-is-opt-out-for-decoration-only',
    component: 'layout',
    styleFamilies: ['mobile-first'],
    platforms: ['mobile'],
    rule: 'Leave a ScreenGui on the default core-UI safe insets. Opt out only for a ScreenGui that holds noninteractive content such as a backdrop image.',
    because: 'The default inset is what holds controls clear of the Roblox top bar and the device camera cutout. Opting a surface out is a full-bleed decision about decoration, and it silently opts every control inside that surface out of being reachable as well.',
    prevents: 'A modal close button rendered under a phone\'s camera notch — pressable on the reviewer\'s desktop and not on the player\'s handset.',
    provenance: DOCS('classes/ScreenGui.yaml (ScreenInsets, IgnoreGuiInset)'),
  },
  // ---------------------------------------------------------------- genre
  //
  // §L: the library must not overfit to one simulator aesthetic. These rules exist
  // because a genre is not a palette swap — it changes which of the rules above
  // still hold. Each one below states what the genre CHANGES about a rule this
  // library already trusts, which is why they are short and why there are not many:
  // §AK, a genre rule invented because it sounded plausible is worse than a gap.
  {
    id: 'progression.signpost-the-route-in-the-world-not-only-the-hud',
    component: 'layout',
    styleFamilies: ['progression', 'obby', 'cartoon-simulator', 'tycoon'],
    platforms: ['desktop', 'mobile'],
    rule: 'Mark where the player goes next with world geometry — an oversized arrow, a lit pad, a coloured floor ring, a gate — so the route survives with the HUD hidden and without reading any text.',
    because: 'A HUD objective line is out of sight the moment the player looks at the thing it describes, and text excludes anyone who cannot read the language it happens to be written in. A physical signpost is legible from inside the world and needs no translation.',
    prevents: 'A player who has been told the objective in words and still does not know which way to walk.',
    provenance: {
      kind: 'reference-only',
      source: 'docs/ROBLOX-STYLE-SPEC.md §7 — derived from reference screenshots that are NOT redistributed and were inspected once (see that document\'s §10)',
      validated: 'not yet built',
    },
  },
  {
    id: 'horror.atmosphere-hides-the-world-not-the-sky',
    component: 'layout',
    styleFamilies: ['horror'],
    platforms: ['desktop'],
    rule: 'When darkening a scene with Atmosphere, treat the skybox as a separate problem and darken it explicitly.',
    because: 'Atmosphere density obscures in-game objects and terrain but is documented NOT to affect the skybox directly, so raising it removes everything the player might have taken comfort from and leaves the horizon exactly as bright as it always was.',
    prevents: 'A fog-bound horror level with a cheerful daylight sky glowing between the trees — the brightest thing on screen being the one thing the fog was there to remove.',
    provenance: DOCS('classes/Atmosphere.yaml (Density)'),
  },
  {
    id: 'horror.measure-hud-contrast-against-the-darkest-ground',
    component: 'layout',
    styleFamilies: ['horror'],
    platforms: ['desktop', 'mobile'],
    rule: 'Measure every HUD contrast against the DARKEST place the player will stand, and give the HUD its own ground rather than letting it float on the world.',
    because: 'Measuring a colour against the surface it is painted on gets stricter as the world gets darker: a readout tuned in a lit scene has no floor left in the dark scene the game actually spends its time in, and unlike a wayfinding colour the player cannot walk somewhere else to read it.',
    prevents: 'A health readout that is legible in the lit entrance corridor and invisible for the rest of the game.',
    provenance: {
      kind: 'golem-authored',
      source: 'packages/design (extension of colour.measure-guide-contrast-against-its-own-ground to low-light genres)',
      validated: 'not yet built',
    },
  },
  {
    id: 'tower-defence.every-lane-is-load-bearing-not-just-the-centre',
    component: 'panel',
    styleFamilies: ['tower-defence'],
    platforms: ['desktop', 'mobile'],
    rule: 'Open a build or upgrade panel beside the thing it acts on, or make it dismissible in a single input. Edge-anchoring the HUD is not enough when the whole play surface carries information.',
    because: 'The usual "keep the centre clear" rule assumes only the centre is load-bearing. Where every lane is being scored simultaneously, an opaque panel hides something the player is accountable for no matter which edge it is anchored to.',
    prevents: 'A tower upgrade panel covering the exact lane the player opened it to defend.',
    provenance: {
      kind: 'reference-only',
      source: 'docs/ROBLOX-STYLE-SPEC.md §6 ("the centre stays empty"), extended to genres where the whole play surface is load-bearing; the underlying screenshots are NOT redistributed (that document\'s §10)',
      validated: 'not yet built',
    },
  },
  // ---------------------------------------------------------------- panel
  {
    id: 'minimalist.grouping-must-survive-the-loss-of-the-plate',
    component: 'panel',
    styleFamilies: ['minimalist'],
    platforms: ['desktop', 'mobile'],
    rule: 'When the shared plate is removed, replace it with an explicit grouping signal — a shared baseline, a fixed gutter, a rule line — rather than leaving proximity to do the work alone.',
    because: 'A chunky style communicates grouping through one carved surface. Strip the surface and proximity is the only cue left, and proximity is not stable across viewport widths, because the gaps themselves are what change.',
    prevents: 'A minimal HUD whose three clusters read as one block on a wide monitor and as unrelated floating labels on a narrow one.',
    provenance: {
      kind: 'golem-authored',
      source: 'packages/design (the dual of panel.one-plate-language, whose premise minimalism removes)',
      validated: 'not yet built',
    },
  },
  {
    id: 'panel.one-plate-language',
    component: 'panel',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental'],
    platforms: ['desktop', 'mobile'],
    rule: 'Mount every HUD cluster on the SAME plate primitive. Three clusters on one carved slab reads as one designed system; three bespoke containers read as three widgets.',
    because: 'Grouping is communicated by shared surface language, not by proximity.',
    prevents: '"Side navigation feels like unrelated coloured circles."',
    provenance: CC('Theme.luau'),
  },
  {
    id: 'panel.depth-is-an-edge-not-a-shadow',
    component: 'panel',
    styleFamilies: ['cartoon-simulator', 'tycoon'],
    platforms: ['desktop', 'mobile'],
    rule: 'Give chunky controls a hard bottom EDGE of a few pixels in a darker tone, and reserve blur shadows for separating a modal from the world behind it.',
    because: 'A cartoon control reads as an extruded object because its bottom face is visible, not because it is blurred.',
    prevents: 'Flat pills that look like coloured rectangles regardless of stroke weight.',
    provenance: CC('Theme.luau'),
    tokens: { edgeRestPx: 9, edgePressedPx: 2 },
  },
  {
    id: 'panel.reserve-footer-space-for-the-edge',
    component: 'panel',
    styleFamilies: ['cartoon-simulator', 'tycoon'],
    platforms: ['desktop'],
    rule: 'A plate with a hard bottom edge must reserve that edge\'s height in its own padding, and a clipping container must reserve MORE room below the last child than above the first.',
    because: 'The edge is drawn inside the plate; symmetric padding shaves the last child\'s corners off against the rounded clip.',
    prevents: 'A caption plate whose corners are sliced away by the rail it sits in.',
    provenance: CC('Hud.luau'),
  },
  // ---------------------------------------------------------------- button
  {
    id: 'button.press-is-a-hard-cut',
    component: 'button',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental'],
    platforms: ['desktop', 'mobile'],
    rule: 'Make a press an INSTANT depth change — shrink the edge and move every face child down by exactly that amount — rather than a tween.',
    because: 'A press that eases into being pressed feels soft; this category\'s read is a hard cut. Release may ease; the press may not.',
    prevents: 'Buttons that feel unresponsive despite having animation.',
    provenance: CC('Theme.luau'),
    tokens: { edgeRestPx: 9, edgePressedPx: 2 },
  },
  {
    id: 'button.caption-plate-wider-than-icon',
    component: 'icon-button',
    styleFamilies: ['cartoon-simulator', 'tycoon'],
    platforms: ['desktop', 'mobile'],
    rule: 'When a label sits under an icon tile, make the caption plate WIDER than the tile rather than shrinking the type.',
    because: 'The longest label decides the plate width. Type size is a legibility floor and is not the adjustable dimension.',
    prevents: '"Labels under icons are tiny."',
    provenance: CC('Hud.luau'),
    tokens: { tilePx: 68, plateWidthPx: 84, plateOverlapPx: 8 },
  },
  {
    id: 'button.clipping-container-cannot-hold-an-overhang',
    component: 'icon-button',
    styleFamilies: ['cartoon-simulator'],
    platforms: ['desktop'],
    rule: 'Never pin a badge, caption or overhang INSIDE a container that clips its descendants; parent it to the cell instead.',
    because: 'The clip is usually there for the hard bottom edge, and it will remove exactly the part of the child that was supposed to stick out.',
    prevents: 'An icon button whose caption plate was clipped away entirely, rendering wordless.',
    provenance: CC('Hud.luau'),
  },
  // ---------------------------------------------------------------- currency
  {
    id: 'currency.pill-anatomy',
    component: 'currency-pill',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'pets-collection'],
    platforms: ['desktop', 'mobile'],
    rule: 'A currency readout is icon + NAME + value on one capsule, with the name in small caps above or beside the value — not a bare number.',
    because: 'A player holding two currencies must be able to tell them apart at a glance; colour alone fails for colour-blind players and in screenshots.',
    prevents: 'Two indistinguishable numeric readouts.',
    provenance: CC('Hud.luau'),
    tokens: { capsuleHeightPx: 58, capsuleGapPx: 8 },
  },
  {
    id: 'currency.never-restate-a-price-in-two-layers',
    component: 'currency-pill',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental'],
    platforms: ['desktop', 'mobile'],
    rule: 'The product layer must not restate a cost that the accounting layer owns. Show the number from ONE source or show no number.',
    because: 'Two copies of a price drift, and the copy the user sees is not the copy the balance gate reads.',
    prevents: 'A UI showing "1 / 4 / 10 sparks" while the gate charged 1 / 2 / 3 — users shown a cost 2-3x higher than the one taken.',
    provenance: { kind: 'golem-authored', source: 'apps/web product modes', validated: 'found and fixed in review' },
  },
  // ---------------------------------------------------------------- motion
  {
    id: 'motion.open-overshoots-close-does-not',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental'],
    platforms: ['desktop', 'mobile'],
    rule: 'Open with a slight overshoot (Back/Out, ~0.24s); close monotonically with no overshoot (Quad/In, ~0.14s). The two directions must not share a curve.',
    because: 'An overshoot on the way out reads as the panel failing to leave. Asymmetry is what makes the pair feel deliberate.',
    prevents: 'Modals that feel rubbery on dismiss.',
    provenance: { ...CC('Theme.luau'), validated: 'measured frame-by-frame: peak 1.018 at +114ms, settles 1.000 at +215ms' },
    tokens: { openSeconds: 0.24, closeSeconds: 0.14, overshootPct: 1.8, backdropFadeSeconds: 0.18 },
  },
  {
    id: 'motion.reduced-motion-removes-travel-not-outcome',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'minimalist', 'mobile-first'],
    platforms: ['desktop', 'mobile'],
    rule: 'Under reduced motion, apply the END STATE immediately and still fire the completion signal. Do not suppress the feedback itself.',
    because: 'Callers hide, unmount and unlock in completion handlers; a tween that never completes strands them. And a player who asked for calm still needs to see that the number changed.',
    prevents: 'A panel that stays visible forever because its close tween never reported completion.',
    provenance: { ...CC('Theme.luau'), validated: 'proven both branches: full motion mid-tween at 175px, reduced at 400px immediately' },
  },
  {
    id: 'motion.gate-at-the-service-not-the-call-site',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'minimalist'],
    platforms: ['desktop', 'mobile'],
    rule: 'Implement a motion preference as a drop-in replacement for the tween service, swapped once per module — not as a condition at each call site.',
    because: 'A rule enforced at N call sites is a rule that will be missed at N+1. Swapping the name converts every existing site and every future one.',
    prevents: '31 tween sites where one new animation silently ignores the accessibility setting.',
    provenance: CC('Theme.luau'),
  },
  {
    id: 'motion.animate-the-child-not-the-container',
    component: 'toast',
    styleFamilies: ['cartoon-simulator', 'tycoon'],
    platforms: ['desktop', 'mobile'],
    rule: 'When measuring or authoring a toast, animate and inspect the inner frame; a persistent outer container that only swaps text has no motion to show.',
    because: 'A reused container is static by construction, so instrumentation pointed at it reports "no animation" for a notification that is animating fine.',
    prevents: 'Concluding that notifications do not animate from 229 frames of a constant container.',
    provenance: { ...CC('Effects.luau'), validated: 'inner frame travels 16.96px, highlight sweeps alpha 0.140' },
  },
  // ---------------------------------------------------------------- colour
  {
    id: 'colour.pull-hud-accents-from-the-world',
    component: 'typography',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'farming', 'pets-collection'],
    platforms: ['desktop', 'mobile'],
    rule: 'Draw HUD accent hues from the world palette the player is standing in — ideally the colour of the thing they are collecting.',
    because: 'It ties the interface to the game rather than to a generic template, and it is free: the palette already exists.',
    prevents: 'A HUD that would look identical dropped into any other game.',
    provenance: CC('Hud.luau'),
  },
  {
    id: 'colour.measure-guide-contrast-against-its-own-ground',
    component: 'layout',
    styleFamilies: ['cartoon-simulator', 'obby', 'driving'],
    platforms: ['desktop'],
    rule: 'Measure a wayfinding colour against the SURFACE IT IS PAINTED ON, not against the biome palette generally, and keep a numeric benchmark.',
    because: 'A route disappearing into its own ground is invisible however well the hue reads elsewhere.',
    prevents: 'A frost accent scoring 136 on the ice road it was painted on, against a 170 working benchmark.',
    provenance: { kind: 'golem-authored', source: 'apps/benchmark/crystal-canyon/world/Build.luau', validated: 'measured per-surface' },
    tokens: { contrastBenchmark: 170, metric: 'sum of absolute RGB channel deltas' },
  },
  // ---------------------------------------------------------------- icons
  {
    id: 'icon.one-set-drawn-on-one-grid',
    component: 'icon',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'rpg', 'inventory-heavy'],
    platforms: ['desktop', 'mobile'],
    rule: 'Draw every pictogram in one shared module on a single design grid in scale units, and require both the HUD and the panels to use it.',
    because: 'Two icon sets in one game can only drift apart, and scale-unit geometry survives any container size.',
    prevents: 'A HUD glyph family and a panel glyph family that diverge.',
    provenance: CC('Icons.luau'),
    tokens: { designGrid: 32 },
  },
  {
    id: 'icon.a-module-not-installed-is-a-module-absent',
    component: 'icon',
    styleFamilies: ['cartoon-simulator'],
    platforms: ['desktop', 'mobile'],
    rule: 'Wait for a shared dependency with a BOUNDED timeout and degrade visibly; never wait unbounded.',
    because: 'An unbounded wait turns a missing module into a silent hang, and the surrounding UI keeps drawing so screenshots still look correct.',
    prevents: 'Every panel in a game being unreachable in every playtest, announced only by an "Infinite yield possible" warning.',
    provenance: { ...CC('Panels.luau'), validated: 'the failure this describes shipped; now asserted by install-manifest.test.mjs' },
    tokens: { boundedWaitSeconds: 5 },
  },
  // ---------------------------------------------------------------- modal
  {
    id: 'modal.header-carries-identity-and-exit',
    component: 'modal',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'pets-collection'],
    platforms: ['desktop', 'mobile'],
    rule: 'A modal header holds an identity glyph, the title, and a single high-contrast close affordance in the opposite corner.',
    because: 'The close control must be findable without reading, and putting it opposite the glyph makes the header scan in one direction.',
    prevents: 'Modals a player cannot leave without guessing.',
    provenance: CC('Panels.luau'),
  },
  {
    id: 'modal.one-at-a-time',
    component: 'modal',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental'],
    platforms: ['desktop', 'mobile'],
    rule: 'Opening a panel closes the outgoing one and takes its backdrop with it. Re-pressing the open panel\'s own button is a no-op, not a reopen.',
    because: 'Two backdrops stack into a double-dimmed screen, and a reopen mid-close animation reads as a dead button.',
    prevents: 'Stacked modals and a button that appears not to respond during a ~140ms close.',
    provenance: CC('Panels.luau'),
  },
  {
    id: 'modal.state-comes-from-the-server-snapshot',
    component: 'modal',
    styleFamilies: ['tycoon', 'incremental', 'cartoon-simulator', 'progression'],
    platforms: ['desktop', 'mobile'],
    rule: 'Refresh EVERY panel from the authoritative snapshot, not just the visible one, and flash a card because the server changed a fact — never because a click was sent.',
    because: 'Opening a panel must show current numbers rather than the numbers from when it was last on screen, and optimistic flashes lie when the server refuses.',
    prevents: 'A shop that shows a stale balance, and a purchase that celebrates before it is granted.',
    provenance: CC('Panels.luau'),
  },
  // ---------------------------------------------------------------- nav
  {
    id: 'nav.tall-rail-states-its-own-radius',
    component: 'nav',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'mobile-first'],
    platforms: ['desktop', 'mobile'],
    rule: 'A tall navigation channel must state its corner radius explicitly instead of inheriting the pill default that short readouts use.',
    because: 'A pill radius is half the SHORT axis, so one primitive rounds a wide readout correctly and turns a tall channel into a stadium. The value did not change; the aspect ratio did, and that is enough to change what the shape means.',
    prevents: 'An 84x380 nav well rendering as a lozenge instead of as a rail.',
    provenance: CC('Theme.luau'),
    tokens: { railWellWidthPx: 84, railWellHeightPx: 380 },
  },
  {
    id: 'nav.every-destination-reachable-by-direction-alone',
    component: 'nav',
    styleFamilies: ['controller-first'],
    platforms: ['desktop', 'gamepad'],
    rule: 'Wire the NextSelection links along a nav rail and mark each item Selectable; use SelectionOrder to choose the entry point only, and never to carry the player past it.',
    because: 'SelectionOrder decides where gamepad selection STARTS and is documented not to affect directional navigation at all, so an ordered rail with no links is a menu a controller can enter and then cannot move through. A link may also point at an element that is not Selectable, which the engine will accept and the player will experience as a dead direction.',
    prevents: 'A console player who can highlight the first nav button and reach no other destination in the game.',
    provenance: DOCS('classes/GuiObject.yaml (NextSelection*, Selectable, SelectionOrder) + classes/GuiService.yaml (SelectedObject)'),
  },
  // ---------------------------------------------------------------- card
  {
    id: 'card.fixed-cells-are-what-make-a-grid-wrap',
    component: 'card',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'inventory-heavy', 'mobile-first'],
    platforms: ['desktop', 'mobile'],
    rule: 'Give a card grid a FIXED cell size and let it wrap. Never size cells as a 1/count share of the container.',
    because: 'Wrapping is a property of a fixed cell. A scale cell divides the available width by the number of cards, so adding a card makes every existing card smaller instead of adding a row — the grid is pinned to one row for as long as the catalogue lives.',
    prevents: 'Shop cards collapsing to 58px wide on a phone as the catalogue grows.',
    provenance: CC('Panels.luau'),
    tokens: { observedCollapsePx: 58 },
  },
  {
    id: 'card.children-take-a-clamped-share-not-a-fixed-width',
    component: 'card',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'inventory-heavy'],
    platforms: ['desktop', 'mobile'],
    rule: 'Size a card\'s action button as a share of the card clamped at BOTH ends, never as a fixed pixel width.',
    because: 'A fixed control is correct at exactly one card width: narrower and it spills out of its own card, wider and it stops being the proportion the layout was designed around. The lower clamp is the half people forget, and it is what stops the button squeezing the text column to nothing.',
    prevents: 'A 196px action button spilling past the left edge of a 184px card.',
    provenance: CC('Panels.luau'),
    tokens: { fixedButtonPx: 196, cardWidthPx: 184 },
  },
  {
    id: 'card.edge-shade-scales-with-surface-lightness',
    component: 'card',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental'],
    platforms: ['desktop', 'mobile'],
    rule: 'Derive a card\'s bottom edge by darkening its own fill, and use a GENTLER ratio on light surfaces than on saturated ones.',
    because: 'A third off a saturated fill lands on the same hue two shades down, which reads as the card\'s own thickness. The same third off white or sand produces a mid-grey band that reads as a shadow lying on the card, or as dirt on it — the ratio is not a constant, it is a function of where the fill already sits.',
    prevents: 'Light cards that look smudged sitting beside saturated cards that look correctly extruded.',
    provenance: CC('Theme.luau'),
    tokens: { saturatedShade: 0.34 },
  },
  {
    id: 'card.height-is-a-pure-function-of-measured-width',
    component: 'card',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'inventory-heavy'],
    platforms: ['desktop', 'mobile'],
    rule: 'When a card\'s height depends on wrapped text, write the height as a pure function of the MEASURED width, and never let the resulting height feed back into the width.',
    because: 'Width changes arrive from the card and height changes arrive from the text wrapping to a different number of lines. Both must re-run the layout, so if each is allowed to drive the other the pass oscillates instead of settling.',
    prevents: 'A card that flips between two heights on every reflow, because the height it produced changed the width that produced it.',
    provenance: CC('Panels.luau'),
  },
  // ---------------------------------------------------------------- counter
  {
    id: 'counter.one-primitive-everywhere-a-balance-appears',
    component: 'counter',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'pets-collection'],
    platforms: ['desktop', 'mobile'],
    rule: 'Draw a balance with the SAME counter primitive everywhere it appears — screen corner, shop header, purchase confirmation — so it is literally the same object rather than a matching one.',
    because: 'A number the player is about to spend has to be recognisable as the number they have been watching accumulate. Two similar pills maintained in two places drift apart on the first change to either, and one balance becomes two facts.',
    prevents: 'A shop balance that looks subtly unlike the HUD balance and reads as a second currency.',
    provenance: CC('Panels.luau'),
  },
  {
    id: 'counter.a-readout-is-quieter-than-a-control',
    component: 'counter',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'inventory-heavy'],
    platforms: ['desktop', 'mobile'],
    rule: 'Give a readout a subtler rim and highlight than a button built from the same primitives. Shared surface language must not make a number look pressable.',
    because: 'A counter and a button can share every layer and still need different emphasis: a bright rim on a readout competes for attention with the number it exists to display, and it invites a press that does nothing, which teaches the player that presses do nothing.',
    prevents: 'A currency pill players keep clicking, and a value that loses the contrast fight with its own frame.',
    provenance: CC('Theme.luau'),
    tokens: { readoutHighlightTransparency: 0.66, controlHighlightTransparency: 0 },
  },
  {
    id: 'counter.invert-the-medallion-when-the-ground-changes',
    component: 'counter',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'pets-collection'],
    platforms: ['desktop', 'mobile'],
    rule: 'When a readout\'s ground changes lightness, reverse the contrast INSIDE its icon — same parts, same geometry, dark and bright swapped — rather than substituting a different icon.',
    because: 'A bright disc that reads on a dark pill disappears on a gold one. Reversing contrast keeps one object recognisable across every ground it will ever sit on, whereas swapping the artwork quietly creates a second icon that now has to be maintained in step with the first.',
    prevents: 'A coin medallion vanishing into the gold currency pill it sits on.',
    provenance: CC('Theme.luau'),
  },
  // ---------------------------------------------------------------- tab
  {
    id: 'tab.a-page-layout-claims-one-directional-axis',
    component: 'tab',
    styleFamilies: ['controller-first', 'inventory-heavy', 'rpg'],
    platforms: ['desktop', 'gamepad'],
    rule: 'A paged tab strip owns one directional axis. Build the tab CONTENT\'s selection on the other axis, or turn the layout\'s gamepad override off deliberately.',
    because: 'A page layout overrides its siblings\' NextSelection links on its own fill axis and binds the shoulder buttons to page changes, and that override is ON BY DEFAULT — so the axis is taken silently, and nothing in the code that loses it records that it was lost.',
    prevents: 'A controller player who cannot move sideways between inventory cards because every left press changes tab instead.',
    provenance: DOCS('classes/UIPageLayout.yaml (GamepadInputEnabled)'),
  },
  {
    id: 'tab.wrapping-animates-the-short-way-round',
    component: 'tab',
    styleFamilies: ['inventory-heavy', 'rpg'],
    platforms: ['desktop', 'mobile'],
    rule: 'Leave a tab strip\'s wrap-around off unless its tabs are only ever stepped through one at a time. A strip that also lets a player jump straight to a tab should not wrap.',
    because: 'A circular page layout animates the shortest rotational path around the wrap boundary rather than the path the input implied, so a direct jump to a distant tab travels backwards while the selection moves forwards.',
    prevents: 'A player clicking the last tab of a six-tab strip and watching the content slide backwards, contradicting the direction they just moved.',
    provenance: DOCS('classes/UIPageLayout.yaml (Circular)'),
  },
  // ---------------------------------------------------------------- gauge
  {
    id: 'gauge.show-the-ceiling-with-the-value',
    component: 'gauge',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'inventory-heavy'],
    platforms: ['desktop', 'mobile'],
    rule: 'A capacity gauge shows current AND maximum as text on the track, plus a lock affordance when the ceiling is what is blocking progress.',
    because: '"8" means nothing without "/ 25", and a full bar with no explanation reads as a broken bar.',
    prevents: 'A player who cannot tell why collecting stopped paying.',
    provenance: CC('Hud.luau'),
  },
  // ---------------------------------------------------------------- studs
  //
  // §M: "STUDS / CLASSIC ROBLOX must become a first-class art language — not a
  // texture checkbox." The rules below are what that sentence costs. Almost none
  // of the classic look is a style choice a builder gets to make freely: it is a
  // set of engine behaviours, several of them deprecated or inert, and a generator
  // that does not know which is which produces a build that is wrong in ways a
  // screenshot cannot show — surfaces that join nothing, flags that do nothing,
  // palettes that quietly become other palettes.
  {
    id: 'studs.surface-language-is-geometry-not-a-texture-flag',
    component: 'panel',
    styleFamilies: ['studs-classic', 'retro-roblox'],
    platforms: ['desktop'],
    rule: 'Classic/studs styling is a surface and proportion language — SurfaceType per face, chunky proportions, flat unlit colour — not a texture toggled on modern geometry.',
    because: 'Studs applied to contemporary rounded shapes reads as a filter; the era is carried by the silhouette and the face treatment.',
    prevents: 'A "classic" world that looks like a modern one wearing a texture.',
    provenance: { kind: 'reference-only', source: 'Roblox/creator-docs SurfaceType.yaml (CC-BY-4.0) + DevForum Studs Building Pack thread (unlicensed, REFERENCE_ONLY)', validated: 'not yet built' },
  },
  {
    id: 'studs.surface-type-is-decoration-now-not-structure',
    component: 'layout',
    styleFamilies: ['studs-classic', 'retro-roblox'],
    platforms: ['desktop'],
    rule: 'Set SurfaceType for the look, and hold the build together with explicit welds and anchoring. Never let a stud face be the thing that joins two parts.',
    because: 'Surface JOINING is deprecated and leaves only the visual change on the part, so a build that reads as classic is structurally a modern build wearing a classic surface. The era look no longer implies the era physics, and nothing warns you which half you got.',
    prevents: 'A studded classic build that renders correctly in Studio and comes apart the moment physics runs, because the stud faces were expected to weld it.',
    provenance: DOCS('enums/SurfaceType.yaml (deprecation_message)'),
  },
  {
    id: 'studs.inlet-is-the-counterpart-to-studs-not-a-second-texture',
    component: 'panel',
    styleFamilies: ['studs-classic', 'retro-roblox'],
    platforms: ['desktop'],
    rule: 'Put Studs on faces that present and Inlet on faces that receive, and reach for Universal only where the checker of both is genuinely wanted.',
    because: 'Inlet is documented as square holes WHERE STUDS WOULD BE, so the two are a mating pair rather than two interchangeable finishes, and it is that implied assembly which makes a surface read as construction instead of as pattern.',
    prevents: 'A "classic" wall carrying Studs on every face, so nothing looks like it fits anything and the surface degrades into wallpaper.',
    provenance: DOCS('enums/SurfaceType.yaml (Studs, Inlet, Universal)'),
  },
  {
    id: 'studs.outlines-are-gone-and-no-surface-flag-brings-them-back',
    component: 'panel',
    styleFamilies: ['studs-classic', 'retro-roblox'],
    platforms: ['desktop'],
    rule: 'Do not try to restore the classic per-part outline with a surface flag. If the era silhouette is wanted, earn it from proportion, palette and stud density, or build a deliberate outline system of your own.',
    because: 'SmoothNoOutlines is documented as no longer relevant BECAUSE outlines were removed from the engine, so the one property whose name promises the era cue does nothing whatsoever — and it fails silently, which is worse than failing.',
    prevents: 'A retro build that sets SmoothNoOutlines across a thousand parts and renders pixel-identical to plain Smooth.',
    provenance: DOCS('enums/SurfaceType.yaml (SmoothNoOutlines)'),
  },
  {
    id: 'studs.classic-palette-is-a-named-set-not-a-ramp',
    component: 'panel',
    styleFamilies: ['studs-classic', 'retro-roblox'],
    platforms: ['desktop'],
    rule: 'Choose a classic palette from the named brick colours and keep the count small, rather than authoring a Color3 ramp and converting it afterwards.',
    because: 'Converting a colour to a brick colour returns the CLOSEST entry by smallest total absolute per-channel distance, so a hand-tuned ramp collapses onto whichever named bricks happen to sit nearest it. The palette that renders is not the palette that was designed, and nothing reports the substitution.',
    prevents: 'A six-step gradient authored in Color3 quantising down to three repeated bricks, flattening the depth it existed to create.',
    provenance: DOCS('datatypes/BrickColor.yaml (BrickColor.new from RGB components)'),
    // The same metric the world-contrast rule already uses. That is not a
    // coincidence worth hiding: per-channel absolute distance is how this engine
    // compares colours, so it is the honest unit for reasoning about them.
    tokens: { matchMetric: 'smallest total absolute per-channel distance', unmatchedFallback: 'Medium stone grey' },
  },
  {
    id: 'studs.restore-the-surface-with-a-material-variant-not-a-decal',
    component: 'panel',
    styleFamilies: ['studs-classic', 'retro-roblox'],
    platforms: ['desktop'],
    rule: 'When the classic surface has to survive on modern geometry, express it once as a MaterialVariant tuned by Studs Per Tile — never as per-face decals or textures.',
    because: 'A MaterialVariant is a reusable TILEABLE material carrying its own physical properties, so the stud pitch stays keyed to world units as parts resize; a decal is pinned to one face of one part and drifts the moment that part changes size.',
    prevents: 'A studded wall whose studs change size with every resize, so no two walls in the build agree on how big a stud is.',
    provenance: GUIDE('parts/materials.md (custom materials, Studs Per Tile)'),
  },
  {
    id: 'studs.name-a-material-variant-before-applying-it',
    component: 'panel',
    styleFamilies: ['studs-classic', 'retro-roblox'],
    platforms: ['desktop'],
    rule: 'Give a custom material its final name BEFORE painting anything with it; renaming afterwards requires re-applying it to every part already using it.',
    because: 'Parts resolve the variant by name, so a rename is not a label change — it is a broken reference on everything already painted. The parts do not report it; they just quietly stop looking custom.',
    prevents: 'A finished classic build reverting to plain Plastic because the variant was renamed for tidiness at the end of the pass.',
    provenance: GUIDE('parts/materials.md (renaming after applying requires re-application)'),
  },
  {
    id: 'studs.one-coarse-module-shared-by-geometry-and-surface',
    component: 'layout',
    styleFamilies: ['studs-classic', 'retro-roblox'],
    platforms: ['desktop'],
    rule: 'Build classic geometry in whole studs on ONE coarse module, and make the surface stud pitch agree with that module.',
    because: 'The era reads as construction because a visible unit repeats. A modular kit only snaps together when its pieces share a module, and when the surface grid and the build grid disagree the eye stops reading assembly and starts reading printed pattern.',
    prevents: 'Walls built on a four-stud module wearing a stud pattern tiled at one and a half studs, which reads as wallpaper rather than as brick.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Roblox/creator-docs content/en-us/tutorials/use-case-tutorials/modeling/assemble-modular-environments.md + content/en-us/parts/materials.md (CC-BY-4.0)',
      validated: 'documented grammar; not yet built in a Golem fixture',
    },
  },
  {
    id: 'retro.quote-the-era-look-not-the-era-ergonomics',
    component: 'layout',
    styleFamilies: ['studs-classic', 'retro-roblox'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Keep the classic surface, the flat unlit colour and the coarse module. Keep modern touch targets, gamepad focus, reduced-motion handling and safe-area insets. Quote the era for its look and never for its ergonomics.',
    because: 'The period\'s tiny targets, absent focus states and missing accessibility affordances were platform limitations of their moment, not stylistic decisions — so reproducing them makes a game unplayable rather than nostalgic, and no player reads them as a reference to anything.',
    prevents: 'A "retro" HUD with 24px buttons and no gamepad focus: correct in a screenshot, unusable on a phone or a console.',
    provenance: {
      kind: 'golem-authored',
      source: 'packages/design (synthesis of layout.touch-floor-from-smallest-target, motion.reduced-motion-removes-travel-not-outcome and layout.safe-area-is-opt-out-for-decoration-only)',
      validated: 'not yet built',
    },
  },
  // ---------------------------------------------------------------- material
  {
    id: 'material.commit-to-one-material',
    component: 'panel',
    styleFamilies: ['cartoon-simulator', 'minimalist'],
    platforms: ['desktop'],
    rule: 'Pick one material for the whole build and do not make exceptions for "special" objects.',
    because: 'A single emissive object in a flat-shaded world is not a highlight, it is the only thing that looks wrong.',
    prevents: 'Reaching for Neon on one prop in a world of 1562 SmoothPlastic parts.',
    provenance: { kind: 'golem-authored', source: 'apps/benchmark/crystal-canyon/world/Build.luau', validated: 'a Neon mote was proposed and refused on this rule' },
  },
  {
    id: 'geometry.a-yaw-is-not-a-rotation',
    component: 'layout',
    styleFamilies: ['cartoon-simulator', 'studs-classic'],
    platforms: ['desktop'],
    rule: 'To present a corner rather than a face, rotate on all three axes. A Y-only yaw leaves the top and bottom faces horizontal.',
    because: 'A cube yawed 45 degrees still shows a flat square lid to any camera near its own height, so it reads as a box, not a gem.',
    prevents: 'Six gold boxes floating in the sky in the hero shot.',
    provenance: { kind: 'golem-authored', source: 'apps/benchmark/crystal-canyon/world/Build.luau', validated: 'rendered before and after' },
  },
  //[[ THREE FAMILIES THAT HAD NO RULE, CLOSED FROM THE ONE LICENCE-CLEAR SOURCE.
  //
  //   `library.test.mjs` pins the uncovered list precisely so it cannot be closed the way §L
  //   warns about — by adding a family to a rule that was never written for it. These three are
  //   closed the other way: each is an ENGINE FACT from `Roblox/creator-docs` (CC-BY-4.0) that
  //   constrains what a design for that family can even do.
  //
  //   `fantasy`, `sci-fi` and `modern` stay open. They are matters of taste, and creator-docs
  //   cannot teach taste — it documents behaviour. Inventing three plausible aesthetic rules to
  //   empty the list is exactly what §AK forbids and what the pinned test exists to prevent. ]]
  {
    id: 'social.system-chat-owns-its-corner',
    component: 'layout',
    styleFamilies: ['social'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Treat the default chat window\'s screen region as occupied by the system, or disable it deliberately with ChatWindowConfiguration.Enabled = false and replace it.',
    because: 'The window ships Enabled, and the player can summon it at any moment even if it is not on screen when you take your screenshot. A panel drawn in that region is not competing with your own UI, it is competing with a surface you do not control and cannot restyle beyond the handful of documented properties.',
    prevents: 'A social hub whose friends list is legible in every screenshot the builder takes and is covered by chat the first time a real player types.',
    provenance: GUIDE('chat/chat-window.md'),
  },
  {
    id: 'fps.locked-cursor-disables-pointer-ui',
    component: 'modal',
    styleFamilies: ['battleground-fps'],
    platforms: ['desktop'],
    rule: 'Any UI shown while UserInputService.MouseBehavior is LockCenter must either release the lock first or be fully navigable without a pointer.',
    because: 'LockCenter pins the cursor to the middle of the screen; the pointer no longer travels, so every hover, click target and drag in a conventional GUI becomes unreachable. The lock is a mode, and UI drawn during it belongs to a different input model.',
    prevents: 'A loadout menu that opens over a locked-cursor firefight and cannot be clicked, which reads to the player as the game having frozen.',
    provenance: GUIDE('input/mouse-and-keyboard.md'),
  },
  {
    id: 'dialogue.prompt-visibility-is-the-cameras-not-the-players',
    component: 'panel',
    styleFamilies: ['dialogue-story'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'A ProximityPrompt driving dialogue must not be the only way to reach it, because RequiresLineOfSight is measured from the CAMERA and defaults to true.',
    because: 'The player standing in front of an NPC is not the condition being tested. A pillar between the CAMERA and the prompt hides it, and so does any scripted or shoulder camera that swings the view — so the prompt vanishes at exactly the moments a story scene is most likely to move the camera.',
    prevents: 'A conversation that becomes unreachable when the player stands close enough for the camera to clip behind geometry, with no feedback distinguishing it from an NPC that has nothing to say.',
    provenance: GUIDE('ui/proximity-prompts.md'),
  },
  {
    id: 'currency.one-value-one-motion-policy',
    component: 'counter',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'progression'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Every surface showing the same currency must agree on whether that number animates. Either all of them count to the new value or none of them do.',
    because: 'Two surfaces showing one number are read as one fact. When they disagree about motion the player sees the same value arrive twice, at two different times, and the slower one looks like it is lagging behind the truth rather than easing toward it.',
    prevents: 'A shop footer pill rolling 380 down to 250 while the HUD wallet beside it snaps, both showing "coins", in the same frame of the same screenshot.',
    provenance: CC('Hud.luau'),
  },
]);

/**
 * The licence boundary, executable.
 *
 * §K: extract the pattern, write an original component — do not paste the kit. A
 * rule sourced from something we may only READ may state the grammar and may not
 * carry reproducible values.
 */
export function assertLicenceSafety(rules = RULES) {
  const violations = [];
  for (const r of rules) {
    if (r.provenance?.kind === 'reference-only' && r.tokens) {
      violations.push(
        `${r.id}: provenance is reference-only but it carries concrete tokens ` +
          `(${Object.keys(r.tokens).join(', ')}). That is copying values out of a source we may only read.`,
      );
    }
  }
  return violations;
}
