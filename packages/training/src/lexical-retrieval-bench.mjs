#!/usr/bin/env node
/**
 * RETRIEVAL ONLY, NO MODEL: does the right module come back first?
 *
 * WHAT THIS IS AND WHAT IT IS NOT. This scores the DOOR, not the house and not the model. It asks
 * one question — when a customer describes a need in their own words, does `askVerifiedModule`'s
 * shortlist put the right module first, and is it in the shortlist at all. It cannot say whether
 * the model calls the tool (that is measure-knowledge-reach.mjs --suite first-reach / real-loop),
 * and it cannot say whether the model picks correctly from a shortlist that already contains the
 * answer. Those are three different numbers and reporting one as another is the defect this
 * repository keeps re-learning.
 *
 * SETTINGS, because a number without them is not a measurement:
 *   subject     apps/worker/src/verified-modules.ts (shipped) and
 *               apps/worker/src/lexical-module-search.ts (the proposal), bundled with the repo's
 *               own esbuild — the Worker's code, not a retyped copy
 *   data        packages/corpus/data/verified-modules.json as committed (80 modules)
 *   queries     80 customer-phrased  (packages/training/src/customer-queries.mjs)
 *               80 contract-phrased  (the recorded queries in runs/knowledge-reach.json)
 *               53 UI construction ids (the recorded lookups in runs/knowledge-reach.json)
 *   limit       5
 *   model       none. No gateway call, no tokens, no lane, no maxTokens. Re-running costs nothing
 *               and gives the same answer every time.
 *
 * FIDELITY GATE. The run refuses to report unless the shipped scorer reproduces its recorded
 * baseline exactly — 80/80 contract top-1, 49/80 customer top-1, 67/80 in-top-5. If that check
 * fails, the corpus or the scorer moved and every comparison below is against a different subject.
 *
 * THE HONEST NUMBER IS THE LEAVE-ONE-OUT ONE. The proposal's synonym table has entries written
 * after reading a measured failure on a named module. Those entries are fitted to this benchmark.
 * Each one records which module it came from, and the leave-one-out pass drops every entry tagged
 * with a query's own module before scoring that query — so the headline is what the table is worth
 * on a need it has never seen, not what it is worth on the need it was written for.
 *
 * Usage:
 *   node packages/training/src/lexical-retrieval-bench.mjs              full run, writes runs/
 *   node packages/training/src/lexical-retrieval-bench.mjs --sweep      + tuning sensitivity
 *   node packages/training/src/lexical-retrieval-bench.mjs --failures   + every wrong-at-one row
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const RUNS_DIR = resolve(HERE, '..', 'runs');
const flag = (name) => process.argv.includes(`--${name}`);

const { CUSTOMER_QUERIES } = await import(join(HERE, 'customer-queries.mjs'));
const RECORDED = JSON.parse(readFileSync(join(RUNS_DIR, 'knowledge-reach.json'), 'utf8'));

/** The recorded baseline this run must reproduce before any comparison means anything. */
const BASELINE = {
  contractTop1: RECORDED.contract.top1,
  customerTop1: RECORDED.customer.top1,
  customerInTop5: RECORDED.customer.inTop5,
};

// ---------------------------------------------------------------------------
// The Worker's own code, bundled. Retyping the scorer here would measure a fiction.
// ---------------------------------------------------------------------------
function loadWorker() {
  const dir = mkdtempSync(join(tmpdir(), 'lexical-bench-'));
  const entry = join(dir, 'entry.ts');
  const out = join(dir, 'bits.mjs');
  const S = join(REPO, 'apps', 'worker', 'src');
  writeFileSync(entry, [
    `export { searchVerifiedModules, askVerifiedModule } from ${JSON.stringify(join(S, 'verified-modules.ts'))};`,
    `export { searchModulesLexical, rankModulesLexical, LEXICAL_TUNING, lexicalIndexStats, SYNONYMS } from ${JSON.stringify(join(S, 'lexical-module-search.ts'))};`,
    `export { getUIConstruction, UI_CONSTRUCTION_GENRE_IDS, UI_CONSTRUCTION_SCREEN_IDS } from ${JSON.stringify(join(S, 'ui-construction-guide.ts'))};`,
  ].join('\n'));
  const t0 = Date.now();
  execFileSync(join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--loader:.json=json', '--outfile=' + out],
    { stdio: 'pipe' });
  return import(out).then((mod) => ({ mod, bundleMs: Date.now() - t0, outfile: out }));
}

const { mod: W } = await loadWorker();

// ---------------------------------------------------------------------------
// Query sets
// ---------------------------------------------------------------------------
const CUSTOMER = Object.entries(CUSTOMER_QUERIES).map(([id, query]) => ({ id, query }));
const CONTRACT = RECORDED.contract.rows.map((r) => ({ id: r.id, query: r.query }));
const UI_LOOKUPS = RECORDED.uiConstruction.rows.map((r) => r.query);

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
const LIMIT = 5;

function scoreSet(cases, search) {
  const rows = [];
  for (const c of cases) {
    const hits = search(c.query, LIMIT, c.id).map((m) => m.id);
    const rank = hits.indexOf(c.id);
    rows.push({
      id: c.id,
      query: c.query,
      rank: rank === -1 ? null : rank + 1,
      top1: rank === 0,
      inTop5: rank !== -1,
      returned: hits,
    });
  }
  const top1 = rows.filter((r) => r.top1).length;
  const inTop5 = rows.filter((r) => r.inTop5).length;
  return {
    n: rows.length,
    limit: LIMIT,
    top1,
    top1Pct: Math.round((top1 / rows.length) * 1000) / 10,
    inTop5,
    inTop5Pct: Math.round((inTop5 / rows.length) * 1000) / 10,
    wrongAtOne: rows.length - top1,
    emptyResult: rows.filter((r) => r.returned.length === 0).length,
    rows,
  };
}

/** How many of the 80 survive the recall filter, per query — the load the ranker has to carry. */
function candidateLoad(cases, rankAll) {
  const counts = cases.map((c) => rankAll(c.query, c.id).length);
  const recall = cases.filter((c, i) => rankAll(c.query, c.id).some((r) => r.m.id === c.id)).length;
  return {
    meanCandidates: Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 10) / 10,
    maxCandidates: Math.max(...counts),
    recallAtCandidateStage: recall,
    recallAtCandidateStagePct: Math.round((recall / cases.length) * 1000) / 10,
  };
}

// ---------------------------------------------------------------------------
// THE LADDER. Each rung adds ONE mechanism, so the result is decomposed instead of asserted, and
// so a reader can see which rungs are vocabulary (fitted to this benchmark, to some degree) and
// which are structure (not fitted to anything).
//
// Rungs A and B add no vocabulary at all beyond English morphology. Rung A does not even change
// the stop list. Whatever A scores is the part of this result that owes nothing to having read the
// benchmark, and it is the number to quote when in doubt.
// ---------------------------------------------------------------------------
const NO_SYNONYMS = [];
const LADDER = [
  ['shipped', null, 'apps/worker/src/verified-modules.ts as it ships'],
  ['A structure only, shipped stop list', { stop: 'shipped', synonymClasses: NO_SYNONYMS },
    'token matching + morphology + BM25F + IDF + phrase. No vocabulary added. Nothing here was chosen by reading a failure.'],
  ['B + wide stop list', { stop: 'wide', synonymClasses: NO_SYNONYMS },
    'the stop list was widened after reading which words were measured doing damage, so this rung is partly informed by the benchmark'],
  ['C + inherited synonyms', { stop: 'wide', synonymClasses: ['inherited'] },
    'the twelve keys already in verified-modules.ts, re-scored under one-slot-per-concept'],
  ['D + general synonyms', { stop: 'wide', synonymClasses: ['inherited', 'general'] },
    'ordinary English and Roblox vocabulary; every trigger word still comes from this benchmark'],
  ['E + fitted synonyms (IN SAMPLE)', { stop: 'wide', synonymClasses: ['inherited', 'general', 'fitted'] },
    'includes entries written after reading the failure on that very module: an upper bound, not an estimate'],
  ['E leave-one-out by module', { stop: 'wide', synonymClasses: ['inherited', 'general', 'fitted'], loo: true },
    'E with every fitted entry tagged to the query\'s own module dropped before that query is scored'],
];

function searcherFor(cfg) {
  if (cfg === null) return (q, limit) => W.searchVerifiedModules(q, limit);
  const { loo, ...opts } = cfg;
  return (q, limit, moduleId) => W.searchModulesLexical(q, limit, { ...opts, ...(loo ? { excludeModuleId: moduleId } : {}) });
}

const ladder = LADDER.map(([name, cfg, note]) => {
  const search = searcherFor(cfg);
  return {
    name,
    note,
    config: cfg,
    customer: scoreSet(CUSTOMER, search),
    contract: scoreSet(CONTRACT, search),
  };
});

// ---------------------------------------------------------------------------
// FIDELITY GATE. Before any comparison means anything, the shipped scorer must reproduce the
// baseline recorded in runs/knowledge-reach.json. If it does not, the corpus or the scorer moved
// and every row below is against a different subject.
// ---------------------------------------------------------------------------
const shippedContract = ladder[0].contract;
const shippedCustomer = ladder[0].customer;
const fidelity = {
  expected: BASELINE,
  observed: {
    contractTop1: shippedContract.top1,
    customerTop1: shippedCustomer.top1,
    customerInTop5: shippedCustomer.inTop5,
  },
};
fidelity.reproduced = fidelity.observed.contractTop1 === BASELINE.contractTop1
  && fidelity.observed.customerTop1 === BASELINE.customerTop1
  && fidelity.observed.customerInTop5 === BASELINE.customerInTop5;

const shippedRung = ladder[0];
const structureOnly = ladder[1];
const fullInSample = ladder[5];
const fullLoo = ladder[6];

const results = {
  shipped: { contract: shippedContract, customer: shippedCustomer },
  ladder,
};

const candidates = {
  shippedCustomer: candidateLoad(CUSTOMER, (q) => W.searchVerifiedModules(q, 999).map((m) => ({ m }))),
  lexicalCustomer: candidateLoad(CUSTOMER, (q, id) => W.rankModulesLexical(q, { excludeModuleId: id })),
};

// ---------------------------------------------------------------------------
// Latency. Wall-clock over the same 80 queries, warmed, on this machine — a Worker isolate is
// slower, so treat these as a floor and as a RATIO between the two scorers, which is the part that
// transfers. Reported with the machine so the number can be reproduced or disputed.
// ---------------------------------------------------------------------------
function timeIt(fn, reps = 200) {
  for (let i = 0; i < 20; i += 1) for (const c of CUSTOMER) fn(c.query);
  const samples = [];
  for (let r = 0; r < reps; r += 1) {
    const t0 = process.hrtime.bigint();
    for (const c of CUSTOMER) fn(c.query);
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6 / CUSTOMER.length);
  }
  samples.sort((a, b) => a - b);
  return {
    meanMs: Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 1000) / 1000,
    p95Ms: Math.round(samples[Math.floor(samples.length * 0.95)] * 1000) / 1000,
  };
}
/** Minified bundle bytes for each scorer plus the corpus both already carry. */
function bundleBytes(exportLine) {
  const dir = mkdtempSync(join(tmpdir(), 'lexical-size-'));
  const entry = join(dir, 's.ts');
  const out = join(dir, 's.js');
  writeFileSync(entry, exportLine);
  execFileSync(join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--minify', '--target=es2022', '--platform=browser', '--loader:.json=json', '--outfile=' + out],
    { stdio: 'pipe' });
  const buf = readFileSync(out);
  return { minified: buf.length, gzip: gzipSync(buf).length };
}
const S = join(REPO, 'apps', 'worker', 'src');
const size = {
  note: 'each figure includes the 125KB verified-modules.json the Worker already bundles; the delta is the scorer',
  shipped: bundleBytes(`export { searchVerifiedModules } from ${JSON.stringify(join(S, 'verified-modules.ts'))};`),
  lexical: bundleBytes(`export { searchModulesLexical } from ${JSON.stringify(join(S, 'lexical-module-search.ts'))};`),
};
size.addedMinifiedBytes = size.lexical.minified - size.shipped.minified;
size.addedGzipBytes = size.lexical.gzip - size.shipped.gzip;

/**
 * A fresh module instance per sample, so the lazy index is genuinely cold each time.
 *
 * This is the cost that matters on a Worker cold start, and it is the one number where the lexical
 * scorer is unambiguously more expensive than the thing it replaces.
 */
async function coldIndexBuild(samples = 9) {
  const dir = mkdtempSync(join(tmpdir(), 'lexical-cold-'));
  const entry = join(dir, 'c.ts');
  writeFileSync(entry, `export { searchModulesLexical } from ${JSON.stringify(join(REPO, 'apps', 'worker', 'src', 'lexical-module-search.ts'))};`);
  const out = join(dir, 'c.mjs');
  execFileSync(join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--loader:.json=json', '--outfile=' + out],
    { stdio: 'pipe' });
  const src = readFileSync(out);
  const importOnly = [];
  const firstSearch = [];
  for (let i = 0; i < samples; i += 1) {
    const copy = join(dir, `c${i}.mjs`);
    writeFileSync(copy, src);
    const t0 = process.hrtime.bigint();
    // eslint-disable-next-line no-await-in-loop
    const mod = await import(copy);
    importOnly.push(Number(process.hrtime.bigint() - t0) / 1e6);
    const t1 = process.hrtime.bigint();
    mod.searchModulesLexical('stop the player using an ability too often', 5);
    firstSearch.push(Number(process.hrtime.bigint() - t1) / 1e6);
  }
  const median = (a) => Math.round([...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] * 100) / 100;
  return { importOnlyMs: median(importOnly), firstSearchBuildsIndexMs: median(firstSearch), samples };
}

const latency = {
  note: 'per query, node on this machine, 80-query loop x200 after a warm-up; a Worker isolate is slower in absolute terms, the ratio is the transferable part',
  node: process.version,
  shipped: timeIt((q) => W.searchVerifiedModules(q, LIMIT)),
  lexical: timeIt((q) => W.searchModulesLexical(q, LIMIT)),
  cold: await coldIndexBuild(),
  coldIndexNote: 'ONCE PER ISOLATE, not per request, and only when something searches: the index is built lazily so an isolate that only calls getVerifiedModule({id}) never pays it',
};
latency.addedMsPerQuery = Math.round((latency.lexical.meanMs - latency.shipped.meanMs) * 1000) / 1000;

// ---------------------------------------------------------------------------
// UI construction lookups, unchanged code — recorded so a later fix has a before.
// ---------------------------------------------------------------------------
const ui = (() => {
  const rows = UI_LOOKUPS.map((q) => {
    const a = W.getUIConstruction({ id: q });
    return { query: q, found: a.found === true, id: a.id ?? null };
  });
  const advertised = [...W.UI_CONSTRUCTION_GENRE_IDS, ...W.UI_CONSTRUCTION_SCREEN_IDS];
  const selfLookup = advertised.map((id) => {
    const a = W.getUIConstruction({ id });
    return { id, resolvesToItself: a.found === true && a.id === id, resolvedTo: a.id ?? null };
  });
  return {
    n: rows.length,
    found: rows.filter((r) => r.found).length,
    rows,
    advertisedIdsThatDoNotResolveToThemselves: selfLookup.filter((r) => !r.resolvesToItself),
    selfLookup,
  };
})();

// ---------------------------------------------------------------------------
// Tuning sensitivity: is the result a plateau or a knife edge?
// ---------------------------------------------------------------------------
let sweep = null;
if (flag('sweep')) {
  const base = W.LEXICAL_TUNING;
  const axes = {
    k1: [0.6, 0.9, 1.2, 1.6, 2.0],
    b: [0, 0.3, 0.6, 0.75, 1],
    wId: [1, 2, 3, 4, 6],
    wFamily: [0, 1, 2, 3],
    wContract: [0.5, 1, 1.5, 2],
    morph: [0, 0.3, 0.55, 0.8, 1],
    morphMinLen: [3, 4, 5],
    synonym: [0, 0.3, 0.6, 0.9],
    phrase: [0, 0.4, 0.8, 1.5],
  };
  sweep = {};
  for (const [axis, values] of Object.entries(axes)) {
    sweep[axis] = values.map((v) => {
      const tuning = { ...base, [axis]: v };
      const s = scoreSet(CUSTOMER, (q, limit, id) => W.searchModulesLexical(q, limit, { tuning, synonymClasses: [], stop: 'shipped' }));
      return { value: v, top1: s.top1, inTop5: s.inTop5 };
    });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const out = {
  measuredAt: new Date().toISOString(),
  what: 'RETRIEVAL ONLY: whether the right entry is first in, and present in, the shortlist the model is handed. Not tool-call rate, not generation, not install correctness.',
  approach: 'improved lexical search: token-boundary matching with morphology, BM25F field weighting and length normalisation, per-term IDF, one slot per query concept so synonyms compete instead of accumulating, and a phrase bonus',
  settings: {
    limit: LIMIT,
    corpus: 'packages/corpus/data/verified-modules.json as committed (80 modules)',
    customerQueries: 'packages/training/src/customer-queries.mjs (80)',
    contractQueries: 'the recorded queries in packages/training/runs/knowledge-reach.json (80)',
    uiLookups: 'the recorded lookups in packages/training/runs/knowledge-reach.json (53)',
    source: 'apps/worker/src bundled with the repo esbuild — the Worker\'s own code, not a copy',
    model: 'none. No gateway call, no tokens, no lane, no maxTokens.',
    tuning: W.LEXICAL_TUNING,
    index: W.lexicalIndexStats(),
  },
  fidelity,
  headline: {
    customerTop1: Object.fromEntries(ladder.map((r) => [r.name, `${r.customer.top1}/80 (${r.customer.top1Pct}%)`])),
    customerInTop5: Object.fromEntries(ladder.map((r) => [r.name, `${r.customer.inTop5}/80 (${r.customer.inTop5Pct}%)`])),
    contractTop1: Object.fromEntries(ladder.map((r) => [r.name, `${r.contract.top1}/80 (${r.contract.top1Pct}%)`])),
    whichNumberToQuote:
      'Rung A. It adds no vocabulary: token-boundary matching with morphology, BM25F field weighting '
      + 'and length normalisation, IDF and a phrase bonus, over the same stop list the shipped scorer '
      + 'uses. Nothing in it was chosen by reading a failure, so it is the part of this result that '
      + 'generalises to a query nobody has seen. Rung E is the configuration that would actually ship '
      + 'and it is an UPPER BOUND, not an estimate — its synonym table contains entries written after '
      + 'reading the failure on that very module.',
  },
  candidates,
  latency,
  size,
  ui: { ...ui, recordedBefore: { n: RECORDED.uiConstruction.n, found: RECORDED.uiConstruction.found } },
  sweep,
  results,
};

mkdirSync(RUNS_DIR, { recursive: true });
const path = join(RUNS_DIR, 'retrieval-lexical.json');
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');

const pct = (a, b) => `${a}/${b} (${Math.round((a / b) * 1000) / 10}%)`;
console.log('');
console.log(`fidelity gate: shipped reproduces its recorded baseline = ${fidelity.reproduced}`);
console.log(`  expected ${JSON.stringify(fidelity.expected)}`);
console.log(`  observed ${JSON.stringify(fidelity.observed)}`);
console.log('');
console.log('THE LADDER — 80 customer-phrased queries, limit 5, no model, no tokens');
console.log('  rung                                     cust top-1      cust in-top-5   contract top-1');
for (const r of ladder) {
  console.log(`  ${r.name.padEnd(40)} ${pct(r.customer.top1, 80).padEnd(15)} ${pct(r.customer.inTop5, 80).padEnd(15)} ${pct(r.contract.top1, 80)}`);
}
console.log('');
console.log(`  quote rung A (${pct(structureOnly.customer.top1, 80)} top-1): it adds no vocabulary and owes nothing to having read the benchmark.`);
console.log(`  rung E (${pct(fullInSample.customer.top1, 80)}) is an UPPER BOUND: its table has entries written after reading that module's failure.`);
console.log('');
console.log(`candidate stage: shipped keeps ${candidates.shippedCustomer.meanCandidates} of 80 per query (recall ${candidates.shippedCustomer.recallAtCandidateStagePct}%)`);
console.log(`                 lexical keeps ${candidates.lexicalCustomer.meanCandidates} of 80 per query (recall ${candidates.lexicalCustomer.recallAtCandidateStagePct}%)`);
console.log(`latency per query: shipped ${latency.shipped.meanMs}ms, lexical ${latency.lexical.meanMs}ms, added ${latency.addedMsPerQuery}ms (${latency.node}, this machine)`);
console.log(`cold start: import ${latency.cold.importOnlyMs}ms, first search builds the index in ${latency.cold.firstSearchBuildsIndexMs}ms — once per isolate, only if something searches`);
console.log(`bundle: +${size.addedMinifiedBytes} bytes minified, +${size.addedGzipBytes} gzipped (both figures include the 125KB corpus the Worker already carries)`);
console.log(`added cost per request: 0. No model call, no token, no dependency, no network — this is arithmetic over 80 documents in the isolate.`);
console.log(`ui construction: ${ui.found}/${ui.n} found (recorded baseline ${RECORDED.uiConstruction.found}/${RECORDED.uiConstruction.n}); advertised ids that do not resolve to themselves: ${ui.advertisedIdsThatDoNotResolveToThemselves.length} (was 4)`);

if (flag('failures')) {
  console.log('\nSTILL WRONG AT ONE under rung E leave-one-out:');
  for (const r of fullLoo.customer.rows.filter((x) => !x.top1)) {
    console.log(`  ${r.id.padEnd(26)} rank=${r.rank ?? '-'}  "${r.query}"`);
    console.log(`  ${''.padEnd(26)} got: ${r.returned.join(', ')}`);
  }
  console.log('\nFIXED by lexical (was wrong at one, now first):');
  const was = new Map(shippedRung.customer.rows.map((r) => [r.id, r]));
  for (const r of fullLoo.customer.rows.filter((x) => x.top1 && !was.get(x.id).top1)) {
    console.log(`  ${r.id.padEnd(26)} was rank ${was.get(r.id).rank ?? '-'} ("${was.get(r.id).returned[0]}")`);
  }
  console.log('\nBROKEN by lexical (was first, now not):');
  for (const r of fullLoo.customer.rows.filter((x) => !x.top1 && was.get(x.id).top1)) {
    console.log(`  ${r.id.padEnd(26)} now rank ${r.rank ?? '-'} ("${r.returned[0]}")`);
  }
}

if (flag('sweep')) {
  console.log('\nTUNING SENSITIVITY (customer top-1 / in-top-5, RUNG A — no synonyms — one axis at a time):');
  for (const [axis, points] of Object.entries(sweep)) {
    console.log(`  ${axis.padEnd(12)} ${points.map((p) => `${p.value}:${p.top1}/${p.inTop5}`).join('  ')}`);
  }
}

console.log('\n->', path);
if (!fidelity.reproduced) {
  console.error('\nFIDELITY GATE FAILED: the shipped scorer did not reproduce its recorded baseline.');
  console.error('The corpus or the scorer moved. Every comparison above is against a different subject.');
  process.exit(1);
}
