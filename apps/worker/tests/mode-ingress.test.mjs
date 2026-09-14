/**
 * The mode a client sends, at the boundary where it becomes a table key.
 *
 * `GolemMode` is `'clay' | 'stone' | 'rune'` — a COMPILE-TIME type. session.ts does
 * `JSON.parse(raw) as ClientMsg`, which is an assertion and not a check, so whatever the client put
 * in `mode` was used as a key directly. Two `Record<GolemMode, T>` tables have three keys
 * (STEP_LIMITS, MODE_BASE_TOKENS) while gateway.ts's DEFAULT_MODELS has five, and gateway's
 * `if (!cfg) throw` was the only thing anywhere that rejected a bad mode.
 *
 * MEASURED by driving webSocketMessage before the fix — an ordinary authenticated project owner
 * sending {"type":"chat","text":"...","mode":"memory"}:
 *
 *   mode=stone      maxSteps=16         the ceiling stops the loop
 *   mode=memory     maxSteps=undefined  `9999 > undefined` is false — NO CEILING, EVER
 *   mode=vision     maxSteps=undefined  same
 *   mode=nonsense   maxSteps=undefined  same
 *   mode=__proto__  maxSteps={}         Object.prototype, and `9999 > {}` is false too
 *
 * An agent run was created every time. `memory` and `vision` are the sharp cases because they ARE
 * real DEFAULT_MODELS keys, so the gateway guard does not fire for them either and the token
 * arithmetic goes NaN through a chain of `>` comparisons that all fail open. But the step ceiling
 * is set in session.ts BEFORE the gateway is consulted, so any unrecognised mode removes it — and
 * an unbounded agent loop is a larger exposure than any single under-reserved call.
 *
 * Found by rbxai-a3's reachability trace; the facts were re-verified here against the source and
 * then executed rather than taken on report.
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
  const ws = { send: (d) => sent.push(JSON.parse(d)), readyState: 1, deserializeAttachment: () => ({ role: 'client' }) };
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
    QUOTA_DO: doStub({ ok: true, allowed: true, remaining: 100, sparks: 100, plan: 'free' }),
    BUDGET_DO: doStub({ ok: true, reserved: 10, state: { killed: false } }),
    ADMIN_DO: doStub({ ok: true }),
  };
  const s = new SessionDO(ctx, env);
  return {
    store, sent,
    async chat(mode, text = 'build a house') {
      try { await s.webSocketMessage(null, JSON.stringify({ type: 'chat', text, mode })); } catch { /* downstream stubs */ }
      return { agent: store.get('agent'), errors: sent.filter((m) => m.type === 'error').map((m) => m.code) };
    },
  };
}

const VALID = ['clay', 'stone', 'rune'];

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
  ['an object', { toString: () => 'stone' }],
];

test('CONTROL: every valid mode starts a run and gets a real step ceiling', async () => {
  // If this fails, the harness is dead and every refusal below is meaningless.
  for (const mode of VALID) {
    const { agent, errors } = await session().chat(mode);
    assert.ok(agent, `mode "${mode}" must start a run`);
    assert.deepEqual(errors, [], `mode "${mode}" must not be refused`);
    assert.equal(typeof agent.maxSteps, 'number', `mode "${mode}" must get a numeric step ceiling`);
    assert.ok(Number.isFinite(agent.maxSteps) && agent.maxSteps > 0, `mode "${mode}" ceiling must be usable`);
    // the ceiling must actually be able to stop the loop — this is the comparison session.ts makes
    assert.equal(9999 > agent.maxSteps, true, `mode "${mode}" ceiling must stop a runaway loop`);
  }
});

for (const [label, mode] of HOSTILE) {
  test(`a chat frame with ${label} as its mode is refused by name`, async () => {
    const { agent, errors } = await session().chat(mode);
    assert.equal(agent, undefined, 'no agent run may be created for an unrecognised mode');
    assert.ok(errors.includes('bad_mode'), `expected a bad_mode refusal, got [${errors.join(',')}]`);
  });
}

test('NO ACCEPTED MODE CAN EVER LACK A STEP CEILING', async () => {
  // The property that matters, stated directly rather than through the list above: whatever the
  // ingress accepts must arrive with a ceiling that can stop the loop. A default like `?? 'clay'`
  // would satisfy the refusal tests while quietly running a hostile value as something else; this
  // one would still hold, which is why it is written as a property and not a case.
  for (const [, mode] of [...HOSTILE, ...VALID.map((m) => [m, m])]) {
    const { agent } = await session().chat(mode);
    if (!agent) continue; // refused, which is the other acceptable outcome
    assert.equal(typeof agent.maxSteps, 'number', `mode ${JSON.stringify(mode)} was ACCEPTED with maxSteps ${JSON.stringify(agent.maxSteps)}`);
    assert.equal(9999 > agent.maxSteps, true, `mode ${JSON.stringify(mode)} was accepted with a ceiling that never stops`);
  }
});

test('a refused mode does not consume the run slot', async () => {
  // A refusal that left the session marked busy would be a denial of service dressed as a guard.
  const s = session();
  await s.chat('memory');
  const { agent, errors } = await s.chat('stone');
  assert.ok(agent, 'a valid mode must still start after a refused one');
  assert.ok(errors.includes('bad_mode'), 'the earlier refusal is still reported');
  assert.equal(typeof agent.maxSteps, 'number');
});
