/**
 * ANALYTICS — the tests for apps/worker/src/analytics.ts.
 *
 * The module exists to keep one promise: AN UNREADABLE METRIC MUST RENDER AS UNKNOWN, NEVER AS
 * ZERO. That promise is only worth anything if the tests below actually hand it the unreadable
 * thing and watch it refuse, so every guard here is fed a real violating input — a NaN latency, a
 * negative duration, a hostile dimension name, a cohort too young to have a day-7 number — rather
 * than a healthy fixture that happens to walk past the guard without touching it.
 *
 * The aggregation functions are pure, which is what makes that possible: the violating input comes
 * from this file rather than from the tree, so nothing here depends on a Durable Object, a clock,
 * or a request having been served.
 *
 * WHAT WOULD MAKE EACH ASSERTION GO RED is stated where it is not obvious, because the failure this
 * module guards against is precisely a check that cannot fail.
 *
 * Run: node --test tests/analytics.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'analytics-')), 'analytics.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'analytics.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' },
);
const A = await import(`file://${out}`);

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5, 12, 0, 0); // a Monday noon, so day arithmetic is unambiguous

/** A model call with everything readable unless a field is overridden. */
const call = (o = {}) => ({
  kind: 'model_call',
  at: T0,
  provider: 'workers-ai',
  model: 'glm-5.3-flash',
  feature: 'agent:step',
  outcome: 'ok',
  latencyMs: 100,
  inputTokens: 1000,
  outputTokens: 100,
  cachedInputTokens: 0,
  neurons: 10,
  actorId: 'u1',
  projectId: 'p1',
  ...o,
});

/** Push raw objects through the real boundary, so the tests aggregate only what production would. */
const events = (...raws) =>
  raws.map((r) => {
    const n = A.normalizeEvent(r);
    assert.equal(n.ok, true, `fixture rejected at the boundary: ${JSON.stringify(n)}`);
    return n.event;
  });

// ---------------------------------------------------------------------------
// Metric: the shape that makes "unknown" expressible at all
// ---------------------------------------------------------------------------

test('a metric refuses every non-finite value, including the ones `??` admits', () => {
  for (const bad of [NaN, Infinity, -Infinity, null]) {
    const m = A.metric(bad, 3, 0, 'no_readable_samples');
    assert.equal(m.known, false, `${String(bad)} must not become a value`);
    assert.equal(m.value, null);
  }
  // `x ?? 0` defends undefined and null and admits all three of the above. This is the difference.
  assert.equal(NaN ?? 0, undefined ?? 0 ? NaN : NaN, 'NaN survives ??, which is why metric() exists');
});

test('a real zero is still a value — the guard must not swallow measurements', () => {
  const m = A.metric(0, 5, 0, 'no_samples');
  assert.equal(m.known, true);
  assert.equal(m.value, 0);
  assert.equal(m.complete, true);
});

test('a sum over NO samples is unknown, not zero', () => {
  const m = A.sumMetric([]);
  assert.equal(m.known, false);
  assert.equal(m.value, null);
  assert.equal(m.why, 'no_samples');
});

test('a sum over samples NONE of which are readable is unknown, and says which kind of unknown', () => {
  const m = A.sumMetric([null, NaN, undefined]);
  assert.equal(m.known, false);
  assert.equal(m.why, 'no_readable_samples', 'distinct from no_samples: something was there');
  assert.equal(m.unreadable, 3);
});

test('a partial sum is a FLOOR and is labelled as one', () => {
  const m = A.sumMetric([1, null, 2]);
  assert.equal(m.known, true);
  assert.equal(m.value, 3);
  assert.equal(m.samples, 2);
  assert.equal(m.unreadable, 1);
  assert.equal(m.complete, false, 'complete must be false whenever anything was unreadable');
});

test('quantiles order correctly and drop the unreadable sample rather than sorting it', () => {
  const values = [10, 20, NaN, 30, 40, 1000];
  const p50 = A.quantileMetric(values, 0.5);
  const p95 = A.quantileMetric(values, 0.95);
  const max = A.quantileMetric(values, 1);
  assert.equal(p50.unreadable, 1);
  assert.ok(p95.value >= p50.value, 'p95 >= p50');
  assert.ok(max.value >= p95.value, 'max >= p95');
  assert.equal(max.value, 1000);
  // NaN sorts unpredictably; had it been kept, one of these three would be NaN.
  for (const m of [p50, p95, max]) assert.equal(Number.isFinite(m.value), true);
});

test('a rate with a zero denominator is unknown, never 0%', () => {
  const m = A.rateMetric(0, 0);
  assert.equal(m.known, false);
  assert.equal(m.why, 'no_denominator');
  assert.equal(m.value, null, '0/0 rendered as 0 reads as "everything failed"');
});

// ---------------------------------------------------------------------------
// readers
// ---------------------------------------------------------------------------

test('a finite-but-absurd timestamp is refused, because Date would THROW on it', () => {
  assert.throws(() => new Date(1e18).toISOString(), RangeError, 'the hazard this guard exists for');
  assert.equal(Number.isFinite(1e18), true, 'so isFinite alone would have admitted it');
  assert.equal(A.readTimestamp(1e18), null);
  assert.equal(A.readTimestamp(8.64e15), 8.64e15, 'the documented boundary is still a time');
});

test('a count refuses a negative, a string and a NaN — all three reach these fields', () => {
  assert.equal(A.readCount(-1), null, 'a negative duration is not a duration');
  assert.equal(A.readCount('5'), null, 'a numeric string is not a number');
  assert.equal(A.readCount(NaN), null);
  assert.equal(A.readCount(0), 0, 'zero is a legitimate count');
});

test('an enum reader refuses a prototype key, not just an unknown word', () => {
  assert.equal(A.readEnum('__proto__', A.OUTCOMES), null);
  assert.equal(A.readEnum('constructor', A.OUTCOMES), null);
  assert.equal(A.readEnum('ok', A.OUTCOMES), 'ok');
});

// ---------------------------------------------------------------------------
// normalizeEvent — the trust boundary
// ---------------------------------------------------------------------------

test('an unknown event kind is refused with a reason, not coerced', () => {
  const r = A.normalizeEvent({ kind: 'drop table', at: T0 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_kind');
});

test('a prototype key as the event kind is refused', () => {
  for (const kind of ['__proto__', 'constructor', 'toString']) {
    const r = A.normalizeEvent({ kind, at: T0, route: '/x' });
    assert.equal(r.ok, false, `${kind} must not be accepted as an event kind`);
    assert.equal(r.reason, 'unknown_kind');
  }
});

test('a NaN timestamp arrives as null over JSON and is REFUSED, not re-stamped', () => {
  assert.equal(JSON.parse(JSON.stringify({ at: NaN })).at, null, 'this is how it actually arrives');
  const r = A.normalizeEvent({ kind: 'request', route: '/api/health', at: null });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unreadable_timestamp');
});

test('an ABSENT timestamp is stamped by recordEvent but still refused by the boundary itself', () => {
  A.resetEventLog();
  // Strict at the boundary: a relayed event must carry its own time.
  assert.equal(A.normalizeEvent({ kind: 'request', route: '/api/health' }).ok, false);
  // Convenient at the call site: "I did not say when" means now.
  const r = A.recordEvent({ kind: 'request', route: '/api/health' }, T0);
  assert.equal(r.ok, true);
  assert.equal(r.event.at, T0);
  // And the asymmetry stops at unreadable: a present-but-broken time is still refused.
  assert.equal(A.recordEvent({ kind: 'request', route: '/api/health', at: 'yesterday' }, T0).ok, false);
});

test('a request event with no route is refused rather than filed under an empty string', () => {
  for (const route of [undefined, '', '   ', 42]) {
    const r = A.normalizeEvent({ kind: 'request', at: T0, route });
    assert.equal(r.ok, false, `route ${JSON.stringify(route)} must not produce an event`);
    assert.equal(r.reason, 'missing_required_field');
  }
});

test('an outcome nobody stated is `unknown` — never `failed`, never `ok`', () => {
  const [e] = events(call({ outcome: 'yes' }));
  assert.equal(e.outcome, 'unknown');
  const [e2] = events(call({ outcome: undefined }));
  assert.equal(e2.outcome, 'unknown');
});

test('unreadable numeric fields survive as null all the way into the event', () => {
  const [e] = events(call({ latencyMs: -3, inputTokens: 'lots', neurons: null, outputTokens: Infinity }));
  assert.equal(e.latencyMs, null, 'a negative latency must not be recorded as -3 or as 0');
  assert.equal(e.inputTokens, null);
  assert.equal(e.neurons, null);
  assert.equal(e.outputTokens, null);
});

test('an audit record defaults to NOT allowed when the flag is unreadable', () => {
  for (const allowed of ['true', 1, undefined, null]) {
    const [e] = events({ kind: 'audit', at: T0, action: 'admin:/api/admin/spend', allowed });
    assert.equal(e.allowed, false, `${JSON.stringify(allowed)} must not be read as permission`);
  }
  const [yes] = events({ kind: 'audit', at: T0, action: 'a', allowed: true });
  assert.equal(yes.allowed, true);
});

test('a credential inside an error message is redacted before it is stored', () => {
  const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlX2hlcmU';
  const hex = 'a'.repeat(48);
  const [e] = events({
    kind: 'error',
    at: T0,
    scope: '/api/x',
    message: `auth failed for ${jwt} using ${hex}`,
  });
  assert.equal(e.message.includes(jwt), false, 'a JWT must never reach the log');
  assert.equal(e.message.includes(hex), false, 'nor a long hex secret');
  assert.match(e.message, /auth failed for \[redacted\]/);
});

// ---------------------------------------------------------------------------
// the in-isolate ring
// ---------------------------------------------------------------------------

test('the ring is bounded AND the overflow is counted — a dropped event is not a quiet event', () => {
  A.resetEventLog();
  const n = A.EVENT_RING_SIZE * 2;
  for (let i = 0; i < n; i++) A.recordEvent({ kind: 'request', route: '/api/health', at: T0 + i });
  assert.equal(A.readEvents().length, A.EVENT_RING_SIZE, 'bounded');
  const s = A.logStats();
  assert.equal(s.recorded, n);
  assert.equal(s.dropped, n - A.EVENT_RING_SIZE, 'the drop count is what makes the window auditable');
  assert.equal(A.readEvents()[0].at, T0 + A.EVENT_RING_SIZE, 'the OLDEST are the ones dropped');
});

test('rejections are counted by reason instead of vanishing', () => {
  A.resetEventLog();
  A.recordEvent({ kind: 'nope', at: T0 });
  A.recordEvent({ kind: 'request', at: null, route: '/x' });
  A.recordEvent({ kind: 'request', at: T0 });
  A.recordEvent('not an object');
  const r = A.logStats().rejected;
  assert.deepEqual(r, { not_an_object: 1, unknown_kind: 1, unreadable_timestamp: 1, missing_required_field: 1 });
  assert.equal(A.readEvents().length, 0, 'and none of them became an event');
});

test('draining hands over the buffer and leaves it empty', () => {
  A.resetEventLog();
  A.recordEvent({ kind: 'request', route: '/a', at: T0 });
  A.recordEvent({ kind: 'request', route: '/b', at: T0 });
  assert.equal(A.pendingEventCount(), 2);
  assert.equal(A.drainEvents().length, 2);
  assert.equal(A.pendingEventCount(), 0);
});

// ---------------------------------------------------------------------------
// cost
// ---------------------------------------------------------------------------

test('cost over an empty window is unknown, not $0.00', () => {
  const c = A.costRollup([]);
  assert.equal(c.neurons.known, false);
  assert.equal(c.neurons.why, 'no_samples');
  assert.equal(c.usd.known, false, 'and the dollar figure does not materialise out of the unknown');
  assert.equal(c.usd.value, null);
});

test('a call whose cost never resolved makes the total a floor, not a smaller total', () => {
  const evs = events(call({ neurons: 10 }), call({ neurons: null }), call({ neurons: 5 }));
  const c = A.costRollup(evs);
  assert.equal(c.neurons.value, 15);
  assert.equal(c.neurons.complete, false, 'THE point: 15 is a floor over 3 calls, not a total');
  assert.equal(c.neurons.unreadable, 1);
  assert.equal(c.calls, 3, 'the call count is still complete — only the money is not');
});

test('a model whose every cost was unreadable reports unknown spend, not zero spend', () => {
  const evs = events(call({ model: 'good', neurons: 7 }), call({ model: 'broken', neurons: null }));
  const byModel = Object.fromEntries(A.costRollup(evs).byModel.map((b) => [b.key, b]));
  assert.equal(byModel.good.neurons.value, 7);
  assert.equal(byModel.broken.neurons.known, false);
  assert.equal(byModel.broken.neurons.why, 'no_readable_samples');
  assert.equal(byModel.broken.calls, 1, 'the call happened; only its price is missing');
});

test('dollars track neurons exactly, and are unknown exactly when neurons are', () => {
  const evs = events(call({ neurons: 1000 }));
  const c = A.costRollup(evs);
  assert.equal(c.usd.known, c.neurons.known);
  assert.ok(c.usd.value > 0 && c.usd.value < c.neurons.value, 'a neuron costs a small fraction of a dollar');
  const none = A.costRollup(events(call({ neurons: null })));
  assert.equal(none.usd.known, false);
});

test('cost buckets split by day, model, provider and feature over the same calls', () => {
  const evs = events(
    call({ at: T0, model: 'a', provider: 'p1', feature: 'f1', neurons: 3 }),
    call({ at: T0 + DAY, model: 'b', provider: 'p2', feature: 'f2', neurons: 4 }),
  );
  const c = A.costRollup(evs);
  assert.equal(c.byDay.length, 2);
  assert.equal(c.byModel.length, 2);
  assert.equal(c.byProvider.length, 2);
  assert.equal(c.byFeature.length, 2);
  const daySum = c.byDay.reduce((n, b) => n + b.neurons.value, 0);
  assert.equal(daySum, c.neurons.value, 'the buckets must reconstruct the total');
});

// ---------------------------------------------------------------------------
// latency
// ---------------------------------------------------------------------------

test('latency keeps model, request and build in separate columns', () => {
  const evs = events(
    call({ latencyMs: 100 }),
    { kind: 'request', at: T0, route: '/api/x', durationMs: 5 },
    { kind: 'build', at: T0, outcome: 'done', durationMs: 60_000 },
  );
  const l = A.latencyRollup(evs);
  assert.equal(l.model.p50.value, 100);
  assert.equal(l.request.p50.value, 5);
  assert.equal(l.build.p50.value, 60_000);
});

test('all-unreadable latencies report unknown with the sample count, not a p50 of 0', () => {
  const evs = events(call({ latencyMs: null }), call({ latencyMs: -1 }));
  const l = A.latencyRollup(evs);
  assert.equal(l.model.p50.known, false);
  assert.equal(l.model.p50.why, 'no_readable_samples');
  assert.equal(l.model.unreadable, 2);
  assert.equal(l.model.samples, 0);
});

// ---------------------------------------------------------------------------
// tokens
// ---------------------------------------------------------------------------

test('a call with a readable input and an unreadable output contributes NO total', () => {
  const evs = events(call({ inputTokens: 100, outputTokens: 10 }), call({ inputTokens: 100, outputTokens: null }));
  const t = A.tokenRollup(evs);
  assert.equal(t.input.value, 200, 'both inputs are readable');
  assert.equal(t.output.value, 10);
  assert.equal(t.total.value, 110, 'NOT 210: the half-readable call is not half-counted');
  assert.equal(t.total.samples, 1);
  assert.equal(t.total.complete, false);
  assert.ok(t.total.value < t.input.value + t.output.value, 'summing the columns would have over-counted');
});

test('the cache-hit rate is a proportion of input tokens, and unknown when there are none', () => {
  const hit = A.tokenRollup(events(call({ inputTokens: 100, cachedInputTokens: 25 })));
  assert.equal(hit.cacheHitRate.value, 0.25);
  const empty = A.tokenRollup([]);
  assert.equal(empty.cacheHitRate.known, false);
});

// ---------------------------------------------------------------------------
// success
// ---------------------------------------------------------------------------

test('the success rate excludes unclassified outcomes from the DENOMINATOR', () => {
  const evs = events(
    call({ outcome: 'ok' }),
    call({ outcome: 'ok' }),
    call({ outcome: 'failed' }),
    call({ outcome: 'unknown' }),
    call({ outcome: 'unknown' }),
    call({ outcome: 'unknown' }),
  );
  const s = A.successRollup(evs).modelCalls;
  assert.equal(s.ok, 2);
  assert.equal(s.failed, 1);
  assert.equal(s.unclassified, 3);
  assert.equal(s.rate.value, 2 / 3, 'over what was classified');
  assert.notEqual(s.rate.value, 2 / 6, 'counting unknowns as failures would report 33%');
  assert.equal(s.rate.unreadable, 3, 'and the rate says how much it could not see');
});

test('a window of nothing but unclassified outcomes yields no rate at all', () => {
  const s = A.successRollup(events(call({ outcome: 'unknown' }), call({ outcome: 'unknown' }))).modelCalls;
  assert.equal(s.rate.known, false);
  assert.equal(s.rate.why, 'no_denominator');
});

test('a request with no readable status is unclassified, not a success', () => {
  const evs = events(
    { kind: 'request', at: T0, route: '/a', status: 200 },
    { kind: 'request', at: T0, route: '/b', status: 500 },
    { kind: 'request', at: T0, route: '/c', status: 'ok' },
  );
  const s = A.successRollup(evs).requests;
  assert.equal(s.ok, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.unclassified, 1);
  assert.equal(s.rate.value, 0.5);
});

test('a stopped run is neither a success nor a defect', () => {
  const evs = events(
    { kind: 'build', at: T0, outcome: 'done' },
    { kind: 'build', at: T0, outcome: 'stopped' },
    { kind: 'build', at: T0, outcome: 'quota' },
    { kind: 'build', at: T0, outcome: 'error' },
  );
  const b = A.successRollup(evs).builds;
  assert.equal(b.ok, 1);
  assert.equal(b.failed, 1);
  assert.equal(b.unclassified, 2, 'stopped and quota are the user, not the product');
  assert.equal(b.rate.value, 0.5);
});

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

test('a failed model call is an error even when nobody logged a second event for it', () => {
  const evs = events(
    call({ outcome: 'failed', errorKind: 'rate_limit' }),
    { kind: 'error', at: T0, scope: '/api/x', errorKind: 'unhandled', fatal: true },
  );
  const b = A.errorBreakdown(evs);
  assert.equal(b.total, 2);
  const kinds = Object.fromEntries(b.byKind.map((r) => [r.key, r.count]));
  assert.deepEqual(kinds, { rate_limit: 1, unhandled: 1 });
});

test('a failure nobody classified lands in `unknown` and is never dropped', () => {
  const evs = events(call({ outcome: 'failed', errorKind: null }));
  const b = A.errorBreakdown(evs);
  assert.equal(b.total, 1);
  assert.equal(b.byKind[0].key, 'unknown');
  assert.equal(b.byKind[0].count, 1);
});

test('error shares are a partition of the total', () => {
  const evs = events(
    call({ outcome: 'failed', errorKind: 'rate_limit' }),
    call({ outcome: 'failed', errorKind: 'rate_limit' }),
    call({ outcome: 'failed', errorKind: 'timeout' }),
  );
  const b = A.errorBreakdown(evs);
  const total = b.byKind.reduce((n, r) => n + r.share.value, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, 'shares sum to 1');
  assert.ok(b.byKind[0].count >= b.byKind[1].count, 'sorted by count, descending');
});

// ---------------------------------------------------------------------------
// breakdowns
// ---------------------------------------------------------------------------

test('a dimension that is not on the allowlist is REFUSED, not answered with an empty table', () => {
  const evs = events(call());
  for (const bad of ['nonsense', '__proto__', 'constructor', '', 'PROVIDER']) {
    const r = A.breakdownBy(evs, bad);
    assert.equal(r.known, false, `${bad} must not be accepted as a dimension`);
    assert.equal(r.why, 'unknown_dimension');
    assert.equal('rows' in r, false, 'an empty table is what a working system with no traffic looks like');
    assert.deepEqual([...r.allowed], [...A.BREAKDOWN_DIMENSIONS], 'and it says what it would accept');
  }
});

test('every allowlisted dimension actually groups', () => {
  const evs = events(call({ provider: 'p1', model: 'm1', feature: 'f1', projectId: 'pr1', actorId: 'a1' }));
  for (const dim of A.BREAKDOWN_DIMENSIONS) {
    const r = A.breakdownBy(evs, dim);
    assert.equal(r.known, true, `${dim} is on the allowlist and must work`);
    assert.equal(r.rows.length, 1, `${dim} produced no row — the allowlist and the switch disagree`);
  }
});

test('calls with no tenant are counted as unattributed, not bucketed under a plausible key', () => {
  const evs = events(call({ projectId: 'p1' }), call({ projectId: null }), call({ projectId: null }));
  const r = A.breakdownBy(evs, 'projectId');
  assert.equal(r.unattributed, 2);
  assert.deepEqual(r.rows.map((x) => x.key), ['p1']);
  for (const row of r.rows) assert.notEqual(row.key, 'unknown', 'a key that looks like a tenant will be read as one');
});

test('provider and model breakdowns carry success, latency and cost per row', () => {
  const evs = events(
    call({ provider: 'workers-ai', latencyMs: 100, neurons: 10, outcome: 'ok' }),
    call({ provider: 'workers-ai', latencyMs: 300, neurons: 20, outcome: 'failed' }),
    call({ provider: 'openai', latencyMs: 50, neurons: 5, outcome: 'ok' }),
  );
  const p = Object.fromEntries(A.providerBreakdown(evs).rows.map((r) => [r.key, r]));
  assert.equal(p['workers-ai'].calls, 2);
  assert.equal(p['workers-ai'].success.value, 0.5);
  assert.equal(p['openai'].success.value, 1);
  assert.ok(p['workers-ai'].latencyP50.value > p['openai'].latencyP50.value);
  assert.equal(p['workers-ai'].neurons.value, 30);
  const m = A.modelBreakdown(evs);
  assert.equal(m.dimension, 'model');
  assert.equal(m.rows.length, 1, 'one model served all three calls');
});

// ---------------------------------------------------------------------------
// feature usage
// ---------------------------------------------------------------------------

test('a feature used only by unattributed events reports UNKNOWN users, not zero users', () => {
  const evs = events(call({ feature: 'ghost', actorId: null }), call({ feature: 'ghost', actorId: null }));
  const row = A.featureUsage(evs).rows.find((r) => r.feature === 'ghost');
  assert.equal(row.events, 2, 'the feature was used');
  assert.equal(row.actors.known, false, '"0 users" for a feature somebody just used is a lie');
  assert.equal(row.actors.unreadable, 2);
});

test('distinct actors are counted once each', () => {
  const evs = events(
    call({ feature: 'f', actorId: 'u1' }),
    call({ feature: 'f', actorId: 'u1' }),
    call({ feature: 'f', actorId: 'u2' }),
  );
  const row = A.featureUsage(evs).rows[0];
  assert.equal(row.events, 3);
  assert.equal(row.actors.value, 2);
});

test('every event kind produces a feature label, so nothing falls out of usage', () => {
  const evs = events(
    call({ feature: 'agent:step' }),
    { kind: 'request', at: T0, route: '/api/me' },
    { kind: 'build', at: T0, outcome: 'done' },
    { kind: 'audit', at: T0, action: 'admin:x', allowed: true },
    { kind: 'error', at: T0, scope: '/api/me' },
  );
  const labels = A.featureUsage(evs).rows.map((r) => r.feature).sort();
  assert.deepEqual(labels, ['/api/me', 'agent:step', 'audit:admin:x', 'build:done', 'error:/api/me']);
});

// ---------------------------------------------------------------------------
// retention — the strongest form of the rule
// ---------------------------------------------------------------------------

test('a day-7 number for a cohort that is one day old does NOT exist, and is not 0%', () => {
  const evs = events(
    call({ actorId: 'a', at: T0 }),
    call({ actorId: 'a', at: T0 + DAY }),
    call({ actorId: 'b', at: T0 }),
  );
  const r = A.retentionRollup(evs, { now: T0 + DAY, horizonDays: 7 });
  assert.equal(r.cohorts.length, 1);
  const cohort = r.cohorts[0];
  assert.equal(cohort.actors, 2);
  const d1 = cohort.cells.find((c) => c.dayOffset === 1);
  assert.equal(d1.rate.value, 0.5, 'one of two came back on day 1');
  assert.equal(d1.retained, 1);
  for (const k of [2, 3, 4, 5, 6, 7]) {
    const cell = cohort.cells.find((c) => c.dayOffset === k);
    assert.equal(cell.rate.known, false, `day ${k} has not happened yet`);
    assert.equal(cell.rate.why, 'not_yet_observable');
    assert.equal(cell.retained, null, 'a wall of zeros here reads as a collapse in retention');
  }
});

test('a genuine non-return IS zero — the guard must not hide real churn', () => {
  const evs = events(call({ actorId: 'a', at: T0 }), call({ actorId: 'b', at: T0 }));
  const r = A.retentionRollup(evs, { now: T0 + 3 * DAY, horizonDays: 2 });
  const cohort = r.cohorts[0];
  const d1 = cohort.cells.find((c) => c.dayOffset === 1);
  assert.equal(d1.rate.known, true, 'day 1 is in the past and observable');
  assert.equal(d1.rate.value, 0, 'and nobody came back — that zero is a measurement');
  assert.equal(d1.retained, 0);
});

test('an unreadable clock makes every cell unobservable rather than every cell zero', () => {
  const evs = events(call({ actorId: 'a', at: T0 }), call({ actorId: 'a', at: T0 + DAY }));
  const r = A.retentionRollup(evs, { now: NaN, horizonDays: 3 });
  assert.equal(r.asOf, null);
  for (const cell of r.cohorts[0].cells) {
    assert.equal(cell.rate.known, false);
    assert.equal(cell.rate.why, 'not_yet_observable');
  }
});

test('cohorts are keyed on an actor’s FIRST day, and unattributed events are excluded and counted', () => {
  const evs = events(
    call({ actorId: 'a', at: T0 }),
    call({ actorId: 'b', at: T0 + DAY }),
    call({ actorId: null, at: T0 }),
  );
  const r = A.retentionRollup(evs, { now: T0 + 5 * DAY, horizonDays: 2 });
  assert.equal(r.cohorts.length, 2, 'two first-seen days, two cohorts');
  assert.equal(r.unattributedEvents, 1);
  assert.equal(r.cohorts[0].actors + r.cohorts[1].actors, 2, 'the anonymous event invented no actor');
  assert.ok(r.cohorts[0].day < r.cohorts[1].day, 'cohorts run forward in time');
});

// ---------------------------------------------------------------------------
// funnel
// ---------------------------------------------------------------------------

test('a funnel counts an actor at a step only if they reached it AFTER the step before', () => {
  const evs = events(
    // in order: counts all the way through
    call({ actorId: 'in-order', feature: 'a', at: T0 }),
    call({ actorId: 'in-order', feature: 'b', at: T0 + 1000 }),
    // backwards: did 'b' first, so never went through this funnel
    call({ actorId: 'backwards', feature: 'b', at: T0 }),
    call({ actorId: 'backwards', feature: 'a', at: T0 + 1000 }),
  );
  const f = A.funnelRollup(evs, ['a', 'b']);
  assert.equal(f.known, true);
  assert.equal(f.steps[0].actors, 2, 'both did step a');
  assert.equal(f.steps[1].actors, 1, 'only one did b AFTER a');
  assert.equal(f.steps[1].fromStart.value, 0.5);
});

test('funnel conversion never rises along the funnel', () => {
  const evs = events(
    call({ actorId: 'u1', feature: 'a', at: T0 }),
    call({ actorId: 'u1', feature: 'b', at: T0 + 1 }),
    call({ actorId: 'u1', feature: 'c', at: T0 + 2 }),
    call({ actorId: 'u2', feature: 'a', at: T0 }),
    call({ actorId: 'u3', feature: 'a', at: T0 }),
    call({ actorId: 'u3', feature: 'b', at: T0 + 1 }),
  );
  const f = A.funnelRollup(evs, ['a', 'b', 'c']);
  const rates = f.steps.map((s) => s.fromStart.value);
  for (let i = 1; i < rates.length; i++) assert.ok(rates[i] <= rates[i - 1], 'a funnel cannot widen');
  assert.deepEqual(f.steps.map((s) => s.actors), [3, 2, 1]);
});

test('a funnel over data with no identities is NOT a funnel of zero conversions', () => {
  const evs = events(call({ actorId: null, feature: 'a' }), call({ actorId: null, feature: 'b' }));
  const f = A.funnelRollup(evs, ['a', 'b']);
  assert.equal(f.known, false);
  assert.equal(f.why, 'no_attributable_actors');
  assert.equal(f.unattributedEvents, 2);
  assert.equal('steps' in f, false, '0% conversion and "nobody is identified" are different findings');
});

test('a funnel with no steps refuses instead of returning an empty funnel', () => {
  const f = A.funnelRollup(events(call()), []);
  assert.equal(f.known, false);
  assert.equal(f.why, 'no_steps');
  assert.equal(A.funnelRollup(events(call()), ['', '   ']).known, false, 'blank step names are not steps');
});

// ---------------------------------------------------------------------------
// route labels
// ---------------------------------------------------------------------------

test('an identifier in a path never reaches the log', () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const label = A.routeLabel(`/api/projects/${id}/ws`);
  assert.equal(label, '/api/projects/:id/ws');
  assert.equal(label.includes(id), false, 'a request log keyed on the raw path is a per-tenant record');
  assert.equal(A.routeLabel('/api/projects/12345/images/deadbeefdeadbeef99'), '/api/projects/:id/images/:id');
  assert.equal(A.routeLabel('/api/health'), '/api/health', 'a static route survives intact');
  // Each clause covers a shape no other clause reaches, so each one is falsifiable on its own:
  // the uuid rule (36 chars, under the length threshold), the numeric rule, the hex rule, and the
  // length catch-all. Break any one and exactly one of these goes red.
  assert.equal(A.routeLabel(`/x/${'z'.repeat(60)}`), '/x/:id', 'the length catch-all still catches opaque junk');
  assert.equal(A.routeLabel('/api/projects/short-name'), '/api/projects/short-name', 'and does not eat a real segment');
  assert.equal(A.routeLabel(undefined), 'unknown', 'and an unreadable path is not the empty route');
});

// ---------------------------------------------------------------------------
// window truncation
// ---------------------------------------------------------------------------

test('a page that cut the result set is truncated', () => {
  assert.equal(A.windowTruncated({ available: 100, returned: 50, evictedAllTime: 0, oldestAt: T0, sinceMs: T0 }), true);
  assert.equal(A.windowTruncated({ available: 50, returned: 50, evictedAllTime: 0, oldestAt: T0, sinceMs: T0 }), false);
});

test('a window whose START was evicted is truncated even though every matching row was returned', () => {
  // 50 of 50 rows returned, but the table has evicted before and its oldest row begins AFTER the
  // window did: the flat stretch at the start of the chart is missing data, not a quiet week.
  assert.equal(
    A.windowTruncated({ available: 50, returned: 50, evictedAllTime: 12, oldestAt: T0 + DAY, sinceMs: T0 }),
    true,
  );
  // Same table, window starting after the oldest surviving row: nothing is missing.
  assert.equal(
    A.windowTruncated({ available: 50, returned: 50, evictedAllTime: 12, oldestAt: T0, sinceMs: T0 + DAY }),
    false,
  );
  // A young table that has never evicted is complete however new it is.
  assert.equal(
    A.windowTruncated({ available: 5, returned: 5, evictedAllTime: 0, oldestAt: T0 + DAY, sinceMs: T0 }),
    false,
  );
});

test('an unreadable input answers TRUE — "I cannot tell" must not render as "complete"', () => {
  assert.equal(A.windowTruncated({ available: NaN, returned: 5, evictedAllTime: 0, oldestAt: T0, sinceMs: T0 }), true);
  assert.equal(A.windowTruncated({ available: 5, returned: null, evictedAllTime: 0, oldestAt: T0, sinceMs: T0 }), true);
  assert.equal(A.windowTruncated({ available: 5, returned: 5, evictedAllTime: 3, oldestAt: T0, sinceMs: 'x' }), true);
  assert.equal(A.windowTruncated({ available: 0, returned: 0, evictedAllTime: 3, oldestAt: null, sinceMs: T0 }), true);
});

// ---------------------------------------------------------------------------
// the whole summary
// ---------------------------------------------------------------------------

test('the summary counts every kind and carries the truncation flag through', () => {
  const evs = events(
    call(),
    { kind: 'request', at: T0, route: '/api/me', status: 200, durationMs: 4 },
    { kind: 'error', at: T0, scope: '/api/me', errorKind: 'boom' },
    { kind: 'build', at: T0, outcome: 'done', durationMs: 10 },
    { kind: 'audit', at: T0, action: 'admin:/api/admin/spend', allowed: false },
  );
  const s = A.summarize(evs, { now: T0 + DAY, truncated: true });
  assert.deepEqual(s.counts, { request: 1, model_call: 1, error: 1, build: 1, audit: 1 });
  assert.equal(s.window.complete, false, 'a truncated log must never report a complete window');
  assert.equal(s.window.events, 5);
  assert.equal(s.audit.total, 1);
  assert.equal(s.audit.refused, 1, 'a refused admin call is the event worth keeping');
  assert.equal(s.providers.known, true);
  assert.equal(s.models.known, true);
});

test('a summary over nothing reports unknown everywhere rather than a page of zeros', () => {
  const s = A.summarize([], { now: T0 });
  assert.equal(s.cost.neurons.known, false);
  assert.equal(s.cost.usd.known, false);
  assert.equal(s.latency.model.p50.known, false);
  assert.equal(s.tokens.total.known, false);
  assert.equal(s.success.modelCalls.rate.known, false);
  assert.equal(s.retention.cohorts.length, 0);
  assert.equal(s.window.complete, true, 'empty is still a complete window when nothing was dropped');
});

// ---------------------------------------------------------------------------
// wiring — the module has to be REACHED, not merely correct
// ---------------------------------------------------------------------------

const read = (p) => readFileSync(join(WORKER, 'src', p), 'utf8');

test('the gateway records a model trace on the settled call, anchored to the settle line', () => {
  const src = read('gateway.ts');
  const settle = src.indexOf('await settle(env, reserved, actual, cfg.id, kind);');
  assert.ok(settle > 0, 'the settle call this trace hangs off no longer exists');
  // Anchored to the 400 characters that FOLLOW settlement, so a `trace({ outcome: 'ok' })`
  // somewhere else in the file cannot satisfy this.
  const after = src.slice(settle, settle + 400);
  assert.match(after, /trace\(\{/, 'the settled call must be traced');
  assert.match(after, /outcome: 'ok'/);
  assert.match(after, /neurons: actual/, 'and the trace must carry the SETTLED cost, not the estimate');
});

test('the gateway records a trace for a failed attempt too, anchored to the catch block', () => {
  const src = read('gateway.ts');
  const at = src.indexOf('const cls = adapter.classifyError(e);');
  assert.ok(at > 0);
  const block = src.slice(at, at + 700);
  assert.match(block, /trace\(\{[\s\S]*outcome: 'failed'/, 'a swallowed retry must still appear in the log');
  assert.match(block, /errorKind: cls\.kind/);
});

test('the request log is registered BEFORE the auth middleware, so refusals are logged', () => {
  const src = read('index.ts');
  const logger = src.indexOf("kind: 'request',");
  const auth = src.indexOf("if (!token) return c.json({ error: 'unauthorized' }, 401);");
  assert.ok(logger > 0 && auth > 0, 'both middlewares must exist');
  assert.ok(logger < auth, 'a log registered after auth cannot see a credential being guessed');
});

test('the admin gate writes an audit record on BOTH branches', () => {
  const src = read('index.ts');
  const gate = src.indexOf("const key = c.req.header('X-Admin-Key');");
  assert.ok(gate > 0);
  const block = src.slice(gate, src.indexOf('// ---------------------------------------------------------------- public'));
  assert.match(block, /allowed: false/, 'a refused admin call must be recorded');
  assert.match(block, /allowed: true/, 'and so must an accepted one, or the log only shows attackers');
});

test('the analytics surface is admin-only and the log surface validates its kind', () => {
  const src = read('index.ts');
  assert.match(src, /app\.get\('\/api\/admin\/analytics'/, 'the rollup endpoint exists');
  assert.match(src, /app\.get\('\/api\/admin\/logs'/, 'and the raw-log endpoint');
  assert.equal(/app\.(get|post)\('\/api\/(?!admin\/)[^']*analytics/.test(src), false,
    'cross-tenant operational data must not hang off a user route');
  const logs = src.slice(src.indexOf("app.get('/api/admin/logs'"), src.indexOf("app.get('/api/admin/stats'"));
  assert.match(logs, /readEnum\(c\.req\.query\('kind'\) \?\? '', EVENT_KINDS\)/, 'the kind comes from a query string');
  assert.match(logs, /unknown_kind/, 'and an unknown one is refused rather than returning an empty stream');
});

test('the durable sink validates every row it stores at the boundary', () => {
  const src = readFileSync(join(WORKER, 'src', 'do', 'admin.ts'), 'utf8');
  const ingest = src.indexOf("if (url.pathname === '/events' && req.method === 'POST')");
  assert.ok(ingest > 0, 'the ingest route must exist');
  const block = src.slice(ingest, src.indexOf("if (url.pathname === '/events') {"));
  assert.match(block, /normalizeEvent\(raw\)/, 'events arrive from another isolate as JSON');
  assert.match(block, /rejected\[n\.reason\] \+= 1/, 'and a rejected row is counted, not skipped');
  assert.match(block, /insert into events/);
});

test('an unreadable `since` on the durable read is refused rather than answered with everything', () => {
  const src = readFileSync(join(WORKER, 'src', 'do', 'admin.ts'), 'utf8');
  const at = src.indexOf("const since = Number(url.searchParams.get('since') ?? NaN);");
  assert.ok(at > 0);
  const block = src.slice(at, at + 400);
  assert.match(block, /if \(!Number\.isFinite\(since\)\)/, 'NaN would have compared false against every row');
  assert.match(block, /unreadable_since/);
});

test('a run writes a build log from the branch that ended it', () => {
  const src = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const end = src.indexOf("this.broadcast({ type: 'msg_end'");
  assert.ok(end > 0, 'the end-of-run broadcast this hangs off no longer exists');
  const block = src.slice(end, end + 900);
  assert.match(block, /kind: 'build'/, 'the build log is written where the run actually ends');
  // The fields are read from the recordEvent CALL rather than from a fixed window after `msg_end`:
  // a window measures how much COMMENT sits between the two, which is not the property under test.
  // Proximity is already asserted above.
  const call = src.slice(src.indexOf("kind: 'build'", end), src.indexOf('runId: agent.msgId', end));
  assert.ok(call.length > 0 && call.length < 1200, 'the build recordEvent call moved; this guard no longer reads it');
  const block2 = call;
  // Still the branch that ended the run and never the reply text — but no longer `reason` alone.
  // `reason` is what the browser's stopReason union can carry, and a step-cap or wall-clock exit
  // has to say `done` there; `buildOutcome` is the finer answer for the log. The override applies
  // ONLY where `reason` is `done`, so finishRun's own rewrite to `incomplete` still wins.
  assert.match(
    block2,
    /outcome: reason === 'done' \? \(buildOutcome \?\? 'done'\) : reason/,
    'the outcome must come from the branch that ended the run, not from the reply text',
  );
  assert.match(
    block2,
    /finishReason: agent\.lastFinishReason \?\? null/,
    "the provider's own last word must be recorded, not only apologised with and dropped",
  );
  assert.match(block2, /neurons: agent\.neuronsUsed \?\? null/, 'an older run reports unknown cost, not zero cost');
});
