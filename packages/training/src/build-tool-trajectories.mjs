#!/usr/bin/env node
/**
 * Turn verified trajectory seeds into training rows.
 *
 * WHAT THIS DATASET HONESTLY IS. A seed records a request, the ordered calls that answer it, and
 * a reply. It does NOT record what the tools returned, because nothing here ran against a Studio
 * session — `install_module` was never installed, `run_and_check` never play-tested anything.
 *
 * That gap has exactly two defensible treatments and one indefensible one. The indefensible one
 * is to invent plausible tool results and let them sit in the transcript looking like
 * observations; this repository has a name for that and a file full of instances. So:
 *
 *   PREFIX EXPANSION (the default). A trajectory of N calls becomes N rows. Row i shows the
 *   request plus the calls already made, and the label is call i. Tool results appear as an
 *   explicit `[no result recorded]` marker rather than as content — the model is trained to
 *   choose the next call, and is never shown a fabricated observation to reason from.
 *
 *   The cost, stated rather than hidden: this teaches tool SELECTION and ARGUMENT CONSTRUCTION.
 *   It does not teach recovery — reading a `propIssues` list and repairing it, or reading an
 *   error and changing approach — because no seed contains a real failure to recover from. That
 *   capability needs recorded sessions and is not claimed here.
 *
 * WHY THIS SHAPE IS THE ONE THE PRODUCT NEEDS. `apps/worker/src/tool-recovery.ts` exists because
 * the served model writes tool calls as PROSE instead of emitting them — a whole module, an
 * allowlist and a security boundary built to catch a failure that is, at bottom, a training
 * failure. The current dataset's 404 rows are harvested Luau fragments; not one of them shows a
 * tool call. This is the first data aimed at that defect.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_TRAJECTORY_CURRICULUM } from './tool-trajectory-curriculum.mjs';
import { loadRegistry, verifyTrajectory } from './tool-trajectory-verify.mjs';
import { assignSplits } from './build-dataset.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

export const TRAJECTORY_SYSTEM =
  'You are Apple, a Roblox engineering assistant working inside Roblox Studio. Answer a build ' +
  'request by calling the tools you have been given: plan first, carry the plan out, and end with ' +
  'a check. Report only what the calls established.';

/** The marker that stands where a recorded result would be. Never a plausible-looking result. */
export const NO_RESULT = '[no result recorded — this trajectory was authored, not captured from a session]';

const hash = (v) => createHash('sha256').update(v).digest('hex');

/** One OpenAI-shaped tool call. `arguments` is a JSON STRING, as every chat template expects. */
function toolCall(step, index) {
  return {
    id: `call_${index}`,
    type: 'function',
    function: { name: step.tool, arguments: JSON.stringify(step.args ?? {}) },
  };
}

/**
 * Expand one seed into rows: N calls become N decision rows, plus one final row whose label is
 * the reply. The reply row is what teaches the model to stop calling and answer.
 */
export function expandSeed(seed) {
  const rows = [];
  for (let i = 0; i < seed.trajectory.length; i++) {
    const messages = [
      { role: 'system', content: TRAJECTORY_SYSTEM },
      { role: 'user', content: seed.prompt },
    ];
    for (let j = 0; j < i; j++) {
      messages.push({ role: 'assistant', content: '', tool_calls: [toolCall(seed.trajectory[j], j)] });
      messages.push({ role: 'tool', tool_call_id: `call_${j}`, name: seed.trajectory[j].tool, content: NO_RESULT });
    }
    messages.push({ role: 'assistant', content: '', tool_calls: [toolCall(seed.trajectory[i], i)] });
    rows.push({ messages, seedId: seed.id, family: seed.family, kind: 'call', step: i });
  }

  const finalMessages = [
    { role: 'system', content: TRAJECTORY_SYSTEM },
    { role: 'user', content: seed.prompt },
  ];
  for (let j = 0; j < seed.trajectory.length; j++) {
    finalMessages.push({ role: 'assistant', content: '', tool_calls: [toolCall(seed.trajectory[j], j)] });
    finalMessages.push({ role: 'tool', tool_call_id: `call_${j}`, name: seed.trajectory[j].tool, content: NO_RESULT });
  }
  finalMessages.push({ role: 'assistant', content: seed.reply });
  rows.push({ messages: finalMessages, seedId: seed.id, family: seed.family, kind: 'reply', step: seed.trajectory.length });

  return rows;
}

/**
 * Build every row, refusing any seed that does not verify.
 *
 * A seed is re-verified here rather than trusted from its test run, because the dataset is the
 * artifact that leaves this repository and the test is not. If the registry changed since the
 * seeds were written, this is where that shows up.
 */
export async function buildTrajectoryRows(curricula, { registry = null } = {}) {
  const reg = registry ?? (await loadRegistry());
  const rows = [];
  const refused = [];
  const seen = new Set();
  for (const seed of curricula) {
    if (seen.has(seed.id)) throw new Error(`duplicate seed id across curricula: ${seed.id}`);
    seen.add(seed.id);
    const result = await verifyTrajectory(seed, { registry: reg });
    if (!result.ok) {
      refused.push({ id: seed.id, problems: result.problems });
      continue;
    }
    rows.push(...expandSeed(seed));
  }
  return { rows, refused };
}

/** Family-disjoint splits, so a family never appears in both train and test. */
export function splitRows(rows) {
  const counts = {};
  for (const row of rows) counts[row.family] = (counts[row.family] ?? 0) + 1;
  const { assignment } = assignSplits(counts);
  const out = { train: [], val: [], test: [] };
  for (const row of rows) out[assignment[row.family]].push(row);
  return { splits: out, assignment };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const outDir = join(ROOT, 'packages/training/data/tool-trajectories-v1');

  const curricula = [...TOOL_TRAJECTORY_CURRICULUM];
  for (const extra of ['./tool-trajectory-curriculum-b.mjs']) {
    try {
      const mod = await import(extra);
      for (const value of Object.values(mod)) if (Array.isArray(value)) curricula.push(...value);
    } catch {
      // A batch that is not present yet is not an error; it is a batch that is not present yet.
    }
  }

  const { rows, refused } = await buildTrajectoryRows(curricula);
  if (refused.length) {
    for (const r of refused) console.error(`REFUSED ${r.id}: ${r.problems.join('; ')}`);
    throw new Error(`${refused.length} seed(s) did not verify; nothing was written`);
  }

  const { splits, assignment } = splitRows(rows);
  const families = [...new Set(rows.map((r) => r.family))];
  console.log(`seeds: ${curricula.length}  rows: ${rows.length}  families: ${families.length}`);
  console.log(`  train ${splits.train.length}  val ${splits.val.length}  test ${splits.test.length}`);
  console.log(`  call rows ${rows.filter((r) => r.kind === 'call').length}  reply rows ${rows.filter((r) => r.kind === 'reply').length}`);

  if (!write) {
    console.log('(dry run — pass --write to emit)');
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const digestParts = [];
  for (const [split, list] of Object.entries(splits)) {
    const body = list.map((r) => JSON.stringify({ messages: r.messages })).join('\n') + (list.length ? '\n' : '');
    writeFileSync(join(outDir, `${split}.jsonl`), body);
    digestParts.push(`${split}:${hash(body)}`);
  }
  const card = {
    schema: 'apple-tool-trajectories-v1',
    seeds: curricula.length,
    rows: rows.length,
    splitSizes: { train: splits.train.length, val: splits.val.length, test: splits.test.length },
    families: assignment,
    source: 'first-party-authored',
    customerData: false,
    capturedFromStudio: false,
    verification:
      'every seed re-verified at build time against the live tool registry in apps/worker/src/tools.ts; ' +
      'propose_plan judged by the product\'s own readProposedPlan; every run_spec case compiled and executed ' +
      'with the real luau binary; every seed carries a mutation proven to turn the validator red',
    limitations: [
      'tool RESULTS are not recorded — they appear as an explicit marker, never as invented content',
      'teaches tool selection and argument construction, not recovery from a failed or surprising result',
      'typed property envelopes are structure-checked only; the plugin decoder is not run',
      'no Roblox engine, rendering, networking or persistence was executed',
      'not a model capability evaluation',
    ],
    productionTrainingReady: false,
    digest: hash(digestParts.join('|')),
  };
  writeFileSync(join(outDir, 'dataset-card.json'), JSON.stringify(card, null, 2) + '\n');
  console.log(`wrote ${outDir}  digest ${card.digest.slice(0, 16)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
