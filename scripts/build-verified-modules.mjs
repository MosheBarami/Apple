#!/usr/bin/env node
/**
 * Ship the 80 Luau modules whose correctness has been EXECUTED, not reviewed.
 *
 * WHY THIS EXISTS. eval-v4 measured the trained model at 0/8 on game logic, against a base that
 * also scored 0/8 (docs/evidence/apple-v4-evaluation-2026-09-19.md). Reading the failures up close,
 * the model writes the house style perfectly and gets the arithmetic wrong: `honest-percent` came
 * back multiplying by 99 instead of 100, and `remap-range` took four parameters where the contract
 * has five. It has learned what these modules LOOK like and not what they COMPUTE.
 *
 * Meanwhile `packages/training/` already holds 80 modules that are provably right — each carries
 * exhaustive checks that RUN. They were used to train an adapter which production cannot serve at
 * all, because the models Apple runs on answer `5005 LoRA unsupported`. So the correct code existed
 * and the product could not reach it, while the model re-derived it from scratch and got it wrong.
 *
 * This is the bridge. prefabs.ts already argues the principle — "an instruction is re-followed from
 * scratch on every project, with a fresh chance to drop one clause. These are the same rules as
 * CODE, written once and installed." These 80 extend that from three hand-reviewed systems to
 * eighty executed ones.
 *
 * THE GUARANTEE, AND IT IS THE POINT. Every module is run against its own checks HERE, at build
 * time, and one that fails is not shipped. The product therefore never hands a customer logic
 * nobody watched pass. A reviewed module is somebody's opinion; an executed one is a measurement.
 *
 * Run: node scripts/build-verified-modules.mjs [--check]
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_GAME_LOGIC_CURRICULUM } from '../packages/training/src/build-game-logic.mjs';
import { runSpecCase } from '../packages/training/src/tool-trajectory-verify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages/corpus/data/verified-modules.json');

/**
 * The signature, AND the behaviour, because the behaviour is what makes a module findable.
 *
 * This first kept only the opening sentence, which left `cooldown-clock` describing itself as
 * "ready(now, previous, delay)." — a signature and nothing else. A model asking for "stop the
 * player using an ability too often" then matched `tool-durability` and `tooltip-placement` on the
 * letters they share, and the one correct module in the library ranked nowhere. The words that
 * make a module retrievable were sitting in the rest of the prompt and were being thrown away.
 */
function contractOf(entry) {
  const whole = String(entry.prompt ?? '').replace(/^Write a standalone Luau module returning\s*/i, '').trim();
  return whole || entry.id;
}

export function buildVerified() {
  const shipped = [];
  const refused = [];
  for (const entry of ALL_GAME_LOGIC_CURRICULUM) {
    if (!entry.source || !entry.checks) { refused.push({ id: entry.id, why: 'no source or no checks' }); continue; }
    // The module is wrapped exactly as the scorer wraps a model's answer, so "it passes" means the
    // same thing here as it does in the evaluation.
    const outcome = runSpecCase(`local candidate = (function()\n${entry.source}\nend)()\n${entry.checks}`);
    if (!outcome.ran) { refused.push({ id: entry.id, why: `harness unavailable: ${outcome.reason}` }); continue; }
    if (!outcome.compiled) { refused.push({ id: entry.id, why: 'does not compile' }); continue; }
    if (!outcome.passed) { refused.push({ id: entry.id, why: 'FAILS ITS OWN CHECKS — not shipped' }); continue; }
    shipped.push({
      id: entry.id,
      family: entry.family,
      contract: contractOf(entry),
      source: entry.source,
      verified: 'executed against its own exhaustive checks at build time',
    });
  }
  return { shipped, refused };
}

const serialise = (b) => JSON.stringify(b, null, 1) + '\n';

if (process.argv[1] && process.argv[1].endsWith('build-verified-modules.mjs')) {
  const { shipped, refused } = buildVerified();
  const bundle = {
    schemaVersion: 1,
    note: 'Luau modules this repository authored. Every one was RUN against its own exhaustive checks at build time; a module that failed is absent rather than shipped unverified.',
    generatedBy: 'scripts/build-verified-modules.mjs',
    modules: shipped,
  };
  const text = serialise(bundle);
  if (process.argv.includes('--check')) {
    let current = '';
    try { current = readFileSync(OUT, 'utf8'); } catch { /* absent counts as stale */ }
    if (current !== text) {
      console.error('verified-modules.json is STALE — run: node scripts/build-verified-modules.mjs');
      process.exit(1);
    }
    console.log(`verified-modules.json is current — ${shipped.length} modules, all passing`);
    process.exit(0);
  }
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}`);
  console.log(`  shipped (passed their own checks): ${shipped.length}`);
  console.log(`  refused:                           ${refused.length}`);
  for (const r of refused) console.log(`    - ${r.id}: ${r.why}`);
  console.log(`  sha256: ${createHash('sha256').update(text).digest('hex').slice(0, 16)}`);
}
