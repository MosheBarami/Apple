// The training configs say what the backlog claims they say.
//
// WHY THIS EXISTS, AND WHAT IT DELIBERATELY DOES NOT PROVE.
//
// Fifteen rows in docs/backlog/FEATURES.json describe the training work and cite run logs,
// adapters and config files. Those are RECORDS: a run happened, its artefacts are tracked, and
// nothing re-runs it. Re-proving "validation loss fell from 2.812 to 1.294" means re-training on
// an M2 Pro, which no CI here can do, and no test should pretend otherwise.
//
// But a subset of those rows do not claim a RESULT. They claim a DECISION, and the decision is
// recorded in a YAML field:
//
//   "Seed pinning"             claims the seed is pinned.
//   "Gradient accumulation"    claims accumulation is configured.
//   "Rank selection"           claims rank moved 8 -> 16 and that it was a choice.
//   "Learning-rate selection"  claims 1e-4 -> 5e-5.
//   "Batch-size selection"     claims 4 -> 2 with accumulation covering it.
//   "Early stopping"           claims v1 ran too long and v2 stops earlier.
//   "Mixed precision"          claims a 4-bit quantised base.
//
// Every one of those is a property of a file in this repository, so every one is testable, and
// "the config says so" is exactly as strong as the claim. These assertions redden the moment
// someone edits a config without updating the row — which is the realistic regression, and the
// one the prose citations could not catch.
//
// WHAT THIS IS NOT: evidence that the training run produced a good model. v1 was a REGRESSION and
// was not promoted. A green suite here says the recorded decisions are still the configured ones,
// nothing more.
//
// THE RELATIONSHIPS ARE ASSERTED, NOT THE LITERALS ALONE. Checking `learning_rate == 5.0e-5` in
// isolation would pass just as happily if v1 had also been 5e-5, and the row's claim is that the
// rate was HALVED in response to a measured overshoot. So the comparison between versions is the
// assertion, and the absolute value is a second, weaker one beside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A deliberately small YAML reader.
 *
 * These files are flat scalars plus one nested `lora_parameters` block, so a dependency is not
 * worth it. Comments are stripped FIRST and a `#` is only a comment when it follows whitespace or
 * starts the line — `1.0e-4  # half of v1` is a comment, and a `#` inside a quoted model id is not.
 */
function readConfig(name) {
  const text = readFileSync(join(ROOT, name), 'utf8');
  const out = {};
  for (const raw of text.split('\n')) {
    const line = raw.replace(/(^|\s)#.*$/, '').trimEnd();
    if (!line.trim()) continue;
    const m = /^(\s*)([A-Za-z_][\w]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, , key, value] = m;
    if (value === '') continue; // a block header; its children are flattened into the same object
    let v = value.trim().replace(/^["']|["']$/g, '');
    if (/^-?\d+$/.test(v)) v = Number(v);
    else if (/^-?\d*\.?\d+e-?\d+$/i.test(v)) v = Number(v);
    else if (v === 'true') v = true;
    else if (v === 'false') v = false;
    out[key] = v;
  }
  return out;
}

const v1 = readConfig('lora-apple-v1.yaml');
const v2 = readConfig('lora-apple-v2.yaml');
const v3 = readConfig('lora-apple-v3.yaml');
const ALL = { v1, v2, v3 };

/* ------------------------------------------------------- the reader is not lying to us --- */

test('the parser actually read the files — nothing below is asserted against an empty object', () => {
  // The control. Every assertion in this file reads a field, and a parser returning {} would make
  // `config.seed === undefined` compare falsely against a number and fail LOUDLY — but a parser
  // returning a partial object could silently skip the nested lora block, which is where `rank`
  // lives. So the shape is asserted first.
  for (const [name, c] of Object.entries(ALL)) {
    assert.ok(Object.keys(c).length > 8, `${name} parsed only ${Object.keys(c).length} keys`);
    assert.equal(typeof c.model, 'string', `${name}: model must be a string`);
    assert.equal(typeof c.iters, 'number', `${name}: iters must be a number`);
    assert.equal(typeof c.rank, 'number', `${name}: rank comes from the NESTED lora block`);
  }
});

test('a comment is not read as a value, and a quoted string keeps its content', () => {
  // `learning_rate: 5.0e-5        # half of v1` must parse as the number, not the sentence.
  assert.equal(v2.learning_rate, 5.0e-5);
  assert.ok(v2.model.includes('Qwen3-4B'), 'the quoted model id survives unquoting');
  assert.equal(v2.grad_checkpoint, true, 'an unquoted boolean is a boolean');
});

/* ---------------------------------------------------------------- f-5d928b26 Seed pinning --- */

test('SEED PINNING: every config pins the same seed', () => {
  for (const [name, c] of Object.entries(ALL)) {
    assert.equal(c.seed, 20260914, `${name} must pin the seed`);
  }
});

/* ------------------------------------------------------------- f-39fae47b Rank selection --- */

test('RANK SELECTION: v2 doubled v1 rank, which is the decision the row records', () => {
  assert.equal(v1.rank, 8);
  assert.equal(v2.rank, 16);
  assert.ok(v2.rank > v1.rank, 'the claim is that rank was RAISED, not merely that it is 16');
});

test('v3 drops back to rank 8 because its base is a different model family', () => {
  // Not a reversal of the v2 decision. v3 targets Llama rather than Qwen, and the rank choice is
  // scoped to the base. Asserted so a reader does not read v3 as undoing v2.
  assert.equal(v3.rank, 8);
  assert.ok(v3.model.toLowerCase().includes('llama'));
  assert.ok(v2.model.toLowerCase().includes('qwen'));
});

/* --------------------------------------------------- f-2ba93ab1 Learning-rate selection --- */

test('LEARNING RATE: v2 halved v1, which is the relationship the row claims', () => {
  assert.equal(v1.learning_rate, 1.0e-4);
  assert.equal(v2.learning_rate, 5.0e-5);
  assert.ok(
    Math.abs(v2.learning_rate * 2 - v1.learning_rate) < 1e-12,
    'v2 must be exactly half of v1; "lower" is not the recorded decision',
  );
});

/* ------------------------------- f-c181aff5 Batch size + f-c8866926 Gradient accumulation --- */

test('BATCH SIZE: v2 halved the batch, and accumulation keeps the EFFECTIVE batch unchanged', () => {
  // This is the assertion the row's prose actually makes — "bs4 -> bs2 + accum" — and it is the
  // one worth having, because halving the batch WITHOUT accumulation would be a different
  // experiment wearing the same numbers.
  assert.equal(v1.batch_size, 4);
  assert.equal(v2.batch_size, 2);
  assert.equal(v2.grad_accumulation_steps, 2);
  assert.equal(
    v2.batch_size * v2.grad_accumulation_steps,
    v1.batch_size,
    'effective batch must match v1, or the comparison between runs is not like-for-like',
  );
});

test('v1 configured no accumulation, so the v2 change is a change', () => {
  assert.equal(v1.grad_accumulation_steps, undefined);
});

test('MEMORY: v2 turns on gradient checkpointing, which is why the batch could be halved safely', () => {
  assert.equal(v2.grad_checkpoint, true);
  assert.equal(v1.grad_checkpoint, undefined, 'v1 ran without it and died to the Metal watchdog');
});

/* ------------------------------------------------------------ f-eacc0229 Early stopping --- */

test('EARLY STOPPING: v2 runs fewer than half v1 iterations', () => {
  assert.equal(v1.iters, 250);
  assert.equal(v2.iters, 120);
  assert.ok(v2.iters < v1.iters / 2, 'the row claims v1 was far too long for 327 examples');
});

test('and v2 samples validation often enough to SEE the turn it stops at', () => {
  // The row's reason is that v1's validation loss bottomed at iter 50 and rose afterwards. A
  // shorter run that still sampled validation three times would not have caught it, so the
  // sampling interval is part of the decision rather than incidental.
  assert.equal(v2.steps_per_eval, 20);
  assert.ok(
    v2.iters / v2.steps_per_eval >= 6,
    'validation must be sampled at least 6 times across the run',
  );
});

/* ----------------------------------------------------------- f-3f4e2c08 Mixed precision --- */

test('MIXED PRECISION: the v1/v2 base is a 4-bit quantised checkpoint', () => {
  for (const [name, c] of [['v1', v1], ['v2', v2]]) {
    assert.match(c.model, /4bit/, `${name} must train against a 4-bit base`);
  }
});

/* ------------------------------------------------------------------- shared invariants --- */

test('every config trains LoRA adapters rather than full weights', () => {
  for (const [name, c] of Object.entries(ALL)) {
    assert.equal(c.fine_tune_type, 'lora', `${name} must be a LoRA run`);
    assert.equal(c.num_layers, 16, `${name}: layer count is held constant across versions`);
  }
});

test('no config asks for more sequence length than the corpus was rendered at', () => {
  // A silent mismatch here truncates training examples rather than erroring, which is the
  // observation-failure shape: shorter examples, same loss curve, no message.
  for (const [name, c] of Object.entries(ALL)) {
    if (c.max_seq_length === undefined) continue;
    assert.ok(c.max_seq_length <= 4096, `${name}: ${c.max_seq_length} is beyond the rendered length`);
  }
});
