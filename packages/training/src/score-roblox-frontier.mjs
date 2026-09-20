#!/usr/bin/env node
/**
 * RUN THE MODEL'S ANSWER AND ASK THE RECORDING, NOT THE TEXT.
 *
 * Four outcomes are kept apart on purpose, because three of them are not "the model does not know
 * Roblox" and collapsing them is how an eval reports the wrong thing:
 *
 *   no_code_block     the answer was prose. A formatting failure, and a real one — the product
 *                     parses a fenced block out of the answer too — but not a Roblox failure.
 *   does_not_compile  luau-compile rejected it. A syntax failure.
 *   runtime_error     the chunk threw under the harness. THE MESSAGE IS ALWAYS CARRIED, because a
 *                     throw can mean the model used an API this shim does not implement, which is
 *                     MY gap and must not be counted against the model without a person reading
 *                     the sentence. These are excluded from the pass rate and reported on their own
 *                     line with their messages, and `attempted` is printed beside `measured` so the
 *                     denominator is visible rather than implied.
 *   checks            the script ran, the probe fired its handlers, and the recording was read.
 *                     Only here does a number mean something about Roblox competence.
 *
 * WHICH OF THOSE COUNT AGAINST THE MODEL is decided in `tally` at the bottom of this file, and the
 * comment there is the one to read: `checked`, `does_not_compile` and `no_code_block` are the
 * model's verdict and are in the denominator; `runtime_error` and `harness_unavailable` may be the
 * harness's fault and stay out of it. Until 2026-09-21 the arithmetic kept all four out, which
 * contradicted the two paragraphs above and raised every headline this file has ever printed.
 *
 * A check may also answer `null`, meaning UNRESOLVED: the probe could not establish the fact (the
 * handler was never connected, the module returned nothing, the harness read something it has no
 * honest answer for). An unresolved check is neither a pass nor a fail and is counted separately.
 * An item with any unresolved check does not pass, and says why.
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLuau } from '../../evals/src/roblox-antipatterns.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const HARNESS_PATH = resolve(HERE, 'frontier-harness.luau');
const OUT_MARKER = '__APPLE_FRONTIER__';

/** Pull the first fenced Luau block, or null. A model that wrote prose scores as a miss. */
export function fencedLuau(answer) {
  const m = /```(?:luau|lua)?\s*\n([\s\S]*?)```/.exec(String(answer ?? ''));
  return m ? m[1].trim() : null;
}

/**
 * Build the program: harness, then the model's code, then the item's probe, then the emit.
 *
 * The probe runs in its OWN pcall and after the build's, so a build that threw still produces a
 * recording of everything it managed to do before it threw. That is what makes `runtime_error`
 * informative rather than a dead end.
 */
export function buildProgram(harness, source, probe, shape, setup) {
  const body = shape === 'module'
    ? `__MODULE = (function()\n${source}\nend)()`
    : source;
  return `${harness}
__MODULE = nil
-- The world the item says already exists (a Part named "Platform", a pre-placed RemoteEvent). Run
-- BEFORE the model's code, because a script that reaches for something the prompt promised is not
-- making a mistake, and making it fail there would score the harness rather than the model.
local __sok, __serr = pcall(function()
${setup ?? ''}
end)
if not __sok then error("harness setup failed: " .. tostring(__serr), 0) end
local __ok, __err = pcall(function()
${body}
end)
local __pok, __perr = pcall(function()
${probe ?? ''}
end)
if not __pok then __APPLE.fact("__probeError", tostring(__perr)) end
if __ok then __APPLE_EMIT("ok", "")
elseif tostring(__err):find(__APPLE.LOOP_MARKER, 1, true) then __APPLE_EMIT("loop", "reached its update loop")
else __APPLE_EMIT("error", tostring(__err)) end
`;
}

/** Lua cannot distinguish an empty array from an empty table; both arrive as {}. */
const asArray = (v) => (Array.isArray(v) ? v : []);

/**
 * Compile and run one answer under the harness.
 * @returns {{ran:false, reason:string} | {ran:true, compiled:false, detail:string} | {ran:true, compiled:true, trace:object}}
 */
export function runUnderHarness(source, probe, shape, setup, { binary = 'luau', compiler = 'luau-compile', timeoutMs = 15_000 } = {}) {
  let harness;
  try {
    harness = readFileSync(HARNESS_PATH, 'utf8');
  } catch (e) {
    return { ran: false, reason: `harness unreadable: ${e.message}` };
  }
  const program = buildProgram(harness, source, probe, shape, setup);
  const dir = mkdtempSync(join(tmpdir(), 'golem-frontier-'));
  try {
    const file = join(dir, 'item.luau');
    writeFileSync(file, program);

    //[[ COMPILE FIRST, BECAUSE `luau` EXITS 1 FOR BOTH.
    //   A syntax error and a thrown chunk are the same exit status, so deciding from the status
    //   alone announces code that could not be PARSED as code that was run and found wrong. That
    //   is this repository's observation-failure pattern; `luau-compile --null` is the boundary
    //   that answers it, and both runSpecCase and score-ui.mjs keep the same one.
    const compiled = spawnSync(compiler, ['--null', file], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    if (compiled.error) {
      return { ran: false, reason: compiled.error.code === 'ENOENT' ? `no ${compiler} binary` : compiled.error.message };
    }
    if (compiled.status !== 0) {
      const detail = (String(compiled.stderr).trim() || String(compiled.stdout).trim() || 'no output')
        .split('\n').filter((l) => !/^Compiled /.test(l))[0] ?? 'no output';
      return { ran: true, compiled: false, detail: detail.slice(0, 300) };
    }

    const run = spawnSync(binary, [file], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 24 * 1024 * 1024 });
    if (run.error) return { ran: false, reason: run.error.code === 'ENOENT' ? `no ${binary} binary` : run.error.message };
    if (run.status === null) return { ran: false, reason: 'timed out' };
    const out = String(run.stdout);
    const at = out.lastIndexOf(OUT_MARKER);
    if (at === -1) {
      const why = (String(run.stderr).trim() || out.trim() || 'no output').split('\n')[0].slice(0, 300);
      return { ran: false, reason: `harness printed no recording (${why})` };
    }
    let trace;
    try {
      trace = JSON.parse(out.slice(at + OUT_MARKER.length).trim());
    } catch (e) {
      return { ran: false, reason: `recording did not parse: ${e.message}` };
    }
    trace.handlerErrors = asArray(trace.handlerErrors);
    trace.unresolved = asArray(trace.unresolved);
    trace.calls = asArray(trace.calls);
    trace.storeOps = asArray(trace.storeOps);
    trace.nodes = asArray(trace.nodes);
    trace.facts = trace.facts && typeof trace.facts === 'object' ? trace.facts : {};
    return { ran: true, compiled: true, trace };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Score one item against one answer.
 *
 * @returns {{outcome, ok, checks, detail?, unresolvedCount, source?}}
 */
export function scoreFrontierItem(item, answer, opts = {}) {
  const source = typeof answer === 'string' && !opts.raw ? fencedLuau(answer) : String(answer ?? '');
  if (!source) return { outcome: 'no_code_block', ok: false, checks: [], unresolvedCount: 0 };

  const result = runUnderHarness(source, item.probe, item.shape, item.setup, opts);
  if (!result.ran) return { outcome: 'harness_unavailable', ok: false, checks: [], unresolvedCount: 0, detail: result.reason, source };
  if (!result.compiled) return { outcome: 'does_not_compile', ok: false, checks: [], unresolvedCount: 0, detail: result.detail, source };

  const trace = result.trace;
  // The static rules, attached so a check can consult them. Where a static rule and a behavioural
  // check disagree, the behavioural one decides — it observed the program, the rule read it.
  try {
    const context = item.id.includes('client') || /LocalScript/.test(item.prompt) ? 'client' : 'server';
    trace.antipatterns = analyzeLuau(source, { context }).findings;
  } catch (e) {
    trace.antipatterns = [];
    trace.antipatternError = String(e.message ?? e);
  }

  const checks = item.checks.map((c) => {
    let verdict;
    try {
      verdict = c.run(trace);
    } catch (e) {
      // A check that threw observed nothing. Reporting that as a failure would be a failure to
      // observe wearing an observation's clothes, which is the exact defect this repository names.
      return { id: c.id, pass: null, why: c.why, error: String(e.message ?? e) };
    }
    return { id: c.id, pass: verdict === null || verdict === undefined ? null : Boolean(verdict), why: c.why };
  });

  const unresolvedCount = checks.filter((c) => c.pass === null).length;
  const failed = checks.filter((c) => c.pass === false);

  if (trace.status === 'error') {
    return {
      outcome: 'runtime_error', ok: false, checks, unresolvedCount,
      detail: String(trace.detail ?? '').slice(0, 400),
      probeError: trace.facts?.__probeError ?? null,
      unresolvedReads: trace.unresolved.slice(0, 12),
      source, trace,
    };
  }

  return {
    outcome: 'checked',
    ok: failed.length === 0 && unresolvedCount === 0,
    checks, unresolvedCount,
    failedIds: failed.map((c) => c.id),
    probeError: trace.facts?.__probeError ?? null,
    unresolvedReads: trace.unresolved.slice(0, 12),
    source, trace,
  };
}

//[[ WHICH OUTCOMES BELONG IN THE DENOMINATOR, AND WHY EXACTLY THESE THREE.
//
//   2026-09-21: the first run of this benchmark that ever produced a number scored `9/13 items
//   fully correct (69.2%)` over sixteen items. Two of the three missing items were answers that
//   the Luau compiler REJECTED — `Players.PlayerRemoving:(function(player)` with no `Connect`, and
//   `HttpService:CreateRequestHeadersAndEncodeData and ...`, which is not an expression. Both are
//   the model's own bytes; the harness prologue ends at line 1013 and both errors are past line
//   1029. A customer who pastes either into Studio gets a red underline and no game.
//
//   `tally` counted `measured` as `outcome === 'checked'` alone, so those two left the denominator
//   and the headline rose. That inverts this repository's own rule: a failure to observe must not
//   render as an observation, and its mirror — an observation must not render as a failure to
//   observe. "It does not compile" is the most decidable verdict a code benchmark can reach.
//
//   This file's own header already said so and the arithmetic disagreed with it: `fencedLuau`'s
//   doc comment says "a model that wrote prose scores as a miss", `does_not_compile` is described
//   as "a syntax failure", and only the `runtime_error` paragraph claims exclusion. So the three
//   scored outcomes are the ones whose verdict is the model's:
//
//     checked           it ran and the recording was read.
//     does_not_compile  luau-compile rejected the model's own text. A failure, and a decidable one.
//     no_code_block     the answer was prose. The product parses a fence out of an answer too.
//
//   `runtime_error` and `harness_unavailable` stay OUT, unchanged and for the unchanged reason: a
//   throw can mean the model reached for an API this shim does not implement, which is the
//   harness's gap. In this same run `look-raycast` threw `attempt to index nil with 'Connect'` on
//   `mouse.Button1Down`, which the shim genuinely does not provide. Counting that against the
//   model would score the harness. `excluded` is returned beside `measured` so the denominator is
//   printed rather than implied.
export const SCORED_OUTCOMES = Object.freeze(['checked', 'does_not_compile', 'no_code_block']);

/** Roll a list of per-item results into the scoreboard the report prints. */
export function tally(items, results) {
  const byAxis = {};
  const byCheck = {};
  let measured = 0, passed = 0, excluded = 0;
  const outcomes = {};
  for (const [i, item] of items.entries()) {
    const r = results[i];
    if (!r) continue;
    outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    byAxis[item.axis] ??= { measured: 0, passed: 0, attempted: 0, checksPassed: 0, checksTotal: 0 };
    byAxis[item.axis].attempted += 1;
    const scoreable = SCORED_OUTCOMES.includes(r.outcome);
    if (!scoreable) excluded += 1;
    if (scoreable) {
      measured += 1;
      byAxis[item.axis].measured += 1;
      if (r.ok) { passed += 1; byAxis[item.axis].passed += 1; }
    }
    for (const c of r.checks ?? []) {
      const key = `${item.id}/${c.id}`;
      byCheck[key] = { pass: c.pass, axis: item.axis, why: c.why };
      if (scoreable) {
        byAxis[item.axis].checksTotal += 1;
        if (c.pass === true) byAxis[item.axis].checksPassed += 1;
      }
    }
  }
  return {
    attempted: items.length,
    measured,
    passed,
    excluded,
    pct: measured ? Math.round((passed / measured) * 1000) / 10 : 0,
    outcomes,
    byAxis,
    byCheck,
  };
}
