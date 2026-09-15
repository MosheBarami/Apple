#!/usr/bin/env node
// Push the harvest into the live library, in batches, through the product's own write path.
//
// Usage:  ADMIN_KEY=… node scripts/ingest-assets.mjs [--base https://…] [--limit N] [--dry]
//
// EVERY BATCH'S REJECTS ARE PRINTED AND COUNTED. An ingest that reports "7,277 written" while the
// server refused a third of them is the failure this repository names most often: a success
// message covering a partial result. The exit code is non-zero if anything was refused, so a
// silent partial ingest cannot pass for a clean one.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', process.env.APPLE_BASE ?? 'https://golem.moshe-barami111.workers.dev');
const LIMIT = Number(arg('--limit', '0')) || Infinity;
const DRY = process.argv.includes('--dry');
const BATCH = 50; // must not exceed INGEST_MAX_BATCH in apps/worker/src/asset-ingest.ts
const KEY = process.env.ADMIN_KEY;

if (!KEY && !DRY) {
  console.error('ADMIN_KEY is not set. Refusing to run — an unauthenticated ingest would 401 on\n'
    + 'every batch and report "0 written", which looks identical to an empty harvest.');
  process.exit(2);
}

const doc = JSON.parse(readFileSync(join(ROOT, 'packages', 'corpus', 'data', 'asset-seeds.json'), 'utf8'));
// The harvest carries two underscore-prefixed fields for the later binary fetch. They are not part
// of AssetProvenance and the server would not store them, so they are dropped at the boundary
// rather than being sent and silently ignored.
const assets = doc.assets.slice(0, LIMIT).map(({ _download, _publishedAt, ...rec }) => rec);
console.error(`${assets.length} assets, ${Math.ceil(assets.length / BATCH)} batches -> ${BASE}`);
if (DRY) { console.error('--dry: nothing sent'); process.exit(0); }

let written = 0;
const rejected = [];
const failedBatches = [];
for (let i = 0; i < assets.length; i += BATCH) {
  const slice = assets.slice(i, i + BATCH);
  let res, body;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${BASE}/api/admin/assets/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Admin-Key': KEY },
        body: JSON.stringify({ assets: slice, seed: true }),
      });
      body = await res.json().catch(() => null);
      if (res.ok) break;
    } catch (e) { body = { error: String(e.message ?? e) }; }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  if (!res?.ok) {
    failedBatches.push({ from: i, status: res?.status ?? 0, body });
    console.error(`batch ${i}: HTTP ${res?.status ?? 'network'} ${JSON.stringify(body).slice(0, 160)}`);
    continue;
  }
  written += body.written ?? 0;
  for (const r of body.rejected ?? []) rejected.push(r);
  if (body.truncated) console.error(`batch ${i}: SERVER TRUNCATED — batch size exceeds INGEST_MAX_BATCH`);
  if ((i / BATCH) % 20 === 0) console.error(`${written}/${assets.length}`);
}

console.error(`\nwritten ${written} · rejected ${rejected.length} · failed batches ${failedBatches.length}`);
for (const r of rejected.slice(0, 10)) console.error(`  REJECT ${r.id}: ${r.errors.join('; ')}`);
if (rejected.length || failedBatches.length) process.exit(1);
