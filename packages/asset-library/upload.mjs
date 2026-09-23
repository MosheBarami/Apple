#!/usr/bin/env node
// Puts the pack images into the worker's D1 static store at /asset-library/<pack>/<path>, where the
// site gallery loads them and `upload_ui_asset` reads their bytes (D-UILIB-2).
//
// Separate from infra/deploy-static.mjs on purpose: that script re-sends every file on every web
// deploy, and five thousand icons that never change do not belong in that loop. This one asks the
// store what it already holds and sends only what is missing, so it is safe to re-run.
//
//   node packages/asset-library/upload.mjs [--force]
// Env: API_BASE, GOLEM_ADMIN_KEY (read from the repo .env when present). Same admin route as
// deploy-static.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');
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

const index = JSON.parse(readFileSync(join(HERE, 'index.json'), 'utf8'));
const wanted = [];
for (const pack of index.packs) {
  for (const [folder, names] of pack.folders) {
    for (const name of names) {
      const rel = `${folder ? folder + '/' : ''}${name}.png`;
      wanted.push({ local: join(HERE, 'packs', pack.id, rel), remote: `/asset-library/${pack.id}/${rel}` });
    }
  }
}

const listed = await fetch(`${BASE}/api/admin/static-list`, { headers: { 'X-Admin-Key': KEY } });
if (!listed.ok) throw new Error(`static-list answered ${listed.status}`);
const have = new Set((await listed.json()).map((r) => r.path));
const todo = force ? wanted : wanted.filter((w) => !have.has(w.remote));
console.log(`asset-library: ${wanted.length} files, ${wanted.length - todo.length} already stored, ${todo.length} to send`);

async function send({ local, remote }) {
  const b64 = readFileSync(local).toString('base64');
  for (let attempt = 1; ; attempt++) {
    // A dropped connection throws rather than answering; it is retried like a failed status.
    const res = await fetch(`${BASE}/api/admin/static-upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Admin-Key': KEY },
      // Not `immutable`: a pack update re-sends under the same path and must not be cached forever.
      body: JSON.stringify({ path: remote, contentType: 'image/png', b64 }),
    }).catch((err) => ({ ok: false, status: 0, text: async () => String(err.cause ?? err) }));
    if (res.ok) return;
    // D1 is shared with live traffic and resets under bulk writes; back off rather than abort.
    if (attempt >= 5) throw new Error(`${remote}: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

let done = 0;
const LANES = 3; // gentle on a single-threaded D1
await Promise.all(Array.from({ length: LANES }, async (_, lane) => {
  for (let i = lane; i < todo.length; i += LANES) {
    await send(todo[i]);
    done++;
    if (done % 100 === 0 || done === todo.length) process.stdout.write(`\r${done}/${todo.length}   `);
  }
}));
console.log(`\nasset-library: sent ${done} files`);
