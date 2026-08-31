// dedupe.mjs — near-duplicate detection over normalised content.
// Implements SOURCE-INTELLIGENCE.md §2: "content-identical forks MUST share a content hash and
// MUST NOT multiply training/retrieval weight", and its harder half — a fork that changed only
// comments is *recorded* as divergent by the content hash, and must then be *scored* as trivially
// divergent here so it earns no extra weight. Recording a difference and rewarding it are separate
// decisions; the content hash makes the first, this file makes the second.
//
// Nothing here fetches, writes or executes anything. Pure functions over strings.
//
// ---------------------------------------------------------------------------------------------
// WHY MINHASH AND NOT SIMHASH
//
// SimHash is the cheaper fingerprint: one 64-bit word per document, similarity read off a Hamming
// distance. It is the right tool when you have tens of millions of documents and only need to know
// "roughly the same or not". It is the wrong tool HERE, for two reasons specific to this workload:
//
//   1. Our whole decision lives in the top of the range. Forks of a small Luau repo cluster between
//      J≈0.6 and J=1.0, and the threshold we must place sits inside that band. SimHash's Hamming
//      distance is a monotone-but-coarse proxy for cosine similarity: with 64 bits the resolution
//      near the top is a handful of bit flips, and the mapping back to a similarity number is
//      approximate in exactly the region we need it to be sharp.
//   2. Jaccard over shingles is the quantity we actually mean. "How much of this repo's code is
//      literally the other repo's code" IS set overlap. MinHash estimates that quantity without
//      bias, and — because these repos are small — when we hold both texts we skip the estimator
//      entirely and compute the set overlap exactly (see `similarity`). SimHash has no exact mode;
//      the fingerprint is lossy by construction.
//
// The cost SimHash would have saved (one word vs 256) is irrelevant at corpus scale: a few thousand
// repositories, not a few billion web pages. We pay 1KB per record and get an exact answer.
// ---------------------------------------------------------------------------------------------

/** Tokens per shingle. 5 is the standard width for code near-duplicate work: short enough that a
 *  small edit only perturbs the ~5 shingles that overlap it, long enough that shared Luau
 *  boilerplate (`local x = game:GetService(...)`) does not make unrelated repos look alike. */
export const SHINGLE_WIDTH = 5;

/** MinHash permutations. Standard error of the estimate is sqrt(J(1-J)/k); at k=256 that is ±0.019
 *  around J=0.9 — a tenth of the gap the threshold below has to survive. */
export const SIGNATURE_SIZE = 256;

/**
 * The divergence threshold, as a SIMILARITY FLOOR: pairs at or above it are the same artifact
 * wearing a different hat; pairs below it are genuinely different examples and get ingested as
 * such. §2 states the constraint in terms of difference — "above comment-only churn and below a
 * genuine reimplementation" — so read in similarity the polarity inverts: the number must sit
 * BELOW what a comment-only fork scores and ABOVE what a reimplementation scores.
 *
 * 0.30, and it was measured rather than argued. Against a representative Luau module — a shop
 * panel with services, a config table, comments and two functions — the edits a real fork makes
 * score (exact Jaccard / 256-permutation MinHash estimate; fixtures pinned in dedupe.test.mjs):
 *
 *     identical                                   1.000 / 1.000
 *     one function appended, rest untouched       0.938 / 0.965
 *     shop prices retuned (the simulator fork)    0.932 / 0.914
 *     every comment rewritten, code untouched     0.790 / 0.766
 *     locals renamed + comments rewritten         0.404 / 0.395
 *     renamed + retuned + a function added        0.376 / 0.395
 *     ------------------------------------------ the cliff -----
 *     same feature reimplemented from scratch     0.038 / 0.047
 *     an unrelated module from the same repo      0.019 / 0.023
 *
 * Everything that is *the same code re-badged* floors at 0.376. Everything that is *somebody
 * else's implementation* ceilings at 0.038 — above zero only because both files necessarily name
 * the same engine APIs. Nothing lands in between; the band from 0.04 to 0.37 is empty, and 0.30
 * sits in it.
 *
 * Placed deliberately near the top of that empty band rather than the middle. The two errors are
 * not symmetric: admitting a re-badged fork as a second example silently doubles the weight of one
 * idea, which is the exact failure §2 exists to prevent, while splitting a borderline pair costs
 * only some redundancy in retrieval. The residual risk is stated plainly — a fork heavier than the
 * heaviest probed here crosses below 0.30 and is treated as divergent. That is the intended
 * behaviour, not a leak: past some amount of change a fork genuinely IS a new example, and 0.30 is
 * where this file draws that line.
 *
 * Comments are deliberately NOT stripped before shingling. Stripping them would score a
 * comment-only fork at exactly 1.000 and make the churn invisible; §2 wants it visible, small, and
 * comfortably above the threshold — measured, not assumed away.
 *
 * One caveat when the same threshold is applied on the `files` basis (see `recordSimilarity`):
 * file-hash Jaccard is coarser and biased high, because a fork that rewrites one file of twenty
 * still scores 0.90. That is a reason to prefer the shingle basis, not a reason for a second
 * number — a second threshold would just hide which evidence a verdict rested on.
 */
export const DIVERGENCE_THRESHOLD = 0.3;

// ------------------------------------------------------------------ normalisation and shingling

/**
 * Normalise away what a fork changes without changing the code — the same list §2 gives for the
 * content hash: line endings, trailing whitespace, a trailing newline. Comments and blank-line
 * placement survive; the threshold is calibrated on the assumption that they do.
 */
export function normalise(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '');
}

/**
 * Identifiers, numbers, and every other non-space character as its own token.
 *
 * Case is preserved because Luau is case-sensitive and casing is meaning: `Players` and `players`
 * are a service and a local, and a corpus that confuses them teaches the confusion.
 */
export function tokenise(text) {
  return normalise(text).match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|\S/g) ?? [];
}

/**
 * The shingle set. A file shorter than one shingle collapses to a single shingle of everything it
 * has, so tiny files still compare to each other instead of both looking empty.
 */
export function shingles(text, width = SHINGLE_WIDTH) {
  const tokens = tokenise(text);
  if (tokens.length === 0) return new Set();
  if (tokens.length < width) return new Set([tokens.join('')]);
  const out = new Set();
  for (let i = 0; i + width <= tokens.length; i++) out.add(tokens.slice(i, i + width).join(''));
  return out;
}

// ------------------------------------------------------------------ MinHash

const EMPTY = 0xffffffff;

/** FNV-1a. Cheap, deterministic, and — unlike anything seeded from the runtime — identical across
 *  processes, which matters because signatures are provenance and must reproduce next year. */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The k permutations, as a murmur3-style finalizer applied to (hash XOR seed).
 *
 * Not a strictly universal (a·h+b mod p) family — that needs 64-bit products JavaScript numbers
 * cannot hold exactly, and a BigInt inner loop would cost more than it buys. The avalanche mixer
 * below decorrelates the seeds well enough that the estimator's error stays at the theoretical
 * sqrt(J(1-J)/k), which is what the threshold above was calibrated against.
 */
function permute(h, seed) {
  let x = (h ^ seed) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** Fixed seeds, derived from a constant so the signature of a given text never changes. */
const SEEDS = (() => {
  const s = new Uint32Array(SIGNATURE_SIZE);
  let x = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    x = permute(x, i + 1);
    s[i] = x;
  }
  return s;
})();

/**
 * A MinHash sketch of `text`. This is what gets stored on a ContentRecord when the text itself is
 * not kept around — 1KB that still answers "how close is this to that" months later.
 */
export function signature(text, { k = SIGNATURE_SIZE, width = SHINGLE_WIDTH } = {}) {
  const set = shingles(text, width);
  const mins = new Uint32Array(k).fill(EMPTY);
  for (const sh of set) {
    const h = fnv1a(sh);
    for (let i = 0; i < k; i++) {
      const v = permute(h, SEEDS[i % SEEDS.length] ^ i);
      if (v < mins[i]) mins[i] = v;
    }
  }
  return { k, width, size: set.size, mins };
}

function isSignature(v) {
  return v !== null && typeof v === 'object' && ArrayBuffer.isView(v.mins) && typeof v.k === 'number';
}

function jaccardExact(a, b) {
  if (a.size === 0 && b.size === 0) return 1; // two empty files are the same empty file
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const sh of small) if (large.has(sh)) shared++;
  return shared / (a.size + b.size - shared);
}

function jaccardEstimated(a, b) {
  if (a.k !== b.k) throw new Error(`dedupe: signature sizes differ (${a.k} vs ${b.k})`);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let matches = 0;
  for (let i = 0; i < a.k; i++) if (a.mins[i] === b.mins[i]) matches++;
  return matches / a.k;
}

/**
 * Similarity in 0..1 — an estimate of the Jaccard overlap of the two shingle sets.
 *
 * Two strings take the exact path: we are holding both sets, so there is no reason to accept
 * estimator noise. Two signatures take the MinHash path, which is the same quantity with a
 * ±sqrt(J(1-J)/k) standard error. A mixed pair is promoted to signatures, because a signature
 * cannot be un-sketched back into a set.
 */
export function similarity(a, b, opts = {}) {
  const aSig = isSignature(a);
  const bSig = isSignature(b);
  if (!aSig && !bSig) return jaccardExact(shingles(a, opts.width ?? SHINGLE_WIDTH), shingles(b, opts.width ?? SHINGLE_WIDTH));
  return jaccardEstimated(aSig ? a : signature(a, { k: b.k, width: b.width }), bSig ? b : signature(b, { k: a.k, width: a.width }));
}

/** True when the pair is a genuinely different example rather than the same one re-badged. */
export function isDivergent(a, b, threshold = DIVERGENCE_THRESHOLD, opts = {}) {
  return similarity(a, b, opts) < threshold;
}

// ------------------------------------------------------------------ clustering a fork family

/**
 * Exact Jaccard over the `fileHashes` map — the repo-granularity similarity §2 describes when it
 * says a fork that adds one file "still shares every other file's hash, which is what makes partial
 * reuse measurable rather than all-or-nothing". Free (the hashes already exist) and exact, but
 * blind to edits *inside* a file, so it is the fallback and not the first choice.
 */
export function fileSimilarity(a, b) {
  const setOf = (r) => new Set(Object.values(r?.fileHashes ?? {}));
  return jaccardExact(setOf(a), setOf(b));
}

function recordSignature(record) {
  if (isSignature(record?.signature)) return record.signature;
  if (typeof record?.text === 'string') return signature(record.text);
  return null;
}

function pairSimilarity(a, b, sa, sb) {
  if (sa && sb) return { value: jaccardEstimated(sa, sb), basis: 'shingles' };
  const hasFiles = (r) => r?.fileHashes && Object.keys(r.fileHashes).length > 0;
  if (hasFiles(a) && hasFiles(b)) return { value: fileSimilarity(a, b), basis: 'files' };
  return { value: null, basis: 'none' };
}

/**
 * Similarity between two ContentRecords, and — reported, never inferred — which evidence it used.
 *
 * The basis is returned rather than folded away because a 0.9 from `shingles` and a 0.9 from
 * `files` are not the same claim: the second only says most files are byte-identical and is blind
 * to what changed inside the one that is not.
 */
export function recordSimilarity(a, b) {
  return pairSimilarity(a, b, recordSignature(a), recordSignature(b));
}

/**
 * Resolve a family of forks to one representative plus its variants.
 *
 * Single-linkage over the pairs that clear `threshold`: A and C join the same family if some B
 * bridges them. Single linkage can chain — A~B and B~C at 0.56 each while A~C sits at 0.30 — so
 * every variant's similarity is reported AGAINST THE REPRESENTATIVE, not against whichever
 * neighbour pulled it in, and a chained-in variant is visible as one scoring below the threshold
 * rather than hiding behind its bridge.
 *
 * The representative is the medoid — the member most similar to the rest of its own family —
 * broken by lexicographic contentHash so the choice is deterministic across runs. Deliberately NOT
 * the most-forked member: §2 is explicit that popularity is evidence a pattern is widespread, not
 * evidence it is correct, and letting fork count pick the representative would smuggle exactly that
 * inference into the corpus.
 *
 * A group is the unit that must not be counted more than once. Each ContentRecord keeps weight 1 —
 * that never changes — but retrieval and any training subset should treat one group as one idea.
 *
 * `annotations` is keyed by contentHash and holds exactly the two pinned ContentRecord fields
 * (`divergentFrom`, `similarity`), ready to copy onto the record; `variants` carries the separate
 * quantity — how close each variant is to its own representative — so the two never get confused.
 *
 * @returns {Array<{representative: string, members: string[],
 *   variants: Array<{contentHash: string, similarityToRepresentative: number|null}>,
 *   annotations: Record<string, {divergentFrom: string|null, similarity: number|null}>,
 *   basis: string, threshold: number}>}
 */
export function cluster(contentRecords, { threshold = DIVERGENCE_THRESHOLD } = {}) {
  const records = [...(contentRecords ?? [])];
  const n = records.length;
  if (n === 0) return [];

  const hash = (r, i) => r?.contentHash ?? `#unhashed-${i}`;

  // Sketch each record ONCE. The pairwise pass is O(n²) comparisons and shingling a repo is by far
  // the expensive half; re-deriving a signature inside the loop turns a hundred forks into ten
  // thousand shinglings, which is exactly the "scoring a hundred identical forks a hundred times"
  // waste §1 reorders the pipeline to avoid.
  const sigs = records.map((r) => recordSignature(r));

  const sim = Array.from({ length: n }, () => new Array(n).fill(null));
  const bases = new Set();
  for (let i = 0; i < n; i++) {
    sim[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const { value, basis } = pairSimilarity(records[i], records[j], sigs[i], sigs[j]);
      sim[i][j] = sim[j][i] = value;
      bases.add(basis);
    }
  }

  // Union-find over the pairs that clear the threshold.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (sim[i][j] !== null && sim[i][j] >= threshold) parent[find(i)] = find(j);
    }

  const families = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!families.has(root)) families.set(root, []);
    families.get(root).push(i);
  }

  const groups = [];
  for (const members of families.values()) {
    // Medoid: highest total similarity to the rest of its own family, ties to the lower hash.
    let best = members[0];
    let bestScore = -1;
    for (const i of members) {
      const score = members.reduce((acc, j) => acc + (i === j ? 0 : (sim[i][j] ?? 0)), 0);
      const better = score > bestScore || (score === bestScore && hash(records[i], i) < hash(records[best], best));
      if (better) {
        best = i;
        bestScore = score;
      }
    }

    // `divergentFrom` per the pinned ContentRecord type: the NEAREST neighbour across the whole
    // input, not merely the family — a record's closest relative is a fact about the corpus, and
    // clamping it to the family would hide the nearest thing to a singleton.
    const nearest = (i) => {
      let bestJ = -1;
      let bestV = -1;
      for (let j = 0; j < n; j++) {
        if (j === i || sim[i][j] === null) continue;
        if (sim[i][j] > bestV || (sim[i][j] === bestV && bestJ >= 0 && hash(records[j], j) < hash(records[bestJ], bestJ))) {
          bestV = sim[i][j];
          bestJ = j;
        }
      }
      return bestJ < 0 ? { divergentFrom: null, similarity: null } : { divergentFrom: hash(records[bestJ], bestJ), similarity: bestV };
    };

    const annotations = {};
    for (const i of members) annotations[hash(records[i], i)] = nearest(i);

    groups.push({
      representative: hash(records[best], best),
      members: members.map((i) => hash(records[i], i)).sort(),
      variants: members
        .filter((i) => i !== best)
        .map((i) => ({ contentHash: hash(records[i], i), similarityToRepresentative: sim[i][best] }))
        .sort((x, y) => (x.contentHash < y.contentHash ? -1 : 1)),
      annotations,
      basis: bases.has('shingles') ? 'shingles' : bases.has('files') ? 'files' : 'none',
      threshold,
    });
  }

  return groups.sort((a, b) => (a.representative < b.representative ? -1 : 1));
}
