// TWO DEFECTS, ONE SUBJECT: the theme a visitor chose, and the colour the browser paints above it.
//
// 1. apps/site/src/layouts/Landing.astro — index.astro's sole layout — shipped no <html data-theme>,
//    no pre-paint script and no toggle, and landing.css declared one ramp. Choosing light on
//    /pricing and clicking the wordmark landed on a dark homepage with no control to change it.
// 2. Both layouts hardcoded `theme-color` to #080808, a black retired when the ramp went warm, and
//    the toggle never touched it: on a phone the address-bar band was a cooler black than the
//    #141312 page below it, and in light mode it stayed near-black over an almost-white page.
//    site.webmanifest carried a third stale black, #080a0f.
//
// These are source-shape assertions. The rendered proof — computed body background, the meta's
// content and the measured contrast of fifteen text roles in both themes — was taken in a browser
// against the built output; this guard is what stops any of it regressing silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const landing = read('../src/layouts/Landing.astro');
const base = read('../src/layouts/Base.astro');
const landingCss = read('../src/styles/landing.css');
const globalCss = read('../src/styles/global.css');
// THE ONE TOKEN SOURCE. Since the 2026-09-22 redesign every colour token lives in apple-minimal.css,
// which both layouts import first; landing.css and global.css are structure only.
const tokenCss = read('../src/styles/apple-minimal.css');
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const manifest = JSON.parse(read('../public/site.webmanifest'));

const LAYOUTS = { 'Landing.astro': landing, 'Base.astro': base };

for (const [name, src] of Object.entries(LAYOUTS)) {
  test(`${name} no longer hardcodes the retired #080808 as theme-color`, () => {
    assert.doesNotMatch(src, /theme-color[^>]*#080808/i);
    assert.doesNotMatch(src, /content="#080808"/i);
  });

  test(`${name} gives the theme-color meta an id so the theme script can repaint it`, () => {
    assert.match(src, /<meta name="theme-color" id="theme-color"/);
  });

  test(`${name} reads the band colour from the stylesheet rather than restating it`, () => {
    assert.match(src, /getPropertyValue\('--theme-color'\)/);
  });
}

test('Landing applies a stored theme before first paint, like Base does', () => {
  assert.match(landing, /<html lang="en"[^>]*data-theme="dark"/);
  assert.match(landing, /localStorage\.getItem\('apple-theme'\)/);
  assert.match(landing, /setAttribute\('data-theme'/);
});

//[[ RESTATED 2026-09-22. The landing no longer carries its own header; it renders the shared
//   <Nav />, which is where every route's toggle button lives. The property is unchanged — the front
//   page has a working toggle — so it is asserted where the button now is: index.astro renders Nav
//   (or a button of its own), and Nav carries the button the layout's handler listens for. ]]
test('Landing ships a toggle handler, and index.astro ships a button for it', () => {
  assert.match(landing, /\[data-theme-toggle\]/);
  assert.match(landing, /localStorage\.setItem\('apple-theme'/);
  const index = read('../src/pages/index.astro');
  const nav = read('../src/components/Nav.astro');
  const rendersNav = /import Nav from '\.\.\/components\/Nav\.astro'/.test(index) && /<Nav\s*\/>/.test(index);
  assert.ok(/data-theme-toggle/.test(index) || (rendersNav && /<button[^>]*data-theme-toggle/.test(nav)),
    'the landing renders no theme toggle — neither its own button nor the shared Nav with one');
});

test('an Astro expression never sits between <!doctype> and <html>', () => {
  // This is not style. One was written there and Astro stopped emitting <html> and <head> at all,
  // so data-theme was absent at runtime while the source read correctly — a fix that looked done
  // and was not. Caught by measuring the rendered page, and kept caught here.
  for (const [name, src] of Object.entries(LAYOUTS)) {
    const between = src.slice(src.toLowerCase().indexOf('<!doctype'), src.indexOf('<html'));
    assert.doesNotMatch(between, /\{/, `${name}: an expression between doctype and <html>`);
  }
});

//[[ RESTATED 2026-09-22. The property is "the front page has a light ramp, not one ramp". The
//   ramp moved out of landing.css into apple-minimal.css — the one token source both layouts load —
//   so it is checked there, and landing.css is now held to declaring no colour token at all, which
//   is the stronger half: a second ramp in a structure sheet is how the site ended up with 117
//   `!important`s fighting over whose value wins. ]]
test('landing.css has a light ramp, not one ramp', () => {
  const css = noComments(tokenCss);
  assert.match(css, /:root\[data-theme='light'\]\s*\{/);
  const at = css.search(/:root\[data-theme='light'\]\s*\{/);
  assert.notEqual(at, -1);
  const light = css.slice(at, css.indexOf('}', at));
  for (const token of ['--paper', '--ink', '--muted', '--accent', '--composer-fill', '--theme-color']) {
    assert.match(light, new RegExp(`${token}:`), `light ramp is missing ${token}`);
  }
  for (const [name, sheet] of [['landing.css', landingCss], ['global.css', globalCss]]) {
    const declared = [...noComments(sheet).matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\()/gi)].map((m) => m[1]);
    assert.deepEqual(declared, [], `${name} declares colour tokens of its own — the ramp has two homes again`);
  }
});

//[[ RE-AIMED, NOT RELAXED, AND THE OLD SPELLING IS WHY.
//
//   This asserted four literal hexes — #141312, #f4f3f2, #f5f5f5, #141312. Every one of them was
//   the RIGHT value on the day it was written and none of them was the point. The point is stated
//   in this test's own name and again in landing.css: the browser's address-bar band is part of
//   the page, and it must not be a different colour from the page under it. A literal hex cannot
//   express that; it only says "do not change this", and on the day the palette was deliberately
//   rebuilt against rosebud.ai it failed for the one reason that is never interesting.
//
//   What is asserted now is the RELATION: in every theme block of both stylesheets, --theme-color
//   and --ground resolve to the same colour. That is strictly stronger than the old rule — it
//   caught nothing about agreement before, only about identity with a remembered constant — and it
//   survives any future repaint, which the old one provably did not.
// Aimed at the one token source since 2026-09-22 (see above). The dark block is the combined
// `:root, :root[data-theme='dark']` selector; the light block is `:root[data-theme='light']`.
const THEME_BLOCKS = [
  { name: "apple-minimal.css :root, [data-theme='dark']", css: () => noComments(tokenCss), selector: /:root,\s*:root\[data-theme='dark'\]\s*\{/ },
  { name: "apple-minimal.css :root[data-theme='light']", css: () => noComments(tokenCss), selector: /:root\[data-theme='light'\]\s*\{/ },
];

/** The declaration block that starts at `selector`, brace-balanced. */
function blockFor(css, selector) {
  const at = css.search(selector);
  if (at === -1) return null;
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (!depth) return css.slice(open + 1, i); }
  }
  return null;
}

const declared = (block, token) => {
  const m = new RegExp(`(?:^|[;{\\s])${token}\\s*:\\s*([^;}]+)`).exec(block);
  return m ? m[1].trim() : null;
};

test('the address bar cannot disagree with the page, in any theme of either stylesheet', () => {
  let checked = 0;
  for (const { name, css, selector } of THEME_BLOCKS) {
    const block = blockFor(css(), selector);
    if (!block) continue;                       // a stylesheet need not declare every theme
    // The two stylesheets name their base surface differently and both names are correct in their
    // own file: landing.css calls it --ground, global.css calls it --paper. The RELATION is what is
    // under test, so the guard asks for whichever one the block declares rather than insisting on a
    // shared spelling — and fails loudly if a block declares a band with no surface at all.
    const ground = declared(block, '--ground') ?? declared(block, '--paper');
    const band = declared(block, '--theme-color');
    if (ground === null && band === null) continue;
    assert.ok(ground, `${name} sets --theme-color with no base surface (--ground or --paper) to agree with`);
    assert.ok(band, `${name} declares a --ground and no --theme-color, so the band falls back to another theme's colour`);
    assert.equal(band.toLowerCase(), ground.toLowerCase(),
      `${name}: the address bar is ${band} over a ${ground} page — a visible seam across the top of every route`);
    checked += 1;
  }
  assert.ok(checked >= 2,
    `only ${checked} theme block(s) were checked; the selectors have drifted from the stylesheets and `
    + 'this guard would pass over a mismatch it can no longer see');
});

//[[ RESTATED 2026-09-22 FROM A LITERAL TO THE RELATION. It pinned #141312, the retired warm
//   ground, so the redesign to #000 turned it red for the one reason that is never interesting. The
//   property is in its own name: the manifest carries the page's ground, not a third black nobody
//   maintains. So it is compared with the default (dark) --paper read from the token sheet. ]]
test('the manifest no longer carries a third black nobody maintains', () => {
  const dark = blockFor(noComments(tokenCss), /:root,\s*:root\[data-theme='dark'\]\s*\{/);
  assert.ok(dark, 'the default theme block was not found in apple-minimal.css');
  const paper = declared(dark, '--paper');
  assert.ok(paper, 'the default theme declares no --paper to compare the manifest with');
  assert.equal(manifest.theme_color.toLowerCase(), paper.toLowerCase());
  assert.equal(manifest.background_color.toLowerCase(), paper.toLowerCase());
});

// ---------------------------------------------------------------------------
// The guard can fail.
// ---------------------------------------------------------------------------
test('the guard rejects the layout head that shipped', () => {
  const shipped = '<meta name="theme-color" content="#080808" />';
  assert.match(shipped, /theme-color[^>]*#080808/i);
  assert.doesNotMatch(shipped, /<meta name="theme-color" id="theme-color"/);
});

test('the guard rejects a Landing with no theme machinery', () => {
  const shipped = '<!doctype html>\n<html lang="en">\n  <head></head><body><slot /></body>\n</html>';
  assert.doesNotMatch(shipped, /data-theme="dark"/);
  assert.doesNotMatch(shipped, /\[data-theme-toggle\]/);
});
