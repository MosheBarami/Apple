import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { scoreGameLogic } from './score-eval.mjs';
import { STORAGE_TRANSFER, holdoutRows, scoreTransfer } from './storage-transfer-holdout.mjs';

const fence = (source) => `\`\`\`luau\n${source}\n\`\`\``;
const changeOnce = (source, before, after) => {
  assert.equal(source.split(before).length - 1, 1);
  return source.replace(before, after);
};

test('fresh storage holdout references execute; each read-failure mutation is caught', () => {
  const mutations = [
    ['return nil, "retry"', 'return nil, "already"'],
    ['return nil, "retry"', 'return nil, "sold_out"'],
    ['return nil, "retry"', 'return {q1=1}, "save"'],
  ];
  assert.equal(STORAGE_TRANSFER.length, 3);
  STORAGE_TRANSFER.forEach((item, i) => {
    assert.deepEqual(scoreGameLogic(item, fence(item.answer)), { ok: true }, item.id);
    const mutant = changeOnce(item.answer, ...mutations[i]);
    assert.equal(scoreGameLogic(item, fence(mutant)).ok, false, `${item.id} must reject a failed-read write or wrong outcome`);
  });
});

test('holdout prompts share no eight-word run with training or pinned promotion questions', () => {
  const parseLines = (file) => readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  // Deliberate tripwire: a scored holdout must never silently change its questions or checks.
  assert.equal(createHash('sha256').update(readFileSync(new URL('../holdouts/storage-transfer-v1.jsonl', import.meta.url))).digest('hex'),
    '898a4eb9b2dd18033846558575a50f33059a123af637c4e32517b0a9af41c5cd');
  assert.deepEqual(parseLines(new URL('../holdouts/storage-transfer-v1.jsonl', import.meta.url)), holdoutRows());
  const training = parseLines(new URL('../data/storage-outcome-seeds-v1/shard-1.jsonl', import.meta.url));
  const promotion = parseLines(new URL('../runs/eval-set-v5.jsonl', import.meta.url));
  const grams = (s) => {
    const words = s.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
    return new Set(words.slice(0, Math.max(0, words.length - 7)).map((_, i) => words.slice(i, i + 8).join(' ')));
  };
  const known = new Set([...training, ...promotion].flatMap((r) => [...grams(r.messages.find((m) => m.role === 'user')?.content ?? '')]));
  for (const row of holdoutRows()) {
    assert.equal(row.meta.origin, 'first-party-authored-holdout');
    const overlap = [...grams(row.messages[1].content)].filter((g) => known.has(g));
    assert.deepEqual(overlap, [], `${row.meta.id} overlaps a training or promotion prompt`);
  }
});

test('transfer scorer requires exactly the frozen rows and both generated sides', () => {
  const rows = Object.fromEntries(STORAGE_TRANSFER.map((x) => [x.id, { base: 'no code', adapter: fence(x.answer) }]));
  const result = scoreTransfer({ adapter: 'candidate', rows });
  assert.deepEqual([result.base, result.candidate, result.n], [0, 3, 3]);
  assert.equal(result.kind, 'diagnostic-storage-transfer-not-promotion');
  assert.throws(() => scoreTransfer({ rows: { [STORAGE_TRANSFER[0].id]: rows[STORAGE_TRANSFER[0].id] } }), /row IDs changed/);
  const bad = structuredClone(rows);
  delete bad[STORAGE_TRANSFER[1].id].adapter;
  assert.throws(() => scoreTransfer({ rows: bad }), /missing paired answer/);
});
