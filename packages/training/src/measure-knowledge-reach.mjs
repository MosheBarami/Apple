#!/usr/bin/env node
/**
 * DOES THE MODEL ACTUALLY REACH THE KNOWLEDGE IT WAS GIVEN?
 *
 * apps/worker/src/ui-construction-guide.ts and apps/worker/src/verified-modules.ts exist so the
 * model does not have to answer construction and arithmetic questions from pretraining. They are
 * served by two tools, `get_ui_construction` and `get_verified_module`. Both are `studio: false`,
 * both read a table compiled into the worker bundle, and neither costs a credit.
 *
 * None of that matters if the model never calls them. A feature that is present but never reached
 * is indistinguishable from one that does not exist, and this repository's own router.ts says so
 * in as many words: "an offered-but-unused library is indistinguishable from no library at all."
 * Nothing measured whether it is reached. This does.
 *
 * WHAT IS MEASURED, AND WHAT EACH NUMBER IS A NUMBER ABOUT
 * -------------------------------------------------------
 * There are two separable questions and this script keeps them separate, because answering one
 * and reporting it as the other is the exact failure eval-production.mjs was corrected for.
 *
 *   --suite first-reach   ONE turn, the FULL Studio-connected toolset (60 tools), the REAL system
 *                         prompt assembled by prompts.ts with the same arguments session.ts passes,
 *                         the real gateway, the real deployed model. It answers: at the first
 *                         decision point, with everything available, what does the model reach for?
 *                         It CANNOT answer "did it ever call the tool during the build" — a build
 *                         is up to 16 steps and this is step 1. Read `intent` in the output: the
 *                         model's own reasoning trace often names the tool it means to call next,
 *                         and that is evidence of a plan, not evidence of a call.
 *
 *   --suite real-loop     A REAL agent run on a REAL project through /api/admin/agent-run, the same
 *                         path the visual benchmark uses and the same path a chat message takes.
 *                         Every step, every tool actually executed, read back out of the session
 *                         transcript's tool_trace. This is the only variant that can say "it called
 *                         it" rather than "it said it would".
 *                         CAVEAT THAT MUST TRAVEL WITH THE NUMBER: with Studio disconnected the
 *                         agent is handed OFFLINE_TOOLS — eight tools, of which these two are two.
 *                         That is a far EASIER condition than a Studio-connected build choosing
 *                         among sixty. A failure here is decisive; a success here does not
 *                         generalise upward.
 *
 * SETTINGS ARE RESOLVED THE WAY THE WORKER RESOLVES THEM, NOT GUESSED.
 * The system prompt, the tool definitions, the trait classification, the reasoning effort and the
 * output budget are all computed by importing the worker's OWN modules (bundled with esbuild), so
 * a drift in prompts.ts or router.ts changes this measurement instead of silently invalidating it.
 * Every run writes the resolved settings into its output file next to the result.
 *
 * Usage:
 *   node packages/training/src/measure-knowledge-reach.mjs --suite first-reach [--n 12]
 *   node packages/training/src/measure-knowledge-reach.mjs --suite real-loop --n 2
 *   node packages/training/src/measure-knowledge-reach.mjs --show-settings      (spends nothing)
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const RUNS_DIR = resolve(HERE, '..', 'runs');

// .env is how every other harness in this repo gets the admin key; do the same rather than
// requiring the caller to export four variables by hand.
try {
  for (const line of readFileSync(join(REPO, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* fall back to the ambient environment */ }

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

//[[ THE CANONICAL ORIGIN, not the one that answers.
//   golem.moshe-barami111.workers.dev is still a deployed worker and still answers /api/*, and it
//   is a DIFFERENT BUILD — 44d9ded vs a5fe64e on 2026-09-20. Measuring it and calling the result
//   production would be the gateway-config-versus-lane mistake wearing a hostname. ]]
const BASE = (process.env.API_BASE_PRODUCTION || 'https://apple.moshe-barami111.workers.dev').replace(/\/+$/, '');
const KEY = process.env.GOLEM_ADMIN_KEY;

/** The two libraries this measurement is about. */
const KNOWLEDGE_TOOLS = ['get_ui_construction', 'get_verified_module'];

/**
 * Requests a person actually types. Two families, because the two libraries answer two questions:
 * `ui` should pull get_ui_construction, `logic` should pull get_verified_module. No request names
 * a tool, mentions a library, or hints that one exists — a prompt that says "look it up first"
 * measures instruction-following, not whether the model reaches on its own.
 */
const PROMPTS = [
  { id: 'ui-shop-tycoon', family: 'ui', expect: 'get_ui_construction',
    text: 'Build a shop GUI for my tycoon game — a shop screen where players buy upgrades with cash, with a grid of items, prices, and a close button. Make it look good.' },
  { id: 'ui-inventory', family: 'ui', expect: 'get_ui_construction',
    text: 'Make an inventory screen for my simulator. Players should see the pets they own in a grid, with the equipped one marked. Make it look good.' },
  { id: 'ui-daily-rewards', family: 'ui', expect: 'get_ui_construction',
    text: 'Add a daily rewards popup — seven days in a row, each day showing what you get, today’s one highlighted and claimable. Make it look good.' },
  { id: 'ui-leaderboard', family: 'ui', expect: 'get_ui_construction',
    text: 'I want a leaderboard screen showing the top players by coins, with their names and ranks. Make it look good.' },
  { id: 'ui-settings', family: 'ui', expect: 'get_ui_construction',
    text: 'Build a settings menu with music and sound toggles, a graphics quality slider and a close button. Make it look good.' },
  { id: 'ui-codes', family: 'ui', expect: 'get_ui_construction',
    text: 'Add a codes screen where players type a promo code and hit redeem, with a message telling them if it worked. Make it look good.' },
  { id: 'ui-hud', family: 'ui', expect: 'get_ui_construction',
    text: 'Make the main HUD for my obby — coins counter, level display, and a button that opens the shop. Make it look good.' },
  { id: 'ui-battle-pass', family: 'ui', expect: 'get_ui_construction',
    text: 'Build a battle pass screen with a free track and a premium track, tiers along the bottom and a progress bar. Make it look good.' },
  { id: 'logic-cooldown', family: 'logic', expect: 'get_verified_module',
    text: 'Add a cooldown to the dash ability so players can only use it every 5 seconds, and the button should grey out while it is cooling down.' },
  { id: 'logic-currency', family: 'logic', expect: 'get_verified_module',
    text: 'Set up coins for my game — players earn them, they can spend them in the shop, and the balance has to be right even if two things spend at once.' },
  { id: 'logic-xp', family: 'logic', expect: 'get_verified_module',
    text: 'Add an XP and levelling system where each level needs more XP than the last, and show the percentage towards the next level.' },
  { id: 'logic-rounds', family: 'logic', expect: 'get_verified_module',
    text: 'Make my minigame run in rounds — 60 seconds of play, then 15 seconds of intermission, then it starts again, and it has to handle players joining mid-round.' },
];

// ---------------------------------------------------------------------------
// The worker's own modules, bundled. Importing them is what keeps this honest: retyping the system
// prompt or the tool descriptions here would measure a fiction that resembles production.
// ---------------------------------------------------------------------------
function loadWorkerBits() {
  const dir = mkdtempSync(join(tmpdir(), 'knowledge-reach-'));
  const entry = join(dir, 'entry.ts');
  const out = join(dir, 'bits.mjs');
  const S = join(REPO, 'apps', 'worker', 'src');
  writeFileSync(entry, [
    `export { systemPrompt } from ${JSON.stringify(join(S, 'prompts.ts'))};`,
    `export { TOOLS } from ${JSON.stringify(join(S, 'tools.ts'))};`,
    `export { toolsForMode } from ${JSON.stringify(join(S, 'router.ts'))};`,
    `export { designBrief } from ${JSON.stringify(join(S, 'design-brief.ts'))};`,
    `export { classifyRequest, chooseEffort, tokensForEffort } from ${JSON.stringify(join(S, 'reasoning.ts'))};`,
    // The two libraries themselves, so this file can also check what they ANSWER once reached.
    `export { askVerifiedModule, VERIFIED_MODULE_COUNT, VERIFIED_MODULE_IDS } from ${JSON.stringify(join(S, 'verified-modules.ts'))};`,
    `export { getUIConstruction, UI_CONSTRUCTION_GENRE_IDS, UI_CONSTRUCTION_SCREEN_IDS } from ${JSON.stringify(join(S, 'ui-construction-guide.ts'))};`,
  ].join('\n'));
  execFileSync(join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out],
    { stdio: 'pipe' });
  return import(out);
}

/** Mirrors baseTokensFor/MODE_BASE_TOKENS in apps/worker/src/do/session.ts. */
const MODE_BASE_TOKENS = { clay: 4400, stone: 4400, rune: 5200 };
/** Mirrors the gateway ceiling in apps/worker/src/gateway.ts DEFAULT_MODELS; also read live below. */
const GATEWAY_CEILING = { clay: 6500, stone: 5600, rune: 6500 };
/** Mirrors gatewayModelFor in apps/worker/src/do/session.ts. */
//[[ `none` means the request omits productModel entirely — the legacy path. session.ts then reads
//   effectiveProductModel(mode, undefined) = 'apple-max' for gating but leaves agent.productModel
//   undefined, so gatewayModelFor falls through to the mode and maxStepsFor gives the full 16.
const gatewayFor = (mode, lane) =>
  lane === 'apple' ? 'stone' : lane === 'apple-max' ? (mode === 'clay' ? 'stone' : mode) : mode;

/** Resolve every setting the worker would resolve, for one request. */
function resolveSettings(bits, text, opts) {
  const { mode, lane, studioConnected } = opts;
  const traits = bits.classifyRequest(text);
  const choice = bits.chooseEffort({ mode, productModel: lane, step: 1, highEffortUsed: 0, ...traits });
  const requested = bits.tokensForEffort(MODE_BASE_TOKENS[mode], choice.effort);
  const gateway = gatewayFor(mode, lane);
  const ceiling = GATEWAY_CEILING[gateway];
  const sys = bits.systemPrompt({
    mode,
    studioConnected,
    placeName: studioConnected ? 'Baseplate' : null,
    projectName: 'E2E Obby',
    memorySummary: null,
    memoryFacts: [],
    sceneKind: traits.visualDesignTask && mode !== 'clay' ? text : undefined,
    uiBrief: traits.uiDesignTask && mode !== 'clay' ? (bits.designBrief(text)?.text ?? null) : null,
    studioCapabilityNote: null,
    personalisation: null,
    fenceId: 'fence-' + Math.random().toString(36).slice(2, 10),
  });
  const names = Object.keys(bits.TOOLS);
  const allowed = bits.toolsForMode(mode, studioConnected, names);
  //[[ `--drop-tools propose_plan` IS A PROXY, AND THE OUTPUT SAYS SO IN WORDS.
  //
  //   With the Studio-connected 60-tool set, step 1 is `propose_plan` on 9 requests out of 10, so a
  //   one-turn probe can never see what step 2 does — and step 2 is where the plan says the
  //   construction guide gets read. Removing propose_plan asks the nearest answerable question:
  //   with the planning move unavailable, does this model reach the library or go straight to
  //   building? It is NOT production. Any row produced this way carries `droppedTools`, and the
  //   summary refuses to call it a production measurement.
  const dropped = (opts.dropTools ?? []).filter((n) => allowed.has(n));
  for (const n of dropped) allowed.delete(n);
  const tools = names.filter((n) => allowed.has(n)).map((n) => ({
    name: bits.TOOLS[n].def.name,
    description: bits.TOOLS[n].def.description,
    parameters: bits.TOOLS[n].def.parameters,
  }));
  return {
    traits, effort: choice.effort, effortReason: choice.reason, droppedTools: dropped,
    requestedTokens: requested, ceiling, effectiveTokens: Math.min(requested, ceiling),
    clamped: requested > ceiling,
    gateway, system: sys, tools,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// suite: first-reach
// ---------------------------------------------------------------------------
/** Pull every tool name out of raw-probe's `shape` view, whatever nesting the provider used. */
function toolNamesFromShape(shape) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.function && typeof node.function === 'object' && typeof node.function.name === 'string') {
      // raw-probe renders strings as `str(<len>):<first 120 chars>`; the name is always short
      // enough to survive whole, but strip the wrapper rather than assume.
      found.push(node.function.name.replace(/^str\(\d+\):/, ''));
    }
    Object.values(node).forEach(walk);
  };
  walk(shape);
  return found;
}
const unwrap = (s) => (typeof s === 'string' ? s.replace(/^str\(\d+\):/, '') : '');

async function firstReach(bits, chosen, opts) {
  const rows = [];
  let neurons = 0;
  for (const [i, p] of chosen.entries()) {
    const s = resolveSettings(bits, p.text, opts);
    const t0 = Date.now();
    //[[ A TRANSIENT PROVIDER FAULT IS NOT A MEASUREMENT.
    //
    //   Workers AI returned a plain-text 500 on 3 of 12 probes in the first run of this script, and
    //   each of those three succeeded unchanged on the next attempt. Recording them as rows with
    //   `error` shrank the denominator silently: 9 scored out of 12 asked, with nothing in the
    //   headline saying so. Retry the transport fault, and keep the attempt count in the row so a
    //   provider that is failing half the time cannot look like one that is healthy.
    let res = null; let body = null; let attempts = 0;
    while (attempts < 5) {
      attempts += 1;
      res = await fetch(`${BASE}/api/admin/raw-probe`, {
        method: 'POST',
        headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.modelId, system: s.system, prompt: p.text, tools: s.tools,
          maxTokens: s.effectiveTokens, reasoning: s.effort,
          // One affinity key per PROMPT, so no two measurements share a cached prefix in a way that
          // could change what the model sees. Prefix caching affects price, not content — but a
          // measurement should not have to argue that.
          sessionId: `knowledge-reach-${p.id}`,
        }),
      });
      const text = await res.text();
      try { body = JSON.parse(text); } catch { body = { error: `HTTP ${res.status}: ${text.slice(0, 120)}` }; }
      // 429 is a BUDGET refusal and is not transient — stop rather than spending the retry.
      if (res.ok && !body.error) break;
      if (res.status === 429) break;
      await sleep(3000 * attempts);
    }
    if (!res.ok || body.error) {
      rows.push({ id: p.id, family: p.family, attempts, error: body.error ?? `HTTP ${res.status}`, reason: body.reason ?? null });
      process.stderr.write(`  ${String(i + 1).padStart(2)}/${chosen.length} ${p.id.padEnd(18)} ERROR ${body.error ?? res.status}\n`);
      continue;
    }
    neurons += Number(body.neurons) || 0;
    const choice = body.shape?.choices?.[0] ?? {};
    const called = toolNamesFromShape(choice.message?.tool_calls ?? []);
    const reached = called.filter((n) => KNOWLEDGE_TOOLS.includes(n));
    // The model's own private reasoning, which is where an INTENT to call a tool shows up before
    // the call does. Recorded as `intent`, never counted as a call.
    const reasoning = unwrap(choice.message?.reasoning_content);
    const intent = KNOWLEDGE_TOOLS.filter((n) => reasoning.includes(n));
    rows.push({
      id: p.id, family: p.family, expect: p.expect, attempts,
      finishReason: unwrap(choice.finish_reason),
      called, reached, intent,
      reachedExpected: called.includes(p.expect),
      promptTokens: body.usage?.prompt_tokens ?? null,
      completionTokens: body.usage?.completion_tokens ?? null,
      cachedTokens: body.usage?.prompt_tokens_details?.cached_tokens ?? null,
      neurons: body.neurons ?? null,
      ms: Date.now() - t0,
      settings: {
        effort: s.effort, effortReason: s.effortReason, maxTokens: s.effectiveTokens,
        clamped: s.clamped, toolCount: s.tools.length, systemChars: s.system.length,
        traits: s.traits, droppedTools: s.droppedTools,
      },
      reasoningExcerpt: reasoning.slice(0, 400),
      argsExcerpt: (choice.message?.tool_calls ?? []).map((tc) => unwrap(tc?.function?.arguments)).join(' | ').slice(0, 500),
    });
    process.stderr.write(
      `  ${String(i + 1).padStart(2)}/${chosen.length} ${p.id.padEnd(18)} called=[${called.join(',') || '-'}]`
      + `${reached.length ? ' REACHED' : ''}${intent.length && !reached.length ? ` intent=[${intent.join(',')}]` : ''}\n`,
    );
  }
  return { rows, neurons };
}

// ---------------------------------------------------------------------------
// suite: real-loop
// ---------------------------------------------------------------------------

async function adminJson(path, init) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: { error: text.slice(0, 300) } }; }
}

async function realLoop(chosen, opts) {
  const projectId = opts.projectId;
  if (!projectId) throw new Error('--project <uuid> is required for --suite real-loop');
  //[[ THE CONDITION IS READ OFF THE LIVE SESSION, NEVER ASSUMED FROM A FLAG.
  //   Whether Studio is attached decides the SIZE OF THE TOOLSET the agent is offered — 8 offline
  //   versus 60 connected — which is the single biggest thing that could move this number. Asking
  //   the worker is one request and removes the only way this measurement could silently describe
  //   the wrong condition. ]]
  const pre = (await adminJson(`/api/admin/session-info/${projectId}`)).body;
  opts.observedStudioConnected = pre?.pluginConnected === true;
  process.stderr.write(`  session ${projectId}: studioConnected=${opts.observedStudioConnected} status=${pre?.agentStatus}\n`);
  const rows = [];
  for (const [i, p] of chosen.entries()) {
    //[[ DO NOT CREATE THE LOAD YOU ARE ABOUT TO MEASURE.
    //   The first real-loop run of this suite fired three builds back to back on top of twenty-four
    //   raw probes, and two of the three came back `error: 'busy'` — Apple's own circuit breaker.
    //   A suite that trips the breaker and then reports the breaker as a product defect is
    //   measuring itself. Space them out. ]]
    if (i > 0) await sleep(Number(opts.gapMs) || 20_000);
    const since = Date.now();
    const started = await adminJson(`/api/admin/agent-run/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ text: p.text, mode: opts.mode, ...(opts.lane && opts.lane !== 'none' ? { productModel: opts.lane } : {}) }),
    });
    if (!started.body?.ok) {
      rows.push({ id: p.id, family: p.family, error: started.body?.error ?? `HTTP ${started.status}` });
      process.stderr.write(`  ${String(i + 1).padStart(2)}/${chosen.length} ${p.id.padEnd(18)} START FAILED ${started.body?.error}\n`);
      continue;
    }
    // Poll to idle. The ceiling is generous but finite: a wedged run must not hang the suite.
    let info = null;
    const deadline = Date.now() + (Number(opts.maxMs) || 420_000);
    while (Date.now() < deadline) {
      await sleep(4000);
      info = (await adminJson(`/api/admin/session-info/${projectId}`)).body;
      if (info?.agentStatus !== 'running') break;
    }
    const msgs = (await adminJson(`/api/admin/session-messages/${projectId}?limit=100`)).body;
    //[[ `createdAt` COMES BACK AS AN ISO STRING, NOT A NUMBER.
    //
    //   The first version of this filter read `m.createdAt >= since` with `since = Date.now()`.
    //   JavaScript compares a string to a number by coercing the STRING to a number, and
    //   Number('2026-09-20T11:33:31.367Z') is NaN, so every comparison was false and every run
    //   reported `steps=0 called=[-]`. That is the shape of defect this whole measurement is about:
    //   it did not report "I could not read the transcript", it reported "the model called nothing",
    //   which is a FINDING, and a false one. The transcripts it was silently discarding showed
    //   get_ui_construction called as the very first tool.
    //
    //   Parsed explicitly, and a row whose timestamp will not parse is KEPT rather than dropped —
    //   over-including an old message shows up as an implausible trace, while dropping a new one
    //   shows up as a clean zero. ]]
    const freshAfter = (m) => {
      const t = Date.parse(m.createdAt ?? m.created_at ?? '');
      return Number.isNaN(t) ? true : t >= since;
    };
    const fresh = (msgs?.messages ?? []).filter(freshAfter);
    const trace = [];
    for (const m of fresh) {
      const t = m.toolTrace ?? m.tool_trace ?? null;
      const parsed = typeof t === 'string' ? JSON.parse(t) : t;
      if (Array.isArray(parsed)) for (const e of parsed) trace.push(e);
    }
    const called = trace.map((e) => e.tool);
    const reached = called.filter((n) => KNOWLEDGE_TOOLS.includes(n));
    rows.push({
      id: p.id, family: p.family, expect: p.expect,
      steps: trace.length, called, reached,
      reachedExpected: called.includes(p.expect),
      agentStatus: info?.agentStatus ?? null,
      stopReason: fresh.filter((m) => m.role === 'assistant').map((m) => m.stopReason ?? null),
      runError: fresh.filter((m) => m.role === 'assistant').map((m) => m.error ?? null),
      creditsSpent: fresh.filter((m) => m.role === 'assistant').map((m) => m.creditsSpent ?? null),
      trace: trace.map((e) => ({ tool: e.tool, ok: e.ok, summary: String(e.summary ?? '').slice(0, 160) })),
      assistantText: fresh.filter((m) => m.role === 'assistant').map((m) => String(m.content ?? '').slice(0, 600)),
    });
    process.stderr.write(
      `  ${String(i + 1).padStart(2)}/${chosen.length} ${p.id.padEnd(18)} steps=${trace.length} called=[${called.join(',') || '-'}]${reached.length ? ' REACHED' : ''}\n`,
    );
  }
  return { rows, neurons: null };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const suite = arg('suite', 'first-reach');
const mode = arg('mode', 'stone');
const lane = arg('lane', 'apple-max');
const studioConnected = !flag('offline');
const n = Number(arg('n', String(PROMPTS.length)));
const family = arg('family', null);
const pool = family ? PROMPTS.filter((p) => p.family === family) : PROMPTS;
const chosen = pool.slice(0, Math.min(n, pool.length));
const dropTools = (arg('drop-tools', '') || '').split(',').map((x) => x.trim()).filter(Boolean);

const bits = await loadWorkerBits();
// The two libraries themselves, exported by the bundle above under short names, so this file can
// also audit what they ANSWER once they are reached — `vm.askVerifiedModule`, `uc.getUIConstruction`
// and the advertised id lists. Reaching the library and the library answering usefully are two
// different questions and a harness for one should not have to be rebuilt for the other.
const vm = bits;
const uc = bits;

if (flag('show-settings')) {
  const s = resolveSettings(bits, PROMPTS[0].text, { mode, lane, studioConnected, dropTools });
  console.log(JSON.stringify({
    base: BASE, suite, mode, lane, studioConnected,
    gateway: s.gateway, effort: s.effort, effortReason: s.effortReason,
    requestedTokens: s.requestedTokens, ceiling: s.ceiling, effectiveTokens: s.effectiveTokens, clamped: s.clamped,
    toolCount: s.tools.length, toolNames: s.tools.map((t) => t.name),
    systemChars: s.system.length, traits: s.traits,
    knowledgeToolsOffered: KNOWLEDGE_TOOLS.filter((k) => s.tools.some((t) => t.name === k)),
  }, null, 1));
  process.exit(0);
}

if (!KEY) { console.error('GOLEM_ADMIN_KEY is not set'); process.exit(2); }

// The deployed build and the live model table, recorded WITH the result. A number whose build is
// unknown cannot be compared to the next one.
const health = await (await fetch(`${BASE}/api/health`)).json().catch(() => ({}));
const models = (await adminJson('/api/admin/models')).body;
const modelId = models?.[gatewayFor(mode, lane)]?.id ?? null;
if (suite === 'first-reach' && !modelId) { console.error('could not read the live model table'); process.exit(2); }

const settings0 = resolveSettings(bits, chosen[0].text, { mode, lane, studioConnected, dropTools });
console.error(
  `\n${suite} | ${BASE} build ${health.buildSha} | lane ${lane} mode ${mode} -> gateway ${settings0.gateway} = ${modelId}\n`
  + `  studioConnected=${studioConnected} tools=${settings0.tools.length} effort=${settings0.effort} maxTokens=${settings0.effectiveTokens} systemChars=${settings0.system.length}\n`,
);

const opts = { mode, lane, studioConnected, modelId, dropTools, projectId: arg('project', null), maxMs: arg('max-ms', null), gapMs: arg('gap-ms', null) };
const { rows, neurons } = suite === 'real-loop'
  ? await realLoop(chosen, opts)
  : await firstReach(bits, chosen, opts);

//[[ A RUN THAT NEVER GOT A MODEL TURN IS NOT A RUN THAT DECLINED TO CALL THE TOOL.
//
//   The first real-loop batch reported "5/12 (42%)". Seven of those twelve had been refused by the
//   provider's rate limiter before the model produced a single token — `stopReason: error`,
//   `error: busy`, `toolTrace: []`. Counting them in the denominator turned NINE FAILURES TO
//   OBSERVE into an observation that the model ignored its libraries 58% of the time. That is the
//   exact shape this repository names as its worst defect class, committed by the instrument
//   measuring for it.
//
//   `measurable` is therefore runs that produced at least one tool call OR a non-error stopReason:
//   a run that finished and called nothing IS a measurement (and a damning one), while a run the
//   provider refused is not. The unmeasurable count is reported beside the rate, never hidden in it.
const scored = rows.filter((r) => !r.error);
const producedOutput = (r) =>
  (r.called ?? []).length > 0 || (r.stopReason ?? []).some((x) => x && x !== 'error');
const measurable = suite === 'real-loop' ? scored.filter(producedOutput) : scored;
const unmeasurable = scored.length - measurable.length;
const reachedAny = measurable.filter((r) => r.reached.length > 0);
const reachedExpected = measurable.filter((r) => r.reachedExpected);
const intended = measurable.filter((r) => (r.intent ?? []).length > 0 && r.reached.length === 0);

const out = {
  measuredAt: new Date().toISOString(),
  what: suite === 'real-loop'
    ? 'A REAL multi-step agent run on a real project, tools actually executed, read from the session transcript.'
    : 'The FIRST turn only, with the full toolset and the real system prompt. Not a whole build.',
  base: BASE, buildSha: health.buildSha ?? null,
  suite, mode, lane, gateway: settings0.gateway, modelId,
  arm: `${studioConnected ? 'Studio-connected toolset' : 'Studio-offline toolset'}${dropTools.length ? `, WITH ${dropTools.join(' and ')} REMOVED — a proxy for a later step, not production` : ''}`,
  droppedTools: dropTools,
  studioConnected: suite === 'real-loop' ? (opts.observedStudioConnected ?? null) : studioConnected,
  studioConnectedSource: suite === 'real-loop' ? 'read from the live session' : 'set by this harness',
  settings: {
    effort: settings0.effort, effortReason: settings0.effortReason,
    maxTokens: settings0.effectiveTokens, ceiling: settings0.ceiling, clamped: settings0.clamped,
    toolCount: settings0.tools.length, systemChars: settings0.system.length,
    knowledgeToolsOffered: KNOWLEDGE_TOOLS.filter((k) => settings0.tools.some((t) => t.name === k)),
    temperatureSent: suite === 'real-loop' ? 0.25 : null,
    temperatureNote: suite === 'real-loop' ? null
      : 'raw-probe does not forward temperature; production stone sends 0.25. Everything else matches.',
  },
  n: rows.length, scored: scored.length,
  measurable: measurable.length,
  unmeasurable,
  unmeasurableNote: unmeasurable
    ? `${unmeasurable} run(s) were refused by the provider before the model produced anything. They are NOT in the denominator: they are failures to observe, not observations.`
    : null,
  reachedAny: reachedAny.length,
  reachedExpected: reachedExpected.length,
  reachRatePct: measurable.length ? Math.round((reachedAny.length / measurable.length) * 100) : null,
  intentWithoutCall: intended.length,
  neurons,
  rows,
};
mkdirSync(RUNS_DIR, { recursive: true });
const armTag = `${studioConnected ? 'connected' : 'offline'}${dropTools.length ? '-no-' + dropTools.join('-') : ''}`;
const path = join(RUNS_DIR, `knowledge-reach-${suite}-${armTag}.json`);
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');

console.log(`\n${suite}: knowledge tool reached in ${reachedAny.length}/${measurable.length} runs that produced any model output (${out.reachRatePct}%)`);
console.log(`  the EXPECTED one for the request: ${reachedExpected.length}/${measurable.length}`);
if (unmeasurable) console.log(`  NOT COUNTED: ${unmeasurable} run(s) the provider refused before the model spoke — a failure to observe, not a zero.`);
if (suite !== 'real-loop') console.log(`  named it in reasoning but did not call it: ${intended.length}/${measurable.length}`);
if (neurons !== null) console.log(`  neurons: ${neurons}`);
console.log('->', path);
