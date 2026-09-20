#!/usr/bin/env node
/**
 * RUN THE ROBLOX FRONTIER BENCHMARK AGAINST THE DEPLOYED MODEL, ON A NAMED PRODUCT LANE.
 *
 * Every answer comes back through /api/admin/model-test, which is the real gateway, the real
 * provider and the real model config a customer's build uses. Then it is COMPILED AND RUN under
 * frontier-harness.luau and scored by what it did.
 *
 * SETTINGS DISCIPLINE, every line of it learned from a defect this repository shipped:
 *
 *   - A GATEWAY CONFIG NAME IS NOT A PRODUCT LANE. `--lane apple-max --mode super-agent` resolves
 *     what a person actually reaches, through the same `gatewayModelFor` mapping the worker uses.
 *     The resolution is imported from production-settings.mjs, whose own test reads apps/worker/src
 *     and goes red if the worker moves and the mirror does not.
 *   - MEASURE AT THE BUDGET PRODUCTION USES. An eval that hardcoded 1,100 tokens once reported a
 *     model as broken that was not. The budget is derived the way the worker derives it — the
 *     mode's base tokens scaled by effort — and then MIN'd with the gateway's own ceiling, because
 *     llmChat clamps and a clamped number is not the number the provider saw. Both are recorded and
 *     the run says which one was binding.
 *   - NEVER A NUMBER WITHOUT THE SETTINGS THAT PRODUCED IT. `--show-settings` prints the whole
 *     resolution and spends nothing, so a drift is visible without a single neuron.
 *   - A PROMPT THAT WAS NEVER ANSWERED IS NOT A PROMPT THE MODEL GOT WRONG. Capacity bounces are
 *     retried with backoff and, if they exhaust, recorded as NOT MEASURED on their own line rather
 *     than counted as failures.
 *
 * THE ARM IS PART OF THE MEASUREMENT AND IS NAMED IN EVERY RESULT. `--arm neutral` sends a system
 * prompt that says how to answer and nothing about Roblox: that measures the MODEL. `--arm
 * house-rules` sends production's own written code standards, verbatim from prompts.ts: the gap
 * between the two arms is the part of the score bought by prompting rather than by the weights,
 * which is exactly the question "can we give it Roblox knowledge" needs answered before anybody
 * writes more prompt.
 *
 * Usage:
 *   node packages/training/src/roblox-frontier-bench.mjs --lane apple --mode agent --arm neutral
 *   node packages/training/src/roblox-frontier-bench.mjs --lane apple-max --mode super-agent --arm house-rules
 *   node packages/training/src/roblox-frontier-bench.mjs --show-settings --lane apple-max --mode super-agent
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRONTIER_ITEMS, ARMS, AXES } from './roblox-frontier-tasks.mjs';
import { scoreFrontierItem, tally, HARNESS_PATH } from './score-roblox-frontier.mjs';
import { MODE_ALIASES, resolveSettings } from './production-settings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(HERE, '..', 'runs');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const lane = arg('lane', 'apple');
const modeArg = arg('mode', 'agent');
const armId = arg('arm', 'neutral');
const only = arg('only', null);

if (lane !== 'apple' && lane !== 'apple-max') {
  console.error(`unknown lane "${lane}" — use apple or apple-max`);
  process.exit(2);
}
if (!MODE_ALIASES[modeArg]) {
  console.error(`unknown mode "${modeArg}" — use plan, agent or super-agent`);
  process.exit(2);
}
const arm = ARMS[armId];
if (!arm) {
  console.error(`unknown arm "${armId}" — use ${Object.keys(ARMS).join(' or ')}`);
  process.exit(2);
}

const settings = resolveSettings({
  lane,
  mode: modeArg,
  effort: arg('effort', null),
  maxTokens: arg('max-tokens', null),
});

const sha = (path) => {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
};

//[[ THE SCORER'S OWN VERSION TRAVELS WITH THE SCORE.
//   Two of the files this run depends on are being edited by peer sessions in the same checkout.
//   A number produced by one version of a harness and read beside another version's is not a
//   comparison, so the exact bytes that judged these answers are named in the result.
const provenance = {
  harness: sha(HARNESS_PATH),
  scorer: sha(resolve(HERE, 'score-roblox-frontier.mjs')),
  tasks: sha(resolve(HERE, 'roblox-frontier-tasks.mjs')),
  controls: sha(resolve(HERE, 'roblox-frontier-controls.mjs')),
  settingsMirror: sha(resolve(HERE, 'production-settings.mjs')),
};

if (flag('show-settings')) {
  console.log(JSON.stringify({ ...settings, arm: armId, armIs: arm.what, items: FRONTIER_ITEMS.length, provenance }, null, 1));
  process.exit(0);
}

const BASE = process.env.API_BASE || 'https://apple.moshe-barami111.workers.dev';
const KEY = process.env.GOLEM_ADMIN_KEY;
if (!KEY) { console.error('GOLEM_ADMIN_KEY is not set'); process.exit(2); }

const items = FRONTIER_ITEMS.filter((i) => !only || i.id === only || i.axis === only);
if (!items.length) { console.error(`nothing matched --only ${only}`); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

//[[ A SHARED DAILY BUDGET THAT PEERS ARE ALSO SPENDING IS A QUEUE, NOT A WALL.
//
//   The first full run of this file lost all sixteen items to HTTP 500 "Apple has reached today's
//   shared building capacity", while /api/admin/spend-probe said a reservation of that exact size
//   was ALLOWED and the day ledger never moved — no call of mine was ever charged. The refusal was
//   a concurrent session holding the day's remaining headroom in `dayPending` for the twenty
//   seconds my run occupied. Reported as sixteen failures it would have said the model scores zero.
//
//   So capacity refusals get their own, much longer backoff than an ordinary 5xx: they are a wait,
//   not an error. An item that exhausts even these is still recorded as NOT MEASURED and never as
//   a failure — a prompt that was never answered is not a prompt the model got wrong.
const ATTEMPTS = 6;
const CAPACITY = /shared building capacity|capacity right now/i;
const TIMEOUT_MS = Number(arg('timeout-ms', '120000'));
//[[ PACING, BECAUSE THE BUDGET IS SHARED WITH WHOEVER ELSE IS MEASURING TODAY.
//   Back-to-back calls from two sessions against one BudgetDO singleton produced intermittent
//   HTTP 500s carrying the daily-cap message while /api/admin/spend-probe said the same
//   reservation was allowed and the day ledger never moved. Note what that message is: gateway.ts
//   `reserve()` reads `data.reason ?? 'daily_cap'`, so ANY unhandled budget-layer failure is
//   reported to the caller as "today's shared building capacity". A specific verdict standing in
//   for an unknown fault is this repository's observation-failure shape at the spend boundary, and
//   it is why this run pauses between calls instead of believing the sentence.
const GAP_MS = Number(arg('gap-ms', '3000'));
async function ask(prompt) {
  let last = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    //[[ A REQUEST WITH NO DEADLINE IS NOT A MEASUREMENT, IT IS A HANG.
    //   Node's fetch has no default timeout. The first full run of this file sat on a single
    //   connection for five minutes with nothing in the log and nothing in the day ledger, while
    //   `curl` against the same endpoint answered in five seconds. An indefinite wait is
    //   indistinguishable from a slow model and from a dead one, so it gets a deadline and becomes
    //   an ordinary retry.
    const r = await fetch(`${BASE}/api/admin/model-test`, {
      method: 'POST',
      headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: settings.gateway, prompt, system: arm.system, maxTokens: settings.requestedTokens }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((e) => ({ ok: false, status: 0, text: async () => `${e.name}: ${e.message}` }));
    if (r.ok) return { ...(await r.json()), attempts: attempt };
    const detail = (await r.text().catch(() => '')).slice(0, 300);
    if (process.env.FRONTIER_DEBUG) {
      process.stderr.write(`    [debug] status=${r.status} bodyBytes=${JSON.stringify({ model: settings.gateway, prompt, system: arm.system, maxTokens: settings.requestedTokens }).length} `
        + `model=${JSON.stringify(settings.gateway)} maxTokens=${JSON.stringify(settings.requestedTokens)} keyLen=${KEY.length} -> ${detail.slice(0, 120)}\n`);
    }
    last = { error: `HTTP ${r.status}`, detail, attempts: attempt };
    // A refused credential or a bad request is refused identically next time; only capacity and
    // transient upstream faults are worth another attempt, and the gateway's own burst message says
    // nothing was charged.
    const transient = r.status === 0 || r.status === 429 || r.status >= 500;
    if (!transient) return last;
    const waitMs = CAPACITY.test(detail) ? Math.min(45_000, 8_000 * attempt) : 1500 * attempt * attempt;
    if (attempt < ATTEMPTS) await sleep(waitMs);
  }
  return last;
}

const rows = [];
const results = [];
const errors = [];
let neurons = 0;

console.error(`\n${lane} / ${modeArg} (gateway ${settings.gateway} = ${settings.modelId}, effort ${settings.effort}, `
  + `${settings.effectiveTokens} tokens${settings.clampedByCeiling ? ` — CLAMPED from ${settings.requestedTokens}` : ''}), arm "${armId}"\n`);

for (const [i, item] of items.entries()) {
  if (i > 0 && GAP_MS > 0) await sleep(GAP_MS);
  const res = await ask(item.prompt);
  if (res.error) {
    errors.push({ id: item.id, axis: item.axis, error: res.error, detail: res.detail ?? null });
    results.push(null);
    // The upstream sentence, not just the status. "HTTP 500" alone cannot tell a capacity refusal
    // from a bad request, and a run that hides the reason cannot be debugged from its own output.
    process.stderr.write(`  ${String(i + 1).padStart(2)}/${items.length} ${item.id.padEnd(24)} NOT MEASURED (${res.error} after ${res.attempts} attempts) ${String(res.detail ?? '').slice(0, 160)}\n`);
    continue;
  }
  neurons += Number(res.neurons) || 0;
  const text = String(res.text ?? '');
  const scored = scoreFrontierItem(item, text);
  results.push(scored);

  const label = scored.outcome === 'checked'
    ? (scored.ok ? 'PASS' : `FAIL ${scored.failedIds.join(',')}`)
    : scored.outcome.toUpperCase();
  process.stderr.write(`  ${String(i + 1).padStart(2)}/${items.length} ${item.id.padEnd(24)} ${label} (${text.length}c)\n`);

  rows.push({
    id: item.id,
    axis: item.axis,
    outcome: scored.outcome,
    ok: scored.ok,
    checks: (scored.checks ?? []).map((c) => ({ id: c.id, pass: c.pass })),
    failed: scored.failedIds ?? [],
    unresolved: scored.unresolvedCount ?? 0,
    // Verbatim, always. A throw can mean the model used an API the harness does not implement,
    // which is the harness's gap and must not be counted against the model without a person
    // reading the sentence.
    detail: scored.detail ?? null,
    probeError: scored.probeError ?? null,
    unresolvedReads: scored.unresolvedReads ?? [],
    chars: text.length,
    ms: res.ms,
    finishReason: res.finishReason ?? null,
    neurons: Number(res.neurons) || 0,
    answer: text,
  });
}

const board = tally(items, results);

// Which specific checks failed, across the whole run. THIS IS THE WORK QUEUE, and it is the point
// of the exercise — a headline percentage tells nobody what to fix.
const failedChecks = [];
for (const [i, item] of items.entries()) {
  const r = results[i];
  if (!r || r.outcome !== 'checked') continue;
  for (const c of r.checks) {
    if (c.pass === false) failedChecks.push({ item: item.id, axis: item.axis, check: c.id, why: c.why });
  }
}

const out = {
  measuredAt: new Date().toISOString(),
  what: `the ${lane} LANE in ${modeArg} mode as a customer reaches it, through the real gateway, scored by running the Luau`,
  //[[ THE TWO LANES ARE THE SAME MODEL. SAY SO, OR THE COMPARISON IMPLIES SOMETHING FALSE.
  //   gateway.ts DEFAULT_MODELS puts @cf/zai-org/glm-5.3-flash behind both `stone` and `rune`, so a
  //   difference between lanes here is a difference in REASONING BUDGET, not in model weights. A
  //   reader who is not told this will read "apple-max scores higher" as "apple-max is a better
  //   model", which no measurement in this file supports.
  lanesAreTheSameModel: settings.modelId,
  settings,
  arm: { id: armId, what: arm.what, system: arm.system },
  provenance,
  items: items.length,
  attempted: board.attempted,
  measured: board.measured,
  passed: board.passed,
  pct: board.pct,
  notMeasured: errors.length,
  //[[ THE DENOMINATOR, PRINTED RATHER THAN IMPLIED.
  //   `measured` now includes the answers the Luau compiler rejected, because that verdict is the
  //   model's. `excludedFromDenominator` is the other kind — a throw the harness may have caused —
  //   and it is carried so a reader can see how many items the percentage is NOT over.
  excludedFromDenominator: board.excluded,
  errors,
  outcomes: board.outcomes,
  byAxis: board.byAxis,
  axes: AXES,
  failedChecks,
  neurons,
  neuronsPerItem: rows.length ? Number((neurons / rows.length).toFixed(1)) : 0,
  rows,
};

mkdirSync(RUNS_DIR, { recursive: true });
const tag = arg('tag', null);
const slug = `${lane}-${modeArg}-${armId}${tag ? `-${tag}` : ''}`;
const path = resolve(RUNS_DIR, `roblox-frontier-${slug}.json`);
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');

console.log(`\n  ${board.passed}/${board.measured} items fully correct (${board.pct}%) of the ${board.measured} SCORED `
  + `(a syntax error IS a score); ${errors.length} never answered, ${board.excluded} excluded because the harness `
  + `could not run them`);
for (const axis of AXES) {
  const a = board.byAxis[axis];
  if (!a) continue;
  console.log(`    ${axis.padEnd(18)} items ${a.passed}/${a.measured}   checks ${a.checksPassed}/${a.checksTotal}`);
}
console.log('  outcomes:', JSON.stringify(board.outcomes));
console.log(`  neurons ${neurons} (${out.neuronsPerItem}/item)`);
if (failedChecks.length) {
  console.log('\n  WHAT IT GOT WRONG (the work queue):');
  for (const f of failedChecks) console.log(`    ${f.item}/${f.check}`);
}
console.log('\n->', path);
