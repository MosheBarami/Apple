/**
 * THE CREATOR STORE UI IMAGE LIBRARY (D-UISTORE-1): MORE THAN 50,000 USABLE IMAGES, AND THEY RANK.
 *
 * apps/worker/src/ui-store-search.ts answers from packages/asset-library/ui-store/index.json, built
 * by ui-store/build.mjs from the keyless Creator Store harvest. This holds:
 *   - the index has more than 50,000 rows, every one a numeric Image id distinct from its decal id;
 *   - a hit carries `image: rbxassetid://<imageId>` and a Creator Store page for its decal;
 *   - plain-word queries rank rows whose NAME carries every word first, kind filters hold, and
 *     `genre` lifts without hiding;
 *   - uiStoreImage recognises library ids and refuses others.
 * No network: the index is a file in the checkout.
 *
 * Run with:  node --test src/ui-store-search.test.mjs      (from packages/evals)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { findUiStoreImages, uiStoreImage, uiStoreTokens, UI_STORE_COUNT, UI_STORE_KINDS } from '../../../apps/worker/src/ui-store-search.ts';
import store from '../../asset-library/ui-store/index.json' with { type: 'json' };

test('the library holds more than 50,000 distinct usable image ids', () => {
  assert.ok(UI_STORE_COUNT > 50_000, `only ${UI_STORE_COUNT} rows`);
  assert.equal(store.count, store.rows.length);
  const seen = new Set();
  for (const r of store.rows) {
    assert.ok(Number.isSafeInteger(r[0]) && r[0] > 0, `bad image id ${r[0]}`);
    assert.ok(r[1] !== 0, `row ${r[0]}: the image id equals the decal id, which renders nothing`);
    assert.ok(typeof r[2] === 'string' && r[2].length > 0);
    assert.ok(!seen.has(r[0]), `duplicate image id ${r[0]}`);
    seen.add(r[0]);
  }
});

test('a hit is directly usable: rbxassetid of the image, page of the decal', () => {
  const [h] = findUiStoreImages({ query: 'coin', limit: 1 });
  assert.ok(h, 'no hit for coin');
  assert.equal(h.image, `rbxassetid://${h.imageId}`);
  assert.notEqual(h.imageId, h.decalId);
  assert.equal(h.page, `https://create.roblox.com/store/asset/${h.decalId}`);
  assert.match(h.licence, /Creator Store free/);
  assert.ok(UI_STORE_KINDS.includes(h.kind));
});

for (const [query, words] of [['coin', ['coin']], ['close button', ['close', 'button']], ['settings', ['setting']], ['heart', ['heart']], ['gem icon', ['gem']], ['health bar', ['health', 'bar']]]) {
  test(`"${query}": the top ten all carry ${words.join(' + ')} in their name`, () => {
    const hits = findUiStoreImages({ query, limit: 10 });
    assert.equal(hits.length, 10, `only ${hits.length} hits`);
    for (const h of hits) {
      const name = uiStoreTokens(h.name);
      for (const w of words) assert.ok(name.some((t) => t.startsWith(w)), `"${h.name}" is in the top ten for "${query}" without "${w}"`);
    }
  });
}

test('ranking is ordered and a plural finds the singular', () => {
  const hits = findUiStoreImages({ query: 'coins', limit: 20 });
  assert.ok(hits.length === 20);
  assert.ok(hits.every((h) => uiStoreTokens(h.name).includes('coin')));
  const all = findUiStoreImages({ query: 'star', limit: 40 });
  // One word: every hit matches it once, so the order is the score order.
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].score >= all[i].score, `${all[i - 1].name} above ${all[i].name}`);
});

test('kind filters, genre lifts, unknown filters answer nothing', () => {
  const buttons = findUiStoreImages({ query: 'shop', kind: 'button', limit: 20 });
  assert.ok(buttons.length > 0);
  assert.ok(buttons.every((h) => h.kind === 'button'));
  const horror = findUiStoreImages({ query: 'skull', genre: 'Horror/Adventure', limit: 10 });
  assert.ok(horror.length === 10);
  assert.ok(horror.filter((h) => h.genres.includes('Horror/Adventure')).length >= 5);
  assert.deepEqual(findUiStoreImages({ query: 'coin', kind: 'spaceship' }), []);
  assert.deepEqual(findUiStoreImages({ query: 'coin', genre: 'Racing' }), []);
  assert.deepEqual(findUiStoreImages({ query: '' }), []);
  assert.ok(findUiStoreImages({ kind: 'background', limit: 5 }).length === 5);
});

test('limit is clamped and results are distinct', () => {
  assert.equal(findUiStoreImages({ query: 'button', limit: 500 }).length, 60);
  assert.equal(findUiStoreImages({ query: 'button', limit: 0 }).length, 12);
  const ids = findUiStoreImages({ query: 'arrow', limit: 60 }).map((h) => h.imageId);
  assert.equal(new Set(ids).size, ids.length);
});

test('uiStoreImage recognises library ids only', () => {
  const [h] = findUiStoreImages({ query: 'trophy', limit: 1 });
  assert.equal(uiStoreImage(h.imageId)?.name, h.name);
  assert.equal(uiStoreImage(`rbxassetid://${h.imageId}`)?.imageId, h.imageId);
  assert.equal(uiStoreImage('rbxassetid://1'), null);
  assert.equal(uiStoreImage('not an id'), null);
});
