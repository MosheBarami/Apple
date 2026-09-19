/** Local workflow budget, not a provider billing cap. No automatic refunds or retries. */
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export const APPROVED_TOTAL_USD = 20;
const SCALE = 1_000_000;
function micros(usd) {
  const value = Math.round(usd * SCALE);
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isSafeInteger(value) || value < 1 || Math.abs(value / SCALE - usd) > 1e-10) throw new Error('invalid USD allocation');
  return value;
}
function validate(ledger) {
  if (ledger?.schema !== 'apple-spend-ledger-v1' || ledger.capMicros !== micros(APPROVED_TOTAL_USD) || !Array.isArray(ledger.allocations)) throw new Error('invalid budget ledger');
  const ids = new Set();
  let total = 0;
  for (const row of ledger.allocations) {
    if (typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id) || !Number.isSafeInteger(row.reservedMicros) || row.reservedMicros <= 0) throw new Error('invalid budget allocation');
    ids.add(row.id);
    total += row.reservedMicros;
    if (!Number.isSafeInteger(total) || total > ledger.capMicros) throw new Error('total budget exceeded');
  }
  return { capUsd: ledger.capMicros / SCALE, allocatedUsd: total / SCALE, availableUsd: (ledger.capMicros - total) / SCALE };
}
function durableWrite(path, data) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(data, null, 2) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
}
export function createSpendLedger(path, allocations = []) {
  const ledger = { schema: 'apple-spend-ledger-v1', capMicros: micros(APPROVED_TOTAL_USD), allocations: allocations.map(({ id, usd }) => ({ id, reservedMicros: micros(usd) })) };
  validate(ledger);
  durableWrite(path, ledger); // Existing evidence is never overwritten.
  return readSpendLedger(path);
}
export function readSpendLedger(path) {
  const ledger = JSON.parse(readFileSync(path, 'utf8'));
  return { ...validate(ledger), allocations: ledger.allocations };
}
export function reserveSpend(path, { id, usd }) {
  const reservedMicros = micros(usd);
  const lock = `${path}.lock`;
  // Fail closed on contention or a crash-left lock; never reclaim automatically.
  const fd = openSync(lock, 'wx', 0o600);
  const temporary = `${path}.${randomUUID()}.pending`;
  try {
    const ledger = JSON.parse(readFileSync(path, 'utf8'));
    validate(ledger);
    ledger.allocations.push({ id, reservedMicros });
    const summary = validate(ledger);
    durableWrite(temporary, ledger);
    renameSync(temporary, path);
    return summary;
  } finally {
    closeSync(fd);
    unlinkSync(lock);
    // A failed write may leave an auditable pending file, never a free request.
  }
}
