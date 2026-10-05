/**
 * FLAT SURFACES: no glass, no aurora, one set of sheets.
 *
 * The language is flat surfaces with hairline borders. Before M2 both apps had a frosted-glass layer
 * (blurred translucent panels over a drifting aurora) and each carried its own copy of the token
 * sheet. These tests hold what replaced them:
 *
 *   - no `backdrop-filter` with a real value, anywhere in either app;
 *   - no glass or aurora token, class, component or file;
 *   - the three duplicated sheets are deleted, and no sheet but tokens.css writes a colour on a theme root,
 *     in any nesting (@media, @layer, @supports), any selector spelling (`html.dark`, an unquoted
 *     `[data-theme=light]`) and any colour syntax (hex, rgb(), hsl(), oklch(), lab(), a named colour).
 *
 * Motion is deliberately NOT asserted here. The token file's easings never overshoot
 * (tokens.test.mjs holds that), but about twenty owner-picked interaction components still carry
 * their own spring curves; those are interactions, not the visual system, and they stay until the
 * app rebuild.
 *
 * Comments are stripped before anything is searched: the better a removal is documented, the more a
 * scanner that reads prose finds its own explanation and reports it as the defect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './css-tokens.mjs';
import { ROOT, readText, walkText } from './tests/repo-walk.mjs';
import { cssOf, flatRules, themeRootColours } from './tests/sheets.mjs';

const APPS = ['apps/site/src', 'apps/web/src'];
const FILES = walkText(APPS);
const code = (f) => stripComments(readText(f)).replace(/<!--[\s\S]*?-->/g, ' ').replace(/(^|[^:\w'"`])\/\/[^\n]*/g, '$1');
const isStyle = (f) => /\.(css|astro)$/.test(f.rel);

/**
 * A class that names the glass or aurora layer, as a whole word of its name: `.glass`, `.aurora--soft`,
 * `.hero-aura`, and a BEM element or modifier of any block, such as `.auth__aura`. (The first version
 * of this guard only knew the block form, so `.auth__aura`, a blurred drifting radial gradient, got
 * past it.) Words are split on `-` and `_`, so `.laura` and `.aurally` are not matches.
 */
const isLayerClass = (name) => /(?:^|[-_])studio-atmosphere(?:$|[-_])/.test(name) || name.toLowerCase().split(/[-_]+/).some((w) => w === 'glass' || w === 'aurora' || w === 'aura');

test('the walk found both apps', () => {
  assert.ok(FILES.length > 450, `only ${FILES.length} app files scanned; the walk has drifted`);
  assert.ok(FILES.some((f) => f.rel.startsWith('apps/site/')) && FILES.some((f) => f.rel.startsWith('apps/web/')), 'one app is missing from the walk');
});

test('no backdrop-filter has a value anywhere in either app', () => {
  const hits = [];
  for (const f of FILES) {
    for (const m of code(f).matchAll(/(?:-webkit-)?backdrop-filter\s*:\s*([^;}\n]+)/gi)) {
      if (m[1].trim().toLowerCase() !== 'none') hits.push(`${f.rel}: ${m[0].trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(hits, [], `frosted glass is back:\n  ${hits.join('\n  ')}`);
});

test('no glass or aurora token, class, component or file exists in either app', () => {
  const hits = [];
  for (const f of FILES) {
    if (/(^|\/)(glass|aurora|aura|studio-atmosphere)[^/]*$/i.test(f.rel)) hits.push(`${f.rel}: a glass or aurora file`);
    const src = code(f);
    for (const m of src.matchAll(/--(?:glass|aurora|aura)[a-z0-9-]*/gi)) hits.push(`${f.rel}: ${m[0]}`);
    if (isStyle(f)) for (const m of src.matchAll(/\.([a-z_][\w-]*)/gi)) if (isLayerClass(m[1])) hits.push(`${f.rel}: .${m[1]}`);
    for (const m of src.matchAll(/\b(?:StudioAtmosphere|Aura)\b|pk-glide--glass/g)) hits.push(`${f.rel}: ${m[0]}`);
  }
  assert.deepEqual([...new Set(hits)], [], `a glass or aurora layer is back:\n  ${[...new Set(hits)].join('\n  ')}`);
});

test('the three duplicated sheets are deleted and nothing names them', () => {
  for (const rel of ['apps/site/src/styles/studpilot-minimal.css', 'apps/web/src/design/studpilot-minimal.css', 'apps/web/src/design/glass.css']) {
    assert.ok(!existsSync(join(ROOT, rel)), `${rel} must stay deleted`);
  }
  const hits = FILES.filter((f) => /studpilot-minimal|design\/glass\.css/.test(readText(f))).map((f) => f.rel);
  assert.deepEqual(hits, [], `a file still names a deleted sheet:\n  ${hits.join('\n  ')}`);
});

test('no sheet but tokens.css writes a colour on a theme root, in any nesting, spelling or colour syntax', () => {
  const stray = [];
  let rulesRead = 0;
  for (const f of FILES.filter(isStyle)) {
    rulesRead += [...cssOf(f).matchAll(/[^{}]+\{[^{}]*\}/g)].length;
    for (const c of themeRootColours(cssOf(f))) stray.push(`${f.rel}: ${c.selector} { ${c.prop}: ${c.value} }`);
  }
  assert.ok(rulesRead > 3000, `only ${rulesRead} rules read; the parse has drifted`);
  assert.ok(flatRules(FILES.filter(isStyle).map((f) => ({ ...f, css: cssOf(f) }))).some((r) => r.selector === ':root'), 'no :root rule was found at all; the selector match is blind');
  assert.deepEqual(stray, [], `a colour is written on a theme root outside tokens.css:\n  ${stray.join('\n  ')}`);
});

test('the guard has teeth: every blind spot of the first version is seen, and a component scope is not', () => {
  const found = (css) => themeRootColours(css).map((c) => `${c.selector} ${c.prop}`);
  for (const [css, what] of [
    ['@media (prefers-color-scheme: dark) { :root { --paper: #000; } }', 'a colour inside @media'],
    ["@layer base { :root[data-theme='light'] { --x: oklch(0.7 0.1 250); } }", 'a colour inside @layer'],
    ['@supports (color: oklch(0 0 0)) { @media (min-width: 1px) { :root { --x: oklch(1 0 0); } } }', 'a colour two at-rules deep'],
    ['html.dark { --surface: lab(10 0 0); }', 'html.dark and lab()'],
    [':root.light { --surface: lch(90 5 250); }', ':root.light and lch()'],
    ['[data-theme=light] { --ink: rgb(0 0 0); }', 'an unquoted [data-theme=light] and rgb()'],
    ['html[data-theme=dark] { --a: hsl(0 0% 10%); }', 'an unquoted attribute on html and hsl()'],
    [":root:not([data-theme='light']) { --paper: #111; }", 'a guarded dark default'],
    ['html { --accent: rebeccapurple; }', 'a named colour'],
    [':root { --muted: color-mix(in srgb, white 50%, black); }', 'color-mix of named colours'],
    ['html { background: #fff; }', 'a hex background written straight on html'],
    [':root { --x: var(--y, red); }', 'a named colour as a var() fallback'],
  ]) assert.ok(found(css).length >= 1, `not seen: ${what}`);
  for (const [css, what] of [
    [":root { --content: 1120px; --font: 'Red Hat Display', sans-serif; --e: cubic-bezier(.16,1,.3,1); color-scheme: dark light; }", 'layout, type and motion tokens'],
    ['html { background: var(--paper); color: var(--ink); } body { color: var(--ink); }', 'tokens spent on the root'],
    ['.card { --x: #fff; } html .card { --x: red; } [data-theme=light] .card { --y: rgb(0 0 0); }', 'a component scoping its own value'],
    ["@font-face { font-family: X; src: url('data:font/woff2;base64,AAAA'); }", 'an at-rule'],
  ]) assert.deepEqual(found(css), [], `reported as a root colour: ${what}`);
});

test('the guard has teeth: the glass and aurora class names it must catch, including the one that got past it', () => {
  for (const name of ['glass', 'aurora', 'aura', 'auth__aura', 'hero-aurora', 'aura--soft', 'card__glass', 'studio-atmosphere', 'is-glass']) {
    assert.ok(isLayerClass(name), `.${name} is not recognised as a glass or aurora class`);
  }
  for (const name of ['laura', 'aurally', 'auth__atmosphere', 'glassware', 'btn-primary', 'auth__grid']) {
    assert.equal(isLayerClass(name), false, `.${name} was reported as a glass or aurora class`);
  }
});
