// records.mjs — ProvenanceRecord, ContentRecord, and the one function that keeps
// them apart.
//
// SOURCE-INTELLIGENCE.md §2 states the owner's requirement as two halves that pull
// against each other: preserve every fork, but do not let content-identical forks
// multiply evidential weight. The resolution is not a compromise between them, it
// is two separate stores:
//
//   ProvenanceRecord   one per fork.         Never deduplicated. Never deleted.
//   ContentRecord      one per content hash. Carries the weight, and it is 1.
//
// collapse() is where that becomes code. Everything else in this file exists to
// make the shapes it produces impossible to get subtly wrong.
//
// No network here either: this module is pure data assembly over what the earlier
// gates already established.

/** §3's table, in order of decreasing permission. */
export const LICENCE_CLASSES = Object.freeze([
  'COMMERCIAL_REUSABLE',
  'ATTRIBUTION_REQUIRED',
  'COPYLEFT',
  'REFERENCE_ONLY',
  'EVALUATION_ONLY',
  'UNCLEAR_QUARANTINE',
  'UNSAFE_EXCLUDED',
]);

// §3: "The default is UNCLEAR_QUARANTINE, not COMMERCIAL_REUSABLE. Absence of
// evidence is not permission." A record built before the classifier has run must
// therefore start here, not at anything usable.
export const UNVERIFIED_LICENCE = Object.freeze({
  class: 'UNCLEAR_QUARANTINE',
  reuse: 'forbidden',
  training: 'forbidden',
  spdx: null,
  evidence: 'none',
  evidencePath: null,
  reason: 'No licence evidence examined yet; absence of evidence is not permission.',
});

// §1 puts the security gate second, immediately after provenance is recorded, so a
// record genuinely does exist for a while in an unscanned state. It must not read
// as safe during that window.
export const UNSCANNED_SECURITY = Object.freeze({
  safe: false,
  class: 'unscanned',
  signals: [],
  reason: 'Not yet scanned; the security gate runs before anything reads the source.',
});

// Classes that may not be surfaced at retrieval at all. REFERENCE_ONLY and COPYLEFT
// are deliberately absent — §3 makes both perfectly good to read and cite; they are
// only barred from being reproduced or trained on, which is a different question
// asked elsewhere.
const NOT_RETRIEVABLE = new Set(['UNSAFE_EXCLUDED', 'UNCLEAR_QUARANTINE']);

/** Stable across re-discovery, because it is derived only from where and which commit. */
export function provenanceId({ host, owner, repo, sha }) {
  for (const [name, value] of Object.entries({ host, owner, repo, sha })) {
    if (!value) throw new Error(`intake: provenanceId needs a ${name}`);
  }
  return `${host}/${owner}/${repo}@${sha}`;
}

/**
 * One discovered location. One fork, one mirror, one re-upload — each gets its own,
 * and none of them are ever merged away.
 *
 * `forkCount` and `stars` live here rather than on the ContentRecord on purpose:
 * they are properties of a *location*, and §2's rule is that popularity is not
 * weight. Keeping them off the record that carries weight makes the mistake
 * awkward to make.
 */
export function provenanceRecord({
  host,
  owner,
  repo,
  ref = null,
  sha,
  url = null,
  discoveredAt = null,
  isFork = false,
  upstream = null,
  forkCount = 0,
  stars = 0,
  licence = UNVERIFIED_LICENCE,
  security = UNSCANNED_SECURITY,
  contentHash = null,
  // Injected so a test can pin the date; there is no other clock in this package.
  now = () => new Date(),
}) {
  return {
    id: provenanceId({ host, owner, repo, sha }),
    host,
    owner,
    repo,
    ref,
    sha,
    url: url ?? `https://${host}/${owner}/${repo}`,
    discoveredAt: discoveredAt ?? now().toISOString().slice(0, 10),
    isFork,
    upstream,
    forkCount,
    stars,
    licence,
    security,
    contentHash,
  };
}

/**
 * One distinct normalised content. This is the record that carries weight.
 *
 * `weight` is not a parameter. There is no call site anywhere that can set it to
 * anything but 1, which is the entire point: a hundred forks of one file cannot
 * become a hundred votes, however the caller assembles them.
 */
export function contentRecord({
  contentHash,
  observedIn,
  fileHashes = {},
  divergentFrom = null,
  similarity = null,
  libraries = [],
  engineEra = 'unknown',
  deprecatedPatterns = [],
  qualityScore = null,
}) {
  if (!contentHash) throw new Error('intake: contentRecord needs a contentHash');
  if (!Array.isArray(observedIn) || observedIn.length === 0) {
    throw new Error(`intake: contentRecord ${contentHash} must be observed somewhere`);
  }
  return {
    contentHash,
    observedIn: [...observedIn],
    weight: 1,
    fileHashes: { ...fileHashes },
    divergentFrom,
    similarity,
    libraries: [...libraries],
    engineEra,
    deprecatedPatterns: [...deprecatedPatterns],
    qualityScore,
  };
}

/**
 * The rule, enforced.
 *
 * Every input survives in `provenance` — that is the half the pipeline is forbidden
 * from optimising away. `content` gets exactly one entry per distinct contentHash,
 * with every observing provenance id listed and a weight of 1.
 *
 * `details` optionally carries what the later stages know, keyed by contentHash
 * (fileHashes from contenthash.mjs, libraries and engineEra from domain tagging,
 * qualityScore from scoring). It cannot override contentHash or observedIn: those
 * are facts of the collapse, not opinions a caller supplies.
 */
export function collapse(provenanceRecords, details = {}) {
  const provenance = [...provenanceRecords];

  // Insertion order is discovery order, and Map preserves it — so observedIn reads
  // oldest-seen first, which is what makes it useful for reasoning about upstream.
  const observed = new Map();
  for (const p of provenance) {
    // §1 hashes content after the security gate, so a source quarantined earlier
    // legitimately has no hash yet. It keeps its provenance record regardless; §4
    // requires an excluded source to stay auditable rather than vanish.
    if (!p.contentHash) continue;
    if (!observed.has(p.contentHash)) observed.set(p.contentHash, new Set());
    // A Set, because re-running discovery must not be able to inflate observedIn —
    // that would quietly turn a repeated crawl into a popularity signal.
    observed.get(p.contentHash).add(p.id);
  }

  const content = [...observed.entries()]
    // Sorted by hash so the collapsed set diffs cleanly between runs even if
    // discovery visited the forks in a different order.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([hash, ids]) =>
      contentRecord({ ...(details[hash] ?? {}), contentHash: hash, observedIn: [...ids] }),
    );

  return { content, provenance };
}

// How much each popularity signal is allowed to move a ranking. Exported so the
// numbers are auditable rather than buried.
export const RETRIEVAL_RANK_WEIGHTS = Object.freeze({ stars: 1, forks: 0.5, locations: 0.5 });

/**
 * THE ONE PLACE FORK COUNTS ARE ALLOWED TO MATTER.
 *
 * §2: "A high fork count is evidence a pattern is widespread, which legitimately
 * helps rank retrieval results. It is not evidence the pattern is correct, and it
 * must never multiply training weight." So popularity lives here, in ranking, and
 * nowhere near ContentRecord.weight — which is why this is a function over a record
 * rather than a field on one. There is no cached rank to accidentally read as
 * weight later.
 *
 * Signals are log-damped: one thousand-star repository should outrank a ten-star
 * one, but not by a hundred times, or the corpus becomes a popularity contest and
 * §5's warning about popular-but-deprecated code comes true.
 */
export function retrievalRank(contentRecord, provenanceRecords) {
  const byId = new Map(provenanceRecords.map((p) => [p.id, p]));
  const seen = contentRecord.observedIn.map((id) => byId.get(id)).filter(Boolean);
  if (seen.length === 0) return 0;

  // §4: an excluded source is out of every use, retrieval included; §3: quarantine
  // is unused until a human resolves it. If no observing location clears both gates,
  // this content has no business being ranked at all.
  const usable = seen.filter((p) => p.security?.safe === true && !NOT_RETRIEVABLE.has(p.licence?.class));
  if (usable.length === 0) return 0;

  const sum = (pick) => usable.reduce((n, p) => n + (pick(p) || 0), 0);
  const popularity =
    RETRIEVAL_RANK_WEIGHTS.stars * Math.log1p(sum((p) => p.stars)) +
    RETRIEVAL_RANK_WEIGHTS.forks * Math.log1p(sum((p) => p.forkCount)) +
    RETRIEVAL_RANK_WEIGHTS.locations * Math.log1p(usable.length);

  // Quality leads; popularity only scales it. An unscored record sits at the
  // midpoint rather than at zero, so it is still reachable before scoring runs.
  const quality = typeof contentRecord.qualityScore === 'number' ? contentRecord.qualityScore : 0.5;
  return quality * (1 + popularity);
}
