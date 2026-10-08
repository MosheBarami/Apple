import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CATEGORY_IDS, detailsUrl, formatCreatorStoreResult, parseDetails, parseSearch, parseThumbnails, searchCreatorStore, searchUrl, storeLink } from '../src/knowledge/creator-store.ts';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));

test('URLs and category ids', () => {
  assert.deepEqual(CATEGORY_IDS, { model: 10, audio: 3, decal: 13, mesh: 40, animation: 24, video: 62, plugin: 38 });
  assert.equal(searchUrl('model', 'oak tree', 5), 'https://apis.roblox.com/toolbox-service/v1/marketplace/10?keyword=oak+tree&limit=5');
  assert.equal(detailsUrl([1, 2]), 'https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=1,2');
  assert.equal(storeLink(7), 'https://create.roblox.com/store/asset/7');
});

test('parsing recorded responses', () => {
  const s = parseSearch(fx('store-search'));
  assert.equal(s.total, 376);
  assert.deepEqual(s.ids, [15799943463, 128707014921507]);
  const thumbs = parseThumbnails(fx('store-thumbs'));
  assert.match(thumbs.get(15799943463), /^https:\/\/tr\.rbxcdn\.com\//);
  const d = parseDetails(fx('store-details'), thumbs);
  const tree = d.get(15799943463);
  assert.equal(tree.name, 'old oak tree');
  assert.equal(tree.creator, 'Grant_2003');
  assert.equal(tree.creatorVerified, true);
  assert.equal(tree.hasScripts, false);
  assert.equal(tree.triangles, 6782);
  assert.deepEqual(tree.instances, { decal: 3 });
  assert.equal(tree.link, 'https://create.roblox.com/store/asset/15799943463');
  assert.equal(tree.upVotePercent, 96);
  const audio = parseDetails(fx('store-audio-details')).get(142376088);
  assert.equal(audio.durationSeconds, 95);
  assert.equal(audio.audio.artist, 'Parry Gripp');
  assert.deepEqual(parseSearch(null), { total: 0, ids: [] });
  assert.equal(parseDetails({ data: [{ nonsense: 1 }] }).size, 0);
});

function fakeFetch(map, log = []) {
  return async (req) => {
    const url = typeof req === 'string' ? req : req.url;
    log.push(url);
    for (const [frag, body, status] of map) if (url.includes(frag)) return new Response(JSON.stringify(body), { status: status ?? 200 });
    return new Response('{}', { status: 404 });
  };
}

test('searchCreatorStore end to end with fixtures', async () => {
  const log = [];
  const r = await searchCreatorStore({ query: 'oak tree', category: 'model', limit: 2 }, fakeFetch([['marketplace/10', fx('store-search')], ['items/details', fx('store-details')], ['thumbnails.roblox.com', fx('store-thumbs')]], log));
  assert.equal(r.items.length, 2);
  assert.equal(r.total, 376);
  assert.ok(r.items[0].thumbnailUrl);
  assert.equal(r.error, undefined);
  const text = formatCreatorStoreResult(r);
  assert.match(text, /old oak tree \(id 15799943463\) by Grant_2003 \[verified\]/);
  assert.match(text, /no scripts/);
  assert.match(text, /create\.roblox\.com\/store\/asset\/15799943463/);
});

test('audio skips thumbnails; errors are reported, not thrown', async () => {
  const log = [];
  const ok = await searchCreatorStore({ query: 'taco', category: 'audio' }, fakeFetch([['marketplace/3', { totalResults: 1, data: [{ id: 142376088 }] }], ['items/details', fx('store-audio-details')]], log));
  assert.equal(ok.items[0].audio.title.length > 0, true);
  assert.ok(!log.some((u) => u.includes('thumbnails.roblox.com')));

  const limited = await searchCreatorStore({ query: 'x' }, fakeFetch([['marketplace', {}, 429]]));
  assert.equal(limited.items.length, 0);
  assert.match(limited.error, /rate limiting/);
  assert.match(formatCreatorStoreResult(limited), /rate limiting/);

  const down = await searchCreatorStore({ query: 'x' }, async () => {
    throw new Error('network');
  });
  assert.match(down.error, /failed/);
  assert.equal((await searchCreatorStore({ query: '  ' })).error, 'empty query');
});
