// The Roblox frontier card, per product lane: Apple MAX and Apple each get their own figure, a run
// judged by older benchmark files is never pooled with a current one, and the owner's targets are
// decided only on a measured, current figure. No model call; every run here is a fixture.
//   node --test scripts/owner-dashboard/cc/frontier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const { summarizeFrontier, frontierOf } = await import('../frontier.mjs');

const CURRENT = { harness: 'h-now', scorer: 's-now', tasks: 't-now' };
const OLD = { harness: 'h-now', scorer: 's-now', tasks: 't-old' };
const SYSTEM = 'production rules, verbatim';
const GLM = '@cf/zai-org/glm-5.3-flash';

// One run file as roblox-frontier-bench.mjs writes it, reduced to the fields the card reads.
function run(file, { lane, arm = 'house-rules-plus', mode = 'agent', passed, measured, at, judge = CURRENT, gateway = 'agent', system = SYSTEM, replicate, items = 16 }) {
  return {
    file,
    data: {
      measuredAt: at, settings: { lane, productMode: mode, gateway, modelId: GLM, requestedTokens: 8800, effectiveTokens: 6500 },
      replicate, sentMaxTokens: replicate > 1 ? 6500 - (replicate - 1) : 8800, arm: { id: arm, what: 'x', system }, provenance: { ...judge, controls: 'c', settingsMirror: 'm' },
      items, measured, passed, pct: Math.round((passed / measured) * 1000) / 10,
      byAxis: { 'modern-api': { passed: Math.min(passed, 5), measured: Math.min(measured, 5) } },
    },
  };
}

test('a one-item tagged run never inflates a full-suite frontier headline', () => {
  const full = run('roblox-frontier-apple-max-agent-house-rules-plus-full.json', {
    lane: 'apple-max', passed: 14, measured: 16, at: '2026-09-25T00:00:00Z', replicate: 11,
  });
  const single = run('roblox-frontier-apple-max-agent-house-rules-plus-library-ui.json', {
    lane: 'apple-max', passed: 1, measured: 1, items: 1, at: '2026-09-25T00:01:00Z', replicate: 10,
  });
  const result = summarizeFrontier([full, single], CURRENT);
  const headline = result.lanes.find((lane) => lane.lane === 'apple-max').headlines[0];
  assert.deepEqual([headline.passed, headline.measured, headline.runs.length], [14, 16, 1]);
});
const lane = (f, id) => f.lanes.find((l) => l.lane === id);

// Two lanes, the way the repository holds them on 2026-09-24: Apple MAX re-run under the current
// tasks file, Apple's runs judged by the older one, plus a one-item probe and a run that measured
// nothing, which are not benchmark runs.
const TWO_LANES = [
  run('roblox-frontier-apple-max-agent-house-rules-plus-lanes-rep4.json', { lane: 'apple-max', passed: 12, measured: 15, at: '2026-09-24T00:05:17Z', replicate: 4 }),
  run('roblox-frontier-apple-max-agent-house-rules-plus-lanes-rep5.json', { lane: 'apple-max', passed: 15, measured: 15, at: '2026-09-24T00:09:11Z', replicate: 5 }),
  run('roblox-frontier-apple-max-agent-house-rules-plus-lanes-rep6.json', { lane: 'apple-max', passed: 14, measured: 15, at: '2026-09-24T00:12:43Z', replicate: 6 }),
  run('roblox-frontier-apple-agent-house-rules-plus-p1.json', { lane: 'apple', passed: 13, measured: 16, at: '2026-09-20T23:44:28Z', judge: OLD, gateway: 'stone', system: 'older rules' }),
  run('roblox-frontier-apple-agent-house-rules-plus-p2.json', { lane: 'apple', passed: 15, measured: 16, at: '2026-09-20T23:50:55Z', judge: OLD, gateway: 'stone', system: 'older rules' }),
  run('roblox-frontier-apple-agent-house-rules-plus-p3.json', { lane: 'apple', passed: 14, measured: 16, at: '2026-09-20T23:57:58Z', judge: OLD, gateway: 'stone', system: 'older rules' }),
  run('roblox-frontier-apple-agent-neutral-r2.json', { lane: 'apple', arm: 'neutral', passed: 10, measured: 15, at: '2026-09-20T23:31:27Z', judge: OLD, gateway: 'stone', system: 'neutral' }),
  run('roblox-frontier-apple-agent-house-rules-plus-cacheprobe-a.json', { lane: 'apple', passed: 1, measured: 1, items: 1, at: '2026-09-21T00:35:12Z' }),
  run('roblox-frontier-apple-agent-neutral.json', { lane: 'apple', arm: 'neutral', passed: 0, measured: 0, at: '2026-09-20T12:16:20Z' }),
];

test('each lane gets its own figure, pooled over its replicates, with count, spread and newest run', () => {
  const f = summarizeFrontier(TWO_LANES, CURRENT);
  const max = lane(f, 'apple-max').headlines[0], apple = lane(f, 'apple').headlines[0];

  assert.equal(max.mode, 'agent');
  assert.equal(max.arm, 'house-rules-plus');
  assert.deepEqual([max.passed, max.measured, max.pct, max.runs.length, max.min, max.max], [41, 45, 91.1, 3, 80, 100]);
  assert.equal(max.asked, 48, 'three answers the scorer did not count are still visible as asked');
  assert.equal(max.last, Date.parse('2026-09-24T00:12:43Z'));
  assert.equal(max.current, true);

  assert.deepEqual([apple.passed, apple.measured, apple.pct, apple.runs.length, apple.min, apple.max], [42, 48, 87.5, 3, 81.3, 93.8]);
  assert.equal(apple.current, false, 'judged by an older tasks file, so it must say so');

  // The probe and the run that measured nothing are not in any figure.
  assert.equal(f.groups.reduce((n, g) => n + g.runs.length, 0), 7);
  assert.ok(!f.groups.some((g) => g.runs.some((r) => /probe|apple-agent-neutral\.json$/.test(r.file))));
  // The other arm is still reported, on its own row.
  assert.ok(f.groups.some((g) => g.lane === 'apple' && g.arm === 'neutral' && g.passed === 10));
});

test('a run judged by an older harness is never pooled with a current one', () => {
  const f = summarizeFrontier([
    run('a.json', { lane: 'apple', passed: 13, measured: 16, at: '2026-09-20T10:00:00Z', judge: OLD }),
    run('b.json', { lane: 'apple', passed: 15, measured: 16, at: '2026-09-20T11:00:00Z', judge: OLD }),
    run('c.json', { lane: 'apple', passed: 9, measured: 16, at: '2026-09-19T11:00:00Z' }),
  ], CURRENT);
  const h = lane(f, 'apple').headlines[0];
  // The current figure wins even though the old runs are newer, and it stands alone.
  assert.deepEqual([h.current, h.runs.length, h.passed, h.measured, h.pct], [true, 1, 9, 16, 56.3]);
  const old = f.groups.filter((g) => g.lane === 'apple' && !g.current);
  assert.equal(old.length, 1);
  assert.deepEqual([old[0].runs.length, old[0].passed, old[0].measured], [2, 28, 32]);
});

test('targets: Apple needs 70% or more, Apple MAX needs 100%, decided only on a current measurement', () => {
  const status = (runs) => { const f = summarizeFrontier(runs, CURRENT); return Object.fromEntries(f.lanes.map((l) => [l.lane, l.headlines[0]?.status ?? 'none'])); };
  assert.deepEqual(status(TWO_LANES), { 'apple-max': 'below', apple: 'old' });
  assert.deepEqual(status([run('a', { lane: 'apple', passed: 7, measured: 10, at: '2026-09-24T00:00:00Z' }), run('m', { lane: 'apple-max', passed: 16, measured: 16, at: '2026-09-24T00:00:00Z' })]),
    { 'apple-max': 'met', apple: 'met' });
  // 69.96% prints as 70.0 and is still below the line: the decision is on the counts, not the rounding.
  assert.equal(status([run('a', { lane: 'apple', passed: 1749, measured: 2500, at: '2026-09-24T00:00:00Z' })]).apple, 'below');
  assert.equal(status([run('m', { lane: 'apple-max', passed: 15, measured: 16, at: '2026-09-24T00:00:00Z' })])['apple-max'], 'below');
  assert.equal(summarizeFrontier(TWO_LANES, CURRENT).lanes.find((l) => l.lane === 'apple').target, 70);
});

test('two lanes that sent the same request to one model are named as one model', () => {
  const same = summarizeFrontier([
    run('m.json', { lane: 'apple-max', passed: 14, measured: 16, at: '2026-09-24T00:00:00Z', replicate: 2 }),
    run('a.json', { lane: 'apple', passed: 12, measured: 16, at: '2026-09-24T01:00:00Z', replicate: 5 }),
  ], CURRENT).same.find((s) => s.mode === 'agent');
  assert.deepEqual([same.identical, same.model, same.differs], [true, GLM, []]);
  // The bench's cache-bust shave is the one byte that differs, and it is reported, not hidden.
  assert.deepEqual(same.sent, [6496, 6499]);

  // The repository's real case: one model, but the prompt text, the gateway key and the tasks file
  // all differ, so "identical" would be false.
  const real = summarizeFrontier(TWO_LANES, CURRENT).same.find((s) => s.mode === 'agent');
  assert.equal(real.identical, false);
  assert.equal(real.model, GLM);
  assert.deepEqual(real.differs, ['gateway', 'system', 'tasks']);
});

test('no runs: each lane says it has none, and nothing is invented', () => {
  const f = summarizeFrontier([], CURRENT);
  assert.deepEqual(f.lanes.map((l) => [l.lane, l.headlines.length]), [['apple-max', 0], ['apple', 0]]);
  assert.deepEqual([f.groups.length, f.same.length], [0, 0]);
});

test('frontierOf reads the run files and picks up a re-score with nothing else to do', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-dash-'));
  const src = path.join(repo, 'packages/training/src'), runs = path.join(repo, 'packages/training/runs');
  fs.mkdirSync(src, { recursive: true }); fs.mkdirSync(runs, { recursive: true });
  const files = { harness: 'frontier-harness.luau', scorer: 'score-roblox-frontier.mjs', tasks: 'roblox-frontier-tasks.mjs' };
  for (const [k, f] of Object.entries(files)) fs.writeFileSync(path.join(src, f), `-- ${k} v2\n`);
  const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
  const now = Object.fromEntries(Object.entries(files).map(([k]) => [k, hash(`-- ${k} v2\n`)]));
  try {
    const file = path.join(runs, 'roblox-frontier-apple-agent-house-rules-plus-p1.json');
    const r = run('x', { lane: 'apple', passed: 12, measured: 16, at: '2026-09-20T23:44:28Z', judge: { ...now, tasks: 'an-older-hash' } }).data;
    fs.writeFileSync(file, JSON.stringify(r));
    let h = lane(frontierOf(repo), 'apple').headlines[0];
    assert.deepEqual([h.current, h.passed], [false, 12]);

    // What rescore-roblox-frontier.mjs does: new verdicts and every provenance hash re-taken.
    fs.writeFileSync(file, JSON.stringify({ ...r, passed: 13, pct: 81.3, provenance: { ...r.provenance, ...now }, rescoredAt: '2026-09-24T12:00:00Z' }));
    h = lane(frontierOf(repo), 'apple').headlines[0];
    assert.deepEqual([h.current, h.passed, h.pct, h.status, h.rescoredAt], [true, 13, 81.3, 'met', Date.parse('2026-09-24T12:00:00Z')]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
