/**
 * THE SECOND THING THE LANDING DEMONSTRATES INSTEAD OF ASSERTING, AND THE FIRST ONE THAT IS OUTPUT.
 *
 * `src/data/consent-proof.ts` put a picture of the PRODUCT on the front page — the plugin's panel,
 * docked in a real Studio, showing the consent control. That answers "is it safe". It does not
 * answer the question the owner actually asks, which is "show me what it makes".
 *
 * On 2026-09-21 the deployed landing still had no answer to that one. It carried four interactive
 * demos of capabilities — a tree you can read, a critique with three named defects, a Luau panel, a
 * turning wireframe — and every one of them is DRAWN BY THIS SITE. They are honest explanations of
 * a mechanism and they are not output. Meanwhile `/showcase` had been live since 2026-09-20 with
 * sixteen interface screens and six maps the deployed model actually built, and nothing on the
 * landing pointed at it or showed one. The single best evidence this product has was one URL away
 * from the page everybody arrives on, and unreachable from it.
 *
 * ── WHY THIS ONE, AND WHY NOT THE OTHER FIFTEEN ────────────────────────────────────────────────
 *
 * `screen-inventory--tycoon` is the densest thing in the set (75 interface objects, 17,569
 * characters of Luau) and the only kind that needs no caveat about its state: the manifest records
 * `asScripted.hidden: 0`, so this is the screen as the script leaves it. Half the set — shop,
 * gacha, trading, social — starts hidden behind a button, and `/showcase` shows those forced open
 * and says so. A landing is the wrong place for a footnote of that shape.
 *
 * IT IS ALSO NOT FLATTERED. The cash readout in the header clips to `$1,482,3` against the close
 * button, and the item grid fills two rows of a panel built for many more. Both are in the picture,
 * at the size the picture is shown. The temptation on a marketing page is to pick the cleanest
 * frame; the reason to resist it is that this repository has caught a lane upgrading its own
 * evidence once already (`docs/evidence/customer-review-2026-09-19-round3.md:311`).
 *
 * ── WHY THE SVG AND NOT THE PNG ────────────────────────────────────────────────────────────────
 *
 * The evidence directory holds both, and the manifest's `renderNote` says the SVGs are what
 * `rerender-showcase.mjs` drew from the saved Luau — the PNG is a rasterisation of the SVG, not the
 * other way round. So the SVG is the artefact and the PNG is a copy of it.
 *
 * Shipping the artefact means the file served to a reader is BYTE-IDENTICAL to the file in
 * docs/evidence: no crop, no resample, no re-encode, nothing that requires anybody to take a
 * lane's word for what was removed. `tests/built-screen-is-evidence.test.mjs` compares the two
 * files byte for byte, which is a stronger claim than the sha256-of-the-original-plus-a-crop-string
 * that the consent capture has to settle for, because that one genuinely is a crop.
 *
 * It is also cheaper. `scripts/check-landing-budget.mjs` counts image bytes RAW and caps them at
 * 40,000 for the whole page; the consent capture and the two icons already spend 18,388. This file
 * is 11,229 bytes raw and 1,815 gzipped on the wire, and it is sharp at any width. The best lossy
 * webp of the PNG that stayed legible was 19,282 bytes and would have left the budget at 94% with
 * nothing in it for the next lane.
 *
 * ── EVERY NUMBER AND EVERY CAVEAT COMES OUT OF THE MANIFEST ────────────────────────────────────
 *
 * Same discipline as consent-proof.ts, one level stricter. There, each string names the file it was
 * quoted from. Here the source is a single MACHINE-WRITTEN record —
 * `docs/evidence/ui-showcase/manifest.json`, emitted by the run itself — so each figure names the
 * FIELD it came from and the guard resolves that field and compares. A figure that drifts from the
 * run goes red; a figure pointing at a field the manifest does not have goes red; and the two
 * caveat sentences are checked verbatim against the manifest strings they are taken from.
 *
 * The caveats are not decoration and must not be trimmed to tighten the layout. Without the first,
 * a reader takes this for a photograph of Roblox Studio, which it is not. Without the second, they
 * take it for the model choosing and fetching its own library, which on this endpoint it did not.
 */

/**
 * A figure on the band, and the dotted path that has to produce it.
 *
 * `in` is where the path is resolved. `'screen'` means the manifest row for this screen, `'ui'` the
 * top level of the interface manifest, `'maps'` the top level of the map manifest — the gallery
 * this band opens holds both and the door names a count out of each.
 */
export type ScreenFigure = { value: number; label: string; from: string; in?: 'screen' | 'ui' | 'maps' };

/** A sentence on the band, and the manifest field it is quoted from verbatim. */
export type ScreenCaveat = { text: string; from: string };

const manifest = 'docs/evidence/ui-showcase/manifest.json';
const mapManifest = 'docs/evidence/map-showcase/manifest.json';

export const BUILT_SCREEN = {
  /** The day the run wrote this screen, from the manifest's own `generatedAt`. */
  captured: '2026-09-21',
  /* Rendered rather than typed, for the same reason consent-proof.ts gives: a number on this page
     has to come from somewhere, and the guard checks this one against `generatedAt`. */
  capturedLabel: '21 September 2026',

  manifest,
  mapManifest,

  /** Which of the sixteen this is. The guard uses it to find the row in the manifest. */
  screenId: 'screen-inventory',

  /**
   * THE ARTEFACT ITSELF. `from` is the file in docs/evidence and `src` is the copy under public/;
   * the guard compares them byte for byte rather than hashing one and trusting a crop note. The
   * ten hex characters in the filename are the head of that file's sha256, so a replaced evidence
   * file cannot keep the served URL.
   *
   * `width`/`height` are the render's own viewport out of the manifest — 1600x900 — so the row
   * reserves its box before the bytes land.
   */
  capture: {
    src: '/assets/proof/model-screen-inventory-dad33a3c70.svg',
    from: 'docs/evidence/ui-showcase/screen-inventory--tycoon.svg',
    sha256: 'dad33a3c7020cbfdcfce4e42a0eaddef97fcdc79ef1be9c9e4bd1e80275bdc35',
    width: 1600,
    height: 900,
    alt: 'A tycoon inventory screen: a title bar reading TYCOON INVENTORY with a cash total, a row '
      + 'of category filters, a grid of eleven item slots with rarity colours and stack counts, and '
      + 'a detail panel for a Legendary item with Equip and Delete buttons.',
  },

  /**
   * THE FOUR FIGURES. Each `from` is resolved out of the manifest row for this screen by
   * tests/built-screen-is-evidence.test.mjs, so none of them can be typed from memory.
   *
   * `sources` is the number of shipped games the construction library drew on for this screen —
   * `/showcase` labels the same field "references behind it". It is a property of the LIBRARY the
   * model was handed, not of the model, and the label says so.
   */
  figures: [
    { value: 17569, label: 'characters of Luau written', from: 'codeChars' },
    { value: 75, label: 'interface objects built', from: 'guiNodes' },
    { value: 15, label: 'shipped games behind the library it used', from: 'sources' },
    { value: 0, label: 'image assets referenced — every shape is drawn', from: 'imagePlaceholders' },
  ] as ReadonlyArray<ScreenFigure>,

  /** Milliseconds the completion took, from the same row. Rendered as seconds by the band. */
  ms: { value: 100203, label: 'milliseconds', from: 'ms' } as ScreenFigure,

  /**
   * NOTHING WAS FORCED OPEN. `asScripted.hidden` is 0 for this screen, which is why it is the one
   * on the front page: what is drawn is what the model's own script leaves on screen.
   */
  hidden: { value: 0, label: 'objects hidden', from: 'asScripted.hidden' } as ScreenFigure,

  /** What the picture is, and what it is not — the manifest's own words for its renderer. */
  renderer: {
    text: 'packages/training/src/render-ui-tree.mjs over resolveLayout — geometry, not a Studio screenshot',
    from: 'renderer',
  } as ScreenCaveat,

  /**
   * THE LIMIT OF THE RUN, ON THE PAGE RATHER THAN ONLY IN THE FILE. The model was handed its
   * construction library in the prompt; it was not asked to go and find it. Without this line the
   * band reads as "the model knows what a tycoon shop is made of", and what was measured is that it
   * can build one when it is told.
   */
  library: {
    text: 'The model was GIVEN its library; it did not choose to ask for it.',
    from: 'libraryDeliveryMeaning',
  } as ScreenCaveat,

  /**
   * WHERE THE REST OF IT IS, and the two counts the door prints.
   *
   * `/showcase` is not an Astro route: it is an object in the worker's D1 static store, published
   * by `infra/deploy-showcase.mjs`. `scripts/check-site-links.mjs` is told about that by name, the
   * same way it is told about `/app`. It was live for a day with nothing at all linking to it,
   * which is the failure this whole band is the second half of.
   *
   * Both counts are resolved out of a manifest rather than typed, and they come from DIFFERENT
   * manifests — the screens from the interface run, the maps from the map run.
   */
  gallery: '/showcase',
  galleryScreens: { value: 21, label: 'screens', from: 'counts.built', in: 'ui' } as ScreenFigure,
  galleryMaps: { value: 6, label: 'maps', from: 'counts.built', in: 'maps' } as ScreenFigure,
} as const;

/** Every checkable assertion on the band, flattened, for the guard to walk. Keep in step. */
export const BUILT_SCREEN_FIGURES: ReadonlyArray<readonly [string, ScreenFigure]> = [
  ...BUILT_SCREEN.figures.map((f, i) => [`figures[${i}]`, f] as const),
  ['ms', BUILT_SCREEN.ms],
  ['hidden', BUILT_SCREEN.hidden],
  ['galleryScreens', BUILT_SCREEN.galleryScreens],
  ['galleryMaps', BUILT_SCREEN.galleryMaps],
];

export const BUILT_SCREEN_CAVEATS: ReadonlyArray<readonly [string, ScreenCaveat]> = [
  ['renderer', BUILT_SCREEN.renderer],
  ['library', BUILT_SCREEN.library],
];
