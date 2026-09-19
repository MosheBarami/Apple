/**
 * ONE STRIPE AUTHORITY, TWO EXISTING QUOTA STORES.
 *
 * Apple owns the signed Stripe endpoint. Its per-user QuotaDO resolves the current Stripe
 * subscription while that user's events are serialised, applies the result locally, and returns one
 * bounded mutation. The route sends that exact mutation through an external Durable Object binding
 * to the existing golem QuotaDO. A failed second write is a failed webhook delivery: Stripe retries,
 * the authority reports a replay, and the replica is attempted again.
 *
 * Run with: node --test tests/billing-origin-authority.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'billing-origin-authority-'));
const OUT = join(TMP, 'billing-origin-authority.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'billing-origin-authority.ts'),
  '--bundle', '--format=esm', '--target=es2022', `--outfile=${OUT}`,
], { cwd: WORKER, stdio: 'pipe' });
const A = await import(`file://${OUT}`);

const QUOTA_OUT = join(TMP, 'quota.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'do', 'quota.ts'),
  '--bundle', '--format=esm', '--target=es2022',
  '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
  `--outfile=${QUOTA_OUT}`,
], { cwd: WORKER, stdio: 'pipe' });
const { QuotaDO } = await import(`file://${QUOTA_OUT}`);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = 1_800_000_000;
const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_authority_only',
  STRIPE_WEBHOOK_SECRET: 'whsec_must_never_leave_the_edge',
  STRIPE_PRICE_BUILDER: 'price_builder',
  STRIPE_PRICE_STUDIO: 'price_studio',
};

const stripeSubscription = (overrides = {}) => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  current_period_end: NOW + 86_400,
  cancel_at_period_end: false,
  metadata: { userId: USER_ID, plan: 'builder' },
  items: { data: [{ id: 'si_1', price: { id: 'price_builder' } }] },
  ...overrides,
});

const subscriptionEvent = (id, type, object) => ({ id, type, data: { object } });

const sequencedSubscription = (authoritySequence, eventId, plan, overrides = {}) => ({
  version: 1,
  kind: 'subscription',
  userId: USER_ID,
  eventId,
  sourceEventId: eventId,
  plan,
  customerId: 'cus_1',
  subscription: {
    plan,
    customerId: 'cus_1',
    subscriptionId: 'sub_1',
    itemId: 'si_1',
    status: 'active',
    currentPeriodEnd: NOW + 86_400,
    cancelAtPeriodEnd: false,
    ...overrides,
  },
  authoritySequence,
});

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function cursor(rows) {
  return {
    toArray: () => rows,
    one: () => {
      if (rows.length !== 1) throw new Error(`expected exactly one row, got ${rows.length}`);
      return rows[0];
    },
    [Symbol.iterator]: () => rows[Symbol.iterator](),
  };
}

function realSql() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    exec(query, ...args) {
      const sql = query.trim();
      if (args.length === 0 && /;[\s\S]*\S/.test(sql.replace(/;\s*$/, ''))) {
        db.exec(sql);
        return cursor([]);
      }
      const statement = db.prepare(sql);
      return cursor(statement.all(...args));
    },
  };
}

function quota(seed = {}, env = ENV) {
  const store = new Map(Object.entries(seed));
  const sql = realSql();
  const storage = {
    async get(key) {
      const value = store.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(a, b) {
      if (typeof a === 'object' && a !== null) {
        for (const [key, value] of Object.entries(a)) store.set(key, structuredClone(value));
      } else {
        store.set(a, structuredClone(b));
      }
    },
    async delete(key) { store.delete(key); },
    sql,
  };
  const object = new QuotaDO({ storage, blockConcurrencyWhile: (fn) => fn() }, env);
  const target = {
    fetch(input, init) {
      return object.fetch(input instanceof Request ? input : new Request(input, init));
    },
  };
  const request = async (path, body, method = 'POST') => {
    const response = await object.fetch(new Request('https://do' + path, {
      method,
      ...(method === 'POST'
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }
        : {}),
    }));
    const text = await response.text();
    return {
      status: response.status,
      json: text.length ? JSON.parse(text) : null,
    };
  };
  return {
    object,
    target,
    request,
    state: async () => (await request('/state', null, 'GET')).json,
    billing: async () => (await request('/billing', null, 'GET')).json,
    store,
    sql,
  };
}

test('the named authority and replica are explicit, never inferred from the request host', () => {
  assert.equal(A.BILLING_AUTHORITY_WORKER, 'apple');
  assert.equal(A.BILLING_REPLICA_WORKER, 'golem');
});

test('an older snapshot resolves to the CURRENT subscription and cannot restore the old tier', async () => {
  const calls = [];
  const old = stripeSubscription();
  const latest = stripeSubscription({
    metadata: { userId: USER_ID, plan: 'builder' },
    items: { data: [{ id: 'si_1', price: { id: 'price_studio' } }] },
  });
  const mutation = await A.resolveBillingAuthorityMutation(
    subscriptionEvent('evt_old', 'customer.subscription.updated', old),
    ENV,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(latest);
    },
    NOW,
  );

  assert.equal(mutation.kind, 'subscription');
  assert.equal(mutation.plan, 'studio');
  assert.equal(mutation.subscription.plan, 'studio');
  assert.equal(mutation.sourceEventId, 'evt_old');
  assert.equal(mutation.eventId, 'evt_old', 'rollout keeps the same id legacy QuotaDO already deduplicates');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.stripe.com/v1/subscriptions/sub_1');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${ENV.STRIPE_SECRET_KEY}`);
  assert.equal(calls[0].init.headers.Cookie, undefined);
  assert.doesNotMatch(JSON.stringify(calls[0].init.headers), /whsec_/);
});

test('a delayed deleted snapshot also uses current Stripe state instead of demoting blindly', async () => {
  const deletedSnapshot = stripeSubscription({ status: 'canceled' });
  const current = stripeSubscription({
    status: 'active',
    items: { data: [{ id: 'si_1', price: { id: 'price_studio' } }] },
  });
  const mutation = await A.resolveBillingAuthorityMutation(
    subscriptionEvent('evt_deleted_old', 'customer.subscription.deleted', deletedSnapshot),
    ENV,
    async () => jsonResponse(current),
    NOW,
  );
  assert.equal(mutation.plan, 'studio');
  assert.equal(mutation.subscription.status, 'active');
});

test('canceled, unpaid, and expired current subscriptions converge both real SQLite quota stores to free without erasing the purchased tier', async () => {
  const originalFetch = globalThis.fetch;
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    ['canceled', { status: 'canceled', current_period_end: now + 86_400 }],
    ['unpaid', { status: 'unpaid', current_period_end: now + 86_400 }],
    ['expired', { status: 'active', current_period_end: now - 1 }],
  ];

  try {
    for (const [name, overrides] of cases) {
      const authority = quota();
      const replica = quota();
      const current = stripeSubscription(overrides);
      globalThis.fetch = async () => jsonResponse(current);
      const eventId = `evt_${name}`;
      const resolved = await authority.request('/billing-authority', {
        event: subscriptionEvent(eventId, 'customer.subscription.updated', stripeSubscription()),
      });

      assert.equal(resolved.status, 200, name);
      assert.equal(resolved.json.mutation.plan, 'free', name);
      assert.equal(resolved.json.mutation.subscription.plan, 'builder', `${name}: preserve the Stripe price tier`);
      assert.equal(resolved.json.mutation.subscription.status, overrides.status, name);

      const delivered = await A.deliverBillingMutation(replica.target, resolved.json.mutation, 'golem');
      assert.equal(delivered.ok, true, name);
      for (const [which, store] of [['authority', authority], ['replica', replica]]) {
        const billing = await store.billing();
        assert.equal(billing.plan, 'free', `${name}: ${which} enforces free`);
        assert.equal(billing.subscription.plan, 'builder', `${name}: ${which} retains purchased tier`);
        assert.equal(billing.subscription.status, overrides.status, `${name}: ${which} retains Stripe status`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a delayed cancellation for old subscription A cannot overwrite newer active subscription B', async () => {
  const authority = quota();
  const replica = quota();
  const originalFetch = globalThis.fetch;
  const now = Math.floor(Date.now() / 1000);
  const currentById = new Map([
    ['sub_A', stripeSubscription({ id: 'sub_A', status: 'canceled', current_period_end: now - 1 })],
    ['sub_B', stripeSubscription({ id: 'sub_B', status: 'active', current_period_end: now + 86_400 })],
  ]);
  globalThis.fetch = async (url) => {
    const id = decodeURIComponent(String(url).split('/').pop() ?? '');
    const current = currentById.get(id);
    if (!current) return jsonResponse({ error: 'missing fixture' }, { status: 404 });
    return jsonResponse(current);
  };

  try {
    const currentB = await authority.request('/billing-authority', {
      event: subscriptionEvent('evt_B_active', 'customer.subscription.created', stripeSubscription({ id: 'sub_B' })),
    });
    assert.equal(currentB.status, 200);
    assert.equal(currentB.json.mutation.subscription.subscriptionId, 'sub_B');
    await A.deliverBillingMutation(replica.target, currentB.json.mutation, 'golem');

    const delayedA = await authority.request('/billing-authority', {
      event: subscriptionEvent('evt_A_cancel_late', 'customer.subscription.deleted', stripeSubscription({ id: 'sub_A' })),
    });
    assert.equal(delayedA.status, 409, 'old subscription identity is refused instead of replacing the current subscription');
    assert.equal(delayedA.json.error, 'billing_subscription_superseded');

    for (const [which, store] of [['authority', authority], ['replica', replica]]) {
      const billing = await store.billing();
      assert.equal(billing.plan, 'builder', `${which} keeps B entitlement`);
      assert.equal(billing.subscription.subscriptionId, 'sub_B', `${which} keeps B as the billing subscription`);
      assert.equal(billing.subscription.status, 'active', `${which} keeps B source state`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('subscription identity fence still permits a real re-subscription after the stored subscription lapses', async () => {
  const q = quota();
  const originalFetch = globalThis.fetch;
  const now = Math.floor(Date.now() / 1000);
  const currentById = new Map([
    ['sub_A', stripeSubscription({ id: 'sub_A', status: 'canceled', current_period_end: now - 1 })],
    ['sub_B', stripeSubscription({ id: 'sub_B', status: 'active', current_period_end: now + 86_400 })],
  ]);
  globalThis.fetch = async (url) => jsonResponse(currentById.get(decodeURIComponent(String(url).split('/').pop() ?? '')));

  try {
    const lapsedA = await q.request('/billing-authority', {
      event: subscriptionEvent('evt_A_lapsed', 'customer.subscription.deleted', stripeSubscription({ id: 'sub_A' })),
    });
    assert.equal(lapsedA.status, 200);
    assert.equal((await q.billing()).plan, 'free');

    const replacementB = await q.request('/billing-authority', {
      event: subscriptionEvent('evt_B_re_subscribed', 'customer.subscription.created', stripeSubscription({ id: 'sub_B' })),
    });
    assert.equal(replacementB.status, 200, 'a paid replacement is allowed once the stored subscription no longer entitles');
    const billing = await q.billing();
    assert.equal(billing.plan, 'builder');
    assert.equal(billing.subscription.subscriptionId, 'sub_B');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('authority replay remains bound to the source event id and the QuotaDO pinned user', async () => {
  const q = quota();
  const originalFetch = globalThis.fetch;
  let current = stripeSubscription();
  let stripeReads = 0;
  globalThis.fetch = async () => {
    stripeReads += 1;
    return jsonResponse(current);
  };

  try {
    const event = subscriptionEvent('evt_identity', 'customer.subscription.updated', stripeSubscription());
    const first = await q.request('/billing-authority', { event });
    assert.equal(first.status, 200);

    const stored = structuredClone(first.json.mutation);
    stored.sourceEventId = 'evt_other';
    stored.eventId = 'evt_other';
    q.sql.db.prepare('update billing_authority_replays set mutation_json = ? where source_event_id = ?')
      .run(JSON.stringify(stored), 'evt_identity');
    const invalidReplay = await q.request('/billing-authority', { event });
    assert.equal(invalidReplay.status, 503);
    assert.equal(invalidReplay.json.error, 'billing_authority_replay_invalid');
    assert.equal(stripeReads, 1, 'an invalid replay is refused before another provider read');

    q.sql.db.prepare('delete from billing_authority_replays where source_event_id = ?').run('evt_identity');
    current = stripeSubscription({ metadata: { userId: 'other-user', plan: 'builder' } });
    const otherUser = await q.request('/billing-authority', {
      event: subscriptionEvent('evt_other_user', 'customer.subscription.updated', current),
    });
    assert.equal(otherUser.status, 409);
    assert.equal(otherUser.json.error, 'billing_user_mismatch');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stored authority replay stays valid after its once-entitling period has elapsed', async () => {
  const q = quota();
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const startMs = originalNow();
  const periodEnd = Math.floor(startMs / 1000) + 60;
  let stripeReads = 0;
  globalThis.fetch = async () => {
    stripeReads += 1;
    return jsonResponse(stripeSubscription({ current_period_end: periodEnd }));
  };
  Date.now = () => startMs;

  try {
    const event = subscriptionEvent('evt_period_replay', 'customer.subscription.updated', stripeSubscription());
    const first = await q.request('/billing-authority', { event });
    assert.equal(first.status, 200);
    assert.equal(first.json.mutation.plan, 'builder');
    assert.equal(stripeReads, 1);

    Date.now = () => (periodEnd + 60) * 1000;
    const replay = await q.request('/billing-authority', { event });
    assert.equal(replay.status, 200);
    assert.equal(replay.json.replayed, true);
    assert.deepEqual(replay.json.mutation, first.json.mutation, 'time passing cannot rewrite or invalidate the sequenced replay snapshot');
    assert.equal(stripeReads, 1, 'replay must not re-read Stripe after its stored period elapses');
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test('mutation validation permits safe free fallback but rejects inconsistent elevated tiers', () => {
  const canceledFree = sequencedSubscription(1, 'evt_cancelled', 'free', {
    plan: 'builder',
    status: 'canceled',
  });
  assert.equal(A.isBillingMutation(canceledFree), true, 'free may retain the purchased tier for audit and billing UI');

  const canceledElevated = structuredClone(canceledFree);
  canceledElevated.plan = 'builder';
  assert.equal(A.isBillingMutation(canceledElevated), false, 'non-entitling status cannot carry paid entitlement');

  const mismatchedElevated = sequencedSubscription(2, 'evt_mismatch', 'builder');
  mismatchedElevated.plan = 'studio';
  assert.equal(A.isBillingMutation(mismatchedElevated), false, 'paid entitlement must equal the preserved Stripe tier');
});

test('different Stripe events keep distinct ids even when they resolve to the same current state', async () => {
  const current = stripeSubscription({ cancel_at_period_end: true });
  const fetcher = async () => jsonResponse(current);
  const a = await A.resolveBillingAuthorityMutation(
    subscriptionEvent('evt_a', 'customer.subscription.updated', stripeSubscription()), ENV, fetcher, NOW,
  );
  const b = await A.resolveBillingAuthorityMutation(
    subscriptionEvent('evt_b', 'customer.subscription.updated', stripeSubscription()), ENV, fetcher, NOW,
  );
  assert.equal(a.plan, b.plan);
  assert.deepEqual(a.subscription, b.subscription);
  assert.notEqual(a.eventId, b.eventId, 'a later return to the same state must remain an applicable event');
  assert.equal(a.eventId, a.sourceEventId);
  assert.equal(b.eventId, b.sourceEventId);
});

test('the same source event id remains stable even if a later provider read would differ', async () => {
  const first = await A.resolveBillingAuthorityMutation(
    subscriptionEvent('evt_same', 'customer.subscription.updated', stripeSubscription()),
    ENV,
    async () => jsonResponse(stripeSubscription()),
    NOW,
  );
  const second = await A.resolveBillingAuthorityMutation(
    subscriptionEvent('evt_same', 'customer.subscription.updated', stripeSubscription()),
    ENV,
    async () => jsonResponse(stripeSubscription({ cancel_at_period_end: true })),
    NOW,
  );
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.subscription.cancelAtPeriodEnd, false);
  assert.equal(second.subscription.cancelAtPeriodEnd, true);
});

test('the latest object must still be the same subscription and the same user', async () => {
  await assert.rejects(
    A.resolveBillingAuthorityMutation(
      subscriptionEvent('evt_1', 'customer.subscription.updated', stripeSubscription()),
      ENV,
      async () => jsonResponse(stripeSubscription({ id: 'sub_other' })),
      NOW,
    ),
    (error) => error?.code === 'stripe_subscription_mismatch' && !String(error.message).includes('sk_test'),
  );
  await assert.rejects(
    A.resolveBillingAuthorityMutation(
      subscriptionEvent('evt_1', 'customer.subscription.updated', stripeSubscription()),
      ENV,
      async () => jsonResponse(stripeSubscription({ metadata: { userId: 'other-user', plan: 'builder' } })),
      NOW,
    ),
    (error) => error?.code === 'stripe_user_mismatch',
  );
});

test('subscription lookup failure is retriable and never reflects provider bodies or secrets', async () => {
  const secretBody = `upstream refused ${ENV.STRIPE_SECRET_KEY}`;
  await assert.rejects(
    A.resolveBillingAuthorityMutation(
      subscriptionEvent('evt_1', 'customer.subscription.updated', stripeSubscription()),
      ENV,
      async () => new Response(secretBody, { status: 503, headers: { 'content-type': 'text/plain' } }),
      NOW,
    ),
    (error) => {
      assert.equal(error.code, 'stripe_subscription_unavailable');
      assert.equal(error.status, 502);
      assert.doesNotMatch(String(error.message), /sk_test|upstream refused/);
      return true;
    },
  );
});

test('subscription lookup is bounded and JSON-only', async () => {
  await assert.rejects(
    A.resolveBillingAuthorityMutation(
      subscriptionEvent('evt_1', 'customer.subscription.updated', stripeSubscription()),
      ENV,
      async () => new Response('{}', { status: 200, headers: { 'content-type': 'text/html' } }),
      NOW,
    ),
    (error) => error?.code === 'stripe_subscription_invalid',
  );
  await assert.rejects(
    A.resolveBillingAuthorityMutation(
      subscriptionEvent('evt_1', 'customer.subscription.updated', stripeSubscription()),
      ENV,
      async () => new Response(JSON.stringify({ padding: 'x'.repeat(A.STRIPE_SUBSCRIPTION_MAX_BYTES) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      NOW,
    ),
    (error) => error?.code === 'stripe_subscription_too_large',
  );

  let cancelled = false;
  const oversized = new ReadableStream({
    start() {},
    cancel() { cancelled = true; },
  });
  await assert.rejects(
    A.resolveBillingAuthorityMutation(
      subscriptionEvent('evt_1', 'customer.subscription.updated', stripeSubscription()),
      ENV,
      async () => new Response(oversized, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': String(A.STRIPE_SUBSCRIPTION_MAX_BYTES + 1),
        },
      }),
      NOW,
    ),
    (error) => error?.code === 'stripe_subscription_too_large',
  );
  await Promise.resolve();
  assert.equal(cancelled, true, 'a rejected provider body must be cancelled instead of left streaming');

  let fragmentCancelled = false;
  const fragmentedForever = new ReadableStream({
    pull(controller) { controller.enqueue(Uint8Array.of(0x20)); },
    cancel() { fragmentCancelled = true; },
  });
  await assert.rejects(
    A.resolveBillingAuthorityMutation(
      subscriptionEvent('evt_fragments', 'customer.subscription.updated', stripeSubscription()),
      ENV,
      async () => new Response(fragmentedForever, { status: 200, headers: { 'content-type': 'application/json' } }),
      NOW,
    ),
    (error) => error?.code === 'stripe_subscription_invalid' && /read limit/.test(String(error.message)),
  );
  await Promise.resolve();
  assert.equal(fragmentCancelled, true, 'an endless small-chunk body must stop at the read-count bound');

  const originalSetTimeout = globalThis.setTimeout;
  let timeoutCancelled = false;
  try {
    globalThis.setTimeout = (fn) => {
      queueMicrotask(fn);
      return 1;
    };
    const stalled = new ReadableStream({
      start() {},
      cancel() { timeoutCancelled = true; },
    });
    await assert.rejects(
      A.resolveBillingAuthorityMutation(
        subscriptionEvent('evt_timeout', 'customer.subscription.updated', stripeSubscription()),
        ENV,
        async () => new Response(stalled, { status: 200, headers: { 'content-type': 'application/json' } }),
        NOW,
      ),
      (error) => error?.code === 'stripe_subscription_timeout' && !String(error.message).includes(ENV.STRIPE_SECRET_KEY),
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
  await Promise.resolve();
  assert.equal(timeoutCancelled, true, 'deadline abort cancels the unread provider body');
});

test('a credit purchase never calls Stripe again and requires Stripe event identity', async () => {
  let calls = 0;
  const event = {
    id: 'evt_credit',
    type: 'checkout.session.completed',
    data: { object: { payment_status: 'paid', metadata: { userId: USER_ID, credits: '500' } } },
  };
  const mutation = await A.resolveBillingAuthorityMutation(event, ENV, async () => { calls += 1; throw new Error('unused'); }, NOW);
  assert.equal(calls, 0);
  assert.deepEqual(mutation, {
    version: 1,
    kind: 'credits',
    userId: USER_ID,
    eventId: 'evt_credit',
    sourceEventId: 'evt_credit',
    credits: 500,
  });

  const missingId = structuredClone(event);
  delete missingId.id;
  await assert.rejects(
    A.resolveBillingAuthorityMutation(missingId, ENV, async () => { throw new Error('unused'); }, NOW),
    (error) => error?.code === 'stripe_event_id_missing',
  );
});

test('quota delivery carries only the normalized mutation, never Stripe credentials', () => {
  const mutation = {
    version: 1,
    kind: 'credits',
    userId: USER_ID,
    eventId: 'evt_credit',
    sourceEventId: 'evt_credit',
    credits: 500,
    authoritySequence: 7,
  };
  const request = A.quotaRequestForBillingMutation(mutation);
  assert.equal(request.url, 'https://do/billing-replica');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(request.init.body), { mutation });
  assert.doesNotMatch(JSON.stringify(request), /sk_|whsec_|authorization|cookie/i);
});

test('a DO must answer 2xx JSON with ok:true or the webhook remains failed', async () => {
  const mutation = {
    version: 1,
    kind: 'credits',
    userId: USER_ID,
    eventId: 'evt_credit',
    sourceEventId: 'evt_credit',
    credits: 500,
    authoritySequence: 3,
  };
  for (const [name, fetcher] of [
    ['throw', async () => { throw new Error('socket broke sk_hidden'); }],
    ['status', async () => jsonResponse({ ok: true, secret: 'sk_hidden' }, { status: 503 })],
    ['shape', async () => jsonResponse({ ok: false, secret: 'sk_hidden' })],
    ['json', async () => new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } })],
  ]) {
    await assert.rejects(
      A.deliverBillingMutation({ fetch: fetcher }, mutation, 'golem'),
      (error) => {
        assert.equal(error.code, 'quota_delivery_failed', name);
        assert.equal(error.status, 503, name);
        assert.doesNotMatch(String(error.message), /sk_hidden|socket broke/, name);
        return true;
      },
    );
  }
});

test('partial delivery is retried: authority replay never suppresses the replica attempt', async () => {
  const mutation = {
    version: 1,
    kind: 'subscription',
    userId: USER_ID,
    eventId: 'evt_sub',
    sourceEventId: 'evt_sub',
    plan: 'builder',
    customerId: 'cus_1',
    subscription: {
      plan: 'builder', customerId: 'cus_1', subscriptionId: 'sub_1', itemId: 'si_1', status: 'active',
      currentPeriodEnd: NOW + 86_400, cancelAtPeriodEnd: false,
    },
    authoritySequence: 9,
  };
  let replicaCalls = 0;
  const replica = {
    async fetch() {
      replicaCalls += 1;
      return replicaCalls === 1
        ? jsonResponse({ ok: false }, { status: 503 })
        : jsonResponse({ ok: true, replayed: false, stale: false, authoritySequence: 9 });
    },
  };

  await assert.rejects(A.deliverBillingMutation(replica, mutation, 'golem'));
  const recovered = await A.deliverBillingMutation(replica, mutation, 'golem');
  assert.equal(recovered.ok, true);
  assert.equal(replicaCalls, 2, 'no shared event-id latch may suppress the second target attempt');
});

test('an authority reply is also treated as a DO transport contract', async () => {
  const mutation = {
    version: 1,
    kind: 'credits',
    userId: USER_ID,
    eventId: 'evt_credit',
    sourceEventId: 'evt_credit',
    credits: 100,
    authoritySequence: 4,
  };
  const accepted = await A.invokeBillingAuthority(
    { fetch: async () => jsonResponse({ ok: true, replayed: true, mutation }) },
    { id: 'evt_credit' },
  );
  assert.equal(accepted.replayed, true);
  assert.deepEqual(accepted.mutation, mutation);

  await assert.rejects(
    A.invokeBillingAuthority(
      { fetch: async () => jsonResponse({ ok: true, mutation: { ...mutation, credits: -1 } }) },
      { id: 'evt_credit' },
    ),
    (error) => error?.code === 'quota_authority_invalid',
  );

  for (const [name, body] of [
    ['missing both acknowledgement fields', { ok: true }],
    ['missing mutation', { ok: true, replayed: false }],
    ['missing replayed', { ok: true, mutation: null }],
    ['wrong replayed shape', { ok: true, replayed: 'false', mutation: null }],
    ['replayed null cannot describe a stored replay', { ok: true, replayed: true, mutation: null }],
  ]) {
    await assert.rejects(
      A.invokeBillingAuthority({ fetch: async () => jsonResponse(body) }, { id: 'evt_ignored' }),
      (error) => error?.code === 'quota_authority_invalid',
      name,
    );
  }

  await assert.rejects(
    A.invokeBillingAuthority(
      { fetch: async () => jsonResponse({
        ok: true,
        replayed: false,
        mutation: { ...mutation, eventId: 'evt_other', sourceEventId: 'evt_other' },
      }) },
      { id: 'evt_credit' },
    ),
    (error) => error?.code === 'quota_authority_invalid',
    'a structurally valid mutation for another source event is not this acknowledgement',
  );

  const intentionalNoop = await A.invokeBillingAuthority(
    { fetch: async () => jsonResponse({ ok: true, replayed: false, mutation: null }) },
    { id: 'evt_ignored' },
  );
  assert.deepEqual(intentionalNoop, { ok: true, replayed: false, mutation: null });
});

test('QuotaDO authority serialises subscription reads across an external await and sequences them monotonically', async () => {
  const q = quota();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  let releaseFirst;
  let markFirstStarted;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const current = stripeSubscription({
    items: { data: [{ id: 'si_1', price: { id: 'price_studio' } }] },
  });

  globalThis.fetch = async () => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (calls === 1) {
      markFirstStarted();
      await firstGate;
    }
    active -= 1;
    return jsonResponse(current);
  };

  try {
    const firstPromise = q.request('/billing-authority', {
      event: subscriptionEvent('evt_newer_delivery', 'customer.subscription.updated', stripeSubscription()),
    });
    await firstStarted;
    const secondPromise = q.request('/billing-authority', {
      event: subscriptionEvent('evt_older_delivery', 'customer.subscription.updated', stripeSubscription({ status: 'past_due' })),
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls, 1, 'the second Stripe GET must not begin while the first authority request yielded');

    releaseFirst();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.json.mutation.authoritySequence, 1);
    assert.equal(second.json.mutation.authoritySequence, 2);
    assert.equal(maxActive, 1, 'per-user authority work must have at most one Stripe read in flight');
    assert.equal((await q.billing()).plan, 'studio', 'both deliveries resolve from current Stripe state');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('replica refuses an older subscription sequence without discarding an out-of-order credit purchase', async () => {
  const q = quota();
  const newest = sequencedSubscription(2, 'evt_sub_new', 'studio');
  const older = sequencedSubscription(1, 'evt_sub_old', 'builder');

  const applied = await q.request('/billing-replica', { mutation: newest });
  assert.equal(applied.status, 200);
  assert.equal(applied.json.stale, false);
  assert.equal(applied.json.authoritySequence, 2);

  const stale = await q.request('/billing-replica', { mutation: older });
  assert.equal(stale.status, 200, 'newer state already converged, so Stripe does not need a retry loop');
  assert.equal(stale.json.stale, true);
  assert.equal(stale.json.authoritySequence, 2);
  assert.equal((await q.billing()).plan, 'studio', 'late sequence 1 cannot roll sequence 2 backwards');
  const staleAck = await A.deliverBillingMutation(q.target, older, 'golem');
  assert.equal(staleAck.stale, true, 'the main webhook helper treats already-superseded state as converged');

  const credit = {
    version: 1,
    kind: 'credits',
    userId: USER_ID,
    eventId: 'evt_credit_before_sub',
    sourceEventId: 'evt_credit_before_sub',
    credits: 250,
    authoritySequence: 1,
  };
  const creditApplied = await q.request('/billing-replica', { mutation: credit });
  assert.equal(creditApplied.status, 200);
  assert.equal(creditApplied.json.stale, false, 'additive credits are not replaced by subscription ordering');
  assert.equal((await q.state()).credits, 250);

  const creditReplay = await q.request('/billing-replica', { mutation: credit });
  assert.equal(creditReplay.json.replayed, true);
  assert.equal((await q.state()).credits, 250, 'one purchase remains one grant');
});

test('same Stripe event returns the exact stored mutation after replica response loss and never grants twice', async () => {
  const authority = quota();
  const replica = quota();
  const event = {
    id: 'evt_credit_retry',
    type: 'checkout.session.completed',
    data: { object: { payment_status: 'paid', metadata: { userId: USER_ID, credits: '500' } } },
  };

  const first = await authority.request('/billing-authority', { event });
  assert.equal(first.status, 200);
  assert.equal(first.json.replayed, false);
  assert.equal(first.json.mutation.authoritySequence, 1);
  assert.equal((await authority.state()).credits, 500);

  let loseResponse = true;
  const lossyReplica = {
    async fetch(input, init) {
      const response = await replica.target.fetch(input, init);
      if (loseResponse) {
        loseResponse = false;
        throw new Error('response lost after replica commit');
      }
      return response;
    },
  };
  await assert.rejects(
    A.deliverBillingMutation(lossyReplica, first.json.mutation, 'golem'),
    (error) => error?.code === 'quota_delivery_failed',
  );
  assert.equal((await replica.state()).credits, 500, 'the first replica call committed before its response was lost');

  const retry = await authority.request('/billing-authority', { event });
  assert.equal(retry.status, 200);
  assert.equal(retry.json.replayed, true);
  assert.deepEqual(retry.json.mutation, first.json.mutation, 'retry must not allocate a new sequence or re-resolve');
  assert.equal((await authority.state()).credits, 500, 'authority replay cannot grant again');

  const recovered = await A.deliverBillingMutation(replica.target, retry.json.mutation, 'golem');
  assert.equal(recovered.ok, true);
  assert.equal(recovered.replayed, true);
  assert.equal((await replica.state()).credits, 500, 'replica replay cannot grant again');
});

test('rollout preserves prior credit idempotency from the legacy direct webhook path', async () => {
  const q = quota();
  const event = {
    id: 'evt_already_applied',
    type: 'checkout.session.completed',
    data: { object: { payment_status: 'paid', metadata: { userId: USER_ID, credits: '300' } } },
  };

  const legacy = await q.request('/grant-credits', { credits: 300, eventId: event.id });
  assert.equal(legacy.json.granted, 300);
  const authority = await q.request('/billing-authority', { event });
  assert.equal(authority.status, 200);
  assert.equal(authority.json.mutation.eventId, event.id);
  assert.equal((await q.state()).credits, 300, 'authority uses the legacy Stripe id instead of inventing a second grant key');
});

test('billing authority leaves dunning-only events inert for entitlement while allowing the route to notify separately', async () => {
  const q = quota();
  const before = await q.state();
  const dunning = await q.request('/billing-authority', {
    event: {
      id: 'evt_failed_invoice',
      type: 'invoice.payment_failed',
      data: { object: { metadata: { userId: USER_ID }, status: 'open' } },
    },
  });
  assert.equal(dunning.status, 200);
  assert.equal(dunning.json.mutation, null);
  assert.deepEqual(await q.state(), before);
});
