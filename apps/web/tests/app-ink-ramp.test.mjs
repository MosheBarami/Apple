/**
 * THE APP'S THREE INKS ARE LEGIBLE ON EVERY SURFACE THEY SIT ON, IN BOTH THEMES.
 *
 * design/apple-minimal.css is the stylesheet that decides the product's colours — it loads last
 * and wins every tie — and until this file no test read it. Its --faint was #70737d (dark) and
 * #818791 (light): 4.44:1 on the dark page, 3.95:1 on the raised surface, 3.38:1 on the light
 * page. That token carries real text — the time under every turn, a code block's language, the
 * Edit control on your own message — and text needs 4.5:1.
 *
 * The public site had already raised it (apps/site/src/styles/apple-minimal.css, with the same
 * measurement written down). The product and the site are meant to be one product with one set of
 * tokens, so the app now uses the site's value, and this test holds both halves: every ink clears
 * 4.5:1 on paper and on every surface, and the ramp still descends — faint stays dimmer than
 * muted, or the hierarchy the three steps exist for has collapsed.
 *
 * Values are read out of the stylesheet, per theme block, never restated here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(WEB, 'src', 'design', 'apple-minimal.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** The declarations inside the first rule whose selector is exactly `selector`. */
function block(selector) {
  const at = CSS.search(new RegExp(`(^|\\})\\s*${selector.replace(/[[\]'()]/g, '\\$&')}\\s*\\{`));
  assert.notEqual(at, -1, `no ${selector} block in apple-minimal.css`);
  const open = CSS.indexOf('{', at + 1);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
}

function tokens(selector) {
  const out = {};
  for (const [, name, value] of block(selector).matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) out[name] = value;
  return out;
}

function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const THEMES = [
  ['dark', ':root'],
  ['light', ":root[data-theme='light']"],
];
const INKS = ['ink', 'muted', 'faint'];
const GROUNDS = ['paper', 'surface', 'surface-2', 'surface-3'];

test('the ramp is read out of the stylesheet, in both themes', () => {
  for (const [theme, selector] of THEMES) {
    const t = tokens(selector);
    for (const name of [...INKS, ...GROUNDS]) assert.ok(t[name], `${theme}: --${name} was not found`);
  }
});

test('every ink clears 4.5:1 on paper and on every surface, in both themes', () => {
  for (const [theme, selector] of THEMES) {
    const t = tokens(selector);
    for (const ink of INKS) {
      for (const ground of GROUNDS) {
        const ratio = contrast(t[ink], t[ground]);
        assert.ok(ratio >= 4.5, `${theme}: --${ink} ${t[ink]} on --${ground} ${t[ground]} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
      }
    }
  }
});

test('the ramp still descends: ink, then muted, then faint', () => {
  for (const [theme, selector] of THEMES) {
    const t = tokens(selector);
    const on = (ink) => contrast(t[ink], t.paper);
    assert.ok(on('ink') > on('muted'), `${theme}: --muted is no dimmer than --ink`);
    assert.ok(on('muted') > on('faint'), `${theme}: --faint is no dimmer than --muted; the hierarchy has collapsed`);
  }
});

test('the app and the public site use one --faint', () => {
  const site = join(WEB, '..', 'site', 'src', 'styles', 'apple-minimal.css');
  if (!existsSync(site)) return; // the site is a sibling package; its absence is not this app's failure
  const SITE = readFileSync(site, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const siteFaint = [...SITE.matchAll(/--faint:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase());
  assert.ok(siteFaint.length >= 2, 'the site stylesheet declares no --faint pair — has it moved?');
  for (const [theme, selector] of THEMES) {
    assert.ok(siteFaint.includes(tokens(selector).faint.toLowerCase()), `${theme}: the app's --faint is not one the site uses`);
  }
});
