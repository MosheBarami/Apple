/**
 * A PLAN STOPS BEING TRUE THE MOMENT THE RUN STARTS.
 *
 * `propose_plan` emits every step as `pending`, which is exactly right at the moment it is
 * announced and a lie five minutes later. gates.ts lifts pending steps into the Thinking card's
 * Actions checklist, so a plan that is never settled leaves a finished run showing work as "still
 * to come" that was done — the same shape as this house's failure-to-observe rule, inverted: an
 * observation that was never re-checked rendered as a current one.
 *
 * `settlePlan` re-states the plan against the run's own tool trace. What "done" MEANS here is
 * narrow and is stated in the module: the tool that step named was called after the plan was
 * announced and did not fail. It is not a claim that the step achieved its title — nothing in the
 * worker can know that, and a status that claimed it would be worth less than none.
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

import { planFromDetail, settlePlan, planDetail } from '../src/run-plan.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'rp-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

/** The document the REAL tool emits, so this file cannot drift from the producer. */
async function realDetail(steps, title) {
  const res = await T.runTool({ studioConnected: () => true }, 'propose_plan', JSON.stringify({ title, steps }));
  assert.equal(res.ok, true, res.resultForLlm);
  return res.detail;
}

const STEPS = [
  { title: 'Read the place', tool: 'get_project_tree' },
  { title: 'Build the platform', detail: 'One anchored Part', tool: 'create_instances' },
  { title: 'Light it', tool: 'set_properties' },
  { title: 'Prove a player can stand on it', tool: 'run_and_check' },
];

/* ------------------------------------------------------------------- reading --- */

test("planFromDetail reads the producer's own panel", async () => {
  const plan = planFromDetail('tool-7', await realDetail(STEPS, 'Spawn platform'));
  assert.ok(plan, 'the plan the tool just emitted was not recognised');
  assert.equal(plan.toolId, 'tool-7');
  assert.equal(plan.title, 'Spawn platform');
  assert.deepEqual(plan.steps.map((s) => s.tool), ['get_project_tree', 'create_instances', 'set_properties', 'run_and_check']);
  assert.ok(plan.steps.every((s) => s.status === 'pending'), 'a step arrived already claiming to be done');
});

test('anything that is not a build_plan panel is not a plan', () => {
  for (const junk of [undefined, null, 42, {}, { v: 1 }, { v: 1, blocks: [] },
    { v: 1, blocks: [{ type: 'test_report', cases: [] }] },
    { v: 1, blocks: [{ type: 'build_plan', steps: [] }] },
    { v: 1, blocks: [{ type: 'build_plan', steps: [{ title: 'x' }] }] }]) {
    assert.equal(planFromDetail('t', junk), undefined, `${JSON.stringify(junk)} was read as a plan`);
  }
});

/* ------------------------------------------------------------------ settling --- */

const trace = (...entries) => entries.map(([tool, ok = true]) => ({ tool, ok }));

test('a step is done when the tool it named ran and did not fail', async () => {
  const plan = planFromDetail('t', await realDetail(STEPS));
  const settled = settlePlan(plan, trace(['propose_plan'], ['get_project_tree'], ['create_instances']));
  assert.deepEqual(settled.steps.map((s) => s.status), ['done', 'done', 'pending', 'pending']);
});

test('A FAILED CALL DOES NOT TICK ITS STEP', async () => {
  // The whole reason the status is computed rather than assumed. A create_instances that errored
  // leaves nothing in the place, and a ticked box over an empty Workspace is worse than a blank one.
  const plan = planFromDetail('t', await realDetail(STEPS));
  const settled = settlePlan(plan, trace(['propose_plan'], ['create_instances', false]));
  assert.deepEqual(settled.steps.map((s) => s.status), ['pending', 'pending', 'pending', 'pending']);
});

test('a tool that ran BEFORE the plan was announced ticks nothing', async () => {
  // Otherwise a look-around taken before the agent committed to anything would retroactively
  // satisfy a step the agent then promised to do.
  const plan = planFromDetail('t', await realDetail(STEPS));
  const settled = settlePlan(plan, trace(['get_project_tree'], ['propose_plan'], ['create_instances']));
  assert.deepEqual(settled.steps.map((s) => s.status), ['pending', 'done', 'pending', 'pending']);
});

test('A REFUSED propose_plan DOES NOT START THE CLOCK — the plan was announced by the one that succeeded', async () => {
  // propose_plan now refuses once and then repairs, so "refused, looked around, then planned" is a
  // designed path rather than an accident. Anchoring on the first propose_plan of ANY outcome let
  // the look-around taken between the refusal and the real plan tick a step it never promised.
  const plan = planFromDetail('t', await realDetail(STEPS));
  const settled = settlePlan(plan, trace(['propose_plan', false], ['get_project_tree'], ['propose_plan'], ['create_instances']));
  assert.deepEqual(settled.steps.map((s) => s.status), ['pending', 'done', 'pending', 'pending'],
    'a read taken before the accepted plan was counted as carrying it out');
});

test('AN ok propose_plan THAT DREW NO CHECKLIST DOES NOT START THE CLOCK EITHER', async () => {
  // propose_plan answers ok without drawing a plan when it can neither refuse again nor repair
  // (no usable `steps` after a refusal). Measured 2026-09-22: that ok answer became the anchor, and
  // the read taken before the real plan was ticked as carrying it out. Every entry below is the
  // REAL tool's output, carried the way SessionDO carries it (tool, ok, detail).
  const ctx = { studioConnected: () => true, planState: { refusals: 0, kinds: [], announced: false } };
  const entries = [];
  const call = async (args) => {
    const out = await T.runTool(ctx, 'propose_plan', JSON.stringify(args));
    entries.push({ tool: 'propose_plan', ok: out.ok, detail: out.detail });
    return out;
  };
  assert.equal((await call({})).ok, false, 'control: the first shapeless plan is refused');
  const skipped = await call({ steps: [] });
  assert.equal(skipped.ok, true, 'control: the second is answered, not refused — the path under test');
  assert.equal(planFromDetail('x', skipped.detail), undefined, 'control: and it drew no checklist');
  entries.push({ tool: 'get_project_tree', ok: true });
  const drawn = await call({ steps: STEPS });
  assert.equal(drawn.ok, true, drawn.resultForLlm);
  entries.push({ tool: 'create_instances', ok: true });

  const plan = planFromDetail('t', drawn.detail);
  assert.ok(plan, 'the accepted plan was not readable');
  const settled = settlePlan(plan, entries);
  assert.equal(settled.steps.find((s) => s.tool === 'get_project_tree').status, 'pending',
    'a read taken before the checklist existed was counted as carrying it out');
  assert.equal(settled.steps.find((s) => s.tool === 'create_instances').status, 'done',
    'control: work done after the checklist was drawn still ticks');
});

test('two steps with the same tool are ticked in order, one call each', async () => {
  const steps = [
    { title: 'Build the floor', tool: 'create_instances' },
    { title: 'Build the walls', tool: 'create_instances' },
    { title: 'Check it', tool: 'audit_build' },
  ];
  const plan = planFromDetail('t', await realDetail(steps));
  const one = settlePlan(plan, trace(['propose_plan'], ['create_instances']));
  assert.deepEqual(one.steps.map((s) => s.status), ['done', 'pending', 'pending'],
    'one call ticked two steps, so the card would claim work that did not happen');
  const two = settlePlan(plan, trace(['propose_plan'], ['create_instances'], ['create_instances']));
  assert.deepEqual(two.steps.map((s) => s.status), ['done', 'done', 'pending']);
});

test('work nobody planned changes the plan not at all', async () => {
  const plan = planFromDetail('t', await realDetail(STEPS));
  const settled = settlePlan(plan, trace(['propose_plan'], ['edit_script'], ['run_luau'], ['search_docs']));
  assert.ok(settled.steps.every((s) => s.status === 'pending'));
});

test('settling is pure — the plan handed in is not rewritten', async () => {
  // AgentState is persisted. A settle that mutated in place would make the stored plan unable to
  // say what was originally promised.
  const plan = planFromDetail('t', await realDetail(STEPS));
  settlePlan(plan, trace(['propose_plan'], ['get_project_tree']));
  assert.ok(plan.steps.every((s) => s.status === 'pending'), 'settlePlan mutated its input');
});

test('a run in which nothing at all happened leaves every step pending, not done', async () => {
  const plan = planFromDetail('t', await realDetail(STEPS));
  assert.ok(settlePlan(plan, []).steps.every((s) => s.status === 'pending'));
});

/* ------------------------------------------------------------- re-emitting --- */

test('the settled plan goes back out as the same shape the browser already renders', async () => {
  const plan = planFromDetail('t', await realDetail(STEPS, 'Spawn platform'));
  const settled = settlePlan(plan, trace(['propose_plan'], ['get_project_tree'], ['run_and_check']));
  const doc = planDetail(settled);
  assert.equal(doc.v, 1);
  assert.equal(doc.blocks[0].type, 'build_plan');
  assert.equal(doc.blocks[0].title, 'Spawn platform');
  assert.deepEqual(doc.blocks[0].steps.map((s) => s.status), ['done', 'pending', 'pending', 'done']);
  assert.equal(doc.blocks[0].steps[1].detail, 'One anchored Part');
});

test('planFromDetail and planDetail are inverses on the producer output', async () => {
  const detail = await realDetail(STEPS, 'Spawn platform');
  assert.deepEqual(planDetail(planFromDetail('t', detail)), detail);
});

/* -------------------------------------------------------------- the wiring --- */

test('the run loop records the plan, and finishRun settles and re-broadcasts it', () => {
  // A pure module with no caller is the defect this whole section of the audit is about. The
  // behaviour above is real; this asserts it is reached.
  const src = execFileSync('cat', [join(WORKER, 'src', 'do', 'session.ts')], { encoding: 'utf8' });
  assert.match(src, /planFromDetail\(toolId, out\.detail\)/, 'nothing captures the plan the tool emitted');
  assert.match(src, /settlePlan\(/, 'nothing settles it');
  assert.match(src, /planDetail\(/, 're-broadcasting a settled plan needs the document back');
});
