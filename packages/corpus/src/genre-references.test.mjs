import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GENRE_REFERENCE_DEFAULT_RESULTS,
  GENRE_REFERENCE_MAX_RESULTS,
  getGenreReferenceCoverage,
  listGenreReferenceAspects,
  listGenreReferenceGenres,
  loadGenreReferenceManifest,
  queryGenreReferences,
} from './genre-references.mjs';
import { deriveWitness, hasChunks, readWitness, witnessedDocuments } from './chunk-witness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const GENRE_KITS_PATH = path.join(REPO, 'apps', 'worker', 'src', 'genre-kits.ts');

const EXPECTED_ASPECTS = [
  'ui_hud',
  'shop',
  'inventory',
  'map_composition',
  'low_poly_props',
  'materials',
  'lighting',
  'interaction',
];

function canonicalGenreIds() {
  const source = readFileSync(GENRE_KITS_PATH, 'utf8');
  const start = source.indexOf('export const GENRE_KIT_IDS');
  assert.notEqual(start, -1, 'the canonical genre list must still exist');
  const tail = source.slice(start);
  const end = tail.indexOf('] as const;');
  assert.notEqual(end, -1, 'the canonical genre list must still close with ] as const');

  // Source scanners in this repository strip comments before matching. Limiting the slice to the
  // list also avoids turning URLs elsewhere in the file into false line comments.
  const listSource = tail
    .slice(0, end + 1)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const ids = [...listSource.matchAll(/['"]([a-z][a-z0-9_]*)['"]/g)].map((match) => match[1]);
  assert.ok(ids.length > 0, 'the canonical genre scan must find at least one id');
  return ids;
}

// WAS: read `packages/corpus/data/chunks.jsonl` directly. That file is a gitignored 10 MB build
// artefact, so in a fresh checkout this threw ENOENT rather than failing an assertion, `pnpm -r
// test` bailed at @golem/corpus, and every package after it never ran. See chunk-witness.mjs for
// why the fix is a tracked witness rather than either committing the corpus or skipping the test.
function corpusByDocument() {
  const witness = readWitness();
  assert.ok(
    witness.documentCount > 2_000,
    `expected the existing official corpus, the witness records ${witness.documentCount} documents`,
  );
  return witnessedDocuments(witness);
}

function assertIsoDate(value, label) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `${label} must be a calendar date`);
  assert.equal(Number.isNaN(Date.parse(`${value}T00:00:00Z`)), false, `${label} must parse`);
}

function externalVisualGapPairs(manifest) {
  const coveredPairs = new Set();
  for (const reference of manifest.externalReferences) {
    for (const observation of reference.observations) {
      for (const genreId of observation.genreIds) {
        coveredPairs.add(`${genreId}/${observation.aspect}`);
      }
    }
  }

  const gaps = [];
  for (const genre of manifest.genres) {
    for (const aspect of manifest.aspects) {
      const pair = `${genre.id}/${aspect.id}`;
      if (!coveredPairs.has(pair)) gaps.push(pair);
    }
  }
  return gaps;
}

test('the manifest derives the exact existing genre taxonomy and requested aspect taxonomy', () => {
  const manifest = loadGenreReferenceManifest();
  assert.deepEqual(manifest.genres.map((item) => item.id), canonicalGenreIds());
  assert.deepEqual(manifest.aspects.map((item) => item.id), EXPECTED_ASPECTS);
  assert.equal(manifest.taxonomySource, 'apps/worker/src/genre-kits.ts#GENRE_KIT_IDS');
});

test('every external source is a verified reference-only DevForum topic with truthful inspection metadata', () => {
  const manifest = loadGenreReferenceManifest();
  const genreIds = new Set(manifest.genres.map((item) => item.id));
  const aspectIds = new Set(manifest.aspects.map((item) => item.id));
  const allowedInspection = new Set(manifest.policy.inspectionStatuses);
  const allowedLicences = new Set(manifest.policy.licenceStatuses);

  assert.equal(new Set(manifest.externalReferences.map((item) => item.id)).size, manifest.externalReferences.length);
  assert.equal(new Set(manifest.externalReferences.map((item) => item.url)).size, manifest.externalReferences.length);

  for (const reference of manifest.externalReferences) {
    const url = new URL(reference.url);
    assert.equal(url.protocol, 'https:', `${reference.id} must use HTTPS`);
    assert.equal(url.hostname, 'devforum.roblox.com', `${reference.id} must point to DevForum`);
    const topicMatch = url.pathname.match(/^\/t\/[^/]+\/(\d+)\/?$/);
    assert.ok(topicMatch, `${reference.id} must use a canonical topic URL`);
    assert.equal(Number(topicMatch[1]), reference.verification.topicId);

    assert.equal(reference.verification.status, 'live_topic_json_verified');
    assertIsoDate(reference.verification.checkedAt, `${reference.id} verification date`);
    assert.ok(reference.origin.author.length > 0, `${reference.id} needs its actual post author`);
    assert.equal(reference.origin.publisher, 'Roblox Developer Forum');
    assertIsoDate(reference.origin.publishedAt, `${reference.id} publication date`);
    assert.ok(reference.origin.publishedAt <= manifest.generatedAt, `${reference.id} cannot be from the future`);
    if (reference.origin.updatedAt) {
      assertIsoDate(reference.origin.updatedAt, `${reference.id} updated date`);
      assert.ok(reference.origin.updatedAt >= reference.origin.publishedAt);
    }

    assert.ok(allowedInspection.has(reference.inspection.status), `${reference.id} has an unknown inspection status`);
    assert.equal(reference.inspection.status, 'visual_inspected', `${reference.id} is shipped as a visual reference`);
    assert.ok(reference.inspection.inspectedMediaCount >= 1, `${reference.id} must name media that was actually viewed`);
    assertIsoDate(reference.inspection.inspectedAt, `${reference.id} inspection date`);
    assert.match(reference.inspection.evidence, /Reviewed the first post and \d+ representative image/i);

    assert.equal(reference.referenceUse, 'reference_only');
    assert.ok(allowedLicences.has(reference.licence.status), `${reference.id} has an unrecognized licence status`);
    assert.equal(reference.licence.status, 'unverified_reference_only');
    assert.equal(reference.licence.copyPermission, false);
    assert.match(reference.licence.note, /do not copy/i);
    assert.equal(Object.hasOwn(reference, 'downloadUrl'), false, `${reference.id} must not become a downloadable asset`);
    assert.equal(Object.hasOwn(reference, 'readyToUse'), false, `${reference.id} must not claim product readiness`);
    assert.equal(Object.hasOwn(reference, 'instructions'), false, `${reference.id} must not import source-page instructions`);

    assert.ok(reference.genreIds.length >= 1);
    assert.ok(reference.genreIds.every((id) => genreIds.has(id)));
    assert.ok(reference.aspects.length >= 1);
    assert.ok(reference.aspects.every((id) => aspectIds.has(id)));
    assert.ok(reference.observations.length >= 3, `${reference.id} needs more than a title-level observation`);
    assert.equal(new Set(reference.observations.map((item) => item.text)).size, reference.observations.length);
    for (const observation of reference.observations) {
      assert.ok(observation.text.length >= 45, `${reference.id}/${observation.aspect} observation is too vague`);
      assert.ok(reference.aspects.includes(observation.aspect));
      assert.ok(observation.genreIds.length >= 1);
      assert.ok(observation.genreIds.every((id) => reference.genreIds.includes(id)));
    }
  }
});

test('official document IDs, URLs, and chunk IDs resolve exactly to the existing local corpus', () => {
  const manifest = loadGenreReferenceManifest();
  const corpus = corpusByDocument();

  assert.equal(new Set(manifest.officialDocuments.map((item) => item.id)).size, manifest.officialDocuments.length);
  for (const document of manifest.officialDocuments) {
    const rows = corpus.get(document.id);
    assert.ok(rows, `${document.id} is not in chunks.jsonl`);
    assert.equal(document.url, rows[0].url);
    assert.equal(document.kind, rows[0].kind);
    assert.equal(document.origin.publisher, 'Roblox Creator Hub');
    assert.equal(document.origin.publicationDate, null, `${document.id} must not invent a corpus date`);
    assert.equal(document.origin.dateStatus, 'not_available_in_local_corpus');
    assert.equal(document.corpus.path, 'packages/corpus/data/chunks.jsonl');
    assert.equal(document.corpus.docSlug, document.id);
    assert.deepEqual(document.corpus.chunkIds, rows.map((row) => row.vecId));
    assert.equal(document.corpus.chunkCount, rows.length);

    const url = new URL(document.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'create.roblox.com');
    assert.match(url.pathname, /^\/docs\//);

    const expectedTitle = rows[0].kind === 'api'
      ? rows[0].title.replace(/\s+\d+\/\d+$/, '')
      : rows[0].title;
    assert.equal(document.title, expectedTitle);
  }
});

// THE OTHER HALF OF THE WITNESS, and the half that stops it from being a fixture somebody can edit
// to agree with whatever the manifest says. On any machine that actually has the corpus — the one
// the witness was written on, and every machine that rebuilds it — the witness is re-derived from
// chunks.jsonl and must come back identical, hash and counts included.
//
// Where the corpus is absent this test says so out loud instead of passing quietly, because "the
// check did not run" and "the check passed" must not look the same in a log.
test('the chunk witness still matches the corpus it was taken from', (t) => {
  const witness = readWitness();
  if (!hasChunks()) {
    t.diagnostic(`${witness.source} is not in this checkout — the witness taken on ${witness.generatedAt} `
      + 'was NOT re-derived here. It is re-derived wherever the corpus exists.');
    assert.equal(hasChunks(), false);
    return;
  }

  const manifest = loadGenreReferenceManifest();
  const fresh = deriveWitness(manifest.officialDocuments.map((item) => item.id), { generatedAt: witness.generatedAt });
  assert.equal(fresh.sourceSha256, witness.sourceSha256, 'chunks.jsonl changed — regenerate with `node src/chunk-witness.mjs --write`');
  assert.equal(fresh.sourceLines, witness.sourceLines);
  assert.equal(fresh.documentCount, witness.documentCount);
  assert.deepEqual(fresh.documents, witness.documents);
});

test('every canonical genre has useful external references and one official link for every aspect', () => {
  const manifest = loadGenreReferenceManifest();
  const documentIds = new Set(manifest.officialDocuments.map((item) => item.id));
  const expectedPairs = new Set();
  for (const genre of manifest.genres) {
    for (const aspect of manifest.aspects) expectedPairs.add(`${genre.id}/${aspect.id}`);
  }

  const actualPairs = new Set();
  const usedDocuments = new Set();
  for (const link of manifest.implementationLinks) {
    const pair = `${link.genreId}/${link.aspect}`;
    assert.equal(actualPairs.has(pair), false, `duplicate implementation link for ${pair}`);
    actualPairs.add(pair);
    assert.ok(documentIds.has(link.documentId), `${link.id} must resolve to an official document`);
    usedDocuments.add(link.documentId);
    assert.ok(link.rationale.length >= 55, `${link.id} rationale is too generic`);
    assert.ok(link.rules.length >= 2, `${link.id} needs multiple implementation rules`);
    for (const rule of link.rules) assert.ok(rule.length >= 55, `${link.id} contains a vague rule`);
  }
  assert.deepEqual(actualPairs, expectedPairs);
  assert.deepEqual(usedDocuments, documentIds, 'the manifest must not carry unused official documents');

  for (const genre of manifest.genres) {
    const references = manifest.externalReferences.filter((item) => item.genreIds.includes(genre.id));
    assert.ok(references.length >= 3, `${genre.id} has too few inspected visual sources`);
    assert.ok(
      references.reduce((sum, item) => sum + item.observations.filter((observation) => observation.genreIds.includes(genre.id)).length, 0) >= 10,
      `${genre.id} has too little transferable visual guidance`,
    );
  }
});

test('external visual coverage resolves every reviewed pair and keeps the remaining gap explicit', () => {
  const manifest = loadGenreReferenceManifest();
  const gaps = externalVisualGapPairs(manifest);

  // Deliberate review tripwire: changing this list means the corpus gained or lost a visually
  // inspected genre/aspect pair and the evidence report must be updated with that review.
  assert.deepEqual(gaps, ['horror/inventory']);

  const gapSet = new Set(gaps);
  for (const genre of manifest.genres) {
    for (const aspect of manifest.aspects) {
      const pair = `${genre.id}/${aspect.id}`;
      const result = queryGenreReferences({
        genre: genre.id,
        aspect: aspect.id,
        kinds: ['external'],
        inspectedOnly: true,
        limit: 20,
      });

      if (gapSet.has(pair)) {
        assert.equal(result.totalMatching, 0, `${pair} must remain an honest visual-reference gap`);
        assert.deepEqual(result.items, []);
        continue;
      }

      assert.ok(result.totalMatching >= 1, `${pair} needs at least one inspected external source`);
      assert.ok(
        result.items.some((item) => item.observations.some((observation) => (
          observation.aspect === aspect.id && observation.genreIds.includes(genre.id)
        ))),
        `${pair} must resolve a scoped authored visual observation`,
      );
    }
  }
});

test('queries are offline, bounded, filter observations, and return defensive copies', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('queryGenreReferences attempted a network request');
  };
  try {
    const result = queryGenreReferences({ genre: 'horror', aspect: 'lighting', limit: 999 });
    assert.equal(result.query.effectiveLimit, GENRE_REFERENCE_MAX_RESULTS);
    assert.ok(result.items.length >= 2);
    for (const item of result.items) {
      if (item.kind === 'external') {
        assert.ok(item.genreIds.includes('horror'));
        assert.ok(item.observations.length >= 1);
        assert.ok(item.observations.every((observation) => (
          observation.aspect === 'lighting' && observation.genreIds.includes('horror')
        )));
      } else {
        assert.equal(item.genreId, 'horror');
        assert.equal(item.aspect, 'lighting');
        assert.equal(item.source.origin.publisher, 'Roblox Creator Hub');
      }
    }

    const simulatorDefault = queryGenreReferences({ genre: 'simulator' });
    assert.equal(simulatorDefault.items.length, GENRE_REFERENCE_DEFAULT_RESULTS);
    assert.equal(simulatorDefault.truncated, true);
    const simulatorRaised = queryGenreReferences({ genre: 'simulator', limit: 999 });
    assert.equal(simulatorRaised.query.effectiveLimit, GENRE_REFERENCE_MAX_RESULTS);
    assert.ok(simulatorRaised.items.length <= GENRE_REFERENCE_MAX_RESULTS);
    assert.ok(simulatorRaised.items.length > simulatorDefault.items.length);

    const animeInventory = queryGenreReferences({
      genre: 'anime_battle',
      aspect: 'inventory',
      kinds: 'external',
      inspectedOnly: true,
      limit: 20,
    });
    assert.ok(animeInventory.items.length >= 1);
    assert.ok(animeInventory.items.every((item) => item.kind === 'external'));
    assert.ok(animeInventory.items.flatMap((item) => item.observations).every((observation) => (
      observation.aspect === 'inventory' && observation.genreIds.includes('anime_battle')
    )));

    result.items[0].title = 'mutated by caller';
    const fresh = queryGenreReferences({ genre: 'horror', aspect: 'lighting', limit: 999 });
    assert.notEqual(fresh.items[0].title, 'mutated by caller');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('official queries resolve exactly one implementation link for all 80 genre/aspect pairs', () => {
  for (const genre of listGenreReferenceGenres()) {
    for (const aspect of listGenreReferenceAspects()) {
      const result = queryGenreReferences({
        genre: genre.id,
        aspect: aspect.id,
        kinds: ['official'],
        limit: 20,
      });
      assert.equal(result.totalMatching, 1, `${genre.id}/${aspect.id} needs one official implementation link`);
      assert.equal(result.items[0].source.corpus.docSlug, result.items[0].source.id);
      assert.ok(result.items[0].source.corpus.chunkIds.length >= 1);
    }
  }
});

test('query validation rejects unknown dimensions and caps result limits', () => {
  assert.throws(() => queryGenreReferences(), /unknown genre reference genre/);
  assert.throws(() => queryGenreReferences({ genre: 'not_a_genre' }), /unknown genre reference genre/);
  assert.throws(() => queryGenreReferences({ genre: 'horror', aspect: 'not_an_aspect' }), /unknown genre reference aspect/);
  assert.throws(() => queryGenreReferences({ genre: 'horror', kinds: [] }), /non-empty/);
  assert.throws(() => queryGenreReferences({ genre: 'horror', kinds: 'asset' }), /unknown genre reference result kind/);
  assert.throws(() => queryGenreReferences({ genre: 'horror', inspectedOnly: 'yes' }), /must be boolean/);
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => queryGenreReferences({ genre: 'horror', limit: value }), /positive safe integer/);
  }

  const clamped = queryGenreReferences({ genre: 'simulator', limit: 1_000 });
  assert.equal(clamped.query.effectiveLimit, GENRE_REFERENCE_MAX_RESULTS);
});

test('public list, manifest, and coverage helpers expose copies and measured complete coverage', () => {
  const genres = listGenreReferenceGenres();
  const aspects = listGenreReferenceAspects();
  genres[0].name = 'caller mutation';
  aspects[0].name = 'caller mutation';
  assert.notEqual(listGenreReferenceGenres()[0].name, 'caller mutation');
  assert.notEqual(listGenreReferenceAspects()[0].name, 'caller mutation');

  const manifest = loadGenreReferenceManifest();
  manifest.externalReferences[0].title = 'caller mutation';
  assert.notEqual(loadGenreReferenceManifest().externalReferences[0].title, 'caller mutation');

  const coverage = getGenreReferenceCoverage();
  const source = loadGenreReferenceManifest();
  assert.equal(coverage.externalReferences, source.externalReferences.length);
  assert.equal(coverage.uniqueExternalUrls, source.externalReferences.length);
  assert.equal(coverage.officialDocuments, source.officialDocuments.length);
  assert.equal(coverage.implementationLinks, source.genres.length * source.aspects.length);
  assert.equal(
    coverage.observations,
    source.externalReferences.reduce((sum, item) => sum + item.observations.length, 0),
  );
  assert.equal(
    coverage.implementationRules,
    source.implementationLinks.reduce((sum, item) => sum + item.rules.length, 0),
  );
  for (const genre of source.genres) {
    const item = coverage.genres[genre.id];
    assert.ok(item.externalReferences >= 3);
    assert.equal(item.visuallyInspectedReferences, item.externalReferences);
    assert.equal(item.implementationLinks, source.aspects.length);
    assert.deepEqual(item.officialAspects, EXPECTED_ASPECTS);
    assert.deepEqual(item.missingOfficialAspects, []);
  }
});
