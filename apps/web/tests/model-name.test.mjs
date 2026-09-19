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

test('MAX has a bright continuous animation with reduced-motion protection', () => {
  const rule = css.match(/\.apple-max-name\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /animation:max-ink 2\.4s linear infinite/);
  assert.match(rule, /drop-shadow/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
