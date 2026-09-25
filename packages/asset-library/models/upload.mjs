#!/usr/bin/env node
// Puts the insertable model-library files into the worker's D1 static store at
// /model-library/<path>, where `insert_library_model` reads their bytes before uploading them into
// the customer's own Roblox account (D-MODELLIB-1). Creator Store rows have no file and are skipped.
//
// Same shape as ../upload.mjs: it asks the store what it already holds and sends only what is
// missing, so it is safe to re-run. Files are chunked with `append` like infra/deploy-static.mjs.
//
//   node packages/asset-library/models/upload.mjs [--force] [--only-id <manifest-id>]
// Env: API_BASE, GOLEM_ADMIN_KEY (read from the repo .env when present).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const LIB = join(HERE, '..');
const ROOT = join(LIB, '..', '..');
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env: the environment must carry both values */ }
const BASE = process.env.API_BASE;
const KEY = process.env.GOLEM_ADMIN_KEY;
if (!BASE || !KEY) throw new Error('API_BASE / GOLEM_ADMIN_KEY missing');
const force = process.argv.includes('--force');
const onlyIdAt = process.argv.indexOf('--only-id');
const onlyId = onlyIdAt >= 0 ? process.argv[onlyIdAt + 1] : null;
if (onlyIdAt >= 0 && !onlyId) throw new Error('--only-id needs a manifest id');

const TYPES = { glb: 'model/gltf-binary', fbx: 'model/fbx', rbxm: 'model/x-rbxm' };
const CHUNK = 700_000;

const index = JSON.parse(readFileSync(join(HERE, 'index.json'), 'utf8'));
const selected = onlyId ? index.rows.filter((r) => r[0] === onlyId) : index.rows;
if (onlyId && selected.length !== 1) throw new Error(`exactly one file row required for ${onlyId}`);
const wanted = selected
  .map((r) => r[5])
  .filter((ref) => typeof ref === 'string')
  .map((ref) => ({ local: join(LIB, ref), remote: `/model-library/${ref}`, type: TYPES[ref.split('.').pop()] }))
  .filter((w) => w.type);

const listed = await fetch(`${BASE}/api/admin/static-list`, { headers: { 'X-Admin-Key': KEY } });
if (!listed.ok) throw new Error(`static-list answered ${listed.status}`);
const have = new Set((await listed.json()).map((r) => r.path));
const todo = force ? wanted : wanted.filter((w) => !have.has(w.remote));
console.log(`model-library: ${wanted.length} files, ${wanted.length - todo.length} already stored, ${todo.length} to send`);

async function post(body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE}/api/admin/static-upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Admin-Key': KEY },
      body: JSON.stringify(body),
    }).catch((err) => ({ ok: false, status: 0, text: async () => String(err.cause ?? err) }));
    if (res.ok) return;
    if (attempt >= 5) throw new Error(`${body.path}: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function send({ local, remote, type }) {
  const data = readFileSync(local);
  for (let i = 0; i === 0 || i * CHUNK < data.length; i++) {
    const b64 = data.subarray(i * CHUNK, (i + 1) * CHUNK).toString('base64');
    await post({ path: remote, contentType: type, b64, append: i > 0 });
  }
}

let done = 0;
const LANES = 3; // gentle on a single-threaded D1
await Promise.all(Array.from({ length: LANES }, async (_, lane) => {
  for (let i = lane; i < todo.length; i += LANES) {
    await send(todo[i]);
    done++;
    if (done % 25 === 0 || done === todo.length) process.stdout.write(`\r${done}/${todo.length}   `);
  }
}));
console.log(`\nmodel-library: sent ${done} files`);
