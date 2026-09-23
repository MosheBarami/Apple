// Vercel page API tests. No network: globalThis.fetch is a fake Vercel that answers per API path from
// fixtures, or echoes the caller's Authorization header back (200 / 403 / 500 / throw). The token is a
// sentinel; no result may ever contain it, and no env var VALUE may ever leave the module.
//   node --test scripts/owner-dashboard/cc/vercel.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SENTINEL = 'SECRET_SENTINEL_VERCEL_9f2';
const ENV_VALUE = 'ENV_VALUE_SENTINEL_77';
const TOKEN = `${SENTINEL}_tok`;
const TEAM = 'team_abcDEF123456';
process.env.VERCEL_TEAM_ID = TEAM;

const H = 3600000;
const T0 = Date.now();
const at = (hoursAgo) => T0 - hoursAgo * H;
const PRJ = 'prj_AppleWeb0000000001';
const PRJ2 = 'prj_Docs00000000000002';
const dep = (uid, o = {}) => ({ uid, name: 'apple-web', url: `${uid.slice(4, 12).toLowerCase()}-apple.vercel.app`, state: 'READY',
  readyState: 'READY', target: null, created: at(1), createdAt: at(1), buildingAt: at(1) + 1000, ready: at(1) + 61000,
  creator: { uid: 'u1', username: 'moshe' }, projectId: PRJ, inspectorUrl: `https://vercel.com/moshe/apple-web/${uid.slice(4)}`,
  source: 'git', meta: { githubCommitSha: 'abc1234def5678', githubCommitMessage: 'fix: header', githubCommitRef: 'main',
    githubCommitAuthorName: 'Moshe', githubCommitAuthorLogin: 'moshe' }, ...o });

// A healthy-looking account with two failed builds today and one misconfigured domain.
function fixtures() {
  return {
    '/v2/user': { user: { id: 'u1', username: 'moshe', name: 'Moshe', email: 'owner@example.com', avatar: 'ffff', defaultTeamId: TEAM } },
    [`/v2/teams/${TEAM}`]: { id: TEAM, slug: 'moshe-team', name: 'Moshe Team', avatar: null },
    '/v9/projects': { projects: [
      { id: PRJ, name: 'apple-web', framework: 'nextjs', nodeVersion: '22.x', createdAt: at(900), updatedAt: at(1),
        link: { type: 'github', org: 'moshe', repo: 'rbxai', productionBranch: 'main' }, live: false,
        env: [{ key: 'STRIPE_KEY', value: ENV_VALUE, type: 'encrypted' }],
        targets: { production: { id: 'dpl_Prod0000000000000001', url: 'prod1-apple.vercel.app', readyState: 'READY', createdAt: at(2), alias: ['apple.dev'] } } },
      { id: PRJ2, name: 'docs', framework: 'astro', nodeVersion: '20.x', createdAt: at(2000), updatedAt: at(300),
        link: { type: 'github', org: 'moshe', repo: 'docs', productionBranch: 'main' }, env: [{ key: 'X', value: ENV_VALUE }] },
    ] },
    '/v6/deployments': { deployments: [
      dep('dpl_Fail0000000000000001', { state: 'ERROR', readyState: 'ERROR', created: at(0.5), createdAt: at(0.5), ready: null,
        errorCode: 'BUILD_FAILED', errorMessage: 'Command "npm run build" exited with 1', target: null }),
      dep('dpl_Prod0000000000000001', { target: 'production', created: at(2), createdAt: at(2), readySubstate: 'PROMOTED', isRollbackCandidate: false }),
      dep('dpl_Fail0000000000000002', { state: 'ERROR', readyState: 'ERROR', created: at(5), createdAt: at(5), errorCode: 'BUILD_FAILED' }),
      dep('dpl_Prod0000000000000000', { target: 'production', created: at(50), createdAt: at(50), isRollbackCandidate: true }),
      dep('dpl_Old00000000000000001', { created: at(80), createdAt: at(80), state: 'ERROR', readyState: 'ERROR' }),
    ] },
    '/v5/domains': { domains: [
      { name: 'apple.dev', verified: true, serviceType: 'external', createdAt: at(5000), expiresAt: null, renew: null, boughtAt: null },
    ] },
    '/v4/aliases': { aliases: [{ alias: 'apple.dev', deploymentId: 'dpl_Prod0000000000000001', projectId: PRJ, createdAt: at(2) }] },
    [`/v9/projects/${PRJ}/domains`]: { domains: [
      { name: 'apple.dev', verified: true, redirect: null, gitBranch: null },
      { name: 'www.apple.dev', verified: true, redirect: 'apple.dev', gitBranch: null },
    ] },
    [`/v9/projects/${PRJ2}/domains`]: { domains: [{ name: 'docs.apple.dev', verified: false, redirect: null }] },
    [`/v10/projects/${PRJ}/env`]: { envs: [
      { id: 'e1', key: 'STRIPE_KEY', value: ENV_VALUE, decrypted: false, type: 'encrypted', target: ['production'], gitBranch: null, updatedAt: at(10) },
      { id: 'e2', key: 'NEXT_PUBLIC_URL', value: ENV_VALUE, type: 'plain', target: ['production', 'preview'], updatedAt: at(20) },
    ] },
    [`/v10/projects/${PRJ2}/env`]: { envs: [] },
    '/v6/domains/apple.dev/config': { misconfigured: false, configuredBy: 'A' },
    '/v6/domains/www.apple.dev/config': { misconfigured: true, configuredBy: null },
    '/v6/domains/docs.apple.dev/config': { misconfigured: false, configuredBy: 'CNAME' },
    '/v2/deployments/dpl_Fail0000000000000001/check-runs': { runs: [] },
    '/v2/deployments/dpl_Prod0000000000000001/check-runs': { runs: [{ id: 'cr1', name: 'Lighthouse', status: 'completed', conclusion: 'succeeded', blocks: 'build-ready', completedAt: at(1.9) }] },
  };
}

let mode = 'fixtures';
let fx = fixtures();
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const a = init.headers?.authorization || '';
  calls.push({ url: String(url), path: u.pathname, method: init.method || 'GET', body: init.body, auth: a });
  if (mode === 'throw') throw Object.assign(new Error(`boom ${a}`), { name: 'TypeError' });
  if (mode === 'echo500') return new Response(`upstream crashed; you sent ${a}`, { status: 500 });
  if (mode === 'echo403') return new Response(JSON.stringify({ error: { code: 'forbidden', message: `bad ${a}` } }), { status: 403 });
  if (mode === 'echo200') {
    // Identifiers stay valid (they are built into follow-up URLs); every display field echoes the header.
    const d = { uid: 'dpl_Echo0000000000000001', name: a, url: a, state: 'ERROR', target: 'production', created: at(1), errorCode: a, errorMessage: a,
      meta: { githubCommitMessage: a, githubCommitRef: a }, creator: { username: a }, inspectorUrl: a, projectId: PRJ };
    const body = { user: { username: a, name: a, email: a }, id: TEAM, slug: a, name: a, projects: [{ id: PRJ, name: a, framework: a, link: { repo: a, org: a } }],
      deployments: [d], domains: [{ name: 'echo.dev', verified: false }], aliases: [{ alias: a, deploymentId: d.uid }],
      envs: [{ key: a, value: a }], misconfigured: true, runs: [{ name: a, status: a, conclusion: 'failed' }], echo: a };
    return new Response(JSON.stringify(body), { status: 200 });
  }
  const hit = fx[u.pathname];
  if (!hit) return new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404 });
  return new Response(JSON.stringify(hit), { status: 200 });
};

const { uncache } = await import('./http.mjs');
const { vercel, vercelAction, insights } = await import('./platforms/vercel.mjs');

beforeEach(() => { mode = 'fixtures'; fx = fixtures(); calls.length = 0; process.env.VERCEL_TOKEN = TOKEN; process.env.VERCEL_TEAM_ID = TEAM; uncache('vercel'); });
const json = (x) => JSON.stringify(x);

// ---------------------------------------------------------------- not connected
test('without VERCEL_TOKEN: ok:false, says exactly what is missing, and sends zero requests', async () => {
  delete process.env.VERCEL_TOKEN;
  const r = await vercel();
  assert.equal(r.ok, false);
  assert.equal(r.configured, false);
  assert.deepEqual(r.need, ['VERCEL_TOKEN']);
  assert.match(r.reason, /VERCEL_TOKEN/);
  assert.equal(r.docs, 'https://vercel.com/account/tokens');
  assert.match(r.how, /vercel\.com\/account\/tokens/);
  assert.match(r.how, /VERCEL_TOKEN=/);
  assert.equal(r.insights.length, 1);
  assert.equal(r.insights[0].level, 'info');
  assert.match(r.insights[0].detail, /VERCEL_TOKEN/);
  assert.equal(calls.length, 0);
});

test('without VERCEL_TOKEN a real write is refused before any request', async () => {
  delete process.env.VERCEL_TOKEN;
  const r = await vercelAction({ kind: 'cancel', deploymentId: 'dpl_Fail0000000000000001' });
  assert.equal(r.ok, false);
  assert.equal(r.configured, false);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- shape
test('connected: projects, deployments, domains, aliases, checks and scope are mapped', async () => {
  const r = await vercel();
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.configured, true);
  assert.deepEqual(r.scope, { type: 'team', id: TEAM, slug: 'moshe-team', name: 'Moshe Team' });
  assert.equal(r.user.username, 'moshe');
  assert.equal(r.user.email, undefined, 'no email in the payload');
  const p = r.projects.find((x) => x.id === PRJ);
  assert.equal(p.name, 'apple-web');
  assert.equal(p.framework, 'nextjs');
  assert.equal(p.repo, 'moshe/rbxai');
  assert.equal(p.productionBranch, 'main');
  assert.equal(p.production.id, 'dpl_Prod0000000000000001');
  assert.deepEqual(p.domains.map((d) => d.name), ['apple.dev', 'www.apple.dev']);
  assert.equal(p.domains[1].misconfigured, true);
  assert.equal(p.domains[0].configuredBy, 'A');
  assert.equal(r.projects[0].id, PRJ, 'most recently updated first');
  const d = r.deployments[0];
  assert.equal(d.id, 'dpl_Fail0000000000000001');
  assert.equal(d.state, 'ERROR');
  assert.equal(d.errorCode, 'BUILD_FAILED');
  assert.equal(d.commit.sha, 'abc1234def5678');
  assert.equal(d.commit.ref, 'main');
  assert.equal(d.project, 'apple-web');
  const prod = r.deployments.find((x) => x.id === 'dpl_Prod0000000000000001');
  assert.equal(prod.target, 'production');
  assert.equal(prod.current, true, 'the deployment serving production is marked');
  assert.equal(prod.duration, 60000);
  assert.equal(r.deployments.find((x) => x.id === 'dpl_Prod0000000000000000').rollbackCandidate, true);
  assert.equal(r.domains[0].name, 'apple.dev');
  assert.equal(r.aliases[0].alias, 'apple.dev');
  assert.equal(r.checks['dpl_Prod0000000000000001'][0].name, 'Lighthouse');
  assert.deepEqual(r.errors, {});
  // every request is authenticated with Bearer and scoped to the team, and none is a write
  assert.ok(calls.length > 0);
  for (const c of calls) {
    assert.equal(c.method, 'GET');
    assert.equal(c.auth, `Bearer ${TOKEN}`);
    if (!/^\/v2\/(user|teams\/)/.test(c.path)) assert.equal(new URL(c.url).searchParams.get('teamId'), TEAM, c.path);
    assert.ok(!c.url.includes(SENTINEL), 'the token never goes into a URL');
  }
  assert.ok(!json(r).includes(SENTINEL));
});

test('env: names, types and targets only; never a value (from /env or from the projects list)', async () => {
  const r = await vercel();
  const p = r.projects.find((x) => x.id === PRJ);
  assert.deepEqual(p.env.map((e) => e.key), ['STRIPE_KEY', 'NEXT_PUBLIC_URL']);
  assert.deepEqual(p.env[0], { key: 'STRIPE_KEY', type: 'encrypted', target: ['production'], gitBranch: null, updatedAt: at(10) });
  assert.ok(!json(r).includes(ENV_VALUE), 'an env value leaked');
  assert.ok(!/"value"/.test(json(r)), 'no value field anywhere');
  const envCall = calls.find((c) => c.path === `/v10/projects/${PRJ}/env`);
  assert.equal(new URL(envCall.url).searchParams.get('decrypt'), 'false');
});

test('personal scope when VERCEL_TEAM_ID is unset: no teamId and no team request', async () => {
  delete process.env.VERCEL_TEAM_ID;
  const r = await vercel();
  assert.equal(r.ok, true);
  assert.deepEqual(r.scope, { type: 'personal', id: 'u1', slug: 'moshe', name: 'Moshe' });
  assert.ok(calls.every((c) => !new URL(c.url).searchParams.has('teamId')));
  assert.ok(!calls.some((c) => c.path.startsWith('/v2/teams')));
});

test('one failing section shows its reason and keeps the rest', async () => {
  delete fx['/v5/domains'];
  const r = await vercel();
  assert.equal(r.ok, true);
  assert.match(r.errors.domains, /Vercel/);
  assert.equal(r.domains, null, 'a failed read is not an empty list');
  assert.ok(r.deployments.length > 0);
});

test('a rejected token fails the whole page with a Hebrew reason and no upstream body', async () => {
  mode = 'echo403';
  const r = await vercel();
  assert.equal(r.ok, false);
  assert.equal(r.configured, true);
  assert.match(r.reason, /Vercel/);
  assert.ok(!json(r).includes(SENTINEL));
  assert.ok(!json(r).includes('forbidden'));
});

test('request budget: per-project detail capped, check-runs only for the latest deployments', async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `prj_Many${String(i).padStart(16, '0')}`, name: `p${i}`, updatedAt: at(i) }));
  fx['/v9/projects'] = { projects: many };
  const r = await vercel();
  assert.equal(r.ok, true);
  assert.ok(calls.filter((c) => /\/domains$/.test(c.path) && c.path.startsWith('/v9/projects/')).length <= 8);
  assert.ok(calls.filter((c) => /\/env$/.test(c.path)).length <= 8);
  assert.ok(calls.filter((c) => /check-runs$/.test(c.path)).length <= 5);
  assert.ok(calls.length <= 60, `too many requests: ${calls.length}`);
});

// ---------------------------------------------------------------- insights
test('insights from fixtures: failed builds today, misconfigured domain, latest production state and age', async () => {
  const r = await vercel();
  const ins = r.insights;
  assert.ok(ins.length >= 2 && ins.length <= 4);
  for (const i of ins) { assert.ok(['bad', 'warn', 'good', 'info'].includes(i.level)); assert.ok(i.title && i.detail); }
  const failed = ins.find((i) => /נכשל/.test(i.title));
  assert.ok(failed, 'a failed-builds insight');
  assert.match(failed.title, /2/);
  assert.equal(failed.level, 'warn', 'preview-only failures are a warning');
  const dom = ins.find((i) => /דומיי[ןנ]/.test(i.title));
  assert.ok(dom);
  assert.equal(dom.level, 'warn');
  assert.match(`${dom.title} ${dom.detail}`, /www\.apple\.dev/);
  assert.match(`${dom.title} ${dom.detail}`, /docs\.apple\.dev/, 'unverified project domain counts too');
  const prod = ins.find((i) => /production/.test(i.title));
  assert.ok(prod);
  assert.equal(prod.level, 'good');
  assert.match(prod.detail, /לפני שעתיים/);
  const order = ins.map((i) => ['bad', 'warn', 'info', 'good'].indexOf(i.level));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'red first');
});

test('insights: a failed production deploy is bad; nothing failed is good; failed reads are not observations', () => {
  const now = T0;
  const base = { deployments: [{ id: 'dpl_A0000000', project: 'web', state: 'ERROR', target: 'production', createdAt: at(1), errorCode: 'BUILD_FAILED' }],
    projects: [], domains: [], errors: {} };
  const a = insights(base, now);
  assert.equal(a[0].level, 'bad');
  assert.ok(a.some((i) => /production/.test(i.title) && i.level === 'bad'));
  const ok24 = insights({ ...base, deployments: [{ id: 'dpl_B0000000', project: 'web', state: 'READY', target: 'production', createdAt: at(3) }] }, now);
  assert.ok(ok24.some((i) => i.level === 'good' && /24/.test(i.title)));
  const blind = insights({ deployments: null, projects: null, domains: null, errors: { deployments: 'Vercel לא ענה תוך 10 שניות' } }, now);
  assert.ok(!blind.some((i) => i.level === 'good'), 'a failure to observe is never good news');
  assert.ok(blind.some((i) => i.level === 'warn' && /10 שניות/.test(i.detail)));
  const checks = insights({ ...base, deployments: [{ id: 'dpl_C0000000', project: 'docs', state: 'READY', target: 'production', createdAt: at(3) }],
    checks: { dpl_C0000000: [{ name: 'Link check', conclusion: 'failed' }, { name: 'Lighthouse', conclusion: 'succeeded' }] } }, now);
  const c = checks.find((i) => /Check/.test(i.title));
  assert.equal(c?.level, 'warn');
  assert.match(c.detail, /docs \(Link check\)/, 'names the project and the failed check, not a raw id');
  assert.doesNotMatch(c.detail, /Lighthouse|dpl_C/);
});

// ---------------------------------------------------------------- actions: dry run
const D1 = 'dpl_Prod0000000000000000';
test('dryRun returns the exact plan and never calls fetch (with or without a token)', async () => {
  for (const tok of [TOKEN, undefined]) {
    if (tok) process.env.VERCEL_TOKEN = tok; else delete process.env.VERCEL_TOKEN;
    const q = `?teamId=${TEAM}`;
    const cases = [
      [{ kind: 'redeploy', deploymentId: D1, name: 'apple-web', target: 'production' },
        { method: 'POST', url: `https://api.vercel.com/v13/deployments${q}`, body: { name: 'apple-web', deploymentId: D1, target: 'production' } }],
      [{ kind: 'redeploy', deploymentId: D1, name: 'apple-web', target: 'preview' },
        { method: 'POST', url: `https://api.vercel.com/v13/deployments${q}`, body: { name: 'apple-web', deploymentId: D1 } }],
      [{ kind: 'promote', projectId: PRJ, deploymentId: D1 },
        { method: 'POST', url: `https://api.vercel.com/v10/projects/${PRJ}/promote/${D1}${q}`, body: null }],
      [{ kind: 'rollback', projectId: PRJ, deploymentId: D1 },
        { method: 'POST', url: `https://api.vercel.com/v1/projects/${PRJ}/rollback/${D1}${q}`, body: null }],
      [{ kind: 'cancel', deploymentId: D1 },
        { method: 'PATCH', url: `https://api.vercel.com/v12/deployments/${D1}/cancel${q}`, body: null }],
    ];
    for (const [b, plan] of cases) {
      const r = await vercelAction({ ...b, dryRun: true });
      assert.equal(r.ok, true, `${b.kind}: ${r.reason}`);
      assert.equal(r.dryRun, true);
      assert.deepEqual(r.plan, plan);
      assert.ok(!json(r).includes(SENTINEL));
    }
  }
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- actions: validation
test('unknown or destructive kinds are refused, with no request', async () => {
  for (const kind of ['delete', 'remove', 'env', 'env-add', 'buy-domain', 'transfer', 'billing', 'pause', '', undefined, '__proto__', 'toString']) {
    const r = await vercelAction({ kind, deploymentId: D1, projectId: PRJ, name: 'apple-web', dryRun: true });
    assert.equal(r.ok, false, `kind ${kind} accepted`);
    const r2 = await vercelAction({ kind, deploymentId: D1, projectId: PRJ, name: 'apple-web' });
    assert.equal(r2.ok, false);
  }
  assert.equal(calls.length, 0);
});

test('ids are validated server-side before the dry run and before any request', async () => {
  const bad = ['', 'dpl_', 'dpl_short', 'dpl_../../v9/projects', 'dpl_abc12345/cancel', 'prj_Abcdefgh12345678', 'dpl_abcdefgh?x=1', ' dpl_abcdefgh1234', 'DPL_abcdefgh1234', 123, null, ['dpl_abcdefgh1234']];
  for (const id of bad) {
    for (const kind of ['redeploy', 'promote', 'rollback', 'cancel']) {
      const r = await vercelAction({ kind, deploymentId: id, projectId: PRJ, name: 'apple-web', dryRun: true });
      assert.equal(r.ok, false, `${kind} accepted deploymentId ${JSON.stringify(id)}`);
    }
  }
  for (const pid of ['', 'prj_', 'prj_x/../y12345', 'dpl_Abcdefgh12345678', 'prj_abc def12345', undefined]) {
    for (const kind of ['promote', 'rollback']) {
      const r = await vercelAction({ kind, projectId: pid, deploymentId: D1, dryRun: true });
      assert.equal(r.ok, false, `${kind} accepted projectId ${JSON.stringify(pid)}`);
    }
  }
  for (const name of ['', 'Apple-Web', 'a/b', 'a b', '../x', 'x'.repeat(101), undefined]) {
    const r = await vercelAction({ kind: 'redeploy', deploymentId: D1, name, dryRun: true });
    assert.equal(r.ok, false, `redeploy accepted name ${JSON.stringify(name)}`);
  }
  for (const target of ['staging', 'PRODUCTION', 'prod', 1]) {
    const r = await vercelAction({ kind: 'redeploy', deploymentId: D1, name: 'apple-web', target, dryRun: true });
    assert.equal(r.ok, false, `redeploy accepted target ${JSON.stringify(target)}`);
  }
  assert.equal(calls.length, 0);
});

test('dryRun must be the boolean true: a truthy string is not a dry run marker the UI could rely on', async () => {
  delete process.env.VERCEL_TOKEN;
  const r = await vercelAction({ kind: 'cancel', deploymentId: D1, dryRun: 'true' });
  assert.equal(r.dryRun, undefined);
  assert.equal(r.ok, false, 'not connected, so the real path refuses');
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- actions: the real path (fake upstream)
test('a real write sends exactly the planned request, returns no upstream text, and refreshes the cache', async () => {
  const plan = (await vercelAction({ kind: 'rollback', projectId: PRJ, deploymentId: D1, dryRun: true })).plan;
  await vercel(); calls.length = 0;
  fx[`/v1/projects/${PRJ}/rollback/${D1}`] = { echo: 'whatever' };
  const r = await vercelAction({ kind: 'rollback', projectId: PRJ, deploymentId: D1 });
  assert.equal(r.ok, true, r.reason);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, plan.method);
  assert.equal(calls[0].url, plan.url);
  assert.equal(calls[0].auth, `Bearer ${TOKEN}`);
  assert.ok(!json(r).includes('whatever'), 'upstream body not forwarded');
  calls.length = 0; await vercel();
  assert.ok(calls.length > 0, 'the cached page was dropped after the write');
});

test('redeploy sends its body and returns the new deployment id', async () => {
  fx['/v13/deployments'] = { id: 'dpl_New00000000000000001', url: 'new-apple.vercel.app', readyState: 'QUEUED' };
  const r = await vercelAction({ kind: 'redeploy', deploymentId: D1, name: 'apple-web', target: 'production' });
  assert.equal(r.ok, true, r.reason);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].body), { name: 'apple-web', deploymentId: D1, target: 'production' });
  assert.equal(r.deployment.id, 'dpl_New00000000000000001');
});

// ---------------------------------------------------------------- no secret, ever
test('no secret in any response: upstream echoing the Authorization header in 200 / 403 / 500 / throw', async () => {
  for (const m of ['echo200', 'echo403', 'echo500', 'throw']) {
    mode = m; uncache('vercel'); calls.length = 0;
    const r = await vercel();
    assert.ok(calls.length > 0, `${m}: made requests`);
    assert.ok(!json(r).includes(SENTINEL), `${m}: page leaked the token`);
    assert.ok(!json(r).includes('upstream crashed') && !json(r).includes('boom'), `${m}: forwarded upstream text`);
    for (const kind of ['cancel', 'rollback', 'promote', 'redeploy']) {
      const w = await vercelAction({ kind, deploymentId: D1, projectId: PRJ, name: 'apple-web', target: 'production' });
      assert.ok(!json(w).includes(SENTINEL), `${m}/${kind}: action leaked the token`);
      assert.ok(!json(w).includes('upstream crashed') && !json(w).includes('boom'), `${m}/${kind}: forwarded upstream text`);
      if (m !== 'echo200') assert.equal(w.ok, false);
    }
  }
});
