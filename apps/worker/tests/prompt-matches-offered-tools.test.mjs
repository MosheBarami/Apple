/**
 * THE SYSTEM PROMPT MAY NOT ORDER A CALL TO A TOOL THE RUN WAS NOT OFFERED.
 *
 * prompt-tool-names.test.mjs holds the prompt to the REGISTRY: every tool it names must exist. That
 * is necessary and it was not enough. The Agent rules said "Your FIRST call is propose_plan" as a
 * constant, and an Agent run with Studio disconnected is offered eight tools of which propose_plan
 * is not one — so the first instruction of every offline Agent run was a call the model could not
 * make, and each attempt cost a paid step. The tool existed; this run did not have it.
 *
 * The property here is one level stronger: in every combination of mode, Studio connection,
 * Autonomous, tool permissions and plugin capability report, the MODE RULES (and the Autonomous
 * block) name only tools that run was offered. The offered set is computed by the real narrowing
 * functions in the order runStep applies them.
 *
 * WHAT THIS DOES NOT COVER, measured 2026-09-22: the shared build guidance ahead of the mode rules
 * is one constant for every run, and it still says "call check_composition" to a Studio that
 * reports render_view unsupported. There the prompt's own capability note names check_composition
 * as withheld, so the model is told both; with a permission denial nothing in the prompt says so.
 * That block is not scanned below, and this file does not claim it is.
 *
 * run-loop-traps.test.mjs asserts the same against the request the provider actually receives, for
 * the two combinations that shipped wrong.
 *
 * Run with:  node --test tests/prompt-matches-offered-tools.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'prompt-offered-'));
const ENTRY = join(TMP, 'entry.mjs');
const OUT = join(TMP, 'bundle.mjs');
writeFileSync(ENTRY, [
  `export { TOOLS, toolNames, VERIFIER_TOOLS } from ${JSON.stringify(join(WORKER, 'src', 'tools.ts'))};`,
  `export { toolsForMode } from ${JSON.stringify(join(WORKER, 'src', 'router.ts'))};`,
  `export { filterToolsForPlugin } from ${JSON.stringify(join(WORKER, 'src', 'plugin-capabilities.ts'))};`,
  `export { applyToolPermissions } from ${JSON.stringify(join(WORKER, 'src', 'preferences.ts'))};`,
  `export { systemPrompt } from ${JSON.stringify(join(WORKER, 'src', 'prompts.ts'))};`,
].join('\n'));
await esbuild.build({ entryPoints: [ENTRY], bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent' });
const T = await import(pathToFileURL(OUT).href);
test.after(() => rmSync(TMP, { recursive: true, force: true }));

const REQUIREMENTS = Object.fromEntries(
  Object.entries(T.TOOLS).filter(([, t]) => t.studio).map(([name, t]) => [name, t.studioOps ?? []]),
);
const report = (...unsupported) => ({
  schema: 'golem.studio-ops.v1',
  operations: unsupported.map((op) => ({ op, status: 'unsupported', reason: `${op} unavailable` })),
});

function offeredFor({ mode, connected, autonomous, perms, capabilities }) {
  const base = T.toolsForMode(mode, connected, T.toolNames());
  const user = mode === 'agent' && autonomous ? base : T.applyToolPermissions(base, perms);
  return T.filterToolsForPlugin(user, REQUIREMENTS, capabilities).allowed;
}

const BASE = { fenceId: 'f3c0d91a', placeName: 'Test Place', projectName: 'Test', memorySummary: null, memoryFacts: [] };
const toolish = (text) => [...new Set([...text.matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)].map((m) => m[0]))];

/** The mode block and, when present, the Autonomous block: the parts that direct tool calls. */
function directingBlocks(prompt) {
  const from = prompt.indexOf('Mode: ');
  assert.ok(from >= 0, 'the prompt has no mode block');
  const ends = ['\n\nAutonomous is ON', '<<<ART_DIRECTION>>>', '<<<UI_GRAMMAR>>>', '\n\nProject: "']
    .map((m) => prompt.indexOf(m, from)).filter((i) => i > from);
  const blocks = [prompt.slice(from, Math.min(...ends))];
  const auto = prompt.indexOf('Autonomous is ON');
  if (auto >= 0) blocks.push(prompt.slice(auto, prompt.indexOf('\n\n', auto) === -1 ? undefined : prompt.indexOf('\n\n', auto)));
  return blocks;
}

function* combinations() {
  const perms = [undefined, { propose_plan: 'deny' }, Object.fromEntries(T.VERIFIER_TOOLS.map((v) => [v, 'deny']))];
  const caps = [null, report('render_view', 'run_code'), report('render_view', 'run_code', 'get_tree', 'project_census')];
  for (const mode of ['plan', 'agent']) {
    for (const connected of [true, false]) {
      for (const autonomous of [false, true]) {
        for (const p of perms) {
          for (const c of caps) yield { mode, connected, autonomous, perms: p, capabilities: c };
        }
      }
    }
  }
}

test('IN EVERY COMBINATION, THE MODE RULES DIRECT CALLS ONLY TO TOOLS THAT RUN WAS OFFERED', () => {
  let checked = 0;
  let plannerOffered = 0;
  let plannerWithheld = 0;
  let namedTools = 0;
  for (const combo of combinations()) {
    const offered = offeredFor(combo);
    const prompt = T.systemPrompt({
      ...BASE,
      mode: combo.mode,
      autonomous: combo.mode === 'agent' && combo.autonomous,
      studioConnected: combo.connected,
      offeredTools: offered,
    });
    const label = JSON.stringify(combo);
    for (const block of directingBlocks(prompt)) {
      for (const tool of toolish(block)) {
        namedTools += 1;
        assert.ok(offered.has(tool), `${label}: the prompt directs a call to ${tool}, which this run was not offered`);
      }
    }
    const toldToPlan = /FIRST call is propose_plan/.test(prompt);
    assert.equal(toldToPlan, offered.has('propose_plan'),
      `${label}: told to plan first = ${toldToPlan}, planner offered = ${offered.has('propose_plan')}`);
    if (offered.has('propose_plan')) plannerOffered += 1;
    else plannerWithheld += 1;
    checked += 1;
  }
  // Non-vacuity: both branches were exercised, and the blocks really did name tools.
  assert.equal(checked, 72);
  assert.ok(plannerOffered > 0 && plannerWithheld > 0, 'one branch of the planner rule was never exercised');
  // 50 when written (2026-09-22). A floor, not a tripwire: it only has to prove the scan saw tools.
  assert.ok(namedTools > 20, `the directing blocks named only ${namedTools} tools across all combinations`);
});

test('the historic case: offline Agent is not told to call propose_plan, even with no offered set passed', () => {
  // A caller that composes without an offered set still gets the mode's own toolset (router.ts),
  // never the whole registry — so the offline default is the offline truth.
  const prompt = T.systemPrompt({ ...BASE, mode: 'agent', studioConnected: false });
  assert.doesNotMatch(prompt, /\bpropose_plan\b/, 'offline Agent is told about a tool it is not offered');
  assert.match(prompt, /no build checklist in this session/, 'and it must be told why it will not plan');
});

test('CONTROL: a paired Agent with nothing narrowed is still told to plan and to check', () => {
  const offered = offeredFor({ mode: 'agent', connected: true, autonomous: false });
  const prompt = T.systemPrompt({ ...BASE, mode: 'agent', studioConnected: true, offeredTools: offered });
  assert.match(prompt, /FIRST call is propose_plan/);
  for (const v of T.VERIFIER_TOOLS) assert.match(prompt, new RegExp(`\\b${v}\\b`), `${v} is offered and not named`);
});

test('with no verifier offered the Agent is told to say so, not to plan a check it cannot run', () => {
  const offered = offeredFor({ mode: 'agent', connected: true, autonomous: false, perms: Object.fromEntries(T.VERIFIER_TOOLS.map((v) => [v, 'deny'])) });
  const prompt = T.systemPrompt({ ...BASE, mode: 'agent', studioConnected: true, offeredTools: offered });
  assert.match(prompt, /no verification tool is offered in this session/);
  for (const v of T.VERIFIER_TOOLS) {
    assert.doesNotMatch(directingBlocks(prompt).join('\n'), new RegExp(`\\b${v}\\b`), `${v} is named though withheld`);
  }
});
