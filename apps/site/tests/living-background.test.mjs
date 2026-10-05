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
import { OLD_ACCENT_HEX, declarations, listedColoursIn, readTokensCss, topLevelRules } from '@studpilot/design/css-tokens';
import accents from '@studpilot/design/accents.json' with { type: 'json' };

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFileSync(join(SITE, ...parts), 'utf8');
const page = read('src', 'pages', 'index.astro');
const base = read('src', 'layouts', 'Base.astro');
const slot = read('src', 'components', 'ScreenSlot.astro');

const withoutComments = (source) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// RESTATED 2026-10-05 (M2 rebuild): there is one layout now (Landing.astro was deleted); DocsLayout and LegalLayout sit on Base.
test('the public layout loads the shared design tokens and does not import the retired relaunch layer', () => {
  for (const [name, source] of [['Base.astro', base]]) {
    assert.match(source, /import\s+['"]@studpilot\/design\/tokens\.css['"]/,
      `${name} does not load the shared design tokens`);
    assert.doesNotMatch(source, /styles\/relaunch\.css/,
      `${name} still imports the retired relaunch treatment`);
  }
});

test('no rendered public layout mounts Horizon or FlowField', () => {
  for (const [name, source] of [
    ['Base.astro', withoutComments(base)],
    ['index.astro', withoutComments(page)],
  ]) {
    assert.doesNotMatch(source, /import\s+(?:Horizon|FlowField)\b|<(?:Horizon|FlowField)\b/,
      `${name} mounts the retired cinematic canvas layer`);
  }
});

// RESTATED 2026-10-05 (M2 rebuild). The hero used to be a real composer (a form, a textarea and a submit), which was the product UI it
// showed. The rebuilt hero shows the promise and a fixed-size slot for a real screenshot (components/ScreenSlot.astro). The property
// is the same: the hero holds content and product UI only, and no scenery, canvas or ambient layer.
test('the hero is content and product UI rather than a decorative scene', () => {
  const source = withoutComments(page);
  const start = source.indexOf('<section class="hero"');
  const end = source.indexOf('</section>', start);
  assert.ok(start >= 0 && end > start, 'the landing hero could not be found');
  const hero = source.slice(start, end + 10);

  assert.match(hero, /<h1\b/, 'the hero lost its headline');
  assert.match(hero, /href="\/app\/signup"/, 'the hero lost its primary action into the product');
  assert.match(hero, /<ScreenSlot\b/, 'the hero lost the slot for a real product screenshot');
  assert.doesNotMatch(hero, /\b(?:atmosphere|light-column|sky|strata|stratum|ridge|aura|noise)\b|<canvas\b|<video\b/i,
    'the hero has regained a cinematic scenery layer');
});

//[[ RESTATED 2026-10-05 (M2 step 2.1): THE PALETTE IS THE TOKEN FILE'S, AND THAT IS THE PROPERTY.
//
//   This compared the site's token sheet with the app's, token by token, in both themes, because the
//   two apps each carried a copy. There is one copy now: both import
//   packages/design/src/web/tokens.css, and packages/design/src/web/tokens.test.mjs holds that both
//   do. The relation "the two never drift" is therefore true by construction, and what is left to
//   assert on the site is the other half of the old test, the composer contract: the focal object
//   is a flat panel on the shared radius, with no frosted blur.
//
//   It also held the site's own sheets to declaring no colour token of their own, which is what lets
//   the one file stay the one file. ]]
// RESTATED 2026-10-05 (M2 rebuild): the composer is deleted. The focal object of the rebuilt front page is the screenshot slot, so the
// flat-panel contract is held there: a --surface panel on the shared radius, no frosted blur and no shadow.
test('the screenshot slot is a flat panel on the shared radius, and no site sheet declares a design token of its own', () => {
  const slotCss = withoutComments(slot.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '');
  // The panel is the frame around the picture (`.slot__frame`); the figure itself only carries the caption under it.
  const panel = /\.slot__frame\s*\{([^}]*)\}/.exec(slotCss);
  assert.ok(panel, 'ScreenSlot.astro has no .slot__frame rule');
  assert.match(panel[1], /border-radius:\s*var\(--r-lg\)/, 'the slot is no longer on the shared --r-lg radius');
  assert.match(panel[1], /background:\s*var\(--surface\)/, 'the slot is not a --surface panel');
  assert.doesNotMatch(panel[1], /backdrop-filter|box-shadow/, 'the slot is frosted or casts a shadow; surfaces here are flat');

  // A site sheet that re-declares a token the file owns is the second copy the old test existed to catch.
  const owned = new Set(topLevelRules(readTokensCss()).flatMap((r) => declarations(r.body).map((d) => d.name)));
  const redeclared = [];
  for (const [file, css] of siteStyles()) {
    for (const m of withoutComments(css).matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
      if (owned.has(m[1])) redeclared.push(`${file.replace(SITE, '')}: ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(redeclared)], [], `these tokens belong to tokens.css:\n  ${[...new Set(redeclared)].join('\n  ')}`);
});

//[[ RESTATED 2026-10-05: THE ACCENT IS VIOLET NOW, AND IT IS A TOKEN. (The note below is the 2026-09-22
//   restatement, kept because its other two properties, no gradient and no glow, still hold.)
//
//   RESTATED 2026-09-22: VIOLET ONLY WHEN AUTONOMOUS IS ON, AND NO GLOW ANYWHERE.
//
//   The old version required two literal hexes (a violet and a blue; the retired-accent guard in
//   packages/design/src/web/tokens.test.mjs bans them, so they are not typed here) and a gradient-plus-glow rule — the
//   exact treatment the owner rejected ("blue for ordinary active state, violet ONLY when Autonomous
//   is active"). The property is now asserted over every stylesheet and component style the site
//   ships: a rule that spends a violet token must be the active Autonomous state, no rule paints a
//   gradient background or a coloured glow, and no page types a violet hex into its markup.
//
//   RESTATED AGAIN for V3 gate G01: the customer picks no mode, so the site depicts no Autonomous
//   toggle and no rule may spend violet at all. The violet tokens are gone from both palettes. ]]
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

test('no rule spends the violet tokens, and nothing glows or grades', () => {
  const sheets = siteStyles();
  assert.ok(sheets.length >= 8, `only ${sheets.length} style sources found — the walk has drifted`);
  const wrong = [];
  for (const [file, css] of sheets) {
    for (const { selector, body } of rules(css)) {
      if (/var\(--autonomous/.test(body)) wrong.push(`${file.replace(SITE, '')}: ${selector.slice(0, 80)}`);
      if (/background(?:-image)?\s*:[^;]*gradient\(/.test(body)) wrong.push(`${file.replace(SITE, '')}: gradient background on ${selector.slice(0, 60)}`);
      if (/box-shadow\s*:\s*0\s+0\s+\d+px\s+(?:rgba?\(|var\(--(?:accent|autonomous))/.test(body)) wrong.push(`${file.replace(SITE, '')}: coloured glow on ${selector.slice(0, 60)}`);
    }
  }
  assert.deepEqual(wrong, [], `violet spent, or a gradient/glow:\n  ${wrong.join('\n  ')}`);

  const tokens = withoutComments(readTokensCss());
  // The Autonomous violet left with the Autonomous switch (V3 G01): no mode token is declared.
  assert.doesNotMatch(tokens, /--autonomous/i, 'a mode token outlived the Autonomous switch');
  // The accent is violet now, and it is ONE token: no page types an accent colour into its markup,
  // whether it is a retired accent or a value of any candidate in accents.json.
  // As COLOURS, in any syntax (RESTATED 2026-10-05: the first version looked for the hex spelling, so `rgba(166,124,255,.2)` passed).
  const typed = [...OLD_ACCENT_HEX, ...accents.candidates.flatMap((c) => [c.dark.accent, c.dark['accent-strong'], c.light.accent, c.light['accent-strong']])];
  const hit = listedColoursIn(withoutComments(page), typed);
  assert.deepEqual(hit, [], 'an accent colour was hard-coded into page markup (in some colour syntax); use var(--accent)');
});
