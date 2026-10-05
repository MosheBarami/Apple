/**
 * THE BANNER AFTER A CHECKOUT NAMES THE PLAN AS A PERSON READS IT (review cycle 3, finding 7).
 *
 * "this page shows <strong>builder</strong> right now" printed the STORED plan id. The ids (`builder`, `studio`) are
 * kept as they are because the profiles constraint and the Stripe price mapping depend on them; the plans a person
 * sees are Pro and Max. The sentence is read back through planDisplayName, executed here, and the route is checked
 * to use it (apps/web has no DOM renderer, so the wiring is a source check, with comments removed first).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLAN_IDS, PLAN_TABLE } from '../../../packages/shared/src/index.ts';
import { planDisplayName } from '../src/lib/plan-name.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');

test('every stored plan id is shown by the name the plan table gives it: builder is Pro, studio is Max', () => {
  assert.ok(PLAN_IDS.length >= 4, 'the plan table is empty or shrank: this would check nothing');
  for (const id of PLAN_IDS) assert.equal(planDisplayName(id), PLAN_TABLE[id].name, id);
  assert.equal(planDisplayName('builder'), 'Pro');
  assert.equal(planDisplayName('studio'), 'Max');
  assert.equal(planDisplayName('free'), 'Free');
});

test('an id this build does not know is shown as it is stored, never as another plan, and a missing one as nothing', () => {
  assert.equal(planDisplayName('platinum'), 'platinum');
  assert.equal(planDisplayName(undefined), '');
  assert.equal(planDisplayName(null), '');
});

test('the checkout-return banner prints the plan through planDisplayName and never the raw stored id', () => {
  const src = readFileSync(join(WEB, 'src', 'routes', 'usage.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const at = src.indexOf("returned === 'done'");
  assert.ok(at !== -1, "the route has no `returned === 'done'` banner");
  const banner = src.slice(at, src.indexOf("returned === 'cancelled'", at));
  assert.ok(banner.length > 0 && banner.length < 1200, `the banner was not isolated (${banner.length} chars)`);
  assert.match(banner, /<strong>\{planDisplayName\(me\.data\.quota\.plan\)\}<\/strong>/);
  assert.doesNotMatch(banner, /\{me\.data\.quota\.plan\}/, 'the stored plan id is printed again');
});
