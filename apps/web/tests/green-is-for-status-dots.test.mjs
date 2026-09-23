/**
 * F-004, 2026-09-22: the non-workspace screens spoke green — a green primary button on the shelf,
 * a teal chip, green ticks in the Studio dialog — while the workspace speaks the product's blue
 * (#5b7cfa, apple-minimal.css). The shelf went quiet black-and-white in e9462f8 (F-041). What was
 * still green on 2026-09-23, measured in Chrome by computed colour: the ✓ marks in the usage page's
 * Plan/Agent comparison (#34d399, the vendored table's own default) and the large "Studio
 * connected" tick. Green stays only where it is a status dot (toast, "Live", pulse).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (src, selector) => {
  const at = src.indexOf(selector + ' {');
  assert.ok(at >= 0, `${selector} was not found — this checks nothing`);
  return src.slice(at, src.indexOf('}', at));
};

test('the comparison table on the usage page ticks in the product accent, not the vendor green', () => {
  // The vendored ComparisonTable is byte-pinned (aicss-vendor.test.mjs), so the page overrides its
  // custom property rather than editing it.
  assert.match(rule(css('routes', 'usage.css'), '.usage-page'), /--tbl-yes:\s*var\(--accent\)/);
});

test('the "Studio connected" tick is the accent — it sits beside a blue primary button', () => {
  const icon = rule(css('components', 'pairing-dialog.css'), '.pairing-success-icon');
  assert.match(icon, /color:\s*var\(--accent\)/);
  assert.doesNotMatch(icon, /--good/);
});

test('CONTROL: status dots keep their green', () => {
  assert.match(css('components', 'toast.css'), /\.toast-success \.toast-dot \{ background:var\(--good\)/);
});
