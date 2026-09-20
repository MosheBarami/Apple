#!/usr/bin/env node
/**
 * MEASURE THE MODEL THE PRODUCT ACTUALLY RUNS ON.
 *
 * eval-v4 measured an `apple-v4` LoRA adapter on Llama-3.2-3B. Production cannot serve it — every
 * model Apple routes to answers `5005 LoRA unsupported` — so that evaluation, however careful, has
 * never described what a customer gets. Nobody had measured the deployed model on a Roblox task.
 *
 * This does. It drives the REAL gateway through /api/admin/model-test, so the answer comes back
 * through the same provider, the same adapter and the same settings a customer's build uses, and
 * scores it with the SAME scorer eval-v4 used — the module is RUN against its own exhaustive
 * checks, never compared to a reference answer. A fluent wrong answer scores zero here too.
 *
 * WHY THE SYSTEM PROMPT IS A PARAMETER. The one thing we control about this model is what we say to
 * it. Holding the prompt as a variable is what makes "did that prompt change help" a measurable
 * question rather than an opinion; `--system-file` swaps it and the two runs are comparable because
 * nothing else moved.
 *
 * Usage:
 *   node packages/training/src/eval-production.mjs --n 12 [--model stone] [--system-file p.txt]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { scoreGameLogic } from './score-eval.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const BASE = process.env.API_BASE || 'https://apple.moshe-barami111.workers.dev';
const KEY = process.env.GOLEM_ADMIN_KEY;
if (!KEY) { console.error('GOLEM_ADMIN_KEY is not set'); process.exit(2); }

const DEFAULT_SYSTEM =
  'You write standalone Luau modules for Roblox. Reply with ONE fenced luau code block and nothing else. '
  + 'The module must return the function described, handle every invalid input the contract names, and must not '
  + 'read a clock, mutate shared state, or require anything.';

const model = arg('model', 'stone');
const n = Number(arg('n', '12'));
const systemFile = arg('system-file', null);
const system = systemFile ? readFileSync(systemFile, 'utf8') : DEFAULT_SYSTEM;

/** A stable slice, so two runs compare the same questions rather than two random samples. */
const chosen = ALL_GAME_LOGIC_CURRICULUM.slice(0, Math.min(n, ALL_GAME_LOGIC_CURRICULUM.length));

async function ask(prompt) {
  const r = await fetch(`${BASE}/api/admin/model-test`, {
    method: 'POST',
    headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, system, maxTokens: 1100 }),
  });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  return r.json();
}

const rows = [];
let ok = 0, neurons = 0;
for (const [i, e] of chosen.entries()) {
  const res = await ask(e.prompt);
  if (res.error) { rows.push({ id: e.id, ok: false, reason: res.error }); continue; }
  neurons += Number(res.neurons) || 0;
  // The SAME scorer as eval-v4: the module is executed against its own checks.
  const verdict = scoreGameLogic(e, String(res.text ?? ''));
  if (verdict.ok) ok += 1;
  rows.push({ id: e.id, family: e.family, ok: verdict.ok, reason: verdict.reason ?? null, ms: res.ms, finishReason: res.finishReason });
  process.stderr.write(`  ${String(i + 1).padStart(2)}/${chosen.length} ${e.id.padEnd(26)} ${verdict.ok ? 'PASS' : verdict.reason}\n`);
}

const reasons = {};
for (const r of rows) if (!r.ok) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
const out = {
  measuredAt: new Date().toISOString(),
  what: 'the DEPLOYED model, through the real gateway, scored by execution',
  model, system, n: rows.length, ok, pct: rows.length ? Math.round((ok / rows.length) * 100) : 0,
  neurons, reasons, rows,
};
const path = `packages/training/runs/eval-production-${model}.json`;
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
console.log(`\n${model}: ${ok}/${rows.length} (${out.pct}%)  neurons ${neurons}`);
console.log('failures:', JSON.stringify(reasons));
console.log('->', path);
