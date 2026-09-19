import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/design/system.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
function rule(selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `missing ${selector}`);
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
}

test('connection steps separate descriptions and actions and can wrap', () => {
  const step = rule('.gx-connect__step');
  assert.match(step, /display:\s*flex/);
  assert.match(step, /flex-wrap:\s*wrap/);
  assert.match(step, /gap:\s*[^;]*[1-9]/);
  assert.match(rule('.gx-connect__title'), /font-size:\s*1[4-8]px/);
});

test('generated image fits short screens without cropping pixels', () => {
  const image = rule('.gu-generated-image__pixels');
  assert.match(image, /max-height:\s*[^;]*dvh/);
  assert.match(image, /object-fit:\s*contain/);
});

test('a conversation reserves less composer height than the empty welcome', () => {
  assert.match(rule('.gx-ws:not(:has(.start-sheet)) .gx-composer textarea'), /min-height:\s*6[0-9]px/);
});
