/**
 * THE THINKING HEADER SAYS WHAT THE RUN IS DOING WHILE THE MODEL WORKS.
 *
 * F-007 (run 0afe6149): viewport_info finished at +37 s, the model then worked for 90 s, and the
 * header kept reading "Inspecting the project" the whole time — the phase the LAST TOOL left behind.
 * Every step after the first opened by re-announcing that stale phase. Nothing told the customer
 * the next step was being written.
 *
 * And two phases the shared vocabulary declares were never sent (docs/THINKING-UX.md §4):
 * `verifying`, for the check the worker runs by itself after a change, and `rebuilding`, for the
 * moment that check orders the layout started over.
 *
 * Driven through the real SessionDO. Only the provider is scripted, and `runTool` is scripted for
 * the one tool that would need a renderer and a vision model (`inspect_visually`); every other tool
 * is the production one. The property is read at the moment the provider is called: what does the
 * header say WHILE the model is generating?
 *
 * Run with:  node --test tests/thinking-phase.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'thinking-phase-'));
const OUT = join(TMP, 'session.mjs');
const REAL_TOOLS = join(WORKER, 'src', 'tools.ts');

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'do', 'session.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent',
  alias: { 'cloudflare:workers': join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs') },
  plugins: [{
    name: 'scripted-seams',
    setup(build) {
      build.onResolve({ filter: /^\.\.\/gateway$/ }, () => ({ path: 'gateway', namespace: 'scripted' }));
      build.onResolve({ filter: /^\.\.\/tools$/, namespace: 'file' }, (a) =>
        a.importer.endsWith(join('do', 'session.ts')) ? { path: 'tools', namespace: 'scripted' } : undefined);
      build.onLoad({ filter: /^gateway$/, namespace: 'scripted' }, () => ({
        loader: 'js',
        contents: `
          export class BudgetError extends Error { constructor(reason, message) { super(message); this.reason = reason; } }
          export class RateLimitedError extends Error {}
          export async function chat(env, req, opts) { return env.__testChat(req, opts); }
          export async function reasoningEffortApplies() { return true; }
        `,
      }));
      // Everything from the real registry; runTool is scripted ONLY for inspect_visually.
      build.onLoad({ filter: /^tools$/, namespace: 'scripted' }, () => ({
        loader: 'js',
        resolveDir: dirname(REAL_TOOLS),
        contents: `
          export * from ${JSON.stringify(REAL_TOOLS)};
          import { runTool as realRunTool } from ${JSON.stringify(REAL_TOOLS)};
          export async function runTool(ctx, name, args) {
            if (name === 'inspect_visually' && globalThis.__visualCheck) return globalThis.__visualCheck(ctx);
            return realRunTool(ctx, name, args);
          }
        `,
      }));
    },
  }],
});
const { SessionDO } = await import(pathToFileURL(OUT).href);
test.after(() => rmSync(TMP, { recursive: true, force: true }));

const result = (rows = [], one = null) => ({ toArray: () => rows, one: () => one });
const sql = { exec: (q) => (/count\(\*\)/.test(q) ? result([], { c: 0 }) : result()) };

async function makeSession({ responses, connected = false }) {
  const store = new Map([['bind', { projectId: 'p1', projectName: 'Phase Place', ownerId: 'owner-1' }]]);
  if (connected) store.set('pluginLastSeen', Date.now());
  const sent = [];
  /** The phase the header showed at the instant each model call began. */
  const phaseAtCall = [];
  const lastPhase = () => [...sent].reverse().find((m) => m.type === 'agent_status')?.phase;
  let attachment = { userId: 'owner-1', role: 'owner', connectionId: 'c1', activity: 'viewing', lastSeenMs: Date.now() };
  const ws = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)), close() {}, deserializeAttachment: () => attachment, serializeAttachment: (v) => { attachment = v; } };
  const namespace = (name) => ({
    idFromName: (id) => ({ __name: id, toString: () => `${name}:${id}` }),
    get: () => ({
      fetch: async (input) => {
        const path = new URL(typeof input === 'string' ? input : input.url).pathname;
        const q = { plan: 'free', creditsRemaining: 100, creditsDaily: 100, allowanceRemaining: 100, credits: 0, resetsAtIso: '2026-09-24T00:00:00.000Z' };
        if (name === 'QUOTA_DO' && path === '/state') return Response.json(q);
        if (name === 'QUOTA_DO' && path === '/spend') return Response.json({ ok: true, state: q, fromAllowance: 1, fromCredits: 0 });
        if (name === 'QUOTA_DO' && path === '/refund') return Response.json({ ok: true, returned: 1, state: q });
        return Response.json({ ok: true, state: { killed: false }, reserved: 1 });
      },
    }),
  });
  const ctx = {
    id: { toString: () => 'session-1' },
    storage: {
      async get(k) { return store.get(k); },
      async put(k, v) { if (k && typeof k === 'object') for (const [a, b] of Object.entries(k)) store.set(a, structuredClone(b)); else store.set(k, structuredClone(v)); },
      async delete(k) { for (const x of Array.isArray(k) ? k : [k]) store.delete(x); return true; },
      async deleteAlarm() {}, async deleteAll() { store.clear(); }, async list() { return new Map(); },
      async setAlarm() {}, async getAlarm() { return null; },
      sql,
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [ws],
    acceptWebSocket() {},
  };
  const queue = [...responses];
  const env = {
    QUOTA_DO: namespace('QUOTA_DO'), BUDGET_DO: namespace('BUDGET_DO'), ADMIN_DO: namespace('ADMIN_DO'),
    CORPUS: { async exec() {}, prepare() { return { bind() { return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { success: true, meta: { changes: 0 } }; } }; } },
    __testChat: async () => {
      phaseAtCall.push(lastPhase());
      assert.ok(queue.length > 0, 'the scripted provider was called more times than the fixture supplied');
      return structuredClone(queue.shift());
    },
  };
  const session = new SessionDO(ctx, env);
  await new Promise((r) => setTimeout(r, 0));
  if (connected) session.pluginLastSeenMs = Date.now();
  // The plugin's half: every Studio op is answered (refused), the way a poll would find it, so no
  // step sits out an op timeout.
  const answered = new Set();
  const answerer = setInterval(() => {
    for (const op of session.opQueue ?? []) {
      const waiter = session.opWaiters?.get(op.id);
      if (answered.has(op.id) || !waiter) continue;
      answered.add(op.id);
      waiter({ id: op.id, ok: false, error: 'this test does not answer Studio ops', failure: 'refused' });
    }
  }, 1);
  answerer.unref();
  return { session, store, sent, phaseAtCall, stop: () => clearInterval(answerer) };
}

const answer = (text = 'Here it is.') => ({
  text, toolCalls: [], usage: { inputTokens: 900, outputTokens: 10 }, neurons: 40,
  provider: 'workers-ai', model: '@cf/zai-org/glm-5.3-flash', finishReason: 'stop',
});
const calls = (name, args) => ({
  ...answer(''), finishReason: 'tool_calls', toolCalls: [{ id: `c-${name}`, name, arguments: JSON.stringify(args) }],
});

async function start(h, text, mode = 'agent') {
  const res = await h.session.fetch(new Request('https://do/agent-run', { method: 'POST', body: JSON.stringify({ text, mode, productModel: 'apple' }) }));
  assert.equal(res.status, 200, await res.text());
}

test('F-007: while the model writes the next step, the header no longer shows the last tool', async () => {
  const h = await makeSession({ responses: [calls('get_ui_construction', { id: 'screen-shop' }), answer(), answer(), answer()] });
  await start(h, 'what does the shop screen do', 'plan');
  await h.session.alarm(); // step 1: the model asks for a tool, the tool runs
  const toolPhase = h.sent.filter((m) => m.type === 'agent_status' && m.tool === 'get_ui_construction').at(-1)?.phase;
  assert.ok(toolPhase, 'CONTROL: the tool announced its own phase');
  await h.session.alarm(); // step 2: the model works on the tool's result
  h.stop();

  assert.equal(h.phaseAtCall.length >= 2, true, 'the second model call never happened');
  assert.notEqual(h.phaseAtCall[1], toolPhase, `the header still read the finished tool's phase (${toolPhase}) while the model worked`);
  assert.equal(h.phaseAtCall[1], 'composing', 'the model step is announced as its own phase');
});

test('the check the worker runs after a change is announced as verifying, and an ordered rebuild as rebuilding', async () => {
  globalThis.__visualCheck = (ctx) => {
    ctx.lastRender = { layout: { parts: [] } };
    ctx.lastCritique = { passed: false, unavailable: false, score: 3, summary: 'The room reads as empty.', hardFails: [], defects: [] };
    return { ok: true, summary: 'Visual check: 3/10' };
  };
  try {
    const h = await makeSession({ connected: true, responses: [answer('I built the cabin.'), answer(), answer()] });
    await start(h, 'build a cozy cabin interior with warm lighting');
    // The run has already changed the place, and one earlier pass left an identical (empty) scene —
    // so this failing check is the one that orders the layout started over.
    const agent = h.store.get('agent');
    assert.equal(agent.traits?.visualDesignTask, true, 'CONTROL: the request is classified as visual');
    h.store.set('agent', { ...agent, mutated: true, passes: [{ signature: 'empty', score: 3, parts: 0 }] });

    await h.session.alarm();
    const phases = h.sent.filter((m) => m.type === 'agent_status').map((m) => m.phase);
    const v = phases.indexOf('verifying');
    assert.ok(v >= 0, `the post-change check was never announced as verifying: ${phases.join(', ')}`);
    assert.equal(h.store.get('agent').rebuildOrdered, true, 'CONTROL: the check ordered a rebuild');
    assert.ok(phases.indexOf('rebuilding', v) > v, `the ordered rebuild was never announced: ${phases.join(', ')}`);

    await h.session.alarm();
    assert.equal(h.phaseAtCall[1], 'rebuilding', 'the step that starts the layout over keeps saying so while the model writes it');
    h.stop();
  } finally {
    delete globalThis.__visualCheck;
  }
});
