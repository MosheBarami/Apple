/**
 * TWO RULES THAT LOOK LIKE TIDINESS AND ARE LOAD-BEARING.
 *
 * Both were found by rendering the workspace at 390x844 and measuring, not by reading
 * the CSS — each failure looked like a deliberate design choice:
 *
 *   THE PILL. `.gx-pill` carried `text-overflow: ellipsis`, but its label lives in a
 *   child span, and text-overflow cannot reach text inside a child element. The row
 *   gave the pill 53px when it needed 73, so "Studio" was cut to "Stud" and the glyphs
 *   ran out through the rounded border. It needed `flex: none` — the project title
 *   beside it is the element built to absorb that pressure, with min-width 0 and its
 *   own ellipsis.
 *
 *   THE ICONS. Roadmap and Checkpoints rendered as EMPTY rounded rectangles. Their SVGs
 *   are flex items at the default `0 1 auto`, and the row shrank them to exactly 0px
 *   wide. The buttons kept their borders, so two controls had silently become
 *   decoration.
 *
 * A source assertion is weaker than a render, and that is stated rather than glossed:
 * this cannot prove the topbar lays out correctly, only that the two rules someone
 * would tidy away are still there.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/styles/workspace.css'),
  'utf8',
);

/** The body of the first rule whose selector list contains `selector`. */
function ruleFor(selector) {
  const i = CSS.indexOf(selector);
  assert.notEqual(i, -1, `no rule mentions ${selector}`);
  const open = CSS.indexOf('{', i);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
}

test('the Studio pill is never shrunk below its own content', () => {
  assert.match(ruleFor('.gx-pill {'), /flex:\s*none/, '.gx-pill must not be a shrinkable flex item');
});

test('the pill labels can end in an ellipsis rather than half a letter', () => {
  const body = ruleFor('.gx-pill__place,');
  assert.match(body, /overflow:\s*hidden/);
  assert.match(body, /text-overflow:\s*ellipsis/);
});

test('an icon inside a button never shrinks', () => {
  const body = ruleFor('.gx-btn > svg,');
  assert.match(body, /flex:\s*none/);
  for (const sel of ['.gx-icon-btn > svg', '.gx-pill > svg', '.gx-chip > svg']) {
    assert.ok(CSS.includes(sel), `${sel} must share the rule`);
  }
});

test('the phone topbar takes two rows rather than crushing the project name', () => {
  // At 390px, with every icon at its true size the row fits — but only by squeezing the
  // title to 20px, "F…", and the rail is collapsed on a phone so that title is the only
  // thing saying which project you are in. Nothing is hidden; the actions take a line.
  // The union of EVERY 560px block, because there are two of them and slicing from the
  // first `@media (max-width: 560px)` to the next `@media` found the one that does not
  // contain these rules — the first version of this test failed on a file that was
  // correct.
  let scoped = '';
  for (let i = CSS.indexOf('@media (max-width: 560px)'); i !== -1; i = CSS.indexOf('@media (max-width: 560px)', i + 1)) {
    const rest = CSS.slice(i + 1);
    const next = rest.indexOf('\n@media');
    scoped += next === -1 ? rest : rest.slice(0, next);
  }
  assert.ok(scoped.length > 0, 'no 560px media block found; the check would be vacuous');
  assert.match(scoped, /\.gx-top\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(scoped, /\.gx-top__actions\s*\{[^}]*flex-basis:\s*100%/s);
});
