/**
 * The design system's vocabulary, declared where a checker can read it without circularity.
 *
 * `scripts/check-pixels.mjs` rules 2 and 3 ask two questions about a rendered route:
 *
 *   2. did the typography actually load, or is this page in a system fallback?
 *   3. is this page styled BY the design system, or merely beside it?
 *
 * Neither can be answered from the site's own CSS. A page checked against the stylesheet that
 * produced it agrees with itself by construction and cannot fail — the same shape as G92 measuring
 * the wrong server, then the wrong build, and reporting green over both. So the vocabulary lives
 * here, in a package the site does not generate, and check-pixels reports rules 2 and 3 as an
 * unchecked GAP rather than a pass whenever this file is missing.
 *
 * EVERY VALUE BELOW IS THE ONE THE STYLESHEETS ACTUALLY SET. Verified against
 * apps/site/src/styles/landing.css and apps/site/src/styles/global.css at the time of writing, not
 * copied from a design document — a vocabulary file that describes an intention rather than a
 * shipped stylesheet turns both rules into assertions about nothing.
 */

/**
 * The first family in the computed `font-family` of a correctly-rendered route.
 *
 * Rule 2 fails a route whose computed `body` family resolves to a bare system stack: the webfont
 * never arrived, which is invisible to every source-reading check in this repository and obvious
 * in a screenshot.
 *
 * ONE LIST FOR THE WHOLE SITE, and that is new. Until this was written the landing was Archivo over
 * Figtree while the other seventeen pages were Fraunces over Inter — one stylesheet had been
 * migrated and the other had not, so /docs rendered its own title in a Scotch-Roman serif one click
 * from a condensed-caps landing. A single approved list is what makes that state expressible as a
 * failure instead of a thing nobody had a name for.
 *
 * Geist Mono is deliberately NOT here. It sets timestamps, Credit counts and file names — never
 * `body` — so a route that renders no mono text at all is correct, and listing it would fail pages
 * for not containing metadata they have no reason to contain.
 */
/*[[ RE-AIMED 2026-09-21. THIS LIST NAMED TWO FACES THE SITE HAD ALREADY STOPPED SHIPPING.
 *
 *   Archivo and Figtree were retired by the warm-dark pass on 2026-09-19, which replaced both with
 *   the system stack in global.css and landing.css. This list outlived them, and the rule that
 *   reads it — check-pixels rule 2 — has therefore been failing EVERY frame ever since: measured on
 *   2026-09-21, 74 of 74 frames across 19 routes at two viewports in both schemes, each reported as
 *   "falls back to a bare system font", when what the body resolves to is the approved stack's own
 *   first family. A rule that fires on every frame is not a strict rule; it is one nobody can read.
 *
 *   §7 of the working rules: every hand-written list in this repository has outlived what it lists.
 *   This is the fourth.
 *
 *   THE RULE STILL HAS TEETH, AND THAT IS WHY THIS IS A CORRECTION RATHER THAN A DELETION. What it
 *   exists to catch is a page whose stylesheet never arrived: with no CSS, `body` resolves to the
 *   user agent's own default — `Times` on Chromium — and check-pixels' SYSTEM_STACKS still matches
 *   `Times`, `serif`, `sans-serif`, `Arial` and `Helvetica`. Only the one family the design system
 *   actually asks for is approved here.
 *
 *   IT IS THE FIRST FAMILY, not the stack. check-pixels compares `fontFamily.split(',')[0]`, which
 *   is what the browser reports whether or not that family resolved to anything, so a longer entry
 *   here could never match. The decision behind the stack, and why there is no webfont to fall back
 *   FROM, is docs/DESIGN-TYPE.md. ]]*/
export const APPROVED_FONT_STACKS = ['-apple-system'];

/**
 * Prefixes that identify a design-system custom property.
 *
 * READ THE CAVEAT BEFORE TRUSTING RULE 3. `--gx-` is a real, deliberate namespace: forty-six tokens
 * in apps/web/src/styles/workspace.css carry it. The marketing site does NOT have one — its tokens
 * are bare (`--ground`, `--surface`, `--ink`, `--muted`), in both landing.css and global.css.
 *
 * That is why `--` is on this list, and it is a weak test on the site: it matches any custom
 * property at all, so rule 3 there asks "does this page use CSS variables" rather than "does this
 * page use OUR variables". It still catches the thing it was written for — a route styled entirely
 * in hard-coded literals, which is what "styled beside the system" looks like — and it does not
 * pretend to catch more.
 *
 * Making it strict means namespacing the site's tokens, which is a real rename across two
 * stylesheets, every rule that reads them, and the unit test that measures the ink ramp by name.
 * That is worth doing and is not worth doing in the same change as the redesign it would be
 * renaming. Until then `TOKEN_NAMES` below is the precise instrument.
 */
export const TOKEN_PREFIXES = ['--gx-', '--'];

/**
 * The tokens the site actually defines, for a rule that wants precision rather than a prefix.
 *
 * A route mentioning several of these is unambiguously styled by the system; a route mentioning
 * none of them is not, whatever custom properties it happens to declare. Grouped by the stylesheet
 * that owns them, because the two surfaces are deliberately different: the landing is
 * dark-committed and the rest of the site is themed.
 */
export const TOKEN_NAMES = {
  /** apps/site/src/styles/landing.css — the root route, dark-committed, its own stylesheet. */
  landing: [
    '--ground', '--ground-deep', '--surface',
    '--ink', '--ink-bright', '--ink-2', '--muted', '--on-gradient',
    '--cyan', '--blue', '--blue-soft', '--btn-grad',
    '--line', '--line-2', '--line-3',
    '--font-display', '--font-sans', '--font-mono', '--stretch',
  ],
  /** apps/site/src/styles/global.css — every other route, light and dark. */
  site: [
    '--paper', '--paper-2', '--surface', '--surface-2',
    '--ink', '--ink-2', '--muted', '--faint',
    '--accent', '--accent-ink', '--accent-soft',
    '--line', '--line-strong', '--hairline',
    '--font-display', '--font-body', '--font-mono', '--stretch',
  ],
};

/**
 * The display face's width axis.
 *
 * Archivo is variable and the design sets `font-stretch: 118%`. At the default 100% the same markup
 * reads as an ordinary grotesque: the direction is simply gone, and nothing looks broken, which is
 * the only reason this needs asserting at all. A rule checking it must read the COMPUTED value from
 * a rendered page — the declaration is present in the stylesheet either way.
 */
export const DISPLAY_STRETCH = '118%';

/**
 * Families whose presence in a computed stack means the design has been lost.
 *
 * Fraunces is here because it was the display face until this vocabulary was written, and a
 * half-reverted migration would reintroduce it silently on seventeen routes. The landing suite
 * already fails on it by name; this extends that to every page check-pixels sweeps.
 */
/*[[ NOTHING READS THIS LIST, AND IF ANYTHING STARTED IT WOULD FAIL EVERY ROUTE ON THE SITE.
 *
 *   Found on 2026-09-21 while correcting APPROVED_FONT_STACKS above. `grep -rn RETIRED_FONT_FAMILIES`
 *   over scripts/, packages/ and apps/ returns exactly one hit: this line. It is exported and
 *   imported nowhere — check-pixels reads APPROVED_FONT_STACKS and TOKEN_PREFIXES and not this.
 *
 *   AND IT NAMES 'Inter', WHICH IS IN THE APPROVED STACK. global.css and landing.css both declare
 *     -apple-system, BlinkMacSystemFont, 'Inter', system-ui, 'Segoe UI', Roboto, …
 *   so the moment a checker starts reading this list and testing it against a computed stack, every
 *   page on the site is "a design that has been lost". The value is left exactly as it is rather
 *   than edited on a guess about what a future reader will want it to mean — but it is a trap with
 *   no tripwire, so it gets a note where the next person will meet it instead of a silent fix. ]]*/
export const RETIRED_FONT_FAMILIES = ['Fraunces', 'Inter', 'JetBrains Mono'];
