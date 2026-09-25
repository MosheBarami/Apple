#!/usr/bin/env node
/** Write an immutable, executor-verified training shard. Never inspect held-out answers manually. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyExample } from './build-game-logic.mjs';
import { checkCandidate } from './evaluate-game-logic.mjs';
import { UI_LOGIC_CURRICULUM_F } from './ui-logic-curriculum-f.mjs';

const TRAINING = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SYSTEM = 'You are Apple, a Roblox engineering assistant. Implement the requested standalone Luau module. Do not claim engine execution, persistence or deployment.';
const digest = (text) => createHash('sha256').update(text).digest('hex');
const shingles = (text) => {
  const words = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
  return words.length < 8 ? [] : words.slice(0, -7).map((_, i) => words.slice(i, i + 8).join(' '));
};

export async function prepareUiLogicShard(examples = UI_LOGIC_CURRICULUM_F) {
  const heldout = readFileSync(join(TRAINING, 'runs/eval-set-v5.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const heldoutFamilies = new Set(heldout.map((r) => r.meta?.family).filter(Boolean));
  const heldoutPhrases = new Set(heldout.flatMap((r) => (r.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant').flatMap((m) => shingles(m.content))));
  // Both sources are committed. A local runs/forever/data-v22 is generated and absent in CI.
  const existingIds = new Set([
    'mlxdata-apple-v5/train.jsonl',
    'data/game-logic-seeds-v4/shard-3.jsonl',
  ].flatMap((source) => readFileSync(join(TRAINING, source), 'utf8')
    .split('\n').filter(Boolean).map((line) => JSON.parse(line).meta?.id)));
  const ids = new Set();
  const rows = [];
  for (const example of examples) {
    if (!example.id || ids.has(example.id) || existingIds.has(example.id) || heldoutFamilies.has(example.family)) {
      throw new Error(`duplicate or held-out family in UI shard: ${example.id}`);
    }
    const answer = `\`\`\`luau\n${example.source}\n\`\`\``;
    if ([example.prompt, answer].some((text) => shingles(text).some((phrase) => heldoutPhrases.has(phrase)))) {
      throw new Error(`UI shard overlaps held-out text: ${example.id}`);
    }
    const evidence = verifyExample(example);
    const executed = await checkCandidate({ checks: example.checks }, answer);
    if (!executed.passed) throw new Error(`UI shard did not pass local executor: ${example.id}`);
    ids.add(example.id);
    rows.push({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: example.prompt },
        { role: 'assistant', content: answer },
      ],
      meta: {
        id: example.id, family: example.family, origin: 'first-party-authored-synthetic',
        rights: 'private-project-source-not-publicly-licensed', evidence, checks: example.checks,
      },
    });
  }
  if (!rows.length) throw new Error('UI shard is empty');
  return rows;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = await prepareUiLogicShard();
  const directory = join(TRAINING, 'data/ui-logic-seeds-v1');
  mkdirSync(directory, { recursive: false });
  const filename = join(directory, 'shard-1.jsonl');
  const bytes = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(filename, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ file: filename, rows: rows.length, bytes: Buffer.byteLength(bytes), sha256: digest(bytes) }));
}
