/**
 * THE CLASSIFICATION REACHES THE MODEL, or it protects nobody.
 *
 * op-failure.ts encodes the one rule that stops the agent building a door twice: a timed-out
 * MUTATION must not be retried, because delivery to the plugin is at-most-once and the change may
 * already have been applied. op-failure.test.mjs proves the classifier is right.
 *
 * It proved nothing about whether anything CONSULTS it. `retryHint` and `retryEligibility` had one
 * caller between them — that test file — and the `op` helper in tools.ts reduced every failed
 * Studio op to `{ error: res.error }`, throwing `result.failure` away at the last step before the
 * model. So the model read "the operation timed out" and did the obvious thing, which is the exact
 * thing the module exists to prevent. A classifier nothing reads is the most expensive kind of dead
 * code, because it reads like protection in every review it survives.
 *
 * These drive the REAL tools through a stubbed `execStudioOp`, so what is asserted is what the
 * model would actually be handed.
 *
 * Run with:  node --test tests/tools-retry-hint.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'retryhint-')), 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

/** A ctx whose Studio always fails the same way. */
function failing(failure, error = 'the operation did not complete') {
  return { env: {}, studioConnected: () => true, addMemoryFact: async () => {},
    execStudioOp: async () => ({ ok: false, error, failure }) };
}

// ------------------------------------------------------------------ the case the module exists for

test('A TIMED-OUT MUTATION TELLS THE MODEL NOT TO REPEAT IT', async () => {
  // create_instances is the canonical duplicate: re-issued after a timeout it builds the thing
  // twice, and the timeout is precisely the state in which nobody knows whether it applied.
  const res = await T.TOOLS.create_instances.run(failing('timeout'), {
    items: [{ class: 'Part', parent: 'game.Workspace', name: 'Door' }],
  });
  assert.ok(res.error, 'the error itself must still be there');
  assert.ok(typeof res.retry === 'string' && res.retry.length > 0, 'the classification never reached the model');
  assert.match(res.retry, /do not retry/i);
  assert.match(res.retry, /already have been applied|twice/i, 'it must say WHY, or it is just a scold');
});

test('a timed-out READ is told it may be repeated — the opposite bug is just as real', async () => {
  // Refusing to re-read after a timeout would strand the agent with no way to recover a tree it
  // never got, so the hint has to carry both verdicts and not just the prohibition.
  const res = await T.TOOLS.get_project_tree.run(failing('timeout'), {});
  assert.ok(res.error);
  assert.match(res.retry, /can be retried/i);
});

test('a transport failure is retryable even for a mutation, because it provably never ran', async () => {
  // "Studio is not connected" and "the run that owned this op ended" are both refusals BEFORE
  // delivery. Treating them like a timeout would make the agent give up on work nothing did.
  const res = await T.TOOLS.create_instances.run(failing('transport'), {
    items: [{ class: 'Part', parent: 'game.Workspace', name: 'Door' }],
  });
  assert.match(res.retry, /can be retried/i);
  assert.match(res.retry, /never reached Studio/i);
});

// ------------------------------------------------------------------ what must NOT be claimed

test('AN UNCLASSIFIED FAILURE IS NOT CALLED RETRYABLE', async () => {
  // A plugin build older than the `failure` field sends none. Guessing "retryable" here re-runs a
  // mutation against somebody's place on the strength of nothing.
  const res = await T.TOOLS.create_instances.run(failing(undefined), {
    items: [{ class: 'Part', parent: 'game.Workspace', name: 'Door' }],
  });
  assert.match(res.retry, /do not retry/i);
  assert.match(res.retry, /not classified|unknown/i, 'and it must admit that is why');
});

test('a SUCCESSFUL op carries no retry advice at all', async () => {
  // A hint on a success would be noise in every transcript, and `retry` present on a good result
  // is exactly the kind of field a later reader mistakes for a warning.
  const ok = { env: {}, studioConnected: () => true, addMemoryFact: async () => {},
    execStudioOp: async () => ({ ok: true, data: { created: 1 } }) };
  const res = await T.TOOLS.create_instances.run(ok, {
    items: [{ class: 'Part', parent: 'game.Workspace', name: 'Door' }],
  });
  assert.equal(res.retry, undefined);
  assert.equal(res.error, undefined);
});

test('the hint never renders a hole', async () => {
  // Every field here comes off the wire from the plugin and any of them can be junk.
  for (const failure of [null, 42, 'not_a_kind', '', 'timeout', 'internal', 'refused']) {
    const res = await T.TOOLS.delete_instances.run(failing(failure), { paths: ['game.Workspace.Door'] });
    const s = String(res.retry);
    for (const bad of ['undefined', 'NaN', 'null', '[object']) {
      assert.equal(s.includes(bad), false, `failure=${JSON.stringify(failure)} rendered "${bad}": ${s}`);
    }
  }
});
