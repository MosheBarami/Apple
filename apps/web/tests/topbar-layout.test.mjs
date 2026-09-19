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
  join(dirname(fileURLToPath(import.meta.url)), '../src/design/system.css'),
  'utf8',
);

/** The body of the first rule whose selector list contains `selector`. */
function ruleFor(selector) {
  const i = CSS.indexOf(selector);
  assert.notEqual(i, -1, `no rule mentions ${selector}`);
  const open = CSS.indexOf('{', i);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
}

function blockBody(at) {
  const open = CSS.indexOf('{', at);
  assert.notEqual(open, -1, 'responsive block has no opening brace');
  let depth = 0;
  for (let i = open; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
  }
  throw new Error('responsive block has unbalanced braces');
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

test('the phone shell keeps navigation reachable and reserves the opener space', () => {
  // The shell now owns a narrow dock. At phone width the dock becomes a single menu control,
  // while the main column returns to the viewport and the topbar reserves the control's 72px
  // leading space. This is the load-bearing contract; a particular number of topbar rows is not.
  const at = CSS.indexOf('@media(max-width:680px)');
  assert.notEqual(at, -1, 'no 680px responsive shell block found');
  const phone = blockBody(at);
  assert.match(phone, /\.gx-main\s*\{[^}]*width:\s*100%[^}]*margin-inline-start:\s*0/);
  assert.match(phone, /\.studio-dock\s*\{[^}]*width:\s*44px/);
  assert.match(phone, /\.studio-dock\s*>\s*button,\.studio-dock\s*>\s*a\s*\{[^}]*display:\s*none/);
  assert.match(phone, /\.studio-dock\s*>\s*\.studio-navigation\s*\{[^}]*display:\s*grid/);
  assert.match(phone, /\.gx-ws\s*\{[^}]*grid-template-rows:\s*64px/);
  assert.match(phone, /\.gx-top\s*\{[^}]*padding:\s*12px\s+18px\s+12px\s+72px/);
});
