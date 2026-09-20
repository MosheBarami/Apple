/**
 * THERE IS ONE TYPE SYSTEM, AND BOTH HALVES OF THE SITE SPEND IT.
 *
 * WHAT WAS ACTUALLY WRONG, which is more specific than "no typography system". global.css — which
 * dresses /docs, /pricing, /changelog, /status and the legal routes — has declared --font-display,
 * --font-body, --font-sans and --font-mono since the warm-dark pass. landing.css does not import
 * it, and had SPELLED THE SAME TWO STACKS OUT NINE TIMES: the sans once on `body` and the mono
 * eight times, across the activity log, the step figures and the four capability stages.
 *
 * Nine literals is not a missing system. It is a system on one half of a site and nine chances to
 * drift on the other, and the drift is the kind nobody notices: change the mono stack in global.css
 * for the docs and the landing keeps the old one, so two pages of the same site set code in two
 * different faces and every screenshot of either looks right.
 *
 * SO THIS FILE ASSERTS TWO PROPERTIES, and neither is "the stacks are these strings":
 *
 *   1. Every `font-family` this site ships, anywhere, is either a --font-* TOKEN DECLARATION or a
 *      `var(--font-…)` that spends one. A tenth literal added by anybody, in any sheet or any
 *      component <style>, is the defect.
 *   2. Where two sheets declare the same token, they declare the SAME VALUE. Two sheets that both
 *      look tokenised and disagree is the original defect wearing a better shirt.
 *
 * It deliberately does not pin which faces are in the stack. That is a design decision, it is
 * recorded in docs/DESIGN-TYPE.md with its arithmetic, and a guard that pinned it would go red the
 * day the decision is revisited rather than the day the system breaks.
 *
 * THE DENOMINATOR IS ASSERTED. A scanner that finds no font-family declarations reports a clean
 * site, and this repository has shipped that exact shape more than once.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(SITE, 'src');

/** Comments first. Four scanners here have needed this: the better a defect is documented, the
    more a prose-reading scanner finds its own explanation and reports it as the defect. */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Every piece of CSS this site serves — the stylesheets, and every `<style>` inside a component, a
 * layout or a page. DERIVED from the directory: a hand-written list is a denominator that silently
 * stops growing, and three in this repository have.
 */
function sheets() {
  const out = [];
  for (const file of walk(SRC)) {
    if (file.endsWith('.css')) {
      out.push({ file, css: readFileSync(file, 'utf8') });
      continue;
    }
    if (!file.endsWith('.astro')) continue;
    const src = readFileSync(file, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) out.push({ file, css: m[1] });
  }
  return out;
}

/** `--font-x: value` declarations, per sheet. */
function tokens(css) {
  const out = new Map();
  for (const m of strip(css).matchAll(/(--font-[\w-]+)\s*:\s*([^;}]+)/g)) {
    out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  }
  return out;
}

/** `font-family: value` declarations that are NOT a token definition, per sheet. */
function families(css) {
  return [...strip(css).matchAll(/font-family\s*:\s*([^;}]+)/g)].map((m) => m[1].trim().replace(/\s+/g, ' '));
}

const SHEETS = sheets();

test('the walk found real sheets and real type declarations, so nothing below is vacuous', () => {
  assert.ok(SHEETS.length >= 6, `only ${SHEETS.length} sheets found under src — the walk has drifted`);
  const declared = SHEETS.flatMap((s) => families(s.css));
  assert.ok(declared.length >= 8, `only ${declared.length} font-family declarations found; the parse has drifted`);
  const named = new Set(SHEETS.flatMap((s) => [...tokens(s.css).keys()]));
  for (const want of ['--font-display', '--font-body', '--font-sans', '--font-mono']) {
    assert.ok(named.has(want), `${want} is declared nowhere — there is no system to spend`);
  }
});

test('EVERY font-family ON THIS SITE SPENDS A TOKEN, rather than restating a stack', () => {
  const literals = [];
  for (const { file, css } of SHEETS) {
    for (const value of families(css)) {
      // A token declaration's own value is the one place a literal belongs. Those are matched by
      // `--font-…:` and never appear here, because `families` only reads `font-family:`.
      if (/^var\(--font-[\w-]+\)$/.test(value)) continue;
      // `var(--font-mono), monospace` — spending a token with a last-resort keyword after it — is
      // still spending the token, and is how a defensive author writes it. Allowed.
      if (/^var\(--font-[\w-]+\)\s*,\s*(monospace|sans-serif|serif|system-ui)$/.test(value)) continue;
      // `inherit` / `unset` name no family at all.
      if (/^(inherit|initial|unset|revert)$/.test(value)) continue;
      literals.push(`${relative(SITE, file)}: font-family: ${value.slice(0, 72)}`);
    }
  }
  assert.deepEqual(literals, [],
    'these restate a font stack instead of spending a token, which is how one half of a site ends ' +
    `up setting code in a different face from the other:\n  ${literals.join('\n  ')}`);
});

test('where two sheets declare the same token, they declare the same value', () => {
  const seen = new Map();   // token -> [{ file, value }]
  for (const { file, css } of SHEETS) {
    for (const [name, value] of tokens(css)) {
      if (!seen.has(name)) seen.set(name, []);
      seen.get(name).push({ file: relative(SITE, file), value });
    }
  }
  const shared = [...seen.entries()].filter(([, rows]) => new Set(rows.map((r) => r.file)).size > 1);
  assert.ok(shared.length >= 3,
    `only ${shared.length} token(s) are declared in more than one sheet; this check would compare almost nothing`);

  const bad = [];
  for (const [name, rows] of shared) {
    const distinct = new Set(rows.map((r) => r.value));
    if (distinct.size > 1) {
      bad.push(`${name}\n    ${rows.map((r) => `${r.file}: ${r.value.slice(0, 64)}`).join('\n    ')}`);
    }
  }
  assert.deepEqual(bad, [],
    `two sheets declare the same type token with different values, so the two halves of this site ` +
    `set the same thing in different faces:\n  ${bad.join('\n  ')}`);
});

test('the mono token reaches the technical surfaces, and the sans reaches the body', () => {
  // The owner's instruction names monospace for technical content specifically. This asserts the
  // token actually arrives there rather than merely existing: the activity log, the read log, the
  // Luau panel and the tree are the four technical surfaces the landing ships.
  const landing = SHEETS.find((s) => s.file.endsWith('landing.css'));
  assert.ok(landing, 'landing.css was not read');
  const css = strip(landing.css);
  for (const hook of ['.activity-line', '.rd-node', '.rd-log', '.lu-out code']) {
    const rule = new RegExp(`${hook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*font-family\\s*:\\s*var\\(--font-mono\\)`);
    assert.match(css, rule, `${hook} does not take the mono token, so a technical surface is set in the body face`);
  }
  assert.match(css, /body\s*\{[^}]*font-family\s*:\s*var\(--font-body\)/,
    'the landing body does not take the body token');
});
