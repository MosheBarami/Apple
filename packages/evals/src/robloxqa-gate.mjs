#!/usr/bin/env node
// THE ROBLOXQA KNOWLEDGE REGRESSION GATE.
//
// WHAT IT MEASURES AND WHAT IT DOES NOT. Whether the model behind the generator still KNOWS the
// Roblox engine and the Luau language, after a prompt change, a model swap, or a gateway reroute.
// It measures nothing about whether the product can write working Luau — there is no code in this
// dataset at all (`dataset-card.json -> codeContent`: 0 rows with a fenced block, 0 rows with a
// newline). The code question is what `tasks/*.json` and `src/run.mjs` are for. A drop here means
// the model forgot the engine; a drop there means it forgot how to build.
//
// IT IS A RELATIVE INSTRUMENT, NOT AN ORACLE. The dataset is synthetic and its own card admits
// roughly 2% residual error. Treat a 3-point move as noise and a 15-point drop as a regression.
// Compare runs against each other, never a single run against an absolute bar.
//
// WHY IT IS RELEASE-GATED AND REFUSES TO RUN BY ACCIDENT. Scoring 3,000 multiple-choice questions
// is 3,000 model calls through the worker's admin gateway — a paid provider. This repository's
// standing constraint is that CI never calls one. So the runner requires `--i-will-pay-for-this`
// on the command line as well as credentials; nothing about importing this module, and nothing
// about `pnpm test`, can reach the network.
//
// THREE THINGS IT DOES THAT A NAIVE RUNNER WOULD NOT:
//
//   1. IT SHUFFLES THE OPTIONS. The dataset stores the correct answer in `answer` and the three
//      wrong ones in `incorrect_*`, always in that order. A runner that presented them in file
//      order would be scoring a model's willingness to pick option A. The shuffle is seeded from
//      the question text, so the same question gets the same arrangement on every run and two runs
//      are comparable.
//   2. IT DROPS THE ROWS THAT ARE NOT HELD OUT. `excluded-gate-rows.json` lists the gate questions
//      that restate a `headroom` question. Headroom is offered as tuning material; the day anyone
//      uses it, those rows would be scoring memorisation. They are dropped whether or not anyone
//      has tuned yet, because the point of a held-out split is that you do not have to remember.
//   3. IT REPORTS SUBSETS, NOT ONE NUMBER. Only 49% of rows are grounded in the engine API
//      reference; 13% come from education and tutorial pages and ask about Studio UI and pedagogy
//      ("the primary purpose of publishing a place to test it"), which says nothing about engine
//      knowledge. Reference+Luau is the headline; the rest is reported beside it, not blended in.
//      And rows grounded in `cloud/legacy/*` are dropped outright — those Open Cloud v1 pages no
//      longer exist in Roblox's live documentation, so the "correct" answer documents a product
//      that is gone.
//
// Usage:
//   API_BASE=https://<worker-host> ADMIN_KEY=<key> \
//     node src/robloxqa-gate.mjs --model stone --i-will-pay-for-this [--limit N] [--tag NAME]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { callModel } from './transport.mjs';
import { bucketOfGroundingDoc } from './qa-buckets.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DATA = join(HERE, '..', 'data', 'robloxqa');
const RESULTS = join(HERE, '..', 'results');

const SYSTEM =
  'You are answering a multiple-choice question about the Roblox engine and the Luau language. ' +
  'Reply with the single letter of the correct option and nothing else.';

/**
 * Deterministic per-question shuffle.
 *
 * Seeded from the question text rather than from a run-level RNG, so re-running the gate against a
 * different model compares like with like: every model sees option C in the same place. A
 * run-level seed would make two runs differ by arrangement as well as by answer.
 */
export function shuffleOptions(question, correct, distractors) {
  const opts = [correct, ...distractors];
  const h = createHash('sha256').update(question).digest();
  // Fisher-Yates driven by successive digest bytes; 4 options need 3 swaps.
  for (let i = opts.length - 1, b = 0; i > 0; i--, b++) {
    const j = h[b % h.length] % (i + 1);
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { options: opts, correctIndex: opts.indexOf(correct) };
}

const LETTERS = ['A', 'B', 'C', 'D'];

export function renderQuestion(row) {
  const { options, correctIndex } = shuffleOptions(row.question, row.answer, row.distractors);
  const body = options.map((o, i) => `${LETTERS[i]}. ${o}`).join('\n');
  return { prompt: `${row.question}\n\n${body}`, correctIndex, options };
}

/**
 * Read a letter out of a model's reply.
 *
 * Deliberately narrow: a bare letter, a letter with punctuation, or a leading "Answer: X". A model
 * that writes a paragraph scores zero on that row and that is the honest outcome — the prompt asks
 * for one letter, and silently rescuing prose would make the gate measure our parser's generosity
 * instead of the model's answer. `unparsed` is reported separately from `wrong` so the two cannot
 * be confused.
 */
export function parseLetter(text) {
  const t = String(text ?? '').trim();
  const m = /^(?:answer\s*[:\-]?\s*)?\(?([A-D])\)?[.):]?\s*$/i.exec(t)
    ?? /^(?:answer\s*[:\-]?\s*)?\(?([A-D])\)?[.):]\s/i.exec(t);
  return m ? LETTERS.indexOf(m[1].toUpperCase()) : -1;
}

/** Load the gate, minus the rows that are not held out and minus the stale Open Cloud v1 slice. */
export function loadGate({ dir = DATA } = {}) {
  const gatePath = join(dir, 'gate.jsonl');
  const exclPath = join(dir, 'excluded-gate-rows.json');
  if (!existsSync(gatePath)) {
    throw new Error(`${gatePath} is absent. Run \`node scripts/harvest-hf.mjs\` first — a missing gate is not an empty gate.`);
  }
  if (!existsSync(exclPath)) {
    // Fail closed. Scoring the whole split because the exclusion list is missing is exactly the
    // inflated number this arrangement exists to prevent, and it would look like a clean run.
    throw new Error(
      `${exclPath} is absent, so the rows that restate the headroom split cannot be dropped. ` +
      'Refusing to score: an un-excluded gate reports a higher number for the wrong reason.',
    );
  }
  const excluded = new Set(JSON.parse(readFileSync(exclPath, 'utf8')).rows.map((r) => r.gateRowIdx));
  const all = readFileSync(gatePath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

  const kept = [];
  const dropped = { notHeldOut: 0, cloudLegacy: 0 };
  for (let i = 0; i < all.length; i++) {
    if (excluded.has(i)) { dropped.notHeldOut++; continue; }
    const bucket = bucketOfGroundingDoc(all[i].grounding_doc_id);
    if (bucket === 'cloudLegacy') { dropped.cloudLegacy++; continue; }
    kept.push({ ...all[i], bucket, gateRowIdx: i });
  }
  return { rows: kept, dropped, total: all.length };
}

/** Headline = the engine reference plus Luau. Everything else is reported, never blended in. */
const HEADLINE_BUCKETS = new Set(['referenceEngine', 'luau']);

export function summarise(graded) {
  const tally = (rows) => {
    const n = rows.length;
    const right = rows.filter((r) => r.correct).length;
    const unparsed = rows.filter((r) => r.picked === -1).length;
    return { n, right, unparsed, score: n ? Number((right / n).toFixed(4)) : null };
  };
  const byBucket = {};
  for (const r of graded) (byBucket[r.bucket] ??= []).push(r);
  return {
    headline: tally(graded.filter((r) => HEADLINE_BUCKETS.has(r.bucket))),
    secondary: tally(graded.filter((r) => !HEADLINE_BUCKETS.has(r.bucket))),
    all: tally(graded),
    byBucket: Object.fromEntries(Object.entries(byBucket).map(([k, v]) => [k, tally(v)])),
  };
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

  if (!args.includes('--i-will-pay-for-this')) {
    console.error(
      'REFUSING TO RUN.\n\n' +
      'This scores up to 3,000 multiple-choice questions through the worker admin gateway, which\n' +
      'is a paid provider. This repository does not call one from CI or by accident. Re-run with\n' +
      '--i-will-pay-for-this if that is what you meant.\n',
    );
    process.exitCode = 2;
    return;
  }
  const apiBase = process.env.API_BASE;
  const adminKey = process.env.ADMIN_KEY;
  const model = argOf('--model', null);
  if (!apiBase || !adminKey || !model) {
    console.error('need API_BASE, ADMIN_KEY and --model <key>');
    process.exitCode = 2;
    return;
  }
  const limit = Number(argOf('--limit', '0')) || Infinity;
  const tag = argOf('--tag', 'robloxqa');

  const { rows, dropped, total } = loadGate();
  console.log(`gate: ${total} rows harvested, ${dropped.notHeldOut} dropped as not held out, ` +
              `${dropped.cloudLegacy} dropped as Open Cloud v1, ${rows.length} scoreable`);
  const scored = rows.slice(0, limit === Infinity ? rows.length : limit);
  console.log(`scoring ${scored.length} against model "${model}"\n`);

  const graded = [];
  let errors = 0;
  for (let i = 0; i < scored.length; i++) {
    const row = scored[i];
    const { prompt, correctIndex } = renderQuestion(row);
    try {
      const r = await callModel({ apiBase, adminKey, model, prompt, system: SYSTEM });
      const picked = parseLetter(r.text);
      graded.push({ gateRowIdx: row.gateRowIdx, bucket: row.bucket, picked, correctIndex, correct: picked === correctIndex });
    } catch (e) {
      // A transport failure is NOT a wrong answer. Counting it as one would make an outage look
      // like a regression; counting it as right would hide one. It is counted as neither.
      errors++;
      console.error(`  row ${row.gateRowIdx}: ${e.message}`);
    }
    if ((i + 1) % 100 === 0) process.stdout.write(`  ${i + 1}/${scored.length}\n`);
  }

  const summary = summarise(graded);
  console.log('\n' + JSON.stringify(summary, null, 2));
  if (errors) {
    console.error(
      `\n${errors} of ${scored.length} rows FAILED IN TRANSPORT and are in no bucket. ` +
      'The scores above are over the rows that answered, not over the gate.',
    );
  }

  mkdirSync(RESULTS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const out = join(RESULTS, `${tag}-${stamp}.json`);
  writeFileSync(out, JSON.stringify({
    ranAt: new Date().toISOString(), model, dataset: JSON.parse(readFileSync(join(DATA, 'dataset-card.json'), 'utf8')).revision,
    dropped, scored: scored.length, transportErrors: errors, summary, rows: graded,
  }, null, 2) + '\n');
  console.log(`\nresults -> ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
