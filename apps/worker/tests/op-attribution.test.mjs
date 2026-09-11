// Which queued Studio ops survive a run ending.
//
// The rule (A5) is that a run's queued ops must not reach the user's place after that
// run is over. The bug was in the ATTRIBUTION behind it: ops queued when no run was in
// flight inherited the last dead run's id and were discarded as its work — including
// the automatic pre-run checkpoint, which is the undo point the product promises
// before it changes anything. Observed twice against the deployed Worker, 2026-09-01.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'opattr-')), 'op-attribution.mjs');
execFileSync(join(HERE, '..', 'node_modules', '.bin', 'esbuild'),
  [join(HERE, '..', 'src', 'op-attribution.ts'), '--bundle', '--format=esm', '--platform=neutral', '--outfile=' + out],
  { stdio: 'pipe' });
const { partitionOpsByRun } = await import(out);

const op = (id, runId) => ({ id, seq: 1, studioOp: { op: 'ping' }, runId });

test('ops from the live run are kept', () => {
  const { keep, drop } = partitionOpsByRun([op('a', 'run1'), op('b', 'run1')], 'run1');
  assert.equal(keep.length, 2);
  assert.equal(drop.length, 0);
});

test('ops from a different, finished run are dropped — A5 still holds', () => {
  // This is the protection the whole mechanism exists for: the user pressed stop,
  // and work queued by that run must not land in their place afterwards.
  const { keep, drop } = partitionOpsByRun([op('a', 'dead'), op('b', 'run2')], 'run2');
  assert.deepEqual(keep.map((o) => o.id), ['b']);
  assert.deepEqual(drop.map((o) => o.id), ['a']);
});

test('an op belonging to NO run survives a run ending', () => {
  // THE REGRESSION. A checkpoint requested outside a run, or the automatic snapshot
  // taken as the next run starts, has no run to belong to. It cannot belong to an
  // ENDED one either, and dropping it silently removed a user's undo point.
  const { keep, drop } = partitionOpsByRun([op('checkpoint', undefined)], undefined);
  assert.deepEqual(keep.map((o) => o.id), ['checkpoint']);
  assert.equal(drop.length, 0);
});

test('an unattributed op survives even while another run is live', () => {
  const { keep, drop } = partitionOpsByRun([op('checkpoint', undefined), op('x', 'dead')], 'run3');
  assert.deepEqual(keep.map((o) => o.id), ['checkpoint']);
  assert.deepEqual(drop.map((o) => o.id), ['x']);
});

test('with no run live, only unattributed ops survive', () => {
  const { keep, drop } = partitionOpsByRun([op('a', 'run1'), op('b', undefined)], undefined);
  assert.deepEqual(keep.map((o) => o.id), ['b']);
  assert.deepEqual(drop.map((o) => o.id), ['a']);
});

test('the queue order of survivors is preserved', () => {
  const ops = [op('1', undefined), op('2', 'live'), op('3', 'dead'), op('4', 'live')];
  const { keep } = partitionOpsByRun(ops, 'live');
  assert.deepEqual(keep.map((o) => o.id), ['1', '2', '4']);
});

test('an empty queue partitions to two empty halves', () => {
  const { keep, drop } = partitionOpsByRun([], undefined);
  assert.deepEqual([keep, drop], [[], []]);
});

// --- the fix at its real call site --------------------------------------------
// partitionOpsByRun is only half the fix. The other half is that finishRun clears
// `currentMsgId`, so an op queued AFTER a run gets `runId: undefined` rather than the
// dead run's id. Without that line, the case above is never reached in production —
// the op arrives already mislabelled. Assert the line is there, at the right place.
test('finishRun clears currentMsgId, so later ops are not attributed to it', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'do', 'session.ts'), 'utf8');
  const start = src.indexOf('private async finishRun(');
  assert.ok(start > 0, 'finishRun not found');
  const body = src.slice(start, start + 3000);
  assert.match(body, /this\.currentMsgId = undefined;/,
    'finishRun must clear currentMsgId, or an out-of-run op inherits the finished run\'s id');
});
