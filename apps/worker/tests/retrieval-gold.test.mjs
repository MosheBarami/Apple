// The gold set, run against the REAL 8,326-chunk corpus with the production retrieval functions.
//
// WHAT THIS MEASURES, EXACTLY — and the limit is the point, not a caveat.
//
// Production retrieval is hybrid: Vectorize for semantics, D1 FTS5 for keywords, fused. Neither
// backend exists offline (one needs an embedding provider, the other needs SQLite's bm25), so what
// runs here is a KEYWORD-ONLY retriever built over the same corpus text, driving the same
// `keywordQuery`, `rrfFuse`, `rerank`, `classifyRetrieval` and `buildCitations` the worker uses.
//
// So the recall number below is a floor for the keyword half, not a measurement of the shipped
// hybrid. Reporting it as "retrieval recall" would be the same species of claim this module exists
// to stop: a number measured on one thing and captioned as another. The lexical scorer standing in
// for bm25 is written here, in the test, for exactly that reason — it is fixture, not product.
//
// What it DOES prove, and nothing else can:
//   - the gold set's expected pages are actually in the corpus (a gold set whose answers are absent
//     measures the gold set, not the retriever);
//   - the production query builder and reranker, over real documentation text, put the right page
//     in the top 5 for real questions;
//   - and the eval REFUSES TO SCORE the same queries against an empty index, instead of reporting
//     the 0.0 recall and the perfect negative score that an empty index produces.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { runRetrievalEval, formatRetrievalScore } from '../../../packages/evals/src/retrieval-eval.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const REPO = join(WORKER, '..', '..');
const OUT = join(tmpdir(), `apple-gold-${process.pid}.mjs`);

await esbuild.build({ entryPoints: [join(WORKER, 'src', 'retrieval.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: OUT });
const R = await import(pathToFileURL(OUT).href);
process.on('exit', () => rmSync(OUT, { force: true }));

const GOLD = JSON.parse(readFileSync(join(REPO, 'packages', 'evals', 'data', 'retrieval-gold.json'), 'utf8')).queries;

// THE ONE TEST IN THIS REPOSITORY THAT CANNOT BE WITNESSED, and the reason is worth stating.
//
// Everything else that cited `packages/corpus/data/chunks.jsonl` cited ADDRESSES — a docSlug, a
// vecId, a url — and addresses fit in a tracked file (see packages/corpus/src/chunk-witness.mjs).
// This file needs the TEXT: it builds a keyword index over all 8,326 chunks and measures recall
// through it. 80% of the corpus is that text, 8.6 MB of it, and an index over a sample is a
// different and easier retrieval problem wearing the same number. There is no small stand-in.
//
// So this file measures where the corpus exists and SAYS SO where it does not, which is the same
// treatment packages/evals/src/luau-ast.test.mjs already gives the same corpus. Until this commit
// the read was unconditional: on the runner it threw ENOENT, took @golem/worker down, and every
// package behind it went unrun — an outcome that told nobody that retrieval was unmeasured.
//
// ZERO IS THE DISCRIMINATOR AND NOTHING ELSE IS. A corpus that is present but small still fails
// the `> 1000` floor below; only a corpus that is not there at all is skipped, and the skip prints.
const HAS_CORPUS = existsSync(join(REPO, 'packages', 'corpus', 'data', 'chunks.jsonl'));
const CORPUS = HAS_CORPUS
  ? readFileSync(join(REPO, 'packages', 'corpus', 'data', 'chunks.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
  : [];

/** True when there is nothing to measure, after saying so in the test's own output. */
function unmeasured(t) {
  if (HAS_CORPUS) return false;
  t.diagnostic('packages/corpus/data/chunks.jsonl is not in this checkout — it is a 10 MB build '
    + 'artefact and this file needs its TEXT, which no tracked witness can stand in for. NOTHING '
    + 'was measured by this test here. Build it with `pnpm --filter @golem/corpus chunk`.');
  return true;
}

/**
 * A keyword index over the corpus, standing in for FTS5 bm25.
 *
 * Deliberately simple and deliberately NOT production: idf-weighted term overlap with a title
 * bonus. It exists so the production query builder and reranker can be driven over real text; it
 * is not a claim about how SQLite ranks.
 */
function buildIndex(chunks) {
  const postings = new Map(); // term -> array of doc indexes
  const docTerms = [];
  chunks.forEach((c, i) => {
    const ts = R.terms(`${c.title}\n${c.text}`);
    docTerms.push(new Set(ts));
    for (const t of ts) {
      const list = postings.get(t);
      if (list) list.push(i);
      else postings.set(t, [i]);
    }
  });
  const N = chunks.length;

  return {
    size: N,
    /** @returns {{hits: Array, outcome: object, citations: Array}} */
    search(query, k = 5) {
      if (!R.isSearchableQuery(query)) {
        return { hits: [], outcome: R.classifyRetrieval({ hits: 0, vecOk: true, ftsOk: true, queryUsable: false, census: null }), citations: [] };
      }
      const kw = R.keywordQuery(query);
      const scores = new Map();
      for (const t of kw?.terms ?? []) {
        const list = postings.get(t);
        if (!list || !list.length) continue;
        const idf = Math.log(1 + N / list.length);
        for (const i of list) {
          const bonus = R.terms(chunks[i].title).includes(t) ? 1.5 : 1;
          scores.set(i, (scores.get(i) ?? 0) + idf * bonus);
        }
      }
      const ordered = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 16);
      const fused = R.rrfFuse([{ ids: ordered.map(([i]) => String(i)) }]);
      // `semantic: false` throughout — this harness has no vector half, which is exactly the
      // condition `dropIrrelevant` is hardest on, and exactly the condition an unembedded index is
      // in.
      const ranked = R.dropIrrelevant(
        query,
        R.rerank(
          query,
          ordered.map(([i]) => ({ id: String(i), title: chunks[i].title, text: chunks[i].text, url: chunks[i].url, fusedScore: fused.get(String(i)) ?? 0, semantic: false })),
        ),
      ).slice(0, k);
      // This harness's retriever HAS one backend and it answered; `census` is the real corpus.
      const outcome = R.classifyRetrieval({
        hits: ranked.length,
        vecOk: true,
        ftsOk: true,
        queryUsable: true,
        census: { chunks: N, embedded: chunks.filter((c) => c.embed).length },
      });
      return { hits: ranked, outcome, citations: R.buildCitations(ranked) };
    },
  };
}

const INDEX = buildIndex(CORPUS);

/** The same retriever over a corpus nobody filled. Same code, no rows. */
const EMPTY = buildIndex([]);

/* ========================================================================================== */

test('every page the gold set expects is actually in the corpus', (t) => {
  if (unmeasured(t)) return;
  // A gold set whose answers are absent measures the gold set. Recall would be 0 for a reason that
  // has nothing to do with retrieval, and the fix would be applied to the wrong thing.
  const urls = new Set(CORPUS.map((c) => c.url));
  const missing = GOLD.flatMap((q) => (q.expectUrls ?? []).filter((u) => !urls.has(u)));
  assert.deepEqual(missing, [], `expected pages that do not exist in the corpus: ${missing.join(', ')}`);
  assert.ok(CORPUS.length > 1000, `the corpus fixture is suspiciously small: ${CORPUS.length} chunks`);
});

test('the production query builder and reranker find the right page for real questions', async (t) => {
  if (unmeasured(t)) return;
  const score = await runRetrievalEval(GOLD, async (q, k) => INDEX.search(q, k), { k: 5 });
  console.log(`[gold] keyword-half only, ${INDEX.size} chunks — ${formatRetrievalScore(score)}`);
  if (score.positives?.misses?.length) console.log(`[gold] missed: ${score.positives.misses.join(', ')}`);

  assert.equal(score.known, true, score.why ?? '');

  //[[ WHAT WAS MEASURED, 2026-09-15, on 8,326 chunks: recall@5 0.333, MRR 0.333, P@1 0.333,
  //   negatives 3/3 held, 0 wrong. The floors below sit just under those, so a regression fails and
  //   a corpus refresh does not.
  //
  //   TWO THIRDS OF THE QUESTIONS MISS, and the reason is worth writing down rather than tuning
  //   away. Every miss is a vocabulary gap the keyword half cannot cross: `g-walkspeed` asks about
  //   a character that "walks" and the page says `WalkSpeed`, one token; `g-tween` asks to
  //   "smoothly animate" and the page says "interpolate"; `g-weld` asks to "attach two parts" and
  //   the page is called WeldConstraint. No amount of reranking fixes that — bridging it is the
  //   entire job of the embedding half, and this number is the size of the hole it fills.
  //
  //   Which is also why `unembedded-index` had to become its own retrieval outcome rather than
  //   folding into a miss: an index with rows and no vectors is a retriever operating at roughly
  //   this recall while looking, from the outside, exactly like a healthy one. ]]
  assert.ok(score.positives.recallAtK >= 0.3, `recall@5 fell to ${score.positives.recallAtK}`);
  assert.ok(score.positives.mrr >= 0.28, `MRR fell to ${score.positives.mrr}`);
  assert.ok(score.positives.precisionAt1 >= 0.25, `P@1 fell to ${score.positives.precisionAt1}`);

  // The negatives are the assertion that the relevance floor is doing something. Before it, all
  // three questions — about Kubernetes, PostgreSQL and SwiftUI — came back with five ranked Roblox
  // documentation passages apiece, ready to be handed to a model as "official documentation".
  assert.equal(score.negatives.known, true, 'the negatives must be measurable, not merely empty');
  assert.equal(score.negatives.wrong, 0, `${score.negatives.wrongIds.join(', ')} came back answered by a corpus that cannot answer them`);
});

test('THE SAME GOLD SET AGAINST AN EMPTY INDEX IS REFUSED, not scored', (t) => {
  if (unmeasured(t)) return;
  // THE CLAIM. The identical code, the identical queries, zero rows. Left to the arithmetic this
  // run reports recall 0.0 and 3/3 negatives held — a plausible, publishable, entirely fictional
  // row in a report.
  return runRetrievalEval(GOLD, async (q, k) => EMPTY.search(q, k), { k: 5 }).then((score) => {
    assert.equal(score.known, false, 'an empty index produced a retrieval score');
    assert.equal(score.positives, null, 'a recall number was published for an index with no rows');
    assert.equal(score.negatives, null, 'the negatives were credited to an index that answers nothing');
    assert.match(score.why, /empty-index/);
    assert.match(formatRetrievalScore(score), /NOT MEASURED/);
  });
});

test('a real question and an unanswerable one are told apart by more than the hit count', async (t) => {
  if (unmeasured(t)) return;
  const real = INDEX.search('how do I change how fast a player character walks', 5);
  const absurd = INDEX.search('kubernetes horizontal pod autoscaler custom metrics adapter', 5);
  assert.ok(real.hits.length > 0);
  assert.equal(absurd.hits.length, 0, 'a question about Kubernetes came back with Roblox documentation');
  assert.equal(absurd.outcome.kind, 'miss');
  assert.equal(absurd.outcome.certain, true, 'a miss over a populated corpus is a fact and should say so');
  // ...and against the empty corpus, the SAME absurd query reports something different.
  assert.notEqual(EMPTY.search('kubernetes horizontal pod autoscaler', 5).outcome.kind, absurd.outcome.kind);
});

test('the hits come back with citations a reader can follow', async (t) => {
  if (unmeasured(t)) return;
  const res = INDEX.search('smoothly animate a part from one position to another over time', 5);
  assert.ok(res.citations.length > 0);
  assert.deepEqual(res.citations.map((c) => c.n), res.citations.map((_, i) => i + 1), 'citation numbers must be 1..n with no gaps');
  for (const c of res.citations) assert.match(c.url, /^https:\/\//);
});
