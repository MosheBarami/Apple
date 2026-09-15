#!/usr/bin/env node
// THE OTHER HALF OF THE HELD-OUT PROOF: the RobloxQA gate versus the rows we actually TRAIN on.
//
// WHY THIS FILE EXISTS. `qa-overlap.mjs` proves the gate does not overlap `headroom` — the other
// half of the same Hugging Face dataset. That is the overlap the dataset's own card invites you to
// worry about, and it is not the one that would corrupt THIS product's numbers. The rows the local
// LoRA is fine-tuned on come from `packages/training/data/{train,val,test}.jsonl`, built out of
// licensed Luau by `packages/training/src/build-dataset.mjs`. If a gate question restated one of
// those instructions, the gate would be scoring what the adapter was taught, and the score would
// simply come out higher with nothing looking wrong.
//
// Until now that measurement had never been taken. The harvester wrote, in the dataset card:
//
//     "gateVsRepoTrainingRows": { "status": "NOT MEASURED — packages/training/data/train.jsonl is
//       absent (it is derived and gitignored) ... This is not a clean result." }
//
// which is the honest thing to write and is still an unmeasured claim. This takes the measurement.
//
// WHAT IT REPORTS, AND WHY IT IS NOT JUST A COUNT OF ZERO. "0 overlapping rows" is exactly what a
// detector that never fires reports. So the return value carries the MARGIN — the single highest
// similarity score any gate question reached against any training instruction, and its distance
// below the threshold. 0 flagged / max 0.1985 / margin 0.4015 is evidence that 3,000 x 404 pairs
// were actually scored. 0 flagged and nothing else is a sentence.
//
// WHAT THE MARGIN DOES **NOT** PROVE, MEASURED RATHER THAN ASSUMED. The first draft of this file
// claimed the margin also catches a detector pointed at the wrong field. Falsifying it disproved
// that: with `instructionOf` rewired to return the ASSISTANT turn — Luau source, not the
// instruction — the run still reported 0 flagged and a maxScore of **0.2173**, higher than the
// correct 0.1985, because engine identifiers are rare tokens on both sides. A lower bound on the
// margin cannot separate "compared the right text" from "compared the wrong text". So the field is
// pinned three other ways instead: `instructionOf` REFUSES prose that looks like code (below), §1
// asserts the extractor returns the user turn, and §5 recomputes the committed evidence file and
// requires the recorded maxScore to match. The falsification run reddened §1 and the evidence
// recompute; the margin assertion stayed green, which is why it is no longer advertised as doing
// that job.
//
// THE SUFFIX GUARD, WHICH IS THE SUBTLE ONE. `build-dataset.mjs` renders every training example's
// user turn as `${doc}\n\nWrite the Luau implementation.` — a fixed instruction tail shared by all
// 404 rows. It has to be stripped before comparison, because idf weights derived from a corpus
// where every row ends in the same eight words are weights over boilerplate. A `.replace()` that
// silently no-ops if that literal ever changes would leave the tail on every row and quietly
// reweight the whole measurement, so `instructionOf` THROWS instead of stripping nothing. The test
// pins the literal against build-dataset.mjs's own source so the two cannot drift.
//
// NO NETWORK, NO PROVIDER. Two files on disk and some arithmetic. Safe to run in CI, unlike
// `robloxqa-gate.mjs` which scores against a paid model and refuses to run without being told.
//
// Run:  node packages/evals/src/train-gate-overlap.mjs [--training-dir DIR] [--write]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findOverlap, findShingleOverlap, findNearDuplicates, questionKey, NEAR_DUP_THRESHOLD,
} from './qa-overlap.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');

/** Where the harvested gate lives. */
export const GATE_DIR = join(HERE, '..', 'data', 'robloxqa');
/** Where `build-dataset.mjs` writes its splits by default. */
export const TRAINING_DIR = join(REPO_ROOT, 'packages', 'training', 'data');

/**
 * The instruction tail `build-dataset.mjs` appends to every user turn.
 *
 * Duplicated here rather than imported because importing build-dataset.mjs pulls in luau-lsp
 * spawning and the whole corpus reader for one string. The duplication is made safe by the test
 * that greps the literal out of build-dataset.mjs's source and requires it to match.
 */
export const INSTRUCTION_SUFFIX = '\n\nWrite the Luau implementation.';

/**
 * EVERY split, not just `train`.
 *
 * `test.jsonl` is the SFT set's own held-out split. It is still material the model has been
 * exposed to at build time and still material a future run may fine-tune on, and it is not the
 * knowledge gate. Relative to RobloxQA, all three are the training side.
 */
export const TRAINING_SPLITS = ['train', 'val', 'test'];

/**
 * Pull the instruction out of one chat-shaped training row, with the shared tail removed.
 *
 * Throws rather than returning the row unchanged when the tail is missing — see the header.
 */
export function instructionOf(row, where = '<row>') {
  const user = row?.messages?.find((m) => m.role === 'user')?.content;
  if (typeof user !== 'string' || !user.trim()) {
    throw new Error(`${where}: no user message to compare. A training row with no instruction cannot be checked for overlap.`);
  }
  if (!user.endsWith(INSTRUCTION_SUFFIX)) {
    throw new Error(
      `${where}: the user turn does not end with ${JSON.stringify(INSTRUCTION_SUFFIX)}. ` +
      'build-dataset.mjs renders every example with that tail; if it has changed, this comparison ' +
      'would be run over instructions that all share eight words, which reweights every score. ' +
      'Update INSTRUCTION_SUFFIX in train-gate-overlap.mjs to match.',
    );
  }
  const instruction = user.slice(0, -INSTRUCTION_SUFFIX.length).trim();

  // THE FIELD CHECK THE MARGIN COULD NOT DO. `cleanComment()` in build-dataset.mjs collapses every
  // run of whitespace to one space, so a real instruction is a single line of prose and can contain
  // neither a newline nor a fence. The assistant turn — the field most likely to be read by mistake
  // — is `\`\`\`luau\n...\n\`\`\`` and fails both. Measured over the real 404 rows: 0 with a
  // newline, 0 with a fence. Cheap, decisive, and it reddens on exactly the rewiring that the
  // margin assertion sailed through.
  if (/\n/.test(instruction) || instruction.includes('```')) {
    throw new Error(
      `${where}: the extracted instruction contains a newline or a code fence, so it is not a doc ` +
      'comment — it is almost certainly the assistant turn. Comparing the gate against Luau source ' +
      `still yields a plausible-looking score, so this is checked rather than inferred. Got: ${JSON.stringify(instruction.slice(0, 60))}`,
    );
  }
  return instruction;
}

/**
 * Read the SFT instructions from a directory of `{train,val,test}.jsonl`.
 *
 * A MISSING SPLIT IS AN ERROR, NOT AN EMPTY SPLIT. The derived files are gitignored, so on a fresh
 * checkout this throws — which is the point. Reading two of three splits and reporting the gate
 * clean against them is a smaller measurement wearing the same words as the full one.
 */
export function loadTrainingInstructions(dir = TRAINING_DIR, { splits = TRAINING_SPLITS } = {}) {
  const missing = splits.filter((s) => !existsSync(join(dir, `${s}.jsonl`)));
  if (missing.length) {
    throw new Error(
      `loadTrainingInstructions: ${missing.map((s) => `${s}.jsonl`).join(', ')} absent from ${dir}. ` +
      'These are derived and gitignored — run `node packages/training/src/build-dataset.mjs` ' +
      '(which needs the pinned checkouts under packages/corpus/raw). A missing split is not an empty split.',
    );
  }
  const bySplit = {};
  const instructions = [];
  for (const s of splits) {
    const p = join(dir, `${s}.jsonl`);
    const rows = readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l, i) => {
      try { return JSON.parse(l); } catch (e) { throw new Error(`${p}:${i + 1}: unparseable JSON — ${e.message}`); }
    });
    const got = rows.map((r, i) => instructionOf(r, `${relative(REPO_ROOT, p)}:${i + 1}`));
    bySplit[s] = got.length;
    instructions.push(...got);
  }
  return { instructions, bySplit, dir };
}

/** Read the harvested gate questions. Throws when absent, for the same reason as above. */
export function loadGateQuestions(dir = GATE_DIR) {
  const p = join(dir, 'gate.jsonl');
  if (!existsSync(p)) {
    throw new Error(`loadGateQuestions: ${p} is absent. Run \`node scripts/harvest-hf.mjs\` first. A missing gate is not an empty gate.`);
  }
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).question);
}

/**
 * Measure the gate against the training instructions with all three detectors.
 *
 * All three, because they fail in different directions and this comparison is between two very
 * different kinds of text — templated MCQ prose on one side, hand-written doc comments on the
 * other. `findShingleOverlap` is the right instrument for the doc-comment side (that is where
 * build-dataset.mjs uses it) and the wrong one for the templated side; `findNearDuplicates` is the
 * reverse. Running both and reporting both costs milliseconds and removes the argument.
 *
 * Each detector refuses an empty side, so a comparison that could not happen throws here rather
 * than returning zeros.
 */
export function measureGateVsTraining(gateQuestions, trainingInstructions, { threshold = NEAR_DUP_THRESHOLD } = {}) {
  const exact = findOverlap(gateQuestions.map(questionKey), trainingInstructions.map(questionKey));
  const shingle = findShingleOverlap(gateQuestions, trainingInstructions);

  // threshold 0 so every gate row reports its BEST score and the margin is observable. Flagging is
  // then applied here, at the real threshold.
  const near = findNearDuplicates(gateQuestions, trainingInstructions, { threshold: 0 });
  const flagged = near.flagged.filter((f) => f.score >= threshold);
  const maxScore = near.flagged.length ? near.flagged[0].score : 0;

  return {
    gateRows: gateQuestions.length,
    trainingRows: trainingInstructions.length,
    exactShared: exact.shared.length,
    shingle: { n: shingle.n, flaggedRows: shingle.total, flaggedBeforeStemFilter: shingle.rawTotal, stemsIgnored: shingle.stemsIgnored },
    nearDuplicate: {
      method: 'idf-weighted Jaccard over the whole text, both sides supplying the weights',
      threshold,
      flaggedRows: flagged.length,
      countsByThreshold: near.counts,
      // THE EVIDENCE THAT THE DETECTOR RAN. See the header: a zero without a margin is a sentence.
      maxScore,
      margin: Number((threshold - maxScore).toFixed(4)),
      closest: near.flagged.slice(0, 5).map((h) => ({
        score: h.score, gateQuestion: gateQuestions[h.aIndex], trainingInstruction: trainingInstructions[h.bIndex],
      })),
    },
    clean: exact.shared.length === 0 && shingle.total === 0 && flagged.length === 0,
  };
}

// ---------------------------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  const trainingDir = argOf('--training-dir', TRAINING_DIR);

  const gate = loadGateQuestions();
  const { instructions, bySplit, dir } = loadTrainingInstructions(trainingDir);
  const m = measureGateVsTraining(gate, instructions);

  console.log(`gate: ${m.gateRows} questions from ${relative(REPO_ROOT, GATE_DIR)}`);
  console.log(`training: ${m.trainingRows} instructions from ${relative(REPO_ROOT, dir)} (${Object.entries(bySplit).map(([k, v]) => `${k}=${v}`).join(' ')})`);
  console.log(`exact shared:            ${m.exactShared}`);
  console.log(`8-word window flagged:   ${m.shingle.flaggedRows} (raw ${m.shingle.flaggedBeforeStemFilter})`);
  console.log(`near-duplicate flagged:  ${m.nearDuplicate.flaggedRows} at threshold ${m.nearDuplicate.threshold}`);
  console.log(`highest score reached:   ${m.nearDuplicate.maxScore}  (margin ${m.nearDuplicate.margin} below the threshold)`);
  console.log(`verdict: ${m.clean ? 'HELD OUT' : 'NOT HELD OUT'}`);
  console.log('\nclosest pairs:');
  for (const c of m.nearDuplicate.closest) {
    console.log(`  ${c.score}  G: ${c.gateQuestion.slice(0, 74)}`);
    console.log(`         T: ${c.trainingInstruction.slice(0, 74)}`);
  }

  if (args.includes('--write')) {
    const card = existsSync(join(GATE_DIR, 'dataset-card.json'))
      ? JSON.parse(readFileSync(join(GATE_DIR, 'dataset-card.json'), 'utf8')) : {};
    const out = join(GATE_DIR, 'train-overlap.json');
    writeFileSync(out, JSON.stringify({
      measuredAt: new Date().toISOString(),
      measuredBy: 'packages/evals/src/train-gate-overlap.mjs',
      gateDataset: card.dataset ?? null,
      gateRevision: card.revision ?? null,
      trainingBuilder: 'packages/training/src/build-dataset.mjs',
      trainingSplits: bySplit,
      instructionSuffixStripped: INSTRUCTION_SUFFIX,
      ...m,
    }, null, 2) + '\n');
    console.log(`\nevidence -> ${relative(REPO_ROOT, out)}`);
  }
  if (!m.clean) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
