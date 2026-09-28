#!/usr/bin/env node
/**
 * Score base against adapter on the held-out set, by RUNNING what each produced.
 *
 * No similarity to a reference answer is computed anywhere here, deliberately. A Luau module is
 * right when its behaviour is right, and the curriculum already carries the exhaustive checks that
 * decide that; a tool call is right when the product's own registry accepts it. Both are settled
 * by execution, so a model that writes an unfamiliar but correct answer scores as correct and one
 * that paraphrases the reference while getting the logic wrong does not.
 *
 * The comparison is the point. `apple-v3` was WORSE than its own base at this job — it had learned
 * to reproduce the harvested dataset's instruction scaffolding — and no single number would ever
 * have revealed that. Every figure below is reported for both, from the same prompts at the same
 * temperature, or it is not reported.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { detectContextDependencies } from './audit-dataset.mjs';
import { loadRegistry, schemaProblems } from './tool-trajectory-verify.mjs';
import { runSpecCase } from './tool-trajectory-verify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// The teacher-drafted, executor-verified examples (v5+) carry their own checks too; a held-out
// row from them is scored exactly like an authored one.
const SYNTH = join(HERE, '../data/game-logic-synth-v1/examples.json');
let synth = [];
try { synth = JSON.parse(readFileSync(SYNTH, 'utf8')); } catch { /* no synth set yet */ }
const byId = new Map([...ALL_GAME_LOGIC_CURRICULUM, ...synth].map((e) => [e.id, e]));

/** Pull the first fenced Luau block, or null. A model that wrote prose scores as a miss. */
export function fencedLuau(answer) {
  const m = /```(?:luau|lua)?\s*\n([\s\S]*?)```/.exec(String(answer ?? ''));
  return m ? m[1].trim() : null;
}

/** Run a produced module against its example's own exhaustive checks. */
export function scoreGameLogic(example, answer) {
  const source = fencedLuau(answer);
  if (!source) return { ok: false, reason: 'no_code_block' };
  const context = detectContextDependencies(source);
  if (!context.parseOk) return { ok: false, reason: 'does_not_parse' };
  if (!context.standalone) return { ok: false, reason: 'not_standalone' };
  const outcome = runSpecCase(`local candidate = (function()\n${source}\nend)()\n${example.checks}`);
  if (!outcome.ran) return { ok: false, reason: `harness_unavailable:${outcome.reason}` };
  if (!outcome.compiled) return { ok: false, reason: 'does_not_compile' };
  return outcome.passed ? { ok: true } : { ok: false, reason: 'fails_own_checks' };
}

/**
 * Find a tool call in free text, in any of the shapes Llama emits it.
 *
 * Lenient on purpose: the question is whether the model learned to CALL A TOOL WITH VALID
 * ARGUMENTS, not whether it matched one serialisation. Being strict about the wrapper would score
 * the chat template rather than the model.
 */
export function extractToolCall(answer) {
  const text = String(answer ?? '').replace(/<\|python_tag\|>/g, '');
  const candidates = [];
  // Whole-JSON objects, scanned from each '{' so a call inside prose is still found.
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  for (const raw of candidates) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!parsed || typeof parsed !== 'object') continue;
    const name = parsed.name ?? parsed.function?.name;
    if (typeof name !== 'string') continue;
    let args = parsed.parameters ?? parsed.arguments ?? parsed.function?.arguments ?? {};
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = null; } }
    if (args === null || typeof args !== 'object') return { name, args: null, reason: 'arguments_not_an_object' };
    return { name, args };
  }
  return null;
}

/** A call scores only if the product's own registry would accept it. */
export function scoreTrajectory(call, registry) {
  if (!call) return { ok: false, reason: 'no_tool_call' };
  const impl = registry.TOOLS[call.name];
  if (!impl) return { ok: false, reason: 'tool_does_not_exist' };
  if (call.args === null) return { ok: false, reason: call.reason ?? 'bad_arguments' };
  const problems = schemaProblems(impl.def?.parameters, call.args, 'call');
  return problems.length ? { ok: false, reason: 'arguments_rejected', detail: problems[0] } : { ok: true };
}

/** A wrap-up turn is right when it answers in prose; any call there is the model not finishing. */
export function scoreFinish(answer) {
  if (!String(answer ?? '').trim()) return { ok: false, reason: 'empty_finish' };
  return extractToolCall(answer) ? { ok: false, reason: 'called_a_tool_instead_of_finishing' } : { ok: true };
}

/**
 * The craft a call carries: every instance class it creates, the font, the lighting mood, the
 * terrain operation. A registry-valid call can still be the unstyled UI the visual gauntlet
 * failed on, so trajectory validity alone cannot say whether the model learned the craft.
 */
export function styleFeatures(call) {
  const out = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (k === 'className' && typeof x === 'string') out.add(`class:${x}`);
      else if (k === 'Font') out.add(`font:${x?.v ?? x}`);
      else if (k === 'mood' && typeof x === 'string') out.add(`mood:${x}`);
      else if (k === 'action' && typeof x === 'string') out.add(`op:${x}`);
      else walk(x);
    }
  };
  walk(call?.args);
  return out;
}

/** Share of the reference call's craft features the produced call has; null when the reference has none. */
export function styleRecall(reference, produced) {
  const want = styleFeatures(reference);
  if (want.size === 0) return null;
  const got = styleFeatures(produced);
  return [...want].filter((f) => got.has(f)).length / want.size;
}

function referenceCall(message) {
  const fn = message?.tool_calls?.[0]?.function;
  if (!fn) return null;
  try { return { name: fn.name, args: typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments }; } catch { return null; }
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: score-eval.mjs <eval.json>');
    process.exit(2);
  }
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const registry = await loadRegistry();

  const tally = {
    base: { 'game-logic': { ok: 0, n: 0, reasons: {} }, trajectory: { ok: 0, n: 0, reasons: {} }, finish: { ok: 0, n: 0, reasons: {} } },
    adapter: { 'game-logic': { ok: 0, n: 0, reasons: {} }, trajectory: { ok: 0, n: 0, reasons: {} }, finish: { ok: 0, n: 0, reasons: {} } },
  };
  const perRow = [];
  const style = { base: { sum: 0, n: 0 }, adapter: { sum: 0, n: 0 } };

  for (const [id, row] of Object.entries(data.rows)) {
    const isTrajectory = row.kind === 'apple-tool-trajectory';
    // A trajectory row whose reference is prose is the wrap-up turn, scored on its own track.
    const isFinish = isTrajectory && !row.reference?.tool_calls?.length;
    const entry = { id, family: row.family, kind: isFinish ? 'finish' : isTrajectory ? 'trajectory' : 'game-logic' };
    for (const side of ['base', 'adapter']) {
      const answer = row[side];
      let result;
      if (isFinish) {
        result = scoreFinish(answer);
      } else if (isTrajectory) {
        const call = extractToolCall(answer);
        result = scoreTrajectory(call, registry);
        const recall = styleRecall(referenceCall(row.reference), call);
        if (recall !== null) {
          entry[`${side}Style`] = recall;
          style[side].sum += recall;
          style[side].n += 1;
        }
      } else {
        const example = byId.get(id);
        result = example ? scoreGameLogic(example, answer) : { ok: false, reason: 'example_not_in_curriculum' };
      }
      const bucket = tally[side][entry.kind];
      bucket.n += 1;
      if (result.ok) bucket.ok += 1;
      else bucket.reasons[result.reason] = (bucket.reasons[result.reason] ?? 0) + 1;
      entry[side] = result;
    }
    perRow.push(entry);
  }

  const pct = (b) => (b.n ? ((b.ok / b.n) * 100).toFixed(0) : '—');
  console.log('track          base            adapter');
  for (const kind of ['game-logic', 'trajectory', 'finish']) {
    const b = tally.base[kind];
    const a = tally.adapter[kind];
    console.log(`${kind.padEnd(14)} ${String(b.ok + '/' + b.n).padEnd(7)} ${pct(b).padStart(3)}%   ${String(a.ok + '/' + a.n).padEnd(7)} ${pct(a).padStart(3)}%`);
  }
  console.log();
  for (const side of ['base', 'adapter']) {
    for (const kind of ['game-logic', 'trajectory', 'finish']) {
      const r = tally[side][kind].reasons;
      if (Object.keys(r).length) console.log(`  ${side} ${kind} misses: ${JSON.stringify(r)}`);
    }
  }

  // Craft recall on the rows whose reference call carries any (classes, font, mood, terrain op).
  const mean = (s) => (s.n ? (s.sum / s.n).toFixed(2) : '—');
  console.log(`style recall   ${mean(style.base).padStart(10)}      ${mean(style.adapter)}   (n=${style.base.n} visual call rows)`);

  const out = file.replace(/\.json$/, '-scored.json');
  const selectedSide = data.adapterSide ?? 'adapter';
  const selectedFiles = data.provenance?.adapterFiles?.[selectedSide];
  writeFileSync(out, JSON.stringify({ tally, style, perRow,
    model: data.model, adapter: data.adapter, provenance: data.provenance ?? null,
    adapterIdentity: selectedFiles ? { side: selectedSide, files: selectedFiles } : null,
  }, null, 1));
  console.log(`\nwrote ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
