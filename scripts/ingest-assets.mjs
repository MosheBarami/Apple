#!/usr/bin/env node
// Push the harvest into the live library, in batches, through the product's own write path.
//
// Usage:  ADMIN_KEY=… node scripts/ingest-assets.mjs [--base https://…] [--limit N] [--dry]
//
// EVERY BATCH'S REJECTS ARE PRINTED AND COUNTED. An ingest that reports "7,277 written" while the
// server refused a third of them is the failure this repository names most often: a success
// message covering a partial result. The exit code is non-zero if anything was refused, so a
// silent partial ingest cannot pass for a clean one.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', process.env.APPLE_BASE ?? 'https://golem.moshe-barami111.workers.dev');
const LIMIT = Number(arg('--limit', '0')) || Infinity;
const DRY = process.argv.includes('--dry');
const BATCH = 500; // must not exceed INGEST_MAX_BATCH in apps/worker/src/asset-ingest.ts
const KEY = process.env.ADMIN_KEY;

if (!KEY && !DRY) {
  console.error('ADMIN_KEY is not set. Refusing to run — an unauthenticated ingest would 401 on\n'
    + 'every batch and report "0 written", which looks identical to an empty harvest.');
  process.exit(2);
}

// The harvest is now several files, one per source, plus the original two-source seed file. They
// are read together so the ingest has one notion of "the library" rather than one per artefact.
const FILES = process.argv.includes('--seeds-only')
  ? [join(ROOT, 'packages', 'corpus', 'data', 'asset-seeds.json')]
  : [
      join(ROOT, 'packages', 'corpus', 'data', 'asset-seeds.json'),
      ...readdirSync(join(ROOT, 'packages', 'corpus', 'data', 'library'))
        .filter((f) => f.endsWith('.json') && f !== 'index.json')
        .map((f) => join(ROOT, 'packages', 'corpus', 'data', 'library', f)),
    ];
const doc = { assets: [] };
const seenIds = new Set();
let duplicates = 0;
for (const f of FILES) {
  if (!existsSync(f)) continue;
  const part = JSON.parse(readFileSync(f, 'utf8'));
  if (part.failed === true) { console.error(`skipping ${f}: the harvest recorded a failure`); continue; }
  for (const a of part.assets ?? []) {
    // An id collision would silently overwrite one source's provenance with another's, and the
    // whole point of these rows is that each one says where it came from.
    if (seenIds.has(a.id)) { duplicates++; continue; }
    seenIds.add(a.id);
    doc.assets.push(a);
  }
}
if (duplicates) console.error(`${duplicates} duplicate ids skipped across sources`);
// The harvest carries two underscore-prefixed fields for the later binary fetch. They are not part
// of AssetProvenance and the server would not store them, so they are dropped at the boundary
// rather than being sent and silently ignored.
// The underscore-prefixed fields are harvest bookkeeping, not provenance: the server would not
// store them, so they are dropped at the boundary rather than sent and silently ignored.
const assets = doc.assets.slice(0, LIMIT).map(({ _download, _publishedAt, _licenceId, assetCount, ...rec }) => rec);
console.error(`${assets.length} assets -> ${BASE}`);

//[[ TWO KINDS OF ROW, AND THE DIFFERENCE DECIDES WHETHER ANYONE EVER SEES THEM.
//
//   A row with a robloxAssetId is USABLE RIGHT NOW: the Creator Store rows are already Roblox
//   asset ids, so a game references them with no upload to anybody's account. A row without one is
//   a catalogue entry waiting for its bytes to be imported.
//
//   `ftsSearch` filters on `status = 'active'`, and `seed: true` stores `pending_ingest`. Sending
//   all 460,000 rows the same way would therefore have hidden every one of the 102,777 immediately
//   usable assets behind a flag that means "not imported yet" — a library that is full and answers
//   every search with nothing.
//
//   So the two are sent separately, and `seed` follows the row rather than the run: a row carrying
//   a Roblox id is not a seed, and the stricter validation applies to it. ]]
const ready = assets.filter((a) => a.robloxAssetId);
const pending = assets.filter((a) => !a.robloxAssetId);
console.error(`${ready.length} already usable (active) · ${pending.length} catalogue-only (pending_ingest)`);
if (DRY) { console.error('--dry: nothing sent'); process.exit(0); }

let written = 0;
const rejected = [];
const failedBatches = [];
//[[ THE CURATED PACKS GO FIRST, AND THE ORDER USED TO BE THE OTHER WAY ROUND.
//
//   `ready` is every row carrying a Roblox asset id, which in practice means the Creator Store
//   scrape — and the scrape is 2008-era user uploads: "Bakiiiiiiiiiiiiiiii", "Part2",
//   "diediedieDIELess", "Potato breaking through wall! o_0", anime rips. `pending` is Kenney,
//   Poly Haven, ambientCG, Quaternius, OpenGameArt and game-icons: CC0 packs with clean names,
//   assembled and maintained by people who make game art.
//
//   Sending `ready` first meant that an ingest interrupted half way — which is what happened,
//   twice — left the database holding the scrape and none of the library. The owner's rule is
//   "nothing outdated", and the first 80,000 rows were the only outdated ones we have.
//
//   `--scrape-first` restores the old order for anybody who wants it. The default is the packs.
const scrapeFirst = process.argv.includes('--scrape-first');
const readyQ = ready.map((a, i) => ({ a, seed: false, status: 'active', k: i }));
const pendingQ = pending.map((a, i) => ({ a, seed: true, status: 'pending_ingest', k: i }));
const queue = scrapeFirst ? [...readyQ, ...pendingQ] : [...pendingQ, ...readyQ];

//[[ AND IT PACES ITSELF, BECAUSE IT SHARES D1 WITH THE WEBSITE.
//
//   The asset store, the static site and every session live in ONE D1 database. A full-speed
//   ingest at ~320 rows/sec drove D1 to "is overloaded. Requests queued for too long." and the
//   site deploy could not write a single byte — a background data job taking down the product.
//   A pause between batches costs minutes and buys a database that still answers everything else.
const PACE_MS = Number(arg('--pace', '400'));
for (let i = 0; i < queue.length; i += BATCH) {
  const group = queue.slice(i, i + BATCH);
  // A batch never mixes the two: they are validated differently and stored differently.
  const seed = group[0].seed;
  const status = group[0].status;
  const slice = group.filter((g) => g.seed === seed).map((g) => g.a);
  let res, body;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // A TIMEOUT, because node's fetch has none. A stalled connection hangs for ever, and a job
      // that hangs is indistinguishable from a job that is merely slow: the process is alive, the
      // log is quiet, the row count does not move, and nothing anywhere says which of the two it
      // is. Measured — one batch of 500 takes about 9 seconds, so 120 is generous and finite.
      res = await fetch(`${BASE}/api/admin/assets/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Admin-Key': KEY },
        body: JSON.stringify({ assets: slice, seed, status }),
        signal: AbortSignal.timeout(120_000),
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
  console.error(`${written}/${queue.length}`);
  if (PACE_MS > 0) await new Promise((r) => setTimeout(r, PACE_MS));
}

console.error(`\nwritten ${written} · rejected ${rejected.length} · failed batches ${failedBatches.length}`);
for (const r of rejected.slice(0, 10)) console.error(`  REJECT ${r.id}: ${r.errors.join('; ')}`);
if (rejected.length || failedBatches.length) process.exit(1);
