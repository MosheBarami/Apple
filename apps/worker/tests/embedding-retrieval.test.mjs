// A STALE EMBEDDING INDEX STILL LOADS, STILL RETURNS FIVE CONFIDENT ANSWERS, AND SAYS NOTHING.
//
// That is this repository's own failure shape — a thing PRESENT and never checked — and it is the
// reason scripts/build-module-embeddings.mjs writes a SHA-256 of the exact strings it embedded into
// the index. This file recomputes those hashes from the corpus on disk. When the corpus has moved
// and the index has not, the vectors describe modules that no longer read the way they are indexed,
// every score drifts by an unknown amount, and nothing anywhere would have said so.
//
// THE OTHER HALF OF WHY THIS FILE EXISTS. apps/worker/src/embedding-retrieval.ts was measured on
// 2026-09-20, written up in docs/embedding-retrieval.md with a "66/80 — 82.5%, as it would ship"
// row, and then never committed — absent from the working tree and from every branch in git. The
// measurement harness imports it, so the harness could not run and the number could not be checked
// by anyone who tried. A module with no test is how that happens twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(WORKER, '..', '..');

const out = join(mkdtempSync(join(tmpdir(), 'embedretrieval-')), 'e.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'embedding-retrieval.ts'), '--bundle', '--format=esm', '--target=es2022',
    '--platform=node', '--loader:.json=json', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const E = await import(`file://${out}`);

const INDEX = JSON.parse(readFileSync(join(WORKER, 'src', 'generated', 'embedding-index.json'), 'utf8'));

//[[ THE TEXT RULES ARE IMPORTED FROM THE BUILDER, NOT RETYPED HERE.
//   A copy of `moduleText` in this file would drift from the builder's copy, and the first thing
//   that drift does is make this test agree with itself while disagreeing with the index. Then the
//   staleness guard reports on a string nobody ever embedded.
const { moduleText, uiText, textHash } = await import(
  `file://${join(REPO, 'scripts', 'build-module-embeddings.mjs')}`);

const REBUILD = 'Run: node scripts/build-module-embeddings.mjs';

test('the verified-module corpus has not moved since the embedding index was built', () => {
  const modules = JSON.parse(
    readFileSync(join(REPO, 'packages/corpus/data/verified-modules.json'), 'utf8')).modules;
  assert.equal(INDEX.moduleTextHash, textHash(modules.map(moduleText)),
    `the verified-module corpus has changed since the embedding index was built. ${REBUILD}`);
  assert.equal(INDEX.modules.length, modules.length,
    `the index holds ${INDEX.modules.length} module vectors for ${modules.length} modules. ${REBUILD}`);
});

test('the UI construction corpus has not moved since the embedding index was built', () => {
  const ui = JSON.parse(readFileSync(join(REPO, 'packages/corpus/data/ui-construction.json'), 'utf8'));
  const rows = [...ui.genres, ...ui.screens];
  assert.equal(INDEX.uiTextHash, textHash(rows.map(uiText)),
    `the UI construction corpus has changed since the embedding index was built. ${REBUILD}`);
  assert.equal(INDEX.ui.length, rows.length,
    `the index holds ${INDEX.ui.length} UI vectors for ${rows.length} rows. ${REBUILD}`);
});

test('every stored row decodes to a unit vector of the declared dimension', () => {
  // Quantisation error, not zero: int8 over a unit vector lands within about 1e-3 of length 1.
  // Asserting exact 1 would fail on an index that is perfectly fine; asserting nothing would let a
  // truncated or wrongly-scaled row through, and a row of the wrong magnitude silently moves the
  // UI floor without moving any ranking, which is the hardest version of this to notice.
  for (const row of [...INDEX.modules, ...INDEX.ui]) {
    const bytes = Buffer.from(row.b64, 'base64');
    assert.equal(bytes.length, INDEX.dims, `row ${row.id} has ${bytes.length} bytes, not ${INDEX.dims}`);
    let n = 0;
    for (const b of bytes) {
      const signed = b > 127 ? b - 256 : b;
      const x = (signed / 127) * row.scale;
      n += x * x;
    }
    assert.ok(Math.abs(Math.sqrt(n) - 1) < 0.01, `row ${row.id} decodes to length ${Math.sqrt(n)}`);
  }
});

test('the module reports the encoder and the query instruction the index was built with', () => {
  // A query embedded by a different model, or without the instruction an asymmetric encoder was
  // trained with, scores low against every row and ranks plausibly anyway. The caller cannot detect
  // that from the results, so the two facts have to travel out of the index rather than be assumed.
  assert.equal(E.EMBEDDING_MODEL, INDEX.model);
  assert.equal(E.EMBEDDING_DIMS, INDEX.dims);
  assert.equal(E.EMBEDDING_QUERY_PREFIX, INDEX.queryPrefix ?? '');
  assert.equal(E.EMBEDDING_MODULE_TEXT_HASH, INDEX.moduleTextHash);
  assert.equal(E.EMBEDDING_UI_TEXT_HASH, INDEX.uiTextHash);
});

test('a query of the wrong dimension is refused rather than ranked', () => {
  // esbuild will happily bundle a caller that passes a vector from another model. Returning [] is
  // the only answer that cannot be mistaken for a ranking.
  assert.deepEqual(E.searchModulesByVector(new Float32Array(7), 5), []);
  assert.equal(E.suggestUIByVector(new Float32Array(7)), null);
  assert.deepEqual(E.searchModulesByVector(null, 5), []);
});

test('a module ranks itself first when handed its own document vector', () => {
  // The end-to-end check that decode, normalise and rank agree with the builder's quantise. If the
  // sign fold or the scale were wrong this is what would catch it, and it needs no provider call.
  const decode = (row) => {
    const bytes = Buffer.from(row.b64, 'base64');
    const v = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) {
      const signed = bytes[i] > 127 ? bytes[i] - 256 : bytes[i];
      v[i] = (signed / 127) * row.scale;
    }
    return v;
  };
  for (const row of [INDEX.modules[0], INDEX.modules[40], INDEX.modules.at(-1)]) {
    const ranked = E.searchModulesByVector(decode(row), 3);
    assert.equal(ranked[0].id, row.id, `${row.id} did not rank itself first`);
    assert.ok(ranked[0].score > 0.99, `${row.id} scored ${ranked[0].score} against itself`);
  }
});

test('the identity fold resolves a row by its own name across every separator spelling', () => {
  const ids = INDEX.ui.map((r) => r.id);
  const sample = ids.find((id) => id.includes('_')) ?? ids[0];
  assert.equal(E.resolveUIByIdentity(sample, ids), sample);
  assert.equal(E.resolveUIByIdentity(sample.replace(/_/g, ' '), ids), sample);
  assert.equal(E.resolveUIByIdentity(sample.replace(/_/g, '-'), ids), sample);
  assert.equal(E.resolveUIByIdentity(`  ${sample.toUpperCase()}  `, ids), sample);
  assert.equal(E.resolveUIByIdentity('no row is called this', ids), null);
  assert.equal(E.resolveUIByIdentity('', ids), null);
});

test('the identity fold is injective over the shipped ids, so it never has to pick', () => {
  // The fold strips separators. If two ids ever fold together the lookup is ambiguous, and
  // `resolveUIByIdentity` answers null rather than whichever row came first — but an ambiguous
  // corpus is a corpus problem and should be seen here rather than absorbed at runtime.
  const fold = (s) => s.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const seen = new Map();
  for (const { id } of INDEX.ui) {
    const key = fold(id);
    assert.equal(seen.get(key), undefined, `UI ids ${seen.get(key)} and ${id} fold to the same key`);
    seen.set(key, id);
  }
});

test('a stage-two suggestion never wears stage one\'s authority', () => {
  // Two of the nineteen genuinely-uncovered lookups come back above the floor. They are only
  // acceptable because they arrive labelled: `recordedMatch` is false and the note names the row
  // that was actually found. A hit that read as a recorded match would be an invented answer
  // presented as sourced construction.
  const row = INDEX.ui[0];
  const bytes = Buffer.from(row.b64, 'base64');
  const v = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    const signed = bytes[i] > 127 ? bytes[i] - 256 : bytes[i];
    v[i] = (signed / 127) * row.scale;
  }
  const hit = E.suggestUIByVector(v);
  assert.equal(hit.id, row.id);
  assert.equal(hit.recordedMatch, false);
  assert.match(hit.note, new RegExp(row.id));
  // Above its own floor by construction; a floor of 1.1 is unreachable, so nothing may come back.
  assert.equal(E.suggestUIByVector(v, 1.1), null);
});
