import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalProblems, pairedComparison, evaluationArgs } from './train-forever.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(join(HERE, '../runs/eval-v5-on-v5set-scored.json'), 'utf8'));
const n = { trajectory: 23, gameLogic: 8, finish: 7 };

test('a paired best remains comparable when the historical base answer drifted', () => {
  const candidate = structuredClone(seed);
  const best = structuredClone(seed);
  candidate.tally.base.finish.ok = 5;
  best.tally.base.finish.ok = 5;
  candidate.tally.adapter.trajectory.ok = 19;
  assert.match(evalProblems(candidate, { n, base: seed.tally.base }).join(), /base finish/,
    'the old seed must really be incomparable');
  const comparison = pairedComparison(candidate, best, n);
  assert.deepEqual(comparison.problems, []);
  assert.equal(comparison.candidate.total, 22);
  assert.equal(comparison.best.total, 20);
});

test('a paired run is invalid if its two base verdicts disagree', () => {
  const candidate = structuredClone(seed);
  const best = structuredClone(seed);
  candidate.tally.base.finish.ok += 1;
  assert.match(pairedComparison(candidate, best, n).problems.join(), /base scores differ/);
});

test('a live generation includes the current best in the same batch', () => {
  const args = evaluationArgs({ candidate: 'adapters/apple-v20-best', best: 'adapters/apple-v5-best',
    data: 'runs/eval-set-v5.jsonl', out: 'runs/eval-v20-on-v5set.json', maxTokens: 1200 });
  assert.deepEqual(args.slice(0, 5), ['src/generate_eval.py', '--adapter', 'adapters/apple-v20-best', '--best-adapter', 'adapters/apple-v5-best']);
  assert.deepEqual(args.slice(-4), ['--out', 'runs/eval-v20-on-v5set.json', '--max-tokens', '1200']);
});
