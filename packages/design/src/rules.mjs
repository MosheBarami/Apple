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

const CC = (file) => ({
  kind: 'golem-authored',
  source: `apps/benchmark/crystal-canyon/src/client/${file}`,
  validated: 'rendered and reviewed in Studio, 2026-09-01',
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
  // ---------------------------------------------------------------- panel
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
