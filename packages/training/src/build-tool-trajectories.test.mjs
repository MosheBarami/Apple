import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_TRAJECTORY_CURRICULUM } from './tool-trajectory-curriculum.mjs';
import { buildTrajectoryRows, expandSeed, splitRows, TRAJECTORY_SYSTEM, NO_RESULT } from './build-tool-trajectories.mjs';
import { loadRegistry } from './tool-trajectory-verify.mjs';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../data/tool-trajectories-v1');
const registry = await loadRegistry();

test('a trajectory of N calls becomes N decision rows plus one reply row', () => {
  const seed = TOOL_TRAJECTORY_CURRICULUM[0];
  const rows = expandSeed(seed);
  assert.equal(rows.length, seed.trajectory.length + 1);
  assert.equal(rows.filter((r) => r.kind === 'reply').length, 1);
  assert.equal(rows.at(-1).messages.at(-1).content, seed.reply);
});

test('row i is labelled with call i and shows only the calls before it', () => {
  const seed = TOOL_TRAJECTORY_CURRICULUM.find((s) => s.trajectory.length >= 3);
  const rows = expandSeed(seed);
  for (let i = 0; i < seed.trajectory.length; i++) {
    const label = rows[i].messages.at(-1);
    assert.equal(label.role, 'assistant');
    assert.equal(label.tool_calls[0].function.name, seed.trajectory[i].tool);
    const shown = rows[i].messages.filter((m) => m.tool_calls).length;
    assert.equal(shown, i + 1, `row ${i} should show ${i + 1} calls including its own label`);
  }
});

test('no row contains an invented tool result', () => {
  // The whole point. A plausible-looking result sitting in a transcript is an observation
  // nobody made, and this dataset would carry it into every model trained on it.
  for (const seed of TOOL_TRAJECTORY_CURRICULUM) {
    for (const row of expandSeed(seed)) {
      for (const message of row.messages) {
        if (message.role === 'tool') {
          assert.equal(message.content, NO_RESULT, `${seed.id}: a tool message carried content that was never observed`);
        }
      }
    }
  }
});

test('tool call arguments are a JSON string, as every chat template expects', () => {
  for (const row of expandSeed(TOOL_TRAJECTORY_CURRICULUM[1])) {
    for (const message of row.messages) {
      for (const call of message.tool_calls ?? []) {
        assert.equal(typeof call.function.arguments, 'string');
        assert.doesNotThrow(() => JSON.parse(call.function.arguments));
      }
    }
  }
});

test('a seed that does not verify is refused rather than written', async () => {
  const bad = {
    id: 'bad-seed', family: 'bogus', prompt: 'please build me something nice', reply: 'I built it and checked it.',
    trajectory: [{ tool: 'this_tool_does_not_exist', args: {} }],
  };
  const { rows, refused } = await buildTrajectoryRows([bad], { registry });
  assert.equal(rows.length, 0);
  assert.equal(refused.length, 1);
  assert.match(refused[0].problems.join(' '), /not in the live registry/);
});

test('two curricula sharing a seed id is a build error, not a silent duplicate', async () => {
  const seed = TOOL_TRAJECTORY_CURRICULUM[0];
  await assert.rejects(() => buildTrajectoryRows([seed, seed], { registry }), /duplicate seed id/);
});

test('splits are family-disjoint, so a family never appears on both sides', () => {
  const rows = TOOL_TRAJECTORY_CURRICULUM.flatMap(expandSeed);
  const { splits } = splitRows(rows);
  const families = (list) => new Set(list.map((r) => r.family));
  const train = families(splits.train);
  for (const family of families(splits.test)) assert.ok(!train.has(family), `family ${family} is in train and test`);
  for (const family of families(splits.val)) assert.ok(!train.has(family), `family ${family} is in train and val`);
});

test('every row carries the system prompt that describes the job', () => {
  for (const row of expandSeed(TOOL_TRAJECTORY_CURRICULUM[2])) {
    assert.equal(row.messages[0].role, 'system');
    assert.equal(row.messages[0].content, TRAJECTORY_SYSTEM);
  }
});

test('the emitted dataset on disk matches what the builder produces', { skip: !existsSync(join(DATA, 'dataset-card.json')) }, () => {
  const card = JSON.parse(readFileSync(join(DATA, 'dataset-card.json'), 'utf8'));
  assert.equal(card.capturedFromStudio, false, 'this data was authored; a card claiming capture would be a lie in the artifact');
  assert.equal(card.customerData, false);
  assert.equal(card.productionTrainingReady, false, 'nothing has trained on it or evaluated it yet');
  assert.ok(card.limitations.some((l) => /results are not recorded/i.test(l)), 'the missing-results limitation must be stated on the card');

  const total = ['train', 'val', 'test'].reduce((n, split) => {
    const body = readFileSync(join(DATA, `${split}.jsonl`), 'utf8').trim();
    const lines = body ? body.split('\n') : [];
    assert.equal(lines.length, card.splitSizes[split], `${split}.jsonl line count disagrees with the card`);
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line), `${split}.jsonl has a line that is not JSON`);
    return n + lines.length;
  }, 0);
  assert.equal(total, card.rows);
});
