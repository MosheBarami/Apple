import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogPreviewUrl, catalogPreviewLabel, catalogDetails } from '../src/lib/asset-catalog.ts';

const base = { id: 'library:tree', name: 'Tree', kind: 'foliage', source: 'creator_store', licence: 'Recorded licence', attributionRequired: false, robloxAssetId: 123, availability: 'insertable' };
const ready = { ...base, preview: { state: 'ready', url: 'https://tr.rbxcdn.com/abc/150/150/Image/Png' } };

test('a preview is a validated Roblox CDN image, not an arbitrary navigation URL', () => {
  assert.equal(catalogPreviewUrl(ready), ready.preview.url);
  for (const url of ['http://tr.rbxcdn.com/a', 'https://rbxcdn.com.evil.test/a', 'https://evilrbxcdn.com/a', 'https://127.0.0.1/a', 'https://user:secret@tr.rbxcdn.com/a', 'https://tr.rbxcdn.com:8443/a', 'data:image/png,anything', '//tr.rbxcdn.com/a', 'https://tr.rbxcdn.com/a#fragment']) {
    assert.equal(catalogPreviewUrl({ ...ready, preview: { state: 'ready', url } }), null, url);
  }
  for (const state of ['pending', 'blocked', 'unavailable', 'unknown']) {
    assert.equal(catalogPreviewUrl({ ...ready, preview: { state, url: ready.preview.url } }), null);
  }
  assert.equal(catalogPreviewUrl(base), null, 'an older backend without previews is supported');
});

test('preview failures are explicit, never an asset-safety verdict', () => {
  assert.equal(catalogPreviewLabel(base), 'Preview unavailable');
  assert.equal(catalogPreviewLabel({ ...base, preview: { state: 'pending', url: null } }), 'Preview processing');
  assert.equal(catalogPreviewLabel({ ...base, preview: { state: 'blocked', url: null } }), 'Preview blocked by Roblox');
  assert.equal(catalogPreviewLabel(ready, true), 'Preview could not load');
  assert.equal(catalogPreviewLabel({ ...base, robloxAssetId: null }), 'No preview recorded');
});

test('choice details expose measured geometry and useful tags without inventing missing data', () => {
  assert.deepEqual(catalogDetails({ ...base, triangles: 1200, boundsStuds: [4, 12, 3], tags: ['low-poly', 'forest', 'forest', '', '  low-poly  '] }), ['1,200 triangles', '4 × 12 × 3 studs', 'low-poly', 'forest']);
  assert.deepEqual(catalogDetails(base), []);
  assert.deepEqual(catalogDetails({ ...base, triangles: -1, boundsStuds: [1, Infinity, 3], tags: [12, null, '', 'x'.repeat(65)] }), []);
  assert.deepEqual(catalogDetails({ ...base, triangles: NaN, boundsStuds: [1, 2] }), []);
  assert.deepEqual(catalogDetails({ ...base, triangles: 1.5, boundsStuds: [1, 0, 3] }), []);
  assert.equal(catalogDetails({ ...base, tags: Array.from({ length: 99 }, (_, i) => `tag-${i}`) }).length, 4);
});
