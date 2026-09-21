#!/usr/bin/env node
// Write packages/corpus/data/chunks-witness.json — the tracked record of what the 10 MB gitignored
// corpus says about every document this repository CITES.
//
// WHY A ROOT SCRIPT. Two things cite the corpus by exact address, and they live in different
// packages:
//
//   packages/corpus/data/genre-references.json   25 official documents, with their chunk ids
//   apps/worker/src/creator-skills.ts            CREATOR_SKILL_REFERENCES, 60+ more
//
// Their tests both asserted those addresses against `packages/corpus/data/chunks.jsonl`, which is
// a build artefact and is in no clone — so on the runner they threw ENOENT rather than failing an
// assertion, and `pnpm -r test` bailed with every package behind them unrun. The witness is what
// they check instead; see packages/corpus/src/chunk-witness.mjs for the design and for why a skip
// would have been the wrong answer.
//
// Neither package should have to know about the other, and the worker's list is TypeScript, so the
// union is assembled here and esbuild is borrowed from apps/worker, which already depends on it.
//
// Usage:  node scripts/build-chunk-witness.mjs
//
// It refuses rather than writing a smaller file when the corpus is absent: a witness regenerated
// without the thing it witnesses would be a file that agrees with whatever cites it.
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CHUNKS_REPO_PATH, WITNESS_PATH, deriveWitness, hasChunks } from '../packages/corpus/src/chunk-witness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

if (!hasChunks()) {
  console.error(`${CHUNKS_REPO_PATH} is not in this checkout, so there is nothing to witness.`);
  console.error('Build the corpus first:  pnpm --filter @golem/corpus chunk');
  process.exit(1);
}

/** The 25 official documents the genre-reference manifest cites. */
function genreReferenceSlugs() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'packages/corpus/data/genre-references.json'), 'utf8'));
  return manifest.officialDocuments.map((item) => item.id);
}

/**
 * Every docSlug in CREATOR_SKILL_REFERENCES.
 *
 * Bundled rather than pattern-matched. A regex over the TypeScript would be shorter and would go
 * quiet the day the table is written differently — and quiet here means a witness that is missing
 * addresses, which the worker's test would then report as a corpus that lost documents.
 */
async function creatorSkillSlugs() {
  const require = createRequire(join(ROOT, 'apps/worker/package.json'));
  const esbuild = await import(pathToFileURL(require.resolve('esbuild')).href);
  const dir = mkdtempSync(join(tmpdir(), 'chunk-witness-'));
  try {
    const out = join(dir, 'creator-skills.mjs');
    await esbuild.build({
      entryPoints: [join(ROOT, 'apps/worker/src/creator-skills.ts')],
      bundle: true, format: 'esm', target: 'es2022', outfile: out, logLevel: 'silent',
    });
    const mod = await import(pathToFileURL(out).href);
    const slugs = Object.values(mod.CREATOR_SKILL_REFERENCES).map((r) => r.corpus.docSlug);
    if (slugs.length === 0) throw new Error('CREATOR_SKILL_REFERENCES yielded no docSlug — the read is wrong, not the table');
    return slugs;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const slugs = new Set([...genreReferenceSlugs(), ...await creatorSkillSlugs()]);
const witness = deriveWitness([...slugs]);
writeFileSync(WITNESS_PATH, `${JSON.stringify(witness, null, 2)}\n`);

const addresses = Object.values(witness.documents).reduce((n, rows) => n + rows.length, 0);
console.log(`wrote ${WITNESS_PATH}`);
console.log(`  ${Object.keys(witness.documents).length} documents, ${addresses} chunk ids, `
  + `witnessing ${witness.documentCount} documents across ${witness.sourceLines} lines of ${CHUNKS_REPO_PATH}`);
