/**
 * A REFUSAL GOES TO THE PERSON WHO CAUSED IT.
 *
 * The concurrency guard itself is real and is tested in single-flight.test.mjs: two collaborators
 * cannot start simultaneous runs, and the race that double-charged a Credit is written out in that
 * file's header. What it never asked is WHO GETS TOLD.
 *
 * `startRun` answered the refusal with `this.broadcast`, which loops every client socket on the
 * project — while the role refusals two lines away have always used a targeted `ws.send`. So when
 * one member was building, every other member's screen said "Apple is already working — stop the
 * current run first." as if they had pressed something. There is nothing on that screen to tell
 * them it is not about them, and the sentence instructs them to stop a run that is not theirs.
 *
 * Driven against the Durable Object with two real sockets, because the defect is entirely about
 * which socket receives a frame.
 *
 * Run with:  node --test tests/busy-refusal.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'busy-refusal-')), 'session.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [
    join(WORKER, 'src', 'do', 'session.ts'),
    '--bundle',
    '--format=esm',
    '--target=es2022',
    '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
    '--outfile=' + out,
  ],
  { cwd: WORKER, stdio: 'pipe' },
);
const { SessionDO } = await import(`file://${out}`);

const OWNER = 'u-owner';
const MEMBER = 'u-member';

function socket(userId, role) {
  let attachment = { userId, role, connectionId: `c-${userId}`, activity: 'viewing', lastSeenMs: Date.now() };
  const sent = [];
  return {
    userId,
    sent,
    codes: () => sent.filter((m) => m.type === 'error').map((m) => m.code),
    ws: {
      readyState: 1,
      send: (d) => sent.push(JSON.parse(d)),
      close: () => {},
      deserializeAttachment: () => attachment,
      serializeAttachment: (v) => {
        attachment = v;
      },
    },
  };
}

function session(sockets) {
  const store = new Map([['bind', { projectId: 'p1', projectName: 'Proj', ownerId: OWNER }]]);
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
    getWebSockets: () => sockets.map((s) => s.ws),
    acceptWebSocket() {},
  };
  const doStub = (body) => ({ idFromName: () => 'id', get: () => ({ fetch: async () => Response.json(body) }) });
  const env = {
    AI: { run: async () => ({ response: 'ok' }) },
    QUOTA_DO: doStub({ ok: true, allowed: true, remaining: 100, credits: 100, plan: 'free' }),
    BUDGET_DO: doStub({ ok: true, reserved: 10, state: { killed: false } }),
    ADMIN_DO: doStub({ ok: true }),
  };
  const s = new SessionDO(ctx, env);
  return {
    store,
    async chat(from, text = 'build a house') {
      try {
        await s.webSocketMessage(from.ws, JSON.stringify({ type: 'chat', text, mode: 'plan' }));
      } catch {
        /* downstream stubs */
      }
    },
    async edit(from, messageId, text = 'actually, a tower') {
      try {
        await s.webSocketMessage(from.ws, JSON.stringify({ type: 'edit_resend', messageId, text, mode: 'plan' }));
      } catch {
        /* downstream stubs */
      }
    },
  };
}

// =============================================================================================

test("THE BUSY REFUSAL REACHES ONE PERSON: a colleague's screen does not accuse them", async () => {
  const first = socket(OWNER, 'owner');
  const second = socket(MEMBER, 'editor');
  const s = session([first, second]);

  await s.chat(first);
  // CONTROL: the run actually started. Without it the assertion below would hold on a build where
  // nothing ran, nothing was busy and nobody was refused — which is the shape that makes a
  // targeting test pass by doing nothing.
  const agent = s.store.get('agent');
  assert.ok(agent && agent.status !== 'idle', 'the first member must actually be mid-run');

  await s.chat(second);
  assert.deepEqual(second.codes(), ['busy'], 'the person who asked is told the project is busy');
  assert.equal(first.codes().includes('busy'), false, 'and the person already building is not told they are in their own way');
});

test('the same is true of the edit refusal, which sits two lines away from it', async () => {
  const first = socket(OWNER, 'owner');
  const second = socket(MEMBER, 'editor');
  const s = session([first, second]);

  await s.chat(first);
  assert.ok(s.store.get('agent'), 'control: a run is in flight');

  await s.edit(second, 'm-1');
  assert.deepEqual(second.codes(), ['busy']);
  assert.equal(first.codes().includes('busy'), false, 'a correction someone else attempted is not the room’s business');
});

test('CONTROL: a refusal that was ALREADY targeted still is', async () => {
  // The role refusal has always used a targeted send. It is asserted here so that a change which
  // "fixed" the busy refusal by making everything broadcast again would be caught by this file
  // rather than by nothing.
  const viewer = socket(MEMBER, 'viewer');
  const owner = socket(OWNER, 'owner');
  const s = session([viewer, owner]);
  await s.chat(viewer);
  assert.deepEqual(viewer.codes(), ['forbidden']);
  assert.deepEqual(owner.codes(), [], 'nobody else hears about a refusal that was not theirs');
});
