/**
 * THE WORKER'S PLAN AND THE BROWSER'S VALIDATOR, HELD AGAINST EACH OTHER.
 *
 * `build_plan` had a renderer, a validator clause, a gates.ts extractor and a Thinking-card row,
 * and no producer anywhere in apps/worker. This file is the joint: it runs the REAL worker tool,
 * takes the REAL document it emits, and feeds it to the REAL browser validator.
 *
 * Asserting the shape by hand on either side would prove nothing — that is how the two halves
 * drifted apart in the first place. Both sides are imported, neither is retyped.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { parseDocument, validateDocument } from '../src/lib/generative-ui/validate.ts';
import { plannedStepsFromDocs } from '../src/lib/gates.ts';
import { buildActions } from '../src/components/ws/thinking-model.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..', '..', 'worker');
const out = join(mkdtempSync(join(tmpdir(), 'bpp-')), 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

/** Run the real worker tool and hand back the document it attached to the tool row. */
async function planDoc(args) {
  const res = await T.runTool({ studioConnected: () => true }, 'propose_plan', JSON.stringify(args));
  assert.equal(res.ok, true, `the worker refused the plan: ${res.resultForLlm}`);
  return res.detail;
}

const PLAN = {
  title: 'Spawn platform',
  steps: [
    { title: 'Read the place', detail: 'See what is already in Workspace', tool: 'get_project_tree' },
    { title: 'Build the platform', detail: 'One anchored Part under Workspace', tool: 'create_instances' },
    { title: 'Prove a player can stand on it', tool: 'run_and_check' },
  ],
};

test('a worker still produces build_plan at all — nothing below is vacuous', async () => {
  // The whole point of this file. If the producer is removed, this is the line that says so
  // rather than every assertion below quietly passing on a fixture.
  assert.ok(T.toolNames().includes('propose_plan'), 'no worker tool emits a build_plan document');
  const doc = await planDoc(PLAN);
  assert.equal(doc.blocks[0].type, 'build_plan');
});

test("THE VALIDATOR ACCEPTS THE WORKER'S OWN DOCUMENT, unchanged", async () => {
  // A document the validator rejects is dropped whole and the panel silently does not appear —
  // indistinguishable, from the user's side, from a worker that emitted nothing.
  const res = validateDocument(await planDoc(PLAN));
  assert.equal(res.ok, true, `the browser rejected the worker's plan: ${JSON.stringify(res.errors)}`);
  assert.equal(res.doc.blocks[0].steps.length, 3);
});

test('it survives the wire: JSON round-trip through parseDocument', async () => {
  // tool_end.detail crosses a WebSocket as JSON. parseDocument is the ingress the browser really
  // uses, and it is stricter than validateDocument about depth and byte length.
  const res = parseDocument(JSON.stringify(await planDoc(PLAN)));
  assert.equal(res.ok, true, `parseDocument rejected it: ${JSON.stringify(res.errors)}`);
});

test('the tool chip the renderer draws is a real tool name', async () => {
  // render.tsx draws `step.tool` as a monospace chip. Its only previous source was a hand-written
  // fixture in /ui-lab, so nothing ever checked the names were real.
  const res = validateDocument(await planDoc(PLAN));
  const names = new Set(T.toolNames());
  for (const step of res.doc.blocks[0].steps) {
    assert.ok(step.tool, `step "${step.title}" reached the renderer with no tool chip`);
    assert.ok(names.has(step.tool), `the plan card would show "${step.tool}", which is not a tool`);
  }
});

test('gates.ts lifts every proposed step into the Thinking card as pending', async () => {
  const res = validateDocument(await planDoc(PLAN));
  const steps = plannedStepsFromDocs([{ id: 'tool-1', doc: res.doc }]);
  assert.equal(steps.length, 3, 'plannedStepsFromDocs is still permanently empty outside /ui-lab');
  assert.deepEqual(steps.map((s) => s.title), PLAN.steps.map((s) => s.title));
  assert.equal(steps[0].detail, 'See what is already in Workspace');
});

test('and the Actions checklist shows them as pending work, after the real tool rows', async () => {
  const res = validateDocument(await planDoc(PLAN));
  const plannedSteps = plannedStepsFromDocs([{ id: 'tool-1', doc: res.doc }]);
  const actions = buildActions({
    intent: null,
    tools: [{ toolId: 'a', tool: 'propose_plan', summary: 'propose_plan', ok: true, done: true }],
    plannedSteps,
    gates: [],
    status: null,
    streaming: true,
  });
  const pending = actions.filter((a) => a.state === 'pending');
  assert.equal(pending.length, 3, 'the proposed plan never reached the Actions checklist');
  assert.equal(pending[0].label, 'Read the place');
});

test('a plan the worker refuses reaches the browser as nothing at all', async () => {
  // The refusal path must not leave a half-plan on screen. `detail` is what the socket carries.
  const res = await T.runTool({ studioConnected: () => true }, 'propose_plan',
    JSON.stringify({ steps: [{ title: 'Build it', tool: 'create_instances' }] }));
  assert.equal(res.ok, false, 'a plan with no verification step was accepted');
  assert.equal(res.detail, undefined, 'a refused plan still produced something to render');
});
