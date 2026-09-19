import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/pricing.astro', import.meta.url), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<!--[\s\S]*?-->/g, '');

function check(copy) {
  assert.match(copy, /Planned tier — not available to purchase yet/);
  assert.doesNotMatch(copy, />Check availability<|nothing to start|what you\s+actually get/);
  assert.match(copy, /Free limits apply now/);
  assert.match(copy, /Free chat is available now/);
}
test('closed paid checkout is a status, not an upgrade dead-end disguised as a CTA', () => check(source));
test('guard rejects the old misleading availability action', () => {
  const needle = 'Planned tier — not available to purchase yet';
  assert.equal(source.split(needle).length, 2);
  assert.throws(() => check(source.replace(needle, '<a href="/app/usage">Check availability</a>')));
});
