import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../src/pages/docs/${name}.astro`, import.meta.url), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '');

test('onboarding entry points derive public installation status from the shared flag', () => {
  for (const name of ['index', 'getting-started']) {
    const page = read(name);
    assert.match(page, /import\s*\{[^}]*STUDIO_PLUGIN_STORE_LIVE[^}]*\}\s*from/);
    assert.match(page, /\{\s*!STUDIO_PLUGIN_STORE_LIVE\s*&&/);
    assert.match(page, /Public (?:Studio )?installation is unavailable/);
  }
});

test('getting-started allowance is derived, never a numeric promise in copy', () => {
  const page = read('getting-started');
  assert.match(page, /const free\s*=\s*PLAN_LIMITS\.free/);
  assert.match(page, /<strong>\{free\.creditsPerDay\} Credits<\/strong>/);
  assert.doesNotMatch(page, /\b\d[\d,]*\s+Credits\b/);
});
