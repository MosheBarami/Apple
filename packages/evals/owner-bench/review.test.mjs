/** The review step (review.mjs): the sheet and the lower-only apply, against a fake server. No network, no credits. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CRITERIA } from './run.mjs';
import { applyAdjustments, main, reviewSheet } from './review.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'ownerbench-review-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const PROJ = 'aaaaaaaa-0000-4000-8000-000000000001';
const IMG = '11111111-2222-3333-4444-555555555555';
const SCORES = { works: 2, professional: 2, matches: 1, polished: 1, noErrors: 2, performance: 2, sound: 0, animation: 1, fx: 1 };
const sum = (s) => CRITERIA.reduce((a, k) => a + s[k], 0);
const row = (over = {}) => ({
  id: 'o01', category: 'object', turns: ['make a chest'], status: 'done', credits: 12, seconds: 90, steps: 7, scores: { ...SCORES }, total: sum(SCORES),
  critique: ['looks plain'], eval: { census: { parts: 9, scripts: 1 }, play: { ok: true, verdict: 'ok', errors: [] }, images: [{ name: 'front', path: `/api/projects/${PROJ}/images/${IMG}` }, { name: 'top', path: `/api/projects/${PROJ}/images/${IMG}` }], problems: ['camera top: far'] }, ...over,
});
/** A results file in its own folder so photo folders never collide between tests. */
function setup(rows, { photos = [] } = {}) {
  const dir = join(tmp, `d${++n}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'run.json');
  for (const name of photos) { mkdirSync(join(dir, 'run', 'o01'), { recursive: true }); writeFileSync(join(dir, 'run', 'o01', `${name}.png`), 'png'); }
  writeFileSync(file, JSON.stringify(rows));
  return { dir, file };
}
const boom = () => { throw new Error('the network was touched'); };

test('the sheet lists request, scores, critique, census, play test and photo paths; missing photos are flagged, unjudged items are not zeros', async () => {
  const { dir, file } = setup([row(), { id: 'o02', category: 'silly', turns: ['a robot'], status: 'error', error: 'no studio' }], { photos: ['front'] });
  const { out, sheet } = await main(['sheet', file, '--offline'], { log: () => {}, fetch: boom });
  assert.equal(out, join(dir, 'run', 'review.md'));
  assert.equal(readFileSync(out, 'utf8'), sheet);
  assert.match(sheet, /## o01 \(object\) status: done/);
  assert.match(sheet, /Request: make a chest/);
  assert.match(sheet, /Scores \(12\/18\): works=2 professional=2/);
  assert.match(sheet, /- looks plain/);
  assert.match(sheet, /Census: parts=9 scripts=1/);
  assert.match(sheet, /Problems: camera top: far/);
  assert.ok(sheet.includes(`- front: ${join(dir, 'run', 'o01', 'front.png')}`), 'absolute path of a saved photo');
  assert.match(sheet, /- top: MISSING \(not on disk \(offline\)\)/);
  assert.match(sheet, /## o02 \(silly\) status: error\n[\s\S]*Error: no studio\nScores: none \(unmeasured, not zero\)/);
  assert.match(sheet, /1 of 2 items judged/);
});

test('missing photos are downloaded with a signed-in fetch and saved where the sheet says; saved photos need no sign-in', async () => {
  const { dir, file } = setup([row()], { photos: ['front'] });
  const got = [];
  const fetchStub = async (url, init = {}) => {
    if (url.includes('supabase')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok-aaaaaaaa.bbbbbbbb.cccccccc', expires_in: 3600 }) };
    got.push({ url, auth: init.headers?.Authorization });
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  const env = { APPLE_E2E_EMAIL: 'a@b.c', APPLE_E2E_PASSWORD: 'pw-aaaaaaaa', API_BASE: 'https://api.test' };
  const { sheet } = await main(['sheet', file], { log: () => {}, fetch: fetchStub, env, anonKey: 'anon' });
  assert.deepEqual(got.map((g) => g.url), [`https://api.test/api/projects/${PROJ}/images/${IMG}`], 'only the missing photo (top) is fetched');
  assert.equal(got[0].auth, 'Bearer tok-aaaaaaaa.bbbbbbbb.cccccccc');
  assert.ok(existsSync(join(dir, 'run', 'o01', 'top.png')));
  assert.ok(sheet.includes(join(dir, 'run', 'o01', 'top.png')));
  assert.ok(!sheet.includes('MISSING'));
  await main(['sheet', file], { log: () => {}, fetch: boom, env: {}, anonKey: 'anon' });
});

test('an expired photo is listed as missing with its HTTP status, not a crash', async () => {
  const { file } = setup([row()]);
  const fetchStub = async (url) => (url.includes('supabase') ? { ok: true, status: 200, json: async () => ({ access_token: 'tok-aaaaaaaa.bbbbbbbb.cccccccc', expires_in: 3600 }) } : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
  const { sheet } = await main(['sheet', file], { log: () => {}, fetch: fetchStub, env: { APPLE_E2E_EMAIL: 'a@b.c', APPLE_E2E_PASSWORD: 'pw-aaaaaaaa' }, anonKey: 'anon' });
  assert.match(sheet, /- front: MISSING \(HTTP 404\)/);
});

test('apply lowers a score with its reason, keeps the original, and recomputes the total', () => {
  const rows = [row()];
  const { applied, ignored } = applyAdjustments(rows, [{ id: 'o01', scores: { professional: 0, fx: 0 }, reason: 'photo 1: flat grey box' }], { now: () => Date.parse('2026-10-02T12:00:00Z') });
  assert.deepEqual(applied.map((a) => [a.criterion, a.from, a.to]), [['professional', 2, 0], ['fx', 1, 0]]);
  assert.equal(ignored.length, 0);
  const r = rows[0];
  assert.equal(r.scores.professional, 0);
  assert.equal(r.total, 9);
  assert.equal(r.originalTotal, 12);
  assert.equal(r.originalScores.professional, 2);
  assert.deepEqual(r.adjustments[0], { at: '2026-10-02T12:00:00.000Z', criterion: 'professional', from: 2, to: 0, reason: 'photo 1: flat grey box' });
});

test('apply never raises: equal or higher values, a missing reason, bad values and unknown things are ignored and change nothing', () => {
  const rows = [row()];
  const before = JSON.stringify(rows);
  const { applied, ignored } = applyAdjustments(rows, [
    { id: 'o01', scores: { works: 2, matches: 2, sound: 2 }, reason: 'raise attempt' },
    { id: 'o01', scores: { fx: 0 }, reason: '   ' },
    { id: 'o01', scores: { fx: 0.5, animation: -1, polished: '0' }, reason: 'bad values' },
    { id: 'o01', scores: { vibes: 0 }, reason: 'unknown criterion' },
    { id: 'zz', scores: { fx: 0 }, reason: 'no such item' },
    { id: 'o01', reason: 'no scores' },
  ]);
  assert.equal(applied.length, 0);
  assert.equal(ignored.length, 3 + 1 + 3 + 1 + 1 + 1);
  assert.equal(JSON.stringify(rows), before, 'the row is byte-for-byte unchanged');
});

test('apply is idempotent, can lower further, and cannot touch an item with no scores', () => {
  const rows = [row(), { id: 'o02', category: 'silly', status: 'error' }];
  const adj = [{ id: 'o01', scores: { fx: 0 }, reason: 'r1' }];
  assert.equal(applyAdjustments(rows, adj).applied.length, 1);
  assert.equal(applyAdjustments(rows, adj).applied.length, 0, 'the second pass finds nothing lower');
  assert.equal(applyAdjustments(rows, [{ id: 'o01', scores: { works: 1, fx: 1 }, reason: 'r2' }]).applied.length, 1, 'works lowered; fx 0 -> 1 refused');
  assert.equal(rows[0].scores.fx, 0);
  assert.equal(rows[0].originalScores.works, 2, 'the judge original survives repeated reviews');
  assert.equal(rows[0].adjustments.length, 2);
  const none = applyAdjustments(rows, [{ id: 'o02', scores: { fx: 0 }, reason: 'x' }]);
  assert.match(none.ignored[0].why, /no scores/);
  assert.throws(() => applyAdjustments(rows, {}), /array/);
});

test('apply from the CLI rewrites the results file (or --out), honours --dry-run, and the reviewed numbers reach score.mjs', async () => {
  const { dir, file } = setup([row()]);
  const adj = join(dir, 'adjustments.json');
  writeFileSync(adj, JSON.stringify([{ id: 'o01', scores: { professional: 1 }, reason: 'photo 2: no detail' }]));
  const lines = [];
  await main(['apply', file, adj, '--dry-run'], { log: (l) => lines.push(l) });
  assert.equal(JSON.parse(readFileSync(file, 'utf8'))[0].scores.professional, 2, 'dry run writes nothing');
  assert.match(lines.join('\n'), /1 lowered, 0 ignored \(dry run/);
  const out = join(dir, 'reviewed.json');
  await main(['apply', file, adj, '--out', out], { log: () => {}, fetch: boom });
  assert.equal(JSON.parse(readFileSync(file, 'utf8'))[0].scores.professional, 2, 'the original file is kept when --out is given');
  assert.equal(JSON.parse(readFileSync(out, 'utf8'))[0].scores.professional, 1);
  await main(['apply', file, adj], { log: () => {} });
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(rows[0].total, 11);
  const scoreFile = new URL('./score.mjs', import.meta.url);
  if (existsSync(scoreFile)) {
    const { scoreRun } = await import(scoreFile);
    assert.equal(scoreRun(rows).per.professional, 1);
    assert.equal(scoreRun(rows).meanTotal, 11);
  }
  await assert.rejects(main(['apply'], {}), /usage/);
});

test('reviewSheet shows what an earlier review changed', () => {
  const rows = [row()];
  applyAdjustments(rows, [{ id: 'o01', scores: { fx: 0 }, reason: 'no particles in photo 3' }]);
  const sheet = reviewSheet({ rows, photos: new Map(), runName: 'r' });
  assert.match(sheet, /Judge's original: .*\(12\/18\); already lowered 1 time/);
  assert.match(sheet, /- fx 1 -> 0: no particles in photo 3/);
});
