// Worker-safe retrieval over the curated genre reference corpus.
//
// The source manifest is imported statically so Wrangler/esbuild embeds it in the Worker bundle.
// There is no runtime filesystem read, network fetch, or execution of external page content. This
// module returns only project-authored observations/rules plus provenance URLs and the rights
// boundary that already exists in the manifest.
import manifestJson from '../../../packages/corpus/data/genre-references.json';
import { GENRE_KIT_IDS, type GenreKitId } from './genre-kits';

/** SHA-256 of packages/corpus/data/genre-references.json. The test fails when regeneration is due. */
export const GENRE_REFERENCE_GUIDE_SOURCE_SHA256 =
  '482787e6fe202531f332daab1f2bd37fa24046c7f8194f354f657ab0fa163921' as const;

export const GENRE_REFERENCE_GUIDE_ASPECT_IDS = [
  'ui_hud',
  'shop',
  'inventory',
  'map_composition',
  'low_poly_props',
  'materials',
  'lighting',
  'interaction',
] as const;

export type GenreReferenceGuideAspectId = (typeof GENRE_REFERENCE_GUIDE_ASPECT_IDS)[number];

export const GENRE_REFERENCE_GUIDE_DEFAULT_CHARS = 2700;
export const GENRE_REFERENCE_GUIDE_MIN_CHARS = 1800;
export const GENRE_REFERENCE_GUIDE_MAX_CHARS = 2800;

interface ManifestGenre {
  id: string;
  name: string;
  description: string;
}

interface ManifestAspect {
  id: string;
  name: string;
  description: string;
}

interface ManifestObservation {
  genreIds: string[];
  aspect: string;
  text: string;
}

interface ManifestExternalReference {
  id: string;
  genreIds: string[];
  aspects: string[];
  title: string;
  url: string;
  origin: {
    publisher: string;
    author: string;
    publishedAt: string;
  };
  inspection: {
    status: string;
  };
  observations: ManifestObservation[];
  referenceUse: string;
  licence: {
    status: string;
    copyPermission: boolean;
  };
}

interface ManifestOfficialDocument {
  id: string;
  title: string;
  url: string;
  origin: {
    publisher: string;
  };
  corpus: {
    docSlug: string;
    chunkIds: string[];
  };
}

interface ManifestImplementationLink {
  id: string;
  genreId: string;
  aspect: string;
  documentId: string;
  rationale: string;
  rules: string[];
}

interface GenreReferenceManifest {
  schemaVersion: number;
  generatedAt: string;
  genres: ManifestGenre[];
  aspects: ManifestAspect[];
  externalReferences: ManifestExternalReference[];
  officialDocuments: ManifestOfficialDocument[];
  implementationLinks: ManifestImplementationLink[];
}

const MANIFEST = manifestJson as unknown as GenreReferenceManifest;
const GENRE_IDS = GENRE_KIT_IDS as readonly string[];
const ASPECT_IDS = GENRE_REFERENCE_GUIDE_ASPECT_IDS as readonly string[];

function assertExactIds(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`genre reference guide ${label} drifted from its canonical source`);
  }
}

if (MANIFEST.schemaVersion !== 1) throw new Error('unsupported genre reference guide schema');
assertExactIds(MANIFEST.genres.map((item) => item.id), GENRE_IDS, 'genres');
assertExactIds(MANIFEST.aspects.map((item) => item.id), ASPECT_IDS, 'aspects');

const OFFICIAL_DOCUMENTS = new Map(MANIFEST.officialDocuments.map((document) => [document.id, document]));
for (const reference of MANIFEST.externalReferences) {
  if (reference.referenceUse !== 'reference_only'
      || reference.licence.status !== 'unverified_reference_only'
      || reference.licence.copyPermission !== false
      || reference.inspection.status !== 'visual_inspected') {
    throw new Error(`${reference.id} crosses the inspected reference-only boundary`);
  }
  if (reference.observations.length === 0) {
    throw new Error(`${reference.id} has no authored observation`);
  }
  for (const observation of reference.observations) {
    if (!ASPECT_IDS.includes(observation.aspect)
        || observation.genreIds.length === 0
        || observation.genreIds.some((genre) => !GENRE_IDS.includes(genre))) {
      throw new Error(`${reference.id} has an observation outside the canonical taxonomy`);
    }
  }
}
for (const genre of GENRE_KIT_IDS) {
  for (const aspect of GENRE_REFERENCE_GUIDE_ASPECT_IDS) {
    const links = MANIFEST.implementationLinks.filter((item) => item.genreId === genre && item.aspect === aspect);
    if (links.length !== 1 || !OFFICIAL_DOCUMENTS.has(links[0]?.documentId ?? '')) {
      throw new Error(`genre reference guide needs one official source for ${genre}/${aspect}`);
    }
  }
}

export interface GenreReferenceGuideInput {
  genre?: string;
  aspect?: string;
  maxChars?: number;
}

export interface GenreReferenceGuideObservation {
  aspect: GenreReferenceGuideAspectId;
  text: string;
}

export interface GenreReferenceGuideVisualSource {
  kind: 'visual_reference';
  id: string;
  title: string;
  url: string;
  origin: {
    publisher: string;
    author: string;
    publishedAt: string;
  };
  sourceInspection: 'visual_inspected';
  referenceUse: 'reference_only';
  observations: GenreReferenceGuideObservation[];
}

export interface GenreReferenceGuideOfficialSource {
  kind: 'official_implementation';
  id: string;
  aspect: GenreReferenceGuideAspectId;
  title: string;
  url: string;
  origin: {
    publisher: string;
  };
  corpusDocSlug: string;
  referenceUse: 'reference_only';
  rules: string[];
}

export type GenreReferenceGuideSource = GenreReferenceGuideVisualSource | GenreReferenceGuideOfficialSource;

export interface GenreReferenceGuideSuccess {
  noMatch: false;
  query: {
    genre: GenreKitId;
    aspect: GenreReferenceGuideAspectId | null;
    maxChars: number;
  };
  sourceManifest: {
    generatedAt: string;
    sha256: typeof GENRE_REFERENCE_GUIDE_SOURCE_SHA256;
  };
  rights: {
    use: 'reference_only';
    copyPermission: false;
    externalUrls: 'evidence_only';
    trainingData: false;
  };
  createdGame: {
    visuallyVerified: false;
    studioVisualPass: 'required_after_build';
  };
  coverage: {
    externalAspects: GenreReferenceGuideAspectId[];
    missingExternalAspects: GenreReferenceGuideAspectId[];
    officialAspects: GenreReferenceGuideAspectId[];
    missingOfficialAspects: GenreReferenceGuideAspectId[];
    requestedExternalStatus: 'covered' | 'gap' | 'not_filtered';
  };
  counts: {
    matchedSources: number;
    returnedSources: number;
    omittedSources: number;
    matchedObservations: number;
    returnedObservations: number;
    omittedObservations: number;
    matchedRules: number;
    returnedRules: number;
    omittedRules: number;
  };
  sources: GenreReferenceGuideSource[];
  truncated: boolean;
}

export interface GenreReferenceGuideNoMatch {
  noMatch: true;
  reason: 'genre_required' | 'unknown_genre' | 'unknown_aspect';
  knownGenres: readonly GenreKitId[];
  knownAspects: readonly GenreReferenceGuideAspectId[];
  /** The genre that was asked for, when it was not one of ours. */
  requested?: string;
  /**
   * A covered genre whose id appears INSIDE the words the customer used, or null.
   *
   * NOT A SIMILARITY JUDGEMENT, and the distinction is the whole reason this field can exist. A
   * table saying "pet simulator is near simulator" would be somebody's opinion about Roblox genres
   * dressed as data, and the next agent would ship a horror palette for a fishing game because a
   * row said they were adjacent. This matches only on the request's OWN wording: "pet simulator"
   * contains "simulator", so the customer already said it. When nothing matches, this is null and
   * the honest answer is that the catalogue has nothing.
   */
  nearestByWording?: GenreKitId | null;
  /** What the model must pass on to the customer rather than quietly substituting a genre. */
  saySoOutLoud?: string;
}

export type GenreReferenceGuideResult = GenreReferenceGuideSuccess | GenreReferenceGuideNoMatch;

interface ScopedExternal {
  reference: ManifestExternalReference;
  observations: GenreReferenceGuideObservation[];
}

interface ScopedOfficial {
  link: ManifestImplementationLink;
  document: ManifestOfficialDocument;
}

function boundedChars(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return GENRE_REFERENCE_GUIDE_DEFAULT_CHARS;
  return Math.max(
    GENRE_REFERENCE_GUIDE_MIN_CHARS,
    Math.min(GENRE_REFERENCE_GUIDE_MAX_CHARS, Math.floor(parsed)),
  );
}

function knownGenre(value: unknown): value is GenreKitId {
  return typeof value === 'string' && GENRE_IDS.includes(value);
}

function knownAspect(value: unknown): value is GenreReferenceGuideAspectId {
  return typeof value === 'string' && ASPECT_IDS.includes(value);
}

/**
 * A covered genre whose id is spelled inside the requested text, or null.
 *
 * Underscores are the catalogue's spelling and spaces are a person's, so `anime_battle` has to
 * match "anime battle". Longest first: "anime battle" must not resolve to nothing because a
 * shorter id was tested first, and a request naming two would take the more specific one.
 */
/**
 * The requested genre, but only when quoting it back is safe.
 *
 * REFLECTING A CALLER'S STRING IS HOW INJECTED TEXT REACHES A MODEL, and this module already had a
 * test saying so — `<script>unknown_genre</script>` must not come back in the answer. Naming what
 * was asked for is worth having, so the rule is the strict one: echo the text only when cleaning it
 * changes NOTHING. A genre a person actually types is letters, digits, spaces and hyphens; anything
 * else is either not a genre or not from a person, and both get the unquoted sentence instead.
 *
 * Not "clean it and echo the cleaning": that would quote mangled attacker text back at the model,
 * which is the same defect wearing a shorter string.
 */
export function safeGenreEcho(requested: string): string | null {
  if (typeof requested !== 'string' || requested.length === 0 || requested.length > 40) return null;
  return /^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(requested) ? requested : null;
}

export function nearestGenreByWording(requested: string): GenreKitId | null {
  const text = requested.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  if (!text) return null;
  const byLength = [...GENRE_KIT_IDS].sort((a, b) => b.length - a.length);
  for (const id of byLength) {
    if (text.includes(id.replace(/_/g, ' '))) return id;
  }
  return null;
}

function noMatch(reason: GenreReferenceGuideNoMatch['reason'], requested?: string): GenreReferenceGuideNoMatch {
  const base: GenreReferenceGuideNoMatch = {
    noMatch: true,
    reason,
    knownGenres: GENRE_KIT_IDS,
    knownAspects: GENRE_REFERENCE_GUIDE_ASPECT_IDS,
  };
  if (reason !== 'unknown_genre' || typeof requested !== 'string') return base;

  //[[ AN UNCOVERED GENRE IS A FACT TO REPORT, NOT A GAP TO PAPER OVER.
  //
  //   The catalogue holds ten genres, every reference visually inspected. A customer asking for an
  //   eleventh — a fishing game, a pet sim, a bedwars clone — used to reach a parameter whose enum
  //   forbade the word, so the model could not ask the question at all and had no signal that the
  //   answer was "nobody has looked at that". What it does with no signal is proceed as if it knew.
  //
  //   So: say the genre is not covered, say it in a sentence meant to be passed on, and offer a
  //   near one ONLY when the customer's own words contain it. Everything the model then builds is
  //   its own judgement rather than something backed by an inspected reference, and the customer
  //   is the one who gets to decide whether that is good enough. ]]
  const nearest = nearestGenreByWording(requested);
  const echo = safeGenreEcho(requested);
  const named = echo === null ? 'the genre you asked for' : `"${echo}"`;
  return {
    ...base,
    ...(echo === null ? {} : { requested: echo }),
    nearestByWording: nearest,
    saySoOutLoud: nearest
      ? `There are no inspected visual references for ${named}. The catalogue covers ${nearest}, which appears in the words you used — I can work from that, but it is a different game and the look will not be backed by a reference for yours. Say if you would rather I design it from scratch and describe what I am choosing.`
      : `There are no inspected visual references for ${named}, and none of the ${GENRE_KIT_IDS.length} genres in the catalogue is named in your request. I can still build it — the look will be my own judgement rather than something taken from a game that shipped, and I will describe what I am choosing as I go.`,
  };
}

function coverageFor(genre: GenreKitId) {
  const externalAspects = GENRE_REFERENCE_GUIDE_ASPECT_IDS.filter((aspect) => (
    MANIFEST.externalReferences.some((reference) => reference.observations.some((observation) => (
      observation.genreIds.includes(genre) && observation.aspect === aspect
    )))
  ));
  const officialAspects = GENRE_REFERENCE_GUIDE_ASPECT_IDS.filter((aspect) => (
    MANIFEST.implementationLinks.some((link) => link.genreId === genre && link.aspect === aspect)
  ));
  return {
    externalAspects,
    missingExternalAspects: GENRE_REFERENCE_GUIDE_ASPECT_IDS.filter((aspect) => !externalAspects.includes(aspect)),
    officialAspects,
    missingOfficialAspects: GENRE_REFERENCE_GUIDE_ASPECT_IDS.filter((aspect) => !officialAspects.includes(aspect)),
  };
}

function externalFor(genre: GenreKitId, aspect: GenreReferenceGuideAspectId | null): ScopedExternal[] {
  return MANIFEST.externalReferences.flatMap((reference) => {
    if (!reference.genreIds.includes(genre)) return [];
    const observations = reference.observations
      .filter((observation) => (
        observation.genreIds.includes(genre) && (aspect === null || observation.aspect === aspect)
      ))
      .map((observation) => ({
        aspect: observation.aspect as GenreReferenceGuideAspectId,
        text: observation.text,
      }));
    return observations.length > 0 ? [{ reference, observations }] : [];
  });
}

function officialFor(genre: GenreKitId, aspect: GenreReferenceGuideAspectId | null): ScopedOfficial[] {
  return MANIFEST.implementationLinks.flatMap((link) => {
    if (link.genreId !== genre || (aspect !== null && link.aspect !== aspect)) return [];
    const document = OFFICIAL_DOCUMENTS.get(link.documentId);
    if (!document) throw new Error(`genre reference guide is missing ${link.documentId}`);
    return [{ link, document }];
  });
}

function minimumVisualSource(item: ScopedExternal): GenreReferenceGuideVisualSource {
  const first = item.observations[0];
  if (!first) throw new Error(`${item.reference.id} has no scoped observation`);
  return {
    kind: 'visual_reference',
    id: item.reference.id,
    title: item.reference.title,
    url: item.reference.url,
    origin: {
      publisher: item.reference.origin.publisher,
      author: item.reference.origin.author,
      publishedAt: item.reference.origin.publishedAt,
    },
    sourceInspection: 'visual_inspected',
    referenceUse: 'reference_only',
    observations: [{ ...first }],
  };
}

function minimumOfficialSource(item: ScopedOfficial): GenreReferenceGuideOfficialSource {
  const first = item.link.rules[0];
  if (!first) throw new Error(`${item.link.id} has no implementation rule`);
  return {
    kind: 'official_implementation',
    id: item.link.id,
    aspect: item.link.aspect as GenreReferenceGuideAspectId,
    title: item.document.title,
    url: item.document.url,
    origin: { publisher: item.document.origin.publisher },
    corpusDocSlug: item.document.corpus.docSlug,
    referenceUse: 'reference_only',
    rules: [first],
  };
}

function returnedCounts(sources: readonly GenreReferenceGuideSource[]) {
  let observations = 0;
  let rules = 0;
  for (const source of sources) {
    if (source.kind === 'visual_reference') observations += source.observations.length;
    else rules += source.rules.length;
  }
  return { observations, rules };
}

function buildSuccess(
  genre: GenreKitId,
  aspect: GenreReferenceGuideAspectId | null,
  maxChars: number,
  coverage: ReturnType<typeof coverageFor>,
  external: readonly ScopedExternal[],
  official: readonly ScopedOfficial[],
  sources: GenreReferenceGuideSource[],
): GenreReferenceGuideSuccess {
  const matchedObservations = external.reduce((sum, item) => sum + item.observations.length, 0);
  const matchedRules = official.reduce((sum, item) => sum + item.link.rules.length, 0);
  const returned = returnedCounts(sources);
  const matchedSources = external.length + official.length;
  const counts = {
    matchedSources,
    returnedSources: sources.length,
    omittedSources: matchedSources - sources.length,
    matchedObservations,
    returnedObservations: returned.observations,
    omittedObservations: matchedObservations - returned.observations,
    matchedRules,
    returnedRules: returned.rules,
    omittedRules: matchedRules - returned.rules,
  };
  const truncated = counts.omittedSources > 0 || counts.omittedObservations > 0 || counts.omittedRules > 0;
  return {
    noMatch: false,
    query: { genre, aspect, maxChars },
    sourceManifest: {
      generatedAt: MANIFEST.generatedAt,
      sha256: GENRE_REFERENCE_GUIDE_SOURCE_SHA256,
    },
    rights: {
      use: 'reference_only',
      copyPermission: false,
      externalUrls: 'evidence_only',
      trainingData: false,
    },
    createdGame: {
      visuallyVerified: false,
      studioVisualPass: 'required_after_build',
    },
    coverage: {
      ...coverage,
      requestedExternalStatus: aspect === null
        ? 'not_filtered'
        : coverage.externalAspects.includes(aspect) ? 'covered' : 'gap',
    },
    counts,
    sources,
    truncated,
  };
}

function serializedLength(value: unknown): number {
  return JSON.stringify(value).length;
}

/**
 * Returns compact, provenance-carrying visual guidance for one canonical genre and optional aspect.
 * External source text is never returned; observations and rules are authored in this repository.
 */
export function getGenreReferenceGuide(input: GenreReferenceGuideInput = {}): GenreReferenceGuideResult {
  if (input.genre === undefined) return noMatch('genre_required');
  if (!knownGenre(input.genre)) return noMatch('unknown_genre', String(input.genre));
  if (input.aspect !== undefined && !knownAspect(input.aspect)) return noMatch('unknown_aspect');

  const genre = input.genre;
  const aspect = input.aspect ?? null;
  const maxChars = boundedChars(input.maxChars);
  const coverage = coverageFor(genre);
  const external = externalFor(genre, aspect);
  const official = officialFor(genre, aspect);

  const ordered: Array<{ kind: 'external'; value: ScopedExternal } | { kind: 'official'; value: ScopedOfficial }> = [];
  if (external[0]) ordered.push({ kind: 'external', value: external[0] });
  if (official[0]) ordered.push({ kind: 'official', value: official[0] });
  for (const value of external.slice(1)) ordered.push({ kind: 'external', value });
  for (const value of official.slice(1)) ordered.push({ kind: 'official', value });

  const sources: GenreReferenceGuideSource[] = [];
  for (const candidate of ordered) {
    const source = candidate.kind === 'external'
      ? minimumVisualSource(candidate.value)
      : minimumOfficialSource(candidate.value);
    const trial = [...sources, source];
    if (serializedLength(buildSuccess(genre, aspect, maxChars, coverage, external, official, trial)) <= maxChars) {
      sources.push(source);
    }
  }

  if (sources.length === 0) {
    throw new Error(`genre reference guide cannot fit a source inside ${maxChars} characters`);
  }

  // Add depth only after source diversity. This keeps a compact response from spending its entire
  // budget on several observations from one page while hiding that other references exist.
  let changed = true;
  while (changed) {
    changed = false;
    for (const source of sources) {
      if (source.kind === 'visual_reference') {
        const scoped = external.find((item) => item.reference.id === source.id);
        const next = scoped?.observations[source.observations.length];
        if (!next) continue;
        source.observations.push({ ...next });
        if (serializedLength(buildSuccess(genre, aspect, maxChars, coverage, external, official, sources)) <= maxChars) {
          changed = true;
        } else {
          source.observations.pop();
        }
      } else {
        const scoped = official.find((item) => item.link.id === source.id);
        const next = scoped?.link.rules[source.rules.length];
        if (!next) continue;
        source.rules.push(next);
        if (serializedLength(buildSuccess(genre, aspect, maxChars, coverage, external, official, sources)) <= maxChars) {
          changed = true;
        } else {
          source.rules.pop();
        }
      }
    }
  }

  const result = buildSuccess(genre, aspect, maxChars, coverage, external, official, sources);
  if (serializedLength(result) > maxChars || serializedLength(result) > GENRE_REFERENCE_GUIDE_MAX_CHARS) {
    throw new Error('genre reference guide exceeded its character budget');
  }
  return result;
}
