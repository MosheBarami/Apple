// Resend page backend: no network and no email. fetch is a fake Resend that answers by URL path; the
// key is a sentinel and no return value may ever contain it. Writes are only ever dry-run here.
//   node --test scripts/owner-dashboard/cc/resend.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SENTINEL = 'SECRET_SENTINEL_RESEND';
const OWNER = 'owner.person@example.test';
Object.assign(process.env, { RESEND_API_KEY: SENTINEL, OWNER_EMAIL: OWNER });

const DOM = '4dd369bc-aa82-4ff3-97de-514ae3000ee0';
const KEY_ID = 'LEAK_KEY_ID_91c2', KEY_TOKEN = 're_LEAKTOKEN_abcdef';
const FIX = {
  '/domains': { data: [{ id: DOM, name: 'mail.example.test', status: 'not_started', region: 'us-east-1', created_at: '2026-09-20 10:00:00.1+00' }] },
  [`/domains/${DOM}`]: { id: DOM, name: 'mail.example.test', status: 'not_started', open_tracking: false, click_tracking: false,
    records: [{ record: 'SPF', type: 'MX', name: 'send', status: 'not_started', ttl: 'Auto', priority: 10 }] },
  '/emails': { has_more: false, data: [
    { id: 'm1', to: ['alice.recipient@example.test'], from: 'a@mail.example.test', subject: 's1', created_at: '2026-09-23 20:03:08.57+00', last_event: 'delivered' },
    { id: 'm2', to: ['bob.recipient@example.test'], from: 'a@mail.example.test', subject: 's2', created_at: '2026-09-22 20:03:08.57+00', last_event: 'bounced' },
  ] },
  '/api-keys': { data: [{ id: KEY_ID, name: 'dashboard', token: KEY_TOKEN, created_at: '2026-09-01 00:00:00+00', last_used_at: '2026-09-23 00:00:00+00' }] },
  '/audiences': { data: [{ id: 'a1', name: 'General', created_at: '2026-09-01 00:00:00+00' }] },
  '/segments': { data: [] },
  '/contacts': { data: [{ id: 'c1', email: 'carol.contact@example.test' }], has_more: false },
  '/broadcasts': { data: [] },
  '/webhooks': { data: [{ id: 'w1', endpoint: 'https://hooks.example.test/in?secret=LEAK_HOOK_SECRET', status: 'enabled', events: ['email.sent'] }] },
};

let mode = 'fixture';
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const a = init.headers?.authorization || '';
  calls.push({ url: String(url), method: init.method || 'GET', auth: a });
  if (mode === 'throw') throw Object.assign(new Error(`boom ${a}`), { name: 'TypeError' });
  if (mode === '500') return new Response(`upstream crashed; you sent ${a}`, { status: 500 });
  if (mode === '401' || mode === '403') return new Response(JSON.stringify({ message: `bad key ${a}` }), { status: Number(mode) });
  const hit = FIX[u.pathname];
  return new Response(JSON.stringify(hit ?? { message: 'not found' }), { status: hit ? 200 : 404, headers: { 'content-type': 'application/json' } });
};

const { resend, resendAction, resendConclusions, maskEmail } = await import('./platforms/resend.mjs');
const { uncache } = await import('./http.mjs');

beforeEach(() => {
  mode = 'fixture'; calls.length = 0; uncache('resend');
  process.env.RESEND_API_KEY = SENTINEL; process.env.OWNER_EMAIL = OWNER;
});

test('read: no key names RESEND_API_KEY and makes no call', async () => {
  delete process.env.RESEND_API_KEY;
  const r = await resend();
  assert.equal(r.ok, true);
  assert.equal(r.configured, false);
  assert.deepEqual(r.missing, ['RESEND_API_KEY']);
  assert.equal(calls.length, 0);
});

test('read: domains with DNS records, emails with status, keys by name only, masked addresses', async () => {
  const r = await resend();
  assert.equal(r.ok, true);
  assert.equal(r.domains.items[0].status, 'not_started');
  assert.equal(r.domains.items[0].records[0].type, 'MX', 'the domain detail (DNS records) is merged in');
  assert.deepEqual(r.emails.items.map((e) => e.status), ['delivered', 'bounced']);
  assert.equal(r.emails.items[0].created, '2026-09-23T20:03:08.570Z', "Resend's date format is normalised to ISO");
  assert.deepEqual(Object.keys(r.keys.items[0]).sort(), ['created', 'lastUsed', 'name']);
  assert.equal(r.audiences.items.length, 1);
  assert.equal(r.contacts.count, 1);
  assert.equal(r.webhooks.items[0].host, 'hooks.example.test');
  assert.deepEqual(r.testEmail, { available: true, to: maskEmail(OWNER), from: 'onboarding@resend.dev' });
  assert.ok(calls.every((c) => c.method === 'GET'), 'a read never writes');
  assert.ok(calls.every((c) => c.auth === `Bearer ${SENTINEL}`));
  const s = JSON.stringify(r);
  for (const v of [SENTINEL, KEY_ID, KEY_TOKEN, OWNER, 'alice.recipient', 'bob.recipient', 'carol.contact', 'LEAK_HOOK_SECRET'])
    assert.ok(!s.includes(v), `${v} leaked`);
  assert.ok(r.conclusions.length >= 2 && r.conclusions.length <= 4);
});

test('read: every upstream failure is a failure, never data, and never carries the key', async () => {
  for (const m of ['401', '403', '500', 'throw']) {
    mode = m; uncache('resend'); calls.length = 0;
    const r = await resend();
    assert.equal(r.ok, false, `${m} must not render as data`);
    assert.equal(typeof r.reason, 'string');
    assert.ok(!JSON.stringify(r).includes(SENTINEL), `${m} leaked the key`);
    assert.ok(calls.length > 0);
  }
});

test('actions: dry-run verify and tracking return the plan and make no call', async () => {
  const v = await resendAction({ kind: 'verify-domain', id: DOM, dryRun: true });
  assert.deepEqual(v.plan, { method: 'POST', url: `https://api.resend.com/domains/${DOM}/verify`, body: null });
  const t = await resendAction({ kind: 'open-tracking', id: DOM, value: true, dryRun: true });
  assert.deepEqual(t.plan, { method: 'PATCH', url: `https://api.resend.com/domains/${DOM}`, body: { open_tracking: true } });
  const c = await resendAction({ kind: 'click-tracking', id: DOM, value: false, dryRun: true });
  assert.deepEqual(c.plan.body, { click_tracking: false });
  assert.ok(!JSON.stringify([v, t, c]).includes(SENTINEL));
  assert.equal(calls.length, 0);
});

test('actions: the test email goes only to OWNER_EMAIL, whatever the request says', async () => {
  const r = await resendAction({ kind: 'test-email', to: 'someone.else@evil.test', dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.plan.method, 'POST');
  assert.equal(r.plan.url, 'https://api.resend.com/emails');
  assert.deepEqual(r.plan.body.to, [OWNER]);
  assert.ok(!JSON.stringify(r).includes('evil.test'));
  const d = await resendAction({ kind: 'test-email', domain: 'mail.example.test', dryRun: true });
  assert.equal(d.plan.body.from, 'Apple HQ <noreply@mail.example.test>');
  assert.equal(calls.length, 0);
});

test('actions: without OWNER_EMAIL the test email is unavailable and names the key, even for a real send', async () => {
  for (const v of [undefined, '', 'not-an-address']) {
    if (v === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = v;
    for (const dryRun of [true, false]) {
      const r = await resendAction({ kind: 'test-email', to: 'someone.else@evil.test', dryRun });
      assert.equal(r.ok, false);
      assert.equal(r.unavailable, true);
      assert.deepEqual(r.missing, ['OWNER_EMAIL']);
    }
    uncache('resend');
    const read = await resend();
    assert.deepEqual(read.testEmail, { available: false, missing: ['OWNER_EMAIL'] });
  }
  assert.ok(calls.every((c) => c.method === 'GET' && !c.url.endsWith('/emails')), 'no send was attempted');
});

test('actions: a bad domain id, value, sender domain or kind is refused before any call', async () => {
  for (const body of [{ kind: 'verify-domain', id: 'x' }, { kind: 'verify-domain', id: `${DOM}/../../api-keys` },
    { kind: 'open-tracking', id: DOM, value: 'yes' }, { kind: 'test-email', domain: 'evil.test>, x@y.z' },
    { kind: 'test-email', domain: `${'a'.repeat(254)}.test` }, { kind: 'delete-domain', id: DOM }, {}]) {
    for (const dryRun of [true, false]) assert.equal((await resendAction({ ...body, dryRun })).ok, false, JSON.stringify(body));
  }
  assert.equal(calls.length, 0);
});

test('conclusions: no domain is bad, verified and delivered is good, a failed read is unread', () => {
  const empty = resendConclusions({ domains: { items: [] }, emails: { items: [] }, keys: { items: [] }, testEmail: { available: false } });
  assert.deepEqual(Object.fromEntries(empty.map((c) => [c.k, c.tone])), { domains: 'bad', emails: 'info', keys: 'warn', test: 'info' });
  const good = resendConclusions({ domains: { items: [{ name: 'm.test', status: 'verified' }] },
    emails: { items: [{ status: 'delivered' }] }, keys: { items: [{ lastUsed: '2026-09-23T00:00:00Z' }] }, testEmail: { available: true } },
  Date.parse('2026-09-23T12:00:00Z'));
  assert.deepEqual(Object.fromEntries(good.map((c) => [c.k, c.tone])), { domains: 'good', emails: 'good', keys: 'info' });
  const bounced = resendConclusions({ emails: { items: [{ status: 'delivered' }, { status: 'bounced' }] }, testEmail: { available: true } });
  assert.equal(bounced[0].tone, 'warn');
  const unread = resendConclusions({ domains: { ok: false, reason: 'r' }, emails: { ok: false, reason: 'r' }, testEmail: { available: true } });
  assert.ok(unread.every((c) => c.tone === 'info'), 'a failed read never renders as zero');
});

test('maskEmail keeps the domain and one letter', () => {
  assert.equal(maskEmail('moshe@gmail.com'), 'm***@gmail.com');
  assert.equal(maskEmail('nope'), null);
});
