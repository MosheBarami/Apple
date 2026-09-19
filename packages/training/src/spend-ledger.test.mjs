import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSpendLedger, readSpendLedger, reserveSpend } from './spend-ledger.mjs';
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'apple-budget-test-'));
  try { return run(join(dir, 'budget.json')); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
test('historical allocation survives new runs; exact total allowed, excess refused', () => fixture((path) => {
  createSpendLedger(path, [{ id: 'prior-baseline', usd: 0.05 }]);
  assert.equal(readSpendLedger(path).availableUsd, 19.95);
  reserveSpend(path, { id: 'training', usd: 19.94 });
  reserveSpend(path, { id: 'serving', usd: 0.01 });
  assert.equal(readSpendLedger(path).availableUsd, 0);
  assert.throws(() => reserveSpend(path, { id: 'excess', usd: 0.000001 }), /budget exceeded/);
  assert.equal(readSpendLedger(path).allocatedUsd, 20);
  assert.throws(() => createSpendLedger(path), /EEXIST/);
}));
test('reusing a reservation cannot authorize a duplicate charged request', () => fixture((path) => {
  createSpendLedger(path);
  reserveSpend(path, { id: 'uncertain-request', usd: 0.05 });
  assert.throws(() => reserveSpend(path, { id: 'uncertain-request', usd: 0.05 }), /invalid budget allocation/);
  assert.equal(readSpendLedger(path).allocatedUsd, 0.05);
}));
test('missing, corrupt and contended ledgers fail closed', () => fixture((path) => {
  assert.throws(() => reserveSpend(path, { id: 'a', usd: 1 }), /ENOENT/);
  writeFileSync(path, '{}');
  assert.throws(() => reserveSpend(path, { id: 'a', usd: 1 }), /invalid budget ledger/);
  writeFileSync(`${path}.lock`, 'another process');
  assert.throws(() => reserveSpend(path, { id: 'a', usd: 1 }), /EEXIST/);
}));
test('zero, negative, nonfinite and sub-micro allocations are refused', () => fixture((path) => {
  createSpendLedger(path);
  for (const usd of [0, -1, NaN, Infinity, 0.0000001]) assert.throws(() => reserveSpend(path, { id: 'bad', usd }), /invalid USD/);
  assert.equal(readSpendLedger(path).allocatedUsd, 0);
}));
