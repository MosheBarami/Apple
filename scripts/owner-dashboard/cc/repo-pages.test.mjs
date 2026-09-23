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
