// Ranking: pairwise comparison, Elo, leaderboard.
//
// The assertions here are mostly RELATIONSHIPS rather than literals, because a rating is only
// meaningful relative to the other ratings: "clay is 1524" is unfalsifiable, "the model that won
// every comparable game outranks the one that lost them, and the ratings still sum to 3000" is
// not. The literals that do appear are the ones a mistake would move -- indeterminate counts,
// null ratings, null ranks.
import test from 'node:test';
import assert from 'node:assert/strict';

import { pairwise, pairwiseModels, matchesFromPairwise, eloRatings, updateElo, expectedScore, leaderboard } from './leaderboard.mjs';
import { scoreRun } from './metrics.mjs';

const rec = (model, taskId, score, extra = {}) => ({ model, taskId, category: 'c', ok: true, attempts: 1, ms: 100, score, scored: true, usage: { inputTokens: 10, outputTokens: 10 }, checks: [], ...extra });
const deadRec = (model, taskId) => ({ model, taskId, category: 'c', ok: false, attempts: 2, ms: 0, score: null, scored: false, ungradedReason: 'transport_error', error: 'HTTP 500', checks: [] });

// =============================================================================================
// 1. Pairwise
// =============================================================================================

test('a task ungraded on either side is indeterminate, not a loss', () => {
  const a = [rec('a', 't1', 1), rec('a', 't2', 1), deadRec('a', 't3')];
  const b = [rec('b', 't1', 0), rec('b', 't2', 1), rec('b', 't3', 1)];
  const p = pairwise(a, b, { a: 'a', b: 'b' });
  // t3: A's transport died. Counting it as a loss for A would hand B a win it did not earn --
  // and B's score on t3 is 1, so a naive comparison scores it B-wins with full confidence.
  assert.equal(p.wins, 1);
  assert.equal(p.losses, 0, 'a dead transport on A was recorded as a win for B');
  assert.equal(p.ties, 1);
  assert.equal(p.indeterminate, 1);
  assert.equal(p.comparable, 2);
  assert.equal(p.shared, 3);
  assert.deepEqual(p.indeterminateTasks, [{ taskId: 't3', reason: 'a:transport_error' }]);
  assert.equal(p.verdict, 'a');
});

test('nothing comparable is an indeterminate verdict, never a tie', () => {
  const p = pairwise([deadRec('a', 't1')], [rec('b', 't1', 1)], { a: 'a', b: 'b' });
  assert.equal(p.comparable, 0);
  assert.equal(p.verdict, 'indeterminate', 'two models nobody could compare were declared equal');
  assert.equal(p.ties, 0);
});

test('only shared tasks are compared', () => {
  const p = pairwise([rec('a', 't1', 1), rec('a', 't9', 1)], [rec('b', 't1', 0), rec('b', 't8', 0)], { a: 'a', b: 'b' });
  assert.equal(p.shared, 1);
  assert.equal(p.comparable, 1);
  assert.equal(p.wins, 1);
});

test('a difference below epsilon is a tie, not a win', () => {
  const p = pairwise([rec('a', 't1', 0.5 + 1e-15)], [rec('b', 't1', 0.5)], { a: 'a', b: 'b' });
  assert.equal(p.ties, 1);
  assert.equal(p.wins, 0, 'float noise was scored as a victory');
  const coarse = pairwise([rec('a', 't1', 0.55)], [rec('b', 't1', 0.5)], { a: 'a', b: 'b', epsilon: 0.1 });
  assert.equal(coarse.ties, 1, 'a declared epsilon was ignored');
});

test('pairwiseModels produces one comparison per unordered model pair', () => {
  const records = ['a', 'b', 'c'].flatMap((m) => [rec(m, 't1', m === 'a' ? 1 : 0), rec(m, 't2', 1)]);
  const pairs = pairwiseModels({ perTask: records });
  assert.equal(pairs.length, 3);
  assert.deepEqual(pairs.map((p) => `${p.a}v${p.b}`), ['avb', 'avc', 'bvc']);
  assert.equal(pairs.find((p) => p.a === 'b' && p.b === 'c').ties, 2);
});

// =============================================================================================
// 2. Elo
// =============================================================================================

test('one Elo update is exactly zero-sum', () => {
  for (const outcome of ['a', 'b', 'draw']) {
    const [ra, rb] = updateElo(1500, 1500, outcome);
    assert.ok(Math.abs(ra + rb - 3000) < 1e-9, `${outcome}: ${ra} + ${rb} != 3000`);
  }
  const [ra] = updateElo(1500, 1500, 'a');
  const [rb2] = updateElo(1500, 1500, 'b');
  assert.ok(ra > 1500 && rb2 < 1500);
  assert.deepEqual(updateElo(1500, 1500, 'draw'), [1500, 1500], 'a draw between equals must move nothing');
});

test('beating a stronger opponent is worth more than beating a weaker one', () => {
  const [vsStrong] = updateElo(1500, 1900, 'a');
  const [vsWeak] = updateElo(1500, 1100, 'a');
  assert.ok(vsStrong - 1500 > vsWeak - 1500, 'the upset was worth no more than the formality');
  assert.ok(expectedScore(1500, 1900) < 0.5 && expectedScore(1900, 1500) > 0.5);
  assert.ok(Math.abs(expectedScore(1500, 1900) + expectedScore(1900, 1500) - 1) < 1e-12);
});

test('updateElo refuses inputs it cannot compute with', () => {
  assert.throws(() => updateElo(NaN, 1500, 'a'), /finite/);
  assert.throws(() => updateElo(1500, Infinity, 'a'), /finite/);
  assert.throws(() => updateElo(1500, 1500, 'win'), /unknown outcome/);
  assert.throws(() => updateElo(1500, 1500, 'a', 0), /positive/);
});

test('the model that wins every comparable game outranks the one that loses them', () => {
  const pairs = [{ a: 'winner', b: 'loser', wins: 6, losses: 0, ties: 0 }];
  const { rows } = eloRatings(matchesFromPairwise(pairs));
  const w = rows.find((r) => r.model === 'winner');
  const l = rows.find((r) => r.model === 'loser');
  assert.ok(w.rating > l.rating, `${w.rating} !> ${l.rating}`);
  assert.equal(w.rank, 1);
  assert.equal(l.rank, 2);
  assert.ok(Math.abs(w.rating + l.rating - 3000) < 1e-9, 'Elo stopped being zero-sum across a series');
  assert.equal(w.games, 6);
});

test('indeterminate results never become games, so an outage cannot cost a model rating', () => {
  const healthy = pairwise([rec('a', 't1', 1), rec('a', 't2', 1)], [rec('b', 't1', 0), rec('b', 't2', 0)], { a: 'a', b: 'b' });
  const withOutage = pairwise(
    [rec('a', 't1', 1), rec('a', 't2', 1), deadRec('a', 't3'), deadRec('a', 't4')],
    [rec('b', 't1', 0), rec('b', 't2', 0), rec('b', 't3', 1), rec('b', 't4', 1)],
    { a: 'a', b: 'b' },
  );
  const before = eloRatings(matchesFromPairwise([healthy])).rows.find((r) => r.model === 'a').rating;
  const after = eloRatings(matchesFromPairwise([withOutage])).rows.find((r) => r.model === 'a').rating;
  assert.equal(before, after, "a model's rating moved because of tasks it never got a response for");
  assert.equal(withOutage.indeterminate, 2);
});

test('a model with no comparable matches is UNRATED, not seeded at 1500', () => {
  const pairs = [{ a: 'a', b: 'b', wins: 2, losses: 0, ties: 0 }];
  const { rows } = eloRatings(matchesFromPairwise(pairs), { models: ['a', 'b', 'ghost'] });
  const ghost = rows.find((r) => r.model === 'ghost');
  assert.equal(ghost.rated, false);
  assert.equal(ghost.rating, null, 'a model nobody played was published at the average rating');
  assert.equal(ghost.rank, null);
  assert.equal(ghost.reason, 'no_comparable_matches');
  assert.equal(rows[rows.length - 1].model, 'ghost', 'unrated models must sort last');
});

test('elo is deterministic: the same tallies give the same ratings every time', () => {
  const pairs = [
    { a: 'a', b: 'b', wins: 3, losses: 2, ties: 1 },
    { a: 'b', b: 'c', wins: 1, losses: 4, ties: 0 },
    { a: 'a', b: 'c', wins: 2, losses: 2, ties: 2 },
  ];
  const first = eloRatings(matchesFromPairwise(pairs)).rows;
  const second = eloRatings(matchesFromPairwise(pairs)).rows;
  assert.deepEqual(first, second);
  assert.ok(Math.abs(first.reduce((a, r) => a + r.rating, 0) - 4500) < 1e-9, 'three players must still sum to 3 x 1500');
});

test('matchesFromPairwise expands exactly the tallied games and nothing else', () => {
  const m = matchesFromPairwise([{ a: 'x', b: 'y', wins: 2, losses: 1, ties: 1, indeterminate: 7 }]);
  assert.equal(m.length, 4, 'the 7 indeterminate tasks leaked into the match list');
  assert.equal(m.filter((g) => g.outcome === 'a').length, 2);
  assert.equal(m.filter((g) => g.outcome === 'b').length, 1);
  assert.equal(m.filter((g) => g.outcome === 'draw').length, 1);
});

test('malformed matches are skipped rather than crashing or scoring', () => {
  const { rows } = eloRatings([{ a: 'x', b: 'x', outcome: 'a' }, { a: 'x', outcome: 'a' }, { a: 'x', b: 'y', outcome: 'nonsense' }, null]);
  assert.deepEqual(rows.filter((r) => r.rated), []);
});

// =============================================================================================
// 3. Leaderboard
// =============================================================================================

function scoredByModel(records) {
  return scoreRun({ perTask: records }).byModel;
}

test('a model whose metric is UNMEASURABLE is unranked, not ranked below a model that scored 0', () => {
  const records = [
    rec('good', 't1', 1),
    rec('bad', 't1', 0),
    deadRec('unmeasured', 't1'),
  ];
  const { rows } = leaderboard(scoredByModel(records), { metric: 'passRate' });
  assert.deepEqual(rows.map((r) => r.model), ['good', 'bad', 'unmeasured']);
  assert.equal(rows[1].value, 0, 'the model that answered badly must still carry its real 0');
  assert.equal(rows[2].value, null, 'the model nobody could measure was given a number');
  assert.equal(rows[2].rank, null, 'an unmeasured model was assigned a rank');
  assert.equal(rows[2].reason, 'all_records_ungraded');
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, null]);

  // THE ORDER ABOVE WAS A COINCIDENCE OF THESE NAMES. With the availability clause
  // `if (x.available !== y.available) return x.available ? -1 : 1` deleted, the comparator falls
  // through to `y.value - x.value`, and `null - 0` is 0 — a TIE — so the order is decided by
  // whatever the sort does with equal keys. 'bad' happens to precede 'unmeasured', so the
  // assertion passed against a comparator that had stopped separating measured from unmeasured
  // at all. Measured: removing that clause left the case above green.
  //
  // Adversarial names put the tie the other way, which is the whole finding: a model NOBODY COULD
  // MEASURE is presented above one that was measured and genuinely scored zero. On a leaderboard
  // that is the worst possible direction for the error — the unmeasured model looks better than
  // the bad one, and a reader picks it.
  const adversarial = [rec('good', 't1', 1), deadRec('aaa-unmeasured', 't1'), rec('zzz-scored-zero', 't1', 0)];
  const worst = leaderboard(scoredByModel(adversarial), { metric: 'passRate' });
  assert.deepEqual(
    worst.rows.map((r) => r.model),
    ['good', 'zzz-scored-zero', 'aaa-unmeasured'],
    'a model that could not be measured must sort BELOW one that really scored 0, whatever they are called',
  );
  assert.equal(worst.rows[2].rank, null);
  assert.equal(worst.rows[1].rank, 2, 'the genuine zero keeps a real rank');
});

test('a lower-is-better metric ranks in the other direction', () => {
  const records = [rec('fast', 't1', 1, { ms: 50 }), rec('slow', 't1', 1, { ms: 5000 })];
  const byQuality = leaderboard(scoredByModel(records), { metric: 'passRate' });
  const byLatency = leaderboard(scoredByModel(records), { metric: 'meanLatencyMs' });
  assert.equal(byLatency.direction, 'lower');
  assert.equal(byLatency.rows[0].model, 'fast', 'the slower model was ranked first on latency');
  // Same two models, same run: the ordering must come from the metric's direction, not the file.
  assert.deepEqual(byQuality.rows.map((r) => r.value), [1, 1]);
});

test('ties break by model name so the table is stable between runs', () => {
  const records = [rec('zeta', 't1', 1), rec('alpha', 't1', 1), rec('mid', 't1', 1)];
  const rows = leaderboard(scoredByModel(records), { metric: 'passRate' }).rows;
  assert.deepEqual(rows.map((r) => r.model), ['alpha', 'mid', 'zeta']);
});

test('an unknown metric is a thrown error, not an empty board', () => {
  assert.throws(() => leaderboard({}, { metric: 'vibes' }), /unknown metric/);
});
