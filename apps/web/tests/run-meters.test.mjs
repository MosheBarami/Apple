// What a run is costing must be visible while it runs.
//
// THE GAP: the worker tracked `sparksSpent` and `neuronsUsed` per run and sent neither. The only
// cost the client ever received was the `quota` message — whole-account state. So the figure a user
// watching a build can actually act on ("this run has spent 6 Sparks, step 9 of 16") was the one
// figure the server had and never transmitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const ROOT = join(WEB, '..', '..');

const SHARED = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
const SESSION = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'do', 'session.ts'), 'utf8');
const SOCKET = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
const THINKING = readFileSync(join(WEB, 'src', 'components', 'ws', 'thinking.tsx'), 'utf8');

test('the wire carries per-run cost, separately from account-wide quota', () => {
  const status = SHARED.slice(SHARED.indexOf("type: 'agent_status'"), SHARED.indexOf("| { type: 'quota'"));
  assert.match(status, /sparksSpent\?: number/);
  // The account-wide message must still exist and stay distinct — they answer different questions.
  assert.match(SHARED, /\{ type: 'quota'; quota: QuotaState \}/);
});

test('the worker actually sends it, not just declares it', () => {
  // A field on the type that nothing populates is the same as no field.
  const sends = [...SESSION.matchAll(/type: 'agent_status'[\s\S]{0,320}?\}\)/g)].map((m) => m[0]);
  assert.ok(sends.length >= 2, `expected several agent_status broadcasts, found ${sends.length}`);
  const withCost = sends.filter((s) => s.includes('sparksSpent'));
  assert.ok(withCost.length >= 2, 'the step-level broadcasts must carry the run cost');
});

test('the client carries it forward between settlements', () => {
  // Cost settles once per step while the phase changes several times within one. Without the
  // carry-forward the figure flickers back to nothing mid-step.
  assert.match(SOCKET, /sparksSpent: msg\.sparksSpent \?\? prev\?\.sparksSpent/);
  assert.match(SOCKET, /sparksSpent\?: number/, 'AgentStatus must declare it');
});

test('the UI shows it, and does not display a confident zero before anything is spent', () => {
  assert.match(THINKING, /status\.sparksSpent > 0/, 'an opening run must not render "0 Sparks"');
  // Matched on the fragment JSX actually produces: the plural expression splits the sentence, so
  // the literal "Sparks this run" never appears contiguously in the source.
  assert.match(THINKING, /'Sparks'\} this run/);
  // Singular and plural, because the string is shown verbatim.
  assert.match(THINKING, /status\.sparksSpent === 1 \? 'Spark' : 'Sparks'/);
});

test('step progress is shown as a real fraction, never invented', () => {
  // Only when BOTH numbers are known — a step count with no total is a progress bar with no end,
  // which reads as progress the product cannot actually promise.
  assert.match(THINKING, /status\?\.step != null && status\?\.totalSteps != null/);
});

test('the cost shown is the worker\'s settled figure, not a client-side estimate', () => {
  // The client must never compute Sparks itself: it does not see neurons, prices or the settlement,
  // and an estimate rendered beside real ones is indistinguishable from them.
  assert.equal(/NEURONS_PER_SPARK/.test(THINKING), false, 'the UI must not price anything itself');
  assert.equal(/sparksFor|Math\.ceil\([^)]*neuron/i.test(THINKING), false, 'no client-side Spark arithmetic');
});
