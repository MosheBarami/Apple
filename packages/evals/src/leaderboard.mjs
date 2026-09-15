// ============================================================================================
// Ranking: pairwise comparison, Elo, and the leaderboard that reads off them.
//
// Ranking is where "a grader that could not grade" does its quietest damage. A model that timed
// out on a task did not LOSE that task, and a metric that was never measured is not last place.
// Both of those are the same mistake as scoring an outage 0, one layer up — and unlike a score,
// a rank has no units, so the error leaves no trace once it is printed.
//
// So, three rules, each enforced by a test in leaderboard.test.mjs:
//   1. A task that is ungraded on EITHER side is `indeterminate`. It is counted and reported,
//      and it is not a win, a loss or a draw for anybody.
//   2. A model with no comparable matches is UNRATED (`rating: null`), not seeded-1500. 1500 is
//      the rating of an average player, and "we never played them" is not that claim.
//   3. A model whose metric is unavailable is UNRANKED (`rank: null`) and sorts after every
//      ranked model — it does not sort next to a model that genuinely scored 0.
// ============================================================================================
import { classifyRecord } from './metrics.mjs';
import { METRIC_DEFS } from './metrics.mjs';

const EPSILON = 1e-9;

/**
 * Compare two sets of per-task records task by task.
 *
 * @param {object[]} aRecords
 * @param {object[]} bRecords
 * @param {{a?: string, b?: string, epsilon?: number}} [opts] labels + the margin below which
 *   two scores are called a tie (default 1e-9: a difference smaller than float noise is not a win)
 */
export function pairwise(aRecords, bRecords, opts = {}) {
  const label = { a: opts.a ?? 'A', b: opts.b ?? 'B' };
  const eps = Number.isFinite(opts.epsilon) && opts.epsilon >= 0 ? opts.epsilon : EPSILON;
  const byIdA = new Map((aRecords ?? []).map((r) => [r?.taskId, r]));
  const byIdB = new Map((bRecords ?? []).map((r) => [r?.taskId, r]));
  const shared = [...byIdA.keys()].filter((id) => id != null && byIdB.has(id)).sort();

  const details = [];
  let wins = 0;
  let losses = 0;
  let ties = 0;
  const indeterminate = [];
  for (const taskId of shared) {
    const ra = byIdA.get(taskId);
    const rb = byIdB.get(taskId);
    const ca = classifyRecord(ra);
    const cb = classifyRecord(rb);
    if (!ca.graded || !cb.graded) {
      const reason = !ca.graded && !cb.graded ? `both:${ca.reason}/${cb.reason}` : !ca.graded ? `a:${ca.reason}` : `b:${cb.reason}`;
      indeterminate.push({ taskId, reason });
      details.push({ taskId, outcome: 'indeterminate', reason });
      continue;
    }
    const d = ra.score - rb.score;
    if (d > eps) {
      wins += 1;
      details.push({ taskId, outcome: 'a', a: ra.score, b: rb.score });
    } else if (d < -eps) {
      losses += 1;
      details.push({ taskId, outcome: 'b', a: ra.score, b: rb.score });
    } else {
      ties += 1;
      details.push({ taskId, outcome: 'tie', a: ra.score, b: rb.score });
    }
  }
  const comparable = wins + losses + ties;
  return {
    a: label.a,
    b: label.b,
    shared: shared.length,
    comparable,
    wins,
    losses,
    ties,
    indeterminate: indeterminate.length,
    indeterminateTasks: indeterminate,
    // With nothing comparable there is no verdict to give. Not a tie: a tie is a measured
    // statement that the two performed alike.
    verdict: comparable === 0 ? 'indeterminate' : wins > losses ? 'a' : losses > wins ? 'b' : 'tie',
    details,
  };
}

/** Every unordered model pair inside one run's perTask records, compared task by task. */
export function pairwiseModels(run, opts = {}) {
  const records = Array.isArray(run) ? run : (run?.perTask ?? []);
  const models = opts.models ?? [...new Set(records.map((r) => r?.model).filter((m) => typeof m === 'string'))].sort();
  const out = [];
  for (let i = 0; i < models.length; i++)
    for (let j = i + 1; j < models.length; j++)
      out.push(pairwise(records.filter((r) => r.model === models[i]), records.filter((r) => r.model === models[j]), { a: models[i], b: models[j], epsilon: opts.epsilon }));
  return out;
}

/** Elo expected score for A against B. */
export function expectedScore(ra, rb) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

/**
 * One Elo update. Zero-sum by construction: whatever A gains, B loses, exactly.
 * @param {number} ra @param {number} rb
 * @param {'a'|'b'|'draw'} outcome
 */
export function updateElo(ra, rb, outcome, k = 24) {
  if (!Number.isFinite(ra) || !Number.isFinite(rb)) throw new Error('updateElo: ratings must be finite');
  if (!Number.isFinite(k) || k <= 0) throw new Error('updateElo: k must be a positive number');
  const sa = outcome === 'a' ? 1 : outcome === 'b' ? 0 : outcome === 'draw' ? 0.5 : null;
  if (sa === null) throw new Error(`updateElo: unknown outcome "${outcome}" (expected a|b|draw)`);
  const ea = expectedScore(ra, rb);
  const delta = k * (sa - ea);
  return [ra + delta, rb - delta];
}

/**
 * Expand pairwise tallies into individual games, in a DETERMINISTIC order.
 *
 * Elo is path-dependent, so the expansion order is part of the result. Interleaving
 * win/loss/draw (rather than replaying all the wins first) keeps a lopsided-but-close record
 * from swinging the rating further than the same record in a different order would.
 * Indeterminate tasks are not expanded into anything: they were never played.
 */
export function matchesFromPairwise(pairs) {
  const matches = [];
  for (const p of pairs) {
    const seq = [];
    for (let i = 0; i < p.wins; i++) seq.push('a');
    for (let i = 0; i < p.losses; i++) seq.push('b');
    for (let i = 0; i < p.ties; i++) seq.push('draw');
    // interleave: take from the three buckets round-robin
    const buckets = [seq.filter((s) => s === 'a'), seq.filter((s) => s === 'b'), seq.filter((s) => s === 'draw')];
    let more = true;
    while (more) {
      more = false;
      for (const b of buckets)
        if (b.length) {
          matches.push({ a: p.a, b: p.b, outcome: b.shift() });
          more = true;
        }
    }
  }
  return matches;
}

/**
 * Elo ratings from a list of matches.
 *
 * A model that appears in no comparable match is reported UNRATED. Handing it the 1500 seed
 * would publish the rating of an average player for a model nobody played.
 *
 * @param {Array<{a: string, b: string, outcome: 'a'|'b'|'draw'}>} matches
 * @param {{k?: number, seed?: number, models?: string[]}} [opts]
 */
export function eloRatings(matches, opts = {}) {
  const k = Number.isFinite(opts.k) && opts.k > 0 ? opts.k : 24;
  const seed = Number.isFinite(opts.seed) ? opts.seed : 1500;
  const rating = new Map();
  const games = new Map();
  const known = new Set(opts.models ?? []);
  for (const m of matches ?? []) {
    if (!m || typeof m.a !== 'string' || typeof m.b !== 'string' || m.a === m.b) continue;
    if (m.outcome !== 'a' && m.outcome !== 'b' && m.outcome !== 'draw') continue;
    known.add(m.a);
    known.add(m.b);
    if (!rating.has(m.a)) rating.set(m.a, seed);
    if (!rating.has(m.b)) rating.set(m.b, seed);
    const [na, nb] = updateElo(rating.get(m.a), rating.get(m.b), m.outcome, k);
    rating.set(m.a, na);
    rating.set(m.b, nb);
    games.set(m.a, (games.get(m.a) ?? 0) + 1);
    games.set(m.b, (games.get(m.b) ?? 0) + 1);
  }
  const rows = [...known].sort().map((model) => {
    const n = games.get(model) ?? 0;
    return n === 0
      ? { model, rating: null, games: 0, rated: false, reason: 'no_comparable_matches' }
      : { model, rating: rating.get(model), games: n, rated: true };
  });
  rows.sort((x, y) => (x.rated === y.rated ? (x.rated ? y.rating - x.rating || x.model.localeCompare(y.model) : x.model.localeCompare(y.model)) : x.rated ? -1 : 1));
  let rank = 0;
  for (const r of rows) r.rank = r.rated ? ++rank : null;
  return { rows, k, seed };
}

/**
 * Rank models on one metric.
 *
 * @param {Record<string, {metrics: Record<string, object>}>} byModel  scoreRun().byModel
 * @param {{metric?: string}} [opts]
 * @returns {{metric, rows: Array<{rank, model, value, available, reason, n}>}}
 */
export function leaderboard(byModel, opts = {}) {
  const metric = opts.metric ?? 'passRate';
  const def = METRIC_DEFS[metric];
  if (!def) throw new Error(`leaderboard: unknown metric "${metric}"`);
  const rows = Object.entries(byModel ?? {}).map(([model, scored]) => {
    const met = scored?.metrics?.[metric];
    if (!met || !met.available) {
      return { model, value: null, available: false, reason: met?.reason ?? 'metric_not_computed', n: met?.n ?? 0, rank: null };
    }
    return { model, value: met.value, available: true, reason: null, n: met.n, rank: null };
  });
  rows.sort((x, y) => {
    if (x.available !== y.available) return x.available ? -1 : 1; // unavailable always last
    if (!x.available) return x.model.localeCompare(y.model);
    const d = def.direction === 'higher' ? y.value - x.value : x.value - y.value;
    return Math.abs(d) > EPSILON ? d : x.model.localeCompare(y.model);
  });
  let rank = 0;
  for (const r of rows) r.rank = r.available ? ++rank : null;
  return { metric, direction: def.direction, unit: def.unit, rows };
}
