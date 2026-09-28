/**
 * The mode a client sends, at the boundary where it used to become a table key.
 *
 * V3 G01 removed the Plan, Agent and Autonomous modes: there is one behaviour for every request.
 * The socket payload is untrusted JSON (`JSON.parse(raw) as ClientMsg` is an assertion, not a
 * check), so the property is now that NOTHING the client puts in `mode` or `autonomous` reaches a
 * routing key. The server ignores both and runs the one behaviour; a legacy frame from a stale tab
 * or an old SDK is normalized, never refused (handoff line 28: "Keep legacy wire values only as a
 * temporary, tested compatibility bridge").
 *
 * `memory` and `vision` stay in the fixture because they are real provider-model keys, and
 * `__proto__`/`constructor` because they resolve to truthy prototype members: a regression that
 * started reading `mode` again would route on them.
 *
 * The control fixture executes the real boundary so a dead harness cannot pass as a guard.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'mode-ingress-')), 'session.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'session.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const { SessionDO } = await import(`file://${out}`);

/**
 * A bound session with every Durable Object it reaches stubbed.
 *
 * COMPLETE ON PURPOSE. A first version stubbed QUOTA_DO as `{}`; startRun threw on
 * `idFromName is not a function` and every mode — including the VALID one — produced no agent.
 * That reads exactly like "the ingress rejects everything", i.e. like the product being safe. The
 * control below exists so a dead harness cannot pass for a working guard.
 */
function session({ rowsFor = () => [] } = {}) {
  const store = new Map([['bind', { projectId: 'p1', projectName: 'Proj', ownerId: 'u1' }]]);
  const sent = [];
  //[[ THE SOCKET NOW CARRIES AN IDENTITY, AND SO MUST THIS FIXTURE.
  //
  //   `webSocketMessage` asks what the socket's holder MAY DO before it looks at what they sent
  //   (collaboration: a viewer on a shared project can watch a build and must not start one). A
  //   socket with no attachment is refused by design, so a fixture that passes `null` would make
  //   every mode — valid and hostile alike — produce the same silence, and this file's control
  //   test exists precisely to catch a harness that has stopped exercising anything.
  //
  //   The attachment below is what the owner's own socket carries in production. ]]
  let attachment = { userId: 'u1', role: 'owner', connectionId: 'c1', activity: 'viewing', lastSeenMs: Date.now() };
  const ws = {
    send: (d) => sent.push(JSON.parse(d)),
    readyState: 1,
    deserializeAttachment: () => attachment,
    serializeAttachment: (v) => { attachment = v; },
  };
  const ctx = {
    storage: {
      async get(k) { return store.get(k); },
      async put(a, b) { if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, v); else store.set(a, b); },
      async delete(k) { store.delete(k); }, async list() { return new Map(); },
      setAlarm() {}, getAlarm() { return null; },
      sql: { exec: (q) => ({ toArray: () => rowsFor(q), one: () => rowsFor(q)[0] ?? null }) },
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [ws],
    acceptWebSocket() {},
  };
  const doStub = (body) => ({ idFromName: () => 'id', get: () => ({ fetch: async () => Response.json(body) }) });
  const env = {
    AI: { run: async () => ({ response: 'ok' }) },
    QUOTA_DO: doStub({ ok: true, allowed: true, remaining: 100, credits: 100, plan: 'builder' }),
    BUDGET_DO: doStub({ ok: true, reserved: 10, state: { killed: false } }),
    ADMIN_DO: doStub({ ok: true }),
  };
  const s = new SessionDO(ctx, env);
  return {
    store, sent, s, ws,
    async chat(mode, text = 'build a house', autonomous = false) {
      try { await s.webSocketMessage(ws, JSON.stringify({ type: 'chat', text, mode, autonomous })); } catch { /* downstream stubs */ }
      return {
        agent: store.get('agent'),
        errors: sent.filter((m) => m.type === 'error').map((m) => m.code),
        refusalFrames: sent.filter((m) => m.type === 'error'),
      };
    },
  };
}

/** Every value a client can put in `mode`: the bridge value, retired names, and hostile keys. */
const MODES = [
  ['the bridge value agent', 'agent'],
  ['the retired Plan mode', 'plan'],
  ['a retired pre-rename name', 'stone'],
  ['memory', 'memory'],       // a real DEFAULT_MODELS key
  ['vision', 'vision'],       // likewise
  ['__proto__', '__proto__'], // resolves to Object.prototype, which is truthy
  ['constructor', 'constructor'],
  ['the empty string', ''],
  ['a number', 7],
  ['null', null],
  ['an object', { toString: () => 'plan' }],
  ['no mode at all', undefined],
];

test('CONTROL: a chat frame starts a run with the 1000-step ceiling', async () => {
  const { agent, errors } = await session().chat('agent');
  assert.ok(agent, 'the harness must start a run, or every assertion below is vacuous');
  assert.deepEqual(errors, []);
  assert.equal(agent.maxSteps, 1000);
});

for (const [label, mode] of MODES) {
  test(`a chat frame with ${label} as its mode runs the one behaviour, never refused (V3 G01)`, async () => {
    const { agent, errors } = await session().chat(mode);
    assert.ok(agent, `mode ${JSON.stringify(mode)} must still start a run`);
    assert.equal(errors.includes('bad_mode'), false, 'a legacy mode is normalized, not refused');
    assert.equal(agent.mode, 'agent', 'the client value never becomes the run mode');
    assert.equal(agent.readOnly, undefined, 'the client value never makes a run read-only either');
    assert.equal(agent.maxSteps, 1000);
  });
}

test('a legacy Autonomous flag is ignored: there is no Autonomous control and no run field for it', async () => {
  for (const mode of ['agent', 'plan']) {
    const { agent, errors } = await session().chat(mode, 'build a house', true);
    assert.ok(agent);
    assert.deepEqual(errors, []);
    assert.equal(agent.mode, 'agent');
    assert.equal('autonomous' in agent, false, 'the persisted run carries no autonomy flag');
  }
});

test('successive legacy frames each run; nothing about a legacy value holds the run slot', async () => {
  const s = session();
  await s.chat('memory');
  const { agent, errors } = await s.chat('plan');
  assert.ok(agent);
  assert.equal(errors.includes('bad_mode'), false);
  assert.equal(agent.maxSteps, 1000);
});

test('/agent-run ignores a legacy mode and autonomous flag and runs the one behaviour', async () => {
  for (const mode of ['plan', 'agent', 'nonsense']) {
    const h = session();
    const res = await h.s.fetch(new Request('https://do/agent-run', {
      method: 'POST', body: JSON.stringify({ text: 'build a house', mode, autonomous: true }),
    }));
    assert.equal(res.status, 200, `mode ${mode}: ${await res.clone().text()}`);
    const agent = h.store.get('agent');
    assert.ok(agent, `mode ${mode} started no run`);
    assert.equal(agent.mode, 'agent');
    assert.equal('autonomous' in agent, false);
  }
});

test('edit_resend with a legacy mode re-runs as the one behaviour, never refused', async () => {
  const h = session({
    rowsFor: (q) => (/from messages where id = \?/.test(q)
      ? [{ id: 'msg-1', role: 'user', content: 'build a hut', created_at: 1 }]
      : /count\(\*\) as n from messages/.test(q) ? [{ n: 1 }]
      : /as next from message_revisions/.test(q) ? [{ next: 0 }] : []),
  });
  try {
    await h.s.webSocketMessage(h.ws, JSON.stringify({ type: 'edit_resend', messageId: 'msg-1', text: 'build a house', mode: 'plan', autonomous: true }));
  } catch { /* downstream stubs */ }
  const errors = h.sent.filter((m) => m.type === 'error').map((m) => m.code);
  assert.equal(errors.includes('bad_mode'), false);
  const agent = h.store.get('agent');
  assert.ok(agent, `edit_resend started no run (errors: ${errors.join(',')})`);
  assert.equal(agent.mode, 'agent');
  assert.equal('autonomous' in agent, false);
});

test('a stored Plan-mode message reads back as the one behaviour; a row with no mode stays null', async () => {
  const h = session({
    rowsFor: (q) => (/from messages where created_at < \?/.test(q)
      ? [
        { id: 'a', role: 'assistant', mode: 'plan', content: 'old plan answer', tool_trace: null, created_at: 2 },
        { id: 'b', role: 'user', mode: null, content: 'hi', tool_trace: null, created_at: 1 },
      ]
      : []),
  });
  const res = await h.s.fetch(new Request('https://do/messages', { method: 'GET' }));
  const body = await res.json();
  const byId = Object.fromEntries(body.messages.map((m) => [m.id, m.mode]));
  assert.deepEqual(byId, { a: 'agent', b: null });
});

test('a run persisted in the retired Plan mode resumes as the one behaviour and keeps its no-changes promise', async () => {
  const h = session();
  const agent = { status: 'running', mode: 'plan', msgId: 'm-legacy', step: 0, maxSteps: 1000, llm: [], trace: [] };
  try { await h.s.runStep(agent); } catch { /* the rest of the step needs more stubs than this proves */ }
  assert.equal(agent.mode, 'agent');
  assert.equal(agent.readOnly, true, 'a legacy Plan run must not start changing the place');
});
