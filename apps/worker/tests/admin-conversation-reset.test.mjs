/**
 * POST /api/admin/conversation-reset/:id GIVES THE EVALUATION HARNESS A FRESH CONVERSATION IN ONE PROJECT.
 *
 * The harness sends sixty requests to one project. Without this, request 17 is answered with requests 1 to 16 in its
 * history, in the memory a model distilled from them and in the build ledger, so a score measures the pile and not the
 * request. The product has no clear-chat button (New chat starts another project), so the route does what its own actions
 * already do, in one step and for no more:
 *
 *   - the messages go (and their model picks), as `edit_resend` on the FIRST message discards them, and every open tab is
 *     told (`history_truncated`);
 *   - the memory the chats produced is emptied, as the memory editor can empty it;
 *   - the build ledger and the game plan go, as they do when a place is put back (the harness has just done that).
 * The pairing, the checkpoints, the op log, the place and the settings stay. It is NOT `bench-reset`.
 *
 * It deletes a project's chat on the strength of the admin key, which reaches any project by id, so what it REFUSES is the
 * subject of the first half: no key, a malformed id, the wrong owner, no owner on record, an owner who may not build, a run
 * in progress. The second half drives the REAL SessionDO over a real SQLite and asserts what goes and what stays.
 *
 * Run with:  node --test tests/admin-conversation-reset.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sessionHarness } from './session-harness.mjs';
import { STORAGE_KEYS } from '../src/project-state.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `studpilot-admin-conversation-reset-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent',
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

const ADMIN_KEY = 'a-high-entropy-admin-key';
const PROJECT = '1ea443f2-6232-43c1-a8bd-f425e2df4f4d';
const OWNER = '8722e4df-ab9c-47f6-8a57-02f5a5dd1d44';
const STRANGER = '99999999-9999-4999-8999-999999999999';
const CTX = { waitUntil() {}, passThroughOnException() {} };

let session;
let calls;
function fresh() {
  calls = [];
  session = { ownerId: OWNER, initialised: true, resetStatus: 200, resetBody: { ok: true, removedMessages: 4, messagesAfter: 0, memoryCleared: true, planCleared: false, ledgerCleared: true } };
}
fresh();

const sessionDo = {
  idFromName: (n) => { calls.push({ ns: 'SESSION_DO', addressed: n }); return n; },
  get: () => ({
    async fetch(url, init) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ ns: 'SESSION_DO', path: u.pathname, body });
      if (u.pathname === '/owner-check') {
        if (!session.initialised) return Response.json({ error: 'session not initialized' }, { status: 400 });
        if (body?.userId !== session.ownerId) return Response.json({ error: 'owner mismatch' }, { status: 403 });
        return Response.json({ ok: true, projectId: PROJECT, projectName: 'Tower Defence' });
      }
      if (u.pathname === '/conversation-reset') return Response.json(session.resetBody, { status: session.resetStatus });
      return Response.json({ error: 'not found' }, { status: 404 });
    },
  }),
};
const inert = { idFromName: (n) => n, get: () => ({ fetch: async () => Response.json({ ok: true }) }) };
let shipped = [];
const adminDo = {
  idFromName: () => 'singleton',
  get: () => ({
    async fetch(url, init) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      if (u.pathname === '/events' && init?.method === 'POST') {
        shipped.push(...JSON.parse(init.body).events);
        return Response.json({ ok: true, stored: 1, rejected: {} });
      }
      if (u.pathname === '/events') return Response.json({ events: [], retained: 0, truncated: false });
      return Response.json({ counters: [] });
    },
  }),
};
const ENV = () => ({
  ADMIN_KEY, ENVIRONMENT: 'test',
  SESSION_DO: sessionDo, PAIRING_DO: inert, ADMIN_DO: adminDo, QUOTA_DO: inert, BUDGET_DO: inert, DISCORD_DO: inert,
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
});

async function reset(projectId, body, { key = ADMIN_KEY, raw } = {}) {
  const headers = { 'content-type': 'application/json', ...(key ? { 'X-Admin-Key': key } : {}) };
  const res = await app.fetch(
    new Request(`https://studpilot.test/api/admin/conversation-reset/${projectId}`, { method: 'POST', headers, body: raw ?? JSON.stringify(body) }),
    ENV(), CTX,
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}
const touchedDurableObjects = () => calls.filter((c) => c.ns !== 'ADMIN_DO' && (c.addressed !== undefined || c.path !== undefined));
const resetCalls = () => calls.filter((c) => c.ns === 'SESSION_DO' && c.path === '/conversation-reset');

// ------------------------------------------------------------------------------------- the route

test('CONTROL: the owner named correctly gets the reset, and the answer of the session is passed through', async () => {
  fresh();
  const r = await reset(PROJECT, { userId: OWNER });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json, session.resetBody);
  assert.equal(resetCalls().length, 1);
});

test('no admin key, no reset, and no Durable Object is addressed', async () => {
  fresh();
  for (const key of [null, 'wrong-key']) {
    const r = await reset(PROJECT, { userId: OWNER }, { key });
    assert.equal(r.status, 403);
    assert.deepEqual(touchedDurableObjects(), [], 'a refused call must reach no session');
  }
});

test('a DIFFERENT owner is refused, and the session is never asked to delete anything', async () => {
  fresh();
  const r = await reset(PROJECT, { userId: STRANGER });
  assert.equal(r.status, 403);
  assert.match(r.json.error, /owner/i);
  assert.equal(resetCalls().length, 0, 'the key cannot empty a chat by naming the wrong owner');
});

test('a session with no owner on record is refused rather than trusted', async () => {
  fresh();
  session.initialised = false;
  const r = await reset(PROJECT, { userId: OWNER });
  assert.equal(r.status, 409);
  assert.equal(resetCalls().length, 0);
});

test('a project id or owner id that is not a UUID is a 400 before any Durable Object is named', async () => {
  for (const [projectId, body, raw] of [
    ['not-a-uuid', { userId: OWNER }],
    [PROJECT, { userId: 'someone' }],
    [PROJECT, {}],
    [PROJECT, { userId: 42 }],
    [PROJECT, undefined, '{not json'],
  ]) {
    fresh();
    const r = await reset(projectId, body, { raw });
    assert.equal(r.status, 400, `${projectId} ${JSON.stringify(body ?? raw)} was not refused`);
    assert.deepEqual(touchedDurableObjects(), [], 'an invalid id must never become a Durable Object name');
  }
});

test('the ids are lower-cased and trimmed before a Durable Object is named: the session answers to the lower-case id only', async () => {
  fresh();
  const r = await reset(PROJECT.toUpperCase(), { userId: ` ${OWNER.toUpperCase()} ` });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const addressed = calls.filter((c) => c.addressed !== undefined && c.ns === 'SESSION_DO').map((c) => c.addressed);
  assert.deepEqual(addressed, [PROJECT], 'the one session addressed is named by the lower-case id');
  assert.deepEqual(calls.find((c) => c.path === '/owner-check').body, { userId: OWNER });
});

test('a run in progress, and an owner who may not build, are the session\'s refusals and reach the caller unchanged', async () => {
  for (const [status, body] of [[409, { ok: false, error: 'a run is in progress' }], [403, { ok: false, code: 'account_not_approved', error: 'x' }]]) {
    fresh();
    session.resetStatus = status;
    session.resetBody = body;
    const r = await reset(PROJECT, { userId: OWNER });
    assert.equal(r.status, status);
    assert.deepEqual(r.json, body);
  }
});

test('the route asks the session two questions and no more: who owns it, then the reset', async () => {
  fresh();
  await reset(PROJECT, { userId: OWNER });
  assert.deepEqual(calls.filter((c) => c.ns === 'SESSION_DO' && c.path).map((c) => c.path), ['/owner-check', '/conversation-reset']);
});

test('the audit row, as shipped, names the owner whose conversation was emptied, and is filed before the reset', async () => {
  fresh();
  shipped = [];
  await reset(PROJECT, { userId: OWNER });
  await app.fetch(new Request('https://studpilot.test/api/admin/logs?kind=audit', { headers: { 'X-Admin-Key': ADMIN_KEY } }), ENV(), CTX);
  const row = shipped.find((e) => e.kind === 'audit' && String(e.action).includes('admin.conversation-reset'));
  assert.ok(row, `no admin.conversation-reset audit row reached the sink: ${JSON.stringify(shipped.map((e) => e.action))}`);
  assert.equal(row.subject, OWNER);
  const src = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  const start = src.indexOf("app.post('/api/admin/conversation-reset/:id'");
  assert.ok(start > 0, 'the route is not registered');
  const body = src.slice(start, src.indexOf('\napp.', start + 10));
  const audit = body.indexOf("auditAdminAction(c, 'admin.conversation-reset'");
  assert.ok(audit > 0, 'no audit row is filed by the route');
  assert.ok(audit < body.indexOf('conversation-reset\', {'), 'the attempt must be on record before anything is deleted');
});

test('the route is registered once, reaches no outside host and no Supabase, and does not use bench-reset', () => {
  const src = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  assert.equal(src.split("'/api/admin/conversation-reset/:id'").length - 1, 1);
  const start = src.indexOf("app.post('/api/admin/conversation-reset/:id'");
  const body = src.slice(start, src.indexOf('\napp.', start + 10));
  assert.equal(/SUPABASE|getOwnedProject|supa\b|bench-reset|fetch\(\s*['"`]https?:\/\/(?!do\/)/.test(body), false);
});

// ------------------------------------------------------------------- the session, over a real SQLite

const WHEN = 1_700_000_000_000;
function seeded(extra = {}) {
  const h = sessionHarness({ store: [['pluginLastSeen', 0], ...Object.entries(extra.store ?? {})] });
  const add = (id, role, at, content = `${role} ${id}`) => h.sql.exec(`insert into messages(id, role, mode, content, created_at) values(?,?,?,?,?)`, id, role, 'agent', content, at);
  add('m1', 'user', WHEN, 'build a shop for pets');
  add('m2', 'assistant', WHEN + 1);
  add('m3', 'user', WHEN + 2, 'now a tycoon');
  add('m4', 'assistant', WHEN + 3);
  for (const id of ['m1', 'm3']) h.sql.exec(`insert into message_models(message_id, product_model) values(?,?)`, id, 'fast');
  h.store.set('memory', { summary: 'Builds pet shops.', facts: ['likes eggs'] });
  h.store.set('memoryEditedAt', '2026-10-05T10:00:00.000Z');
  h.store.set('buildLedger', [{ id: 'a1b2c3', request: 'build a shop for pets', tool: 'build_object', rootPaths: ['Workspace/Shop'], at: WHEN }]);
  h.store.set('plannedGame', { template: 'tycoon' });
  return h;
}
const messages = (h) => h.sql.exec('select count(*) as n from messages').toArray()[0].n;
const models = (h) => h.sql.exec('select count(*) as n from message_models').toArray()[0].n;
const doReset = async (h) => {
  const res = await h.session.fetch(new Request('https://do/conversation-reset', { method: 'POST' }));
  return { status: res.status, json: await res.json() };
};

test('SESSION: the conversation, its model picks, the memory, the ledger and the plan are gone, and the count says what', async () => {
  const h = seeded();
  assert.equal(messages(h), 4);
  const r = await doReset(h);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json, { ok: true, removedMessages: 4, messagesAfter: 0, memoryCleared: true, planCleared: true, ledgerCleared: true });
  assert.equal(messages(h), 0);
  assert.equal(models(h), 0, 'the model picks of the deleted messages go with them');
  for (const key of ['memory', 'memoryEditedAt', 'buildLedger', 'plannedGame']) assert.equal(h.store.has(key), false, `${key} survived`);
  // idempotent: a second reset removes nothing and says so
  const again = await doReset(h);
  assert.deepEqual(again.json, { ok: true, removedMessages: 0, messagesAfter: 0, memoryCleared: false, planCleared: false, ledgerCleared: false });
});

test('SESSION: every open tab is told, from the FIRST message, exactly as an edit of the first message tells them', async () => {
  const h = seeded();
  await doReset(h);
  assert.deepEqual(h.sent.filter((m) => m.type === 'history_truncated'), [{ type: 'history_truncated', fromMessageId: 'm1', removed: 4 }]);
  const empty = sessionHarness();
  await doReset(empty);
  assert.deepEqual(empty.sent.filter((m) => m.type === 'history_truncated'), [], 'nothing to truncate, nothing announced');
});

test('SESSION: what a user would miss beyond that stays: the pairing, the identity, the checkpoints, the op log, the place state', async () => {
  const keep = { pluginTokenHash: 'hash', pluginTokenIssuedAt: 1, pluginClient: { v: 1 }, pluginPlace: { id: 7 }, pluginState: { placeName: 'EvalBaseplate' }, seq: 9 };
  const h = seeded({ store: keep });
  h.sql.exec(`insert into checkpoints (id, label, kind, created_at) values ('cp1', 'before the shop', 'manual', 1)`);
  h.sql.exec(`insert into oplog (op_id, kind, ok, summary, created_at) values ('op1', 'create', 1, 'made a part', 1)`);
  const bind = h.store.get('bind');
  await doReset(h);
  assert.deepEqual(h.store.get('bind'), bind, 'the project keeps its identity');
  for (const [k, v] of Object.entries(keep)) assert.deepEqual(h.store.get(k), v, `${k} was touched`);
  assert.equal(h.sql.exec('select count(*) as n from checkpoints').toArray()[0].n, 1, 'checkpoints stay');
  assert.equal(h.sql.exec('select count(*) as n from oplog').toArray()[0].n, 1, 'the op log stays');
});

test('SESSION: it deletes only keys the project-state table marks as the work, never a key of the pairing or the identity', () => {
  const src = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const start = src.indexOf("path === '/conversation-reset'");
  assert.ok(start > 0, 'the session route is missing');
  const body = src.slice(start, src.indexOf("path === '/bench-evaluate'", start));
  const list = /for \(const key of \[([^\]]+)\]\)/.exec(body);
  assert.ok(list, 'the route no longer names the keys it deletes in one list');
  const keys = list[1].split(',').map((k) => k.trim().replace(/^'|'$/g, '')).map((k) => (k === 'LEDGER_KEY' ? 'buildLedger' : k));
  assert.ok(keys.length >= 4, 'the list was read empty: this test would check nothing');
  for (const k of keys) assert.equal(STORAGE_KEYS[k], 'reset', `${k} is not a key a fresh start erases`);
});

test('SESSION: a run in progress, or one stopping or paused, refuses and deletes nothing; an idle agent does not block it', async () => {
  for (const status of ['running', 'stopping', 'paused']) {
    const h = seeded({ store: { agent: { status } } });
    const r = await doReset(h);
    assert.equal(r.status, 409, status);
    assert.match(r.json.error, /run is in progress/);
    assert.equal(messages(h), 4, 'the conversation survived');
    assert.ok(h.store.has('memory') && h.store.has('buildLedger'));
  }
  const idle = seeded({ store: { agent: { status: 'idle' } } });
  assert.equal((await doReset(idle)).status, 200, 'the agent state a finished run leaves behind is idle');
});

test('SESSION: an owner who may not build is refused, as /agent-run refuses them, and nothing is deleted', async () => {
  const h = seeded();
  h.env.OWNER_USER_IDS = STRANGER; // an owner list that does not name this project's owner
  const r = await doReset(h);
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'account_not_approved');
  assert.equal(messages(h), 4);
  assert.ok(h.store.has('memory'));
  h.env.OWNER_USER_IDS = h.store.get('bind').ownerId; // CONTROL: the same session with the owner approved resets
  assert.equal((await doReset(h)).status, 200);
});
