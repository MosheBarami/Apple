// Sentry page backend: no network. fetch is a fake Sentry that answers by URL path; the token is a
// sentinel and no return value may ever contain it. Writes are only ever dry-run here.
//   node --test scripts/owner-dashboard/cc/sentry.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SENTINEL = 'SECRET_SENTINEL_SENTRY';
Object.assign(process.env, { SENTRY_AUTH_TOKEN: SENTINEL, SENTRY_ORG: 'test-org', SENTRY_BASE: 'https://sentry.test' });

// Markers the monitored app could put in an event; none of them may reach the page.
const LEAK = { vars: 'LEAK_VARS', request: 'LEAK_REQUEST', user: 'LEAK_USER', crumb: 'LEAK_BREADCRUMB', cookie: 'LEAK_COOKIE',
  bearer: 'eyJhbGciOiJIUzI1NiJ9abcdef', query: 'LEAK_QUERY_TOKEN', key: 'sk_live_LEAKKEY12345' };

const day = (i) => `2026-09-${String(10 + i).padStart(2, '0')}T00:00:00Z`;
const FIX = {
  '/projects/': [{ id: '11', slug: 'web', name: 'web', platform: 'javascript', firstEvent: day(0), firstTransactionEvent: false, hasSessions: false }],
  '/issues/': [
    { id: '101', shortId: 'WEB-1', title: 'TypeError: x is undefined', count: '40', userCount: 3, level: 'error', priority: 'high',
      substatus: 'regressed', project: { slug: 'web' }, stats: { '14d': Array.from({ length: 14 }, (_, i) => [i, i]) } },
    { id: '102', shortId: 'WEB-2', title: 'ReferenceError: y', count: '2', userCount: 1, level: 'warning', priority: 'low', project: { slug: 'web' } },
  ],
  '/releases/': [{ version: 'web@1.0.0', projects: [{ slug: 'web', hasHealthData: false }] }],
  '/stats_v2/': { intervals: [day(0), day(1)], groups: [
    { by: { category: 'error', outcome: 'accepted' }, totals: { 'sum(quantity)': 42 }, series: { 'sum(quantity)': [40, 2] } },
    { by: { category: 'error', outcome: 'rate_limited' }, totals: { 'sum(quantity)': 7 }, series: { 'sum(quantity)': [0, 7] } },
  ] },
  '/workflows/': [{ id: '5', name: 'Default', enabled: true, triggers: { conditions: [{ type: 'first_seen_event' }] }, actionFilters: [{ actions: [{ type: 'email' }] }] }],
  '/detectors/': [{ id: '6', name: 'Errors', type: 'error', enabled: true, projectId: '11', workflowIds: ['5'] }],
  '/monitors/': [],
  '/events/latest/': {
    eventID: 'e1', dateCreated: day(1),
    entries: [
      { type: 'exception', data: { values: [{ type: 'TypeError', value: `failed with Bearer ${LEAK.bearer} and ${LEAK.key}`,
        stacktrace: { frames: [{ filename: 'app.js', function: 'run', lineNo: 3, inApp: true,
          vars: { secret: LEAK.vars }, context: [[3, `fetch("/x?token=${LEAK.query}")`]] }] } }] } },
      { type: 'request', data: { url: 'https://app.test/', cookies: LEAK.cookie, data: LEAK.request } },
      { type: 'breadcrumbs', data: { values: [{ message: LEAK.crumb }] } },
    ],
    user: { email: LEAK.user, ip_address: LEAK.user },
    tags: [{ key: 'url', value: `https://app.test/page?token=${LEAK.query}` }, { key: 'environment', value: 'production' },
      { key: 'user.email', value: LEAK.user }],
  },
};

let mode = 'fixture';
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const a = init.headers?.authorization || '';
  calls.push({ url: String(url), method: init.method || 'GET', auth: a });
  if (mode === 'throw') throw Object.assign(new Error(`boom ${a}`), { name: 'TypeError' });
  if (mode === '500') return new Response(`upstream crashed; you sent ${a}`, { status: 500 });
  if (mode === '401' || mode === '403') return new Response(JSON.stringify({ detail: `bad token ${a}` }), { status: Number(mode) });
  const hit = Object.keys(FIX).sort((x, y) => y.length - x.length).find((p) => u.pathname.endsWith(p));
  return new Response(JSON.stringify(hit ? FIX[hit] : { detail: 'not found' }), { status: hit ? 200 : 404, headers: { 'content-type': 'application/json' } });
};

const { sentry, sentryAction, sentryConclusions, eventOf } = await import('./platforms/sentry.mjs');
const { uncache } = await import('./http.mjs');

beforeEach(() => { mode = 'fixture'; calls.length = 0; uncache('sentry'); process.env.SENTRY_AUTH_TOKEN = SENTINEL; });

test('read: issues, projects, releases, volume, alerts and the latest event come back shaped', async () => {
  const r = await sentry();
  assert.equal(r.ok, true);
  assert.equal(r.configured, true);
  assert.deepEqual(r.issues.map((i) => i.shortId), ['WEB-1', 'WEB-2']);
  assert.equal(r.issues[0].count, 40);
  assert.equal(r.issues[0].trend.length, 14, 'the trend is 14 daily buckets');
  assert.equal(r.projects[0].slug, 'web');
  assert.equal(r.releases[0].projects[0].crashFreeSessions, null, 'no health data is not a 0% crash-free rate');
  assert.equal(r.volume.total.error.rate_limited, 7);
  assert.equal(r.workflows[0].alertsOnErrors, true);
  assert.equal(r.detectors[0].project, 'web');
  assert.equal(r.events['101'].exceptions[0].frames[0].fn, 'run');
  assert.ok(calls.some((c) => c.url.includes('groupStatsPeriod=14d')), 'asks for 14 daily trend buckets');
  assert.ok(calls.every((c) => c.method === 'GET'), 'a read never writes');
  assert.ok(calls.every((c) => c.auth === `Bearer ${SENTINEL}`), 'the token goes to Sentry');
  assert.ok(r.conclusions.length >= 2 && r.conclusions.length <= 4);
});

test('read: event text never forwards vars, request, user, breadcrumbs or credential-shaped strings', async () => {
  const s = JSON.stringify(await sentry());
  for (const [k, v] of Object.entries(LEAK)) assert.ok(!s.includes(v), `${k} leaked`);
  assert.ok(!s.includes(SENTINEL));
  const ev = eventOf(FIX['/events/latest/']); const direct = JSON.stringify(ev);
  for (const [k, v] of Object.entries(LEAK)) assert.ok(!direct.includes(v), `${k} leaked from eventOf`);
  assert.deepEqual(ev.tags.map((t) => t.k).sort(), ['environment', 'url'], 'tags come from an allowlist');
  assert.equal(ev.tags.find((t) => t.k === 'url').v, 'https://app.test/page', 'the url tag loses its query');
});

test('read: not configured names what is missing and makes no call', async () => {
  delete process.env.SENTRY_AUTH_TOKEN;
  const r = await sentry();
  assert.equal(r.ok, true);
  assert.equal(r.configured, false);
  assert.ok(r.how.includes('SENTRY_AUTH_TOKEN'));
  assert.equal(calls.length, 0);
});

test('read: every upstream failure is a failure, never data, and never carries the token', async () => {
  for (const m of ['401', '403', '500', 'throw']) {
    mode = m; uncache('sentry'); calls.length = 0;
    const r = await sentry();
    assert.equal(r.ok, false, `${m} must not render as data`);
    assert.equal(typeof r.reason, 'string');
    assert.ok(!JSON.stringify(r).includes(SENTINEL), `${m} leaked the token`);
    assert.ok(calls.length > 0);
  }
});

test('actions: dry-run returns the pinned plan and makes no call', async () => {
  const r = await sentryAction({ kind: 'ignore', id: '77', dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.plan.method, 'PUT');
  assert.equal(r.plan.url, 'https://sentry.test/api/0/organizations/test-org/issues/?id=77');
  assert.equal(r.plan.body.status, 'ignored');
  for (const [kind, key] of [['resolve', 'status'], ['bookmark', 'isBookmarked'], ['seen', 'hasSeen'], ['priority-high', 'priority']]) {
    const p = await sentryAction({ kind, id: '77', dryRun: true });
    assert.ok(key in p.plan.body, kind);
  }
  assert.ok(!JSON.stringify(r).includes(SENTINEL));
  assert.equal(calls.length, 0);
});

test('actions: an unknown kind or a non-numeric id is refused before any call', async () => {
  for (const body of [{ kind: 'delete', id: '77' }, { kind: 'resolve', id: '77&status=x' }, { kind: 'resolve', id: '../1' },
    { kind: 'resolve', id: '1'.repeat(21) }, { kind: 'resolve' }]) {
    const r = await sentryAction({ ...body, dryRun: true });
    assert.equal(r.ok, false, JSON.stringify(body));
  }
  assert.equal(calls.length, 0);
});

test('conclusions: an empty, quiet org reads as good; noisy regressions and lost events read as bad/warn', () => {
  const quiet = sentryConclusions({ issues: [], volume: { total: { error: { accepted: 5 } }, errors: [] },
    workflows: [{ name: 'w', enabled: true, alertsOnErrors: true, actions: ['email'] }], detectors: [] });
  assert.deepEqual(quiet.map((c) => c.tone), ['good', 'good', 'good']);
  const loud = sentryConclusions({
    issues: [{ id: '1', shortId: 'A-1', title: 't', count: 9, priority: 'high', substatus: 'regressed' }],
    volume: { total: { error: { accepted: 5, rate_limited: 3 } }, errors: [{ day: '2026-09-12', rate_limited: 3 }] },
    workflows: [{ name: 'w', enabled: false, alertsOnErrors: true, actions: [] }], detectors: [],
    projects: [{ transactions: false }], releases: [],
  });
  const tone = Object.fromEntries(loud.map((c) => [c.k, c.tone]));
  assert.deepEqual(tone, { issues: 'bad', volume: 'warn', alerts: 'bad', health: 'info' });
  assert.ok(loud.length <= 4);
  assert.ok(sentryConclusions({ volume: { ok: false, reason: 'x' } }).some((c) => c.k === 'volume' && c.tone === 'info'),
    'a failed read is reported as unread, not as zero');
});
