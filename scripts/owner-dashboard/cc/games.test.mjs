// The rbxl games API (games-api.mjs) against a fixture directory.
//   node --test scripts/owner-dashboard/cc/games.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'games-'));
process.env.STUDPILOT_DASH_GAMES_DIR = dir;
const { games, gamesRoute } = await import('../games-api.mjs');
const q = (o) => new URLSearchParams(o);
const names = (d) => d.page.rows.map((c) => c.name);

const ID = 'a'.repeat(64); const MISSING = 'missing:grow a garden.rbxl';
const stages = { extracted: 1, native: 0, inserted: 0, visual: 0, gameplay: 0, published: 0 };
const comp = (i, service, instances) => ({ id: String(i), name: `Part${i}`, class: 'Model', service, instances, scripts: 0, media: 2, mediaVerified: 1, percent: 16.7, stages, issues: [] });
const components = [comp(1, 'Workspace', 10), comp(2, 'Workspace', 30), comp(3, 'Lighting', 5), { ...comp(4, 'Workspace', 20), name: 'Door', class: 'Part', percent: 50 }];
const head = (id, name) => ({ id, name, paths: ['/x/' + name], bytes: 1, status: 'indexed', failures: [{ kind: 'k', he: 'כשל', detail: 'd' }], instances: 65, componentCount: 4, stages, percent: 16.7, weight: 65 });

test('missing index answers ok:false with the command that builds it', () => {
  process.env.STUDPILOT_DASH_GAMES_DIR = path.join(dir, 'nothing-here');
  const d = games(null);
  process.env.STUDPILOT_DASH_GAMES_DIR = dir;
  assert.equal(d.ok, false);
  assert.equal(d.hint, 'python3 scripts/owner-dashboard/games.py');
});

fs.mkdirSync(path.join(dir, 'games'));
fs.writeFileSync(path.join(dir, 'games.json'), JSON.stringify({ schema: 1, stageOrder: Object.keys(stages), summary: { games: 2, percent: 17 }, games: [head(ID, 'one.rbxl'), head(MISSING, 'grow a garden.rbxl')] }));
fs.writeFileSync(path.join(dir, 'games', `${ID}.json`), JSON.stringify({ ...head(ID, 'one.rbxl'), components }));
fs.writeFileSync(path.join(dir, 'games', 'missing_grow_a_garden.rbxl.json'), JSON.stringify({ ...head(MISSING, 'grow a garden.rbxl'), components: [] }));

test('index is returned whole', () => {
  const d = games(null);
  assert.equal(d.ok, true);
  assert.equal(d.games.length, 2);
  assert.equal(d.summary.percent, 17);
});

test('one game: header, failures, services and a server-side page of components', () => {
  const d = games(ID, q({ limit: '2' }));
  assert.equal(d.name, 'one.rbxl');
  assert.equal(d.failures[0].he, 'כשל');
  assert.deepEqual(d.services.map((s) => [s.service, s.components, s.instances]), [['Workspace', 3, 60], ['Lighting', 1, 5]]);
  assert.equal(d.page.total, 4);
  assert.deepEqual(names(d), ['Part2', 'Door']); // instances, descending
  assert.equal(d.components, undefined);
  assert.deepEqual(names(games(ID, q({ limit: '2', off: '2' }))), ['Part1', 'Part3']);
});

test('search, service filter and sort', () => {
  assert.deepEqual(names(games(ID, q({ q: 'door' }))), ['Door']);
  assert.deepEqual(names(games(ID, q({ q: 'model' }))), ['Part2', 'Part1', 'Part3']); // matches the class too
  assert.equal(games(ID, q({ service: 'Lighting' })).page.total, 1);
  assert.equal(names(games(ID, q({ sort: 'percent' })))[0], 'Door');
  assert.equal(names(games(ID, q({ sort: 'percent-asc' })))[3], 'Door');
  assert.equal(names(games(ID, q({ sort: 'name' })))[0], 'Door');
});

test('a missing:<name> game maps to its safe file name; an unknown id is refused', () => {
  const d = games(MISSING);
  assert.equal(d.ok, true);
  assert.equal(d.page.total, 0);
  assert.equal(games('b'.repeat(64)).ok, false);
  assert.equal(games('../../etc/passwd').ok, false);
});

test('route: GET only, validates the id, answers JSON', async () => {
  const srv = http.createServer((req, res) => { if (!gamesRoute(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${srv.address().port}${p}`); return [r.status, await r.json().catch(() => null)]; };
  try {
    assert.equal((await get('/api/cc/games'))[1].games.length, 2);
    assert.equal((await get(`/api/cc/games/${ID}?limit=1`))[1].page.rows.length, 1);
    assert.equal((await get(`/api/cc/games/${encodeURIComponent(MISSING)}`))[1].ok, true);
    assert.equal((await get('/api/cc/games/..%2F..%2Fetc%2Fpasswd'))[0], 400);
    assert.equal((await get('/api/cc/games/%E0%A4%A'))[0], 400);
    assert.equal((await get('/api/cc/library'))[0], 404);
  } finally { srv.close(); }
});
