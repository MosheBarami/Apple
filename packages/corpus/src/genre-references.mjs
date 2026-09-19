/**
 * Bounded retrieval over the curated genre-reference manifest.
 *
 * The URLs in the manifest are evidence metadata. This module never fetches them, executes content
 * from them, or treats a reference page as an instruction source. Official implementation links
 * resolve only to documents already indexed in packages/corpus/data/chunks.jsonl.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA_PATH = fileURLToPath(new URL('../data/genre-references.json', import.meta.url));
const RAW_MANIFEST = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

const clone = (value) => JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`genre reference manifest has duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) throw new Error('unsupported genre reference schema version');
  for (const key of ['genres', 'aspects', 'externalReferences', 'officialDocuments', 'implementationLinks']) {
    if (!Array.isArray(manifest[key]) || manifest[key].length === 0) {
      throw new Error(`genre reference manifest ${key} must be a non-empty array`);
    }
  }
  if (!Number.isSafeInteger(manifest.policy?.defaultQueryResults) || manifest.policy.defaultQueryResults < 1) {
    throw new Error('genre reference default query limit is invalid');
  }
  if (!Number.isSafeInteger(manifest.policy?.maxQueryResults)
      || manifest.policy.maxQueryResults < manifest.policy.defaultQueryResults) {
    throw new Error('genre reference maximum query limit is invalid');
  }

  assertUnique(manifest.genres.map((item) => item.id), 'genre id');
  assertUnique(manifest.aspects.map((item) => item.id), 'aspect id');
  assertUnique(manifest.externalReferences.map((item) => item.id), 'external reference id');
  assertUnique(manifest.officialDocuments.map((item) => item.id), 'official document id');
  assertUnique(manifest.implementationLinks.map((item) => item.id), 'implementation link id');

  const genres = new Set(manifest.genres.map((item) => item.id));
  const aspects = new Set(manifest.aspects.map((item) => item.id));
  const documents = new Set(manifest.officialDocuments.map((item) => item.id));

  for (const reference of manifest.externalReferences) {
    if (!reference.genreIds?.every((id) => genres.has(id))) {
      throw new Error(`${reference.id} points to an unknown genre`);
    }
    if (!reference.aspects?.every((id) => aspects.has(id))) {
      throw new Error(`${reference.id} points to an unknown aspect`);
    }
    if (reference.referenceUse !== 'reference_only' || reference.licence?.copyPermission !== false) {
      throw new Error(`${reference.id} crosses the reference-only rights boundary`);
    }
    if (!Array.isArray(reference.observations) || reference.observations.length === 0) {
      throw new Error(`${reference.id} has no curated observations`);
    }
    for (const observation of reference.observations) {
      const genreScopeIsValid = observation.genreIds?.every((id) => reference.genreIds.includes(id));
      if (!reference.aspects.includes(observation.aspect) || !genreScopeIsValid) {
        throw new Error(`${reference.id} has an observation outside its declared scope`);
      }
    }
  }

  const implementationPairs = new Set();
  for (const link of manifest.implementationLinks) {
    if (!genres.has(link.genreId) || !aspects.has(link.aspect)) {
      throw new Error(`${link.id} points to an unknown genre or aspect`);
    }
    if (!documents.has(link.documentId)) {
      throw new Error(`${link.id} points to missing official document ${link.documentId}`);
    }
    const pair = `${link.genreId}/${link.aspect}`;
    if (implementationPairs.has(pair)) throw new Error(`duplicate implementation link for ${pair}`);
    implementationPairs.add(pair);
  }
  for (const genre of genres) {
    for (const aspect of aspects) {
      const pair = `${genre}/${aspect}`;
      if (!implementationPairs.has(pair)) throw new Error(`missing implementation link for ${pair}`);
    }
  }
}

validateManifest(RAW_MANIFEST);
const MANIFEST = deepFreeze(RAW_MANIFEST);
const GENRE_IDS = new Set(MANIFEST.genres.map((item) => item.id));
const ASPECT_IDS = new Set(MANIFEST.aspects.map((item) => item.id));
const OFFICIAL_DOCUMENTS = new Map(MANIFEST.officialDocuments.map((item) => [item.id, item]));
const RESULT_KINDS = new Set(['external', 'official']);

export const GENRE_REFERENCE_DEFAULT_RESULTS = MANIFEST.policy.defaultQueryResults;
export const GENRE_REFERENCE_MAX_RESULTS = MANIFEST.policy.maxQueryResults;

export function loadGenreReferenceManifest() {
  return clone(MANIFEST);
}

export function listGenreReferenceGenres() {
  return clone(MANIFEST.genres);
}

export function listGenreReferenceAspects() {
  return clone(MANIFEST.aspects);
}

function requireGenre(genre) {
  if (typeof genre !== 'string' || !GENRE_IDS.has(genre)) {
    throw new RangeError(`unknown genre reference genre: ${String(genre)}`);
  }
}

function requireAspect(aspect) {
  if (aspect == null) return;
  if (typeof aspect !== 'string' || !ASPECT_IDS.has(aspect)) {
    throw new RangeError(`unknown genre reference aspect: ${String(aspect)}`);
  }
}

function normalizeKinds(kinds) {
  const values = kinds == null ? ['external', 'official'] : typeof kinds === 'string' ? [kinds] : kinds;
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('genre reference kinds must be a non-empty string or array');
  }
  const normalized = [...new Set(values)];
  for (const value of normalized) {
    if (typeof value !== 'string' || !RESULT_KINDS.has(value)) {
      throw new RangeError(`unknown genre reference result kind: ${String(value)}`);
    }
  }
  return normalized;
}

function normalizeLimit(limit) {
  if (limit == null) return GENRE_REFERENCE_DEFAULT_RESULTS;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('genre reference limit must be a positive safe integer');
  }
  return Math.min(limit, GENRE_REFERENCE_MAX_RESULTS);
}

function externalItems(genre, aspect, inspectedOnly) {
  return MANIFEST.externalReferences.flatMap((reference) => {
    if (!reference.genreIds.includes(genre)) return [];
    if (aspect != null && !reference.aspects.includes(aspect)) return [];
    if (inspectedOnly && reference.inspection.status === 'uninspected') return [];

    const observations = reference.observations.filter((item) => (
      item.genreIds.includes(genre) && (aspect == null || item.aspect === aspect)
    ));
    if (observations.length === 0) return [];

    return [{
      kind: 'external',
      ...reference,
      observations,
    }];
  });
}

function officialItems(genre, aspect) {
  return MANIFEST.implementationLinks.flatMap((link) => {
    if (link.genreId !== genre || (aspect != null && link.aspect !== aspect)) return [];
    const source = OFFICIAL_DOCUMENTS.get(link.documentId);
    return [{
      kind: 'official',
      id: link.id,
      genreId: link.genreId,
      aspect: link.aspect,
      rationale: link.rationale,
      rules: link.rules,
      source,
    }];
  });
}

/**
 * Query curated references for one known genre and, optionally, one known aspect.
 *
 * `limit` is clamped to the manifest maximum. The function returns source metadata and authored
 * observations/rules only; it performs no network request and does not pass source-page text to a
 * model or runtime.
 */
export function queryGenreReferences({
  genre,
  aspect = null,
  kinds = null,
  inspectedOnly = false,
  limit = null,
} = {}) {
  requireGenre(genre);
  requireAspect(aspect);
  if (typeof inspectedOnly !== 'boolean') {
    throw new TypeError('genre reference inspectedOnly must be boolean');
  }
  const selectedKinds = normalizeKinds(kinds);
  const effectiveLimit = normalizeLimit(limit);

  const candidates = [];
  if (selectedKinds.includes('external')) candidates.push(...externalItems(genre, aspect, inspectedOnly));
  if (selectedKinds.includes('official')) candidates.push(...officialItems(genre, aspect));

  const items = clone(candidates.slice(0, effectiveLimit));
  const countsByKind = {
    external: candidates.filter((item) => item.kind === 'external').length,
    official: candidates.filter((item) => item.kind === 'official').length,
  };

  return {
    query: {
      genre,
      aspect,
      kinds: selectedKinds,
      inspectedOnly,
      requestedLimit: limit ?? GENRE_REFERENCE_DEFAULT_RESULTS,
      effectiveLimit,
    },
    totalMatching: candidates.length,
    countsByKind,
    truncated: candidates.length > items.length,
    items,
  };
}

export function getGenreReferenceCoverage() {
  const perGenre = {};
  for (const genre of MANIFEST.genres) {
    const external = MANIFEST.externalReferences.filter((item) => item.genreIds.includes(genre.id));
    const implementation = MANIFEST.implementationLinks.filter((item) => item.genreId === genre.id);
    const externalAspects = [...new Set(external.flatMap((item) => (
      item.observations
        .filter((observation) => observation.genreIds.includes(genre.id))
        .map((observation) => observation.aspect)
    )))];
    const officialAspects = [...new Set(implementation.map((item) => item.aspect))];
    perGenre[genre.id] = {
      externalReferences: external.length,
      visuallyInspectedReferences: external.filter((item) => item.inspection.status === 'visual_inspected').length,
      externalAspects,
      implementationLinks: implementation.length,
      officialAspects,
      missingOfficialAspects: MANIFEST.aspects
        .map((item) => item.id)
        .filter((id) => !officialAspects.includes(id)),
    };
  }

  return {
    externalReferences: MANIFEST.externalReferences.length,
    uniqueExternalUrls: new Set(MANIFEST.externalReferences.map((item) => item.url)).size,
    officialDocuments: MANIFEST.officialDocuments.length,
    implementationLinks: MANIFEST.implementationLinks.length,
    observations: MANIFEST.externalReferences.reduce((sum, item) => sum + item.observations.length, 0),
    implementationRules: MANIFEST.implementationLinks.reduce((sum, item) => sum + item.rules.length, 0),
    genres: perGenre,
  };
}
