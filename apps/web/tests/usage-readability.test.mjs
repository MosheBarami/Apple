import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/design/system.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function declarations(sheet, selector) {
  return [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(',').map(s => s.trim()).includes(selector))
    .map(([, , body]) => body).join(';');
}
function readableSvgText(sheet) {
  for (const selector of ['.ring-number', '.ring-caption', '.bar-label']) {
    assert.match(declarations(sheet, selector), /fill:\s*var\(--(?:ink|muted)\)/, `${selector} needs explicit theme-aware SVG fill, not default black`);
  }
}
test('usage chart text has explicit theme-aware fill', () => readableSvgText(css));
test('guard rejects the old default-black SVG text', () => {
  assert.throws(() => readableSvgText(css.replace(/fill:\s*var\(--(?:ink|muted)\)/g, 'fill:initial')));
});
test('model name and explanation occupy separate readable rows', () => {
  assert.match(declarations(css, '.mode-cost'), /display:\s*grid/);
  assert.match(declarations(css, '.mode-cost-name'), /grid-column:\s*2/);
  assert.match(declarations(css, '.mode-cost-blurb'), /grid-column:\s*2/);
});
