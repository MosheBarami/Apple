#!/usr/bin/env node
/**
 * DOES A WIDE RECALL PLUS A RERANK REACH THE EIGHTY MODULES BETTER THAN THE SHIPPED SEARCH?
 *
 * knowledge-reach.json measured the shipped door: 80/80 top-1 when the query is phrased like the
 * module's own contract, 49/80 (61%) when it is phrased the way a customer talks. This scores a
 * candidate replacement over THE SAME 80 QUERIES so the two numbers are comparable, and prints the
 * baseline in the same run so the comparison cannot drift.
 *
 * WHAT IS MEASURED, AND WHAT EACH NUMBER IS A NUMBER ABOUT
 * -------------------------------------------------------
 *   recall@N   Does the candidate pool CONTAIN the right module? This is the ceiling on everything
 *              downstream. A reranker cannot find what stage one did not hand it, and reporting a
 *              rerank win without this number hides whether the win was available at all.
 *   top-1      Is the right module first? This is what the model sees at the head of the shortlist.
 *   in-top-5   Is it anywhere in the five `askVerifiedModule` returns? The gap between this and
 *              top-1 is a GENERATION question, not a retrieval one: the answer was handed over and
 *              the ordering buried it.
 *
 *   --stage lexical  costs NOTHING. No gateway, no tokens, no lane, no maxTokens. Pure library code
 *                    over a fixed table; re-running gives the same answer every time.
 *   --stage judge    spends. Every number it prints carries its model id, pool size, max_tokens,
 *                    temperature and snippet length, because a retrieval number without the
 *                    settings that produced it is not a measurement.
 *
 * THE TRAP THIS HARNESS WATCHES FOR. `applyJudge` fills anything the judge did not name from the
 * heuristic order, so a judge whose reply is unparseable produces numbers IDENTICAL to the
 * heuristic — which reads as "the model agreed" and actually means "the model said nothing".
 * `judgeParsedMean` and `judgeSilent` below are what tell the two apart. Read them before reading
 * the top-1.
 *
 * Usage:
 *   node packages/training/src/measure-retrieval-hybrid.mjs --stage lexical
 *   node packages/training/src/measure-retrieval-hybrid.mjs --stage judge --model @cf/meta/llama-3.2-3b-instruct
 *   node packages/training/src/measure-retrieval-hybrid.mjs --stage judge --model @cf/zai-org/glm-5.3-flash --pool 20
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CUSTOMER_QUERIES } from './customer-queries.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const RUNS = resolve(HERE, '..', 'runs');

for (const line of (() => { try { return readFileSync(join(REPO, '.env'), 'utf8').split('\n'); } catch { return []; } })()) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };

const MODULES = JSON.parse(readFileSync(join(REPO, 'packages', 'corpus', 'data', 'verified-modules.json'), 'utf8')).modules;

/**
 * The Worker's OWN code, bundled — never a retyped copy.
 *
 * Retyping the scorer into this harness would measure a fiction that resembles production. The
 * fidelity check is that the baseline half of every run reproduces knowledge-reach.json exactly;
 * if it stops doing so, the harness is wrong or somebody changed the shipped search, and either
 * way the comparison below is void.
 */
function loadSearchers() {
  const dir = mkdtempSync(join(tmpdir(), 'retrieval-hybrid-'));
  const entry = join(dir, 'entry.ts');
  const out = join(dir, 'bits.mjs');
  const S = join(REPO, 'apps', 'worker', 'src');
  writeFileSync(entry, [
    `export { searchVerifiedModules } from ${JSON.stringify(join(S, 'verified-modules.ts'))};`,
    `export * from ${JSON.stringify(join(S, 'verified-module-retrieval-hybrid.ts'))};`,
  ].join('\n'));
  execFileSync(join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out], { stdio: 'pipe' });
  return import(out);
}

const bits = await loadSearchers();
const { searchVerifiedModules, INDEX, recall, rerankHeuristic, DEFAULT_WEIGHTS, judgePrompt, parseJudge, applyJudge } = bits;

const contractQuery = (m) => `Write a standalone Luau module returning ${m.contract}`;
const customerQuery = (m) => CUSTOMER_QUERIES[m.id];

function scoreSearch(fn, queryFor) {
  let top1 = 0, inTop5 = 0;
  const wrongAtOne = [];
  for (const m of MODULES) {
    const q = queryFor(m);
    if (!q) continue;
    const got = fn(q, 5).map((x) => x.id);
    if (got[0] === m.id) top1++; else wrongAtOne.push({ id: m.id, query: q, returned: got });
    if (got.includes(m.id)) inTop5++;
  }
  return { n: MODULES.length, top1, inTop5, wrongAtOne };
}

function recallCurve(queryFor, ns) {
  const out = {};
  for (const n of ns) {
    let hit = 0;
    const missing = [];
    for (const m of MODULES) {
      const q = queryFor(m);
      if (!q) continue;
      if (recall(INDEX, q, n).some((c) => c.m.id === m.id)) hit++; else missing.push(m.id);
    }
    out[`recall@${n}`] = { hit, of: MODULES.length, missing };
  }
  return out;
}

/** How far the heuristic's numbers move if the weights move. A flat range means tuning is noise. */
function weightSensitivity(queryFor) {
  const pools = new Map(MODULES.map((m) => [m.id, recall(INDEX, queryFor(m), 20)]));
  const seen = [];
  for (const bm25 of [0.5, 1, 1.5])
    for (const idCoverage of [1.0, 1.6, 2.2, 2.8])
      for (const queryCoverage of [0.8, 1.6, 2.4])
        for (const famCoverage of [0.0, 0.8, 1.6]) {
          const w = { bm25, idCoverage, queryCoverage, famCoverage, gram: 0 };
          let top1 = 0, inTop5 = 0;
          for (const m of MODULES) {
            const r = rerankHeuristic(pools.get(m.id), w).slice(0, 5).map((x) => x.m.id);
            if (r[0] === m.id) top1++;
            if (r.includes(m.id)) inTop5++;
          }
          seen.push({ w, top1, inTop5 });
        }
  const t1 = seen.map((s) => s.top1).sort((a, b) => a - b);
  return {
    settingsTried: seen.length,
    top1Min: t1[0], top1Max: t1[t1.length - 1], top1Median: t1[Math.floor(t1.length / 2)],
    best: seen.slice().sort((a, b) => b.top1 - a.top1 || b.inTop5 - a.inTop5)[0],
    note: 'DEFAULT_WEIGHTS sits at the median on purpose. Adopting the best row because it is the best row on this set would be fitting the index to the benchmark it is reported against.',
  };
}

// ---------------------------------------------------------------------------------------------
// The judge
// ---------------------------------------------------------------------------------------------
const CACHE_PATH = join(RUNS, '.retrieval-judge-cache.json');
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};

async function callWorkersAI(model, prompt, { maxTokens, temperature }) {
  const acc = process.env.CLOUDFLARE_ACCOUNT_ID, tok = process.env.CLOUDFLARE_API_TOKEN;
  if (!acc || !tok) throw new Error('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are not set');
  const messages = [
    { role: 'system', content: "You match a Roblox developer's request to the Luau module that does exactly that job. Answer with numbers only." },
    { role: 'user', content: prompt },
  ];
  const key = createHash('sha256').update(model + JSON.stringify(messages) + maxTokens + temperature).digest('hex');
  if (cache[key]) return { ...cache[key], cached: true };
  let lastError = null;
  for (let a = 0; a < 6; a++) {
    const t0 = Date.now();
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: maxTokens, temperature }),
    });
    const j = await res.json().catch(() => null);
    if (j?.success) {
      const r = j.result;
      const out = {
        text: r.response ?? r.choices?.[0]?.message?.content ?? '',
        reasoning: r.choices?.[0]?.message?.reasoning ?? null,
        usage: r.usage ?? {}, ms: Date.now() - t0,
      };
      cache[key] = out;
      mkdirSync(RUNS, { recursive: true });
      writeFileSync(CACHE_PATH, JSON.stringify(cache));
      return out;
    }
    lastError = j?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    //[[ A RATE LIMIT IS NOT AN ANSWER, AND IT MUST NOT BECOME ONE.
    //   `@cf/zai-org/glm-5.3-flash` returned "rate limiting: inference request per min rate
    //   reached" on essentially every call during this work. A refused call returns empty text,
    //   which parses to zero picks, which `applyJudge` fills from the heuristic order — so a fully
    //   rate-limited run reports numbers IDENTICAL to the heuristic and reads as "the model agreed
    //   with us". That is the observation-failure shape this repository keeps producing: a failure
    //   to observe rendering as an observation. Back off hard, and if it still fails, say so
    //   loudly enough that the run is void rather than quietly wrong. ]]
    const rateLimited = /rate limit/i.test(String(lastError));
    await new Promise((r) => setTimeout(r, (rateLimited ? 8000 : 1500) * (a + 1)));
  }
  return { text: '', usage: {}, ms: 0, error: true, errorMessage: lastError };
}

/**
 * A DETERMINISTIC SHUFFLE, SEEDED BY THE QUERY.
 *
 * WHY THIS EXISTS, and it was found by a measurement rather than by review. The first judge runs
 * presented the 20 candidates in heuristic order. `@cf/meta/llama-3.2-3b-instruct` then changed the
 * top-1 on ZERO of 80 queries — it reordered positions two to five freely, and never once moved a
 * different module into first place. It was not judging; it was copying the ranking it was shown.
 * A rerank measured that way reports the first stage's number and calls it the model's.
 *
 * So `--order shuffled` presents the same 20 candidates in an order that carries no retrieval
 * information, and the two are reported separately. `heuristic` is the production-realistic
 * arrangement and `shuffled` is the one that answers "can this model tell these apart at all".
 */
function seededShuffle(items, seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function scoreJudge(queryFor, { model, poolN, maxTokens, temperature, snippetChars, order }) {
  let top1 = 0, inTop5 = 0, hTop1 = 0, hInTop5 = 0, recallHit = 0;
  let neurons = 0, ms = 0, ptok = 0, ctok = 0, errors = 0, parsedTotal = 0, silent = 0, live = 0, agreedAtOne = 0;
  const wrongAtOne = [];
  const errorMessages = new Set();
  for (const m of MODULES) {
    const q = queryFor(m);
    if (!q) continue;
    const pool = recall(INDEX, q, poolN);
    if (pool.some((c) => c.m.id === m.id)) recallHit++;
    const heur = rerankHeuristic(pool, DEFAULT_WEIGHTS);
    const hIds = heur.slice(0, 5).map((x) => x.m.id);
    if (hIds[0] === m.id) hTop1++;
    if (hIds.includes(m.id)) hInTop5++;

    const shown = order === 'shuffled' ? seededShuffle(heur, m.id) : heur;
    const r = await callWorkersAI(model, judgePrompt(q, shown, snippetChars), { maxTokens, temperature });
    if (r.error) { errors++; if (r.errorMessage) errorMessages.add(String(r.errorMessage).slice(0, 120)); }
    // Latency is taken from the call that was actually made, whether that was in this run or the
    // run that populated the cache. Dropping cached rows would make a fully replayed run report no
    // latency at all, which is a truer-sounding lie than reporting the measurement it has.
    if (!r.error) { ms += r.ms ?? 0; if (!r.cached) live++; }
    neurons += r.usage.neurons ?? 0; ptok += r.usage.prompt_tokens ?? 0; ctok += r.usage.completion_tokens ?? 0;
    const { picked, parsed } = parseJudge(r.text, shown);
    parsedTotal += parsed;
    if (parsed === 0) silent++;
    // Anything the judge did not name still falls back to the HEURISTIC order, never the shuffled
    // one: the shuffle is how the question is asked, not how the answer is filled in.
    const got = applyJudge(picked, heur, 5).map((x) => x.id);
    if (got[0] === heur[0].m.id) agreedAtOne++;
    if (got[0] === m.id) top1++; else wrongAtOne.push({ id: m.id, query: q, returned: got, judgeSaid: String(r.text).slice(0, 60) });
    if (got.includes(m.id)) inTop5++;
  }
  const n = MODULES.length;
  const answered = n - errors;
  return {
    settings: { model, poolN, maxTokens, temperature, snippetChars, candidateOrder: order },
    //[[ READ THIS BEFORE READING THE TOP-1. A refused call parses to zero picks and is filled from
    //   the heuristic order, so a run the provider refused reports the heuristic's numbers wearing
    //   the judge's name. `verdict` is what stops that reading. ]]
    verdict: errors === 0
      ? `every one of the ${n} queries got a real reply from the model`
      : `VOID AS A COMPARISON: the provider refused ${errors} of ${n} calls (${[...errorMessages].join('; ')}). Those rows are the heuristic order, not the judge's.`,
    callsAnswered: answered, callsRefused: errors,
    recallAtPool: { hit: recallHit, of: n },
    heuristicOnly: { top1: hTop1, inTop5: hInTop5 },
    judged: { top1, inTop5 },
    judgeParsedMean: Number((parsedTotal / n).toFixed(2)),
    judgeSilent: silent,
    //[[ THE SECOND WAY A JUDGE CAN SAY NOTHING WHILE APPEARING TO SPEAK.
    //   A model shown candidates in rank order tends to return them in rank order. If this is 80/80
    //   the judge never once disagreed about the winner, and the top-1 below is the heuristic's
    //   number wearing the model's name — measured: llama-3.2-3b did exactly that, 80/80. ]]
    judgeKeptHeuristicWinner: agreedAtOne,
    judgeSilentNote: 'queries where the reply parsed to zero ids, so the row is the heuristic order wearing the judge\'s name',
    errors,
    cost: {
      avgPromptTokens: Math.round(ptok / n), avgCompletionTokens: Math.round(ctok / n),
      neuronsPerQuery: Number((neurons / Math.max(1, answered)).toFixed(3)),
      usdPerQuery: Number(((neurons / Math.max(1, answered)) * 0.011 / 1000).toFixed(8)),
      usdPerQueryNote: 'Workers AI list price 2026-09: $0.011 per 1,000 neurons. Averaged over calls the provider actually answered.',
      callsMadeInThisRun: live,
      addedLatencyMsMean: answered ? Math.round(ms / answered) : null,
      addedLatencyNote: live === answered
        ? 'every call was made in this run and timed here'
        : `${answered - live} of ${answered} rows replayed a cached reply; their latency is the one measured when that call was first made, not zero`,
    },
    wrongAtOne,
  };
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------
const stage = arg('stage', 'lexical');
const out = {
  measuredAt: new Date().toISOString(),
  what: 'RETRIEVAL ONLY: whether the right entry appears in the shortlist the model is handed. Not generation, not tool-call rate, not install correctness.',
  subject: 'apps/worker/src/verified-module-retrieval-hybrid.ts, bundled with the repo esbuild alongside the SHIPPED apps/worker/src/verified-modules.ts for comparison — the Worker\'s own code, not a copy.',
  moduleCount: MODULES.length,
  querySets: {
    contract: 'the module\'s own contract, verbatim — the phrasing the library is indexed on',
    customer: 'packages/training/src/customer-queries.mjs — one line per module in a creator\'s words',
  },
  limit: 5,
  stage,
};

const baseCustomer = scoreSearch(searchVerifiedModules, customerQuery);
const baseContract = scoreSearch(searchVerifiedModules, contractQuery);
out.baselineShipped = {
  customer: { top1: baseCustomer.top1, inTop5: baseCustomer.inTop5, of: baseCustomer.n },
  contract: { top1: baseContract.top1, inTop5: baseContract.inTop5, of: baseContract.n },
  fidelity: (baseCustomer.top1 === 49 && baseCustomer.inTop5 === 67 && baseContract.top1 === 80)
    ? 'reproduces knowledge-reach.json exactly (49/80, 67/80, 80/80)'
    : 'DOES NOT reproduce knowledge-reach.json — the shipped search changed or this harness is wrong; the comparison below is void',
};

if (stage === 'lexical') {
  const hy = (q, l) => bits.searchVerifiedModulesHybrid(q, l);
  const hyCustomer = scoreSearch(hy, customerQuery);
  const hyContract = scoreSearch(hy, contractQuery);
  out.hybridHeuristic = {
    settings: { poolN: 20, tailSlots: bits.TAIL_SLOTS, weights: DEFAULT_WEIGHTS, synWeight: bits.SYN_WEIGHT, model: 'none', usdPerQuery: 0, addedLatencyMsMean: 0 },
    customer: { top1: hyCustomer.top1, inTop5: hyCustomer.inTop5, of: hyCustomer.n },
    contract: { top1: hyContract.top1, inTop5: hyContract.inTop5, of: hyContract.n },
    stillWrongAtOne: hyCustomer.wrongAtOne,
  };
  out.recall = { customer: recallCurve(customerQuery, [5, 10, 20, 30, 40]), contract: recallCurve(contractQuery, [5, 20]) };

  //[[ IS THE CANDIDATE STAGE THE BOTTLENECK, OR IS THE RERANKER?
  //   Reporting recall@20 next to a final top-1 invites the reading "widen the pool and the number
  //   goes up". This table answers it directly by widening the pool all the way to the whole
  //   library, where recall is 80/80 by construction. If top-1 does not move, recall was never the
  //   binding constraint and every further point has to come from the ranking function. ]]
  out.poolWidth = {
    what: 'the same heuristic reranker over progressively wider candidate pools, customer queries',
    rows: [5, 10, 20, 30, 40, MODULES.length].map((n) => {
      let rec = 0, top1 = 0, inTop5 = 0;
      for (const m of MODULES) {
        const pool = recall(INDEX, customerQuery(m), n);
        if (pool.some((c) => c.m.id === m.id)) rec++;
        const r = rerankHeuristic(pool, DEFAULT_WEIGHTS).slice(0, 5).map((x) => x.m.id);
        if (r[0] === m.id) top1++;
        if (r.includes(m.id)) inTop5++;
      }
      return { poolN: n, recall: rec, top1, inTop5 };
    }),
  };
  out.weightSensitivity = weightSensitivity(customerQuery);
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) hy(CUSTOMER_QUERIES[MODULES[i % MODULES.length].id], 5);
  out.hybridHeuristic.settings.measuredMsPerLookup = Number(((Date.now() - t0) / 200).toFixed(3));
} else if (stage === 'judge') {
  //[[ BOTH SETS, because the contract-phrased set is where a rerank could QUIETLY COST something.
  //   The shipped door answers its own vocabulary 80/80 and so does the heuristic; a model asked to
  //   second-guess an already-correct shortlist can only break it. Reporting the customer set alone
  //   would hide that side of the trade entirely. ]]
  const set = arg('set', 'customer');
  out.judge = await scoreJudge(set === 'contract' ? contractQuery : customerQuery, {
    model: arg('model', '@cf/meta/llama-3.2-3b-instruct'),
    poolN: Number(arg('pool', 20)),
    maxTokens: Number(arg('max-tokens', 48)),
    temperature: Number(arg('temperature', 0)),
    snippetChars: Number(arg('snippet', 200)),
    order: arg('order', 'heuristic'),
  });
  out.judge.querySet = set;
} else {
  console.error(`unknown --stage ${stage}`); process.exit(2);
}

mkdirSync(RUNS, { recursive: true });
const suffix = stage === 'judge'
  ? `-judge-${arg('model', '').split('/').pop() || 'x'}${arg('set', 'customer') === 'contract' ? '-contract' : ''}${arg('order', 'heuristic') === 'shuffled' ? '-shuffled' : ''}`
  : '-lexical';
const path = join(RUNS, `retrieval-hybrid${suffix}.json`);
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');

console.log(`\nbaseline (shipped)  customer ${baseCustomer.top1}/80 top-1, ${baseCustomer.inTop5}/80 in-top-5 | contract ${baseContract.top1}/80`);
console.log(`  fidelity: ${out.baselineShipped.fidelity}`);
if (out.hybridHeuristic) {
  const h = out.hybridHeuristic;
  console.log(`hybrid heuristic    customer ${h.customer.top1}/80 top-1, ${h.customer.inTop5}/80 in-top-5 | contract ${h.contract.top1}/80`);
  for (const [k, v] of Object.entries(out.recall.customer)) console.log(`  ${k.padEnd(10)} ${v.hit}/${v.of}${v.missing.length && v.missing.length <= 6 ? '  missing: ' + v.missing.join(', ') : ''}`);
  console.log(`  weights: top-1 ranges ${out.weightSensitivity.top1Min}..${out.weightSensitivity.top1Max} (median ${out.weightSensitivity.top1Median}) over ${out.weightSensitivity.settingsTried} settings`);
  console.log('  pool width  recall  top-1  in-top-5');
  for (const r of out.poolWidth.rows) console.log(`    ${String(r.poolN).padStart(3)}       ${String(r.recall).padStart(4)}   ${String(r.top1).padStart(4)}   ${r.inTop5}`);
  console.log(`  ${h.settings.measuredMsPerLookup} ms per lookup, $0 per lookup, no network`);
}
if (out.judge) {
  const j = out.judge;
  console.log(`judge ${j.settings.model} set=${j.querySet} pool=${j.settings.poolN} order=${j.settings.candidateOrder} max_tokens=${j.settings.maxTokens} temp=${j.settings.temperature} snippet=${j.settings.snippetChars}`);
  console.log(`  ${j.verdict}`);
  console.log(`  recall@pool ${j.recallAtPool.hit}/${j.recallAtPool.of}  heuristic ${j.heuristicOnly.top1}/${j.heuristicOnly.inTop5}  judged ${j.judged.top1}/${j.judged.inTop5}`);
  console.log(`  judge parsed ${j.judgeParsedMean} ids per query, silent on ${j.judgeSilent}/80, kept the heuristic's winner on ${j.judgeKeptHeuristicWinner}/80`);
  console.log(`  +${j.cost.addedLatencyMsMean} ms, $${j.cost.usdPerQuery} per lookup (${j.cost.neuronsPerQuery} neurons, ${j.cost.avgPromptTokens} prompt tokens)`);
}
console.log('->', path);
