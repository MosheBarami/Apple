import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ws/composer.tsx', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const css = readFileSync(new URL('../src/design/system.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('selected model and menu apply rainbow to MAX only', () => {
  const labels = [...source.matchAll(/className="apple-max-name">([^<]+)<\/span>/g)];
  assert.equal(labels.length, 2);
  assert.ok(labels.every((label) => label[1] === 'MAX'));
  assert.doesNotMatch(source, /className=\{[^}]*apple-max-name/);
});

test('MAX is distinct, animated and reduced-motion protected — with the owner-requested rainbow', () => {
  const rule = css.match(/\.apple-max-name\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /animation:max-ink 3\.2s linear infinite/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);

  // THIS TEST USED TO PIN `drop-shadow`, and the pin outlived the decision. The mark was a 90deg
  // rainbow through six invented hues with a magenta glow, on a product whose whole argument is one
  // restrained green on graphite; docs/DESIGN-LOCK.md allows two shadows and a glow on a word is
  // neither. Asserting the glow was asserting the violation.
  //
  // MAX is the one explicit identity exception requested by the owner: vivid, moving and rainbow.
  // Apple itself remains ordinary ink; this selector must never be applied dynamically to it.
  assert.match(rule, /font-weight:750/, 'the weight is the licensed exception and the whole distinction');
  assert.match(rule, /#ff80ef/);
  assert.match(rule, /#72d8ff/);
  assert.match(rule, /#86ffc3/);
  assert.doesNotMatch(rule, /drop-shadow/, 'the glow is back — the lock allows --shadow-pop and --shadow-modal and nothing else');
});
