// A <button> the stylesheet styles must declare its own background.
//
// THE DEFECT THIS COMES FROM. `.gx-row` is used on a <button> for the three prompt suggestions on
// an empty project — the first thing anybody sees in a new one. No rule set a background, so
// Chrome supplied `buttonface`, which in dark mode resolves to #6b6b6b: a flat neutral grey in a
// product whose every token is warm. Measured on the live page, not guessed. No stylesheet in this
// repository contains that colour, which is exactly why nobody could find where it came from.
//
// A button with no background does not inherit the page's. It inherits the BROWSER's, and the
// browser's changes with the colour scheme — so it was invisible in light mode and wrong in dark.
//
// WHAT THIS CHECKS. Any class this app applies to a <button> must, somewhere, set a background.
// It cannot see the computed cascade, so it errs toward the class that is named on a button and
// never mentioned with a background anywhere — which is the shape the defect took.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, test, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test.test(e.name)) out.push(p);
  }
  return out;
}

const sheets = walk(join(WEB, 'src'), /\.css$/);
const css = sheets.map((f) => readFileSync(f, 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Classes named in a rule that sets a background of any kind. */
const withBackground = new Set();
for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  if (!/(^|[;\s])background(-color|-image)?\s*:/.test(m[2])) continue;
  //[[ A HOVER BACKGROUND IS NOT A RESTING BACKGROUND, and accepting one made this test green over
  //   the exact bug it was written for. Removing `.gx-row`'s own background left
  //   `.gx-seeds .gx-row:hover` still setting one, so the class counted as covered while every
  //   seed button sat at rest showing the browser's grey — which is the state a person reads.
  //   Rules gated on a pseudo-class say what happens when something is pointed at, not what it
  //   looks like.
  if (/:(hover|focus|active|focus-visible|focus-within|target|checked|disabled)\b/.test(m[1])) continue;
  for (const c of m[1].matchAll(/\.([a-zA-Z][\w-]*)/g)) withBackground.add(c[1]);
}

//[[ PER BUTTON, NOT PER CLASS. A button carries several classes and only ONE of them has to
//   bring the background — `gx-chip gx-chip--selection` is a base and a modifier, and requiring
//   the modifier to declare one would report every variant in the app. The defect was a button
//   whose classes, ALL of them, mentioned no background anywhere: `.gx-row` was the only class on
//   the seed buttons and nothing set one.
const buttons = [];
for (const file of walk(join(WEB, 'src'), /\.tsx$/)) {
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const m of src.matchAll(/<button\b[^>]*?className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    const classes = raw
      .split(/[\s${}?:'"+]+/)
      .filter((c) => /^[a-z][\w-]{2,}$/.test(c))
      // Expression fragments, not classes: `className={x ? 'a' : null}` splits into these.
      .filter((c) => !/^(className|null|undefined|true|false|props|style|type|key|id)$/.test(c))
      // A template stem like `is-` is half a name; the half that exists is decided at runtime.
      .filter((c) => !/[-_]$/.test(c));
    if (classes.length) buttons.push({ file, raw: raw.trim().slice(0, 60), classes });
  }
}

test('the check can see both halves', () => {
  // Zero button classes or zero background rules is a clean run over nothing, and both halves can
  // go blind on their own.
  assert.ok(buttons.length >= 10, `found ${buttons.length} button(s) — the matcher has gone blind`);
  assert.ok(withBackground.size >= 20, `found ${withBackground.size} class(es) with a background — the parser has gone blind`);
});

test('every button has at least one class that declares a background', () => {
  const bare = buttons.filter((b) => !b.classes.some((c) => withBackground.has(c)));
  assert.deepEqual(
    bare.map((b) => `${b.raw}  (${relative(WEB, b.file)})`),
    [],
    "these render with the browser's buttonface — #6b6b6b in dark mode, a colour no stylesheet here contains",
  );
});
