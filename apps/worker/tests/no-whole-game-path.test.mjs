/**
 * THERE IS NO WHOLE-GAME PATH (plan section 3.2, handoff M4 step 4.3).
 *
 * The product builds PIECES (a UI panel, a currency system, a zone) from blocks the model chooses, never "the game". Until M4 a
 * `compose_game` tool picked a template, ran a whole recipe through a runner and judged the result; `build_scene` laid a ready-made
 * floating-island scene; a world pass sent the run back until it had built on the base. All of it is removed. This file fails if
 * `compose_game` or `build_scene` is offered again, by any route, or if the modules that ran the path come back.
 *
 * KEPT, on purpose, as block source material for M5: packages/components/*, compose.ts (the Step vocabulary), compose-tycoon.ts,
 * compose-plotsim.ts (geometry helpers), compose-lane.ts. The controls below fail if they were deleted by mistake.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WORKER, '..', '..');
const TMP = mkdtempSync(join(tmpdir(), 'no-whole-game-'));
test.after(() => rmSync(TMP, { recursive: true, force: true }));
async function bundle(abs, name) {
  const out = join(TMP, `${name}.mjs`);
  await esbuild.build({ entryPoints: [abs], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', external: ['cloudflare:*'] });
  return import(pathToFileURL(out).href);
}
const T = await bundle(join(WORKER, 'src', 'tools.ts'), 'tools');
const R = await bundle(join(WORKER, 'src', 'router.ts'), 'router');
const M = await bundle(join(WORKER, 'src', 'mcp.ts'), 'mcp');
const S = await bundle(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'shared');

const GONE_TOOLS = ['compose_game', 'build_scene'];

test('compose_game and build_scene are not registered and not offered to any run, in any mode, with or without Studio', () => {
  assert.ok(T.toolNames().includes('build_object') && T.toolNames().includes('insert_library_model'), 'control: the piece builders are registered');
  const everywhere = {
    registry: Object.keys(T.TOOLS),
    names: T.toolNames(),
    studioDefs: T.toolDefs(true).map((d) => d.name),
    offlineDefs: T.toolDefs(false).map((d) => d.name),
    agentStudio: [...R.toolsForMode('agent', true, T.toolNames())],
    agentOffline: [...R.toolsForMode('agent', false, T.toolNames())],
    plan: [...R.toolsForMode('plan', true, T.toolNames())],
    mcp: [...M.MCP_TOOL_NAMES, ...Object.keys(M.MCP_EXCLUDED)],
    permissions: S.GOVERNED_TOOLS.map((g) => g.name),
  };
  for (const [where, names] of Object.entries(everywhere)) {
    assert.ok(names.length > 3, `control: ${where} is not empty`);
    for (const gone of GONE_TOOLS) assert.equal(names.includes(gone), false, `${gone} is offered through ${where}`);
  }
});

test('no tool is a whole-game template: nothing offered is named for a template, and no definition names compose_game or build_scene', () => {
  for (const d of T.toolDefs(true)) {
    assert.doesNotMatch(`${d.name} ${d.description}`, /compose_game|build_scene/, `${d.name} sends the model to a removed tool`);
  }
  const shared = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  for (const gone of GONE_TOOLS) assert.equal(new RegExp(`case '${gone}':|name: '${gone}'`).test(shared), false, `${gone} has a phase or a permission label`);
});

test('the prompt names neither removed tool', async () => {
  const { systemPrompt } = await bundle(join(WORKER, 'src', 'prompts.ts'), 'prompts');
  const BASE = { fenceId: 'f3c0d91a', mode: 'agent', studioConnected: true, placeName: 'Test Place', projectName: 'Test', memorySummary: null, memoryFacts: [] };
  for (const offeredTools of [undefined, new Set(T.toolNames())]) {
    const prompt = systemPrompt({ ...BASE, ...(offeredTools ? { offeredTools } : {}) });
    assert.doesNotMatch(prompt, /compose_game|build_scene|judge_game/);
  }
});

test('the modules that ran the whole-game path do not exist, and the block source material is still here', () => {
  for (const f of ['compose-tool.ts', 'compose-run.ts', 'composed-judge.ts', 'world-pass.ts', 'world-steps.ts', 'scene-kits.ts', 'run-flow.ts']) {
    assert.equal(existsSync(join(WORKER, 'src', f)), false, `${f} is back`);
  }
  for (const f of ['compose.ts', 'compose-tycoon.ts', 'compose-plotsim.ts', 'compose-lane.ts', 'components.generated.ts', 'typed-spec.ts']) {
    assert.ok(existsSync(join(WORKER, 'src', f)), `control: ${f} was deleted but is kept on purpose (block source material, M5)`);
  }
  assert.ok(existsSync(join(ROOT, 'packages', 'components')), 'control: packages/components is kept');
});

test('the run loop holds no composed ending, world pass, judge verdict or kit zone', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  assert.ok(session.length > 100_000, 'control: session.ts was read');
  for (const word of ['composedPlotSim', 'composedForUser', 'endWithComposed', 'worldBase', 'worldFacts', 'judgedReady', 'lastJudge', 'judgeFixPasses', 'kitZone', 'critiqueSevere', 'COMPOSER_TOOLS', 'compose_game', 'build_scene', 'judge_game']) {
    assert.equal(session.includes(word), false, `session.ts mentions ${word} again`);
  }
});
