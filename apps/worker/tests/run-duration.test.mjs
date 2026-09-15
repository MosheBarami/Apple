/**
 * A run is bounded in STEPS but was not bounded in TIME — CHECKLIST-V2 §50.14.
 *
 * STEP_LIMITS caps a run at 3, 16 or 24 steps by mode. Nothing capped how long those steps take.
 * `startedAt` existed on every agent record and was read exactly once, at the end, to REPORT
 * `durationMs` — a number nobody acted on. A rune run of 24 steps, each waiting on a slow provider
 * or a stuck plugin, runs for over an hour and spends the whole time.
 *
 * A step ceiling bounds how many times work is attempted. A wall-clock ceiling bounds how long the
 * user waits and how long the bill accrues, and those are different failures: the runaway that
 * matters is not usually a fast loop, it is a slow one.
 *
 * THE FAILURE MESSAGE IS PART OF THE FIX. An agent told "step limit" when it hit a TIME limit will
 * retry with fewer steps and hit the same wall. What stopped it has to be what it is told.
 *
 * AND AN UNREADABLE CLOCK STOPS THE RUN. `Date.now() - NaN` is NaN and `NaN > cap` is false, so a
 * corrupt `startedAt` would mean NO LIMIT — the exact fails-open shape this repository keeps
 * finding. A deadline that cannot be computed is a deadline that has passed.
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

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'rundur-')), 'session.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'session.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const S = await import(`file://${out}`);

const T0 = Date.parse('2026-09-15T12:00:00Z');
const MIN = 60_000;

test('CONTROL: a run inside its window keeps going, for every mode', () => {
  // If this ever stops being true the feature has broken the product rather than bounded it.
  for (const mode of ['clay', 'stone', 'rune']) {
    const cap = S.RUN_WALL_MS[mode];
    assert.equal(typeof cap, 'number', `${mode} needs a wall-clock ceiling`);
    assert.ok(Number.isFinite(cap) && cap > 0, `${mode}'s ceiling must be usable, got ${cap}`);
    const v = S.runDurationVerdict({ startedAt: T0, mode, now: T0 + cap - 1 });
    assert.equal(v.over, false, `${mode} stopped one millisecond early`);
  }
});

test('a run past its ceiling is stopped', () => {
  for (const mode of ['clay', 'stone', 'rune']) {
    const cap = S.RUN_WALL_MS[mode];
    assert.equal(S.runDurationVerdict({ startedAt: T0, mode, now: T0 + cap }).over, true, `${mode} at exactly the cap`);
    assert.equal(S.runDurationVerdict({ startedAt: T0, mode, now: T0 + cap + MIN }).over, true, `${mode} past the cap`);
  }
});

test('the verdict says TIME, not steps, and names the figure', () => {
  // An agent told "step limit" when it hit a time limit retries with fewer steps and hits the same
  // wall. What stopped it has to be what it is told.
  const v = S.runDurationVerdict({ startedAt: T0, mode: 'stone', now: T0 + S.RUN_WALL_MS.stone + MIN });
  assert.equal(v.over, true);
  assert.match(v.reason, /time|minute|long/i, `the reason must be about duration; got: ${v.reason}`);
  assert.doesNotMatch(v.reason, /step/i, 'and must not blame the step ceiling');
  assert.ok(Number.isFinite(v.elapsedMs) && v.elapsedMs > 0, 'and carries how long it actually ran');
});

test('AN UNREADABLE CLOCK STOPS THE RUN, rather than removing the limit', () => {
  // `Date.now() - NaN` is NaN and `NaN > cap` is FALSE, so the naive form means no limit at all.
  for (const [label, patch] of [
    ['startedAt NaN', { startedAt: NaN }],
    ['startedAt undefined', { startedAt: undefined }],
    ['startedAt a string', { startedAt: '123' }],
    // T0 + 10min against a `now` of T0 + 1min — my first version used the same value for both,
    // so elapsed was 0 rather than negative and the case tested nothing.
    ['startedAt in the future', { startedAt: T0 + 10 * MIN }],
    ['now NaN', { now: NaN }],
    ['now Infinity', { now: Infinity }],
  ]) {
    const v = S.runDurationVerdict({ startedAt: T0, mode: 'stone', now: T0 + MIN, ...patch });
    assert.equal(v.over, true, `${label} must stop the run, not exempt it`);
    assert.match(v.reason, /could not|unreadable|clock/i, `${label} should say the clock was the problem: ${v.reason}`);
  }
});

test('an unknown mode gets the STRICTEST ceiling, never none', () => {
  // session.ts validates mode at every ingress now, so this is defence in depth — and the safe
  // direction for a value nobody recognised is the tightest bound, not the absence of one.
  const strictest = Math.min(...Object.values(S.RUN_WALL_MS));
  for (const mode of ['memory', 'nonsense', '__proto__', null, undefined, 7]) {
    const v = S.runDurationVerdict({ startedAt: T0, mode, now: T0 + strictest });
    assert.equal(v.over, true, `mode ${JSON.stringify(mode)} must be bounded by the strictest ceiling`);
  }
});

test('the ceilings are ordered by how long the mode is meant to work', () => {
  // Plan is a question, Agent is a build, Super Agent is long-horizon. A ceiling that did not
  // follow that ordering would be a number somebody typed rather than a policy.
  assert.ok(S.RUN_WALL_MS.clay <= S.RUN_WALL_MS.stone, 'plan must not outlast agent');
  assert.ok(S.RUN_WALL_MS.stone <= S.RUN_WALL_MS.rune, 'agent must not outlast super agent');
  assert.ok(S.RUN_WALL_MS.rune <= 60 * MIN, 'no run should be allowed to last an hour');
});
