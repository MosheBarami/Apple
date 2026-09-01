/**
 * TEXT CONTRAST, MEASURED RATHER THAN EYEBALLED.
 *
 * The 2026-09-01 accessibility pass said in its own words that contrast ratios were
 * "not covered". Measuring them found that `--gx-ink-3`, the tertiary ink, sat at
 * 3.29:1 against `--gx-raise-2` — which clears the 3:1 that covers large text and
 * non-text UI, and not the 4.5:1 that normal text needs. Every use of it is small text:
 * timestamps, detail lines, the credits notes.
 *
 * It is exactly the kind of defect that survives review indefinitely. Nothing looks
 * broken; the text is simply harder to read than it should be, for the people who find
 * it hardest already.
 *
 * The ramp is checked against the LIGHTEST surface each colour actually sits on, since
 * that is the worst case in a dark theme, and both themes are checked — the light one
 * was also short, at 4.21:1.
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

/** Relative luminance, WCAG 2.x. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Every `--name: #rrggbb` in source order. The tokens are declared twice — once for the
 * dark theme, once inside `:root[data-theme='light']` — so order is what separates
 * them, and taking the wrong occurrence would compare a light colour against a dark
 * ground and invent a failure. Index 0 is dark, index 1 is light.
 */
function token(name, theme) {
  const all = [...CSS.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]);
  assert.ok(all.length >= 2, `--${name} should be declared for both themes, found ${all.length}`);
  return all[theme === 'dark' ? 0 : 1];
}

// The surface each ink sits on. Worst case, not typical case.
const SURFACE = { dark: ['gx-ground', 'gx-raise-2'], light: ['gx-ground', 'gx-raise-2'] };

for (const theme of ['dark', 'light']) {
  test(`${theme}: body and secondary ink clear 4.5:1 on every surface`, () => {
    for (const ink of ['gx-ink', 'gx-ink-2']) {
      for (const surf of SURFACE[theme]) {
        const r = contrast(token(ink, theme), token(surf, theme));
        assert.ok(r >= 4.5, `--${ink} on --${surf} is ${r.toFixed(2)}:1, needs 4.5:1`);
      }
    }
  });

  test(`${theme}: tertiary ink clears 4.5:1 too, because it is small text`, () => {
    // Not 3:1. `--gx-ink-3` is used for timestamps, detail lines and notes — all normal
    // size. The 3:1 threshold is for large text and non-text UI, and applying it here is
    // how this colour spent so long at 3.29:1.
    for (const surf of SURFACE[theme]) {
      const r = contrast(token('gx-ink-3', theme), token(surf, theme));
      assert.ok(r >= 4.5, `--gx-ink-3 on --${surf} is ${r.toFixed(2)}:1, needs 4.5:1 for normal text`);
    }
  });

  test(`${theme}: the ink ramp still descends, so the hierarchy survives the fix`, () => {
    // Raising a colour to pass contrast must not raise it past the one above it —
    // three equally bright greys would be accessible and unreadable.
    const ground = token('gx-ground', theme);
    const [a, b, c] = ['gx-ink', 'gx-ink-2', 'gx-ink-3'].map((n) => contrast(token(n, theme), ground));
    assert.ok(a > b && b > c, `ramp is ${a.toFixed(2)} / ${b.toFixed(2)} / ${c.toFixed(2)} — not descending`);
  });
}

test('the status tones are legible on the surfaces they are drawn on', () => {
  // §16.2 assigns meaning to colour. A tone nobody can read carries none.
  for (const tone of ['good', 'bad', 'warn', 'info']) {
    const all = [...CSS.matchAll(new RegExp(`--${tone}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]);
    if (all.length === 0) continue; // defined elsewhere or as a function; not this test's business
    const r = contrast(all[0], token('gx-ground', 'dark'));
    assert.ok(r >= 3, `--${tone} on the dark ground is ${r.toFixed(2)}:1, below the 3:1 floor`);
  }
});
