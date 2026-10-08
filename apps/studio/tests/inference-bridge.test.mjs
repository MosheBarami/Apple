import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const studio = fileURLToPath(new URL('..', import.meta.url)), worker = fileURLToPath(new URL('../../worker/', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'ai-flue-admission-'));
after(() => { rmSync(directory, { recursive: true, force: true }); delete globalThis.__studioTestEnvironment; delete globalThis.__studioHooks; });
const runtime = join(directory, 'runtime.mjs'), routing = join(directory, 'routing.mjs'), cloudflare = join(directory, 'cloudflare.mjs');
writeFileSync(runtime, `
export function setProvider(provider) { globalThis.__studioHooks.provider = provider; }
export const defineTool = (tool) => tool;
export function useModel(model) { globalThis.__studioHooks.model = model; }
export function useTool() {}
export function useSubagent(agent) { globalThis.__studioHooks.delegates.push(agent); }
export function useDelivery() { return globalThis.__studioHooks.delivery; }
export function usePersistentState(name, value) { return [globalThis.__studioHooks.state.get(name) ?? value, (next) => globalThis.__studioHooks.state.set(name, next)]; }
export function useResponseStart(callback) { globalThis.__studioHooks.start = callback; }
export function useResponseFinish(callback) { globalThis.__studioHooks.finish = callback; }
export function useAgentStart(callback) { globalThis.__studioHooks.agentStart = callback; }
export function useAgentFinish(callback) { globalThis.__studioHooks.agentFinish = callback; }
export function useDataWriter() { return (data) => { globalThis.__studioHooks.data = data; }; }
`);
writeFileSync(routing, `import { Hono } from ${JSON.stringify(join(worker, 'node_modules/hono/dist/index.js'))};
export function createAgentRouter() { const router = new Hono(); router.post('/:id', async (c) => c.json(await c.req.json(), 202)); return router; }`);
writeFileSync(cloudflare, 'export const env = globalThis.__studioTestEnvironment;');
const binding = join(directory, 'binding.mjs'); writeFileSync(binding, 'export const cloudflareBindingProvider = (options) => options;');
const hooks = globalThis.__studioHooks = { state: new Map(), delegates: [], delivery: { kind: 'user', body: 'Read the place' } };
const events = [];
const project = '12345678-1234-1234-1234-123456789abc', run = '12345678-1234-1234-1234-123456789def';
const selection = { route: 'byok', provider: 'groq', connectionId: run, modelId: 'fixture-model' };
const environment = globalThis.__studioTestEnvironment = {
  AI: { run: async (_model, input) => { events.push(['managed', input]); return { usage: { prompt_tokens: 12, completion_tokens: 2 } }; } },
  GATE: {
    openProject: async (jwt) => ({ ok: jwt === 'fixture-auth', canBuild: true }), canSpend: async () => ({ ok: true }),
    prepareInference: async (jwt, id, choice, identity) => { assert.equal(jwt, 'fixture-auth'); assert.equal(id, project);
      events.push(['prepare', choice, identity]); return { runRef: run, selection: choice, engineVersion: '1.0', policyVersion: 'routing-1' }; },
    reserveModel: async () => { events.push(['reserve']); return { ok: true, reserved: 1 }; },
    settleModel: async () => { events.push(['settle']); }, releaseModel: async () => {},
    chargeUsage: async (...args) => { events.push(['charge', ...args]); },
    inferenceEvidence: async (id, reference) => { assert.equal(id, project); assert.equal(reference, run); return { selection, decisions: [] }; },
    fetch: async (request) => { events.push(['private', request.url, await request.json()]); return new Response('verified fixture stream'); },
  },
};
function bundle(file, name) {
  const out = join(directory, name + '.mjs');
  execFileSync(join(worker, 'node_modules/.bin/esbuild'), [file, '--bundle', '--format=esm', `--outfile=${out}`,
    `--alias:@flue/runtime=${runtime}`, `--alias:@flue/runtime/routing=${routing}`,
    `--alias:@flue/runtime/cloudflare/workers-ai=${binding}`, `--alias:cloudflare:workers=${cloudflare}`], { stdio: 'pipe' });
  return import(`file://${out}`);
}
const app = (await bundle(join(studio, 'src/app.ts'), 'app')).default;
const agent = await bundle(join(studio, 'src/agents/studpilot.ts'), 'agent');
test('current Studio admission pins the explicit route before forwarding a structured creator delivery', async () => {
  events.length = 0;
  const body = { kind: 'user', body: 'Build an evaluation panel', idempotencyKey: 'request-one' };
  const response = await app.fetch(new Request(`https://studio/studio/api/agents/studpilot/${project}`, {
    method: 'POST', headers: { Authorization: 'Bearer fixture-auth', 'X-StudPilot-Inference': JSON.stringify(selection), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), environment);
  assert.equal(response.status, 202); const delivered = await response.json();
  assert.equal(delivered.kind, 'signal'); assert.equal(delivered.body, body.body); assert.equal(delivered.attributes.runRef, run);
  assert.equal(delivered.attributes.requestText, body.body); assert.equal(delivered.idempotencyKey, body.idempotencyKey);
  assert.deepEqual(events[0][1], selection); assert.equal(events[0][2].requestKey, 'request-one');
  assert.match(events[0][2].inputHash, /^[0-9a-f]{64}$/);
});
test('private model calls use the signed owner reference and never reserve or call the platform binding', async () => {
  events.length = 0;
  const response = await hooks.provider.binding.run(`@cf/studpilot/${project}/${run}`, { messages: [{ role: 'system', content: '<studpilot-role name="planner">Plan the piece.' }] });
  assert.equal(await response.text(), 'verified fixture stream'); assert.equal(events.length, 1);
  assert.equal(events[0][0], 'private'); assert.equal(events[0][1], `https://studio-gate/inference/${project}/${run}`);
  assert.equal(events[0][2].task, 'planning');
});
test('managed legacy dispatch retains its reservation, defaults and usage settlement', async () => {
  events.length = 0;
  await hooks.provider.binding.run('@cf/zai-org/glm-5.3-flash', { messages: [] });
  assert.deepEqual(events.map((event) => event[0]), ['reserve', 'managed', 'settle']);
  assert.equal(events[1][1].max_tokens, 6500); assert.equal(events[1][1].reasoning_effort, 'low');
});
test('private response metadata suppresses platform-provider charges and delegates inherit the pinned parent model', async () => {
  events.length = 0; hooks.delegates = []; hooks.delivery = { kind: 'signal', type: 'studpilot-creator-request', attributes: { runRef: run }, body: 'Build' };
  agent.StudPilot({ id: project });
  assert.equal(hooks.model, `cloudflare/@cf/studpilot/${project}/${run}`);
  assert.equal(hooks.delegates.length, 4); assert.ok(hooks.delegates.every((delegate) => delegate.model === undefined));
  await hooks.agentStart(); assert.equal(hooks.data.selection.route, 'byok');
  hooks.finish({ response: { usage: { input: 12, output: 2, cacheRead: 0 } }, metadata: hooks.start() });
  assert.equal(events.some((event) => event[0] === 'charge'), false);
  hooks.delivery = { kind: 'user', body: 'Legacy request' }; hooks.delegates = [];
  agent.StudPilot({ id: project }); hooks.finish({ response: { usage: { input: 12, output: 2, cacheRead: 0 } }, metadata: hooks.start() });
  assert.equal(events.at(-1)[0], 'charge'); assert.equal(events.at(-1)[1], project); assert.equal(events.at(-1)[2], '@cf/zai-org/glm-5.3-flash');
});
