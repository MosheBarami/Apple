/**
 * scripts/eval/lib/dev-set.mjs: the 60 frozen requests, read by id and never written.
 *
 * Two of these are guards on the FILE as well as the code: the 60 request lines are pinned by sha256 (a request edited
 * after its score was seen breaks this test, which is the point: planning/STUDPILOT-TEST-SET-DEV.md says "do not edit a
 * request after you've seen its score; make dev-v2 instead"), and the module must have no way to write.
 *
 * Run with:  node --test tests/eval-dev-set.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, DEV_SET_PATH, getRequest, loadDevSet, parseDevSet } from '../scripts/eval/lib/dev-set.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FROZEN_REQUESTS_SHA256 = '48b45c4ba8b7d55166c714186bfef63ef239819a4d96261671fd053607cfce2b';

test('the real dev set parses to the frozen 60: 15 per category, ids U01-U15, S01-S15, P01-P15, Z01-Z15', () => {
  const { requests } = loadDevSet();
  assert.equal(requests.length, 60);
  for (const [letter, category] of Object.entries(CATEGORIES)) {
    const own = requests.filter((r) => r.category === category);
    assert.equal(own.length, 15, category);
    assert.deepEqual(own.map((r) => r.id), Array.from({ length: 15 }, (_, i) => `${letter}${String(i + 1).padStart(2, '0')}`));
  }
});

test('THE 60 REQUEST LINES ARE FROZEN: editing one after its score was seen breaks this test', () => {
  const { requests } = loadDevSet();
  const digest = createHash('sha256').update(requests.map((r) => `${r.id}: ${r.text}`).join('\n') + '\n').digest('hex');
  assert.equal(digest, FROZEN_REQUESTS_SHA256, 'a request in planning/STUDPILOT-TEST-SET-DEV.md changed; the set is frozen (make dev-v2 instead)');
});

test('request text is exactly as written: typos, casing, punctuation and the trailing parenthesis survive', () => {
  assert.equal(getRequest('U01').text, 'a shop screen for a pet simulator with 6 eggs, prices in gems, and a big featured egg at the top');
  assert.equal(getRequest('S14').text, 'speed boost gamepass that doubles walkspeed for owners (placeholder pass id)');
  assert.equal(getRequest('Z06').text, 'a lava zone behind a gate that costs 1,000 coins');
  assert.equal(getRequest('U14').text, 'make me a gamepass store with 4 passes and robux prices, x2 coins as the featured one');
});

test('ids are found case-insensitively, and an unknown id says which exist', () => {
  assert.equal(getRequest('p07').id, 'P07');
  assert.throws(() => getRequest('Q99'), /unknown request id "Q99".*U01/s);
  assert.throws(() => getRequest(''), /unknown request id/);
});

test('the sha256 reported is that of the file read', () => {
  const r = getRequest('U01');
  assert.equal(r.devSetSha256, createHash('sha256').update(readFileSync(DEV_SET_PATH)).digest('hex'));
});

test('a set that is not the frozen 60 is refused, each way it can differ', () => {
  const full = loadDevSet().requests.map((r) => `- ${r.id}: ${r.text}`);
  assert.doesNotThrow(() => parseDevSet(full.join('\n')));
  assert.throws(() => parseDevSet(full.slice(1).join('\n')), /expected 15 ui requests, found 14/);
  assert.throws(() => parseDevSet([...full, '- U01: again'].join('\n')), /appears twice/);
  const renumbered = full.map((l) => l.replace('- U15:', '- U16:'));
  assert.throws(() => parseDevSet(renumbered.join('\n')), /U15 is missing/);
});

test('the module has no way to write: no write or delete function is imported', () => {
  const src = readFileSync(join(HERE, '..', 'scripts', 'eval', 'lib', 'dev-set.mjs'), 'utf8');
  assert.equal(/writeFile|appendFile|unlink|rmSync|renameSync|createWriteStream/.test(src), false);
});
