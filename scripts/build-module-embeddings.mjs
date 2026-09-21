#!/usr/bin/env node
/**
 * PRECOMPUTE THE INDEX AT BUILD TIME, so a retrieval costs one embedding call and not eighty-one.
 *
 * WHAT THIS WRITES. apps/worker/src/generated/embedding-index.json — one vector per verified module
 * and one per UI construction row, int8-quantised and base64-packed, plus the model id, the
 * dimension, and a SHA-256 of the exact text that was embedded. esbuild inlines it into the Worker
 * bundle the same way verified-modules.json is inlined today: no filesystem read at runtime, no
 * fetch, no external code.
 *
 * WHY THE CONTENT HASH IS THE POINT. An index built from an older corpus still loads, still returns
 * five confident answers, and says nothing. That is this repository's own failure mode — a thing
 * PRESENT and never checked — so the hash of every embedded string travels with the vectors and
 * apps/worker/tests/embedding-retrieval.test.mjs fails the build when the corpus has moved and the
 * index has not. A stale index must be a red test, never a quiet wrong answer.
 *
 * WHY INT8. The float32 vectors are 80 × 1024 × 4 = 328 KB for the modules alone, and the Worker
 * bundle is a shared budget. Quantising to int8 with one scale per vector costs 4× less and,
 * measured on the same 80 customer queries, changes top-1 by zero — see
 * packages/training/runs/embedding-retrieval.json. A compression that cost accuracy would have to
 * be reported; this one did not, and the measurement is what says so rather than the intuition.
 *
 * Usage:
 *   node scripts/build-module-embeddings.mjs                       (writes the index)
 *   node scripts/build-module-embeddings.mjs --model @cf/... --check
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, embedAll, normalise } from '../packages/training/src/workers-ai-embed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

/**
 * THE MODEL, AND WHY THIS ONE — AND WHY THE CHOICE IS WORTH LESS THAN IT LOOKS.
 *
 * Six embedding models answer on this account and all six were measured on the same 80
 * customer-phrased queries AND the same 53 UI lookups: packages/training/runs/
 * embedding-retrieval-sweep.json. Module top-1, with no per-model tuning at all (id + family +
 * contract, no query instruction), ran 65, 66, 66, 68, 70, 73 out of 80 against a shipped 49.
 * SAY THAT FIRST: the win belongs to the approach, and every one of the six delivers it.
 *
 * The choice between them is worth about eight queries and it was made on the same 80 it is
 * reported on, so the headline figure is selection-optimistic and the report says so.
 *
 * @cf/google/embeddinggemma-300m was the single best module scorer at 73/80 — it is flagged BETA
 * on the account's own listing and carries NO published price, so its cost line would be a guess.
 * @cf/qwen/qwen3-embedding-0.6b took modules 70/80 and then collapsed on the UI lookups (23/33,
 * adding NOTHING over the deterministic identity fold), which is the reason this file does not
 * simply inherit the module winner.
 * @cf/baai/bge-base-en-v1.5 is the one that is strong on both: modules 69/80 top-1 and 79/80
 * in-top-5, UI 27/33 with ZERO confident wrong answers on the twenty genuinely uncovered lookups.
 * It is not beta, it publishes a price, and at 768 dimensions its index is the smallest of the
 * strong ones.
 */
const MODEL = arg('model', '@cf/baai/bge-base-en-v1.5');

/**
 * bge-*-en-v1.5 is ASYMMETRIC: it was trained with this instruction on the query side and nothing
 * on the document side. Measured here, applying it moves module top-1 from 66/80 to 69/80 on this
 * model — and applying it to the DOCUMENTS as well is the mistake it invites, so this constant is
 * consumed by the query path only and is recorded in the index so the two sides cannot drift.
 */
const QUERY_PREFIX = MODEL.includes('bge') && MODEL.includes('en-v1.5')
  ? 'Represent this sentence for searching relevant passages: '
  : '';

const words = (s) => s.replace(/[-_]+/g, ' ');

/**
 * WHAT GETS EMBEDDED, and what deliberately does not.
 *
 * Only text the corpus already carries: the id with its hyphens opened out, the family, and the
 * contract. No per-module "here is how a customer would say it" line was authored. Writing one
 * while looking at the benchmark would fit the index to the test and the 80/80 that came back
 * would mean nothing. Measured: id+family+contract beats contract alone by 4 to 11 top-1 depending
 * on the model, so the ids are carrying real signal and are kept.
 */
export const moduleText = (m) => `${words(m.id)}. ${words(m.family)}. ${m.contract}`;

/** The same rule for a UI row: its id, its own label sentence, and what it was observed doing. */
export const uiText = (r) =>
  `${words(r.genre)}. ${r.label}. ${(r.demonstrates ?? []).slice(0, 4).join(' ')}`.slice(0, 1400);

/** int8, one scale per vector. The vector is L2-normalised first, so the scale is its max magnitude. */
export function quantise(vec) {
  const unit = normalise(vec);
  let max = 0;
  for (const x of unit) max = Math.max(max, Math.abs(x));
  const scale = max || 1;
  const bytes = Buffer.alloc(unit.length);
  for (let i = 0; i < unit.length; i += 1) {
    // Int8 range is -128..127; clamp to ±127 so the two directions are symmetric.
    bytes[i] = Math.max(-127, Math.min(127, Math.round((unit[i] / scale) * 127))) & 0xff;
  }
  return { b64: bytes.toString('base64'), scale };
}

export const textHash = (texts) =>
  createHash('sha256').update(texts.join('\u0000')).digest('hex').slice(0, 16);

async function main() {
  const env = loadEnv();
  const modules = JSON.parse(readFileSync(join(REPO, 'packages/corpus/data/verified-modules.json'), 'utf8')).modules;
  const ui = JSON.parse(readFileSync(join(REPO, 'packages/corpus/data/ui-construction.json'), 'utf8'));
  const uiRows = [...ui.genres, ...ui.screens];

  const moduleTexts = modules.map(moduleText);
  const uiTexts = uiRows.map(uiText);

  process.stderr.write(`embedding ${moduleTexts.length} modules + ${uiTexts.length} UI rows on ${MODEL}\n`);
  const mv = await embedAll(moduleTexts, { model: MODEL, ...env, batch: 32 });
  const uv = await embedAll(uiTexts, { model: MODEL, ...env, batch: 32 });
  const dims = mv.vectors[0].length;
  if (uv.vectors[0].length !== dims) throw new Error('module and UI vectors disagree on dimension');

  const index = {
    schemaVersion: 1,
    model: MODEL,
    dims,
    queryPrefix: QUERY_PREFIX,
    quantisation: 'int8, one scale per vector, over the L2-normalised vector',
    builtAt: new Date().toISOString(),
    builtBy: 'scripts/build-module-embeddings.mjs',
    // The guard: the exact strings that were embedded, hashed. See the header.
    moduleTextHash: textHash(moduleTexts),
    uiTextHash: textHash(uiTexts),
    cost: {
      inputTokens: mv.inputTokens + uv.inputTokens,
      neurons: Math.round((mv.neurons + uv.neurons) * 1000) / 1000,
      note: 'paid once at build time, never at request time',
    },
    modules: modules.map((m, i) => ({ id: m.id, ...quantise(mv.vectors[i]) })),
    ui: uiRows.map((r, i) => ({ id: r.genre, ...quantise(uv.vectors[i]) })),
  };

  const dir = join(REPO, 'apps', 'worker', 'src', 'generated');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'embedding-index.json');
  writeFileSync(path, JSON.stringify(index) + '\n');
  const kb = Math.round(JSON.stringify(index).length / 1024);
  process.stderr.write(
    `wrote ${path}\n  ${index.modules.length} modules + ${index.ui.length} UI rows, ${dims} dims, ${kb} KB\n`
    + `  build cost: ${index.cost.inputTokens} input tokens, ${index.cost.neurons} neurons\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
