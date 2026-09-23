// Clerk page module: no network. fetch is a fake Backend API that records every request; the secret
// key is a sentinel that must never appear in any answer, plan or reason.
//   node --test scripts/owner-dashboard/cc/clerk.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clerk, clerkAction, keyMode, fapiHost, pickUser, derive } from './platforms/clerk.mjs';
import { uncache } from './http.mjs';

const SK = 'sk_test_clerk_SENTINEL_1234567890';
const PK = `pk_test_${Buffer.from('profound-stag-9988.clerk.accounts.dev$').toString('base64')}`;
const DAY = 86400000;
const NOW = Date.now();

let calls = [], handler = () => json({});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), ...init }); return handler(String(url), init); };

beforeEach(() => {
  delete process.env.CLERK_SECRET_KEY; delete process.env.CLERK_PUBLISHABLE_KEY; delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_WEBHOOK_SECRET;
  calls = []; handler = () => json({}); uncache('clerk');
});
const connect = () => { process.env.CLERK_SECRET_KEY = SK; process.env.CLERK_PUBLISHABLE_KEY = PK; };
const noSecret = (x, where) => {
  const s = JSON.stringify(x);
  assert.ok(!s.includes(SK), `the secret key leaked in ${where}`);
  assert.ok(!s.includes('SENTINEL'), `a fragment of the secret leaked in ${where}`);
};

// A realistic user with every field an admin table must NOT forward.
const rawUser = (i, { created = NOW - i * DAY, lastActive = created + 2 * DAY, lastSignIn = created + 2 * DAY, ...o } = {}) => ({
  id: `user_2abcdefghijk${String(i).padStart(4, '0')}`, object: 'user', first_name: `Name${i}`, last_name: 'Tester', username: null,
  image_url: 'https://img.clerk.com/abc', has_image: i % 2 === 0, primary_email_address_id: `idn_e${i}`, primary_phone_number_id: null,
  email_addresses: [{ id: `idn_e${i}`, email_address: `u${i}@example.com`, verification: { status: 'verified', strategy: 'email_code' } }],
  phone_numbers: [], external_accounts: i % 3 === 0 ? [{ provider: 'oauth_google', email_address: `u${i}@gmail.com`, approved_scopes: 'email profile' }] : [],
  web3_wallets: [{ web3_wallet: '0xDEADBEEFWALLET' }], passkeys: [], saml_accounts: [], enterprise_accounts: [],
  password_enabled: i % 3 !== 0, password_digest: '$2a$10$HASHHASH', two_factor_enabled: false, totp_enabled: false, backup_code_enabled: true,
  private_metadata: { stripe: 'cus_PRIVATE' }, unsafe_metadata: { note: 'UNSAFE' }, public_metadata: { plan: 'PUBLICMETA' },
  banned: false, locked: false, lockout_expires_in_seconds: null,
  created_at: created, updated_at: created, last_sign_in_at: lastSignIn, last_active_at: lastActive, ...o,
});

// The Backend API as the real instance answered it (shapes measured on 2026-09-23), with users.
function bapi(users, { orgs = 'disabled', total = users.length } = {}) {
  return (url) => {
    const u = new URL(url); const p = u.pathname.replace(/^\/v1/, '');
    if (p === '/instance') return json({ object: 'instance', id: 'ins_3Jk7abcdefghij', environment_type: 'development', allowed_origins: null, allowed_subdomains: [], subdomain_allowlist_enabled: false });
    if (p === '/users/count') return json({ object: 'total_count', total_count: total });
    if (p === '/users') {
      const off = +u.searchParams.get('offset') || 0; const lim = +u.searchParams.get('limit') || 10;
      if (users === 'gen') return json(Array.from({ length: Math.min(lim, total - off) }, (_, k) => rawUser(off + k, { created: NOW - DAY / 10 })));
      return json(users.slice(off, off + lim));
    }
    if (p === '/organizations') return orgs === 'disabled'
      ? json({ errors: [{ code: 'organization_not_enabled_in_instance', message: 'orgs off', long_message: SK }] }, 403)
      : json({ data: [{ id: 'org_2abc', name: 'Acme', slug: 'acme', members_count: 3, created_at: NOW, has_image: false, image_url: 'x', private_metadata: { x: 'ORGPRIVATE' } }], total_count: 1 });
    if (p === '/jwt_templates') return json([{ id: 'jtmp_1', name: 'supabase', claims: { secret: 'CLAIMSECRET' }, signing_key: 'SIGNINGKEY', signing_algorithm: 'HS256' }]);
    if (p === '/allowlist_identifiers') return json([{ identifier: 'a@example.com' }, { identifier: 'b@example.com' }]);
    if (p === '/blocklist_identifiers') return json({ data: [{ identifier: 'spam@example.com' }], total_count: 1 });
    if (p === '/domains') return json({ data: [{ id: 'dmn_1', name: 'profound.stag-9988.lcl.dev', is_satellite: false, frontend_api_url: 'https://profound-stag-9988.clerk.accounts.dev', accounts_portal_url: 'https://profound-stag-9988.accounts.dev' }], total_count: 1 });
    if (p === '/redirect_urls') return json([{ id: 'ru_1', url: 'https://example.com/cb' }]);
    if (p === '/invitations') return json([{ id: 'inv_1', email_address: 'inv@example.com', status: 'pending' }]);
    if (p === '/waitlist_entries') return json({ data: [], total_count: 4 });
    if (p === '/saml_connections') return json({ data: [], total_count: 0 });
    if (p === '/oauth_applications') return json({ data: [{ id: 'oa_1', client_secret: 'OAUTHSECRET' }], total_count: 1 });
    if (p === '/templates/email') return json([{ slug: 'verification_code', enabled: true }, { slug: 'magic_link', enabled: false }]);
    if (p === '/sessions') return json([{ id: 'sess_2abcdefghijklm', user_id: u.searchParams.get('user_id'), status: 'active', created_at: NOW - DAY, last_active_at: NOW, expire_at: NOW + DAY,
      latest_activity: { browser_name: 'Chrome', device_type: 'Macintosh', is_mobile: false, city: 'Tel Aviv', country: 'IL', ip_address: '203.0.113.9' } }]);
    return json({ errors: [{ message: 'not found' }] }, 404);
  };
}

const FIX = [rawUser(0), rawUser(1, { banned: true }), rawUser(2, { locked: true, lockout_expires_in_seconds: 600 }), rawUser(3),
  rawUser(9, { lastActive: NOW - 9 * DAY + 60000, lastSignIn: NOW - 9 * DAY + 60000 }), rawUser(40)];

test('without CLERK_SECRET_KEY it says how to connect and makes no request', async () => {
  const r = await clerk();
  assert.equal(r.ok, true); assert.equal(r.configured, false); assert.match(r.how, /CLERK_SECRET_KEY/);
  assert.equal(calls.length, 0);
  const a = await clerkAction({ kind: 'ban', id: 'user_2abcdefghijk0001' });
  assert.equal(a.ok, false); assert.equal(calls.length, 0);
});

test('environment comes from the key prefix and the host from the publishable key, never echoing either', () => {
  assert.equal(keyMode('sk_test_x'), 'development'); assert.equal(keyMode('sk_live_x'), 'production'); assert.equal(keyMode('nope'), 'unknown');
  assert.equal(fapiHost(PK), 'profound-stag-9988.clerk.accounts.dev');
  assert.equal(fapiHost('pk_test_%%%'), null); assert.equal(fapiHost(`pk_test_${Buffer.from('<script>$').toString('base64')}`), null);
});

test('the payload: instance, whitelisted users, counts, sign-ups, config names, and the org-disabled reason', async () => {
  connect(); handler = bapi(FIX);
  const r = await clerk();
  assert.equal(r.ok, true); assert.equal(r.configured, true);
  assert.equal(r.instance.env, 'development'); assert.equal(r.instance.fapi, 'profound-stag-9988.clerk.accounts.dev');
  assert.equal(r.users.total, FIX.length); assert.equal(r.users.list.length, FIX.length);
  const u1 = r.users.list.find((u) => u.id.endsWith('0001'));
  assert.equal(u1.banned, true); assert.equal(u1.email, 'u1@example.com'); assert.equal(u1.name, 'Name1 Tester');
  assert.ok(r.users.list.find((u) => u.id.endsWith('0003')).providers.includes('google'));
  assert.equal(r.signups.days.length, 30); assert.equal(r.signups.capped, false);
  assert.equal(r.signups.days.reduce((a, d) => a + d.n, 0), 5, 'user 40 is older than 30 days');
  assert.equal(r.orgs.enabled, false); assert.match(r.orgs.reason, /Organizations/); assert.ok(!('error' in r.orgs));
  assert.deepEqual(r.config.jwt, ['supabase']);
  assert.equal(r.config.allowlist, 2); assert.equal(r.config.blocklist, 1); assert.equal(r.config.domains[0].name, 'profound.stag-9988.lcl.dev');
  assert.deepEqual(r.config.redirects, ['https://example.com/cb']);
  assert.equal(r.config.invitations, 1); assert.equal(r.config.waitlist, 4); assert.equal(r.config.oauthApps, 1);
  assert.deepEqual(r.config.emailTemplates, { total: 2, enabled: 1 });
  assert.equal(r.webhooks.readable, false); assert.equal(r.webhooks.localSecret, false);
  assert.ok(r.sessions.list.length > 0); assert.equal(r.sessions.list[0].city, 'Tel Aviv');
  assert.ok(Array.isArray(r.insights) && r.insights.length >= 4);
  // No write, ever, from a read.
  assert.ok(calls.every((c) => (c.method || 'GET') === 'GET'), 'a read sent a non-GET');
  assert.ok(calls.every((c) => c.url.startsWith('https://api.clerk.com/v1/')));
});

test('field whitelist: no metadata, password hash, backup codes, TOTP, wallets, claims, signing keys or IPs', async () => {
  connect(); handler = bapi(FIX, { orgs: 'on' });
  const s = JSON.stringify(await clerk());
  for (const bad of ['PRIVATE', 'UNSAFE', 'PUBLICMETA', 'HASHHASH', 'DEADBEEF', 'CLAIMSECRET', 'SIGNINGKEY', 'OAUTHSECRET', 'ORGPRIVATE', '203.0.113.9',
    'private_metadata', 'unsafe_metadata', 'backup_code', 'totp', 'web3_wallet', 'approved_scopes', 'gmail.com']) assert.ok(!s.includes(bad), `forwarded ${bad}`);
  const u = pickUser(rawUser(3));
  assert.deepEqual(Object.keys(u).sort(), ['banned', 'created', 'email', 'emailVerified', 'emails', 'id', 'image', 'lastActive', 'lastSignIn', 'locked',
    'lockoutSecs', 'methods', 'name', 'passkeys', 'phone', 'providers', 'twoFactor', 'username', 'wallets'].sort());
  assert.equal(u.wallets, 1, 'wallets are a count, never an address');
});

test('with organisations on, the list carries the members count', async () => {
  connect(); handler = bapi(FIX, { orgs: 'on' });
  const r = await clerk();
  assert.equal(r.orgs.enabled, true); assert.equal(r.orgs.list[0].members, 3); assert.equal(r.orgs.total, 1);
});

test('sign-ups: the scan stops at its cap and says so', async () => {
  connect(); handler = bapi('gen', { total: 5000 });
  const r = await clerk();
  const scans = calls.filter((c) => new URL(c.url).pathname === '/v1/users');
  assert.equal(scans.length, 4, 'four pages of 500 is the cap');
  assert.equal(r.signups.scanned, 2000); assert.equal(r.signups.capped, true); assert.equal(r.users.total, 5000);
  assert.ok(r.insights.some((x) => /2,000|2000/.test(x.detail || '')), 'an insight says the numbers cover only the scanned users');
});

test('insights are computed from the data, in Hebrew', () => {
  const users = [rawUser(1, { banned: true }), rawUser(2, { locked: true }), rawUser(3), rawUser(5), rawUser(8), rawUser(10, { lastActive: NOW - 10 * DAY + 5000, lastSignIn: NOW - 10 * DAY + 5000 })];
  const ins = derive({ env: 'development', users, total: users.length, capped: false, orgs: { enabled: false }, webhooks: { localSecret: false } }, NOW);
  const t = ins.map((x) => `${x.title} ${x.detail}`).join('\n');
  assert.match(t, /פיתוח/); // development instance
  assert.ok(ins.every((x) => /[֐-׿]/.test(x.title)), 'every title is Hebrew');
  const week = ins.find((x) => x.id === 'signups-week');
  assert.match(week.title, /4/); assert.match(week.title, /2/); // days 1,2,3,5 this week; 8,10 last week
  assert.equal(ins.find((x) => x.id === 'blocked').level, 'bad'); assert.match(ins.find((x) => x.id === 'blocked').title, /2/);
  assert.match(ins.find((x) => x.id === 'never-back').title, /1/);
  assert.match(ins.find((x) => x.id === 'top-method').title, /סיסמה/);
  const prod = derive({ env: 'production', users: [], total: 0, capped: false, orgs: { enabled: true }, webhooks: { localSecret: true } }, NOW);
  assert.ok(!prod.some((x) => /פיתוח/.test(x.title)));
  assert.ok(prod.some((x) => x.id === 'no-users'));
});

test('every write has a dry-run plan and sends nothing', async () => {
  connect();
  const cases = [['ban', 'user_2abcdefghijk0001', '/users/user_2abcdefghijk0001/ban'], ['unban', 'user_2abcdefghijk0001', '/users/user_2abcdefghijk0001/unban'],
    ['lock', 'user_2abcdefghijk0001', '/users/user_2abcdefghijk0001/lock'], ['unlock', 'user_2abcdefghijk0001', '/users/user_2abcdefghijk0001/unlock'],
    ['revoke-session', 'sess_2abcdefghijklm', '/sessions/sess_2abcdefghijklm/revoke']];
  for (const [kind, id, path] of cases) {
    const r = await clerkAction({ kind, id, dryRun: true });
    assert.equal(r.ok, true, kind); assert.equal(r.dryRun, true, kind);
    assert.equal(r.plan.method, 'POST'); assert.equal(r.plan.url, `https://api.clerk.com/v1${path}`);
    noSecret(r, `the ${kind} plan`);
  }
  assert.equal(calls.length, 0, 'a dry run reached the network');
});

test('ids are validated server-side and unknown or destructive kinds are refused', async () => {
  connect();
  for (const id of ['', 'user_', 'sess_2abcdefghijklm', 'user_../../instance', 'user_2abc def', 'user_2abcdefghijk0001?x=1', 'user_2abcdefghijk0001/ban', 42, null, 'org_2abcdefghijk'])
    assert.equal((await clerkAction({ kind: 'ban', id, dryRun: true })).ok, false, `accepted ${id}`);
  assert.equal((await clerkAction({ kind: 'revoke-session', id: 'user_2abcdefghijk0001', dryRun: true })).ok, false);
  for (const kind of ['delete', 'delete-user', 'impersonate', 'sign-in-token', 'update-instance', 'verify', '__proto__', 'constructor', undefined])
    assert.equal((await clerkAction({ kind, id: 'user_2abcdefghijk0001', dryRun: true })).ok, false, `accepted kind ${kind}`);
  assert.equal(calls.length, 0);
});

test('a real write posts to exactly one path, returns a whitelisted object, and says the user just signs in again', async () => {
  connect();
  handler = (url) => (url.includes('/sessions/') ? json({ id: 'sess_2abcdefghijklm', status: 'revoked', user_id: 'user_x', latest_activity: { ip_address: '203.0.113.9' } }) : json(rawUser(1, { banned: true })));
  const b = await clerkAction({ kind: 'ban', id: 'user_2abcdefghijk0001' });
  assert.equal(b.ok, true); assert.equal(b.user.banned, true); assert.ok(!JSON.stringify(b).includes('PRIVATE'));
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'POST'); assert.equal(calls[0].url, 'https://api.clerk.com/v1/users/user_2abcdefghijk0001/ban');
  const s = await clerkAction({ kind: 'revoke-session', id: 'sess_2abcdefghijklm' });
  assert.equal(s.ok, true); assert.match(s.note, /יתחבר שוב/); assert.ok(!JSON.stringify(s).includes('203.0.113.9'));
});

test('search and per-user sessions are validated reads', async () => {
  connect(); handler = bapi(FIX);
  const r = await clerkAction({ kind: 'search', q: 'u1@example.com' });
  assert.equal(r.ok, true); assert.ok(Array.isArray(r.users));
  const q = calls.map((c) => new URL(c.url)).find((u) => u.pathname === '/v1/users');
  assert.equal(q.searchParams.get('query'), 'u1@example.com');
  assert.ok(calls.every((c) => (c.method || 'GET') === 'GET'));
  for (const bad of ['x'.repeat(201), 'a\u0000b', { $ne: 1 }, ['a']]) assert.equal((await clerkAction({ kind: 'search', q: bad })).ok, false, `accepted query ${JSON.stringify(bad)}`);
  calls = [];
  const s = await clerkAction({ kind: 'sessions', id: 'user_2abcdefghijk0001' });
  assert.equal(s.ok, true); assert.equal(s.sessions[0].id, 'sess_2abcdefghijklm'); assert.ok(!JSON.stringify(s).includes('203.0.113.9'));
  assert.equal(new URL(calls[0].url).searchParams.get('user_id'), 'user_2abcdefghijk0001');
  assert.equal((await clerkAction({ kind: 'sessions', id: 'user_x&status=all' })).ok, false);
});

test('an upstream that echoes the Authorization header never gets the key into an answer', async () => {
  connect();
  const echo = (status) => (url, init) => json({ errors: [{ message: init.headers?.authorization, long_message: SK }], first_name: SK, email_addresses: [{ email_address: SK }] }, status);
  for (const status of [200, 401, 403, 422, 500]) {
    uncache('clerk'); handler = echo(status);
    noSecret(await clerk(), `the read at ${status}`);
    noSecret(await clerkAction({ kind: 'ban', id: 'user_2abcdefghijk0001' }), `the write at ${status}`);
    noSecret(await clerkAction({ kind: 'search', q: 'a' }), `the search at ${status}`);
    noSecret(await clerkAction({ kind: 'sessions', id: 'user_2abcdefghijk0001' }), `the sessions read at ${status}`);
  }
  uncache('clerk'); handler = () => { throw new Error(`boom ${SK}`); };
  noSecret(await clerk(), 'a thrown fetch'); noSecret(await clerkAction({ kind: 'unban', id: 'user_2abcdefghijk0001' }), 'a thrown write');
  // The Authorization header carries the key and only the header does.
  assert.ok(calls.every((c) => !c.url.includes(SK) && !String(c.body ?? '').includes(SK)));
});
