/**
 * WHETHER A FAILED STUDIO OP MAY BE TRIED AGAIN.
 *
 * Before this module, `OpResult` carried `{id, ok, data, error, durationMs}` and nothing else, so
 * the only thing separating "that path does not exist" from "Studio never answered" was an English
 * sentence. Anything deciding whether to retry had to read prose — an assertion on a spelling
 * rather than on a property, which is the failure mode this repo keeps a whole document about.
 *
 * THE CASE THAT MAKES THIS MORE THAN A LOOKUP TABLE. do/session.ts states that delivery to the
 * plugin is AT-MOST-ONCE: a plugin can apply a batch and die before reporting, and there is no
 * op-id idempotency cache to make redelivery safe. So a timed-out READ may be repeated for free
 * and a timed-out WRITE may not be repeated at all. A classifier that answered from the failure
 * kind alone would build the user's door twice.
 *
 * Run with:  node --test tests/op-failure.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const out = join(mkdtempSync(join(tmpdir(), 'opfail-')), 'op-failure.mjs');
execFileSync(join(HERE, '..', 'node_modules', '.bin', 'esbuild'),
  [join(HERE, '..', 'src', 'op-failure.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { retryEligibility, retryHint, mutates, MUTATING_OPS, asFailureKind, WORKER_FAILURES } = await import(out);

const fail = (failure) => ({ ok: false, failure });

// --------------------------------------------------------------- the distinction that matters

test('A TIMED-OUT MUTATION IS NOT RETRYABLE — it may already have been applied', () => {
  // Delivery is at-most-once with no op-id idempotency; retrying is how you get two doors.
  const v = retryEligibility({ op: 'create_instances' }, fail('timeout'));
  assert.equal(v.retryable, false);
  assert.match(v.reason, /already have been applied|twice/i);
});

test('a timed-out READ is retryable — repeating it changes nothing', () => {
  const v = retryEligibility({ op: 'get_tree' }, fail('timeout'));
  assert.equal(v.retryable, true, 'refusing to re-read would be the opposite bug');
});

test('the mutation/read split is the SAME failure kind answered two ways', () => {
  // If this ever collapses to one answer, one of the two halves above is a lie.
  const write = retryEligibility({ op: 'delete_instances' }, fail('timeout'));
  const read = retryEligibility({ op: 'read_script' }, fail('timeout'));
  assert.equal(write.kind, read.kind, 'same kind');
  assert.notEqual(write.retryable, read.retryable, 'different verdict');
});

// --------------------------------------------------------------- the rest of the table

test('a transport failure is retryable for a mutation too, because it provably never ran', () => {
  // "Studio is not connected" and "the run this change belonged to has ended" are both refusals
  // made BEFORE anything was delivered. Treating them like a timeout would strand real work.
  const v = retryEligibility({ op: 'create_instances' }, fail('transport'));
  assert.equal(v.retryable, true);
  assert.match(v.reason, /never reached Studio/i);
});

test('deterministic failures are not retryable — the same request gets the same answer', () => {
  for (const kind of ['not_found', 'conflict', 'refused', 'invalid', 'internal']) {
    const v = retryEligibility({ op: 'get_tree' }, fail(kind));
    assert.equal(v.retryable, false, `${kind} must not invite a retry`);
    assert.equal(v.kind, kind);
  }
});

// --------------------------------------------------------------- the default

test('AN UNCLASSIFIED FAILURE IS NOT RETRYABLE, and says so', () => {
  // A plugin too old to send a kind, or a kind from a build one version ahead. Optimism here
  // re-runs a mutation against somebody's place on a guess.
  for (const raw of [undefined, null, '', 'kaboom', 42, {}]) {
    const v = retryEligibility({ op: 'create_instances' }, { ok: false, failure: raw });
    assert.equal(v.retryable, false, `${JSON.stringify(raw)} must not be read as retryable`);
    assert.equal(v.kind, null, 'and it must not be reported as a kind we recognise');
    assert.match(v.reason, /not classified|unknown/i);
  }
});

test('asFailureKind admits only kinds this build knows', () => {
  assert.equal(asFailureKind('timeout'), 'timeout');
  assert.equal(asFailureKind('TIMEOUT'), null, 'the wire value is exact, not case-folded');
  assert.equal(asFailureKind('retryable'), null);
});

test('a SUCCESS is not a retry candidate, and does not fall into the unknown branch by accident', () => {
  const v = retryEligibility({ op: 'create_instances' }, { ok: true });
  assert.equal(v.retryable, false);
  assert.equal(v.kind, null);
  assert.match(v.reason, /succeeded/);
  assert.equal(retryHint({ op: 'create_instances' }, { ok: true }), null, 'nothing to tell the agent');
});

test('the hint the agent reads states the verdict rather than implying it', () => {
  assert.match(retryHint({ op: 'get_tree' }, fail('transport')), /^This can be retried:/);
  assert.match(retryHint({ op: 'create_instances' }, fail('timeout')), /^Do not retry this as-is:/);
});

// --------------------------------------------------------------- the two lists that must agree

test('the worker MUTATING set matches the plugin table that opens undo recordings', () => {
  // Two copies of one fact. The plugin's MUTATING table decides whether a ChangeHistory recording
  // is opened; this module's copy decides whether a timed-out op may be repeated. If they drift,
  // an op the plugin considers a mutation is one this module will happily re-send.
  const luau = readFileSync(join(ROOT, 'apps/plugin/src/Ops.luau'), 'utf8');
  const start = luau.indexOf('local MUTATING = {');
  assert.ok(start > 0, 'the plugin still has a MUTATING table — if it moved, re-aim this test');
  const table = luau.slice(start, luau.indexOf('\n}', start));
  const pluginSet = new Set([...table.matchAll(/(\w+)\s*=\s*true/g)].map((m) => m[1]));
  assert.ok(pluginSet.size >= 15, `parsed ${pluginSet.size} mutating ops from the plugin — parser check`);
  const here = new Set(MUTATING_OPS);
  assert.deepEqual([...pluginSet].filter((o) => !here.has(o)).sort(), [], 'the plugin mutates ops this module does not know about');
  assert.deepEqual([...here].filter((o) => !pluginSet.has(o)).sort(), [], 'this module believes ops mutate that the plugin does not record');
});

test('mutates() reads the op kind from every shape a caller has', () => {
  assert.equal(mutates('edit_script'), true);
  assert.equal(mutates({ op: 'edit_script', path: 'game.X' }), true);
  assert.equal(mutates({ op: 'get_tree' }), false);
  assert.equal(mutates(null), false);
  assert.equal(mutates(undefined), false);
  assert.equal(mutates({}), false);
});

test("every failure the worker itself produces has a declared kind, and none of them is 'internal'", () => {
  // The worker's own refusals are the ones it can name exactly. Leaving them unclassified would
  // put the product's most common failures into the "do not retry, we do not know" bucket.
  const kinds = Object.values(WORKER_FAILURES);
  assert.ok(kinds.length >= 4);
  for (const k of kinds) assert.ok(asFailureKind(k), `${k} must be a real kind`);
  assert.equal(kinds.includes('internal'), false);
  assert.equal(WORKER_FAILURES.notConnected, 'transport');
  assert.equal(WORKER_FAILURES.timeout, 'timeout');
});
