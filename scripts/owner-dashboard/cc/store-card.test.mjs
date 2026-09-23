// The Creator Store card must not call a recorded Roblox removal "waiting for approval".
import { test } from 'node:test';
import assert from 'node:assert/strict';

const PAGE = process.env.MORE_PAGE ?? '../control/pages/more.js';
const page = (await import(new URL(PAGE, import.meta.url))).default;
const { STUDIO_PLUGIN_STORE_REFUSAL } = await import('../../../packages/shared/src/index.ts');

const card = (robloxStore) => String(page.render({ apple: null, robloxStore, stripe: {}, posthog: {} }));
const controls = [{ assetId: 6415005344, httpStatus: 200 }];

test('a 404 with a recorded refusal names the removal, its reason and the appeal deadline', () => {
  const refusal = { reason: 'Misusing Roblox Systems', decidedAt: '2026-09-23T01:23+03:00', appealableUntil: '2026-10-23T01:23+03:00', appealId: null };
  const out = card({ assetId: 107230158271368, httpStatus: 404, controls, refusal });
  assert.match(out, /הסירה/);
  assert.match(out, /Misusing Roblox Systems/);
  assert.match(out, /2026-10-23/);
  assert.doesNotMatch(out, /ממתין לאישור/);
});

test('a 404 with no recorded refusal still says the listing is missing', () => {
  assert.match(card({ assetId: 1, httpStatus: 404, controls, refusal: null }), /עדיין לא מופיע/);
});

test('the server hands the card the shared refusal record', async () => {
  const src = await (await import('node:fs/promises')).readFile(new URL('./platforms/extras.mjs', import.meta.url), 'utf8');
  assert.match(src, /refusal: STUDIO_PLUGIN_STORE_REFUSAL/);
  assert.ok(STUDIO_PLUGIN_STORE_REFUSAL === null || typeof STUDIO_PLUGIN_STORE_REFUSAL.reason === 'string');
});
