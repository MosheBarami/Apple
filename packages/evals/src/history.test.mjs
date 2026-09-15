// Eval history: every recorded run, in order, with the gaps left in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadRunHistory, metricSeries, findRun, timestampFromFilename, RESULTS_DIR } from './history.mjs';

const rec = (taskId, score, extra = {}) => ({ model: 'clay', taskId, category: 'c', ok: true, attempts: 1, ms: 100, score, scored: true, usage: { inputTokens: 10, outputTokens: 10 }, checks: [], ...extra });
const deadRec = (taskId) => ({ model: 'clay', taskId, category: 'c', ok: false, attempts: 1, ms: 0, score: null, scored: false, ungradedReason: 'transport_error', error: 'HTTP 500', checks: [] });

function fixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'golem-history-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), typeof body === 'string' ? body : JSON.stringify(body));
  return dir;
}

const runFile = (tag, startedAt, perTask) => ({ runMeta: { tag, startedAt, models: ['clay'] }, perTask });

test('a results file that will not parse is REPORTED, not silently dropped', () => {
  // report.mjs writes a line to stderr and drops it, so a run whose record is corrupt vanishes
  // from the history table -- and a missing row reads as "that run was never done".
  const dir = fixtureDir({
    'good-20260101-000000.json': runFile('good', '2026-01-01T00:00:00.000Z', [rec('t1', 1)]),
    'broken-20260102-000000.json': '{ not json at all',
    'notarun-20260103-000000.json': { hello: 'world' },
  });
  try {
    const { runs, errors } = loadRunHistory({ dir });
    assert.equal(runs.length, 1);
    assert.equal(errors.length, 2, JSON.stringify(errors));
    assert.ok(errors.some((e) => e.file === 'broken-20260102-000000.json' && /invalid JSON/.test(e.why)));
    assert.ok(errors.some((e) => e.file === 'notarun-20260103-000000.json' && /not an eval results file/.test(e.why)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runs come back oldest first, by their own declared start time', () => {
  const dir = fixtureDir({
    'c-20260301-000000.json': runFile('c', '2026-03-01T00:00:00.000Z', [rec('t1', 1)]),
    'a-20260101-000000.json': runFile('a', '2026-01-01T00:00:00.000Z', [rec('t1', 1)]),
    'b-20260201-000000.json': runFile('b', '2026-02-01T00:00:00.000Z', [rec('t1', 1)]),
  });
  try {
    assert.deepEqual(loadRunHistory({ dir }).runs.map((r) => r.tag), ['a', 'b', 'c']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a run with no usable timestamp is flagged instead of being sorted to the epoch', () => {
  // Sorted to 0 it becomes "the oldest run" and anchors every trend line drawn from this history.
  const dir = fixtureDir({
    'first-20260101-000000.json': runFile('first', '2026-01-01T00:00:00.000Z', [rec('t1', 1)]),
    'undated.json': { runMeta: { tag: 'undated' }, perTask: [rec('t1', 1)] },
  });
  try {
    const { runs, errors } = loadRunHistory({ dir });
    assert.equal(runs.length, 2);
    assert.ok(errors.some((e) => e.file === 'undated.json' && /no usable timestamp/.test(e.why)));
    assert.equal(runs.find((r) => r.tag === 'undated').orderSource, 'none');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a filename timestamp is used when the run itself did not record one', () => {
  assert.equal(timestampFromFilename('baseline-20260830-201237.json'), Date.parse('2026-08-30T20:12:37'));
  assert.equal(timestampFromFilename('no-stamp.json'), null);
  const dir = fixtureDir({ 'tagged-20260505-121212.json': { runMeta: { tag: 'tagged' }, perTask: [rec('t1', 1)] } });
  try {
    const { runs, errors } = loadRunHistory({ dir });
    assert.equal(runs[0].orderSource, 'filename');
    assert.deepEqual(errors, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A RUN THAT MEASURED NOTHING IS A GAP IN THE SERIES, NOT A ZERO', () => {
  const dir = fixtureDir({
    'a-20260101-000000.json': runFile('a', '2026-01-01T00:00:00.000Z', [rec('t1', 1), rec('t2', 1)]),
    'outage-20260102-000000.json': runFile('outage', '2026-01-02T00:00:00.000Z', [deadRec('t1'), deadRec('t2')]),
    'c-20260103-000000.json': runFile('c', '2026-01-03T00:00:00.000Z', [rec('t1', 1), rec('t2', 0)]),
  });
  try {
    const { runs } = loadRunHistory({ dir });
    const s = metricSeries(runs, { metric: 'passRate' });
    assert.equal(s.points.length, 3, 'every run must contribute a point, even an unmeasurable one');
    assert.equal(s.gaps, 1);
    assert.equal(s.points[1].available, false);
    assert.equal(s.points[1].value, null, 'the outage was plotted as a crash to zero');
    assert.equal(s.points[1].reason, 'all_records_ungraded');
    // `best` and `latest` are over measured points only: the outage is neither the worst run
    // nor the most recent reading.
    assert.equal(s.best.tag, 'a');
    assert.equal(s.latest.tag, 'c');
    assert.equal(s.latest.value, 0.5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a lower-is-better series picks the minimum as best', () => {
  const dir = fixtureDir({
    'slow-20260101-000000.json': runFile('slow', '2026-01-01T00:00:00.000Z', [rec('t1', 1, { ms: 5000 })]),
    'fast-20260102-000000.json': runFile('fast', '2026-01-02T00:00:00.000Z', [rec('t1', 1, { ms: 50 })]),
  });
  try {
    const { runs } = loadRunHistory({ dir });
    const byLatency = metricSeries(runs, { metric: 'meanLatencyMs' });
    assert.equal(byLatency.best.tag, 'fast', 'the slower run was called the best latency');
    assert.equal(byLatency.best.value, Math.min(...byLatency.points.map((p) => p.value)));
    // A tie resolves to the EARLIEST measured point, so the answer does not flap between runs.
    const byPass = metricSeries(runs, { metric: 'passRate' });
    assert.equal(byPass.points[0].value, byPass.points[1].value, 'fixture drift: these were meant to tie');
    assert.equal(byPass.best.tag, 'slow');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('asking for a model a run does not carry is a gap with a reason', () => {
  const dir = fixtureDir({ 'a-20260101-000000.json': runFile('a', '2026-01-01T00:00:00.000Z', [rec('t1', 1)]) });
  try {
    const { runs } = loadRunHistory({ dir });
    const s = metricSeries(runs, { metric: 'passRate', model: 'rune' });
    assert.equal(s.points[0].available, false);
    assert.equal(s.points[0].value, null);
    assert.match(s.points[0].reason, /not in this run/);
    assert.equal(s.best, null, 'a series with no measured point produced a best');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('findRun resolves a tag, a filename, and "latest"', () => {
  const dir = fixtureDir({
    'a-20260101-000000.json': runFile('a', '2026-01-01T00:00:00.000Z', [rec('t1', 1)]),
    'b-20260102-000000.json': runFile('b', '2026-01-02T00:00:00.000Z', [rec('t1', 1)]),
  });
  try {
    const { runs } = loadRunHistory({ dir });
    assert.equal(findRun(runs, 'latest').tag, 'b');
    assert.equal(findRun(runs, 'a').tag, 'a');
    assert.equal(findRun(runs, 'a-20260101-000000.json').tag, 'a');
    assert.equal(findRun(runs, 'nope'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable results directory is an error, not an empty history', () => {
  const { runs, errors } = loadRunHistory({ dir: join(tmpdir(), 'golem-history-does-not-exist-xyz') });
  assert.deepEqual(runs, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0].why, /unreadable results directory/);
});

test('the real results directory loads, and the 168-dead-job run shows as a GAP', () => {
  const { runs, errors } = loadRunHistory();
  assert.ok(runs.length >= 8, `expected the recorded runs, got ${runs.length}`);
  assert.deepEqual(errors, [], JSON.stringify(errors));
  assert.equal(runs.length, readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json')).length, 'a recorded run was dropped from the history');

  const s = metricSeries(runs, { metric: 'passRate' });
  const outage = s.points.find((p) => p.file === 'baseline-20260830-200846.json');
  assert.ok(outage, 'the total-outage run is missing from the series entirely');
  assert.equal(outage.available, false, 'the run where all 168 jobs died still reports a pass rate');
  assert.equal(outage.value, null);
  assert.ok(s.measured > 0 && s.gaps > 0, `measured=${s.measured} gaps=${s.gaps}`);
});
