/**
 * THE PLAN THE USER SEES BEFORE THE BUILD STARTS.
 *
 * The browser has been able to render a build plan since the day the component registry was
 * written: `BuildPlanBlock` in apps/web/src/lib/generative-ui/schema.ts, `BuildPlanView` in
 * render.tsx, `plannedStepsFromDocs` in gates.ts lifting pending steps into the Thinking card's
 * Actions list. Every one of those was unreachable outside /ui-lab and mock mode, because no
 * worker code ever emitted `{type:'build_plan'}`. A renderer with no producer is a dead branch,
 * and this codebase has shipped that before.
 *
 * `propose_plan` is the producer. What this file pins is not the prose of the plan — that is the
 * model's job — but the three properties that make a proposed plan worth showing at all:
 *
 *   1. It is emitted as a build_plan document with every step PENDING, because at the moment it
 *      is proposed nothing has been done. A step announced as done before it ran would be the
 *      house's own failure-to-observe defect wearing a plan's clothes.
 *   2. Every step names a tool that REALLY EXISTS. A plan that says `edit_scripts` is a plan the
 *      run cannot carry out, and the user reads it as a commitment.
 *   3. At least one step is a verification step. Planning the build and not planning the check is
 *      how a run ends with "Done." and nothing proven.
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
import { systemPrompt } from '../src/prompts.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'pp-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

/** The smallest context `propose_plan` can run against: it touches nothing but ctx.uiDetail. */
const ctx = () => ({ studioConnected: () => true });

async function call(args, c = ctx()) {
  const res = await T.runTool(c, 'propose_plan', JSON.stringify(args));
  return res;
}

const GOOD = {
  title: 'Spawn platform',
  steps: [
    { title: 'Read the place', detail: 'See what is already in Workspace', tool: 'get_project_tree' },
    { title: 'Build the platform', detail: 'One anchored Part under Workspace', tool: 'create_instances' },
    { title: 'Prove a player can stand on it', tool: 'run_and_check' },
  ],
};

/* ------------------------------------------------------------------ it exists */

test('propose_plan is a registered tool, so nothing below passes vacuously', () => {
  assert.ok(T.toolNames().includes('propose_plan'),
    'propose_plan is not in TOOLS; every assertion in this file would be about nothing');
});

test('it is offered to a paired build session', () => {
  const offered = T.toolDefs(true, undefined).map((d) => d.name);
  assert.ok(offered.includes('propose_plan'), 'the model is never told the tool exists');
});

/* --------------------------------------------------------- the emitted block */

test('a good plan emits a build_plan document the browser can render', async () => {
  const res = await call(GOOD);
  assert.equal(res.ok, true, `propose_plan refused a valid plan: ${res.resultForLlm}`);
  const doc = res.detail;
  assert.ok(doc && typeof doc === 'object', 'no UI document was attached to the tool row');
  assert.equal(doc.v, 1);
  assert.equal(doc.blocks.length, 1);
  const block = doc.blocks[0];
  assert.equal(block.type, 'build_plan',
    'the block type must be exactly what apps/web/src/lib/generative-ui/validate.ts matches on');
  assert.equal(block.title, 'Spawn platform');
  assert.equal(block.steps.length, 3);
});

test('EVERY step is pending, because none of them has happened yet', async () => {
  const res = await call(GOOD);
  const steps = res.detail.blocks[0].steps;
  for (const s of steps) {
    assert.equal(s.status, 'pending',
      `a step was announced as "${s.status}" at the moment the plan was proposed`);
  }
});

test('the step text and the tool name both survive to the UI', async () => {
  // PlanStep.tool is rendered as a monospace chip by render.tsx:836. It had exactly one source in
  // the whole product — a hand-written fixture in /ui-lab.
  const steps = (await call(GOOD)).detail.blocks[0].steps;
  assert.deepEqual(steps.map((s) => s.title), ['Read the place', 'Build the platform', 'Prove a player can stand on it']);
  assert.equal(steps[0].detail, 'See what is already in Workspace');
  assert.deepEqual(steps.map((s) => s.tool), ['get_project_tree', 'create_instances', 'run_and_check']);
});

test('the model gets back a plan it can act on, not just a panel', async () => {
  const res = await call(GOOD);
  const parsed = JSON.parse(res.resultForLlm);
  assert.equal(parsed.steps, 3);
  assert.ok(Array.isArray(parsed.plan), 'the model must see the ordered plan it just committed to');
});

/* ------------------------------------------------------ a tool that is not real */

test('a step naming a tool that does not exist is REFUSED', async () => {
  const res = await call({
    steps: [
      { title: 'Edit it', tool: 'edit_scripts' }, // real name is edit_script
      { title: 'Check it', tool: 'run_and_check' },
    ],
  });
  assert.equal(res.ok, false, 'the plan was accepted and the user was shown a tool that does not exist');
  assert.match(res.resultForLlm, /edit_scripts/, 'the refusal must name the tool it could not find');
  assert.equal(res.detail, undefined, 'and nothing may be rendered from a refused plan');
});

test('a step with no tool at all is REFUSED', async () => {
  const res = await call({ steps: [{ title: 'Do the thing' }, { title: 'Check it', tool: 'run_and_check' }] });
  assert.equal(res.ok, false, 'a step that names no tool is a wish, not a plan step');
});

test('a plan cannot name propose_plan as one of its own steps', async () => {
  const res = await call({
    steps: [{ title: 'Plan it', tool: 'propose_plan' }, { title: 'Check it', tool: 'run_and_check' }],
  });
  assert.equal(res.ok, false, 'a plan whose first step is to plan burns a step and says nothing');
});

/* --------------------------------------------------------- a plan with no check */

//[[ RE-AIMED 2026-09-21. This test used to assert `res.ok === false` and that the refusal named
//   three of the verifiers. The rule it guards has not changed — the plan that runs must contain a
//   check — but the enforcement moved from REFUSING to APPENDING, because the refusal was measured
//   looping three times at durationMs 0 on a real run and taking the whole step budget with it. The
//   property is "the plan contains a check", so that is what this now asserts, on the plan that
//   comes back rather than on the error that does not. See the comment at readProposedPlan. ]]
test('a plan with no verification step is COMPLETED with one, and the addition is announced', async () => {
  const res = await call({
    steps: [
      { title: 'Read the place', tool: 'get_project_tree' },
      { title: 'Build it', tool: 'create_instances' },
    ],
  });
  assert.equal(res.ok, true, 'a plan the model cannot repair must still be able to run');

  // The property: what runs contains a check.
  assert.match(res.resultForLlm, /inspect_visually/, 'the appended verifier must be in the plan the model reads back');

  // And it is not silent — to the model...
  assert.match(res.resultForLlm, /had no verification step/i, 'the model must be told a step it did not write was added');

  // ...nor to the user: the checklist they see carries it too.
  const block = res.detail.blocks[0];
  assert.equal(block.steps.length, 3, 'the verification step should have been appended');
  assert.equal(block.steps[2].tool, 'inspect_visually');
  assert.equal(block.steps[2].status, 'pending', 'an appended step has not happened either');
});

test('a plan that already checks its own work is left exactly alone', async () => {
  // The other half: appending unconditionally would be a different defect, and nothing above
  // would catch it.
  const res = await call({
    steps: [
      { title: 'Build it', tool: 'create_instances' },
      { title: 'Check it', tool: 'run_and_check' },
    ],
  });
  assert.equal(res.ok, true);
  assert.equal(res.detail.blocks[0].steps.length, 2, 'a plan with a verifier must not gain a second one');
  assert.doesNotMatch(res.resultForLlm, /had no verification step/i,
    'nothing was added, so nothing should be announced');
});

test('each of the five verifiers on its own satisfies the rule', async () => {
  // Pinned against the same five verification-tools.test.mjs pins, so a verifier renamed there
  // and not here would surface as this test refusing a legitimate plan.
  for (const v of ['run_and_check', 'run_spec', 'audit_build', 'check_composition', 'inspect_visually']) {
    const res = await call({
      steps: [{ title: 'Build it', tool: 'create_instances' }, { title: 'Check it', tool: v }],
    });
    assert.equal(res.ok, true, `${v} did not count as a verification step`);
  }
});

/* ------------------------------------------------------------------- bounds */

test('an empty plan is refused rather than rendered as an empty card', async () => {
  for (const args of [{ steps: [] }, {}, { steps: 'a plan' }]) {
    const res = await call(args);
    assert.equal(res.ok, false, `${JSON.stringify(args)} was accepted as a plan`);
  }
});

test('an over-long plan is refused rather than truncated into a lie', async () => {
  // Truncating would show the user a plan whose last steps were silently dropped — they would
  // read the card as the whole commitment.
  const steps = Array.from({ length: 30 }, (_, i) => ({ title: `Step ${i}`, tool: 'create_instances' }));
  steps.push({ title: 'Check it', tool: 'run_and_check' });
  const res = await call({ steps });
  assert.equal(res.ok, false, 'a 31-step plan was accepted');
  assert.match(res.resultForLlm, /\b12\b/, 'and the refusal should say what the limit is');
});

test('a title longer than the validator accepts is trimmed, not rejected outright', async () => {
  // LIMITS.maxLabelLength is 200 in apps/web/src/lib/generative-ui/schema.ts. A document that
  // exceeds it is DROPPED WHOLE by the validator, so the panel silently disappears — which is
  // worse than a clipped title.
  const long = 'x'.repeat(400);
  const res = await call({ title: long, steps: [{ title: long, detail: long, tool: 'run_and_check' }] });
  assert.equal(res.ok, true);
  const block = res.detail.blocks[0];
  assert.ok(block.title.length <= 200, `title was ${block.title.length} chars`);
  assert.ok(block.steps[0].title.length <= 200, `step title was ${block.steps[0].title.length} chars`);
  assert.ok(block.steps[0].detail.length <= 800, `step detail was ${block.steps[0].detail.length} chars`);
});

/* ------------------------------------------------------- it changes nothing */

/* ------------------------------------------- something has to ask for it --- */

const BASE = {
  fenceId: 'f3c0d91a',
  studioConnected: true,
  placeName: 'Test Place',
  projectName: 'Test',
  memorySummary: null,
  memoryFacts: [],
};

test('Agent is told to call it first', () => {
  // A tool nothing instructs the model to reach for is a tool nothing calls, and a build_plan
  // renderer with no producer is precisely the dead branch this work exists to close. The prompt
  // is the only channel that can ask.
  const prompt = systemPrompt({ ...BASE, mode: 'agent' });
  assert.match(prompt, /propose_plan/, 'Agent is never told the tool exists');
  assert.match(prompt, /FIRST call is propose_plan/, 'Agent is not told when to call it');
});

test('the plan prompt asks for the two things the tool refuses without', () => {
  const prompt = systemPrompt({ ...BASE, mode: 'agent' });
  // Whitespace-tolerant: the prompt is hard-wrapped prose, so the phrase legitimately carries a
  // newline in the middle of it. A regex that did not allow for that would be asserting about
  // the line width, not about what the model is told.
  assert.match(prompt, /Name\s+the\s+tool\s+each\s+step\s+will\s+use/,
    'Agent would be refused for a step with no tool and not know why');
  assert.match(prompt, /verification\s+steps?/,
    'Agent would be refused for a plan with no check and not know why');
});

test('PLAN MODE IS NOT TOLD TO PROPOSE A STRUCTURED PLAN, because it cannot call the tool', () => {
  // propose_plan is deliberately absent from PLAN_TOOLS in router.ts: Plan mode's whole deliverable
  // is a prose roadmap. Instructing it to call a tool it will never be offered is the exact defect
  // prompt-tool-names.test.mjs was written for, one level up.
  assert.doesNotMatch(systemPrompt({ ...BASE, mode: 'plan' }), /FIRST call is propose_plan/,
    'Plan mode is told to call a tool its toolset withholds');
});

test('propose_plan needs no Studio and changes nothing in the project', async () => {
  // It is a statement of intent. If it ever grows a side effect, Plan mode's toolset is not the
  // thing that would catch it — propose_plan is deliberately not in PLAN_TOOLS.
  const res = await call(GOOD, { studioConnected: () => false });
  assert.equal(res.ok, true, 'a plan could not be proposed without Studio attached');
});

test('the workspace announces PLANNING while it runs, not building', async () => {
  // phaseForTool's `default` is 'building'. A tool that is not named there falls through to it, and
  // the workspace then tells the user their project is being changed while nothing is — and
  // propose_plan is the one tool in the registry for which that is most obviously false: it runs at
  // the moment BEFORE any change, which is the entire reason the user is being shown it.
  const { phaseForTool } = await import('@golem/shared');
  assert.equal(phaseForTool('propose_plan'), 'planning');
});
