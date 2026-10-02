/**
 * THE `look` TOOL AND THE LEDGER HOOK IN runTool — the self-check wired into the real tool registry.
 *
 * Properties under test:
 *   - `look` is a registered, Studio-only, non-mutating tool whose description promises observations and not a score
 *   - running it records the look in the run's ledger (so the gate and the audit can see it), counts its vision cost,
 *     never puts pixels in the model's transcript, and refuses past the per-run cap before any Studio operation
 *   - runTool records what every other tool did into ctx.evidence — changes, read-backs and player checks — and a
 *     context with no ledger (the eval harness, the admin route) is unaffected
 *
 * The vision gateway and the plugin are fakes; nothing leaves the process.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { newLedger } from '../src/evidence-ledger.ts';
import { encodePng, bytesToBase64 } from '../src/png.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'look-tool-'));
const OUT = join(TMP, 'tools.mjs');
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'tools.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent',
  plugins: [{
    name: 'scripted-vision',
    setup(build) {
      build.onResolve({ filter: /^\.\/gateway$/ }, () => ({ path: 'scripted-gateway', namespace: 'scripted' }));
      // Everything the real gateway exports stays; only `chat` (the one door to a model) is replaced.
      build.onLoad({ filter: /.*/, namespace: 'scripted' }, () => ({
        loader: 'js',
        resolveDir: join(WORKER, 'src'),
        contents: `export * from ${JSON.stringify(join(WORKER, 'src', 'gateway.ts'))};
                   export async function chat(env, req, opts) { return globalThis.__visionChat(req, opts); }`,
      }));
    },
  }],
});
const T = await import(pathToFileURL(OUT).href);
test.after(() => rmSync(TMP, { recursive: true, force: true }));

const PNG = bytesToBase64(await encodePng(new Uint8Array(8 * 6 * 3).fill(90), 8, 6));
const nativeFrame = () => ({ ok: true, id: 'c', data: { source: 'studio_viewport', encoding: 'png', rgbBase64: PNG, width: 8, height: 6, view: 'viewport', subject: 'game.Workspace', capturedAt: 1 } });

let visionCalls = [];
globalThis.__visionChat = async (req, opts) => {
  visionCalls.push({ req, opts });
  return { text: JSON.stringify({ observations: [{ about: 'a fountain', verdict: 'seen', note: 'a stone basin' }, { about: 'a path', verdict: 'not_seen', note: 'only grass' }], answers: [], issues: ['a wall floats'] }), neurons: 123 };
};

function lookCtx({ ledger = newLedger(), answer, neurons } = {}) {
  const ops = [];
  const emitted = [];
  const ctx = {
    env: {},
    evidence: ledger,
    request: 'a garden with a fountain',
    studioConnected: () => true,
    emitFrame: (f) => emitted.push(f),
    addNeurons: (n) => neurons?.push(n),
    addMemoryFact: async () => 'saved',
    execStudioOp: async (op) => {
      ops.push(op);
      if (answer) return answer(op);
      switch (op.op) {
        case 'viewport_info': return { id: 'v', ok: true, data: { camera: { cframe: [0, 5, 20, 1, 0, 0, 0, 1, 0, 0, 0, 1] }, workspaceTopLevel: [{ path: 'game.Workspace.Garden', class: 'Model', center: [0, 3, 0], size: [20, 6, 20] }] } };
        case 'spatial_query': return { id: 's', ok: true, data: { center: [0, 3, 0], size: [20, 6, 20] } };
        case 'set_props': return { id: 'p', ok: true, data: {} };
        case 'capture_studio_viewport': return nativeFrame();
        default: return { id: 'x', ok: false, error: `unexpected ${op.op}` };
      }
    },
  };
  return { ctx, ops, emitted, ledger };
}

const made = (ledger) => {
  ledger.mutationSeq = 1;
  ledger.touched.push('game.Workspace.Garden.Fountain');
};

// ================================================================================= registration ===

test('look is registered, Studio-only, and changes nothing', () => {
  assert.ok(T.toolNames().includes('look'));
  const t = T.TOOLS.look;
  assert.equal(t.studio, true);
  assert.deepEqual([...t.studioOps], ['render_view'], 'the always-present op, so an older plugin still gets a (box) look');
  assert.equal(t.mutatesProject, undefined);
  assert.ok(!T.projectMutatingToolNames().includes('look'));
  assert.ok(T.toolDefs(true, undefined).map((d) => d.name).includes('look'));
  assert.ok(!T.toolDefs(false, undefined).map((d) => d.name).includes('look'));
});

test('look\'s description says what it returns and what it cannot see', () => {
  const d = T.TOOLS.look.def;
  assert.match(d.description, /observations/i);
  assert.match(d.description, /not a score/i);
  assert.match(d.description, /cannot tell/i);
  assert.deepEqual(d.parameters.required ?? [], [], 'every argument is optional: a bare look frames what the run changed');
  assert.deepEqual(Object.keys(d.parameters.properties).sort(), ['expect', 'questions', 'targets', 'views']);
});

test('look is offered to every plugin that can show a picture of the place, and withheld from one that cannot', async () => {
  const { filterToolsForPlugin } = await import('../src/plugin-capabilities.ts');
  const studioTools = Object.entries(T.TOOLS).filter(([, t]) => t.studio);
  const requirements = Object.fromEntries(studioTools.map(([name, t]) => [name, t.studioOps ?? []]));
  const alternatives = Object.fromEntries(Object.entries(T.TOOLS).map(([name, t]) => [name, t.studioOpAlternatives ?? []]));
  const report = (...entries) => ({ schema: 'golem.studio-ops.v1', operations: entries.map(([op, status]) => (status === 'supported' ? { op, status } : { op, status, reason: `${op} is ${status}` })) });
  const offered = (rawReport) => filterToolsForPlugin(['look'], requirements, rawReport, alternatives).allowed.has('look');
  assert.equal(offered(null), true, 'a plugin that sends no report (the store build) keeps the look: the box views work there');
  assert.equal(offered(report(['render_view', 'supported'])), true);
  assert.equal(offered(report(['render_view', 'unsupported'], ['capture_studio_viewport', 'supported'])), true, 'native capture alone is enough');
  assert.equal(offered(report(['render_view', 'unsupported'], ['capture_studio_viewport', 'unsupported'])), false, 'no way to show a picture at all');
  assert.equal(offered(report(['render_view', 'unsupported'])), false, 'a report that says render_view is gone and names no capture');
});

// ==================================================================================== the run ===

test('a look records itself in the ledger, counts its cost, shows the user the frames and keeps pixels out of the transcript', async () => {
  visionCalls = [];
  const neurons = [];
  const { ctx, emitted, ledger } = lookCtx({ neurons });
  made(ledger);
  const out = await T.runTool(ctx, 'look', JSON.stringify({ expect: ['a fountain', 'a path'] }));
  assert.equal(out.ok, true, out.resultForLlm);
  const r = JSON.parse(out.resultForLlm);
  assert.deepEqual(r.observations.map((o) => o.verdict), ['seen', 'not_seen']);
  assert.deepEqual(r.notSeen, ['a path']);
  assert.equal(r.source, 'studio_viewport');
  assert.equal(r.cameraRestored, true);
  assert.deepEqual(r.issues, ['a wall floats']);
  assert.match(r.note, /observations, not a score/i);
  assert.doesNotMatch(out.resultForLlm, /iVBOR|base64/, 'no pixels in what the model reads');
  assert.ok(out.resultForLlm.length < 3000, `${out.resultForLlm.length} chars`);
  assert.equal(ledger.lookCount, 1);
  assert.equal(ledger.lastLookMutationSeq, 1);
  assert.deepEqual(ledger.looks.map((o) => o.verdict), ['seen', 'not_seen']);
  assert.equal(ledger.entries.filter((e) => e.kind === 'look').length, 1, 'recorded once, by the tool itself');
  assert.deepEqual(neurons, [123]);
  assert.equal(emitted.length, 3, 'the user sees what was looked at');
  assert.equal(out.mutatedProject, undefined);
  assert.equal(visionCalls.length, 1);
  assert.equal(visionCalls[0].opts.kind, 'visual:look');
});

test('the agent\'s own words reach the vision call: the request, what it expects, what it asks', async () => {
  visionCalls = [];
  const { ctx, ledger } = lookCtx();
  made(ledger);
  await T.runTool(ctx, 'look', JSON.stringify({ expect: ['a fountain'], questions: ['is the gate open?'] }));
  const text = JSON.stringify(visionCalls[0].req.messages);
  assert.match(text, /a garden with a fountain/);
  assert.match(text, /a fountain/);
  assert.match(text, /is the gate open\?/);
});

test('the per-run cap refuses before any Studio operation is sent', async () => {
  const { ctx, ops, ledger } = lookCtx();
  made(ledger);
  ledger.lookCount = 6;
  const out = await T.runTool(ctx, 'look', '{}');
  assert.equal(out.ok, false);
  assert.match(out.resultForLlm, /limit/i);
  assert.equal(ops.length, 0);
});

test('a look that could not run is a failure and is remembered as one — and says not to claim anything', async () => {
  const { ctx, ledger } = lookCtx({ answer: () => ({ id: 'x', ok: false, error: 'nothing works' }) });
  made(ledger);
  const out = await T.runTool(ctx, 'look', '{}');
  assert.equal(out.ok, false);
  assert.match(out.resultForLlm, /could not look/i);
  assert.match(out.resultForLlm, /do not claim/i);
  assert.equal(ledger.lookFailures, 1);
  assert.equal(ledger.lookCount, 1);
  assert.equal(ledger.lastLookMutationSeq, null);
});

test('with no ledger on the context (the eval harness, the admin route) look still works and records nothing', async () => {
  const { ctx } = lookCtx();
  delete ctx.evidence;
  const out = await T.runTool(ctx, 'look', '{}');
  assert.equal(out.ok, true, out.resultForLlm);
});

// ============================================================================= the recording hook ===

const exec = (table) => async (op) => {
  const h = table[op.op];
  return h ? h(op) : { id: 'x', ok: false, error: `unexpected ${op.op}` };
};
const baseCtx = (table, ledger = newLedger()) => ({
  env: {}, evidence: ledger, studioConnected: () => true, addMemoryFact: async () => 'saved', execStudioOp: exec(table),
});

test('a change that succeeded is recorded as a change, with the colour it wrote', async () => {
  const ledger = newLedger();
  const ctx = baseCtx({
    get_instance: () => ({ id: 'g', ok: true, data: { path: 'game.Workspace.Door', class: 'Part', props: {} } }),
    set_props: () => ({ id: 's', ok: true, data: { path: 'game.Workspace.Door', set: ['Color'] } }),
  }, ledger);
  const out = await T.runTool(ctx, 'set_properties', JSON.stringify({ path: 'game.Workspace.Door', props: { Color: { t: 'Color3', v: [1, 0, 0] } } }));
  assert.equal(out.ok, true, out.resultForLlm);
  assert.equal(ledger.mutationSeq, 1);
  assert.deepEqual(ledger.colours.map((c) => [c.path, c.family, c.via]), [['game.Workspace.Door', 'red', 'write']]);
  assert.equal(ledger.entries.at(-1).tool, 'set_properties');
});

test('a read-back is recorded as a read, and a later read outranks the write', async () => {
  const ledger = newLedger();
  const ctx = baseCtx({
    get_instance: () => ({ id: 'g', ok: true, data: { path: 'game.Workspace.Door', name: 'Door', class: 'Part', props: { Color: { t: 'Color3', v: [1, 1, 1] } } } }),
  }, ledger);
  const out = await T.runTool(ctx, 'get_instance', JSON.stringify({ path: 'game.Workspace.Door' }));
  assert.equal(out.ok, true);
  assert.deepEqual(ledger.colours.map((c) => [c.family, c.via]), [['white', 'read']]);
  assert.equal(ledger.mutationSeq, 0);
});

test('a failed change leaves no change and no fact', async () => {
  const ledger = newLedger();
  const ctx = baseCtx({
    get_instance: () => ({ id: 'g', ok: true, data: { class: 'Part', props: {} } }),
    set_props: () => ({ id: 's', ok: false, error: 'refused', failure: 'refused' }),
  }, ledger);
  const out = await T.runTool(ctx, 'set_properties', JSON.stringify({ path: 'game.Workspace.Door', props: { Color: { t: 'Color3', v: [1, 0, 0] } } }));
  assert.equal(out.ok, false);
  assert.equal(ledger.mutationSeq, 0);
  assert.deepEqual(ledger.colours, []);
  assert.equal(ledger.entries.at(-1).ok, false);
});

test('a player check records the raw screen the summary was made from: hidden text stays hidden in the ledger', async () => {
  const ledger = newLedger();
  const ctx = baseCtx({
    play_check: () => ({ id: 'p', ok: true, data: {
      playerJoined: true, characterSpawned: true, clientReported: true, harnessRemoved: true,
      screenGuis: [{ name: 'Hud', enabled: true, labels: [{ name: 'Joke', class: 'TextLabel', text: 'Knock knock', visible: false }] }],
      clientErrors: [], serverErrors: [], leaderstatsBefore: null, leaderstatsAfter: null,
    } }),
  }, ledger);
  const out = await T.runTool(ctx, 'play_check', '{}');
  assert.equal(out.ok, true, out.resultForLlm);
  assert.deepEqual(ledger.texts.map((t) => [t.text, t.via, t.visible]), [['Knock knock', 'play', false]]);
  assert.equal(ledger.plays.length, 1);
  assert.equal(ledger.plays[0].observed, true);
});

test('a tool that does not touch Studio leaves the ledger alone', async () => {
  const ledger = newLedger();
  const ctx = baseCtx({}, ledger);
  await T.runTool(ctx, 'choose_asset_source', JSON.stringify({ need: 'prop' }));
  assert.equal(ledger.seq, 0);
});

test('a context with no ledger is unaffected', async () => {
  const ctx = baseCtx({ get_instance: () => ({ id: 'g', ok: true, data: { path: 'game.Workspace.Door', props: {} } }) });
  delete ctx.evidence;
  const out = await T.runTool(ctx, 'get_instance', JSON.stringify({ path: 'game.Workspace.Door' }));
  assert.equal(out.ok, true);
});

test('one tool\'s raw payload never leaks into the next tool\'s record', async () => {
  const ledger = newLedger();
  const ctx = baseCtx({
    play_check: () => ({ id: 'p', ok: true, data: { playerJoined: true, characterSpawned: true, clientReported: true, harnessRemoved: true, screenGuis: [{ name: 'Hud', enabled: true, labels: [{ name: 'A', text: 'Secret', visible: true }] }], clientErrors: [], serverErrors: [] } }),
    get_logs: () => ({ id: 'l', ok: true, data: { entries: [] } }),
  }, ledger);
  await T.runTool(ctx, 'play_check', '{}');
  const before = ledger.texts.length;
  await T.runTool(ctx, 'get_output_logs', '{}');
  assert.equal(ledger.texts.length, before);
  assert.equal(ctx.evidenceRaw, undefined);
});
