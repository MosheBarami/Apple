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

test('Landing ships a toggle handler, and index.astro ships a button for it', () => {
  assert.match(landing, /\[data-theme-toggle\]/);
  assert.match(landing, /localStorage\.setItem\('apple-theme'/);
  assert.match(read('../src/pages/index.astro'), /data-theme-toggle/);
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

test('landing.css has a light ramp, not one ramp', () => {
  assert.match(landingCss, /:root\[data-theme='light'\]\s*\{/);
  // the three tokens whose light values were measured for contrast, not guessed
  // Match the RULE, not the prose above it: the comment explaining this block names the selector
  // too, and slicing from the first mention read the comment instead of the declarations.
  const at = landingCss.search(/:root\[data-theme='light'\]\s*\{/);
  assert.notEqual(at, -1);
  const light = landingCss.slice(at, landingCss.indexOf('\n}', at));
  for (const token of ['--ground', '--ink', '--muted', '--accent', '--composer-fill', '--theme-color']) {
    assert.match(light, new RegExp(`${token}:`), `light ramp is missing ${token}`);
  }
});

test('both stylesheets define --theme-color for every theme they define', () => {
  assert.match(landingCss, /--theme-color: #141312/);
  assert.match(landingCss, /--theme-color: #f4f3f2/);
  assert.match(globalCss, /--theme-color: #f5f5f5/);
  assert.match(globalCss, /--theme-color: #141312/);
});

test('the manifest no longer carries a third black nobody maintains', () => {
  assert.equal(manifest.theme_color, '#141312');
  assert.equal(manifest.background_color, '#141312');
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
