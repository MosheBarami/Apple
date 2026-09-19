#!/usr/bin/env node
/** Executed first-party SFT seeds. No customer data, cloud calls, training or promotion. */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GAME_LOGIC_CURRICULUM } from './game-logic-curriculum.mjs';
import { GAME_LOGIC_CURRICULUM_EXTENSION } from './game-logic-curriculum-extension.mjs';
import { UI_LOGIC_CURRICULUM } from './ui-logic-curriculum.mjs';
import { CONTRACT_GENERALIZATION_CURRICULUM } from './contract-generalization-curriculum.mjs';
import { GAME_LOGIC_CURRICULUM_E } from './game-logic-curriculum-e.mjs';
import { loadEvalGuard, detectContextDependencies } from './audit-dataset.mjs';
import { assignSplits, shingles } from './build-dataset.mjs';
import { checkNoAntipattern } from '../../evals/src/roblox-antipatterns.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const SYSTEM = 'You are Apple, a Roblox engineering assistant. Implement the requested standalone Luau module. Do not claim engine execution, persistence or deployment.';
export const ALL_GAME_LOGIC_CURRICULUM = [
  ...GAME_LOGIC_CURRICULUM,
  ...GAME_LOGIC_CURRICULUM_EXTENSION,
  ...UI_LOGIC_CURRICULUM,
  ...CONTRACT_GENERALIZATION_CURRICULUM,
  ...GAME_LOGIC_CURRICULUM_E,
];

export function preserveFamilySplits(counts, previousCard, newFamilySplits = {}) {
  const { assignment } = assignSplits(counts);
  const prior = previousCard?.families ?? {};
  if (previousCard && (!previousCard.digest || !previousCard.families
    || typeof previousCard.families !== 'object' || Array.isArray(previousCard.families)
    || !Object.keys(prior).length)) throw new Error('invalid previous dataset card');
  for (const [family, split] of Object.entries(prior)) {
    if (!Object.hasOwn(counts, family)) throw new Error(`previous family disappeared: ${family}`);
    if (!['train', 'val', 'test'].includes(split)) throw new Error(`invalid previous split: ${family}`);
    assignment[family] = split;
  }
  for (const [family, split] of Object.entries(newFamilySplits)) {
    if (Object.hasOwn(prior, family)) throw new Error(`cannot reassign previous family: ${family}`);
    if (!Object.hasOwn(counts, family) || !['train', 'val', 'test'].includes(split)) {
      throw new Error(`invalid new family split: ${family}`);
    }
    assignment[family] = split;
  }
  return assignment;
}

export function verifyExample(example, { binary = 'luau' } = {}) {
  const context = detectContextDependencies(example.source);
  if (!context.parseOk || !context.standalone) throw new Error(`${example.id}: source depends on missing context or does not parse`);
  if (!checkNoAntipattern(example.source).passed) throw new Error(`${example.id}: anti-pattern gate failed`);
  const [before, after] = example.mutation;
  if (before === after || example.source.split(before).length !== 2) throw new Error(`${example.id}: mutation must change one unique site`);
  const dir = mkdtempSync(join(tmpdir(), 'apple-curriculum-'));
  try {
    const run = (source, filename) => {
      const path = join(dir, filename);
      writeFileSync(path, `local candidate = (function()\n${source}\nend)()\n${example.checks}\nprint("APPLE-CURRICULUM-PASS")\n`);
      return spawnSync(binary, [path], { encoding: 'utf8', timeout: 3000, maxBuffer: 256 * 1024 });
    };
    const good = run(example.source, 'good.luau');
    if (good.error || good.status !== 0 || good.stdout.trim() !== 'APPLE-CURRICULUM-PASS') {
      throw new Error(`${example.id}: executable checks failed: ${good.error?.message ?? good.stderr.slice(0, 500)}`);
    }
    const bad = run(example.source.replace(before, after), 'mutant.luau');
    // A timeout/missing runner/parser error cannot prove the behavioral assertion fired.
    if (bad.error || bad.status === null || bad.status === 0 || !/assertion failed/i.test(bad.stderr)) {
      throw new Error(`${example.id}: behavioral mutation was not detected by an assertion`);
    }
    return {
      executor: 'local-luau-cli', scope: 'engine-independent-game-logic',
      sourceSha256: hash(example.source), checksSha256: hash(example.checks),
      behaviorPassed: true, mutationRejected: true, studioVerified: false,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function buildGameLogic({ examples = ALL_GAME_LOGIC_CURRICULUM, guard = loadEvalGuard(), verify = verifyExample,
  previousCard, newFamilySplits = {} } = {}) {
  if (!guard.taskCount || !guard.shingles?.size || guard.parseErrors.length) throw new Error('evaluation guard is missing or unreadable');
  if (examples.length < 3) throw new Error('at least three independent families are required');
  const ids = new Set();
  const sourceHashes = new Set();
  const prepared = [];
  for (const example of examples) {
    if (!/^[a-z][a-z0-9-]+$/.test(example.id) || !/^[a-z][a-z0-9-]+$/.test(example.family)) throw new Error('invalid example identity');
    if (ids.has(example.id) || sourceHashes.has(hash(example.source))) throw new Error('duplicate example identity or answer');
    ids.add(example.id); sourceHashes.add(hash(example.source));
    for (const text of [example.prompt, example.source]) {
      if ([...shingles(normalize(text), 8)].some((s) => guard.shingles.has(s))) throw new Error(`${example.id}: evaluation text overlap`);
    }
    const evidence = verify(example);
    if (evidence.sourceSha256 !== hash(example.source) || evidence.checksSha256 !== hash(example.checks) || evidence.behaviorPassed !== true || evidence.mutationRejected !== true || evidence.studioVerified !== false) {
      throw new Error(`${example.id}: missing or mismatched execution evidence`);
    }
    prepared.push({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: example.prompt },
        { role: 'assistant', content: '```luau\n' + example.source + '\n```' },
      ],
      meta: { id: example.id, family: example.family, origin: 'first-party-authored-synthetic', rights: 'private-project-source-not-publicly-licensed', evidence },
    });
  }
  const counts = {};
  for (const row of prepared) counts[row.meta.family] = (counts[row.meta.family] ?? 0) + 1;
  const assignment = preserveFamilySplits(counts, previousCard, newFamilySplits);
  const splits = { train: [], val: [], test: [] };
  for (const row of prepared) splits[assignment[row.meta.family]].push(row);
  if (Object.values(splits).some((rows) => !rows.length)) throw new Error('every split needs a distinct semantic family');
  return {
    splits,
    card: {
      schema: 'apple-game-logic-seeds-v1', examples: prepared.length,
      splitSizes: Object.fromEntries(Object.entries(splits).map(([key, rows]) => [key, rows.length])),
      families: assignment, evaluationTasksChecked: guard.taskCount,
      lineage: { previousDigest: previousCard?.digest ?? null, preservedFamilies: Object.keys(previousCard?.families ?? {}).length },
      source: 'first-party-authored-synthetic', customerData: false, studioTrajectories: 0,
      verification: 'actual local Luau execution plus assertion-failing mutation for every answer',
      limitations: ['small seed curriculum, not a production-scale training set', 'no Roblox engine, visual or networking execution', 'not a model capability evaluation', 'family-disjoint holdout is a development set, not an independent promotion benchmark'],
      productionTrainingReady: false, trainedModel: false,
      digest: hash(JSON.stringify(prepared)),
    },
  };
}

export function writeGameLogic(output, dataset) {
  // A supplied output must not already exist; never overwrite historical training evidence.
  const directory = output ? resolve(output) : mkdtempSync(join(tmpdir(), 'apple-game-logic-seeds-'));
  if (output) mkdirSync(directory, { recursive: false });
  for (const [split, rows] of Object.entries(dataset.splits)) {
    writeFileSync(join(directory, `${split}.jsonl`), rows.map((row) => JSON.stringify(row)).join('\n') + '\n', { flag: 'wx' });
  }
  writeFileSync(join(directory, 'dataset-card.json'), JSON.stringify(dataset.card, null, 2) + '\n', { flag: 'wx' });
  return directory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let output, previousCard, freshSplit = false;
  const newFamilySplits = {};
  for (let i = 0; i < args.length;) {
    const flag = args[i++];
    if (flag === '--fresh-split') {
      if (freshSplit) throw new Error('duplicate fresh split option');
      freshSplit = true;
      continue;
    }
    const value = args[i++];
    if (!value || !['--out', '--previous-card', '--new-family-split'].includes(flag)) {
      throw new Error('usage: build-game-logic.mjs [--out NEW_DIRECTORY] (--previous-card CARD_JSON | --fresh-split) [--new-family-split FAMILY=train|val|test]');
    }
    if (flag === '--out') { if (output) throw new Error('duplicate output'); output = value; }
    if (flag === '--previous-card') {
      if (previousCard) throw new Error('duplicate previous card');
      previousCard = JSON.parse(readFileSync(value, 'utf8'));
    }
    if (flag === '--new-family-split') {
      const [family, split, extra] = value.split('=');
      if (!family || !split || extra || Object.hasOwn(newFamilySplits, family)) throw new Error('invalid new split option');
      newFamilySplits[family] = split;
    }
  }
  if (Boolean(previousCard) === freshSplit) throw new Error('Choose exactly one: --previous-card to preserve holdouts, or --fresh-split for a new independent dataset');
  execFileSync('luau', ['--help'], { stdio: 'pipe', timeout: 3000 });
  const dataset = buildGameLogic({ previousCard, newFamilySplits });
  const directory = writeGameLogic(output, dataset);
  console.log(JSON.stringify({ directory, ...dataset.card }, null, 2));
}
