#!/usr/bin/env node
/**
 * ASK THE MODEL A CUSTOMER REACHES TO BUILD ROBLOX UI, THEN MEASURE THE RECTANGLES IT BUILT.
 *
 * WHAT THIS IS FOR. The owner's goal for Apple MAX is advanced Roblox UI generation. A settled
 * finding says a locally-trained LoRA cannot be served to production — every model the product
 * routes to answers `5005 LoRA unsupported` — so the lever that moves that goal is not training,
 * it is the knowledge the model reaches at generation time. You cannot tell whether that knowledge
 * is working without knowing where the model fails today, and nobody had measured it: the only UI
 * suite in the repository, `packages/evals/tasks/ui-implementation.json`, greps the answer for the
 * word "AnchorPoint" and cannot distinguish a centred panel from one anchored at its corner.
 *
 * This runs six UI builds through the REAL gateway and scores them by BUILDING them — see
 * score-ui.mjs for the arithmetic and ui-tasks.mjs for what each one asks for.
 *
 * SETTINGS DISCIPLINE, learned from defects this repository shipped:
 *   - A GATEWAY CONFIG NAME IS NOT A PRODUCT LANE. `--model stone` measures a config; `--lane
 *     apple-max` resolves what a person actually reaches, through the same `gatewayModelFor`
 *     mapping the worker uses. Every run records which one it measured.
 *   - MEASURE AT THE BUDGET PRODUCTION USES. An eval that hardcoded 1,100 tokens reported a model
 *     as broken that was not. The budget here is derived the way the worker derives it —
 *     MODE_BASE_TOKENS[mode] x the effort multiplier — and then MIN'd with the gateway's own
 *     ceiling, because `llmChat` clamps and a number that was clamped is not the number the
 *     provider saw. Both are recorded.
 *   - A ZERO-LENGTH ANSWER IS NOT A FAILED ANSWER. Every row carries its character count and its
 *     finishReason so "ran out of budget while thinking" cannot be read as "cannot build UI".
 *
 * These tables mirror apps/worker/src/do/session.ts, reasoning.ts and gateway.ts. They are also
 * carried, inline, by eval-production.mjs — a peer session owns that file today, so they are not
 * unified here; `--show-settings` prints the resolution without spending a neuron, and
 * production-settings.test.mjs reads the worker's own source and goes red if either copy drifts.
 *
 * Usage:
 *   node packages/training/src/eval-ui-generation.mjs --lane apple-max --mode agent
 *   node packages/training/src/eval-ui-generation.mjs --lane apple --mode agent --repeat 2
 *   node packages/training/src/eval-ui-generation.mjs --show-settings
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTasks } from './ui-tasks.mjs';
import { UI_SYSTEM_PROMPT } from './ui-tasks.mjs';
import { check, select, scoreUiTask } from './score-ui.mjs';
import { MODE_ALIASES, resolveSettings } from './production-settings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(HERE, '..', 'runs');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const lane = arg('lane', 'apple-max');
const modeArg = arg('mode', 'agent');
const repeat = Math.max(1, Number(arg('repeat', '1')));
const only = arg('only', null);
const systemFile = arg('system-file', null);
const system = systemFile ? readFileSync(systemFile, 'utf8') : UI_SYSTEM_PROMPT;

if (!MODE_ALIASES[modeArg]) {
  console.error(`unknown mode "${modeArg}" — use plan, agent or super-agent`);
  process.exit(2);
}
if (lane !== 'apple' && lane !== 'apple-max' && !flag('raw')) {
  console.error(`unknown lane "${lane}" — use apple or apple-max, or pass --raw with --model`);
  process.exit(2);
}

const settings = resolveSettings({
  lane: flag('raw') ? null : lane,
  mode: modeArg,
  model: arg('model', null),
  effort: arg('effort', null),
  maxTokens: arg('max-tokens', null),
});

if (flag('show-settings')) {
  console.log(JSON.stringify({ ...settings, systemFile: systemFile ?? '(built-in)', repeat }, null, 1));
  process.exit(0);
}

const BASE = process.env.API_BASE || 'https://apple.moshe-barami111.workers.dev';
const KEY = process.env.GOLEM_ADMIN_KEY;
if (!KEY) { console.error('GOLEM_ADMIN_KEY is not set'); process.exit(2); }

const tasks = buildTasks(check, select).filter((t) => !only || t.id === only);
if (!tasks.length) { console.error(`no task matched --only ${only}`); process.exit(2); }

/**
 * Ask once, and retry a TRANSPORT failure — never a model failure.
 *
 * The first run of this eval lost two of six prompts to HTTP 500 and reported 2/6. Re-sending the
 * identical prompt a minute later returned a complete answer both times, so the two rows had
 * nothing to do with the model and a third of the suite was a provider hiccup wearing a score's
 * clothes. Only 5xx and network faults are retried, the count of retries travels in the row, and a
 * prompt that never came back is recorded at stage `request` so it stays OUT of the scored set
 * rather than counting as a build the model failed.
 */
//[[ A REPEAT THAT HITS A RESPONSE CACHE IS ONE SAMPLE PRINTED N TIMES.
//
//   MEASURED, 2026-09-20, against the live worker. The same prompt sent three times returned a
//   BYTE-IDENTICAL answer in 3346ms, then 97ms, then 87ms. Adding a single trailing space to the
//   prompt cost a full 3227ms generation and produced a DIFFERENT answer. So an identical request
//   body is served from a response cache, and `--repeat 3` over identical bodies measures the
//   cache, not the model: the first run of this eval reported eighteen rows that were six
//   generations replayed, with the variance that a repeat exists to measure invisible.
//
//   This happens although apps/worker/src/providers/workers-ai.ts passes `cacheTtl: 0` on every
//   call and its comment states "Response caching ... stays off (cacheTtl 0) on every agent call".
//   The account's AI Gateway is caching anyway. That is a finding about the product, not only about
//   this script, and it is written up in the report rather than worked around silently.
//
//   THE WORKAROUND, AND WHY THIS KNOB. The cache key is the request body. Changing the PROMPT to
//   bust it would change what is being measured. `maxTokens` is in the body and is not in the
//   prompt, so decrementing it by one per attempt busts the cache while leaving every character the
//   model reads identical; 5500 against 5499 is a 0.02% change in a budget none of these answers
//   came close to spending. The exact value used is recorded on every row.
const cacheBust = !flag('no-cache-bust');
const tokensForAttempt = (attempt) => (cacheBust ? settings.requestedTokens - (attempt - 1) : settings.requestedTokens);

async function ask(prompt, maxTokens, attempts = 6) {
  let lastError = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(`${BASE}/api/admin/model-test`, {
        method: 'POST',
        headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.gateway, prompt, system, maxTokens }),
      });
      if (r.ok) return { ...(await r.json()), retries: i - 1 };
      const body = (await r.text()).slice(0, 300);
      lastError = `HTTP ${r.status} ${body}`;
      if (r.status < 500) break;
    } catch (e) {
      lastError = `network: ${e.message}`;
    }
    // The worker's own message for a 5xx here is "handling a burst of requests ... Nothing was
    // charged", i.e. a per-model rate limit. Backing off exponentially is the only way through it;
    // a run that gave up after two tries lost 13 of 30 prompts and would have reported the rest as
    // a five-sample arm when it was a two-sample arm.
    if (i < attempts) await new Promise((res) => setTimeout(res, 3000 * 2 ** (i - 1)));
  }
  return { error: lastError, retries: attempts - 1 };
}

const rows = [];
let neurons = 0;

for (let attempt = 1; attempt <= repeat; attempt++) {
  for (const task of tasks) {
    const askedTokens = tokensForAttempt(attempt);
    // A courtesy gap between prompts. GLM-5.3-flash has a per-model requests-per-minute ceiling
    // that a tight loop walks straight into, and a rate-limited prompt is a lost sample.
    if (rows.length) await new Promise((res) => setTimeout(res, Number(arg('gap-ms', '1500'))));
    const res = await ask(task.prompt, askedTokens);
    if (res.error) {
      rows.push({ id: task.id, family: task.family, attempt, ok: false, stage: 'request', reason: res.error, retries: res.retries ?? 0, checks: [] });
      process.stderr.write(`  ${task.id.padEnd(24)} ${res.error}\n`);
      continue;
    }
    neurons += Number(res.neurons) || 0;
    const text = String(res.text ?? '');
    const verdict = scoreUiTask(task, text);
    rows.push({
      id: task.id,
      family: task.family,
      attempt,
      ok: verdict.ok,
      unmeasurable: verdict.unmeasurable === true,
      runtimeMeasuredLayout: verdict.runtimeMeasuredLayout === true,
      rendererReads: verdict.rendererReads ?? {},
      stage: verdict.stage,
      reason: verdict.reason,
      // Always carried for a runtime_error, because that outcome can be a gap in the harness rather
      // than a mistake by the model, and nobody may count it as one without reading the sentence.
      detail: verdict.detail ?? null,
      checks: verdict.checks,
      nodeCount: verdict.nodeCount ?? null,
      guiObjects: verdict.guiObjects ?? null,
      chars: text.length,
      // The exact budget this row was asked at, which differs by one per attempt so a repeat is a
      // real sample rather than a cache hit. See the cache note above.
      askedTokens,
      ms: res.ms,
      neurons: Number(res.neurons) || 0,
      retries: res.retries ?? 0,
      finishReason: res.finishReason ?? null,
      answer: text,
    });
    const failed = verdict.checks?.filter((c) => !c.ok).map((c) => c.id) ?? [];
    process.stderr.write(
      `  ${String(attempt)}·${task.id.padEnd(24)} ${verdict.ok ? 'PASS' : `FAIL ${verdict.reason}`}`
      + `${failed.length ? ` [${failed.join(', ')}]` : ''} (${text.length}c, ${res.finishReason ?? '?'})\n`,
    );
  }
}

// ------------------------------------------------------------------------------------- reporting

const scored = rows.filter((r) => r.stage === 'checks');
const ok = rows.filter((r) => r.ok).length;

//[[ THREE DENOMINATORS, BECAUSE ONE WOULD BE A LIE IN BOTH DIRECTIONS.
//
//   `sent` includes prompts the provider never answered — counting those as builds the model got
//   wrong is how the first run of this eval reported 2/6 for what was a provider hiccup. And
//   `measurable` excludes builds whose geometry could not be resolved at all (see the AbsoluteSize
//   note in score-ui.mjs); folding those into a pass rate would report a verdict nobody reached.
const unanswered = rows.filter((r) => r.stage === 'request').length;
const unmeasurable = rows.filter((r) => r.unmeasurable).length;
const measurable = rows.filter((r) => r.stage === 'checks' && !r.unmeasurable);
const measuredOk = measurable.filter((r) => r.ok).length;

/** Per-CHECK tallies, which is the answer to "where does the model actually fail". A task-level
 *  pass rate cannot say that: one task failing for six reasons looks like one failure. */
const perCheck = {};
for (const r of scored) {
  for (const c of r.checks) {
    const k = perCheck[c.id] ?? (perCheck[c.id] = { ran: 0, passed: 0, skipped: 0, examples: [] });
    k.ran += 1;
    if (c.skipped) k.skipped += 1;
    else if (c.ok) k.passed += 1;
    if (!c.ok && !c.skipped && k.examples.length < 3) k.examples.push(`${r.id}: ${c.detail}`);
  }
}

const stages = {};
for (const r of rows) stages[r.stage] = (stages[r.stage] ?? 0) + 1;

const runtimeErrors = rows.filter((r) => r.reason === 'runtime_error').map((r) => ({ id: r.id, attempt: r.attempt, detail: r.detail }));

/** Which renderer facts the builds reached for. The reason a build could not be measured, named. */
const rendererReads = {};
for (const r of rows) for (const [k, v] of Object.entries(r.rendererReads ?? {})) rendererReads[k] = (rendererReads[k] ?? 0) + v;

const perTask = {};
for (const r of rows) {
  const t = perTask[r.id] ?? (perTask[r.id] = { n: 0, ok: 0, unmeasurable: 0 });
  t.n += 1;
  if (r.ok) t.ok += 1;
  if (r.unmeasurable) t.unmeasurable += 1;
}

const lengths = rows.map((r) => r.chars ?? 0);
const out = {
  measuredAt: new Date().toISOString(),
  what: settings.lane
    ? `the ${settings.lane} LANE in ${modeArg} mode, as a customer reaches it, asked to BUILD Roblox UI — scored by running the Luau and measuring the rectangles it produced`
    : `the ${settings.gateway} gateway CONFIG called directly — not necessarily a lane any customer reaches`,
  settings,
  cacheBusting: cacheBust
    ? 'maxTokens is decremented by one per attempt, because an identical request body is served from a response cache (measured: 3346ms then 97ms then 87ms, byte-identical) — repeats over an identical body would be one sample printed N times'
    : 'DISABLED (--no-cache-bust): repeats over an identical body are served from the response cache and are NOT independent samples',
  system,
  scorer: {
    how: 'the answer is run under packages/training/src/ui-harness.luau and the instance tree it builds is resolved to absolute rectangles at three viewport sizes',
    viewports: ['1920x1080', '1366x768', '390x844'],
    notMeasured: [
      'the ScreenGui rect is taken as the whole viewport; real safe-area insets are scored as a PROPERTY of the ScreenGui rather than estimated as pixels',
      'AutomaticSize and text metrics are not modelled — a node that uses them has its size checks recorded as skipped, never as passed',
      'nothing here renders; this measures structure and geometry, not whether the result looks good',
    ],
  },
  n: rows.length,
  ok,
  pct: rows.length ? Math.round((ok / rows.length) * 100) : 0,
  /** The honest headline: of the builds that could be measured, how many were right. */
  measurable: measurable.length,
  measuredOk,
  measuredPct: measurable.length ? Math.round((measuredOk / measurable.length) * 100) : null,
  unanswered,
  unmeasurable,
  stages,
  perTask,
  perCheck,
  runtimeErrors,
  rendererReads,
  neurons,
  neuronsPerPrompt: rows.length ? Number((neurons / rows.length).toFixed(1)) : 0,
  outputChars: {
    mean: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0,
    min: Math.min(...lengths, 0),
    max: Math.max(...lengths, 0),
    empty: lengths.filter((l) => l === 0).length,
  },
  finishReasons: rows.reduce((acc, r) => ({ ...acc, [r.finishReason ?? 'none']: (acc[r.finishReason ?? 'none'] ?? 0) + 1 }), {}),
  rows,
};

mkdirSync(RUNS_DIR, { recursive: true });
//[[ AN A/B THAT OVERWRITES ITS OWN BASELINE HAS MEASURED NOTHING.
//
//   The whole point of --system-file is comparing two runs that differ in one thing. If both wrote
//   to the same path the second would erase the first, and the comparison would be a memory.
const slug = settings.lane ? `${settings.lane}-${modeArg}` : settings.gateway;
const variant = arg('label', null) ?? (systemFile ? basename(systemFile).replace(/\.[^.]+$/, '') : null);
const path = resolve(RUNS_DIR, `eval-ui-${slug}${variant ? `-${variant}` : ''}.json`);
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');

console.log(`\n${settings.lane ? `${settings.lane} lane, ${modeArg} mode` : `${settings.gateway} config`} — gateway ${settings.gateway} (${settings.modelId}), effort ${settings.effort}, ${settings.effectiveTokens} tokens${settings.clampedByCeiling ? ` — CLAMPED from ${settings.requestedTokens}` : ''}`);
console.log(`  of the builds that could be MEASURED: ${measuredOk}/${measurable.length} passed every check${out.measuredPct === null ? '' : ` (${out.measuredPct}%)`}`);
console.log(`  prompts sent ${rows.length} — ${unanswered} never answered by the provider, ${unmeasurable} answered but not resolvable (see runtimeMeasuredLayout)`);
console.log(`  neurons ${neurons} (${out.neuronsPerPrompt}/prompt), stages ${JSON.stringify(stages)}`);
console.log('\n  per task:');
for (const [id, t] of Object.entries(perTask)) console.log(`    ${id.padEnd(24)} ${t.ok}/${t.n}${t.unmeasurable ? `  (${t.unmeasurable} unmeasurable)` : ''}`);
console.log('\n  per check (where the model actually fails):');
for (const [id, c] of Object.entries(perCheck).sort((a, b) => (a[1].passed / a[1].ran) - (b[1].passed / b[1].ran))) {
  console.log(`    ${id.padEnd(30)} ${c.passed}/${c.ran}${c.skipped ? ` (${c.skipped} skipped)` : ''}`);
  for (const e of c.examples) console.log(`        ${e.slice(0, 150)}`);
}
if (Object.keys(rendererReads).length) {
  console.log(`\n  renderer facts the builds asked for (why some could not be measured): ${JSON.stringify(rendererReads)}`);
}
if (runtimeErrors.length) {
  console.log('\n  RUNTIME ERRORS — read these before counting them against the model:');
  for (const e of runtimeErrors) console.log(`    ${e.id}: ${e.detail}`);
}
console.log('\n->', path);
