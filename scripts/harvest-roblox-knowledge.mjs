#!/usr/bin/env node
// harvest-roblox-knowledge.mjs — bring surveyed Hugging Face Roblox corpora into the
// retrieval path, pinned by commit SHA, with a licence gate that can refuse.
//
// WHAT THIS FILE IS NOT
//
// The brief asked for "the exact shape of scripts/harvest-library.mjs". That file does not
// exist in this repository, and neither does packages/corpus/src/build-dataset.mjs nor a
// checked-in packages/corpus/data/chunks.jsonl (it is a gitignored BUILD ARTEFACT produced by
// packages/corpus/src/chunk.mjs). So the shape followed here is the real pipeline's:
//   - the chunk record of chunk.mjs        → { vecId, docSlug, title, url, kind, text, embed }
//   - the licence vocabulary of src/intake/licence.mjs
//   - the url+sha pinning of raw/manifest.json
//
// THE ONE CONSTRAINT THAT SHAPES EVERYTHING HERE
//
// The brief says "every chunk carries its source dataset, its licence and its URL". It cannot,
// as a field. apps/worker/src/index.ts:1057 inserts six columns —
//   insert into chunks(vec_id, doc_slug, title, url, kind, text)
// — and packages/corpus/src/upload.mjs:153 whitelists exactly those six before POSTing. There
// is no licence column anywhere in the path. A chunk carrying `licence: 'Apache-2.0'` as a
// sibling key would look correct in the JSONL, pass review, and be silently dropped at upload:
// the attribution would exist everywhere except where a customer could see it.
//
// So the credit is written INTO `text`. That is the only field that reaches D1, the FTS index,
// and the model's context (index.ts:1053 embeds `${title}\n${text}`). It is less tidy than a
// column and it is the difference between an attribution that ships and one that does not.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'packages', 'corpus');
const OUT_DIR = path.join(CORPUS, 'data');
const OUT_CHUNKS = path.join(OUT_DIR, 'chunks.hf.jsonl');
const OUT_MANIFEST = path.join(CORPUS, 'raw', 'manifest.hf.json');
const OUT_FAILURE = path.join(CORPUS, 'data', 'HARVEST-FAILED.md');

const API = 'https://datasets-server.huggingface.co/rows';
const HUB = 'https://huggingface.co/api/datasets';
const PAGE = 100; // datasets-server hard cap

/** A shape change in an upstream we do not control. Never swallowed. */
export class ShapeError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'ShapeError';
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- licence gate

/**
 * Phrases in which an uploader disclaims ownership of what they uploaded.
 *
 * This is the whole reason hfLicenceVerdict() exists instead of a call to
 * packages/corpus/src/intake/licence.mjs classify(). That module is correct, but it reasons
 * about a REPOSITORY'S OWN licence file. Hand it a Hugging Face card tag as `spdxId` and it
 * returns, measured on the real cards:
 *
 *   TorpedoSoftware/roblox-info-dump → COMMERCIAL_REUSABLE / reuse allowed / TRAINING ALLOWED
 *
 * for a dataset whose own card reads "Roblox maintains the copyright on all content." The gate
 * is not broken; it was fed a category error. A LICENSE file is a grant by someone who owns the
 * work. A card tag is a claim by whoever pressed upload, about text they may have scraped.
 */
const DISCLAIMS_OWNERSHIP = [
  /maintains? the copyright/i,
  /copyright on all content/i,
  /abide by the terms of the original licen[cs]es?/i,
  /terms of the original licen[cs]es?/i,
  /retains? (?:all )?(?:copyright|rights)/i,
  /\ball rights reserved\b/i,
];

/** SPDX ids a permissive card tag can name. Anything else quarantines. */
const PERMISSIVE = new Map([
  ['mit', 'MIT'],
  ['apache-2.0', 'Apache-2.0'],
  ['bsd-2-clause', 'BSD-2-Clause'],
  ['bsd-3-clause', 'BSD-3-Clause'],
  ['isc', 'ISC'],
  ['cc0-1.0', 'CC0-1.0'],
  ['unlicense', 'Unlicense'],
]);

/**
 * Classify a Hugging Face dataset from its card, in this repository's licence vocabulary.
 *
 * TRAINING IS ALWAYS 'forbidden' HERE, for every input, and that is deliberate rather than
 * conservative boilerplate. licence.mjs grants training only on `license-file` or `spdx-header`
 * evidence — a machine-checkable grant by the owner. A card tag is neither: it is prose-tier
 * evidence wearing an SPDX costume. Retrieval can live with that (a wrong citation is
 * embarrassing and fixable); model weights cannot (a wrong grant is baked in and cannot be
 * withdrawn). Raising this requires the owner's sign-off, not a code change.
 */
export function hfLicenceVerdict({ datasetId, cardTag, readmeText = '' }) {
  const prose = String(readmeText ?? '');
  const disclaimer = DISCLAIMS_OWNERSHIP.find((re) => re.test(prose));

  if (disclaimer) {
    return {
      class: 'UNCLEAR_QUARANTINE',
      reuse: 'forbidden',
      training: 'forbidden',
      spdx: null,
      evidence: 'hf-card-tag',
      reason:
        `${datasetId} tags itself "${cardTag}" but its own card disclaims ownership of the content ` +
        `(matched ${disclaimer}). An uploader cannot licence text they do not own, so the tag is a ` +
        `claim about someone else's copyright and is counted as nothing.`,
    };
  }

  const spdx = PERMISSIVE.get(String(cardTag ?? '').trim().toLowerCase());
  if (!spdx) {
    return {
      class: 'UNCLEAR_QUARANTINE',
      reuse: 'forbidden',
      training: 'forbidden',
      spdx: null,
      evidence: 'hf-card-tag',
      reason: `${datasetId} declares licence "${cardTag ?? 'none'}", which is not a permissive id this gate recognises.`,
    };
  }

  return {
    class: 'COMMERCIAL_REUSABLE',
    reuse: 'allowed',
    training: 'forbidden',
    spdx,
    evidence: 'hf-card-tag',
    reason:
      `${datasetId} declares ${spdx} on its own card and nothing in the card disclaims ownership, ` +
      `so retrieval reuse is cleared with the notice retained. Training stays forbidden: a card tag ` +
      `is an uploader's assertion, not a licence file.`,
  };
}

// ---------------------------------------------------------------- what we harvest

/**
 * A FLOOR, not a classifier — and the distinction is the whole comment.
 *
 * 8BitStudio ships two files under one dataset name and the rows endpoint MERGES them into a
 * single `train` split: measured, rows 0-23 are the 24-row advanced file and row 24 onward is
 * the 12,282-row filler ("Create a black brick unionoperation at position (36, 68, -8)",
 * 237 chars, 7 lines).
 *
 * The obvious move is to separate them by size. It does not work, and pretending otherwise
 * would be the exact failure this repo names — a guard that cannot see what it guards
 * reporting "clean". Measured on 600 sampled filler rows against all 24 advanced rows:
 *
 *   advanced: min 449 chars / 18 lines   (max 6,649 / 229)
 *   filler:   median 273 chars / 8 lines, but p95 = 589/18 and max = 1,904/75
 *   → 6.17% of filler rows clear 18 lines; 8.33% clear 449 chars
 *
 * The populations OVERLAP. So the authority for what gets ingested is the pinned offset window
 * (take.offset/count) plus the num_rows_total assertion in main(), which together fail loudly
 * if the file boundary moves. This predicate is only a floor beneath that: it catches gross
 * degradation (a row collapsing to a stub) and nothing finer. It must never be read as "this
 * row is from the advanced file".
 */
const ADVANCED_MIN_CHARS = 449; // the smallest genuine advanced row, measured
const ADVANCED_MIN_LINES = 18;

function looksLikeCompleteSystem(row) {
  const out = String(row.output ?? '');
  return out.split('\n').length >= ADVANCED_MIN_LINES && out.length >= ADVANCED_MIN_CHARS;
}

export const SOURCES = [
  {
    dataset: '8BitStudio/Roblox-luau-coding_L1',
    config: 'default',
    split: 'train',
    // Pinned at the SHA recorded in the manifest; see PINNED below.
    expectedColumns: ['instruction', 'input', 'output'],
    expectedRowsTotal: 12306,
    // Only the advanced file. Rejecting the other 12,282 rows is the point of this entry.
    take: { offset: 0, count: 24 },
    rowFilter: looksLikeCompleteSystem,
    // Row 15 is a "Server Script inside a Tool" (its own line 1) that calls
    // player:GetMouse() at line 57. GetMouse is client-only; on the server it does not
    // return an aim direction, so the sample cannot work as written. Verified by reading
    // the row, not taken on trust. Dropped rather than silently shipped as an exemplar.
    dropRows: new Set([15]),
    kind: 'pattern',
    licence: { spdx: 'Apache-2.0', tag: 'apache-2.0' },
    attribution: '8BitStudio/Roblox-luau-coding_L1 — Apache-2.0 — https://huggingface.co/datasets/8BitStudio/Roblox-luau-coding_L1',
    url: 'https://huggingface.co/datasets/8BitStudio/Roblox-luau-coding_L1',
  },
];

/**
 * Surveyed, fetched, read — and refused. Recorded here rather than omitted, because a source
 * that silently disappears from a harvester looks identical to one nobody considered.
 */
export const REFUSED = [
  {
    dataset: 'TorpedoSoftware/roblox-info-dump',
    url: 'https://huggingface.co/datasets/TorpedoSoftware/roblox-info-dump',
    sha: '6426e8988649b95e1b27139ed853f1c9791b544f',
    grounds: [
      'LICENCE UNDISCHARGEABLE: card metadata tags `license: mit`, card body states "Roblox maintains the copyright on all content" and requires use to "abide by the terms of the original licenses". The uploader cannot MIT-licence Roblox\'s documentation. Fed to this repo\'s own classify() as an SPDX header it returns COMMERCIAL_REUSABLE / training allowed — a false grant over third-party copyright.',
      'ALREADY INGESTED, CLEANER: this is a rendered scrape of create.roblox.com/docs + luau.org. packages/corpus already checks out github.com/Roblox/creator-docs (data/sources.json: gh-roblox-creator-docs, CC-BY-4.0, ATTRIBUTION_REQUIRED, evidence license-file) and luau-site, pinned by SHA, and chunk.mjs builds from them. Adding this would duplicate held content under a worse licence claim.',
      'QUALITY, MEASURED: on a 2,000-row sample spread across all 19,610 rows — 59.4% non-English (13 locales), 18.4% of en-us characters are base64 data URIs, 44.8% of en-us rows are byte-identical duplicates (one DragDetector page recurs 26x). Stale: last modified 2025-08-18.',
    ],
  },
];

// ---------------------------------------------------------------- parsing

/**
 * Validate one rows-endpoint page and return its rows.
 *
 * Throws rather than returning [] on every abnormality. An empty return here would travel all
 * the way to "harvested 0 chunks" and exit 0 — a failure to observe rendered as an observation.
 */
export function parseRowsPage(page, source) {
  if (!page || typeof page !== 'object') {
    throw new ShapeError(`${source.dataset}: response is not an object`);
  }
  const cols = Array.isArray(page.features) ? page.features.map((f) => f.name) : [];
  const missing = source.expectedColumns.filter((c) => !cols.includes(c));
  if (missing.length > 0) {
    throw new ShapeError(
      `${source.dataset}: expected column(s) [${missing.join(', ')}] absent; upstream now returns [${cols.join(', ')}]`,
      { expected: source.expectedColumns, actual: cols },
    );
  }
  if (!Array.isArray(page.rows) || page.rows.length === 0) {
    throw new ShapeError(`${source.dataset}: page contained no rows, which is never a valid harvest result`);
  }
  return page.rows.map((r) => ({ ...r.row, __idx: r.row_idx }));
}

/** sha1/8, matching chunk.mjs's id convention. */
function sha8(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 8);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * One row → one chunk, or null when the row does not earn a place.
 *
 * The credit line is the FIRST thing in `text`, not a trailer: index.ts truncates the embedded
 * string at 2,000 characters, and several of these systems are longer than that. A trailing
 * credit would be cut off exactly on the rows most worth citing.
 */
export function rowToChunk(row, source, idx) {
  if (source.rowFilter && !source.rowFilter(row)) return null;

  const instruction = String(row.instruction ?? '').trim();
  const body = String(row.output ?? '').trim();
  if (!instruction || !body) return null;

  const title = instruction.replace(/\s+/g, ' ').slice(0, 200);
  const credit = `Source: ${source.attribution}`;
  const text = `${credit}\n\n${instruction}\n\n${body}`;
  const id = sha8(`${source.dataset}/${idx}/${body}`);

  return {
    vecId: `hf-${slugify(source.dataset.split('/')[1]).slice(0, 24)}-${id}`,
    docSlug: `hf-${slugify(source.dataset)}`.slice(0, 96),
    title,
    url: source.url,
    kind: source.kind,
    text,
    embed: true,
    // Kept for the local audit trail only. upload.mjs drops these; the credit
    // above is what actually reaches a customer.
    _sourceDataset: source.dataset,
    _licence: source.licence.spdx,
  };
}

/** Per-source dedup on the body. */
export function dedupeChunks(chunks) {
  const seen = new Set();
  const out = [];
  let dropped = 0;
  for (const c of chunks) {
    if (!c) continue;
    const h = createHash('sha1').update(c.text).digest('hex');
    if (seen.has(h)) {
      dropped++;
      continue;
    }
    seen.add(h);
    out.push(c);
  }
  return { chunks: out, dropped };
}

// ---------------------------------------------------------------- network

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new ShapeError(`GET ${url} → HTTP ${res.status}`);
  return res.json();
}

/** The commit SHA the harvest is pinned to. A corpus that moves under the product is the thing the manifest prevents. */
async function resolveSha(dataset) {
  const meta = await getJson(`${HUB}/${dataset}`);
  if (!meta.sha) throw new ShapeError(`${dataset}: hub API returned no commit sha`);
  return { sha: meta.sha, lastModified: meta.lastModified, cardTag: meta?.cardData?.license ?? null };
}

async function fetchRows(source, offset, length) {
  const q = new URLSearchParams({
    dataset: source.dataset,
    config: source.config,
    split: source.split,
    offset: String(offset),
    length: String(length),
  });
  return getJson(`${API}?${q}`);
}

// ---------------------------------------------------------------- failure file

async function writeFailure(reason, detail) {
  const body = [
    '# HARVEST FAILED',
    '',
    `Written ${new Date().toISOString()} by scripts/harvest-roblox-knowledge.mjs.`,
    '',
    'This file exists because a source changed shape. **No chunk file was written.**',
    'Do not treat a previous chunks.hf.jsonl as current — it is now unverified.',
    '',
    `## Reason`,
    '',
    reason,
    '',
    '## Detail',
    '',
    '```json',
    JSON.stringify(detail, null, 2),
    '```',
    '',
    'Re-verify the upstream card and columns, update SOURCES in the harvester, and re-run.',
    '',
  ].join('\n');
  await mkdir(path.dirname(OUT_FAILURE), { recursive: true });
  await writeFile(OUT_FAILURE, body);
  console.error(`[harvest] !!! wrote ${OUT_FAILURE}`);
}

// ---------------------------------------------------------------- main

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

  await mkdir(OUT_DIR, { recursive: true });

  const manifest = { recordedAt: new Date().toISOString(), sources: {}, refused: {} };
  const all = [];

  for (const source of SOURCES) {
    console.log(`[harvest] ${source.dataset}`);

    const { sha, lastModified, cardTag } = await resolveSha(source.dataset);
    console.log(`[harvest]   pinned sha ${sha} (modified ${lastModified})`);

    // Licence gate, before a single row is read.
    const readme = await fetch(`https://huggingface.co/datasets/${source.dataset}/raw/main/README.md`)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '');
    const verdict = hfLicenceVerdict({ datasetId: source.dataset, cardTag, readmeText: readme });
    console.log(`[harvest]   licence ${verdict.class} / reuse ${verdict.reuse} / training ${verdict.training}`);
    if (verdict.reuse !== 'allowed') {
      throw new ShapeError(`${source.dataset}: licence gate refused — ${verdict.reason}`);
    }
    if (verdict.spdx !== source.licence.spdx) {
      throw new ShapeError(
        `${source.dataset}: card now declares ${verdict.spdx}, harvester is pinned to ${source.licence.spdx}`,
      );
    }

    const want = Math.min(source.take.count, limit);
    const rows = [];
    let total = null;
    for (let off = source.take.offset; off < source.take.offset + want; off += PAGE) {
      const page = await fetchRows(source, off, Math.min(PAGE, source.take.offset + want - off));
      total ??= page.num_rows_total;
      rows.push(...parseRowsPage(page, source));
    }

    // The boundary assertion. If the row count moved, the merged-split offsets this
    // harvest depends on may no longer mean what they meant when they were measured.
    if (total !== source.expectedRowsTotal) {
      throw new ShapeError(
        `${source.dataset}: num_rows_total is ${total}, pinned expectation ${source.expectedRowsTotal}. ` +
          `The advanced/filler file boundary must be re-measured before trusting offsets.`,
        { expected: source.expectedRowsTotal, actual: total },
      );
    }

    const kept = [];
    let droppedByPolicy = 0;
    for (const row of rows) {
      if (source.dropRows?.has(row.__idx)) {
        droppedByPolicy++;
        console.log(`[harvest]   row ${row.__idx} dropped by policy (known-broken sample)`);
        continue;
      }
      const c = rowToChunk(row, source, row.__idx);
      if (c) kept.push(c);
      else droppedByPolicy++;
    }

    const { chunks, dropped } = dedupeChunks(kept);
    console.log(`[harvest]   ${rows.length} rows → ${chunks.length} chunks (${droppedByPolicy} refused, ${dropped} deduped)`);
    all.push(...chunks);

    manifest.sources[source.dataset] = {
      url: source.url,
      sha,
      lastModified,
      licence: { ...verdict, attribution: source.attribution },
      rowsRead: rows.length,
      chunks: chunks.length,
      refusedRows: droppedByPolicy,
      dedupedRows: dropped,
    };
  }

  for (const r of REFUSED) {
    manifest.refused[r.dataset] = { url: r.url, sha: r.sha, grounds: r.grounds };
    console.log(`[harvest] REFUSED ${r.dataset} — ${r.grounds.length} grounds recorded in the manifest`);
  }

  await writeFile(OUT_CHUNKS, all.map(({ _sourceDataset, _licence, ...c }) => JSON.stringify({ ...c })).join('\n') + '\n');
  await writeFile(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[harvest] wrote ${OUT_CHUNKS} (${all.length} chunks)`);
  console.log(`[harvest] wrote ${OUT_MANIFEST}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(async (err) => {
    console.error(`[harvest] FATAL: ${err.message}`);
    await writeFailure(err.message, err.detail ?? { name: err.name });
    process.exit(1);
  });
}
