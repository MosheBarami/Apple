/**
 * A BUILD THAT STOPPED THREE STEPS IN, UNFINISHED AND PAID FOR, WAS FILED AS "IT WORKED".
 *
 * Two defects, one path.
 *
 * Dc55404 — the branch that ends a run on the step cap and the branch that ends it on the wall
 * clock both called `finishRun(agent, 'done')`. `done` is what `successOf` counts as a success, so
 * the two most common ways a free build stops short were counted OK, and `incomplete` — which
 * session.ts's own comment calls a failure in one sentence, "A run that still owes work has FAILED"
 * — was counted as neither. Any answer to "how often do runs actually fail?" was wrong in our
 * favour, by exactly the amount that matters.
 *
 * D884b14 — the durable build log carried no failure kind at all. `finishReason: 'length'` was read
 * from the provider, used to compose the apology "the model reached its output limit", and then
 * dropped, so a truncation was recoverable only one project at a time by inference from `messages`
 * and never across the fleet.
 *
 * These run against the REAL rollups, over events pushed through the REAL normalizeEvent boundary,
 * because both halves of the fix have to survive that boundary to mean anything: a field the log
 * accepts and the reader drops is the same defect one layer down.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'build-outcome-')), 'analytics.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'analytics.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' },
);
const A = await import(`file://${out}`);

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);

/** Through the real boundary, so nothing here asserts on a shape production would reject. */
function build(o) {
  const r = A.normalizeEvent({ kind: 'build', at: T0, steps: 3, opsApplied: 0, opsFailed: 0, durationMs: 1000, neurons: 5, ...o });
  assert.equal(r.ok, true, `fixture rejected at the boundary: ${JSON.stringify(r)}`);
  return r.event;
}

test('the boundary accepts the two new outcomes rather than flattening them to unknown', () => {
  assert.equal(build({ outcome: 'step_limit' }).outcome, 'step_limit');
  assert.equal(build({ outcome: 'timeout' }).outcome, 'timeout');
  // And still refuses an invented one, which is what makes the acceptance mean something.
  assert.equal(build({ outcome: 'probably_fine' }).outcome, 'unknown');
});

test('a run killed by the step cap or the clock is counted as a failure, not as a success', () => {
  const rollup = A.successRollup([
    build({ outcome: 'done' }),
    build({ outcome: 'step_limit' }),
    build({ outcome: 'timeout' }),
  ]).builds;
  assert.equal(rollup.ok, 1, 'only the run that actually finished is a success');
  assert.equal(rollup.failed, 2, 'the step-cap and wall-clock exits were counted OK');
  assert.equal(rollup.rate.value, 1 / 3);
});

test('"a run that still owes work has FAILED" — and is now counted that way', () => {
  const rollup = A.successRollup([build({ outcome: 'done' }), build({ outcome: 'incomplete' })]).builds;
  assert.equal(rollup.failed, 1, 'incomplete was unclassified, contradicting the code that emits it');
  assert.equal(rollup.unclassified, 0);
});

test('the user pressing stop, and running out of Credits, are still NOT defects', () => {
  const rollup = A.successRollup([build({ outcome: 'stopped' }), build({ outcome: 'quota' })]).builds;
  assert.equal(rollup.failed, 0, 'a user-initiated stop must never be counted as a broken build');
  assert.equal(rollup.unclassified, 2);
  assert.equal(rollup.rate.known, false, 'a window of nothing but unclassified outcomes yields no rate');
});

test('model-call and request success are untouched by the wider build vocabulary', () => {
  const r = A.normalizeEvent({
    kind: 'model_call', at: T0, provider: 'workers-ai', model: 'm', feature: 'f',
    outcome: 'failed', latencyMs: 1, inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, neurons: 1,
  });
  assert.equal(r.ok, true);
  const s = A.successRollup([r.event]);
  assert.equal(s.modelCalls.failed, 1);
  assert.equal(s.builds.total, 0);
});

// ------------------------------------------------------------------ D884b14

test('the provider\'s finish reason survives the boundary and is null when there was none', () => {
  assert.equal(build({ outcome: 'error', finishReason: 'length' }).finishReason, 'length');
  assert.equal(build({ outcome: 'done' }).finishReason, null, 'a run that never reached inference has no finish reason');
  assert.equal(build({ outcome: 'done', finishReason: 42 }).finishReason, null, 'a non-string is not a reason');
});

test('"how many runs are getting cut off?" now has a fleet-wide answer', () => {
  const rollup = A.buildRollup([
    build({ outcome: 'error', finishReason: 'length' }),
    build({ outcome: 'error', finishReason: 'length' }),
    build({ outcome: 'done', finishReason: 'stop' }),
    build({ outcome: 'step_limit' }),
  ]);
  assert.equal(rollup.total, 4);
  const cut = rollup.byFinishReason.find((b) => b.key === 'length');
  assert.ok(cut, 'truncation has no row at all — the number does not exist anywhere');
  assert.equal(cut.count, 2);
  assert.equal(cut.fatal, 2, 'every truncated run also ended badly, and the row must say so');
  assert.equal(rollup.byFinishReason.find((b) => b.key === 'none')?.count, 1, 'a run with no reason is "none", not dropped');
  assert.equal(rollup.byOutcome.find((b) => b.key === 'step_limit')?.count, 1);
});

test('the summary the admin endpoint returns actually carries it', () => {
  const s = A.summarize([build({ outcome: 'error', finishReason: 'length' })], { now: T0 + 1000 });
  assert.ok(s.builds, 'summarize does not expose the build rollup, so nothing reaches /api/admin/analytics');
  assert.equal(s.builds.byFinishReason[0].key, 'length');
});

test('the run that writes the log sets the finish reason on every step, not only on the failing branch', () => {
  // The value must be on the run's state before finishRun reads it, from wherever the run ends.
  const src = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(src, /agent\.lastFinishReason = finishReason;/);
  const assign = src.indexOf('agent.lastFinishReason = finishReason;');
  const branch = src.indexOf('if (!res.toolCalls.length && finishReason !== ', assign - 400);
  assert.ok(assign > 0 && branch > assign, 'the assignment must precede the truncation branch, or a completed run records nothing');
});

test('the step-cap and wall-clock branches pass their own outcome to the log', () => {
  const src = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(src, /finishRun\(agent, 'done', undefined, undefined, 'timeout'\)/);
  assert.match(src, /finishRun\(agent, 'done', undefined, undefined, 'step_limit'\)/);
  // And the wire is deliberately unchanged: apps/web renders `msg_end.stopReason` from a union in
  // @golem/shared that this lane does not own.
  assert.match(src, /stopReason: reason/);
});
