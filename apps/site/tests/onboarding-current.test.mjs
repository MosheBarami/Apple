import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

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

test('getting-started allowance is derived, never a numeric promise in copy', async () => {
  const page = read('getting-started');
  // The DISPLAYED table (credits as people see them), not PLAN_LIMITS, which is ledger units.
  assert.match(page, /const free\s*=\s*PLAN_TABLE\.free/);
  assert.match(page, /<strong>\{free\.creditsPerDay\} Credits<\/strong>/);
  assert.doesNotMatch(page, /\b\d[\d,]*\s+Credits\b/);

  // And what the built page says equals the config, whatever the config is.
  const { PLAN_TABLE } = await import('../../../packages/shared/src/index.ts');
  const dist = new URL('../dist/docs/getting-started/index.html', import.meta.url);
  if (existsSync(dist)) {
    const html = readFileSync(dist, 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(
      html.includes(`${PLAN_TABLE.free.creditsPerDay} Credits immediately`),
      'the rendered guide does not carry the free daily allowance from PLAN_TABLE',
    );
  }
});
