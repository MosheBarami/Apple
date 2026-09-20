// Eighty Luau modules the product can hand over instead of asking the model to re-derive them.
//
// THE MEASUREMENT THIS ANSWERS. eval-v4 put the trained model at 0/8 on game logic and its own base
// at 0/8 as well. The failures are not wild: the model writes the house style perfectly — the
// finite guard, the nil refusal, the clamp, the returned closure — and then gets the arithmetic
// wrong. `honest-percent` came back multiplying by 99 instead of 100. `remap-range` took four
// parameters where the contract has five, so there was no input value to remap and no constant
// could have saved it. It has learned what these modules LOOK like and not what they COMPUTE.
//
// The right answer to that is not a bigger prompt. It is to stop asking. These eighty modules were
// authored here, each carries exhaustive checks, and scripts/build-verified-modules.mjs RUNS every
// one of them at build time and refuses to ship a module that fails. A reviewed module is
// somebody's opinion; an executed one is a measurement.
//
// prefabs.ts already made this argument for three systems: "an instruction is re-followed from
// scratch on every project, with a fresh chance to drop one clause. These are the same rules as
// CODE, written once and installed." This is the same move, eighty times, on the logic the model
// measurably gets wrong.
//
// SAFETY. Statically imported so esbuild embeds it: no filesystem read, no fetch, no external code.
// Every line is source this repository wrote — see packages/training/src/build-game-logic.mjs.
import bundle from '../../../packages/corpus/data/verified-modules.json';
import { searchVerifiedModulesByNeed } from './need-index-search';

export interface VerifiedModule {
  id: string;
  family: string;
  contract: string;
  source: string;
  verified: string;
}

const DATA = (bundle as unknown as { modules: VerifiedModule[] }).modules;

export const VERIFIED_MODULE_IDS: readonly string[] = DATA.map((m) => m.id);
export const VERIFIED_MODULE_COUNT = DATA.length;

/** Words that carry no signal in a search over logic contracts. */
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'is', 'be', 'that',
  'with', 'i', 'need', 'want', 'make', 'build', 'create', 'write', 'module', 'script', 'luau', 'roblox', 'my', 'me']);

/**
 * The vocabulary a person uses and the vocabulary a contract uses are not the same words.
 *
 * Measured, by a test that failed: "stop the player using an ability too often" returned
 * tool-durability, ability-charges and tooltip-placement, and `cooldown-clock` — the one right
 * answer in the library — ranked nowhere. Its contract says "allow use exactly when elapsed time is
 * at least delay" and never says "cooldown", "often" or "spam". Exact-substring matching is
 * therefore not a search over intent; it is a search over spelling.
 *
 * Both halves below are deliberately small. A big synonym list starts returning a confident wrong
 * module, and a plausible wrong module is worse than a miss here: nothing downstream checks what
 * the model installs, so the customer gets logic that is silently wrong forever.
 */
const SYNONYMS: Record<string, readonly string[]> = {
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

/** Prefix-match so use/using/used are the same word, without pulling in a stemmer. */
const stem = (w: string) => (w.length > 4 ? w.slice(0, Math.max(4, w.length - 3)) : w);

const terms = (q: string) => {
  const base = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  const out = new Set<string>();
  for (const w of base) {
    out.add(w);
    for (const syn of SYNONYMS[w] ?? []) out.add(syn);
  }
  return [...out];
};

/**
 * Rank by how much of the QUERY a module's id, family and contract account for.
 *
 * Deliberately not fuzzy: a near-match that returns the wrong module is worse than no match, because
 * the model will install it and the logic will be confidently wrong in a way nothing downstream
 * checks. A miss is recoverable; a plausible wrong module is the defect this whole file exists to
 * remove.
 */
//[[ THIS NOW DELEGATES, AND THE MEASUREMENT IS WHY.
//
//   The scorer that used to live here is preserved below as `searchVerifiedModulesByContract`,
//   because it is not bad — it is PERFECT on the queries it was built for. Measured on the 80
//   verified modules, retrieval only, limit 5:
//
//     a query phrased the way the module's CONTRACT is phrased : 80/80 at rank one
//     a query phrased the way a CUSTOMER actually talks        : 49/80 at rank one
//
//   31 of 80 customer-phrased needs returned the wrong module first, and 13 never appeared in the
//   five at all. "when a player buys something take the coins off them but only if they can afford
//   it and do not already own it" did not return purchase-transaction anywhere; it returned
//   trade-offer-check and cooldown-clock.
//
//   So the knowledge was never missing. 80 executed modules sat behind a door that failed on the
//   way people write. FOUR replacements were built and measured against the same 80 queries:
//
//     better lexical scoring (stemming, IDF, length normalisation) : 59/80  (74%)
//     hybrid recall + a 70B model reranking the candidates         : 71/80  (89%), one LLM hop
//     precomputed Workers AI embeddings                            : 70/80  (87%), one embed call
//     PARAPHRASE THE DATA and index that too                       : 73/80  (91%), no call at all
//
//   The one that won attacks the corpus rather than the algorithm: each module carries generated
//   phrasings of the NEED it serves, in the words a person would use, indexed alongside its
//   contract. It is also the only one of the four that costs nothing at request time — no network,
//   no model, no added latency — and it holds contract-phrased queries at 80/80, so nothing is
//   traded away for the gain.
//
//   The index is committed rather than built, because its generator calls a paid model. See the
//   note beside it in .gitignore. ]]
export function searchVerifiedModules(query: string, limit = 5): VerifiedModule[] {
  return searchVerifiedModulesByNeed(query, limit);
}

/**
 * The original contract-phrasing scorer, kept and still reachable.
 *
 * It is 80/80 on queries written the way a module's own contract is written, which is exactly what
 * a caller that already knows the vocabulary produces. Deleting it would throw away the one thing
 * it is best in the world at; what changed is which of the two answers a CUSTOMER's words.
 */
export function searchVerifiedModulesByContract(query: string, limit = 5): VerifiedModule[] {
  const want = terms(query);
  if (!want.length) return [];
  const scored = DATA.map((m) => {
    const id = m.id.toLowerCase();
    const hay = `${id} ${m.family} ${m.contract}`.toLowerCase();
    let score = 0;
    for (const w of want) {
      const st = stem(w);
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

export function getVerifiedModule(id: string): VerifiedModule | null {
  const want = String(id ?? '').trim().toLowerCase();
  return DATA.find((m) => m.id.toLowerCase() === want) ?? null;
}

export interface VerifiedModuleAnswer {
  found: boolean;
  id?: string;
  contract?: string;
  source?: string;
  verified?: string;
  /** On a miss, and on a search, so the model can pick rather than guess. */
  candidates?: { id: string; contract: string }[];
  /** A miss is a sentence, never an empty result. */
  note?: string;
}

/**
 * Ask by id for the source, or by need for the shortlist.
 *
 * A miss SAYS so and says what to do instead. The genre guide records why that matters: a lookup
 * that answers nothing gives the model no signal, and "what a model does with no signal is proceed
 * as though it knew" — which here means writing the logic by hand, which is the 0/8.
 */
export function askVerifiedModule(input: { id?: string; need?: string }): VerifiedModuleAnswer {
  if (input.id) {
    const hit = getVerifiedModule(input.id);
    if (hit) return { found: true, id: hit.id, contract: hit.contract, source: hit.source, verified: hit.verified };
    const near = searchVerifiedModules(input.id, 5);
    return {
      found: false,
      note: `No verified module is called "${input.id}". Pick one of the candidates below by id, or write the logic yourself and say plainly that it is unverified.`,
      candidates: near.map((m) => ({ id: m.id, contract: m.contract })),
    };
  }
  const need = String(input.need ?? '').trim();
  if (!need) return { found: false, note: 'Give an id, or describe what the logic must do.' };
  const hits = searchVerifiedModules(need, 5);
  if (!hits.length) {
    return {
      found: false,
      note: `Nothing in the verified library covers "${need}". Write it yourself — and say to the customer that this part is not one of the checked modules.`,
    };
  }
  return {
    found: false,
    note: `${hits.length} verified module(s) may cover this. Call again with the id to get its source.`,
    candidates: hits.map((m) => ({ id: m.id, contract: m.contract })),
  };
}
