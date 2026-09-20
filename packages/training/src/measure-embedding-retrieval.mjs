#!/usr/bin/env node
/**
 * DOES AN EMBEDDING INDEX OPEN THE DOOR THAT THE KEYWORD SCORER STICKS ON?
 *
 * THE MEASUREMENT THIS ANSWERS. packages/training/runs/knowledge-reach.json, measured 2026-09-20
 * against the Worker's own bundled code: the 80 verified modules are found 80/80 when the query is
 * phrased like the module's own contract, and 49/80 (61%) when the query is phrased the way a
 * customer talks. 31 customer-phrased queries return the wrong module first. The knowledge is
 * present and is not reached — this repository's central failure mode, at the knowledge layer.
 *
 * docs/knowledge-retrieval-diagnosis.md establishes that a pure scoring fix tops out at 74% top-1
 * and 88% in-top-5, because six of the thirty-one failures are VOCABULARY ABSENT: the customer's
 * noun appears nowhere in the module's id, family or contract, so no weighting over those tokens
 * can reach it. `interval-overlap` scores ZERO on "check if two time slots clash".
 *
 * An embedding does not score tokens. It is the one family of fix that can put "clash" near
 * "overlap" without anybody writing a synonym row, so it is the one that can pass that ceiling.
 * Whether it DOES is what this script measures, and it is allowed to come back and say no.
 *
 * WHAT IS COMPARED, ALL ON THE SAME 80 QUERIES, limit 5, no model in the loop, nothing generated:
 *
 *   lexical   searchVerifiedModules() — the SHIPPED function, bundled out of apps/worker/src with
 *             the repo's own esbuild. Not a copy retyped here: a copy would measure a fiction that
 *             resembles production. Reproducing 49/80 is the check that the harness is honest.
 *   embed     cosine similarity against Workers AI embeddings of each module's id, family and
 *             contract, precomputed. One embedding call at query time, nothing else.
 *   hybrid    reciprocal-rank fusion of the two. Kept because the two make DIFFERENT mistakes:
 *             a scorer that knows the word "overlap" is in the contract and one that knows "clash"
 *             means overlap are not redundant.
 *
 * THE CONTRACT SET IS A GUARD, NOT A TROPHY. The shipped scorer is at 100% there. Any change that
 * raises the customer number and drops the contract number has moved the failure rather than
 * removed it, so both are reported, every time, side by side.
 *
 * QUERY SETS ARE READ OUT OF THE RECORDED RUN, not re-authored. packages/training/runs/
 * knowledge-reach.json holds the exact 80 customer strings and the exact 80 contract strings that
 * produced the 61% baseline. Re-typing them would silently compare two different benchmarks.
 *
 * Usage:
 *   node packages/training/src/measure-embedding-retrieval.mjs                  (default model)
 *   node packages/training/src/measure-embedding-retrieval.mjs --sweep          (all models/variants)
 *   node packages/training/src/measure-embedding-retrieval.mjs --latency 30     (adds a timing run)
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadEnv, embedAll, embedBatch, normalise, dot, REPO } from './workers-ai-embed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(HERE, '..', 'runs');
const CACHE_DIR = process.env.EMBED_CACHE_DIR || join(tmpdir(), 'golem-embed-cache');

//[[ THE CANONICAL ORIGIN, copied from measure-knowledge-reach.mjs rather than reinvented.
//   golem.moshe-barami111.workers.dev also answers /api/* and is a DIFFERENT BUILD. Timing that one
//   and calling the result production would be the gateway-config-versus-lane mistake wearing a
//   hostname. ]]
const WORKER_BASE = (process.env.API_BASE_PRODUCTION || 'https://apple.moshe-barami111.workers.dev').replace(/\/+$/, '');
// Read LAZILY: loadEnv() populates process.env from .env further down this file, so capturing the
// admin key at module scope here would capture undefined and silently skip the in-Worker timing.
const adminKey = () => process.env.GOLEM_ADMIN_KEY;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

// ---------------------------------------------------------------------------
// The corpus, and the query sets, both read from disk rather than restated here.
// ---------------------------------------------------------------------------
const MODULES = JSON.parse(readFileSync(join(REPO, 'packages/corpus/data/verified-modules.json'), 'utf8')).modules;
const UI = JSON.parse(readFileSync(join(REPO, 'packages/corpus/data/ui-construction.json'), 'utf8'));
const UI_ROWS = [...UI.genres, ...UI.screens];
const RECORDED = JSON.parse(readFileSync(join(RUNS_DIR, 'knowledge-reach.json'), 'utf8'));

const CUSTOMER = RECORDED.customer.rows.map((r) => ({ id: r.id, query: r.query }));
const CONTRACT = RECORDED.contract.rows.map((r) => ({ id: r.id, query: r.query }));
const UI_QUERIES = RECORDED.uiConstruction.rows.map((r) => r.query);

/**
 * WHAT COUNTS AS THE RIGHT ANSWER FOR A UI LOOKUP, and why there are two answer keys.
 *
 * The recorded run decided coverage by ID: a query is answerable when some row's id normalises to
 * it, and 29 of the 53 were recorded as "no row at all". Reading the rows' own `label` fields shows
 * that verdict was too harsh for nine of them — `simulator`'s label literally ends "/ clicker",
 * `obby`'s is "Obby / parkour", `screen-rewards` is "The DAILY REWARDS / login-streak screen".
 * A retrieval that answers "clicker" with `simulator` is right, and the id-only key scores it wrong.
 *
 * So both keys are computed and both are reported:
 *   strict  the recorded run's own rule — id match only. Comparable to the 18/53 baseline.
 *   label   id match, plus the nine the rows' labels themselves cover. Quoted below so the
 *           judgement can be disputed instead of trusted.
 * Everything not in either key is genuinely uncovered, and the RIGHT behaviour there is a miss
 * that says it is a miss. That is counted separately as `falseConfidence`, because an embedding
 * index with no floor will answer every query with its nearest row and look like a triumph.
 */
const LABEL_EVIDENCE = {
  shooter: ['fps_arena', 'label: "Arena shooter / round-based FPS"'],
  clicker: ['simulator', 'label: "Cartoony simulator / pet-sim / clicker"'],
  parkour: ['obby', 'label: "Obby / parkour"'],
  fighting: ['anime_battle', 'label: "Anime fighting / battlegrounds"'],
  crafting: ['survival', 'label: "Survival / crafting"'],
  'daily rewards': ['screen-rewards', 'label: "The DAILY REWARDS / login-streak screen"'],
  'battle pass': ['screen-progress', 'label: "The BATTLE PASS / SEASON PASS screen"'],
  tower_defence: ['tower_defense', 'the British spelling of an existing row'],
  'quest log': ['anime_battle', 'label: "… quest list …" — the only row that records a quest panel'],
};
function uiKeys() {
  const byId = new Map(UI_ROWS.map((r) => [r.genre.toLowerCase(), r.genre]));
  const norm = (s) => s.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const normed = new Map(UI_ROWS.map((r) => [norm(r.genre), r.genre]));
  const strict = new Map(); const label = new Map();
  for (const q of UI_QUERIES) {
    const hit = byId.get(q.trim().toLowerCase())
      ?? normed.get(norm(q))
      ?? normed.get(`screen-${norm(q)}`)
      ?? null;
    strict.set(q, hit);
    label.set(q, hit ?? LABEL_EVIDENCE[q.trim().toLowerCase()]?.[0] ?? null);
  }
  // `fps` reached fps_arena in the recorded run through the unranked contains-fallback; it is a
  // real abbreviation of a real row, so it belongs in both keys.
  if (!strict.get('fps')) { strict.set('fps', 'fps_arena'); label.set('fps', 'fps_arena'); }
  return { strict, label };
}
const UI_KEY = uiKeys();

// ---------------------------------------------------------------------------
// The shipped lexical scorer, bundled from the Worker's own source.
// ---------------------------------------------------------------------------
function loadShipped() {
  const dir = mkdtempSync(join(tmpdir(), 'embed-retrieval-'));
  const entry = join(dir, 'entry.ts');
  const out = join(dir, 'shipped.mjs');
  const S = join(REPO, 'apps', 'worker', 'src');
  writeFileSync(entry, [
    `export { searchVerifiedModules } from ${JSON.stringify(join(S, 'verified-modules.ts'))};`,
    `export { getUIConstruction } from ${JSON.stringify(join(S, 'ui-construction-guide.ts'))};`,
    `export * as embed from ${JSON.stringify(join(S, 'embedding-retrieval.ts'))};`,
  ].join('\n'));
  execFileSync(join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--loader:.json=json', '--outfile=' + out],
    { stdio: 'pipe' });
  return import(out);
}

// ---------------------------------------------------------------------------
// Document text variants. What you hand the encoder is a design decision, so it is measured
// rather than assumed.
// ---------------------------------------------------------------------------
const words = (s) => s.replace(/[-_]+/g, ' ');
const DOC_TEXT = {
  // The contract alone: the function signature and its rules, in the vocabulary of a signature.
  contract: (m) => m.contract,
  // Everything the row already carries. No new prose was authored for any module — writing a
  // "what a customer would call this" line per module against this benchmark would be fitting the
  // index to the test.
  full: (m) => `${words(m.id)}. ${words(m.family)}. ${m.contract}`,
};
// bge-*-en-v1.5 was trained with an asymmetric instruction on the QUERY side only.
const QUERY_PREFIX = {
  none: '',
  bge: 'Represent this sentence for searching relevant passages: ',
};

const MODELS = [
  { id: '@cf/baai/bge-m3', dims: 1024, usdPerMTok: 0.0118 },
  { id: '@cf/baai/bge-base-en-v1.5', dims: 768, usdPerMTok: 0.0666 },
  { id: '@cf/baai/bge-large-en-v1.5', dims: 1024, usdPerMTok: 0.204 },
  { id: '@cf/baai/bge-small-en-v1.5', dims: 384, usdPerMTok: 0.0202 },
  { id: '@cf/qwen/qwen3-embedding-0.6b', dims: 1024, usdPerMTok: 0.0118 },
  { id: '@cf/google/embeddinggemma-300m', dims: 768, usdPerMTok: null },
];

// ---------------------------------------------------------------------------
// A disk cache, so a re-run of the report costs nothing and the numbers are stable.
// ---------------------------------------------------------------------------
const env = loadEnv();
mkdirSync(CACHE_DIR, { recursive: true });
const cacheKey = (model, texts) =>
  createHash('sha256').update(model).update('\u0000').update(texts.join('\u0000')).digest('hex').slice(0, 32);

let spentNeurons = 0; let spentTokens = 0; let liveCalls = 0;
async function embedCached(model, texts, tag) {
  const path = join(CACHE_DIR, `${tag}-${cacheKey(model, texts)}.json`);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  process.stderr.write(`  embedding ${texts.length} × ${tag} on ${model} …`);
  const r = await embedAll(texts, { model, ...env, batch: 32 });
  process.stderr.write(` ${r.ms}ms ${r.neurons.toFixed(3)} neurons\n`);
  spentNeurons += r.neurons; spentTokens += r.inputTokens; liveCalls += r.calls;
  const payload = { model, vectors: r.vectors.map(normalise), neurons: r.neurons, inputTokens: r.inputTokens };
  writeFileSync(path, JSON.stringify(payload));
  return payload;
}

// ---------------------------------------------------------------------------
// Rankers
// ---------------------------------------------------------------------------
function rankByEmbedding(queryVec, docVecs, ids) {
  const scored = ids.map((id, i) => ({ id, score: dot(queryVec, docVecs[i]) }));
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored;
}

/** Reciprocal-rank fusion. k=60 is the value the original RRF paper settled on. */
function rrf(lists, k = 60) {
  const acc = new Map();
  for (const list of lists) {
    list.forEach((id, i) => acc.set(id, (acc.get(id) ?? 0) + 1 / (k + i + 1)));
  }
  return [...acc.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function score(rows, rankFn, limit = 5) {
  let top1 = 0; let inTop = 0; const failures = [];
  for (const row of rows) {
    const ranked = rankFn(row.query).slice(0, limit).map((r) => r.id ?? r);
    const at = ranked.indexOf(row.id);
    if (at === 0) top1 += 1;
    if (at !== -1) inTop += 1;
    else failures.push({ id: row.id, query: row.query, returned: ranked });
  }
  return {
    n: rows.length, top1, top1Pct: Math.round((top1 / rows.length) * 1000) / 10,
    inTop5: inTop, inTop5Pct: Math.round((inTop / rows.length) * 1000) / 10,
    failures,
  };
}

/** Recall of a candidate stage: is the answer anywhere in the pool a reranker would see? */
function recallAt(rows, rankFn, depth) {
  let hit = 0;
  for (const row of rows) {
    const ranked = rankFn(row.query).slice(0, depth).map((r) => r.id ?? r);
    if (ranked.includes(row.id)) hit += 1;
  }
  return { depth, hit, n: rows.length, pct: Math.round((hit / rows.length) * 1000) / 10 };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const shipped = await loadShipped();
const MODULE_IDS = MODULES.map((m) => m.id);

// Sanity: the harness must reproduce the recorded baseline or it is measuring something else.
const lexRank = (q) => shipped.searchVerifiedModules(q, 80).map((m) => ({ id: m.id, score: null }));
const baselineCustomer = score(CUSTOMER, lexRank);
const baselineContract = score(CONTRACT, lexRank);
const reproduces = baselineCustomer.top1 === RECORDED.customer.top1
  && baselineCustomer.inTop5 === RECORDED.customer.inTop5
  && baselineContract.top1 === RECORDED.contract.top1;
process.stderr.write(
  `\nshipped lexical scorer, re-run here: customer ${baselineCustomer.top1}/80 top-1, `
  + `${baselineCustomer.inTop5}/80 in-top-5 | contract ${baselineContract.top1}/80 top-1\n`
  + `recorded run said: ${RECORDED.customer.top1}/80, ${RECORDED.customer.inTop5}/80, ${RECORDED.contract.top1}/80`
  + ` -> ${reproduces ? 'REPRODUCED' : 'DOES NOT REPRODUCE — stop and find out why'}\n\n`,
);

const variants = flag('sweep')
  ? MODELS.flatMap((m) => ['full', 'contract'].flatMap((d) => ['none', 'bge'].map((p) => ({ model: m, doc: d, prefix: p }))))
  : [{ model: MODELS.find((m) => m.id === (arg('model', '@cf/baai/bge-m3'))), doc: arg('doc', 'full'), prefix: arg('prefix', 'none') }];

const results = [];
for (const v of variants) {
  const tag = `${v.model.id.split('/').pop()}|doc=${v.doc}|q=${v.prefix}`;
  const docTexts = MODULES.map(DOC_TEXT[v.doc]);
  const docs = await embedCached(v.model.id, docTexts, 'docs');
  const pre = QUERY_PREFIX[v.prefix];
  const custTexts = CUSTOMER.map((r) => pre + r.query);
  const contTexts = CONTRACT.map((r) => pre + r.query);
  const cust = await embedCached(v.model.id, custTexts, 'cust');
  const cont = await embedCached(v.model.id, contTexts, 'cont');

  const custVec = new Map(CUSTOMER.map((r, i) => [r.query, cust.vectors[i]]));
  const contVec = new Map(CONTRACT.map((r, i) => [r.query, cont.vectors[i]]));
  const vecFor = (q) => custVec.get(q) ?? contVec.get(q);
  const embRank = (q) => rankByEmbedding(vecFor(q), docs.vectors, MODULE_IDS);
  const hybRank = (q) => rrf([embRank(q).map((r) => r.id), lexRank(q).map((r) => r.id)]);

  // WEIGHTED FUSION, swept, because one fusion rule failing is not the same as fusion failing.
  // RRF is rank-only and throws away how confident the embedding was. This adds the lexical score
  // back as a fraction of the cosine, w=0 being pure embedding.
  const lexScoreMap = new Map();
  const lexScored = (q) => {
    if (!lexScoreMap.has(q)) {
      const list = shipped.searchVerifiedModules(q, 80);
      // searchVerifiedModules does not return its scores, so rank position stands in for them,
      // decayed the way RRF decays: 1/(1+rank). Stated because it is an approximation.
      lexScoreMap.set(q, new Map(list.map((m, i) => [m.id, 1 / (1 + i)])));
    }
    return lexScoreMap.get(q);
  };
  const weighted = (w) => (q) => {
    const lex = lexScored(q);
    return embRank(q)
      .map((r) => ({ id: r.id, score: r.score + w * (lex.get(r.id) ?? 0) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  };
  const fusionSweep = [0, 0.05, 0.1, 0.2, 0.4, 0.8].map((w) => {
    const s = score(CUSTOMER, weighted(w));
    return { w, top1: s.top1, inTop5: s.inTop5, contractTop1: score(CONTRACT, weighted(w)).top1 };
  });

  const row = {
    variant: tag, model: v.model.id, dims: v.model.dims, doc: v.doc, queryPrefix: v.prefix,
    embedding: { customer: score(CUSTOMER, embRank), contract: score(CONTRACT, embRank) },
    hybrid: { customer: score(CUSTOMER, hybRank), contract: score(CONTRACT, hybRank) },
    weightedFusion: fusionSweep,
    recall: {
      embeddingCustomer: [10, 20].map((d) => recallAt(CUSTOMER, embRank, d)),
      hybridCustomer: [10, 20].map((d) => recallAt(CUSTOMER, hybRank, d)),
    },
  };
  results.push(row);
  process.stderr.write(
    `  ${tag.padEnd(46)} embed ${String(row.embedding.customer.top1).padStart(2)}/80 top-1 `
    + `${String(row.embedding.customer.inTop5).padStart(2)}/80 in-5 | hybrid ${String(row.hybrid.customer.top1).padStart(2)}/80 `
    + `${String(row.hybrid.customer.inTop5).padStart(2)}/80 | contract embed ${row.embedding.contract.top1}/80 hybrid ${row.hybrid.contract.top1}/80\n`,
  );
}

const best = results.slice().sort((a, b) =>
  (b.embedding.customer.top1 + b.embedding.customer.inTop5) - (a.embedding.customer.top1 + a.embedding.customer.inTop5))[0];
const bestModel = MODELS.find((m) => m.id === best.model);

// ---------------------------------------------------------------------------
// THE SHIPPED PATH, not the prototype.
//
// Everything above ranks float32 vectors held in this process. What would actually ship is
// apps/worker/src/embedding-retrieval.ts reading an int8-quantised index out of the bundle. Those
// are two different programs, and reporting the first one's number as the second one's is exactly
// the substitution this repository keeps getting caught by. So the shipped module is bundled with
// the repo's own esbuild and scored on the same queries, and both numbers are printed.
// ---------------------------------------------------------------------------
let shippedPath = null;
let shippedQueryVectors = null;
if (shipped.embed?.EMBEDDING_MODEL) {
  const m = shipped.embed;
  const sameModel = m.EMBEDDING_MODEL === best.model;
  // The query prefix is read OFF THE INDEX, not chosen here. If the index was built with an
  // instruction and this measurement embedded without one, the number would be quietly low and
  // nothing would say why — the same silent-degradation shape the module's own comment warns about.
  const pfx = m.EMBEDDING_QUERY_PREFIX ?? '';
  const qv = await embedCached(m.EMBEDDING_MODEL, CUSTOMER.map((r) => pfx + r.query), 'cust');
  const qvC = await embedCached(m.EMBEDDING_MODEL, CONTRACT.map((r) => pfx + r.query), 'cont');
  shippedQueryVectors = new Map([...CUSTOMER.map((r, i) => [r.query, qv.vectors[i]]),
    ...CONTRACT.map((r, i) => [r.query, qvC.vectors[i]])]);
  const byQ = shippedQueryVectors;
  const shippedRank = (q) => m.searchModulesByVector(byQ.get(q), 20);
  const cust = score(CUSTOMER, shippedRank);
  const cont = score(CONTRACT, shippedRank);
  // The float baseline for the SAME model, so the quantisation's cost is a subtraction and not a
  // claim. If these differ the int8 packing is lossy in a way that matters and must be said.
  const floatVariant = results.find((r) => r.model === m.EMBEDDING_MODEL && r.doc === 'full' && r.queryPrefix === 'none');
  shippedPath = {
    module: 'apps/worker/src/embedding-retrieval.ts',
    model: m.EMBEDDING_MODEL, dims: m.EMBEDDING_DIMS,
    indexBuiltAt: m.EMBEDDING_BUILT_AT,
    quantisation: 'int8 in the bundle, dequantised per row at load',
    indexBytes: readFileSync(join(REPO, 'apps/worker/src/generated/embedding-index.json')).length,
    customer: cust, contract: cont,
    float32SameModel: floatVariant
      ? { customerTop1: floatVariant.embedding.customer.top1, customerInTop5: floatVariant.embedding.customer.inTop5 }
      : null,
    quantisationCostTop1: floatVariant ? cust.top1 - floatVariant.embedding.customer.top1 : null,
    indexIsBestSweepModel: sameModel,
  };
  process.stderr.write(
    `\n  SHIPPED module (int8, ${m.EMBEDDING_MODEL}): customer ${cust.top1}/80 top-1, ${cust.inTop5}/80 in-top-5`
    + ` | contract ${cont.top1}/80 top-1 | quantisation cost ${shippedPath.quantisationCostTop1 ?? '?'} top-1\n`,
  );
}

// ---------------------------------------------------------------------------
// UI construction, same treatment.
// ---------------------------------------------------------------------------

// THE UI LOOKUP IS NOT THE SAME PROBLEM AND IS NOT ASSUMED TO HAVE THE SAME ANSWER.
// The 80 module queries are sentences; 45 of the 53 UI lookups are one or two words ("hud", "rpg",
// "chat"). An encoder that is strong on one is not therefore strong on the other, and taking the
// module winner as the UI winner without looking would be the same unearned transfer this
// repository keeps having to undo. So every model is measured here too.
const uiDocTexts = UI_ROWS.map((r) => {
  const demos = (r.demonstrates ?? []).slice(0, 4).join(' ');
  return `${words(r.genre)}. ${r.label}. ${demos}`.slice(0, 1400);
});
const UI_IDS = UI_ROWS.map((r) => r.genre);
const SHIPPED_MODEL = shipped.embed?.EMBEDDING_MODEL ?? best.model;
const uiModels = flag('sweep')
  ? MODELS
  : MODELS.filter((m) => m.id === SHIPPED_MODEL || m.id === '@cf/baai/bge-m3');
// The asymmetric bge-en-v1.5 family gets its training-time instruction; the symmetric encoders do
// not. This is the model's documented contract, not a knob tuned on the benchmark.
const prefixFor = (id) => (id.includes('bge') && id.includes('en-v1.5') ? QUERY_PREFIX.bge : '');
const uiPre = prefixFor(SHIPPED_MODEL);

const uiByModel = [];
for (const m of uiModels) {
  const d = await embedCached(m.id, uiDocTexts, 'uidocs');
  const q = await embedCached(m.id, UI_QUERIES.map((s) => prefixFor(m.id) + s), 'uiq');
  uiByModel.push({ model: m.id, docs: d.vectors, queries: q.vectors });
}
const uiPick = uiByModel.find((e) => e.model === SHIPPED_MODEL) ?? uiByModel[0];
let uiDocs = { vectors: uiPick.docs };
let uiQ = { vectors: uiPick.queries };

/** Sweep the floor, because the floor is the whole design: below it the answer must be a miss. */
const uiScoreAt = (floor) => {
  const rows = UI_QUERIES.map((q, i) => {
    const ranked = rankByEmbedding(uiQ.vectors[i], uiDocs.vectors, UI_IDS);
    const topId = ranked[0].id; const topScore = ranked[0].score;
    const answered = topScore >= floor ? topId : null;
    return {
      query: q, answered, topId, similarity: Math.round(topScore * 1000) / 1000,
      expectedStrict: UI_KEY.strict.get(q), expectedLabel: UI_KEY.label.get(q),
      runnerUp: ranked[1] ? { id: ranked[1].id, similarity: Math.round(ranked[1].score * 1000) / 1000 } : null,
    };
  });
  const tally = (key) => {
    let right = 0; let wrongAnswer = 0; let missedCovered = 0; let falseConfidence = 0; let correctMiss = 0;
    for (const r of rows) {
      const want = key === 'strict' ? r.expectedStrict : r.expectedLabel;
      if (want) {
        if (r.answered === want) right += 1;
        else if (r.answered) wrongAnswer += 1;
        else missedCovered += 1;
      } else if (r.answered) falseConfidence += 1;
      else correctMiss += 1;
    }
    const covered = rows.filter((r) => (key === 'strict' ? r.expectedStrict : r.expectedLabel)).length;
    return { covered, right, wrongAnswer, missedCovered, falseConfidence, correctMiss,
      rightPct: Math.round((right / covered) * 1000) / 10 };
  };
  return { floor, strict: tally('strict'), label: tally('label'), rows };
};
const uiFloors = [0, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7].map(uiScoreAt);

/**
 * TWO STAGES, IN THIS ORDER: identity, then similarity.
 *
 * The 53 lookups split into two different problems and treating them as one is what breaks today.
 * Twenty-five are a row's OWN NAME — including the four underscore ids the model is handed verbatim
 * by get_ui_construction's description and pinned into get_genre_kit's JSON enum. Answering those
 * with a nearest-neighbour search would be replacing a deterministic bug with a probabilistic one.
 * They are settled by folding separators out of BOTH sides, which is one line and cannot miss.
 * Only what identity cannot resolve reaches the embedding, and only above the floor.
 */
const uiTwoStage = (floor) => {
  const rows = UI_QUERIES.map((q, i) => {
    const byId = shipped.embed.resolveUIByIdentity(q, UI_IDS);
    let answered = byId; let via = byId ? 'identity' : null; let sim = null;
    if (!answered) {
      const ranked = rankByEmbedding(uiQ.vectors[i], uiDocs.vectors, UI_IDS);
      sim = Math.round(ranked[0].score * 1000) / 1000;
      if (ranked[0].score >= floor) { answered = ranked[0].id; via = 'embedding'; }
    }
    return { query: q, answered, via, similarity: sim,
      expectedStrict: UI_KEY.strict.get(q), expectedLabel: UI_KEY.label.get(q) };
  });
  const tally = (key) => {
    let right = 0; let wrongAnswer = 0; let missedCovered = 0; let falseConfidence = 0; let correctMiss = 0;
    for (const r of rows) {
      const want = key === 'strict' ? r.expectedStrict : r.expectedLabel;
      if (want) { if (r.answered === want) right += 1; else if (r.answered) wrongAnswer += 1; else missedCovered += 1; }
      else if (r.answered) falseConfidence += 1; else correctMiss += 1;
    }
    const covered = rows.filter((r) => (key === 'strict' ? r.expectedStrict : r.expectedLabel)).length;
    return { covered, right, wrongAnswer, missedCovered, falseConfidence, correctMiss,
      rightPct: Math.round((right / covered) * 1000) / 10 };
  };
  return { floor, strict: tally('strict'), label: tally('label'), rows };
};
const uiTwoStageFloors = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7].map(uiTwoStage);

/**
 * THE COMPOSITION THAT WOULD ACTUALLY SHIP: the LIVE getUIConstruction first, embedding only for
 * what it returns a miss on.
 *
 * Written this way on purpose. While this was being measured another workflow landed the
 * underscore fix inside ui-construction-guide.ts — both sides of the comparison now canonicalise
 * `tower_defense`, and its lexical resolver answers 25 of the 33 covered lookups with zero
 * confident wrong answers. Embedding is not a REPLACEMENT for that and claiming it as one would be
 * taking credit for somebody else's fix. It is the layer underneath: the nine lookups that are a
 * row's own label in the customer's words ("clicker", "parkour", "battle pass") and the ones no
 * token match can reach. Stage one is exact and free; stage two only runs on a miss, so the
 * embedding call is not on the hot path for the queries that already work.
 */
const uiLayered = (floor) => {
  const rows = UI_QUERIES.map((q, i) => {
    const live = shipped.getUIConstruction({ id: q });
    let answered = live.found ? live.id : null;
    let via = live.found ? 'lexical' : null;
    let sim = null;
    if (!answered) {
      const ranked = rankByEmbedding(uiQ.vectors[i], uiDocs.vectors, UI_IDS);
      sim = Math.round(ranked[0].score * 1000) / 1000;
      if (ranked[0].score >= floor) { answered = ranked[0].id; via = 'embedding'; }
    }
    return { query: q, answered, via, similarity: sim,
      expectedStrict: UI_KEY.strict.get(q), expectedLabel: UI_KEY.label.get(q) };
  });
  const tally = (key) => {
    let right = 0; let wrongAnswer = 0; let missedCovered = 0; let falseConfidence = 0; let correctMiss = 0;
    for (const r of rows) {
      const want = key === 'strict' ? r.expectedStrict : r.expectedLabel;
      if (want) { if (r.answered === want) right += 1; else if (r.answered) wrongAnswer += 1; else missedCovered += 1; }
      else if (r.answered) falseConfidence += 1; else correctMiss += 1;
    }
    const covered = rows.filter((r) => (key === 'strict' ? r.expectedStrict : r.expectedLabel)).length;
    return { covered, right, wrongAnswer, missedCovered, falseConfidence, correctMiss,
      rightPct: Math.round((right / covered) * 1000) / 10 };
  };
  return { floor, strict: tally('strict'), label: tally('label'), rows,
    answeredByEmbedding: rows.filter((r) => r.via === 'embedding').length };
};
const uiLayeredFloors = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65].map(uiLayered);

// Every model, on the two-stage resolver, so the UI choice is made on evidence and not inherited
// from the module benchmark. `right` is on the label key; `falseConfidence` is how many of the
// genuinely uncovered lookups came back with a confident wrong row.
const uiModelTable = [];
for (const entry of uiByModel) {
  uiDocs = { vectors: entry.docs }; uiQ = { vectors: entry.queries };
  const floors = [0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8].map((f) => {
    const r = uiTwoStage(f);
    return { floor: f, right: r.label.right, covered: r.label.covered, wrong: r.label.wrongAnswer,
      strictRight: r.strict.right, strictCovered: r.strict.covered,
      falseConfidence: r.label.falseConfidence, uncovered: r.label.falseConfidence + r.label.correctMiss };
  });
  // The floor worth reporting is the one that answers the most covered lookups while inventing
  // nothing: right, then fewest confident wrong answers on uncovered queries.
  const bestFloor = floors.slice().sort((a, b) =>
    (b.right - b.falseConfidence - b.wrong) - (a.right - a.falseConfidence - a.wrong) || a.floor - b.floor)[0];
  uiModelTable.push({ model: entry.model, floors, bestFloor });
  process.stderr.write(
    `  UI ${entry.model.padEnd(34)} best floor ${bestFloor.floor}: right ${bestFloor.right}/${bestFloor.covered}, `
    + `wrong ${bestFloor.wrong}, false-confident ${bestFloor.falseConfidence}/${bestFloor.uncovered}\n`,
  );
}
// Restore the chosen model's vectors for everything printed below.
uiDocs = { vectors: uiPick.docs }; uiQ = { vectors: uiPick.queries };

// The shipped function, on the same 53, for the side-by-side.
const uiShipped = (() => {
  let rightStrict = 0; let rightLabel = 0; let falseConfidence = 0; let correctMiss = 0; let found = 0;
  const rows = [];
  for (const q of UI_QUERIES) {
    const a = shipped.getUIConstruction({ id: q });
    const answered = a.found ? a.id : null;
    if (a.found) found += 1;
    const ws = UI_KEY.strict.get(q); const wl = UI_KEY.label.get(q);
    if (ws && answered === ws) rightStrict += 1;
    if (wl && answered === wl) rightLabel += 1;
    if (!wl && answered) falseConfidence += 1;
    if (!wl && !answered) correctMiss += 1;
    rows.push({ query: q, answered, expectedStrict: ws, expectedLabel: wl });
  }
  return { found, rightStrict, rightLabel, falseConfidence, correctMiss, rows };
})();

// ---------------------------------------------------------------------------
// Latency and cost, measured rather than estimated.
// ---------------------------------------------------------------------------
let latency = null;
const latencyN = Number(arg('latency', flag('sweep') ? 0 : 30));
if (latencyN > 0) {
  process.stderr.write(`\n  timing ${latencyN} single-query embeddings on ${SHIPPED_MODEL} …\n`);
  const embedMs = []; const controlMs = [];
  for (let i = 0; i < latencyN; i += 1) {
    const q = CUSTOMER[i % CUSTOMER.length].query;
    const r = await embedBatch([uiPre + q], { model: SHIPPED_MODEL, ...env });
    embedMs.push(r.ms); spentNeurons += r.neurons; spentTokens += r.inputTokens; liveCalls += 1;
    //[[ A CONTROL, because the number above is not the number production would pay. This laptop is
    //   not a Worker: every embed call carries a full round trip from here to Cloudflare's edge on
    //   top of the model's own compute, and only the second part is what a Worker would add.
    //
    //   THE FIRST CONTROL WAS WRONG AND IS RECORDED HERE RATHER THAN QUIETLY REPLACED. It timed
    //   /ai/models/search?per_page=1, which came back at 222 ms p50 against the embedding's 162 ms
    //   — a "transport cost" LARGER than the thing it was supposed to be a floor under, which
    //   would have produced a NEGATIVE model-compute estimate. That endpoint queries a catalogue;
    //   it is not transport. The control has to be the cheapest request this API will answer, so
    //   it is now the unrouted API root, which returns its error without doing any work. ]]
    const t0 = Date.now();
    await fetch('https://api.cloudflare.com/client/v4/', { method: 'GET' }).then((r2) => r2.text());
    controlMs.push(Date.now() - t0);
  }
  const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];

  //[[ THE IN-NETWORK MEASUREMENT, which is the one the question actually asks for.
  //
  //   The Worker ALREADY embeds. apps/worker/src/gateway.ts exports embed(), rag.ts calls it on
  //   every documentation lookup, and /api/admin/rag-test drives exactly that path. So an embedding
  //   call inside a Worker can be timed on the DEPLOYED production build without deploying
  //   anything: time rag-test, time /api/health on the same origin in the same loop, and subtract.
  //
  //   WHAT THE DELTA IS AND IS NOT. rag-test is embed + a Vectorize query + a D1 FTS5 query + the
  //   fusion. The proposal here is embed + 80 dot products over an in-memory Int8Array. So the
  //   delta is an UPPER BOUND on what this retrieval would add, and a generous one — it is carrying
  //   two database round trips this design does not make.
  //
  //   UNCACHED ON PURPOSE. gateway.ts passes gatewayOpts(env, kind, 86_400), so AI Gateway serves a
  //   repeated query from cache. Every probe below gets a unique suffix so none of them can be a
  //   cache hit, and the cached case is timed separately because it is the one a busy day mostly
  //   pays. ]]
  let inWorker = null;
  const KEY = adminKey();
  if (KEY) {
    const salt = Date.now().toString(36);
    const ragMs = []; const healthMs = []; const cachedMs = [];
    const time = async (fn) => { const t = Date.now(); await fn(); return Date.now() - t; };
    const ragCall = (q) => fetch(`${WORKER_BASE}/api/admin/rag-test`, {
      method: 'POST', headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    }).then((r) => r.text());
    const probes = Math.min(20, latencyN);
    for (let i = 0; i < probes; i += 1) {
      healthMs.push(await time(() => fetch(`${WORKER_BASE}/api/health`).then((r) => r.text())));
      ragMs.push(await time(() => ragCall(`how do i use a RemoteEvent ${salt}-${i}`)));
    }
    // Same string twice: the second one should be the AI Gateway cache.
    await ragCall(`how do i use a RemoteEvent cached-${salt}`);
    for (let i = 0; i < probes; i += 1) {
      cachedMs.push(await time(() => ragCall(`how do i use a RemoteEvent cached-${salt}`)));
    }
    const delta = pct(ragMs, 0.5) - pct(healthMs, 0.5);
    inWorker = {
      origin: WORKER_BASE,
      what: '/api/admin/rag-test (embed + Vectorize + D1 FTS) minus /api/health on the same origin',
      n: probes,
      ragUncachedMs: { p50: pct(ragMs, 0.5), p90: pct(ragMs, 0.9), min: Math.min(...ragMs) },
      ragCachedMs: { p50: pct(cachedMs, 0.5), p90: pct(cachedMs, 0.9), min: Math.min(...cachedMs) },
      healthMs: { p50: pct(healthMs, 0.5), p90: pct(healthMs, 0.9), min: Math.min(...healthMs) },
      addedMsUpperBound: delta,
      //[[ THE DECOMPOSITION THAT ACTUALLY ISOLATES THE EMBEDDING.
      //   The subtraction that failed from the laptop works here, because there is a control that
      //   really is the same work minus one thing. Uncached and cached rag-test run the IDENTICAL
      //   code — same Vectorize query, same D1 FTS5 query, same fusion — and differ only in whether
      //   AI Gateway served the embedding from its 86,400 s cache. So (uncached - cached) is the
      //   embedding call's own cost with everything else held constant, and (cached - health) is
      //   the two database round trips this design does not make at all. ]]
      embedOwnCostMs: pct(ragMs, 0.5) - pct(cachedMs, 0.5),
      databaseRoundTripsMs: pct(cachedMs, 0.5) - pct(healthMs, 0.5),
      addedMsNote:
        'UPPER BOUND. rag-test also runs a Vectorize query and a D1 FTS5 query that this design does '
        + 'not make; the embedding is one of three round trips inside that delta. The embedding model '
        + 'timed there is @cf/baai/bge-small-en-v1.5, which is what gateway.ts embed() uses — the '
        + 'same family and a SMALLER model than the one indexed here, so the figure is not a like-for-'
        + 'like substitute for bge-m3 and is labelled accordingly.',
    };
    process.stderr.write(
      `  in-Worker: rag-test p50 ${inWorker.ragUncachedMs.p50}ms (cached ${inWorker.ragCachedMs.p50}ms), `
      + `health p50 ${inWorker.healthMs.p50}ms -> added <= ${delta}ms\n`,
    );
  }

  latency = {
    n: latencyN, model: SHIPPED_MODEL,
    fromLaptop: {
      measuredFrom: 'this laptop, over the public internet, against the Workers AI REST route',
      embedMs: { p50: pct(embedMs, 0.5), p90: pct(embedMs, 0.9), min: Math.min(...embedMs), max: Math.max(...embedMs) },
      controlMs: { p50: pct(controlMs, 0.5), p90: pct(controlMs, 0.9), min: Math.min(...controlMs) },
      //[[ NOT A NUMBER, ON PURPOSE.
      //   The intended decomposition was embedMs minus controlMs. It does not work: the cheapest
      //   request api.cloudflare.com will answer came back SLOWER than the embedding call itself
      //   (279 ms p50 against 183 ms), so the subtraction is negative. A negative model-compute
      //   time is not a fast model, it is a failed measurement, and this repository has a name for
      //   letting one render as the other. The field says so instead of printing the number. ]]
      modelComputeEstimateMs: null,
      whyNoEstimate:
        'the control (an unrouted GET to the API root) is slower than the embedding call it was '
        + 'meant to be a floor under, so the subtraction is meaningless. Use inWorker below.',
    },
    inWorker,
  };
  process.stderr.write(
    `  laptop embed p50 ${latency.fromLaptop.embedMs.p50}ms p90 ${latency.fromLaptop.embedMs.p90}ms `
    + `(upper bound; includes this machine's round trip)\n`,
  );
}

const queryTokens = Math.round(spentTokens / Math.max(1, liveCalls));
const SHIPPED_PRICE = (MODELS.find((m) => m.id === SHIPPED_MODEL) ?? bestModel).usdPerMTok;
const cost = {
  model: SHIPPED_MODEL,
  usdPerMillionInputTokens: SHIPPED_PRICE,
  priceSource: 'the account\'s own Workers AI model catalogue, read live at /accounts/:id/ai/models/search',
  note: 'Workers AI bills embeddings per input token. A retrieval costs ONE query embedding; the '
    + 'module and screen vectors are precomputed at build time and shipped in the bundle.',
  // MEASURED, AND THE LIMIT OF THE MEASUREMENT. Of the six embedding models on this account only
  // @cf/baai/bge-m3 returns a per-call meter (meta.cost_metric_value_1 and meta.neurons); the rest
  // return only the tensor shape. So the token count below is REAL for bge-m3 calls and zero for
  // the others, and the per-request figure is the catalogue price times a token count measured on
  // these same strings by the one model that will report it. Said out loud because a cost quoted
  // as measured when it was computed is the same defect as a config name quoted as a lane.
  perCallMeterAvailable: SHIPPED_MODEL === '@cf/baai/bge-m3',
  measuredNeuronsThisRun: Math.round(spentNeurons * 1000) / 1000,
  measuredInputTokensThisRun: spentTokens,
  liveCalls,
  perRequestUsd: bestModel.usdPerMTok === null ? null
    : Math.round((25 / 1e6) * bestModel.usdPerMTok * 1e10) / 1e10,
  perRequestBasis: 'a 25-token customer request, the median length of the 80 benchmark queries',
};

const out = {
  measuredAt: new Date().toISOString(),
  what: 'RETRIEVAL ONLY, with an embedding index. Same 80 customer and 80 contract queries as '
    + 'knowledge-reach.json, same limit of 5, no model in the loop and nothing generated.',
  harness: {
    querySets: 'read verbatim from packages/training/runs/knowledge-reach.json',
    lexicalScorer: 'searchVerifiedModules() bundled out of apps/worker/src with the repo esbuild',
    reproducesRecordedBaseline: reproduces,
    recordedBaseline: {
      customerTop1: RECORDED.customer.top1, customerInTop5: RECORDED.customer.inTop5,
      contractTop1: RECORDED.contract.top1, uiFound: RECORDED.uiConstruction.found,
    },
    rerunBaseline: {
      customerTop1: baselineCustomer.top1, customerInTop5: baselineCustomer.inTop5,
      contractTop1: baselineContract.top1,
    },
  },
  modules: { variants: results, best: best.variant, shippedPath },
  uiConstruction: {
    n: UI_QUERIES.length,
    answerKeys: {
      strict: 'the recorded run\'s own rule: a row whose id normalises to the query, else uncovered',
      label: 'strict, plus rows whose own label covers the query — evidence below',
      labelEvidence: LABEL_EVIDENCE,
      coveredStrict: [...UI_KEY.strict.values()].filter(Boolean).length,
      coveredLabel: [...UI_KEY.label.values()].filter(Boolean).length,
    },
    shipped: uiShipped,
    embedding: { model: best.model, floors: uiFloors.map(({ rows, ...rest }) => rest), rowsAtChosenFloor: null },
    twoStage: {
      what: 'identity fold first (fixes the underscore ids deterministically), embedding above the floor for the rest',
      floors: uiTwoStageFloors.map(({ rows, ...rest }) => rest),
      byModel: uiModelTable,
    },
    layered: {
      what: 'the LIVE getUIConstruction first, embedding only on its miss',
      floors: uiLayeredFloors.map(({ rows, ...rest }) => rest),
      rowsAtChosenFloor: uiLayered(Number(arg('ui-floor', String(shipped.embed?.UI_SIMILARITY_FLOOR ?? 0.55)))).rows,
      rowsAtChosenFloor: uiTwoStage(Number(arg('ui-floor', String(shipped.embed?.UI_SIMILARITY_FLOOR ?? 0.7)))).rows,
    },
  },
  latency, cost,
};
// Keep the per-query detail for the floor that is actually being proposed.
const chosenFloor = Number(arg('ui-floor', String(shipped.embed?.UI_SIMILARITY_FLOOR ?? 0.7)));
out.uiConstruction.embedding.chosenFloor = chosenFloor;
out.uiConstruction.embedding.rowsAtChosenFloor = uiScoreAt(chosenFloor).rows;

mkdirSync(RUNS_DIR, { recursive: true });
const path = join(RUNS_DIR, flag('sweep') ? 'embedding-retrieval-sweep.json' : 'embedding-retrieval.json');
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');

console.log(`\nBASELINE (shipped lexical, re-run here): customer ${baselineCustomer.top1}/80 (${baselineCustomer.top1Pct}%) top-1, ${baselineCustomer.inTop5}/80 (${baselineCustomer.inTop5Pct}%) in-top-5`);
for (const r of results) {
  console.log(`\n${r.variant}`);
  console.log(`  embedding  customer ${r.embedding.customer.top1}/80 (${r.embedding.customer.top1Pct}%) top-1, ${r.embedding.customer.inTop5}/80 (${r.embedding.customer.inTop5Pct}%) in-top-5 | contract ${r.embedding.contract.top1}/80 top-1`);
  console.log(`  hybrid     customer ${r.hybrid.customer.top1}/80 (${r.hybrid.customer.top1Pct}%) top-1, ${r.hybrid.customer.inTop5}/80 (${r.hybrid.customer.inTop5Pct}%) in-top-5 | contract ${r.hybrid.contract.top1}/80 top-1`);
  console.log(`  recall@10  embedding ${r.recall.embeddingCustomer[0].pct}% | hybrid ${r.recall.hybridCustomer[0].pct}%`);
}
console.log(`\nUI construction, ${UI_QUERIES.length} lookups. shipped: found ${uiShipped.found}, right ${uiShipped.rightLabel}/${out.uiConstruction.answerKeys.coveredLabel} under the label key, false-confident ${uiShipped.falseConfidence}`);
console.log('  embedding alone:');
for (const f of uiFloors) {
  console.log(`    floor ${f.floor.toFixed(2)}: right ${f.label.right}/${f.label.covered} (${f.label.rightPct}%), wrong ${f.label.wrongAnswer}, missed ${f.label.missedCovered}, false-confident ${f.label.falseConfidence}/${f.label.falseConfidence + f.label.correctMiss}`);
}
console.log('  LIVE getUIConstruction first, then embedding above the floor (the shipping composition):');
for (const f of uiLayeredFloors) {
  console.log(`    floor ${f.floor.toFixed(2)}: right ${f.label.right}/${f.label.covered} (${f.label.rightPct}%) label-key | ${f.strict.right}/${f.strict.covered} strict-key, wrong ${f.label.wrongAnswer}, false-confident ${f.label.falseConfidence}/${f.label.falseConfidence + f.label.correctMiss}, answered-by-embedding ${f.answeredByEmbedding}`);
}
console.log('  identity fold only, then embedding above the floor:');
for (const f of uiTwoStageFloors) {
  console.log(`    floor ${f.floor.toFixed(2)}: right ${f.label.right}/${f.label.covered} (${f.label.rightPct}%) label-key | ${f.strict.right}/${f.strict.covered} strict-key, wrong ${f.label.wrongAnswer}, false-confident ${f.label.falseConfidence}/${f.label.falseConfidence + f.label.correctMiss}`);
}
if (shippedPath) {
  console.log(`\nSHIPPED MODULE ${shippedPath.module} (${shippedPath.model}, int8, ${Math.round(shippedPath.indexBytes / 1024)} KB in the bundle)`);
  console.log(`  customer ${shippedPath.customer.top1}/80 (${shippedPath.customer.top1Pct}%) top-1, ${shippedPath.customer.inTop5}/80 (${shippedPath.customer.inTop5Pct}%) in-top-5 | contract ${shippedPath.contract.top1}/80 top-1`);
  console.log(`  quantisation cost vs float32 on the same model: ${shippedPath.quantisationCostTop1} top-1`);
}
console.log('\n->', path);
