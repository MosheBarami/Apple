// harvest-roblox-knowledge.test.mjs — the gate on the Hugging Face harvester.
//
// Two properties are pinned here, and they are the two that a corpus tool can
// break silently:
//
//   1. PROVENANCE SURVIVES. A chunk that reaches D1 keeps only six columns
//      (vec_id, doc_slug, title, url, kind, text) — see apps/worker/src/index.ts.
//      There is no licence column. So an attribution that lives in a sibling
//      FIELD is dropped at upload and the retrieval answer cannot say where the
//      text came from. The licence has to survive INSIDE text/url or it does
//      not survive at all, and that is what these tests measure.
//
//   2. A SHAPE CHANGE IS LOUD. If the upstream columns move, the harvester must
//      throw. Returning zero chunks and exiting 0 would be a failure to observe
//      rendered as an observation — the corpus would quietly shrink to nothing
//      and every caller would report success.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SOURCES,
  ShapeError,
  hfLicenceVerdict,
  parseRowsPage,
  rowToChunk,
  dedupeChunks,
} from './harvest-roblox-knowledge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'hf-rows-8bitstudio.json'), 'utf8'));

const SRC = SOURCES.find((s) => s.dataset === '8BitStudio/Roblox-luau-coding_L1');

// ---------------------------------------------------------------- 1. provenance survives

test('licence and source URL survive into the chunk text, not just a sibling field', () => {
  const rows = parseRowsPage(FIXTURE, SRC);
  const chunk = rowToChunk(rows[0], SRC, 0);

  // The six fields upload.mjs whitelists must all be present and non-empty.
  for (const f of ['vecId', 'docSlug', 'title', 'url', 'kind', 'text']) {
    assert.ok(chunk[f], `chunk.${f} must be set — upload.mjs only forwards these six`);
  }

  // The licence must be readable from the text itself, because nothing else reaches D1.
  assert.match(chunk.text, /Apache-2\.0/, 'licence must be inside text — there is no licence column in D1');
  assert.match(chunk.text, /8BitStudio\/Roblox-luau-coding_L1/, 'source dataset must be inside text');
  assert.match(chunk.text, /huggingface\.co\/datasets\/8BitStudio\/Roblox-luau-coding_L1/, 'source URL must be inside text');

  // And the url column points back at the pinned source.
  assert.match(chunk.url, /^https:\/\/huggingface\.co\/datasets\/8BitStudio\/Roblox-luau-coding_L1/);
});

test('the chunk keeps the actual Luau body, not only the credit line', () => {
  const rows = parseRowsPage(FIXTURE, SRC);
  const chunk = rowToChunk(rows[0], SRC, 0);
  assert.match(chunk.text, /Instance\.new\("Folder"\)/, 'the exemplar code must survive into the chunk');
  assert.match(chunk.text, /leaderstats/);
});

// ---------------------------------------------------------------- 2. a shape change is loud

test('a response whose columns changed throws, rather than yielding zero chunks', () => {
  const mutated = structuredClone(FIXTURE);
  mutated.features = mutated.features.filter((f) => f.name !== 'output'); // upstream renamed/removed it
  for (const r of mutated.rows) delete r.row.output;

  assert.throws(
    () => parseRowsPage(mutated, SRC),
    (err) => err instanceof ShapeError && /output/.test(err.message),
    'a missing expected column must be a ShapeError naming the column',
  );
});

test('an empty rows array throws rather than being reported as a clean harvest', () => {
  const empty = { ...structuredClone(FIXTURE), rows: [] };
  assert.throws(() => parseRowsPage(empty, SRC), ShapeError);
});

test('a row that no longer looks like a complete system is refused, not silently ingested', () => {
  // This is the 12,282-row filler file bleeding across the boundary: short,
  // templated part-creation. Taking it would quietly swap the corpus's contents.
  const filler = structuredClone(FIXTURE);
  filler.rows[0].row.instruction = 'Create an anchored orange Plastic Block part sized 4x4x4 at position 1,2,3';
  filler.rows[0].row.output = 'local part = Instance.new("Part")\npart.Anchored = true\npart.Parent = workspace';
  const rows = parseRowsPage(filler, SRC);
  assert.equal(rowToChunk(rows[0], SRC, 0), null, 'a filler-shaped row must be rejected');
});

// ---------------------------------------------------------------- 3. the licence gate

test('an uploader card tag is NOT treated as an SPDX grant over third-party content', () => {
  // roblox-info-dump tags itself `mit` while its own card says Roblox owns the
  // text. Reading the tag as an SPDX header grants training rights on Roblox's
  // copyrighted docs, which is the single most expensive mistake available here.
  const v = hfLicenceVerdict({
    datasetId: 'TorpedoSoftware/roblox-info-dump',
    cardTag: 'mit',
    readmeText: 'Roblox maintains the copyright on all content. Any use of all or part of the docs gathered in Roblox-Info-Dump must abide by the terms of the original licenses.',
  });
  assert.equal(v.class, 'UNCLEAR_QUARANTINE');
  assert.equal(v.reuse, 'forbidden');
  assert.equal(v.training, 'forbidden');
  assert.match(v.reason, /copyright|original licen/i);
});

test('a first-party permissive tag clears reuse but never training', () => {
  const v = hfLicenceVerdict({
    datasetId: '8BitStudio/Roblox-luau-coding_L1',
    cardTag: 'apache-2.0',
    readmeText: 'A dataset of Roblox Luau coding examples.',
  });
  assert.equal(v.reuse, 'allowed');
  assert.equal(v.spdx, 'Apache-2.0');
  // An HF card tag is an assertion, not a licence file. It is good enough to
  // retrieve from and never good enough to license model weights.
  assert.equal(v.training, 'forbidden', 'a card tag must never grant training rights');
});

test('every configured source carries a licence the gate can discharge', () => {
  for (const s of SOURCES) {
    assert.ok(s.licence?.spdx, `${s.dataset} must name its licence`);
    assert.ok(s.attribution, `${s.dataset} must carry an attribution line`);
  }
});

// ---------------------------------------------------------------- 4. dedup

test('per-source dedup collapses byte-identical bodies', () => {
  const rows = parseRowsPage(FIXTURE, SRC);
  const a = rowToChunk(rows[0], SRC, 0);
  const b = rowToChunk(rows[0], SRC, 1); // same body, different index
  const { chunks, dropped } = dedupeChunks([a, b]);
  assert.equal(chunks.length, 1);
  assert.equal(dropped, 1);
});
