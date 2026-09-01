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

/** Stronger than CC: the behaviour was sampled on RenderStepped and the frames are recorded in
 *  `docs/evidence/2026-09-01-ui-motion-frames.md`. A motion rule that was only LOOKED at is a
 *  taste claim; one with a frame table behind it can be argued with. */
const MEASURED = (file) => ({
  kind: 'golem-authored',
  source: `apps/benchmark/crystal-canyon/src/client/${file}`,
  validated: 'sampled frame by frame in Studio, 2026-09-01 — see docs/evidence/2026-09-01-ui-motion-frames.md',
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
  //[[ MOTION RULES FROM MEASUREMENT, NOT FROM TASTE.
  //
  //   §AN asks for motion intelligence built on TESTED patterns. Each of these three came out
  //   of a frame-by-frame sample of this game, and each states a property the frames show —
  //   not a duration to copy. Durations do not transfer between games; the properties do. ]]
  {
    id: 'motion.a-reversible-transition-must-land-exactly-on-rest',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'minimalist', 'mobile-first'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'A transition that can be entered and left repeatedly — hover, focus, selection — must return to its resting values EXACTLY, not approximately.',
    because: 'These states are entered hundreds of times in a session. A transition that lands near its rest value accumulates: the element drifts brighter or larger with every pass, and the drift is invisible in the single interaction anyone tests.',
    prevents: 'A nav tile whose fill creeps away from the palette over a play session because leaving the hover state tweens toward a captured "current" value instead of the authored one.',
    provenance: MEASURED('Theme.luau'),
    tokens: { hoverSettleMs: 66 },
  },
  {
    id: 'motion.progress-must-not-overshoot',
    component: 'gauge',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'progression'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'A bar representing a quantity must ease with a decelerating curve and never overshoot its target, even where a panel or a button would.',
    because: 'Overshoot on a gauge is a claim about the underlying number. A pack bar that springs past its value shows, for two frames, a capacity the player does not have — and unlike a panel, the bar IS the number rather than a container for it.',
    prevents: 'A back-eased fill that reads as the player having briefly held more than the cap, on the one surface whose whole job is to say how full they are.',
    provenance: MEASURED('Hud.luau'),
  },
  {
    id: 'motion.a-celebration-is-one-gesture-not-several',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'progression', 'pets-collection'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'When a moment is announced on several channels at once — a wash, a ring, a banner, particles — they must share one start and one timing envelope.',
    because: 'Channels that merely overlap read as several animations that happened to fire together, which is what a bug looks like. Channels that share an envelope read as one event with several parts, and the player attributes all of them to the thing they just did.',
    prevents: 'An unlock where the screen flash, the shockwave and the banner each run their own duration, so the moment has three endings and none of them is the one the player remembers.',
    provenance: MEASURED('Effects.luau'),
  },

  // ==========================================================================
  // SECOND CORPUS — grammar extracted from eleven licence-clear libraries.
  //
  // §L named the concentration risk: the first pass drew 25 of 26 rules from one
  // game, and a library that only knows one simulator makes every genre look like
  // that simulator. creator-docs answered part of it with ENGINE FACTS. It cannot
  // answer the rest, because it documents behaviour and not craft.
  //
  // These 48 rules come from source that can prove a licence about itself and that
  // was written by people solving the same problems: four motion libraries
  // (Flipper, otter, roact-spring, RbxCameraShaker), an icon pipeline
  // (lucide-roblox), four component kits (synthetic, onyx-ui, Iris, cyan-ui), and
  // two UX systems (SimpleDialogue, NotificationSystem). MIT, Apache-2.0 and ISC —
  // which is why these may carry `tokens` where a DevForum thread's could not.
  //
  // WHAT WAS TAKEN, AND WHAT WAS NOT. No code was copied and no asset was ingested.
  // What is recorded here is the AGREEMENT and the DISAGREEMENT between independent
  // implementations — three motion libraries all inheriting velocity on a retarget
  // is grammar; two kits differing on whether gamepad focus outranks hover is a
  // tuning question, and is recorded as one. Two of the sources taught most by
  // being WRONG: `toast.a-layout-object-and-a-position-tween-cannot-both-own-position`
  // and `dialogue.a-text-reveal-must-not-gate-the-choices` are counter-examples,
  // and are labelled as such in their provenance rather than dressed up as
  // endorsements.
  //
  // ON THE GENRE GAP. This merge arrived claiming `modern` on 25 rules and
  // `fantasy` on 3. The pinned coverage test exists precisely to catch that, and
  // it did. `modern` is kept on the six rules whose content would be DIFFERENT in a
  // cartoon-simulator — modular scale, surface/on-surface pairing, tone-step
  // elevation, type bundles, total state maps, press-inverts-hover — and stripped
  // from the 19 genre-neutral mechanics that had claimed it. `fantasy` was
  // stripped from all three asset-sourcing rules and REMAINS UNCOVERED: nothing in
  // them says what fantasy looks like, and a family closed by a rule that does not
  // teach it is worse than an absence (§AK).
  // ==========================================================================

  {
    id: 'motion.retarget-inherits-position-and-velocity',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'inventory-heavy', 'mobile-first', 'controller-first'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'When a value\'s target changes while it is still moving, start the new motion from the CURRENT position AND the current velocity. Decide separately, and explicitly, what each OTHER kind of interruption does with velocity: a retarget preserves it, a cancel discards it, a pause freezes it.',
    because: 'The player\'s input did not stop the object; it changed where the object was going. Zeroing velocity on a new goal makes the element halt and re-accelerate, which reads as the interface losing track of the gesture rather than following it. Three independent libraries agree on the retarget case, which is what makes it grammar — and they DISAGREE on stop, one freezing velocity in place and another clearing it. The disagreement is the more useful half: it is the evidence that velocity policy is a decision to be made per interruption kind, not a default to be inherited from whichever motion library happened to be installed.',
    prevents: 'A nav highlight or a drag that visibly stops dead and restarts every time the player changes their mind mid-flight, so a fast sequence of hovers reads as a stutter instead of as one continuous chase.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Reselim/Flipper (MIT) src/SingleMotor.lua + src/Spring.lua; Roblox/otter (MIT) modules/otter/src/createSingleMotor.lua + docs/usage/motors.md; chriscerie/roact-spring (MIT) src/SpringValue.lua + src/Animation.lua',
      validated: 'read the code: setGoal in Flipper and otter mutates only `complete` and the goal, leaving state.velocity intact, and roact-spring re-bases fromValues onto lastPosition without clearing lastVelocity (only the `reset` path clears v0/lastVelocity). Pinned upstream by Flipper\'s own test src/Spring.spec.lua \'should inherit velocity\'. Not run in Studio.',
    },
  },
  {
    id: 'motion.the-target-decides-whether-it-is-a-spring-or-a-duration',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'inventory-heavy', 'mobile-first', 'controller-first'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Drive a value with a spring when its target can move mid-flight OR when its travel distance is decided at runtime. Reserve a fixed-duration curve for motions whose target is fixed and whose distance is fixed by the layout.',
    because: 'Two independent properties of the target push the same way, and both are properties of the value rather than matters of taste. A duration curve has no velocity term to carry over, so retargeting one can only re-base its origin and restart its clock, which snaps the speed back to the curve\'s slope at t=0 — near zero for every ease-in and ease-in-out; that discontinuity is not an implementation weakness better code removes, it is what a curve parameterised by time instead of by state can express. And a spring\'s speed is proportional to how far it has to go, so one configuration covers a four-pixel nudge and a nine-hundred-pixel slide at velocities that both look right, whereas a fixed duration holds constant the one quantity that should have changed.',
    prevents: 'A panel that decelerates to a crawl and re-accelerates from nothing every time the goal moves, so a player dragging a slider feels the control repeatedly let go of their finger — and a selection cursor that takes the same 0.3s to step to the neighbouring card as it does to jump to the far end of the grid, so the short hop feels sluggish and the long one feels like a cut.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Roblox/otter (MIT) modules/otter/src/ease.lua (retarget branch), modules/otter/src/spring.lua and docs/usage/goals.md; Reselim/Flipper (MIT) src/Linear.lua',
      validated: 'read the code: otter\'s ease step detects `goalPosition ~= state.goal` and responds with `p0 = state.value; elapsed = 0`, and its EaseState carries no velocity field at all; Flipper\'s Linear:step comments \'Linear motion ignores the state\'s velocity\' and overwrites it with the configured constant; otter\'s documented claim that spring goals animate faster for larger values is confirmed in the solver, where every position and velocity term is scaled by `offset = p0 - g`. Merged from two candidate rules that stated the same imperative from two different mechanisms. Not run in Studio.',
    },
  },
  {
    id: 'motion.settled-is-a-conjunction-of-position-and-velocity',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'minimalist', 'mobile-first'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Test for rest as a CONJUNCTION — near the target AND moving slowly — never as either condition alone.',
    because: 'Proximity alone is satisfied by a fast-moving value passing THROUGH its target, which ends the animation mid-flight at whatever the frame happened to catch. Speed alone is satisfied at the top of an overshoot, where the value is momentarily stationary in the wrong place. Only the conjunction describes rest. This library already requires a reversible transition to land exactly on its authored value; three independent spring solvers reached the same conclusion and each writes the goal outright at completion, which corroborates that rule from outside this codebase — and this adds the half it did not have, which is how you know you have arrived.',
    prevents: 'A hover or open animation that reports itself finished a few pixels short and slightly the wrong brightness, because the only test it ran was the one the frame happened to pass.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Reselim/Flipper (MIT) src/Spring.lua; Roblox/otter (MIT) modules/otter/src/spring.lua + docs/api-reference.md; chriscerie/roact-spring (MIT) src/SpringValue.lua',
      validated: 'read all three solvers: each computes `complete` as an AND over |velocity| and |position - goal|, and each then overwrites the computed value with the goal (Flipper `value = complete and g or p1`; otter `p1 = goalPosition; v1 = 0`; roact-spring `position = to`). Flipper\'s src/Spring.spec.lua asserts exact equality with the goal after settling. Scoped to the conjunction so it does not restate the existing golem-authored motion.a-reversible-transition-must-land-exactly-on-rest, which it corroborates. The three libraries pick DIFFERENT thresholds, which is why the next rule exists. Not run in Studio.',
    },
    tokens: {"flipperVelocityLimit":0.001,"flipperPositionLimit":0.001,"otterVelocityLimit":0.001,"otterPositionLimit":0.01},
  },
  {
    id: 'motion.rest-threshold-is-a-fraction-of-the-travel-not-a-constant',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'minimalist', 'mobile-first'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Derive the rest threshold from the distance the value is actually travelling — roughly a thousandth of it, with a ceiling and a floor — and derive the velocity threshold from that, rather than using one absolute constant for every animated property.',
    because: 'The same build animates transparency across a range of 1 and position across a range of 900. A constant tuned for the pixel case is larger than the entire alpha animation, so the fade never starts moving before it is declared finished; a constant tuned for the alpha case is a fraction of a pixel, so the slide keeps simulating long after it has visibly arrived. The threshold is a statement about PERCEPTIBLE ERROR, and perceptible error is relative to the span being crossed — which is why it cannot be a number in a config file.',
    prevents: 'Both documented tuning failures in one build: a fade that visibly teleports to its end value because completion fired early, and a slide that sits motionless a hair from its target while the code waiting on completion has not yet been released.',
    provenance: {
      kind: 'learned-pattern',
      source: 'chriscerie/roact-spring (MIT) src/SpringValue.lua (precision/restVelocity derivation); Roblox/otter (MIT) docs/api-reference.md (documented failure modes of mis-tuned resting limits)',
      validated: 'read the derivation in SpringValue:advance — `precision = config.precision or (from == to and 0.005 or math.min(1, math.abs(to - from) * 0.001))`, clamped up to 0.0001, with `restVelocity = config.restVelocity or precision / 10` — and read otter\'s documentation naming both the too-early and too-late symptoms. Not run in Studio.',
    },
    tokens: {"positionThresholdFractionOfTravel":0.001,"positionThresholdCeiling":1,"positionThresholdFloor":0.0001,"equalEndpointsFallback":0.005,"velocityThresholdFractionOfPositionThreshold":0.1},
  },
  {
    id: 'motion.damping-ratio-chooses-the-regime-stiffness-chooses-the-speed',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'minimalist', 'pets-collection'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Pick the damping ratio for the CHARACTER of the motion — below 1 bounces, exactly 1 arrives without overshoot, above 1 is sluggish — and change stiffness or frequency for speed. To make a motion feel heavy and slow, RAISE the damping; never weaken the spring.',
    because: 'The two parameters are not interchangeable dials. A low-stiffness spring is not slow, it is loose: it drifts toward the goal with no conviction, and at zero stiffness it never arrives at all. Weight comes from resisted momentum, which is what an overdamped ratio expresses. The evidence is a preset table a great many projects have adopted by default — its two SLOWEST presets carry the HIGHEST stiffness in the whole set and get their slowness entirely from friction, while its bounciest preset sits mid-range. All three libraries also default to a ratio of exactly 1, so overshoot is opt-in everywhere; that is a design opinion held by every source read here, and it agrees with this library\'s existing refusal to let a gauge overshoot.',
    prevents: 'A \'heavy\' modal authored by weakening the spring, which reads as floaty and indecisive rather than as massive — and a default configuration that overshoots every readout because the ratio was treated as a taste slider rather than as a regime selector.',
    provenance: {
      kind: 'learned-pattern',
      source: 'chriscerie/roact-spring (MIT) src/constants.lua + src/AnimationConfig.lua + src/SpringValue.lua; Reselim/Flipper (MIT) src/Spring.lua; Roblox/otter (MIT) modules/otter/src/spring.lua',
      validated: 'read the preset table and the integrator, and computed the damping ratio of each preset from the library\'s own force terms (zeta = friction / (2*sqrt(mass*tension)), the unit scalars cancelling); confirmed the \'Loose springs never move\' early-out at tension <= 0; confirmed all three libraries default to a damping ratio of exactly 1. Not run in Studio.',
    },
    tokens: {"dampingRatioFromTension":"friction / (2 * sqrt(mass * tension))","libraryDefaultDampingRatio":1,"regimes":{"wobbly":{"tension":180,"friction":12,"dampingRatio":0.45},"gentle":{"tension":120,"friction":14,"dampingRatio":0.64},"stiff":{"tension":210,"friction":20,"dampingRatio":0.69},"default":{"tension":170,"friction":26,"dampingRatio":1},"slow":{"tension":280,"friction":60,"dampingRatio":1.79},"molasses":{"tension":280,"friction":120,"dampingRatio":3.59}}},
  },
  {
    id: 'motion.clamp-a-spring-rather-than-abandoning-it-where-overshoot-lies',
    component: 'gauge',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'progression', 'inventory-heavy'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Where a value must never exceed its target — a capacity bar, a health track, a percentage — keep the spring and clamp it at the goal. Do not swap to a fixed-duration curve just to remove the overshoot.',
    because: 'Clamping and retargeting are independent properties, and dropping to a tween to forbid overshoot silently gives up both velocity inheritance and distance-proportional timing as well. A bar topped up twice in quick succession then stops dead between the two increments. Clamping keeps the spring\'s responsiveness and removes only the part that was making a false claim about the number.',
    prevents: 'A pack gauge rebuilt as a tween to stop it springing past full, which then hitches on every second pickup because each new fill restarts from zero speed.',
    provenance: {
      kind: 'learned-pattern',
      source: 'chriscerie/roact-spring (MIT) src/AnimationConfig.lua (clamp) + src/SpringValue.lua (bounceFactor gate)',
      validated: 'read the option (\'Avoid overshooting by ending abruptly at the goal value\') and its single use site — `bounceFactor = if config.clamp then 0 else config.bounce` — confirming clamp is a separate flag from the spring parameters and from bounce, and does not change the tension/friction that govern the approach. This is the mechanism for the existing measured rule motion.progress-must-not-overshoot, which states the requirement without saying how to meet it without losing the spring. Not run in Studio.',
    },
  },
  {
    id: 'motion.advance-a-spring-on-a-fixed-substep-or-solve-it-exactly',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'mobile-first', 'minimalist'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Never step a numerically integrated spring by the raw frame delta. Either subdivide the frame into fixed short substeps and integrate those, or use the closed-form solution of the damped oscillator, which is exact for any delta.',
    because: 'A spring integrated at the frame rate is a different spring on every machine: the same configuration bounces more on a slow client than a fast one, because the error term of the integration is a function of the step size. A long frame — a loading hitch, a teleport, a window drag — is the same bug at its extreme, where one enormous step launches the value far past its target instead of easing it. Two libraries answer this analytically and one by subdivision; either way the frame rate stops being a parameter of the design, and the analytic route costs no more per frame than the naive one.',
    prevents: 'Motion signed off as tasteful on the reviewer\'s desktop that reads as bouncy and loose on a phone, with no code difference to point at — and a panel thrown off screen by the first frame after a load stall.',
    provenance: {
      kind: 'learned-pattern',
      source: 'chriscerie/roact-spring (MIT) src/SpringValue.lua (fixed substep loop); Reselim/Flipper (MIT) src/Spring.lua and Roblox/otter (MIT) modules/otter/src/spring.lua (analytic solution, both after Fraktality\'s solver)',
      validated: 'read both strategies. roact-spring subdivides with `numSteps = math.ceil(dt * 1000 / 2)` and runs its Euler update per substep; Flipper and otter evaluate the closed-form solution per branch (critically damped, underdamped, overdamped) and both carry series approximations guarding the numerically unstable cases as the damping ratio approaches 1 and as the frequency approaches 0. Not run in Studio.',
    },
    tokens: {"fixedSubstepMs":2,"substepCount":"ceil(deltaSeconds * 1000 / 2)"},
  },
  {
    id: 'motion.completion-lands-well-after-the-eye-does',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'minimalist', 'mobile-first'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Never hang a visible consequence — unlocking input, revealing the next step, playing the sound — on an animation\'s completion signal alone. Trigger the consequence from a progress threshold and keep completion for bookkeeping.',
    because: 'A spring approaches its target asymptotically, so the last visually indistinguishable fraction of the travel can take as long as the whole visible part of it. The gap is invisible when the animation is watched and unmissable when it is used: the element has plainly arrived and the interface is still waiting. Two sources with nothing in common reached this from opposite directions — a spring library recommending against the completion signal it ships, and a dialogue system that builds its choice buttons inside a typewriter\'s completion callback and thereby locks the player out for as long as the writer wrote. This does not weaken the existing reduced-motion rule: completion must STILL always fire, it just must not be the only thing that does.',
    prevents: 'A modal that has finished opening on screen while its buttons stay dead for another beat, which the player reads as the game being slow rather than as the animation being polite.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Reselim/Flipper (MIT) src/BaseMotor.lua (onComplete documentation); Roblox/otter (MIT) docs/api-reference.md; independently corroborated by Crabzzai/SimpleDialogue (MIT) src/System/DialogueSystem.luau as a counter-example',
      validated: 'read Flipper\'s own recommendation against the signal it ships — use onStep and test for a threshold such as 99% instead, \'as it can often take a while to fire\' — and otter\'s matching documented symptom of a late resting limit. Not run in Studio.',
    },
    tokens: {"suggestedProgressThreshold":0.99},
  },
  {
    id: 'motion.a-per-frame-connection-must-have-an-end-condition',
    component: 'motion',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'incremental', 'inventory-heavy', 'dialogue-story', 'mobile-first'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Every per-frame connection must state the condition under which it stops. Bind on receiving a goal and disconnect at rest; where many elements need the same frame, drive them from ONE connection over an instance-keyed registry that prunes dead entries inside the loop and disconnects when it empties.',
    because: 'A HUD holds dozens of animatable values and dozens of world-anchored elements, and almost all of them are idle almost all of the time. A permanent loop, or a connection per element, makes the per-frame cost a function of how many objects the designer placed rather than of what is happening on screen — and it never falls, so the cost is invisible in review and diagnosed late as a rendering problem. Five sources across two unrelated domains converged on the same shape: four motion libraries connect on goal and disconnect inside the branch that observes completion, and one dialogue system implements the shared-registry form TWICE independently in one codebase. This only works because rest is a defined, tested condition, which is why the settle test and the connection lifetime have to be designed together.',
    prevents: 'A HUD whose frame cost grows with each panel added and never returns to zero when the screen is idle, and a scene of forty billboard NPCs running forty independent render-step closures that keep ticking after the objects they were written for were destroyed.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Reselim/Flipper (MIT) src/BaseMotor.lua + src/SingleMotor.lua; Roblox/otter (MIT) modules/otter/src/createSingleMotor.lua + modules/react-otter/src/useMotor.lua; chriscerie/roact-spring (MIT) src/SpringValue.lua; Sleitnick/RbxCameraShaker (MIT) src/CameraShaker/init.lua; Crabzzai/SimpleDialogue (MIT) src/System/DialogueSystem.luau + src/Handlers/ProximityPromptHandler.luau',
      validated: 'read the lifetime in all five. The four motion libraries connect to the render step on receiving a goal and disconnect inside the same branch that observes completion; otter\'s React hook additionally holds the motor in a ref across renders and destroys it on unmount. SimpleDialogue reaches the registry form twice: GlobalUpdateManager keeps three instance-keyed tables on one RenderStepped, nils entries when `part.Parent` is gone and disconnects when all three are empty, and ProximityPromptHandler\'s ensureSharedRenderStepped repeats the prune-and-retire shape over activeHighlights. Merged from two candidates found by two extractors that had prescribed opposite connection topologies for the same problem; stated as engine grammar, naming no reactive-library API. Not executed.',
    },
  },
  {
    id: 'shake.is-noise-sampled-on-a-clock-not-per-frame-randomness',
    component: 'motion',
    styleFamilies: ['battleground-fps', 'driving', 'horror', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Generate a camera or screen shake by sampling a continuous noise function along a clock advanced by deltaTime multiplied by a roughness term — sampling a different slice of the field per axis, and starting each instance at a random offset — then sum concurrent shakes.',
    because: 'Fresh randomness each frame is white noise: its character changes with the frame rate, and amplitude is the only handle it offers, so making a shake faster necessarily makes it bigger. Sampling a continuous field along a time axis separates HOW FAR from HOW FAST into two parameters that can be authored independently, and gives a path that is smooth at any frame rate because neighbouring samples are neighbouring points of one function. The random start offset is the same mechanism used once more: two shakes from the same preset land on different parts of the field, so they neither look identical nor line up into one double-strength jolt.',
    prevents: 'A rumble that is a visibly different effect at 30fps and 144fps, where the only way to make it feel quicker is to make it hit harder — and two explosions in the same second reading as one impossibly large one.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Sleitnick/RbxCameraShaker (MIT) src/CameraShaker/CameraShakeInstance.lua + src/CameraShaker/init.lua',
      validated: 'read the generator: the offset is three decorrelated slices of one 2D noise field (noise(t,0), noise(0,t), noise(t,t)) scaled by 0.5, the clock advances as `tick + dt * Roughness * roughMod`, each instance seeds its clock from a random number in [-100, 100], and CameraShaker:Update sums the offsets of every live instance. Not run in Studio.',
    },
    tokens: {"noiseAmplitudeScale":0.5,"clockAdvance":"tick + deltaSeconds * roughness","randomPhaseRange":[-100,100],"presetMagnitudeRoughness":{"bump":{"magnitude":2.5,"roughness":4},"explosion":{"magnitude":5,"roughness":10},"earthquake":{"magnitude":0.6,"roughness":3.5},"disorientation":{"magnitude":10,"roughness":0.15},"handheldCamera":{"magnitude":1,"roughness":0.25},"vibration":{"magnitude":0.4,"roughness":20},"roughDriving":{"magnitude":1,"roughness":2}}},
  },
  {
    id: 'shake.fades-its-clock-as-well-as-its-amplitude',
    component: 'motion',
    styleFamilies: ['battleground-fps', 'driving', 'horror', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'When a shake fades out, scale its RATE by the same envelope that scales its amplitude, so it slows as it shrinks. While it is sustained, leave the rate at full.',
    because: 'Amplitude alone falling to zero leaves the same fast jitter simply getting smaller, which the eye reads as an effect being switched off rather than as an impact dying away. Energy leaving a physical system takes the frequency down with it, and reproducing that costs one multiplication. The asymmetry matters too: a sustained shake must not slow, because a decelerating rumble that is still going announces itself as broken.',
    prevents: 'An explosion that buzzes at full speed right up to the frame it disappears, so the loudest event in the scene has no ending, only a cut.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Sleitnick/RbxCameraShaker (MIT) src/CameraShaker/CameraShakeInstance.lua (UpdateShake)',
      validated: 'read the branch: while sustained the clock advances by `dt * Roughness * roughMod`, and once sustain ends the same line multiplies in `currentFadeTime` — the identical normalised envelope that already multiplies the returned magnitude. Not run in Studio.',
    },
  },
  {
    id: 'shake.is-a-delta-composed-onto-the-camera-never-a-write-to-it',
    component: 'motion',
    styleFamilies: ['battleground-fps', 'driving', 'horror'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Have the shake system return an OFFSET and let the camera owner compose it onto whatever the camera controller produced this frame, at a render-step priority that runs after the camera. Never let the shake assign the camera\'s transform itself.',
    because: 'A shake that writes the camera transform is competing with the system that decides where the player is looking, and the winner is whichever ran last — so the shake either eats the player\'s aim or is silently erased, and which one it does changes with unrelated ordering. Returning a delta makes the shake composable with any camera implementation, and stackable with other deltas, without either side knowing about the other.',
    prevents: 'A shake that cancels the player\'s mouse look for its whole duration during a firefight, or that vanishes entirely once a custom camera script is added, with nothing in either file mentioning the other.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Sleitnick/RbxCameraShaker (MIT) src/CameraShaker/init.lua',
      validated: 'read the contract: Update returns a CFrame built purely from the summed position and rotation offsets, the caller supplies `camera.CFrame = playerCFrame * shakeCFrame`, and the loop is bound with BindToRenderStep at a caller-supplied priority which the documented example sets to Enum.RenderPriority.Camera.Value. Not run in Studio.',
    },
  },
  {
    id: 'shake.character-comes-from-which-axis-it-loads',
    component: 'motion',
    styleFamilies: ['battleground-fps', 'driving', 'horror', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Give every shake a per-axis weighting for rotation and for translation separately, and distinguish events by WHICH axis they load rather than only by how hard they hit.',
    because: 'Magnitude is a single scalar, so if it is the only thing that varies then every event in the game is the same shake at different volumes. The axis is what carries meaning: a blast in front of the player is pitch, ground movement is roll, a machine is a narrow high-rate translation. It also decides comfort — translation along the axis the player is looking down is far more nauseating than rotation of the same size, which is consistent with the two most subtle presets zeroing their translation entirely.',
    prevents: 'Every impact in a game — a hit, an explosion, a landing, a vehicle bump — feeling like one generic rumble played louder or softer, so none of them tells the player anything about what just happened.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Sleitnick/RbxCameraShaker (MIT) src/CameraShaker/CameraShakePresets.lua + src/CameraShaker/CameraShakeInstance.lua',
      validated: 'read the preset table against the composition code: one scalar magnitude is multiplied by two independent Vector3 influences, and the presets differentiate almost entirely through those — the blast preset loads pitch (4,1,1), the ground preset loads roll (1,1,4), the machine preset loads (1.25,0,4) with translation on one axis only, and the two most subtle presets set translation influence to zero on every axis. Declared honestly: the per-axis weightings and the zeroed translation are read directly from the source; the comfort argument for WHY translation is zeroed is inference and is not stated anywhere in the repository. Not run in Studio.',
    },
    tokens: {"defaultPositionInfluence":[0.15,0.15,0.15],"defaultRotationInfluence":[1,1,1],"presetRotationInfluence":{"bump":[1,1,1],"explosion":[4,1,1],"earthquake":[1,1,4],"vibration":[1.25,0,4],"handheldCamera":[1,0.5,0.5]},"presetPositionInfluence":{"bump":[0.15,0.15,0.15],"explosion":[0.25,0.25,0.25],"earthquake":[0.25,0.25,0.25],"vibration":[0,0.15,0],"handheldCamera":[0,0,0]}},
  },
  {
    id: 'icon.stroke-weight-cap-and-join-are-family-constants',
    component: 'icon',
    styleFamilies: ['minimalist', 'mobile-first'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Fix the stroke weight, the cap and the join ONCE for the whole family and never vary them per glyph. Those are family constants; only the path data is a per-icon decision.',
    because: 'Stroke weight is the one property visible at every size and in every glyph simultaneously, so it is what the eye uses to decide whether a row of icons is one set. Shape can vary enormously — a bell and a bar chart share nothing — and the row still reads as a family, because the line that draws them is the same line. Vary the weight and no amount of shape agreement recovers it. This library already requires one grid for one set; the census below says the grid was never the whole of it.',
    prevents: 'A set drawn glyph-by-glyph where each icon was tuned to look good alone, so the HUD row reads as several icon fonts pasted together.',
    provenance: {
      kind: 'learned-pattern',
      source: 'tijnepema/lucide-roblox (MIT; the icon SVGs under icons/svg/ are Lucide, ISC)',
      validated: 'counted every SVG in the checkout: 1709 of 1709 carry viewBox 0 0 24 24, stroke-width 2, stroke-linecap round, stroke-linejoin round and fill none — zero exceptions. Scoped to the stroke constants so it does not restate the existing golem-authored icon.one-set-drawn-on-one-grid.',
    },
    tokens: {"designBoxUnits":24,"strokeUnits":2,"strokeToBoxRatio":0.0833,"cap":"round","join":"round","defaultFill":"none"},
  },
  {
    id: 'icon.each-silhouette-gets-its-own-keyline-not-one-bounding-box',
    component: 'icon',
    styleFamilies: ['minimalist', 'inventory-heavy'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Give each primitive silhouette — square, circle, triangle — its own keyline size, tuned so the shapes look equally large, instead of fitting every glyph to one bounding box.',
    because: 'Optical area and geometric area are different quantities. A circle inscribed in the same box as a square encloses about 78% of its area, so it reads as the smaller object; the fix is to let the circle break the square\'s box. Fitting everything to one rectangle is arithmetically tidy and visually wrong, and the error is invisible until two silhouettes appear side by side — which on a HUD rail is always.',
    prevents: 'A settings cog and a close button of identical nominal size where the round one looks a size smaller, so a HUD row reads as unevenly weighted for reasons no measurement in the layout will explain.',
    provenance: {
      kind: 'learned-pattern',
      source: 'tijnepema/lucide-roblox (MIT; the icon SVGs under icons/svg/ are Lucide, ISC)',
      validated: 'measured the two dominant keylines in the checkout: the square keyline (width 18 height 18 at x3 y3, in 134 files) puts the stroke\'s outer edge at 2..22, while the circle keyline (r 10 at 12,12, in 95 files) puts it at 1..23 — the circle deliberately overshoots the square by one unit per side.',
    },
    tokens: {"gridUnits":24,"squareKeyline":{"width":18,"height":18,"x":3,"y":3},"circleKeylineRadius":10,"circleOvershootUnitsPerSide":1},
  },
  {
    id: 'icon.a-modifier-is-one-glyph-placed-at-the-same-coordinates-everywhere',
    component: 'icon',
    styleFamilies: ['minimalist', 'inventory-heavy', 'progression'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Draw each modifier mark — tick, cross, plus, alert bar — exactly once, and place that same geometry at the same coordinates inside every container that takes it. Never redraw it to fit the container.',
    because: 'A modifier is the part of the icon the player reads fastest, because it is the part that carries the state. If the tick in the circle and the tick in the square differ by half a unit, nothing looks broken but the two states stop being recognisably the same claim — and the set acquires a maintenance burden that grows with the PRODUCT of containers and modifiers rather than their sum.',
    prevents: 'Nine hand-fitted checkmarks that each drift slightly, so a grid of owned/locked/equipped badges shimmers as the player scrolls it.',
    provenance: {
      kind: 'learned-pattern',
      source: 'tijnepema/lucide-roblox (MIT; the icon SVGs under icons/svg/ are Lucide, ISC)',
      validated: 'the tick path is byte-identical across nine files spanning the badge, square, circle, shield, ticket and vote containers; the circle keyline is likewise byte-identical across its 95 files. The path data itself is deliberately not reproduced here — the count is the evidence, the artwork is not ours to carry.',
    },
    tokens: {"gridUnits":24},
  },
  {
    id: 'icon.negation-is-cut-through-the-glyph-not-laid-over-it',
    component: 'icon',
    styleFamilies: ['minimalist', 'cartoon-simulator', 'mobile-first'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Express an off/muted/disabled variant as one corner-to-corner stroke on a fixed diagonal, and BREAK the underlying glyph into segments with clearance either side of where that stroke crosses.',
    because: 'The slash is the same weight as everything it crosses, so where the two meet at a shallow angle they merge into a blob and both readings are lost — a risk that grows with stroke weight, which makes it worse for a heavy outlined family than for the thin one it was measured on. Cutting the base glyph is what keeps it recognisable and what makes the diagonal read as an act performed on the object rather than as another one of its parts. Fixing the diagonal also means the negation is the same gesture on every icon, so the player learns it once.',
    prevents: 'A muted-audio icon that reads as a speaker with a stray line welded to it, indistinguishable at HUD size from a speaker with an antenna.',
    provenance: {
      kind: 'learned-pattern',
      source: 'tijnepema/lucide-roblox (MIT; the icon SVGs under icons/svg/ are Lucide, ISC)',
      validated: '67 files are named -off; 58 of them carry the identical (2,2)-to-(22,22) diagonal (30 as a path, 28 as a line). Diffed eye.svg against eye-off.svg and bell.svg against bell-off.svg: the base glyph is re-authored as open arcs with gaps at the crossing, not reused intact.',
    },
    tokens: {"slashStart":[2,2],"slashEnd":[22,22],"gridUnits":24},
  },
  {
    id: 'icon.corner-radii-are-a-small-closed-set-shared-with-the-container',
    component: 'icon',
    styleFamilies: ['minimalist', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Keep the whole system\'s corner radii to a small closed set, express each as a fraction of the box rather than in pixels, and draw glyph corners from the SAME set the buttons and cards use. A shape whose aspect ratio changes what a radius means belongs in the set as a declared member, not as an ad-hoc extra value.',
    because: 'Corner radius reads as material — how softly the thing was cut. It is one of the very few properties an icon shares with the container around it, so a mismatch there is the specific thing that makes a competent icon look pasted in rather than drawn for the panel. Expressing it as a fraction is what lets one decision hold at 16px and at 64px instead of becoming four unrelated pixel values. Two unrelated sources landed on the same size for the set — a 1709-icon census where two values carry 96% of all rounded corners, and a separate guidance document that names mixed radii as an anti-pattern and prescribes two — which is what makes the smallness of the set evidence rather than preference.',
    prevents: 'An icon set with softly rounded corners sitting inside hard-cornered buttons, so every glyph reads as imported artwork rather than as part of the control.',
    provenance: {
      kind: 'learned-pattern',
      source: 'tijnepema/lucide-roblox (MIT; icon SVGs are Lucide, ISC) cross-checked against afrxo/roblox-agent-skills (MIT) skills/roblox-ui/references/design-guidelines.md',
      validated: 'counted rx across the checkout: 300 rx=2 and 90 rx=1 out of 407 total, so two values carry 96% of all rounded corners in 1709 icons. The second source states the same constraint independently as an anti-pattern table row: mixed radii 4/8/6/12, pick 2 radii max and token them. Phrased as a small closed set rather than a hard count of two, so it does not contradict the existing golem-authored nav.tall-rail-states-its-own-radius, which exists precisely because a pill radius means something different on a tall channel.',
    },
    tokens: {"observedRadiiCoveringNinetySixPercent":2,"glyphCornerUnits":2,"gridUnits":24,"cornerToBoxRatio":0.0833},
  },
  {
    id: 'icon.rasterise-a-size-ladder-and-snap-requests-to-it',
    component: 'icon',
    styleFamilies: ['minimalist', 'mobile-first', 'inventory-heavy'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'When an icon family ships as raster, render the vector separately at each size on a declared ladder, and resolve a requested size to the NEAREST authored size rather than scaling one master.',
    because: 'The stroke is a fraction of the box, so at 16px a 2/24 stroke is about 1.3 device pixels. Rendered at 16 it can be snapped to whole pixels; scaled down from a 64px master it is resampled across two, and the whole family goes soft at exactly the size the HUD uses most. A declared ladder also makes explicit which sizes anyone has ever actually looked at, so a request for an unlisted size degrades to a size that was reviewed instead of to an unreviewed interpolation.',
    prevents: 'A glyph that is crisp at 48px in the shop panel and mush at 16px in the screen corner, with nothing in the layout code to explain the difference.',
    provenance: {
      kind: 'learned-pattern',
      source: 'tijnepema/lucide-roblox (MIT) lune/processIcons.luau + src/init.luau, cross-checked against afrxo/roblox-agent-skills (MIT) skills/roblox-ui/references/roblox-ui-primitives.md',
      validated: 'read the build script — it loops the ladder and rasterises every SVG once per size — and read GetAsset, which walks the registry for the smallest absolute difference from the requested size and returns that tier. Neither was run. The second source independently notes ResamplerMode as the lever for keeping small raster crisp.',
    },
    tokens: {"sizeLadderPx":[12,16,24,48,64],"resolution":"nearest authored size by absolute difference","defaultPx":48},
  },
  {
    id: 'icon.ship-one-tintable-mask-never-a-coloured-asset',
    component: 'icon',
    styleFamilies: ['minimalist', 'cartoon-simulator', 'mobile-first'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Export every glyph as a single-colour silhouette on transparency and apply colour at runtime as a property of the instance. Never bake a palette colour into the asset.',
    because: 'Colour on an icon is a state (default, hover, disabled, danger, selected) and a theme, and both change far more often than the geometry does. Baking it multiplies the asset count by the palette, and the copies then have to be kept in step by hand — so the first time a glyph is redrawn, some states get the new shape and some keep the old one. This is the asset-pipeline form of the same claim the component libraries make about tokens: colour belongs to the state table, not to the thing being coloured.',
    prevents: 'Uploading a second copy of every glyph because the danger state needs red, then shipping a redraw that updates only the white set.',
    provenance: {
      kind: 'learned-pattern',
      source: 'tijnepema/lucide-roblox (MIT) lune/scripts/convert.sh, cross-checked against afrxo/roblox-agent-skills (MIT) skills/roblox-ui/references/roblox-ui-primitives.md',
      validated: 'read the conversion command: it negates the RGB channels over a transparent background, turning the black source strokes into a white alpha mask, which is what makes a runtime tint possible. The second source documents ImageColor3 as the tint property. Neither was run.',
    },
    tokens: {"exportedGlyphColour":"white on transparent","tintAt":"runtime, per instance"},
  },
  {
    id: 'button.the-hit-target-is-a-sibling-surface-not-the-artwork',
    component: 'button',
    styleFamilies: ['mobile-first', 'minimalist', 'dialogue-story', 'rpg', 'inventory-heavy'],
    platforms: ['desktop', 'mobile'],
    rule: 'Give a control a hit target LARGER than its paint by parenting the input surface to a sibling frame that overhangs it, sized to the touch floor. Cap the per-side overhang at HALF the layout gap, and never grow the artwork or the global UI scale to reach the floor.',
    because: 'The touch floor is a property of a fingertip and the glyph or row size is a property of the design grid; they are unrelated quantities, and tying them makes one of them wrong — an oversized pictogram HUD, or a neat row that mis-taps. The gutter between siblings is free space that costs nothing to spend, which matters because the alternative this library already names — raising the global UI scale until the smallest target clears the floor — costs screen area everywhere at once. Half the gap is the exact ceiling: past half, two adjacent targets overlap, the press goes to whichever draws on top, and nothing on screen tells the player which one they hit. Two independent sources state the two halves — a guidance document names the floor and the decoupling, and a shipping dialogue system\'s measured geometry lands on exactly half its own list gap.',
    prevents: 'A HUD dominated by thumb-sized pictograms, a neat row of 32px icons where a phone player hits the neighbour of the one they aimed at, and a dialogue option list where pressing just below one line selects the line beneath it with no visual difference between the press that worked and the press that did not.',
    provenance: {
      kind: 'learned-pattern',
      source: 'afrxo/roblox-agent-skills (MIT) skills/roblox-ui/references/design-guidelines.md; Crabzzai/SimpleDialogue (MIT) src/UI/DialogueUI.luau',
      validated: 'read the reference document, which states the floor, the decoupling and the inter-target gap explicitly. Read the Luau source in the checkout: CreateOptionButton parents the TextButton to a \'Hitbox\' frame sized UDim2.new(1, 20, 1, 10) at position UDim2.new(0, -10, 0, -5) around a 450x40 row, inside a UIListLayout whose Padding is UDim.new(0, 10) — the 5px per-side vertical overhang is exactly half that gap, so neighbouring targets meet and never overlap. Stated as engine geometry, not as the reactive-library API the file happens to use. Merged from two candidates found by two extractors reading unrelated repositories. Neither executed; this is the escape hatch that keeps the existing golem-authored layout.touch-floor-from-smallest-target without paying for it in screen area.',
    },
    tokens: {"hitTargetPx":44,"exampleGlyphPx":32,"exampleRowHeightPx":40,"exampleHitTargetHeightPx":50,"exampleListGapPx":10,"examplePerSideExpansionPx":5,"maxExpansionAsFractionOfGap":0.5},
  },
  {
    id: 'asset.attribution-is-written-by-the-code-that-writes-the-asset',
    component: 'icon',
    styleFamilies: ['rpg', 'inventory-heavy', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'The pipeline step that produces an asset must also produce its source, author, licence identifier and required credit line, in a machine-readable record beside the artefact. A licence stated only in documentation or in a reply to the user does not count as recorded.',
    because: 'Attribution is a CONDITION of the licence, which makes it part of the artefact rather than part of the conversation about the artefact. The single-asset path always has a human reading a reply and can appear to work; the batch path has no reader at all, and it is the batch path that produces the volume. Once an asset has been uploaded and given a new id, the evidence of where it came from cannot be reconstructed from the asset. This is the same boundary this library already enforces on its own rules, applied one layer out to the things the rules produce.',
    prevents: 'Twenty attribution-required icons uploaded as bare AssetIds with no record of which artist drew them, so the credit that made their use lawful exists nowhere in the shipped game.',
    provenance: {
      kind: 'learned-pattern',
      source: 'zhsj0089944/roblox-free-assets.skill (MIT) — learned from the gap between its prose and its scripts, not copied from its workflow',
      validated: 'read all three scripts and grepped them for licen/credit/attribut/CC BY: zero hits in any of them, while SKILL.md, README.md and references/quick-ref.md all state CC BY 3.0, give a credit template and carry an allow/deny table. The scripts do carry the artist field through download and into the saved results list, so the fact is available and simply never emitted. Recorded precisely: the source\'s PROSE is correct about rights; the defect is that the automation does not emit them.',
    },
    tokens: {"requiredFieldsPerAsset":["sourceUrl","author","licenceSpdxOrName","requiredCreditLine"]},
  },
  {
    id: 'asset.route-interface-chrome-and-world-subjects-to-different-sets',
    component: 'icon',
    styleFamilies: ['rpg', 'inventory-heavy', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Split an icon need into interface chrome (close, settings, back, search) and world subject matter (sword, potion, dragon) and source them by different routes: chrome from a small CLOSED vocabulary held to one family, subjects from an open searchable pool.',
    because: 'The two sets have opposite requirements. Chrome is small, endlessly recurring, and must be coherent above all — a player sees the close button a thousand times and every inconsistency compounds. Subject icons are unbounded, mostly seen once, and need only to be recognisable. Searching one pool for both means the close button arrives from whichever hand happened to score highest on the word \'close\', which is the one glyph that could least afford it.',
    prevents: 'A HUD whose close button and settings button came from different hands, next to a shop whose items look fine — the interface reading as assembled while the content reads as designed.',
    provenance: {
      kind: 'learned-pattern',
      source: 'zhsj0089944/roblox-free-assets.skill (MIT) SKILL.md + references/quick-ref.md',
      validated: 'read the skill: it routes game icons to a 4176-entry fuzzy index and routes UI icons to a fixed 26-row name table with the explicit instruction that no search is needed. Read search_icons.py to confirm the index path is a name-similarity ranker with a 0.3 threshold.',
    },
    tokens: {"chromeVocabularySize":"~26 named roles","subjectPoolSize":4176},
  },
  {
    id: 'asset.pick-one-hand-when-sourcing-from-a-multi-contributor-pool',
    component: 'icon',
    styleFamilies: ['rpg', 'inventory-heavy'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'When drawing subject icons from a pool many artists contributed to, choose ONE contributor as the family and take their weaker match for a subject rather than a better match from another hand. Rank candidates by contributor first and by name similarity second.',
    because: 'Coherence lives in the hand, not in the subject. Two artists drawing the same sword produce two line weights, two levels of detail and two attitudes to perspective, and no amount of resizing or recolouring reconciles them. A name-similarity ranker optimises the one axis that does not matter for coherence and is blind to the one that does, so its default output is a set that is individually correct and collectively wrong.',
    prevents: 'A fantasy shop where every item icon depicts the right object and the grid still reads as clip art, because the shield is fine-line and the sword beside it is thick cartoon.',
    provenance: {
      kind: 'learned-pattern',
      source: 'zhsj0089944/roblox-free-assets.skill (MIT) references/asset-sources.md + scripts/search_icons.py',
      validated: 'read both: the reference records a per-artist style axis (fine linework / thick cartoon / simple geometric / realistic) with icon counts, while the search script scores only name similarity and never reads the artist field, so the documented axis is unavailable to the default path.',
    },
  },
  {
    id: 'tokens.a-scale-step-names-its-ratio-to-one-base',
    component: 'layout',
    styleFamilies: ['modern', 'minimalist', 'cartoon-simulator', 'mobile-first'],
    platforms: ['desktop', 'mobile'],
    rule: 'Name every step of a spacing, sizing, radius, type or motion scale by its MULTIPLE of a single base, and compute the step from that base at theme-build time. Do not enumerate the resulting pixel values.',
    because: 'A scale expressed as multiples has exactly one number a theme is allowed to change, so retuning density, porting to a denser screen class or handing the system to another artist moves every step together and keeps the ratios that made it a scale. A scale enumerated as pixels has as many numbers as it has steps, and the ratios are written down nowhere, so the first person who needs a step between two existing ones guesses — and the guess is invisible until the whole set is seen side by side.',
    prevents: 'A declared \'spacing scale\' that has decayed into an unordered pile of magic numbers, and a theme that cannot be made tighter for a phone without editing every component that consumed it.',
    provenance: {
      kind: 'learned-pattern',
      source: 'loneka/onyx-ui (MIT)',
      validated: 'read src/Themer/NewTheme.luau (ProcessMultipliers derives every named key by tonumber(key) * Base), src/Themer/ThemeSpec.luau and src/Themer/OnyxNight.luau, which sets only the Base of each scale — the whole theme is seven numbers.',
    },
    tokens: {"stepNamesAreMultipliers":["0","0.25","0.5","0.75","1","1.5","2","3","4","6","8","12","16","24","32","48"],"observedBases":{"padding":24,"spacing":22,"sizing":22,"textSize":19,"cornerRadius":8,"strokeThickness":1,"springSpeed":50}},
  },
  {
    id: 'tokens.a-surface-colour-is-never-named-without-its-content-colour',
    component: 'panel',
    styleFamilies: ['modern', 'minimalist', 'cartoon-simulator', 'tycoon'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Declare every surface colour token together with the colour of the content that sits on it, as a pair, and make any state that changes the surface change its paired content colour in the same step.',
    because: 'Contrast is a property of a PAIR, never of a colour, so a token that names only one half of the pair cannot be checked. Naming them together also makes the omission visible: a state that has a new background and no new foreground becomes a hole in a table rather than an absence nobody can see. Three of the four component libraries read here reached the same shape independently, from three different design languages — Base/BaseContent, Bg/Fg, Surface/OnSurface — which is what makes it grammar rather than a house style, and one of them goes further and elevates a button\'s text tone by exactly the amount it elevates the background beneath it.',
    prevents: 'A hover state that darkens a button\'s fill and leaves its label at the rest colour, so the one moment the player is looking hardest at the control is the one moment its contrast was decided by accident — and a disabled state that greys only the plate, leaving a full-strength label that still reads as a live control.',
    provenance: {
      kind: 'learned-pattern',
      source: 'loneka/onyx-ui (MIT) + gcaptn/cyan-ui (MIT) + nightcycle/synthetic (Apache-2.0)',
      validated: 'read all three theme definitions and one consuming component each: onyx-ui src/Themer/NewTheme.luau, cyan-ui src/Types.luau + src/Themes.luau, synthetic src/Theme/init.luau and src/Component/Button/FilledButton/ColdFusion.luau, where the text colour is elevated by exactly the same amount as the background it sits on in every state.',
    },
    tokens: {"observedPairNamings":["Base/BaseContent, Neutral/NeutralContent (onyx-ui)","Bg/Fg, Accent/AccentFg, DisabledBg/DisabledFg (cyan-ui)","Surface/OnSurface, Primary/OnPrimary, PrimaryContainer/OnPrimaryContainer (synthetic)"],"statePairsMustAlsoPair":["HoverBg/HoverFg","PressedBg/PressedFg","DisabledBg/DisabledFg"]},
  },
  {
    id: 'state.interaction-states-are-a-total-map-not-a-set-of-overrides',
    component: 'button',
    styleFamilies: ['modern', 'minimalist', 'cartoon-simulator', 'tycoon', 'inventory-heavy'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Model a control\'s interaction states as a CLOSED set, give every state-varying property a value for every member of that set, and resolve overlapping states through one written precedence — instead of layering event handlers that mutate a resting value.',
    because: 'Handlers are open-ended, so a state nobody wrote is silently the rest state and nothing reports it. A total map turns the same omission into a missing key a reader or a type checker can see. The precedence matters just as much: a control can genuinely be disabled AND under the pointer at once, and without a stated order the winner is whichever event happened to fire last, which differs between a mouse, a touch and a controller. Two libraries reached the closed set independently, one demanding all four of its states for every animated property and the other resolving five through one written order.',
    prevents: 'A disabled control that still lights up under the pointer and invites a press it will refuse, and a control with careful hover and press styling that looks exactly like a live one when disabled because the disabled case was never written down anywhere.',
    provenance: {
      kind: 'learned-pattern',
      source: 'gcaptn/cyan-ui (MIT) + nightcycle/synthetic (Apache-2.0)',
      validated: 'read cyan-ui src/Components.luau (GuiStateTransitions<T> requires all four states for every animated property; createButtonTransitions fills all four even where the value is unchanged) and synthetic src/Component/Button/Base.luau (currentStateState resolves five states through an explicit if-chain into a renderDatas map keyed by state).',
    },
    tokens: {"cyanStateSet":["Idle","Hover","Press","NonInteractable"],"cyanStateSource":"Enum.GuiState, so the engine computes the state rather than the component inferring it","syntheticStateSet":["Enabled","Disabled","Hovered","Focused","Pressed"],"syntheticPrecedence":"Disabled > Pressed > Hovered > Focused > Enabled"},
  },
  {
    id: 'state.selection-gained-is-the-gamepad-s-hover',
    component: 'button',
    styleFamilies: ['controller-first', 'minimalist', 'cartoon-simulator'],
    platforms: ['desktop', 'gamepad'],
    rule: 'Feed SelectionGained/SelectionLost into the SAME state value that the pointer\'s MouseEnter/MouseLeave feeds, so every visual response written for hover is automatically a response to gamepad focus.',
    because: 'Hover is the pointer\'s way of saying \'this is the thing you are about to act on\'; selection is the controller\'s way of saying the same thing. If the two drive separate code paths, the controller path is the one that gets forgotten on the next component — and it is the path with no cursor to fall back on, so its absence is total rather than cosmetic. Two libraries agree that selection must enter the state machine and differ only on whether focus deserves its own rank inside it, which is a tuning question rather than a structural one.',
    prevents: 'A nav rail where a mouse user always knows which item is live and a controller player is moving an invisible cursor through it.',
    provenance: {
      kind: 'learned-pattern',
      source: 'loneka/onyx-ui (MIT) + nightcycle/synthetic (Apache-2.0)',
      validated: 'read onyx-ui src/Components/BaseButton.luau, where SelectionGained/SelectionLost set the same Hovering value MouseEnter/MouseLeave set, and Selectable defaults to `not Disabled` so disabling also removes the control from the selection graph; and synthetic src/Component/Button/Base.luau, which instead keeps a separate isFocused state and ranks it below Hovered.',
    },
  },
  {
    id: 'state.a-press-returns-to-the-state-the-device-actually-left-it-in',
    component: 'button',
    styleFamilies: ['controller-first', 'minimalist', 'cartoon-simulator'],
    platforms: ['desktop', 'gamepad'],
    rule: 'On release, return a control to its hover appearance only when the press came from a pointer. A gamepad release must return it to its resting or selected appearance, never to hover.',
    because: 'After a click the pointer is still physically over the control, so hover is the true state to restore. A gamepad button never established hover in the first place, so restoring hover leaves the control in an appearance it never entered — and because nothing will ever move a pointer off it, it stays there for the rest of the session.',
    prevents: 'A controller-driven menu where the last item pressed keeps its highlight alongside the item currently selected, so two things look live and the player presses the wrong one.',
    provenance: {
      kind: 'learned-pattern',
      source: 'SirMallard/Iris (MIT)',
      validated: 'read lib/widgets/init.lua applyInteractionHighlights — the InputEnded handler branches on input.UserInputType, restoring Hovered colours for MouseButton1 and rest colours for Gamepad1, and both paths are additionally guarded by an exitedButton flag so a press dragged off the control does not restore anything.',
    },
  },
  {
    id: 'nav.replace-the-default-selection-highlight-rather-than-inheriting-it',
    component: 'nav',
    styleFamilies: ['controller-first', 'cartoon-simulator', 'tycoon'],
    platforms: ['gamepad'],
    rule: 'Give every selectable element an explicit SelectionImageObject built from the theme and OUTSET by roughly the stroke width, and regenerate it whenever the theme changes.',
    because: 'The engine\'s default highlight is a fixed rectangle in a fixed colour. On a rounded, carved or non-rectangular control it agrees with neither the silhouette nor the palette, and on a controller it is the ONLY feedback the player has about where they are — so it is simultaneously the most important affordance on screen and the one most likely to be left at its default. Outsetting rather than overlaying is what makes it a ring around the control instead of a lid on it, which matters most on exactly the chunky rounded plates this project builds.',
    prevents: 'A cartoon HUD whose gamepad focus indicator is a stock blue box cutting across the rounded corners of every tile it lands on.',
    provenance: {
      kind: 'learned-pattern',
      source: 'SirMallard/Iris (MIT)',
      validated: 'read lib/Internal.lua _generateSelectionImageObject and lib/widgets/init.lua, where every interactive widget is assigned Iris.SelectionImageObject and the object is rebuilt on a global config refresh. Iris\'s own palette is a declared port of another toolkit\'s defaults and was deliberately not extracted; only the mechanism is taken.',
    },
    tokens: {"outsetPosition":"UDim2.fromOffset(-1, -1)","outsetSize":"UDim2.new(1, 2, 1, 2)","construction":"a themed Frame with its own UIStroke, so the ring surrounds the control instead of covering it"},
  },
  {
    id: 'panel.depth-is-a-tone-step-and-the-steps-must-diminish',
    component: 'panel',
    styleFamilies: ['modern', 'minimalist', 'cartoon-simulator', 'tycoon'],
    platforms: ['desktop', 'mobile'],
    rule: 'Express a raised surface as a tone shift of its OWN colour, drawn from a ladder whose increments SHRINK as the stack gets taller, and resolve it in the theme as a property of the colour rather than as a shadow added by the component.',
    because: 'Constant increments exhaust the tonal range: six layers at a fixed step ends in white, and the last two stop being separable from each other exactly when the stack is deepest and separation matters most. A diminishing ladder keeps every neighbouring pair distinguishable while leaving headroom above the top. Making it a lookup on the theme also means one surface cannot be raised without the system knowing how high everything else is. This is the multi-layer complement to the rules this library already holds about a single control\'s own thickness and about darkening a card\'s fill to make its edge — same operation, different axis: those vary the ratio with the fill\'s lightness, this varies it with the depth of the stack.',
    prevents: 'A modal over a card over a panel where the topmost surface has bleached out to white and the two beneath it are the same colour.',
    provenance: {
      kind: 'learned-pattern',
      source: 'nightcycle/synthetic (Apache-2.0)',
      validated: 'read src/Theme/init.luau ELEVATION_TINTS and getElevatedColor, plus src/Style/init.luau where GetColor takes elevation as an argument alongside the role.',
    },
    tokens: {"elevationTints":[0,0.05,0.08,0.11,0.12,0.14],"increments":[0.05,0.03,0.03,0.01,0.02],"appliedAs":"tone + tone * tint, on the surface's own colour","namedSurfaceLadder":["SurfaceContainerLowest","SurfaceContainerLow","SurfaceContainer","SurfaceContainerHigh","SurfaceContainerHighest"]},
  },
  {
    id: 'button.press-moves-the-opposite-way-from-hover',
    component: 'button',
    styleFamilies: ['modern', 'minimalist', 'cartoon-simulator', 'tycoon', 'incremental'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Move hover and press along the same visual channel in OPPOSITE directions from rest — hover forward, press back — rather than making press a larger step in the hover direction.',
    because: 'Hover says \'this is live\'; press says \'I took it\'. The player checking whether a tap registered is comparing press against HOVER, not against rest, so those two must be separated by more than the step that produced hover in the first place. Reversing guarantees that separation on any palette. Continuing in the same direction spends the remaining headroom, and on a control already near the top or bottom of its range it produces no visible change at all. Recorded as a disagreement rather than smoothed over: two of the three libraries reverse, one does not, and the one that does not is the weaker solution for exactly this reason.',
    prevents: 'A button whose pressed appearance is barely distinguishable from its hovered one, so a player on a slow server taps it repeatedly and buys three of something.',
    provenance: {
      kind: 'learned-pattern',
      source: 'gcaptn/cyan-ui (MIT) + nightcycle/synthetic (Apache-2.0); dissent recorded from loneka/onyx-ui (MIT)',
      validated: 'read cyan-ui src/Themes.luau (rest/hover/press step 500 to 600 to 400 on the accent and 200 to 300 to 100 on the secondary surface, and the same shape again in the dark map) and synthetic src/Component/Button/FilledButton/ColdFusion.luau (hover renders at elevation e+1, press at e-1). onyx-ui src/Components/Button.luau does NOT reverse — hover and press are 2/3 and 3/3 of one emphasis unit in the same direction. This is the direction axis; the existing golem-authored button.press-is-a-hard-cut governs the timing axis and the two compose.',
    },
    tokens: {"syntheticElevation":{"rest":"e","hover":"e + 1","press":"e - 1"},"cyanColourScaleSteps":{"restLight":500,"hoverLight":600,"pressLight":400,"restDark":600,"hoverDark":700,"pressDark":500}},
  },
  {
    id: 'typography.a-type-step-is-a-bundle-not-a-size',
    component: 'typography',
    styleFamilies: ['modern', 'minimalist', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile'],
    rule: 'Define each step of a type scale as size, weight and line height together, with weight RISING and the leading ratio WIDENING as size falls. Author leading in absolute pixels and divide by the step\'s own size at apply time, because Roblox\'s LineHeight is a multiple of font size rather than a measurement.',
    because: 'Small type loses apparent stroke weight and needs more air between lines to stay separable, so a caption made by shrinking a heading arrives both thin and cramped — two independent legibility failures from one shortcut. And because LineHeight is a ratio, a single global value applied across a scale gives display type far too much leading and body type far too little; the ratio has to be recomputed per step, which is only possible if the leading was recorded per step in the first place. A dimensionless ratio also means a UI scale factor multiplies size alone and leaves the leading correct for free.',
    prevents: 'An 11px caption set at the heading\'s weight with a leading ratio designed for 57px display type — the exact failure mode of \'the small text style is the big one, smaller\'.',
    provenance: {
      kind: 'learned-pattern',
      source: 'nightcycle/synthetic (Apache-2.0)',
      validated: 'read src/Typography.luau in full — fromFont enumerates fifteen steps each carrying Font weight, Size, Tracking and absolute LineHeight, and getGuiLineHeight divides leading by size at apply time. One honest caveat: Tracking is recorded on every step and then never applied, because Roblox has no letter-spacing property; that column is design intent the engine cannot express, so nothing here builds on it.',
    },
    tokens: {"displayLarge":{"size":57,"weight":400,"leadingPx":64,"ratio":1.123},"titleMedium":{"size":16,"weight":500,"leadingPx":24,"ratio":1.5},"bodyMedium":{"size":14,"weight":400,"leadingPx":20,"ratio":1.429},"labelMedium":{"size":12,"weight":700,"leadingPx":16,"ratio":1.333},"labelSmall":{"size":11,"weight":500,"leadingPx":16,"ratio":1.455}},
  },
  {
    id: 'layout.inner-spacing-is-a-separate-token-from-item-spacing',
    component: 'layout',
    styleFamilies: ['minimalist', 'inventory-heavy', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile'],
    rule: 'Give the system two distinct gap tokens — the gap BETWEEN sibling controls and the gap between the parts WITHIN one control — with the inner gap strictly smaller, and let each carry independent horizontal and vertical values.',
    because: 'Grouping is read from relative distance alone, so a label binds to whichever control is nearest it; if the two gaps are one number, a compound control cannot be made to read as one thing. The axes have to separate for a different reason: a line of text already carries its own leading, so it needs less added vertical gap than horizontal, and a single scalar forces the vertical rhythm to be wrong wherever the horizontal one is right.',
    prevents: 'A settings row whose label sits equidistant between its own toggle and the next one, so the player flips the setting below the one they read.',
    provenance: {
      kind: 'learned-pattern',
      source: 'SirMallard/Iris (MIT)',
      validated: 'read lib/config.lua — the size vocabulary separates WindowPadding, FramePadding, ItemSpacing, ItemInnerSpacing, CellPadding and IndentSpacing, every one of them a Vector2, and both shipped presets keep ItemInnerSpacing at or below ItemSpacing.',
    },
    tokens: {"sizeDefault":{"windowPadding":[8,8],"framePadding":[4,3],"itemSpacing":[8,4],"itemInnerSpacing":[4,4],"cellPadding":[4,2],"indentSpacing":21},"sizeClear":{"windowPadding":[12,8],"framePadding":[6,4],"itemSpacing":[8,8],"itemInnerSpacing":[8,8],"cellPadding":[4,4],"indentSpacing":25}},
  },
  {
    id: 'gauge.a-proportional-handle-needs-a-minimum-size-constraint',
    component: 'gauge',
    styleFamilies: ['inventory-heavy', 'minimalist', 'cartoon-simulator', 'incremental'],
    platforms: ['desktop', 'mobile'],
    rule: 'Floor the size of any handle whose length is proportional to a quantity — a slider grab, a hand-built scrollbar thumb, a range marker — with a size CONSTRAINT on the instance, at a minimum stated in the theme beside the touch-target floor.',
    because: 'The proportion is unbounded from below, so an honest handle for a ten-thousand-row list is under a pixel: the control is drawn exactly correctly and cannot be hit. This is a hit-target decision, not a drawing decision, which is why the minimum belongs with the other target minimums rather than being rediscovered inside each widget — and why it should be a constraint on the instance rather than arithmetic in the size expression, so a parent layout cannot undo it. The global UI scale this library already floors from the smallest touch target cannot reach it, because the handle\'s size comes from data rather than from the scale.',
    prevents: 'A slider whose grab disappears at the extremes and an inventory scrollbar that is visible, correct and impossible to grab.',
    provenance: {
      kind: 'learned-pattern',
      source: 'SirMallard/Iris (MIT)',
      validated: 'read lib/config.lua (GrabMinSize, ScrollbarSize in both presets) and lib/widgets/Input.lua line 971, which applies it as UISizeConstraint(GrabBar, Vector2.new(GrabMinSize, 0)) rather than clamping the computed size.',
    },
    tokens: {"grabMinSizePx":10,"scrollbarSizePx":7,"denserPresetGrabMinPx":14,"denserPresetScrollbarPx":9},
  },
  {
    id: 'layout.z-order-is-bands-with-headroom-not-one-number-line',
    component: 'layout',
    styleFamilies: ['minimalist', 'cartoon-simulator', 'tycoon', 'inventory-heavy'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Give each CLASS of surface — world HUD, panels, popups, tooltips — its own DisplayOrder band, and size the gap between bands for the largest number of surfaces the band below can ever hold. Write the assumed population next to the number. Raising a surface within its band must not be able to reach the band above it.',
    because: 'Bringing a surface to the front is almost always implemented as a monotonically increasing counter, and a counter that shares an ordering space with a class that must always be on top will eventually overtake it. It does so only after a long session with many focus changes, which is precisely the condition nobody tests. Reserving the headroom explicitly, with the population it assumes written beside it, converts an eventual bug into an arithmetic claim someone can check.',
    prevents: 'A confirmation dialog that opens BEHIND the panel that raised it, after the player has focused enough panels for the panel counter to climb past the popup layer.',
    provenance: {
      kind: 'learned-pattern',
      source: 'SirMallard/Iris (MIT)',
      validated: 'read lib/widgets/Root.lua (the popup ScreenGui is created at DisplayOrderOffset + 1024, with the comment stating the assumed population) and lib/widgets/Window.lua (SetFocusedWindow assigns windowDisplayOrder + DisplayOrderOffset from an incrementing counter).',
    },
    tokens: {"baseBand":127,"popupBandOffset":1024,"statedAssumption":"room for 1024 regular windows before overlap","zIndexBehavior":"Enum.ZIndexBehavior.Sibling, so ZIndex is scoped per parent and the bands do not have to reason about descendants"},
  },
  {
    id: 'modal.focus-must-change-appearance-and-must-carry-the-selection',
    component: 'modal',
    styleFamilies: ['minimalist', 'inventory-heavy', 'controller-first'],
    platforms: ['desktop', 'gamepad'],
    rule: 'When a surface takes focus, change its appearance as well as its z-order, and move gamepad selection into it — but only if the player already had something selected.',
    because: 'Z-order tells the player which surface is on top; it does not tell them which one their input reaches, and with two overlapping panels those are different questions. Selection has to follow focus or a controller player\'s cursor is left on the surface they just covered up. The conditional is the subtle half: moving selection for a player who was using a pointer plants a highlight they never asked for and did not see arrive.',
    prevents: 'Two stacked panels where keystrokes go to the one underneath, and a controller player who opens a shop and finds their selection still on the world button behind it.',
    provenance: {
      kind: 'learned-pattern',
      source: 'SirMallard/Iris (MIT)',
      validated: 'read lib/widgets/Window.lua SetFocusedWindow — it restores the outgoing window\'s title and border tokens, applies the Active variants to the incoming one, raises DisplayOrder, and calls GuiService:Select only inside `if GuiService.SelectedObject then`.',
    },
    tokens: {"focusedVariantTokens":["TitleBgActiveColor","BorderActiveColor"],"restingVariantTokens":["TitleBgColor","TitleBgCollapsedColor","BorderColor"],"selectionTarget":"the title bar when visible, otherwise the content container"},
  },
  {
    id: 'panel.an-anchored-popup-flips-a-whole-side-before-it-slides',
    component: 'panel',
    styleFamilies: ['minimalist', 'inventory-heavy', 'mobile-first', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile'],
    rule: 'Place a tooltip, dropdown or context surface by trying whole opposite sides of its anchor in a fixed order, THEN sliding the result into the safe rectangle, and never by shrinking it. Offset it from the anchor point so the cursor or finger does not sit on top of it.',
    because: 'The three repairs are not interchangeable and their order is the whole rule. Flipping preserves the relationship between the surface and the thing it explains; sliding preserves its size at the cost of that relationship; shrinking destroys the content the surface existed to show. Bounding by the SAFE rectangle rather than the screen rectangle is what keeps the flip honest on a device with a notch, where the screen and the usable area are different shapes — the same distinction this library already draws about opting a ScreenGui out of the core insets.',
    prevents: 'A tooltip near the right edge of a phone that is either half off-screen or squeezed into a one-word-per-line column, and a touch tooltip rendered exactly under the finger that summoned it.',
    provenance: {
      kind: 'learned-pattern',
      source: 'SirMallard/Iris (MIT)',
      validated: 'read lib/widgets/init.lua findBestWindowPosForPopup and lib/widgets/Window.lua relocateTooltips, which re-solves the placement on every InputChanged rather than once at open.',
    },
    tokens: {"anchorOffsetPx":20,"sideOrder":["right of the anchor","below it","above it"],"clampExpression":"max(min(pos + size, outerMax) - size, outerMin) per axis — slides the whole surface, never resizes it","outerMinIs":"DisplaySafeAreaPadding, not the screen origin"},
  },
  {
    id: 'layout.mouse-space-and-gui-space-diverge-once-the-inset-is-ignored',
    component: 'layout',
    styleFamilies: ['mobile-first', 'minimalist', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile'],
    rule: 'Where a ScreenGui opts out of the Roblox top-bar inset, convert explicitly between UserInputService mouse coordinates and AbsolutePosition by the GUI inset, and re-read the inset after GuiService.TopbarInset changes instead of trusting the value available on the first frame.',
    because: 'GetMouseLocation always reports in a space that EXCLUDES the top bar, while AbsolutePosition is in the ScreenGui\'s own space, which includes it or not depending on the flag — so the two differ by exactly the inset, in opposite directions, and any hand-rolled hit test, drag or slider that mixes them is wrong by that fixed amount everywhere at once. The inset is also not final on the first frame: it settles one frame later, so anything positioned at startup from it is positioned from a stale number. This is the mechanical consequence of the existing rule about when to opt out at all, which governs the decision but not its arithmetic.',
    prevents: 'A drag handle that grabs a panel a topbar\'s height above where the player pressed, and a HUD laid out at startup that is only correct after the first viewport change.',
    provenance: {
      kind: 'learned-pattern',
      source: 'SirMallard/Iris (MIT)',
      validated: 'read lib/widgets/init.lua lines 34-55, which keeps two separately-named offsets of opposite sign, subtracts MouseOffset in getMouseLocation and GuiOffset from every AbsolutePosition used in a hit test (Combo, Menu, Plot, Input, Table), and re-reads both once on TopbarInset with a five-second cancel.',
    },
    tokens: {"guiOffset":"-GetGuiInset() when IgnoreGuiInset is true, else zero","mouseOffset":"GetGuiInset() when IgnoreGuiInset is false, else zero","timing":"GuiService.TopbarInset updates one frame after start; the re-read is a :Once connection cancelled after 5s"},
  },
  {
    id: 'layout.a-ui-scale-is-meaningless-without-a-declared-design-resolution',
    component: 'layout',
    styleFamilies: ['mobile-first', 'minimalist', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile'],
    rule: 'State the resolution the UI was designed at, derive the scale from the ratio of that resolution to the live viewport taking the MORE constrained axis, and clamp the result at both ends.',
    because: '\'Scale to fit\' has no meaning until something records what \'fit\' was measured against, and once the base resolution is only in the author\'s head, every later adjustment is a guess relative to a number nobody can read. Taking the larger of the two axis ratios means the layout is sized by whichever axis ran out first, so it can never overflow the other one — the cheap version, scaling from width alone, is correct on the aspect ratio it was written on and wrong on every other. The clamp is deliberately asymmetric, because shrinking crosses a legibility floor and growing does not; this library already says where that lower clamp comes from.',
    prevents: 'A HUD authored on a 16:9 monitor that runs off the top and bottom of a tall phone, because the scale was derived from width and the height was assumed to follow.',
    provenance: {
      kind: 'learned-pattern',
      source: 'loneka/onyx-ui (MIT)',
      validated: 'read src/Components/AutoScaler.luau and src/Util/ViewportSize.luau, which re-observes Camera.ViewportSize and re-binds when CurrentCamera changes.',
    },
    tokens: {"formula":"clamp(multiplier / max(baseRes.X / viewport.X, baseRes.Y / viewport.Y), minScale, maxScale)","defaultMinScale":0.8,"defaultMaxScale":"unbounded — the clamp is deliberately asymmetric"},
  },
  {
    id: 'motion.emphasis-comes-from-the-flip-point-not-the-duration',
    component: 'motion',
    styleFamilies: ['minimalist', 'cartoon-simulator', 'tycoon'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Make a transition feel emphatic by moving MORE of its distance into the first fifth of its time and letting the rest settle — not by lengthening it.',
    because: 'Duration is how long the player waits; the distance-over-time curve is how the movement reads. Lengthening an important transition makes the interface slower without making it more emphatic, and the two are easily confused because both feel like \'more\'. Holding the duration and moving the flip point buys weight for free. This is the curve-shape axis; the enter/exit asymmetry this library already measures is a different axis and the two compose.',
    prevents: 'An \'important\' panel transition made weighty by doubling its duration, which now reads as the game hesitating rather than as the panel mattering.',
    provenance: {
      kind: 'learned-pattern',
      source: 'nightcycle/synthetic (Apache-2.0)',
      validated: 'read src/Transition/init.luau — Emphasized and Standard are the same piecewise construction differing only in how much distance is covered by the flip point, and the curve set is a two-by-three matrix of emphasis against direction. The library\'s shared duration ladder is recorded as a token rather than as a second imperative, because \'draw from one named scale\' is already stated once for every scale.',
    },
    tokens: {"flipPointFraction":0.2,"emphasizedDistanceAtFlip":0.45,"standardDistanceAtFlip":0.2,"accelerateExponent":1.25,"decelerateExponent":0.5,"durationLadderMs":[50,100,150,200,250,300,350,400,450,500,550,600,700,800,900,1000],"curveMatrix":"emphasis {Standard, Emphasized} x direction {both, Accelerate for leaving, Decelerate for arriving}"},
  },
  {
    id: 'dialogue.disable-every-entry-point-while-the-conversation-is-open',
    component: 'panel',
    styleFamilies: ['dialogue-story', 'rpg', 'social'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'When a world-anchored prompt opens a conversation, disable EVERY prompt of that family for as long as any conversation is open, and re-enable them on the condition that none is open — not on the condition that this one closed.',
    because: 'The affordance that opens the surface is duplicated once per object in the world, so suppressing only the prompt that fired leaves N-1 other ways in, all of them still lit and still hovering over the panel that is now on screen. And because conversations hand off to each other, the re-enable has to test the SHARED state rather than the local one: a teardown that re-enables on its own completion will un-suppress the world in the middle of the conversation that replaced it. This governs entry points scattered through a world, which is a different mechanism and a different failure from the existing rule about panels sharing one screen.',
    prevents: 'A player standing between two NPCs who triggers a second conversation over the first, tearing the first down mid-sentence — and a ring of \'Press E to Talk\' prompts glowing through the dialogue options the player is trying to read.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Crabzzai/SimpleDialogue (MIT)',
      validated: 'read the Luau source in the checkout — src/Handlers/ProximityPromptHandler.luau (setAllPromptsEnabled over an activePrompts registry, called from PromptTriggered) and src/System/DialogueSystem.luau (StartDialogue disables all; EndDialogue re-enables only under `if not ActiveDialogue`); not executed.',
    },
  },
  {
    id: 'dialogue.a-text-reveal-must-not-gate-the-choices',
    component: 'motion',
    styleFamilies: ['dialogue-story', 'rpg'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Build a conversation\'s options as soon as the node is entered and let any advance input complete a typewriter reveal instantly. Never construct the choices inside the reveal\'s completion callback, and never let teardown wait on it either.',
    because: 'A progressive reveal is decoration over text the player reads far faster than it types, so hanging the interactive elements off its completion converts a stylistic flourish into an input lockout whose length is proportional to how much the writer wrote. The same reasoning this library already applies to reduced motion applies to every player: remove the travel, keep the outcome — the end state must be reachable immediately. This rule sides against its own source, which has no skip input anywhere in its tree and no motion-preference check at all.',
    prevents: 'A six-second dead zone between an NPC finishing a sentence the player already read and the options appearing — and a dialogue exit that busy-polls a typing flag at 20 Hz before it is allowed to run.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Crabzzai/SimpleDialogue (MIT) — learned as a counter-example',
      validated: 'read the Luau source in the checkout — src/System/DialogueSystem.luau: DisplayNode builds every option button inside the ShowNPCText completion callback, ShowNPCText chains task.delay(textSpeed) per character, and EndDialogue spins on `while self.isNPCTyping do task.wait(0.05) end`. Grepped the whole tree for an input handler that completes the reveal and for any reduced-motion check: neither exists. Not executed.',
    },
    tokens: {"observedTextSpeedSecondsPerCharacter":0.05,"observedLockoutSecondsFor120Characters":6,"observedTeardownPollSeconds":0.05},
  },
  {
    id: 'dialogue.one-radius-both-offers-and-ends-the-conversation',
    component: 'panel',
    styleFamilies: ['dialogue-story', 'rpg', 'social'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Drive the prompt\'s activation distance and the walk-away close check from ONE radius value, and let a node that must not be abandoned opt out of the close explicitly rather than by widening the radius.',
    because: 'Two independently authored radii create a band of ground where the two disagree, and the player has no way to see which rule they are standing in: outside the prompt but still captive, or still prompted but already dropped. One value makes the boundary the same object the player already learned by walking up to it. The per-node opt-out is the half that carries the rule beyond \'one source of truth\': it expresses \'this beat must finish\' as the CONTENT decision it actually is, instead of hiding a narrative constraint inside geometry where nobody will find it.',
    prevents: 'A player who steps two studs back, watches the \'Talk\' prompt vanish, and is still locked in the conversation — and its mirror, a conversation that ends itself while the prompt inviting it is still on screen.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Crabzzai/SimpleDialogue (MIT)',
      validated: 'read the Luau source in the checkout — src/System/DialogueSystem.luau: CreateNPC passes `maxActivationDistance = self.config.proximityDistance` into the prompt, and the Heartbeat loop in StartUpdateLoops ends the dialogue on `distance > proximityDistance` gated by the node\'s `shouldEndDialogue ~= false`; not executed. The same file sets RequiresLineOfSight = false as its default, deliberately overriding the engine default, which independently corroborates the existing documentation-derived rule dialogue.prompt-visibility-is-the-cameras-not-the-players from working practice.',
    },
    tokens: {"defaultProximityStuds":10},
  },
  {
    id: 'toast.cap-what-is-visible-and-queue-the-overflow',
    component: 'toast',
    styleFamilies: ['social', 'driving'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Cap how many notifications are VISIBLE at once and hold the rest in a bounded queue, releasing one as each visible one leaves. When the queue is full, drop the oldest WAITING entry — never one already on screen. Never let the arrival rate decide how much of the screen notifications occupy.',
    because: 'Notifications are triggered by events the player does not control — other players joining, a server broadcast, a state change elsewhere in the world — so without a cap the number on screen is a property of the server population, not of the design. Stacking them all makes every message equally unreadable at exactly the moment there is the most to read, and the messages that get buried are chosen by arrival order rather than by importance. A queue keeps the same information and spends screen space at a rate the design chose.',
    prevents: 'A twenty-player server where a join/leave broadcast lasting seven seconds each fills the screen top to bottom, so the one notification that concerned the player is somewhere in a wall of notifications about other people.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Diabetoss/NotificationSystem (MIT) — learned as a counter-example',
      validated: 'read the script Source properties recovered from the binary DiabetoNS.rbxm by static LZ4 decompression during intake (no execution). createNotification clones a template into a UIListLayout-managed frame with no visible cap, no queue and no drop policy, while the shipped server handler fires join and leave notifications to every client on every player event. Stated as a property rather than as a set of numbers, so no value from this project\'s own Effects.luau leaks into a rule provenanced to a third party.',
    },
    tokens: {"observedVisibleCap":"none","observedDefaultLifetimeSeconds":5,"observedBroadcastLifetimeSeconds":7,"observedLongestShippedLifetimeSeconds":30},
  },
  {
    id: 'toast.severity-colours-a-bounded-element-not-the-message-ground',
    component: 'toast',
    styleFamilies: ['social', 'driving'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Put a notification\'s severity colour in a bounded element — a cap, a rail, a glyph — and keep the ground under the message constant across every severity.',
    because: 'The message\'s text colour is authored once, in a template, but the ground changes with the severity, so contrast becomes a function of which severity fired — and the saturated hues that read as urgent are exactly the ones text fares worst against. Confining the colour to a bounded element also gives the severity a SHAPE and a position, which is what a colour-blind player actually reads; this library already refuses to let colour alone distinguish two currencies, and a severity is the same claim about a smaller set.',
    prevents: 'A success notification whose template text colour sits on pure green and a warning whose text sits on pure orange — the two states the system exists to announce being the two least legible ones it can produce.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Diabetoss/NotificationSystem (MIT) — learned as a counter-example',
      validated: 'read the script Source properties recovered from the binary DiabetoNS.rbxm by static LZ4 decompression during intake (no execution). The client sets `Notification.BackgroundColor3 = notificationColor` from a per-type table, tinting the entire message body, and encodes severity in colour plus a sound only — no glyph and no word.',
    },
    tokens: {"observedSuccessFillRgb":"0,255,0","observedWarningFillRgb":"255,128,0","observedErrorFillRgb":"255,0,0"},
  },
  {
    id: 'toast.the-system-owns-the-lifetime-the-caller-owns-the-severity',
    component: 'toast',
    styleFamilies: ['social', 'driving'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Let a caller declare a notification\'s severity, not its duration. Clamp any requested lifetime into a range the notification system owns, and give anything that can outlast a few seconds a dismiss affordance reachable by pointer, touch AND directional input.',
    because: 'Callers judge duration against their own message, and every caller believes its own message is important, so an unclamped duration parameter converges on everything being long. Duration is also the wrong lever for emphasis: it is the one property that trades against every OTHER notification\'s screen time, and against the game the player is trying to look at. Without a dismiss control, a long-lived notification is a permanent obstruction placed by a remote event the player cannot answer.',
    prevents: 'A thirty-second banner announcing that somebody else joined, with no close control, parked over the game for thirty seconds because one call site picked the number.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Diabetoss/NotificationSystem (MIT) — learned as a counter-example',
      validated: 'read the script Source properties recovered from the binary DiabetoNS.rbxm by static LZ4 decompression during intake (no execution). Lifetime is `config.Time or 5` straight from the caller with no clamp, the shipped join handler passes 30 for its group-rank case, and the recovered instance surface contains no close or dismiss control of any kind.',
    },
    tokens: {"observedDefaultSeconds":5,"observedLongestShippedSeconds":30,"observedDismissAffordances":0},
  },
  {
    id: 'toast.a-layout-object-and-a-position-tween-cannot-both-own-position',
    component: 'toast',
    styleFamilies: ['social', 'driving', 'cartoon-simulator'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'A notification stack that slides its entries in, out and up must compute its own slot positions and tween them. If a list layout is managing the stack, animate only properties that layout does not write — transparency, or an inner frame\'s offset.',
    because: 'A list layout writes Position on every child on every layout pass, so a Position tween on a child is a second authority over one property and the layout wins. The failure is not a crash and not a visible error: the tween plays, reports completion, and the element simply never moves. Worse, a tween that also animates a property the layout does NOT own will HALF-work — the fade lands, the travel does not — so the animation looks merely disappointing rather than broken, and gets tuned instead of fixed. That is the expensive part. This is the authorship-side dual of the existing rule about animating the child rather than the container, which governs where to point the instrumentation; this one governs who is allowed to write the property.',
    prevents: 'A notification authored to slide down from off-screen that only ever fades in place, because the list layout re-pins it to its slot on the same frame the slide was supposed to start.',
    provenance: {
      kind: 'learned-pattern',
      source: 'Diabetoss/NotificationSystem (MIT) — learned as a counter-example',
      validated: 'read the script Source properties recovered from the binary DiabetoNS.rbxm by static LZ4 decompression during intake (no execution). The client parents each cloned notification into a frame it has just ensured carries a UIListLayout, then sets Position and AnchorPoint on the clone and tweens Position and BackgroundTransparency together in one TweenInfo.',
    },
    tokens: {"observedSlideSeconds":0.5,"observedListPaddingPx":10},
  },
  {
    id: 'typography.a-scaled-label-must-not-be-told-not-to-wrap',
    component: 'typography',
    styleFamilies: ['cartoon-simulator', 'tycoon', 'mobile-first', 'minimalist', 'inventory-heavy'],
    platforms: ['desktop', 'mobile', 'gamepad'],
    rule: 'Where text is set to scale to fit a box, do not also write the wrapping flag. Set the size constraint first and the scale flag last, and let the engine own wrapping.',
    because: 'Turning scaling on implicitly turns wrapping on, so writing "do not wrap" afterwards silently turns scaling back OFF. Both halves read as exactly what the author intended — shrink to fit, stay on one line — and together they produce neither. The failure is invisible in every screenshot taken at the design resolution, because at that size nothing needed to shrink; it only appears on the small screen the clamp existed for, which is the screen nobody renders.',
    prevents: 'A helper called clampText that has never once clamped anything: 105 labels across a HUD and every panel carrying a size constraint that does nothing, because a size constraint is inert unless the text is scaling.',
    provenance: {
      kind: 'golem-authored',
      source: 'apps/benchmark/crystal-canyon/src/client/Theme.luau',
      validated: 'probed in a live Studio session: TextScaled=true alone reads back true; TextScaled=true followed by TextWrapped=false reads back FALSE; constraint-then-TextScaled reads back true, lays out on one line for a 13-character string in a 112px pill, and still honours MaxTextSize for a short one. 2026-09-01',
    },
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
