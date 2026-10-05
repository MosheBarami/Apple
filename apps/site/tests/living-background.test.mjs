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
import { OLD_ACCENT_LITERALS, declarations, readTokensCss, topLevelRules } from '@studpilot/design/css-tokens';
import accents from '@studpilot/design/accents.json' with { type: 'json' };

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFileSync(join(SITE, ...parts), 'utf8');
const page = read('src', 'pages', 'index.astro');
const base = read('src', 'layouts', 'Base.astro');
const landing = read('src', 'layouts', 'Landing.astro');

const withoutComments = (source) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('the public layouts load the shared design tokens and do not import the retired relaunch layer', () => {
  for (const [name, source] of [['Base.astro', base], ['Landing.astro', landing]]) {
    assert.match(source, /import\s+['"]@studpilot\/design\/tokens\.css['"]/,
      `${name} does not load the shared design tokens`);
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
test('the composer is a flat panel on the shared radius, and no site sheet declares a design token of its own', () => {
  const landingCss = withoutComments(read('src', 'styles', 'landing.css'));
  const composer = /\.composer\s*\{([^}]*)\}/.exec(landingCss);
  assert.ok(composer, 'landing.css has no .composer rule');
  assert.match(composer[1], /border-radius:\s*var\(--r-xl\)/,
    'the product composer is no longer the --r-xl focal surface');
  assert.match(composer[1], /background:\s*var\(--surface\)/, 'the composer is not a --surface panel');
  assert.doesNotMatch(composer[1], /backdrop-filter|box-shadow/, 'the composer is frosted or casts a shadow; surfaces here are flat');

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
//   The old version required the hexes #7657ff and #4f7cff and a gradient-plus-glow rule — the
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
  const typed = [...OLD_ACCENT_LITERALS, ...accents.candidates.flatMap((c) => [c.dark.accent, c.dark['accent-strong'], c.light.accent, c.light['accent-strong']])];
  const src = withoutComments(page).toLowerCase();
  const hit = typed.filter((v) => src.includes(v.toLowerCase()));
  assert.deepEqual(hit, [], 'an accent colour was hard-coded into page markup; use var(--accent)');
});
