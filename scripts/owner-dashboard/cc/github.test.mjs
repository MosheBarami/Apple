// GitHub platform module, offline: a fake `gh` (and `git`) on PATH answers per API path from a
// fixture file and logs every call, so the tests can prove what was (and was not) sent upstream.
// Properties, not spellings: insights are matched by id and level, reasons by "no upstream text".
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SENTINEL = 'ghp_SENTINELsecretVALUE0123456789';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-fake-'));
const FIX = path.join(dir, 'fix.json');
const LOG = path.join(dir, 'calls.log');
fs.writeFileSync(path.join(dir, 'gh.cjs'), `
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(process.env.GH_LOG, JSON.stringify(a) + '\\n');
const fix = JSON.parse(fs.readFileSync(process.env.GH_FIX, 'utf8'));
const i = a.indexOf('-X'); const method = i > 0 ? a[i + 1] : 'GET';
const p = String(a[1] || '').split('?')[0];
const r = fix.__all || fix[p === 'graphql' ? 'graphql' : method + ' ' + p] || { status: 404, body: { message: 'Not Found' } };
if (r.raw != null) { process.stderr.write(r.raw); process.exit(r.code ?? 1); }
process.stdout.write(JSON.stringify(r.body ?? {}));
if (r.status && r.status >= 300) { process.stderr.write('gh: ' + (r.body && r.body.message) + ' (HTTP ' + r.status + ')\\n'); process.exit(1); }
`);
fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/sh\nexec node "${path.join(dir, 'gh.cjs')}" "$@"\n`, { mode: 0o755 });
fs.writeFileSync(path.join(dir, 'git'), '#!/bin/sh\necho https://github.com/acme/widget.git\n', { mode: 0o755 });
process.env.PATH = `${dir}:${process.env.PATH}`;
process.env.GH_FIX = FIX; process.env.GH_LOG = LOG;
process.env.GITHUB_TOKEN = SENTINEL; process.env.GH_TOKEN = SENTINEL;

const { github, githubAction, SETTINGS } = await import('./platforms/github.mjs');
const { uncache } = await import('./http.mjs');

// ---------------------------------------------------------------- fixtures
const B = 'repos/acme/widget';
const iso = (h) => new Date(Date.UTC(2026, 8, 23, 12) - h * 3600e3).toISOString();
const AI = '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
const run = (id, conclusion, h, { wf = 1, name = 'CI', dur = 4, branch = 'main', status = 'completed' } = {}) => ({
  id, name, status, conclusion, head_branch: branch, event: 'push', created_at: iso(h), run_started_at: iso(h),
  updated_at: new Date(Date.parse(iso(h)) + dur * 1000).toISOString(), html_url: `https://github.com/acme/widget/actions/runs/${id}`, workflow_id: wf, run_attempt: 1,
});
const labels = [{ name: 'bug', color: 'd73a4a', description: 'Something is broken' }, { name: 'dependencies', color: '0366d6', description: '' }, { name: 'good first issue', color: '7057ff', description: '' }];
const pr = (number, state, extra = {}) => ({ number, title: `PR ${number}`, state, isDraft: false, url: `https://github.com/acme/widget/pull/${number}`,
  createdAt: iso(48), updatedAt: iso(2), closedAt: state === 'OPEN' ? null : iso(3), mergedAt: state === 'MERGED' ? iso(3) : null, author: { login: 'dependabot' },
  reviewDecision: null, mergeable: 'MERGEABLE', headRefName: `feat/${number}`, baseRefName: 'main', additions: 10, deletions: 2, changedFiles: 1,
  labels: { nodes: [] }, commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] }, ...extra });
const issue = (number, state, extra = {}) => ({ number, title: `Issue ${number}`, state, stateReason: state === 'OPEN' ? null : 'COMPLETED', url: `https://github.com/acme/widget/issues/${number}`,
  createdAt: iso(72), updatedAt: iso(5), closedAt: null, author: { login: 'acme' }, comments: { totalCount: 1 }, labels: { nodes: [] }, ...extra });

function base() {
  return {
    [`GET ${B}`]: { body: { full_name: 'acme/widget', html_url: 'https://github.com/acme/widget', private: true, visibility: 'private', default_branch: 'main',
      pushed_at: iso(1), created_at: iso(5000), size: 184521, open_issues_count: 2, language: 'JavaScript', topics: ['roblox', 'ai'], license: null,
      description: 'Widget repo', homepage: null, stargazers_count: 3, forks_count: 1, subscribers_count: 2, permissions: { admin: true, push: true },
      delete_branch_on_merge: false, allow_auto_merge: false, allow_update_branch: true, has_issues: true, has_wiki: false, has_projects: true, has_discussions: false } },
    'GET user': { body: { login: 'acme', plan: { name: 'free' } } },
    graphql: { body: { data: { repository: {
      defaultBranchRef: { name: 'main', target: { history: { totalCount: 1585 } } },
      refs: { totalCount: 3, nodes: [
        { name: 'main', branchProtectionRule: null, target: { oid: 'a'.repeat(40), committedDate: iso(1), messageHeadline: 'tip' }, compare: { aheadBy: 0, behindBy: 0 } },
        { name: 'feat/live', branchProtectionRule: { id: 'X' }, target: { oid: 'b'.repeat(40), committedDate: iso(20), messageHeadline: 'wip' }, compare: { aheadBy: 5, behindBy: 2 } },
        { name: 'old/stale', branchProtectionRule: null, target: { oid: 'c'.repeat(40), committedDate: iso(24 * 90), messageHeadline: 'old' }, compare: { aheadBy: 1500, behindBy: 0 } },
      ] },
      pullRequests: { totalCount: 3, nodes: [
        pr(9, 'OPEN', { author: { login: 'acme' }, reviewDecision: 'REVIEW_REQUIRED', mergeable: 'CONFLICTING', labels: { nodes: [{ name: 'bug', color: 'd73a4a' }] },
          commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } }),
        pr(12, 'OPEN'), pr(7, 'MERGED'), pr(4, 'CLOSED', { labels: { nodes: [{ name: 'dependencies', color: '0366d6' }] } }),
      ] },
      open: { totalCount: 1 },
      issues: { totalCount: 2, nodes: [issue(10, 'OPEN', { labels: { nodes: [{ name: 'bug', color: 'd73a4a' }] } }), issue(11, 'CLOSED')] },
      openIssues: { totalCount: 1 },
      releases: { totalCount: 0, nodes: [] },
      tags: { totalCount: 2, nodes: [{ name: 'v2', target: { oid: 'd'.repeat(40), committedDate: iso(30) } }, { name: 'v1', target: { oid: 'e'.repeat(40), target: { committedDate: iso(300) } } }] },
      labels: { nodes: labels },
      stargazerCount: 3, forkCount: 1, watchers: { totalCount: 2 },
    } } } },
    [`GET ${B}/commits`]: { body: [
      { sha: '1'.repeat(40), html_url: 'https://github.com/acme/widget/commit/1', author: { login: 'acme' }, commit: { message: `feat: one${AI}`, author: { name: 'A', date: iso(1) } } },
      { sha: '2'.repeat(40), html_url: 'https://github.com/acme/widget/commit/2', author: { login: 'acme' }, commit: { message: `fix: two${AI}`, author: { name: 'A', date: iso(2) } } },
      { sha: '3'.repeat(40), html_url: 'https://github.com/acme/widget/commit/3', author: { login: 'acme' }, commit: { message: 'docs: three\n\nCo-authored-by: GitHub Copilot <copilot@github.com>', author: { name: 'A', date: iso(3) } } },
      { sha: '4'.repeat(40), html_url: 'https://github.com/acme/widget/commit/4', author: null, commit: { message: 'chore: human only', author: { name: 'Moshe', date: iso(4) } } },
    ] },
    [`GET ${B}/languages`]: { body: { JavaScript: 7000, TypeScript: 2000, CSS: 1000 } },
    [`GET ${B}/stats/participation`]: { body: {} }, // 202 computing
    [`GET ${B}/actions/workflows`]: { body: { workflows: [
      { id: 1, name: 'CI', state: 'active', html_url: 'https://github.com/acme/widget/actions/workflows/ci.yml', path: '.github/workflows/ci.yml' },
      { id: 2, name: 'Release', state: 'disabled_manually', html_url: 'https://github.com/acme/widget/actions/workflows/rel.yml', path: '.github/workflows/rel.yml' },
    ] } },
    [`GET ${B}/actions/runs`]: { body: { workflow_runs: [
      run(503, 'failure', 1), run(502, 'failure', 2), run(501, 'failure', 3), run(500, 'success', 30, { dur: 240 }),
      run(499, 'success', 40, { wf: 2, name: 'Release', dur: 90 }), run(498, 'cancelled', 50, { dur: 10 }),
    ] } },
    [`GET ${B}/actions/runs/503/jobs`]: { body: { jobs: [{ id: 777, conclusion: 'failure', steps: [], runner_name: '' }] } },
    [`GET ${B}/check-runs/777/annotations`]: { body: [{ annotation_level: 'failure', message: 'The job was not started because recent account payments have failed or your spending limit needs to be increased.' }] },
    'GET users/acme/settings/billing/usage/summary': { body: { timePeriod: { year: 2026, month: 9 }, user: 'acme', usageItems: [
      { product: 'Actions', sku: 'actions_linux', grossQuantity: 2044, netAmount: 0, unitType: 'minutes' },
      { product: 'Actions', sku: 'actions_storage', grossQuantity: 42.4, netAmount: 0, unitType: 'gigabyte-hours' }] } },
    [`GET ${B}/dependabot/alerts`]: { status: 403, body: { message: 'Dependabot alerts are disabled for this repository.' } },
    [`GET ${B}/secret-scanning/alerts`]: { status: 403, body: { message: 'Resource not accessible by personal access token' } },
    [`GET ${B}/code-scanning/alerts`]: { body: [] },
    [`GET ${B}/contributors`]: { body: [{ login: 'acme', contributions: 1500, type: 'User' }, { login: 'dependabot[bot]', contributions: 7, type: 'Bot' }] },
    [`GET ${B}/traffic/views`]: { body: { count: 17, uniques: 1, views: [{ timestamp: iso(24), count: 17, uniques: 1 }] } },
    [`GET ${B}/traffic/clones`]: { body: { count: 325, uniques: 4, clones: [{ timestamp: iso(24), count: 325, uniques: 4 }] } },
    [`GET ${B}/traffic/popular/referrers`]: { body: [{ referrer: 'github.com', count: 5, uniques: 1 }] },
    [`GET ${B}/actions/cache/usage`]: { body: { active_caches_size_in_bytes: 128e6, active_caches_count: 1 } },
    // what a real write re-reads before it sends anything
    [`GET ${B}/pulls/9`]: { body: { number: 9, state: 'open', merged: false, draft: false, mergeable: false } },
    [`GET ${B}/pulls/12`]: { body: { number: 12, state: 'open', merged: false, draft: false, mergeable: true } },
    [`GET ${B}/pulls/7`]: { body: { number: 7, state: 'closed', merged: true, draft: false } },
    [`GET ${B}/pulls/4`]: { body: { number: 4, state: 'closed', merged: false, draft: false } },
    [`GET ${B}/issues/10`]: { body: { number: 10, state: 'open', labels: [{ name: 'bug' }] } },
    [`GET ${B}/issues/11`]: { body: { number: 11, state: 'closed', labels: [] } },
    [`GET ${B}/issues/9`]: { body: { number: 9, state: 'open', pull_request: { url: 'x' }, labels: [{ name: 'bug' }] } },
    [`GET ${B}/labels`]: { body: labels },
    [`PUT ${B}/pulls/12/merge`]: { body: { merged: true } },
    [`POST ${B}/actions/runs/5/rerun`]: { body: {} },
    [`POST ${B}/issues/10/labels`]: { body: [] },
  };
}
const setFix = (f) => fs.writeFileSync(FIX, JSON.stringify(f));
const calls = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const clearLog = () => fs.writeFileSync(LOG, '');
const writes = () => calls().filter((a) => a.includes('-X'));
const noSecret = (v) => assert.ok(!JSON.stringify(v).includes(SENTINEL), `secret leaked: ${JSON.stringify(v).slice(0, 300)}`);
async function read(f = base()) { setFix(f); uncache('github'); return github(); }

before(() => setFix(base()));
beforeEach(() => clearLog());

// ---------------------------------------------------------------- read
test('read: shape of the repo page payload', async () => {
  const d = await read();
  assert.equal(d.ok, true); assert.equal(typeof d.fetchedAt, 'string');
  assert.equal(d.repo.fullName, 'acme/widget'); assert.equal(d.repo.defaultBranch, 'main'); assert.equal(d.repo.private, true);
  assert.deepEqual(d.repo.topics, ['roblox', 'ai']); assert.equal(d.repo.commitCount, 1585);
  assert.deepEqual(Object.keys(d.settings).sort(), [...SETTINGS].sort());
  // languages: sorted, percentages add up
  assert.equal(d.languages[0].name, 'JavaScript');
  assert.ok(Math.abs(d.languages.reduce((s, l) => s + l.pct, 0) - 100) < 0.5);
  // commits keep the fields other pages read, and the AI co-author share is counted
  for (const c of d.commits) for (const k of ['sha', 'short', 'title', 'date', 'url', 'ai']) assert.ok(k in c, k);
  assert.deepEqual(d.commits.map((c) => c.ai), [true, true, true, false]);
  assert.equal(d.aiShare.ai, 3); assert.equal(d.aiShare.total, 4);
  // branches: protection and ahead/behind relative to the default branch
  const live = d.branches.find((b) => b.name === 'feat/live');
  assert.equal(live.protected, true); assert.equal(live.behind, 5); assert.equal(live.ahead, 2);
  assert.equal(d.branches.find((b) => b.name === 'main').isDefault, true);
  // PRs and issues
  const p9 = d.pulls.find((p) => p.number === 9);
  assert.equal(p9.state, 'open'); assert.equal(p9.checks, 'failure'); assert.equal(p9.mergeable, 'conflicting'); assert.deepEqual(p9.labels, ['bug']);
  assert.equal(d.pulls.find((p) => p.number === 7).state, 'merged');
  assert.equal(d.counts.openPulls, 1); assert.equal(d.counts.openIssues, 1);
  assert.equal(d.issues.find((i) => i.number === 11).stateReason, 'completed');
  assert.deepEqual(d.labels.map((l) => l.name), labels.map((l) => l.name));
  // tags from both lightweight and annotated refs
  assert.deepEqual(d.tags.map((t) => t.name), ['v2', 'v1']); assert.ok(d.tags.every((t) => t.date));
  assert.equal(d.releases.length, 0);
});

test('read: stats that GitHub is still computing (202) say so', async () => {
  const d = await read();
  assert.equal(d.activity.computing, true); assert.deepEqual(d.activity.weeks, []);
  const f = base(); f[`GET ${B}/stats/participation`] = { body: { all: Array(52).fill(3), owner: Array(52).fill(1) } };
  const e = await read(f);
  assert.equal(e.activity.computing, false); assert.equal(e.activity.weeks.length, 52);
});

test('read: CI per workflow — pass rate, duration trend, runs keep their shape', async () => {
  const d = await read();
  const ci = d.workflows.find((w) => w.id === 1);
  assert.equal(ci.passRate, 0.25); // 1 success of 4 finished (cancelled excluded)
  assert.deepEqual(ci.durations, [240, 4, 4, 4]); // oldest → newest
  for (const r of d.runs) for (const k of ['id', 'name', 'status', 'conclusion', 'branch', 'createdAt', 'url', 'workflowId', 'durationSec']) assert.ok(k in r, k);
});

test('read: billing — minutes measured, "blocked until" inferred and marked as inferred', async () => {
  const d = await read();
  assert.equal(d.billing.plan, 'free'); assert.equal(d.billing.minutes, 2044);
  assert.equal(d.billing.blocked, true); assert.equal(d.billing.evidence, 'annotation');
  assert.equal(d.billing.until, '2026-10-01'); assert.equal(d.billing.untilInferred, true);
  // no annotation → not claimed as blocked
  const f = base(); f[`GET ${B}/check-runs/777/annotations`] = { body: [] };
  f['GET users/acme/settings/billing/usage/summary'].body.usageItems[0].grossQuantity = 300;
  const e = await read(f);
  assert.notEqual(e.billing.blocked, true);
});

test('read: security distinguishes disabled, no permission and zero alerts', async () => {
  const d = await read();
  assert.equal(d.security.dependabot.state, 'disabled');
  assert.equal(d.security.secretScanning.state, 'no-permission');
  assert.equal(d.security.codeScanning.state, 'ok'); assert.equal(d.security.codeScanning.count, 0);
  const f = base(); f[`GET ${B}/code-scanning/alerts`] = { body: [{ number: 1, rule: { severity: 'error', security_severity_level: 'high' } }] };
  const e = await read(f);
  assert.equal(e.security.codeScanning.count, 1);
  assert.ok(e.insights.some((x) => x.id === 'sec-alerts' && x.level === 'bad'));
});

test('read: an exhausted rate limit (GitHub says 403) is not reported as "no permission"', async () => {
  const f = base();
  const limited = { status: 403, body: { message: 'API rate limit exceeded for user ID 1.' } };
  f[`GET ${B}/secret-scanning/alerts`] = limited; f[`GET ${B}/contributors`] = limited;
  const d = await read(f);
  assert.equal(d.security.secretScanning.state, 'error');
  assert.ok(d.insights.some((x) => x.id === 'rate-limit' && x.level === 'warn'));
  assert.ok(!d.insights.some((x) => x.id === 'sec-noperm'));
});

test('read: traffic, contributors, cache', async () => {
  const d = await read();
  assert.equal(d.traffic.views.count, 17); assert.equal(d.traffic.clones.uniques, 4); assert.equal(d.traffic.referrers[0].referrer, 'github.com');
  assert.equal(d.contributors[0].login, 'acme'); assert.equal(d.cache.count, 1);
});

test('read: Hebrew insights from the fixtures, red first', async () => {
  const d = await read();
  const ins = d.insights;
  assert.ok(Array.isArray(ins) && ins.length > 0);
  const LV = ['bad', 'warn', 'info', 'good'];
  for (const x of ins) {
    assert.ok(LV.includes(x.level), x.level); assert.equal(typeof x.title, 'string'); assert.equal(typeof x.detail, 'string');
    assert.match(x.title + x.detail, /[֐-׿]/, 'Hebrew');
    if (x.href) assert.match(x.href, /^https:\/\/github\.com\//);
  }
  const lv = ins.map((x) => LV.indexOf(x.level)); assert.deepEqual(lv, [...lv].sort((a, b) => a - b), 'sorted by severity');
  const ids = new Set(ins.map((x) => x.id));
  for (const id of ['ci-billing', 'sec-disabled', 'pr-failing', 'pr-conflict', 'wf-disabled', 'branches-stale', 'ai-share', 'stats-computing']) assert.ok(ids.has(id), id);
  assert.ok(!ids.has('ci-failing'), 'a billing block is not reported as a code failure');
  assert.equal(ins.find((x) => x.id === 'ci-billing').level, 'bad');
  // CI green + nothing wrong → a good one, and no billing claim
  const f = base();
  f[`GET ${B}/actions/runs`].body.workflow_runs = [run(600, 'success', 1, { dur: 200 })];
  const e = await read(f);
  assert.ok(e.insights.some((x) => x.id === 'ci-green' && x.level === 'good'));
  assert.ok(!e.insights.some((x) => x.id === 'ci-billing'));
});

test('read: sections fail independently with a clean reason', async () => {
  const f = base(); f[`GET ${B}/languages`] = { status: 500, body: { message: `boom ${SENTINEL}` } };
  const d = await read(f);
  assert.equal(d.ok, true); assert.equal(typeof d.errors.languages, 'string'); assert.deepEqual(d.languages, []);
  noSecret(d);
});

test('not connected: gh missing or logged out → ok:false, connected:false, clean reason', async () => {
  const f = { __all: { raw: `You are not logged into any GitHub hosts. To log in, run: gh auth login ${SENTINEL}\n`, code: 4 } };
  const d = await read(f);
  assert.equal(d.ok, false); assert.equal(d.connected, false); assert.equal(typeof d.reason, 'string'); assert.equal(typeof d.fetchedAt, 'string');
  noSecret(d);
});

// ---------------------------------------------------------------- secrets
test('no secret in any response: upstream echo in 200, 403, 500 and a throw', async () => {
  const f = base();
  f[`GET ${B}`].body.description = `leak ${SENTINEL}`; // 200 echo
  f[`GET ${B}/commits`].body[0].commit.message = `feat: ${SENTINEL}${AI}`;
  f[`GET ${B}/dependabot/alerts`] = { status: 403, body: { message: `denied ${SENTINEL}` } };
  f[`GET ${B}/traffic/views`] = { status: 500, body: { message: `oops ${SENTINEL}` } };
  f[`GET ${B}/traffic/clones`] = { raw: `fatal ${SENTINEL}`, code: 1 };
  const d = await read(f);
  assert.equal(d.ok, true); noSecret(d);
  // actions: upstream failure text never comes back
  setFix({ ...base(), [`POST ${B}/actions/runs/5/rerun`]: { status: 403, body: { message: `nope ${SENTINEL}` } } });
  const a = await githubAction({ kind: 'rerun', id: 5 });
  assert.equal(a.ok, false); noSecret(a);
  const t = await githubAction({ kind: 'rerun', id: 5, dryRun: true });
  noSecret(t);
});

// ---------------------------------------------------------------- dry run
test('dryRun: every kind returns the exact plan and calls gh zero times', async () => {
  await read(); // the page has been loaded once (labels, PRs and issues are known)
  const cases = [
    [{ kind: 'rerun', id: 5 }, 'POST', `${B}/actions/runs/5/rerun`, null],
    [{ kind: 'rerun-failed', id: 5 }, 'POST', `${B}/actions/runs/5/rerun-failed-jobs`, null],
    [{ kind: 'cancel', id: 5 }, 'POST', `${B}/actions/runs/5/cancel`, null],
    [{ kind: 'dispatch', id: '1' }, 'POST', `${B}/actions/workflows/1/dispatches`, { ref: 'main' }],
    [{ kind: 'wf-enable', id: 2 }, 'PUT', `${B}/actions/workflows/2/enable`, null],
    [{ kind: 'wf-disable', id: 1 }, 'PUT', `${B}/actions/workflows/1/disable`, null],
    [{ kind: 'approve-pr', id: 9 }, 'POST', `${B}/pulls/9/reviews`, { event: 'APPROVE' }],
    [{ kind: 'close-pr', id: 9 }, 'PATCH', `${B}/pulls/9`, { state: 'closed' }],
    [{ kind: 'setting', key: 'has_wiki', value: true }, 'PATCH', B, { has_wiki: true }],
    [{ kind: 'merge-pr', id: 12 }, 'PUT', `${B}/pulls/12/merge`, { merge_method: 'squash' }],
    [{ kind: 'reopen-pr', id: 4 }, 'PATCH', `${B}/pulls/4`, { state: 'open' }],
    [{ kind: 'close-issue', id: 10, reason: 'not_planned' }, 'PATCH', `${B}/issues/10`, { state: 'closed', state_reason: 'not_planned' }],
    [{ kind: 'reopen-issue', id: 11 }, 'PATCH', `${B}/issues/11`, { state: 'open', state_reason: 'reopened' }],
    [{ kind: 'add-label', id: 10, label: 'good first issue' }, 'POST', `${B}/issues/10/labels`, { labels: ['good first issue'] }],
    [{ kind: 'remove-label', id: 10, label: 'bug' }, 'DELETE', `${B}/issues/10/labels/bug`, null],
  ];
  clearLog();
  for (const [body, method, p, b] of cases) {
    const r = await githubAction({ ...body, dryRun: true });
    assert.equal(r.ok, true, `${body.kind}: ${r.reason}`); assert.equal(r.dryRun, true);
    assert.equal(r.plan.method, method, body.kind); assert.equal(r.plan.url, `https://api.github.com/${p}`, body.kind);
    assert.deepEqual(r.plan.body ?? null, b, body.kind);
    noSecret(r);
  }
  assert.equal(calls().length, 0, 'dryRun must not call gh');
});

test('dryRun: a label name with spaces is encoded in the URL', async () => {
  const f = base(); f.graphql.body.data.repository.issues.nodes[0].labels.nodes.push({ name: 'good first issue', color: '7057ff' });
  await read(f); clearLog();
  const r = await githubAction({ kind: 'remove-label', id: 10, label: 'good first issue', dryRun: true });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.plan.url, `https://api.github.com/${B}/issues/10/labels/good%20first%20issue`);
  assert.equal(calls().length, 0);
});

// ---------------------------------------------------------------- validation
test('validation: bad ids, unknown labels, wrong states and unknown kinds are refused before any write', async () => {
  await read(); clearLog();
  const bad = [
    { kind: 'nope', id: 1 },
    { kind: 'rerun', id: '5; rm -rf' }, { kind: 'rerun', id: -1 }, { kind: 'rerun' },
    { kind: 'dispatch', id: '../../x' },
    { kind: 'setting', key: 'private', value: true }, { kind: 'setting', key: 'has_wiki', value: 'yes' },
    { kind: 'add-label', id: 10, label: 'not-a-label' }, { kind: 'add-label', id: 10, label: '' }, { kind: 'add-label', id: 10 },
    { kind: 'add-label', id: 10, label: 'bug' }, // already on it
    { kind: 'remove-label', id: 10, label: 'dependencies' }, // not on it
    { kind: 'close-issue', id: 10, reason: 'wontfix' }, { kind: 'close-issue', id: 11, reason: 'completed' },
    { kind: 'reopen-issue', id: 10 },
    { kind: 'close-issue', id: 9, reason: 'completed' }, // a PR number is not an issue
    { kind: 'merge-pr', id: 7 }, { kind: 'merge-pr', id: 4 }, { kind: 'merge-pr', id: 9 }, // merged, closed, conflicting { kind: 'reopen-pr', id: 7 }, { kind: 'reopen-pr', id: 9 }, { kind: 'close-pr', id: 4 },
    { kind: 'approve-pr', id: 7 },
  ];
  for (const b of bad) {
    for (const dryRun of [true, false]) {
      const r = await githubAction({ ...b, dryRun });
      assert.equal(r.ok, false, `${JSON.stringify(b)} dryRun=${dryRun} should be refused`);
      assert.equal(typeof r.reason, 'string');
    }
  }
  assert.equal(writes().length, 0, 'no write reached gh');
});

test('validation: label names must exist in the repo label list — read fresh for a real write', async () => {
  await read(); clearLog();
  const f = base(); f[`GET ${B}/labels`] = { body: labels.filter((l) => l.name !== 'good first issue') }; setFix(f);
  const r = await githubAction({ kind: 'add-label', id: 10, label: 'good first issue' });
  assert.equal(r.ok, false); assert.equal(writes().length, 0);
});

test('dryRun before the page was ever read: label actions refuse instead of guessing', async () => {
  const mod = await import(`./platforms/github.mjs?fresh=${Date.now()}`);
  clearLog();
  const r = await mod.githubAction({ kind: 'add-label', id: 10, label: 'bug', dryRun: true });
  assert.equal(r.ok, false); assert.equal(calls().length, 0);
});

// ---------------------------------------------------------------- real writes (fake gh only)
test('write: merge re-reads the PR, sends squash, then drops the cache', async () => {
  await read(); clearLog();
  const r = await githubAction({ kind: 'merge-pr', id: 12 });
  assert.equal(r.ok, true, r.reason);
  const w = writes(); assert.equal(w.length, 1);
  assert.deepEqual(w[0].slice(0, 4), ['api', `${B}/pulls/12/merge`, '-X', 'PUT']);
  assert.ok(w[0].includes('merge_method=squash'));
  assert.ok(calls().some((a) => a[1] === `${B}/pulls/12` && !a.includes('-X')), 'fresh state check before the write');
});

test('write: add-label sends an array field', async () => {
  await read(); clearLog();
  const r = await githubAction({ kind: 'add-label', id: 10, label: 'good first issue' });
  assert.equal(r.ok, true, r.reason);
  const w = writes(); assert.equal(w.length, 1); assert.ok(w[0].includes('labels[]=good first issue'));
});

test('write: the contract body {kind:"rerun", id:5} still works', async () => {
  await read(); clearLog();
  const r = await githubAction({ kind: 'rerun', id: 5 });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(writes()[0].slice(0, 4), ['api', `${B}/actions/runs/5/rerun`, '-X', 'POST']);
});
