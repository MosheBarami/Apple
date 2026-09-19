/**
 * Runtime boundary for the curated genre-reference corpus.
 *
 * The corpus tests validate the full source data. These tests validate the Worker projection: it
 * bundles without Node APIs, stays under the tool-result budget, preserves exact provenance and
 * scoped authored observations, reports real coverage gaps, and never turns inspected references
 * into a claim that the game Apple creates has passed a visual review.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const REPO = join(WORKER, '..', '..');
const MANIFEST_PATH = join(REPO, 'packages', 'corpus', 'data', 'genre-references.json');
const GENRE_KITS_PATH = join(WORKER, 'src', 'genre-kits.ts');
const temp = mkdtempSync(join(tmpdir(), 'genre-reference-guide-'));
const bundlePath = join(temp, 'genre-reference-guide.mjs');

execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'genre-reference-guide.ts'),
  '--bundle',
  '--platform=browser',
  '--format=esm',
  '--target=es2022',
  `--outfile=${bundlePath}`,
], { cwd: WORKER, stdio: 'pipe' });

const bundledSource = readFileSync(bundlePath, 'utf8');
const G = await import(pathToFileURL(bundlePath).href);
rmSync(temp, { recursive: true, force: true });

const manifestBytes = readFileSync(MANIFEST_PATH);
const manifest = JSON.parse(manifestBytes.toString('utf8'));

function canonicalGenreIds() {
  const source = readFileSync(GENRE_KITS_PATH, 'utf8');
  const start = source.indexOf('export const GENRE_KIT_IDS');
  assert.notEqual(start, -1, 'the canonical genre list must exist');
  const tail = source.slice(start);
  const end = tail.indexOf('] as const;');
  assert.notEqual(end, -1, 'the canonical genre list must close with ] as const');
  const list = tail
    .slice(0, end + 1)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const ids = [...list.matchAll(/['"]([a-z][a-z0-9_]*)['"]/g)].map((match) => match[1]);
  assert.ok(ids.length > 0, 'genre list scan found nothing');
  return ids;
}

const genreIds = canonicalGenreIds();
const aspectIds = manifest.aspects.map((item) => item.id);
const officialById = new Map(manifest.officialDocuments.map((item) => [item.id, item]));

function expectedQuery(genre, aspect = null) {
  const external = manifest.externalReferences.flatMap((reference) => {
    if (!reference.genreIds.includes(genre)) return [];
    const observations = reference.observations.filter((observation) => (
      observation.genreIds.includes(genre) && (aspect === null || observation.aspect === aspect)
    ));
    return observations.length ? [{ reference, observations }] : [];
  });
  const official = manifest.implementationLinks.filter((link) => (
    link.genreId === genre && (aspect === null || link.aspect === aspect)
  ));
  return {
    external,
    official,
    matchedSources: external.length + official.length,
    matchedObservations: external.reduce((sum, item) => sum + item.observations.length, 0),
    matchedRules: official.reduce((sum, link) => sum + link.rules.length, 0),
  };
}

function returnedCounts(result) {
  return result.sources.reduce((counts, source) => {
    if (source.kind === 'visual_reference') counts.observations += source.observations.length;
    else counts.rules += source.rules.length;
    return counts;
  }, { observations: 0, rules: 0 });
}

test('the browser bundle has no runtime filesystem or network dependency and is tied to the exact manifest hash', () => {
  assert.doesNotMatch(bundledSource, /node:fs|readFileSync|createReadStream|XMLHttpRequest/);
  assert.equal(
    G.GENRE_REFERENCE_GUIDE_SOURCE_SHA256,
    createHash('sha256').update(manifestBytes).digest('hex'),
    'the compact Worker projection is stale; regenerate it from genre-references.json',
  );
  assert.deepEqual(G.GENRE_REFERENCE_GUIDE_ASPECT_IDS, aspectIds);

  const missingGenre = G.getGenreReferenceGuide({});
  assert.deepEqual(missingGenre.knownGenres, genreIds);
  assert.deepEqual(missingGenre.knownAspects, aspectIds);
});

test('every canonical query stays within 2,800 characters and reports exact truncation counts', () => {
  for (const maxChars of [G.GENRE_REFERENCE_GUIDE_MIN_CHARS, G.GENRE_REFERENCE_GUIDE_DEFAULT_CHARS, G.GENRE_REFERENCE_GUIDE_MAX_CHARS]) {
    for (const genre of genreIds) {
      for (const aspect of [null, ...aspectIds]) {
        const result = G.getGenreReferenceGuide({
          genre,
          ...(aspect === null ? {} : { aspect }),
          maxChars,
        });
        assert.equal(result.noMatch, false, `${genre}/${aspect ?? 'all'} unexpectedly missed`);
        const chars = JSON.stringify(result).length;
        assert.ok(chars <= result.query.maxChars, `${genre}/${aspect ?? 'all'} used ${chars}/${result.query.maxChars}`);
        assert.ok(chars <= 2800, `${genre}/${aspect ?? 'all'} exceeded the hard result limit`);
        assert.ok(result.sources.length > 0, `${genre}/${aspect ?? 'all'} silently returned no source`);

        const expected = expectedQuery(genre, aspect);
        const returned = returnedCounts(result);
        assert.equal(result.counts.matchedSources, expected.matchedSources);
        assert.equal(result.counts.matchedObservations, expected.matchedObservations);
        assert.equal(result.counts.matchedRules, expected.matchedRules);
        assert.equal(result.counts.returnedSources, result.sources.length);
        assert.equal(result.counts.returnedObservations, returned.observations);
        assert.equal(result.counts.returnedRules, returned.rules);
        assert.equal(result.counts.omittedSources, expected.matchedSources - result.sources.length);
        assert.equal(result.counts.omittedObservations, expected.matchedObservations - returned.observations);
        assert.equal(result.counts.omittedRules, expected.matchedRules - returned.rules);
        assert.equal(
          result.truncated,
          result.counts.omittedSources > 0 || result.counts.omittedObservations > 0 || result.counts.omittedRules > 0,
        );
      }
    }
  }
});

test('default guides return useful scoped visual observations plus an official implementation source when visual coverage exists', () => {
  for (const genre of genreIds) {
    const broad = G.getGenreReferenceGuide({ genre });
    assert.ok(broad.sources.some((source) => source.kind === 'visual_reference'), `${genre} broad guide lost visual guidance`);
    assert.ok(broad.sources.some((source) => source.kind === 'official_implementation'), `${genre} broad guide lost official guidance`);

    for (const aspect of aspectIds) {
      const result = G.getGenreReferenceGuide({ genre, aspect });
      const expected = expectedQuery(genre, aspect);
      const visuals = result.sources.filter((source) => source.kind === 'visual_reference');
      const official = result.sources.filter((source) => source.kind === 'official_implementation');
      assert.ok(official.length >= 1, `${genre}/${aspect} has no official fallback`);
      assert.ok(official.every((source) => source.aspect === aspect));

      if (expected.external.length > 0) {
        assert.equal(result.coverage.requestedExternalStatus, 'covered');
        assert.ok(visuals.length >= 1, `${genre}/${aspect} claims coverage but returned no observation`);
        assert.ok(visuals.flatMap((source) => source.observations).every((observation) => observation.aspect === aspect));
      } else {
        assert.equal(result.coverage.requestedExternalStatus, 'gap');
        assert.equal(visuals.length, 0, `${genre}/${aspect} invented a visual reference to hide a gap`);
        assert.equal(result.counts.matchedObservations, 0);
      }
    }
  }
});

test('coverage gaps are derived from authored observations and official links instead of being padded', () => {
  for (const genre of genreIds) {
    const result = G.getGenreReferenceGuide({ genre });
    const externalAspects = aspectIds.filter((aspect) => manifest.externalReferences.some((reference) => (
      reference.observations.some((observation) => observation.genreIds.includes(genre) && observation.aspect === aspect)
    )));
    const officialAspects = aspectIds.filter((aspect) => manifest.implementationLinks.some((link) => (
      link.genreId === genre && link.aspect === aspect
    )));
    assert.deepEqual(result.coverage.externalAspects, externalAspects);
    assert.deepEqual(result.coverage.missingExternalAspects, aspectIds.filter((aspect) => !externalAspects.includes(aspect)));
    assert.deepEqual(result.coverage.officialAspects, officialAspects);
    assert.deepEqual(result.coverage.missingOfficialAspects, aspectIds.filter((aspect) => !officialAspects.includes(aspect)));
    assert.equal(result.coverage.requestedExternalStatus, 'not_filtered');
  }
});

test('every returned source preserves exact provenance, authored scope, and reference-only rights', () => {
  for (const genre of genreIds) {
    for (const aspect of [null, ...aspectIds]) {
      const result = G.getGenreReferenceGuide({
        genre,
        ...(aspect === null ? {} : { aspect }),
        maxChars: 2800,
      });
      assert.deepEqual(result.rights, {
        use: 'reference_only',
        copyPermission: false,
        externalUrls: 'evidence_only',
        trainingData: false,
      });
      assert.equal(result.createdGame.visuallyVerified, false);
      assert.equal(result.createdGame.studioVisualPass, 'required_after_build');
      assert.ok(!JSON.stringify(result).includes('"visuallyVerified":true'));

      for (const source of result.sources) {
        assert.equal(source.referenceUse, 'reference_only');
        assert.match(source.url, /^https:\/\//);
        if (source.kind === 'visual_reference') {
          const original = manifest.externalReferences.find((item) => item.id === source.id);
          assert.ok(original, `${source.id} is not a manifest reference`);
          assert.equal(source.title, original.title);
          assert.equal(source.url, original.url);
          assert.deepEqual(source.origin, {
            publisher: original.origin.publisher,
            author: original.origin.author,
            publishedAt: original.origin.publishedAt,
          });
          assert.equal(source.sourceInspection, 'visual_inspected');
          for (const observation of source.observations) {
            assert.ok(original.observations.some((item) => (
              item.genreIds.includes(genre)
              && item.aspect === observation.aspect
              && item.text === observation.text
            )), `${source.id} returned an observation outside ${genre}/${aspect ?? 'all'}`);
            if (aspect !== null) assert.equal(observation.aspect, aspect);
          }
        } else {
          const link = manifest.implementationLinks.find((item) => item.id === source.id);
          assert.ok(link, `${source.id} is not an implementation link`);
          assert.equal(link.genreId, genre);
          if (aspect !== null) assert.equal(link.aspect, aspect);
          const document = officialById.get(link.documentId);
          assert.ok(document, `${source.id} points to a missing official document`);
          assert.equal(source.title, document.title);
          assert.equal(source.url, document.url);
          assert.equal(source.origin.publisher, document.origin.publisher);
          assert.equal(source.corpusDocSlug, document.corpus.docSlug);
          assert.ok(source.rules.every((rule) => link.rules.includes(rule)));
        }
      }
    }
  }
});

test('unknown filters fail explicitly without reflecting untrusted text', () => {
  const missing = G.getGenreReferenceGuide();
  assert.equal(missing.noMatch, true);
  assert.equal(missing.reason, 'genre_required');

  const badGenre = '<script>unknown_genre</script>';
  const unknownGenre = G.getGenreReferenceGuide({ genre: badGenre });
  assert.equal(unknownGenre.reason, 'unknown_genre');
  assert.ok(!JSON.stringify(unknownGenre).includes(badGenre));

  const badAspect = 'lighting; fetch(secret)';
  const unknownAspect = G.getGenreReferenceGuide({ genre: 'horror', aspect: badAspect });
  assert.equal(unknownAspect.reason, 'unknown_aspect');
  assert.ok(!JSON.stringify(unknownAspect).includes(badAspect));

  const clampedLow = G.getGenreReferenceGuide({ genre: 'horror', maxChars: 1 });
  const clampedHigh = G.getGenreReferenceGuide({ genre: 'horror', maxChars: 99_999 });
  assert.equal(clampedLow.query.maxChars, G.GENRE_REFERENCE_GUIDE_MIN_CHARS);
  assert.equal(clampedHigh.query.maxChars, G.GENRE_REFERENCE_GUIDE_MAX_CHARS);
  assert.ok(JSON.stringify(missing).length <= 2800);
  assert.ok(JSON.stringify(unknownGenre).length <= 2800);
  assert.ok(JSON.stringify(unknownAspect).length <= 2800);
});

test('guide resolution remains fully offline even when all network access throws', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('genre reference guide attempted a network request');
  };
  try {
    for (const genre of genreIds) {
      for (const aspect of [null, ...aspectIds]) {
        const result = G.getGenreReferenceGuide({
          genre,
          ...(aspect === null ? {} : { aspect }),
        });
        assert.equal(result.noMatch, false);
        assert.ok(result.sources.length > 0);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
