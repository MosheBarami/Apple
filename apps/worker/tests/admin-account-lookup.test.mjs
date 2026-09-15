/**
 * LOOKING UP ONE ACCOUNT, from the admin surface, without a SQL console.
 *
 * Everything an operator needs to answer "what is going on with this customer" already existed and
 * none of it was reachable. QuotaDO has served a complete subscription record at `GET /billing`
 * since billing shipped; the credit ledger has recorded every charge with what it was for; the
 * event log carries every model call, build and error with the actor on it. There was no route that
 * took a user id, and the owner of this business does not use curl — so for him none of it existed.
 *
 * This is that route. The tests below are mostly not about the data arriving; they are about the
 * four ways a lookup like this lies:
 *
 *   1. A TYPO MINTS AN ACCOUNT. `QUOTA_DO.idFromName(x)` creates a Durable Object for any string
 *      you hand it. A mistyped id therefore answers with a brand-new empty DO: plan free, no
 *      credits, no history — which is indistinguishable, on screen, from a real customer on the
 *      free plan who has never spent. The route refuses an id that is not a user id at all.
 *   2. THE PROFILE IS NOT READABLE AND MUST SAY SO. `public.profiles` carries an own-row-only RLS
 *      policy and this worker holds no service key, so display name, admin flag and signup date
 *      cannot be read from here. Presenting the rest of the record with the profile silently
 *      missing invites the reader to believe they are looking at the whole account.
 *   3. USAGE MUST BE THIS ACTOR'S. A window filtered wrongly shows one customer another's spend.
 *   4. A CUT WINDOW MUST SAY IT WAS CUT. The event log keeps 5,000 rows; a busy week evicts the
 *      start of the window, and totals computed over what survived are floors, not measurements.
 *
 * Run with:  node --test tests/admin-account-lookup.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-admin-account-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

const ADMIN_KEY = 'a-high-entropy-admin-key';
const CUSTOMER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SOMEONE_ELSE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW = Date.now();

/** Which DO id each QuotaDO call was addressed to, so cross-tenant reads would be visible. */
let quotaAddressed = [];
/** What the event sink hands back for a window read. Set per test. */
let storedEvents = [];
let storedTruncated = false;

const modelCall = (actorId, over = {}) => ({
  kind: 'model_call', at: NOW - 3600_000, actorId, projectId: null, runId: null,
  provider: 'workers-ai', model: 'glm-5.3-flash', feature: 'agent:step', outcome: 'ok',
  latencyMs: 900, inputTokens: 100, outputTokens: 40, cachedInputTokens: 0, neurons: 1200, errorKind: null,
  ...over,
});
const buildEvent = (actorId, over = {}) => ({
  kind: 'build', at: NOW - 7200_000, actorId, projectId: 'p1', runId: 'r1',
  outcome: 'failed', steps: 4, opsApplied: 2, opsFailed: 1, durationMs: 45_000, neurons: 900,
  ...over,
});
const errorEvent = (actorId, over = {}) => ({
  kind: 'error', at: NOW - 1800_000, actorId, projectId: null, runId: null,
  scope: '/api/projects/:id/ws', errorKind: 'provider_timeout', message: 'upstream timed out', fatal: false,
  ...over,
});

const BILLING = {
  plan: 'builder',
  customerId: 'cus_test_1',
  subscription: { status: 'active', currentPeriodEnd: NOW + 10 * 864e5, cancelAtPeriodEnd: false },
  events: [{ at: NOW - 864e5, kind: 'plan', fromPlan: 'free', toPlan: 'builder', status: 'active', eventId: 'evt_1', cancelAtPeriodEnd: null }],
};
const LEDGER = {
  entries: [
    { id: 2, day: '2026-09-15', kind: 'build', credits: 7, at: NOW - 3600_000 },
    { id: 1, day: '2026-09-15', kind: 'chat', credits: 1, at: NOW - 7200_000 },
  ],
  total: 2, limit: 200, truncated: false, retentionDays: 35,
};
const STATE = { plan: 'builder', allowanceRemaining: 180, credits: 40, creditsUsedToday: 8 };

const quotaDo = () => ({
  idFromName: (n) => ({ toString: () => n, name: n }),
  idFromString: (n) => ({ toString: () => n, name: n }),
  get: (id) => ({
    async fetch(url) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      quotaAddressed.push({ id: id?.name ?? String(id), path: u.pathname });
      if (u.pathname === '/billing') return Response.json(BILLING);
      if (u.pathname === '/ledger') return Response.json(LEDGER);
      if (u.pathname === '/state') return Response.json(STATE);
      return Response.json({ error: 'not found' }, { status: 404 });
    },
  }),
});

const adminDo = () => ({
  idFromName: () => 'singleton',
  get: () => ({
    async fetch(url, init) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      if (u.pathname === '/events' && init?.method === 'POST') return Response.json({ ok: true, stored: 0, rejected: {} });
      if (u.pathname === '/events') {
        return Response.json({ events: storedEvents, retained: storedEvents.length, truncated: storedTruncated });
      }
      return Response.json({ counters: [] });
    },
  }),
});

const ENV = () => ({
  ADMIN_KEY,
  SUPABASE_URL: 'https://supa.account.test',
  SUPABASE_ANON_KEY: 'anon',
  ENVIRONMENT: 'test',
  ADMIN_DO: adminDo(),
  QUOTA_DO: quotaDo(),
  SESSION_DO: quotaDo(),
  PAIRING_DO: quotaDo(),
  BUDGET_DO: quotaDo(),
  DISCORD_DO: quotaDo(),
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
});
const CTX = { waitUntil() {}, passThroughOnException() {} };

async function lookup(id, { qs = '', key = ADMIN_KEY } = {}) {
  quotaAddressed = [];
  const headers = { 'CF-Connecting-IP': '198.51.100.9' };
  if (key !== null) headers['X-Admin-Key'] = key;
  const res = await app.fetch(new Request(`https://w/api/admin/account/${id}${qs}`, { headers }), ENV(), CTX);
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
}

test('CONTROL: the route exists and answers for a real user id', async () => {
  storedEvents = [];
  const { status, body } = await lookup(CUSTOMER);
  assert.equal(status, 200, `the lookup must answer: ${JSON.stringify(body)}`);
  assert.equal(body.userId, CUSTOMER);
});

test('it is behind the admin key like every other operator route', async () => {
  const { status } = await lookup(CUSTOMER, { key: null });
  assert.equal(status, 403, 'cross-tenant billing data must not be readable without the key');
});

test('A MISTYPED ID IS REFUSED, not answered with a freshly minted empty account', async () => {
  // QUOTA_DO.idFromName('bbbbbbbb') creates a Durable Object for that string and it answers like a
  // pristine free account. An operator reading that has been shown a fabricated customer.
  for (const bad of ['bbbbbbbb', 'not-a-uuid', '12345', 'bbbbbbbb-bbbb-4bbb-8bbb']) {
    const { status, body } = await lookup(bad);
    assert.equal(status, 400, `"${bad}" must be refused, got ${status}`);
    assert.equal(body.error, 'not_a_user_id');
  }
  assert.deepEqual(quotaAddressed, [], 'and no Durable Object may be touched on the way to refusing');
});

test('THE PROFILE IS DECLARED UNREADABLE rather than quietly left out', async () => {
  // profiles carries an own-row-only RLS policy and this worker holds no service key. The record
  // shown is therefore incomplete, and saying which part is missing is the difference between an
  // operator who knows what they are looking at and one who does not.
  const { body } = await lookup(CUSTOMER);
  assert.equal(body.profile.known, false, 'the profile half must not be presented as read');
  assert.equal(typeof body.profile.why, 'string', 'and must say why it could not be');
  assert.ok(body.profile.why.length > 0);
});

test('the subscription record comes through whole — status, period end and the cancel flag', async () => {
  const { body } = await lookup(CUSTOMER);
  assert.equal(body.billing.plan, 'builder');
  assert.equal(body.billing.customerId, 'cus_test_1');
  assert.equal(body.billing.subscription.status, 'active');
  assert.equal(body.billing.subscription.cancelAtPeriodEnd, false);
  assert.equal(body.billing.events.length, 1, 'and the change history with it');
});

test('the CHARGES come through as individual rows, with the window they were read over', async () => {
  const { body } = await lookup(CUSTOMER);
  assert.equal(body.credits.entries.length, 2);
  assert.equal(body.credits.entries[0].kind, 'build');
  assert.equal(body.credits.retentionDays, 35, 'an empty ledger is not a clean account — see quota.ts');
  assert.equal(body.credits.truncated, false);
});

test('every Durable Object read is addressed to the account asked about', async () => {
  await lookup(CUSTOMER);
  assert.ok(quotaAddressed.length >= 3, 'the lookup must actually read the DO');
  for (const c of quotaAddressed) assert.equal(c.id, CUSTOMER, 'no read may be addressed elsewhere');
});

test("USAGE IS THIS ACTOR'S — another customer's calls must not appear in it", async () => {
  storedEvents = [modelCall(CUSTOMER), modelCall(CUSTOMER), modelCall(SOMEONE_ELSE), modelCall(null)];
  const { body } = await lookup(CUSTOMER);
  assert.equal(body.usage.modelCalls.calls, 2, 'exactly the two that are theirs');
});

test('an account with no calls in the window reports no calls, not somebody else\'s', async () => {
  storedEvents = [modelCall(SOMEONE_ELSE)];
  const { body } = await lookup(CUSTOMER);
  assert.equal(body.usage.modelCalls, null, 'nothing of theirs in the window is not a zeroed row of theirs');
});

test('failed builds and errors for this actor are listed, so a complaint has something behind it', async () => {
  storedEvents = [buildEvent(CUSTOMER), buildEvent(SOMEONE_ELSE), errorEvent(CUSTOMER)];
  const { body } = await lookup(CUSTOMER);
  assert.equal(body.usage.builds.length, 1);
  assert.equal(body.usage.builds[0].outcome, 'failed');
  assert.equal(body.usage.errors.length, 1);
  assert.equal(body.usage.errors[0].errorKind, 'provider_timeout');
});

test('A CUT WINDOW SAYS SO — totals over an evicted log are floors, not measurements', async () => {
  storedEvents = [modelCall(CUSTOMER)];
  storedTruncated = true;
  const { body } = await lookup(CUSTOMER);
  assert.equal(body.usage.window.truncated, true, 'the reader must be told the window was incomplete');
  storedTruncated = false;
});

test('the window length is clamped rather than obeyed', async () => {
  storedEvents = [];
  assert.equal((await lookup(CUSTOMER, { qs: '?days=9999' })).body.usage.days, 30);
  assert.equal((await lookup(CUSTOMER, { qs: '?days=0' })).body.usage.days, 1);
  assert.equal((await lookup(CUSTOMER, { qs: '?days=nonsense' })).body.usage.days, 7, 'a garbled window falls back');
});

test('the quota state rides along, so "why can this person not build" is answerable', async () => {
  const { body } = await lookup(CUSTOMER);
  assert.equal(body.quota.allowanceRemaining, 180);
  assert.equal(body.quota.credits, 40);
});
