// The MLX -> PEFT adapter conversion, exercised end to end.
//
// This is the seam between where Apple TRAINS (MLX, locally, because that is what runs on an M2
// Pro) and where it could SERVE (Workers AI, which takes a custom adapter as adapter_config.json
// plus adapter_model.safetensors in PEFT's layout). The two formats disagree in three ways and
// every disagreement is silent: a wrong key is ignored, and a wrongly-oriented matrix still
// multiplies. A model that loads and is quietly wrong is the worst outcome available here.
//
// The converter proves itself arithmetically — it reconstructs delta-W under both conventions and
// compares. These tests check that the proof actually runs, that it REFUSES bad input, and that
// the output matches what Cloudflare documents.
//
// Skips rather than fails when the local Python environment is absent, because CI has no venv
// (it is gitignored, and building one would put a paid-provider-free workflow on a package index).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const PY = join(PKG, '.venv', 'bin', 'python');
const SCRIPT = join(HERE, 'mlx_to_peft.py');

const ready = existsSync(PY) && existsSync(SCRIPT) && (() => {
  try {
    execFileSync(PY, ['-c', 'import numpy, safetensors'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();
const opts = ready ? {} : { skip: 'local Python env with numpy+safetensors not present' };

/** Build a synthetic MLX adapter with known values, so the arithmetic is checkable by hand. */
function makeAdapter(dir, { rank = 8, scale = 20.0, inF = 32, outF = 16 } = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'adapter_config.json'), JSON.stringify({
    fine_tune_type: 'lora',
    lora_parameters: { rank, scale, dropout: 0.05, keys: ['self_attn.q_proj'] },
  }));
  execFileSync(PY, ['-c', `
import numpy as np, sys
from safetensors.numpy import save_file
rng = np.random.default_rng(7)
a = rng.normal(size=(${inF}, ${rank})).astype(np.float32)   # MLX lora_a: [in, rank]
b = rng.normal(size=(${rank}, ${outF})).astype(np.float32)  # MLX lora_b: [rank, out]
save_file({'model.layers.0.self_attn.q_proj.lora_a': a,
           'model.layers.0.self_attn.q_proj.lora_b': b}, ${JSON.stringify(join(dir, 'adapters.safetensors'))})
`], { stdio: 'pipe' });
}

function convert(src, dst, base = 'meta-llama/Llama-3.2-3B-Instruct') {
  return execFileSync(PY, [SCRIPT, src, dst, '--base', base], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

test('conversion emits PEFT keys, transposed, and proves delta-W equivalence', opts, () => {
  const tmp = mkdtempSync(join(tmpdir(), 'apple-peft-'));
  try {
    const src = join(tmp, 'mlx'), dst = join(tmp, 'peft');
    makeAdapter(src, { rank: 8, inF: 32, outF: 16 });
    const out = convert(src, dst);

    // The arithmetic proof must actually have run. Without this the test passes on a converter
    // that emits files and checks nothing.
    assert.match(out, /verified delta-W equivalence on 1 projection/);

    const cfg = JSON.parse(readFileSync(join(dst, 'adapter_config.json'), 'utf8'));
    assert.equal(cfg.peft_type, 'LORA');
    assert.equal(cfg.task_type, 'CAUSAL_LM');
    assert.equal(cfg.r, 8);
    // mlx-lm applies `scale` directly; PEFT applies lora_alpha / r. Preserving behaviour means
    // alpha = scale * r, and getting this wrong changes the adapter's strength silently.
    assert.equal(cfg.lora_alpha, 160);
    assert.deepEqual(cfg.target_modules, ['q_proj']);
    assert.equal(cfg.bias, 'none');
    assert.equal(cfg.fan_in_fan_out, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('the emitted tensors are named and shaped the way PEFT loads them', opts, () => {
  const tmp = mkdtempSync(join(tmpdir(), 'apple-peft-'));
  try {
    const src = join(tmp, 'mlx'), dst = join(tmp, 'peft');
    makeAdapter(src, { rank: 8, inF: 32, outF: 16 });
    convert(src, dst);
    const shapes = JSON.parse(execFileSync(PY, ['-c', `
import json
from safetensors import safe_open
with safe_open(${JSON.stringify(join(dst, 'adapter_model.safetensors'))}, framework='numpy') as h:
    print(json.dumps({k: list(h.get_slice(k).get_shape()) for k in h.keys()}))
`], { encoding: 'utf8', stdio: 'pipe' }));

    const A = 'base_model.model.model.layers.0.self_attn.q_proj.lora_A.weight';
    const B = 'base_model.model.model.layers.0.self_attn.q_proj.lora_B.weight';
    assert.ok(A in shapes, 'lora_A must carry the base_model.model. prefix and capital A');
    assert.ok(B in shapes, 'lora_B must carry the base_model.model. prefix and capital B');
    // Transposed relative to MLX: A is [rank, in], B is [out, rank].
    assert.deepEqual(shapes[A], [8, 32]);
    assert.deepEqual(shapes[B], [16, 8]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('an adapter over the documented rank limit is refused, not uploaded and rejected later', opts, () => {
  const tmp = mkdtempSync(join(tmpdir(), 'apple-peft-'));
  try {
    const src = join(tmp, 'mlx'), dst = join(tmp, 'peft');
    makeAdapter(src, { rank: 64, inF: 128, outF: 128 }); // Cloudflare's stated maximum is 32
    let failed = false;
    try {
      convert(src, dst);
    } catch (e) {
      failed = true;
      assert.match(String(e.stderr ?? ''), /rank 64 exceeds/);
    }
    assert.ok(failed, 'a rank over the limit must fail the conversion');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('an unrecognised key is an error rather than a silently dropped tensor', opts, () => {
  const tmp = mkdtempSync(join(tmpdir(), 'apple-peft-'));
  try {
    const src = join(tmp, 'mlx'), dst = join(tmp, 'peft');
    makeAdapter(src);
    // A tensor the converter does not understand must stop it. Dropping it would ship an adapter
    // that is missing part of what was trained, which loads fine and underperforms for no visible
    // reason.
    execFileSync(PY, ['-c', `
import numpy as np
from safetensors.numpy import load_file, save_file
p = ${JSON.stringify(join(src, 'adapters.safetensors'))}
d = load_file(p); d['model.layers.0.mlp.something_unexpected'] = np.zeros((2, 2), dtype=np.float32)
save_file(d, p)
`], { stdio: 'pipe' });
    let failed = false;
    try {
      convert(src, dst);
    } catch (e) {
      failed = true;
      assert.match(String(e.stderr ?? ''), /unrecognised MLX adapter key/);
    }
    assert.ok(failed, 'an unknown tensor must stop the conversion');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
