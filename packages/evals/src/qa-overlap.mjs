// THE NON-OVERLAP MECHANISM for the RobloxQA knowledge gate.
//
// WHY IT IS A MODULE AND NOT THREE LINES INSIDE THE HARVESTER. A held-out split is the whole
// instrument. If a question in `gate.jsonl` also sits in `headroom.jsonl` — the split the card
// offers as tuning headroom — then the day anyone tunes on headroom, the gate reports a number
// that measures memorisation and nothing else, AND NOTHING LOOKS WRONG. The score goes up. That is
// the observation-failure shape this repository keeps finding: a measurement that cannot fail is
// not a measurement, and an inflated eval is indistinguishable from a better model.
//
// The dataset's own card asserts that dedup ran before the split. This module is why we do not
// have to believe it.
//
// TWO DETECTORS, BECAUSE ONE OF THEM IS TOO EASY TO PASS.
//
//   exact  — sha256 of the question with case and punctuation normalised away. Cheap, exhaustive,
//            and small enough to COMMIT as an index, so the check still runs when the derived
//            .jsonl files are absent. It catches verbatim reuse and nothing else.
//   shingle— 8-word windows over the normalised question, the same window `build-dataset.mjs`
//            uses against the eval tasks. It catches the case `exact` cannot: the same question
//            with one word changed, which is exactly what a generator producing 7,614 questions
//            from 1,874 documents will occasionally emit. Needs the full rows.
//
// The window length is 8 deliberately, matching the existing contamination guard, so the two
// thresholds in this repository cannot drift apart.
//
// FAIL-CLOSED, UNLIKE THE GUARD IT IS MODELLED ON. `contaminated()` in build-dataset.mjs reports
// every example clean when handed an empty eval set, and relies on its caller to print the
// denominator. `findOverlap` refuses instead: an empty side throws, because "I compared your
// 3,000 questions against nothing and found no overlap" is a sentence that should never be said.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

/** Lowercase, collapse every run of non-alphanumerics to one space, trim. */
export function normaliseQuestion(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The committed index's key. 16 hex chars = 64 bits; at 7,614 keys a collision is ~2e-15. */
export function questionKey(s) {
  return createHash('sha256').update(normaliseQuestion(s)).digest('hex').slice(0, 16);
}

export const SHINGLE_N = 8;

export function* shingles(normalised, n = SHINGLE_N) {
  const w = normalised.split(' ').filter(Boolean);
  for (let i = 0; i + n <= w.length; i++) yield w.slice(i, i + n).join(' ');
}

/**
 * Exact-key overlap between two key lists.
 *
 * Throws on an empty side rather than returning a clean result. See the header.
 * @returns {{shared: string[], aCount: number, bCount: number, aUnique: number, bUnique: number}}
 */
export function findOverlap(aKeys, bKeys) {
  if (!Array.isArray(aKeys) || !Array.isArray(bKeys)) throw new TypeError('findOverlap: both sides must be arrays of keys');
  if (!aKeys.length || !bKeys.length) {
    throw new Error(
      `findOverlap: refusing to compare an EMPTY side (a=${aKeys.length}, b=${bKeys.length}). ` +
      'An empty side makes every question look held-out; that is a failure to observe, not a clean result.',
    );
  }
  const b = new Set(bKeys);
  const shared = [...new Set(aKeys.filter((k) => b.has(k)))];
  return { shared, aCount: aKeys.length, bCount: bKeys.length, aUnique: new Set(aKeys).size, bUnique: new Set(b).size };
}

/**
 * Maximum number of B-side questions a shingle may appear in before it stops being evidence.
 *
 * WHY THIS EXISTS, AND HOW IT WAS FOUND. The first run of this detector over 200+200 rows reported
 * 4 near-duplicates. Every one was a false positive, and the shingles say why:
 *
 *     "in luau what is the primary purpose of"
 *     "in the roblox engine what is the primary"
 *     "effect of calling table freeze on a table"
 *
 * Those are STOCK QUESTION STEMS. RobloxQA's generator opens thousands of questions the same way,
 * so an 8-word window lands entirely inside the boilerplate and matches a question it has nothing
 * to do with. The window length was inherited from `build-dataset.mjs`, where it slides over
 * hand-written doc comments — prose with no fixed opening — and there it is correct.
 *
 * The fix is not a longer window (which would then miss a genuinely reworded duplicate); it is to
 * throw away shingles that are not DISTINCTIVE. A window occurring in more than `DF_MAX` of the
 * B side's own questions is part of the template, not a fingerprint of one question. Both the raw
 * and the filtered count are returned, so the weakening is visible rather than quietly applied.
 */
export const DF_MAX = 3;

/**
 * Near-duplicate overlap: a distinctive 8-word window shared between a gate question and any other.
 *
 * `bTexts` is indexed first, then every `aText` is scanned. Returns the offending pairs, capped,
 * because the caller needs examples to look at rather than 3,000 of them.
 */
export function findShingleOverlap(aTexts, bTexts, { n = SHINGLE_N, cap = 25, dfMax = DF_MAX } = {}) {
  if (!aTexts?.length || !bTexts?.length) {
    throw new Error(
      `findShingleOverlap: refusing to compare an EMPTY side (a=${aTexts?.length ?? 0}, b=${bTexts?.length ?? 0}).`,
    );
  }
  const df = new Map();    // shingle -> how many B questions contain it
  const first = new Map(); // shingle -> first B index that produced it
  for (let i = 0; i < bTexts.length; i++) {
    for (const sh of new Set(shingles(normaliseQuestion(bTexts[i]), n))) {
      df.set(sh, (df.get(sh) ?? 0) + 1);
      if (!first.has(sh)) first.set(sh, i);
    }
  }
  const hits = [];
  let total = 0;
  let rawTotal = 0;
  const stems = new Set();
  for (let i = 0; i < aTexts.length; i++) {
    let hitRaw = false;
    let hitDistinct = false;
    for (const sh of shingles(normaliseQuestion(aTexts[i]), n)) {
      if (!df.has(sh)) continue;
      hitRaw = true;
      if (df.get(sh) > dfMax) { stems.add(sh); continue; }
      hitDistinct = true;
      if (hits.length < cap) hits.push({ aIndex: i, bIndex: first.get(sh), shingle: sh, bDocFrequency: df.get(sh) });
      break; // one distinctive hit per a-row is enough to condemn it
    }
    if (hitRaw) rawTotal++;
    if (hitDistinct) total++;
  }
  return {
    total, hits, n, dfMax, rawTotal,
    stemsIgnored: stems.size,
    stemExamples: [...stems].slice(0, 5),
    aCount: aTexts.length,
    bCount: bTexts.length,
  };
}

// ==============================================================================================
// THE DETECTOR THAT ACTUALLY WORKS ON THIS CORPUS
//
// WHY THE SHINGLE DETECTOR ABOVE IS NOT THE ANSWER HERE, MEASURED. Run over the real 3,000-row
// gate against the real 4,614-row headroom, `findShingleOverlap` flagged 237 rows; the stock-stem
// filter removed 28 and left 209. Inspecting those 209 shows the filter did not go far enough and
// cannot: the surviving shingles are
//
//     "in roblox development what is the primary purpose"   (df 2)
//     "in luau what is the effect of calling"               (df 1)
//     "in roblox what data type must be assigned"           (df 1)
//
// — still generator boilerplate, just rarer boilerplate. A document-frequency cut cannot separate
// a rare stem from a real duplicate, because at 8 words out of a ~19-word templated question the
// window is mostly stem either way. A FIXED WINDOW IS THE WRONG INSTRUMENT FOR TEMPLATED PROSE.
// It is the right instrument in `build-dataset.mjs`, where it slides over hand-written doc
// comments that have no fixed opening, and it stays there.
//
// WHAT REPLACES IT. Similarity over the WHOLE question, with each token weighted by its inverse
// document frequency across both splits. A stem word ("in", "roblox", "what", "primary") appears
// in thousands of questions and carries almost no weight; "getpropertychangedsignal" appears in a
// handful and carries nearly all of it. Two questions that share only a stem score near zero; two
// phrasings of one question score high. The corpus calibrates the weights itself, so there is no
// hand-written stop list to rot.
//
// WHAT IT FOUND, WHICH IS THE POINT. The dataset card says dedup ran before the split, and at the
// exact level that is TRUE — 0 of 3,000 gate questions appear verbatim in headroom. At the
// paraphrase level it is not:
//
//     0.933  A: What is the primary purpose of calling GetPropertyChangedSignal(property) on a Roblox Instance?
//            B: What is the primary purpose of calling GetPropertyChangedSignal on a Roblox Instance?
//     0.920  A: In Roblox, what does the Instance method `IsA(className)` return when called on an object?
//            B: In Roblox, what does the `IsA(className)` method return when called on an Instance?
//     0.911  A: In Roblox Analytics, what does the "Day 1 retention" metric specifically measure?
//            B: In game analytics, what does the Day 1 retention metric specifically measure?
//
// 10 gate rows score >= 0.8, 31 >= 0.7, 60 >= 0.6. "Held out" was true of the strings and not of
// the questions.
//
// WHY THE THRESHOLD IS 0.6 AND NOT HIGHER. The 0.60-0.75 band is mostly genuine paraphrase, but it
// does contain a false positive — `Vector2:Angle` versus `Vector2:Dot`, two different questions
// sharing one template, at 0.726. The trade is asymmetric: a false positive costs one row out of
// 3,000, while a false negative costs the held-out property the whole gate rests on. So the cut is
// deliberately generous, it excludes 60 rows (2.0% of the gate), and the counts at 0.7 and 0.8 are
// recorded alongside it so the choice can be argued with rather than inherited.
// ==============================================================================================

/**
 * Weighted-Jaccard score at or above which a gate question is treated as a restatement.
 *
 * THE THRESHOLD IS CORPUS-RELATIVE, AND THAT IS NOT A DEFECT TO HIDE. idf comes from the two
 * splits being compared, so the same pair of questions scores differently in a different corpus:
 * the planted rewording in `fixtures/qa-overlap` scores 0.655 against the real 7,614-question
 * corpus and 0.484 against the 10-question fixture, because in ten documents "what" and "does"
 * are still rare enough to carry weight. 0.6 is calibrated for RobloxQA's scale and is the right
 * number there. What travels between corpora is the SEPARATION — in the fixture the true pair
 * scores 0.484 and the next-best pair 0.071 — which is why the fixture tests assert the ranking
 * and a padded corpus is used to exercise the absolute cut.
 */
export const NEAR_DUP_THRESHOLD = 0.6;

const tokenSet = (s) => new Set(normaliseQuestion(s).split(' ').filter(Boolean));

/**
 * Every A-question that restates a B-question, scored by idf-weighted Jaccard over both splits.
 *
 * Candidates come from an inverted index built on the RARE tokens only (df <= 1% of the corpus):
 * indexing "the" would make every question a candidate for every other and turn a 14-million-pair
 * comparison into an unusable one, while a question with no rare token in common with any B row
 * cannot possibly clear the threshold.
 *
 * @returns {{flagged: Array<{aIndex:number,bIndex:number,score:number}>, counts: Record<string,number>, threshold:number}}
 */
export function findNearDuplicates(aTexts, bTexts, { threshold = NEAR_DUP_THRESHOLD } = {}) {
  if (!aTexts?.length || !bTexts?.length) {
    throw new Error(
      `findNearDuplicates: refusing to compare an EMPTY side (a=${aTexts?.length ?? 0}, b=${bTexts?.length ?? 0}). ` +
      'An empty side makes every question look held-out; that is a failure to observe, not a clean result.',
    );
  }
  const A = aTexts.map(tokenSet);
  const B = bTexts.map(tokenSet);
  const N = A.length + B.length;

  const df = new Map();
  for (const s of [...A, ...B]) for (const t of s) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t) => Math.log(N / (df.get(t) ?? 1));
  const rare = (t) => (df.get(t) ?? 0) <= Math.max(2, N * 0.01);

  const index = new Map();
  for (let i = 0; i < B.length; i++) {
    for (const t of B[i]) {
      if (!rare(t)) continue;
      if (!index.has(t)) index.set(t, []);
      index.get(t).push(i);
    }
  }

  const score = (a, b) => {
    let inter = 0;
    let union = 0;
    for (const t of a) { const w = idf(t); union += w; if (b.has(t)) inter += w; }
    for (const t of b) if (!a.has(t)) union += idf(t);
    return union ? inter / union : 0;
  };

  const flagged = [];
  const counts = { '0.6': 0, '0.7': 0, '0.8': 0, '0.9': 0 };
  for (let i = 0; i < A.length; i++) {
    const cand = new Set();
    for (const t of A[i]) if (rare(t)) for (const j of index.get(t) ?? []) cand.add(j);
    let best = 0;
    let arg = -1;
    for (const j of cand) {
      const s = score(A[i], B[j]);
      if (s > best) { best = s; arg = j; }
    }
    for (const k of Object.keys(counts)) if (best >= Number(k)) counts[k]++;
    if (best >= threshold) flagged.push({ aIndex: i, bIndex: arg, score: Number(best.toFixed(4)) });
  }
  flagged.sort((x, y) => y.score - x.score);
  return { flagged, counts, threshold, aCount: A.length, bCount: B.length };
}

/** Read a `.jsonl` of `{question, ...}` rows. Throws if the file is absent — see the header. */
export function loadQuestions(path) {
  if (!existsSync(path)) {
    throw new Error(
      `loadQuestions: ${path} is absent. Run \`node scripts/harvest-hf.mjs\` first. ` +
      'A missing split is not an empty split.',
    );
  }
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** Read the committed key index written by scripts/harvest-hf.mjs. */
export function loadKeyIndex(path) {
  if (!existsSync(path)) throw new Error(`loadKeyIndex: ${path} is absent. Run \`node scripts/harvest-hf.mjs\` first.`);
  return JSON.parse(readFileSync(path, 'utf8'));
}
