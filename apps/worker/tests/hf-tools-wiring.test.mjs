/**
 * THE TWO HUGGING FACE TOOLS ARE REACHABLE, AND REFUSE BEFORE THEY SPEND.
 *
 * hf.ts and hf-3d-pipeline.ts (D-HF-1) are libraries until tools.ts offers them. This file holds
 * the seams:
 *   - `generate_ui_image_hf` is a worker tool (no Studio), writes nothing into the place;
 *   - `generate_model_external` is a Studio tool that inserts through the same ops as
 *     insert_asset, and a still-processing upload is NOT counted as a change to the place;
 *   - neither is offered in Plan, and the Studio one is not offered with Studio disconnected;
 *   - each refuses without HF_TOKEN, without a project, or without a signed-in user, before any
 *     network call — the provider is capped at a few calls a day across every user;
 *   - the session hands the run's user to the tool, so the model lands in THEIR Roblox account.
 *
 * Run with:  node --test tests/hf-tools-wiring.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { d1 } from './stubs/d1.mjs';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = mkdtempSync(join(tmpdir(), 'hf-tools-'));
process.on('exit', () => rmSync(DIR, { recursive: true, force: true }));

function bundle(rel, name) {
  const out = join(DIR, `${name}.mjs`);
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' },
  );
  return out;
}

const T = await import(`file://${bundle('tools.ts', 'tools')}`);
const R = await import(`file://${bundle('router.ts', 'router')}`);

const IMAGE = 'generate_ui_image_hf';
const MODEL = 'generate_model_external';

/** Every outbound request made while `fn` runs. The tools must make none on these paths. */
async function withNoNetwork(fn) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    throw new Error('network is off in this test');
  };
  try {
    return { result: await fn(), calls };
  } finally {
    globalThis.fetch = real;
  }
}

function ctx(over = {}) {
  const ops = [];
  const kv = new Map();
  return {
    ops,
    ctx: {
      env: { KV: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) }, ...(over.env ?? {}) },
      projectId: 'projectId' in over ? over.projectId : 'project-hf',
      userId: 'userId' in over ? over.userId : 'user-hf',
      studioConnected: () => true,
      execStudioOp: async (op) => {
        ops.push(op.op);
        return { ok: false, error: 'not used' };
      },
      createCheckpoint: async () => ({ error: 'not used' }),
      addMemoryFact: async () => 'refused',
    },
  };
}

/** runTool wraps a tool's answer for the transcript; the tool's own result is `resultForLlm`. */
const run = async (c, name, args) => JSON.parse((await T.runTool(c, name, JSON.stringify(args))).resultForLlm);

/* ------------------------------------------------------------- registration --- */

test('both tools are registered, with the Studio flag each one needs', () => {
  assert.ok(IMAGE in T.TOOLS, `${IMAGE} is not in TOOLS`);
  assert.ok(MODEL in T.TOOLS, `${MODEL} is not in TOOLS`);
  assert.equal(T.TOOLS[IMAGE].studio, false, 'the image tool needs no Studio; marking it would hide it offline');
  assert.equal(T.TOOLS[MODEL].studio, true, 'the model tool inserts into the place, so it needs Studio');
  assert.deepEqual(
    [...T.TOOLS[MODEL].studioOps].sort(),
    [...T.TOOLS.insert_asset.studioOps].sort(),
    'the model tool inserts through insertAndProveClean, so it needs exactly the ops insert_asset needs',
  );
  // The model sees the contract it will be held to.
  assert.deepEqual(T.TOOLS[IMAGE].def.parameters.required, ['subject', 'target']);
  assert.deepEqual(T.TOOLS[IMAGE].def.parameters.properties.target.enum, ['ui_icon', 'decal', 'texture', 'thumbnail', 'concept']);
  assert.deepEqual(T.TOOLS[MODEL].def.parameters.required, ['prompt']);
});

test('a pending upload changed nothing in the place; an insert did; the image tool never does', () => {
  assert.equal(T.toolMutatesProject(MODEL, { pending: true, operationId: 'op-1' }), false);
  assert.equal(T.toolMutatesProject(MODEL, { inserted: ['Workspace.Model'] }), true);
  assert.equal(T.toolMutatesProject(IMAGE, { imageId: 'i-1' }), false);
  assert.ok(T.projectMutatingToolNames().includes(MODEL));
  assert.equal(T.projectMutatingToolNames().includes(IMAGE), false);
});

test('Plan is offered neither; Agent without Studio gets the image tool and not the model tool', () => {
  const names = T.toolNames();
  const plan = R.toolsForMode('plan', true, names);
  assert.equal(plan.has(IMAGE), false, 'Plan was handed a paid generator');
  assert.equal(plan.has(MODEL), false, 'Plan was handed a tool that uploads and inserts');
  const offline = R.toolsForMode('agent', false, names);
  assert.equal(offline.has(IMAGE), true);
  assert.equal(offline.has(MODEL), false, 'the model tool was offered with no Studio to insert into');
  const online = R.toolsForMode('agent', true, names);
  assert.equal(online.has(MODEL), true);
});

/* ----------------------------------------------------- refuses before spending --- */

test('the image tool without HF_TOKEN refuses, names the fallback, and calls nothing', async () => {
  const c = ctx();
  const { result, calls } = await withNoNetwork(() => run(c.ctx, IMAGE, { subject: 'a silver crescent moon', target: 'ui_icon' }));
  assert.equal(typeof result.error, 'string');
  assert.match(result.error, /generate_image/);
  assert.equal('imageId' in result, false);
  assert.deepEqual(calls, []);
});

test('the image tool without a project refuses before the provider', async () => {
  const c = ctx({ projectId: undefined, env: { HF_TOKEN: 'hf_SENTINEL_image' } });
  const { result, calls } = await withNoNetwork(() => run(c.ctx, IMAGE, { subject: 'a silver crescent moon', target: 'ui_icon' }));
  assert.match(result.error, /project/);
  assert.deepEqual(calls, []);
});

test('CONTROL: with HF_TOKEN and a project the image tool does reach for the provider', async () => {
  // Without this, the refusals above would pass just as well if the tool never called out at all.
  const db = d1();
  const c = ctx({ env: { HF_TOKEN: 'hf_SENTINEL_image', CORPUS: db.CORPUS } });
  const { result, calls } = await withNoNetwork(() => run(c.ctx, IMAGE, { subject: 'a silver crescent moon', target: 'ui_icon' }));
  assert.ok(calls.some((u) => u.startsWith('https://router.huggingface.co/')), `the provider was never asked: ${JSON.stringify(calls)}`);
  assert.equal(typeof result.error, 'string', 'the network is off, so the call must come back as a failure');
  assert.equal('imageId' in result, false);
  assert.equal(JSON.stringify(result).includes('hf_SENTINEL_image'), false, 'the token came back in the result');
});

test('the model tool without HF_TOKEN refuses, names generate_model, and touches neither network nor Studio', async () => {
  const c = ctx();
  const { result, calls } = await withNoNetwork(() => run(c.ctx, MODEL, { prompt: 'a wooden barrel' }));
  assert.match(result.error, /generate_model/);
  assert.deepEqual(calls, []);
  assert.deepEqual(c.ops, []);
});

test('the model tool without a signed-in user refuses: it has no account to create the model in', async () => {
  const c = ctx({ userId: undefined, env: { HF_TOKEN: 'hf_SENTINEL_model' } });
  const { result, calls } = await withNoNetwork(() => run(c.ctx, MODEL, { prompt: 'a wooden barrel' }));
  assert.match(result.error, /signed-in user/);
  assert.deepEqual(calls, []);
  assert.deepEqual(c.ops, []);
});

/* ------------------------------------------------------------ the session seam --- */

test('the session puts the run\'s user on the tool context', () => {
  // A source check, because building a SessionDO needs the whole Durable Object runtime. The run's
  // `userId` is set from `bind.ownerId` when the run starts (startRun), so this carries the
  // project owner — whose connected Roblox key the model is uploaded with.
  const src = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const start = src.indexOf('  private agentCtx(agent?: AgentState): AgentCtx {');
  assert.ok(start >= 0, 'could not find agentCtx in session.ts');
  const body = src.slice(start, src.indexOf('\n  }\n', start));
  assert.match(body, /\buserId: agent\?\.userId\b/, 'agentCtx does not hand the run\'s user to the tools');
  assert.match(src, /userId: bind\.ownerId,/, 'the run no longer records the owner as its user');
});
