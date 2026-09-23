#!/usr/bin/env node
/**
 * Assemble the verified curricula into a directory mlx-lm can train from.
 *
 * WHAT WAS MISSING. `mlxdata/`, `mlxdata-llama/` and `mlxdata-text/` are what every training run
 * so far has consumed, and NOTHING IN THIS REPOSITORY WRITES THEM. `grep -rn mlxdata` over
 * `packages/training/src` finds no producer. So the data that trained apple-v1, v2 and v3 cannot
 * be regenerated from the repository, cannot be diffed, and cannot be audited except as a lump of
 * jsonl someone left on a disk. Those three directories also hold the 404 harvested rows the
 * repo's own auditor calls NOT_READY_FOR_PRODUCT_SFT — 85.6% of them referencing globals that
 * were never in scope.
 *
 * This is the producer. It emits from sources that are committed and verified:
 *
 *   - `ALL_GAME_LOGIC_CURRICULUM` — every example executed by the real `luau` binary and proven
 *     falsifiable by a single-site mutation that must fail, plus an overlap check against the
 *     evaluation tasks so the test set cannot leak into training.
 *   - `TOOL_TRAJECTORY_CURRICULUM` — every call validated against the LIVE tool registry, plans
 *     judged by the product's own `readProposedPlan`, spec bodies compiled and executed.
 *
 * Nothing harvested. Nothing whose provenance is a directory listing.
 *
 * FAMILY DISJOINTNESS IS CARRIED, NOT RE-DERIVED. Both builders already assign splits by family;
 * this merges their assignments rather than reshuffling, so a family held out for evaluation
 * stays held out. Re-splitting here would quietly undo the one property the evaluation depends
 * on.
 *
 * mlx-lm wants `valid.jsonl`, not `val.jsonl`. That rename is the only transformation applied.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_GAME_LOGIC_CURRICULUM, buildGameLogic } from './build-game-logic.mjs';
import { TOOL_TRAJECTORY_CURRICULUM } from './tool-trajectory-curriculum.mjs';
import { buildTrajectoryRows, splitRows } from './build-tool-trajectories.mjs';
import { assignSplits } from './build-dataset.mjs';
import { loadRegistry } from './tool-trajectory-verify.mjs';
import { loadEvalGuard } from './audit-dataset.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const hash = (v) => createHash('sha256').update(v).digest('hex');

/** mlx-lm's split names. `val` is this repo's word for the same thing. */
const MLX_SPLIT = { train: 'train', val: 'valid', test: 'test' };

async function loadExtraCurricula(names) {
  const out = [];
  for (const name of names) {
    try {
      const mod = await import(name);
      for (const value of Object.values(mod)) if (Array.isArray(value)) out.push(...value);
    } catch {
      // Absent is absent. A batch that has not landed yet is not a build failure.
    }
  }
  return out;
}

/**
 * Trajectory rows split with every family in `pinned` kept where it was, and the rest split among
 * themselves by the same greedy splitter — so adding a batch can never move an earlier held-out
 * family into training.
 */
export function pinTrajectorySplits(rows, pinned) {
  const splits = { train: [], val: [], test: [] };
  const counts = {};
  for (const row of rows) if (!pinned[row.family]) counts[row.family] = (counts[row.family] ?? 0) + 1;
  const { assignment } = assignSplits(counts);
  for (const row of rows) splits[pinned[row.family] ?? assignment[row.family]].push(row);
  return { splits };
}

export async function assemble({ guard = loadEvalGuard(), registry = null, extraLogic = [], previousCard, newFamilySplits, trajectoryFamilies } = {}) {
  const logic = buildGameLogic({ examples: [...ALL_GAME_LOGIC_CURRICULUM, ...extraLogic], guard, previousCard, newFamilySplits });

  const trajectorySeeds = [...TOOL_TRAJECTORY_CURRICULUM, ...(await loadExtraCurricula(['./tool-trajectory-curriculum-b.mjs', './tool-trajectory-curriculum-c.mjs']))];
  const { rows, refused } = await buildTrajectoryRows(trajectorySeeds, { registry: registry ?? (await loadRegistry()) });
  if (refused.length) {
    throw new Error(`${refused.length} trajectory seed(s) did not verify: ${refused.map((r) => r.id).join(', ')}`);
  }
  const { splits: trajectorySplits } = trajectoryFamilies ? pinTrajectorySplits(rows, trajectoryFamilies) : splitRows(rows);

  const merged = { train: [], val: [], test: [] };
  for (const split of ['train', 'val', 'test']) {
    // PROVENANCE TRAVELS WITH THE ROW. The first version of this emitted bare `{ messages }` and
    // threw `meta` away on the way through — so `audit-dataset` reported `provenance_shape` on all
    // 233 rows and it was right to. A row whose origin lives only in a card beside it is a row
    // that arrives somewhere else with no origin at all. mlx-lm reads `messages` and ignores the
    // rest, so carrying it costs nothing at training time.
    for (const row of logic.splits[split]) {
      merged[split].push({ messages: row.messages, track: 'game-logic', family: row.meta.family, meta: { ...row.meta, kind: 'game-logic' } });
    }
    for (const row of trajectorySplits[split]) {
      merged[split].push({
        messages: row.messages, track: 'tool-trajectory', family: row.family,
        meta: { id: `${row.seedId}#${row.step}`, family: row.family, kind: 'apple-tool-trajectory', rowKind: row.kind,
          origin: 'first-party-authored', rights: 'private-project-source-not-publicly-licensed', capturedFromStudio: false },
      });
    }
  }

  // A family landing on both sides would make the evaluation meaningless, and the two builders
  // assign splits independently. Checked here rather than assumed from the fact that each is
  // internally consistent.
  const familiesIn = (split) => new Set(merged[split].map((r) => r.family));
  const train = familiesIn('train');
  for (const split of ['val', 'test']) {
    for (const family of familiesIn(split)) {
      if (train.has(family)) throw new Error(`family "${family}" is in train and ${split}; the held-out set would be contaminated`);
    }
  }

  return { merged, logicCard: logic.card, trajectorySeeds: trajectorySeeds.length };
}

/**
 * v5 = v4 plus the executor-verified synthesized examples (data/game-logic-synth-v1). The v4 split
 * of every existing family is read back from mlxdata-apple-v4 and PINNED, so nothing v4 held out
 * moves into training; a synthesized family goes to valid when its name hashes into ~10%, else train,
 * and never to test, so the v4 test set stays the one both adapters are compared on.
 */
export function v5Inputs(root = ROOT) {
  const synth = JSON.parse(readFileSync(join(root, 'packages/training/data/game-logic-synth-v1/examples.json'), 'utf8'));
  const families = {};
  const trajectoryFamilies = {};
  for (const [split, file] of [['train', 'train'], ['val', 'valid'], ['test', 'test']]) {
    for (const line of readFileSync(join(root, `packages/training/mlxdata-apple-v4/${file}.jsonl`), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const { meta } = JSON.parse(line);
      if (meta?.kind === 'game-logic') families[meta.family] = split;
      if (meta?.kind === 'apple-tool-trajectory') trajectoryFamilies[meta.family] = split;
    }
  }
  const newFamilySplits = {};
  for (const family of new Set(synth.map((e) => e.family))) {
    newFamilySplits[family] = parseInt(hash(family).slice(0, 8), 16) % 10 === 0 ? 'val' : 'train';
  }
  return { extraLogic: synth, previousCard: { digest: 'mlxdata-apple-v4', families }, newFamilySplits, trajectoryFamilies };
}

async function main() {
  const write = process.argv.includes('--write');
  const v5 = process.argv.includes('--v5');
  const outDir = join(ROOT, `packages/training/mlxdata-apple-${v5 ? 'v5' : 'v4'}`);

  const { merged, logicCard, trajectorySeeds } = await assemble(v5 ? v5Inputs() : {});
  const counts = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v.length]));
  const byTrack = (track) => Object.values(merged).flat().filter((r) => r.track === track).length;

  console.log(`game-logic examples: ${ALL_GAME_LOGIC_CURRICULUM.length}  trajectory seeds: ${trajectorySeeds}`);
  console.log(`rows  train ${counts.train}  valid ${counts.val}  test ${counts.test}   (total ${counts.train + counts.val + counts.test})`);
  console.log(`  game-logic rows ${byTrack('game-logic')}   tool-trajectory rows ${byTrack('tool-trajectory')}`);
  console.log(`  families ${new Set(Object.values(merged).flat().map((r) => r.family)).size}`);

  if (!write) {
    console.log('(dry run — pass --write to emit)');
    return;
  }

  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const digests = {};
  for (const [split, list] of Object.entries(merged)) {
    const body = list.map((r) => JSON.stringify({ messages: r.messages, meta: r.meta })).join('\n') + (list.length ? '\n' : '');
    const name = `${MLX_SPLIT[split]}.jsonl`;
    writeFileSync(join(outDir, name), body);
    digests[name] = hash(body);
  }
  const card = {
    schema: `apple-mlx-dataset-${v5 ? 'v5' : 'v4'}`,
    builtFrom: ['ALL_GAME_LOGIC_CURRICULUM', 'TOOL_TRAJECTORY_CURRICULUM(+b,+c general visual craft)', ...(v5 ? ['game-logic-synth-v1 (teacher-drafted, luau-executed, mutation-checked)', 'v4 trajectory and game-logic splits pinned'] : [])],
    rows: counts.train + counts.val + counts.test,
    splitSizes: { train: counts.train, valid: counts.val, test: counts.test },
    trackRows: { 'game-logic': byTrack('game-logic'), 'tool-trajectory': byTrack('tool-trajectory') },
    families: new Set(Object.values(merged).flat().map((r) => r.family)).size,
    evaluationTasksChecked: logicCard.evaluationTasksChecked,
    source: 'first-party-authored',
    harvestedRows: 0,
    customerData: false,
    capturedFromStudio: false,
    limitations: [
      'tool results are not recorded; trajectory rows carry an explicit marker, never invented content',
      'teaches tool selection and argument construction, not recovery from a failed result',
      'no Roblox engine, rendering, networking or persistence was executed',
      'not a model capability evaluation; no model has been trained on this yet',
    ],
    productionTrainingReady: false,
    fileDigests: digests,
    digest: hash(Object.entries(digests).map(([k, v]) => `${k}:${v}`).join('|')),
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
