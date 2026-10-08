import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobJournal } from './journal.mjs';

test('restart recovers encrypted results, marks unfinished jobs interrupted and never copies plaintext output to disk', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'studpilot-runner-journal-')), path = join(directory, 'jobs.sqlite');
  const key = Buffer.alloc(32, 5).toString('base64');
  const response = { status: 200, payload: { text: 'private generated project source' } };
  try {
    let journal = new JobJournal(path, key);
    journal.begin('actor:run:req', 'hash'); await journal.finish('actor:run:req', 'hash', response);
    journal.begin('actor:run:unfinished', 'second-hash'); journal.close();
    assert.equal(readFileSync(path).includes(Buffer.from(response.payload.text)), false);
    journal = new JobJournal(path, key);
    assert.deepEqual(await journal.result('actor:run:req', 'hash'), response);
    assert.equal(await journal.result('other:run:req', 'hash'), null);
    assert.equal(await journal.result('actor:run:req', 'wrong-hash'), null);
    assert.equal(journal.get('actor:run:unfinished').status, 'interrupted'); journal.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('catalog versions survive restart without changing active-run records', () => {
  const directory = mkdtempSync(join(tmpdir(), 'studpilot-runner-catalog-')), path = join(directory, 'jobs.sqlite');
  const key = Buffer.alloc(32, 7).toString('base64');
  try {
    let journal = new JobJournal(path, key);
    journal.saveCatalog({ version: 'v1', models: [{ id: 'one' }] });
    journal.saveCatalog({ version: 'v2', models: [{ id: 'two' }] }); journal.close();
    journal = new JobJournal(path, key);
    assert.equal(journal.catalog('v1').models[0].id, 'one'); assert.equal(journal.catalog('v2').models[0].id, 'two'); journal.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('missing wrapping key fails closed and receipts expire rather than retaining project output', () => {
  assert.throws(() => new JobJournal(':memory:', undefined), /independent/);
  let now = 1000000; const journal = new JobJournal(':memory:', Buffer.alloc(32, 6).toString('base64'), () => now);
  journal.begin('one', 'hash'); now += 300001; assert.equal(journal.get('one'), null); journal.close();
});
