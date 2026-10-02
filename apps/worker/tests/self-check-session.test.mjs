/**
 * THE SELF-CHECK INSIDE THE REAL RUN LOOP — gate, look, claim audit, bounds and the switch.
 *
 * Driven through the real SessionDO with a scripted provider (so the loop, the ledger, the gate and the audit are
 * production code) and a small fake Studio that remembers what was written to it. No provider is called, nothing
 * leaves the process, and nothing here names a subject: the same neutral door, sign and screen are used everywhere.
 *
 * What each test pins is a property:
 *   - a run that changed the place is looked at before it answers (once, by force), and the look is shown to the agent
 *     as observations it can act on
 *   - the planted lies are caught IN THE LOOP: a reply that says red against a read-back of white, a reply that
 *     calls hidden text visible — each is sent back to the agent, and what is still unsettled afterwards is said in one
 *     plain line after the agent's own, unrewritten words
 *   - every bound holds: 1 forced look, 2 repair rounds, 2 audit rounds, 6 looks
 *   - the switch works both ways: off is byte-for-byte the old behaviour (no look offered, nothing appended)
 *   - the ledger lives in its own storage key and is removed when the run ends
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePng, bytesToBase64 } from '../src/png.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'self-check-session-'));
const OUT = join(TMP, 'session.mjs');

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'do', 'session.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent',
  alias: { 'cloudflare:workers': join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs') },
  plugins: [{
    name: 'scripted-gateway',
    setup(build) {
      // The session's own door to the provider.
      build.onResolve({ filter: /^\.\.\/gateway$/ }, () => ({ path: 'scripted-session-gateway', namespace: 'scripted' }));
      // The tools' door (look's vision call goes through it): the real module with only `chat` replaced.
      build.onResolve({ filter: /^\.\/gateway$/ }, () => ({ path: 'scripted-tools-gateway', namespace: 'scripted' }));
      build.onLoad({ filter: /^scripted-session-gateway$/, namespace: 'scripted' }, () => ({
        loader: 'js',
        contents: `
          export class BudgetError extends Error { constructor(reason, message) { super(message); this.reason = reason; } }
          export class RateLimitedError extends Error { constructor(message) { super(message); this.name = 'RateLimitedError'; } }
          export async function chat(env, req, opts) { return env.__testChat(req, opts); }
          export async function reasoningEffortApplies() { return true; }
        `,
      }));
      build.onLoad({ filter: /^scripted-tools-gateway$/, namespace: 'scripted' }, () => ({
        loader: 'js',
        resolveDir: join(WORKER, 'src'),
        contents: `export * from ${JSON.stringify(join(WORKER, 'src', 'gateway.ts'))};
                   export async function chat(env, req, opts) { return env.__testChat(req, opts); }`,
      }));
    },
  }],
});
const { SessionDO } = await import(pathToFileURL(OUT).href);
test.after(() => rmSync(TMP, { recursive: true, force: true }));

const PNG = bytesToBase64(await encodePng(new Uint8Array(8 * 6 * 3).fill(100), 8, 6));

// ------------------------------------------------------------------------------------ a fake Studio ---

/** A place that remembers. `stickyColour: false` is a plugin that says "set" and leaves the colour white. */
function fakeStudio({ stickyColour = true, play = null, captureWorks = true, renderWorks = false } = {}) {
  const items = new Map([
    ['game.Workspace.Door', { class: 'Part', props: { Color: { t: 'Color3', v: [1, 1, 1] }, Position: { t: 'Vector3', v: [0, 3, 0] }, Size: { t: 'Vector3', v: [4, 6, 1] } } }],
    ['game.Workspace.Spawn', { class: 'SpawnLocation', props: { Position: { t: 'Vector3', v: [0, 0.5, 30] }, Size: { t: 'Vector3', v: [6, 1, 6] } } }],
    ['game.StarterGui.Hud.Joke', { class: 'TextLabel', props: { Text: { t: 'string', v: '' } } }],
  ]);
  let camera = [0, 20, 40, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  const log = [];
  const answer = (op) => {
    log.push(op);
    switch (op.op) {
      case 'get_tree': return { ok: true, data: { root: { path: op.root ?? 'game.Workspace', name: 'Workspace', class: 'Workspace', children: [] } } };
      case 'get_instance': {
        const it = items.get(op.path);
        return it ? { ok: true, data: { path: op.path, name: op.path.split('.').pop(), class: it.class, childCount: 0, props: it.props, attributes: {} } } : { ok: false, error: 'not found', failure: 'not_found' };
      }
      case 'set_props': {
        if (op.path === 'game.Workspace.Camera') { camera = op.props.CFrame.v; return { ok: true, data: { path: op.path, set: ['CFrame'] } }; }
        const it = items.get(op.path);
        if (!it) return { ok: false, error: 'not found', failure: 'not_found' };
        for (const [k, v] of Object.entries(op.props ?? {})) if (k !== 'Color' || stickyColour) it.props[k] = v;
        return { ok: true, data: { path: op.path, set: Object.keys(op.props ?? {}) } };
      }
      case 'viewport_info':
        return { ok: true, data: { camera: { cframe: camera, fov: 70 }, workspaceTopLevel: [...items].filter(([path]) => path.startsWith('game.Workspace.')).map(([path, it]) => ({ path, class: it.class, center: it.props.Position.v, size: it.props.Size.v })) } };
      case 'spatial_query': {
        const it = items.get(op.path) ?? items.get('game.Workspace.Door');
        return { ok: true, data: { action: 'bounds', path: op.path, center: it.props.Position.v, size: it.props.Size.v } };
      }
      case 'capture_studio_viewport':
        return captureWorks ? { ok: true, data: { source: 'studio_viewport', encoding: 'png', rgbBase64: PNG, width: 8, height: 6, view: 'viewport', subject: 'game.Workspace', capturedAt: 1 } } : { ok: false, error: 'capture unavailable' };
      case 'render_view':
        return renderWorks ? { ok: true, data: { subject: 'x', boundsSize: [1, 1, 1], views: [{ name: 'hero', rgbBase64: bytesToBase64(new Uint8Array(8 * 6 * 3).fill(60)), meta: { width: 8, height: 6 } }] } } : { ok: false, error: 'renderer unavailable' };
      case 'play_check': return play ? { ok: true, data: play } : { ok: false, error: 'play check unavailable' };
      case 'get_logs': return { ok: true, data: { entries: [] } };
      default: return { ok: true, data: {} };
    }
  };
  return { answer, log, items, camera: () => camera };
}

// -------------------------------------------------------------------------------------- the harness ---

const result = (rows = [], one = null) => ({ toArray: () => rows, one: () => one });
class SqlMemory {
  constructor() { this.messages = []; }
  exec(statement, ...args) {
    const q = statement.replace(/\s+/g, ' ').trim();
    if (/pragma_table_info\('checkpoints'\)/.test(q)) return result([]);
    if (q.startsWith('insert into messages(')) {
      const [id, role, mode, content, maybeTrace, maybeCreated] = args;
      const withTrace = args.length === 6;
      this.messages.push({ id, role, mode, content, tool_trace: withTrace ? maybeTrace : null, created_at: withTrace ? maybeCreated : maybeTrace });
      return result();
    }
    if (q.startsWith('select count(*) as c from messages')) return result([], { c: this.messages.length });
    return result();
  }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const LOOK_OBSERVATIONS = { observations: [{ about: 'the door', verdict: 'seen', note: 'a door in the wall' }], answers: [], issues: [] };

async function makeSession({ responses = [], studio = fakeStudio(), env: envExtra = {}, capabilities = null, look = LOOK_OBSERVATIONS, lookNeurons = 120, judge = { unsupported: [] }, judgeNeurons = 33 } = {}) {
  const store = new Map([['bind', { projectId: 'project-1', projectName: 'Check Place', ownerId: 'owner-1' }]]);
  store.set('pluginLastSeen', Date.now());
  const sql = new SqlMemory();
  const sent = [];
  const spends = [];
  const refunds = [];
  const chatCalls = [];
  const visionCalls = [];
  const judgeCalls = [];
  const alarms = [];
  const ops = [];
  let attachment = { userId: 'owner-1', role: 'owner', connectionId: 'connection-1', activity: 'viewing', lastSeenMs: Date.now() };
  const ws = {
    readyState: 1, send: (raw) => sent.push(JSON.parse(raw)), close: () => {},
    deserializeAttachment: () => attachment, serializeAttachment: (next) => { attachment = next; },
  };
  const quotaState = () => {
    const spent = spends.reduce((n, v) => n + v, 0) - refunds.reduce((n, v) => n + v, 0);
    return { plan: 'free', creditsRemaining: 100 - spent, creditsDaily: 100, allowanceRemaining: 100 - spent, credits: 0, resetsAtIso: '2026-09-23T00:00:00.000Z' };
  };
  const namespace = (name) => ({
    idFromName: (id) => ({ __name: id, toString: () => `${name}:${id}` }),
    get: (id) => ({
      fetch: async (input, init) => {
        const path = new URL(typeof input === 'string' ? input : input.url).pathname;
        const body = init?.body ? JSON.parse(init.body) : {};
        if (name === 'QUOTA_DO' && path === '/state') return Response.json(quotaState());
        if (name === 'QUOTA_DO' && path === '/spend') { spends.push(Number(body.credits ?? 0)); return Response.json({ ok: true, state: quotaState(), fromAllowance: Number(body.credits ?? 0), fromCredits: 0 }); }
        if (name === 'QUOTA_DO' && path === '/refund') {
          const returned = Number(body.fromAllowance ?? 0) + Number(body.fromCredits ?? 0);
          refunds.push(returned);
          return Response.json({ ok: true, returned, state: quotaState() });
        }
        return Response.json({ ok: true, id: id.__name, state: { killed: false }, reserved: 1 });
      },
    }),
  });
  const ctx = {
    id: { toString: () => 'session-1' },
    storage: {
      async get(key) { return store.get(key); },
      async put(key, value) {
        if (key && typeof key === 'object') for (const [k, v] of Object.entries(key)) store.set(k, structuredClone(v));
        else store.set(key, structuredClone(value));
      },
      async delete(key) { for (const k of Array.isArray(key) ? key : [key]) store.delete(k); return true; },
      async deleteAlarm() {}, async deleteAll() { store.clear(); }, async list() { return new Map(); },
      async setAlarm(at) { alarms.push(at); }, async getAlarm() { return alarms.at(-1) ?? null; },
      sql,
    },
    blockConcurrencyWhile: (fn) => fn(), getWebSockets: () => [ws], acceptWebSocket: () => {},
  };
  const queue = [...responses];
  const env = {
    QUOTA_DO: namespace('QUOTA_DO'), BUDGET_DO: namespace('BUDGET_DO'), ADMIN_DO: namespace('ADMIN_DO'),
    CORPUS: { async exec() {}, prepare() { return { bind() { return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { success: true, meta: { changes: 0 } }; } }; } },
    ...envExtra,
    __testChat: async (req, opts) => {
      if (opts?.kind === 'selfcheck:judge') {
        judgeCalls.push({ req, opts });
        if (judge instanceof Error) throw judge;
        return { text: JSON.stringify(judge), neurons: judgeNeurons };
      }
      if (opts?.kind === 'visual:look') {
        visionCalls.push({ req, opts });
        if (look instanceof Error) throw look;
        return { text: JSON.stringify(look), neurons: lookNeurons };
      }
      chatCalls.push({ req, opts });
      assert.ok(queue.length > 0, `the scripted provider was called more times than the fixture supplied (${chatCalls.length})`);
      return structuredClone(queue.shift());
    },
  };
  const session = new SessionDO(ctx, env);
  await settle();
  session.pluginLastSeenMs = Date.now();
  if (capabilities) session.pluginCapabilityReport = capabilities;
  const answered = new Set();
  const answerer = setInterval(() => {
    for (const op of session.opQueue ?? []) {
      if (answered.has(op.id)) continue;
      const waiter = session.opWaiters?.get(op.id);
      if (!waiter) continue;
      answered.add(op.id);
      ops.push(op.studioOp);
      waiter({ id: op.id, ...studio.answer(op.studioOp) });
    }
  }, 1);
  return { session, store, sql, sent, spends, refunds, chatCalls, visionCalls, judgeCalls, alarms, ops, studio, stop: () => clearInterval(answerer), queue };
}

const answer = ({ text = '', toolCalls = [], neurons = 40 } = {}) => ({
  text, toolCalls, usage: { inputTokens: 900, outputTokens: Math.max(1, Math.ceil(text.length / 4)) }, neurons,
  provider: 'workers-ai', model: '@cf/zai-org/glm-5.3-flash', finishReason: toolCalls.length ? 'tool_calls' : 'stop',
});
const calls = (...list) => answer({ toolCalls: list.map(([name, args], i) => ({ id: `c${Math.random().toString(36).slice(2)}-${i}`, name, arguments: JSON.stringify(args) })) });
const paint = (rgb) => calls(['set_properties', { path: 'game.Workspace.Door', props: { Color: { t: 'Color3', v: rgb } } }]);
const readDoor = () => calls(['get_instance', { path: 'game.Workspace.Door' }]);

async function start(h, text = 'put a door in the wall and make it red') {
  const res = await h.session.fetch(new Request('https://do/agent-run', { method: 'POST', body: JSON.stringify({ text, mode: 'agent', productModel: 'apple' }) }));
  assert.equal(res.status, 200, await res.text());
}
async function run(h, max = 30) {
  for (let i = 0; i < max && !lastEnd(h); i++) await h.session.alarm();
  assert.ok(lastEnd(h), `the run never ended (${stepCalls(h).length} model calls, queue left ${h.queue.length})`);
}
const lastEnd = (h) => [...h.sent].reverse().find((m) => m.type === 'msg_end');
const reply = (h) => [...h.sql.messages].reverse().find((m) => m.role === 'assistant')?.content;
const offered = (call) => (call.req.tools ?? []).map((t) => t.name ?? t.function?.name);
const userMessages = (h) => stepCalls(h).at(-1).req.messages.filter((m) => m.role === 'user').map((m) => String(m.content));
const opsNamed = (h, name) => h.ops.filter((o) => o.op === name);
/** The calls the AGENT's steps made. The memory distiller also calls the model once, when a run ends; it is not a step. */
const stepCalls = (h) => h.chatCalls.filter((c) => !/Previous summary/.test(String(c.req.messages.at(-1)?.content ?? '')));
const NOTE = /What I did not check/;

// ============================================================================== the completion gate ===

test('a run that changed the place is looked at before it answers: once, by force, and the agent gets the observations', async () => {
  const h = await makeSession({
    responses: [paint([1, 0, 0]), answer({ text: 'The door is in the wall.' }), answer({ text: 'The door is in the wall, as asked.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(h.visionCalls.length, 1, 'exactly one forced look');
    assert.equal(opsNamed(h, 'capture_studio_viewport').length >= 3, true, 'several views were captured');
    assert.equal(stepCalls(h).length, 3, 'build, first answer, answer after the look');
    const afterLook = userMessages(h).join('\n');
    assert.match(afterLook, /observations/i);
    assert.match(afterLook, /a door in the wall/);
    assert.equal(lastEnd(h).stopReason, 'done');
    assert.equal(reply(h), 'The door is in the wall, as asked.', 'the agent\'s own last words, nothing appended');
    const tool = h.sent.find((m) => m.type === 'tool_end' && /Looked at what was built/.test(m.summary));
    assert.ok(tool, 'the user sees a row for the look');
  } finally { h.stop(); }
});

test('the user\'s camera is where it was when the run ends', async () => {
  const h = await makeSession({ responses: [paint([1, 0, 0]), answer({ text: 'Done.' }), answer({ text: 'Done.' })] });
  try {
    const before = h.studio.camera();
    await start(h);
    await run(h);
    assert.deepEqual(h.studio.camera(), before);
    assert.ok(opsNamed(h, 'set_props').some((o) => o.path === 'game.Workspace.Camera'), 'the camera really was moved by the look');
  } finally { h.stop(); }
});

test('a look the agent made itself satisfies the gate: nothing is forced', async () => {
  const h = await makeSession({
    responses: [paint([1, 0, 0]), calls(['look', { expect: ['a door'] }]), answer({ text: 'The door is in the wall.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(h.visionCalls.length, 1);
    assert.equal(stepCalls(h).length, 3);
    assert.equal(reply(h), 'The door is in the wall.');
  } finally { h.stop(); }
});

test('changes after the look: the agent is ASKED to look again, at most twice, and then the answer goes through', async () => {
  // Build, answer (forced look), then the agent keeps changing the door and answering: each time it answers with the
  // change unlooked the gate asks. After two asks the run ends with an honest line instead of a third.
  const h = await makeSession({
    responses: [
      paint([1, 0, 0]), answer({ text: 'Done.' }), // forced look
      paint([0.9, 0, 0]), answer({ text: 'Done again.' }), // ask 1
      paint([0.8, 0, 0]), answer({ text: 'Done once more.' }), // ask 2
      paint([0.7, 0, 0]), answer({ text: 'Final.' }), // pass: bounds used
    ],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(h.visionCalls.length, 1, 'the agent never called look itself in this fixture');
    const asks = h.chatCalls.flatMap((c) => c.req.messages).filter((m) => m.role === 'user' && /changed the place after your last look/i.test(String(m.content)));
    assert.equal(new Set(asks.map((m) => String(m.content))).size >= 1, true);
    assert.equal(h.store.get('agent').status === 'running', false);
    assert.match(reply(h), /^Final\./);
    assert.match(reply(h), /What I did not check: .*how it looks after my last changes/);
  } finally { h.stop(); }
});

test('the per-run look cap holds even for an agent that keeps asking', async () => {
  const lookCalls = Array.from({ length: 8 }, (_, i) => calls(['look', { expect: [`thing ${i}`] }]));
  const h = await makeSession({ responses: [paint([1, 0, 0]), ...lookCalls, answer({ text: 'Done.' })] });
  try {
    await start(h);
    await run(h, 40);
    assert.equal(h.visionCalls.length, 6, `the cap is 6 looks per run, saw ${h.visionCalls.length}`);
    assert.match(JSON.stringify(h.store.get('agent').llm), /look limit reached/);
  } finally { h.stop(); }
});

test('no Studio look available (the plugin cannot render): the gate steps aside and the final line admits it', async () => {
  const noRender = { schema: 'golem.studio-ops.v1', operations: [{ op: 'render_view', status: 'unsupported', reason: 'cannot render' }] };
  // Worded and scripted as a property change that is not about appearance: the run loop already adds its own "rendered
  // appearance was not verified" sentence to a visual request on a Studio that cannot render, which is another mechanism.
  const h = await makeSession({ capabilities: noRender, responses: [calls(['set_properties', { path: 'game.Workspace.Door', props: { Anchored: { t: 'bool', v: true } } }]), answer({ text: 'The door is anchored.' })] });
  try {
    await start(h, 'Anchor the Workspace Door.');
    await run(h);
    assert.equal(h.visionCalls.length, 0);
    assert.ok(!h.chatCalls.some((c) => offered(c).includes('look')), 'look was not offered to a Studio that cannot render');
    assert.match(reply(h), /^The door is anchored\./);
    assert.match(reply(h), /\n\nWhat I did not check: how it looks in Studio \(I could not look at it this time\)\.$/);
  } finally { h.stop(); }
});

test('a look that could not run is not retried by force and not made up: one model call fewer, and the line says so', async () => {
  const h = await makeSession({
    studio: fakeStudio({ captureWorks: false, renderWorks: false }),
    responses: [paint([1, 0, 0]), answer({ text: 'The door is in the wall.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(h.visionCalls.length, 0, 'no picture, no model call');
    assert.equal(stepCalls(h).length, 2);
    assert.match(reply(h), /What I did not check: how it looks after my last changes\./);
    assert.deepEqual(h.studio.camera(), [0, 20, 40, 1, 0, 0, 0, 1, 0, 0, 0, 1], 'and the camera is back');
  } finally { h.stop(); }
});

test('a run that changed nothing is not stopped for a look and not given a line', async () => {
  const h = await makeSession({ responses: [readDoor(), answer({ text: 'The door is white.' })] });
  try {
    await start(h, 'Tell me what colour the door is. Just tell me, do not change anything.');
    await run(h);
    assert.equal(h.visionCalls.length, 0);
    assert.equal(reply(h), 'The door is white.');
  } finally { h.stop(); }
});

// ============================================================================== the planted lies ===

test('PLANTED LIE 1 IN THE LOOP: the reply says red, the read-back says white — it goes back to the agent, and an agent that repeats it is flagged to the user', async () => {
  const h = await makeSession({
    studio: fakeStudio({ stickyColour: false }),
    responses: [
      paint([1, 0, 0]), readDoor(),
      answer({ text: 'I painted the door red.' }), // gate: forced look
      answer({ text: 'I painted the door red.' }), // audit round 1
      answer({ text: 'I painted the door red.' }), // audit round 2
      answer({ text: 'I painted the door red.' }), // out of rounds
    ],
  });
  try {
    await start(h);
    await run(h);
    const steers = h.chatCalls.flatMap((c) => c.req.messages).filter((m) => m.role === 'user' && /claims that what this run observed does not support/i.test(String(m.content)));
    assert.ok(steers.length >= 1, 'the contradiction never went back to the agent');
    assert.match(String(steers[0].content), /white/);
    assert.match(String(steers[0].content), /painted the door red/);
    assert.equal(new Set(steers.map((m) => String(m.content))).size, 1, 'the same steer, repeated while the claim stands');
    const final = reply(h);
    assert.ok(final.startsWith('I painted the door red.'), 'the agent\'s words come first, unrewritten');
    assert.match(final, /\n\nWhat I did not check: .*door.*red.*white/);
    assert.equal(final.split(NOTE).length, 2, 'said once');
    assert.equal(stepCalls(h).length, 6, 'bounded: 2 audit rounds, no more');
  } finally { h.stop(); }
});

test('PLANTED LIE 1, honest after the steer: an agent that corrects itself gets no line at all', async () => {
  const h = await makeSession({
    studio: fakeStudio({ stickyColour: false }),
    responses: [
      paint([1, 0, 0]), readDoor(),
      answer({ text: 'I painted the door red.' }), // forced look
      answer({ text: 'I painted the door red.' }), // audit round 1
      answer({ text: 'I tried to paint the door red, but when I read it back it was still white.' }),
    ],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(reply(h), 'I tried to paint the door red, but when I read it back it was still white.');
  } finally { h.stop(); }
});

test('PLANTED LIE 2 IN THE LOOP: the reply calls hidden text visible — sent back, then flagged', async () => {
  const play = {
    playerJoined: true, characterSpawned: true, clientReported: true, harnessRemoved: true,
    screenGuis: [{ name: 'Hud', enabled: true, labels: [{ name: 'Joke', class: 'TextLabel', text: 'Knock knock', visible: false }] }],
    clientErrors: [], serverErrors: [], leaderstatsBefore: null, leaderstatsAfter: null,
  };
  const h = await makeSession({
    // play_check exists only in plugins that say so: the store build of 1.1.0 does not have it (plugin-capabilities.ts).
    capabilities: { schema: 'golem.studio-ops.v1', operations: [{ op: 'play_check', status: 'supported' }] },
    studio: fakeStudio({ play }),
    responses: [
      calls(['set_properties', { path: 'game.StarterGui.Hud.Joke', props: { Text: { t: 'string', v: 'Knock knock' } } }]),
      calls(['play_check', {}]),
      // The change was a screen: a look at the viewport could not show it, so the gate does not force one (see the next test).
      answer({ text: 'Players see "Knock knock" on screen.' }), // audit round 1
      answer({ text: 'Players see "Knock knock" on screen.' }), // audit round 2
      answer({ text: 'Players see "Knock knock" on screen.' }), // out of rounds
    ],
  });
  try {
    await start(h, 'show a joke on the screen');
    await run(h);
    assert.equal(h.visionCalls.length, 0, 'nothing in the viewport changed');
    const steers = h.chatCalls.flatMap((c) => c.req.messages).filter((m) => m.role === 'user' && /does not support/i.test(String(m.content)));
    assert.ok(steers.length >= 1);
    assert.match(String(steers[0].content), /hidden/i);
    assert.match(reply(h), /^Players see "Knock knock" on screen\./);
    assert.match(reply(h), /What I did not check: that "Knock knock" really shows on the screen/);
  } finally { h.stop(); }
});

test('a run that only changed a screen and a script is not stopped for a look at a viewport that cannot show them', async () => {
  const h = await makeSession({
    responses: [
      calls(['set_properties', { path: 'game.StarterGui.Hud.Joke', props: { Text: { t: 'string', v: 'Knock knock' } } }]),
      answer({ text: 'The joke label now reads as you asked.' }),
    ],
  });
  try {
    await start(h, 'Change the joke label text.');
    await run(h);
    assert.equal(h.visionCalls.length, 0);
    assert.equal(opsNamed(h, 'capture_studio_viewport').length, 0, 'no picture was taken');
    assert.equal(stepCalls(h).length, 2);
    assert.equal(reply(h), 'The joke label now reads as you asked.', 'and the line does not claim the viewport was left unchecked');
  } finally { h.stop(); }
});

test('a claim the agent could not settle with anything it was offered goes straight to the line, not back to the agent', async () => {
  const h = await makeSession({
    responses: [paint([1, 0, 0]), calls(['look', {}]), answer({ text: 'The chest opens when you click it.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(stepCalls(h).length, 3, 'no send-back round was spent');
    assert.match(reply(h), /What I did not check: .*it works as I said/);
  } finally { h.stop(); }
});

// ===================================================================================== the switch ===

test('SELF_CHECK=off is the old behaviour exactly: look not offered, nothing forced, nothing appended, no ledger', async () => {
  const h = await makeSession({
    env: { SELF_CHECK: 'off' },
    studio: fakeStudio({ stickyColour: false }),
    responses: [paint([1, 0, 0]), readDoor(), answer({ text: 'I painted the door red.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.ok(h.chatCalls.every((c) => !offered(c).includes('look')), 'look must not be offered when the check is off');
    assert.equal(h.visionCalls.length, 0);
    assert.equal(stepCalls(h).length, 3);
    assert.equal(reply(h), 'I painted the door red.');
    assert.equal(h.store.has('selfCheckLedger'), false);
  } finally { h.stop(); }
});

test('the deployed production worker stays as it was until the owner turns the check on', async () => {
  const h = await makeSession({
    env: { ENVIRONMENT: 'production' },
    responses: [paint([1, 0, 0]), answer({ text: 'The door is in the wall.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(h.visionCalls.length, 0);
    assert.equal(reply(h), 'The door is in the wall.');
    assert.ok(h.chatCalls.every((c) => !offered(c).includes('look')));
  } finally { h.stop(); }
});

test('SELF_CHECK=on in production turns it on', async () => {
  const h = await makeSession({
    env: { ENVIRONMENT: 'production', SELF_CHECK: 'on' },
    responses: [paint([1, 0, 0]), answer({ text: 'The door is in the wall.' }), answer({ text: 'The door is in the wall.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(h.visionCalls.length, 1);
  } finally { h.stop(); }
});

// ================================================================================ the ledger itself ===

test('the ledger lives in its own storage key, never inside the agent state, and is gone when the run ends', async () => {
  const h = await makeSession({ responses: [paint([1, 0, 0]), answer({ text: 'Done.' }), answer({ text: 'Done.' })] });
  try {
    await start(h);
    let seenDuringRun = null;
    for (let i = 0; i < 30 && !lastEnd(h); i++) {
      await h.session.alarm();
      seenDuringRun ??= h.store.get('selfCheckLedger') ?? null;
    }
    assert.ok(seenDuringRun, 'the ledger was never stored during the run');
    assert.equal(seenDuringRun.ledger.v, 1);
    assert.ok(seenDuringRun.ledger.mutationSeq >= 1);
    assert.ok(!('colours' in h.store.get('agent')), 'the ledger must not ride inside the agent state (128 KiB cap)');
    assert.equal(h.store.has('selfCheckLedger'), false, 'removed when the run ended');
  } finally { h.stop(); }
});

test('the look\'s vision cost is counted into the run\'s compute, so it reaches the Credits', async () => {
  const withLook = await makeSession({ responses: [paint([1, 0, 0]), answer({ text: 'Done.' }), answer({ text: 'Done.' })], lookNeurons: 5000 });
  try {
    await start(withLook);
    await run(withLook);
    const used = withLook.store.get('agent').neuronsUsed;
    assert.ok(used >= 5000, `neuronsUsed ${used} does not include the 5000-neuron look`);
  } finally { withLook.stop(); }
});

test('every model-visible instruction the check adds is plain text the agent can act on: no tool-call syntax, no secrets', async () => {
  const h = await makeSession({
    studio: fakeStudio({ stickyColour: false }),
    responses: [paint([1, 0, 0]), readDoor(), answer({ text: 'I painted the door red.' }), answer({ text: 'Done.' })],
  });
  try {
    await start(h);
    await run(h);
    const added = stepCalls(h).at(-1).req.messages.filter((m) => m.role === 'user').map((m) => String(m.content)).filter((t) => /observations|does not support/i.test(t));
    assert.ok(added.length >= 1);
    for (const t of added) {
      assert.ok(t.length < 2500, `${t.length} chars`);
      assert.doesNotMatch(t, /game\.Workspace\.Camera|rgbBase64|iVBOR/);
    }
  } finally { h.stop(); }
});

// ===================================================================== SELF_CHECK=full: the judge ===

test('FULL: the cheap judge reads a reply the deterministic audit cannot, and what it finds goes back to the agent', async () => {
  const h = await makeSession({
    env: { SELF_CHECK: 'full' },
    judge: { unsupported: [{ claim: 'The lamp comes on at dusk.', why: 'nothing observed any lamp' }] },
    responses: [
      paint([1, 0, 0]), calls(['look', {}]),
      answer({ text: 'Done. The lamp comes on at dusk.' }), // judge flags it
      answer({ text: 'Done. I did not check how the lamp behaves at dusk.' }),
    ],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(h.judgeCalls.length >= 1, true, 'the judge was never asked');
    assert.equal(h.judgeCalls[0].opts.kind, 'selfcheck:judge');
    const steer = userMessages(h).find((t) => /does not support/i.test(t));
    assert.ok(steer, 'the judge\'s finding never went back to the agent');
    assert.match(steer, /lamp comes on at dusk/);
    assert.equal(reply(h), 'Done. I did not check how the lamp behaves at dusk.');
  } finally { h.stop(); }
});

test('FULL: the judge\'s cost reaches the run\'s compute and is settled even though the run ends on the answer', async () => {
  const h = await makeSession({
    env: { SELF_CHECK: 'full' }, judgeNeurons: 4000,
    responses: [paint([1, 0, 0]), calls(['look', {}]), answer({ text: 'Done. The door is in the wall, as you asked.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.ok(h.store.get('agent').neuronsUsed >= 4000, `neuronsUsed ${h.store.get('agent').neuronsUsed}`);
    assert.ok(h.spends.reduce((n, v) => n + v, 0) >= 3, 'the judge\'s compute reached the Credits');
  } finally { h.stop(); }
});

test('FULL: a judge that fails changes nothing — the reply goes out exactly as it would without one', async () => {
  const h = await makeSession({
    env: { SELF_CHECK: 'full' }, judge: new Error('the judge model is down'),
    responses: [paint([1, 0, 0]), calls(['look', {}]), answer({ text: 'Done. The door is in the wall, as you asked.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(reply(h), 'Done. The door is in the wall, as you asked.');
  } finally { h.stop(); }
});

test('ON (the default) never calls the judge: no extra model call is made for the deterministic check', async () => {
  const h = await makeSession({
    judge: { unsupported: [{ claim: 'The lamp comes on at dusk.', why: 'x' }] },
    responses: [paint([1, 0, 0]), calls(['look', {}]), answer({ text: 'Done. The lamp comes on at dusk.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(h.judgeCalls.length, 0);
    assert.equal(reply(h), 'Done. The lamp comes on at dusk.');
  } finally { h.stop(); }
});

test('FULL: the judge is not asked about a reply the gate is about to send back for a look', async () => {
  const h = await makeSession({
    env: { SELF_CHECK: 'full' },
    responses: [paint([1, 0, 0]), answer({ text: 'Done. The door is in the wall, as you asked.' }), answer({ text: 'Done. The door is in the wall, as you asked.' })],
  });
  try {
    await start(h);
    await run(h);
    assert.equal(h.visionCalls.length, 1);
    assert.equal(h.judgeCalls.length, 1, 'once, on the reply that could be final — not on the one the look interrupted');
  } finally { h.stop(); }
});
