#!/usr/bin/env node
/**
 * DID INDEXING THE CUSTOMER'S WORDS ACTUALLY MOVE THE DOOR?
 *
 * knowledge-reach.json recorded the defect: 80 verified modules, retrieval only, limit 5 — a
 * contract-phrased query finds its module 80/80 at rank one, a customer-phrased query finds it
 * 49/80. This script scores four variants on the SAME 80+80 queries so the numbers sit next to that
 * baseline and next to the three other approaches being built in parallel.
 *
 * WHAT IS SEPARATED, AND WHY THAT IS THE POINT. Two things are wrong at once — the index holds the
 * wrong TEXT, and the SCORER ranks 80 documents on a ten-point integer scale with substring
 * matching. Reporting a combined win teaches nobody which half earned it and hands the next person
 * a change they cannot take apart. So:
 *
 *   shipped            what production does today                      (neither fix)
 *   shipped+needText   the shipped scorer, with the generated customer  (DATA only)
 *                      vocabulary appended to each module's haystack
 *   bm25f-noNeed       BM25F with the need field weighted zero          (SCORER only)
 *   bm25f+need         BM25F over id/family/contract/need               (both)
 *
 * THE REIMPLEMENTATION IS GUARDED. `shipped+needText` cannot call the Worker's own function, because
 * that function has no seam for extra text — so the scorer is retyped here. A retyped scorer is a
 * fiction that resembles production until something proves otherwise, so it is run with NO extra
 * text first and required to return byte-identical shortlists to the Worker's own
 * searchVerifiedModules on all 160 queries. If it does not, this script exits non-zero and reports
 * nothing.
 *
 * THE BASELINE IS GUARDED TOO. If the Worker's own code does not reproduce 49/80 and 80/80, the
 * ground under every comparison has moved and the run aborts rather than quietly reporting numbers
 * against a different baseline than the one everyone else is citing.
 *
 * Spends nothing: no model call, no network. The generation that BUILT the index did spend, and
 * packages/training/data/need-index.json records exactly what.
 *
 * Run: node packages/training/src/measure-need-index.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CUSTOMER_QUERIES } from './customer-queries.mjs';
import { promptFor, vocabularyOf } from './build-need-index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const RUNS = resolve(HERE, '..', 'runs');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };

/** The recorded run this must reproduce before any comparison means anything. */
const BASELINE = { customerTop1: 49, customerInTop5: 67, contractTop1: 80, contractInTop5: 80, n: 80, limit: 5 };
const LIMIT = 5;

// ---------------------------------------------------------------------------
// The Worker's own code, bundled — not a copy of it.
// ---------------------------------------------------------------------------
function loadWorker() {
  const dir = mkdtempSync(join(tmpdir(), 'need-index-'));
  const entry = join(dir, 'entry.ts');
  const out = join(dir, 'bits.mjs');
  const S = join(REPO, 'apps', 'worker', 'src');
  writeFileSync(entry, [
    `export { searchVerifiedModules } from ${JSON.stringify(join(S, 'verified-modules.ts'))};`,
    `export { makeRanker, NEED_INDEX_COVERAGE, DEFAULT_WEIGHTS } from ${JSON.stringify(join(S, 'need-index-search.ts'))};`,
    `export { default as CORPUS } from ${JSON.stringify(join(REPO, 'packages/corpus/data/verified-modules.json'))};`,
    `export { default as NEED } from ${JSON.stringify(join(REPO, 'packages/training/data/need-index.json'))};`,
  ].join('\n'));
  execFileSync(join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out], { stdio: 'pipe' });
  return { mod: import(out), bundleBytes: statSync(out).size };
}

// ---------------------------------------------------------------------------
// The shipped scorer, retyped so extra text can be injected. Guarded above.
// ---------------------------------------------------------------------------
const SHIPPED_STOP = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'is', 'be', 'that',
  'with', 'i', 'need', 'want', 'make', 'build', 'create', 'write', 'module', 'script', 'luau', 'roblox', 'my', 'me']);
const SHIPPED_SYNONYMS = {
  cooldown: ['delay', 'elapsed', 'wait', 'recharge', 'often', 'spam', 'rate'],
  often: ['delay', 'elapsed', 'cooldown'],
  spam: ['delay', 'cooldown', 'rate'],
  wait: ['delay', 'elapsed', 'cooldown'],
  rank: ['leaderboard', 'sort', 'order'],
  money: ['currency', 'cash', 'coins', 'balance', 'price'],
  buy: ['purchase', 'price', 'cost'],
  save: ['store', 'persist', 'profile'],
  xp: ['experience', 'level'],
  experience: ['xp', 'level'],
  bag: ['inventory', 'capacity', 'slot'],
  percent: ['percentage', 'normalize', 'normalization', 'scale'],
};
const shippedStem = (w) => (w.length > 4 ? w.slice(0, Math.max(4, w.length - 3)) : w);
function shippedTerms(q) {
  const base = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !SHIPPED_STOP.has(w));
  const out = new Set();
  for (const w of base) { out.add(w); for (const s of SHIPPED_SYNONYMS[w] ?? []) out.add(s); }
  return [...out];
}
/** `extra(m)` returns text appended to the module's haystack; '' reproduces production exactly. */
function shippedSearch(modules, query, limit, extra = () => '') {
  const want = shippedTerms(query);
  if (!want.length) return [];
  const scored = modules.map((m) => {
    const id = m.id.toLowerCase();
    const hay = `${id} ${m.family} ${m.contract} ${extra(m)}`.toLowerCase();
    let score = 0;
    for (const w of want) {
      const st = shippedStem(w);
      if (id.includes(w)) score += 3;
      else if (m.family.toLowerCase().includes(w)) score += 2;
      else if (hay.includes(w)) score += 1;
      else if (st !== w && hay.includes(st)) score += 1;
    }
    return { m, score };
  }).filter((r) => r.score > 0);
  scored.sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));
  return scored.slice(0, limit).map((r) => r.m);
}

// ---------------------------------------------------------------------------
const pct = (k, n) => Math.round((k / n) * 100);

/** Score one variant over one query set. `rank` returns ALL scored modules, best first. */
function measure(setName, pairs, rank) {
  const rows = [];
  let top1 = 0, inTop = 0, empty = 0, tiedAtTop = 0, tiedAndCorrectInside = 0;
  for (const [id, query] of pairs) {
    const all = rank(query);
    const ids = all.map((r) => r.id ?? r.m?.id ?? r);
    const scores = all.map((r) => (typeof r.score === 'number' ? r.score : null));
    const shortlist = ids.slice(0, LIMIT);
    const rank1 = ids.indexOf(id);
    if (!ids.length) empty++;
    if (shortlist[0] === id) top1++;
    if (shortlist.includes(id)) inTop++;
    let tie = null;
    if (scores[0] !== null && ids.length) {
      const best = scores[0];
      const tied = ids.filter((_, i) => scores[i] === best);
      if (tied.length > 1) { tiedAtTop++; if (tied.includes(id)) tiedAndCorrectInside++; tie = tied.length; }
    }
    rows.push({
      id, query,
      rank: rank1 === -1 ? null : rank1 + 1,
      top1: shortlist[0] === id,
      inTop: shortlist.includes(id),
      returned: shortlist,
      tiedAtTop: tie,
      recalledAnywhere: rank1 !== -1,
    });
  }
  const n = pairs.length;
  return {
    set: setName, n, limit: LIMIT,
    top1, top1Pct: pct(top1, n),
    inTop5: inTop, inTop5Pct: pct(inTop, n),
    wrongAtOne: n - top1,
    recallAnywhere: rows.filter((r) => r.recalledAnywhere).length,
    emptyResult: empty,
    tiedAtTop, tiedAtTopWithCorrectInside: tiedAndCorrectInside,
    rows,
  };
}

async function main() {
  const { mod, bundleBytes } = loadWorker();
  const W = await mod;
  const modules = W.CORPUS.modules;
  const need = W.NEED.modules ?? {};

  const customer = modules.map((m) => [m.id, CUSTOMER_QUERIES[m.id]]);
  const contract = modules.map((m) => [m.id, m.contract]);
  const missingQuery = customer.filter(([, q]) => !q).map(([id]) => id);
  if (missingQuery.length) { console.error('no customer query for:', missingQuery.join(', ')); process.exit(2); }

  // --- guard 1: the Worker's own code still reproduces the recorded baseline -----------------
  const baseCustomer = measure('customer', customer, (q) => W.searchVerifiedModules(q, LIMIT).map((m) => ({ id: m.id })));
  const baseContract = measure('contract', contract, (q) => W.searchVerifiedModules(q, LIMIT).map((m) => ({ id: m.id })));
  const drift = [];
  if (baseCustomer.top1 !== BASELINE.customerTop1) drift.push(`customer top1 ${baseCustomer.top1} != ${BASELINE.customerTop1}`);
  if (baseCustomer.inTop5 !== BASELINE.customerInTop5) drift.push(`customer inTop5 ${baseCustomer.inTop5} != ${BASELINE.customerInTop5}`);
  if (baseContract.top1 !== BASELINE.contractTop1) drift.push(`contract top1 ${baseContract.top1} != ${BASELINE.contractTop1}`);
  if (drift.length) {
    console.error('BASELINE DRIFT — the shipped code no longer reproduces knowledge-reach.json:\n  ' + drift.join('\n  '));
    console.error('Every comparison below would be against a different baseline than the one being cited. Aborting.');
    process.exit(3);
  }

  // --- guard 1b: the index in the bundle is the one the current prompt produces ---------------
  //[[ A prompt edited after the index was generated leaves the blindness argument attached to a
  //   prompt that produced nothing. The hash is recorded at generation time for exactly this. ]]
  const wantHash = createHash('sha256').update(promptFor(modules[0])).digest('hex').slice(0, 16);
  if (W.NEED.settings?.promptHash !== wantHash) {
    console.error(`STALE INDEX — need-index.json was generated by prompt ${W.NEED.settings?.promptHash}, build-need-index.mjs now holds ${wantHash}. Regenerate before measuring.`);
    process.exit(5);
  }

  // --- guard 2: the retyped scorer equals the Worker's, with no extra text --------------------
  const mismatches = [];
  for (const [id, q] of [...customer, ...contract]) {
    const a = W.searchVerifiedModules(q, LIMIT).map((m) => m.id).join('|');
    const b = shippedSearch(modules, q, LIMIT).map((m) => m.id).join('|');
    if (a !== b) mismatches.push({ id, worker: a, retyped: b });
  }
  if (mismatches.length) {
    console.error(`RETYPED SCORER DIVERGES from the Worker's own on ${mismatches.length}/160 queries. Aborting.`);
    console.error(JSON.stringify(mismatches.slice(0, 3), null, 1));
    process.exit(4);
  }

  // --- the four variants ----------------------------------------------------------------------
  const needText = (m) => (need[m.id]?.lines ?? []).join(' ');
  const bm25 = W.makeRanker();
  const bm25NoNeed = W.makeRanker({ weights: { need: 0 } });
  const needAlone = W.makeRanker({ weights: { id: 0, family: 0, contract: 0, need: 1 } });

  const variants = {
    shipped: (q) => W.searchVerifiedModules(q, modules.length).map((m) => ({ id: m.id })),
    'shipped+needText': (q) => shippedSearch(modules, q, modules.length, needText).map((m) => ({ id: m.id })),
    'bm25f-noNeed': (q) => bm25NoNeed.rank(q).map((r) => ({ id: r.m.id, score: r.score })),
    'bm25f+need': (q) => bm25.rank(q).map((r) => ({ id: r.m.id, score: r.score })),
    //[[ The generated vocabulary ALONE, with the contract switched off. Not a candidate for
    //   production — it answers a different question: how much of the customer's sentence the model
    //   guessed correctly without the module text propping it up. ]]
    'needOnly': (q) => needAlone.rank(q).map((r) => ({ id: r.m.id, score: r.score })),
    //[[ THE TWO SENTENCES THE BLIND GENERATOR AND THE HAND-WRITTEN BENCHMARK BOTH LANDED ON.
    //   build-need-index.test.mjs names them: stamina-regen and visible-ui-rows each have one
    //   generated line sharing a long span with their benchmark query. No channel exists between the
    //   two files, so this is convergence and not copying — but convergence is also what copying
    //   looks like from outside, so the honest move is to delete both lines and see whether the
    //   headline survives without them. ]]
    'bm25f+need(convergent lines deleted)': (() => {
      const CONVERGENT = { 'stamina-regen': 'come back after they stop sprinting for a bit', 'visible-ui-rows': 'scrolling list are on screen' };
      const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const trimmed = {};
      for (const [id, e] of Object.entries(need)) {
        const drop = CONVERGENT[id];
        trimmed[id] = vocabularyOf(drop ? e.lines.filter((l) => !norm(l).includes(drop)) : e.lines);
      }
      const r = W.makeRanker({ needOverride: trimmed });
      return (q) => r.rank(q).map((x) => ({ id: x.m.id, score: x.score }));
    })(),
    //[[ HOW MUCH OF THIS IS ONE LUCKY GENERATION? Rebuild the index from HALF the generated lines —
    //   four of eight per module. If the win survives, it is a property of asking the model at all
    //   rather than of the particular eight sentences that came back on the day. ]]
    'bm25f+need(4 of 8 lines)': (() => {
      const half = {};
      for (const [id, e] of Object.entries(need)) half[id] = vocabularyOf(e.lines.slice(0, 4));
      const r = W.makeRanker({ needOverride: half });
      return (q) => r.rank(q).map((x) => ({ id: x.m.id, score: x.score }));
    })(),
  };

  //[[ THE TIE CENSUS FOR THE SHIPPED SCORER. The Worker's own function returns modules, not scores,
  //   so ties have to be counted with the retyped scorer — which guard 2 above proved returns
  //   byte-identical shortlists on all 160 queries. Labelled, because a number from a copy has to
  //   say it came from a copy. ]]
  const shippedTies = (() => {
    let tied = 0, correctInside = 0;
    for (const [id, q] of customer) {
      const want = shippedTerms(q);
      const scored = modules.map((m) => {
        const mid = m.id.toLowerCase();
        const hay = `${mid} ${m.family} ${m.contract}`.toLowerCase();
        let score = 0;
        for (const w of want) {
          const st = shippedStem(w);
          if (mid.includes(w)) score += 3;
          else if (m.family.toLowerCase().includes(w)) score += 2;
          else if (hay.includes(w)) score += 1;
          else if (st !== w && hay.includes(st)) score += 1;
        }
        return { id: m.id, score };
      }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      if (!scored.length) continue;
      const top = scored.filter((r) => r.score === scored[0].score);
      if (top.length > 1) { tied++; if (top.some((r) => r.id === id)) correctInside++; }
    }
    return { countedWith: 'the retyped scorer, proven identical to the Worker\'s on all 160 queries', tiedAtTop: tied, tiedAtTopWithCorrectInside: correctInside };
  })();

  const results = {};
  for (const [name, rank] of Object.entries(variants)) {
    results[name] = { customer: measure('customer', customer, rank), contract: measure('contract', contract, rank) };
  }

  // --- which queries moved, in both directions ------------------------------------------------
  //[[ A net gain hides its regressions. Ten fixed and four broken is a different change from six
  //   fixed and none broken, and only one of those is safe to ship without reading the four. ]]
  const before = new Map(results.shipped.customer.rows.map((r) => [r.id, r]));
  const after = new Map(results['bm25f+need'].customer.rows.map((r) => [r.id, r]));
  const movedRight = [], brokeWrong = [], stillWrong = [];
  for (const [id, b] of before) {
    const a = after.get(id);
    if (!b.top1 && a.top1) movedRight.push({ id, query: b.query, wasReturned: b.returned, nowRank: 1 });
    else if (b.top1 && !a.top1) brokeWrong.push({ id, query: b.query, nowReturned: a.returned, nowRank: a.rank });
    else if (!b.top1 && !a.top1) stillWrong.push({ id, query: b.query, nowReturned: a.returned, nowRank: a.rank });
  }

  // --- weight neighbourhood: is the tuned point a plateau or a spike? --------------------------
  const sweep = [];
  for (const idw of [2.4, 2.8, 3.2, 3.6, 4.0]) {
    for (const needw of [1.2, 1.6, 2.1, 2.6, 3.0]) {
      const r = W.makeRanker({ weights: { id: idw, need: needw } });
      const c = measure('customer', customer, (q) => r.rank(q).map((x) => ({ id: x.m.id, score: x.score })));
      const k = measure('contract', contract, (q) => r.rank(q).map((x) => ({ id: x.m.id, score: x.score })));
      sweep.push({ id: idw, need: needw, customerTop1: c.top1, customerInTop5: c.inTop5, contractTop1: k.top1 });
    }
  }

  // --- DID THE MODEL GUESS THE CUSTOMER'S WORDS? ------------------------------------------------
  //[[ THE ONE STATISTIC THIS APPROACH LIVES OR DIES BY, and it is not a retrieval score.
  //
  //   Some words in the benchmark queries appear in NO module contract anywhere. They are the
  //   vocabulary no contract-based scorer can ever reach — M4 in the diagnosis, where the correct
  //   module scores literally zero and no change to the scoring can find it. If the blind generator
  //   produced those words, the approach works because it learned the customer's vocabulary. If it
  //   did not, any win came from the BM25F scorer and the index is decoration.
  //
  //   The sharp form is the second number: not "some module's need text contains this word" but
  //   "the RIGHT module's need text contains it". ]]
  const tok = (x) => (String(x).toLowerCase().match(/[a-z]+|[0-9]+(?:[.:][0-9]+)*[a-z]*/g) ?? []);
  const contractWords = new Set();
  for (const m of modules) for (const w of tok(`${m.id} ${m.family} ${m.contract}`)) contractWords.add(w);
  const unreachable = [];
  for (const [id, q] of customer) {
    for (const w of new Set(tok(q))) {
      if (w.length > 3 && !contractWords.has(w)) unreachable.push({ id, word: w });
    }
  }
  const inSomeNeed = unreachable.filter(({ word }) =>
    Object.values(need).some((e) => e.vocabulary.some(([w]) => w === word)));
  const inRightNeed = unreachable.filter(({ id, word }) =>
    (need[id]?.vocabulary ?? []).some(([w]) => w === word));
  const vocabularyRecovery = {
    what: 'words a benchmark query uses that appear in NO module contract — the vocabulary a contract-only scorer can never reach',
    benchmarkOnlyWordOccurrences: unreachable.length,
    distinctWords: new Set(unreachable.map((u) => u.word)).size,
    producedBySomeModulesNeedText: inSomeNeed.length,
    producedByTheCorrectModulesNeedText: inRightNeed.length,
    pctRecoveredForTheCorrectModule: pct(inRightNeed.length, Math.max(1, unreachable.length)),
    examplesRecovered: inRightNeed.slice(0, 20),
    examplesStillUnreachable: unreachable.filter((u) => !inRightNeed.includes(u)).slice(0, 20),
  };

  // --- how much of the need index is even used ------------------------------------------------
  const contractVocab = new Set();
  for (const m of modules) for (const w of `${m.id} ${m.family} ${m.contract}`.toLowerCase().match(/[a-z]+|[0-9]+(?:[.:][0-9]+)*[a-z]*/g) ?? []) contractVocab.add(w);
  let newWords = 0, totalWords = 0;
  for (const id of Object.keys(need)) for (const [w] of need[id].vocabulary ?? []) { totalWords++; if (!contractVocab.has(w)) newWords++; }

  // --- latency, at the shape production runs: one query, eighty documents ----------------------
  const timeOf = (fn) => {
    for (let i = 0; i < 200; i++) for (const [, q] of customer) fn(q);   // warm
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 500; i++) for (const [, q] of customer) fn(q);
    return Number(process.hrtime.bigint() - t0) / (500 * customer.length) / 1000; // µs per query
  };
  const usShipped = timeOf((q) => W.searchVerifiedModules(q, LIMIT));
  const usBm25 = timeOf((q) => bm25.search(q, LIMIT));
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) W.makeRanker();
  const buildMs = Number(process.hrtime.bigint() - t0) / 20 / 1e6;

  const needBytes = statSync(join(REPO, 'packages/training/data/need-index.json')).size;

  const out = {
    measuredAt: new Date().toISOString(),
    what: 'RETRIEVAL ONLY — whether the right module appears in the shortlist the model is handed. Not generation, not tool-call rate, not install correctness. Same 80 customer-phrased and 80 contract-phrased queries as knowledge-reach.json.',
    approach: 'Attack the DATA: index a customer-voice vocabulary generated blind per module, and score it with BM25F instead of substring-includes on a ten-point integer scale.',
    blindness: W.NEED_INDEX_COVERAGE.generatedBy
      ? 'packages/training/data/need-index.json was generated from each module id/family/contract/source only. The 80 benchmark queries were never in the generator context; build-need-index.test.mjs enforces that the generator cannot import them.'
      : 'MISSING GENERATOR PROVENANCE — do not cite these numbers.',
    settings: {
      limit: LIMIT,
      source: "apps/worker/src bundled with the repo esbuild — the Worker's own code, not a copy",
      weights: W.DEFAULT_WEIGHTS,
      weightsChosenBy: 'judgement, before any measurement — NOT a sweep. `weightSweep` below was run afterwards on the same 80 queries and finds a better cell (75/80 at need=1.2); it was deliberately not adopted, because the best cell of a grid searched on the set being reported is a measurement of the grid. Its value here is the SHAPE: all 25 cells land between 72 and 75 top-1, 79 in-top-5, 80 contract top-1.',
      needIndex: W.NEED_INDEX_COVERAGE,
    },
    baselineGuard: { expected: BASELINE, reproduced: true, retypedScorerMatchesWorker: true },
    headline: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, {
      customerTop1: v.customer.top1, customerTop1Pct: v.customer.top1Pct,
      customerInTop5: v.customer.inTop5, customerInTop5Pct: v.customer.inTop5Pct,
      customerRecallAnywhere: v.customer.recallAnywhere,
      customerTiedAtTop: v.customer.tiedAtTop,
      contractTop1: v.contract.top1, contractInTop5: v.contract.inTop5,
    }])),
    shippedTieCensus: shippedTies,
    vocabularyRecovery,
    needIndexVocabulary: { totalWords, wordsNotInAnyContract: newWords, pctNew: pct(newWords, totalWords) },
    movedRight, brokeWrong, stillWrong,
    weightSweep: sweep,
    cost: {
      addedModelCallsPerRequest: 0,
      addedCostPerRequestUSD: 0,
      addedLatencyUsPerLookup: Math.round((usBm25 - usShipped) * 100) / 100,
      shippedUsPerLookup: Math.round(usShipped * 100) / 100,
      bm25UsPerLookup: Math.round(usBm25 * 100) / 100,
      indexBuildMsAtColdStart: Math.round(buildMs * 100) / 100,
      needIndexBytesOnDisk: needBytes,
      measurementBundleBytes: bundleBytes,
      oneTimeGenerationSpend: W.NEED.cost ?? null,
    },
    variants: results,
  };
  mkdirSync(RUNS, { recursive: true });
  const file = join(RUNS, `${arg('out', 'knowledge-reach-need-index')}.json`);
  writeFileSync(file, JSON.stringify(out, null, 1) + '\n');

  const row = (n, v) => `  ${n.padEnd(18)} customer ${String(v.customerTop1).padStart(2)}/80 top-1 (${String(v.customerTop1Pct).padStart(2)}%)  ${String(v.customerInTop5).padStart(2)}/80 in-top-5 (${v.customerInTop5Pct}%)   contract ${v.contractTop1}/80 top-1   ties-at-top ${v.customerTiedAtTop}`;
  console.log('\nretrieval only, limit 5, 80 modules — the same queries as knowledge-reach.json\n');
  for (const [k, v] of Object.entries(out.headline)) console.log(row(k, v));
  console.log(`\n  shipped ties at the top score: ${shippedTies.tiedAtTop}/80 queries, correct module inside the tie in ${shippedTies.tiedAtTopWithCorrectInside}`);
  console.log(`\n  ${movedRight.length} queries moved to rank 1 that were not; ${brokeWrong.length} that were at rank 1 no longer are; ${stillWrong.length} still wrong`);
  if (brokeWrong.length) for (const b of brokeWrong) console.log(`    BROKE  ${b.id} -> ${b.nowReturned[0]} (correct now at rank ${b.nowRank ?? 'not returned'})`);
  console.log(`  need vocabulary: ${totalWords} words, ${newWords} (${pct(newWords, totalWords)}%) appear in no module contract`);
  console.log(`  customer words no contract contains: ${vocabularyRecovery.benchmarkOnlyWordOccurrences} occurrences (${vocabularyRecovery.distinctWords} distinct) — the blind index produced ${vocabularyRecovery.producedByTheCorrectModulesNeedText} of them for the RIGHT module (${vocabularyRecovery.pctRecoveredForTheCorrectModule}%)`);
  console.log(`  latency: ${out.cost.shippedUsPerLookup}µs -> ${out.cost.bm25UsPerLookup}µs per lookup (${out.cost.addedLatencyUsPerLookup >= 0 ? '+' : ''}${out.cost.addedLatencyUsPerLookup}µs), index build ${out.cost.indexBuildMsAtColdStart}ms once`);
  console.log(`  added cost per request: $0 — no model call at query time\n  wrote ${file}\n`);
}

await main();
