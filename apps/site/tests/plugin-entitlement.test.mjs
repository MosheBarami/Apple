import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('../../../packages/shared/src/index.ts', import.meta.url), 'utf8');
async function shared(text) {
  const js = execFileSync(fileURLToPath(new URL('../../worker/node_modules/.bin/esbuild', import.meta.url)), ['--bundle', '--format=esm', '--loader=ts', '--sourcefile=index.ts'], {
    cwd: fileURLToPath(new URL('../../../packages/shared/src/', import.meta.url)), input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

test('every plan presents the real public plugin availability beside its entitlement', async () => {
  const flag = /export const STUDIO_PLUGIN_STORE_LIVE(?:: boolean)? = (?:true|false);/g;
  assert.equal([...source.matchAll(flag)].length, 1);
  for (const available of [false, true]) {
    const api = await shared(source.replace(flag, `export const STUDIO_PLUGIN_STORE_LIVE: boolean = ${available};`));
    const row = api.PLAN_FEATURES.find(row => row.id === 'plugin');
    assert.ok(row);
    for (const plan of api.PLAN_IDS) {
      if (available) assert.equal(row.values[plan], true);
      else assert.match(row.values[plan], /installation unavailable/i);
    }
    const highlight = api.PLAN_COPY.free.highlights.find(text => /Studio/i.test(text));
    assert.ok(highlight);
    if (!available) assert.match(highlight, /installation unavailable/i);
  }
});

test('availability guard rejects the previous unqualified included state', async () => {
  const guarded = "values: everyPlan(() => STUDIO_PLUGIN_STORE_LIVE ? true : 'Public installation unavailable')";
  assert.equal(source.split(guarded).length - 1, 1);
  const api = await shared(source.replace(guarded, 'values: everyPlan(() => true)'));
  const bad = api.PLAN_FEATURES.find(row => row.id === 'plugin');
  assert.throws(() => {
    for (const value of Object.values(bad.values)) assert.match(value, /installation unavailable/i);
  });
});

test('Studio does not advertise shared projects as a paid-tier differentiator', async () => {
  const api = await shared(source);
  const sharing = api.PLAN_FEATURES.find(row => row.id === 'sharing');
  assert.ok(api.PLAN_IDS.every(id => sharing.values[id] === true));
  assert.doesNotMatch(api.PLAN_COPY.studio.highlights.join(' '), /shared projects/i);
});
