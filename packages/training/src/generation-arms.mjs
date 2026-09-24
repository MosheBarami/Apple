#!/usr/bin/env node
/**
 * MEASURE THE THING THE CUSTOMER ACTUALLY RECEIVES, NOT THE SHORTLIST ON THE WAY TO IT.
 *
 * Four parallel workflows improved RETRIEVAL on the same 80 customer-phrased queries: 61% top-1 ->
 * 75% / 81% / 82.5% / 91%. Every one of those numbers is a fact about a SHORTLIST. None of them is
 * a fact about the Luau a customer ends up with, because nothing downstream of the shortlist was
 * measured — the model still has to write the module, and `eval-production.mjs` says it gets that
 * wrong 33-40% of the time WITH the library sitting right there.
 *
 * That is this repository's own failure shape one level up: a shortlist that is PRESENT and a
 * customer outcome that is never REACHED. So this file measures arms end-to-end, through the real
 * gateway, scored by EXECUTION against each example's own exhaustive checks — the same scorer
 * eval-v4 and eval-production use. A fluent wrong answer scores zero here too.
 *
 * FIVE ARMS, ONE SLICE, ONE BASELINE:
 *
 *   baseline    the shipped system prompt, one call. Fidelity-gated against the recorded run.
 *   fewshot     + 3 verified modules as worked examples, LEAVE-ONE-OUT (idea 2)
 *   secondpass  generate, then re-read your own answer against the contract. No execution. This is
 *               the CONTROL for the repair arm: without it, "repair helps" cannot be told apart
 *               from "a second call helps".
 *   specrepair  generate the module AND the assertions that would catch it being wrong; RUN them;
 *               repair from the assertion that failed (idea 1)
 *   oracle      generate, run against the HIDDEN eval checks, repair from their error. NOT
 *               SHIPPABLE — the product does not have these checks. It is the CEILING on what any
 *               repair loop could reach, and it is labelled that way everywhere it is printed.
 *
 * LEAVE-ONE-OUT IS NOT OPTIONAL AND IS NOT ON TRUST. The 80 verified modules and the 80 curriculum
 * examples are the same eighty things: `verified-modules.json[i].id === curriculum[i].id` and the
 * module's `source` IS the reference answer. Handing the model its own answer as an "example" would
 * score ~100% and mean nothing. `exemplarsFor` asserts the target id is absent and the run dies if
 * it ever is not.
 *
 * Usage:
 *   node packages/training/src/generation-arms.mjs --arm baseline --n 40
 *   node packages/training/src/generation-arms.mjs --arm specrepair --n 40 --tag r1
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { scoreGameLogic, fencedLuau } from './score-eval.mjs';
import { detectContextDependencies } from './audit-dataset.mjs';
import { runSpecCase } from './tool-trajectory-verify.mjs';
import { CUSTOMER_QUERIES } from './customer-queries.mjs';
import { GATEWAY_MODEL_ID, resolveSettings } from './production-settings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(HERE, '..', 'runs');
const WORKER = resolve(HERE, '../../../apps/worker');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const BASE = process.env.API_BASE || 'https://apple.moshe-barami111.workers.dev';
//[[ The credential is checked in main(), not at import. A module that kills the process when it is
//   merely IMPORTED cannot be unit-tested, and the tests below are the only part of this file that
//   runs without spending anything.
const KEY = () => process.env.GOLEM_ADMIN_KEY;

//[[ THE SETTINGS ARE COPIED FROM eval-production.mjs AND THEN CHECKED AGAINST A RECORDED RUN.
//
//   "Never a number without the settings that produced it" is not enough on its own, because a
//   COPY of the settings drifts silently. The recorded baseline run carries the exact system string
//   and the exact resolved settings that produced 16/24; the gate below compares this file's copy
//   to that file and refuses to spend a neuron if they differ. A baseline arm that is not the
//   shipped configuration is not a baseline, it is a sixth arm nobody asked for.
//[[ 2026-09-21: THESE WERE FOUR LITERALS AND THEY WENT STALE WHILE THE GATE WENT ON PASSING.
//
//   On 2026-09-20 the worker moved `high` from x1.25 to x2 and stone's ceiling from 5600 to 6500
//   (commit 8b61c91). The ceiling literal here was updated; REQUESTED_TOKENS was not. So this file
//   kept sending 5500 while the product sent 6500 — and the fidelity gate below kept reporting
//   agreement, because it compares this file to a RECORDING of an old run and never to production.
//   A gate that cannot see the thing it guards is this repository's own failure shape at the
//   harness layer, and a hand-written copy of a table is rule 7 of the working rules.
//
//   production-settings.mjs is the ONE mirror that production-settings.test.mjs holds against
//   apps/worker/src field by field, so the resolution is taken from there and nothing is retyped.
//   If the worker moves again, this file moves with it and the gate says so instead of agreeing.
const PRODUCTION = resolveSettings({ lane: 'apple', mode: 'agent' });
const GATEWAY = PRODUCTION.gateway;
const REQUESTED_TOKENS = PRODUCTION.requestedTokens;
const GATEWAY_CEILING = PRODUCTION.gatewayCeiling;
const EFFECTIVE_TOKENS = PRODUCTION.effectiveTokens;

const BASELINE_SYSTEM =
  'You write standalone Luau modules for Roblox. Reply with ONE fenced luau code block and nothing else. '
  + 'The module must return the function described, handle every invalid input the contract names, and must not '
  + 'read a clock, mutate shared state, or require anything.';

//[[ 2026-09-21: THE RECORDING MOVED, AND THE OLD ONE IS KEPT RATHER THAN OVERWRITTEN.
//
//   `eval-production-apple-agent-armA-shipped.json` was taken on 2026-09-20 at effectiveTokens
//   5500, and it is the provenance of all seven arms in docs/frontier-for-roblox.md §4. Production
//   now sends 6500, so that file can no longer be the fidelity source without the gate certifying a
//   budget the product stopped sending — but deleting it would erase what those seven arms were
//   measured at. Both exist; this names the current one, and §4 names the other.
const FIDELITY_SOURCE = resolve(RUNS_DIR, 'eval-production-apple-agent-armA-shipped-2026-09-21.json');

//[[ THE GATEWAY KEY RENAMED ON 2026-09-22 AND THE MODEL BEHIND IT DID NOT, SO THE GATE COMPARES THE
//   MODEL.
//
//   The recorded baseline stores `settings.gateway: "stone"` — the internal DEFAULT_MODELS key at
//   the time. The worker renamed that key to `agent` when the product contract settled on
//   Plan/Agent, and `@cf/zai-org/glm-5.3-flash` did not change: same model, same 6500 ceiling, same
//   8800 requested. So comparing the KEY NAME would report a different experiment where the request
//   the provider receives is byte-identical, and the honest fix is not to re-record (that spends
//   neurons re-measuring the same request) but to compare the thing that decides the experiment.
//
//   The rename map is read-only history: it lets a current gateway key be matched against a key
//   that no longer exists. It is NOT a resolution path — nothing resolves a mode through it — and
//   production-settings.mjs's RETIRED_MODES is what refuses those names at the CLI.
// `clay` used Qwen before Plan moved to GLM; it is comparable to today's memory model,
// not to today's Plan model. Only stone/rune kept their model through the rename.
const RECORDED_GATEWAY_RENAMES = Object.freeze({ clay: 'memory', stone: 'agent', rune: 'agent' });

/** The model a recorded settings block was actually sent to, read through today's table. */
function recordedModelId(recordedKey) {
  if (typeof recordedKey !== 'string') return null;
  return GATEWAY_MODEL_ID[RECORDED_GATEWAY_RENAMES[recordedKey] ?? recordedKey] ?? null;
}

function fidelityGate({ system = BASELINE_SYSTEM, gateway = GATEWAY, tokens = EFFECTIVE_TOKENS, file = FIDELITY_SOURCE } = {}) {
  let recorded;
  try { recorded = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { return { ok: false, why: `cannot read ${file}: ${e.message}` }; }
  const problems = [];
  if (recorded.system !== system) problems.push('system prompt differs from the recorded shipped run');
  //[[ COMPARE THE MODEL, NOT THE KEY. A renamed key naming the same model is the same measurement;
  //   a different model is a different one, and the message names both so the reader does not have
  //   to hold the rename table in their head. ]]
  const wasModelId = recordedModelId(recorded.settings?.gateway);
  const nowModelId = GATEWAY_MODEL_ID[gateway] ?? null;
  if (wasModelId !== nowModelId) {
    problems.push(
      `gateway ${recorded.settings?.gateway} (${wasModelId ?? 'unknown model'}) != ${gateway} (${nowModelId ?? 'unknown model'})`,
    );
  }
  //[[ A DRIFT HERE IS NOT A TYPO, IT IS A DIFFERENT EXPERIMENT. The recorded run is the thing every
  //   arm is compared against; if production now sends a different output budget, a new arm and the
  //   recorded arms did not answer the same question and the difference between them is not the
  //   arm. The fix is to re-record the shipped baseline at today's budget, not to relax this line.
  if (recorded.settings?.effectiveTokens !== tokens) {
    problems.push(
      `effectiveTokens ${recorded.settings?.effectiveTokens} (recorded) != ${tokens} (production today)`
      + ' — re-record the shipped baseline before comparing a new arm against it',
    );
  }
  return {
    ok: problems.length === 0,
    why: problems.join('; ') || null,
    recorded: { file: basename(file), n: recorded.n, ok: recorded.ok, pct: recorded.pct, effectiveTokens: recorded.settings?.effectiveTokens ?? null },
  };
}

// ---------------------------------------------------------------------------------------------
// The verified library, loaded from the WORKER'S OWN code rather than a retyped copy of it.
// ---------------------------------------------------------------------------------------------
let cachedLibrary = null;
async function loadLibrary() {
  if (cachedLibrary) return cachedLibrary;
  const dir = mkdtempSync(join(tmpdir(), 'arms-lib-'));
  const out = join(dir, 'verified.mjs');
  try {
    execFileSync(
      join(WORKER, 'node_modules', '.bin', 'esbuild'),
      [join(WORKER, 'src', 'verified-modules.ts'), '--bundle', '--format=esm', '--target=es2022', '--loader:.json=json', '--outfile=' + out],
      { stdio: 'pipe', cwd: WORKER },
    );
    const mod = await import(pathToFileURL(out).href + '?t=' + Date.now());
    if (typeof mod.searchVerifiedModules !== 'function') throw new Error('verified-modules.ts exported no searchVerifiedModules');
    cachedLibrary = mod;
    return mod;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * k worked examples for this contract, with the answer to this contract REMOVED.
 *
 * Retrieved with the SHIPPED `searchVerifiedModules` — the door as it exists today — so that the
 * arm measures the library the product can actually reach, and so that a later run with a better
 * retriever is a comparable second measurement rather than a different experiment.
 */
function exemplarsFor(lib, example, k = 3, query = null) {
  const hits = lib.searchVerifiedModules(query ?? example.prompt, k + 4);
  const kept = hits.filter((m) => m.id !== example.id).slice(0, k);
  //[[ THE LEAK GUARD. Not a comment, an assertion: a silent leak here would produce the best number
  //   in this file and it would be worthless.
  for (const m of kept) {
    if (m.id === example.id) throw new Error(`leave-one-out violated: ${example.id} was handed its own answer`);
  }
  return kept;
}

const exemplarBlock = (mods) =>
  mods.map((m) => `-- ${m.id}\n-- contract: ${m.contract}\n${m.source}`).join('\n\n');

/**
 * k exemplars chosen WITHOUT looking at the request — the control that decides what few-shot buys.
 *
 * If three unrelated modules lift the score as much as three retrieved ones, then what the model
 * gained was the HOUSE STYLE of validation and not the retrieved knowledge, and every point of
 * retrieval accuracy the four other workflows bought converts to nothing at this layer. That is the
 * difference between "the library helps" and "three examples of any kind help", and no arm that
 * omits this control can tell them apart. Seeded off the example id so the pick is reproducible.
 */
function randomExemplarsFor(lib, example, k = 3) {
  const all = lib.VERIFIED_MODULE_IDS ?? [];
  let h = 2166136261;
  for (const ch of example.id) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const pool = [...all].filter((id) => id !== example.id).sort();
  const picked = [];
  while (picked.length < k && pool.length) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    picked.push(pool.splice(h % pool.length, 1)[0]);
  }
  const mods = picked.map((id) => lib.getVerifiedModule(id)).filter(Boolean);
  for (const m of mods) if (m.id === example.id) throw new Error(`leave-one-out violated: ${example.id}`);
  return mods;
}

// ---------------------------------------------------------------------------------------------
// Prompts. Every arm shares the baseline's three sentences so a difference is the arm, not style.
// ---------------------------------------------------------------------------------------------
const SPEC_SYSTEM = `${BASELINE_SYSTEM}

Then write a SECOND fenced luau block: assertions that would catch this module being wrong. The module is already in scope as a local called candidate. Use assert(...). Cover every invalid input the contract names, every boundary it states, and the ordinary case. Do not redefine the module and do not require anything.

Reply with exactly two fenced luau blocks, the module first and the assertions second, and nothing else.`;

const fewshotSystem = (block) => `${BASELINE_SYSTEM}

Here are worked examples of modules from this library that were verified by execution. They are NOT the answer to the request below — they are how this codebase writes and validates one. Match their style of input validation.

\`\`\`luau
${block}
\`\`\``;

const secondPassPrompt = (example, previous) => `${example.prompt}

Here is a draft answer:

\`\`\`luau
${previous}
\`\`\`

Re-read the contract one clause at a time and check the draft against each clause, including every invalid input it names. If anything is wrong, fix it. If nothing is wrong, return it unchanged. Reply with ONE fenced luau code block and nothing else.`;

const repairPrompt = (example, previous, failure, source) => `${example.prompt}

Here is a draft answer:

\`\`\`luau
${previous}
\`\`\`

${source} It failed:

\`\`\`
${failure}
\`\`\`

One of the two is wrong — the module, or the assertion's reading of the contract. Decide which, then reply with ONE fenced luau code block containing the module that satisfies the contract, and nothing else.`;

// ---------------------------------------------------------------------------------------------
// Transport. Same retry ladder as eval-production: a capacity bounce is not a result.
// ---------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
//[[ THE LADDER IS SIZED TO THE PROVIDER'S WINDOW, NOT TO IMPATIENCE.
//
//   The bounce is `HTTP 500 - Apple is handling a burst of requests right now. Nothing was charged`,
//   which gateway.ts:463 raises for Workers AI error 3021 — an ACCOUNT-level rate limit, not a fault
//   in the request. Measured here: a 64-token prompt answers in 1.7s through the same window that
//   refuses every 5,500-token one, so the limit is on inflight cost and it is shared with whatever
//   else is driving this account.
//
//   An exhausted prompt is recorded as NOT MEASURED, and NOT MEASURED lands wherever the burst fell
//   rather than at random — a run with holes is a BIASED slice, not a smaller one. The error states
//   nothing was charged, so waiting costs attempts and no neurons. Eight attempts, doubling from 3s
//   and capped at 30s, is ~2 minutes of patience per prompt in the worst case; PACE_MS puts space
//   between prompts so the run stops being the burst it is waiting out.
const ATTEMPTS = 8;
const PACE_MS = Number(process.env.ARMS_PACE_MS ?? 1500);
async function ask(prompt, system) {
  let last = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const r = await fetch(`${BASE}/api/admin/model-test`, {
      method: 'POST',
      headers: { 'X-Admin-Key': KEY(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GATEWAY, prompt, system, maxTokens: REQUESTED_TOKENS }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (r.ok) return { ...(await r.json()), attempts: attempt };
    const detail = (await r.text().catch(() => '')).slice(0, 300);
    last = { error: `HTTP ${r.status}`, detail, attempts: attempt };
    const transient = r.status === 0 || r.status === 429 || r.status >= 500;
    if (!transient) return last;
    if (attempt < ATTEMPTS) await sleep(Math.min(30_000, 3000 * 2 ** (attempt - 1)));
  }
  return last;
}

/** Two fenced blocks, in order. Returns [first, second|null]. */
function fencedBlocks(answer) {
  const out = [];
  const re = /```(?:luau|lua)?\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(String(answer ?? '')))) out.push(m[1].trim());
  return out;
}

/**
 * Run a module against a block of assertions, with `candidate` in scope. This is the local stand-in
 * for the product's `run_spec` tool (apps/worker/src/spec-runner.ts), which runs model-authored
 * assertion cases in Studio and returns the error text of the ones that failed.
 */
function runOwnSpec(moduleSource, specSource) {
  return runSpecCase(`local candidate = (function()\n${moduleSource}\nend)()\n${specSource}`);
}

// ---------------------------------------------------------------------------------------------
// The arms.
// ---------------------------------------------------------------------------------------------
const ARMS = {
  async baseline(example) {
    const res = await ask(example.prompt, BASELINE_SYSTEM);
    if (res.error) return { error: res };
    return { answer: res.text ?? '', calls: [res], extra: {} };
  },

  async fewshot(example, ctx) {
    const mods = exemplarsFor(ctx.lib, example, 3);
    const res = await ask(example.prompt, fewshotSystem(exemplarBlock(mods)));
    if (res.error) return { error: res };
    return { answer: res.text ?? '', calls: [res], extra: { exemplars: mods.map((m) => m.id) } };
  },

  //[[ THE REALISTIC VARIANT. The production door is reached with the CUSTOMER'S words, where the
  //   shipped retriever is at 61% top-1, not with the contract's words, where it is at 100%. If the
  //   two arms score the same, retrieval accuracy does not reach the customer's Luau.
  async fewshotcustomer(example, ctx) {
    const query = CUSTOMER_QUERIES[example.id] ?? null;
    if (!query) return { error: { error: `no customer phrasing for ${example.id}` } };
    const mods = exemplarsFor(ctx.lib, example, 3, query);
    const res = await ask(example.prompt, fewshotSystem(exemplarBlock(mods)));
    if (res.error) return { error: res };
    return { answer: res.text ?? '', calls: [res], extra: { exemplars: mods.map((m) => m.id), retrievedWith: 'customer phrasing' } };
  },

  async fewshotrandom(example, ctx) {
    const mods = randomExemplarsFor(ctx.lib, example, 3);
    const res = await ask(example.prompt, fewshotSystem(exemplarBlock(mods)));
    if (res.error) return { error: res };
    return { answer: res.text ?? '', calls: [res], extra: { exemplars: mods.map((m) => m.id), retrievedWith: 'nothing — seeded pick, the control' } };
  },

  async secondpass(example) {
    const first = await ask(example.prompt, BASELINE_SYSTEM);
    if (first.error) return { error: first };
    const draft = fencedLuau(first.text ?? '');
    if (!draft) return { answer: first.text ?? '', calls: [first], extra: { revised: false, why: 'no_code_block_to_revise' } };
    const second = await ask(secondPassPrompt(example, draft), BASELINE_SYSTEM);
    if (second.error) return { answer: first.text ?? '', calls: [first], extra: { revised: false, why: `second call ${second.error}` } };
    const revised = fencedLuau(second.text ?? '');
    return {
      answer: revised ? second.text : first.text,
      calls: [first, second],
      extra: { revised: Boolean(revised), changed: revised ? revised !== draft : false, firstAnswer: first.text ?? '' },
    };
  },

  //[[ IDEA 1. The signal is the model's OWN assertions, executed. Never the eval's checks.
  async specrepair(example) {
    const first = await ask(example.prompt, SPEC_SYSTEM);
    if (first.error) return { error: first };
    const blocks = fencedBlocks(first.text ?? '');
    const moduleSource = blocks[0] ?? null;
    const specSource = blocks[1] ?? null;
    const extra = { blocks: blocks.length, specRan: false, specFired: false, repaired: false };
    // Re-wrap the module alone so the downstream scorer sees exactly one block, as every other arm.
    const asOneBlock = (src) => '```luau\n' + src + '\n```';
    if (!moduleSource) return { answer: first.text ?? '', calls: [first], extra: { ...extra, why: 'no_module_block' } };
    if (!specSource) return { answer: asOneBlock(moduleSource), calls: [first], extra: { ...extra, why: 'no_spec_block' } };

    const outcome = runOwnSpec(moduleSource, specSource);
    extra.specRan = Boolean(outcome.ran && outcome.compiled);
    extra.specOutcome = outcome.ran ? (outcome.compiled ? (outcome.passed ? 'passed' : 'failed') : 'spec_or_module_does_not_compile') : `unavailable:${outcome.reason}`;
    if (!extra.specRan || outcome.passed) {
      return { answer: asOneBlock(moduleSource), calls: [first], extra };
    }
    extra.specFired = true;
    const second = await ask(
      repairPrompt(example, moduleSource, outcome.detail ?? 'no output', 'Your own assertions were run against it.'),
      BASELINE_SYSTEM,
    );
    if (second.error) return { answer: asOneBlock(moduleSource), calls: [first], extra: { ...extra, why: `repair call ${second.error}` } };
    const fixed = fencedLuau(second.text ?? '');
    if (!fixed) return { answer: asOneBlock(moduleSource), calls: [first, second], extra: { ...extra, why: 'repair returned no code block' } };
    extra.repaired = true;
    extra.beforeRepair = asOneBlock(moduleSource);
    //[[ THE SECOND EXECUTION IS THE POINT. A repair that still fails the model's own assertions is
    //   not a repair; keeping the draft in that case is what the product would do with run_spec.
    const after = runOwnSpec(fixed, specSource);
    extra.repairPassesOwnSpec = Boolean(after.ran && after.compiled && after.passed);
    if (!extra.repairPassesOwnSpec) extra.keptDraftBecauseRepairStillFails = true;
    return {
      answer: asOneBlock(extra.repairPassesOwnSpec ? fixed : moduleSource),
      calls: [first, second],
      extra,
    };
  },

  //[[ THE CEILING. NOT SHIPPABLE. The feedback is the HIDDEN eval checks' own error text, which the
  //   product does not have and never will for a customer's novel request. Reported only as a bound
  //   on what any repair loop could reach, and never as a product number.
  async oracle(example) {
    const first = await ask(example.prompt, BASELINE_SYSTEM);
    if (first.error) return { error: first };
    const draft = fencedLuau(first.text ?? '');
    const extra = { oracleFired: false, notShippable: true };
    if (!draft) return { answer: first.text ?? '', calls: [first], extra: { ...extra, why: 'no_code_block' } };
    const verdict = scoreGameLogic(example, first.text ?? '');
    if (verdict.ok) return { answer: first.text ?? '', calls: [first], extra };
    extra.oracleFired = true;
    const outcome = runSpecCase(`local candidate = (function()\n${draft}\nend)()\n${example.checks}`);
    const failure = outcome.detail ?? verdict.reason ?? 'no output';
    const second = await ask(repairPrompt(example, draft, failure, "The project's own hidden checks were run against it."), BASELINE_SYSTEM);
    if (second.error) return { answer: first.text ?? '', calls: [first], extra: { ...extra, why: `repair call ${second.error}` } };
    const fixed = fencedLuau(second.text ?? '');
    return { answer: fixed ? second.text : first.text, calls: [first, second], extra: { ...extra, repaired: Boolean(fixed) } };
  },
};

// ---------------------------------------------------------------------------------------------
async function main() {
  if (!KEY()) { console.error('GOLEM_ADMIN_KEY is not set'); process.exit(2); }
  const armName = arg('arm', 'baseline');
  const armFn = ARMS[armName];
  if (!armFn) { console.error(`unknown arm "${armName}" — one of ${Object.keys(ARMS).join(', ')}`); process.exit(2); }

  const gate = fidelityGate();
  if (!gate.ok) { console.error(`FIDELITY GATE FAILED — refusing to spend: ${gate.why}`); process.exit(3); }

  const n = Number(arg('n', '40'));
  const offset = Number(arg('offset', '0'));
  const chosen = ALL_GAME_LOGIC_CURRICULUM.slice(offset, offset + n);
  if (!chosen.length) { console.error('slice selects nothing'); process.exit(2); }

  const lib = armName.startsWith('fewshot') ? await loadLibrary() : null;
  const ctx = { lib };

  const rows = [];
  const errors = [];
  let ok = 0, neurons = 0, calls = 0, ms = 0;
  let servedModel = null, provider = null;

  for (const [i, e] of chosen.entries()) {
    if (i > 0 && PACE_MS > 0) await sleep(PACE_MS);
    let out;
    try { out = await armFn(e, ctx); }
    catch (err) { out = { error: { error: `arm threw: ${err.message}` } }; }
    if (out.error) {
      errors.push({ id: e.id, family: e.family, error: out.error.error, detail: out.error.detail ?? null });
      process.stderr.write(`  ${String(i + 1).padStart(2)}/${chosen.length} ${e.id.padEnd(28)} NOT MEASURED (${out.error.error})\n`);
      continue;
    }
    for (const c of out.calls ?? []) {
      calls += 1;
      neurons += Number(c.neurons) || 0;
      ms += Number(c.ms) || 0;
      servedModel ??= c.model ?? null;
      provider ??= c.provider ?? null;
    }
    const verdict = scoreGameLogic(e, out.answer);
    if (verdict.ok) ok += 1;
    rows.push({
      id: e.id, family: e.family, ok: verdict.ok, reason: verdict.reason ?? null,
      calls: (out.calls ?? []).length,
      neurons: (out.calls ?? []).reduce((a, c) => a + (Number(c.neurons) || 0), 0),
      ms: (out.calls ?? []).reduce((a, c) => a + (Number(c.ms) || 0), 0),
      chars: String(out.answer ?? '').length,
      finishReason: (out.calls ?? []).at(-1)?.finishReason ?? null,
      ...out.extra,
    });
    process.stderr.write(`  ${String(i + 1).padStart(2)}/${chosen.length} ${e.id.padEnd(28)} ${verdict.ok ? 'PASS' : verdict.reason}\n`);
  }

  const reasons = {};
  for (const r of rows) if (!r.ok) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;

  const out = {
    measuredAt: new Date().toISOString(),
    what: `ARM "${armName}" measured END TO END: the model writes the module, the module is EXECUTED against the example's own exhaustive checks. Not retrieval.`,
    arm: armName,
    notShippable: armName === 'oracle' ? 'THE ORACLE ARM READS THE HIDDEN EVAL CHECKS. It is a ceiling, not a product number.' : null,
    fidelityGate: gate,
    settings: {
      ...PRODUCTION,
      servedModel, provider, n, offset,
      endpoint: `${BASE}/api/admin/model-test`,
    },
    attempted: chosen.length,
    n: rows.length, ok, pct: rows.length ? Math.round((ok / rows.length) * 1000) / 10 : 0,
    notMeasured: errors.length, errors,
    modelCalls: calls,
    callsPerPrompt: rows.length ? Number((calls / rows.length).toFixed(2)) : 0,
    neurons, neuronsPerPrompt: rows.length ? Number((neurons / rows.length).toFixed(1)) : 0,
    gatewayMsTotal: ms, gatewayMsPerPrompt: rows.length ? Math.round(ms / rows.length) : 0,
    reasons, rows,
  };

  mkdirSync(RUNS_DIR, { recursive: true });
  const tag = arg('tag', null);
  const path = resolve(RUNS_DIR, `generation-arm-${armName}${offset ? `-from${offset}` : ''}${tag ? `-${tag}` : ''}.json`);
  writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
  console.log(`\narm ${armName}: ${ok}/${rows.length} (${out.pct}%) — ${errors.length} of ${chosen.length} not measured`);
  console.log(`  ${calls} model calls (${out.callsPerPrompt}/prompt), ${neurons} neurons (${out.neuronsPerPrompt}/prompt), ${out.gatewayMsPerPrompt} ms/prompt`);
  console.log('  failures:', JSON.stringify(reasons));
  console.log('->', path);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}

export { ARMS, BASELINE_SYSTEM, SPEC_SYSTEM, exemplarsFor, randomExemplarsFor, fencedBlocks, runOwnSpec, fidelityGate, loadLibrary };
