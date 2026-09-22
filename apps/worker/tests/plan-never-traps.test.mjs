/**
 * A PLAN THE RUN CAN CARRY OUT, AND A REFUSAL THAT CAN NEVER TRAP THE RUN.
 *
 * The production failure this file exists for: a run called propose_plan three times, every plan
 * was refused, every refusal cost a model step, and the run ended "I reached the step limit"
 * having built nothing. The missing-verifier refusal was turned into an append (42f0e10), and two
 * holes were left next to it:
 *
 *   1. The appended verifier was always `inspect_visually`, and every step was validated against
 *      the WHOLE registry — not against what THIS run was offered after mode, permission and plugin
 *      capability narrowing. Against a Studio that reports `render_view` unsupported, the product
 *      announced a check it had already withheld; a plan naming `run_spec` against a plugin that
 *      cannot run code passed validation and failed later, a paid step at a time.
 *   2. Every other refusal (unknown tool, too long, malformed step) could still repeat forever.
 *
 * What is pinned here is the PROPERTY in each case, measured against the real tool through the
 * real `runTool`, with the offered set computed from the real narrowing functions:
 *
 *   - whatever a plan contains, every step of the plan the user is shown is a tool the run was
 *     offered, and the appended verifier is one of them;
 *   - with no verifier offered, the plan runs and says so instead of being refused;
 *   - consecutive propose_plan refusals never exceed two, whatever the model sends.
 *
 * The run loop's own wiring of these (it must pass its offered set and carry the refusal count
 * across steps) is driven through the real SessionDO in run-loop-traps.test.mjs.
 *
 * Run with:  node --test tests/plan-never-traps.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'plan-never-traps-'));
const ENTRY = join(TMP, 'entry.mjs');
const OUT = join(TMP, 'bundle.mjs');
writeFileSync(ENTRY, [
  `export * from ${JSON.stringify(join(WORKER, 'src', 'tools.ts'))};`,
  `export { toolsForMode } from ${JSON.stringify(join(WORKER, 'src', 'router.ts'))};`,
  `export { filterToolsForPlugin } from ${JSON.stringify(join(WORKER, 'src', 'plugin-capabilities.ts'))};`,
  `export { applyToolPermissions } from ${JSON.stringify(join(WORKER, 'src', 'preferences.ts'))};`,
].join('\n'));
await esbuild.build({ entryPoints: [ENTRY], bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent' });
const T = await import(pathToFileURL(OUT).href);
test.after(() => rmSync(TMP, { recursive: true, force: true }));

/* ------------------------------------------------------------ the offered set, as a run has it --- */

/** Which Studio operations each tool needs — read from the registry, exactly as session.ts builds it. */
const REQUIREMENTS = Object.fromEntries(
  Object.entries(T.TOOLS).filter(([, t]) => t.studio).map(([name, t]) => [name, t.studioOps ?? []]),
);

const report = (...unsupported) => ({
  schema: 'golem.studio-ops.v1',
  operations: unsupported.map((op) => ({ op, status: 'unsupported', reason: `${op} is not available in this plugin` })),
});

/**
 * The run's offered set: mode, then permissions (skipped when autonomous), then the plugin's
 * capability report — the order runStep narrows in. Every step is a real function from src/.
 */
function offeredFor({ mode = 'agent', connected = true, autonomous = false, perms, capabilities } = {}) {
  const base = T.toolsForMode(mode, connected, T.toolNames());
  const user = mode === 'agent' && autonomous ? base : T.applyToolPermissions(base, perms);
  return T.filterToolsForPlugin(user, REQUIREMENTS, capabilities).allowed;
}

/** The context the run loop builds for a step: the offered set, and the plan state it carries. */
const ctxFor = (offered, planState) => ({ studioConnected: () => true, offeredTools: offered, ...(planState ? { planState } : {}) });

async function propose(args, ctx) {
  return T.runTool(ctx, 'propose_plan', JSON.stringify(args));
}

const planSteps = (res) => res.detail?.blocks?.[0]?.steps ?? [];

/** Studio that cannot render — the case the appended inspect_visually was announced to anyway. */
const NO_RENDER = offeredFor({ capabilities: report('render_view', 'run_code') });

test('the narrowed sets are real, so nothing below passes vacuously', () => {
  const full = offeredFor();
  assert.ok(full.size > 50, `a paired Agent run was offered ${full.size} tools`);
  assert.ok(full.has('propose_plan') && full.has('inspect_visually'), 'the paired Agent set lost the tools under test');
  assert.equal(NO_RENDER.has('inspect_visually'), false, 'render_view unsupported must withhold inspect_visually');
  assert.equal(NO_RENDER.has('check_composition'), false, 'and check_composition');
  assert.equal(NO_RENDER.has('run_spec'), false, 'run_code unsupported must withhold run_spec');
  assert.equal(NO_RENDER.has('audit_build'), true, 'audit_build needs only get_tree and must survive');
  assert.equal(NO_RENDER.has('propose_plan'), true);
});

test('the append preference is a permutation of the five verifiers', () => {
  assert.deepEqual([...T.APPENDED_VERIFIER_PREFERENCE].sort(), [...T.VERIFIER_TOOLS].sort(),
    'a verifier missing from the preference can never be appended; an extra one is not a verifier');
});

/* ----------------------------------------------------------- 1. the appended verifier is offered --- */

test('A PLAN WITH NO CHECK GETS A CHECK THE RUN WAS OFFERED — never a withheld one', async () => {
  // The whole family of narrowings, not one fixture: every combination must satisfy the property.
  const scenarios = [
    ['paired, full plugin', offeredFor()],
    ['render_view unsupported', NO_RENDER],
    ['render_view + get_tree unsupported', offeredFor({ capabilities: report('render_view', 'get_tree', 'run_code') })],
    ['inspect_visually denied by permission', offeredFor({ perms: { inspect_visually: 'deny' } })],
    ['autonomous ignores the denial', offeredFor({ autonomous: true, perms: { inspect_visually: 'deny' } })],
  ];
  let appended = 0;
  for (const [label, offered] of scenarios) {
    const res = await propose({ steps: [{ title: 'Build it', tool: 'create_instances' }] }, ctxFor(offered));
    assert.equal(res.ok, true, `${label}: a plan with no check was refused — ${res.resultForLlm}`);
    for (const step of planSteps(res)) {
      assert.ok(offered.has(step.tool), `${label}: the checklist promises ${step.tool}, which this run was not offered`);
    }
    const last = planSteps(res).at(-1);
    if (T.VERIFIER_TOOLS.includes(last.tool)) appended += 1;
  }
  assert.equal(appended, scenarios.length, 'every scenario above offers at least one verifier, so each must have one appended');

  // The specific case: no renderer means the best offered check, audit_build, not inspect_visually.
  const res = await propose({ steps: [{ title: 'Build it', tool: 'create_instances' }] }, ctxFor(NO_RENDER));
  assert.equal(planSteps(res).at(-1).tool, 'audit_build');
  assert.match(res.resultForLlm, /audit_build was added/, 'the model must be told which check it now owes');
});

test('WITH NO VERIFIER OFFERED THE PLAN RUNS, AND SAYS NOTHING WILL CHECK IT', async () => {
  const offered = offeredFor({ perms: Object.fromEntries(T.VERIFIER_TOOLS.map((v) => [v, 'deny'])) });
  for (const v of T.VERIFIER_TOOLS) assert.equal(offered.has(v), false, `${v} is still offered — the scenario is wrong`);

  const res = await propose({ title: 'Spawn pad', steps: [{ title: 'Build it', tool: 'create_instances' }] }, ctxFor(offered));
  assert.equal(res.ok, true, 'a plan was refused for want of a verifier the run could never call — the historical trap');
  assert.equal(planSteps(res).length, 1, 'nothing may be appended when nothing is offered');
  assert.match(JSON.parse(res.resultForLlm).note, /No verification tool is offered in this session/,
    'the model must be told nothing will check this');
  assert.match(res.detail.blocks[0].title, /no automatic check is available in this session/,
    'and so must the person reading the checklist');
  assert.match(res.detail.blocks[0].title, /^Spawn pad/, 'without losing the plan\'s own title');
});

/* -------------------------------------------- 2. a step the run cannot carry out: once, then repair --- */

test('A STEP NAMING A TOOL THIS RUN WAS NOT OFFERED IS REFUSED ONCE, NAMING WHAT IS OFFERED', async () => {
  const offered = NO_RENDER;
  const ctx = ctxFor(offered, { refusals: 0, kinds: [], announced: false });
  const plan = { steps: [{ title: 'Build it', tool: 'create_instances' }, { title: 'Test it', tool: 'run_spec' }] };

  const first = await propose(plan, ctx);
  assert.equal(first.ok, false, 'run_spec against a plugin that cannot run code passed validation silently');
  const error = JSON.parse(first.resultForLlm).error;
  assert.match(error, /run_spec/, 'the refusal must name the step it could not accept');
  const named = [...error.matchAll(/Offered in this run instead: ([^.]+)\./g)].flatMap((m) => m[1].split(', '));
  assert.ok(named.length > 0, `the refusal names no offered alternative: ${error}`);
  for (const alt of named) assert.ok(offered.has(alt), `the refusal suggests ${alt}, which this run cannot call either`);
  assert.equal(ctx.planState.refusals, 1);

  // The SAME defect again: the product repairs it rather than refusing a second time.
  const second = await propose(plan, ctx);
  assert.equal(second.ok, true, 'the same refusal was issued twice in a row');
  const tools = planSteps(second).map((s) => s.tool);
  assert.ok(!tools.includes('run_spec'), 'the repaired plan still promises the unavailable step');
  for (const t of tools) assert.ok(offered.has(t), `the repaired plan promises ${t}`);
  assert.match(JSON.parse(second.resultForLlm).note, /repaired rather than refused again: .*run_spec/,
    'a repair the product made must be announced, naming what it dropped');
  assert.equal(ctx.planState.announced, true);
});

test('a step naming a tool that does not exist gets the same treatment', async () => {
  const ctx = ctxFor(offeredFor(), { refusals: 0, kinds: [], announced: false });
  const plan = { steps: [{ title: 'Edit it', tool: 'edit_scripts' }, { title: 'Check it', tool: 'audit_build' }] };
  const first = await propose(plan, ctx);
  assert.equal(first.ok, false);
  assert.match(first.resultForLlm, /edit_scripts/);
  assert.match(first.resultForLlm, /edit_script\b/, 'the near-miss the model meant must be offered back to it');
  const second = await propose(plan, ctx);
  assert.equal(second.ok, true);
  assert.deepEqual(planSteps(second).map((s) => s.tool), ['audit_build']);
});

test('a second plan after one is on screen is answered, not drawn as a second checklist', async () => {
  // The run loop kept and settled only the first plan, so a second accepted one left a card whose
  // steps stayed pending forever. Refusing it would put the run back on the refusal path.
  const ctx = ctxFor(offeredFor(), { refusals: 0, kinds: [], announced: false });
  const good = { steps: [{ title: 'Build it', tool: 'create_instances' }, { title: 'Check it', tool: 'audit_build' }] };
  const first = await propose(good, ctx);
  assert.equal(first.ok, true);
  assert.equal(first.detail.blocks[0].type, 'build_plan');
  const again = await propose({ steps: [{ title: 'Something else', tool: 'set_mood' }] }, ctx);
  assert.equal(again.ok, true, 'a second plan must not be a refusal');
  assert.notEqual(again.detail?.blocks?.[0]?.type, 'build_plan', 'a second checklist was drawn');
  assert.match(JSON.parse(again.resultForLlm).note, /not replaced/);
});

/* ----------------------------------------------------- 3. the property, whatever the model sends --- */

/** Deterministic, so a failure reproduces. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every kind of plan a model has been seen to send, and a few it has not. */
const ADVERSARIAL = [
  {},
  { steps: [] },
  { steps: 'a plan' },
  { steps: [42, null] },
  { steps: [{ title: '' , tool: 'create_instances' }] },
  { steps: [{ title: 'No tool here' }] },
  { steps: [{ title: 'Plan it', tool: 'propose_plan' }] },
  { steps: [{ title: 'Edit it', tool: 'edit_scripts' }] },
  { steps: [{ title: 'Test it', tool: 'run_spec' }] },
  { steps: [{ title: 'Look at it', tool: 'inspect_visually' }] },
  { steps: Array.from({ length: 20 }, (_, i) => ({ title: `Part ${i}`, tool: 'create_instances' })) },
  { steps: Array.from({ length: 20 }, (_, i) => ({ title: `Part ${i}`, tool: i % 3 ? 'create_instances' : 'edit_scripts' })) },
  { steps: [{ title: 'Build it', tool: 'create_instances' }] },
  { steps: [{ title: 'Build it', tool: 'create_instances' }, { title: 'Check it', tool: 'audit_build' }] },
];

test('CONSECUTIVE propose_plan REFUSALS NEVER EXCEED TWO, WHATEVER THE MODEL SENDS', async () => {
  const offered = NO_RENDER;
  let refusalsSeen = 0;
  let repairsSeen = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = prng(seed);
    // The run loop carries this across steps; a fresh one per simulated run.
    let state = { refusals: 0, kinds: [], announced: false };
    let streak = 0;
    let previous = null;
    let panels = 0;
    for (let call = 0; call < 12; call++) {
      // Often the IDENTICAL plan again — the shape of the production failure.
      const args = previous && rand() < 0.4 ? previous : ADVERSARIAL[Math.floor(rand() * ADVERSARIAL.length)];
      previous = args;
      const ctx = ctxFor(offered, state);
      const res = await propose(args, ctx);
      state = ctx.planState;
      if (res.ok) {
        streak = 0;
        if (res.detail?.blocks?.[0]?.type === 'build_plan') {
          panels += 1;
          for (const s of planSteps(res)) {
            assert.ok(offered.has(s.tool), `seed ${seed}: an accepted plan promises ${s.tool}, which this run cannot call`);
          }
          if (/repaired rather than refused again/.test(res.resultForLlm)) repairsSeen += 1;
        }
      } else {
        streak += 1;
        refusalsSeen += 1;
        assert.ok(streak <= 2, `seed ${seed}, call ${call + 1}: ${streak} consecutive refusals — ${res.resultForLlm}`);
      }
    }
    assert.ok(panels <= 1, `seed ${seed}: ${panels} checklists were drawn for one run`);
  }
  // Non-vacuity: the sequences really did exercise both halves of the rule.
  assert.ok(refusalsSeen > 100, `only ${refusalsSeen} refusals in 3600 calls — the generator is not adversarial`);
  assert.ok(repairsSeen > 20, `only ${repairsSeen} repairs — the repair path was barely exercised`);
});

test('CONTROL: without the run-level state every call is a first call, and refusals still work', async () => {
  // The eval harness and the admin route build a context with no plan state. That must keep the
  // refusal — a refusal is still the better first answer, because the model's own plan beats a
  // product-repaired one — and must not make any call a repair.
  for (let i = 0; i < 3; i++) {
    const res = await propose({ steps: [{ title: 'Edit it', tool: 'edit_scripts' }] }, ctxFor(offeredFor()));
    assert.equal(res.ok, false, 'a context without plan state repaired a plan it should have refused');
  }
});
