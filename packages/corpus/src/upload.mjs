#!/usr/bin/env node
// upload.mjs — push data/chunks.jsonl to the deployed worker.
//   1. POST {API_BASE}/api/admin/corpus-init                     (once)
//   2. POST {API_BASE}/api/admin/embed-batch  (batches of 50)    with X-Admin-Key
//      body: { chunks: [{vecId,docSlug,title,url,kind,text}], skipVectors: !allEmbed }
// Batches are grouped so every batch is all-embed or all-skip. Resumable via
// data/upload-progress.json; retries 429/5xx with exponential backoff.
// Flags: --limit N  (max batches this run, to cap neuron spend)

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHUNKS_PATH = path.join(ROOT, 'data', 'chunks.jsonl');
const PROGRESS_PATH = path.join(ROOT, 'data', 'upload-progress.json');
const BATCH_SIZE = 50;
const MAX_RETRIES = 6;

const API_BASE = process.env.API_BASE?.replace(/\/+$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY;

function fail(msg) {
  console.error(`[upload] ERROR: ${msg}`);
  process.exit(1);
}

if (!API_BASE) fail('API_BASE env var is not set. Example: API_BASE=https://golem-worker.example.workers.dev ADMIN_KEY=... node src/upload.mjs');
if (!ADMIN_KEY) fail('ADMIN_KEY env var is not set. It must match the worker ADMIN_KEY secret.');
if (!existsSync(CHUNKS_PATH)) fail(`${CHUNKS_PATH} not found — run "pnpm chunk" first.`);

const limitArg = process.argv.indexOf('--limit');
const batchLimit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;
if (limitArg !== -1 && (!Number.isFinite(batchLimit) || batchLimit <= 0)) fail('--limit must be a positive number');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(pathName, body, attempt = 0) {
  let res;
  try {
    res = await fetch(`${API_BASE}${pathName}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw new Error(`network error after ${MAX_RETRIES} retries: ${err.message}`);
    const wait = Math.min(30000, 1000 * 2 ** attempt);
    console.warn(`[upload] network error (${err.message}); retry in ${wait}ms`);
    await sleep(wait);
    return post(pathName, body, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= MAX_RETRIES) throw new Error(`${pathName} failed with ${res.status} after ${MAX_RETRIES} retries`);
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 1000 * 2 ** attempt);
    console.warn(`[upload] ${pathName} -> ${res.status}; retry in ${wait}ms`);
    await sleep(wait);
    return post(pathName, body, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathName} -> ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function loadChunks() {
  const lines = readFileSync(CHUNKS_PATH, 'utf8').split('\n').filter((l) => l.trim());
  const fileHash = createHash('sha1').update(lines.join('\n')).digest('hex');
  const chunks = lines.map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (err) {
      fail(`chunks.jsonl line ${i + 1} is not valid JSON: ${err.message}`);
    }
  });
  return { chunks, fileHash };
}

function buildBatches(chunks) {
  // group by embed flag so each batch has a single skipVectors value;
  // embedded chunks go first (highest retrieval value).
  const embed = chunks.filter((c) => c.embed);
  const fts = chunks.filter((c) => !c.embed);
  const batches = [];
  for (const [list, allEmbed] of [
    [embed, true],
    [fts, false],
  ]) {
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      batches.push({ chunks: list.slice(i, i + BATCH_SIZE), allEmbed });
    }
  }
  return batches;
}

function loadProgress(fileHash, batchCount) {
  if (!existsSync(PROGRESS_PATH)) return { fileHash, initDone: false, done: [] };
  try {
    const p = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
    if (p.fileHash !== fileHash) {
      console.warn('[upload] chunks.jsonl changed since last run — restarting progress from scratch.');
      return { fileHash, initDone: false, done: [] };
    }
    if (!Array.isArray(p.done)) p.done = [];
    p.done = p.done.filter((i) => Number.isInteger(i) && i >= 0 && i < batchCount);
    return p;
  } catch {
    console.warn('[upload] upload-progress.json unreadable — starting fresh.');
    return { fileHash, initDone: false, done: [] };
  }
}

async function saveProgress(progress) {
  await writeFile(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

async function main() {
  const { chunks, fileHash } = loadChunks();
  const batches = buildBatches(chunks);
  const progress = loadProgress(fileHash, batches.length);
  const doneSet = new Set(progress.done);

  const embedTotal = chunks.filter((c) => c.embed).length;
  console.log(`[upload] ${chunks.length} chunks (${embedTotal} embed, ${chunks.length - embedTotal} fts-only) in ${batches.length} batches of ≤${BATCH_SIZE}`);
  console.log(`[upload] target ${API_BASE}; ${doneSet.size} batches already done${Number.isFinite(batchLimit) ? `; limit ${batchLimit} batches this run` : ''}`);

  if (!progress.initDone) {
    console.log('[upload] POST /api/admin/corpus-init ...');
    await post('/api/admin/corpus-init', {});
    progress.initDone = true;
    await saveProgress(progress);
  }

  let sentThisRun = 0;
  let chunksThisRun = 0;
  let embeddedThisRun = 0;
  const started = Date.now();

  for (let i = 0; i < batches.length; i++) {
    if (doneSet.has(i)) continue;
    if (sentThisRun >= batchLimit) {
      console.log(`[upload] --limit ${batchLimit} reached; stopping. Re-run to continue.`);
      break;
    }
    const { chunks: batchChunks, allEmbed } = batches[i];
    const body = {
      chunks: batchChunks.map(({ vecId, docSlug, title, url, kind, text }) => ({ vecId, docSlug, title, url, kind, text })),
      skipVectors: !allEmbed,
    };
    const res = await post('/api/admin/embed-batch', body);
    sentThisRun++;
    chunksThisRun += batchChunks.length;
    if (allEmbed) embeddedThisRun += batchChunks.length;
    doneSet.add(i);
    progress.done = [...doneSet];
    await saveProgress(progress);
    const pct = ((doneSet.size / batches.length) * 100).toFixed(1);
    console.log(
      `[upload] batch ${i + 1}/${batches.length} ok (${allEmbed ? 'embed' : 'fts-only'}, upserted ${res.upserted ?? batchChunks.length}) — ${pct}% done, this run: ${chunksThisRun} chunks / ${embeddedThisRun} embedded`
    );
  }

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  const remaining = batches.length - doneSet.size;
  console.log(`[upload] run complete in ${secs}s: ${sentThisRun} batches, ${chunksThisRun} chunks (${embeddedThisRun} embedded).`);
  console.log(remaining === 0 ? '[upload] ALL batches uploaded.' : `[upload] ${remaining} batches remaining — re-run to continue.`);
}

main().catch((err) => {
  console.error('[upload] fatal:', err.message);
  process.exit(1);
});
