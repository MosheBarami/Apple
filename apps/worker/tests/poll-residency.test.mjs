// Durable Object residency is the largest recurring cost in this system, and the plugin poll is
// what drives it. These are STATIC checks on session.ts, in the same style as the preserved-
// behaviour suite: the poll path needs a live DO to exercise, but the pacing policy is expressible
// as constants and a branch, and those are exactly what must not silently regress.
//
// THE NUMBER THAT MOTIVATES THIS. Holding every poll open for 6s and asking the plugin back after
// 1s keeps a paired SessionDO in flight ~85% of wall-clock, for as long as a project stays
// connected. At ~128 MB that is on the order of 285,000 GB-s per month for ONE always-connected
// project, against a 400,000 GB-s monthly allowance. Inference — which the entire budget system
// exists to guard — is the smaller line item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = readFileSync(join(HERE, '..', 'src', 'do', 'session.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PLUGIN = readFileSync(join(HERE, '..', '..', 'plugin', 'src', 'init.server.luau'), 'utf8')
  .replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/^\s*--.*$/gm, '');

/** Read a `const NAME = 12_345;` numeric constant out of the source. */
function constant(name) {
  const m = new RegExp(`const ${name} = ([0-9_]+);`).exec(SESSION);
  assert.ok(m, `${name} must exist`);
  return Number(m[1].replace(/_/g, ''));
}

test('the poll stops holding requests open once a project is parked', () => {
  assert.match(SESSION, /const parked = !running && idleFor > POLL_IDLE_AFTER_MS;/, 'parked must be derived from real idleness, not assumed');
  // The hold is skipped when parked OR after the access fence has stopped a run. Without the
  // second guard, a revoked run can keep a long poll open while its queue is being purged.
  const matches = [...SESSION.matchAll(/if \(([^\n]+)\)\s*\{\s*await new Promise<void>\(\(resolve\)/g)];
  assert.equal(matches.length, 1, 'identify the actual long-poll hold branch');
  const condition = matches[0][1].replace('this.opQueue.length', 'opCount');
  const assertPolicy = (expression) => {
    const holds = new Function('accessStopped', 'parked', 'opCount', `return Boolean(${expression});`);
    for (const accessStopped of [false, true]) for (const parked of [false, true]) for (const opCount of [0, 1]) {
      assert.equal(holds(accessStopped, parked, opCount), !accessStopped && !parked && opCount === 0);
    }
  };
  assertPolicy(condition);
  assert.equal(condition.split('!accessStopped').length - 1, 1);
  assert.throws(() => assertPolicy(condition.replace('!accessStopped', 'true')));
});

test('idle pacing is inside what the deployed plugin will actually honour', () => {
  const idleWait = constant('POLL_WAIT_IDLE_MS');
  // The plugin clamps whatever it is told to [0.2, 10] seconds. Issuing more is silently clamped,
  // and staleness derived from the larger number would then declare a healthy plugin dead.
  const clamp = /task\.wait\(math\.clamp\(\(data\.waitMs or \d+\) \/ 1000, ([\d.]+), ([\d.]+)\)\)/.exec(PLUGIN);
  assert.ok(clamp, 'the plugin still clamps waitMs — if this moved, re-derive the idle wait');
  const maxHonoured = Number(clamp[2]) * 1000;
  assert.ok(idleWait <= maxHonoured, `idle wait ${idleWait}ms exceeds the ${maxHonoured}ms the plugin honours`);
});

test('staleness is derived from the sleep we issued, never a fixed constant', () => {
  // A fixed 8s threshold is what made a 12s hold fail every op with "Studio is not connected".
  // Once the sleep is adaptive, the deadline has to move with it.
  assert.match(SESSION, /this\.pollDueBy = Date\.now\(\) \+ waitMs \+ POLL_STALE_GRACE_MS;/);
  assert.match(SESSION, /const deadline = this\.pollDueBy \|\| last \+ POLL_WAIT_IDLE_MS \+ POLL_STALE_GRACE_MS;/, 'after an eviction it must fall back to the widest sleep, not to a stale constant');
  assert.equal(/Date\.now\(\) - last < 8000/.test(SESSION), false, 'the old fixed 8s staleness must be gone');

  // The grace must cover the sleep, or a plugin that obeys us is declared dead for obeying us.
  assert.ok(constant('POLL_STALE_GRACE_MS') > 0);
  assert.ok(
    constant('POLL_WAIT_IDLE_MS') + constant('POLL_STALE_GRACE_MS') > constant('POLL_WAIT_IDLE_MS'),
    'grace must extend the deadline beyond the sleep itself',
  );
});

test('holding is preserved exactly where it earns its cost', () => {
  // The saving must not be bought with latency during real work: `pollWaiter` resolves the moment
  // an op is queued, and that only helps if the request is being held.
  assert.ok(constant('POLL_HOLD_ACTIVE_MS') > 0, 'a running agent still holds');
  assert.ok(constant('POLL_HOLD_WARM_MS') > 0, 'a recently active project still holds');
  assert.match(SESSION, /const holdMs = running \? POLL_HOLD_ACTIVE_MS : POLL_HOLD_WARM_MS;/);
  // Parked is minutes, not seconds — a user pausing to think must not fall out of the fast path.
  assert.ok(constant('POLL_IDLE_AFTER_MS') >= 60_000, 'parking after under a minute would punish normal pauses');
});

test('activity un-parks the connection', () => {
  // If `lastActivity` is never updated the project looks permanently idle and every op pays the
  // idle latency, which would make this change a regression rather than a saving.
  assert.match(SESSION, /this\.opQueue\.push\(op\);\s*this\.lastActivity = Date\.now\(\);/, 'queueing an op is activity');
  assert.match(SESSION, /agent\.lastStepAt = Date\.now\(\);\s*\n\s*this\.lastActivity = agent\.lastStepAt;/, 'a run step is activity');
});

test('the residency arithmetic actually improves', () => {
  // Duty cycle = time the DO is held open / total wall-clock, per poll cycle.
  const warm = constant('POLL_HOLD_WARM_MS') / (constant('POLL_HOLD_WARM_MS') + 1000);
  // Parked: no hold at all, so residency is the request's own service time. Generous estimate.
  const SERVICE_MS = 20;
  const parked = SERVICE_MS / (SERVICE_MS + constant('POLL_WAIT_IDLE_MS'));
  assert.ok(warm > 0.8, `sanity: the warm path really is ~${(warm * 100).toFixed(0)}% resident`);
  assert.ok(parked < 0.01, `parked residency must be under 1%, got ${(parked * 100).toFixed(2)}%`);
  assert.ok(warm / parked > 100, 'the parked path must be at least two orders of magnitude cheaper');
});
