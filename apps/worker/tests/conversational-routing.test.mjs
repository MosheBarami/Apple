// Talk must not be routed as work.
//
// THE BUG THIS PINS. `classifyRequest` had one short-text signal — `ambiguousRequest`, which fires
// on any text under 25 characters — and no notion of conversation. So "hi" was classified as an
// under-specified BUILD request. In Agent mode with Studio connected that escalated the step to
// `high` effort, spent a Credit, took a full snapshot of the user's place, fired the "You have not
// changed the project yet" nudge twice (two more paid calls), and finished the run as `incomplete`,
// telling the user: "I did not change anything in your project... which is a fault on my side."
//
// Every assertion below is about that path. Nothing here makes a network call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-reasoning-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'reasoning.ts'),
  '--bundle',
  '--format=esm',
  '--target=es2022',
  `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const R = await import(`file://${out}`);
rmSync(out, { force: true });

const GREETINGS = [
  'hi',
  'Hi!',
  'hey',
  'hello',
  'yo',
  'thanks',
  'thank you',
  'ok',
  'cool',
  'got it',
  'good morning',
  'bye',
  // The Hebrew greetings that sat here were removed on 2026-09-20 with the language itself: a
  // Hebrew prompt was measured losing a word silently on the way in, so the product stopped
  // offering the language rather than keep a promise it could not hold. The English list is the
  // whole list now, and the property they were protecting — a greeting must not route into a
  // build — is still covered by every entry above.
];

const META = ['who are you', 'what can you do', 'which model are you', 'what are you?'];

const REAL_WORK = [
  'build a door',
  'add a ProximityPrompt to the front door so it opens',
  'make me a shop UI',
  'fix the leaderboard',
  'improve it',
  'a door', // terse, but genuinely a build ask — must STAY ambiguous
];

test('greetings classify as conversational, not as ambiguous build requests', () => {
  for (const text of GREETINGS) {
    const t = R.classifyRequest(text);
    assert.equal(t.conversational, true, `${JSON.stringify(text)} should be conversational`);
    assert.equal(t.ambiguousRequest, false, `${JSON.stringify(text)} must not be an ambiguous build request`);
  }
});

test('questions about the assistant are conversational', () => {
  for (const text of META) {
    assert.equal(R.classifyRequest(text).conversational, true, text);
  }
});

test('real build requests are NOT conversational, and terse ones stay ambiguous', () => {
  for (const text of REAL_WORK) {
    assert.equal(R.classifyRequest(text).conversational, false, `${JSON.stringify(text)} is work`);
  }
  // The short-ask signal still has to work — this is the case `ambiguousRequest` exists for.
  assert.equal(R.classifyRequest('a door').ambiguousRequest, true);
  assert.equal(R.classifyRequest('improve it').ambiguousRequest, true);
});

test('a greeting never escalates effort, in any mode', () => {
  for (const mode of ['plan', 'agent', 'agent']) {
    const choice = R.chooseEffort({
      mode,
      step: 1,
      highEffortUsed: 0,
      ...R.classifyRequest('hi'),
    });
    assert.equal(choice.effort, 'low', `${mode}: a greeting must cost low effort`);
    assert.match(choice.reason, /conversational/);
  }
});

test('a real build request still escalates — the fix must not blunt the policy', () => {
  const choice = R.chooseEffort({
    mode: 'agent',
    step: 1,
    highEffortUsed: 0,
    ...R.classifyRequest('build and light a market plaza'),
  });
  assert.equal(choice.effort, 'high', 'design work still buys judgement');
});

test('a failed prior step still escalates even on a conversational turn', () => {
  // The conversational short-circuit must not swallow recovery: if the previous step errored,
  // something IS wrong and cheap thinking will not fix it.
  //
  // Asserted in Plan, whose baseline is `low`, so the escalation is actually observable. Agent's
  // baseline is already `high`, where `raise()` is a no-op and would prove nothing about recovery.
  const choice = R.chooseEffort({
    mode: 'plan',
    step: 3,
    highEffortUsed: 0,
    priorStepFailed: true,
    ...R.classifyRequest('ok'),
  });
  assert.equal(choice.effort, 'high', 'recovery must outrank the conversational short-circuit');
  assert.match(choice.reason, /failed step/);

  // And without a failure, the same message in the same mode stays cheap.
  const calm = R.chooseEffort({ mode: 'plan', step: 3, highEffortUsed: 0, ...R.classifyRequest('ok') });
  assert.equal(calm.effort, 'low');
});
