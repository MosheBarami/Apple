// library_search (master plan §3, §4.6 L-A6): meaning first, then filters; A/B only, A first; Mild only on request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchLibrary, offered } from '../src/library-search.ts';

const row = (id, grade, over = {}) => ({ id, title: id, kind: 'prop', family: 'kenney:k', grade, licence_class: 'cc0', triangles: 12, grade_notes: JSON.stringify([{ why: `a ${id}` }]), roblox_asset_id: null, maturity: null, ...over });
function env(rows, matches, seen = {}) {
  return {
    LIBRARY: { query: async (_v, opts) => { seen.opts = opts; return { matches: matches.map((item) => ({ metadata: { item } })) }; } },
    CORPUS: { prepare: () => ({ bind: (...ids) => ({ all: async () => ({ results: ids.map((i) => rows[i]).filter(Boolean) }) }) }) },
  };
}
const embed = async () => [[0.1]];

test('relevance decides which items make the answer; A goes before B among those; C and Mild left out unless asked', async () => {
  const many = Object.fromEntries([...Array.from({ length: 6 }, (_, i) => [`b${i}`, row(`b${i}`, 'B')]), ['far', row('far', 'A')]]);
  const near = await searchLibrary(env(many, ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'far']), embed, { query: 'teleport', limit: 3 });
  assert.deepEqual(near.cards.map((x) => x.id), ['b0', 'b1', 'b2'], 'a far-off A item does not push relevant B items out');
  const rows = { b: row('b', 'B'), c: row('c', 'C'), a1: row('a1', 'A'), m: row('m', 'A', { maturity: 'Mild' }), a2: row('a2', 'A', { roblox_asset_id: 42 }) };
  const r = await searchLibrary(env(rows, ['b', 'c', 'a1', 'm', 'a2']), embed, { query: 'crate' });
  assert.deepEqual(r.cards.map((x) => x.id), ['a1', 'a2', 'b']);
  assert.deepEqual(r.cards.map((x) => x.uploaded), [false, true, false]);
  assert.equal(r.cards[0].line, 'a a1');
  const mild = await searchLibrary(env(rows, ['m']), embed, { query: 'spooky', allowMild: true });
  assert.deepEqual(mild.cards.map((x) => x.id), ['m']);
});

test('kind and family become index filters; the limit is held to 1-12; an empty query is refused', async () => {
  const seen = {};
  const rows = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`x${i}`, row(`x${i}`, 'B')]));
  const r = await searchLibrary(env(rows, Object.keys(rows), seen), embed, { query: 'wall', kind: 'building', family: 'oga:village', limit: 99 });
  assert.deepEqual(seen.opts.filter, { kind: 'building', family: 'oga:village' });
  assert.equal(r.cards.length, 12);
  assert.match((await searchLibrary(env(rows, []), embed, { query: '  ' })).error, /query/);
  assert.equal(offered({ grade: 'B', maturity: 'Mild' }), false);
});

test('the admin route sits behind the /api/admin guard and only reads', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(src, /app\.get\('\/api\/admin\/library\/search'/);
  const lib = readFileSync(new URL('../src/library-search.ts', import.meta.url), 'utf8');
  assert.equal(/\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b/i.test(lib), false);
});

test('a set comes from the family of the best match, searched again within it', async () => {
  const seen = [];
  const rows = { a: row('a', 'A', { family: 'oga:village' }), b: row('b', 'B', { family: 'kenney:town' }), c: row('c', 'B', { family: 'oga:village' }) };
  const e = { LIBRARY: { query: async (_v, opts) => { seen.push(opts.filter); return { matches: (opts.filter?.family ? ['a', 'c'] : ['a', 'b', 'c']).map((item) => ({ metadata: { item } })) }; } },
    CORPUS: { prepare: () => ({ bind: (...ids) => ({ all: async () => ({ results: ids.map((i) => rows[i]).filter(Boolean) }) }) }) } };
  const r = await searchLibrary(e, embed, { query: 'a village: houses and a well', oneFamily: true });
  assert.deepEqual(r.cards.map((x) => x.id), ['a', 'c']);
  assert.deepEqual(seen.at(-1), { family: 'oga:village' });
});
