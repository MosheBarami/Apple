// Uploads built frontends into the worker's D1 static store.
//   node infra/deploy-static.mjs [--only site|web|file <local> <remote>]
// Env: API_BASE, GOLEM_ADMIN_KEY (from repo .env)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const BASE = process.env.API_BASE;
const KEY = process.env.GOLEM_ADMIN_KEY;
if (!BASE || !KEY) throw new Error('API_BASE / GOLEM_ADMIN_KEY missing');

const CHUNK = 700_000; // bytes per request (D1 row limit headroom + request size)
const IMMUTABLE = /\.(js|css|woff2|png|jpg|webp|svg|glb)$/;
const HASHED = /(\/_astro\/|\/assets\/.*-[A-Za-z0-9_-]{8,}\.)/;

async function upload(localPath, remotePath) {
  const data = readFileSync(localPath);
  const immutable = IMMUTABLE.test(remotePath) && HASHED.test(remotePath);
  for (let i = 0; i * CHUNK < data.length || i === 0; i++) {
    const slice = data.subarray(i * CHUNK, (i + 1) * CHUNK);
    const res = await fetch(`${BASE}/api/admin/static-upload`, {
      method: 'POST',
      headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: remotePath, b64: slice.toString('base64'), immutable, append: i > 0 }),
    });
    if (!res.ok) throw new Error(`${remotePath} chunk ${i}: HTTP ${res.status} ${await res.text()}`);
    if ((i + 1) * CHUNK >= data.length) break;
  }
  return data.length;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function uploadDir(dir, prefix) {
  let count = 0, bytes = 0;
  for (const file of walk(dir)) {
    const rel = '/' + relative(dir, file).split('\\').join('/');
    const remote = prefix === '/' ? rel : prefix + rel;
    bytes += await upload(file, remote);
    count++;
    process.stdout.write(`\r${prefix} ${count} files, ${(bytes / 1024).toFixed(0)}KB   `);
  }
  console.log();
  return { count, bytes };
}

const args = process.argv.slice(2);
if (args[0] === '--file') {
  const size = await upload(args[1], args[2]);
  console.log(`uploaded ${args[2]} (${size}B)`);
} else {
  const only = args[0] === '--only' ? args[1] : null;
  if (!only || only === 'site') await uploadDir(join(root, 'apps/site/dist'), '/');
  if (!only || only === 'web') await uploadDir(join(root, 'apps/web/dist'), '/app');
  console.log('done');
}
