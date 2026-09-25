// The repo-depth pages: the shared media route (allowlist, traversal, symlink escape, headers) and
// each page module answering with real, non-empty data from this repository.
//   node --test scripts/owner-dashboard/cc/repo-pages.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const { route } = await import('./platforms/router.mjs');
const { REPO } = await import('./http.mjs');
const { resolveMedia } = await import('./media.mjs');

let server, port;
before(async () => {
  server = http.createServer((q, s) => { if (!route(q, s)) { s.writeHead(404); s.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => server.close());

function get(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: pathname, headers: { host: `localhost:${port}`, ...headers } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject); r.end();
  });
}
const mediaUrl = (p) => `/api/cc/media?p=${encodeURIComponent(p)}`;
const json = async (p) => JSON.parse((await get(p)).body.toString('utf8'));

// ---- media ---------------------------------------------------------------------------------------
const SAMPLE = 'docs/gauntlet/visual/rounds/round-1-compare.jpg';

test('media: serves an allowlisted image with its type and nosniff', async () => {
  const r = await get(mediaUrl(SAMPLE));
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'image/jpeg');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(Number(r.headers['content-length']), fs.statSync(path.join(REPO, SAMPLE)).size);
  assert.equal(r.body[0], 0xff); assert.equal(r.body[1], 0xd8); // a JPEG, byte for byte
});

test('media: a byte range answers 206 so audio can seek', async () => {
  const r = await get(mediaUrl(SAMPLE), { range: 'bytes=0-9' });
  assert.equal(r.status, 206);
  assert.equal(r.body.length, 10);
  assert.match(r.headers['content-range'], /^bytes 0-9\/\d+$/);
});

test('media: refuses traversal, absolute, encoded, hidden and off-list paths', async () => {
  const bad = [
    '../package.json', 'docs/../.env', 'docs/../../etc/passwd.png', '/etc/passwd', '/Users/x.png',
    '%2e%2e/.env', 'docs/%2e%2e/%2e%2e/x.png', 'docs/..%2f..%2fx.png', 'docs\\..\\.env', 'docs/./x.png',
    '.env', 'package.json', 'README.md', 'docs/autonomy/MISSION.md', 'docs//x.png',
    'apps/worker/src/x.png', 'node_modules/x/y.png', 'packages/asset-library/node_modules/a.png',
    'docs/.git/x.png', 'docs/x.png\0.png', 'C:/x.png', '', 'docs',
  ];
  for (const p of bad) {
    assert.equal(resolveMedia(p), null, `resolveMedia accepted ${JSON.stringify(p)}`);
    const r = await get(mediaUrl(p));
    assert.equal(r.status, 404, `served ${JSON.stringify(p)}`);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  }
  // Raw, un-encoded dot segments in the URL itself.
  for (const u of ['/api/cc/media?p=../.env', '/api/cc/media?p=docs/../../../etc/hosts', '/api/cc/media?p=%252e%252e%252f.env', '/api/cc/media']) {
    assert.equal((await get(u)).status, 404, u);
  }
});

test('media: a symlink inside an allowlisted folder that points outside it is refused', async () => {
  const link = path.join(REPO, 'docs/.cc-media-escape-test.png');
  try { fs.unlinkSync(link); } catch { /* none */ }
  fs.symlinkSync(path.join(REPO, 'package.json'), link);
  try {
    assert.equal(resolveMedia('docs/.cc-media-escape-test.png'), null);
    assert.equal((await get(mediaUrl('docs/.cc-media-escape-test.png'))).status, 404);
  } finally { fs.unlinkSync(link); }
});

test('media: only from localhost', async () => {
  const r = await get(mediaUrl(SAMPLE), { host: 'evil.example' });
  assert.equal(r.status, 403);
});

test('media: an SVG carries a sandboxing CSP', async () => {
  const svg = fs.readdirSync(path.join(REPO, 'packages/asset-library/packs'), { recursive: true }).find((f) => String(f).endsWith('.svg'));
  if (!svg) return;
  const r = await get(mediaUrl(`packages/asset-library/packs/${svg}`));
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'image/svg+xml');
  assert.match(r.headers['content-security-policy'], /sandbox/);
});

// ---- the five page modules, through the same route the dashboard calls -----------------------------
test('commits: the whole history, paginated, with a detail view', { timeout: 120000 }, async () => {
  const d = await json('/api/cc/commits');
  assert.equal(d.ok, true);
  assert.ok(d.summary.total > 100, `only ${d.summary.total} commits`);
  assert.equal(d.items.length, 40);
  assert.ok(d.pages > 2);
  assert.match(d.items[0].sha, /^[0-9a-f]{40}$/);
  assert.ok(d.summary.agents.length > 0 && d.summary.heat.length > 0);
  const p2 = await json('/api/cc/commits?page=2');
  assert.notEqual(p2.items[0].sha, d.items[0].sha);
  const one = await json(`/api/cc/commits?sha=${d.items[5].sha}`);
  assert.equal(one.commit.sha, d.items[5].sha);
  assert.ok(one.commit.fileList.length > 0);
  assert.equal((await json('/api/cc/commits?sha=not-a-sha;rm')).ok, false, 'a malformed sha never reaches git');
});

test('models: registry with plan gating, every LoRA run, evals and skills', async () => {
  const d = await json('/api/cc/models');
  assert.equal(d.ok, true);
  assert.ok(d.registry.models.length >= 5);
  assert.ok(d.registry.models.every((m) => m.providerModelId && Array.isArray(m.plans)));
  assert.ok(d.lora.length >= 5);
  assert.ok(d.lora.every((l) => l.version && l.base));
  assert.ok(d.evals.length > 0 && d.evals.some((e) => e.tracks.some((t) => t.adapter.n > 0)));
  assert.ok(d.rag.chunks > 0);
  assert.ok(d.skills.cards.length > 0);
  // The frontier card is per product lane (frontier.mjs), not one pool of every lane's runs.
  assert.deepEqual(d.frontier.lanes.map((l) => l.lane), ['apple-max', 'apple']);
});

test('design-history: design commits since Golem, dated screenshots, decisions', { timeout: 120000 }, async () => {
  const d = await json('/api/cc/design-history');
  assert.equal(d.ok, true);
  assert.ok(d.timeline.length > 0);
  assert.ok(d.shots.length > 0);
  assert.ok(d.shots.every((s) => s.url.startsWith('/api/cc/media?p=')));
  assert.ok(d.decisions.length > 0);
  assert.ok(d.era.golem.from < d.era.apple.from);
  const shot = await get(d.shots[0].url);
  assert.equal(shot.status, 200, 'the gallery points at the media route and it serves');
});

test('studio-shots: grouped pictures with a kind for every group', { timeout: 120000 }, async () => {
  const d = await json('/api/cc/studio-shots');
  assert.equal(d.ok, true);
  assert.ok(d.counts.total > 0);
  assert.ok(d.groups.length > 0);
  assert.equal(d.groups.reduce((n, g) => n + g.shots.length, 0), d.counts.total);
  assert.ok(d.groups.every((g) => d.kinds[g.kind]));
});

test('repo-health: activity, findings, gates, queue and deploys from the repository', { timeout: 120000 }, async () => {
  const d = await json('/api/cc/repo-health');
  assert.equal(d.ok, true);
  assert.ok(d.activity.total > 100);
  assert.ok(d.agents.length > 0);
  assert.ok(d.findings.total > 0);
  assert.ok(d.gates.total > 0 && d.gates.gates.length === d.gates.total);
  assert.ok(d.queue.open.length + d.queue.done > 0);
  assert.ok(d.deploys.length > 0);
});
