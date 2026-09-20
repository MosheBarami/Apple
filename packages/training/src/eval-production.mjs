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

//[[ ASK FOR WHAT PRODUCTION ASKS FOR, OR THIS MEASURES A PRODUCT NOBODY SHIPS.
//
//   The first version of this script hardcoded maxTokens 1100 — below even the old free-lane budget
//   — so its headline numbers described the model under conditions production never uses. On a
//   reasoning lane that is not a small error: qwen3 returns ZERO characters below ~3200, so the
//   free lane scored 0/12 against a budget that was the script's, not the product's.
//
//   These mirror MODE_BASE_TOKENS in apps/worker/src/do/session.ts times the high-effort
//   multiplier in reasoning.ts, which is what a real build asks for.
const PRODUCTION_BUDGET = { clay: 6500, stone: 5500, rune: 6500 };

//[[ A GATEWAY NAME IS NOT A LANE, AND REPORTING ONE AS THE OTHER IS A LIE.
//
//   /api/admin/model-test takes a GATEWAY CONFIG name and calls it directly, so `--model clay`
//   measures qwen3-30b whatever the product does with it. After the free lane was routed off clay
//   on 2026-09-20 this script still printed "clay: 1/12" — a true statement about a config that no
//   customer reaches any more, and a false impression of the free tier.
//
//   `--lane apple` and `--lane apple-max` resolve the gateway name the way gatewayModelFor in
//   apps/worker/src/do/session.ts does, so the number describes what a PERSON gets. Keep them in
//   step: apps/worker/tests/product-model-entitlement.test.mjs drives the real SessionDO and pins
//   the same mapping, so a drift here shows up there.
const LANE_TO_GATEWAY = { apple: 'stone', 'apple-max': 'stone' };

const lane = arg('lane', null);
if (lane && !LANE_TO_GATEWAY[lane]) {
  console.error(`unknown lane "${lane}" — use ${Object.keys(LANE_TO_GATEWAY).join(' or ')}`);
  process.exit(2);
}
const model = lane ? LANE_TO_GATEWAY[lane] : arg('model', 'stone');
const n = Number(arg('n', '12'));
const systemFile = arg('system-file', null);
const system = systemFile ? readFileSync(systemFile, 'utf8') : DEFAULT_SYSTEM;

/** A stable slice, so two runs compare the same questions rather than two random samples. */
const chosen = ALL_GAME_LOGIC_CURRICULUM.slice(0, Math.min(n, ALL_GAME_LOGIC_CURRICULUM.length));

async function ask(prompt) {
  const r = await fetch(`${BASE}/api/admin/model-test`, {
    method: 'POST',
    headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, system, maxTokens: Number(arg('max-tokens', PRODUCTION_BUDGET[model] ?? 5500)) }),
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
  what: lane
    ? `the ${lane} LANE as a customer reaches it, through the real gateway, scored by execution`
    : 'a gateway CONFIG called directly — not necessarily a lane any customer reaches',
  lane: lane ?? null,
  model, system, maxTokens: Number(arg('max-tokens', PRODUCTION_BUDGET[model] ?? 5500)), n: rows.length, ok, pct: rows.length ? Math.round((ok / rows.length) * 100) : 0,
  neurons, reasons, rows,
};
const path = `packages/training/runs/eval-production-${lane ?? model}.json`;
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
console.log(`\n${lane ? `${lane} lane (via ${model})` : `${model} config`}: ${ok}/${rows.length} (${out.pct}%)  neurons ${neurons}`);
console.log('failures:', JSON.stringify(reasons));
console.log('->', path);
