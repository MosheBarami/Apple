/**
 * THE SECOND GATE, INSIDE THE DURABLE OBJECT.
 *
 * `SessionDO` now answers on two op paths and the difference between them IS the security
 * boundary:
 *
 *   /studio-op     forwards whatever it is handed. Reached only from worker code — the
 *                  roadmap scan, the visual bench, the admin diagnostics route — each of
 *                  which has already decided what it is sending.
 *   /companion-op  reached, through one authenticated route, by a BROWSER. So it decides
 *                  for itself which ops it carries, and it decides again after index.ts
 *                  has already decided: a check in the caller is a convention the next
 *                  caller forgets, a check in the receiver is a property of the route.
 *
 * The two are driven here against the same op, in the same DO, so the claim asserted is a
 * RELATIONSHIP rather than a status code: `run_code` dies on ADMISSION at the companion
 * path and gets as far as the connectivity check at the diagnostics path. A companion gate
 * that had quietly stopped gating would produce the same answer on both, and this is the
 * only test that would notice.
 *
 *   node --test apps/worker/tests/companion-do-gate.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'companion-do-')), 'session.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [
    join(WORKER, 'src', 'do', 'session.ts'),
    '--bundle',
    '--format=esm',
    '--target=es2022',
    `--alias:cloudflare:workers=${join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs')}`,
    `--outfile=${out}`,
  ],
  { cwd: WORKER, stdio: 'pipe' },
);
const { SessionDO } = await import(`file://${out}`);

/** A bound session with storage in a Map and no plugin attached. */
async function session() {
  const store = new Map();
  const ctx = {
    storage: {
      async get(k) {
        return store.get(k);
      },
      async put(a, b) {
        if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, v);
        else store.set(a, b);
      },
      async delete(k) {
        store.delete(k);
      },
      async list() {
        return new Map();
      },
      setAlarm() {},
      getAlarm() {
        return null;
      },
      sql: { exec: () => ({ toArray: () => [], one: () => null }) },
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [],
    acceptWebSocket() {},
  };
  const doStub = (body) => ({ idFromName: () => 'id', get: () => ({ fetch: async () => Response.json(body) }) });
  const env = {
    QUOTA_DO: doStub({ ok: true }),
    BUDGET_DO: doStub({ ok: true }),
    ADMIN_DO: doStub({ ok: true }),
  };
  const s = new SessionDO(ctx, env);
  const res = await s.fetch(
    new Request('https://do/init', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'p1', projectName: 'Proj', ownerId: 'u1' }),
    }),
  );
  assert.equal(res.status, 200, 'the session must bind, or every answer below is about an unbound DO');
  return { store, s };
}

/** POST one op at `path`, and report the answer plus what it left in the op queue. */
async function post(s, store, path, op, timeoutMs = 5000) {
  const res = await s.fetch(new Request(`https://do${path}`, { method: 'POST', body: JSON.stringify({ op, timeoutMs }) }));
  return { status: res.status, body: await res.json(), queued: store.get('opQueue') ?? [] };
}

const RUN_CODE = { op: 'run_code', code: 'print(1)', timeoutMs: 1000 };
const MOVE = { op: 'transform_instances', paths: ['game.Workspace.Crate'], move: [1, 0, 0] };

test('THE TWO PATHS DISAGREE ABOUT run_code, which is the whole point of the second one', async () => {
  const { s, store } = await session();

  const companion = await post(s, store, '/companion-op', RUN_CODE);
  assert.equal(companion.status, 400, 'the companion path refuses on admission');
  assert.match(companion.body.error, /run_code/);
  assert.deepEqual(companion.queued, [], 'and queues nothing');

  const diagnostics = await post(s, store, '/studio-op', RUN_CODE);
  assert.equal(diagnostics.status, 409, 'the diagnostics path does not gate by op at all');
  assert.match(diagnostics.body.error, /not connected/, 'it got past the op entirely, to the connectivity check');

  // Stated as the relationship, so a companion gate that stopped gating turns this red even
  // if both paths happen to end in a refusal.
  assert.notEqual(companion.status, diagnostics.status, 'the two paths must not answer the same way');
});

test('an allowlisted op passes admission and is stopped only by there being no Studio', async () => {
  // Non-vacuity for the refusal above. If the companion path refused everything, the test
  // above would pass for entirely the wrong reason.
  const { s, store } = await session();
  const r = await post(s, store, '/companion-op', MOVE);
  assert.equal(r.status, 409, 'admission passed; the plugin is simply not attached');
  assert.match(r.body.error, /not connected/);
  assert.deepEqual(r.queued, [], 'nothing is queued for a plugin that is not there');
});

test('the DO refuses a malformed or missing op without throwing', async () => {
  const { s, store } = await session();
  for (const bad of [undefined, null, 'transform_instances', 7, {}, { op: 42 }, { op: '__proto__' }]) {
    const r = await post(s, store, '/companion-op', bad);
    assert.equal(r.status, 400, `${JSON.stringify(bad)} must be refused`);
    assert.deepEqual(r.queued, []);
  }
});

test('the DO gate does not depend on index.ts having run first', async () => {
  //[[ The reason this file exists at all. Every op below is one index.ts would already have
  //   refused; the DO is asked directly, as though a future caller had forgotten to. ]]
  const { s, store } = await session();
  for (const op of [
    { op: 'edit_script', path: 'game.Workspace.S', source: 'print(1)' },
    { op: 'insert_asset', assetId: 1, parent: 'game.Workspace' },
    { op: 'set_props', path: 'game.Workspace.P', props: {} },
    { op: 'restore', root: 'game', snapshot: {} },
  ]) {
    const r = await post(s, store, '/companion-op', op);
    assert.equal(r.status, 400, `${op.op} must be refused by the DO itself`);
    assert.deepEqual(r.queued, []);
  }
});
