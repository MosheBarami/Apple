// Phase B (handoff 2026-10-09): a stop in the Studio agent reaches the op queue, and a result that arrives after its op
// timed out is recorded and told to the agent instead of silently dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'studio-turn-ops-')), 'session.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'session.ts'), '--bundle', '--format=esm', '--target=es2022', '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'), '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' },
);
const { SessionDO } = await import(`file://${out}`);

function session(rows = []) {
  const store = new Map();
  const sqlCalls = [];
  const ctx = {
    storage: {
      async get(k) { return store.get(k); },
      async put(a, b) { if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, v); else store.set(a, b); },
      async delete(k) { store.delete(k); },
      async list() { return new Map(); },
      setAlarm() {},
      getAlarm() { return null; },
      sql: { exec: (q, ...args) => { sqlCalls.push({ q, args }); return { toArray: () => (/^select kind from oplog/.test(q) ? rows : []), one: () => null }; } },
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [],
    acceptWebSocket() {},
  };
  const s = new SessionDO(ctx, {});
  s.pluginConnected = async () => true;
  return { s, store, sqlCalls };
}

test('a stop discards the turn\'s queued ops and answers their waiters at once, as never applied', async () => {
  const { s } = session();
  s.studioTurnId = 't-stop';
  const pending = s.execStudioOpOnce({ op: 'set_properties', path: 'game.Workspace.A', props: {} }, 30_000);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(s.opQueue.length, 1);
  assert.equal(s.opQueue[0].turnId, 't-stop', 'the op carries the agent turn');
  assert.equal(s.opQueue[0].runId, undefined, 'and no old-loop runId, which the poll would drop');
  s.studioTurnId = 't-other';
  const other = s.execStudioOpOnce({ op: 'set_properties', path: 'game.Workspace.B', props: {} }, 50);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await s.dropOpsForTurn('t-stop'), 1);
  const res = await pending;
  assert.equal(res.ok, false);
  assert.equal(res.failure, 'transport', 'transport: provably never reached Studio, so safe to retry');
  assert.match(res.error, /discarded before Studio collected it/);
  assert.deepEqual(s.opQueue.map((o) => o.turnId), ['t-other'], 'another turn\'s op stays');
  await other;
});

test('a late result for a timed-out op is recorded on its oplog row and reaches the agent once', async () => {
  const { s, sqlCalls } = session([{ kind: 'build_ui' }]);
  s.recordLateResult({ id: 'op_9_x', ok: true });
  const update = sqlCalls.find((c) => /^update oplog set late_ok/.test(c.q));
  assert.ok(update, 'the row is updated');
  assert.deepEqual(update.args.slice(0, 2), [1, 'applied']);
  assert.equal(update.args[3], 'op_9_x');
  assert.deepEqual(s.lateResults, [{ id: 'op_9_x', kind: 'build_ui', ok: true, summary: 'applied' }]);
  const none = session([]);
  none.s.recordLateResult({ id: 'op_unknown', ok: true });
  assert.equal(none.s.lateResults.length, 0, 'a result for an op that did not time out is not news');
});
