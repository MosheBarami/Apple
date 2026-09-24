#!/usr/bin/env node
/** Refresh only the UI rows of the BGE index, without spending Workers AI allowance.
 *
 * Use a separate local Python environment with torch, transformers and huggingface_hub:
 *   BGE_PYTHON=/path/to/python node scripts/rebuild-ui-embeddings-local.mjs
 * The helper pins a public MIT-licensed HF revision and refuses an uncached model. Existing
 * module vectors stay byte-for-byte unchanged. This is a different runtime from Cloudflare's
 * BGE, so parity with the old UI vectors is measured before any write.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quantise, textHash, uiText } from './build-module-embeddings.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'apps/worker/src/generated/embedding-index.json');
const corpusPath = join(root, 'packages/corpus/data/ui-construction.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
if (index.model !== '@cf/baai/bge-base-en-v1.5' || index.dims !== 768) {
  throw new Error('the existing index is not the pinned BGE base model');
}
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const rows = [...corpus.genres, ...corpus.screens];
const texts = rows.map(uiText);
const py = process.env.BGE_PYTHON;
if (!py) throw new Error('set BGE_PYTHON to a local Python with torch, transformers and huggingface_hub');
const encoded = execFileSync(py, [join(root, 'scripts/lib/embed-bge-local.py')], {
  input: JSON.stringify(texts), encoding: 'utf8', maxBuffer: 12 * 1024 * 1024,
});
const vectors = JSON.parse(encoded);
if (vectors.length !== rows.length || vectors.some((v) => v.length !== index.dims || v.some((n) => !Number.isFinite(n)))) {
  throw new Error('the local encoder returned incomplete or non-finite vectors');
}

function decode(row) {
  const bytes = Buffer.from(row.b64, 'base64');
  if (bytes.length !== index.dims) throw new Error(`bad stored vector ${row.id}`);
  return [...bytes].map((b) => ((b > 127 ? b - 256 : b) / 127) * row.scale);
}
function cosine(a, b) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return dot / Math.sqrt(aa * bb);
}

// This is a cross-runtime check, not a claim of byte identity. A changed source row can shift;
// a wholesale model mismatch must not silently replace the index.
const prior = new Map(index.ui.map((r) => [r.id, decode(r)]));
const parities = rows.flatMap((r, i) => prior.has(r.genre) ? [cosine(vectors[i], prior.get(r.genre))] : []);
const min = Math.min(...parities);
const mean = parities.reduce((a, b) => a + b, 0) / parities.length;
if (parities.length < 20 || mean < 0.95 || min < 0.90) {
  throw new Error(`local/cloud BGE parity too low: ${parities.length} rows, mean ${mean.toFixed(4)}, min ${min.toFixed(4)}`);
}
// Re-running on an unchanged corpus must not replace the recorded Cloudflare comparison with
// a trivial comparison against the local vectors this script wrote last time.
const sameCorpus = index.uiTextHash === textHash(texts);
const originalComparison = sameCorpus ? index.uiRebuild?.comparison : null;
const next = {
  ...index,
  uiTextHash: textHash(texts),
  ui: rows.map((r, i) => ({ id: r.genre, ...quantise(vectors[i]) })),
  builtAt: new Date().toISOString(),
  builtBy: 'modules: scripts/build-module-embeddings.mjs; UI: scripts/rebuild-ui-embeddings-local.mjs',
  cost: { ...index.cost, note: 'historical original build cost; local UI refresh made no Workers AI calls' },
  uiRebuild: {
    source: 'BAAI/bge-base-en-v1.5',
    revision: 'a5beb1e3e68b9ab74eb54cfd186867f64f240e1a',
    method: 'local CPU, CLS pooling, L2 normalisation; module vectors unchanged',
    comparison: originalComparison ?? { rows: parities.length, meanCosine: +mean.toFixed(6), minCosine: +min.toFixed(6) },
    comparisonReference: originalComparison ? 'original Cloudflare UI index' : (index.uiRebuild ? 'previous local UI index' : 'original Cloudflare UI index'),
  },
};
writeFileSync(indexPath, JSON.stringify(next) + '\n');
process.stdout.write(`updated ${rows.length} UI vectors; old-index cosine mean ${mean.toFixed(4)}, min ${min.toFixed(4)}\n`);
