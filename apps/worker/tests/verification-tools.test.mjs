/**
 * FIVE WAYS TO CHECK A BUILD, AND THE MODEL HAS TO KNOW WHICH ONE.
 *
 * check_composition, audit_build, run_spec, run_and_check and inspect_visually all answer "is this
 * any good" and answer completely different questions. Two of them cost money: inspect_visually
 * renders and calls a vision model, run_and_check runs the place. Three are free.
 *
 * Until now none of their descriptions mentioned any of the others, so the model chose between
 * them on vibes — and the cheapest correct answer is frequently one of the free ones. A tool
 * description is the ONLY place that choice can be informed: the model reads it before it reads
 * anything else, and there is no other channel where "run the free one first" can be said.
 *
 * This file pins the decision structure, not the prose. Each tool must say what it does NOT prove
 * and name the sibling that does, so a future edit cannot quietly leave the model guessing again.
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
const out = join(mkdtempSync(join(tmpdir(), 'vt-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

const VERIFIERS = ['check_composition', 'audit_build', 'run_spec', 'run_and_check', 'inspect_visually'];
const describe = (name) => {
  const def = T.toolDefs(true, undefined).find((d) => d.name === name);
  assert.ok(def, `${name} is not offered`);
  return def.description;
};

test('all five verifiers exist and are offered, so nothing below is vacuous', () => {
  const offered = T.toolDefs(true, undefined).map((d) => d.name);
  for (const v of VERIFIERS) assert.ok(offered.includes(v), `${v} missing`);
});

test('check_composition consumes render_view layout data without run_code', async () => {
  const ops = [];
  const ctx = {
    env: {}, studioConnected: () => true, addMemoryFact: async () => {},
    execStudioOp: async (op) => {
      ops.push(op);
      return { ok: true, data: {
        layout: {
          format: 'x,y,z,sx,sy,sz,yawDeg', skipped: 0,
          parts: [
            [0, 5, 0, 10, 10, 10, 0],
            [24, 3, 0, 6, 6, 6, 0],
            [-24, 2, 0, 4, 4, 4, 0],
          ],
        },
      } };
    },
  };
  const res = await T.TOOLS.check_composition.run(ctx, { subject: 'scene' });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.deepEqual(ops.map((op) => op.op), ['render_view']);
  assert.equal(ops[0].width, 48);
  assert.equal(ops[0].height, 32);
  assert.equal(ops.some((op) => op.op === 'run_code'), false);
  assert.equal(typeof res.structure, 'string');
});

test('THE PAID ONES SAY THEY COST, and name the free one to try first', () => {
  // The whole point. A model that does not know inspect_visually costs Credits will reach for it
  // when audit_build would have found the defect for nothing.
  const visual = describe('inspect_visually');
  assert.match(visual, /costs Credits|cost/i, 'it must say it costs');
  assert.match(visual, /audit_build/, 'and name the free alternative');
  assert.match(visual, /free/i, 'and say that it is free');
});

test('run_and_check says what it does NOT prove, and names what does', () => {
  // "Nothing errored" is the absence of one signal rendered as the presence of another — the same
  // shape as every other finding on this branch, one level up.
  const d = describe('run_and_check');
  assert.match(d, /NOTHING ERRORED|not.*same as.*correct/i, 'it must disclaim');
  assert.match(d, /run_spec/, 'and name the tool that asserts behaviour');
});

test('run_spec says what run_and_check cannot do', () => {
  const d = describe('run_spec');
  assert.match(d, /run_and_check/, 'it must name the tool it complements');
  assert.match(d, /errored|error/i);
});

test('audit_build says it does not replace the visual one', () => {
  const d = describe('audit_build');
  assert.match(d, /inspect_visually/, 'it must name the tool it complements');
  assert.match(d, /render/i, 'and say it does not look at one');
});

test('every snake_case name in a verifier description is a real tool', () => {
  // The same drift guard as the prompt and the roadmap briefs: a description naming a tool that
  // does not exist — `audit_buildd`, a renamed sibling — is an instruction the model follows,
  // fails, and works around, having spent a turn finding out.
  //
  // I first wrote this with `if (!names.has(token)) continue;` before the assertion, which made
  // the assertion unreachable on failure: the test could only ever pass. Exactly the shape this
  // branch keeps finding elsewhere, self-inflicted. The exceptions are now an explicit list, so
  // an unregistered token FAILS unless somebody decided otherwise in writing.
  const names = new Set(T.toolNames());
  const PROSE = new Set(['run_mode']); // Studio's Run mode, named in run_and_check as a concept
  for (const v of VERIFIERS) {
    for (const token of new Set(describe(v).match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [])) {
      if (PROSE.has(token)) continue;
      assert.ok(
        names.has(token),
        `${v}'s description names "${token}", which is neither a registered tool nor a declared prose term`,
      );
    }
  }
});

test('each of the three free verifiers says so, so cost is comparable at a glance', () => {
  // THE LOOP USED TO NAME THREE AND CHECK TWO. run_spec is free by this file's own opening
  // paragraph and was left out of the list, and its description said nothing about cost — so the
  // invariant this test is named after was already false of the shipped product while the test was
  // green. A test that names more than it checks is a worse failure than one that checks nothing,
  // because the name is what anybody reads.
  const free = ['check_composition', 'audit_build', 'run_spec'];
  assert.equal(free.length, 3, 'the name says three');
  for (const v of free) {
    assert.match(describe(v), /costs? nothing|free|no model call/i, `${v} should say it is free`);
  }
});

test('no two verifiers claim the same job in the same words', () => {
  // A cheap guard against the obvious regression: someone copies a description and edits half of
  // it, and two tools end up telling the model the same thing.
  const seen = new Map();
  for (const v of VERIFIERS) {
    const first = describe(v).split('.')[0].trim().toLowerCase();
    assert.equal(seen.get(first), undefined, `${v} and ${seen.get(first)} open identically: "${first}"`);
    seen.set(first, v);
  }
});

// Measured 2026-09-22 (run fad0ab1b): the plugin refused its own stop, run_and_check returned
// `stopped: false` beside a green ✓, the agent never noticed, and every edit after it was refused
// because Studio was still in a test. A playtest that could not stop is a failure, and says so first.
test('a playtest whose stop is refused is reported as a failure, headline first', async () => {
  const ops = [];
  const ctx = {
    env: {}, studioConnected: () => true, addMemoryFact: async () => {},
    createCheckpoint: async () => ({ id: 'cp1' }),
    execStudioOp: async (op) => {
      ops.push(`${op.op}${op.action ? `:${op.action}` : ''}`);
      if (op.op === 'run_mode' && op.action === 'stop') {
        return { ok: false, error: 'Studio is running a non-Run test; Apple will not take over a test it did not start' };
      }
      if (op.op === 'project_census') return { ok: true, data: { parts: 3, scripts: 1, services: {}, topLevel: [] } };
      if (op.op === 'get_logs') return { ok: true, data: { entries: [] } };
      return { ok: true, data: {} };
    },
  };
  const res = await T.TOOLS.run_and_check.run(ctx, { seconds: 2 });
  assert.ok(ops.includes('run_mode:stop'), `the tool never tried to stop: ${ops.join(', ')}`);
  assert.match(String(res.error), /could not stop Run mode/, 'a refused stop must fail the tool');
  assert.match(String(res.stillRunning), /STILL RUNNING/);
  assert.equal(Object.keys(res)[0], 'error', 'the failure must lead the result, before any logs');
});

test('control: a playtest that stops cleanly carries no failure', async () => {
  const ctx = {
    env: {}, studioConnected: () => true, addMemoryFact: async () => {},
    createCheckpoint: async () => ({ id: 'cp1' }),
    execStudioOp: async (op) => {
      if (op.op === 'project_census') return { ok: true, data: { parts: 3, scripts: 1, services: {}, topLevel: [] } };
      if (op.op === 'get_logs') return { ok: true, data: { entries: [] } };
      return { ok: true, data: {} };
    },
  };
  const res = await T.TOOLS.run_and_check.run(ctx, { seconds: 2 });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(res.stillRunning, undefined);
  assert.equal(res.stopped, true);
});
