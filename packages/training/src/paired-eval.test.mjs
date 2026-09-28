import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
    const snapshot = join(dir, 'snapshots', 'pinned-revision');
    mkdirSync(snapshot, { recursive: true });
    writeFileSync(join(snapshot, 'config.json'), '{"model_type":"test"}');
    writeFileSync(join(snapshot, 'generation_config.json'), '{"eos_token_id":123}');
    writeFileSync(join(snapshot, 'tokenizer_config.json'), '{"chat_template":"test"}');
    for (const side of ['candidate', 'best']) {
      mkdirSync(join(dir, side));
      writeFileSync(join(dir, side, 'adapter_config.json'), '{"rank":1}');
      writeFileSync(join(dir, side, 'adapters.safetensors'), side);
    }
    writeFileSync(data, JSON.stringify({ meta: { id: 'one', kind: 'game-logic' }, messages: [
      { role: 'user', content: 'Question' }, { role: 'assistant', content: 'Expected answer' },
    ] }) + '\n');
    const fakeMlx = String.raw`
import sys, types, runpy, os, pathlib, json
root = pathlib.Path(sys.argv[1]).parent
loads = []
resolutions = []
hf = types.ModuleType('huggingface_hub')
def snapshot_download(name, local_files_only=False, allow_patterns=None):
    assert local_files_only is True, 'evaluation must not silently change the remote snapshot'
    assert allow_patterns and '*.json' in allow_patterns and 'model*.safetensors' in allow_patterns, 'a usable model-only cache must not require missing README/.gitattributes'
    resolutions.append(name)
    return str(root / 'snapshots' / 'pinned-revision')
hf.snapshot_download = snapshot_download
sys.modules['huggingface_hub'] = hf
mlx = types.ModuleType('mlx_lm')
class Tok:
    def apply_chat_template(self, messages, tokenize=False, add_generation_prompt=True):
        return 'one prompt'
def load(name, adapter_path=None):
    loads.append(name)
    return (pathlib.Path(adapter_path).name if adapter_path else 'base', Tok())
mlx.load = load
mlx.generate = lambda model, tokenizer, prompt, max_tokens, sampler, verbose: model + ' answer'
sample = types.ModuleType('mlx_lm.sample_utils')
sample.make_sampler = lambda temp: None
sys.modules['mlx_lm'] = mlx
sys.modules['mlx_lm.sample_utils'] = sample
sys.argv = ['src/generate_eval.py', '--model', 'test/base-model', '--adapter', str(root/'candidate'), '--best-adapter', str(root/'best'),
            '--data', sys.argv[1], '--out', sys.argv[2]]
try:
    runpy.run_path(os.environ.get('GENERATE_EVAL_SOURCE', 'src/generate_eval.py'), run_name='__main__')
except SystemExit as result:
    if result.code not in (None, 0): raise
(root/'loads.json').write_text(json.dumps({'loads':loads,'resolutions':resolutions}))`;
    execFileSync('python3', ['-c', fakeMlx, data, out], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'pipe',
    });
    const report = JSON.parse(readFileSync(out, 'utf8'));
    const row = report.rows.one;
    assert.deepEqual(row.reference, { role: 'assistant', content: 'Expected answer' });
    assert.equal(row.base, 'base answer');
    assert.equal(row.adapter, 'candidate answer');
    assert.equal(row.best, 'best answer');
    const observed = JSON.parse(readFileSync(join(dir, 'loads.json')));
    assert.deepEqual(observed.resolutions, ['test/base-model']);
    assert.deepEqual(observed.loads, Array(3).fill(realpathSync(snapshot)), 'all paired sides use one resolved local snapshot');
    const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(report.provenance.dataSha256, digest(data));
    assert.equal(report.provenance.modelSnapshot, 'pinned-revision');
    assert.equal(report.provenance.adapterFiles.best['adapters.safetensors'], digest(join(dir, 'best', 'adapters.safetensors')));
    assert.equal(report.provenance.modelFiles['tokenizer_config.json'], digest(join(snapshot, 'tokenizer_config.json')));
    assert.equal(report.provenance.modelFiles['generation_config.json'], digest(join(snapshot, 'generation_config.json')));
    assert.deepEqual(report.provenance.decoding, { temperature: 0, maxTokens: 600 });
    assert.equal(report.provenance.baseWeightHashesVerified, false, 'metadata must not pretend base weight bytes were hashed');
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

test('scored files retain generation identity for private publication, including the selected best side', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apple-score-provenance-'));
  try {
    const provenance = { modelSnapshot: 'pinned', adapterFiles: { adapter: { sha: 'candidate' }, best: { sha: 'best' } } };
    const raw = { model: 'base', adapter: 'candidate', best_adapter: 'best', provenance, rows: {
      finish: { kind: 'apple-tool-trajectory', reference: { role: 'assistant', content: 'Finished' }, base: 'Finished', adapter: 'Finished', best: 'Finished' },
    } };
    for (const [name, report] of [['candidate', raw], ['best', splitPairedRaw(raw)]]) {
      const input = join(dir, `${name}.json`); writeFileSync(input, JSON.stringify(report));
      execFileSync(process.execPath, [process.env.SCORE_EVAL_SOURCE ?? 'src/score-eval.mjs', input], {
        cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'pipe',
      });
      const scored = JSON.parse(readFileSync(join(dir, `${name}-scored.json`)));
      assert.equal(scored.adapter, name);
      assert.deepEqual(scored.provenance, provenance, 'uploaded scored evidence must preserve raw generation fingerprints');
      assert.deepEqual(scored.adapterIdentity, { side: name === 'best' ? 'best' : 'adapter', files: { sha: name } },
        'a standalone score must associate the selected side with its own hashes');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
