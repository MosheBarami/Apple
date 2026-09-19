/** Signed public HTTP -> real QuotaDOs in two independent SQLite stores. No network or payments. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'apple-billing-webhook-authority-'));
const OUT = join(TMP, 'worker.mjs');
execFileSync(join(WORKER, 'node_modules/.bin/esbuild'), [
  join(WORKER, 'src/index.ts'), '--bundle', '--format=esm', '--target=es2022',
  `--alias:cloudflare:workers=${join(WORKER, 'tests/stubs/cloudflare-workers.mjs')}`,
  `--outfile=${OUT}`,
], { cwd: WORKER, stdio: 'pipe' });
const { default: APP, QuotaDO } = await import(`file://${OUT}`);
after(() => rmSync(TMP, { recursive: true, force: true }));

const USER = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';
const SECRET = 'whsec_local_fixture_only';
const later = () => Math.floor(Date.now() / 1000) + 86_400;
const subscription = (overrides = {}) => ({
  id: 'sub_fixture', customer: 'cus_fixture', status: 'active',
  current_period_end: later(), cancel_at_period_end: false,
  metadata: { userId: USER, plan: 'builder' },
  items: { data: [{ id: 'si_fixture', price: { id: 'price_builder' } }] },
  ...overrides,
});
const event = (id = 'evt_subscription', object = subscription(), type = 'customer.subscription.updated') =>
  ({ id, type, data: { object } });
const credit = (id = 'evt_credit') => ({
  id, type: 'checkout.session.completed',
  data: { object: { payment_status: 'paid', metadata: { userId: USER, credits: '500' } } },
});
const cursor = rows => ({
  toArray: () => rows,
  one: () => { assert.equal(rows.length, 1); return rows[0]; },
  [Symbol.iterator]: () => rows[Symbol.iterator](),
});

function fixture(t) {
  const dbs = [];
  const calls = [];
  const stripeCalls = [];
  const notifications = [];
  const faults = { apple: null, golem: null };
  let current = subscription();
  const namespace = name => {
    const objects = new Map();
    return {
      idFromName: value => value,
      get(id) {
        if (!objects.has(id)) {
          const db = new DatabaseSync(':memory:');
          dbs.push(db);
          const values = new Map();
          const storage = {
            get: async key => structuredClone(values.get(key)),
            put: async (key, value) => {
              if (typeof key === 'object') {
                for (const [k, v] of Object.entries(key)) values.set(k, structuredClone(v));
              } else values.set(key, structuredClone(value));
            },
            delete: async key => values.delete(key),
            sql: {
              exec(query, ...args) {
                if (!args.length && /;[\s\S]*\S/.test(query.trim().replace(/;\s*$/, ''))) {
                  db.exec(query);
                  return cursor([]);
                }
                return cursor(db.prepare(query).all(...args));
              },
            },
          };
          objects.set(id, new QuotaDO({ storage, blockConcurrencyWhile: fn => fn() }, env));
        }
        const object = objects.get(id);
        return {
          async fetch(input, init) {
            const request = input instanceof Request ? input : new Request(input, init);
            const path = new URL(request.url).pathname;
            const body = request.method === 'POST' ? await request.clone().json() : null;
            calls.push({ namespace: name, id, path, body });
            const run = () => object.fetch(request);
            return faults[name] && path.startsWith('/billing-')
              ? faults[name]({ request, run, body }) : run();
          },
        };
      },
    };
  };
  const passive = { idFromName: value => value, get: () => ({ fetch: async () => Response.json({ ok: true }) }) };
  const env = {
    ENVIRONMENT: 'test', SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture',
    STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: 'sk_test_local_fixture_only',
    STRIPE_PRICE_BUILDER: 'price_builder', STRIPE_PRICE_STUDIO: 'price_studio',
    BILLING_WORKER_NAME: 'apple',
    QUOTA_DO: namespace('apple'), LEGACY_QUOTA_DO: namespace('golem'),
    ADMIN_DO: passive, SESSION_DO: passive, PAIRING_DO: passive, BUDGET_DO: passive,
    KV: { get: async () => null, put: async () => {}, delete: async () => {} },
    CORPUS: {
      exec: async () => ({}), batch: async () => [],
      prepare(sql) {
        const statement = {
          bind(...args) { notifications.push({ sql, args }); return statement; },
          all: async () => ({ results: [] }), first: async () => null, run: async () => ({}),
        };
        return statement;
      },
    },
  };
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    stripeCalls.push({ url, method: init?.method });
    assert.equal(url, 'https://api.stripe.com/v1/subscriptions/sub_fixture', 'no real or unexpected request');
    assert.equal(init?.method, 'GET');
    return current instanceof Response ? current.clone() : Response.json(current);
  });
  t.after(() => { for (const db of dbs) db.close(); });
  return {
    env, calls, stripeCalls, notifications, faults,
    current: value => { current = value; },
    async read(name, path = '/billing', user = USER) {
      const ns = name === 'apple' ? env.QUOTA_DO : env.LEGACY_QUOTA_DO;
      return (await ns.get(ns.idFromName(user)).fetch(`https://do${path}`)).json();
    },
    async post(payload, overrides = {}, signatureValid = true, host = 'https://apple.test') {
      const raw = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`));
      const hex = Buffer.from(mac).toString('hex');
      const waited = [];
      const response = await APP.fetch(new Request(`${host}/api/billing/webhook`, {
        method: 'POST', headers: { 'content-type': 'application/json',
          'stripe-signature': `t=${timestamp},v1=${signatureValid ? hex : '0'.repeat(64)}` },
        body: raw,
      }), { ...env, ...overrides }, { waitUntil: promise => waited.push(promise), passThroughOnException() {} });
      const text = await response.text();
      await Promise.allSettled(waited);
      return { status: response.status, text, json: JSON.parse(text) };
    },
  };
}

test('signed subscription uses current Stripe state and converges both named SQLite namespaces', async t => {
  const f = fixture(t);
  f.current(subscription({ items: { data: [{ id: 'si_fixture', price: { id: 'price_studio' } }] } }));
  const r = await f.post(event());
  assert.equal(r.status, 200, r.text);
  assert.equal(f.stripeCalls.length, 1, 'actual authority, not old event snapshot');
  for (const name of ['apple', 'golem']) assert.equal((await f.read(name)).plan, 'studio');
  const authority = f.calls.find(c => c.path === '/billing-authority');
  const replica = f.calls.find(c => c.path === '/billing-replica');
  assert.equal(authority.namespace, 'apple');
  assert.equal(replica.namespace, 'golem');
  assert.equal(replica.id, USER);
  assert.equal(replica.body.mutation.eventId, event().id);
  assert.doesNotMatch(JSON.stringify(replica.body), /sk_test|whsec|authorization/i);
});

test('replica failure keeps HTTP failed; retry completes without granting either namespace twice', async t => {
  const f = fixture(t);
  let attempts = 0;
  f.faults.golem = async ({ run }) => {
    attempts++;
    if (attempts === 1) return Response.json({ ok: false }, { status: 503 });
    return run();
  };
  const failed = await f.post(credit());
  assert.equal(failed.status, 503, failed.text);
  assert.equal((await f.read('apple', '/state')).credits, 500);
  assert.equal((await f.read('golem', '/state')).credits, 0);
  const retry = await f.post(credit());
  assert.equal(retry.status, 200, retry.text);
  assert.equal(attempts, 2, 'authority replay must still attempt the replica');
  assert.equal((await f.read('apple', '/state')).credits, 500);
  assert.equal((await f.read('golem', '/state')).credits, 500);
  assert.equal(f.stripeCalls.length, 0, 'credits do not need a second provider request');
});

test('response loss after replica commit remains retryable and does not duplicate money', async t => {
  const f = fixture(t);
  let once = true;
  f.faults.golem = async ({ run }) => {
    const r = await run();
    if (once) { once = false; throw new Error('secret transport detail'); }
    return r;
  };
  const failed = await f.post(credit());
  assert.equal(failed.status, 503, failed.text);
  assert.doesNotMatch(failed.text, /secret transport detail/);
  assert.equal((await f.post(credit())).status, 200);
  for (const name of ['apple', 'golem']) assert.equal((await f.read(name, '/state')).credits, 500);
});

test('cancellation and expired-period snapshots revoke entitlement while preserving the purchased tier record', async t => {
  for (const override of [{ status: 'canceled' }, { current_period_end: 1 }]) {
    const f = fixture(t);
    f.current(subscription(override));
    const r = await f.post(event(`evt_lapsed_${JSON.stringify(override)}`));
    assert.equal(r.status, 200, r.text);
    for (const name of ['apple', 'golem']) {
      const billing = await f.read(name);
      assert.equal(billing.plan, 'free');
      assert.equal(billing.subscription.plan, 'builder', 'record is not a fabricated free purchase');
    }
  }
});

test('Stripe lookup failure never reports success and writes no entitlement to either namespace', async t => {
  const f = fixture(t);
  f.current(new Response('private provider detail', { status: 500 }));
  const r = await f.post(event());
  assert.equal(r.status, 503, r.text);
  assert.doesNotMatch(r.text, /private provider detail/);
  assert.equal(f.calls.filter(c => c.path === '/billing-replica').length, 0);
  assert.equal((await f.read('apple')).plan, 'free');
});

test('authority must acknowledge the exact actionable mutation, not just HTTP 200 or ok:true', async t => {
  const f = fixture(t);
  for (const body of [{ ok: false }, { ok: true }, { ok: true, replayed: false, mutation: null }]) {
    f.faults.apple = async () => Response.json(body);
    const r = await f.post(credit());
    assert.equal(r.status, 503, JSON.stringify(body) + r.text);
  }
  assert.equal(f.calls.filter(c => c.namespace === 'golem').length, 0);
});

test('authority cannot redirect replication to another user or a different Stripe event', async t => {
  const f = fixture(t);
  const valid = { version: 1, kind: 'credits', userId: USER, eventId: 'evt_credit',
    sourceEventId: 'evt_credit', credits: 500, authoritySequence: 1 };
  for (const overrides of [{ userId: OTHER }, { eventId: 'evt_other', sourceEventId: 'evt_other' },
    { credits: 900 }]) {
    f.faults.apple = async () => Response.json({ ok: true, replayed: false, mutation: { ...valid, ...overrides } });
    assert.equal((await f.post(credit())).status, 503);
  }
  assert.equal(f.calls.filter(c => c.namespace === 'golem').length, 0);
});

test('trusted deployment role and replica binding are required BEFORE authority applies money', async t => {
  const f = fixture(t);
  for (const overrides of [{ BILLING_WORKER_NAME: undefined }, { BILLING_WORKER_NAME: 'golem' },
    { LEGACY_QUOTA_DO: undefined }]) {
    assert.equal((await f.post(credit(), overrides, true, 'https://apple.moshe-barami111.workers.dev')).status, 503);
  }
  assert.equal(f.calls.length, 0, 'a request host cannot replace a deployment binding');
  assert.equal(f.stripeCalls.length, 0);
});

test('an invalid signature is rejected before authority, replica, or provider access', async t => {
  const f = fixture(t);
  assert.equal((await f.post(credit(), {}, false)).status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal(f.stripeCalls.length, 0);
});

test('expired checkout remains an intentional notification-only no-op', async t => {
  const f = fixture(t);
  const r = await f.post({ id: 'evt_expired', type: 'checkout.session.expired',
    data: { object: { id: 'cs_expired', metadata: { userId: USER } } } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.dunning, 'checkout_expired');
  assert.equal(f.calls.length, 0);
  assert.equal(f.stripeCalls.length, 0);
  assert.ok(f.notifications.some(n => /insert into notifications/i.test(n.sql) && n.args.includes(USER)));
});

test('only Apple binds the legacy quota namespace and both deployments declare their own role', () => {
  const config = name => JSON.parse(readFileSync(join(WORKER, name), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  const apple = config('wrangler.apple.jsonc');
  const golem = config('wrangler.jsonc');
  assert.equal(apple.vars.BILLING_WORKER_NAME, 'apple');
  assert.equal(golem.vars.BILLING_WORKER_NAME, 'golem');
  assert.deepEqual(apple.durable_objects.bindings.find(b => b.name === 'LEGACY_QUOTA_DO'),
    { name: 'LEGACY_QUOTA_DO', class_name: 'QuotaDO', script_name: 'golem' });
  assert.equal(golem.durable_objects.bindings.some(b => b.name === 'LEGACY_QUOTA_DO'), false);
});
