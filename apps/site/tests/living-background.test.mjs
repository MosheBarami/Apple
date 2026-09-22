/**
 * The public site deliberately has no ambient hero scene anymore. This guard keeps the redesign
 * structural: a future stylesheet cannot make the old Horizon/FlowField stack visible because the
 * layouts do not mount it, and the hero itself contains only product/content UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFileSync(join(SITE, ...parts), 'utf8');
const page = read('src', 'pages', 'index.astro');
const base = read('src', 'layouts', 'Base.astro');
const landing = read('src', 'layouts', 'Landing.astro');
const minimal = read('src', 'styles', 'apple-minimal.css');

const withoutComments = (source) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('the public layouts use the minimal surface and do not import the retired relaunch layer', () => {
  for (const [name, source] of [['Base.astro', base], ['Landing.astro', landing]]) {
    assert.match(source, /styles\/apple-minimal\.css/,
      `${name} does not load the shared minimal visual system`);
    assert.doesNotMatch(source, /styles\/relaunch\.css/,
      `${name} still imports the retired relaunch treatment`);
  }
});

test('no rendered public layout mounts Horizon or FlowField', () => {
  for (const [name, source] of [
    ['Base.astro', withoutComments(base)],
    ['Landing.astro', withoutComments(landing)],
    ['index.astro', withoutComments(page)],
  ]) {
    assert.doesNotMatch(source, /import\s+(?:Horizon|FlowField)\b|<(?:Horizon|FlowField)\b/,
      `${name} mounts the retired cinematic canvas layer`);
  }
});

test('the hero is product UI rather than a decorative scene', () => {
  const source = withoutComments(page);
  const start = source.indexOf('<section class="hero"');
  const end = source.indexOf('</section>', start);
  assert.ok(start >= 0 && end > start, 'the landing hero could not be found');
  const hero = source.slice(start, end + 10);

  assert.match(hero, /<form\s+class="composer"/,
    'the hero lost the real composer that is its primary interaction');
  assert.match(hero, /<textarea\b[^>]*class="composer-input"/s,
    'the composer is no longer an operable text field');
  assert.match(hero, /<button\s+class="composer-send"\s+type="submit">/,
    'the composer no longer has a real submit action');
  assert.doesNotMatch(hero, /\b(?:atmosphere|light-column|sky|strata|stratum|ridge)\b/,
    'the hero has regained a cinematic scenery layer');
});

//[[ RESTATED 2026-09-22: THE PALETTE IS THE APP'S, AND THAT IS NOW THE PROPERTY.
//
//   This pinned four literal hexes (#0a0a0a, #2e2e2e, #fafafa, #a6a6a6) and a `border-radius: 24px
//   !important` on the composer. The redesign made the site's tokens the authenticated app's tokens
//   and removed every `!important` the cascade no longer needs, so the old spelling went red while
//   the code got better. The owner's rule is "the public site and the SaaS look like ONE product",
//   so the check now reads BOTH token files and compares them, in both themes. A literal here would
//   only say "do not change this"; the relation says "do not let the two drift".
//
//   --faint is the one declared exception, and it is exempt in one direction only: the app's value
//   is below 4.5:1 on its own raised surfaces, and the site raises it (tests/contrast.test.mjs
//   holds the site's value to 4.5:1 on every surface). ]]
const APP = readFileSync(join(SITE, '..', 'web', 'src', 'design', 'apple-minimal.css'), 'utf8');
const SHARED_TOKENS = [
  'paper', 'paper-2', 'surface', 'surface-2', 'surface-3', 'ink', 'muted', 'line', 'line-strong',
  'accent', 'accent-soft', 'accent-ring', 'autonomous', 'autonomous-soft', 'autonomous-ring',
];
const RADII = ['r-xs', 'r-sm', 'r-md', 'r-lg', 'r-xl'];

/** The declarations of the first block whose selector matches, comments stripped. */
function block(css, selector) {
  const src = withoutComments(css);
  const m = selector.exec(src);
  if (!m) return null;
  const open = src.indexOf('{', m.index);
  const close = src.indexOf('}', open);
  return Object.fromEntries([...src.slice(open + 1, close).matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)]
    .map((d) => [d[1], d[2].trim().toLowerCase().replace(/\s+/g, '')]));
}

/** `#000` and `#000000`, `.10` and `0.1`, are the same colour; compare the colour, not the spelling. */
const norm = (v) => {
  const hex = /^#([0-9a-f]{3})$/i.exec(v);
  if (hex) return `#${[...hex[1]].map((c) => c + c).join('')}`;
  const fn = /^(rgba?)\(([^)]*)\)$/i.exec(v);
  if (fn) return `${fn[1]}(${fn[2].split(',').map((n) => String(Number(n))).join(',')})`;
  return v.toLowerCase();
};

test('the minimal palette and composer contract are explicit', () => {
  const themes = [
    ['dark', block(minimal, /:root,\s*:root\[data-theme='dark'\]\s*\{/), block(APP, /:root\s*\{/)],
    ['light', block(minimal, /:root\[data-theme='light'\]\s*\{/), block(APP, /:root\[data-theme='light'\]\s*\{/)],
  ];
  let compared = 0;
  for (const [theme, site, app] of themes) {
    assert.ok(site && app, `${theme}: a theme block was not found in one of the two token files`);
    for (const token of SHARED_TOKENS) {
      assert.ok(app[token], `${theme}: the app no longer declares --${token}; re-derive the shared list`);
      assert.equal(norm(site[token] ?? ''), norm(app[token]),
        `${theme}: the site's --${token} is ${site[token]} and the app's is ${app[token]} — two products again`);
      compared += 1;
    }
  }
  const siteRoot = Object.assign({}, ...[...withoutComments(minimal).matchAll(/:root\s*\{([^}]*)\}/g)]
    .map((m) => Object.fromEntries([...m[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]))));
  const appRoot = block(APP, /:root\s*\{/);
  for (const r of RADII) {
    assert.equal(siteRoot[r], appRoot[r], `--${r} is ${siteRoot[r]} on the site and ${appRoot[r]} in the app`);
    compared += 1;
  }
  assert.ok(compared >= 30, `only ${compared} token pairs were compared — the extraction has gone blind`);

  const landingCss = withoutComments(read('src', 'styles', 'landing.css'));
  const composer = /\.composer\s*\{([^}]*)\}/.exec(landingCss);
  assert.ok(composer, 'landing.css has no .composer rule');
  assert.match(composer[1], /border-radius:\s*var\(--r-xl\)/,
    'the product composer is no longer the 24px (--r-xl) focal surface');
  assert.match(composer[1], /backdrop-filter:\s*blur\(24px\)/,
    'the composer lost the restrained 24px blur the app composer uses');
});

//[[ RESTATED 2026-09-22: VIOLET ONLY WHEN AUTONOMOUS IS ON, AND NO GLOW ANYWHERE.
//
//   The old version required the hexes #7657ff and #4f7cff and a gradient-plus-glow rule — the
//   exact treatment the owner rejected ("blue for ordinary active state, violet ONLY when Autonomous
//   is active"). The property is now asserted over every stylesheet and component style the site
//   ships: a rule that spends a violet token must be the active Autonomous state, no rule paints a
//   gradient background or a coloured glow, and no page types a violet hex into its markup. ]]
function siteStyles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) out.push([p, readFileSync(p, 'utf8')]);
      else if (e.name.endsWith('.astro')) {
        for (const m of readFileSync(p, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) out.push([p, m[1]]);
      }
    }
  };
  walk(join(SITE, 'src'));
  return out;
}

/** Top-level-ish rules: selector and body, with at-rule wrappers flattened. */
const rules = (css) => [...withoutComments(css).replace(/@media[^{]*\{/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ selector: m[1].trim(), body: m[2] }));

test('purple and blue are reserved for Autonomous state selectors', () => {
  const sheets = siteStyles();
  assert.ok(sheets.length >= 8, `only ${sheets.length} style sources found — the walk has drifted`);
  let violetRules = 0;
  const wrong = [];
  for (const [file, css] of sheets) {
    for (const { selector, body } of rules(css)) {
      if (/var\(--autonomous/.test(body)) {
        violetRules += 1;
        const everyPart = selector.split(',').every((part) => /\[data-mode='autonomous'\]\[aria-pressed='true'\]/.test(part));
        if (!everyPart) wrong.push(`${file.replace(SITE, '')}: ${selector.slice(0, 80)}`);
      }
      if (/background(?:-image)?\s*:[^;]*gradient\(/.test(body)) wrong.push(`${file.replace(SITE, '')}: gradient background on ${selector.slice(0, 60)}`);
      if (/box-shadow\s*:\s*0\s+0\s+\d+px\s+(?:rgba?\(|var\(--(?:accent|autonomous))/.test(body)) wrong.push(`${file.replace(SITE, '')}: coloured glow on ${selector.slice(0, 60)}`);
    }
  }
  assert.ok(violetRules >= 1, 'no rule spends a violet token — the Autonomous state has no picture and this check is vacuous');
  assert.deepEqual(wrong, [], `violet outside an active Autonomous state, or a gradient/glow:\n  ${wrong.join('\n  ')}`);

  const tokens = withoutComments(minimal);
  assert.match(tokens, /--autonomous:\s*#8b5cf6;/i, 'the dark Autonomous violet is not the app value');
  assert.match(tokens, /--accent:\s*#5b7cfa;/i, 'the dark accent is not the app blue');
  assert.doesNotMatch(withoutComments(page), /#8b5cf6|#7550de|#7657ff|#4f7cff/i,
    'an Autonomous colour was hard-coded into page markup instead of being state-driven');
  assert.match(withoutComments(page), /data-mode="autonomous"[^>]*aria-pressed="false"/,
    'the landing no longer depicts the Autonomous toggle, or depicts it switched ON at rest');
});
