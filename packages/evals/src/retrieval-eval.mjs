// retrieval-eval.mjs — score a retriever against a labelled gold set.
//
//[[ THE MEASUREMENT THIS FILE REFUSES TO MAKE.
//
//   A retrieval eval is mostly arithmetic — recall@k, MRR, precision@1 — and the arithmetic is not
//   the hard part. The hard part is that EVERY ONE OF THOSE NUMBERS IS COMPUTABLE AGAINST AN INDEX
//   THAT IS EMPTY, and two of them look fine when it is:
//
//     - a negative query (one the corpus genuinely cannot answer) is "correct" when the retriever
//       returns nothing. An empty index returns nothing for every query, so it scores 100% on every
//       negative in the set.
//     - recall@k comes back 0.0, which reads as "the retriever is bad" — a number to tune, not a
//       fault to fix. Nobody looks at the table.
//
//   So a run where any query came back reporting a FAULT — an index with no rows, an index with no
//   vectors, a backend that could not be reached — is not scored at all. `known:false`, with the
//   reason, and no metrics. §AK: a plausible metric can be useless or actively misleading, and a
//   recall number measured against a table nobody filled is both.
//
//   The same rule applies one level down. A negative query answered with an UNCERTAIN miss (the
//   retriever found nothing and could not confirm that means nothing) is not credited as correct;
//   it is counted as unproven, and its presence makes the negative score itself `known:false`. ]]

/** Outcome kinds that mean the retrieval never happened properly. See apps/worker/src/retrieval.ts. */
export const FAULT_KINDS = Object.freeze(['empty-index', 'unembedded-index', 'unavailable']);

/**
 * Structural checks on the gold set itself, because a set that scores 1.0 by being malformed is
 * the same failure as an index that scores 1.0 by being empty.
 */
export function validateGoldSet(gold) {
  if (!Array.isArray(gold)) throw new Error('gold set must be an array');
  const ids = new Set();
  for (const q of gold) {
    if (!q || typeof q.id !== 'string' || !q.id) throw new Error('every gold query needs a string id');
    if (ids.has(q.id)) throw new Error(`duplicate gold query id: ${q.id}`);
    ids.add(q.id);
    if (typeof q.query !== 'string' || !q.query.trim()) throw new Error(`${q.id}: query must be a non-empty string`);
    const expect = q.expectUrls ?? [];
    if (!Array.isArray(expect)) throw new Error(`${q.id}: expectUrls must be an array`);
    if (q.negative === true) {
      // A negative with an expected URL is a contradiction, and it would be scored as a positive by
      // one half of this file and as a negative by the other.
      if (expect.length) throw new Error(`${q.id}: a negative query cannot expect a URL`);
    } else if (!expect.length) {
      throw new Error(`${q.id}: a positive query with no expected URL can never fail`);
    }
  }
  return gold;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Score recorded results.
 *
 * @param {Array<{id:string, negative?:boolean, expectUrls?:string[], hits:Array<{url:string}>, outcome:{kind:string, certain:boolean}}>} results
 * @param {{k?: number}} opts
 */
export function scoreRetrieval(results, opts = {}) {
  const k = opts.k ?? 5;
  if (!Number.isInteger(k) || k < 1) throw new Error(`k must be a positive integer, got ${String(opts.k)}`);
  if (!Array.isArray(results)) throw new Error('results must be an array');

  // An empty run is not a perfect run. `mean([])` is 0 and `0/0` guards turn into 1.0 in half the
  // implementations of this that exist; either way the table gets a number nobody measured.
  if (results.length === 0) {
    return { known: false, why: 'the gold set was empty, so nothing was measured', k, faults: [], positives: null, negatives: null };
  }

  const malformed = results.filter((r) => !r || !r.outcome || typeof r.outcome.kind !== 'string' || typeof r.outcome.certain !== 'boolean');
  if (malformed.length) {
    return {
      known: false,
      why: `${malformed.length} result(s) carried no retrieval outcome, so it is not known whether they searched anything`,
      k,
      faults: [],
      positives: null,
      negatives: null,
    };
  }

  const faults = results.filter((r) => FAULT_KINDS.includes(r.outcome.kind)).map((r) => ({ id: r.id, kind: r.outcome.kind }));
  if (faults.length) {
    //[[ NO METRICS. Not "recall 0.0 because the index is empty" — no number at all. A number here
    //   gets copied into a report and compared against last week's. ]]
    const kinds = [...new Set(faults.map((f) => f.kind))].join(', ');
    return {
      known: false,
      why: `${faults.length} of ${results.length} queries did not reach a working index (${kinds}) — this run measures the index, not the retriever`,
      k,
      faults,
      positives: null,
      negatives: null,
    };
  }

  const positives = results.filter((r) => r.negative !== true);
  const negatives = results.filter((r) => r.negative === true);

  const perQuery = positives.map((r) => {
    const urls = (r.hits ?? []).slice(0, k).map((h) => h.url);
    const expect = new Set(r.expectUrls ?? []);
    const rank = urls.findIndex((u) => expect.has(u)); // 0-based, -1 when absent
    return { id: r.id, rank, hit: rank >= 0, top1: rank === 0, returned: urls.length };
  });

  const negScored = negatives.map((r) => {
    const n = (r.hits ?? []).length;
    if (n > 0) return { id: r.id, verdict: 'wrong' };
    // Nothing came back. Whether that is CORRECT depends on whether the retriever could confirm it
    // searched something — the whole point of `certain`.
    return { id: r.id, verdict: r.outcome.certain ? 'correct' : 'unproven' };
  });
  const unproven = negScored.filter((n) => n.verdict === 'unproven');

  return {
    known: true,
    k,
    faults: [],
    positives: {
      n: positives.length,
      recallAtK: round3(mean(perQuery.map((q) => (q.hit ? 1 : 0)))),
      mrr: round3(mean(perQuery.map((q) => (q.hit ? 1 / (q.rank + 1) : 0)))),
      precisionAt1: round3(mean(perQuery.map((q) => (q.top1 ? 1 : 0)))),
      misses: perQuery.filter((q) => !q.hit).map((q) => q.id),
      perQuery,
    },
    negatives: {
      n: negatives.length,
      // False whenever any negative could not be proven, because an unproven negative and a correct
      // one are the same empty result set.
      known: unproven.length === 0,
      correct: negScored.filter((n) => n.verdict === 'correct').length,
      unproven: unproven.length,
      wrong: negScored.filter((n) => n.verdict === 'wrong').length,
      unprovenIds: unproven.map((n) => n.id),
      wrongIds: negScored.filter((n) => n.verdict === 'wrong').map((n) => n.id),
    },
  };
}

/**
 * Drive a retriever over the gold set and score it.
 *
 * `search(query, k)` must return `{hits: [{url}], outcome: {kind, certain}}` — the shape
 * `searchDocsDetailed` returns. Injected rather than imported so this file measures whatever
 * retriever it is pointed at, including a deliberately empty one.
 */
export async function runRetrievalEval(gold, search, opts = {}) {
  validateGoldSet(gold);
  const k = opts.k ?? 5;
  const results = [];
  for (const q of gold) {
    const res = await search(q.query, k);
    results.push({ id: q.id, negative: q.negative === true, expectUrls: q.expectUrls ?? [], hits: res?.hits ?? [], outcome: res?.outcome });
  }
  return scoreRetrieval(results, { k });
}

/** One line a human can read, which says "not measured" rather than printing a zero. */
export function formatRetrievalScore(score) {
  if (!score.known) return `retrieval: NOT MEASURED — ${score.why}`;
  const p = score.positives;
  const n = score.negatives;
  const neg = n.known ? `${n.correct}/${n.n} negatives held` : `negatives NOT MEASURED (${n.unproven} unproven)`;
  return `retrieval@${score.k}: recall ${p.recallAtK}, MRR ${p.mrr}, P@1 ${p.precisionAt1} over ${p.n} queries; ${neg}`;
}
