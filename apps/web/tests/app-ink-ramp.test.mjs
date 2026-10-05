/**
 * THE APP'S THREE INKS ARE LEGIBLE ON EVERY SURFACE THEY SIT ON, IN BOTH THEMES.
 *
 * The ink ramp used to be declared in design/studpilot-minimal.css, which loaded last and won every
 * tie, and until this file no test read it. Its --faint was #70737d (dark) and #818791 (light):
 * 4.44:1 on the dark page, 3.95:1 on the raised surface, 3.38:1 on the light page. That token carries
 * real text (the time under every turn, a code block's language, the Edit control on your own
 * message) and text needs 4.5:1.
 *
 * RESTATED 2026-10-05 (M2 step 2.1). The ramp is declared once now, in
 * packages/design/src/web/tokens.css, which BOTH apps import. So this holds the same two halves
 * against the file the app really loads: every ink clears 4.5:1 on paper and on every surface, and
 * the ramp still descends (faint stays dimmer than muted, or the hierarchy the three steps exist for
 * has collapsed). The old last test, "the app and the public site use one --faint", is stated as what
 * makes it true: neither app declares an ink token of its own, and both load the one file.
 *
 * Values are read out of the file, per theme block, never restated here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SURFACES, TEXT_INKS, contrast, customPropertyWrites, stripScriptComments, theme, themeBlocks } from '@studpilot/design/css-tokens';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKS = themeBlocks();
const THEMES = [
  ['dark', theme(BLOCKS.dark)],
  ['light', theme(BLOCKS.light)],
];

test('the ramp is read out of the token file, in both themes', () => {
  for (const [name, t] of THEMES) {
    for (const token of [...TEXT_INKS, ...SURFACES]) assert.ok(t.resolve(token), `${name}: --${token} was not found or is not a solid colour`);
  }
});

test('every ink clears 4.5:1 on paper and on every surface, in both themes', () => {
  let pairs = 0;
  for (const [name, t] of THEMES) {
    for (const ink of TEXT_INKS) {
      for (const ground of SURFACES) {
        const ratio = contrast(t.resolve(ink), t.resolve(ground));
        pairs += 1;
        assert.ok(ratio >= 4.5, `${name}: --${ink} ${t.resolve(ink)} on --${ground} ${t.resolve(ground)} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
      }
    }
  }
  assert.equal(pairs, 2 * TEXT_INKS.length * SURFACES.length, 'the pair count drifted; the loop is not measuring what it says');
});

test('the ramp still descends: ink, then ink-2, then muted, then faint', () => {
  for (const [name, t] of THEMES) {
    const on = (ink) => contrast(t.resolve(ink), t.resolve('paper'));
    for (let i = 0; i < TEXT_INKS.length - 1; i += 1) {
      const [hi, lo] = [TEXT_INKS[i], TEXT_INKS[i + 1]];
      assert.ok(on(hi) > on(lo), `${name}: --${lo} is no dimmer than --${hi}; the hierarchy has collapsed`);
    }
  }
});

test('the app and the public site use one ramp: both load the token file and neither declares an ink', () => {
  const read = (...p) => readFileSync(join(WEB, ...p), 'utf8');
  assert.match(read('src', 'main.tsx'), /import\s+['"]@studpilot\/design\/tokens\.css['"]/, 'the app does not import the shared tokens');
  const siteLayout = join(WEB, '..', 'site', 'src', 'layouts');
  const layouts = readdirSync(siteLayout).filter((f) => f.endsWith('.astro')).map((f) => readFileSync(join(siteLayout, f), 'utf8'));
  const withHtml = layouts.filter((src) => /<html\b/.test(src));
  assert.ok(withHtml.length >= 2, 'expected the site to have at least two document layouts');
  for (const src of withHtml) assert.match(src, /import\s+['"]@studpilot\/design\/tokens\.css['"]/, 'a site layout does not import the shared tokens');

  // No other app file writes an ink: a second --faint is how the two products drift. Stylesheets AND
  // scripts: a React `style={{ '--faint': c }}` or `el.style.setProperty('--muted', c)` re-declares an ink
  // as surely as a rule does, and a walk that read only .css never saw either.
  const stray = [];
  const walked = { css: 0, script: 0 };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(?:css|tsx?)$/.test(e.name)) {
        const isCss = e.name.endsWith('.css');
        walked[isCss ? 'css' : 'script'] += 1;
        const code = isCss ? readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ') : stripScriptComments(readFileSync(p, 'utf8'));
        for (const w of customPropertyWrites(code)) if (['--ink', '--ink-2', '--muted', '--faint'].includes(w.name)) stray.push(`${p.replace(WEB, '')}: ${w.name} (${w.form})`);
      }
    }
  };
  walk(join(WEB, 'src'));
  assert.ok(walked.css > 100 && walked.script > 200, `the walk read ${walked.css} stylesheets and ${walked.script} scripts; it has drifted, or it is not reading .ts and .tsx`);
  assert.deepEqual(stray, [], `the app re-declares an ink the token file owns:\n  ${stray.join('\n  ')}`);
});

test('the guard has teeth: an ink written from a script is seen, and an ink read is not', () => {
  const inks = (src) => customPropertyWrites(stripScriptComments(src)).map((w) => `${w.name} ${w.form}`);
  assert.deepEqual(inks(`<div style={{ '--faint': c }} />`), ['--faint object key']);
  assert.deepEqual(inks(`el.style.setProperty('--muted', c);`), ['--muted setProperty']);
  assert.deepEqual(inks('const s = { "--ink-2": c };'), ['--ink-2 object key']);
  assert.deepEqual(inks(`const c = getComputedStyle(el).getPropertyValue('--faint'); const x = 'var(--muted)';`), []);
});
