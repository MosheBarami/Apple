import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { auditPilotDatasetLineage } from './worker2-pilot-evidence-audit.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const row = id => ({ meta: { id, family: id, origin: 'first-party-authored-synthetic' },
  messages: [{ role: 'system', content: 'Unit-test provenance fixture, NOT a trained model.' },
    { role: 'user', content: `Fixture ${id}` }, { role: 'assistant', content: '```luau\nreturn function() return nil end\n```' }] });

function saveData(path, splits, lineage) {
  const rows = Object.values(splits).flat();
  const card = { source: 'first-party-authored-synthetic', customerData: false, examples: rows.length,
    digest: sha(JSON.stringify(rows)), splitSizes: Object.fromEntries(Object.entries(splits).map(([s, r]) => [s, r.length])),
    families: Object.fromEntries(Object.entries(splits).flatMap(([s, r]) => r.map(e => [e.meta.family, s]))),
    ...(lineage ? { lineage } : {}) };
  for (const [s, r] of Object.entries(splits)) writeFileSync(join(path, `${s}.jsonl`), r.map(e => JSON.stringify(e)).join('\n') + '\n');
  write(join(path, 'dataset-card.json'), card);
  return card;
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'apple-worker2-lineage-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const prior = join(root, 'prior'), reviewed = join(root, 'reviewed'), run = join(root, 'run');
  for (const p of [prior, reviewed, run]) mkdirSync(p);
  const splits = { train: [row('train-example')], val: [row('val-example')], test: [row('test-example')] };
  const card = saveData(prior, splits);
  const next = structuredClone(splits); next.train.push(row('new-train-example'));
  const lineage = { previousDigest: card.digest, preservedFamilies: 3 };
  saveData(reviewed, next, lineage);
  const names = ['dataset-card.json', 'train.jsonl', 'val.jsonl', 'test.jsonl'];
  write(join(run, 'manifest.json'), { productionPromotion: false, config: { iters: 16, data: 'inherited-label-not-evidence' },
    dataDigest: card.digest, inputHashes: Object.fromEntries(names.map(n => [n, sha(readFileSync(join(prior, n)))])) });
  return { root, prior, reviewed, run, next, lineage, names };
}

test('effective cardinality comes from bound inputs, not an expanded untrained card or metadata label', t => {
  const f = fixture(t), before = f.names.map(n => sha(readFileSync(join(f.prior, n))));
  const first = auditPilotDatasetLineage(f.prior, f.reviewed, [f.run]);
  assert.equal(first.prior.examples, 3); assert.equal(first.reviewed.examples, 4);
  assert.equal(first.runs[0].hashBoundExamples, 3);
  assert.equal(first.runs[0].bindsReviewedDataset, false);
  assert.equal(first.runs[0].reportedConfigDataLabel, 'inherited-label-not-evidence');
  assert.equal(first.preservedFamilies, 3); assert.equal(first.priorRowsUnchanged, true);
  assert.deepEqual(first.addedFamilies, [{ family: 'new-train-example', split: 'train' }]);
  assert.deepEqual(auditPilotDatasetLineage(f.prior, f.reviewed, [f.run]), first);
  assert.deepEqual(f.names.map(n => sha(readFileSync(join(f.prior, n)))), before);
  for (const flag of ['trainingStarted', 'modelLoaded', 'productionPromotion', 'studioVerified']) assert.equal(first[flag], false);
  assert.equal(first.providerSpendUsd, 0);
});

test('every dataset file including validation and card is bound to the training manifest', t => {
  for (const name of ['dataset-card.json', 'train.jsonl', 'val.jsonl', 'test.jsonl']) {
    const f = fixture(t);
    writeFileSync(join(f.prior, name), readFileSync(join(f.prior, name), 'utf8') + ' ');
    assert.throws(() => auditPilotDatasetLineage(f.prior, f.reviewed, [f.run]), /input changed since training/);
  }
});

test('repartitioning a held-out family is rejected even when the new card agrees with its rows', t => {
  const f = fixture(t);
  f.next.train.push(f.next.test[0]); f.next.test = [row('different-test-family')];
  saveData(f.reviewed, f.next, f.lineage);
  assert.throws(() => auditPilotDatasetLineage(f.prior, f.reviewed, [f.run]), /prior family moved/);
});

test('changing an existing held-out answer is not preservation of a prior row', t => {
  const f = fixture(t);
  f.next.test[0].messages[2].content = '```luau\nreturn function() return 7 end\n```';
  saveData(f.reviewed, f.next, f.lineage);
  assert.throws(() => auditPilotDatasetLineage(f.prior, f.reviewed, [f.run]), /prior example changed/);
});

test('missing or invented lineage cannot claim preserved families', t => {
  const f = fixture(t), path = join(f.reviewed, 'dataset-card.json');
  const card = json(path); card.lineage.preservedFamilies = 99; write(path, card);
  assert.throws(() => auditPilotDatasetLineage(f.prior, f.reviewed), /lineage mismatch/);
});

test('private-data declarations fail before row files are opened; non-synthetic rows are refused', t => {
  const f = fixture(t), path = join(f.prior, 'dataset-card.json');
  const card = json(path); card.customerData = true; write(path, card);
  rmSync(join(f.prior, 'train.jsonl'));
  assert.throws(() => auditPilotDatasetLineage(f.prior, f.reviewed), /first-party synthetic card/);
  const g = fixture(t);
  g.next.train[0].meta.origin = 'customer-conversation';
  saveData(g.reviewed, g.next, g.lineage);
  assert.throws(() => auditPilotDatasetLineage(g.prior, g.reviewed), /synthetic row identity/);
});

test('empty splits, mismatched manifest digests and oversized run lists fail closed', t => {
  const f = fixture(t);
  writeFileSync(join(f.prior, 'val.jsonl'), '\n');
  assert.throws(() => auditPilotDatasetLineage(f.prior, f.reviewed), /empty or oversized/);
  const g = fixture(t), path = join(g.run, 'manifest.json'), manifest = json(path);
  manifest.dataDigest = sha('a different dataset'); write(path, manifest);
  assert.throws(() => auditPilotDatasetLineage(g.prior, g.reviewed, [g.run]), /does not bind prior dataset/);
  assert.throws(() => auditPilotDatasetLineage(g.prior, g.reviewed, Array(5).fill(g.run)), /at most four/);
});
