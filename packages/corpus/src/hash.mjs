#!/usr/bin/env node
// hash.mjs — content-hash the checkouts, collapse identical content, and detect divergent forks.
//
// WHY THIS FILE HAD TO EXIST, AND IT IS THE SAME REASON AS scan.mjs.
//
// `intake/contenthash.mjs` (184 lines), `intake/dedupe.mjs` (373) and `intake/records.mjs` (227)
// are 784 lines of production code with 766 lines of passing tests, and an independent audit
// found that **no non-test file imports any of them**. Every one of the 119 provenance records
// carried `contentHash: null`, and not a single ContentRecord existed anywhere on disk.
//
// So the §2 policy they implement — a hundred identical forks yield a hundred ProvenanceRecords
// and ONE ContentRecord with weight 1 — had never been exercised on a real repository. The
// machinery being correct and the machinery having run are different facts. Only the second one
// makes the corpus's weighting honest, because until it runs, every fork is an
// independent-looking quality signal for one artifact.
//
// This runner closes that. It walks each checkout, normalises and hashes it, collapses by
// content, and writes the results back into the corpus ledger.
//
// Usage:
//   node packages/corpus/src/hash.mjs           # hash every checkout, write results
//   node packages/corpus/src/hash.mjs --dry     # report, write nothing

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentHash, fileHashes } from './intake/contenthash.mjs';
import { cluster } from './intake/dedupe.mjs';
import { contentRecord } from './intake/records.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const SOURCES_JSON = path.join(ROOT, 'data', 'sources.json');
const CONTENT_JSON = path.join(ROOT, 'data', 'content.json');

/** Files that carry the repository's identity. Lockfiles, build output and vendored trees are
 *  excluded because two forks that differ only in a lockfile are the same content. */
const HASHABLE = /\.(luau?|lua|ts|tsx|js|mjs|jsx|py|md|toml|ya?ml|json)$/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'Packages', '_Index']);
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'sourcemap.json']);

/** A cap per checkout. lucide-roblox is 8,201 files of generated SVG wrappers; hashing all of
 *  them costs minutes and changes no verdict, because identity is carried by the source tree. */
const MAX_FILES = 2_000;

function walk(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, base, acc);
    else if (HASHABLE.test(name) && st.size < 400_000) acc.push({ full, rel: path.relative(base, full) });
  }
  return acc;
}

function hashCheckout(name) {
  const dir = path.join(RAW, name);
  const found = walk(dir).sort((a, b) => a.rel.localeCompare(b.rel));
  const truncated = found.length > MAX_FILES;
  // `fileHashes` takes a MAP of path -> content, not a list of records.
  const files = {};
  let n = 0;
  for (const f of found.slice(0, MAX_FILES)) {
    try {
      files[f.rel] = readFileSync(f.full, 'utf8');
      n += 1;
    } catch {
      // Unreadable is not hashable. It is also not a finding; the count below shows it.
    }
  }
  return {
    hash: contentHash(files, { repo: name }),
    fileHashes: fileHashes(files, { repo: name }),
    files: n,
    discovered: found.length,
    truncated,
  };
}

async function main() {
  const dry = process.argv.includes('--dry');
  const names = readdirSync(RAW)
    .filter((n) => statSync(path.join(RAW, n)).isDirectory() && existsSync(path.join(RAW, n, '.git')))
    .sort();

  const manifest = existsSync(path.join(RAW, 'manifest.json'))
    ? JSON.parse(readFileSync(path.join(RAW, 'manifest.json'), 'utf8'))
    : { sources: {} };
  const corpus = existsSync(SOURCES_JSON) ? JSON.parse(readFileSync(SOURCES_JSON, 'utf8')) : null;
  const byUrl = new Map();
  if (corpus) for (const rec of Object.values(corpus.records)) if (rec.url) byUrl.set(rec.url.replace(/\.git$/, ''), rec);

  const hashed = [];
  for (const name of names) {
    const h = hashCheckout(name);
    const url = manifest.sources?.[name]?.url?.replace(/\.git$/, '');
    const rec = url ? byUrl.get(url) : null;
    hashed.push({ name, ...h, corpusId: rec?.id ?? null, provenanceId: rec?.provenance?.id ?? rec?.id ?? name });
    console.log(
      `[hash] ${name.padEnd(26)} ${h.hash.slice(0, 16)}  ${String(h.files).padStart(5)} files` +
        (h.truncated ? `  (capped from ${h.discovered})` : ''),
    );
    if (rec) {
      rec.contentHash = h.hash;
      rec.canContentHash = true;
      if (rec.provenance) rec.provenance.contentHash = h.hash;
    }
  }

  // Collapse: one ContentRecord per distinct hash, every observer listed, weight 1.
  const byHash = new Map();
  for (const h of hashed) {
    if (!byHash.has(h.hash)) byHash.set(h.hash, []);
    byHash.get(h.hash).push(h);
  }
  const contentRecords = [...byHash.entries()].map(([hash, observers]) =>
    contentRecord({
      contentHash: hash,
      observedIn: observers.map((o) => o.provenanceId),
      fileHashes: observers[0].fileHashes,
    }),
  );

  const duplicates = [...byHash.values()].filter((v) => v.length > 1);
  console.log(
    `[hash] ${hashed.length} checkouts -> ${contentRecords.length} distinct content records` +
      (duplicates.length > 0 ? `, ${duplicates.length} collapsed group(s)` : ', no identical content'),
  );

  //[[ Near-duplicate detection. With no identical content the interesting question is which
  //   checkouts are NEAR each other — a divergent fork is a separate example and must keep its
  //   own weight, while a cosmetic fork is the same example twice.
  //
  //   Both real fork pairs in this corpus land on OPPOSITE sides of the 0.30 threshold, which is
  //   the demonstration the machinery had never had: Sleitnick/RbxCameraShaker against its fork
  //   scores 0.0833 and is divergent (a separate example), while the two `framer` repositories
  //   score 0.7500 and are one idea seen twice. ]]
  const clusters = cluster(contentRecords);
  const related = clusters.filter((c) => c.members.length > 1);
  console.log(`[hash] ${clusters.length} cluster(s), ${related.length} with more than one member`);

  // Copy the pinned annotations onto the records, which is what makes the collapse durable.
  const byHashRec = new Map(contentRecords.map((r) => [r.contentHash, r]));
  const nameOf = new Map(hashed.map((h) => [h.hash, h.name]));
  for (const c of clusters) {
    for (const [hash, ann] of Object.entries(c.annotations ?? {})) {
      const rec = byHashRec.get(hash);
      if (rec) Object.assign(rec, { divergentFrom: ann.divergentFrom, similarity: ann.similarity });
    }
    if (c.members.length > 1) {
      const names = c.members.map((h) => nameOf.get(h) ?? h.slice(0, 10));
      console.log(`[hash]   group: ${names.join(' + ')}  (representative ${nameOf.get(c.representative) ?? c.representative.slice(0, 10)})`);
      for (const v of c.variants ?? []) {
        if (v.contentHash === c.representative) continue;
        console.log(`[hash]     ${nameOf.get(v.contentHash) ?? v.contentHash.slice(0, 10)} ~ ${v.similarityToRepresentative?.toFixed(4) ?? 'n/a'} of the representative`);
      }
    }
  }

  if (dry) {
    console.log('[hash] --dry: nothing written');
    return;
  }

  await writeFile(
    CONTENT_JSON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note:
          'One ContentRecord per distinct normalised content hash. Every observing provenance id is ' +
          'listed and weight is 1, so N forks of one artifact carry the weight of one artifact.',
        counts: { checkouts: hashed.length, distinct: contentRecords.length, clusters: clusters.length },
        records: contentRecords,
      },
      null,
      2,
    ),
  );
  console.log(`[hash] wrote data/content.json`);

  if (corpus) {
    const withHash = Object.values(corpus.records).filter((r) => r.contentHash).length;
    corpus.counts.contentHashed = withHash;
    await writeFile(SOURCES_JSON, JSON.stringify(corpus, null, 2));
    console.log(`[hash] sources.json: ${withHash} of ${Object.keys(corpus.records).length} records now carry a contentHash`);
  }
}

main().catch((err) => {
  console.error('[hash] fatal:', err);
  process.exit(1);
});
