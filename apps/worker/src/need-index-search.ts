// FINDING A VERIFIED MODULE BY WHAT A CUSTOMER SAID, NOT BY WHAT ITS CONTRACT SAYS.
//
// THE MEASUREMENT THIS ANSWERS. packages/training/runs/knowledge-reach.json, 2026-09-20, against
// the Worker's own bundled code: 80 verified modules, retrieval only, limit 5. A query phrased the
// way the module's CONTRACT is phrased finds it 80/80 at rank one. A query phrased the way a
// customer talks finds it 49/80 — 31 customer-phrased needs return the wrong module first, and 13
// of those never appear in the five at all. "when a player buys something take the coins off them
// but only if they can afford it and do not already own it" does not return purchase-transaction
// anywhere; it returns trade-offer-check and cooldown-clock.
//
// So the knowledge is not missing. The door is. 2,353 sourced claims and 80 executed modules sit
// behind a lookup that fails on the way people actually write.
//
// THE SPLIT THIS FILE TAKES, and it is deliberately the unclever one. Two things are wrong at once
// and they are separable:
//
//   THE TEXT. Nothing in this repository recorded what a customer's words for a module look like.
//   packages/training/data/need-index.json now does: for every module, the production model was
//   shown the id, family, contract and Luau source, and asked what a teenage Roblox creator would
//   type when they needed it. Its answers were reduced to a vocabulary with counts. That file was
//   generated BLIND — the 80 benchmark queries were never in its context and are not importable
//   from its generator, which build-need-index.test.mjs enforces — because an index built by
//   looking at the test is a measurement of copying.
//
//   THE SCORER. searchVerifiedModules() in verified-modules.ts scores `id.includes(word)` at +3,
//   which is SUBSTRING containment: "one" scores inside h-ONE-st-percent, "out" inside
//   grid-rOUTe-cost, and 39 of the 348 distinct query words land inside some id without being a
//   token of it. Every non-zero score in the whole 80x80 grid is an integer in 1..10, so 80
//   documents are ranked on a ten-point scale and 11 of 80 queries are decided by a tie broken with
//   localeCompare. This file uses BM25F instead: whole-token matching, per-field weights, inverse
//   document frequency, and length normalisation.
//
// Both halves are measured separately in packages/training/src/measure-need-index.mjs, because an
// approach that cannot say which half earned the points is not a result anyone can build on.
//
// WHAT IT MEASURED — packages/training/runs/knowledge-reach-need-index.json, 2026-09-20, retrieval
// only, limit 5, the same 80 customer-phrased and 80 contract-phrased queries as the 61% baseline,
// run against the Worker's own bundled code with no model in the loop:
//
//                                    customer top-1   in-top-5    contract top-1
//   shipped                            49/80  61%    67/80  84%     80/80
//   shipped scorer + need text         68/80  85%    80/80 100%     80/80     <- DATA alone
//   BM25F, need field weighted zero    59/80  74%    70/80  88%     80/80     <- SCORER alone
//   BM25F + need index                 73/80  91%    79/80  99%     80/80     <- both
//
// Neither half is the story on its own and neither is redundant: the data is worth +19 under the
// old scorer, the scorer is worth +10 with no data, and together they are worth +24 rather than the
// +29 that would add up. The scorer-only row reproduces the diagnosis's independently measured
// "token ids + IDF, 59/80 and 70/80" to the query, which is the strongest evidence available that
// this harness and that one are measuring the same thing.
//
// THREE THINGS THE HEADLINE HIDES, all recorded in the run file:
//   - IN-TOP-5 GOT WORSE BY ONE. The old scorer plus need text finds all 80 somewhere in the five;
//     BM25F finds 79. Whatever is chosen, that one is `interval-overlap` and it is at rank 10.
//   - THREE QUERIES THAT USED TO BE RIGHT ARE NOW SECOND OR THIRD — turn-rotation, damage-mitigation
//     and quest-step. 27 moved the other way. A net +24 that never named its three regressions would
//     be the same number wearing a better suit.
//   - TWO GENERATED LINES CONVERGED with their benchmark query closely enough to look like copying.
//     They are named in build-need-index.test.mjs, and deleting both costs exactly one query: 73/80
//     becomes 72/80.
//
// AND THE LIMIT THAT MATTERS MOST. The benchmark is 80 sentences one session wrote by hand as a
// guess at how a customer asks. This index is a different system's guess at the same thing. Two
// guesses at one distribution agree with each other more than either agrees with real traffic, so
// 91% is an upper bound on what a logged prompt would show. The number that is not inflated by this
// is the vocabulary one: of the 157 query-word occurrences that appear in NO module contract — the
// words a contract-only scorer can never reach at any weight — the blind index produced 76 (48%)
// for the right module.
//
// THIS DOES NOT REPLACE searchVerifiedModules(). That function is untouched and still serves every
// caller. Three other approaches to the same defect are being built in parallel; this one is a
// separate named module so all four can be run against the same queries in one process.
//
// SAFETY, the same boundary verified-modules.ts keeps: both imports are static, so esbuild embeds
// them. No filesystem read, no fetch, no model call at query time — this is arithmetic over a table
// that is already in the bundle.
import bundle from '../../../packages/corpus/data/verified-modules.json';
//[[ THE SCORING VIEW, not the audit file. need-index.json keeps the eight generated sentences per
//   module so a reviewer can read what the model claimed a customer would say; a JSON import is
//   whole-file, so importing it here would put that prose into the Worker bundle to be parsed at
//   every cold start and never read. build-need-index.mjs emits both from one generation. ]]
// The SHIPPED copy, not the training scratch directory. packages/training/data/* is gitignored
// and is where the builder writes; the worker cannot import a file that is not in the repo, or a
// clean clone fails to build. See the note beside this path in .gitignore for why this one is
// committed when verified-modules.json beside it is not.
import needBundle from '../../../packages/corpus/data/need-index.json';
import type { VerifiedModule } from './verified-modules';

/** id -> [word, how many of the generated lines used it][], commonest first. */
interface NeedBundle { modules: Record<string, [string, number][]>; settings?: Record<string, unknown> }

const DATA = (bundle as unknown as { modules: VerifiedModule[] }).modules;
const NEED = (needBundle as unknown as NeedBundle).modules ?? {};

/**
 * Keep numerals whole.
 *
 * The shipped tokeniser is `split(/[^a-z0-9]+/)` with a `length > 2` filter, and between them they
 * destroy the one token that identifies four of the eighty modules: "1.5K" becomes ['1','5k'] and
 * both are dropped, "1:05" becomes ['1','05'] and both are dropped, "0 to 1" loses both ends, and
 * the "14" in "item number 14 in a grid" disappears. Lowering that length filter under the old
 * scorer makes things WORSE — measured, 61% to 59% — because a two-character token is a substring
 * of nearly everything once you match with `includes()`. It is safe here only because nothing below
 * matches by substring.
 */
const TOKEN = /[a-z]+|[0-9]+(?:[.:][0-9]+)*[a-z]*/g;
const tokenise = (s: string): string[] => String(s ?? '').toLowerCase().match(TOKEN) ?? [];

/**
 * Enough morphology that slot/slots and buy/buying are one word, and no more.
 *
 * A real stemmer would collapse pairs this corpus needs kept apart, and anything with a digit in it
 * is left exactly as written — "1.5k" must never become "1.5".
 */
function stem(w: string): string {
  if (w.length < 4 || /[0-9]/.test(w)) return w;
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

const stemsOf = (s: string) => tokenise(s).map(stem);

/**
 * Words that appear in so many of the eighty contracts that matching one says nothing.
 *
 * Kept SHORT on purpose, and it is not the shipped STOP list. IDF already handles frequency — a
 * word in sixty of eighty documents scores near zero by arithmetic rather than by opinion — so this
 * exists only for the handful of words the corpus happens to use rarely while a customer uses them
 * constantly. The shipped list stops 'the', 'and' and 'roblox' and lets through 'out', 'one', 'off'
 * and 'too', which are exactly the words that were deciding wrong answers.
 */
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'it', 'is', 'be',
  'as', 'by', 'so', 'if', 'do', 'that', 'this', 'with', 'from', 'for', 'i', 'my', 'me', 'you', 'your',
  'we', 'they', 'them', 'their', 'need', 'want', 'make', 'build', 'create', 'write', 'get', 'have',
  'has', 'should', 'would', 'could', 'can', 'will', 'module', 'script', 'code', 'function', 'luau',
  'lua', 'roblox', 'game', 'please', 'help']);

export type Field = 'id' | 'family' | 'contract' | 'need';

export interface RankerOptions {
  /** Per-field evidence weight. Set `need` to 0 to ablate the generated vocabulary entirely. */
  weights?: Partial<Record<Field, number>>;
  /** BM25 term saturation. */
  k1?: number;
  /** BM25 length normalisation, 0 = off. */
  b?: number;
  /** Cap on how many times one need-word may repeat, so a word the model used in every line
   *  cannot drown the contract. */
  needRepeatCap?: number;
  /**
   * Replace the bundled customer vocabulary, per module id.
   *
   * A seam for measurement, not for production: measure-need-index.mjs uses it to rebuild the index
   * from the first N generated lines and check that the win is not an artefact of one lucky
   * generation. Production passes nothing and reads the bundle.
   */
  needOverride?: Record<string, [string, number][]>;
}

/**
 * How much each field's evidence is worth.
 *
 * WHERE THESE FOUR NUMBERS CAME FROM, stated plainly because a constant with no provenance is a
 * constant nobody can argue with. They were chosen by judgement BEFORE anything was measured — an
 * id token is the strongest signal, a family is weaker, a contract sentence weaker still, and the
 * customer vocabulary sits between family and id because it is what the query is actually written
 * in. No sweep produced them.
 *
 * THEY ARE NOT THE BEST POINT ON THE BENCHMARK, AND THAT IS ON PURPOSE. The sweep in
 * measure-need-index.mjs was run afterwards, over the same 80 queries this is scored on, and it
 * finds 75/80 at `need: 1.2` against 73/80 here. Moving to it would buy two queries and cost the
 * number its meaning: the best cell of a grid searched on the set being reported is a measurement
 * of the grid. What the sweep is good for is the shape — every one of its 25 cells lands between
 * 72 and 75 top-1, with in-top-5 at 79 and contract top-1 at 80 throughout. A plateau that wide is
 * evidence the result belongs to the idea rather than to the constants; a spike would have been
 * evidence of the opposite, and would have been worth reporting just as loudly.
 */
export const DEFAULT_WEIGHTS: Record<Field, number> = { id: 3.2, family: 1.6, contract: 1, need: 2.1 };
/** BM25 term saturation and length normalisation. Textbook defaults; not tuned. */
export const DEFAULT_K1 = 1.2;
export const DEFAULT_B = 0.6;
export const DEFAULT_NEED_REPEAT_CAP = 3;

export interface ScoredModule { m: VerifiedModule; score: number }
export interface Ranker {
  rank(query: string): ScoredModule[];
  search(query: string, limit?: number): VerifiedModule[];
  /** What the index is made of, for a caller that wants to report it rather than assume it. */
  stats: { docs: number; vocabulary: number; avgFieldLength: number };
}

/**
 * The customer-voice vocabulary for one module, each word repeated once per generated line that
 * used it — so a word eight of eight lines reached for outweighs a word one line mentioned once.
 */
function needStems(id: string, cap: number, override?: Record<string, [string, number][]>): string[] {
  const vocabulary = override ? override[id] : NEED[id];
  if (!vocabulary) return [];
  const out: string[] = [];
  for (const [word, count] of vocabulary) {
    const stemmed = stem(word);
    for (let i = 0; i < Math.min(count, cap); i++) out.push(stemmed);
  }
  return out;
}

/** Build one immutable BM25F index over the 80 modules. ~2ms; the default one is built once below. */
export function makeRanker(options: RankerOptions = {}): Ranker {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) };
  const k1 = options.k1 ?? DEFAULT_K1;
  const b = options.b ?? DEFAULT_B;
  const cap = options.needRepeatCap ?? DEFAULT_NEED_REPEAT_CAP;

  const docs: { m: VerifiedModule; tf: Map<string, number>; length: number }[] = [];
  const df = new Map<string, number>();
  for (const m of DATA) {
    const fields: [Field, string[]][] = [
      ['id', stemsOf(m.id)],
      ['family', stemsOf(m.family)],
      ['contract', stemsOf(m.contract)],
      ['need', needStems(m.id, cap, options.needOverride)],
    ];
    const tf = new Map<string, number>();
    let length = 0;
    for (const [field, words] of fields) {
      const w = weights[field];
      if (!w) continue;
      for (const word of words) {
        if (!word || STOP.has(word)) continue;
        tf.set(word, (tf.get(word) ?? 0) + w);
        length += w;
      }
    }
    for (const word of tf.keys()) df.set(word, (df.get(word) ?? 0) + 1);
    docs.push({ m, tf, length });
  }

  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [word, count] of df) idf.set(word, Math.log(1 + (n - count + 0.5) / (count + 0.5)));
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, n);

  function rank(query: string): ScoredModule[] {
    const want = [...new Set(stemsOf(query).filter((w) => w && !STOP.has(w)))];
    if (!want.length) return [];
    const out: ScoredModule[] = [];
    for (const d of docs) {
      let score = 0;
      for (const w of want) {
        const raw = d.tf.get(w);
        if (!raw) continue;
        const norm = raw / (1 - b + b * (d.length / avg));
        score += (idf.get(w) ?? 0) * (norm * (k1 + 1)) / (norm + k1);
      }
      if (score > 0) out.push({ m: d.m, score });
    }
    //[[ localeCompare stays, because a deterministic order is worth keeping — but it must stop
    //   being load-bearing. Under the shipped integer scheme 11 of 80 queries were decided by a tie
    //   at the top score and the right module was inside that tie in 9 of them, winning 4 and
    //   losing 5. measure-need-index.mjs reports how many ties survive here. ]]
    out.sort((a, b2) => b2.score - a.score || a.m.id.localeCompare(b2.m.id));
    return out;
  }

  return {
    rank,
    search: (query, limit = 5) => rank(query).slice(0, limit).map((r) => r.m),
    stats: { docs: n, vocabulary: idf.size, avgFieldLength: avg },
  };
}

/** The one production instance. Built at module load, like the shipped table it sits beside. */
const DEFAULT_RANKER = makeRanker();

export const NEED_INDEX_COVERAGE = {
  modules: DATA.length,
  withNeedText: DATA.filter((m) => NEED[m.id]).length,
  generatedBy: (needBundle as unknown as NeedBundle).settings ?? null,
};

/** Rank every module that scores at all, best first. */
export function rankByNeed(query: string): ScoredModule[] {
  return DEFAULT_RANKER.rank(query);
}

/**
 * The drop-in shape of searchVerifiedModules(), scored against customer vocabulary instead.
 *
 * Not wired into askVerifiedModule(): verified-modules.ts is untouched, and three other approaches
 * to the same defect are in flight. Whichever wins gets wired by whoever compares them.
 */
export function searchVerifiedModulesByNeed(query: string, limit = 5): VerifiedModule[] {
  return DEFAULT_RANKER.search(query, limit);
}
