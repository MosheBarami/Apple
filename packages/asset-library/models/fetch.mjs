#!/usr/bin/env node
// Download the licence-cleared model packs into the gitignored store (D-MODELLIB-1).
//
//   node packages/asset-library/models/fetch.mjs [--only <source>] [--limit N]
//
// Reads ../sources/models-packs.jsonl and ../sources/models-github.jsonl. A row is fetched only when
// its licence is on the allowlist below and it has a direct https URL on a trusted host; everything
// else stays a reference-only catalog row. Nothing is ever executed: archives are unpacked and then
// every file whose extension is not a model, texture or licence text is deleted, so an executable
// cannot survive in the store whatever an archive carried.
//
// Safety limits, checked before every download: at most 8 GB written in total, and the run stops
// when free disk space falls under 15 GB. Every skip is logged with its reason to
// ../models-store/fetch-log.jsonl and summarised in ./fetch-report.json (committed).
//
// Roblox files (.rbxm/.rbxmx/.rbxl/.rbxlx) go through scan-rbx.luau: every script is listed with its
// backdoor findings and removed, and only the script-free copy is kept.
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, statfsSync, unlinkSync, writeFileSync, appendFileSync, renameSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { gunzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, '..');
export const STORE = join(LIB, 'models-store');
const LOG = join(STORE, 'fetch-log.jsonl');
const REPORT = join(HERE, 'fetch-report.json');
const LUNE = process.env.LUNE ?? join(homedir(), '.rokit/tool-storage/lune-org/lune/0.10.5/lune');

export const MAX_TOTAL_BYTES = 8 * 1024 ** 3;
export const MIN_FREE_BYTES = 15 * 1024 ** 3;
const MAX_FILE_BYTES = 400 * 1024 ** 2;

/** Licences that allow a copy in the project. CC-BY rows carry their attribution into the manifest. */
export const DOWNLOAD_LICENCES = /^(CC0|CC0-1\.0|Public ?Domain|CC-BY-[34]\.0|CC-BY|MIT|Apache-2\.0|BSD-[23]-Clause|Unlicense|ISC|0BSD|Zlib)$/i;
/** Hosts a download may come from. A row pointing anywhere else is catalogued, not fetched. */
const TRUSTED_HOSTS = /(^|\.)(kenney\.nl|github\.com|githubusercontent\.com|codeload\.github\.com|poly\.pizza|opengameart\.org|quaternius\.com|polyhaven\.org|polyhaven\.com)$/i;
/** What may stay in the store after unpacking. Everything else is deleted. */
const KEEP_EXT = new Set(['.glb', '.gltf', '.bin', '.fbx', '.obj', '.mtl', '.png', '.jpg', '.jpeg', '.tga', '.rbxm', '.rbxmx', '.rbxl', '.rbxlx', '.txt', '.md']);
const RBX_EXT = new Set(['.rbxm', '.rbxmx', '.rbxl', '.rbxlx']);

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

function readJsonl(p) {
  // A large source is committed gzipped (as in build.mjs): `x.jsonl.gz` is read in place of `x.jsonl`.
  const gz = existsSync(p + '.gz');
  if (!gz && !existsSync(p)) return [];
  return (gz ? gunzipSync(readFileSync(p + '.gz')).toString('utf8') : readFileSync(p, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function log(row) {
  appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n');
}
function freeBytes() {
  const s = statfsSync(STORE);
  return Number(s.bavail) * Number(s.bsize);
}
function dirBytes(d) {
  let n = 0;
  if (!existsSync(d)) return 0;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    n += e.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return n;
}
function walk(d, out = []) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isSymbolicLink()) { unlinkSync(p); continue; }
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function refusal(row) {
  if (row.downloadKind === 'polyhaven-api') return 'use ingest-polyhaven.mjs for verified dependencies';
  if (!row.download) return 'no direct download';
  if (row.use === 'reference-only') return 'reference-only row';
  if (!DOWNLOAD_LICENCES.test(String(row.licence ?? '').trim())) return `licence ${row.licence ?? 'unknown'} is not on the download allowlist`;
  let u;
  try { u = new URL(row.download); } catch { return 'download is not a URL'; }
  if (u.protocol !== 'https:') return 'download is not https';
  if (!TRUSTED_HOSTS.test(u.hostname)) return `host ${u.hostname} is not trusted`;
  if (row.downloadKind === 'gdrive' || row.downloadKind === 'itch') return `${row.downloadKind} needs an interactive download`;
  if (typeof row.downloadBytes === 'number' && row.downloadBytes > MAX_FILE_BYTES) return `download is ${Math.round(row.downloadBytes / 1e6)} MB, over the per-file cap`;
  return null;
}

async function download(url, to) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'apple-model-library/1.0 (+https://github.com)' } });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_FILE_BYTES) throw new Error(`content-length ${len} over the per-file cap`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(to));
  return statSync(to).size;
}

/** Keep one model format per pack: glb, else gltf, else fbx, else obj. Textures stay with fbx/obj/gltf. */
function prune(dir) {
  const files = walk(dir);
  const removed = { disallowed: 0, duplicateFormat: 0 };
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    if (!KEEP_EXT.has(ext)) { unlinkSync(f); removed.disallowed++; }
  }
  const left = walk(dir);
  const has = (e) => left.some((f) => extname(f).toLowerCase() === e);
  const primary = has('.glb') ? '.glb' : has('.gltf') ? '.gltf' : has('.fbx') ? '.fbx' : has('.obj') ? '.obj' : null;
  const needsTextures = primary === '.gltf' || primary === '.fbx' || primary === '.obj';
  for (const f of left) {
    const ext = extname(f).toLowerCase();
    const model = ['.glb', '.gltf', '.fbx', '.obj'].includes(ext);
    const support = ext === '.bin' ? primary === '.gltf' : ext === '.mtl' ? primary === '.obj' : ['.png', '.jpg', '.jpeg', '.tga'].includes(ext) ? needsTextures : true;
    if ((model && ext !== primary) || !support) { unlinkSync(f); removed.duplicateFormat++; }
  }
  // Preview images a pack ships at its top level are kept (one per pack) for the catalog page.
  return { primary, removed };
}

/**
 * Pack a multi-file .gltf (json + .bin + images) into one .glb, because Open Cloud takes a single
 * file per Model upload. Buffers are concatenated with 4-byte alignment and images become buffer
 * views. Returns false (and leaves the gltf alone) when a referenced file is missing or remote.
 */
export function gltfToGlb(gltfPath) {
  const dir = dirname(gltfPath);
  const json = JSON.parse(readFileSync(gltfPath, 'utf8'));
  const chunks = [];
  let offset = 0;
  const push = (buf) => {
    const at = offset;
    chunks.push(buf);
    offset += buf.length;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    return at;
  };
  const local = (uri) => {
    if (!uri || /^[a-z]+:/i.test(uri) && !uri.startsWith('data:')) return null;
    if (uri.startsWith('data:')) return Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
    const p = join(dir, decodeURIComponent(uri));
    return existsSync(p) ? readFileSync(p) : null;
  };
  const bufferStart = [];
  for (const b of json.buffers ?? []) {
    const bytes = local(b.uri);
    if (!bytes) return false;
    bufferStart.push(push(bytes));
  }
  for (const v of json.bufferViews ?? []) {
    v.byteOffset = (v.byteOffset ?? 0) + bufferStart[v.buffer];
    v.buffer = 0;
  }
  for (const img of json.images ?? []) {
    if (img.bufferView !== undefined) continue;
    const bytes = local(img.uri);
    if (!bytes) return false;
    const at = push(bytes);
    json.bufferViews = json.bufferViews ?? [];
    json.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: bytes.length });
    img.bufferView = json.bufferViews.length - 1;
    img.mimeType = img.mimeType ?? (/\.jpe?g$/i.test(img.uri ?? '') ? 'image/jpeg' : 'image/png');
    delete img.uri;
  }
  const bin = Buffer.concat(chunks);
  json.buffers = bin.length ? [{ byteLength: bin.length }] : [];
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  const jpad = (4 - (text.length % 4)) % 4;
  if (jpad) text = Buffer.concat([text, Buffer.alloc(jpad, 0x20)]);
  const total = 12 + 8 + text.length + (bin.length ? 8 + bin.length : 0);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(text.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const parts = [head, jh, text];
  if (bin.length) { const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4); parts.push(bh, bin); }
  writeFileSync(gltfPath.replace(/\.gltf$/i, '.glb'), Buffer.concat(parts));
  return true;
}

function unzip(zip, dir) {
  // -o overwrite, -q quiet. unzip refuses absolute paths and strips "../" (zip-slip) with a warning.
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir], { stdio: ['ignore', 'ignore', 'pipe'] });
}

function scanRbx(jobs) {
  if (!jobs.length) return [];
  const jobsFile = join(STORE, '_scan-jobs.json');
  const out = join(STORE, '_scan-report.json');
  writeFileSync(jobsFile, JSON.stringify(jobs));
  execFileSync(LUNE, ['run', join(HERE, 'scan-rbx.luau'), jobsFile, out], { stdio: ['ignore', 'ignore', 'inherit'] });
  return JSON.parse(readFileSync(out, 'utf8'));
}

async function main() {
  mkdirSync(STORE, { recursive: true });
  const rows = [...readJsonl(join(LIB, 'sources', 'models-packs.jsonl')), ...readJsonl(join(LIB, 'sources', 'models-github.jsonl'))]
    .filter((r) => !only || r.source === only);
  let written = dirBytes(STORE);
  const summary = { considered: 0, fetched: 0, already: 0, skipped: {}, failed: 0, stoppedFor: null, scans: [] };
  const skip = (row, why) => {
    // Counted by reason class, logged in full: "licence X" and "host Y" collapse to one bucket each.
    const bucket = why.replace(/\d+ MB/, 'N MB').replace(/host \S+/, 'host').replace(/licence .* is not/, 'licence is not');
    summary.skipped[bucket] = (summary.skipped[bucket] ?? 0) + 1;
    log({ id: row.id, skipped: why });
  };
  let n = 0;
  let stop = false;
  // Bytes promised to downloads still in flight, so parallel lanes cannot overshoot the cap together.
  let inflight = 0;
  const rbxJobs = [];
  // Some hosts (kenney.nl) throttle each connection to ~20 KB/s, so a few downloads run at once.
  const queue = [];
  for (const row of rows) {
    if (queue.length >= limit) break;
    summary.considered++;
    const why = refusal(row);
    if (why) { skip(row, why); continue; }
    if (existsSync(join(STORE, row.source, row.id, '.done'))) { summary.already++; continue; }
    queue.push(row);
  }
  const one = async (row) => {
    const dir = join(STORE, row.source, row.id);
    if (stop) { skip(row, `stopped: ${summary.stoppedFor}`); return; }
    const promise = row.downloadBytes ?? MAX_FILE_BYTES;
    if (written + inflight + promise > MAX_TOTAL_BYTES) { summary.stoppedFor = 'the 8 GB download cap'; stop = true; skip(row, 'download cap reached'); return; }
    if (freeBytes() < MIN_FREE_BYTES) { summary.stoppedFor = 'free disk under 15 GB'; stop = true; skip(row, 'free disk under 15 GB'); return; }
    n++;
    inflight += promise;
    mkdirSync(dir, { recursive: true });
    const url = row.download;
    const kind = row.downloadKind ?? (url.endsWith('.zip') ? 'zip' : 'file');
    try {
      if (kind === 'zip' || kind === 'github-archive') {
        const zip = join(STORE, `_${row.id}.zip`);
        await download(url, zip);
        unzip(zip, dir);
        unlinkSync(zip);
        let p = prune(dir);
        if (p.primary === '.gltf') {
          // One file per model: pack each .gltf with its buffers and textures, then re-prune so the
          // loose .gltf/.bin/.png are dropped in favour of the .glb.
          for (const g of walk(dir).filter((f) => extname(f).toLowerCase() === '.gltf')) gltfToGlb(g);
          p = prune(dir);
        }
        if (!p.primary && !walk(dir).some((f) => RBX_EXT.has(extname(f).toLowerCase()))) {
          rmSync(dir, { recursive: true, force: true });
          skip(row, 'archive held no importable model file');
          return;
        }
      } else {
        const ext = extname(new URL(url).pathname).toLowerCase() || '.bin';
        if (!KEEP_EXT.has(ext)) { rmSync(dir, { recursive: true, force: true }); skip(row, `file type ${ext} is not a model`); return; }
        await download(url, join(dir, `model${ext}`));
      }
      for (const f of walk(dir)) {
        const ext = extname(f).toLowerCase();
        if (!RBX_EXT.has(ext)) continue;
        const raw = f + '.raw';
        renameSync(f, raw);
        rbxJobs.push({ in: raw, out: f.replace(/\.(rbxlx?|rbxmx?)$/i, '.rbxm'), row: row.id, keepScripts: false });
      }
      writeFileSync(join(dir, '.done'), JSON.stringify({ id: row.id, url, at: new Date().toISOString() }));
      const size = dirBytes(dir);
      written += size;
      summary.fetched++;
      log({ id: row.id, fetched: url, bytes: size });
    } catch (e) {
      summary.failed++;
      rmSync(dir, { recursive: true, force: true });
      log({ id: row.id, failed: String(e?.message ?? e) });
    } finally {
      inflight -= promise;
    }
    if (n % 20 === 0) console.error(`fetched ${summary.fetched}, ${Math.round(written / 1e6)} MB`);
  };
  const LANES = Number(process.env.FETCH_LANES ?? 8);
  let next = 0;
  await Promise.all(Array.from({ length: LANES }, async () => {
    while (next < queue.length) await one(queue[next++]);
  }));
  // Scan every Roblox file that arrived this run. The raw copy is deleted whether or not it scanned:
  // only the stripped copy is ever kept.
  const reports = scanRbx(rbxJobs.map(({ in: i, out, keepScripts }) => ({ in: i, out, keepScripts })));
  const scans = [];
  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    const job = rbxJobs[i];
    scans.push({
      id: job.row,
      file: relative(STORE, job.out),
      ok: !r.error,
      error: r.error ? String(r.error).split('\n')[0] : undefined,
      scriptsFound: Array.isArray(r.scripts) ? r.scripts.length : null,
      findings: Array.isArray(r.scripts) ? [...new Set(r.scripts.flatMap((s) => (Array.isArray(s.findings) ? s.findings : [])))] : [],
      removed: r.removed ?? 0,
      clean: r.clean === true && !r.error,
      parts: r.parts ?? null,
      meshParts: r.meshParts ?? null,
      instances: r.instances ?? null,
      size: r.size ?? null,
    });
    try { unlinkSync(job.in); } catch {}
    if (r.error && existsSync(job.out)) unlinkSync(job.out);
  }
  const scanFile = join(HERE, 'scan-report.json');
  const prior = existsSync(scanFile) ? JSON.parse(readFileSync(scanFile, 'utf8')) : [];
  const merged = new Map(prior.map((s) => [s.file, s]));
  for (const s of scans) merged.set(s.file, s);
  writeFileSync(scanFile, JSON.stringify([...merged.values()].sort((a, b) => a.file.localeCompare(b.file)), null, 1) + '\n');
  summary.scans = { thisRun: scans.length, clean: scans.filter((s) => s.clean).length, withScripts: scans.filter((s) => s.scriptsFound).length, unreadable: scans.filter((s) => !s.ok).length };
  summary.storeBytes = dirBytes(STORE);
  summary.freeBytes = freeBytes();
  const prev = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')) : {};
  writeFileSync(REPORT, JSON.stringify({ ...prev, [only ?? 'all']: { at: new Date().toISOString(), ...summary } }, null, 1) + '\n');
  console.log(JSON.stringify(summary));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
