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
 *   node packages/training/src/eval-production.mjs --lane apple --mode agent --n 24
 *   node packages/training/src/eval-production.mjs --model agent --max-tokens 5500   (raw config)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { scoreGameLogic } from './score-eval.mjs';
import { resolveSettings } from './production-settings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(HERE, '..', 'runs');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const BASE = process.env.API_BASE || 'https://apple.moshe-barami111.workers.dev';
const KEY = process.env.GOLEM_ADMIN_KEY;
if (!KEY) { console.error('GOLEM_ADMIN_KEY is not set'); process.exit(2); }

const DEFAULT_SYSTEM =
  'You write standalone Luau modules for Roblox. Reply with ONE fenced luau code block and nothing else. '
  + 'The module must return the function described, handle every invalid input the contract names, and must not '
  + 'read a clock, mutate shared state, or require anything.';

//[[ A LANE'S BUDGET IS NOT A PROPERTY OF ITS GATEWAY. THE TABLE THAT SAID IT WAS COULD NOT SEE MAX.
//
//   The previous version of this file carried `PRODUCTION_BUDGET = { clay: 6500, stone: 5500,
//   rune: 6500 }`, keyed on the GATEWAY CONFIG NAME, and `LANE_TO_GATEWAY = { apple: 'stone',
//   'apple-max': 'stone' }`. Both halves were wrong in ways that cancelled out on exactly one
//   configuration — Agent mode — and misdescribed every other one:
//
//     1. The gateway a lane reaches is MODE-DEPENDENT for Apple MAX. `gatewayModelFor` reads
//        `if (productModel === 'apple-max') return mode === 'clay' ? 'stone' : mode`, so MAX in
//        Super Agent reaches `rune`, not `stone`. Pinning MAX to `stone` meant the ONE mode where
//        the paid lane differs from the free lane at request time could not be measured at all.
//     2. The budget is not a property of the gateway either. The worker computes it as
//        `tokensForEffort(baseTokensFor(agent.mode), choice.effort)` — MODE picks the base
//        (clay 4400, stone 4400, rune 5200) and EFFORT scales it (low 1x, high 1.25x). Keying on
//        the gateway name cannot express that, because two lanes reach `stone` from different
//        modes at different efforts and therefore at different budgets.
//     3. `PRODUCTION_BUDGET.clay = 6500` was stale by a whole revision. MODE_BASE_TOKENS.clay was
//        lowered from 5200 to 4400 (session.ts: "4400, not 5200"), so clay at high effort asks for
//        5500. 6500 is `clay`'s gateway CEILING, which is a different number that happens to look
//        like a budget.
//
//   Mirrored from apps/worker/src/do/session.ts and apps/worker/src/reasoning.ts. If those move,
//   these must move with them; `--show-settings` prints the resolution so a drift is visible
//   without spending a single neuron.
//[[ 2026-09-22 — THE TABLES THAT USED TO LIVE HERE ARE GONE, AND THAT IS THE FIX.
//
//   This file carried its own MODE_BASE_TOKENS, BASELINE_EFFORT, ENTITLEMENT_FLOOR, EFFORT_SCALE,
//   GATEWAY_CEILING, MODE_ALIASES, gatewayFor, effortFor and tokensForEffort — a second, unchecked
//   copy of apps/worker/src. The comment above admits the shape of the risk ("If those move, these
//   must move with them") and then relies on a human noticing. `production-settings.mjs` is the ONE
//   mirror that production-settings.test.mjs holds against the worker field by field, so the
//   resolution is taken from there and nothing is retyped. That is rule 7 of the working rules.
//
//   It was not hypothetical: by the time this was removed the local copy still said
//   `clay`/`stone`/`rune` while the worker had renamed every one of those keys to `plan`/`agent`.
//
//   THE TWO FACTS THE LOCAL COPY EXISTED TO RECORD, KEPT BECAUSE THEY ARE STILL TRUE:
//
//     - THE CEILING IS PART OF THE SETTINGS, BECAUSE IT CAN SILENTLY REPLACE THEM. gateway.ts clamps
//       with `Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens)`, so the budget that reaches
//       the provider is the MINIMUM of what the lane asks for and what the config allows. A script
//       that reported only the request would name a number the provider never saw. `resolveSettings`
//       records both and `clampedByCeiling` says which one was binding.
//     - THE EFFORT A LANE ASKS FOR IS A FLOOR, NOT THE WHOLE STORY. chooseEffort starts at
//       BASELINE[mode], raises it to ENTITLEMENT_FLOOR[lane], then raises it further on signals
//       (ambiguous request, visual design work, multi-system task, recovery from a failed step).
//       Signals only ever RAISE, so a real build that trips one gets the same or more. The run
//       records `effortIsAFloor: true` rather than claiming to have reproduced the policy's verdict
//       on these particular prompts, which it has not: /api/admin/model-test does not run
//       classifyRequest.
//]]
const lane = arg('lane', null);
if (lane && lane !== 'apple' && lane !== 'apple-max') {
  console.error(`unknown lane "${lane}" — use apple or apple-max`);
  process.exit(2);
}
const modeArg = arg('mode', lane ? 'agent' : null);

const n = Number(arg('n', '12'));
const systemFile = arg('system-file', null);
const system = systemFile ? readFileSync(systemFile, 'utf8') : DEFAULT_SYSTEM;
const offset = Number(arg('offset', '0'));

//[[ ONE RESOLUTION, TAKEN FROM THE MIRROR, INCLUDING THE MODE VALIDATION.
//   Without a lane the script keeps its `--raw` behaviour of naming a gateway config directly, which
//   is what an admin experiment against one specific model wants. A retired mode is refused either
//   way, by `resolveMode`, with a message that names its replacement. ]]
let resolved;
try {
  resolved = resolveSettings({
    lane,
    mode: modeArg ?? 'agent',
    model: lane ? null : arg('model', 'agent'),
    effort: arg('effort', null),
    maxTokens: arg('max-tokens', null),
  });
} catch (e) { console.error(e.message); process.exit(2); }

//[[ WHAT WE ASK FOR, AND WHAT THE PROVIDER IS ALLOWED TO GIVE. NEVER REPORT ONLY ONE. ]]
const settings = {
  ...resolved,
  // In raw mode the request IS the gateway ceiling, not the mode's base scaled by effort — so the
  // base is not part of the resolution and reporting it would imply an arithmetic that did not run.
  baseTokens: lane ? resolved.baseTokens : null,
  n, offset,
  systemFile: systemFile ?? '(built-in default)',
};
const model = settings.gateway;
const requestedTokens = settings.requestedTokens;

if (flag('show-settings')) {
  console.log(JSON.stringify(settings, null, 1));
  process.exit(0);
}

//[[ THE SLICE IS STABLE, AND `--offset` IS WHAT KEEPS THAT FROM BECOMING A TRAP.
//
//   A stable slice is what makes two runs comparable. It also means every decision this repository
//   has made from this eval was made on prompts 1-12, and the deployed model scores 89% on those
//   against 31% on 13-24 — so the slice that made the decisions is not representative of the
//   curriculum, and a headline taken from it overstates the product.
//
//   `--offset` also buys the only honest replicate available here. The gateway caches responses, so
//   re-running the SAME slice with the SAME settings replays the cache (median 73-206ms against
//   ~5,000ms fresh) and returns a byte-identical score — which looks like a reproducible result and
//   is actually one measurement printed twice. An untouched slice is uncached by construction.
const chosen = ALL_GAME_LOGIC_CURRICULUM.slice(offset, offset + n);
if (!chosen.length) {
  console.error(`--offset ${offset} --n ${n} selects nothing; the curriculum holds ${ALL_GAME_LOGIC_CURRICULUM.length}`);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

//[[ A CAPACITY BOUNCE IS NOT A RESULT, AND UNRETRIED IT SILENTLY BIASES THE SAMPLE.
//
//   The gateway answers a burst with `HTTP 500 — "Apple is handling a burst of requests right now.
//   Nothing was charged"`. Excluding those from the score was the first fix; it is not enough. A run
//   that loses twelve of twenty-four prompts is not a smaller unbiased run — the losses land
//   wherever the burst happened to fall, so the surviving subset is not the stable slice the whole
//   design depends on, and two runs that lost different prompts cannot be compared at all. That is
//   how a prompt-change experiment gets a number: the arm that happened to keep the easy half wins.
//
//   Retrying is correct rather than generous: the error states that nothing was charged, so a retry
//   costs one more attempt and no neurons. Bounded, with backoff, and a prompt that exhausts its
//   attempts is still recorded as NOT MEASURED rather than as a failure.
const ATTEMPTS = 4;
async function ask(prompt) {
  let last = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const r = await fetch(`${BASE}/api/admin/model-test`, {
      method: 'POST',
      headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, system, maxTokens: requestedTokens }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (r.ok) return { ...(await r.json()), attempts: attempt };
    // The upstream message, because "HTTP 500" alone cannot distinguish a provider hiccup worth
    // retrying from a budget ceiling that will refuse every remaining prompt in the run.
    const detail = (await r.text().catch(() => '')).slice(0, 300);
    last = { error: `HTTP ${r.status}`, detail, attempts: attempt };
    // A refused credential or a bad request will be refused identically next time. Only capacity
    // and transient upstream faults are worth another attempt.
    const transient = r.status === 0 || r.status === 429 || r.status >= 500;
    if (!transient) return last;
    if (attempt < ATTEMPTS) await sleep(1500 * attempt * attempt);
  }
  return last;
}

//[[ A PROMPT THAT WAS NEVER ANSWERED IS NOT A PROMPT THE MODEL GOT WRONG.
//
//   The first run of this fixed script hit two transient HTTP 500s from the gateway and scored them
//   as failures: they entered `reasons` next to `fails_own_checks`, counted in the denominator that
//   produces the headline percentage, and — because the error row carried no `chars` — were read as
//   zero-length completions, so `empty: 1` described a request that never reached the model and the
//   mean output length was pulled down by a number that was never measured.
//
//   That is this repository's observation-failure pattern exactly: a failure to observe rendered as
//   an observation. It biases in the dangerous direction, because it makes the product look worse
//   for an infrastructure reason and invites a fix to the model that the evidence does not support.
//   Errors are now counted and reported on their own line, and the pass rate is over the prompts
//   that were actually answered — with `n` and `errors` both printed so the denominator is visible
//   rather than implied.
const rows = [];
const errors = [];
let ok = 0, neurons = 0;
for (const [i, e] of chosen.entries()) {
  const res = await ask(e.prompt);
  if (res.error) {
    errors.push({ id: e.id, family: e.family, error: res.error, detail: res.detail ?? null });
    process.stderr.write(`  ${String(i + 1).padStart(2)}/${chosen.length} ${e.id.padEnd(26)} NOT MEASURED (${res.error})\n`);
    continue;
  }
  neurons += Number(res.neurons) || 0;
  const text = String(res.text ?? '');
  // The SAME scorer as eval-v4: the module is executed against its own checks.
  const verdict = scoreGameLogic(e, text);
  if (verdict.ok) ok += 1;
  rows.push({
    id: e.id, family: e.family, ok: verdict.ok, reason: verdict.reason ?? null,
    ms: res.ms, finishReason: res.finishReason,
    //[[ AN EMPTY ANSWER AND A WRONG ANSWER ARE DIFFERENT FAILURES AND USED TO SCORE THE SAME.
    //
    //   The old version dropped res.text after scoring, so `no_code_block` covered both "the model
    //   wrote prose" and "the model returned zero characters because the budget ran out during
    //   thinking". Those want opposite fixes — a better prompt against a bigger budget — and the
    //   run could not tell them apart. chars plus finishReason separates them, and the taxonomy
    //   below counts finishReason so a truncated run cannot be read as a model that failed.
    chars: text.length,
    neurons: Number(res.neurons) || 0,
  });
  process.stderr.write(`  ${String(i + 1).padStart(2)}/${chosen.length} ${e.id.padEnd(26)} ${verdict.ok ? 'PASS' : verdict.reason} (${text.length}c)\n`);
}

const reasons = {};
for (const r of rows) if (!r.ok) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
const finishReasons = {};
for (const r of rows) finishReasons[r.finishReason ?? 'none'] = (finishReasons[r.finishReason ?? 'none'] ?? 0) + 1;

const lengths = rows.map((r) => r.chars);
const sorted = [...lengths].sort((a, b) => a - b);
const outputChars = {
  mean: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0,
  median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
  min: sorted[0] ?? 0,
  max: sorted[sorted.length - 1] ?? 0,
  empty: lengths.filter((l) => l === 0).length,
};

const out = {
  measuredAt: new Date().toISOString(),
  what: lane
    ? `the ${lane} LANE in ${modeArg} mode as a customer reaches it, through the real gateway, scored by execution`
    : 'a gateway CONFIG called directly — not necessarily a lane any customer reaches',
  settings,
  system,
  // Kept at the top level under their old names so older readers of this file do not break.
  lane: lane ?? null, model, maxTokens: settings.effectiveTokens,
  attempted: chosen.length,
  n: rows.length, ok, pct: rows.length ? Math.round((ok / rows.length) * 100) : 0,
  notMeasured: errors.length, errors,
  neurons, neuronsPerPrompt: rows.length ? Number((neurons / rows.length).toFixed(1)) : 0,
  outputChars, reasons, finishReasons, rows,
};
//[[ TWO SESSIONS MEASURING AT ONCE MUST NOT OVERWRITE EACH OTHER'S EVIDENCE.
//
//   The output path was derived from the lane alone, so a peer session running this script against
//   the same checkout wrote its n=80 run over an n=24 run that had already been reported from —
//   leaving a summary whose numbers no file on disk supported any more. `--tag` names a run, and a
//   replicate at identical settings is exactly the case that needs one.
mkdirSync(RUNS_DIR, { recursive: true });
const tag = arg('tag', null);
const slug = (lane ? `${lane}-${modeArg}` : model) + (offset ? `-from${offset}` : '') + (tag ? `-${tag}` : '');
const path = resolve(RUNS_DIR, `eval-production-${slug}.json`);
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
console.log(`\n${lane ? `${lane} lane, ${modeArg} mode (gateway ${model}, effort ${settings.effort}, ${settings.effectiveTokens} tokens${settings.clampedByCeiling ? ` — CLAMPED from ${requestedTokens}` : ''})` : `${model} config @ ${settings.effectiveTokens}`}`);
console.log(`  ${ok}/${rows.length} (${out.pct}%) of the prompts that were ANSWERED; ${errors.length} of ${chosen.length} not measured`);
console.log(`  neurons ${neurons} (${out.neuronsPerPrompt}/prompt)`);
console.log(`  output chars: mean ${outputChars.mean}, median ${outputChars.median}, range ${outputChars.min}-${outputChars.max}, empty ${outputChars.empty}`);
console.log('  failures:', JSON.stringify(reasons));
console.log('  finishReason:', JSON.stringify(finishReasons));
console.log('->', path);
