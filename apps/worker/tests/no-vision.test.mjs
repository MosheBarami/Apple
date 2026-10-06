/**
 * THERE IS NO VISION IN THE PRODUCT (plan section 3.2, handoff M4 step 4.1; owner decision).
 *
 * The AI never looks at a picture. A user's screenshot strip, the capture the plugin feeds it and the M3 harness's own capture through
 * Roblox's Studio MCP are for the USER and for the evaluation; nothing here sends a picture to a model. This file fails if any of
 * the ways a picture could reach a model comes back:
 *
 *   - a model ROLE for pictures (`vision` in DEFAULT_MODELS or in the capability table);
 *   - a TOOL whose job is to show a picture to a model, or to judge a place by its look (look, inspect_visually, judge_game,
 *     inspect_attachment_image, ocr_image), registered, offered to any run, listed in the permissions table or exposed over MCP;
 *   - an IMAGE-TO-MODEL CALL: an `image_url` content part anywhere in production worker or shared source, or a gateway call naming the
 *     `vision` role;
 *   - the modules that did it (blind-critique, client-judge, look-*, world-pass, vision.ts ...) existing again;
 *   - a "look" in the evidence ledger (the ledger carries facts a picture cannot supply).
 *
 * Each assertion has a control beside it where the scan could be empty by accident (a scan that read nothing would pass).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WORKER, '..', '..');
const TMP = mkdtempSync(join(tmpdir(), 'no-vision-'));
test.after(() => rmSync(TMP, { recursive: true, force: true }));

async function bundle(abs, name) {
  const out = join(TMP, `${name}.mjs`);
  await esbuild.build({ entryPoints: [abs], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', external: ['cloudflare:*'] });
  return import(pathToFileURL(out).href);
}
const G = await bundle(join(WORKER, 'src', 'gateway.ts'), 'gateway');
const PT = await bundle(join(WORKER, 'src', 'providers', 'types.ts'), 'provider-types');
const T = await bundle(join(WORKER, 'src', 'tools.ts'), 'tools');
const R = await bundle(join(WORKER, 'src', 'router.ts'), 'router');
const M = await bundle(join(WORKER, 'src', 'mcp.ts'), 'mcp');
const S = await bundle(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'shared');
const L = await bundle(join(WORKER, 'src', 'evidence-ledger.ts'), 'ledger');

/** Every tool that shows a picture to a model, or judges a place by what it looks like. */
const VISION_TOOLS = ['look', 'inspect_visually', 'judge_game', 'inspect_attachment_image', 'ocr_image'];

/** Production TypeScript under a directory, without generated data. */
function sourcesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { if (entry !== 'generated' && entry !== 'node_modules') out.push(...sourcesUnder(p)); } else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const WORKER_SRC = sourcesUnder(join(WORKER, 'src'));
const SHARED_SRC = sourcesUnder(join(ROOT, 'packages', 'shared', 'src'));

test('the scan reads the real source (a scan that read nothing would pass)', () => {
  assert.ok(WORKER_SRC.length > 150, `only ${WORKER_SRC.length} worker source files found`);
  assert.ok(WORKER_SRC.some((p) => p.endsWith(join('src', 'tools.ts'))) && WORKER_SRC.some((p) => p.endsWith(join('do', 'session.ts'))));
  assert.ok(SHARED_SRC.some((p) => p.endsWith('index.ts')));
  assert.ok(Object.keys(G.DEFAULT_MODELS).length >= 3, 'the model table did not load');
  assert.ok(Object.keys(T.TOOLS).length > 50, 'the tool registry did not load');
});

test('there is no vision model role: not in the gateway table, not in the capability table, not as a model constant', () => {
  assert.equal('vision' in G.DEFAULT_MODELS, false, 'DEFAULT_MODELS has a vision key');
  assert.equal('vision' in PT.MODEL_KEY_NEEDS, false, 'MODEL_KEY_NEEDS has a vision key');
  for (const key of Object.keys(PT.MODEL_KEY_NEEDS)) assert.equal(PT.MODEL_KEY_NEEDS[key].vision, false, `${key} needs vision`);
  for (const [key, cfg] of Object.entries(G.DEFAULT_MODELS)) assert.doesNotMatch(cfg.id, /vision/i, `${key} routes to a vision model`);
  const providers = readFileSync(join(WORKER, 'src', 'providers', 'index.ts'), 'utf8');
  assert.doesNotMatch(providers, /VISION_MODEL_ID|VISION_CONTEXT_WINDOW/, 'a vision model constant is exported again');
});

test('no vision tool is registered, offered to any run, listed in the permissions table, given a phase, or exposed over MCP', () => {
  const registered = new Set(Object.keys(T.TOOLS));
  assert.ok(registered.has('audit_build') && registered.has('check_composition') && registered.has('play_check'), 'control: the kept checks are registered');
  const offeredEveryWay = new Set([
    ...T.toolNames(),
    ...T.toolDefs(true).map((d) => d.name),
    ...T.toolDefs(false).map((d) => d.name),
    ...R.toolsForMode('agent', true, T.toolNames()),
    ...R.toolsForMode('agent', false, T.toolNames()),
    ...R.toolsForMode('plan', true, T.toolNames()),
    ...M.MCP_TOOL_NAMES,
    ...Object.keys(M.MCP_EXCLUDED),
    ...S.GOVERNED_TOOLS.map((g) => g.name),
  ]);
  const shared = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  for (const name of VISION_TOOLS) {
    assert.equal(registered.has(name), false, `${name} is registered`);
    assert.equal(offeredEveryWay.has(name), false, `${name} is offered or listed somewhere`);
    assert.equal(new RegExp(`case '${name}':|name: '${name}'`).test(shared), false, `${name} has a phase or a permission label in the shared contract`);
  }
});

test('no production source sends an image to a model: no image_url part, no call to a vision role', () => {
  const offenders = [];
  for (const p of [...WORKER_SRC, ...SHARED_SRC]) {
    const code = stripComments(readFileSync(p, 'utf8'));
    const rel = relative(ROOT, p);
    if (/\bimage_url\b/.test(code)) offenders.push(`${rel}: an image_url content part`);
    if (/\bmodel\s*:\s*['"]vision['"]/.test(code)) offenders.push(`${rel}: a gateway call naming the vision role`);
    if (/\binputImage\b|\bimages\s*:\s*\[[^\]]*\bdata:image/.test(code)) offenders.push(`${rel}: an image input to a model`);
  }
  assert.deepEqual(offenders, []);
});

test('the gateway message type carries text parts only', () => {
  const shared = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const at = shared.indexOf('export type GatewayContentPart');
  assert.ok(at > 0, 'control: the type was located');
  const decl = shared.slice(at, shared.indexOf(';', at));
  assert.match(decl, /type: 'text'/);
  assert.doesNotMatch(decl, /image/i, 'an image part is a content part again');
  const types = readFileSync(join(WORKER, 'src', 'providers', 'types.ts'), 'utf8');
  assert.doesNotMatch(stripComments(types), /\bimage\b/i, 'the provider layer weighs or flattens an image again');
});

test('the modules that showed pictures to a model do not exist', () => {
  const gone = [
    'vision.ts', 'attachment-vision.ts', 'blind-critique.ts', 'client-judge.ts', 'client-judge-rules.ts', 'client-judge-ui.ts', 'judge-gate.ts',
    'look-gate.ts', 'look-tool.ts', 'look-observe.ts', 'studio-look.ts', 'world-pass.ts', 'world-steps.ts', 'composed-judge.ts', 'critic-input.ts', 'pixel-stats.ts',
  ];
  for (const f of gone) assert.equal(existsSync(join(WORKER, 'src', f)), false, `${f} is back`);
  assert.ok(existsSync(join(WORKER, 'src', 'claim-audit.ts')) && existsSync(join(WORKER, 'src', 'evidence-ledger.ts')) && existsSync(join(WORKER, 'src', 'scene-flags.ts')),
    'control: the kept checks (claim audit, evidence ledger, scene flags) are still here');
});

test('the evidence ledger has no look: it records facts a picture cannot supply', () => {
  assert.equal(L.recordLook, undefined);
  assert.equal(L.lookNeeded, undefined);
  const ledger = L.newLedger();
  for (const field of ['looks', 'lookIssues', 'lookCount', 'lookFailures', 'forcedLooks', 'repairRounds', 'criticRounds', 'lastLookMutationSeq', 'lastLookFailedAt', 'viewChangedSeq']) {
    assert.equal(field in ledger, false, `the ledger carries ${field}`);
  }
  assert.ok('auditRounds' in ledger && 'mutationSeq' in ledger, 'control: the kept fields are there');
});

test('no environment switch for a critic or a look is left in the worker env', () => {
  const env = readFileSync(join(WORKER, 'src', 'env.ts'), 'utf8');
  assert.doesNotMatch(env, /SELF_CHECK_CRITIC|SELF_CHECK_SETTLE_MS/);
  assert.match(env, /SELF_CHECK\?: string/, 'control: the self-check switch itself stays');
});
