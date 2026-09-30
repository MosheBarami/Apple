/**
 * Run mode is never left on. Seen live 2026-09-30: after a check, Studio stayed in a test run, every
 * write of the run was refused, and the run could only ask the person to press Stop.
 *
 *   - run_and_check stops Run mode even when something throws while the simulation is live;
 *   - the session admits a run_mode stop after the run that started it has ended, and it is queued
 *     under no run, so the ended-run purge (partitionOpsByRun) keeps it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'rms-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

function studio() {
  const ops = [];
  return {
    ops,
    execStudioOp: async (op) => {
      ops.push(op.op === 'run_mode' ? `run_mode:${op.action}` : op.op);
      if (op.op === 'project_census') return { id: 'c', ok: true, data: { instances: 0 } };
      return { id: 'x', ok: true, data: {} };
    },
    createCheckpoint: async () => ({ id: 'cp' }),
  };
}

test('run_and_check stops Run mode when a frame capture throws mid-simulation', async () => {
  const s = studio();
  const ctx = {
    ...s,
    playtest: {
      begin() {}, phase() {}, console() {},
      canCapture: () => true,
      captureFrame: async () => { throw new Error('render_view blew up'); },
    },
  };
  await assert.rejects(T.TOOLS.run_and_check.run(ctx, { seconds: 2 }), /render_view blew up/);
  const started = s.ops.indexOf('run_mode:start');
  assert.ok(started >= 0, 'the simulation was started');
  assert.ok(s.ops.slice(started).includes('run_mode:stop'), `Run mode must be stopped before the error leaves: ${s.ops.join(', ')}`);
});

test('the normal path still stops exactly once', async () => {
  const s = studio();
  const r = await T.TOOLS.run_and_check.run(s, { seconds: 2 });
  assert.equal(r.stopped, true);
  assert.equal(s.ops.filter((o) => o === 'run_mode:stop').length, 1);
});

test('the session lets a run_mode stop through after its run ended, under no run', () => {
  const src = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const body = src.slice(src.indexOf('private async execStudioOp('), src.indexOf('const result = await new Promise<OpResult>'));
  assert.match(body, /const leavesRunMode = studioOp\.op === 'run_mode' && studioOp\.action === 'stop';/);
  assert.match(body, /if \(run && !leavesRunMode\) \{\s*const verdict = await this\.runAccessVerdict\(run\);/,
    'the ended-run refusal must not apply to the stop');
  assert.match(body, /runId: leavesRunMode \? undefined : this\.currentMsgId,/,
    'the stop belongs to no run, so partitionOpsByRun keeps it when the run is purged');
});
