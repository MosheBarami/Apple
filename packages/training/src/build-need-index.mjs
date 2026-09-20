#!/usr/bin/env node
/**
 * THE DOOR IS INDEXED ON THE WRONG TEXT.
 *
 * `askVerifiedModule({need})` is the only way eighty executed Luau modules reach a customer's
 * build, and knowledge-reach.json measured it: a query phrased the way the module's own CONTRACT is
 * phrased finds it 80/80 times; a query phrased the way a customer talks finds it 49/80. The
 * library is not missing knowledge. It is indexed on function-signature vocabulary and searched in
 * teenage-Roblox vocabulary, and nothing in the repository records the second one.
 *
 * This script records it. For each module it asks the PRODUCTION model — the same
 * @cf/zai-org/glm-5.3-flash the `stone` lane serves — to write the messages a Roblox creator might
 * type when they need exactly this logic, and stores the union of that vocabulary next to the
 * module. searchVerifiedModulesByNeed() in apps/worker/src/verified-modules.ts scores against it.
 *
 * BLINDNESS, WHICH IS THE WHOLE VALIDITY OF THE RESULT.
 * The benchmark this change is scored against is 80 hand-written customer-phrased queries in
 * packages/training/src/customer-queries.mjs. If those queries reached the generator — through an
 * import, through a few-shot example, through an instruction naming one of their words — the
 * measurement afterwards would be a measurement of copying, and the number would not survive
 * contact with a real customer.
 *
 * So: this file does not import customer-queries.mjs, and `npm test` enforces that
 * (build-need-index.test.mjs greps this source and the generated bundle). The prompt below contains
 * no example phrasing at all — not one noun — precisely so it cannot leak a benchmark word. The
 * generator sees the module's id, family, contract and Luau source, and nothing else.
 *
 * WHAT IS STORED, AND WHY IT IS TOKENS AND NOT SENTENCES. Retrieval never reads a paraphrase as
 * prose; it reads its words. Storing the deduplicated token multiset instead of eight sentences
 * keeps the bundle a quarter of the size for the same ranking behaviour, and makes the diff
 * reviewable: you can see exactly which words the model believes a customer would use, and object
 * to one.
 *
 * Run:  node packages/training/src/build-need-index.mjs            (calls the model; costs neurons)
 *       node packages/training/src/build-need-index.mjs --dry      (prints one prompt, spends zero)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const DEFAULT_OUT = resolve(HERE, '..', 'data', 'need-index.json');

try {
  for (const line of readFileSync(join(REPO, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* ambient environment */ }

//[[ THE CANONICAL ORIGIN, not whichever one .env happens to point at.
//   golem.moshe-barami111.workers.dev is a deployed worker that answers /api/* and is a DIFFERENT
//   BUILD; measure-knowledge-reach.mjs already records why naming it production is the
//   gateway-config-versus-lane mistake wearing a hostname. For a paraphrase it is the SERVED MODEL
//   that matters, and every entry records `servedBy` so a reader can check rather than trust. ]]
const BASE = (process.env.NEED_INDEX_BASE || 'https://apple.moshe-barami111.workers.dev').replace(/\/+$/, '');
const KEY = process.env.GOLEM_ADMIN_KEY || '';
const flag = (n) => process.argv.includes(`--${n}`);
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
//[[ --from/--to/--out exist because the gateway was congested enough that eighty sequential calls
//   took the better part of an hour. Two workers on disjoint halves, merged with --fill, is the
//   same eighty prompts in half the wall clock and changes nothing about what is generated. ]]
const OUT = opt('out', DEFAULT_OUT);
/**
 * WHAT THE WORKER ACTUALLY IMPORTS.
 *
 * The audit file keeps the eight generated sentences per module, because a reviewer has to be able
 * to read what the model claimed a customer would say and object to one. The Worker never reads
 * them — it ranks on the vocabulary — and a JSON import is whole-file, so shipping the prose would
 * put roughly two thirds of this artifact into the bundle to be parsed at every cold start and
 * never looked at. So the generator emits both, and need-index-search.ts imports the small one.
 */
const MIN_OUT = OUT.replace(/\.json$/, '.min.json');

/** The scoring view: provenance plus vocabulary, no prose. */
export function minify(full) {
  const modules = {};
  for (const [id, entry] of Object.entries(full.modules)) modules[id] = entry.vocabulary;
  return {
    schemaVersion: full.schemaVersion,
    what: 'Scoring view of need-index.json — vocabulary only. The generated sentences, the blindness argument and the failure list live in need-index.json beside it.',
    generatedAt: full.generatedAt,
    settings: full.settings,
    modules,
  };
}

/** `stone` is what the apple lane is routed to; see gatewayModelFor in do/session.ts. */
const MODEL = 'stone';
const MAX_TOKENS = 420;
const LINES = 8;

const SYSTEM = 'You output only the requested lines, one per line, with no numbering, no bullets, no quotes and no preamble.';

//[[ NOT ONE EXAMPLE WORD IN HERE, AND THE RULE IS CHECKABLE.
//
//   An instruction like "if one line says range, another should say slot" would be me handing the
//   generator a benchmark token and then congratulating it for returning that token. So the
//   instruction asks for variety in the abstract and demonstrates none of it.
//
//   The checkable form of that, enforced by build-need-index.test.mjs: every word of this template
//   that appears in a benchmark query but in NO module contract must be one the indexer throws
//   away — a word in STOP below reaches the index with frequency zero and cannot move a ranking.
//   The first draft failed it on one word, "different", which survived into seven modules'
//   vocabulary; it was replaced and the whole index regenerated rather than argued about. ]]
export const promptFor = (m) => `A library of small, separately tested Luau modules is being indexed so that Roblox creators can find a module by describing, in their own words, what they need it to do.

MODULE ID: ${m.id}
FAMILY: ${m.family}
CONTRACT: ${m.contract}
SOURCE:
${m.source}

Write ${LINES} one-line messages, no two alike, that a Roblox creator — a teenager building a game, not a professional programmer — might type into a game-building chat when what they need is exactly this module.

Rules:
- Everyday spoken words, not the contract's vocabulary and not function names.
- Make the ${LINES} lines unlike each other: vary the nouns, vary the verbs, vary the framing. Some short and blunt, some a full sentence.
- Several of them should name a concrete in-game situation this logic is for.
- Write any number the way a player would see it on screen.
- ${LINES} lines. Nothing else.`;

export const GENERATOR_STOP = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'for', 'to', 'of', 'in', 'on', 'at', 'is', 'it',
  'be', 'as', 'by', 'so', 'if', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'just',
  'that', 'this', 'these', 'those', 'with', 'from', 'into', 'out', 'up', 'down', 'over', 'under', 'than',
  'then', 'when', 'where', 'what', 'which', 'who', 'how', 'why', 'not', 'no', 'yes', 'i', 'im', 'my', 'me',
  'you', 'your', 'we', 'they', 'them', 'their', 'there', 'here', 'need', 'want', 'make', 'build', 'create',
  'write', 'get', 'got', 'have', 'has', 'had', 'use', 'using', 'used', 'help', 'please', 'thx', 'thanks',
  'some', 'any', 'one', 'two', 'all', 'each', 'every', 'more', 'most', 'like', 'way', 'thing', 'things',
  'module', 'script', 'code', 'function', 'lua', 'luau', 'roblox', 'game', 'player', 'players', 'work',
  'works', 'working', 'know', 'let', 'lets', 'its', 'am', 'are', 'was', 'were', 'been', 'being', 'anyone',
  'someone', 'something', 'stuff', 'okay', 'ok']);

/** Same tokenizer the scorer uses; see TOKEN in apps/worker/src/verified-modules.ts. */
const TOKEN = /[a-z]+|[0-9]+(?:[.:][0-9]+)*[a-z]*/g;
export const tokenise = (s) => String(s ?? '').toLowerCase().match(TOKEN) ?? [];

/** Vocabulary a customer would use for this module, with how many of the lines used it. */
export function vocabularyOf(lines) {
  const counts = new Map();
  for (const line of lines) {
    const seen = new Set(tokenise(line).filter((w) => w.length > 1 && !GENERATOR_STOP.has(w)));
    for (const w of seen) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * A MODULE THE GATEWAY HICCUPPED ON IS NOT A MODULE WITH NO CUSTOMER VOCABULARY.
 *
 * The first run of this script lost ten of eighty to transient HTTP 500s and wrote the file anyway.
 * Ten modules with an empty need entry are ten modules the door still cannot find, and the
 * retrieval number afterwards would have been a number about a 70-module index reported as an
 * 80-module one. eval-production.mjs was corrected for exactly this: a prompt that was never
 * answered is not a prompt the model got wrong. So: retry with backoff, and whatever is still
 * missing is named in `failures` and asserted against in build-need-index.test.mjs.
 */
async function ask(prompt, attempts = 4) {
  let last = { error: 'no attempt' };
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1500 * i));
    let r;
    try {
      r = await fetch(`${BASE}/api/admin/model-test`, {
        method: 'POST',
        headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, prompt, system: SYSTEM, maxTokens: MAX_TOKENS }),
      });
    } catch (e) { last = { error: 'fetch failed', detail: String(e).slice(0, 200) }; continue; }
    if (!r.ok) { last = { error: `HTTP ${r.status}`, detail: (await r.text().catch(() => '')).slice(0, 200) }; continue; }
    const body = await r.json().catch(() => null);
    if (!body || !body.ok || !String(body.text ?? '').trim()) { last = { error: 'empty text', detail: JSON.stringify(body ?? {}).slice(0, 200) }; continue; }
    return body;
  }
  return last;
}

/**
 * MERGE THE PARTS OF A SPLIT RUN INTO ONE INDEX.
 *
 * Eighty sequential calls took the better part of an hour while the gateway was busy, so the run is
 * split across workers on disjoint ranges. This puts them back together, and REFUSES to merge parts
 * that were generated by different prompts — which is the one way a split run could quietly produce
 * an index that no single prompt ever made, with a promptHash that lies about the rest of it.
 */
export function mergeParts(dir) {
  const files = readdirSync(dir).filter((f) => /^need-part-\d+\.json$/.test(f)).sort();
  if (!files.length) throw new Error(`no need-part-*.json in ${dir}`);
  const parts = files.map((f) => ({ f, data: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
  const hashes = new Set(parts.map((p) => p.data.settings.promptHash));
  if (hashes.size !== 1) {
    throw new Error(`parts were generated by ${hashes.size} different prompts: ${[...hashes].join(', ')}`);
  }
  const modules = {};
  const failures = [];
  const origins = new Set();
  const cost = { calls: 0, inputTokens: 0, outputTokens: 0, neurons: 0, providerMs: 0 };
  for (const { data } of parts) {
    for (const [id, entry] of Object.entries(data.modules)) modules[id] ??= entry;
    for (const fail of data.failures) failures.push(fail);
    for (const o of data.settings.origins ?? [data.settings.base]) origins.add(o);
    for (const k of Object.keys(cost)) cost[k] += data.cost[k] ?? 0;
  }
  const head = parts[0].data;
  return {
    ...head,
    generatedAt: new Date().toISOString(),
    settings: { ...head.settings, origins: [...origins], splitAcross: files },
    cost,
    failures: failures.filter((f) => !modules[f.id]),
    modules,
  };
}

async function main() {
  if (opt('merge', null)) {
    const merged = mergeParts(opt('merge'));
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(merged, null, 1) + '\n');
    writeFileSync(MIN_OUT, JSON.stringify(minify(merged)) + '\n');
    console.log(`merged ${merged.settings.splitAcross.length} parts -> ${OUT}`);
    console.log(`  ${Object.keys(merged.modules).length} modules, ${merged.failures.length} unrepaired failures`);
    console.log(`  spend: ${merged.cost.inputTokens} in / ${merged.cost.outputTokens} out tokens, ${merged.cost.neurons} neurons`);
    return;
  }
  const modules = JSON.parse(readFileSync(join(REPO, 'packages/corpus/data/verified-modules.json'), 'utf8')).modules;
  //[[ --fill keeps what is already there and generates only what is missing, so a gateway hiccup
  //   costs ten calls to repair rather than eighty. ]]
  let prior = null;
  if (flag('fill')) { try { prior = JSON.parse(readFileSync(OUT, 'utf8')); } catch { prior = null; } }
  if (flag('dry')) {
    console.log(promptFor(modules[0]));
    console.log('\n--- %d modules, 1 call each, model=%s maxTokens=%d', modules.length, MODEL, MAX_TOKENS);
    return;
  }
  if (!KEY) { console.error('GOLEM_ADMIN_KEY missing'); process.exit(2); }

  const entries = { ...(prior?.modules ?? {}) };
  const failures = [];
  const origins = new Set(prior?.settings?.origins ?? (prior ? [prior.settings.base] : []));
  origins.add(BASE);
  let inTok = prior?.cost?.inputTokens ?? 0, outTok = prior?.cost?.outputTokens ?? 0;
  let neurons = prior?.cost?.neurons ?? 0, ms = prior?.cost?.providerMs ?? 0;
  let calls = prior?.cost?.calls ?? 0;
  let provider = prior?.settings?.provider ?? null, served = prior?.settings?.servedBy ?? null;
  const FROM = Number(opt('from', 0));
  const TO = Number(opt('to', modules.length));
  for (let i = 0; i < modules.length; i++) {
    const m = modules[i];
    if (i < FROM || i >= TO) continue;
    if (entries[m.id]) { process.stdout.write(`\r${i + 1}/${modules.length} ${m.id.padEnd(28)} (kept)`); continue; }
    calls++;
    const res = await ask(promptFor(m));
    if (res.error) {
      failures.push({ id: m.id, why: res.error, detail: res.detail ?? null });
      process.stdout.write(`\n  ! ${m.id}: ${res.error}\n`);
      continue;
    }
    provider ??= res.provider; served ??= res.model;
    inTok += res.usage?.inputTokens ?? 0; outTok += res.usage?.outputTokens ?? 0;
    neurons += res.neurons ?? 0; ms += res.ms ?? 0;
    const lines = String(res.text).split('\n').map((l) => l.replace(/^\s*[-*\d.)\]]+\s*/, '').trim())
      .filter((l) => l.length > 3);
    entries[m.id] = { lines, vocabulary: vocabularyOf(lines) };
    process.stdout.write(`\r${i + 1}/${modules.length} ${m.id.padEnd(28)}`);
  }
  process.stdout.write('\n');

  const out = {
    schemaVersion: 1,
    what: 'Customer-voice need vocabulary per verified module, generated blind to the benchmark queries.',
    blindness: 'Generated from each module id/family/contract/source only. packages/training/src/customer-queries.mjs was never read by this script and is not importable from it; build-need-index.test.mjs enforces that.',
    generatedAt: new Date().toISOString(),
    settings: { base: BASE, origins: [...origins], route: '/api/admin/model-test', model: MODEL, servedBy: served, provider, maxTokens: MAX_TOKENS, linesRequested: LINES, systemPrompt: SYSTEM, promptHash: createHash('sha256').update(promptFor(modules[0])).digest('hex').slice(0, 16) },
    cost: { calls, inputTokens: inTok, outputTokens: outTok, neurons, providerMs: ms },
    failures,
    modules: entries,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  writeFileSync(MIN_OUT, JSON.stringify(minify(out)) + '\n');
  console.log(`wrote ${OUT}\n  ${Object.keys(entries).length}/${modules.length} modules, ${failures.length} failures`);
  console.log(`  spend: ${inTok} in / ${outTok} out tokens, ${neurons} neurons, ${ms}ms of provider time`);
}

//[[ IMPORTING THIS FILE MUST NOT SPEND MONEY. build-need-index.test.mjs imports it for its
//   tokeniser, and a match rule loose enough to fire under `node --test` would have the test suite
//   making eighty gateway calls. Checked against the invoked path explicitly. ]]
if ((process.argv[1] ?? '').endsWith('build-need-index.mjs')) await main();
