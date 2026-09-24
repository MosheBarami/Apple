import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairedEvalReport, splitPairedRaw } from './paired-eval.mjs';

const counts = { trajectory: 23, gameLogic: 8, finish: 7 };
const track = (ok, n) => ({ ok, n, reasons: {} });
const scored = (trajectory, gameLogic, finish, baseTrajectory = 0) => ({ tally: {
  base: { trajectory: track(baseTrajectory, 23), 'game-logic': track(0, 8), finish: track(4, 7) },
  adapter: { trajectory: track(trajectory, 23), 'game-logic': track(gameLogic, 8), finish: track(finish, 7) },
} });

test('paired raw answers use one base generation and keep distinct candidate and best adapters', () => {
  const raw = { model: 'base', adapter: 'candidate', best_adapter: 'best', rows: {
    one: { base: 'base answer', adapter: 'new answer', best: 'best answer', reference: { role: 'assistant', content: 'expected' } },
  } };
  const best = splitPairedRaw(raw);
  assert.equal(best.adapter, 'best');
  assert.equal(best.rows.one.base, 'base answer');
  assert.equal(best.rows.one.adapter, 'best answer');
  assert.deepEqual(best.rows.one.reference, { role: 'assistant', content: 'expected' },
    'the held-out answer stays intact for the scorer');
  assert.equal(raw.rows.one.adapter, 'new answer', 'the candidate result is untouched');
  assert.throws(() => splitPairedRaw({ ...raw, rows: { one: { base: 'b', adapter: 'a' } } }), /best/);
});

test('the Python generator preserves the held-out answer while generating all three sides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apple-paired-eval-'));
  try {
    const data = join(dir, 'one.jsonl');
    const out = join(dir, 'out.json');
    writeFileSync(data, JSON.stringify({ meta: { id: 'one', kind: 'game-logic' }, messages: [
      { role: 'user', content: 'Question' }, { role: 'assistant', content: 'Expected answer' },
    ] }) + '\n');
    const fakeMlx = String.raw`
import sys, types, runpy
mlx = types.ModuleType('mlx_lm')
class Tok:
    def apply_chat_template(self, messages, tokenize=False, add_generation_prompt=True):
        return 'one prompt'
mlx.load = lambda name, adapter_path=None: (adapter_path or 'base', Tok())
mlx.generate = lambda model, tokenizer, prompt, max_tokens, sampler, verbose: model + ' answer'
sample = types.ModuleType('mlx_lm.sample_utils')
sample.make_sampler = lambda temp: None
sys.modules['mlx_lm'] = mlx
sys.modules['mlx_lm.sample_utils'] = sample
sys.argv = ['src/generate_eval.py', '--adapter', 'candidate', '--best-adapter', 'best',
            '--data', sys.argv[1], '--out', sys.argv[2]]
runpy.run_path('src/generate_eval.py', run_name='__main__')`;
    execFileSync('python3', ['-c', fakeMlx, data, out], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'pipe',
    });
    const row = JSON.parse(readFileSync(out, 'utf8')).rows.one;
    assert.deepEqual(row.reference, { role: 'assistant', content: 'Expected answer' });
    assert.equal(row.base, 'base answer');
    assert.equal(row.adapter, 'candidate answer');
    assert.equal(row.best, 'best answer');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a paired score compares the same 38 rows and reports the real per-track delta', () => {
  const report = pairedEvalReport(scored(17, 2, 3), scored(17, 0, 3), counts);
  assert.equal(report.valid, true);
  assert.deepEqual(report.candidate, { trajectory: 17, gameLogic: 2, finish: 3, total: 22 });
  assert.deepEqual(report.best, { trajectory: 17, gameLogic: 0, finish: 3, total: 20 });
  assert.equal(report.delta, 2);
});

test('a changed base, missing row or unavailable harness invalidates a paired score', () => {
  assert.match(pairedEvalReport(scored(17, 0, 3, 1), scored(17, 0, 3), counts).problems.join(), /base/);
  const missing = scored(17, 0, 3);
  missing.tally.adapter.trajectory.n = 22;
  assert.match(pairedEvalReport(missing, scored(17, 0, 3), counts).problems.join(), /trajectory n/);
  const unavailable = scored(17, 0, 3);
  unavailable.tally.adapter['game-logic'].reasons['harness_unavailable:luau_not_found'] = 8;
  assert.match(pairedEvalReport(unavailable, scored(17, 0, 3), counts).problems.join(), /harness_unavailable/);
});
