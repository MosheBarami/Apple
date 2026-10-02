/** The headless owner-bench runner (run.mjs) against a fake server and a fake socket: no network, no credits. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CRITERIA, createApi, createAuth, main, parseArgs, planRun, runBench, scrub, selectItems, turn, whenIdle } from './run.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'ownerbench-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const fresh = () => join(tmp, `run${++n}.json`);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (tag, expSec) => `${b64({ alg: 'none' })}.${b64({ sub: tag, exp: expSec })}.sig-${tag}-0123456789`;
const UUID = '11111111-2222-3333-4444-555555555555';
const SCORES = { works: 2, professional: 1, matches: 2, polished: 1, noErrors: 2, performance: 2, sound: 0, animation: 1, fx: 0 };
const bank = { version: 't-v1', items: [
  { id: 'a1', category: 'object', turns: ['build a chest'] },
  { id: 'a2', category: 'game', turns: ['make a game', 'make it harder'] },
  { id: 'a3', category: 'ui', turns: ['a shop screen'] },
] };

/**
 * A fake worker plus socket. `turns[text]` says how a chat turn ends: { frames: [...] } or { hang: true };
 * `reset` / `evaluate` may be functions of the call count for 409 and failure cases.
 */
function world(opts = {}) {
  const clock = { t: Date.parse('2026-10-02T10:00:00Z') };
  const calls = [];
  const sockets = [];
  const log = [];
  let assistant = [], resets = 0, evals = 0;
  const turns = opts.turns ?? {};
  const json = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body), json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const auth = init.headers?.Authorization;
    if (u.host.includes('supabase')) {
      calls.push({ method, path: `auth:${u.searchParams.get('grant_type')}`, body: JSON.parse(init.body) });
      return opts.auth ? opts.auth(JSON.parse(init.body), u.searchParams.get('grant_type')) : json(200, { access_token: jwt('fresh', clock.t / 1000 + 3600), refresh_token: 'rt-2-abcdefgh', expires_in: 3600 });
    }
    const path = u.pathname.replace(/^\/api\/projects\/aaaaaaaa-0000-4000-8000-000000000001/, '') + u.search;
    calls.push({ method, path, body: init.body ? JSON.parse(init.body) : undefined, auth });
    if (opts.unauthorizedOnce && path === '/checkpoints' && calls.filter((c) => c.path === '/checkpoints').length === 1) return json(401, { error: 'jwt expired' });
    if (path === '/checkpoints') return json(200, { checkpoints: opts.noBaseline ? [] : [{ id: 'cp-x', label: 'other' }, { id: 'cp-base', label: 'bench-baseline' }] });
    if (path === '/bench/reset') { const r = opts.reset?.(++resets) ?? { status: 200, body: { ok: true, reset: true, left: [] } }; if (r.status === 200) assistant = []; return json(r.status, r.body); }
    if (path === '/restore') return json(200, { ok: true });
    if (path === '/stop') return json(200, { ok: true });
    if (path === '/bench/evaluate') {
      const r = opts.evaluate?.(++evals, init) ?? { status: 200, body: { ok: true, census: { parts: 12 }, play: { ok: true, verdict: 'ok', errors: [] }, images: [{ name: 'front', path: `/api/projects/aaaaaaaa-0000-4000-8000-000000000001/images/${UUID}` }, { name: 'bad', path: '/nope' }], scores: SCORES, critique: ['plain'], total: 11 } };
      return json(r.status, r.body);
    }
    if (path.startsWith('/messages')) return json(200, { messages: [{ role: 'user', content: 'x' }, ...assistant] });
    if (path === `/images/${UUID}`) return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer };
    return json(404, { error: 'not found' });
  };
  class FakeWebSocket {
    constructor(url, protocols) {
      this.url = url; this.protocols = protocols; this.sent = [];
      sockets.push(this);
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'hello', studioConnected: true, quota: { creditsRemaining: 999 } }) }), 0);
    }
    send(s) {
      const m = JSON.parse(s); this.sent.push(m);
      const how = turns[m.text] ?? { frames: [{ type: 'delta', text: 'ok ' }, { type: 'msg_end', stopReason: 'done', creditsSpent: 5 }] };
      if (how.hang) return;
      setTimeout(() => {
        for (const f of how.frames) {
          if (f.type === 'msg_end') { clock.t += how.ms ?? 30_000; if (f.stopReason !== 'quota') assistant.push({ role: 'assistant', creditsSpent: f.creditsSpent ?? 0, toolTrace: [{}, {}] }); }
          this.onmessage?.({ data: JSON.stringify(f) });
        }
        if (how.close) this.onclose?.();
      }, 0);
    }
    close() { this.closed = true; }
  }
  const sleep = async (ms) => { clock.t += ms; };
  return { fetch, WebSocketImpl: FakeWebSocket, sleep, now: () => clock.t, clock, calls, sockets, log, logger: (l) => log.push(l) };
}

const base = 'https://api.test';
function rig(w, over = {}) {
  const file = fresh();
  const getToken = createAuth({ fetch: w.fetch, env: { APPLE_BENCH_JWT: jwt('first', w.clock.t / 1000 + 3600), ...over.env }, now: w.now, anonKey: 'anon' });
  const api = createApi({ fetch: w.fetch, base, projectId: 'aaaaaaaa-0000-4000-8000-000000000001', getToken });
  const args = { items: bank.items, file, photosDir: file.replace(/\.json$/, ''), api, getToken, base, projectId: 'aaaaaaaa-0000-4000-8000-000000000001', WebSocketImpl: w.WebSocketImpl, fetch: w.fetch, sleep: w.sleep, now: w.now, log: w.logger, turnMs: 60, ...over.args };
  return { file, args, run: () => runBench(args) };
}

test('one item follows the browser runner protocol, in order, and the row has the shape score.mjs reads', async () => {
  const w = world();
  const { file, run } = rig(w, { args: { items: [bank.items[1]] } });
  const res = await run();
  assert.deepEqual(w.calls.map((c) => `${c.method} ${c.path}`), ['GET /checkpoints', 'POST /bench/reset', 'POST /restore', 'POST /bench/evaluate', 'GET /images/' + UUID, 'GET /messages?limit=100']);
  assert.equal(w.calls[2].body.checkpointId, 'cp-base', 'the bench-baseline checkpoint, not the first one');
  assert.equal(w.sockets.length, 2, 'one socket per turn');
  assert.deepEqual(w.sockets[0].protocols[0], 'apple.v1');
  assert.ok(w.sockets[0].protocols[1].startsWith('apple.jwt.'));
  assert.equal(w.sockets[0].url, 'wss://api.test/api/projects/aaaaaaaa-0000-4000-8000-000000000001/ws');
  assert.deepEqual(w.sockets[0].sent, [{ type: 'chat', text: 'make a game', mode: 'agent' }]);
  assert.equal(w.calls[3].body.request, 'make a game → then: make it harder');
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(rows));
  const [r] = rows;
  assert.equal(r.status, 'done');
  assert.equal(r.credits, 10, 'summed from the stored assistant messages');
  assert.equal(r.steps, 4);
  assert.equal(r.seconds, 60, 'two 30s turns');
  assert.equal(r.total, 11);
  assert.deepEqual(r.scores, SCORES);
  assert.equal(r.photos.length, 2);
  assert.ok(existsSync(join(file.replace(/\.json$/, ''), 'a2', 'front.png')));
  assert.equal(r.photos[0].file, `${file.split('/').pop().replace(/\.json$/, '')}/a2/front.png`);
  assert.ok(r.photos[1].error, 'a photo without a usable path is recorded, not fatal');
  assert.equal(res.spent, 10);
  const scoreFile = new URL('./score.mjs', import.meta.url);
  if (existsSync(scoreFile)) {
    const { scoreRun } = await import(scoreFile);
    const s = scoreRun(rows);
    assert.equal(s.judged, 1);
    assert.equal(s.credits, 10);
  }
});

test('credits are counted after evaluate, not before', async () => {
  const w = world();
  await rig(w, { args: { items: [bank.items[0]] } }).run();
  const order = w.calls.map((c) => c.path);
  assert.ok(order.indexOf('/messages?limit=100') > order.indexOf('/bench/evaluate'));
});

test('a turn that outlasts the cap is stopped over HTTP, then evaluated', async () => {
  const w = world({ turns: { 'build a chest': { hang: true } } });
  const { file, run } = rig(w, { args: { items: [bank.items[0]] } });
  await run();
  const paths = w.calls.map((c) => c.path);
  assert.ok(paths.includes('/stop'));
  assert.ok(paths.indexOf('/stop') < paths.indexOf('/bench/evaluate'), 'stop first, evaluate once the run has ended');
  const [r] = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(r.turnResults[0].stopReason, 'timeout');
  assert.equal(r.status, 'done');
  assert.ok(w.sockets[0].closed);
});

test('a turn that does not end done breaks the turn loop but is still evaluated', async () => {
  const w = world({ turns: { 'make a game': { frames: [{ type: 'msg_end', stopReason: 'stopped', creditsSpent: 3 }] } } });
  const { file, run } = rig(w, { args: { items: [bank.items[1]] } });
  await run();
  const [r] = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(w.sockets.length, 1, 'the second turn never starts');
  assert.equal(r.turnResults[0].stopReason, 'stopped');
  assert.ok(w.calls.some((c) => c.path === '/bench/evaluate'));
});

test('a terminal error, a socket close and a socket error each end the turn', async () => {
  const w = world({ turns: {
    'build a chest': { frames: [{ type: 'error', terminal: true, code: 'agent_failed', message: 'boom' }] },
    'make a game': { frames: [], close: true },
  } });
  const { file, run } = rig(w, { args: { items: [bank.items[0], { ...bank.items[1], turns: ['make a game'] }] } });
  await run();
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(rows[0].turnResults[0].stopReason, 'error');
  assert.equal(rows[0].turnResults[0].error, 'agent_failed: boom');
  assert.equal(rows[1].turnResults[0].stopReason, 'ws-closed');
  const lone = await turn({ text: 'x', WebSocketImpl: class { constructor() { setTimeout(() => this.onerror(), 0); } close() {} }, base, projectId: 'p', getToken: async () => 'tok', now: () => 0, turnMs: 500 });
  assert.equal(lone.stopReason, 'ws-error');
});

test('a quota stop or an unapproved account ends the whole run without evaluating or starting the next item', async () => {
  for (const [frame, why] of [[{ type: 'msg_end', stopReason: 'quota' }, 'quota'], [{ type: 'error', terminal: true, code: 'account_not_approved', message: 'no' }, 'account_not_approved']]) {
    const w = world({ turns: { 'build a chest': { frames: [frame] } } });
    const { file, run } = rig(w);
    const res = await run();
    assert.equal(res.aborted, why);
    assert.ok(!w.calls.some((c) => c.path === '/bench/evaluate'), 'no paid judge call');
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).length, 1, 'later items are not started');
  }
});

test('whenIdle retries a 409 "run in progress" every 15s and gives up after the cap', async () => {
  const w = world();
  let k = 0;
  const r = await whenIdle(async () => (++k < 4 ? { status: 409, error: 'a run is in progress' } : { status: 200, ok: true }), { sleep: w.sleep, now: w.now });
  assert.equal(r.status, 200);
  assert.equal(k, 4);
  assert.equal(w.clock.t - Date.parse('2026-10-02T10:00:00Z'), 45_000);
  const t0 = w.clock.t;
  let calls = 0;
  const stuck = await whenIdle(async () => { calls++; return { status: 409, error: 'a run is in progress' }; }, { sleep: w.sleep, now: w.now, idleWaitMs: 600_000 });
  assert.equal(stuck.status, 409);
  assert.ok(w.clock.t - t0 >= 600_000 && w.clock.t - t0 <= 615_000, 'about ten minutes, no longer');
  assert.ok(calls > 30);
  const other = await whenIdle(async () => ({ status: 409, error: 'Studio is not connected' }), { sleep: w.sleep, now: w.now });
  assert.equal(other.error, 'Studio is not connected', 'any other 409 is returned at once');
});

test('reset waits out a busy session; an evaluate that never gets in leaves an error row that still counts its credits', async () => {
  const w = world({ reset: (n) => (n < 3 ? { status: 409, body: { ok: false, error: 'a run is in progress' } } : { status: 200, body: { ok: true } }) });
  const first = rig(w, { args: { items: [bank.items[0]] } });
  await first.run();
  assert.equal(JSON.parse(readFileSync(first.file, 'utf8'))[0].status, 'done');
  assert.equal(w.calls.filter((c) => c.path === '/bench/reset').length, 3);

  const w2 = world({ evaluate: () => ({ status: 409, body: { ok: false, error: 'Studio is not connected' } }) });
  const second = rig(w2, { args: { items: [bank.items[0]] } });
  await second.run();
  const [r] = JSON.parse(readFileSync(second.file, 'utf8'));
  assert.equal(r.status, 'error');
  assert.match(r.error, /evaluate failed \(HTTP 409\).*Studio is not connected/);
  assert.equal(r.credits, 5, 'the build was paid for even though it could not be judged');
});

test('a judge answer without scores is "unjudged", never a zero or a pass', async () => {
  const w = world({ evaluate: () => ({ status: 200, body: { ok: true, judgeRaw: 'garbled', images: [] } }) });
  const { file, run } = rig(w, { args: { items: [bank.items[0]] } });
  await run();
  const [r] = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(r.status, 'unjudged');
  assert.equal(r.scores, undefined);
});

test('the credit budget is hard: no item starts once spent >= budget, and it counts what the file already holds', async () => {
  const w = world();
  const { file, run } = rig(w, { args: { maxCredits: 10 } });
  const res = await run();
  assert.equal(res.aborted, 'budget');
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(rows.map((r) => r.id), ['a1', 'a2'], 'a1 (5) then a2 (10 in total 15) then a3 refused');
  assert.equal(res.spent, 15);

  // The same file, a bigger budget: a3 runs; a1 and a2 are done and cost nothing again.
  const w2 = world();
  const again = await runBench({ ...rig(w2).args, file, photosDir: file.replace(/\.json$/, ''), maxCredits: 16 });
  assert.equal(again.aborted, null);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).map((r) => r.id), ['a1', 'a2', 'a3']);
  assert.equal(w2.sockets.length, 1, 'only a3 was chatted');
  assert.equal(w2.calls.filter((c) => c.path === '/bench/evaluate').length, 1);

  const w3 = world();
  const spent = await runBench({ ...rig(w3).args, file, photosDir: file.replace(/\.json$/, ''), maxCredits: 1 });
  assert.equal(spent.aborted, null, 'nothing left to run, so the budget is never hit');
  assert.equal(w3.sockets.length, 0);
});

test('resume skips done rows, reruns an errored row, and keeps its earlier credits in the total', async () => {
  const file = fresh();
  writeFileSync(file, JSON.stringify([
    { id: 'a1', category: 'object', turns: ['build a chest'], status: 'done', credits: 7, scores: SCORES, total: 11 },
    { id: 'a3', category: 'ui', turns: ['a shop screen'], status: 'error', credits: 4, error: 'earlier' },
  ]));
  const w = world();
  const res = await runBench({ ...rig(w).args, file, photosDir: file.replace(/\.json$/, '') });
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(rows.find((r) => r.id === 'a1').credits, 7, 'untouched');
  assert.equal(rows.find((r) => r.id === 'a3').credits, 9, '4 before + 5 now');
  assert.equal(rows.find((r) => r.id === 'a3').status, 'done');
  assert.deepEqual(rows.map((r) => r.id).sort(), ['a1', 'a2', 'a3']);
  assert.equal(res.ran, 2);
  assert.equal(w.calls.filter((c) => c.path === '/bench/evaluate').length, 2);
});

test('a changed request for a recorded done item is refused (version the bank instead)', () => {
  const rows = [{ id: 'a1', status: 'done', turns: ['something else'] }];
  assert.throws(() => planRun({ items: bank.items, rows }), /differs from the recorded one/);
  assert.equal(planRun({ items: bank.items, rows, redo: true }).plan[0].action, 'run');
});

test('a project without a bench-baseline checkpoint stops before anything is spent', async () => {
  const w = world({ noBaseline: true });
  await assert.rejects(rig(w).run(), /no bench-baseline checkpoint/);
  assert.equal(w.sockets.length, 0);
  assert.ok(!w.calls.some((c) => c.path === '/bench/reset'));
});

test('selection: --from, --only/--ids, unknown ids', () => {
  assert.deepEqual(selectItems(bank.items, { from: 'a2' }).map((i) => i.id), ['a2', 'a3']);
  assert.deepEqual(selectItems(bank.items, { ids: ['a3', 'a1'] }).map((i) => i.id), ['a1', 'a3'], 'bank order');
  assert.deepEqual(selectItems(bank.items, { from: 'a2', ids: ['a1', 'a3'] }).map((i) => i.id), ['a3']);
  assert.throws(() => selectItems(bank.items, { ids: ['zz'] }), /unknown item id "zz"/);
  const o = parseArgs(['--project', 'p', '--only', 'a1', '--ids', 'a2,a3', '--max-credits', '40', '--dry-run', '--from', 'a1']);
  assert.deepEqual(o.ids, ['a1', 'a2', 'a3']);
  assert.equal(o.maxCredits, 40);
  assert.throws(() => parseArgs(['--max-credits', '0']), /positive/);
  assert.throws(() => parseArgs(['--max-credits']), /needs a value/);
  assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
});

test('--dry-run prints the plan and touches neither the network, the sign-in nor the disk', async () => {
  const dir = join(tmp, 'dry');
  const bankFile = join(tmp, 'bank.json');
  writeFileSync(bankFile, JSON.stringify(bank));
  const lines = [];
  const boom = () => { throw new Error('the network was touched'); };
  const res = await main(['--bank', bankFile, '--run', 'plan', '--max-credits', '30', '--ids', 'a1,a3', '--dry-run'], { log: (l) => lines.push(l), fetch: boom, WebSocketImpl: boom, resultsDir: dir, env: {} });
  assert.deepEqual(res.plan.map((p) => p.id), ['a1', 'a3']);
  assert.match(lines.join('\n'), /DRY RUN/);
  assert.match(lines.join('\n'), /budget 30/);
  assert.ok(!existsSync(dir), 'no results file or folder');
});

test('main runs end to end on a fake server, writes results/<run>.json, and no secret reaches the log or the file', async () => {
  const dir = join(tmp, 'main');
  const bankFile = join(tmp, 'bank2.json');
  writeFileSync(bankFile, JSON.stringify({ version: 't-v1', items: [bank.items[0]] }));
  const w = world({ evaluate: () => ({ status: 500, body: { ok: false, error: `leaked ${'S3CRETPASSWORD'}` } }) });
  const env = { APPLE_E2E_EMAIL: 'bench@example.com', APPLE_E2E_PASSWORD: 'S3CRETPASSWORD', API_BASE: base };
  const res = await main(['--bank', bankFile, '--run', 'e2e', '--project', 'aaaaaaaa-0000-4000-8000-000000000001'], { log: w.logger, fetch: w.fetch, WebSocketImpl: w.WebSocketImpl, sleep: w.sleep, now: w.now, resultsDir: dir, env, anonKey: 'anon', turnMs: 60 });
  assert.equal(res.ran, 1);
  const text = readFileSync(join(dir, 'e2e.json'), 'utf8');
  assert.ok(!text.includes('S3CRETPASSWORD'), 'the results file holds no secret');
  assert.ok(!w.log.join('\n').includes('S3CRETPASSWORD'));
  assert.ok(w.calls[0].path === 'auth:password', 'signed in with the password grant');
  assert.ok(!w.log.join('\n').includes('sig-'), 'no token in the log');
  assert.equal(JSON.parse(text)[0].status, 'error');
});

test('auth: a token near expiry is refreshed with the refresh token; a 401 forces one refresh and retries', async () => {
  const w = world();
  const soon = jwt('old', w.clock.t / 1000 + 60);
  const getToken = createAuth({ fetch: w.fetch, env: { APPLE_BENCH_JWT: soon, APPLE_BENCH_REFRESH_TOKEN: 'rt-1-abcdefgh' }, now: w.now, anonKey: 'anon' });
  const t1 = await getToken();
  assert.notEqual(t1, soon, 'within two minutes of expiry: refreshed');
  assert.deepEqual(w.calls[0], { method: 'POST', path: 'auth:refresh_token', body: { refresh_token: 'rt-1-abcdefgh' } });
  assert.equal(await getToken(), t1, 'a fresh token is reused');
  w.clock.t += 3_500_000;
  const t2 = await getToken();
  assert.ok(w.calls.filter((c) => c.path.startsWith('auth:')).length === 2, 'expired again, refreshed again');
  assert.equal(w.calls[1].body.refresh_token, 'rt-2-abcdefgh', 'the rotated refresh token is the one used next');
  assert.ok(t2);

  const w2 = world({ unauthorizedOnce: true });
  const old = jwt('first', w2.clock.t / 1000 + 3600);
  const gt = createAuth({ fetch: w2.fetch, env: { APPLE_BENCH_JWT: old, APPLE_BENCH_REFRESH_TOKEN: 'rt-1-abcdefgh' }, now: w2.now, anonKey: 'anon' });
  const api = createApi({ fetch: w2.fetch, base, projectId: 'aaaaaaaa-0000-4000-8000-000000000001', getToken: gt });
  const r = await api('/checkpoints', null, 'GET');
  assert.equal(r.status, 200, 'retried after a 401');
  const cps = w2.calls.filter((c) => c.path === '/checkpoints');
  assert.equal(cps.length, 2);
  assert.equal(cps[0].auth, `Bearer ${old}`);
  assert.notEqual(cps[1].auth, cps[0].auth);
});

test('auth: no sign-in source is an error that names variables, never values; a failed grant says only the status', async () => {
  assert.throws(() => createAuth({ fetch: async () => {}, env: {}, anonKey: 'a' }), /APPLE_BENCH_JWT.*APPLE_E2E_EMAIL/);
  const w = world({ auth: () => ({ ok: false, status: 400, json: async () => ({ error_description: 'S3CRETPASSWORD is wrong' }) }) });
  const getToken = createAuth({ fetch: w.fetch, env: { APPLE_E2E_EMAIL: 'a@b.c', APPLE_E2E_PASSWORD: 'S3CRETPASSWORD' }, now: w.now, anonKey: 'anon' });
  await assert.rejects(getToken(), (e) => /HTTP 400/.test(e.message) && !e.message.includes('S3CRETPASSWORD'));
  assert.equal(scrub('bad S3CRETPASSWORD here', ['S3CRETPASSWORD', undefined, 'short']), 'bad [redacted] here');
});

test('the criteria list matches score.mjs when it is present', async () => {
  const scoreFile = new URL('./score.mjs', import.meta.url);
  if (!existsSync(scoreFile)) return;
  const { CRITERIA: theirs } = await import(scoreFile);
  assert.deepEqual(CRITERIA, theirs);
});
