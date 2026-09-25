import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { UI_LOGIC_CURRICULUM_F } from './ui-logic-curriculum-f.mjs';
import { prepareUiLogicShard } from './build-ui-logic-shard.mjs';
import { readVerifiedShard } from './train-forever.mjs';
import { checkCandidate } from './evaluate-game-logic.mjs';

const queue = JSON.parse(readFileSync(new URL('../forever-hypotheses.json', import.meta.url)));
const lever = queue.hypotheses.find((h) => h.id === 'ui-logic-verified-shard');
const op = lever?.data?.[0];

test('the pinned UI logic shard matches its source and executes outside held-out families', async () => {
  assert.ok(UI_LOGIC_CURRICULUM_F.length >= 9, 'the verified curriculum unexpectedly shrank');
  assert.equal(op?.op, 'appendVerified');
  assert.match(op?.source ?? '', /^data\/ui-logic-seeds-v1\/shard-1\.jsonl$/);
  const prepared = await prepareUiLogicShard();
  const content = prepared.map((row) => JSON.stringify(row)).join('\n') + '\n';
  const saved = readFileSync(new URL(`../${op.source}`, import.meta.url), 'utf8');
  assert.equal(saved, content, 'the pinned bytes no longer match the executable source');
  assert.equal(createHash('sha256').update(saved).digest('hex'), op.sha256);
  const trainRows = await readVerifiedShard(op.source, op.sha256);
  assert.equal(trainRows.length, prepared.length);
  assert.equal(new Set(trainRows.map((r) => r.meta.family)).size, trainRows.length);
});

test('a behavioral mutation is rejected by the local Luau checks', async () => {
  const example = UI_LOGIC_CURRICULUM_F.find((r) => r.id === 'shop-button-affordance');
  assert.ok(example);
  assert.equal(example.source.split(example.mutation[0]).length, 2);
  const broken = example.source.replace(...example.mutation);
  const result = await checkCandidate({ checks: example.checks }, `\`\`\`luau\n${broken}\n\`\`\``);
  assert.equal(result.passed, false, 'a price equal to the balance must still allow the purchase');
});
