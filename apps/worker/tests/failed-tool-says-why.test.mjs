/**
 * A FAILED TOOL ROW SAID "✗ propose_plan" AND NOTHING ELSE.
 *
 * MEASURED against production 2026-09-20T23:38Z, run 0f108450-76e1-4d6f-8d9d-ecbb71e2bc26 on
 * https://apple.moshe-barami111.workers.dev — the first row of the persisted tool trace was:
 *
 *   {"tool":"propose_plan","ok":false,"summary":"✗ propose_plan","durationMs":0}
 *
 * No detail, no reason, nothing. `runTool` builds that string with `summarize(name, args, failed)`,
 * which reads the tool's NAME and its ARGUMENTS and never looks at the error — so the refusal text,
 * which `readProposedPlan` in tools.ts goes to real trouble to make actionable ("step 2 names the
 * tool \"edit_scripts\", which does not exist"), is written into `resultForLlm` for the model and
 * dropped on the floor for the person. The owner watching the Thinking card is shown that something
 * failed and is told nothing about what, which is this repository's own defect: a failure to observe
 * rendered as an observation.
 *
 * This file pins that a refusal the tool AUTHORED reaches the person, that it reaches them scrubbed,
 * and that it cannot grow without bound. It deliberately does NOT extend to the `catch` branch of
 * `runTool`: that text is an unexpected exception, not a sentence written for a reader, and the
 * comment there records why its raw form must not cross this boundary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'fail-why-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

const ctx = () => ({ studioConnected: () => true });
const call = (args) => T.runTool(ctx(), 'propose_plan', JSON.stringify(args));

const GOOD = {
  title: 'Tower',
  steps: [
    { title: 'Create the part', tool: 'create_instances' },
    { title: 'Check it', tool: 'audit_build' },
  ],
};

test('a tool that refuses says why, in the row the person reads', async () => {
  const res = await call({ steps: [{ title: 'Create the part', tool: 'edit_scripts' }] });
  assert.equal(res.ok, false);
  // The name and the verdict mark stay — they are what the panel aligns on.
  assert.match(res.summary, /^✗ propose_plan/);
  // …and the reason is now in it. This is the whole assertion: before 2026-09-21 the string ended
  // at the tool's name.
  assert.match(res.summary, /edit_scripts/, 'the refusal named a tool and the person was not told which: ' + res.summary);

  // ONE SENTENCE, NOT TWO. The person and the model must not be given different accounts of the same
  // refusal — that is how a support conversation and a transcript come to disagree. What the person
  // sees is a bounded, scrubbed prefix of what the model was told, and nothing else.
  const forModel = JSON.parse(res.resultForLlm).error;
  const reason = res.summary.replace(/^✗ propose_plan\s*—\s*/, '');
  assert.ok(forModel.startsWith(reason.slice(0, 40)), `the person and the model were told different things:\n  person: ${reason}\n  model:  ${forModel}`);
});

test('a refusal the model can shape cannot carry the engine name into the row', async () => {
  // The refusal text embeds the tool name the MODEL supplied, so the model chooses part of a string
  // that is now shown to a person. `scrubEngineIdentity` is what stands between those two facts, and
  // until this row carried a reason it was never on this path at all.
  const res = await call({ steps: [{ title: 'Do it', tool: '@cf/zai-org/glm-5.3-flash' }] });
  assert.equal(res.ok, false);
  assert.doesNotMatch(res.summary, /@cf\//, 'a Workers AI model path reached the person: ' + res.summary);
  assert.doesNotMatch(res.summary, /glm-5\.3/i, 'the engine was named to the person: ' + res.summary);
  assert.match(res.summary, /the engine/, 'the scrub removed the name and left nothing in its place: ' + res.summary);
});

test('the row stays a row: a long refusal is bounded, not a paragraph', async () => {
  const res = await call({ steps: [{ title: 'x'.repeat(200) }] });
  assert.equal(res.ok, false);
  // `readProposedPlan` quotes the step's own title back, so the model controls the length of this
  // string. The Thinking card renders `tool_end.summary` verbatim on one line.
  assert.ok(JSON.parse(res.resultForLlm).error.length > 200, 'the fixture no longer produces a long refusal — re-aim it');
  assert.ok(res.summary.length <= 200, `summary is ${res.summary.length} chars and would break the row: ${res.summary}`);
});

test('a tool that succeeds is unchanged', async () => {
  const res = await call(GOOD);
  assert.equal(res.ok, true);
  assert.equal(res.summary, '✓ propose_plan');
});

test('the summary still names the subject when the arguments carry one', async () => {
  // `summarize` prints `path/query/root/label/fact` after the tool name, and the reason must be
  // added to that rather than instead of it — apps/web suppresses its own target line when the
  // worker's sentence already carries it (activity.tsx, `carries(step.detail, step.target)`).
  const res = await T.runTool(ctx(), 'propose_plan', JSON.stringify({ ...GOOD, label: 'Tower' }));
  assert.match(res.summary, /Tower/);
});
