/**
 * A PERMISSION CHANGE, APPLIED TO THE TAB THAT IS ALREADY OPEN.
 *
 * The HTTP half of this was correct and is proved elsewhere: every shared route re-resolves
 * membership on every request, and collab-routes.test.mjs drives "a REVOKED member is a stranger
 * again, on the next request". A WEBSOCKET MAKES NO NEXT REQUEST. The role was decided once at the
 * handshake, frozen into the socket attachment, and every later frame is gated against that frozen
 * value — so a member who was removed, suspended or demoted kept every capability they held until
 * they happened to reload the page. For a workspace tab, that is indefinitely.
 *
 * Nothing in the product closed that gap: `grep ws.close` across do/session.ts found exactly one
 * call ("project deleted"), and the membership routes never spoke to the Durable Object at all.
 *
 * So this file drives the Durable Object itself, with real sockets carrying real attachments, and
 * asks what the socket can DO after the change rather than what an object says about it.
 *
 * Run with:  node --test tests/collab-access-change.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'access-change-')), 'session.mjs');
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
const OTHER = 'u-other';

/** One attached client socket, with the attachment production gives it. */
function socket(userId, role, grantExpiresAt = undefined) {
  let attachment = {
    userId,
    role,
    connectionId: `c-${userId}`,
    activity: 'viewing',
    lastSeenMs: Date.now(),
    ...(grantExpiresAt === undefined ? {} : { grantExpiresAt }),
  };
  const sent = [];
  const closes = [];
  return {
    userId,
    sent,
    closes,
    get role() {
      return attachment?.role ?? null;
    },
    get expiry() {
      return Object.prototype.hasOwnProperty.call(attachment ?? {}, 'grantExpiresAt')
        ? attachment.grantExpiresAt
        : undefined;
    },
    ws: {
      readyState: 1,
      send: (d) => sent.push(JSON.parse(d)),
      close: (code, reason) => closes.push({ code, reason }),
      deserializeAttachment: () => attachment,
      serializeAttachment: (v) => {
        attachment = v;
      },
    },
  };
}

function session(sockets, options = {}) {
  const store = new Map([['bind', { projectId: 'p1', projectName: 'Proj', ownerId: OWNER }]]);
  let aiCalls = 0;
  let aiStartedResolve;
  const aiStarted = new Promise((resolve) => {
    aiStartedResolve = resolve;
  });
  let releaseModel = () => {};
  let alarmAt = null;
  const modelGate = options.deferModel
    ? new Promise((resolve) => {
        releaseModel = resolve;
      })
    : null;
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
      setAlarm(value) {
        alarmAt = Number(value);
      },
      getAlarm() {
        return alarmAt;
      },
      sql: { exec: () => ({ toArray: () => [], one: () => null }) },
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => sockets.map((s) => s.ws),
    acceptWebSocket() {},
  };
  const doStub = (body) => ({ idFromName: () => 'id', get: () => ({ fetch: async () => Response.json(body) }) });
  const env = {
    AI: {
      run: async () => {
        aiCalls += 1;
        aiStartedResolve();
        if (modelGate) await modelGate;
        return options.toolCall
          ? { response: '', tool_calls: [{ id: 'tc-1', name: options.toolCall.name, arguments: JSON.stringify(options.toolCall.args ?? {}) }] }
          : { response: 'ok' };
      },
    },
    QUOTA_DO: doStub({ ok: true, allowed: true, remaining: 100, credits: 100, plan: 'free' }),
    BUDGET_DO: doStub({ ok: true, reserved: 10, state: { killed: false } }),
    ADMIN_DO: doStub({ ok: true }),
  };
  const s = new SessionDO(ctx, env);
  return {
    store,
    doInstance: s,
    aiCalls: () => aiCalls,
    alarmAt: () => alarmAt,
    async fireAlarm() {
      // Cloudflare consumes the scheduled alarm before invoking the handler.
      alarmAt = null;
      return s.alarm();
    },
    waitForAI: () => aiStarted,
    releaseModel: () => releaseModel(),
    async accessChanged(body) {
      const res = await s.fetch(new Request('https://do/collab/access-changed', { method: 'POST', body: JSON.stringify(body) }));
      return { status: res.status, json: await res.json() };
    },
    async chat(from, text = 'build a house') {
      try {
        await s.webSocketMessage(from.ws, JSON.stringify({ type: 'chat', text, mode: 'plan' }));
      } catch {
        /* downstream stubs */
      }
      return { agent: store.get('agent'), errors: from.sent.filter((m) => m.type === 'error') };
    },
  };
}

function queuedOp(runId, id = `op-${runId}`) {
  return { id, seq: 1, runId, studioOp: { op: 'set_props', path: 'game', props: {} } };
}

// =============================================================================================

test('CONTROL: an editor on an open socket can start a run', async () => {
  // Without this the refusals below could all be a dead harness, which is the shape that makes a
  // permission test pass by doing nothing at all.
  const editor = socket(MEMBER, 'editor');
  const s = session([editor]);
  const { agent, errors } = await s.chat(editor);
  assert.ok(agent, 'the editor must be able to build before anything is changed');
  assert.deepEqual(errors, []);
});

test('REVOCATION STOPS THE DURABLE RUN AND PURGES QUEUED OPS before an alarm can call the model', async () => {
  const editor = socket(MEMBER, 'editor');
  const s = session([editor]);
  const { agent } = await s.chat(editor);
  assert.ok(agent?.initiatedBy === MEMBER, 'the run records the verified initiator separately from owner billing');
  assert.equal(agent.userId, OWNER, 'owner billing identity remains independent of the initiator');

  const queued = [queuedOp(agent.msgId)];
  s.doInstance.opQueue = queued;
  s.store.set('opQueue', queued);
  const beforeAi = s.aiCalls();
  const applied = await s.accessChanged({ userId: MEMBER, role: null, access: 'removed' });
  assert.equal(applied.status, 200);
  assert.equal(s.doInstance.opQueue.length, 0, 'revocation removes work that has not reached Studio');
  assert.equal(s.store.get('opQueue').length, 0);

  await s.doInstance.alarm();
  assert.equal(s.store.get('agent').status, 'idle', 'the next alarm ends the revoked run');
  assert.equal(s.aiCalls(), beforeAi, 'the revoked run cannot spend another model step');
  assert.match(s.store.get('agent').finalText, /removed from the project/i);
});

test('A REGRANT DOES NOT RESUME AN INVALIDATED RUN, and its queue/poll fences stay closed', async () => {
  const editor = socket(MEMBER, 'editor');
  const s = session([editor]);
  const { agent } = await s.chat(editor);
  const first = [queuedOp(agent.msgId, 'before-regrant')];
  s.doInstance.opQueue = first;
  s.store.set('opQueue', first);

  await s.accessChanged({ userId: MEMBER, role: null, access: 'removed' });
  // Regrant arrives while the old run is still stored as live: the mark must remain until it is
  // idle, rather than making the next alarm believe the run is valid again.
  await s.accessChanged({ userId: MEMBER, role: 'editor', access: 'clear' });
  assert.ok(s.store.get('accessRevoked')?.[MEMBER], 'the active run keeps its invalidation fence');

  // Simulate a stale writer that appended after the removal handler purged its first queue view.
  const late = [queuedOp(agent.msgId, 'after-regrant')];
  s.doInstance.opQueue = late;
  s.store.set('opQueue', late);
  s.doInstance.pluginConnected = async () => true;
  const opResult = await s.doInstance.execStudioOp({ op: 'set_props', path: 'game', props: {} }, 10, agent);
  assert.equal(opResult.ok, false);
  assert.equal(opResult.failure, 'transport');
  assert.equal(s.doInstance.opQueue.length, 0, 'a revoked run cannot enqueue a fresh Studio op');

  const poll = await s.doInstance.handlePluginPoll({ state: {} }, { version: null, protocol: null });
  assert.deepEqual((await poll.json()).ops, [], 'a poll racing the revocation receives no queued ops');
  await s.doInstance.alarm();
  assert.equal(s.store.get('agent').status, 'idle');
  assert.equal(s.store.get('accessRevoked')?.[MEMBER], undefined, 'the deferred clear applies only after the run ends');
});

test('ACCESS CHANGE DURING MODEL AWAIT stays fenced through regrant before the await returns', async () => {
  const editor = socket(MEMBER, 'editor');
  const s = session([editor]);
  await s.chat(editor);
  const stored = s.store.get('agent');
  s.doInstance.opQueue = [];
  s.store.set('opQueue', []);
  let releaseStep;
  const stepGate = new Promise((resolve) => {
    releaseStep = resolve;
  });
  // Keep the real SessionDO alarm, access-change handler, op fence and finishRun. Only the model
  // await is deterministic here, so the test can land a membership event in that exact window.
  s.doInstance.runStep = async function (agent) {
    await stepGate;
    const result = await this.execStudioOp({ op: 'set_props', path: 'game', props: {} }, 10, agent);
    if (!result.ok) {
      agent.finalText = result.error;
      await this.finishRun(agent, 'stopped');
    }
  };
  s.doInstance.pluginConnected = async () => true;
  const alarm = s.doInstance.alarm();
  await new Promise((resolve) => setTimeout(resolve, 0));

  await s.accessChanged({ userId: MEMBER, role: null, access: 'removed' });
  await s.accessChanged({ userId: MEMBER, role: 'editor', access: 'clear' });
  assert.ok(s.store.get('accessRevoked')?.[MEMBER], 'regrant cannot clear a fence while the old model call is live');
  releaseStep();
  await alarm;

  assert.equal(s.store.get('agent').status, 'idle');
  assert.equal(s.store.get('opQueue').length, 0, 'the tool call after the await never reaches Studio');
  assert.equal(s.store.get('accessRevoked')?.[MEMBER], undefined, 'the deferred regrant clears only after the old run finishes');
  assert.ok(editor.sent.some((m) => m.type === 'msg_end' && m.stopReason === 'stopped'));
  assert.equal(stored.initiatedBy, MEMBER);
});

test('SUSPENSION has its own stop reason and regrant is deferred until idle', async () => {
  const editor = socket(MEMBER, 'editor');
  const s = session([editor]);
  const { agent } = await s.chat(editor);
  await s.accessChanged({ userId: MEMBER, role: null, access: 'suspended' });
  await s.accessChanged({ userId: MEMBER, role: 'editor', access: 'clear' });
  assert.ok(s.store.get('accessRevoked')?.[MEMBER]);
  await s.doInstance.alarm();
  assert.equal(s.store.get('agent').status, 'idle');
  assert.match(s.store.get('agent').finalText, /suspended from the project/i);
  assert.equal(s.store.get('accessRevoked')?.[MEMBER], undefined);
  assert.equal(agent.userId, OWNER);
});

test('OWNER runs and legacy runs without an initiator are not stopped by a member fence', async () => {
  const owner = socket(OWNER, 'owner');
  const s = session([owner]);
  const { agent } = await s.chat(owner);
  s.store.set('accessRevoked', { [OWNER]: { userId: OWNER, reason: 'removed', at: Date.now() } });
  let stepped = 0;
  s.doInstance.runStep = async () => { stepped += 1; };
  await s.doInstance.alarm();
  assert.equal(stepped, 1, 'a membership fence cannot stop the owner');
  assert.equal(s.store.get('agent').status, 'running');

  const legacy = { ...agent };
  delete legacy.initiatedBy;
  s.store.set('agent', legacy);
  s.store.set('accessRevoked', { [MEMBER]: { userId: MEMBER, reason: 'removed', at: Date.now() } });
  await s.doInstance.alarm();
  assert.equal(stepped, 2, 'an old run with no recorded initiator is left running rather than guessed at');
});

test('A DEMOTION REACHES THE SOCKET: the next chat frame is refused by the role it now holds', async () => {
  const editor = socket(MEMBER, 'editor');
  const s = session([editor]);

  const applied = await s.accessChanged({ userId: MEMBER, role: 'viewer' });
  assert.equal(applied.status, 200);
  assert.deepEqual(applied.json, { matched: 1, closed: 0, demoted: 1 });
  assert.equal(editor.role, 'viewer', 'the attachment every later frame is gated against was rewritten');

  const { agent, errors } = await s.chat(editor);
  assert.equal(agent, undefined, 'a viewer must not start a run on a socket opened as an editor');
  assert.ok(
    errors.some((e) => e.code === 'forbidden'),
    'and must be told why, on their own socket',
  );
  // The tab is told at the moment of the change, not only when it next presses something.
  assert.ok(
    editor.sent.some((m) => m.type === 'error' && m.code === 'role_changed'),
    'the socket is told its role changed',
  );
});

test('A REMOVAL CLOSES THE SOCKET, because there is no lesser role to hold', async () => {
  const member = socket(MEMBER, 'editor');
  const s = session([member]);
  const applied = await s.accessChanged({ userId: MEMBER, role: null });
  assert.deepEqual(applied.json, { matched: 1, closed: 1, demoted: 0 });
  assert.deepEqual(member.closes, [{ code: 1008, reason: 'access changed' }]);
});

test('A ROLE THIS BUILD CANNOT READ IS A REMOVAL, not a role left as it was', async () => {
  // The direction that must never be the default: an unreadable value leaving the socket at the
  // capabilities it already had is a permission change that silently did not happen.
  for (const hostile of ['superuser', 'Editor', '', 7, {}, []]) {
    const member = socket(MEMBER, 'editor');
    const s = session([member]);
    await s.accessChanged({ userId: MEMBER, role: hostile });
    assert.deepEqual(member.closes, [{ code: 1008, reason: 'access changed' }], `role ${JSON.stringify(hostile)} must close the socket`);
  }
});

test('NOBODY ELSE IS TOUCHED — one person changed, one socket changed', async () => {
  const member = socket(MEMBER, 'editor');
  const other = socket(OTHER, 'editor');
  const s = session([member, other]);
  await s.accessChanged({ userId: MEMBER, role: 'viewer' });
  assert.equal(other.role, 'editor', "a colleague's role is not collateral");
  assert.deepEqual(other.closes, []);
  const { agent } = await s.chat(other);
  assert.ok(agent, 'and they can still build');
});

test("THE OWNER'S ROLE IS THE PROJECT ROW, and no membership push can move it", async () => {
  const owner = socket(OWNER, 'owner');
  const s = session([owner]);
  const applied = await s.accessChanged({ userId: OWNER, role: 'viewer' });
  assert.equal(applied.status, 400);
  assert.equal(applied.json.error, 'owner_is_not_a_member');
  assert.equal(owner.role, 'owner');
  assert.deepEqual(owner.closes, []);
});

test('a push naming nobody is refused, and a push naming somebody absent says so', async () => {
  const member = socket(MEMBER, 'editor');
  const s = session([member]);
  for (const bad of [{}, { userId: '' }, { userId: 7 }, { userId: null }]) {
    const res = await s.accessChanged(bad);
    assert.equal(res.status, 400, `${JSON.stringify(bad)} must be refused`);
  }
  // "Nobody was connected" is a real and common answer. It must be reported as a count rather
  // than as an unconditional success, so the route can say what it actually did.
  const absent = await s.accessChanged({ userId: 'u-nobody', role: null });
  assert.deepEqual(absent.json, { matched: 0, closed: 0, demoted: 0 });
  assert.equal(member.role, 'editor');
});

test('A SHORTER VERSIONED EXPIRY closes the live socket and stops the active run at the new boundary', { concurrency: false }, async (t) => {
  const realNow = Date.now;
  let now = Date.parse('2026-09-18T14:00:00.000Z');
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });

  const originalExpiry = new Date(now + 60_000).toISOString();
  const shortened = new Date(now + 10_000).toISOString();
  const editor = socket(MEMBER, 'editor', originalExpiry);
  const s = session([editor]);
  const { agent } = await s.chat(editor);
  assert.equal(agent.initiatorExpiresAt, originalExpiry, 'the run starts with the verified ingress deadline');

  const changed = await s.accessChanged({
    userId: MEMBER,
    role: 'editor',
    access: 'clear',
    version: 1,
    expiresAt: shortened,
  });
  assert.equal(changed.status, 200);
  assert.equal(editor.expiry, shortened, 'the hibernation attachment carries the new deadline');
  assert.ok(
    s.alarmAt() <= Date.parse(shortened),
    'the active run alarm remains earlier than the shortened access deadline',
  );
  assert.deepEqual(editor.closes, [], 'a future shortening does not close early');

  let stepped = 0;
  s.doInstance.runStep = async () => { stepped += 1; };
  now = Date.parse(shortened);
  await s.fireAlarm();
  assert.deepEqual(editor.closes, [{ code: 1008, reason: 'access expired' }]);
  assert.equal(stepped, 0, 'the expired run cannot take another model step');
  assert.equal(s.store.get('agent').status, 'idle');
  assert.match(s.store.get('agent').finalText, /access.*expired/i);
});

test('AN EXPIRY EXTENSION DURING AN ALARM STEP overrides the stale run snapshot before work resumes', { concurrency: false }, async (t) => {
  const realNow = Date.now;
  let now = Date.parse('2026-09-18T15:00:00.000Z');
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });

  const oldExpiry = new Date(now + 10_000).toISOString();
  const extended = new Date(now + 120_000).toISOString();
  const editor = socket(MEMBER, 'editor', oldExpiry);
  const s = session([editor]);
  await s.chat(editor);
  const storedBefore = s.store.get('agent');
  assert.equal(storedBefore.initiatorExpiresAt, oldExpiry);

  let entered;
  const enteredStep = new Promise((resolve) => { entered = resolve; });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let verdict;
  s.doInstance.runStep = async function (agent) {
    entered();
    await gate;
    verdict = await this.runAccessVerdict(agent);
  };

  const alarm = s.fireAlarm();
  await enteredStep;
  const changed = await s.accessChanged({
    userId: MEMBER,
    role: 'editor',
    access: 'clear',
    version: 1,
    expiresAt: extended,
  });
  assert.equal(changed.status, 200);
  now = Date.parse(oldExpiry) + 1;
  release();
  await alarm;

  assert.equal(verdict.stop, false, 'the cursor beats the stale agent.initiatorExpiresAt after await');
  assert.equal(verdict.why, 'ok');
  assert.equal(editor.expiry, extended);
  assert.deepEqual(editor.closes, []);
});

test('VERSIONED REGRANT WITH A LONGER EXPIRY cannot revive the run invalidated by the preceding revoke', async () => {
  const initial = new Date(Date.now() + 60_000).toISOString();
  const extended = new Date(Date.now() + 3_600_000).toISOString();
  const editor = socket(MEMBER, 'editor', initial);
  const s = session([editor]);
  const { agent } = await s.chat(editor);

  await s.accessChanged({ userId: MEMBER, role: null, access: 'removed', version: 1, expiresAt: initial });
  await s.accessChanged({ userId: MEMBER, role: 'editor', access: 'clear', version: 2, expiresAt: extended });
  assert.ok(s.store.get('accessRevoked')?.[MEMBER], 'the old run keeps the terminal fence through regrant');
  assert.equal(editor.expiry, extended, 'the regrant applies to the connection/future runs');

  await s.doInstance.alarm();
  assert.equal(s.store.get('agent').status, 'idle');
  assert.match(s.store.get('agent').finalText, /removed from the project/i);
  assert.equal(s.store.get('accessRevoked')?.[MEMBER], undefined, 'the regrant clears only after the old run is idle');
  assert.equal(agent.msgId, s.store.get('agent').msgId);
});
