/**
 * The mode a client sends, at the boundary where it becomes a table key.
 *
 * The run mode is a compile-time union, while the socket payload is untrusted JSON. session.ts does
 * `JSON.parse(raw) as ClientMsg`, which is an assertion and not a check, so whatever the client put
 * in `mode` must be validated before it becomes a routing key.
 *
 * MEASURED by driving webSocketMessage before the fix — an ordinary authenticated project owner
 * sending {"type":"chat","text":"...","mode":"memory"}:
 *
 * An agent run used to be created for arbitrary strings. `memory` and `vision` are sharp cases
 * because they are real provider-model keys, so the gateway cannot be the run-mode validator.
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
function session() {
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
      sql: { exec: () => ({ toArray: () => [], one: () => null }) },
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
    store, sent,
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

const VALID = ['plan', 'agent'];

/** Anything a client can put in a JSON string field that is not a mode. */
const HOSTILE = [
  ['memory', 'memory'],       // a real DEFAULT_MODELS key, so the gateway guard never fires
  ['vision', 'vision'],       // likewise
  ['__proto__', '__proto__'], // resolves to Object.prototype, which is truthy
  ['constructor', 'constructor'],
  ['an unknown string', 'nonsense'],
  ['the empty string', ''],
  ['a number', 7],
  ['null', null],
  ['an object', { toString: () => 'agent' }],
];

test('CONTROL: every valid mode starts a run with the 1000-step ceiling', async () => {
  for (const mode of VALID) {
    const { agent, errors } = await session().chat(mode);
    assert.ok(agent, `mode "${mode}" must start a run`);
    assert.deepEqual(errors, [], `mode "${mode}" must not be refused`);
    assert.equal(agent.maxSteps, 1000, `mode "${mode}" must receive the message ceiling`);
  }
});

test('Autonomous is a per-message Agent flag, never a third mode', async () => {
  const on = await session().chat('agent', 'build a house', true);
  assert.equal(on.agent?.autonomous, true);
  const plan = await session().chat('plan', 'inspect this project', true);
  assert.notEqual(plan.agent?.autonomous, true, 'Plan must ignore the Agent-only autonomy switch');
});

for (const [label, mode] of HOSTILE) {
  test(`a chat frame with ${label} as its mode is refused by name`, async () => {
    const { agent, errors, refusalFrames } = await session().chat(mode);
    assert.equal(agent, undefined, 'no agent run may be created for an unrecognised mode');
    assert.ok(errors.includes('bad_mode'), `expected a bad_mode refusal, got [${errors.join(',')}]`);
    assert.equal(refusalFrames.at(-1)?.terminal, true, 'a refused request must say that it is terminal');
  });
}

test('THE REFUSAL TELLS THE PERSON WHAT TO DO, because the common cause is a stale tab', async () => {
  //[[ ADDED 2026-09-22, ON THE DAY THE RUN MODES WERE RENAMED.
  //
  //   The wire carried `clay`/`stone`/`rune` and carries `plan`/`agent` now. A browser tab keeps the
  //   bundle it loaded until it reloads, and a web SPA cannot be updated atomically — so during any
  //   such rename there is a window where a live tab asks for a mode the server has never heard of,
  //   and the person is told "Unknown mode for this request". That is true and useless: they did
  //   nothing wrong and have no way to learn that a reload fixes it.
  //
  //   The property is that the refusal is ACTIONABLE. It is asserted rather than left to prose
  //   because it is the kind of sentence a refactor tidies into a shorter, deader one, and nothing
  //   else in this file would notice. The code and the terminal flag are asserted above and are
  //   unchanged: this adds a requirement, it does not relax one.
  const { refusalFrames } = await session().chat('stone');
  const message = refusalFrames.at(-1)?.message ?? '';
  assert.match(message, /reload the page/i, `a refused mode must tell the user how to recover, got: ${message}`);
  // And it must stay free of internals: no mode name the product retired, no provider key.
  for (const leak of ['clay', 'stone', 'rune', 'memory', 'vision']) {
    assert.equal(message.includes(leak), false, `the refusal leaks the internal name "${leak}"`);
  }
});

test('the 1000-step ceiling does not widen mode ingress', async () => {
  for (const [, mode] of [...HOSTILE, ...VALID.map((m) => [m, m])]) {
    const { agent } = await session().chat(mode);
    if (VALID.includes(mode)) assert.ok(agent, `valid mode ${mode} was refused`);
    else assert.equal(agent, undefined, `hostile mode ${JSON.stringify(mode)} entered an autonomous run`);
  }
});

test('a refused mode does not consume the run slot', async () => {
  // A refusal that left the session marked busy would be a denial of service dressed as a guard.
  const s = session();
  await s.chat('memory');
  const { agent, errors } = await s.chat('agent');
  assert.ok(agent, 'a valid mode must still start after a refused one');
  assert.ok(errors.includes('bad_mode'), 'the earlier refusal is still reported');
  assert.equal(agent.maxSteps, 1000);
});
