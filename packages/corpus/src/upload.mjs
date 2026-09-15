#!/usr/bin/env node
// upload.mjs — bring the deployed index into line with data/chunks.jsonl.
//
//[[ THIS USED TO BE A RE-UPLOAD, NOT AN UPDATE.
//
//   The resume file keyed on a hash of the WHOLE chunks.jsonl, so editing one guide page printed
//   "chunks.jsonl changed since last run — restarting progress from scratch" and re-sent all 8,326
//   passages, re-embedding the ~8,000 that carry vectors. A one-word documentation fix cost a full
//   corpus build, which is why in practice the corpus was never refreshed and the index aged.
//
//   It also resumed from a LOCAL belief about what had been sent. What the index actually holds is
//   a different fact, and the two diverge on every interrupted run and every database replacement.
//
//   Now: ask the index what it holds (GET /api/admin/corpus-manifest), diff it against the chunks
//   on disk (index-plan.mjs), and send only the difference — plus prune what no longer exists
//   upstream, because a passage deleted from the docs keeps answering queries forever otherwise.
//
//   When the manifest cannot be read, this REFUSES rather than falling back to "send everything".
//   An unreadable manifest and an empty index produce opposite plans and only one of them is free.
//   `--full` is how you say you meant it. ]]
//
//   1. GET  {API_BASE}/api/admin/corpus-manifest?after=&limit=      (paged, X-Admin-Key)
//   2. POST {API_BASE}/api/admin/corpus-init                        (once)
//   3. POST {API_BASE}/api/admin/embed-batch   (batches of 50)      with X-Admin-Key
//      body: { chunks: [{vecId,docSlug,title,url,kind,text,contentHash}], skipVectors: !allEmbed }
//   4. POST {API_BASE}/api/admin/corpus-prune  (batches of 200)     for passages no longer wanted
//
// Flags:
//   --limit N   max batches this run, to cap neuron spend
//   --full      index everything without consulting the manifest (deliberate, expensive)
//   --no-prune  leave passages that are no longer in chunks.jsonl in the index
//   --dry       plan and report, send nothing

import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchWork, changedDocs, planFullIndex, planIndex } from './index-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHUNKS_PATH = path.join(ROOT, 'data', 'chunks.jsonl');
const PROGRESS_PATH = path.join(ROOT, 'data', 'upload-progress.json');
const BATCH_SIZE = 50;
const PRUNE_BATCH = 200;
const MAX_RETRIES = 6;

const API_BASE = process.env.API_BASE?.replace(/\/+$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY;

function fail(msg) {
  console.error(`[upload] ERROR: ${msg}`);
  process.exit(1);
}

const flag = (name) => process.argv.includes(name);
const FULL = flag('--full');
const NO_PRUNE = flag('--no-prune');
const DRY = flag('--dry');

if (!API_BASE) fail('API_BASE env var is not set. Example: API_BASE=https://golem-worker.example.workers.dev ADMIN_KEY=... node src/upload.mjs');
if (!ADMIN_KEY) fail('ADMIN_KEY env var is not set. It must match the worker ADMIN_KEY secret.');
if (!existsSync(CHUNKS_PATH)) fail(`${CHUNKS_PATH} not found — run "pnpm chunk" first.`);

const limitArg = process.argv.indexOf('--limit');
const batchLimit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;
if (limitArg !== -1 && (!Number.isFinite(batchLimit) || batchLimit <= 0)) fail('--limit must be a positive number');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(method, pathName, body, attempt = 0) {
  let res;
  try {
    res = await fetch(`${API_BASE}${pathName}`, {
      method,
      headers: { 'content-type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw new Error(`network error after ${MAX_RETRIES} retries: ${err.message}`);
    const wait = Math.min(30000, 1000 * 2 ** attempt);
    console.warn(`[upload] network error (${err.message}); retry in ${wait}ms`);
    await sleep(wait);
    return request(method, pathName, body, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= MAX_RETRIES) throw new Error(`${pathName} failed with ${res.status} after ${MAX_RETRIES} retries`);
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 1000 * 2 ** attempt);
    console.warn(`[upload] ${pathName} -> ${res.status}; retry in ${wait}ms`);
    await sleep(wait);
    return request(method, pathName, body, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathName} -> ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const post = (pathName, body) => request('POST', pathName, body);
const get = (pathName) => request('GET', pathName, undefined);

function loadChunks() {
  const lines = readFileSync(CHUNKS_PATH, 'utf8').split('\n').filter((l) => l.trim());
  return lines.map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (err) {
      fail(`chunks.jsonl line ${i + 1} is not valid JSON: ${err.message}`);
    }
  });
}

/**
 * Read every page of the index manifest.
 *
 * Returns null when it could not be read in full. A PARTIAL manifest is worse than none: the pages
 * that failed look like passages the index does not hold, and the plan would re-upload every one
 * of them. So a failure anywhere discards the whole thing.
 */
async function fetchManifest() {
  const entries = [];
  let after = 0;
  for (let page = 0; page < 200; page++) {
    let res;
    try {
      res = await get(`/api/admin/corpus-manifest?after=${after}&limit=1000`);
    } catch (err) {
      console.warn(`[upload] manifest page ${page + 1} failed: ${err.message}`);
      return null;
    }
    if (!res || res.known !== true || !Array.isArray(res.entries)) {
      console.warn(`[upload] manifest page ${page + 1} did not come back known: ${JSON.stringify(res)?.slice(0, 200)}`);
      return null;
    }
    entries.push(...res.entries);
    if (res.nextAfter === null || res.nextAfter === undefined) return { entries };
    after = res.nextAfter;
  }
  console.warn('[upload] manifest paging did not terminate; refusing to trust a truncated manifest');
  return null;
}

async function main() {
  const chunks = loadChunks();

  let plan;
  if (FULL) {
    plan = planFullIndex(chunks, '--full was passed');
    console.log('[upload] --full: indexing everything WITHOUT consulting the manifest.');
  } else {
    const manifest = await fetchManifest();
    if (manifest === null) {
      fail(
        'the index manifest could not be read, so there is no way to tell a fresh index from an unreachable one. ' +
          'Re-run when the worker is reachable, or pass --full to deliberately re-index everything (this re-embeds the whole corpus).',
      );
    }
    plan = planIndex(manifest, chunks);
  }

  const s = plan.summary;
  const docs = changedDocs(plan);
  console.log(
    `[upload] ${s.desired} chunks on disk, ${s.indexed} in the index: ` +
      `${s.add} new, ${s.update} changed, ${s.reembed} missing vectors, ${s.unchanged} unchanged, ${s.remove} to prune ` +
      `(${docs.length} document${docs.length === 1 ? '' : 's'} touched)`,
  );

  const batches = batchWork(plan, BATCH_SIZE);
  const embedTotal = batches.filter((b) => b.allEmbed).reduce((n, b) => n + b.chunks.length, 0);
  console.log(`[upload] ${batches.length} batches of <=${BATCH_SIZE} (${embedTotal} chunks need embedding)`);

  if (DRY) {
    for (const d of docs.slice(0, 40)) console.log(`[upload]   ${d.docSlug}: +${d.added} ~${d.updated} v${d.reembedded}`);
    if (docs.length > 40) console.log(`[upload]   ... and ${docs.length - 40} more`);
    console.log('[upload] --dry: nothing sent.');
    return;
  }

  if (!batches.length && !plan.remove.length) {
    console.log('[upload] the index already matches chunks.jsonl. Nothing to do.');
    return;
  }

  await post('/api/admin/corpus-init', {});

  let sentThisRun = 0;
  let chunksThisRun = 0;
  let embeddedThisRun = 0;
  const started = Date.now();

  for (let i = 0; i < batches.length; i++) {
    if (sentThisRun >= batchLimit) {
      console.log(`[upload] --limit ${batchLimit} reached; stopping. Re-run to continue — the manifest remembers what landed.`);
      break;
    }
    const { chunks: batchChunks, allEmbed } = batches[i];
    const res = await post('/api/admin/embed-batch', {
      chunks: batchChunks.map(({ vecId, docSlug, title, url, kind, text, contentHash }) => ({ vecId, docSlug, title, url, kind, text, contentHash })),
      skipVectors: !allEmbed,
    });
    sentThisRun++;
    chunksThisRun += batchChunks.length;
    if (allEmbed) embeddedThisRun += batchChunks.length;
    const pct = (((i + 1) / batches.length) * 100).toFixed(1);
    console.log(
      `[upload] batch ${i + 1}/${batches.length} ok (${allEmbed ? 'embed' : 'fts-only'}, upserted ${res.upserted ?? batchChunks.length}) — ${pct}%, this run: ${chunksThisRun} chunks / ${embeddedThisRun} embedded`,
    );
  }

  let pruned = 0;
  if (plan.remove.length && !NO_PRUNE && sentThisRun < batchLimit) {
    for (let i = 0; i < plan.remove.length; i += PRUNE_BATCH) {
      const ids = plan.remove.slice(i, i + PRUNE_BATCH);
      const res = await post('/api/admin/corpus-prune', { vecIds: ids });
      pruned += ids.length;
      if (res.vectorsDeleted === false) {
        console.warn(`[upload] pruned ${ids.length} rows but the VECTORS were NOT deleted — they will keep matching until that is fixed`);
      }
    }
    console.log(`[upload] pruned ${pruned} passages no longer in chunks.jsonl`);
  } else if (plan.remove.length) {
    console.log(`[upload] ${plan.remove.length} stale passages left in place${NO_PRUNE ? ' (--no-prune)' : ''}`);
  }

  // A RECORD of the last run, not a resume source. The index manifest is the resume source, because
  // it is the only one that describes what actually landed.
  await writeFile(
    PROGRESS_PATH,
    JSON.stringify(
      { ranAt: new Date().toISOString(), plan: plan.summary, manifestKnown: plan.manifestKnown, batchesSent: sentThisRun, chunksSent: chunksThisRun, embedded: embeddedThisRun, pruned },
      null,
      2,
    ),
  );

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`[upload] run complete in ${secs}s: ${sentThisRun}/${batches.length} batches, ${chunksThisRun} chunks (${embeddedThisRun} embedded), ${pruned} pruned.`);
  console.log(sentThisRun >= batches.length ? '[upload] ALL planned work uploaded.' : `[upload] ${batches.length - sentThisRun} batches remaining — re-run to continue.`);
}

main().catch((err) => {
  console.error('[upload] fatal:', err.message);
  process.exit(1);
});
