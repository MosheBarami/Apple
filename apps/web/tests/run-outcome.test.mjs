/**
 * The line a user reads when a run ends badly.
 *
 * `turn.tsx` rendered `{item.error ? item.error : outcome.text}` — the worker's own `error` field,
 * verbatim, in the largest thing on the screen at that moment. The four values that field could
 * hold were 'run interrupted', 'rate_limited', and twice the upstream provider's raw message. So
 * the product's careful failure vocabulary was in place everywhere except the surface people
 * actually meet failures on.
 *
 * It was also INCONSISTENT ACROSS A RELOAD, which is the part nobody would have reported as a bug:
 * `error` arrives on the `msg_end` frame and is never persisted, so the same failed turn read one
 * way live and another way after refreshing.
 *
 * The rule here: the worker sends a code from a closed set, and this side owns the sentence. An
 * unrecognised code produces the generic sentence — never the code itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'outcome-')), 'o.mjs');
execFileSync(
  join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [
    join(WEB, 'src', 'components', 'ws', 'outcome-model.ts'),
    '--bundle',
    '--format=esm',
    '--platform=neutral',
    '--main-fields=main,module',
    '--outfile=' + out,
  ],
  { stdio: 'pipe' },
);
const O = await import(out);

const SHARED = readFileSync(join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
const TURN = readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8');

/** The codes the worker can actually send, read out of the shared declaration. */
const block = SHARED.slice(SHARED.indexOf('export const RUN_FAILURES'));
const CODES = [...block.slice(0, block.indexOf('};')).matchAll(/\n\s{2}([a-z_]+):/g)].map((m) => m[1]);

test('the worker declares at least the four failures it can actually reach', () => {
  assert.ok(CODES.length >= 4, `expected the run-failure vocabulary, found ${JSON.stringify(CODES)}`);
  for (const code of ['busy', 'interrupted', 'dropped_step', 'model_failed']) {
    assert.ok(CODES.includes(code), `the vocabulary has no '${code}'`);
  }
});

test('every code the worker can send has a sentence on this side', () => {
  for (const code of CODES) {
    const line = O.outcomeLine('error', code);
    assert.ok(line, `no outcome for '${code}'`);
    assert.ok(line.text.length > 20, `'${code}' has no real sentence: ${line.text}`);
    // A sentence, not the identifier. `busy` is also an English word, so the check is that the
    // machine-shaped form of the code never appears — not that the letters do not.
    assert.notEqual(line.text.trim(), code);
    assert.equal(line.text.includes('_'), false, `'${code}' leaks an identifier into the sentence`);
    assert.match(line.text, /\.$/, `'${code}' is not a finished sentence`);
    assert.equal(line.tone, 'bad');
  }
});

test('an unrecognised code is never rendered — it degrades to the generic sentence', () => {
  // The exact shape of the regression: a worker deployed ahead of the app sends a code this build
  // has never heard of, and the old renderer would have printed it.
  for (const junk of ['ECONNRESET', 'inference failed: 503 upstream', 'model_exploded', '']) {
    const line = O.outcomeLine('error', junk);
    assert.equal(line.text.includes(junk) && junk !== '', false, `'${junk}' reached the screen verbatim`);
    assert.ok(line.text.length > 20);
  }
});

test('a run that did not fail keeps its own copy', () => {
  assert.equal(O.outcomeLine('done', undefined), null, 'a finished run has no outcome line');
  assert.equal(O.outcomeLine('quota', undefined).tone, 'note', 'running out is not a failure');
  assert.match(O.outcomeLine('stopped', undefined).text, /Stopped/);
  // Not "without changing anything": an incomplete run can have changed things (2026-09-23).
  assert.match(O.outcomeLine('incomplete', undefined).text, /stopped before it finished/);
  assert.doesNotMatch(O.outcomeLine('incomplete', undefined).text, /without changing anything/);
  // A code on a non-error stop must not override the stop's own meaning.
  assert.equal(O.outcomeLine('quota', 'model_failed').tone, 'note');
});

test('turn.tsx renders through the model and never prints item.error raw', () => {
  assert.match(TURN, /outcomeLine\(/, 'turn.tsx does not use the outcome model');
  assert.equal(
    /\{item\.error \? item\.error :/.test(TURN),
    false,
    "turn.tsx still renders the worker's error field verbatim",
  );
});
